/**
 * Text Factory
 *
 * Creates Excalidraw text elements for labels.
 */

import { nanoid } from 'nanoid';
import { createBaseElement } from './element-factory.js';
import type {
    ExcalidrawText,
    ExcalidrawTextAlign,
    ExcalidrawVerticalAlign,
} from '../types/excalidraw.js';
import type { LayoutedNode } from '../types/dsl.js';

/**
 * Default font settings
 */
const DEFAULT_FONT_SIZE = 20;
const DEFAULT_FONT_FAMILY = 5; // Excalifont
const DEFAULT_LINE_HEIGHT = 1.25;

/**
 * Calculate text dimensions
 */
function calculateTextDimensions(
    text: string,
    fontSize: number
): { width: number; height: number } {
    const lines = text.split('\n');
    const lineCount = lines.length;
    const maxLineLength = Math.max(...lines.map((l) => l.length));

    // Approximate character width (varies by font)
    const charWidth = fontSize * 0.6;
    const lineHeight = fontSize * DEFAULT_LINE_HEIGHT;

    return {
        width: maxLineLength * charWidth,
        height: lineCount * lineHeight,
    };
}

/**
 * Create a standalone text element
 */
export function createText(
    text: string,
    x: number,
    y: number,
    options?: {
        id?: string;
        fontSize?: number;
        fontFamily?: number;
        textAlign?: ExcalidrawTextAlign;
        verticalAlign?: ExcalidrawVerticalAlign;
        strokeColor?: string;
    }
): ExcalidrawText {
    const fontSize = options?.fontSize ?? DEFAULT_FONT_SIZE;
    const dims = calculateTextDimensions(text, fontSize);

    return {
        ...createBaseElement('text', x, y, dims.width, dims.height, {
            id: options?.id || nanoid(21),
            roundness: null,
            strokeColor: options?.strokeColor,
        }),
        type: 'text',
        text,
        fontSize,
        fontFamily: options?.fontFamily ?? DEFAULT_FONT_FAMILY,
        textAlign: options?.textAlign ?? 'center',
        verticalAlign: options?.verticalAlign ?? 'middle',
        containerId: null,
        originalText: text,
        autoResize: true,
        lineHeight: DEFAULT_LINE_HEIGHT,
    } as ExcalidrawText;
}

/**
 * Create a text element bound to a container (shape or arrow)
 */
export function createBoundText(
    text: string,
    containerId: string,
    centerX: number,
    centerY: number,
    options?: {
        id?: string;
        fontSize?: number;
        fontFamily?: number;
        textAlign?: ExcalidrawTextAlign;
        verticalAlign?: ExcalidrawVerticalAlign;
        strokeColor?: string;
    }
): ExcalidrawText {
    const fontSize = options?.fontSize ?? DEFAULT_FONT_SIZE;
    const dims = calculateTextDimensions(text, fontSize);

    // Center text on the given coordinates
    const x = centerX - dims.width / 2;
    const y = centerY - dims.height / 2;

    return {
        ...createBaseElement('text', x, y, dims.width, dims.height, {
            id: options?.id || nanoid(21),
            roundness: null,
            strokeColor: options?.strokeColor,
        }),
        type: 'text',
        text,
        fontSize,
        fontFamily: options?.fontFamily ?? DEFAULT_FONT_FAMILY,
        textAlign: options?.textAlign ?? 'center',
        verticalAlign: options?.verticalAlign ?? 'middle',
        containerId,
        originalText: text,
        autoResize: true,
        lineHeight: DEFAULT_LINE_HEIGHT,
    } as ExcalidrawText;
}

/**
 * Create a text label for a node (centered inside the shape)
 */
