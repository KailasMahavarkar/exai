/**
 * Element processing pipeline.
 *
 * Transforms simplified elements (label shorthand, from/to arrows)
 * into full Excalidraw elements with bound text, default styles, and arrow bindings.
 *
 * Pipeline: parseElements → expandLabels → applyDefaults → resolveBindings
 */

import { nanoid } from 'nanoid';
import type {
    SimplifiedElement,
    SimplifiedShape,
    SimplifiedArrow,
    ExcalidrawElement,
    BoundElement,
    DiagramStyle,
    DiagramDirection,
} from './types.js';
import { STYLE_PRESETS } from './types.js';

// ── Constants ──

const DEFAULT_SHAPE_WIDTH = 200;
const DEFAULT_SHAPE_HEIGHT = 80;
const FONT_SIZE = 16;
const LINE_HEIGHT = 1.25;
const CHAR_WIDTH_ESTIMATE = 8; // approximate px per character at fontSize 16

// ── Parse ──

/**
 * Parse raw JSON string (from LLM or file) into SimplifiedElement[].
 * Strips markdown code fences, finds JSON array.
 */
export function parseElements(raw: string): SimplifiedElement[] {
    let cleaned = raw.trim();

    // Strip markdown code fences
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
        cleaned = fenceMatch[1].trim();
    }

    // Find JSON array
    const start = cleaned.indexOf('[');
    const end = cleaned.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) {
        throw new Error('No JSON array found in input');
    }
    cleaned = cleaned.slice(start, end + 1);

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
        throw new Error('Input must be a JSON array of elements');
    }

    // Validate required fields
    for (const el of parsed) {
        if (!el.type) throw new Error(`Element missing "type": ${JSON.stringify(el)}`);
        if (el.type === 'arrow') {
            if (!el.from || !el.to) {
                throw new Error(`Arrow missing "from" or "to": ${JSON.stringify(el)}`);
            }
        } else {
            if (!el.id) throw new Error(`Shape missing "id": ${JSON.stringify(el)}`);
            if (!el.label) throw new Error(`Shape missing "label": ${JSON.stringify(el)}`);
        }
    }

    return parsed as SimplifiedElement[];
}

// ── Helpers ──

function randomSeed(): number {
    return Math.floor(Math.random() * 2 ** 31);
}

function baseElement(overrides: Partial<ExcalidrawElement>): ExcalidrawElement {
    return {
        id: nanoid(8),
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        angle: 0,
        strokeColor: '#1e1e1e',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: { type: 3 },
        seed: randomSeed(),
        version: 1,
        versionNonce: randomSeed(),
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
        ...overrides,
    };
}

function estimateTextSize(text: string): { width: number; height: number } {
    const lines = text.split('\n');
    const maxLineLen = Math.max(...lines.map(l => l.length));
    const width = maxLineLen * CHAR_WIDTH_ESTIMATE + 10;
    const height = lines.length * FONT_SIZE * LINE_HEIGHT;
    return { width, height };
}

// ── Expand Labels ──

/**
 * Expand label shorthand into shape + bound text element pairs.
 * Arrows are passed through as-is (resolved later).
 */
export function expandLabels(elements: SimplifiedElement[]): {
    excalidraw: ExcalidrawElement[];
    arrows: SimplifiedArrow[];
} {
    const result: ExcalidrawElement[] = [];
    const arrows: SimplifiedArrow[] = [];

    for (const el of elements) {
        if (el.type === 'arrow') {
            arrows.push(el);
            continue;
        }

        const shape = el as SimplifiedShape;
        const textId = `${shape.id}-text`;
        const textSize = estimateTextSize(shape.label);

        const shapeWidth = shape.width ?? Math.max(DEFAULT_SHAPE_WIDTH, textSize.width + 40);
        const shapeHeight = shape.height ?? DEFAULT_SHAPE_HEIGHT;

        // Shape element
        result.push(baseElement({
            id: shape.id,
            type: shape.type,
            width: shapeWidth,
            height: shapeHeight,
            backgroundColor: shape.backgroundColor ?? 'transparent',
            strokeColor: shape.strokeColor ?? '#1e1e1e',
            boundElements: [{ type: 'text', id: textId }],
        }));

        // Bound text element
        result.push(baseElement({
            id: textId,
            type: 'text',
            x: 5,  // offset from shape — repositioned during layout
            y: 0,
            width: shapeWidth - 10,
            height: textSize.height,
            strokeColor: shape.strokeColor ?? '#1e1e1e',
            backgroundColor: 'transparent',
            strokeWidth: 1,
            roundness: null,
            boundElements: null,
            text: shape.label,
            fontSize: FONT_SIZE,
            fontFamily: 1,
            textAlign: 'center',
            verticalAlign: 'middle',
            containerId: shape.id,
            originalText: shape.label,
            lineHeight: LINE_HEIGHT,
            baseline: Math.round(FONT_SIZE * LINE_HEIGHT),
        }));
    }

    return { excalidraw: result, arrows };
}

