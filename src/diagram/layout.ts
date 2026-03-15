/**
 * Auto-layout engine for diagram elements.
 *
 * Performs topological sort on arrow edges to determine layer assignment,
 * then positions shapes in a grid (TB or LR direction).
 * Computes arrow points and viewport framing.
 */

import type {
    ExcalidrawElement,
    SimplifiedArrow,
    DiagramDirection,
} from './types.js';

// ── Constants ──

const NODE_GAP_X = 80;
const NODE_GAP_Y = 100;
const PADDING = 60;

// ── Topological Sort ──

interface LayoutNode {
    id: string;
    layer: number;
    column: number;
}

function topoSort(shapeIds: string[], arrows: SimplifiedArrow[]): LayoutNode[] {
    // Build adjacency and in-degree
    const adj = new Map<string, string[]>();
    const inDeg = new Map<string, number>();
    const idSet = new Set(shapeIds);

    for (const id of shapeIds) {
        adj.set(id, []);
        inDeg.set(id, 0);
    }

    for (const arr of arrows) {
        if (!idSet.has(arr.from) || !idSet.has(arr.to)) continue;
        adj.get(arr.from)!.push(arr.to);
        inDeg.set(arr.to, (inDeg.get(arr.to) ?? 0) + 1);
    }

    // BFS layering (Kahn's algorithm)
    const layers: string[][] = [];
    let queue = shapeIds.filter(id => (inDeg.get(id) ?? 0) === 0);

    const visited = new Set<string>();

    while (queue.length > 0) {
        layers.push([...queue]);
        const nextQueue: string[] = [];

        for (const id of queue) {
            visited.add(id);
            for (const neighbor of (adj.get(id) ?? [])) {
                const newDeg = (inDeg.get(neighbor) ?? 1) - 1;
                inDeg.set(neighbor, newDeg);
                if (newDeg === 0 && !visited.has(neighbor)) {
                    nextQueue.push(neighbor);
                }
            }
        }

        queue = nextQueue;
    }

    // Any remaining nodes (cycles) go in the last layer
    const unvisited = shapeIds.filter(id => !visited.has(id));
    if (unvisited.length > 0) {
        layers.push(unvisited);
    }

    // Assign layer + column
    const result: LayoutNode[] = [];
    for (let layer = 0; layer < layers.length; layer++) {
        for (let col = 0; col < layers[layer].length; col++) {
            result.push({ id: layers[layer][col], layer, column: col });
        }
    }

    return result;
}

// ── Position Elements ──

/**
 * Assign x/y positions to all shapes and their bound text elements.
 * Returns the positioned elements + arrow point computation.
 */
