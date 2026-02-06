/**
 * OpenRouter API Client
 *
 * callLLM()               → generic reusable LLM call (base)
 * generateFlowchartInput() → flowchart-specific wrapper (uses callLLM)
 */

import { getCachedResponse, cacheResponse, type CacheOptions } from './query-cache.js';
import { OPENROUTER_API_URL, DEFAULT_MODEL, DEFAULT_TEMPERATURE } from "./contants.js"

// ── System Prompts ──────────────────────────────────────────────────────────

const DSL_SYSTEM_PROMPT = `You are an expert at creating flowchart diagrams using excal DSL syntax.

Convert the user's natural language description into valid DSL format.

IMPORTANT: If the user provides codebase context, you MUST analyze ONLY that specific codebase and create a diagram based on what you see in the provided code. Do NOT use your general knowledge about other projects.

DSL Syntax:
- [Label] = Rectangle (process steps, actions)
- {Label} = Diamond (decisions, conditionals)
- (Label) = Ellipse (start/end points)
- [[Label]] = Database
- -> = Arrow connection
- --> = Dashed arrow
- -> "text" -> = Labeled arrow

Directives:
- @direction TB|BT|LR|RL (flow direction)
- @spacing N (node spacing in pixels)

Example:
(Start) -> [Process Data] -> {Valid?}
{Valid?} -> "yes" -> [Save to DB] -> (End)
{Valid?} -> "no" -> [Show Error] -> (End)

CRITICAL RULES:
- Output ONLY the DSL syntax
- Do NOT wrap output in markdown code blocks
- Do NOT include backticks
- Do NOT add explanations or comments
- Output must be raw DSL that can be parsed directly`;

const JSON_SYSTEM_PROMPT = `You are an expert at creating flowchart diagrams using excal JSON format.

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
    cacheOptions?: CacheOptions;
    /** Cache format key - used to separate cache namespaces (default: 'text') */
    cacheFormat?: string;
    /** Context string hashed into cache key for more precise cache hits */
    cacheContext?: string;
}

export interface GenerateOptions {
    model?: string;
    apiKey?: string;
    temperature?: number;
    context?: string;
    verbose?: boolean;
    useCache?: boolean;
    cacheOptions?: CacheOptions;
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
    const apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error(
            'OpenRouter API key is required.\n' +
            'Provide it via options or set OPENROUTER_API_KEY environment variable.\n' +
            'Get your API key from https://openrouter.ai/keys'
        );
    }

    const model = options.model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
    const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
    const system = systemPrompt || 'You are a helpful assistant.';
    const useCache = options.useCache !== false;
    const cacheFormat = options.cacheFormat || 'text';

    // Check cache
    if (useCache) {
        const cached = getCachedResponse(
            userPrompt, model, temperature, cacheFormat,
            options.cacheContext,
            { ...options.cacheOptions, verbose: options.verbose }
        );
        if (cached) {
            if (options.verbose) console.log(`  Cache hit (${cacheFormat})`);
            return cached;
        }
    }

    if (options.verbose) {
        console.log(`  Calling ${model}...`);
        console.log(`  Temperature: ${temperature}`);
        console.log(`  Prompt size: ${(userPrompt.length / 1024).toFixed(1)}KB`);
    }

    const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://github.com/KailasMahavarkar/excal',
            'X-Title': 'excal',
        },
        body: JSON.stringify({
            model,
            temperature,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: userPrompt },
            ],
        }),
    });

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
        cacheResponse(
            userPrompt, model, temperature, cacheFormat,
            output, options.cacheContext,
            { ...options.cacheOptions, verbose: options.verbose }
        );
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
    const systemPrompt = format === 'dsl' ? DSL_SYSTEM_PROMPT : JSON_SYSTEM_PROMPT;

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

    const raw = await callLLM(userMessage, systemPrompt, {
        model: options.model,
        apiKey: options.apiKey,
        temperature: options.temperature,
        verbose: options.verbose,
        useCache: options.useCache,
        cacheOptions: options.cacheOptions,
        cacheFormat: format,
        cacheContext: options.context,
    });

    if (options.verbose) console.log(`  Cleaning and validating output...`);

    return cleanOutput(raw, format);
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
        if (!cleaned.includes('->') && !cleaned.includes('[') && !cleaned.includes('(')) {
            throw new Error(
                'AI output does not appear to be valid DSL. Expected nodes and connections.\n\n' +
                'This is a bug in the AI model output. Please try again or use a different model.'
            );
        }
    }

    return cleaned;
}
