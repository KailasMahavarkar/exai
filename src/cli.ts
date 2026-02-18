#!/usr/bin/env node

/**
 * Excalidraw CLI
 *
 * Create Excalidraw flowcharts from DSL, JSON, or DOT input.
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { parseDSL } from './parser/dsl-parser.js';
import { parseJSONString } from './parser/json-parser.js';
import { parseDOT } from './parser/dot-parser.js';
import { layoutGraph } from './layout/elk-layout.js';
import { generateExcalidraw, serializeExcalidraw } from './generator/excalidraw-generator.js';
import { generateFlowchartInput, type OutputFormat } from './ai/openrouter.js';
import { gatherContext } from './ai/context-gatherer.js';
import { clearCache, getCacheStats } from './ai/query-cache.js';
import { loadConfig, CONFIG_TEMPLATE, type CliConfig } from './ai/config.js';
import type { FlowchartGraph, FlowDirection } from './types/dsl.js';

export interface CompressionOptions {
    removeComments?: boolean;
    minifyWhitespace?: boolean;
    extractSignaturesOnly?: boolean;
    maxFileLines?: number;
    preserveImports?: boolean;
    preserveExports?: boolean;
    preserveTypes?: boolean;
    preserveFunctionSignatures?: boolean;
}

export interface CompressionResult {
    compressed: string;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    filesProcessed: number;
}


const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();
const EXAI_API_KEY_ENV = 'EXAI_OPENROUTER_APIKEY';
const LEGACY_OPENROUTER_API_KEY_ENV = 'OPENROUTER_API_KEY';

/**
 * Get compression options based on mode
 */
function getCompressionOptions(mode: string): CompressionOptions {
    switch (mode) {
        case 'aggressive':
            return {
                removeComments: true,
                minifyWhitespace: true,
                extractSignaturesOnly: true,
                maxFileLines: 50,
                preserveImports: true,
                preserveExports: true,
                preserveTypes: true,
                preserveFunctionSignatures: true,
            };
        case 'minimal':
            return {
                removeComments: false,
                minifyWhitespace: true,
                extractSignaturesOnly: false,
                maxFileLines: 200,
                preserveImports: true,
                preserveExports: true,
                preserveTypes: true,
                preserveFunctionSignatures: true,
            };
        case 'balanced':
        default:
            return {
                removeComments: true,
                minifyWhitespace: true,
                extractSignaturesOnly: false,
                maxFileLines: 100,
                preserveImports: true,
                preserveExports: true,
                preserveTypes: true,
                preserveFunctionSignatures: true,
            };
    }
}

function unquoteEnvValue(value: string): string {
    const trimmed = value.trim();
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1).trim();
    }
    return trimmed;
}

function readApiKeysFromDotEnv(envPath: string = resolve('.env')): { exai?: string; legacy?: string } {
    if (!existsSync(envPath)) return {};

    try {
        const content = readFileSync(envPath, 'utf-8');
        let exai: string | undefined;
        let legacy: string | undefined;

        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
            const eq = normalized.indexOf('=');
            if (eq <= 0) continue;

            const key = normalized.slice(0, eq).trim();
            const value = unquoteEnvValue(normalized.slice(eq + 1));
            if (!value) continue;

            if (key === EXAI_API_KEY_ENV) exai = value;
            if (key === LEGACY_OPENROUTER_API_KEY_ENV) legacy = value;
        }

        return { exai, legacy };
    } catch {
        return {};
    }
}

function resolveApiKey(optionsApiKey: string | undefined, configApiKey: string | undefined, command: Command): {
    apiKey?: string;
    source?: '--api-key' | 'EXAI_OPENROUTER_APIKEY' | 'OPENROUTER_API_KEY' | 'config';
} {
    // 1) Explicit CLI flag
    const fromCli = command.getOptionValueSource('apiKey') === 'cli' ? optionsApiKey?.trim() : undefined;
    if (fromCli) return { apiKey: fromCli, source: '--api-key' };

    const envFileKeys = readApiKeysFromDotEnv();

    // 2) Environment / .env (preferred)
    const fromExaiEnv = process.env[EXAI_API_KEY_ENV]?.trim() || envFileKeys.exai?.trim();
    if (fromExaiEnv) return { apiKey: fromExaiEnv, source: EXAI_API_KEY_ENV };

    // Optional backward compatibility
    const fromLegacyEnv =
        process.env[LEGACY_OPENROUTER_API_KEY_ENV]?.trim() || envFileKeys.legacy?.trim();
    if (fromLegacyEnv) return { apiKey: fromLegacyEnv, source: LEGACY_OPENROUTER_API_KEY_ENV };

    // 3) Config file fallback
    const fromConfig = configApiKey?.trim();
    if (fromConfig) return { apiKey: fromConfig, source: 'config' };

    return {};
}

