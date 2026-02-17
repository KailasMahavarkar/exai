/**
 * CLI Config File Support
 *
 * One config file to control the entire pipeline:
 * - AI/LLM settings (model, filterModel, apiKey, temperature)
 * - Output settings (format, output, direction, spacing)
 * - Context gathering (context paths, exclude, allowTestFiles, maxFileSize, maxDepth, maxTreeItems)
 * - Compression (compress, compressMode, compressOptions)
 * - Cache (cache, cacheTtlDays, cacheMaxEntries)
 * - Misc (verbose)
 *
 * All fields optional. Priority: CLI flags > config file > env vars > hardcoded defaults.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

// ── Nested option types ─────────────────────────────────────────────────────

export interface ConfigCompressOptions {
    removeComments?: boolean;
    minifyWhitespace?: boolean;
    extractSignaturesOnly?: boolean;
    maxFileLines?: number;
    preserveImports?: boolean;
    preserveExports?: boolean;
    preserveTypes?: boolean;
    preserveFunctionSignatures?: boolean;
}

// ── Main config interface ───────────────────────────────────────────────────

export interface CliConfig {
    // AI / LLM
    model?: string;
    filterModel?: string;
    apiKey?: string;
    temperature?: number;

    // Output
    format?: string;
    output?: string;
    direction?: string;
    spacing?: number;

    // Context gathering
    context?: string[];
    exclude?: string[];
    allowTestFiles?: boolean;
    maxFileSize?: number;
    maxDepth?: number;
    maxTreeItems?: number;

    // Compression
    compress?: boolean;
    compressMode?: string;
    compressOptions?: ConfigCompressOptions;

    // Cache
    cache?: boolean;
    cacheTtlDays?: number;
    cacheMaxEntries?: number;

    // Misc
    verbose?: boolean;
}

// ── Validation helpers ──────────────────────────────────────────────────────

const KNOWN_KEYS = new Set<string>([
    // AI / LLM
    'model', 'filterModel', 'apiKey', 'temperature',
    // Output
    'format', 'output', 'direction', 'spacing',
    // Context
    'context', 'exclude', 'allowTestFiles', 'maxFileSize', 'maxDepth', 'maxTreeItems',
    // Compression
    'compress', 'compressMode', 'compressOptions',
    // Cache
    'cache', 'cacheTtlDays', 'cacheMaxEntries',
    // Misc
    'verbose',
]);

const COMPRESS_OPTION_KEYS = new Set<string>([
    'removeComments', 'minifyWhitespace', 'extractSignaturesOnly', 'maxFileLines',
    'preserveImports', 'preserveExports', 'preserveTypes', 'preserveFunctionSignatures',
]);

function assertString(obj: Record<string, unknown>, key: string): string {
    if (typeof obj[key] !== 'string') throw new Error(`Config "${key}" must be a string`);
    return obj[key] as string;
}

function assertNumber(obj: Record<string, unknown>, key: string): number {
    if (typeof obj[key] !== 'number') throw new Error(`Config "${key}" must be a number`);
    return obj[key] as number;
}

function assertBoolean(obj: Record<string, unknown>, key: string): boolean {
    if (typeof obj[key] !== 'boolean') throw new Error(`Config "${key}" must be a boolean`);
    return obj[key] as boolean;
}

function assertStringArray(obj: Record<string, unknown>, key: string): string[] {
    const val = obj[key];
    if (!Array.isArray(val) || !val.every(v => typeof v === 'string')) {
        throw new Error(`Config "${key}" must be an array of strings`);
    }
    return val as string[];
}

function parseCompressOptions(obj: unknown): ConfigCompressOptions {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        throw new Error('Config "compressOptions" must be an object');
    }

    const raw = obj as Record<string, unknown>;
    const unknowns = Object.keys(raw).filter(k => !COMPRESS_OPTION_KEYS.has(k));
    if (unknowns.length > 0) {
        console.warn(`Warning: Unknown compressOptions keys ignored: ${unknowns.join(', ')}`);
    }

    const result: ConfigCompressOptions = {};

    if (raw.removeComments !== undefined) result.removeComments = assertBoolean(raw, 'removeComments');
    if (raw.minifyWhitespace !== undefined) result.minifyWhitespace = assertBoolean(raw, 'minifyWhitespace');
    if (raw.extractSignaturesOnly !== undefined) result.extractSignaturesOnly = assertBoolean(raw, 'extractSignaturesOnly');
    if (raw.maxFileLines !== undefined) result.maxFileLines = assertNumber(raw, 'maxFileLines');
    if (raw.preserveImports !== undefined) result.preserveImports = assertBoolean(raw, 'preserveImports');
    if (raw.preserveExports !== undefined) result.preserveExports = assertBoolean(raw, 'preserveExports');
    if (raw.preserveTypes !== undefined) result.preserveTypes = assertBoolean(raw, 'preserveTypes');
    if (raw.preserveFunctionSignatures !== undefined) result.preserveFunctionSignatures = assertBoolean(raw, 'preserveFunctionSignatures');

    return result;
}

// ── Main loader ─────────────────────────────────────────────────────────────

/**
 * Load and validate a CLI config file.
 *
 * - Resolves configPath relative to CWD
 * - Resolves `context` paths relative to the config file's directory
 * - Throws on missing file or invalid JSON
 */
