/**
 * Type definitions for the diagram generation pipeline.
 *
 * Two-tier format:
 *   SimplifiedElement — what the LLM outputs / what --json accepts (label shorthand, from/to arrows)
 *   ExcalidrawElement — full Excalidraw element with all required properties
 *
 * Also includes pseudo-elements (cameraUpdate, delete, restoreCheckpoint)
 * that control pipeline behavior but are not written to the output file.
 */

// ── Rich label ──

export interface RichLabel {
  text: string;
  fontSize?: number;
  /** 1=Virgil (hand), 2=Helvetica, 3=Cascadia (code), 5=Excalifont */
  fontFamily?: number;
  strokeColor?: string;
}

export type LabelValue = string | RichLabel;

/** Normalize string or object label into RichLabel */
export function normalizeLabel(label: LabelValue): RichLabel {
  if (typeof label === 'string') {
    return { text: label };
  }
  return {
    ...label,
    fontSize: label.fontSize && label.fontSize > 0 ? label.fontSize : undefined,
  };
}

// ── Theme ──

export type DiagramTheme = 'light' | 'dark';

export interface ThemeColors {
  viewBackgroundColor: string;
  defaultStrokeColor: string;
  defaultTextColor: string;
  defaultArrowColor: string;
  arrowLabelBackground: string;
}

export const THEME_PRESETS: Record<DiagramTheme, ThemeColors> = {
  light: {
    viewBackgroundColor: '#ffffff',
    defaultStrokeColor: '#1e1e1e',
    defaultTextColor: '#1e1e1e',
    defaultArrowColor: '#495057',
    arrowLabelBackground: '#ffffff',
  },
  dark: {
    viewBackgroundColor: '#121212',
    defaultStrokeColor: '#e0e0e0',
    defaultTextColor: '#e0e0e0',
    defaultArrowColor: '#adb5bd',
    arrowLabelBackground: '#1e1e1e',
  },
};

// ── Simplified input format ──

export interface SimplifiedShape {
  type: 'rectangle' | 'ellipse' | 'diamond';
  id: string;
  label: LabelValue;
  backgroundColor?: string;
  strokeColor?: string;
  width?: number;
  height?: number;
  /** Group label — shapes with the same group are visually grouped */
  group?: string;
}

export interface SimplifiedArrow {
  type: 'arrow';
  id?: string;
  from: string;
  to: string;
  label?: string;
  strokeColor?: string;
  /** 'solid' | 'dashed' | 'dotted' */
  strokeStyle?: string;
}

export type SimplifiedElement = SimplifiedShape | SimplifiedArrow;

// ── Pseudo-elements ──

export interface CameraUpdatePseudo {
  type: 'cameraUpdate';
  scrollX?: number;
  scrollY?: number;
  zoom?: number;
}

export interface DeletePseudo {
  type: 'delete';
  targetId: string;
}

export interface RestoreCheckpointPseudo {
  type: 'restoreCheckpoint';
  name: string;
}

export type PseudoElement = CameraUpdatePseudo | DeletePseudo | RestoreCheckpointPseudo;

/** Union of all possible elements in the input JSON array */
export type DiagramInputElement = SimplifiedElement | PseudoElement;

// ── Full Excalidraw element format ──

export interface BoundElement {
  type: 'text' | 'arrow';
  id: string;
}

export interface Binding {
  elementId: string;
  focus: number;
  gap: number;
  fixedPoint: [number, number];
}

export interface ExcalidrawElement {
  id: string;
  type: 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'text' | 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: null;
  roundness: { type: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: BoundElement[] | null;
  updated: number;
  link: null;
  locked: boolean;

  // Text-specific
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  containerId?: string | null;
  originalText?: string;
  lineHeight?: number;
  baseline?: number;

  // Arrow-specific
  points?: number[][];
  elbowed?: boolean;
  startArrowhead?: string | null;
  endArrowhead?: string | null;
  startBinding?: Binding | null;
  endBinding?: Binding | null;
}

export interface ExcalidrawFile {
  type: 'excalidraw';
  version: 2;
  source: string;
  elements: ExcalidrawElement[];
  appState: {
    gridSize: number | null;
    viewBackgroundColor: string;
    scrollX?: number;
    scrollY?: number;
    zoom?: { value: number };
  };
  files: Record<string, never>;
}

// ── Style presets ──

export type DiagramStyle = 'hand-drawn' | 'clean';
export type DiagramDirection = 'TB' | 'LR';

export interface StylePresetValues {
  roughness: number;
  roundness: { type: number } | null;
  fontFamily: number;
  strokeWidth: number;
}

export const STYLE_PRESETS: Record<DiagramStyle, StylePresetValues> = {
  'hand-drawn': {
    roughness: 2,
    roundness: { type: 3 },
    fontFamily: 1, // Virgil (handwritten)
    strokeWidth: 2,
  },
  clean: {
    roughness: 0,
    roundness: { type: 3 },
    fontFamily: 2, // Helvetica (sans-serif)
    strokeWidth: 1,
  },
};

// ── Viewport overrides ──

export interface ViewportOverrides {
  scrollX?: number;
  scrollY?: number;
  zoom?: number;
}

// ── Pipeline config / result ──

export interface DiagramPipelineConfig {
  prompt: string;
  direction: DiagramDirection;
  style: DiagramStyle;
  output: string;
  theme?: DiagramTheme;

  // LLM settings (reused from exai infra)
  model?: string;
  apiKey?: string;
  /** Provider preset name or custom base URL */
  provider?: string;
  verbose?: boolean;
  useCache?: boolean;
  timeoutMs?: number;

  // Deterministic mode (skip LLM)
  jsonInput?: string; // file path or raw JSON string
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