program
    .name('exai')
    .description('Create Excalidraw flowcharts from DSL, JSON, or DOT')
    .version(pkg.version);

/**
 * Create command - main flowchart creation
 */
program
    .command('create')
    .description('Create an Excalidraw flowchart')
    .argument('[input]', 'Input file path (DSL, JSON, or DOT)')
    .option('-o, --output <file>', 'Output file path', 'flowchart.excalidraw')
    .option('-f, --format <type>', 'Input format: dsl, json, dot (default: dsl)', 'dsl')
    .option('--inline <dsl>', 'Inline DSL/DOT string')
    .option('--stdin', 'Read input from stdin')
    .option('-d, --direction <dir>', 'Flow direction: TB, BT, LR, RL (default: TB)')
    .option('-s, --spacing <n>', 'Node spacing in pixels', '50')
    .option('--verbose', 'Verbose output')
    .action(async (inputFile, options, command) => {
        try {
            let input: string;
            let format = options.format;
            const formatExplicitlySet = command.getOptionValueSource('format') === 'cli';

            // Get input from various sources
            if (options.inline) {
                input = options.inline;
            } else if (options.stdin) {
                input = readFileSync(0, 'utf-8'); // Read from stdin
            } else if (inputFile) {
                input = readFileSync(inputFile, 'utf-8');

                // Auto-detect format from file extension (only if --format not explicitly set)
                if (!formatExplicitlySet) {
                    if (inputFile.endsWith('.json')) {
                        format = 'json';
                    } else if (inputFile.endsWith('.dot') || inputFile.endsWith('.gv')) {
                        format = 'dot';
                    }
                }
            } else {
                console.error('Error: No input provided. Use --inline, --stdin, or provide an input file.');
                process.exit(1);
            }

            if (options.verbose) {
                console.log(`Input format: ${format}`);
                console.log(`Input length: ${input.length} characters`);
            }

            // Parse input
            let graph: FlowchartGraph;
            if (format === 'json') {
                graph = parseJSONString(input);
            } else if (format === 'dot') {
                graph = parseDOT(input);
            } else {
                graph = parseDSL(input);
            }

            // Apply CLI options
            if (options.direction) {
                const dir = options.direction.toUpperCase() as FlowDirection;
                if (['TB', 'BT', 'LR', 'RL'].includes(dir)) {
                    graph.options.direction = dir;
                }
            }
            if (options.spacing) {
                const spacing = parseInt(options.spacing, 10);
                if (!isNaN(spacing)) {
                    graph.options.nodeSpacing = spacing;
                }
            }

            if (options.verbose) {
                console.log(`Parsed ${graph.nodes.length} nodes and ${graph.edges.length} edges`);
                console.log(`Layout direction: ${graph.options.direction}`);
            }

            // Layout the graph
            const layoutedGraph = await layoutGraph(graph);

            if (options.verbose) {
                console.log(`Layout complete. Canvas size: ${layoutedGraph.width}x${layoutedGraph.height}`);
            }

            // Generate Excalidraw file
            const excalidrawFile = generateExcalidraw(layoutedGraph);
            const output = serializeExcalidraw(excalidrawFile);

            // Write output
            if (options.output === '-') {
                process.stdout.write(output);
            } else {
                const absolutePath = resolve(options.output);
                writeFileSync(absolutePath, output, 'utf-8');
                console.log(`✅ Created: ${absolutePath}`);
                console.log(`📦 Size: ${(output.length / 1024).toFixed(1)}KB`);
            }
        } catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });

/**
 * Parse command - parse and validate input without generating
 */