export function layoutElements(
    shapes: ExcalidrawElement[],
    arrowElements: ExcalidrawElement[],
    rawArrows: SimplifiedArrow[],
    direction: DiagramDirection,
): ExcalidrawElement[] {
    // Build maps
    const shapeMap = new Map<string, ExcalidrawElement>();
    const textMap = new Map<string, ExcalidrawElement>(); // containerId → text element
    const shapeIds: string[] = [];

    for (const el of shapes) {
        if (el.type === 'text' && el.containerId) {
            textMap.set(el.containerId, el);
        } else {
            shapeMap.set(el.id, el);
            shapeIds.push(el.id);
        }
    }

    // Topological sort
    const layout = topoSort(shapeIds, rawArrows);

    // Find max columns per layer for centering
    const layerCols = new Map<number, number>();
    for (const node of layout) {
        layerCols.set(node.layer, Math.max(layerCols.get(node.layer) ?? 0, node.column + 1));
    }
    const maxCols = Math.max(...layerCols.values(), 1);

    // Position shapes
    for (const node of layout) {
        const shape = shapeMap.get(node.id);
        if (!shape) continue;

        const colsInLayer = layerCols.get(node.layer) ?? 1;
        // Center the layer within the max width
        const layerOffset = ((maxCols - colsInLayer) / 2) * (shape.width + NODE_GAP_X);

        if (direction === 'TB') {
            shape.x = PADDING + layerOffset + node.column * (shape.width + NODE_GAP_X);
            shape.y = PADDING + node.layer * (shape.height + NODE_GAP_Y);
        } else {
            shape.x = PADDING + node.layer * (shape.width + NODE_GAP_X);
            shape.y = PADDING + layerOffset + node.column * (shape.height + NODE_GAP_Y);
        }

        // Position bound text inside shape
        const text = textMap.get(node.id);
        if (text) {
            text.x = shape.x + 5;
            text.y = shape.y + (shape.height - (text.height ?? 20)) / 2;
            text.width = shape.width - 10;
        }
    }

    // Compute arrow points
    for (const arrowEl of arrowElements) {
        if (arrowEl.type !== 'arrow') continue;

        const srcId = arrowEl.startBinding?.elementId;
        const dstId = arrowEl.endBinding?.elementId;
        if (!srcId || !dstId) continue;

        const src = shapeMap.get(srcId);
        const dst = shapeMap.get(dstId);
        if (!src || !dst) continue;

        const srcPoint = getEdgePoint(src, arrowEl.startBinding!.fixedPoint);
        const dstPoint = getEdgePoint(dst, arrowEl.endBinding!.fixedPoint);

        const dx = dstPoint.x - srcPoint.x;
        const dy = dstPoint.y - srcPoint.y;

        arrowEl.x = srcPoint.x;
        arrowEl.y = srcPoint.y;

        // Route arrow
        if (direction === 'TB') {
            if (Math.abs(dx) < 5) {
                arrowEl.points = [[0, 0], [0, dy]];
            } else {
                const midY = dy / 2;
                arrowEl.points = [[0, 0], [0, midY], [dx, midY], [dx, dy]];
            }
        } else {
            if (Math.abs(dy) < 5) {
                arrowEl.points = [[0, 0], [dx, 0]];
            } else {
                const midX = dx / 2;
                arrowEl.points = [[0, 0], [midX, 0], [midX, dy], [dx, dy]];
            }
        }

        arrowEl.width = Math.max(Math.abs(dx), 1);
        arrowEl.height = Math.max(Math.abs(dy), 1);

        // Position arrow label at midpoint
        const labelId = (arrowEl as unknown as Record<string, unknown>)['_labelId'] as string | undefined;
        if (labelId) {
            const labelEl = arrowElements.find(e => e.id === labelId);
            if (labelEl) {
                labelEl.x = srcPoint.x + dx / 2 - (labelEl.width ?? 40) / 2;
                labelEl.y = srcPoint.y + dy / 2 - (labelEl.height ?? 16) / 2;
            }
            // Clean up internal property
            delete (arrowEl as unknown as Record<string, unknown>)['_labelId'];
        }
    }

    return [...shapes, ...arrowElements];
}

// ── Edge Point Calculation ──

function getEdgePoint(
    shape: ExcalidrawElement,
    fixedPoint: [number, number],
): { x: number; y: number } {
    return {
        x: shape.x + shape.width * fixedPoint[0],
        y: shape.y + shape.height * fixedPoint[1],
    };
}

// ── Viewport ──

/**
 * Compute viewport (scroll + zoom) to frame all elements with padding.
 */
export function computeViewport(elements: ExcalidrawElement[]): {
    scrollX: number;
    scrollY: number;
    zoom: number;
} {
    if (elements.length === 0) {
        return { scrollX: 0, scrollY: 0, zoom: 1 };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const el of elements) {
        if (el.type === 'text' && el.containerId) continue; // skip bound text
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.width);
        maxY = Math.max(maxY, el.y + el.height);
    }

    const contentWidth = maxX - minX + PADDING * 2;
    const contentHeight = maxY - minY + PADDING * 2;

    // Target viewport (4:3)
    const vpWidth = 1280;
    const vpHeight = 960;

    const zoom = Math.min(
        vpWidth / contentWidth,
        vpHeight / contentHeight,
        2.0,
    );

    return {
        scrollX: -(minX - PADDING) + (vpWidth / zoom - contentWidth) / 2,
        scrollY: -(minY - PADDING) + (vpHeight / zoom - contentHeight) / 2,
        zoom: Math.max(0.1, Math.min(zoom, 2.0)),
    };
}
