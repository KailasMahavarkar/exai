/**
 * OpenRouter API Client
 *
 * callLLM()               → generic reusable LLM call (base)
 * generateFlowchartInput() → flowchart-specific wrapper (uses callLLM)
 */

import { getCachedResponse, cacheResponse } from './query-cache.js';
import { OPENROUTER_API_URL, DEFAULT_MODEL, DEFAULT_TEMPERATURE } from "./contants.js"

// ── System Prompts ──────────────────────────────────────────────────────────

const DSL_PLAN_SYSTEM_PROMPT = `You are an expert diagram planner for Excalidraw.

Convert the user's request into a STRICT JSON graph plan. Do NOT output DSL directly.
You handle ANY kind of diagram: software architecture, folder structures, process flows, org charts, data pipelines, workflows, etc.

IMPORTANT CONTEXT RULE:
- If codebase/folder context is provided, analyze ONLY that content.
- Do NOT use outside assumptions or hallucinated components.

Return ONLY valid JSON with this exact schema:
{
  "nodes": [
    { "id": "string", "type": "string", "label": "string", "color": "optional hex" }
  ],
  "edges": [
    { "from": "node_id", "to": "node_id", "label": "optional", "dashed": false }
  ],
  "options": {
    "direction": "TB|BT|LR|RL",
    "spacing": 50
  }
}

NODE TYPES — choose the best shape for each node:
- "rectangle"   — default box, general purpose
- "ellipse"     — actors, start/end points, users, external entities
- "diamond"     — decisions, conditionals, branch points
- "database"    — data stores, databases, storage, files
- Semantic aliases (auto-colored): "user", "frontend", "api", "service", "worker",
  "queue", "cache", "db", "storage", "external", "orchestrator"
  Use these when the diagram is software/infrastructure — they get automatic colors.

COLOR RULES — you decide the color based on the diagram's nature:
- Group nodes of the same role/tier with the same color.
- Use a small palette: 2-4 colors max per diagram.
- Lighter background + darker stroke of the same hue looks best.
- For "color" field use hex like "#a5d8ff" (background). The stroke is auto-derived darker.
- Omit "color" for nodes that should stay default (white/no fill).
- COLOR BY ROLE — pick a consistent scheme:
  * Entry/actor nodes (users, clients, browsers) → light blue  e.g. "#e7f5ff"
  * Processing nodes (services, handlers, routes) → light purple e.g. "#f3f0ff"
  * Data nodes (databases, files, storage) → light green e.g. "#d3f9d8"
  * Async/queue nodes (queues, events, jobs) → light yellow e.g. "#fff9db"
  * External/boundary nodes → light red/pink e.g. "#ffe3e3"
  * Decision nodes → light orange e.g. "#fff4e6"
  * For folder/file structures: group by folder depth or file type
  * For process flows: group by phase (input/process/output → 3 colors)
  * For org charts: group by team or hierarchy level

DIAGRAM MODELING RULES:
- Use edge labels for meaningful relationships: "calls", "reads", "writes", "contains", "depends on", "triggers", "returns", "inherits".
- Choose direction: TB (top-down flows), LR (pipelines, sequences), BT/RL rarely.
- Keep labels concise (≤ 40 chars).
- Avoid decorative or redundant nodes.

GRAPH QUALITY RULES:
- Output JSON object only (no markdown, no explanation).
- Node IDs must be unique and slug-like (e.g. "auth-service", "users-db", "src-folder").
- Every edge must reference valid node IDs.
- Avoid duplicate edges with same from/to/label.
- Prefer connected graphs; avoid isolated nodes unless explicitly requested.
- Prefer 6-20 nodes unless the subject is tiny or the user requests high detail.

ANTI-CLUTTER RULES:
- NEVER connect more than 4-5 edges to a single node. Add an intermediate grouping node if needed.
- Merge parallel edges between the same two nodes into one edge with a combined label.
- For things with many sub-items (e.g. API with many routes, folder with many files): represent as ONE parent node, not individual nodes for each item.`;

