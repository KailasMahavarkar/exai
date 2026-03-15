/**
 * Diagram generation pipeline.
 *
 * Steps:
 *   1. Get input (LLM call or file/stdin)
 *   2. Parse all elements (including pseudo-elements)
 *   3. Extract pseudo-elements (camera, delete, checkpoint)
 *   4. Expand labels → shape + bound text
 *   5. Apply style defaults
 *   6. Resolve arrow bindings
 *   7. Auto-layout positions
 *   8. Build .excalidraw file
 *   9. Write output
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { callLLM } from '../ai/openrouter.js';
import {
  parseElements,
  extractPseudoElements,
  expandLabels,
  applyDefaults,
  resolveBindings,
} from './elements.js';
import { layoutElements, computeViewport } from './layout.js';
import { buildExcalidrawFile } from './build-file.js';
import { DIAGRAM_SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import { loadCheckpoint, saveCheckpoint, mergeElements } from './checkpoint.js';
import type {
  DiagramPipelineConfig,
  DiagramPipelineResult,
  DiagramTimingEntry,
  DiagramTheme,
  SimplifiedElement,
} from './types.js';

export async function runDiagramPipeline(
  config: DiagramPipelineConfig,
  onProgress?: (step: string) => void
): Promise<DiagramPipelineResult> {
  const timing: DiagramTimingEntry[] = [];
  const totalStart = Date.now();
  const theme: DiagramTheme = config.theme ?? 'light';

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

  // Step 1: Get raw input
  let rawInput: string;

  if (config.stdin) {
    onProgress?.('Reading from stdin...');
    rawInput = time('Read stdin', () => {
      try {
        return readFileSync(0, 'utf-8');
      } catch {
        return '';
      }
    });
  } else if (config.jsonInput) {
    onProgress?.('Reading JSON input...');
    rawInput = time('Read file', () => {
      // Check if it's a file path or raw JSON
      if (config.jsonInput!.trim().startsWith('[') || config.jsonInput!.trim().startsWith('{')) {
        return config.jsonInput!;
      }
      return readFileSync(config.jsonInput!, 'utf-8');
    });
  } else {
    // LLM mode
    onProgress?.('Generating diagram via LLM...');
    const userPrompt = buildUserPrompt(config.prompt, config.direction, theme);

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

  // Step 2: Parse all elements
  onProgress?.('Parsing elements...');
  const allInput = time('Parse', () => parseElements(rawInput));

  // Step 3: Extract pseudo-elements
  const {
    elements: simplified,
    viewportOverrides,
    restoreCheckpoint: restoreName,
  } = time('Pseudos', () => extractPseudoElements(allInput));

  // Step 3b: Load checkpoint if requested (--from-checkpoint or restoreCheckpoint pseudo)
  let mergedElements: SimplifiedElement[] = simplified;
  const checkpointName = restoreName || config.fromCheckpoint;
  if (checkpointName) {
    onProgress?.(`Loading checkpoint "${checkpointName}"...`);
    const checkpoint = time('Checkpoint', () => loadCheckpoint(checkpointName));
    mergedElements = mergeElements(checkpoint.elements, simplified);
    onProgress?.(
      `Merged ${checkpoint.elements.length} base + ${simplified.length} new → ${mergedElements.length} elements`
    );
  }

  // Step 4: Expand labels
  onProgress?.('Expanding labels...');
  const {
    excalidraw: shapes,
    arrows: rawArrows,
    zones,
  } = time('Expand', () => expandLabels(mergedElements, theme));

  // Step 5: Apply defaults
  const styled = time('Style', () => applyDefaults(shapes, config.style));

  // Step 6: Resolve bindings
  onProgress?.('Resolving connections...');
  const { arrowElements, labelMap } = time('Bindings', () =>
    resolveBindings(styled, rawArrows, config.direction, theme)
  );

  // Step 7: Layout
  onProgress?.('Computing layout...');
  const positioned = time('Layout', () =>
    layoutElements(styled, arrowElements, rawArrows, config.direction, labelMap, zones)
  );

  // Step 8: Build file
  const viewport = computeViewport(positioned, viewportOverrides);
  const file = buildExcalidrawFile(positioned, viewport, theme);

  // Step 9: Write
  onProgress?.('Writing output...');
  const outputJson = JSON.stringify(file, null, 2);
  mkdirSync(dirname(config.output), { recursive: true });
  writeFileSync(config.output, outputJson, 'utf-8');

  // Step 10: Save checkpoint if requested
  if (config.checkpoint) {
    onProgress?.(`Saving checkpoint "${config.checkpoint}"...`);
    saveCheckpoint(config.checkpoint, mergedElements, {
      direction: config.direction,
      style: config.style,
      theme,
    });
  }

  const totalMs = Date.now() - totalStart;

  return {
    outputPath: config.output,
    elementCount: positioned.length,
    timing,
    totalMs,
  };
}
