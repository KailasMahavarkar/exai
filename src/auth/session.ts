/**
 * User-level session management.
 *
 * Stores API keys and default provider in ~/.exai/session.json.
 * Keys are stored per-provider so multiple providers can be configured.
 *
 * Priority: --api-key flag > env var > session.json > config file (with warning)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ── Types ──

export interface SessionData {
  keys: Record<string, string>;
  defaultProvider?: string;
}

// ── Paths ──

const EXAI_DIR = join(homedir(), '.exai');
const SESSION_PATH = join(EXAI_DIR, 'session.json');

function ensureDir(): void {
  mkdirSync(EXAI_DIR, { recursive: true });
}

// ── Core ──

/**
 * Load session data. Returns empty session if file doesn't exist.
 */
export function loadSession(): SessionData {
  if (!existsSync(SESSION_PATH)) {
    return { keys: {} };
  }
  try {
    const raw = readFileSync(SESSION_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SessionData>;
    return {
      keys: parsed.keys && typeof parsed.keys === 'object' ? parsed.keys : {},
      defaultProvider:
        typeof parsed.defaultProvider === 'string' ? parsed.defaultProvider : undefined,
    };
  } catch {
    return { keys: {} };
  }
}

/**
 * Save session data. Creates ~/.exai/ if needed.
 * Sets file permissions to owner-only (600) on Unix.
 */
function saveSession(session: SessionData): void {
  ensureDir();
  writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2), 'utf-8');
  try {
    chmodSync(SESSION_PATH, 0o600);
  } catch {
    // chmod may fail on Windows — that's fine
  }
}

/**
 * Set an API key for a provider.
 */
export function setKey(provider: string, key: string): void {
  const session = loadSession();
  session.keys[provider.toLowerCase()] = key;
  saveSession(session);
}

/**
 * Get an API key for a specific provider, or the default provider's key.
 */
export function getKey(provider?: string): string | undefined {
  const session = loadSession();
  if (provider) {
    return session.keys[provider.toLowerCase()];
  }
  // Fall back to default provider, then openrouter
  const defaultProv = session.defaultProvider || 'openrouter';
  return session.keys[defaultProv];
}

/**
 * Remove an API key for a provider.
 */
export function removeKey(provider: string): boolean {
  const session = loadSession();
  const key = provider.toLowerCase();
  if (!(key in session.keys)) return false;
  delete session.keys[key];
  saveSession(session);
  return true;
}

/**
 * List all providers that have keys stored.
 */
export function listKeys(): Array<{ provider: string; keyPreview: string }> {
  const session = loadSession();
  return Object.entries(session.keys).map(([provider, key]) => ({
    provider,
    keyPreview: maskKey(key),
  }));
}

/**
 * Set the default provider.
 */
export function setDefaultProvider(provider: string): void {
  const session = loadSession();
  session.defaultProvider = provider.toLowerCase();
  saveSession(session);
}

/**
 * Get the default provider.
 */
export function getDefaultProvider(): string | undefined {
  return loadSession().defaultProvider;
}

/**
 * Get session file path (for display).
 */
export function getSessionPath(): string {
  return SESSION_PATH;
}

// ── Helpers ──

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.slice(0, 8) + '...' + key.slice(-4);
}

/**
 * Resolve API key with full priority chain:
 *   1. Explicit CLI flag (--api-key)
 *   2. Environment variable (EXAI_OPENROUTER_APIKEY / OPENROUTER_API_KEY)
 *   3. Session file (~/.exai/session.json) — per provider
 *
 * Returns { apiKey, source } or { apiKey: undefined, source: 'none' }
 */
export function resolveApiKeyFull(
  cliKey: string | undefined,
  provider?: string
): { apiKey: string | undefined; source: string } {
  // 1. CLI flag
  if (cliKey) {
    return { apiKey: cliKey, source: 'cli flag' };
  }

  // 2. Environment variable
  const envKey = process.env.EXAI_OPENROUTER_APIKEY || process.env.OPENROUTER_API_KEY;
  if (envKey) {
    return { apiKey: envKey, source: 'environment variable' };
  }

  // 3. Session file
  const sessionKey = getKey(provider);
  if (sessionKey) {
    return { apiKey: sessionKey, source: `~/.exai/session.json (${provider || 'default'})` };
  }

  return { apiKey: undefined, source: 'none' };
}