export function loadConfig(configPath: string): CliConfig {
    const absolutePath = resolve(configPath);

    if (!existsSync(absolutePath)) {
        throw new Error(`Config file not found: ${absolutePath}`);
    }

    let raw: string;
    try {
        raw = readFileSync(absolutePath, 'utf-8');
    } catch {
        throw new Error(`Failed to read config file: ${absolutePath}`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(`Invalid JSON in config file: ${absolutePath}`);
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`Config file must contain a JSON object: ${absolutePath}`);
    }

    const obj = parsed as Record<string, unknown>;

    // Warn about unknown keys
    const unknownKeys = Object.keys(obj).filter(k => !KNOWN_KEYS.has(k));
    if (unknownKeys.length > 0) {
        console.warn(`Warning: Unknown config keys ignored: ${unknownKeys.join(', ')}`);
    }

    const config: CliConfig = {};
    const configDir = dirname(absolutePath);

    // AI / LLM
    if (obj.model !== undefined) config.model = assertString(obj, 'model');
    if (obj.filterModel !== undefined) config.filterModel = assertString(obj, 'filterModel');
    if (obj.apiKey !== undefined) config.apiKey = assertString(obj, 'apiKey');
    if (obj.temperature !== undefined) config.temperature = assertNumber(obj, 'temperature');

    // Output
    if (obj.format !== undefined) config.format = assertString(obj, 'format');
    if (obj.output !== undefined) config.output = assertString(obj, 'output');
    if (obj.direction !== undefined) config.direction = assertString(obj, 'direction');
    if (obj.spacing !== undefined) config.spacing = assertNumber(obj, 'spacing');

    // Context gathering
    if (obj.context !== undefined) {
        const paths = assertStringArray(obj, 'context');
        config.context = paths.map((p: string) => resolve(configDir, p));
    }
    if (obj.exclude !== undefined) config.exclude = assertStringArray(obj, 'exclude');
    if (obj.allowTestFiles !== undefined) config.allowTestFiles = assertBoolean(obj, 'allowTestFiles');
    if (obj.maxFileSize !== undefined) config.maxFileSize = assertNumber(obj, 'maxFileSize');
    if (obj.maxDepth !== undefined) config.maxDepth = assertNumber(obj, 'maxDepth');
    if (obj.maxTreeItems !== undefined) config.maxTreeItems = assertNumber(obj, 'maxTreeItems');

    // Compression
    if (obj.compress !== undefined) config.compress = assertBoolean(obj, 'compress');
    if (obj.compressMode !== undefined) config.compressMode = assertString(obj, 'compressMode');
    if (obj.compressOptions !== undefined) config.compressOptions = parseCompressOptions(obj.compressOptions);

    // Cache
    if (obj.cache !== undefined) config.cache = assertBoolean(obj, 'cache');
    if (obj.cacheTtlDays !== undefined) config.cacheTtlDays = assertNumber(obj, 'cacheTtlDays');
    if (obj.cacheMaxEntries !== undefined) config.cacheMaxEntries = assertNumber(obj, 'cacheMaxEntries');

    // Misc
    if (obj.verbose !== undefined) config.verbose = assertBoolean(obj, 'verbose');

    return config;
}

// ── Default template ────────────────────────────────────────────────────────

/**
 * Default config template for `init` command.
 * Shows every available option with sensible defaults.
 */
export const CONFIG_TEMPLATE: CliConfig = {
    // AI / LLM
    model: 'moonshotai/kimi-k2.5',
    filterModel: 'moonshotai/kimi-k2.5',
    temperature: 0,

    // Output
    format: 'dsl',
    output: 'flowchart.excalidraw',
    direction: 'TB',
    spacing: 50,

    // Context gathering
    context: ['.'],
    exclude: ['dist', 'coverage', '*.lock'],
    allowTestFiles: false,
    maxFileSize: 65536,
    maxDepth: 6,
    maxTreeItems: 1000,

    // Compression
    compress: true,
    compressMode: 'balanced',
    compressOptions: {
        removeComments: true,
        minifyWhitespace: true,
        extractSignaturesOnly: false,
        maxFileLines: 1000,
        preserveImports: true,
        preserveExports: true,
        preserveTypes: true,
        preserveFunctionSignatures: true,
    },

    // Cache
    cache: true,
    cacheTtlDays: 7,
    cacheMaxEntries: 100,

    // Misc
    verbose: false,
};
