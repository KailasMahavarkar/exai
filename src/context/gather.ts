/**
 * Context Gatherer - Full pipeline:
 *
 * 1. Pre-filter obvious noise (node_modules, .git, binaries)
 * 2. Build tree from what remains
 * 3. Pass tree to AI → AI predicts which paths are noise
 * 4. Add AI patterns to exclusions
 * 5. Read files (skipping both pre-filtered and AI-excluded)
 * 6. Optionally compress
 * 7. Return markdown context
 *
 * The AI call is injectable: pass your own function or a mock for tests.
 */

import { resolve, basename, existsSync, statSync } from './compat.js';
import { generateTree, type TreeOptions } from './tree.js';
import { readFiles, formatAsMarkdown } from './reader.js';
import { compressFiles, type CompressOptions } from './compress.js';

/**
 * AI filter function signature.
 * Takes the pre-filtered tree string, returns exclude patterns.
 * e.g. ["dist", "coverage", "*.test.ts", ".env"]
 */
export type AiFilterFn = (tree: string) => Promise<string[]>;

export interface GatherOptions {
  /** Manual exclude patterns: always applied regardless of AI */
  excludePatterns?: string[];
  /** AI filter function: receives tree, returns ADDITIONAL exclude patterns */
  aiFilter?: AiFilterFn;
  /** Enable compression (default: false) */
  compress?: boolean;
  /** Compression settings (only used if compress=true) */
  compressOptions?: CompressOptions;
  /** Extra dirs to always exclude from tree and reading */
  extraExcludeDirs?: string[];
  /** Max file size to read in bytes (default: 64KB) */
  maxFileSize?: number;
  /** Tree generation options */
  treeOptions?: TreeOptions;
  /** Allow test files in context (default: false - test files are pre-filtered, never sent to AI) */
  allowTestFiles?: boolean;
  /** Verbose logging */
  verbose?: boolean;
}

export interface GatherResult {
  /** The final markdown context string */
  markdown: string;
  /** The final clean tree (after all exclusions: pre-filter + manual + AI) */
  tree: string;
  /** Number of files included */
  fileCount: number;
  /** Total context size in bytes */
  totalSize: number;
  /** Files that were skipped */
  skippedFiles: { path: string; reason: string }[];
  /** AI exclude patterns that were applied */
  aiExcludePatterns: string[];
  /** Compression result (if compression was enabled) */
  compression?: {
    originalSize: number;
    compressedSize: number;
    ratio: number;
  };
  /** Timing info */
  timing: {
    treeMs: number;
    filterMs: number;
    readMs: number;
    compressMs: number;
    totalMs: number;
  };
}

/**
 * Validate that all paths exist and are directories.
 */
