/**
 * D2 themes, color presets, and font support.
 */

// D2 built-in themes (pass to --theme flag)
export const D2_THEMES: Record<string, number> = {
  // Light themes
  'neutral-default': 0,
  'neutral-grey': 1,
  'flagship-terrastruct': 3,
  'cool-classics': 4,
  'mixed-berry-blue': 5,
  'grape-soda': 6,
  'aubergine': 7,
  'colorblind-clear': 8,
  // Dark themes
  'vanilla-nitro-cola': 100,
  'dark-mauve': 101,
  'terminal': 103,
  'terminal-green': 104,
  'dark-flagship': 105,
  // Special
  'origami': 302,
  // Shortcuts
  light: 0,
  dark: 200,
};

export type D2ThemeName = keyof typeof D2_THEMES;

export function resolveTheme(input: string | number | undefined): number | undefined {
  if (input === undefined) return undefined;
  if (typeof input === 'number') return input;
  const lower = input.toLowerCase();
  if (D2_THEMES[lower] !== undefined) return D2_THEMES[lower];
  const num = parseInt(input, 10);
  if (!isNaN(num)) return num;
  return undefined;
}

// Generic color presets — role-based coloring independent of any platform
interface ColorRole {
  fill: string;
  stroke: string;
}

export interface ColorPreset {
  name: string;
  frontend: ColorRole;
  backend: ColorRole;
  database: ColorRole;
  storage: ColorRole;
  external: ColorRole;
  queue: ColorRole;
  cache: ColorRole;
  ai: ColorRole;
  zone: ColorRole;
  decision: ColorRole;
  user: ColorRole;
}

