/**
 * Directory Tree Generator - Port of Python tree.py logic
 * Creates intelligent project structure for AI analysis
 */

import { readdirSync, statSync } from 'fs';
import { join } from 'path';

interface TreeGeneratorOptions {
  currentDepth?: number;
  prefix?: string;
  minFileSize?: number; // bytes
  minFolderSize?: number; // bytes
  includeRegex?: RegExp;
  excludeRegex?: RegExp;
  folderOnly?: boolean;
  sort?: boolean;
  initialDepth?: number;
}

/**
 * Calculate folder size recursively
 */
function getFolderSize(folderPath: string): number {
  let totalSize = 0;

  try {
    const entries = readdirSync(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      try {
        const fullPath = join(folderPath, entry.name);
        const stats = statSync(fullPath);

        if (entry.isFile()) {
          totalSize += stats.size;
        } else if (entry.isDirectory()) {
          totalSize += getFolderSize(fullPath);
        }
      } catch {
        // Skip files/dirs we can't read
        continue;
      }
    }
  } catch {
    return 0;
  }

  return totalSize;
}

/**
 * Generate tree structure recursively (ported from Python get_tree_helper)
 */
function* getTreeHelper(
  currentPath: string,
  currentDepth: number,
  prefix: string,
  options: TreeGeneratorOptions
): Generator<string> {
  const {
    minFileSize = 0,
    minFolderSize = 0,
    includeRegex,
    excludeRegex,
    folderOnly = false,
    sort = false,
    initialDepth = 2,
  } = options;

  // Base case: stop recursion when depth reaches zero
  if (currentDepth <= 0) {
    return;
  }

  try {
    const entries = readdirSync(currentPath, { withFileTypes: true });
    const items = entries.map((entry) => ({
      name: entry.name,
      fullPath: join(currentPath, entry.name),
      isDirectory: entry.isDirectory(),
      isFile: entry.isFile(),
    }));

    // Filter items
    const filteredItems = items.filter((item) => {
      // Exclude based on regex
      if (excludeRegex && excludeRegex.test(item.fullPath)) {
        return false;
      }

      // Include based on regex
      if (includeRegex && !includeRegex.test(item.fullPath)) {
        return false;
      }

      // Skip non-directories if folderOnly
      if (folderOnly && !item.isDirectory) {
        return false;
      }

      // Size filtering
      if (item.isDirectory) {
        const folderSize = getFolderSize(item.fullPath);
        if (folderSize < minFolderSize) {
          return false;
        }
      } else {
        const fileSize = statSync(item.fullPath).size;
        if (fileSize < minFileSize) {
          return false;
        }
      }

      return true;
    });

    // Sort items if required
    if (sort) {
      filteredItems.sort((a, b) => {
        const sizeA = a.isDirectory ? getFolderSize(a.fullPath) : statSync(a.fullPath).size;
        const sizeB = b.isDirectory ? getFolderSize(b.fullPath) : statSync(b.fullPath).size;
        return sizeB - sizeA;
      });
    } else {
      filteredItems.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Yield lines for each item
    for (let i = 0; i < filteredItems.length; i++) {
      const item = filteredItems[i];
      const isLast = i === filteredItems.length - 1;
      const connector = isLast ? '└──' : '├──';

      yield `${prefix}${connector} ${item.name}`;

      // Recurse into directories
      if (item.isDirectory) {
        const newPrefix = `${prefix}${isLast ? '    ' : '│   '}`;
        yield* getTreeHelper(item.fullPath, currentDepth - 1, newPrefix, {
          ...options,
          initialDepth,
        });
      }
    }
  } catch (error) {
    // Skip directories we can't read
    return;
  }
}

/**
 * Generate tree string for paths
 */
export async function generateTree(
  paths: string[],
  options: Partial<TreeGeneratorOptions> = {}
): Promise<string> {
  const lines: string[] = [];
  lines.push('Project Structure:');
  lines.push('');

  for (const path of paths) {
    const generator = getTreeHelper(path, 8, '', {
      currentDepth: 8,
      minFileSize: 0,
      minFolderSize: 0,
      ...options,
    });

    let lineCount = 0;
    for (const line of generator) {
      lines.push(line);
      lineCount++;
      if (lineCount > 1000) {
        lines.push('... (tree truncated, showing first 1000 items)');
        break;
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}