export function validatePaths(paths: string[]): string[] {
  const validated: string[] = [];

  for (const p of paths) {
    const abs = resolve(p);

    if (!existsSync(abs)) {
      throw new Error(`Path does not exist: ${p}\nResolved to: ${abs}`);
    }

    const stats = statSync(abs);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${p}\nResolved to: ${abs}`);
    }

    validated.push(abs);
  }

  return validated;
}

/**
 * Generate the tree structure (pre-filtered + manual exclude patterns).
 * Useful if you want the tree separately (e.g. to display before AI call).
 */
export function gatherTree(
  paths: string[],
  options: GatherOptions = {}
): { tree: string; timeMs: number } {
  const start = Date.now();
  const tree = generateTree(paths, {
    ...options.treeOptions,
    extraExcludeDirs: options.extraExcludeDirs,
    excludePatterns: options.excludePatterns,
    allowTestFiles: options.allowTestFiles ?? false,
  });
  return { tree, timeMs: Date.now() - start };
}

/**
 * Full pipeline:
 *   pre-filter → tree (with manual exclusions) → AI filter → read files → compress → markdown
 *
 * Exclusions are combined:
 * 1. Pre-filter (automatic): node_modules, .git, binaries
 * 2. Manual excludePatterns (always applied)
 * 3. AI-suggested patterns (if aiFilter provided)
 *
 * So: (pre-filter OR excludePatterns) AND (AI suggestions)
 */
export async function gatherContext(
  paths: string[],
  options: GatherOptions = {}
): Promise<GatherResult> {
  const totalStart = Date.now();
  const { verbose = false } = options;

  // ── Step 1: Build tree (pre-filtered + manual exclusions applied) ────────
  const treeStart = Date.now();
  const tree = generateTree(paths, {
    ...options.treeOptions,
    extraExcludeDirs: options.extraExcludeDirs,
    excludePatterns: options.excludePatterns,
    allowTestFiles: options.allowTestFiles ?? false,
  });
  const treeMs = Date.now() - treeStart;

  if (verbose) {
    console.log(`  Tree generated in ${treeMs}ms (${tree.split('\n').length} lines)`);
    if (options.excludePatterns && options.excludePatterns.length > 0) {
      console.log(`  Manual excludes: ${options.excludePatterns.join(', ')}`);
    }
  }

  // ── Step 2: Pass tree to AI → AI predicts ADDITIONAL patterns to exclude ─
  let filterMs = 0;
  let allExcludePatterns: string[] = [...(options.excludePatterns ?? [])];

  if (options.aiFilter) {
    // AI filter function provided → call it with the tree
    const filterStart = Date.now();
    const aiPatterns = await options.aiFilter(tree);
    filterMs = Date.now() - filterStart;
    allExcludePatterns = [...allExcludePatterns, ...aiPatterns];

    if (verbose) {
      console.log(`  AI filter returned ${aiPatterns.length} exclusion(s) in ${filterMs}ms`);
      console.log(`  AI excludes: ${aiPatterns.join(', ')}`);
    }
  } else if (verbose) {
    console.log(`  No AI filter provided`);
  }

  if (verbose && allExcludePatterns.length > 0) {
    console.log(`  Total exclusions: ${allExcludePatterns.join(', ')}`);
  }

  // ── Step 2b: Rebuild tree with ALL exclusions (manual + AI) ─────────────
  // So result.tree reflects the final clean structure, not what AI saw
  const finalTree = generateTree(paths, {
    ...options.treeOptions,
    extraExcludeDirs: options.extraExcludeDirs,
    excludePatterns: allExcludePatterns,
    allowTestFiles: options.allowTestFiles ?? false,
  });

  // ── Step 3: Read files (applying all exclusions) ────────────────────────
  const readStart = Date.now();
  const readResult = readFiles(paths, {
    aiExcludePatterns: allExcludePatterns,
    extraExcludeDirs: options.extraExcludeDirs,
    maxFileSize: options.maxFileSize,
    maxDepth: options.treeOptions?.maxDepth,
    allowTestFiles: options.allowTestFiles ?? false,
  });
  const readMs = Date.now() - readStart;

  if (verbose) {
    console.log(`  Read ${readResult.totalFiles} files (${(readResult.totalSize / 1024).toFixed(1)}KB) in ${readMs}ms`);
    console.log(`  Skipped ${readResult.skipped.length} files`);
  }

  // ── Step 4: Optionally compress ──────────────────────────────────────────
  let compressMs = 0;
  let compression: GatherResult['compression'];
  let finalFiles = readResult.files;

  if (options.compress) {
    const compressStart = Date.now();
    const compressResult = compressFiles(readResult.files, options.compressOptions);
    compressMs = Date.now() - compressStart;
    finalFiles = compressResult.files;

    compression = {
      originalSize: compressResult.originalSize,
      compressedSize: compressResult.compressedSize,
      ratio: compressResult.compressionRatio,
    };

    if (verbose) {
      console.log(`  Compressed: ${(compressResult.originalSize / 1024).toFixed(1)}KB -> ${(compressResult.compressedSize / 1024).toFixed(1)}KB (${compressResult.compressionRatio.toFixed(1)}% reduction) in ${compressMs}ms`);
    }
  }

  // ── Step 5: Format as markdown ───────────────────────────────────────────
  const rootLabel = paths.map(p => basename(p)).join(', ');
  const markdown =
    `# Project Structure\n\n\`\`\`\n${finalTree}\n\`\`\`\n\n` +
    formatAsMarkdown({ ...readResult, files: finalFiles }, rootLabel);

  const totalMs = Date.now() - totalStart;

  return {
    markdown,
    tree: finalTree,
    fileCount: finalFiles.length,
    totalSize: Buffer.byteLength(markdown, 'utf-8'),
    skippedFiles: readResult.skipped,
    aiExcludePatterns: allExcludePatterns,
    compression,
    timing: { treeMs, filterMs, readMs, compressMs, totalMs },
  };
}