export const COLOR_PRESETS: Record<string, ColorPreset> = {
  default: {
    name: 'Default',
    frontend: { fill: '#a5d8ff', stroke: '#1971c2' },
    backend: { fill: '#d0bfff', stroke: '#7048e8' },
    database: { fill: '#b2f2bb', stroke: '#2f9e44' },
    storage: { fill: '#ffec99', stroke: '#f08c00' },
    external: { fill: '#ffc9c9', stroke: '#e03131' },
    queue: { fill: '#fff3bf', stroke: '#fab005' },
    cache: { fill: '#ffe8cc', stroke: '#fd7e14' },
    ai: { fill: '#e599f7', stroke: '#9c36b5' },
    zone: { fill: '#e9ecef', stroke: '#868e96' },
    decision: { fill: '#ffd8a8', stroke: '#e8590c' },
    user: { fill: '#e7f5ff', stroke: '#1971c2' },
  },
  ocean: {
    name: 'Ocean',
    frontend: { fill: '#a5d8ff', stroke: '#1971c2' },
    backend: { fill: '#99e9f2', stroke: '#0c8599' },
    database: { fill: '#b2f2bb', stroke: '#2f9e44' },
    storage: { fill: '#d0bfff', stroke: '#7048e8' },
    external: { fill: '#ffc9c9', stroke: '#e03131' },
    queue: { fill: '#ffec99', stroke: '#f08c00' },
    cache: { fill: '#96f2d7', stroke: '#12b886' },
    ai: { fill: '#d0bfff', stroke: '#7048e8' },
    zone: { fill: '#e9ecef', stroke: '#868e96' },
    decision: { fill: '#ffec99', stroke: '#f08c00' },
    user: { fill: '#e7f5ff', stroke: '#1971c2' },
  },
  earth: {
    name: 'Earth',
    frontend: { fill: '#ffd8a8', stroke: '#e8590c' },
    backend: { fill: '#b2f2bb', stroke: '#2f9e44' },
    database: { fill: '#d3f9d8', stroke: '#40c057' },
    storage: { fill: '#ffec99', stroke: '#f08c00' },
    external: { fill: '#ffc9c9', stroke: '#e03131' },
    queue: { fill: '#fff3bf', stroke: '#fab005' },
    cache: { fill: '#ffe8cc', stroke: '#fd7e14' },
    ai: { fill: '#e599f7', stroke: '#9c36b5' },
    zone: { fill: '#f4ede4', stroke: '#a08060' },
    decision: { fill: '#ffd8a8', stroke: '#e8590c' },
    user: { fill: '#fff4e6', stroke: '#e8590c' },
  },
  sunset: {
    name: 'Sunset',
    frontend: { fill: '#ffc9c9', stroke: '#e03131' },
    backend: { fill: '#ffd8a8', stroke: '#e8590c' },
    database: { fill: '#b2f2bb', stroke: '#2f9e44' },
    storage: { fill: '#ffec99', stroke: '#f08c00' },
    external: { fill: '#e599f7', stroke: '#9c36b5' },
    queue: { fill: '#fff3bf', stroke: '#fab005' },
    cache: { fill: '#ffe8cc', stroke: '#fd7e14' },
    ai: { fill: '#d0bfff', stroke: '#7048e8' },
    zone: { fill: '#e9ecef', stroke: '#868e96' },
    decision: { fill: '#ffd8a8', stroke: '#e8590c' },
    user: { fill: '#fff5f5', stroke: '#e03131' },
  },
  neon: {
    name: 'Neon',
    frontend: { fill: '#74b9ff', stroke: '#0984e3' },
    backend: { fill: '#a29bfe', stroke: '#6c5ce7' },
    database: { fill: '#55efc4', stroke: '#00b894' },
    storage: { fill: '#ffeaa7', stroke: '#fdcb6e' },
    external: { fill: '#fab1a0', stroke: '#e17055' },
    queue: { fill: '#81ecec', stroke: '#00cec9' },
    cache: { fill: '#ffeaa7', stroke: '#fdcb6e' },
    ai: { fill: '#a29bfe', stroke: '#6c5ce7' },
    zone: { fill: '#dfe6e9', stroke: '#636e72' },
    decision: { fill: '#ffeaa7', stroke: '#fdcb6e' },
    user: { fill: '#dfe6e9', stroke: '#b2bec3' },
  },
  mono: {
    name: 'Monochrome',
    frontend: { fill: '#dee2e6', stroke: '#495057' },
    backend: { fill: '#e9ecef', stroke: '#868e96' },
    database: { fill: '#ced4da', stroke: '#343a40' },
    storage: { fill: '#f8f9fa', stroke: '#adb5bd' },
    external: { fill: '#e9ecef', stroke: '#495057' },
    queue: { fill: '#dee2e6', stroke: '#868e96' },
    cache: { fill: '#ced4da', stroke: '#495057' },
    ai: { fill: '#e9ecef', stroke: '#343a40' },
    zone: { fill: '#f8f9fa', stroke: '#adb5bd' },
    decision: { fill: '#dee2e6', stroke: '#495057' },
    user: { fill: '#f8f9fa', stroke: '#868e96' },
  },
  candy: {
    name: 'Candy',
    frontend: { fill: '#fcc2d7', stroke: '#c2255c' },
    backend: { fill: '#d0bfff', stroke: '#7048e8' },
    database: { fill: '#96f2d7', stroke: '#12b886' },
    storage: { fill: '#ffec99', stroke: '#f08c00' },
    external: { fill: '#ffa8a8', stroke: '#c92a2a' },
    queue: { fill: '#a5d8ff', stroke: '#1971c2' },
    cache: { fill: '#ffe8cc', stroke: '#fd7e14' },
    ai: { fill: '#e599f7', stroke: '#9c36b5' },
    zone: { fill: '#fff0f6', stroke: '#c2255c' },
    decision: { fill: '#ffd8a8', stroke: '#e8590c' },
    user: { fill: '#f3f0ff', stroke: '#7048e8' },
  },
};

export function resolvePreset(name: string | undefined): ColorPreset {
  if (!name) return COLOR_PRESETS.default;
  const lower = name.toLowerCase();
  return COLOR_PRESETS[lower] ?? COLOR_PRESETS.default;
}

// Font size constants for D2 elements (D2 supports font-size on elements)
export const FONT_SIZES = {
  title: 24,
  heading: 20,
  normal: 16,
  small: 14,
  annotation: 12,
} as const;