const JSON_SYSTEM_PROMPT = `You are an expert at creating architecture/flowchart diagrams using exai JSON format.

Convert the user's natural language description into valid JSON format.

IMPORTANT: If the user provides codebase context, you MUST analyze ONLY that specific codebase and create a diagram based on what you see in the provided code. Do NOT use your general knowledge about other projects.

JSON Structure:
{
  "nodes": [
    { "id": "unique_id", "type": "rectangle|diamond|ellipse|database", "label": "Node Label" }
  ],
  "edges": [
    { "from": "source_id", "to": "target_id", "label": "optional label" }
  ],
  "options": {
    "direction": "TB|BT|LR|RL",
    "nodeSpacing": 50
  }
}

Node Types:
- rectangle: Process steps, actions
- diamond: Decisions, conditionals
- ellipse: Start/end points
- database: Data storage

MODELING RULES:
- Prefer architecture-relevant components and explicit data/control-flow edges.
- Prefer rectangle/ellipse/database for architecture diagrams.
- Use diamond only when explicit decision branching is required.
- Avoid unsupported assumptions when context is provided.

CRITICAL RULES:
- Output ONLY valid JSON
- Do NOT wrap output in markdown code blocks
- Do NOT include backticks or \`\`\`json
- Do NOT add explanations
- Output must be raw JSON that can be parsed directly
- Use unique, descriptive IDs for nodes`;

// ── Types ───────────────────────────────────────────────────────────────────

export type OutputFormat = 'dsl' | 'json';

export interface CallLLMOptions {
    model?: string;
    apiKey?: string;
    temperature?: number;
    verbose?: boolean;
    useCache?: boolean;
    /** Cache format key - used to separate cache namespaces (default: 'text') */
    cacheFormat?: string;
    /** Context string hashed into cache key for more precise cache hits */
    cacheContext?: string;
    /** Request timeout in milliseconds (default: 120000 = 2 min) */
    timeoutMs?: number;
    /** If true, only return from cache — never call the API. Throws on miss. */
    cacheOnly?: boolean;
}

export interface GenerateOptions {
    model?: string;
    apiKey?: string;
    temperature?: number;
    context?: string;
    verbose?: boolean;
    useCache?: boolean;
    timeoutMs?: number;
    /** If true, only return from cache — never call the API. Throws on miss. */
    cacheOnly?: boolean;
}

interface DslPlanNode {
    id?: string;
    type?: string;
    label?: string;
    color?: string;
}

interface DslPlanEdge {
    from?: string;
    to?: string;
    label?: string;
    dashed?: boolean;
}

interface DslPlan {
    nodes?: DslPlanNode[];
    edges?: DslPlanEdge[];
    options?: {
        direction?: string;
        spacing?: number;
        nodeSpacing?: number;
    };
}

interface NormalizedDslNode {
    id: string;
    type: string; // semantic kind or shape type
    label: string;
    color?: string; // optional background hex from LLM
}

interface NormalizedDslEdge {
    from: string;
    to: string;
    label?: string;
    dashed: boolean;
}

interface NormalizedDslPlan {
    nodes: NormalizedDslNode[];
    edges: NormalizedDslEdge[];
    direction?: 'TB' | 'BT' | 'LR' | 'RL';
    spacing?: number;
}

// ── callLLM (base) ─────────────────────────────────────────────────────────

/**
 * Generic LLM call via OpenRouter.
 * All other functions (generateFlowchartInput, filterFolders) use this.
 *
 * Returns the raw response string - no cleaning or validation.
 */
