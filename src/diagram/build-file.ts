/**
 * Assembles the final .excalidraw JSON file structure.
 */

import type { ExcalidrawElement, ExcalidrawFile, DiagramTheme } from './types.js';
import { THEME_PRESETS } from './types.js';

export function buildExcalidrawFile(
    elements: ExcalidrawElement[],
    viewport: { scrollX: number; scrollY: number; zoom: number },
    theme?: DiagramTheme,
): ExcalidrawFile {
    const colors = THEME_PRESETS[theme ?? 'light'];

    return {
        type: 'excalidraw',
        version: 2,
        source: 'https://github.com/KailasMahavarkar/exai',
        elements,
        appState: {
            gridSize: null,
            viewBackgroundColor: colors.viewBackgroundColor,
            scrollX: viewport.scrollX,
            scrollY: viewport.scrollY,
            zoom: { value: viewport.zoom },
        },
        files: {},
    };
}
