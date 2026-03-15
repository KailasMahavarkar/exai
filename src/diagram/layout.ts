/**
 * Auto-layout engine for diagram elements.
 *
 * Performs topological sort on arrow edges to determine layer assignment,
 * then positions shapes in a grid (TB or LR direction).
 * Computes arrow edge-intersection points and viewport framing.
 */

import type {
  ExcalidrawElement,
  SimplifiedArrow,
  SimplifiedText,
  SimplifiedZone,
  DiagramDirection,
  ViewportOverrides,
} from './types.js';

// ── Constants ──

const NODE_GAP_X = 150;
const NODE_GAP_Y = 150;
const PADDING = 80;
const ARROW_GAP = 8; // gap between arrow endpoint and shape edge

// ── Topological Sort ──

interface LayoutNode {
  id: string;
  layer: number;
  column: number;
}

function topoSort(shapeIds: string[], arrows: SimplifiedArrow[]): LayoutNode[] {
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
  let queue = shapeIds.filter((id) => (inDeg.get(id) ?? 0) === 0);
  const visited = new Set<string>();

  while (queue.length > 0) {
    layers.push([...queue]);
    const nextQueue: string[] = [];

    for (const id of queue) {
      visited.add(id);
      for (const neighbor of adj.get(id) ?? []) {
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
  const unvisited = shapeIds.filter((id) => !visited.has(id));
  if (unvisited.length > 0) {
    layers.push(unvisited);
  }

  const result: LayoutNode[] = [];
  for (let layer = 0; layer < layers.length; layer++) {
    for (let col = 0; col < layers[layer].length; col++) {
      result.push({ id: layers[layer][col], layer, column: col });
    }
  }

  return result;
}

// ── Edge Point Computation ──

/** Get center point of a shape */
function shapeCenter(shape: ExcalidrawElement): { x: number; y: number } {
  return {
    x: shape.x + shape.width / 2,
    y: shape.y + shape.height / 2,
  };
}

/**
 * Compute the point where an arrow should connect to a shape's edge,
 * given a target point the arrow is heading toward.
 * Uses geometric intersection based on shape type.
 */
function computeEdgePoint(
  shape: ExcalidrawElement,
  targetX: number,
  targetY: number
): { x: number; y: number } {
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const dx = targetX - cx;
  const dy = targetY - cy;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: cx, y: cy + shape.height / 2 };
  }

  if (shape.type === 'ellipse') {
    const a = shape.width / 2;
    const b = shape.height / 2;
    const angle = Math.atan2(dy, dx);
    return {
      x: cx + a * Math.cos(angle),
      y: cy + b * Math.sin(angle),
    };
  }

  if (shape.type === 'diamond') {
    const hw = shape.width / 2;
    const hh = shape.height / 2;
    const scale = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    return {
      x: cx + dx * scale,
      y: cy + dy * scale,
    };
  }

  // Rectangle (default)
  const hw = shape.width / 2;
  const hh = shape.height / 2;
  const angle = Math.atan2(dy, dx);
  const tanA = Math.abs(Math.tan(angle));

  if (tanA * hw <= hh) {
    // Hits left or right edge
    const signX = dx >= 0 ? 1 : -1;
    return {
      x: cx + signX * hw,
      y: cy + signX * hw * Math.tan(angle),
    };
  } else {
    // Hits top or bottom edge
    const signY = dy >= 0 ? 1 : -1;
    return {
      x: cx + (signY * hh) / Math.tan(angle),
      y: cy + signY * hh,
    };
  }
}

/**
 * Apply gap offset — move point away from shape edge by ARROW_GAP pixels.
 */
function applyGap(
  edgePoint: { x: number; y: number },
  shapeCenter: { x: number; y: number }
): { x: number; y: number } {
  const dx = edgePoint.x - shapeCenter.x;
  const dy = edgePoint.y - shapeCenter.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.001) return edgePoint;
  return {
    x: edgePoint.x + (dx / dist) * ARROW_GAP,
    y: edgePoint.y + (dy / dist) * ARROW_GAP,
  };
}

/**
 * Compute fixedPoint [0-1, 0-1] from an edge point on a shape.
 * This is the normalized position within the shape's bounding box.
 */
