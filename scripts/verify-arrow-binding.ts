/**
 * Quick verification script for shared arrow binding logic.
 * Run with: bun scripts/verify-arrow-binding.ts
 *
 * Tests:
 *  1. Multi-fan-in  → all arrows hitting the same target share one endBinding point
 *  2. Multi-fan-out → all arrows leaving the same source share one startBinding point
 *  3. Single edge   → uses orbit mode (unchanged behaviour)
 */

import { generateExcalidraw } from '../src/generator/excalidraw-generator.js';
import type { LayoutedGraph, LayoutedNode, LayoutedEdge } from '../src/types/dsl.js';
import type { ExcalidrawArrow } from '../src/types/excalidraw.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(id: string, x: number, y: number): LayoutedNode {
  return {
    id,
    type: 'rectangle',
    label: id,
    x,
    y,
    width: 120,
    height: 60,
  };
}

function makeEdge(id: string, source: string, target: string): LayoutedEdge {
  return {
    id,
    source,
    target,
    points: [[0, 0], [60, 60]],
    sourcePoint: { x: 0, y: 0 },
    targetPoint: { x: 60, y: 60 },
  };
}

function makeGraph(nodes: LayoutedNode[], edges: LayoutedEdge[]): LayoutedGraph {
  return {
    nodes,
    edges,
    options: { algorithm: 'layered', direction: 'TB', nodeSpacing: 50, rankSpacing: 80, padding: 50 },
    width: 800,
    height: 600,
  };
}

function getArrows(graph: LayoutedGraph): ExcalidrawArrow[] {
  const file = generateExcalidraw(graph);
  return file.elements.filter((e): e is ExcalidrawArrow => e.type === 'arrow');
}

// ── Test 1: Fan-in — 3 sources → 1 target ───────────────────────────────────

function testFanIn() {
  const hub = makeNode('hub', 300, 300);
  const a   = makeNode('a',   0,   0);
  const b   = makeNode('b',   300, 0);
  const c   = makeNode('c',   600, 0);

  const graph = makeGraph(
    [hub, a, b, c],
    [
      makeEdge('e1', 'a', 'hub'),
      makeEdge('e2', 'b', 'hub'),
      makeEdge('e3', 'c', 'hub'),
    ],
  );

  const arrows = getArrows(graph);
  const endPoints = arrows.map(a => JSON.stringify(a.endBinding?.fixedPoint));
  const allSame = new Set(endPoints).size === 1;
  const allPointMode = arrows.every(a => a.endBinding?.mode === 'point');

  console.log('\n── Test 1: Fan-in (3 → 1) ───────────────────────────────────');
  for (const arrow of arrows) {
    const eb = arrow.endBinding;
    console.log(`  edge ${arrow.id}  endBinding: mode=${eb?.mode}  fixedPoint=${JSON.stringify(eb?.fixedPoint)}`);
  }
  console.log(`  ✔ all share same endBinding point : ${allSame}`);
  console.log(`  ✔ all use mode:'point'            : ${allPointMode}`);
  return allSame && allPointMode;
}

// ── Test 2: Fan-out — 1 source → 3 targets ──────────────────────────────────

function testFanOut() {
  const hub = makeNode('hub', 300, 0);
  const a   = makeNode('a',   0,   300);
  const b   = makeNode('b',   300, 300);
  const c   = makeNode('c',   600, 300);

  const graph = makeGraph(
    [hub, a, b, c],
    [
      makeEdge('e1', 'hub', 'a'),
      makeEdge('e2', 'hub', 'b'),
      makeEdge('e3', 'hub', 'c'),
    ],
  );

  const arrows = getArrows(graph);
  const startPoints = arrows.map(a => JSON.stringify(a.startBinding?.fixedPoint));
  const allSame = new Set(startPoints).size === 1;
  const allPointMode = arrows.every(a => a.startBinding?.mode === 'point');

  console.log('\n── Test 2: Fan-out (1 → 3) ──────────────────────────────────');
  for (const arrow of arrows) {
    const sb = arrow.startBinding;
    console.log(`  edge ${arrow.id}  startBinding: mode=${sb?.mode}  fixedPoint=${JSON.stringify(sb?.fixedPoint)}`);
  }
  console.log(`  ✔ all share same startBinding point : ${allSame}`);
  console.log(`  ✔ all use mode:'point'              : ${allPointMode}`);
  return allSame && allPointMode;
}

// ── Test 3: Single edge — should stay on orbit ───────────────────────────────

function testSingleEdge() {
  const a = makeNode('a', 0,   0);
  const b = makeNode('b', 0, 200);

  const graph = makeGraph(
    [a, b],
    [makeEdge('e1', 'a', 'b')],
  );

  const arrows = getArrows(graph);
  const arrow = arrows[0];
  const startOrbit = arrow.startBinding?.mode === 'orbit';
  const endOrbit   = arrow.endBinding?.mode   === 'orbit';

  console.log('\n── Test 3: Single edge (orbit unchanged) ────────────────────');
  console.log(`  edge e1  startBinding.mode=${arrow.startBinding?.mode}  endBinding.mode=${arrow.endBinding?.mode}`);
  console.log(`  ✔ startBinding stays orbit : ${startOrbit}`);
  console.log(`  ✔ endBinding stays orbit   : ${endOrbit}`);
  return startOrbit && endOrbit;
}

// ── Run all tests ─────────────────────────────────────────────────────────────

const r1 = testFanIn();
const r2 = testFanOut();
const r3 = testSingleEdge();

console.log('\n═══════════════════════════════════════════════════════════════');
const all = r1 && r2 && r3;
console.log(all ? '✅  All tests passed' : '❌  Some tests failed');
console.log('═══════════════════════════════════════════════════════════════\n');
process.exit(all ? 0 : 1);
