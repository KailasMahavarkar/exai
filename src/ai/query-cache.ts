/**
 * Query Cache - Local cache for LLM query results
 *
 * Prevents duplicate API calls by caching responses locally based on:
 * - Prompt content
 * - Context content
 * - Model used
 * - Temperature setting
 *
 * Cache entries expire after 7 days by default.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export interface CacheEntry {
  key: string;
  prompt: string;
  model: string;
  temperature: number;
  format: string;
  response: string;
  timestamp: number;
  contextHash?: string;
}

export interface CacheOptions {
  cacheDir?: string;
  ttlDays?: number;
  maxEntries?: number;
  verbose?: boolean;
}

const DEFAULT_OPTIONS: Required<CacheOptions> = {
  cacheDir: join(tmpdir(), 'excal-cache'),
  ttlDays: 7,
  maxEntries: 100,
  verbose: false,
};

/**
 * Generate cache key from query parameters
 */
function generateCacheKey(
  prompt: string,
  model: string,
  temperature: number,
  format: string,
  context?: string
): string {
  const hash = createHash('sha256');
  hash.update(prompt);
  hash.update(model);
  hash.update(String(temperature));
  hash.update(format);
  if (context) {
    hash.update(context);
  }
  return hash.digest('hex');
}

/**
 * Generate shorter hash for context (for logging)
 */
function generateContextHash(context: string): string {
  return createHash('sha256').update(context).digest('hex').slice(0, 8);
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(cacheDir: string): void {
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
}

/**
 * Get cache file path for a given key
 */
function getCacheFilePath(cacheDir: string, key: string): string {
  return join(cacheDir, `${key}.cache`);
}

/**
 * Check if a cache entry is expired
 */
function isExpired(timestamp: number, ttlDays: number): boolean {
  const now = Date.now();
  const age = now - timestamp;
  const maxAge = ttlDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
  return age > maxAge;
}

/**
 * Get cached response if it exists and is not expired
 */
export function getCachedResponse(
  prompt: string,
  model: string,
  temperature: number,
  format: string,
  context?: string,
  options: CacheOptions = {}
): string | null {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const key = generateCacheKey(prompt, model, temperature, format, context);

  ensureCacheDir(opts.cacheDir);

  const cacheFile = getCacheFilePath(opts.cacheDir, key);

  if (opts.verbose) {
    console.log(`  Cache directory: ${opts.cacheDir}`);
    console.log(`  Cache key: ${key.slice(0, 16)}...`);
    console.log(`  Cache file: ${cacheFile}`);
  }

  if (!existsSync(cacheFile)) {
    if (opts.verbose) {
      console.log('  Cache miss: No cached response found');
    }
    return null;
  }

  try {
    const content = readFileSync(cacheFile, 'utf-8');
    const entry: CacheEntry = JSON.parse(content);

    // Check if expired
    if (isExpired(entry.timestamp, opts.ttlDays)) {
      if (opts.verbose) {
        console.log('  Cache miss: Entry expired');
      }
      // Clean up expired entry
      try {
        unlinkSync(cacheFile);
      } catch {
        // Ignore cleanup errors
      }
      return null;
    }

    // Validate entry matches
    if (
      entry.prompt !== prompt ||
      entry.model !== model ||
      entry.temperature !== temperature ||
      entry.format !== format
    ) {
      if (opts.verbose) {
        console.log('  Cache miss: Parameters mismatch');
      }
      return null;
    }

    const age = Math.floor((Date.now() - entry.timestamp) / 1000 / 60); // minutes
    if (opts.verbose) {
      console.log(`  Cache hit: Response found (age: ${age}m)`);
    }

    return entry.response;
  } catch (error) {
    if (opts.verbose) {
      console.log(`  Cache error: ${error instanceof Error ? error.message : error}`);
    }
    return null;
  }
}

/**
 * Cache a response
 */
export function cacheResponse(
  prompt: string,
  model: string,
  temperature: number,
  format: string,
  response: string,
  context?: string,
  options: CacheOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const key = generateCacheKey(prompt, model, temperature, format, context);

  ensureCacheDir(opts.cacheDir);

  const entry: CacheEntry = {
    key,
    prompt,
    model,
    temperature,
    format,
    response,
    timestamp: Date.now(),
    contextHash: context ? generateContextHash(context) : undefined,
  };

  const cacheFile = getCacheFilePath(opts.cacheDir, key);

  try {
    writeFileSync(cacheFile, JSON.stringify(entry, null, 2), 'utf-8');

    if (opts.verbose) {
      console.log(`  Response cached successfully`);
      console.log(`  Cache file: ${cacheFile}`);
    }

    // Clean up old entries if we exceed maxEntries
    cleanupOldEntries(opts.cacheDir, opts.maxEntries, opts.verbose);
  } catch (error) {
    if (opts.verbose) {
      console.log(`  Cache write error: ${error instanceof Error ? error.message : error}`);
    }
    // Don't fail if caching fails
  }
}

/**
 * Clean up old cache entries to stay within maxEntries limit
 */
function cleanupOldEntries(cacheDir: string, maxEntries: number, verbose: boolean): void {
  try {
    const files = readdirSync(cacheDir)
      .filter(f => f.endsWith('.cache'))
      .map(f => ({
        path: join(cacheDir, f),
        mtime: statSync(join(cacheDir, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime); // Sort by modified time, newest first

    if (files.length <= maxEntries) {
      return;
    }

    // Remove oldest entries
    const toRemove = files.slice(maxEntries);
    for (const file of toRemove) {
      try {
        unlinkSync(file.path);
        if (verbose) {
          console.log(`  Cleaned up old cache entry: ${file.path}`);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    if (verbose) {
      console.log(`  Cache cleanup error: ${error instanceof Error ? error.message : error}`);
    }
  }
}

/**
 * Clear all cache entries
 */
export function clearCache(options: CacheOptions = {}): number {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!existsSync(opts.cacheDir)) {
    return 0;
  }

  try {
    const files = readdirSync(opts.cacheDir).filter(f => f.endsWith('.cache'));
    let cleared = 0;

    for (const file of files) {
      try {
        unlinkSync(join(opts.cacheDir, file));
        cleared++;
      } catch {
        // Ignore errors
      }
    }

    return cleared;
  } catch (error) {
    if (opts.verbose) {
      console.log(`  Cache clear error: ${error instanceof Error ? error.message : error}`);
    }
    return 0;
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(options: CacheOptions = {}): {
  totalEntries: number;
  totalSize: number;
  oldestEntry: number | null;
  newestEntry: number | null;
} {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (!existsSync(opts.cacheDir)) {
    return {
      totalEntries: 0,
      totalSize: 0,
      oldestEntry: null,
      newestEntry: null,
    };
  }

  try {
    const files = readdirSync(opts.cacheDir)
      .filter(f => f.endsWith('.cache'))
      .map(f => join(opts.cacheDir, f));

    let totalSize = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;

    for (const file of files) {
      try {
        const stats = statSync(file);
        totalSize += stats.size;

        const mtime = stats.mtime.getTime();
        if (oldestEntry === null || mtime < oldestEntry) {
          oldestEntry = mtime;
        }
        if (newestEntry === null || mtime > newestEntry) {
          newestEntry = mtime;
        }
      } catch {
        // Ignore errors
      }
    }

    return {
      totalEntries: files.length,
      totalSize,
      oldestEntry,
      newestEntry,
    };
  } catch (error) {
    return {
      totalEntries: 0,
      totalSize: 0,
      oldestEntry: null,
      newestEntry: null,
    };
  }
}
