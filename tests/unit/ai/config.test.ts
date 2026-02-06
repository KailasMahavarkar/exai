import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadConfig, CONFIG_TEMPLATE } from '../../../src/ai/config.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

// ── Helpers ─────────────────────────────────────────────────────────────────

const TEST_DIR = join(tmpdir(), 'excalidraw-config-test-' + Date.now());

function writeConfig(filename: string, content: unknown): string {
  mkdirSync(TEST_DIR, { recursive: true });
  const filepath = join(TEST_DIR, filename);
  writeFileSync(filepath, typeof content === 'string' ? content : JSON.stringify(content), 'utf-8');
  return filepath;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
    vi.restoreAllMocks();
  });

  // ── File loading ──────────────────────────────────────────────────────────

  it('throws if config file does not exist', () => {
    expect(() => loadConfig('/nonexistent/path/config.json'))
      .toThrow('Config file not found');
  });

  it('throws on invalid JSON', () => {
    const path = writeConfig('bad.json', '{ not valid json }');
    expect(() => loadConfig(path)).toThrow('Invalid JSON');
  });

  it('throws if config is an array', () => {
    const path = writeConfig('array.json', [1, 2, 3]);
    expect(() => loadConfig(path)).toThrow('must contain a JSON object');
  });

  it('throws if config is a string', () => {
    const path = writeConfig('string.json', '"hello"');
    expect(() => loadConfig(path)).toThrow('must contain a JSON object');
  });

  it('loads a valid empty config', () => {
    const path = writeConfig('empty.json', {});
    const config = loadConfig(path);
    expect(config).toEqual({});
  });

  // ── String fields ─────────────────────────────────────────────────────────

  it('loads all string fields', () => {
    const path = writeConfig('strings.json', {
      model: 'gpt-4',
      filterModel: 'gpt-3.5-turbo',
      apiKey: 'sk-test',
      format: 'json',
      output: 'out.excalidraw',
      direction: 'LR',
      compressMode: 'aggressive',
    });
    const config = loadConfig(path);
    expect(config.model).toBe('gpt-4');
    expect(config.filterModel).toBe('gpt-3.5-turbo');
    expect(config.apiKey).toBe('sk-test');
    expect(config.format).toBe('json');
    expect(config.output).toBe('out.excalidraw');
    expect(config.direction).toBe('LR');
    expect(config.compressMode).toBe('aggressive');
  });

  // ── Number fields ─────────────────────────────────────────────────────────

  it('loads number fields', () => {
    const path = writeConfig('numbers.json', {
      temperature: 0.7,
      spacing: 80,
      maxFileSize: 131072,
      maxDepth: 10,
      maxTreeItems: 2000,
      cacheTtlDays: 14,
      cacheMaxEntries: 200,
    });
    const config = loadConfig(path);
    expect(config.temperature).toBe(0.7);
    expect(config.spacing).toBe(80);
    expect(config.maxFileSize).toBe(131072);
    expect(config.maxDepth).toBe(10);
    expect(config.maxTreeItems).toBe(2000);
    expect(config.cacheTtlDays).toBe(14);
    expect(config.cacheMaxEntries).toBe(200);
  });

  // ── Boolean fields ────────────────────────────────────────────────────────

  it('loads boolean fields', () => {
    const path = writeConfig('booleans.json', {
      allowTestFiles: true,
      compress: false,
      cache: true,
      verbose: true,
    });
    const config = loadConfig(path);
    expect(config.allowTestFiles).toBe(true);
    expect(config.compress).toBe(false);
    expect(config.cache).toBe(true);
    expect(config.verbose).toBe(true);
  });

  // ── Array fields ──────────────────────────────────────────────────────────

  it('loads array fields', () => {
    const path = writeConfig('arrays.json', {
      exclude: ['dist', 'coverage'],
    });
    const config = loadConfig(path);
    expect(config.exclude).toEqual(['dist', 'coverage']);
  });

  // ── Context path resolution ───────────────────────────────────────────────

  it('resolves context paths relative to config file directory', () => {
    const path = writeConfig('ctx.json', {
      context: ['./src', './lib'],
    });
    const config = loadConfig(path);
    expect(config.context).toEqual([
      resolve(TEST_DIR, './src'),
      resolve(TEST_DIR, './lib'),
    ]);
  });

  it('preserves absolute context paths', () => {
    const absPath = resolve('/absolute/path/to/src');
    const path = writeConfig('abs-ctx.json', {
      context: [absPath],
    });
    const config = loadConfig(path);
    expect(config.context![0]).toBe(absPath);
  });

  // ── compressOptions (nested object) ───────────────────────────────────────

  it('loads compressOptions with all fields', () => {
    const path = writeConfig('compress-opts.json', {
      compressOptions: {
        removeComments: false,
        minifyWhitespace: true,
        extractSignaturesOnly: true,
        maxFileLines: 50,
        preserveImports: false,
        preserveExports: false,
        preserveTypes: true,
        preserveFunctionSignatures: false,
      },
    });
    const config = loadConfig(path);
    expect(config.compressOptions).toEqual({
      removeComments: false,
      minifyWhitespace: true,
      extractSignaturesOnly: true,
      maxFileLines: 50,
      preserveImports: false,
      preserveExports: false,
      preserveTypes: true,
      preserveFunctionSignatures: false,
    });
  });

  it('loads compressOptions with partial fields', () => {
    const path = writeConfig('compress-partial.json', {
      compressOptions: { maxFileLines: 25 },
    });
    const config = loadConfig(path);
    expect(config.compressOptions).toEqual({ maxFileLines: 25 });
  });

  it('throws if compressOptions is not an object', () => {
    const path = writeConfig('bad-compress-opts.json', { compressOptions: 'balanced' });
    expect(() => loadConfig(path)).toThrow('"compressOptions" must be an object');
  });

  it('throws if compressOptions has wrong types', () => {
    const path = writeConfig('bad-compress-field.json', {
      compressOptions: { maxFileLines: 'many' },
    });
    expect(() => loadConfig(path)).toThrow('"maxFileLines" must be a number');
  });

  it('warns about unknown compressOptions keys', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const path = writeConfig('unknown-compress.json', {
      compressOptions: { maxFileLines: 50, unknownOpt: true },
    });
    loadConfig(path);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('unknownOpt'));
  });

  // ── Type validation ───────────────────────────────────────────────────────

  it('throws if model is not a string', () => {
    const path = writeConfig('bad-model.json', { model: 123 });
    expect(() => loadConfig(path)).toThrow('"model" must be a string');
  });

  it('throws if filterModel is not a string', () => {
    const path = writeConfig('bad-filter-model.json', { filterModel: 123 });
    expect(() => loadConfig(path)).toThrow('"filterModel" must be a string');
  });

  it('throws if temperature is not a number', () => {
    const path = writeConfig('bad-temp.json', { temperature: 'hot' });
    expect(() => loadConfig(path)).toThrow('"temperature" must be a number');
  });

  it('throws if compress is not a boolean', () => {
    const path = writeConfig('bad-compress.json', { compress: 'yes' });
    expect(() => loadConfig(path)).toThrow('"compress" must be a boolean');
  });

  it('throws if context is not an array of strings', () => {
    const path = writeConfig('bad-ctx.json', { context: [1, 2] });
    expect(() => loadConfig(path)).toThrow('"context" must be an array of strings');
  });

  it('throws if exclude is not an array of strings', () => {
    const path = writeConfig('bad-excl.json', { exclude: 'dist' });
    expect(() => loadConfig(path)).toThrow('"exclude" must be an array of strings');
  });

  it('throws if spacing is not a number', () => {
    const path = writeConfig('bad-spacing.json', { spacing: '50' });
    expect(() => loadConfig(path)).toThrow('"spacing" must be a number');
  });

  it('throws if maxFileSize is not a number', () => {
    const path = writeConfig('bad-mfs.json', { maxFileSize: '64K' });
    expect(() => loadConfig(path)).toThrow('"maxFileSize" must be a number');
  });

  it('throws if maxDepth is not a number', () => {
    const path = writeConfig('bad-md.json', { maxDepth: true });
    expect(() => loadConfig(path)).toThrow('"maxDepth" must be a number');
  });

  it('throws if cacheTtlDays is not a number', () => {
    const path = writeConfig('bad-ttl.json', { cacheTtlDays: '7' });
    expect(() => loadConfig(path)).toThrow('"cacheTtlDays" must be a number');
  });

  // ── Unknown keys ──────────────────────────────────────────────────────────

  it('warns about unknown keys but still loads config', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const path = writeConfig('unknown.json', { model: 'gpt-4', unknownKey: true });
    const config = loadConfig(path);
    expect(config.model).toBe('gpt-4');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('unknownKey'));
  });

  // ── Full config ───────────────────────────────────────────────────────────

  it('loads a full config with all fields', () => {
    const path = writeConfig('full.json', {
      model: 'moonshotai/kimi-k2.5',
      filterModel: 'moonshotai/kimi-k2.5',
      apiKey: 'sk-or-v1-test',
      temperature: 0,
      format: 'dsl',
      output: 'flowchart.excalidraw',
      direction: 'TB',
      spacing: 50,
      context: ['./src'],
      exclude: ['dist', 'coverage'],
      allowTestFiles: false,
      maxFileSize: 65536,
      maxDepth: 6,
      maxTreeItems: 1000,
      compress: true,
      compressMode: 'balanced',
      compressOptions: {
        removeComments: true,
        maxFileLines: 100,
      },
      cache: true,
      cacheTtlDays: 7,
      cacheMaxEntries: 100,
      verbose: false,
    });
    const config = loadConfig(path);
    expect(config.model).toBe('moonshotai/kimi-k2.5');
    expect(config.filterModel).toBe('moonshotai/kimi-k2.5');
    expect(config.apiKey).toBe('sk-or-v1-test');
    expect(config.temperature).toBe(0);
    expect(config.format).toBe('dsl');
    expect(config.output).toBe('flowchart.excalidraw');
    expect(config.direction).toBe('TB');
    expect(config.spacing).toBe(50);
    expect(config.context).toEqual([resolve(TEST_DIR, './src')]);
    expect(config.exclude).toEqual(['dist', 'coverage']);
    expect(config.allowTestFiles).toBe(false);
    expect(config.maxFileSize).toBe(65536);
    expect(config.maxDepth).toBe(6);
    expect(config.maxTreeItems).toBe(1000);
    expect(config.compress).toBe(true);
    expect(config.compressMode).toBe('balanced');
    expect(config.compressOptions).toEqual({ removeComments: true, maxFileLines: 100 });
    expect(config.cache).toBe(true);
    expect(config.cacheTtlDays).toBe(7);
    expect(config.cacheMaxEntries).toBe(100);
    expect(config.verbose).toBe(false);
  });
});

