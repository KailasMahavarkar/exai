/**
 * Reference data for diagram elements.
 *
 * Color palettes, element format specs, sizing rules, and drawing tips.
 * Used by the `reference` command and available for import by prompts.ts.
 */

// ── Color Palettes ──

export const PALETTES = {
  primary: {
    blue: '#a5d8ff',
    green: '#b2f2bb',
    red: '#ffc9c9',
    purple: '#d0bfff',
    yellow: '#ffec99',
    orange: '#ffd8a8',
    gray: '#e9ecef',
    cyan: '#99e9f2',
    pink: '#fcc2d7',
    teal: '#96f2d7',
  },
  pastel: {
    blue: '#e7f5ff',
    green: '#ebfbee',
    red: '#fff5f5',
    purple: '#f3f0ff',
    yellow: '#fff9db',
    orange: '#fff4e6',
  },
  dark: {
    background: '#121212',
    surface: '#1e1e1e',
    fills: ['#2d3436', '#34495e', '#2c3e50', '#1e272e'],
    accents: ['#74b9ff', '#a29bfe', '#81ecec', '#fab1a0', '#ffeaa7', '#55efc4'],
    borders: ['#dfe6e9', '#b2bec3'],
  },
  strokes: {
    blue: '#1971c2',
    green: '#2f9e44',
    red: '#e03131',
    purple: '#7048e8',
    yellow: '#f08c00',
    orange: '#fd7e14',
    gray: '#868e96',
  },
  semantic: {
    frontend: { bg: '#a5d8ff', stroke: '#1971c2' },
    backend: { bg: '#d0bfff', stroke: '#7048e8' },
    database: { bg: '#b2f2bb', stroke: '#2f9e44' },
    storage: { bg: '#ffec99', stroke: '#f08c00' },
    ai: { bg: '#e599f7', stroke: '#9c36b5' },
    external: { bg: '#ffc9c9', stroke: '#e03131' },
    orchestration: { bg: '#ffa8a8', stroke: '#c92a2a' },
    queue: { bg: '#fff3bf', stroke: '#fab005' },
    cache: { bg: '#ffe8cc', stroke: '#fd7e14' },
    user: { bg: '#e7f5ff', stroke: '#1971c2' },
  },
} as const;

// ── Color Schemes ──

export const COLOR_SCHEMES = {
  ocean: {
    primary: { bg: '#a5d8ff', stroke: '#1971c2' },
    secondary: { bg: '#99e9f2', stroke: '#0c8599' },
    accent: { bg: '#d0bfff', stroke: '#7048e8' },
    muted: { bg: '#e9ecef', stroke: '#868e96' },
    success: { bg: '#b2f2bb', stroke: '#2f9e44' },
    warning: { bg: '#ffec99', stroke: '#f08c00' },
    danger: { bg: '#ffc9c9', stroke: '#e03131' },
  },
  earth: {
    primary: { bg: '#ffd8a8', stroke: '#e8590c' },
    secondary: { bg: '#b2f2bb', stroke: '#2f9e44' },
    accent: { bg: '#ffec99', stroke: '#f08c00' },
    muted: { bg: '#e9ecef', stroke: '#868e96' },
    success: { bg: '#d3f9d8', stroke: '#40c057' },
    warning: { bg: '#fff3bf', stroke: '#fab005' },
    danger: { bg: '#ffc9c9', stroke: '#e03131' },
  },
  sunset: {
    primary: { bg: '#ffc9c9', stroke: '#e03131' },
    secondary: { bg: '#ffd8a8', stroke: '#e8590c' },
    accent: { bg: '#ffec99', stroke: '#f08c00' },
    muted: { bg: '#e9ecef', stroke: '#868e96' },
    success: { bg: '#b2f2bb', stroke: '#2f9e44' },
    warning: { bg: '#fff3bf', stroke: '#fab005' },
    danger: { bg: '#e599f7', stroke: '#9c36b5' },
  },
  neon: {
    primary: { bg: '#74b9ff', stroke: '#0984e3' },
    secondary: { bg: '#81ecec', stroke: '#00cec9' },
    accent: { bg: '#a29bfe', stroke: '#6c5ce7' },
    muted: { bg: '#dfe6e9', stroke: '#636e72' },
    success: { bg: '#55efc4', stroke: '#00b894' },
    warning: { bg: '#ffeaa7', stroke: '#fdcb6e' },
    danger: { bg: '#fab1a0', stroke: '#e17055' },
  },
  mono: {
    primary: { bg: '#dee2e6', stroke: '#495057' },
    secondary: { bg: '#e9ecef', stroke: '#868e96' },
    accent: { bg: '#ced4da', stroke: '#343a40' },
    muted: { bg: '#f8f9fa', stroke: '#adb5bd' },
    success: { bg: '#dee2e6', stroke: '#495057' },
    warning: { bg: '#e9ecef', stroke: '#868e96' },
    danger: { bg: '#ced4da', stroke: '#343a40' },
  },
  candy: {
    primary: { bg: '#fcc2d7', stroke: '#c2255c' },
    secondary: { bg: '#d0bfff', stroke: '#7048e8' },
    accent: { bg: '#a5d8ff', stroke: '#1971c2' },
    muted: { bg: '#e9ecef', stroke: '#868e96' },
    success: { bg: '#96f2d7', stroke: '#12b886' },
    warning: { bg: '#ffec99', stroke: '#f08c00' },
    danger: { bg: '#ffa8a8', stroke: '#c92a2a' },
  },
} as const;

