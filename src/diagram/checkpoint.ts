/**
 * Checkpoint system for iterative diagram building.
 *
 * Saves/restores diagram state (elements + metadata) to ~/.exai/checkpoints/.
 * Enables building complex diagrams across multiple CLI invocations.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { SimplifiedElement, DiagramDirection, DiagramStyle, DiagramTheme } from './types.js';

// ── Types ──

export interface CheckpointData {
  version: 1;
  name: string;
  timestamp: number;
  elements: SimplifiedElement[];
  direction?: DiagramDirection;
  style?: DiagramStyle;
  theme?: DiagramTheme;
}

export interface CheckpointSummary {
  name: string;
  timestamp: number;
  elementCount: number;
  direction?: DiagramDirection;
  theme?: DiagramTheme;
}

// ── Store ──

const CHECKPOINTS_DIR = join(homedir(), '.exai', 'checkpoints');

function ensureDir(): void {
  mkdirSync(CHECKPOINTS_DIR, { recursive: true });
}

function filePath(name: string): string {
  return join(CHECKPOINTS_DIR, `${name}.checkpoint.json`);
}

/**
 * Save a checkpoint with the given name.
 * Overwrites if a checkpoint with this name already exists.
 */
export function saveCheckpoint(
  name: string,
  elements: SimplifiedElement[],
  options?: { direction?: DiagramDirection; style?: DiagramStyle; theme?: DiagramTheme }
): void {
  ensureDir();
  const data: CheckpointData = {
    version: 1,
    name,
    timestamp: Date.now(),
    elements,
    direction: options?.direction,
    style: options?.style,
    theme: options?.theme,
  };
  writeFileSync(filePath(name), JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Load a checkpoint by name. Throws if not found.
 */
export function loadCheckpoint(name: string): CheckpointData {
  const path = filePath(name);
  if (!existsSync(path)) {
    const available = listCheckpoints();
    const hint =
      available.length > 0
        ? `\nAvailable checkpoints: ${available.map((c) => c.name).join(', ')}`
        : '\nNo checkpoints saved yet.';
    throw new Error(`Checkpoint "${name}" not found.${hint}`);
  }
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as CheckpointData;
}

/**
 * List all saved checkpoints, sorted by timestamp (newest first).
 */
export function listCheckpoints(): CheckpointSummary[] {
  ensureDir();
  const files = readdirSync(CHECKPOINTS_DIR).filter((f) => f.endsWith('.checkpoint.json'));
  const summaries: CheckpointSummary[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(CHECKPOINTS_DIR, file), 'utf-8');
      const data = JSON.parse(raw) as CheckpointData;
      summaries.push({
        name: data.name,
        timestamp: data.timestamp,
        elementCount: data.elements.length,
        direction: data.direction,
        theme: data.theme,
      });
    } catch {
      // Skip corrupt checkpoint files
    }
  }

  return summaries.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Remove a checkpoint by name. Returns true if removed, false if not found.
 */
export function removeCheckpoint(name: string): boolean {
  const path = filePath(name);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

/**
 * Show checkpoint details (full element list).
 */
export function showCheckpoint(name: string): CheckpointData {
  return loadCheckpoint(name);
}

/**
 * Merge new elements into checkpoint elements.
 * New elements with the same ID as existing ones replace them.
 * New arrows are appended.
 */
export function mergeElements(
  base: SimplifiedElement[],
  additions: SimplifiedElement[]
): SimplifiedElement[] {
  const result = new Map<string, SimplifiedElement>();

  // Index base elements by ID (arrows use from-to as key, text uses id or auto-key)
  for (const el of base) {
    const key =
      el.type === 'arrow'
        ? `arrow:${el.startElementId}:${el.endElementId}`
        : (el as { id?: string }).id ?? `auto:${result.size}`;
    result.set(key, el);
  }

  // Additions override by key
  for (const el of additions) {
    const key =
      el.type === 'arrow'
        ? `arrow:${el.startElementId}:${el.endElementId}`
        : (el as { id?: string }).id ?? `auto:${result.size}`;
    result.set(key, el);
  }

  return [...result.values()];
}
