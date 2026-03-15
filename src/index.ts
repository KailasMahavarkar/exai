/**
 * exai — AI-powered D2 diagram generator
 *
 * Programmatic API.
 */

// Diagram pipeline
export { runDiagramPipeline } from './diagram/pipeline.js';
export { compileToD2 } from './diagram/compiler.js';
export { renderD2, checkD2Installed } from './diagram/render.js';
export { D2_THEMES, resolveTheme } from './diagram/themes.js';
export type {
  SimplifiedShape,
  SimplifiedArrow,
  SimplifiedZone,
  SimplifiedText,
  SimplifiedElement,
  DiagramPipelineConfig,
  DiagramPipelineResult,
} from './diagram/types.js';

// Checkpoint
export {
  saveCheckpoint,
  loadCheckpoint,
  listCheckpoints,
  removeCheckpoint,
} from './diagram/checkpoint.js';

// Reference
export { PALETTES, COLOR_SCHEMES, ELEMENT_FORMAT, SIZING, TIPS } from './reference/data.js';
export { renderReference, getReferenceData } from './reference/render.js';

// Auth
export {
  loadSession,
  setKey,
  getKey,
  removeKey,
  listKeys,
  resolveApiKeyFull,
} from './auth/session.js';

// Providers
export { PROVIDER_PRESETS, resolveProvider } from './ai/contants.js';
export type { ProviderPreset } from './ai/contants.js';

// Config
export { loadConfig, CONFIG_TEMPLATE } from './ai/config.js';
export type { CliConfig, DiagramConfig } from './ai/config.js';
