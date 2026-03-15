/**
 * Assembles the final .excalidraw JSON file structure.
 */

import type { ExcalidrawElement, ExcalidrawFile } from './types.js';

export function buildExcalidrawFile(
    elements: ExcalidrawElement[],
    viewport: { scrollX: number; scrollY: number; zoom: number },
): ExcalidrawFile {
    return {
        type: 'excalidraw',
        version: 2,
        source: 'https://github.com/KailasMahavarkar/exai',
        elements,
        appState: {
            gridSize: null,
            viewBackgroundColor: '#ffffff',
            scrollX: viewport.scrollX,
            scrollY: viewport.scrollY,
            zoom: { value: viewport.zoom },
        },
        files: {},
    };
}