function computeFixedPoint(
  shape: ExcalidrawElement,
  edgePoint: { x: number; y: number }
): [number, number] {
  const fx = shape.width > 0 ? (edgePoint.x - shape.x) / shape.width : 0.5;
  const fy = shape.height > 0 ? (edgePoint.y - shape.y) / shape.height : 0.5;
  return [Math.max(0, Math.min(1, fx)), Math.max(0, Math.min(1, fy))];
}

// ── Position Elements ──

/**
 * Assign x/y positions to all shapes and their bound text elements.
 * Computes arrow points using geometric edge intersection.
 */
export function layoutElements(
  shapes: ExcalidrawElement[],
  arrowElements: ExcalidrawElement[],
  rawArrows: SimplifiedArrow[],
  direction: DiagramDirection,
  labelMap: Map<string, string>,
  zones?: SimplifiedZone[],
  standaloneTexts?: SimplifiedText[]
): ExcalidrawElement[] {
  // Build maps
  const shapeMap = new Map<string, ExcalidrawElement>();
  const textMap = new Map<string, ExcalidrawElement>();
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
    const layerOffset = ((maxCols - colsInLayer) / 2) * (shape.width + NODE_GAP_X);

    if (direction === 'TB') {
      shape.x = PADDING + layerOffset + node.column * (shape.width + NODE_GAP_X);
      shape.y = PADDING + node.layer * (shape.height + NODE_GAP_Y);
    } else {
      shape.x = PADDING + node.layer * (shape.width + NODE_GAP_X);
      shape.y = PADDING + layerOffset + node.column * (shape.height + NODE_GAP_Y);
    }

    // Position bound text inside shape (centered)
    const text = textMap.get(node.id);
    if (text) {
      text.x = shape.x + 5;
      text.y = shape.y + (shape.height - (text.height ?? 20)) / 2;
      text.width = shape.width - 10;
    }
  }

  // Compute zone rectangles based on children positions
  if (zones && zones.length > 0) {
    for (const zone of zones) {
      const children = zone.children
        .map((id) => shapeMap.get(id))
        .filter((s): s is ExcalidrawElement => s !== undefined);

      if (children.length === 0) continue;

      const minX = Math.min(...children.map((c) => c.x)) - 50;
      const minY = Math.min(...children.map((c) => c.y)) - 55;
      const maxX = Math.max(...children.map((c) => c.x + c.width)) + 60;
      const maxY = Math.max(...children.map((c) => c.y + c.height)) + 60;

      // Find the zone rectangle element and update its position/size
      const zoneEl = shapes.find((el) => el.id === zone.id);
      if (zoneEl) {
        zoneEl.x = minX;
        zoneEl.y = minY;
        zoneEl.width = maxX - minX;
        zoneEl.height = maxY - minY;
      }

      // Position zone label text at top-left
      const zoneLabelEl = shapes.find((el) => el.id === `${zone.id}-text`);
      if (zoneLabelEl) {
        zoneLabelEl.x = minX + 10;
        zoneLabelEl.y = minY + 10;
      }
    }
  }

  // Position standalone text elements
  if (standaloneTexts && standaloneTexts.length > 0) {
    // Compute bounding box of all positioned shapes (excluding zones and text)
    let minShapeX = Infinity,
      minShapeY = Infinity,
      maxShapeX = -Infinity,
      maxShapeY = -Infinity;

    for (const node of layout) {
      const shape = shapeMap.get(node.id);
      if (!shape) continue;
      minShapeX = Math.min(minShapeX, shape.x);
      minShapeY = Math.min(minShapeY, shape.y);
      maxShapeX = Math.max(maxShapeX, shape.x + shape.width);
      maxShapeY = Math.max(maxShapeY, shape.y + shape.height);
    }

    const diagramCenterX = (minShapeX + maxShapeX) / 2;

    for (const st of standaloneTexts) {
      const textEl = shapes.find((el) => el.id === st.id);
      if (!textEl) continue;

      if (st.position === 'above') {
        textEl.x = diagramCenterX - (textEl.width ?? 0) / 2;
        textEl.y = minShapeY - 50;
      } else if (st.position === 'below') {
        textEl.x = diagramCenterX - (textEl.width ?? 0) / 2;
        textEl.y = maxShapeY + 30;
      } else if (st.x != null || st.y != null) {
        // Use provided coordinates (already set during expandLabels)
      } else {
        // Default: place at top-left of diagram
        textEl.x = minShapeX;
        textEl.y = minShapeY - 50;
      }
    }
  }

  // Compute arrow points using edge intersection
  for (const arrowEl of arrowElements) {
    if (arrowEl.type !== 'arrow') continue;

    const srcId = arrowEl.startBinding?.elementId;
    const dstId = arrowEl.endBinding?.elementId;
    if (!srcId || !dstId) continue;

    const src = shapeMap.get(srcId);
    const dst = shapeMap.get(dstId);
    if (!src || !dst) continue;

    const srcCenter = shapeCenter(src);
    const dstCenter = shapeCenter(dst);

    // Compute edge intersection points (arrow exits src toward dst, enters dst from src)
    const srcEdge = computeEdgePoint(src, dstCenter.x, dstCenter.y);
    const dstEdge = computeEdgePoint(dst, srcCenter.x, srcCenter.y);

    // Apply gap
    const startPt = applyGap(srcEdge, srcCenter);
    const endPt = applyGap(dstEdge, dstCenter);

    // Update fixedPoints on bindings to match actual edge positions
    if (arrowEl.startBinding) {
      arrowEl.startBinding.fixedPoint = computeFixedPoint(src, srcEdge);
    }
    if (arrowEl.endBinding) {
      arrowEl.endBinding.fixedPoint = computeFixedPoint(dst, dstEdge);
    }

    const dx = endPt.x - startPt.x;
    const dy = endPt.y - startPt.y;

    // Arrow position is the start point
    arrowEl.x = startPt.x;
    arrowEl.y = startPt.y;

    // Arrow points are relative to (x, y)
    arrowEl.points = [
      [0, 0],
      [dx, dy],
    ];

    arrowEl.width = Math.max(Math.abs(dx), 1);
    arrowEl.height = Math.max(Math.abs(dy), 1);

    // Position arrow label at arrow midpoint (matches Excalidraw's getBoundTextElementPosition).
    // For 2-point arrows: midpoint = arrow.x + points[1][0]/2, arrow.y + points[1][1]/2
    // Then center text: subtract textWidth/2 and textHeight/2
    const labelId = labelMap.get(arrowEl.id);
    if (labelId) {
      const labelEl = arrowElements.find((e) => e.id === labelId);
      if (labelEl) {
        const pts = arrowEl.points as number[][];
        const midIdx = Math.floor(pts.length / 2);
        let midX: number, midY: number;

        if (pts.length % 2 === 1) {
          // Odd points: use center point
          midX = arrowEl.x + pts[midIdx][0];
          midY = arrowEl.y + pts[midIdx][1];
        } else {
          // Even points (our default 2-point): midpoint of center segment
          const p1 = pts[midIdx - 1];
          const p2 = pts[midIdx];
          midX = arrowEl.x + (p1[0] + p2[0]) / 2;
          midY = arrowEl.y + (p1[1] + p2[1]) / 2;
        }

        labelEl.x = midX - (labelEl.width ?? 40) / 2;
        labelEl.y = midY - (labelEl.height ?? 16) / 2;
      }
    }
  }

  return [...shapes, ...arrowElements];
}

// ── Viewport ──

/**
 * Compute viewport (scroll + zoom) to frame all elements with padding.
 */
export function computeViewport(
  elements: ExcalidrawElement[],
  overrides?: ViewportOverrides
): {
  scrollX: number;
  scrollY: number;
  zoom: number;
} {
  if (elements.length === 0) {
    return { scrollX: 0, scrollY: 0, zoom: 1 };
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const el of elements) {
    if (el.type === 'text' && el.containerId) continue;
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }

  const contentWidth = maxX - minX + PADDING * 2;
  const contentHeight = maxY - minY + PADDING * 2;

  const vpWidth = 1280;
  const vpHeight = 960;

  const autoZoom = Math.min(vpWidth / contentWidth, vpHeight / contentHeight, 2.0);
  const zoom = overrides?.zoom ?? Math.max(0.1, Math.min(autoZoom, 2.0));

  return {
    scrollX: overrides?.scrollX ?? -(minX - PADDING) + (vpWidth / zoom - contentWidth) / 2,
    scrollY: overrides?.scrollY ?? -(minY - PADDING) + (vpHeight / zoom - contentHeight) / 2,
    zoom,
  };
}