export function createNodeLabel(
    node: LayoutedNode,
    options?: {
        id?: string;
        containerId?: string | null;
        fontSize?: number;
        fontFamily?: number;
        textAlign?: ExcalidrawTextAlign;
        strokeColor?: string;
        groupIds?: string[];
    }
): ExcalidrawText {
    const fontSize = options?.fontSize ?? node.style?.fontSize ?? DEFAULT_FONT_SIZE;
    const dims = calculateTextDimensions(node.label, fontSize);

    // Center text inside the node
    const x = node.x + (node.width - dims.width) / 2;
    const y = node.y + (node.height - dims.height) / 2;

    return {
        ...createBaseElement('text', x, y, dims.width, dims.height, {
            id: options?.id || nanoid(21),
            roundness: null,
            strokeColor: options?.strokeColor ?? node.style?.textColor,
            groupIds: options?.groupIds,
        }),
        type: 'text',
        text: node.label,
        fontSize,
        fontFamily: options?.fontFamily ?? node.style?.fontFamily ?? DEFAULT_FONT_FAMILY,
        textAlign: options?.textAlign ?? node.style?.textAlign ?? 'center',
        verticalAlign: 'middle',
        containerId: options?.containerId ?? null,
        originalText: node.label,
        autoResize: true,
        lineHeight: DEFAULT_LINE_HEIGHT,
    } as ExcalidrawText;
}

/**
 * Create a text label for an edge (positioned at midpoint)
 */
export function createEdgeLabel(
    label: string,
    points: Array<[number, number]>,
    startX: number,
    startY: number,
    arrowId: string,
    options?: {
        id?: string;
        fontSize?: number;
        fontFamily?: number;
        textAlign?: ExcalidrawTextAlign;
        strokeColor?: string;
        groupIds?: string[];
    }
): ExcalidrawText {
    const fontSize = options?.fontSize ?? DEFAULT_FONT_SIZE;
    const dims = calculateTextDimensions(label, fontSize);

    const absolutePoints: Array<{ x: number; y: number }> = points.map(([px, py]) => ({
        x: startX + px,
        y: startY + py,
    }));

    if (absolutePoints.length === 0) {
        absolutePoints.push({ x: startX, y: startY });
    } else if (absolutePoints[0].x !== startX || absolutePoints[0].y !== startY) {
        absolutePoints.unshift({ x: startX, y: startY });
    }

    let totalLength = 0;
    for (let i = 0; i < absolutePoints.length - 1; i++) {
        const dx = absolutePoints[i + 1].x - absolutePoints[i].x;
        const dy = absolutePoints[i + 1].y - absolutePoints[i].y;
        totalLength += Math.hypot(dx, dy);
    }

    let midX = startX;
    let midY = startY;

    if (totalLength > 0) {
        const midpointDistance = totalLength / 2;
        let walked = 0;

        for (let i = 0; i < absolutePoints.length - 1; i++) {
            const p1 = absolutePoints[i];
            const p2 = absolutePoints[i + 1];
            const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            if (walked + segLen >= midpointDistance) {
                const t = segLen === 0 ? 0 : (midpointDistance - walked) / segLen;
                midX = p1.x + (p2.x - p1.x) * t;
                midY = p1.y + (p2.y - p1.y) * t;
                break;
            }
            walked += segLen;
        }
    }

    // Position text centered at midpoint
    const x = midX - dims.width / 2;
    const y = midY - dims.height / 2;

    return {
        ...createBaseElement('text', x, y, dims.width, dims.height, {
            id: options?.id || nanoid(21),
            roundness: null,
            strokeColor: options?.strokeColor,
            groupIds: options?.groupIds,
        }),
        type: 'text',
        text: label,
        fontSize,
        fontFamily: options?.fontFamily ?? DEFAULT_FONT_FAMILY,
        textAlign: options?.textAlign ?? 'center',
        verticalAlign: 'middle',
        containerId: arrowId, // Bound to the arrow
        originalText: label,
        autoResize: true,
        lineHeight: DEFAULT_LINE_HEIGHT,
    } as ExcalidrawText;
}
