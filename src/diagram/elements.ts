/**
 * Element processing pipeline.
 *
 * Transforms simplified elements (label shorthand, from/to arrows)
 * into full Excalidraw elements with bound text, default styles, and arrow bindings.
 *
 * Pipeline: parseElements → extractPseudoElements → expandLabels → applyDefaults → resolveBindings
 */

import { nanoid } from 'nanoid';
import type {
    SimplifiedElement,
    SimplifiedShape,
    SimplifiedArrow,
    ExcalidrawElement,
    DiagramStyle,
    DiagramDirection,
    DiagramTheme,
    ThemeColors,
    DiagramInputElement,
    PseudoElement,
    CameraUpdatePseudo,
    ViewportOverrides,
    LabelValue,
} from './types.js';
import { STYLE_PRESETS, THEME_PRESETS, normalizeLabel } from './types.js';

// ── Constants ──

const DEFAULT_SHAPE_WIDTH = 200;
const DEFAULT_SHAPE_HEIGHT = 80;
const DEFAULT_FONT_SIZE = 16;
const ARROW_LABEL_FONT_SIZE = 13;
const LINE_HEIGHT = 1.25;
const CHAR_WIDTH_ESTIMATE = 8; // approximate px per character at fontSize 16

// ── Parse ──

const PSEUDO_TYPES = new Set(['cameraUpdate', 'delete', 'restoreCheckpoint']);

/**
 * Parse raw JSON string (from LLM or file) into DiagramInputElement[].
 * Strips markdown code fences, finds JSON array.
 */
export function parseElements(raw: string): DiagramInputElement[] {
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

        // Skip validation for pseudo-elements
        if (PSEUDO_TYPES.has(el.type)) continue;

        if (el.type === 'arrow') {
            if (!el.from || !el.to) {
                throw new Error(`Arrow missing "from" or "to": ${JSON.stringify(el)}`);
            }
        } else {
            if (!el.id) throw new Error(`Shape missing "id": ${JSON.stringify(el)}`);
            if (!el.label) throw new Error(`Shape missing "label": ${JSON.stringify(el)}`);
            // Validate rich label
            if (typeof el.label === 'object') {
                if (!el.label.text) {
                    throw new Error(`Shape label object missing "text": ${JSON.stringify(el)}`);
                }
            }
        }
    }

    return parsed as DiagramInputElement[];
}

// ── Pseudo-element Extraction ──

export interface ExtractedPseudos {
    elements: SimplifiedElement[];
    viewportOverrides: ViewportOverrides;
    deletions: string[];
    restoreCheckpoint: string | null;
}

/**
 * Separate pseudo-elements from real elements.
 * Processes cameraUpdate, delete, and restoreCheckpoint pseudo-elements.
 */
export function extractPseudoElements(input: DiagramInputElement[]): ExtractedPseudos {
    const elements: SimplifiedElement[] = [];
    const deletions: string[] = [];
    let viewportOverrides: ViewportOverrides = {};
    let restoreCheckpoint: string | null = null;

    for (const el of input) {
        if (!PSEUDO_TYPES.has(el.type)) {
            elements.push(el as SimplifiedElement);
            continue;
        }

        const pseudo = el as PseudoElement;

        switch (pseudo.type) {
            case 'cameraUpdate': {
                const cam = pseudo as CameraUpdatePseudo;
                viewportOverrides = {
                    scrollX: cam.scrollX,
                    scrollY: cam.scrollY,
                    zoom: cam.zoom !== undefined
                        ? Math.max(0.1, Math.min(cam.zoom, 2.0))
                        : undefined,
                };
                break;
            }
            case 'delete':
                deletions.push(pseudo.targetId);
                break;
            case 'restoreCheckpoint':
                restoreCheckpoint = pseudo.name;
                break;
        }
    }

    // Apply deletions
    const filteredElements = deletions.length > 0
        ? elements.filter(el => {
            if (el.type === 'arrow') return true; // arrows don't have stable IDs to delete
            return !deletions.includes(el.id);
        })
        : elements;

    // Warn about deletions that didn't match
    if (deletions.length > 0) {
        const existingIds = new Set(
            elements.filter(el => el.type !== 'arrow').map(el => (el as SimplifiedShape).id)
        );
        for (const id of deletions) {
            if (!existingIds.has(id)) {
                console.warn(`Warning: delete target "${id}" not found in elements`);
            }
        }
    }

    return {
        elements: filteredElements,
        viewportOverrides,
        deletions,
        restoreCheckpoint,
    };
}

// ── Helpers ──

function randomSeed(): number {
    return Math.floor(Math.random() * 2 ** 31);
}

function getThemeColors(theme?: DiagramTheme): ThemeColors {
    return THEME_PRESETS[theme ?? 'light'];
}