program
    .command('parse')
    .description('Parse and validate input without generating output')
    .argument('[input]', 'Input file path')
    .option('-f, --format <type>', 'Input format: dsl, json, dot (default: dsl)', 'dsl')
    .option('--inline <dsl>', 'Inline DSL/DOT string')
    .option('--stdin', 'Read input from stdin')
    .action((inputFile, options, command) => {
        try {
            let input: string;
            let format = options.format;
            const formatExplicitlySet = command.getOptionValueSource('format') === 'cli';

            if (options.inline) {
                input = options.inline;
            } else if (options.stdin) {
                input = readFileSync(0, 'utf-8');
            } else if (inputFile) {
                input = readFileSync(inputFile, 'utf-8');
                if (!formatExplicitlySet) {
                    if (inputFile.endsWith('.json')) format = 'json';
                    else if (inputFile.endsWith('.dot') || inputFile.endsWith('.gv')) format = 'dot';
                }
            } else {
                console.error('Error: No input provided. Use --inline, --stdin, or provide an input file.');
                process.exit(1);
            }

            // Parse input
            let graph: FlowchartGraph;
            if (format === 'json') {
                graph = parseJSONString(input);
            } else if (format === 'dot') {
                graph = parseDOT(input);
            } else {
                graph = parseDSL(input);
            }

            console.log('Parse successful!');
            console.log(`  Nodes: ${graph.nodes.length}`);
            console.log(`  Edges: ${graph.edges.length}`);
            if (graph.groups?.length) console.log(`  Groups: ${graph.groups.length}`);
            console.log(`  Direction: ${graph.options.direction}`);
            console.log('\nNodes:');
            for (const node of graph.nodes) {
                console.log(`  - [${node.type}] ${node.label}`);
            }
            console.log('\nEdges:');
            for (const edge of graph.edges) {
                const sourceNode = graph.nodes.find((n) => n.id === edge.source);
                const targetNode = graph.nodes.find((n) => n.id === edge.target);
                const label = edge.label ? ` "${edge.label}"` : '';
                console.log(`  - ${sourceNode?.label} ->${label} ${targetNode?.label}`);
            }
            if (graph.groups?.length) {
                console.log('\nGroups:');
                for (const group of graph.groups) {
                    const memberLabels = group.nodeIds
                        .map((id) => graph.nodes.find((n) => n.id === id)?.label ?? id)
                        .join(', ');
                    console.log(`  - [${group.id}] "${group.label}" (${memberLabels})`);
                }
            }
        } catch (error) {
            console.error('Parse error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });

/**
 * AI command - generate flowchart from natural language
 */
program
    .command('ai')
    .description('Generate an Excalidraw flowchart from natural language using AI')
    .argument('<prompt>', 'Natural language description of the flowchart')
    .option('-o, --output <file>', 'Output file path', 'flowchart.excalidraw')
    .option('-f, --format <type>', 'AI output format: dsl, json (default: dsl)', 'dsl')
    .option('-d, --direction <dir>', 'Flow direction: TB, BT, LR, RL')
    .option('-s, --spacing <n>', 'Node spacing in pixels')
    .option('-c, --context <path>', 'Include file or folder as context (can be used multiple times)', (value, previous: string[]) => previous.concat([value]), [] as string[])
    .option('--model <model>', 'OpenRouter model (default: moonshotai/kimi-k2.5)')
    .option('--api-key <key>', `OpenRouter API key (overrides ${EXAI_API_KEY_ENV} from env/.env)`)
    .option('--temperature <n>', 'Model temperature 0-2 (default: 0)', '0')
    .option('--exclude <pattern>', 'Exclude pattern for context gathering (can be used multiple times)', (value: string, previous: string[]) => previous.concat([value]), [] as string[])
    .option('--allow-test-files', 'Include test files in context (default: excluded)')
    .option('--no-compress', 'Disable context compression')
    .option('--compress-mode <mode>', 'Compression mode: balanced, aggressive, minimal (default: balanced)', 'balanced')
    .option('--no-cache', 'Disable LLM response caching')
    .option('--only-context', 'Only gather and display context, do not generate diagram')
    .option('--config-path <path>', 'Path to config JSON file')
    .option('--verbose', 'Verbose output')
    .action(async (prompt, options, command) => {
        try {
            const startTime = Date.now();

            // Load config file if provided and merge with CLI options
            // Priority: CLI flags > env/.env > config file > hardcoded defaults
            let config: CliConfig = {};
            if (options.configPath) {
                config = loadConfig(options.configPath);

                // Helper: use CLI value if explicitly set, otherwise config value
                const src = (name: string) => command.getOptionValueSource(name);

                // AI / LLM
                if (config.model !== undefined && src('model') !== 'cli') options.model = config.model;
                if (config.temperature !== undefined && src('temperature') !== 'cli') options.temperature = String(config.temperature);

                // Output
                if (config.format !== undefined && src('format') !== 'cli') options.format = config.format;
                if (config.output !== undefined && src('output') !== 'cli') options.output = config.output;
                if (config.direction !== undefined && src('direction') !== 'cli') options.direction = config.direction;
                if (config.spacing !== undefined && src('spacing') !== 'cli') options.spacing = String(config.spacing);

                // Context gathering
                if (config.context !== undefined && src('context') !== 'cli') options.context = config.context;
                if (config.exclude !== undefined && src('exclude') !== 'cli') options.exclude = config.exclude;
                if (config.allowTestFiles !== undefined && src('allowTestFiles') !== 'cli') options.allowTestFiles = config.allowTestFiles;

                // Compression
                if (config.compress !== undefined && src('compress') !== 'cli') options.compress = config.compress;
                if (config.compressMode !== undefined && src('compressMode') !== 'cli') options.compressMode = config.compressMode;

                // Cache
                if (config.cache !== undefined && src('cache') !== 'cli') options.cache = config.cache;

                // Misc
                if (config.verbose !== undefined && src('verbose') !== 'cli') options.verbose = config.verbose;

                if (options.verbose) {
                    console.log(`📄 Config loaded from: ${resolve(options.configPath)}`);
                }
            }

            const format = options.format as OutputFormat;

            // Validate format
            if (format !== 'dsl' && format !== 'json') {
                console.error(`Error: Invalid format "${format}". Must be "dsl" or "json".`);
                process.exit(1);
            }

            // Parse temperature
            const temperature = parseFloat(options.temperature);
            if (isNaN(temperature) || temperature < 0 || temperature > 2) {
                console.error('Error: Temperature must be a number between 0 and 2.');
                process.exit(1);
            }

            const { apiKey: resolvedApiKey, source: apiKeySource } = resolveApiKey(options.apiKey, config.apiKey, command);
            if (!resolvedApiKey) {
                console.error('⚠️  Missing API key.');
                console.error(`Set it via --api-key, ${EXAI_API_KEY_ENV} in .env/env, or config file "apiKey".`);
                process.exitCode = 1;
                return;
            }
            options.apiKey = resolvedApiKey;
            if (options.verbose) {
                console.log(`🔑 API key source: ${apiKeySource}`);
            }

            // Determine model to use
            const model = options.model || process.env.OPENROUTER_MODEL || 'moonshotai/kimi-k2.5';

            console.log('🚀 Excalidraw AI Generation Started');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`📝 Prompt: ${prompt}`);
            console.log(`🤖 Model: ${model}`);
            console.log(`📊 Format: ${format.toUpperCase()}`);
            if (options.context && options.context.length > 0) {
                console.log(`📁 Context: ${options.context.length} path(s)`);
            }
            if (options.exclude && options.exclude.length > 0) {
                console.log(`🚫 Excludes: ${options.exclude.join(', ')}`);
            }
            if (options.allowTestFiles) {
                console.log(`🧪 Test files: included`);
            }
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            // Gather context if provided
            let contextString: string | undefined;
            if (options.onlyContext && options.context.length === 0) {
                console.error('Error: --only-context requires at least one context path via -c or config "context".');
                process.exit(1);
            }
            if (options.context && options.context.length > 0) {
                try {
                    console.log('📂 [1/5] Gathering Context...');

                    if (options.verbose) {
                        console.log(`  CLI received context paths:`);
                        options.context.forEach((p: string) => console.log(`    - ${p}`));
                    }

                    const contextStart = Date.now();

                    // Determine compression options: config.compressOptions overrides mode presets
                    const compressionMode = options.compressMode || 'balanced';
                    const modeDefaults = getCompressionOptions(compressionMode);
                    const compressionOptions = config.compressOptions
                        ? { ...modeDefaults, ...config.compressOptions }
                        : modeDefaults;

                    const contextResult = await gatherContext(options.context, {
                        apiKey: options.apiKey,
                        filterModel: config.filterModel,
                        verbose: options.verbose,
                        compress: options.compress !== false,
                        compressOptions: compressionOptions,
                        useCache: options.cache !== false,
                        excludePatterns: options.exclude,
                        allowTestFiles: options.allowTestFiles ?? false,
                        maxFileSize: config.maxFileSize,
                        maxDepth: config.maxDepth,
                        maxTreeItems: config.maxTreeItems,
                        cacheTtlDays: config.cacheTtlDays,
                        cacheMaxEntries: config.cacheMaxEntries,
                    });
                    contextString = contextResult.markdown;

                    const contextTime = Date.now() - contextStart;
                    let contextMsg = `✓ Context gathered (${(contextString.length / 1024).toFixed(1)}KB in ${contextTime}ms)`;

                    if (contextResult.compression && options.compress !== false) {
                        contextMsg += ` - ${contextResult.compression.ratio.toFixed(1)}% compression`;
                    }

                    if (contextResult.fromCache) {
                        contextMsg += ` [FROM CACHE]`;
                    }

                    console.log(contextMsg);

                    if (options.verbose) {
                        const t = contextResult.timing;
                        let summary = `Context gathering: ${(contextString.length / 1024).toFixed(1)}KB `;
                        if (contextResult.compression) {
                            summary += `(${contextResult.compression.ratio.toFixed(1)}% compressed) `;
                        }
                        summary += `(tree: ${t.treeMs}ms, filter: ${t.filterMs}ms, read: ${t.readMs}ms`;
                        if (t.compressMs) {
                            summary += `, compress: ${t.compressMs}ms`;
                        }
                        summary += `)`;
                        console.log(`  ${summary}`);
                        console.log(`  Cache key: ${contextResult.cacheKey}`);
                    }
                    console.log();

                    // If --only-context flag is set, display context and exit
                    if (options.onlyContext) {
                        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                        console.log('📋 Context Output (use this for AI prompts):');
                        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                        console.log(contextString);
                        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                        console.log(`✅ Context gathering complete!`);
                        console.log(`📦 Size: ${(contextString.length / 1024).toFixed(1)}KB`);
                        if (contextResult.cacheKey) {
                            const cachePath = join(tmpdir(), 'exai-cache', contextResult.cacheKey);
                            console.log(`🔑 Cache key: ${contextResult.cacheKey}`);
                            console.log(`📁 Cache path: ${cachePath}`);
                        }
                        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                        process.exit(0);
                    }
                } catch (error) {
                    console.error('❌ Context gathering error:', error instanceof Error ? error.message : error);
                    process.exit(1);
                }
            }

            // Generate input using AI
            console.log('🤖 [2/5] Calling AI to generate flowchart...');
            const aiStart = Date.now();

            const input = await generateFlowchartInput(prompt, format, {
                model: options.model,
                apiKey: options.apiKey,
                temperature,
                context: contextString,
                verbose: options.verbose,
                useCache: options.cache !== false,
                cacheOptions: {
                    ttlDays: config.cacheTtlDays,
                    maxEntries: config.cacheMaxEntries,
                },
            });

            const aiTime = Date.now() - aiStart;
            console.log(`✓ AI generation complete (${input.length} chars in ${aiTime}ms)`);

            if (options.verbose) {
                console.log(`\n${format.toUpperCase()} Output:`);
                console.log('─────────────────────────────────────────');
                console.log(input);
                console.log('─────────────────────────────────────────');
            }
            console.log();

            // Parse AI-generated input
            console.log('📊 [3/5] Parsing flowchart structure...');
            const parseStart = Date.now();

            let graph: FlowchartGraph;
            if (format === 'json') {
                graph = parseJSONString(input);
            } else {
                graph = parseDSL(input);
            }

            // Apply CLI options (same as create command)
            if (options.direction) {
                const dir = options.direction.toUpperCase() as FlowDirection;
                if (['TB', 'BT', 'LR', 'RL'].includes(dir)) {
                    graph.options.direction = dir;
                }
            }
            if (options.spacing) {
                const spacing = parseInt(options.spacing, 10);
                if (!isNaN(spacing)) {
                    graph.options.nodeSpacing = spacing;
                }
            }

            const parseTime = Date.now() - parseStart;
            console.log(`✓ Parsed: ${graph.nodes.length} nodes, ${graph.edges.length} edges (${parseTime}ms)`);
            console.log(`  Direction: ${graph.options.direction}, Spacing: ${graph.options.nodeSpacing}px`);
            console.log();

            // Layout the graph
            console.log('📐 [4/5] Computing layout with ELK...');
            const layoutStart = Date.now();

            const layoutedGraph = await layoutGraph(graph, options.verbose);

            const layoutTime = Date.now() - layoutStart;
            console.log(`✓ Layout complete: ${layoutedGraph.width}x${layoutedGraph.height}px canvas (${layoutTime}ms)`);
            console.log();

            // Generate Excalidraw file
            console.log('🎨 [5/5] Generating Excalidraw file...');
            const genStart = Date.now();

            const excalidrawFile = generateExcalidraw(layoutedGraph);
            const output = serializeExcalidraw(excalidrawFile);

            const genTime = Date.now() - genStart;
            console.log(`✓ Generated Excalidraw file (${(output.length / 1024).toFixed(1)}KB in ${genTime}ms)`);
            console.log();

            // Write output
            if (options.output === '-') {
                process.stdout.write(output);
            } else {
                const absolutePath = resolve(options.output);
                writeFileSync(absolutePath, output, 'utf-8');
                const totalTime = Date.now() - startTime;
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`✅ Success! File created at:`);
                console.log(`📄 ${absolutePath}`);
                console.log(`📦 Size: ${(output.length / 1024).toFixed(1)}KB`);
                console.log(`⏱️  Total time: ${(totalTime / 1000).toFixed(2)}s`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            }
        } catch (error) {
            console.error('\n❌ Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });

/**
 * Cache command - manage LLM response cache
 */
program
    .command('cache')
    .description('Manage LLM response cache')
    .argument('<action>', 'Action: clear, stats')
    .action((action) => {
        try {
            if (action === 'clear') {
                const cleared = clearCache({ verbose: true });
                console.log(`✓ Cleared ${cleared} cache entries`);
            } else if (action === 'stats') {
                const stats = getCacheStats();
                console.log('Cache Statistics:');
                console.log(`  Total Entries: ${stats.totalEntries}`);
                console.log(`  Total Size: ${(stats.totalSize / 1024).toFixed(2)} KB`);
                if (stats.oldestEntry) {
                    const age = Math.floor((Date.now() - stats.oldestEntry) / 1000 / 60 / 60 / 24);
                    console.log(`  Oldest Entry: ${age} days ago`);
                }
                if (stats.newestEntry) {
                    const age = Math.floor((Date.now() - stats.newestEntry) / 1000 / 60);
                    console.log(`  Newest Entry: ${age} minutes ago`);
                }
            } else {
                console.error(`Error: Unknown action "${action}". Use "clear" or "stats".`);
                process.exit(1);
            }
        } catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });

/**
 * Init command - create a starter config file
 */
program
    .command('init')
    .description('Create a starter config file')
    .argument('[path]', 'Output path for config file', 'exai.config.json')
    .action((outputPath) => {
        try {
            const absolutePath = resolve(outputPath);
            if (existsSync(absolutePath)) {
                console.error(`Error: File already exists: ${absolutePath}`);
                console.error('Delete it first or choose a different path.');
                process.exit(1);
            }
            const content = JSON.stringify(CONFIG_TEMPLATE, null, 2) + '\n';
            writeFileSync(absolutePath, content, 'utf-8');
            console.log(`Created config file: ${absolutePath}`);
            console.log(`Use it with: exai ai "prompt" --config-path ${outputPath}`);
        } catch (error) {
            console.error('Error:', error instanceof Error ? error.message : error);
            process.exit(1);
        }
    });

// Parse arguments and run
program.parse();
