import { describe, it, expect } from 'vitest';
import { generateExcalidraw } from '../../../src/generator/excalidraw-generator.js';
import type { LayoutedGraph } from '../../../src/types/dsl.js';
import { DEFAULT_LAYOUT_OPTIONS } from '../../../src/types/dsl.js';

describe('generateExcalidraw', () => {
  it('binds node text to shape and preserves node-level font style', () => {
    const graph: LayoutedGraph = {
      nodes: [
        {
          id: 'api',
          type: 'rectangle',
          label: 'API Gateway',
          x: 120,
          y: 100,
          width: 180,
          height: 80,
          style: {
            fontSize: 18,
            fontFamily: 2,
            textColor: '#111111',
          },
        },
        {
          id: 'db',
          type: 'database',
          label: 'Orders DB',
          x: 420,
          y: 100,
          width: 160,
          height: 90,
        },
      ],
      edges: [
        {
          id: 'edge-api-db',
          source: 'api',
          target: 'db',
          label: 'writes',
          points: [
            [0, 0],
            [120, 0],
          ],
          sourcePoint: { x: 300, y: 140 },
          targetPoint: { x: 420, y: 140 },
        },
      ],
      groups: [
        {
          id: 'core',
          label: 'Core Tier',
          nodeIds: ['api', 'db'],
          x: 90,
          y: 50,
          width: 520,
          height: 220,
          style: {
            strokeColor: '#495057',
            strokeStyle: 'dashed',
          },
        },
      ],
      options: { ...DEFAULT_LAYOUT_OPTIONS },
      width: 900,
      height: 500,
    };

    const file = generateExcalidraw(graph);

    const apiShape = file.elements.find((el) => el.id === 'api');
    const apiText = file.elements.find((el) => el.id === 'text-api');
    const groupBox = file.elements.find((el) => el.id === 'group-box-grp-core');
    const groupLabel = file.elements.find((el) => el.id === 'group-label-grp-core');

    expect(apiShape).toBeDefined();
    expect(apiText).toBeDefined();
    expect(groupBox).toBeDefined();
    expect(groupLabel).toBeDefined();

    const shapeBound = apiShape as { boundElements?: Array<{ id: string; type: string }> | null; groupIds?: string[] };
    expect(shapeBound.boundElements?.some((b) => b.id === 'text-api' && b.type === 'text')).toBe(true);
    expect(shapeBound.groupIds).toContain('grp-core');

    const textEl = apiText as {
      containerId?: string | null;
      fontSize?: number;
      fontFamily?: number;
      strokeColor?: string;
      groupIds?: string[];
    };
    expect(textEl.containerId).toBe('api');
    expect(textEl.fontSize).toBe(18);
    expect(textEl.fontFamily).toBe(2);
    expect(textEl.strokeColor).toBe('#111111');
    expect(textEl.groupIds).toContain('grp-core');

    const groupLabelEl = groupLabel as { containerId?: string | null };
    expect(groupLabelEl.containerId).toBe('group-box-grp-core');
  });
});