// ── CONFIG_TEMPLATE ─────────────────────────────────────────────────────────

describe('CONFIG_TEMPLATE', () => {
  it('has expected default values', () => {
    expect(CONFIG_TEMPLATE.model).toBe('moonshotai/kimi-k2.5');
    expect(CONFIG_TEMPLATE.filterModel).toBe('moonshotai/kimi-k2.5');
    expect(CONFIG_TEMPLATE.temperature).toBe(0);
    expect(CONFIG_TEMPLATE.format).toBe('dsl');
    expect(CONFIG_TEMPLATE.compress).toBe(true);
    expect(CONFIG_TEMPLATE.cache).toBe(true);
    expect(CONFIG_TEMPLATE.verbose).toBe(false);
    expect(CONFIG_TEMPLATE.maxFileSize).toBe(65536);
    expect(CONFIG_TEMPLATE.maxDepth).toBe(6);
    expect(CONFIG_TEMPLATE.maxTreeItems).toBe(1000);
    expect(CONFIG_TEMPLATE.cacheTtlDays).toBe(7);
    expect(CONFIG_TEMPLATE.cacheMaxEntries).toBe(100);
    expect(CONFIG_TEMPLATE.compressOptions).toBeDefined();
    expect(CONFIG_TEMPLATE.compressOptions!.maxFileLines).toBe(100);
  });

  it('is a valid config shape (loadable after serialization)', () => {
    const path = writeConfig('template.json', CONFIG_TEMPLATE);
    const config = loadConfig(path);
    expect(config.model).toBe(CONFIG_TEMPLATE.model);
    expect(config.filterModel).toBe(CONFIG_TEMPLATE.filterModel);
    expect(config.format).toBe(CONFIG_TEMPLATE.format);
    expect(config.maxFileSize).toBe(CONFIG_TEMPLATE.maxFileSize);
    expect(config.cacheTtlDays).toBe(CONFIG_TEMPLATE.cacheTtlDays);
    expect(config.compressOptions).toEqual(CONFIG_TEMPLATE.compressOptions);
  });
});
