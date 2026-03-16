/**
 * D2 diagram generation pipeline.
 *
 * Steps:
 *   1. Get input (LLM or JSON file)
 *   2. Parse JSON elements
 *   3. Compile to D2 syntax
 *   4. Render via d2 binary
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { callLLM } from '../ai/openrouter.js';
import { compileToD2 } from './compiler.js';
import { renderD2 } from './render.js';
import { resolveTheme, resolvePreset } from './themes.js';
import { DIAGRAM_SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import { loadCheckpoint, saveCheckpoint, mergeElements } from './checkpoint.js';
import type { DiagramPipelineConfig, DiagramPipelineResult, DiagramTimingEntry, SimplifiedElement } from './types.js';

function parseElements(raw: string): SimplifiedElement[] {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/```(?:json)?\n?/g, '').replace(/```\n?/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON array found in input');
  cleaned = cleaned.slice(start, end + 1);
  const parsed = JSON.parse(cleaned) as SimplifiedElement[];
  if (!Array.isArray(parsed)) throw new Error('Input must be a JSON array');
  return parsed;
}

export async function runDiagramPipeline(
  config: DiagramPipelineConfig,
  onProgress?: (step: string) => void,
): Promise<DiagramPipelineResult> {
  const timing: DiagramTimingEntry[] = [];
  const totalStart = Date.now();

  function time<T>(label: string, fn: () => T): T {
    const start = Date.now();
    const result = fn();
    timing.push({ label, ms: Date.now() - start });
    return result;
  }

  async function timeAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    const result = await fn();
    timing.push({ label, ms: Date.now() - start });
    return result;
  }

  // Step 1: Get input
  let rawInput: string;
  if (config.stdin) {
    onProgress?.('Reading from stdin...');
    rawInput = time('Read stdin', () => { try { return readFileSync(0, 'utf-8'); } catch { return ''; } });
  } else if (config.jsonInput) {
    onProgress?.('Reading input...');
    rawInput = time('Read file', () => {
      if (config.jsonInput!.trim().startsWith('[') || config.jsonInput!.trim().startsWith('{')) return config.jsonInput!;
      return readFileSync(config.jsonInput!, 'utf-8');
    });
  } else {
    onProgress?.('Generating via LLM...');
    const userPrompt = buildUserPrompt(config.prompt, config.direction);
    rawInput = await timeAsync('LLM call', () =>
      callLLM(userPrompt, DIAGRAM_SYSTEM_PROMPT, {
        model: config.model,
        apiKey: config.apiKey,
        temperature: 0.3,
        verbose: config.verbose,
        useCache: config.useCache ?? true,
        cacheFormat: 'diagram',
        cacheContext: config.prompt,
        timeoutMs: config.timeoutMs ?? 60000,
        provider: config.provider,
      })
    );
  }

  // Step 2: Parse
  onProgress?.('Parsing elements...');
  let elements = time('Parse', () => parseElements(rawInput));

  // Checkpoint restore
  if (config.fromCheckpoint) {
    onProgress?.(`Loading checkpoint "${config.fromCheckpoint}"...`);
    const checkpoint = time('Checkpoint', () => loadCheckpoint(config.fromCheckpoint!));
    elements = mergeElements(checkpoint.elements, elements);
  }

  // Resolve color preset (available for future per-element coloring)
  const _preset = resolvePreset(config.preset);
  void _preset; // reserved for future use

  // Step 3: Compile to D2
  onProgress?.('Compiling D2...');
  const d2Source = time('Compile', () => compileToD2(elements, config.direction));

  if (config.verbose) {
    console.log('  --- D2 source ---');
    console.log(d2Source);
    console.log('  --- end ---');
  }

  // Determine output format
  let outputPath = resolve(config.output);
  if (outputPath.endsWith('.excalidraw')) {
    outputPath = outputPath.replace('.excalidraw', '.svg');
  }
  if (!outputPath.match(/\.(svg|png|pdf|d2)$/)) {
    outputPath += '.svg';
  }

  mkdirSync(dirname(outputPath), { recursive: true });

  // If output is .d2, just write the source
  if (outputPath.endsWith('.d2')) {
    writeFileSync(outputPath, d2Source, 'utf-8');
  } else {
    // Step 4: Render
    onProgress?.('Rendering...');
    time('Render', () =>
      renderD2({
        d2Source,
        outputPath,
        theme: resolveTheme(config.theme),
        layout: config.layout,
        sketch: config.sketch,
        pad: config.pad,
        verbose: config.verbose,
      })
    );
  }

  // Save checkpoint
  if (config.checkpoint) {
    onProgress?.(`Saving checkpoint "${config.checkpoint}"...`);
    saveCheckpoint(config.checkpoint, elements, { direction: config.direction });
  }

  const totalMs = Date.now() - totalStart;
  return { outputPath, elementCount: elements.length, timing, totalMs };
}
