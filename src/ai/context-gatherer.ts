/**
 * Context Gatherer - Thin CLI adapter over the context module.
 *
 * Responsibilities:
 * - Wraps the context module with OpenRouter-based AI filtering (folder-filter.ts)
 * - Caches full pipeline results keyed on paths + options
 * - Forwards all options to the context module
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { validatePaths, gatherContext as gatherContextModule } from '../context/index.js';
import type { GatherResult as ModuleGatherResult, CompressOptions, AiFilterFn } from '../context/index.js';
import { filterFolders } from './folder-filter.js';

const CACHE_DIR = `${tmpdir()}/excal-cache`;

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
  /** Cache TTL in days (default: 7) */
  cacheTtlDays?: number;
  /** Max cache entries (default: 100) */
  cacheMaxEntries?: number;
}

export interface ContextResult extends ModuleGatherResult {
  fromCache: boolean;
  cacheKey: string;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function generateCacheKey(paths: string[], options: ContextOptions): string {
  const keyParts = [
    [...paths].sort().join('|'),
    options.compress ?? true,
    options.allowTestFiles ?? false,
    options.maxFileSize ?? 0,
    options.maxDepth ?? 0,
    options.maxTreeItems ?? 0,
    (options.excludePatterns ?? []).sort().join(','),
    JSON.stringify(options.compressOptions ?? {}),
  ];
  return createHash('sha256').update(keyParts.join(':::')).digest('hex') + '_ctx.cache';
}

function getCached(cacheKey: string, verbose: boolean): ModuleGatherResult | null {
  try {
    const cachePath = `${CACHE_DIR}/${cacheKey}`;
    if (existsSync(cachePath)) {
      if (verbose) console.log(`  Context cache hit: ${cacheKey}`);
      return JSON.parse(readFileSync(cachePath, 'utf-8'));
    }
  } catch (error) {
    if (verbose) console.log(`  Context cache read error: ${error}`);
  }
  return null;
}

function writeCache(cacheKey: string, result: ModuleGatherResult, verbose: boolean): void {
  try {
    if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(`${CACHE_DIR}/${cacheKey}`, JSON.stringify(result), 'utf-8');
    if (verbose) console.log(`  Context cached: ${CACHE_DIR}/${cacheKey}`);
  } catch (error) {
    if (verbose) console.log(`  Context cache write error: ${error}`);
  }
}

// ── AI filter factory ─────────────────────────────────────────────────────────

function createAiFilter(
  apiKey?: string,
  verbose: boolean = false,
  useCache: boolean = true,
  filterModel?: string,
): AiFilterFn {
  return async (tree: string): Promise<string[]> => {
    const result = await filterFolders(tree, apiKey, filterModel, verbose, useCache);
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
): Promise<ContextResult> {
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
  } = options;

  if (verbose) {
    console.log(`  Received ${paths.length} context path(s) to analyze:`);
    paths.forEach(p => console.log(`    - ${p}`));
  }

  // Validate paths (delegates to context module)
  const validatedPaths = validatePaths(paths);

  // Check cache (key includes all options that affect output)
  const cacheKey = generateCacheKey(validatedPaths, options);
  if (useCache) {
    const cached = getCached(cacheKey, verbose);
    if (cached) {
      if (verbose) console.log(`  Using cached context (${(cached.markdown.length / 1024).toFixed(1)}KB)`);
      return { ...cached, fromCache: true, cacheKey };
    }
  }

  // Run full pipeline via context module
  const result = await gatherContextModule(validatedPaths, {
    excludePatterns,
    aiFilter: createAiFilter(apiKey, verbose, useCache, filterModel),
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
    writeCache(cacheKey, result, verbose);
  }

  return { ...result, fromCache: false, cacheKey };
}
