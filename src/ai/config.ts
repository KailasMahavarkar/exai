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
import { resolve, dirname, isAbsolute } from 'path';

// ── Nested option types ─────────────────────────────────────────────────────

export interface ExcalidrawStyleConfig {
    strokeWidth?: 1 | 2 | 4;
    fillStyle?: 'hachure' | 'cross-hatch' | 'solid' | 'dots' | 'dashed' | 'zigzag' | 'none';
    strokeStyle?: 'solid' | 'dashed' | 'dotted';
    roughness?: 0 | 1 | 2;
    edges?: 'round' | 'sharp';
    arrowhead?: 'arrow' | 'bar' | 'dot' | 'triangle' | 'none';
    fontFamily?: 'hand' | 'normal' | 'code' | 'excalifont';
    fontSize?: number;
    textAlign?: 'left' | 'center' | 'right';
}

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
    cache?: boolean;          // LLM response cache
    contextCache?: boolean;   // context-gather cache (independent of LLM cache)
    cacheTtlDays?: number;
    cacheMaxEntries?: number;

    // Misc
    verbose?: boolean;
    /** LLM request timeout in seconds (default: 120) */
    timeoutSecs?: number;

    // Excalidraw visual style
    excalidraw?: ExcalidrawStyleConfig;
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
    'cache', 'contextCache', 'cacheTtlDays', 'cacheMaxEntries',
    // Misc
    'verbose', 'timeoutSecs',
    // Excalidraw visual style
    'excalidraw',
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

const EXCALIDRAW_STYLE_KEYS = new Set<string>([
    'strokeWidth', 'fillStyle', 'strokeStyle', 'roughness',
    'edges', 'arrowhead', 'fontFamily', 'fontSize', 'textAlign',
]);

function parseExcalidrawStyleConfig(obj: unknown): ExcalidrawStyleConfig {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
        throw new Error('Config "excalidraw" must be an object');
    }

    const raw = obj as Record<string, unknown>;
    const unknowns = Object.keys(raw).filter(k => !EXCALIDRAW_STYLE_KEYS.has(k));
    if (unknowns.length > 0) {
        console.warn(`Warning: Unknown excalidraw style keys ignored: ${unknowns.join(', ')}`);
    }

    const result: ExcalidrawStyleConfig = {};

    if (raw.strokeWidth !== undefined) {
        const v = assertNumber(raw, 'strokeWidth');
        if (v === 1 || v === 2 || v === 4) result.strokeWidth = v;
        else console.warn(`Warning: excalidraw.strokeWidth must be 1, 2, or 4. Got: ${v}`);
    }
    if (raw.fillStyle !== undefined) {
        const v = assertString(raw, 'fillStyle');
        const valid = ['hachure', 'cross-hatch', 'solid', 'dots', 'dashed', 'zigzag', 'none'];
        if (valid.includes(v)) result.fillStyle = v as ExcalidrawStyleConfig['fillStyle'];
        else console.warn(`Warning: excalidraw.fillStyle "${v}" is not valid. Options: ${valid.join(', ')}`);
    }
    if (raw.strokeStyle !== undefined) {
        const v = assertString(raw, 'strokeStyle');
        if (v === 'solid' || v === 'dashed' || v === 'dotted') result.strokeStyle = v;
        else console.warn(`Warning: excalidraw.strokeStyle "${v}" is not valid`);
    }
    if (raw.roughness !== undefined) {
        const v = assertNumber(raw, 'roughness');
        if (v === 0 || v === 1 || v === 2) result.roughness = v;
        else console.warn(`Warning: excalidraw.roughness must be 0, 1, or 2. Got: ${v}`);
    }
    if (raw.edges !== undefined) {
        const v = assertString(raw, 'edges');
        if (v === 'round' || v === 'sharp') result.edges = v;
        else console.warn(`Warning: excalidraw.edges "${v}" is not valid. Use 'round' or 'sharp'`);
    }
    if (raw.arrowhead !== undefined) {
        const v = assertString(raw, 'arrowhead');
        const valid = ['arrow', 'bar', 'dot', 'triangle', 'none'];
        if (valid.includes(v)) result.arrowhead = v as ExcalidrawStyleConfig['arrowhead'];
        else console.warn(`Warning: excalidraw.arrowhead "${v}" is not valid. Options: ${valid.join(', ')}`);
    }
    if (raw.fontFamily !== undefined) {
        const v = assertString(raw, 'fontFamily');
        const valid = ['hand', 'normal', 'code', 'excalifont'];
        if (valid.includes(v)) result.fontFamily = v as ExcalidrawStyleConfig['fontFamily'];
        else console.warn(`Warning: excalidraw.fontFamily "${v}" is not valid. Options: ${valid.join(', ')}`);
    }
    if (raw.fontSize !== undefined) result.fontSize = assertNumber(raw, 'fontSize');
    if (raw.textAlign !== undefined) {
        const v = assertString(raw, 'textAlign');
        if (v === 'left' || v === 'center' || v === 'right') result.textAlign = v;
        else console.warn(`Warning: excalidraw.textAlign "${v}" is not valid`);
    }

    return result;
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
 * - Absolute context paths are used as-is; relative paths resolve from the config file's directory
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
        config.context = paths.map((p: string) => isAbsolute(p) ? p : resolve(configDir, p));
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
    if (obj.contextCache !== undefined) config.contextCache = assertBoolean(obj, 'contextCache');
    if (obj.cacheTtlDays !== undefined) config.cacheTtlDays = assertNumber(obj, 'cacheTtlDays');
    if (obj.cacheMaxEntries !== undefined) config.cacheMaxEntries = assertNumber(obj, 'cacheMaxEntries');

    // Misc
    if (obj.verbose !== undefined) config.verbose = assertBoolean(obj, 'verbose');
    if (obj.timeoutSecs !== undefined) config.timeoutSecs = assertNumber(obj, 'timeoutSecs');

    // Excalidraw visual style
    if (obj.excalidraw !== undefined) config.excalidraw = parseExcalidrawStyleConfig(obj.excalidraw);

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
    apiKey: "<Set EXAI_OPENROUTER_APIKEY in .env or paste locally. Warning!! Do not commit this file with apiKey>",
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
        maxFileLines: 100,
        preserveImports: true,
        preserveExports: true,
        preserveTypes: true,
        preserveFunctionSignatures: true,
    },

    // Cache
    cache: true,
    contextCache: true,
    cacheTtlDays: 7,
    cacheMaxEntries: 100,

    // Misc
    verbose: false,
    timeoutSecs: 120,

    // Excalidraw visual style (global defaults applied to every element)
    excalidraw: {
        strokeWidth: 2,
        fillStyle: 'hachure',
        strokeStyle: 'solid',
        roughness: 1,
        edges: 'round',
        arrowhead: 'arrow',
        fontFamily: 'hand',
        fontSize: 20,
        textAlign: 'center',
    },
};
