/**
 * Diagram generation pipeline.
 *
 * Steps:
 *   1. Get input (LLM call or file/stdin)
 *   2. Parse simplified elements
 *   3. Expand labels → shape + bound text
 *   4. Apply style defaults
 *   5. Resolve arrow bindings
 *   6. Auto-layout positions
 *   7. Build .excalidraw file
 *   8. Write output
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { callLLM } from '../ai/openrouter.js';
import { parseElements, expandLabels, applyDefaults, resolveBindings } from './elements.js';
import { layoutElements, computeViewport } from './layout.js';
import { buildExcalidrawFile } from './build-file.js';
import { DIAGRAM_SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import type { DiagramPipelineConfig, DiagramPipelineResult, DiagramTimingEntry } from './types.js';

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

    // Step 1: Get raw input
    let rawInput: string;

    if (config.stdin) {
        onProgress?.('Reading from stdin...');
        rawInput = time('Read stdin', () => {
            const chunks: Buffer[] = [];
            const fd = 0; // stdin
            const buf = Buffer.alloc(1024);
            let n: number;
            try {
                const { readFileSync } = require('fs');
                rawInput = readFileSync(fd, 'utf-8');
                return rawInput;
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
            })
        );
    }

    // Step 2: Parse
    onProgress?.('Parsing elements...');
    const simplified = time('Parse', () => parseElements(rawInput));

    // Step 3: Expand labels
    onProgress?.('Expanding labels...');
    const { excalidraw: shapes, arrows: rawArrows } = time('Expand', () => expandLabels(simplified));

    // Step 4: Apply defaults
    const styled = time('Style', () => applyDefaults(shapes, config.style));

    // Step 5: Resolve bindings
    onProgress?.('Resolving connections...');
    const arrowElements = time('Bindings', () => resolveBindings(styled, rawArrows, config.direction));

    // Step 6: Layout
    onProgress?.('Computing layout...');
    const positioned = time('Layout', () => layoutElements(styled, arrowElements, rawArrows, config.direction));

    // Step 7: Build file
    const viewport = computeViewport(positioned);
    const file = buildExcalidrawFile(positioned, viewport);

    // Step 8: Write
    onProgress?.('Writing output...');
    const outputJson = JSON.stringify(file, null, 2);
    mkdirSync(dirname(config.output), { recursive: true });
    writeFileSync(config.output, outputJson, 'utf-8');

    const totalMs = Date.now() - totalStart;

    return {
        outputPath: config.output,
        elementCount: positioned.length,
        timing,
        totalMs,
    };
}
