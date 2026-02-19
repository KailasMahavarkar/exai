/**
 * Base Element Factory
 *
 * Creates base Excalidraw element properties shared by all elements.
 */

import { nanoid } from 'nanoid';
import type { ExcalidrawElementBase } from '../types/excalidraw.js';
import { DEFAULT_ELEMENT_STYLE } from '../types/excalidraw.js';

// Index counter for z-ordering
let indexCounter = 0;

/**
 * Generate a unique index string for element ordering
 */
function generateIndex(): string {
    indexCounter++;
    // Convert to base-26 alphabetic index (a, b, c, ..., aa, ab, ...)
    let idx = indexCounter;
    let result = '';
    while (idx > 0) {
        idx--;
        result = String.fromCharCode(97 + (idx % 26)) + result;
        idx = Math.floor(idx / 26);
    }
    return 'a' + result;
}

/**
 * Generate a random seed for roughness rendering
 */
function generateSeed(): number {
    return Math.floor(Math.random() * 2147483647);
}

/**
 * Generate version nonce
 */
function generateVersionNonce(): number {
    return Math.floor(Math.random() * 2147483647);
}

/**
 * Create base element properties
 */
export function createBaseElement(
    type: ExcalidrawElementBase['type'],
    x: number,
    y: number,
    width: number,
    height: number,
    options?: Partial<ExcalidrawElementBase>
): ExcalidrawElementBase {
    return {
        id: options?.id || nanoid(21),
        type,
        x,
        y,
        width,
        height,
        angle: options?.angle ?? 0,
        strokeColor: options?.strokeColor ?? DEFAULT_ELEMENT_STYLE.strokeColor,
        backgroundColor: options?.backgroundColor ?? DEFAULT_ELEMENT_STYLE.backgroundColor,
        fillStyle: options?.fillStyle ?? DEFAULT_ELEMENT_STYLE.fillStyle,
        strokeWidth: options?.strokeWidth ?? DEFAULT_ELEMENT_STYLE.strokeWidth,
        strokeStyle: options?.strokeStyle ?? DEFAULT_ELEMENT_STYLE.strokeStyle,
        roughness: options?.roughness ?? DEFAULT_ELEMENT_STYLE.roughness,
        opacity: options?.opacity ?? DEFAULT_ELEMENT_STYLE.opacity,
        groupIds: options?.groupIds ?? [],
        frameId: options?.frameId ?? null,
        index: options?.index ?? generateIndex(),
        roundness: options?.roundness ?? null,
        seed: options?.seed ?? generateSeed(),
        version: options?.version ?? 1,
        versionNonce: options?.versionNonce ?? generateVersionNonce(),
        isDeleted: options?.isDeleted ?? false,
        boundElements: options?.boundElements ?? null,
        updated: options?.updated ?? Date.now(),
        link: options?.link ?? null,
        locked: options?.locked ?? false,
    };
}

/**
 * Reset the index counter (useful for testing)
 */
export function resetIndexCounter(): void {
    indexCounter = 0;
}

// Re-export defaults
export { DEFAULT_ELEMENT_STYLE } from '../types/excalidraw.js';
