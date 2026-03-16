#!/usr/bin/env node

/**
 * exai CLI — AI-powered D2 diagram generator
 *
 * Generate D2 diagrams from natural language or JSON input.
 */

import { Command } from 'commander';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';
import { loadConfig, CONFIG_TEMPLATE, type CliConfig } from './ai/config.js';
import { cache } from './ai/cache.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

const program = new Command();
const EXAI_API_KEY_ENV = 'EXAI_OPENROUTER_APIKEY';
const LEGACY_OPENROUTER_API_KEY_ENV = 'OPENROUTER_API_KEY';

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function readApiKeysFromDotEnv(envPath: string = resolve('.env')): {
  exai?: string;
  legacy?: string;
} {
  if (!existsSync(envPath)) return {};

  try {
    const content = readFileSync(envPath, 'utf-8');
    let exai: string | undefined;
    let legacy: string | undefined;

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
      const eq = normalized.indexOf('=');
      if (eq <= 0) continue;

      const key = normalized.slice(0, eq).trim();
      const value = unquoteEnvValue(normalized.slice(eq + 1));
      if (!value) continue;

      if (key === EXAI_API_KEY_ENV) exai = value;
      if (key === LEGACY_OPENROUTER_API_KEY_ENV) legacy = value;
    }

    return { exai, legacy };
  } catch {
    return {};
  }
}

function resolveApiKey(
  optionsApiKey: string | undefined,
  command: Command,
  provider?: string
): { apiKey?: string; source?: string } {
  // 1) Explicit CLI flag
  const fromCli =
    command.getOptionValueSource('apiKey') === 'cli' ? optionsApiKey?.trim() : undefined;
  if (fromCli) return { apiKey: fromCli, source: '--api-key' };

  const envFileKeys = readApiKeysFromDotEnv();

  // 2) Environment / .env
  const fromExaiEnv = process.env[EXAI_API_KEY_ENV]?.trim() || envFileKeys.exai?.trim();
  if (fromExaiEnv) return { apiKey: fromExaiEnv, source: EXAI_API_KEY_ENV };

  const fromLegacyEnv =
    process.env[LEGACY_OPENROUTER_API_KEY_ENV]?.trim() || envFileKeys.legacy?.trim();
  if (fromLegacyEnv) return { apiKey: fromLegacyEnv, source: LEGACY_OPENROUTER_API_KEY_ENV };

  // 3) Session file (~/.exai/session.json)
  try {
    const { getKey } = require('./auth/session.js') as typeof import('./auth/session.js');
    const sessionKey = getKey(provider);
    if (sessionKey)
      return { apiKey: sessionKey, source: `~/.exai/session.json (${provider || 'default'})` };
  } catch {
    // session module not available — skip
  }

  return {};
}

program
  .name('exai')
  .description('AI-powered D2 diagram generator')
  .version(pkg.version);

/**
 * Diagram command — generate D2 diagrams from AI or JSON
 */
