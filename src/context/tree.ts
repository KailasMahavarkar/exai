/**
 * Directory Tree Generator - Creates tree structure for AI analysis.
 * Filters both directories and files from the tree.
 */

import { readdirSync } from 'fs';
import { join, basename } from 'path';
import { shouldPreExcludeDir, shouldPreExcludeFileName, matchesAiExclusion } from './filter.js';

export interface TreeOptions {
  /** Max depth to traverse (default: 6) */
  maxDepth?: number;
  /** Max items before truncating (default: 1000) */
  maxItems?: number;
  /** Extra directory names to exclude from tree */
  extraExcludeDirs?: string[];
  /** Exclude patterns applied to both files and dirs (e.g. ["dist", "*.lock", "*.test.ts"]) */
  excludePatterns?: string[];
  /** Allow test files in tree (default: false - test files are pre-filtered) */
  allowTestFiles?: boolean;
}

/**
 * Generate a tree string for one or more paths.
 * Filters: pre-filter (node_modules, binaries, lock files) + exclude patterns.
 */
export function generateTree(paths: string[], options: TreeOptions = {}): string {
  const { maxDepth = 6, maxItems = 1000, extraExcludeDirs, excludePatterns, allowTestFiles = false } = options;
  const lines: string[] = [];
  let totalItems = 0;

  for (const rootPath of paths) {
    lines.push(`${basename(rootPath)}/`);

    const gen = treeHelper(rootPath, maxDepth, '', extraExcludeDirs, excludePatterns, allowTestFiles);
    for (const line of gen) {
      lines.push(line);
      totalItems++;
      if (totalItems >= maxItems) {
        lines.push(`... (truncated at ${maxItems} items)`);
        return lines.join('\n');
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

function* treeHelper(
  dirPath: string,
  depth: number,
  prefix: string,
  extraExcludeDirs?: string[],
  excludePatterns?: string[],
  allowTestFiles: boolean = false
): Generator<string> {
  if (depth <= 0) return;

  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  const sorted = entries
    .filter(e => {
      // Directory pre-filter (node_modules, .git, test dirs, etc.)
      if (e.isDirectory() && shouldPreExcludeDir(e.name, extraExcludeDirs, allowTestFiles)) return false;
      // File pre-filter (binary extensions, lock files, test files)
      if (!e.isDirectory() && shouldPreExcludeFileName(e.name, allowTestFiles)) return false;
      // Exclude patterns (manual + AI: works on both files and dirs)
      if (excludePatterns && excludePatterns.length > 0 && matchesAiExclusion(e.name, excludePatterns)) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const isLast = i === sorted.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    yield `${prefix}${connector}${entry.name}`;

    if (entry.isDirectory()) {
      yield* treeHelper(
        join(dirPath, entry.name),
        depth - 1,
        `${prefix}${childPrefix}`,
        extraExcludeDirs,
        excludePatterns,
        allowTestFiles
      );
    }
  }
}