// ── Apply Defaults ──

/**
 * Apply style preset defaults (roughness, roundness, fontFamily, strokeWidth).
 */
export function applyDefaults(elements: ExcalidrawElement[], style: DiagramStyle): ExcalidrawElement[] {
    const preset = STYLE_PRESETS[style];

    return elements.map(el => {
        const updates: Partial<ExcalidrawElement> = {
            roughness: preset.roughness,
            strokeWidth: preset.strokeWidth,
        };

        if (el.type !== 'text' && el.type !== 'arrow') {
            updates.roundness = preset.roundness;
        }

        if (el.type === 'text') {
            updates.fontFamily = preset.fontFamily;
        }

        return { ...el, ...updates };
    });
}

// ── Resolve Bindings ──

/**
 * Convert SimplifiedArrow (from/to IDs) into full ExcalidrawElement arrows
 * with startBinding/endBinding and fixedPoint coordinates.
 */
export function resolveBindings(
    shapes: ExcalidrawElement[],
    arrows: SimplifiedArrow[],
    direction: DiagramDirection,
): ExcalidrawElement[] {
    // Build shape lookup
    const shapeMap = new Map<string, ExcalidrawElement>();
    for (const el of shapes) {
        if (el.type !== 'text') {
            shapeMap.set(el.id, el);
        }
    }

    const resolvedArrows: ExcalidrawElement[] = [];

    for (const arr of arrows) {
        const source = shapeMap.get(arr.from);
        const target = shapeMap.get(arr.to);

        if (!source || !target) {
            console.warn(`Arrow skipped: "${arr.from}" → "${arr.to}" — shape not found`);
            continue;
        }

        const arrowId = arr.id ?? `arrow-${arr.from}-${arr.to}-${nanoid(4)}`;

        // Determine edge points based on layout direction
        const [srcFixed, dstFixed] = direction === 'TB'
            ? [[0.5, 1] as [number, number], [0.5, 0] as [number, number]]   // bottom → top
            : [[1, 0.5] as [number, number], [0, 0.5] as [number, number]];  // right → left

        // Arrow element (points computed during layout)
        const arrowEl = baseElement({
            id: arrowId,
            type: 'arrow',
            roughness: 0,
            roundness: null,
            strokeColor: arr.strokeColor ?? '#495057',
            strokeStyle: (arr.strokeStyle as 'solid' | 'dashed' | 'dotted') ?? 'solid',
            points: [[0, 0], [0, 0]],  // placeholder — computed in layout
            elbowed: true,
            startArrowhead: null,
            endArrowhead: 'arrow',
            startBinding: {
                elementId: arr.from,
                focus: 0,
                gap: 8,
                fixedPoint: srcFixed,
            },
            endBinding: {
                elementId: arr.to,
                focus: 0,
                gap: 8,
                fixedPoint: dstFixed,
            },
        });

        resolvedArrows.push(arrowEl);

        // Add arrow to source/target boundElements
        const addArrowBinding = (shape: ExcalidrawElement) => {
            const existing = shape.boundElements ?? [];
            if (!existing.find(b => b.id === arrowId)) {
                shape.boundElements = [...existing, { type: 'arrow', id: arrowId }];
            }
        };
        addArrowBinding(source);
        addArrowBinding(target);

        // If arrow has a label, create bound text
        if (arr.label) {
            const labelId = `${arrowId}-label`;
            const labelSize = estimateTextSize(arr.label);

            resolvedArrows.push(baseElement({
                id: labelId,
                type: 'text',
                width: labelSize.width,
                height: labelSize.height,
                strokeColor: '#495057',
                backgroundColor: '#ffffff',
                strokeWidth: 1,
                roundness: null,
                boundElements: null,
                text: arr.label,
                fontSize: 13,
                fontFamily: 1,
                textAlign: 'center',
                verticalAlign: 'middle',
                containerId: null,
                originalText: arr.label,
                lineHeight: LINE_HEIGHT,
                baseline: Math.round(13 * LINE_HEIGHT),
            }));

            // Store label reference for layout positioning
            (arrowEl as unknown as Record<string, unknown>)['_labelId'] = labelId;
        }
    }

    return resolvedArrows;
}