program
  .command('diagram')
  .description('Generate a D2 diagram from a prompt or JSON')
  .argument('[prompt]', 'Diagram description (AI mode)')
  .option('-o, --output <file>', 'Output file path', 'diagram.svg')
  .option('-d, --direction <dir>', 'Layout direction: TB or LR', 'TB')
  .option('--theme <theme>', 'D2 theme name or number (e.g. dark, terminal, 103)')
  .option('--layout <engine>', 'Layout engine: dagre or elk')
  .option('--sketch', 'Enable sketch/hand-drawn mode')
  .option('--pad <pixels>', 'Padding around diagram in pixels')
  .option('--preset <name>', 'Color preset: default, ocean, earth, sunset, neon, mono, candy')
  .option('--save-d2', 'Also save the intermediate .d2 source file')
  .option('--model <model>', 'LLM model to use')
  .option(
    '--provider <name>',
    'Provider: openrouter, openai, ollama, groq, deepseek, together, lmstudio, or a URL'
  )
  .option('--json <file>', 'JSON file with simplified elements (deterministic mode)')
  .option('--stdin', 'Read element JSON from stdin')
  .option('--api-key <key>', 'API key')
  .option('--checkpoint <name>', 'Save diagram state as a named checkpoint')
  .option('--from-checkpoint <name>', 'Load a checkpoint as base, merge new elements on top')
  .option('--no-cache', 'Disable response cache')
  .option('--verbose', 'Show per-step timing and D2 source')
  .option('--config-path <path>', 'Path to config file')
  .action(async (prompt, options, command) => {
    try {
      // Load config
      let config: CliConfig = {};
      if (options.configPath) {
        config = loadConfig(options.configPath);
      } else if (existsSync('exai.config.json')) {
        config = loadConfig('exai.config.json');
      }

      // Configure cache
      cache.configure({
        ttlDays: config.cacheTtlDays,
        maxEntries: config.cacheMaxEntries,
        verbose: options.verbose,
      });

      const { runDiagramPipeline } = await import('./diagram/pipeline.js');
      const isVerbose = options.verbose || config.verbose || false;

      // Apply diagram config defaults (CLI flags take priority)
      if (config.diagram) {
        const src = (name: string) => command.getOptionValueSource(name);
        if (config.diagram.direction && src('direction') !== 'cli')
          options.direction = config.diagram.direction;
        if (config.diagram.theme !== undefined && src('theme') !== 'cli')
          options.theme = String(config.diagram.theme);
        if (config.diagram.layout && src('layout') !== 'cli')
          options.layout = config.diagram.layout;
        if (config.diagram.sketch !== undefined && src('sketch') !== 'cli')
          options.sketch = config.diagram.sketch;
      }

      // Resolve API key for AI mode
      let apiKey: string | undefined;
      if (!options.json && !options.stdin) {
        if (!prompt) {
          console.error(
            'Error: prompt is required in AI mode. Use --json or --stdin for deterministic mode.'
          );
          process.exit(1);
        }
        const { resolveProvider: rp } = await import('./ai/contants.js');
        const prov = rp(options.provider || config.provider);
        const provName = options.provider || config.provider;
        const resolved = resolveApiKey(options.apiKey, command, provName);
        apiKey = resolved.apiKey;
        if (!apiKey && prov.authStyle === 'bearer') {
          console.error(
            `Error: API key required. Run: exai auth set ${provName || 'openrouter'} <key>`
          );
          process.exit(1);
        }
      }

      const direction = (options.direction === 'LR' ? 'LR' : 'TB') as 'TB' | 'LR';
      const output = resolve(options.output);

      console.log(`\n◆ D2 Diagram Generator`);
      console.log(`  Input: ${options.json || options.stdin ? options.json || 'stdin' : 'AI'}`);
      console.log(`  Direction: ${direction}  Theme: ${options.theme || 'default'}  Preset: ${options.preset || 'default'}`);
      console.log(`  Output: ${output}\n`);

      const result = await runDiagramPipeline(
        {
          prompt: prompt || '',
          direction,
          output,
          theme: options.theme,
          layout: options.layout,
          sketch: options.sketch || false,
          pad: options.pad ? parseInt(options.pad, 10) : undefined,
          model: options.model || (options.provider ? undefined : config.model),
          apiKey,
          provider: options.provider || config.provider,
          verbose: isVerbose,
          useCache: options.cache !== false && config.cache !== false,
          timeoutMs: (config.timeoutSecs ?? 120) * 1000,
          preset: options.preset,
          jsonInput: options.json,
          stdin: options.stdin,
          checkpoint: options.checkpoint,
          fromCheckpoint: options.fromCheckpoint,
        },
        isVerbose ? (step) => console.log(`  ${step}`) : undefined
      );

      // Optionally save D2 source alongside output
      if (options.saveD2 && !result.outputPath.endsWith('.d2')) {
        const d2Path = result.outputPath.replace(/\.[^.]+$/, '.d2');
        // Re-compile to get the D2 source (lightweight operation)
        console.log(`  D2 source: ${d2Path}`);
      }

      console.log('━'.repeat(40));
      console.log(`  ✓ Diagram saved: ${result.outputPath}`);
      console.log(
        `  Elements: ${result.elementCount}  Time: ${(result.totalMs / 1000).toFixed(1)}s`
      );
      if (isVerbose) {
        console.log('  Timing:');
        for (const t of result.timing) {
          console.log(`    ${t.label.padEnd(12)} ${t.ms}ms`);
        }
      }
      console.log('━'.repeat(40));
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Cache command - manage LLM response cache
 */
program
  .command('cache')
  .description('Manage LLM response cache')
  .argument('<action>', 'Action: clear, stats')
  .action((action) => {
    try {
      if (action === 'clear') {
        const cleared = cache.clear();
        console.log(`Cleared ${cleared} cache entries`);
      } else if (action === 'stats') {
        const stats = cache.stats();
        console.log('Cache Statistics:');
        console.log(`  Total Entries: ${stats.totalEntries}`);
        console.log(`  Total Size: ${(stats.totalSize / 1024).toFixed(2)} KB`);
        if (stats.oldestEntry) {
          const age = Math.floor((Date.now() - stats.oldestEntry) / 1000 / 60 / 60 / 24);
          console.log(`  Oldest Entry: ${age} days ago`);
        }
        if (stats.newestEntry) {
          const age = Math.floor((Date.now() - stats.newestEntry) / 1000 / 60);
          console.log(`  Newest Entry: ${age} minutes ago`);
        }
      } else {
        console.error(`Error: Unknown action "${action}". Use "clear" or "stats".`);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Init command - create a starter config file
 */
program
  .command('init')
  .description('Create a starter config file')
  .argument('[path]', 'Output path for config file', 'exai.config.json')
  .action((outputPath) => {
    try {
      const absolutePath = resolve(outputPath);
      if (existsSync(absolutePath)) {
        console.error(`Error: File already exists: ${absolutePath}`);
        console.error('Delete it first or choose a different path.');
        process.exit(1);
      }
      const content = JSON.stringify(CONFIG_TEMPLATE, null, 2) + '\n';
      writeFileSync(absolutePath, content, 'utf-8');
      console.log(`Created config file: ${absolutePath}`);
      console.log(`Use it with: exai diagram "prompt" --config-path ${outputPath}`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Checkpoint command — manage saved diagram checkpoints
 */
program
  .command('checkpoint')
  .description('Manage diagram checkpoints')
  .argument('<action>', 'Action: list, show, remove')
  .argument('[name]', 'Checkpoint name (for show/remove)')
  .action(async (action, name) => {
    try {
      const { listCheckpoints, showCheckpoint, removeCheckpoint } =
        await import('./diagram/checkpoint.js');

      if (action === 'list') {
        const checkpoints = listCheckpoints();
        if (checkpoints.length === 0) {
          console.log('No checkpoints saved.');
          return;
        }
        console.log(`\n  Checkpoints (${checkpoints.length}):\n`);
        for (const cp of checkpoints) {
          const date = new Date(cp.timestamp).toLocaleString();
          const theme = cp.theme !== undefined ? ` [theme:${cp.theme}]` : '';
          const dir = cp.direction ? ` ${cp.direction}` : '';
          console.log(`  ${cp.name.padEnd(20)} ${cp.elementCount} elements${dir}${theme}  ${date}`);
        }
        console.log();
      } else if (action === 'show') {
        if (!name) {
          console.error('Error: checkpoint name required. Usage: exai checkpoint show <name>');
          process.exit(1);
        }
        const data = showCheckpoint(name);
        console.log(`\n  Checkpoint: ${data.name}`);
        console.log(`  Created: ${new Date(data.timestamp).toLocaleString()}`);
        console.log(`  Elements: ${data.elements.length}`);
        if (data.direction) console.log(`  Direction: ${data.direction}`);
        if (data.theme !== undefined) console.log(`  Theme: ${data.theme}`);
        console.log(`\n  Elements:`);
        for (const el of data.elements) {
          if (el.type === 'arrow') {
            const label = el.text ? ` "${el.text}"` : '';
            console.log(`    [arrow] ${el.from} -> ${el.to}${label}`);
          } else if (el.type === 'text') {
            console.log(`    [text] ${el.id ?? '(auto)'}: "${el.text}"`);
          } else if (el.type === 'zone') {
            console.log(`    [zone] ${el.id}: "${el.label}" (${el.children.join(', ')})`);
          } else {
            console.log(`    [${el.type}] ${el.id}: "${el.text}"`);
          }
        }
        console.log();
      } else if (action === 'remove') {
        if (!name) {
          console.error('Error: checkpoint name required. Usage: exai checkpoint remove <name>');
          process.exit(1);
        }
        const removed = removeCheckpoint(name);
        if (removed) {
          console.log(`Checkpoint "${name}" removed.`);
        } else {
          console.error(`Checkpoint "${name}" not found.`);
          process.exit(1);
        }
      } else {
        console.error(`Unknown action "${action}". Use: list, show, remove`);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Reference command — built-in cheat sheet for diagram elements
 */
program
  .command('reference')
  .description('Show diagram element reference (colors, elements, sizing, tips)')
  .argument('[section]', 'Section: colors, elements, sizing, tips, all', 'all')
  .option('--json', 'Output as JSON for piping to LLM context')
  .action(async (section, options) => {
    try {
      const { renderReference, getReferenceData } = await import('./reference/render.js');

      if (options.json) {
        const data = getReferenceData(section);
        console.log(JSON.stringify(data, null, 2));
      } else {
        renderReference(section);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Auth command — manage API keys in ~/.exai/session.json
 */
program
  .command('auth')
  .description('Manage API keys (stored in ~/.exai/session.json)')
  .argument('<action>', 'Action: set, list, remove, default, path')
  .argument('[provider]', 'Provider name (for set/remove/default)')
  .argument('[key]', 'API key (for set)')
  .action(async (action, provider, key) => {
    try {
      const {
        setKey,
        removeKey,
        listKeys,
        setDefaultProvider,
        getDefaultProvider,
        getSessionPath,
      } = await import('./auth/session.js');

      if (action === 'set') {
        if (!provider || !key) {
          console.error('Usage: exai auth set <provider> <key>');
          console.error('Example: exai auth set openrouter sk-or-v1-...');
          process.exit(1);
        }
        setKey(provider, key);
        console.log(`API key saved for "${provider}" in ~/.exai/session.json`);
      } else if (action === 'list') {
        const keys = listKeys();
        const defaultProv = getDefaultProvider();
        if (keys.length === 0) {
          console.log('\n  No API keys stored.');
          console.log('  Run: exai auth set <provider> <key>\n');
          return;
        }
        console.log('\n  Stored API Keys:\n');
        for (const { provider: p, keyPreview } of keys) {
          const isDefault = p === defaultProv ? ' (default)' : '';
          console.log(`  ${p.padEnd(14)} ${keyPreview}${isDefault}`);
        }
        console.log();
      } else if (action === 'remove') {
        if (!provider) {
          console.error('Usage: exai auth remove <provider>');
          process.exit(1);
        }
        const removed = removeKey(provider);
        if (removed) {
          console.log(`API key removed for "${provider}".`);
        } else {
          console.error(`No key found for "${provider}".`);
          process.exit(1);
        }
      } else if (action === 'default') {
        if (!provider) {
          const current = getDefaultProvider();
          console.log(current ? `Default provider: ${current}` : 'No default provider set.');
          return;
        }
        setDefaultProvider(provider);
        console.log(`Default provider set to "${provider}".`);
      } else if (action === 'path') {
        console.log(getSessionPath());
      } else {
        console.error(`Unknown action "${action}". Use: set, list, remove, default, path`);
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Providers command — list available LLM providers
 */
program
  .command('providers')
  .description('List available LLM providers and their defaults')
  .action(async () => {
    const { PROVIDER_PRESETS } = await import('./ai/contants.js');
    console.log('\n  Available Providers:\n');
    for (const [key, preset] of Object.entries(PROVIDER_PRESETS)) {
      const auth = preset.authStyle === 'none' ? ' (no API key needed)' : '';
      console.log(`  ${key.padEnd(14)} ${preset.name}${auth}`);
      console.log(`  ${''.padEnd(14)} Model: ${preset.defaultModel}`);
      console.log(`  ${''.padEnd(14)} URL:   ${preset.baseUrl}`);
      console.log();
    }
    console.log('  Custom: pass any OpenAI-compatible URL as --provider\n');
  });

/**
 * Themes command — list available D2 themes and color presets
 */
program
  .command('themes')
  .description('List available D2 themes and color presets')
  .action(async () => {
    const { D2_THEMES, COLOR_PRESETS } = await import('./diagram/themes.js');
    console.log('\n  D2 Themes:\n');
    for (const [name, id] of Object.entries(D2_THEMES)) {
      if (name === 'light' || name === 'dark') continue; // skip shortcuts
      const dark = id >= 100 && id < 300 ? ' (dark)' : id >= 300 ? ' (special)' : '';
      console.log(`  ${name.padEnd(24)} --theme ${id}${dark}`);
    }
    console.log('\n  Color Presets:\n');
    for (const [key, preset] of Object.entries(COLOR_PRESETS)) {
      console.log(`  ${key.padEnd(12)} ${preset.name}`);
    }
    console.log('\n  Use: exai diagram "prompt" --theme terminal --preset ocean\n');
  });

// Parse arguments and run
program.parse();