// ── Element Format ──

export const ELEMENT_FORMAT = {
  shapes: [
    { type: 'rectangle', use: 'Services, APIs, components (default)' },
    { type: 'circle', use: 'Users, actors, external entities' },
    { type: 'diamond', use: 'Decision points, conditions, routers' },
    { type: 'oval', use: 'Start/end points, events, triggers' },
    { type: 'hexagon', use: 'Processes, workers, transformations' },
    { type: 'cylinder', use: 'Databases, data stores, persistent storage' },
    { type: 'queue', use: 'Message queues, buffers, streams' },
    { type: 'package', use: 'Modules, packages, libraries' },
    { type: 'page', use: 'Documents, configs, files' },
  ],
  requiredFields: {
    shape: ['type', 'id', 'text'],
    arrow: ['type ("arrow")', 'from (source id)', 'to (target id)'],
  },
  optionalFields: {
    shape: ['backgroundColor', 'strokeColor', 'fontSize'],
    arrow: ['text', 'strokeColor', 'strokeStyle', 'animated'],
  },
  fontSizes: {
    title: '24 — titles and headings',
    normal: '16 — standard labels (default)',
    annotation: '12 — small annotations and notes',
  },
  fonts: 'D2 uses system fonts. Use style.font-size on elements to control size.',
  pseudoElements: [
    { type: 'zone', fields: 'id, label, children[]', use: 'Visual grouping of shapes' },
    { type: 'text', fields: 'text, position (above/below)', use: 'Title or footer text' },
  ],
} as const;

// ── Sizing Rules ──

export const SIZING = {
  note: 'D2 handles layout and sizing automatically. Use font-size to control text size.',
  defaultFontSize: 16,
  titleFontSize: 24,
  annotationFontSize: 12,
} as const;

// ── Tips ──

export const TIPS = [
  'Use short, descriptive IDs in kebab-case (e.g., "api-gateway", "auth-service")',
  'Keep labels concise (1-3 words) for readability',
  'Use arrows to show data flow direction, not just connections',
  'Group related shapes with the same `group` string',
  'Use dashed strokeStyle for optional or async connections',
  'Choose background colors based on component type (see semantic palette)',
  'For dark mode, use muted fills (#2d3436) with bright accent borders',
  'Use rich labels ({text, fontSize}) for emphasis on key components',
  'The cameraUpdate pseudo-element can zoom out for large diagrams (zoom: 0.5)',
  'Use --from-checkpoint to iteratively build complex diagrams across sessions',
] as const;