export async function callLLM(
    userPrompt: string,
    systemPrompt?: string,
    options: CallLLMOptions = {}
): Promise<string> {
    const apiKey =
        options.apiKey ||
        process.env.EXAI_OPENROUTER_APIKEY ||
        process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error(
            'OpenRouter API key is required.\n' +
            'Provide it via options or set EXAI_OPENROUTER_APIKEY / OPENROUTER_API_KEY environment variable.\n' +
            'Get your API key from https://openrouter.ai/keys'
        );
    }

    const model = options.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
    const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
    const system = systemPrompt || 'You are a helpful assistant.';
    const useCache = options.useCache !== false;
    const cacheFormat = options.cacheFormat || 'text';
    const cacheOnly = options.cacheOnly === true;

    // Check cache
    if (useCache || cacheOnly) {
        const cached = getCachedResponse(userPrompt, model, temperature, cacheFormat, options.cacheContext);
        if (cached) {
            if (options.verbose) console.log(`  Cache hit (${cacheFormat})`);
            return cached;
        }
    }

    // cacheOnly: do not call API, signal miss to caller
    if (cacheOnly) {
        throw new Error(`CACHE_MISS:${cacheFormat}`);
    }

    const timeoutMs = options.timeoutMs ?? 120_000;

    if (options.verbose) {
        console.log(`  Calling ${model}...`);
        console.log(`  Temperature: ${temperature}`);
        console.log(`  Prompt size: ${(userPrompt.length / 1024).toFixed(1)}KB`);
        console.log(`  Timeout: ${timeoutMs / 1000}s`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
        response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://github.com/KailasMahavarkar/exai',
                'X-Title': 'exai',
            },
            body: JSON.stringify({
                model,
                temperature,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: userPrompt },
                ],
            }),
            signal: controller.signal,
        });
    } catch (err) {
        if ((err as Error).name === 'AbortError') {
            throw new Error(`LLM request timed out after ${timeoutMs / 1000}s (model: ${model}). Try a faster model or increase the timeout.`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${error}`);
    }

    if (options.verbose) console.log(`  Response received`);

    const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
    };
    const output = data.choices?.[0]?.message?.content;

    if (!output) {
        throw new Error('OpenRouter API returned empty response');
    }

    // Cache response
    if (useCache) {
        cacheResponse(userPrompt, model, temperature, cacheFormat, output, options.cacheContext);
    }

    return output;
}

// ── generateFlowchartInput (uses callLLM) ───────────────────────────────────

/**
 * Generate flowchart input using OpenRouter API.
 * Wraps callLLM with format-specific system prompts and output cleaning.
 */
export async function generateFlowchartInput(
    prompt: string,
    format: OutputFormat,
    options: GenerateOptions = {}
): Promise<string> {
    // Build user message with optional context
    let userMessage = prompt;
    if (options.context) {
        if (options.verbose) {
            console.log(`  Adding context (${(options.context.length / 1024).toFixed(1)}KB)`);
        }
        userMessage = `YOUR TASK: ${prompt}

CRITICAL INSTRUCTIONS:
1. Below is the COMPLETE codebase you need to analyze
2. Read through ALL the code files carefully
3. Create a diagram based ONLY on what you see in THIS codebase
4. DO NOT use your general knowledge about any other projects
5. DO NOT make assumptions - only use information from the code below

====== BEGIN CODEBASE ======

${options.context}

====== END CODEBASE ======

Now, analyze the codebase above and ${prompt}

Remember: Base your diagram ONLY on the code provided between the BEGIN/END markers above.`;
    }

    if (format === 'dsl') {
        const rawPlan = await callLLM(userMessage, DSL_PLAN_SYSTEM_PROMPT, {
            model: options.model,
            apiKey: options.apiKey,
            temperature: options.temperature,
            verbose: options.verbose,
            useCache: options.useCache,
            cacheFormat: 'dsl-plan',
            cacheContext: options.context,
            timeoutMs: options.timeoutMs,
            cacheOnly: options.cacheOnly,
        });

        if (options.verbose) console.log(`  Rebuilding DSL from normalized plan...`);
        try {
            const plan = parseDslPlan(rawPlan);
            const normalized = normalizeDslPlan(plan);
            return buildDslFromPlan(normalized);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to build DSL from AI plan: ${message}`);
        }
    }

    const raw = await callLLM(userMessage, JSON_SYSTEM_PROMPT, {
        model: options.model,
        apiKey: options.apiKey,
        temperature: options.temperature,
        verbose: options.verbose,
        useCache: options.useCache,
        cacheFormat: format,
        cacheContext: options.context,
        timeoutMs: options.timeoutMs,
        cacheOnly: options.cacheOnly,
    });

    if (options.verbose) console.log(`  Cleaning and validating output...`);

    return cleanOutput(raw, format);
}