function baseElement(overrides: Partial<ExcalidrawElement>, theme?: DiagramTheme): ExcalidrawElement {
    const colors = getThemeColors(theme);
    return {
        id: nanoid(8),
        type: 'rectangle',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        angle: 0,
        strokeColor: colors.defaultStrokeColor,
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

function estimateTextSize(text: string, fontSize?: number): { width: number; height: number } {
    const fs = fontSize ?? DEFAULT_FONT_SIZE;
    const charWidth = (fs / DEFAULT_FONT_SIZE) * CHAR_WIDTH_ESTIMATE;
    const lines = text.split('\n');
    const maxLineLen = Math.max(...lines.map(l => l.length));
    const width = maxLineLen * charWidth + 10;
    const height = lines.length * fs * LINE_HEIGHT;
    return { width, height };
}

// ── Expand Labels ──

/**
 * Expand label shorthand into shape + bound text element pairs.
 * Arrows are passed through as-is (resolved later).
 * Returns a labelMap (arrowId → labelId) for layout positioning.
 */
export function expandLabels(elements: SimplifiedElement[], theme?: DiagramTheme): {
    excalidraw: ExcalidrawElement[];
    arrows: SimplifiedArrow[];
} {
    const colors = getThemeColors(theme);
    const result: ExcalidrawElement[] = [];
    const arrows: SimplifiedArrow[] = [];

    for (const el of elements) {
        if (el.type === 'arrow') {
            arrows.push(el);
            continue;
        }

        const shape = el as SimplifiedShape;
        const richLabel = normalizeLabel(shape.label);
        const textId = `${shape.id}-text`;
        const fontSize = richLabel.fontSize ?? DEFAULT_FONT_SIZE;
        const textSize = estimateTextSize(richLabel.text, fontSize);

        const shapeWidth = shape.width ?? Math.max(DEFAULT_SHAPE_WIDTH, textSize.width + 40);
        const shapeHeight = shape.height ?? DEFAULT_SHAPE_HEIGHT;

        // Shape element
        result.push(baseElement({
            id: shape.id,
            type: shape.type,
            width: shapeWidth,
            height: shapeHeight,
            backgroundColor: shape.backgroundColor ?? 'transparent',
            strokeColor: shape.strokeColor ?? colors.defaultStrokeColor,
            boundElements: [{ type: 'text', id: textId }],
        }, theme));

        // Bound text element
        result.push(baseElement({
            id: textId,
            type: 'text',
            x: 5,  // offset from shape — repositioned during layout
            y: 0,
            width: shapeWidth - 10,
            height: textSize.height,
            strokeColor: richLabel.strokeColor ?? shape.strokeColor ?? colors.defaultTextColor,
            backgroundColor: 'transparent',
            strokeWidth: 1,
            roundness: null,
            boundElements: null,
            text: richLabel.text,
            fontSize,
            fontFamily: richLabel.fontFamily ?? 1,
            textAlign: 'center',
            verticalAlign: 'middle',
            containerId: shape.id,
            originalText: richLabel.text,
            lineHeight: LINE_HEIGHT,
            baseline: Math.round(fontSize * LINE_HEIGHT),
        }, theme));
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
            // Only apply preset fontFamily if element uses the default (not overridden by rich label)
            if (el.fontFamily === 1) {
                updates.fontFamily = preset.fontFamily;
            }
        }

        return { ...el, ...updates };
    });
}

// ── Resolve Bindings ──

/**
 * Convert SimplifiedArrow (from/to IDs) into full ExcalidrawElement arrows
 * with startBinding/endBinding and fixedPoint coordinates.
 * Returns arrows + a labelMap for layout positioning.
 */
export function resolveBindings(
    shapes: ExcalidrawElement[],
    arrows: SimplifiedArrow[],
    direction: DiagramDirection,
    theme?: DiagramTheme,
): { arrowElements: ExcalidrawElement[]; labelMap: Map<string, string> } {
    const colors = getThemeColors(theme);

    // Build shape lookup
    const shapeMap = new Map<string, ExcalidrawElement>();
    for (const el of shapes) {
        if (el.type !== 'text') {
            shapeMap.set(el.id, el);
        }
    }

    const arrowElements: ExcalidrawElement[] = [];
    const labelMap = new Map<string, string>();

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
            strokeColor: arr.strokeColor ?? colors.defaultArrowColor,
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
        }, theme);

        arrowElements.push(arrowEl);

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
            const labelSize = estimateTextSize(arr.label, ARROW_LABEL_FONT_SIZE);

            arrowElements.push(baseElement({
                id: labelId,
                type: 'text',
                width: labelSize.width,
                height: labelSize.height,
                strokeColor: colors.defaultArrowColor,
                backgroundColor: colors.arrowLabelBackground,
                strokeWidth: 1,
                roundness: null,
                boundElements: null,
                text: arr.label,
                fontSize: ARROW_LABEL_FONT_SIZE,
                fontFamily: 1,
                textAlign: 'center',
                verticalAlign: 'middle',
                containerId: null,
                originalText: arr.label,
                lineHeight: LINE_HEIGHT,
                baseline: Math.round(ARROW_LABEL_FONT_SIZE * LINE_HEIGHT),
            }, theme));

            // Store label → arrow mapping for layout positioning
            labelMap.set(arrowId, labelId);
        }
    }

    return { arrowElements, labelMap };
}
