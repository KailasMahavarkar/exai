/**
 * Unified ExaiCache
 *
 * All caches share one directory with namespaced files: {ns}__{key}.json
 * Namespaces used: 'llm', 'context', 'filter'
 *
 * Configure the module-level singleton once at startup via cache.configure().
 * All callers (LLM cache, context cache) share TTL, maxEntries, and verbose settings.
 */

import { createHash } from 'crypto';
import {
    existsSync, mkdirSync, readFileSync, writeFileSync,
    readdirSync, statSync, unlinkSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ── Internal types ────────────────────────────────────────────────────────────

interface StoredEntry<T> {
    value: T;
    timestamp: number;
}

export interface CacheConfig {
    cacheDir?: string;
    ttlDays?: number;
    maxEntries?: number;
    verbose?: boolean;
}

// ── Key helper ────────────────────────────────────────────────────────────────

/**
 * Build a deterministic cache key from an arbitrary list of values.
 * Strings are hashed directly; everything else is JSON-serialised first.
 */
export function makeKey(...parts: unknown[]): string {
    const hash = createHash('sha256');
    for (const part of parts) {
        hash.update(typeof part === 'string' ? part : JSON.stringify(part));
    }
    return hash.digest('hex');
}

// ── ExaiCache class ───────────────────────────────────────────────────────────

export class ExaiCache {
    private dir: string;
    private ttlMs: number;
    private max: number;
    private verbose: boolean;

    constructor() {
        this.dir = join(tmpdir(), 'exai-cache');
        this.ttlMs = 7 * 24 * 60 * 60 * 1000; // 7 days
        this.max = 100;
        this.verbose = false;
    }

    /** Apply configuration. Call once at startup (e.g. after loading config file). */
    configure(config: CacheConfig): void {
        if (config.cacheDir !== undefined) this.dir = config.cacheDir;
        if (config.ttlDays !== undefined) this.ttlMs = config.ttlDays * 24 * 60 * 60 * 1000;
        if (config.maxEntries !== undefined) this.max = config.maxEntries;
        if (config.verbose !== undefined) this.verbose = config.verbose;
    }

    private ensureDir(): void {
        if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    }

    private filePath(ns: string, key: string): string {
        return join(this.dir, `${ns}__${key}.json`);
    }

    /**
     * Read a cached value. Returns null on miss or expiry.
     * @param ns   Namespace (e.g. 'llm', 'context', 'filter')
     * @param key  Cache key produced by makeKey()
     */
    get<T>(ns: string, key: string): T | null {
        this.ensureDir();
        const path = this.filePath(ns, key);
        if (!existsSync(path)) {
            if (this.verbose) console.log(`  Cache miss [${ns}]: ${key.slice(0, 12)}...`);
            return null;
        }
        try {
            const entry = JSON.parse(readFileSync(path, 'utf-8')) as StoredEntry<T>;
            if (Date.now() - entry.timestamp > this.ttlMs) {
                if (this.verbose) console.log(`  Cache expired [${ns}]: ${key.slice(0, 12)}...`);
                try { unlinkSync(path); } catch { /* ignore */ }
                return null;
            }
            if (this.verbose) {
                const ageMin = Math.floor((Date.now() - entry.timestamp) / 60_000);
                console.log(`  Cache hit [${ns}]: ${key.slice(0, 12)}... (age: ${ageMin}m)`);
            }
            return entry.value;
        } catch {
            return null;
        }
    }

    /**
     * Write a value to cache.
     * @param ns    Namespace
     * @param key   Cache key produced by makeKey()
     * @param value Any JSON-serialisable value
     */
    set<T>(ns: string, key: string, value: T): void {
        this.ensureDir();
        const entry: StoredEntry<T> = { value, timestamp: Date.now() };
        try {
            writeFileSync(this.filePath(ns, key), JSON.stringify(entry), 'utf-8');
            if (this.verbose) console.log(`  Cached [${ns}]: ${key.slice(0, 12)}...`);
            this._prune();
        } catch (err) {
            if (this.verbose) console.log(`  Cache write error [${ns}]: ${err}`);
        }
    }

    /**
     * Clear cache entries.
     * @param ns  Namespace to clear. Omit to clear everything (including legacy .cache files).
     * @returns   Number of files deleted.
     */
    clear(ns?: string): number {
        if (!existsSync(this.dir)) return 0;
        try {
            const files = readdirSync(this.dir).filter(f =>
                ns
                    ? (f.startsWith(`${ns}__`) && f.endsWith('.json'))
                    : (f.endsWith('.json') || f.endsWith('.cache')), // include legacy files
            );
            let count = 0;
            for (const f of files) {
                try { unlinkSync(join(this.dir, f)); count++; } catch { /* ignore */ }
            }
            return count;
        } catch {
            return 0;
        }
    }

    /**
     * Return statistics about cached files.
     * @param ns  Namespace to scope. Omit for all files.
     */
    stats(ns?: string): {
        totalEntries: number;
        totalSize: number;
        oldestEntry: number | null;
        newestEntry: number | null;
    } {
        if (!existsSync(this.dir)) {
            return { totalEntries: 0, totalSize: 0, oldestEntry: null, newestEntry: null };
        }
        try {
            const files = readdirSync(this.dir)
                .filter(f =>
                    ns
                        ? (f.startsWith(`${ns}__`) && f.endsWith('.json'))
                        : (f.endsWith('.json') || f.endsWith('.cache')),
                )
                .map(f => join(this.dir, f));

            let totalSize = 0;
            let oldestEntry: number | null = null;
            let newestEntry: number | null = null;

            for (const file of files) {
                try {
                    const s = statSync(file);
                    totalSize += s.size;
                    const mtime = s.mtime.getTime();
                    if (oldestEntry === null || mtime < oldestEntry) oldestEntry = mtime;
                    if (newestEntry === null || mtime > newestEntry) newestEntry = mtime;
                } catch { /* ignore */ }
            }
            return { totalEntries: files.length, totalSize, oldestEntry, newestEntry };
        } catch {
            return { totalEntries: 0, totalSize: 0, oldestEntry: null, newestEntry: null };
        }
    }

    /** Remove oldest entries (across all namespaces) when total exceeds maxEntries. */
    _prune(): void {
        if (!existsSync(this.dir)) return;
        try {
            const files = readdirSync(this.dir)
                .filter(f => f.endsWith('.json'))
                .map(f => ({ path: join(this.dir, f), mtime: statSync(join(this.dir, f)).mtime.getTime() }))
                .sort((a, b) => b.mtime - a.mtime);

            if (files.length <= this.max) return;
            for (const { path } of files.slice(this.max)) {
                try { unlinkSync(path); if (this.verbose) console.log(`  Pruned: ${path}`); } catch { /* ignore */ }
            }
        } catch { /* ignore */ }
    }
}

// ── Module-level singleton ────────────────────────────────────────────────────

/** Shared cache instance. Call cache.configure() once at application startup. */
export const cache = new ExaiCache();
