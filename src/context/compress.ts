/**
 * Context Compressor - Reduces context size while preserving essential information.
 * Works on FileEntry[] directly (no markdown re-parsing needed).
 */

import type { FileEntry } from './reader.js';

export interface CompressOptions {
  removeComments?: boolean;
  minifyWhitespace?: boolean;
  extractSignaturesOnly?: boolean;
  maxFileLines?: number;
  preserveImports?: boolean;
  preserveExports?: boolean;
  preserveTypes?: boolean;
  preserveFunctionSignatures?: boolean;
}

export interface CompressResult {
  files: FileEntry[];
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  filesProcessed: number;
}

const DEFAULTS: Required<CompressOptions> = {
  removeComments: true,
  minifyWhitespace: true,
  extractSignaturesOnly: false,
  maxFileLines: 10000,
  preserveImports: true,
  preserveExports: true,
  preserveTypes: true,
  preserveFunctionSignatures: true,
};

const CODE_EXTENSIONS = new Set([
  'typescript', 'javascript', 'python', 'java', 'go', 'rust',
  'cpp', 'c', 'csharp', 'kotlin', 'ruby', 'php', 'swift',
]);

/**
 * Compress file entries, reducing content size while preserving structure.
 */
export function compressFiles(
  files: FileEntry[],
  options: CompressOptions = {}
): CompressResult {
  const opts = { ...DEFAULTS, ...options };
  const originalSize = files.reduce((s, f) => s + f.size, 0);
  let filesProcessed = 0;

  const compressed = files.map(file => {
    const isCode = CODE_EXTENSIONS.has(file.language);

    if (!isCode) {
      // Non-code: just limit lines
      const limited = limitLines(file.content, opts.maxFileLines ?? 200);
      filesProcessed++;
      return { ...file, content: limited, size: Buffer.byteLength(limited, 'utf-8') };
    }

    filesProcessed++;
    let content = file.content;

    if (opts.extractSignaturesOnly) {
      content = extractSignatures(content);
    } else {
      if (opts.removeComments) content = removeComments(content);
      if (opts.minifyWhitespace) content = minifyWhitespace(content);
      if (opts.maxFileLines) content = smartLimit(content, opts.maxFileLines, opts);
    }

    return { ...file, content, size: Buffer.byteLength(content, 'utf-8') };
  });

  const compressedSize = compressed.reduce((s, f) => s + f.size, 0);

  return {
    files: compressed,
    originalSize,
    compressedSize,
    compressionRatio: originalSize > 0 ? (1 - compressedSize / originalSize) * 100 : 0,
    filesProcessed,
  };
}

function removeComments(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.includes('/*')) inBlock = true;
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false;
      continue;
    }

    if (trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    // Remove inline comments (simple: only if quotes are balanced before //)
    let clean = line;
    const idx = line.indexOf('//');
    if (idx > 0) {
      const before = line.slice(0, idx);
      const quotes = (before.match(/['"]/g) || []).length;
      if (quotes % 2 === 0) clean = before.trimEnd();
    }

    result.push(clean);
  }

  return result.join('\n');
}

function minifyWhitespace(content: string): string {
  return content
    .split('\n')
    .map(l => l.trimEnd())
    .filter((line, i, arr) => {
      if (line.trim().length > 0) return true;
      // Remove consecutive blank lines
      if (i > 0 && arr[i - 1].trim().length === 0) return false;
      return true;
    })
    .join('\n');
}

function extractSignatures(content: string): string {
  const lines = content.split('\n');
  const sigs: string[] = [];
  const sigPatterns = [
    /^(export\s+)?(interface|type|class|function|const|let|var)\s+\w+/,
    /^(export\s+)?(async\s+)?function\s+\w+/,
    /^\s*(public|private|protected|static)?\s*(async\s+)?\w+\s*\([^)]*\)/,
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (sigPatterns.some(p => p.test(trimmed))) {
      sigs.push(line);
    } else if (trimmed.startsWith('import ') || trimmed.startsWith('export ')) {
      sigs.push(line);
    }
  }

  return sigs.join('\n');
}

function limitLines(content: string, max: number): string {
  const lines = content.split('\n');
  if (lines.length <= max) return content;
  return lines.slice(0, max).join('\n') + `\n... (${lines.length - max} more lines)`;
}

function smartLimit(content: string, maxLines: number, opts: CompressOptions): string {
  const lines = content.split('\n');
  if (lines.length <= maxLines) return content;

  const important = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (
      (opts.preserveImports && t.startsWith('import ')) ||
      (opts.preserveExports && t.startsWith('export ')) ||
      (opts.preserveTypes && (t.startsWith('interface ') || t.startsWith('type '))) ||
      (opts.preserveFunctionSignatures && /^(export\s+)?(async\s+)?function\s+\w+/.test(t))
    ) {
      // Include the line and 1 line of context after
      important.add(i);
      if (i + 1 < lines.length) important.add(i + 1);
    }
  }

  // Fill remaining budget from top of file
  let idx = 0;
  while (important.size < maxLines && idx < lines.length) {
    important.add(idx);
    idx++;
  }

  const sorted = Array.from(important).sort((a, b) => a - b);
  const result: string[] = [];
  let lastIdx = -2;

  for (const i of sorted) {
    if (i > lastIdx + 1) result.push('  // ...');
    result.push(lines[i]);
    lastIdx = i;
  }

  if (lastIdx < lines.length - 1) {
    result.push(`  // ... (${lines.length - lastIdx - 1} more lines)`);
  }

  return result.join('\n');
}