function parseDslPlan(raw: string): DslPlan {
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/```(?:json)?\n?/gi, '');
    cleaned = cleaned.replace(/```\n?/g, '').trim();

    const firstObj = cleaned.indexOf('{');
    const lastObj = cleaned.lastIndexOf('}');
    if (firstObj !== -1 && lastObj > firstObj) {
        cleaned = cleaned.slice(firstObj, lastObj + 1);
    }

    const parsed = JSON.parse(cleaned) as DslPlan;

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Plan output is not a JSON object');
    }

    return parsed;
}

function normalizeDirection(value: string | undefined): 'TB' | 'BT' | 'LR' | 'RL' | undefined {
    if (!value) return undefined;
    const dir = value.toUpperCase();
    return dir === 'TB' || dir === 'BT' || dir === 'LR' || dir === 'RL' ? dir : undefined;
}

// Semantic kinds the DSL parser understands — pass them through as-is for automatic color styling.
const SEMANTIC_KINDS = new Set([
    'frontend', 'backend', 'api', 'service', 'worker',
    'db', 'database', 'storage', 'queue', 'mq', 'broker', 'cache',
    'external', 'user', 'orchestrator', 'hub', 'router',
    'diamond', 'decision', 'condition',
    'ellipse', 'oval', 'start', 'end',
    'rectangle', 'process', 'cylinder',
]);

function normalizeNodeType(value: string | undefined): string {
    if (!value) return 'rectangle';
    const type = value.toLowerCase();
    // Pass through any known semantic kind; unknown values fall back to rectangle
    return SEMANTIC_KINDS.has(type) ? type : 'rectangle';
}

