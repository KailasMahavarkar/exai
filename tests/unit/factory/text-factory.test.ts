import { describe, it, expect } from 'vitest';
import { createEdgeLabel } from '../../../src/factory/text-factory.js';

describe('createEdgeLabel', () => {
  it('places label at polyline midpoint by path length', () => {
    const text = createEdgeLabel(
      'SQL',
      [
        [0, 0],
        [200, 0],
        [200, 20],
      ],
      10,
      10,
      'edge-1'
    );

    // Midpoint distance is 110px from (10,10), so center is near x=120,y=10.
    // Text width for "SQL" at default size is ~36, so left x should be ~102.
    expect(text.x).toBeGreaterThan(95);
    expect(text.x).toBeLessThan(110);
    expect(text.y).toBeGreaterThan(-5);
    expect(text.y).toBeLessThan(10);
    expect(text.containerId).toBe('edge-1');
  });
});
