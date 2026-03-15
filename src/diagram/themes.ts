/**
 * D2 theme presets.
 */

export const D2_THEMES: Record<string, number> = {
  'neutral-default': 0,
  'neutral-grey': 1,
  'flagship-terrastruct': 3,
  'cool-classics': 4,
  'mixed-berry-blue': 5,
  'grape-soda': 6,
  'aubergine': 7,
  'colorblind-clear': 8,
  'vanilla-nitro-cola': 100,
  'dark-mauve': 101,
  'terminal': 103,
  'terminal-green': 104,
  'dark-flagship': 105,
  'origami': 302,
  // Shortcuts
  'light': 0,
  'dark': 200,
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
