/**
 * Query Cache - compatibility wrapper around the unified ExaiCache.
 *
 * Public API is unchanged so existing call-sites continue to compile.
 * Configuration (TTL, maxEntries, verbose) is now managed on the shared
 * `cache` singleton in cache.ts — the options parameters below are accepted
 * for backward compatibility but are no longer used.
 */

import { cache, makeKey } from './cache.js';

// ── Types (kept for backward compat) ─────────────────────────────────────────

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

// ── Delegating functions ──────────────────────────────────────────────────────

export function getCachedResponse(
    prompt: string,
    model: string,
    temperature: number,
    format: string,
    context?: string,
    _options: CacheOptions = {},
): string | null {
    const key = makeKey(prompt, model, temperature, format, context ?? '');
    return cache.get<string>('llm', key);
}

export function cacheResponse(
    prompt: string,
    model: string,
    temperature: number,
    format: string,
    response: string,
    context?: string,
    _options: CacheOptions = {},
): void {
    const key = makeKey(prompt, model, temperature, format, context ?? '');
    cache.set('llm', key, response);
}

export function clearCache(_options: CacheOptions = {}): number {
    return cache.clear();
}

export function getCacheStats(_options: CacheOptions = {}): {
    totalEntries: number;
    totalSize: number;
    oldestEntry: number | null;
    newestEntry: number | null;
} {
    return cache.stats();
}
