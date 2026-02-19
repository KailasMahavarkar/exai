/**
 * Context Gatherer - Thin CLI adapter over the context module.
 *
 * Responsibilities:
 * - Wraps the context module with OpenRouter-based AI filtering (folder-filter.ts)
 * - Caches full pipeline results keyed on paths + options (via unified ExaiCache)
 * - Forwards all options to the context module
 */

import { validatePaths, gatherContext as gatherContextModule } from '../context/index.js';
import type { GatherResult as ModuleGatherResult, CompressOptions, AiFilterFn } from '../context/index.js';
import { filterFolders } from './folder-filter.js';
import { cache, makeKey } from './cache.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ContextOptions {
    apiKey?: string;
    /** Model for AI folder filtering (separate from generation model) */
    filterModel?: string;
    verbose?: boolean;
    compress?: boolean;
    compressOptions?: CompressOptions;
    useCache?: boolean;
    excludePatterns?: string[];
    allowTestFiles?: boolean;
    maxFileSize?: number;
    /** Max tree depth (default: 6) */
    maxDepth?: number;
    /** Max tree items before truncation (default: 1000) */
    maxTreeItems?: number;
    /** LLM request timeout in ms (default: 120000) */
    timeoutMs?: number;
    /** If true, only return from cache — never re-gather. Returns null on miss. */
    cacheOnly?: boolean;
}

export interface ContextResult extends ModuleGatherResult {
    fromCache: boolean;
    cacheKey: string;
}

// ── Cache key ─────────────────────────────────────────────────────────────────

function generateCacheKey(paths: string[], options: ContextOptions): string {
    return makeKey(
        [...paths].sort().join('|'),
        options.compress ?? true,
        options.allowTestFiles ?? false,
        options.maxFileSize ?? 0,
        options.maxDepth ?? 0,
        options.maxTreeItems ?? 0,
        (options.excludePatterns ?? []).sort().join(','),
        JSON.stringify(options.compressOptions ?? {}),
    );
}

// ── AI filter factory ─────────────────────────────────────────────────────────

function createAiFilter(
    apiKey?: string,
    verbose: boolean = false,
    useCache: boolean = true,
    filterModel?: string,
    timeoutMs?: number,
): AiFilterFn {
    return async (tree: string): Promise<string[]> => {
        const result = await filterFolders(tree, apiKey, filterModel, verbose, useCache, timeoutMs);
        return result.excludePatterns;
    };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Gather context using the full pipeline:
 *   validate → pre-filter → tree → AI filter → read → compress → markdown
 */
export async function gatherContext(
    paths: string[],
    options: ContextOptions = {}
): Promise<ContextResult | null> {
    const {
        apiKey,
        filterModel,
        verbose = false,
        compress = true,
        compressOptions,
        useCache = true,
        excludePatterns = [],
        allowTestFiles = false,
        maxFileSize,
        maxDepth,
        maxTreeItems,
        timeoutMs,
        cacheOnly = false,
    } = options;

    if (verbose) {
        console.log(`  Received ${paths.length} context path(s) to analyze:`);
        paths.forEach(p => console.log(`    - ${p}`));
    }

    // Validate paths (delegates to context module)
    const validatedPaths = validatePaths(paths);

    // Check cache (key includes all options that affect output)
    const cacheKey = generateCacheKey(validatedPaths, options);
    if (useCache || cacheOnly) {
        const cached = cache.get<ModuleGatherResult>('context', cacheKey);
        if (cached) {
            if (verbose) console.log(`  Using cached context (${(cached.markdown.length / 1024).toFixed(1)}KB)`);
            return { ...cached, fromCache: true, cacheKey };
        }
    }

    // cacheOnly: do not re-gather, signal miss to caller
    if (cacheOnly) {
        return null;
    }

    // Run full pipeline via context module
    const result = await gatherContextModule(validatedPaths, {
        excludePatterns,
        aiFilter: createAiFilter(apiKey, verbose, useCache, filterModel, timeoutMs),
        compress,
        compressOptions,
        allowTestFiles,
        maxFileSize,
        verbose,
        treeOptions: {
            maxDepth,
            maxItems: maxTreeItems,
        },
    });

    // Cache the full result
    if (useCache) {
        cache.set('context', cacheKey, result);
    }

    return { ...result, fromCache: false, cacheKey };
}
