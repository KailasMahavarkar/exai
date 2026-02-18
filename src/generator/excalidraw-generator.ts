/**
 * Excalidraw Generator
 *
 * Assembles a complete Excalidraw file from a layouted graph.
 */

import { nanoid } from 'nanoid';
import {
  createBaseElement,
  createNode,
  createArrow,
  createArrowWithBindings,
  createText,
  createNodeLabel,
  createEdgeLabel,
  resetIndexCounter,
  createImageElement,
  createPositionedImageElement,
  createFileData,
  generateFileId,
  getImageDimensions,
} from '../factory/index.js';
import { calculateStartBinding, calculateEndBinding, computeSharedBinding } from '../layout/arrow-router.js';
import type { ExcalidrawArrowBinding } from '../types/excalidraw.js';
import type {
  ExcalidrawFile,
  ExcalidrawElement,
  ExcalidrawBoundElement,
  ExcalidrawFileData,
} from '../types/excalidraw.js';
import { DEFAULT_APP_STATE } from '../types/excalidraw.js';
import type {
  LayoutedGraph,
  LayoutedNode,
  LayoutedImage,
  ScatterConfig,
  DecorationAnchor,
} from '../types/dsl.js';

const SOURCE_URL = 'https://github.com/KailasMahavarkar/exai';

/**
 * Calculate decoration position offset
 */
function getDecorationOffset(
  anchor: DecorationAnchor,
  nodeWidth: number,
  nodeHeight: number,
  imageWidth: number,
  imageHeight: number
): { x: number; y: number } {
  const margin = 5;

  switch (anchor) {
    case 'top':
      return { x: (nodeWidth - imageWidth) / 2, y: -imageHeight - margin };
    case 'bottom':
      return { x: (nodeWidth - imageWidth) / 2, y: nodeHeight + margin };
    case 'left':
      return { x: -imageWidth - margin, y: (nodeHeight - imageHeight) / 2 };
    case 'right':
      return { x: nodeWidth + margin, y: (nodeHeight - imageHeight) / 2 };
    case 'top-left':
      return { x: -imageWidth / 2, y: -imageHeight / 2 };
    case 'top-right':
      return { x: nodeWidth - imageWidth / 2, y: -imageHeight / 2 };
    case 'bottom-left':
      return { x: -imageWidth / 2, y: nodeHeight - imageHeight / 2 };
    case 'bottom-right':
      return { x: nodeWidth - imageWidth / 2, y: nodeHeight - imageHeight / 2 };
    default:
      return { x: nodeWidth - imageWidth / 2, y: -imageHeight / 2 };
  }
}

/**
 * Generate scattered images across the canvas
 */
function generateScatteredImages(
  scatter: ScatterConfig[],
  canvasWidth: number,
  canvasHeight: number,
  elements: ExcalidrawElement[],
  files: Record<string, ExcalidrawFileData>,
  libraryPath?: string
): void {
  for (const config of scatter) {
    const width = config.width || 30;
    const height = config.height || 30;

    // Generate random positions avoiding the center area
    for (let i = 0; i < config.count; i++) {
      const x = Math.random() * (canvasWidth - width);
      const y = Math.random() * (canvasHeight - height);

      const fileId = generateFileId();
      const imageId = nanoid(10);

      // Create file data
      const fileData = createFileData(config.src, fileId, libraryPath);
      if (fileData) {
        files[fileId] = fileData;

        // Create image element
        const imageElement = createPositionedImageElement(
          { id: imageId, src: config.src, x, y, width, height },
          fileId
        );
        elements.unshift(imageElement); // Add at beginning for lower z-index
      }
    }
  }
}

function sanitizeGroupId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || nanoid(8);
}

/**
 * Generate an Excalidraw file from a layouted graph
 */