function sanitizeNodeLabel(label: string | undefined, fallback: string): string {
    const value = (label || '').trim();
    const cleaned = value
        .replace(/[\[\]\{\}\(\)]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || fallback;
}

function sanitizeEdgeLabel(label: string | undefined): string | undefined {
    if (!label) return undefined;
    const cleaned = label.replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 ? cleaned.slice(0, 120) : undefined;
}

function normalizeDslPlan(plan: DslPlan): NormalizedDslPlan {
    const nodes: NormalizedDslNode[] = [];
    const nodeById = new Map<string, NormalizedDslNode>();

    const rawNodes = Array.isArray(plan.nodes) ? plan.nodes : [];
    let autoNodeId = 1;
    for (const rawNode of rawNodes) {
        if (!rawNode || typeof rawNode !== 'object') continue;

        const fallbackLabel = `Step ${autoNodeId}`;
        const id = String(rawNode.id || `n${autoNodeId}`).trim();
        const nodeId = id || `n${autoNodeId}`;
        autoNodeId++;

        if (nodeById.has(nodeId)) continue;

        const node: NormalizedDslNode = {
            id: nodeId,
            type: normalizeNodeType(rawNode.type),
            label: sanitizeNodeLabel(rawNode.label, fallbackLabel),
            color: typeof rawNode.color === 'string' && rawNode.color.startsWith('#') ? rawNode.color : undefined,
        };
        nodes.push(node);
        nodeById.set(node.id, node);
    }

    if (nodes.length === 0) {
        nodes.push(
            { id: 'start', type: 'ellipse', label: 'Start' },
            { id: 'end', type: 'ellipse', label: 'End' },
        );
        nodeById.set('start', nodes[0]);
        nodeById.set('end', nodes[1]);
    }

    const edges: NormalizedDslEdge[] = [];
    const rawEdges = Array.isArray(plan.edges) ? plan.edges : [];
    for (const rawEdge of rawEdges) {
        if (!rawEdge || typeof rawEdge !== 'object') continue;
        const from = String(rawEdge.from || '').trim();
        const to = String(rawEdge.to || '').trim();
        if (!from || !to) continue;
        if (!nodeById.has(from) || !nodeById.has(to)) continue;

        edges.push({
            from,
            to,
            label: sanitizeEdgeLabel(rawEdge.label),
            dashed: rawEdge.dashed === true,
        });
    }

    // If model returned nodes without edges, create a simple chain to ensure valid flow.
    if (edges.length === 0 && nodes.length > 1) {
        for (let i = 0; i < nodes.length - 1; i++) {
            edges.push({
                from: nodes[i].id,
                to: nodes[i + 1].id,
                dashed: false,
            });
        }
    }

    const direction = normalizeDirection(plan.options?.direction);
    const spacingInput = plan.options?.spacing ?? plan.options?.nodeSpacing;
    const spacing = typeof spacingInput === 'number' && Number.isFinite(spacingInput) && spacingInput > 0
        ? Math.round(spacingInput)
        : undefined;

    return { nodes, edges, direction, spacing };
}

function normalizeDslRefId(raw: string, fallbackIndex: number): string {
    const base = raw
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return base || `n${fallbackIndex}`;
}

function quoteDsl(value: string): string {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildDslFromPlan(plan: NormalizedDslPlan): string {
    const lines: string[] = [];

    if (plan.direction) lines.push(`@direction ${plan.direction}`);
    if (plan.spacing) lines.push(`@spacing ${plan.spacing}`);
    if (lines.length > 0) lines.push('');

    const nodeRefByOriginalId = new Map<string, string>();
    const usedRefs = new Set<string>();

    for (let i = 0; i < plan.nodes.length; i++) {
        const node = plan.nodes[i];
        let ref = normalizeDslRefId(node.id, i + 1);
        if (usedRefs.has(ref)) {
            let suffix = 2;
            while (usedRefs.has(`${ref}-${suffix}`)) suffix++;
            ref = `${ref}-${suffix}`;
        }
        usedRefs.add(ref);
        nodeRefByOriginalId.set(node.id, ref);

        const colorToken = node.color ? ` bg:${node.color}` : '';
        lines.push(`@node ${ref} ${node.type} ${quoteDsl(node.label)}${colorToken}`);
    }

    if (plan.nodes.length > 0 && plan.edges.length > 0) {
        lines.push('');
    }

    for (const edge of plan.edges) {
        const fromRef = nodeRefByOriginalId.get(edge.from);
        const toRef = nodeRefByOriginalId.get(edge.to);
        if (!fromRef || !toRef) continue;

        let edgeLine = `@edge ${fromRef} ${toRef}`;
        if (edge.label) {
            edgeLine += ` ${quoteDsl(edge.label)}`;
        }
        if (edge.dashed) {
            edgeLine += ' dashed';
        }
        lines.push(edgeLine);
    }

    const output = lines.join('\n').trim();
    if (!output) {
        return `@node start ellipse "Start"
@node end ellipse "End"

@edge start end`;
    }
    return output;
}

// ── Output cleaning ─────────────────────────────────────────────────────────

/**
 * Clean AI output - remove markdown wrappers and explanations
 */
function cleanOutput(output: string, format: OutputFormat): string {
    let cleaned = output.trim();

    // Remove markdown code blocks
    cleaned = cleaned.replace(/```(?:dsl|json)?\n?/g, '');
    cleaned = cleaned.replace(/```\n?/g, '');

    // Remove common explanation prefixes
    const lines = cleaned.split('\n');
    let startIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length === 0) continue;

        if (/^(Here is|Here's|This is|The following|I've created|I created)/i.test(line)) {
            startIndex = i + 1;
            continue;
        }
        break;
    }

    cleaned = lines.slice(startIndex).join('\n').trim();

    // Format-specific validation
    if (format === 'json') {
        if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
            throw new Error(
                'AI output does not appear to be valid JSON. Expected output to start with { or [.\n\n' +
                'This is a bug in the AI model output. Please try again or use a different model.'
            );
        }
    } else if (format === 'dsl') {
        if (!cleaned.includes('@node') && !cleaned.includes('@edge')) {
            throw new Error(
                'AI output does not appear to be valid DSL. Expected nodes and connections.\n\n' +
                'This is a bug in the AI model output. Please try again or use a different model.'
            );
        }
    }

    return cleaned;
}
