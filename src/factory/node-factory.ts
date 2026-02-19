/**
 * Node Factory
 *
 * Creates Excalidraw shape elements (rectangle, diamond, ellipse).
 */

import { createBaseElement } from './element-factory.js';
import type {
    ExcalidrawRectangle,
    ExcalidrawDiamond,
    ExcalidrawEllipse,
    ExcalidrawBoundElement,
} from '../types/excalidraw.js';
import type { LayoutedNode, NodeStyle } from '../types/dsl.js';

/**
 * Map DSL style to Excalidraw properties
 */
function mapStyle(style?: NodeStyle): Partial<ExcalidrawRectangle> {
    if (!style) return {};

    const result: Partial<ExcalidrawRectangle> = {
        strokeColor: style.strokeColor,
        backgroundColor: style.backgroundColor,
        strokeWidth: style.strokeWidth,
        strokeStyle: style.strokeStyle,
        fillStyle: style.fillStyle,
        opacity: style.opacity,
        roughness: style.roughness,
    };

    // roundEdges === false → sharp corners; undefined → use shape default
    if (style.roundEdges === false) {
        result.roundness = null;
    }

    return result;
}

/**
 * Create a rectangle element
 */
export function createRectangle(
    node: LayoutedNode,
    boundElements?: ExcalidrawBoundElement[],
    groupIds?: string[]
): ExcalidrawRectangle {
    const styleProps = mapStyle(node.style);

    return {
        ...createBaseElement('rectangle', node.x, node.y, node.width, node.height, {
            id: node.id,
            roundness: { type: 3 }, // Adaptive roundness
            boundElements: boundElements || null,
            groupIds: groupIds || [],
            ...styleProps,
        }),
        type: 'rectangle',
    } as ExcalidrawRectangle;
}

/**
 * Create a diamond element
 */
export function createDiamond(
    node: LayoutedNode,
    boundElements?: ExcalidrawBoundElement[],
    groupIds?: string[]
): ExcalidrawDiamond {
    const styleProps = mapStyle(node.style);

    return {
        ...createBaseElement('diamond', node.x, node.y, node.width, node.height, {
            id: node.id,
            roundness: { type: 2 }, // Proportional roundness
            boundElements: boundElements || null,
            groupIds: groupIds || [],
            ...styleProps,
        }),
        type: 'diamond',
    } as ExcalidrawDiamond;
}

/**
 * Create an ellipse element
 */
export function createEllipse(
    node: LayoutedNode,
    boundElements?: ExcalidrawBoundElement[],
    groupIds?: string[]
): ExcalidrawEllipse {
    const styleProps = mapStyle(node.style);

    return {
        ...createBaseElement('ellipse', node.x, node.y, node.width, node.height, {
            id: node.id,
            roundness: null, // Ellipses don't use roundness
            boundElements: boundElements || null,
            groupIds: groupIds || [],
            ...styleProps,
        }),
        type: 'ellipse',
    } as ExcalidrawEllipse;
}

/**
 * Create a node element based on type
 */
export function createNode(
    node: LayoutedNode,
    boundElements?: ExcalidrawBoundElement[],
    groupIds?: string[]
): ExcalidrawRectangle | ExcalidrawDiamond | ExcalidrawEllipse {
    switch (node.type) {
        case 'diamond':
            return createDiamond(node, boundElements, groupIds);
        case 'ellipse':
            return createEllipse(node, boundElements, groupIds);
        case 'database':
            // Database is rendered as rectangle with special styling
            return createRectangle(node, boundElements, groupIds);
        case 'rectangle':
        default:
            return createRectangle(node, boundElements, groupIds);
    }
}