export function generateExcalidraw(graph: LayoutedGraph): ExcalidrawFile {
  // Reset index counter for fresh ordering
  resetIndexCounter();

  const elements: ExcalidrawElement[] = [];
  const files: Record<string, ExcalidrawFileData> = {};

  // Build a map of node IDs to nodes for quick lookup
  const nodeMap = new Map<string, LayoutedNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  // Build group membership map per node.
  const nodeGroupIds = new Map<string, string[]>();
  const groupIdsByRef = new Map<string, string>();
  if (graph.groups) {
    for (const group of graph.groups) {
      const normalizedGroupId = `grp-${sanitizeGroupId(group.id)}`;
      groupIdsByRef.set(group.id, normalizedGroupId);
      for (const nodeId of group.nodeIds) {
        const current = nodeGroupIds.get(nodeId) || [];
        if (!current.includes(normalizedGroupId)) {
          current.push(normalizedGroupId);
          nodeGroupIds.set(nodeId, current);
        }
      }
    }
  }

  // Draw group boundaries before nodes so they stay behind content.
  if (graph.groups) {
    for (const group of graph.groups) {
      const normalizedGroupId = groupIdsByRef.get(group.id)!;
      const groupBoxId = `group-box-${normalizedGroupId}`;
      const groupLabelId = `group-label-${normalizedGroupId}`;

      const boundary = {
        ...createBaseElement('rectangle', group.x, group.y, group.width, group.height, {
          id: groupBoxId,
          strokeColor: group.style?.strokeColor ?? '#495057',
          backgroundColor: group.style?.backgroundColor ?? 'transparent',
          strokeWidth: group.style?.strokeWidth ?? 1,
          strokeStyle: group.style?.strokeStyle ?? 'dashed',
          roughness: group.style?.roughness ?? 0,
          opacity: group.style?.opacity ?? 100,
          roundness: { type: 3 },
          groupIds: [normalizedGroupId],
          boundElements: [{ id: groupLabelId, type: 'text' }],
        }),
        type: 'rectangle' as const,
      } as ExcalidrawElement;
      elements.push(boundary);

      const groupLabel = createText(group.label, group.x + 12, group.y + 8, {
        id: groupLabelId,
        fontSize: group.style?.fontSize ?? 16,
        fontFamily: group.style?.fontFamily,
        strokeColor: group.style?.textColor ?? group.style?.strokeColor ?? '#343a40',
        textAlign: 'left',
        verticalAlign: 'top',
      });
      (groupLabel as { containerId: string | null }).containerId = groupBoxId;
      (groupLabel as { groupIds: string[] }).groupIds = [normalizedGroupId];
      elements.push(groupLabel);
    }
  }

  // Calculate bound elements for each node (only for non-image nodes)
  const nodeBoundElements = new Map<string, ExcalidrawBoundElement[]>();

  for (const node of graph.nodes) {
    if (node.type !== 'image') {
      nodeBoundElements.set(node.id, [{ id: `text-${node.id}`, type: 'text' }]);
    }
  }

  for (const edge of graph.edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    // Only bind arrows to shape nodes, not image nodes
    if (sourceNode && sourceNode.type !== 'image') {
      if (!nodeBoundElements.has(edge.source)) {
        nodeBoundElements.set(edge.source, []);
      }
      nodeBoundElements.get(edge.source)!.push({ id: edge.id, type: 'arrow' });
    }

    if (targetNode && targetNode.type !== 'image') {
      if (!nodeBoundElements.has(edge.target)) {
        nodeBoundElements.set(edge.target, []);
      }
      nodeBoundElements.get(edge.target)!.push({ id: edge.id, type: 'arrow' });
    }
  }

  // Create elements for nodes
  for (const node of graph.nodes) {
    if (node.type === 'image' && node.image) {
      // Create image element
      const fileId = generateFileId();
      const fileData = createFileData(node.image.src, fileId, graph.library);
      if (fileData) {
        files[fileId] = fileData;
        const imageElement = createImageElement(node, fileId);
        elements.push(imageElement);
      }
    } else {
      // Create shape element
      const boundElements = nodeBoundElements.get(node.id);
      const groupIds = nodeGroupIds.get(node.id);
      const shapeElement = createNode(node, boundElements, groupIds);
      elements.push(shapeElement);

      // Create text label for the node
      const textElement = createNodeLabel(node, {
        id: `text-${node.id}`,
        containerId: node.id,
        fontSize: node.style?.fontSize,
        fontFamily: node.style?.fontFamily,
        strokeColor: node.style?.textColor,
        groupIds,
      });
      elements.push(textElement);

      // Create decoration images for this node
      if (node.decorations) {
        for (const decoration of node.decorations) {
          const dims = getImageDimensions(decoration.src, decoration.width, decoration.height);
          const offset = getDecorationOffset(
            decoration.anchor,
            node.width,
            node.height,
            dims.width,
            dims.height
          );

          const fileId = generateFileId();
          const fileData = createFileData(decoration.src, fileId, graph.library);
          if (fileData) {
            files[fileId] = fileData;

            const decorationImage: LayoutedImage = {
              id: nanoid(10),
              src: decoration.src,
              x: node.x + offset.x,
              y: node.y + offset.y,
              width: dims.width,
              height: dims.height,
            };
            const imageElement = createPositionedImageElement(decorationImage, fileId);
            elements.push(imageElement);
          }
        }
      }
    }
  }

  // Pre-compute shared bindings for nodes with multiple incoming/outgoing edges.
  // When >1 edges share the same source or target, pin them all to the same
  // face-center using mode:'point' so arrows bundle at one spot instead of fanning.
  const incomingByTarget = new Map<string, LayoutedNode[]>();
  const outgoingBySource = new Map<string, LayoutedNode[]>();
  for (const edge of graph.edges) {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (src && tgt) {
      if (!incomingByTarget.has(edge.target)) incomingByTarget.set(edge.target, []);
      incomingByTarget.get(edge.target)!.push(src);
      if (!outgoingBySource.has(edge.source)) outgoingBySource.set(edge.source, []);
      outgoingBySource.get(edge.source)!.push(tgt);
    }
  }
  const sharedEndBinding = new Map<string, ExcalidrawArrowBinding>();
  const sharedStartBinding = new Map<string, ExcalidrawArrowBinding>();
  for (const [targetId, sources] of incomingByTarget) {
    if (sources.length > 1) {
      const targetNode = nodeMap.get(targetId);
      if (targetNode) sharedEndBinding.set(targetId, computeSharedBinding(targetNode, sources));
    }
  }
  for (const [sourceId, targets] of outgoingBySource) {
    if (targets.length > 1) {
      const sourceNode = nodeMap.get(sourceId);
      if (sourceNode) sharedStartBinding.set(sourceId, computeSharedBinding(sourceNode, targets));
    }
  }

  // Create arrow elements for edges
  for (const edge of graph.edges) {
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (!sourceNode || !targetNode) {
      console.warn(`Skipping edge ${edge.id}: missing source or target node`);
      continue;
    }

    // Use shared binding points when multiple edges share the same source/target
    const startBinding = sharedStartBinding.get(edge.source)
      ?? calculateStartBinding(sourceNode, targetNode).binding;
    const endBinding = sharedEndBinding.get(edge.target)
      ?? calculateEndBinding(sourceNode, targetNode).binding;

    // Create arrow with bound text if it has a label
    const boundElements = edge.label ? [{ id: `text-${edge.id}`, type: 'text' as const }] : undefined;
    const arrowElement = createArrowWithBindings(
      edge.id,
      edge.sourcePoint.x,
      edge.sourcePoint.y,
      edge.points,
      startBinding,
      endBinding,
      boundElements,
      edge.style,
    );
    elements.push(arrowElement);

    // Create text label for the edge if it has one
    if (edge.label) {
      const textElement = createEdgeLabel(
        edge.label,
        edge.points,
        edge.sourcePoint.x,
        edge.sourcePoint.y,
        edge.id,
        { id: `text-${edge.id}` }
      );
      elements.push(textElement);
    }
  }

  // Create positioned images (from @image directives)
  if (graph.images) {
    for (const image of graph.images) {
      const fileId = generateFileId();
      const fileData = createFileData(image.src, fileId, graph.library);
      if (fileData) {
        files[fileId] = fileData;
        const imageElement = createPositionedImageElement(image, fileId);
        elements.push(imageElement);
      }
    }
  }

  // Generate scattered images (from @scatter directives)
  if (graph.scatter && graph.scatter.length > 0) {
    generateScatteredImages(
      graph.scatter,
      graph.width,
      graph.height,
      elements,
      files,
      graph.library
    );
  }

  return {
    type: 'excalidraw',
    version: 2,
    source: SOURCE_URL,
    elements,
    appState: { ...DEFAULT_APP_STATE },
    files,
  };
}

/**
 * Serialize an Excalidraw file to JSON string
 */
export function serializeExcalidraw(file: ExcalidrawFile, pretty = true): string {
  return JSON.stringify(file, null, pretty ? 2 : undefined);
}

// Re-export
export { DEFAULT_APP_STATE } from '../types/excalidraw.js';
