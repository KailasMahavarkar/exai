/**
 * Type definitions for the D2 diagram pipeline.
 */

export interface SimplifiedShape {
  type: 'rectangle' | 'ellipse' | 'diamond' | 'circle' | 'oval' | 'hexagon' | 'cylinder' | 'queue' | 'package' | 'page';
  id: string;
  text: string;
  backgroundColor?: string;
  strokeColor?: string;
}

export interface SimplifiedArrow {
  type: 'arrow';
  id?: string;
  from: string;
  to: string;
  text?: string;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  strokeColor?: string;
  animated?: boolean;
}

export interface SimplifiedText {
  type: 'text';
  id?: string;
  text: string;
  position?: 'above' | 'below';
}

export interface SimplifiedZone {
  type: 'zone';
  id: string;
  label: string;
  children: string[];
  backgroundColor?: string;
  strokeColor?: string;
}

export type SimplifiedElement = SimplifiedShape | SimplifiedArrow | SimplifiedText | SimplifiedZone;

export type DiagramDirection = 'TB' | 'LR';

export interface DiagramPipelineConfig {
  prompt: string;
  direction: DiagramDirection;
  output: string;
  theme?: string | number;
  layout?: 'dagre' | 'elk';
  sketch?: boolean;
  pad?: number;

  // LLM settings
  model?: string;
  apiKey?: string;
  provider?: string;
  verbose?: boolean;
  useCache?: boolean;
  timeoutMs?: number;

  // Deterministic mode
  jsonInput?: string;
  stdin?: boolean;

  // Checkpoint
  checkpoint?: string;
  fromCheckpoint?: string;
}

export interface DiagramTimingEntry {
  label: string;
  ms: number;
}

export interface DiagramPipelineResult {
  outputPath: string;
  elementCount: number;
  timing: DiagramTimingEntry[];
  totalMs: number;
}
