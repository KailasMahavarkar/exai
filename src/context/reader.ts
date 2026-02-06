/**
 * File Reader - Walks directories and reads file contents into markdown.
 * Replaces the external `genctx` CLI tool with native Node.js implementation.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { shouldPreExcludeDir, shouldPreExcludeFile, matchesAiExclusion } from './filter.js';

export interface ReadOptions {
    /** AI-determined patterns to exclude (folder names, globs) */
    aiExcludePatterns?: string[];
    /** Extra directory names to always skip */
    extraExcludeDirs?: string[];
    /** Max file size in bytes (default: 64KB) */
    maxFileSize?: number;
    /** Max depth to traverse (default: 20) */
    maxDepth?: number;
    /** Allow test files to be read (default: false - test files are pre-filtered) */
    allowTestFiles?: boolean;
}

export interface FileEntry {
    /** Path relative to the root being scanned */
    relativePath: string;
    /** Absolute path */
    absolutePath: string;
    /** File content (text) */
    content: string;
    /** File size in bytes */
    size: number;
    /** Detected language for markdown code fence */
    language: string;
}

export interface ReadResult {
    files: FileEntry[];
    /** Total number of files read */
    totalFiles: number;
    /** Total bytes of content */
    totalSize: number;
    /** Files that were skipped and why */
    skipped: { path: string; reason: string }[];
}

/** Map file extension to markdown language hint */
function extToLanguage(ext: string): string {
    const map: Record<string, string> = {
        '.ts': 'typescript', '.tsx': 'typescript',
        '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
        '.py': 'python',
        '.rs': 'rust',
        '.go': 'go',
        '.java': 'java',
        '.kt': 'kotlin',
        '.rb': 'ruby',
        '.php': 'php',
        '.cs': 'csharp',
        '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.c': 'c', '.h': 'c',
        '.swift': 'swift',
        '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
        '.sql': 'sql',
        '.html': 'html', '.htm': 'html',
        '.css': 'css', '.scss': 'scss', '.sass': 'sass', '.less': 'less',
        '.json': 'json',
        '.yaml': 'yaml', '.yml': 'yaml',
        '.toml': 'toml',
        '.xml': 'xml',
        '.md': 'markdown',
        '.graphql': 'graphql', '.gql': 'graphql',
        '.dockerfile': 'dockerfile',
        '.tf': 'hcl',
        '.proto': 'protobuf',
        '.vue': 'vue',
        '.svelte': 'svelte',
    };
    return map[ext.toLowerCase()] || '';
}

/**
 * Read all text files under the given paths, applying filters.
 */
export function readFiles(paths: string[], options: ReadOptions = {}): ReadResult {
    const {
        aiExcludePatterns = [],
        extraExcludeDirs,
        maxFileSize = 64 * 1024,
        maxDepth = 6,
        allowTestFiles = false,
    } = options;

    const files: FileEntry[] = [];
    const skipped: { path: string; reason: string }[] = [];

    for (const rootPath of paths) {
        walkDir(rootPath, rootPath, 0, maxDepth, {
            aiExcludePatterns,
            extraExcludeDirs,
            maxFileSize,
            allowTestFiles,
            files,
            skipped,
        });
    }

    return {
        files,
        totalFiles: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        skipped,
    };
}

interface WalkContext {
    aiExcludePatterns: string[];
    extraExcludeDirs?: string[];
    maxFileSize: number;
    allowTestFiles: boolean;
    files: FileEntry[];
    skipped: { path: string; reason: string }[];
}

function walkDir(
    currentPath: string,
    rootPath: string,
    depth: number,
    maxDepth: number,
    ctx: WalkContext
): void {
    if (depth > maxDepth) return;

    let entries;
    try {
        entries = readdirSync(currentPath, { withFileTypes: true });
    } catch {
        return;
    }

    // Sort for deterministic output
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);
        const relPath = relative(rootPath, fullPath);

        if (entry.isDirectory()) {
            // Pre-filter: obvious junk + test dirs
            if (shouldPreExcludeDir(entry.name, ctx.extraExcludeDirs, ctx.allowTestFiles)) {
                continue;
            }

            // AI filter: check if AI said to exclude this
            if (matchesAiExclusion(relPath, ctx.aiExcludePatterns)) {
                ctx.skipped.push({ path: relPath, reason: 'ai-excluded' });
                continue;
            }

            walkDir(fullPath, rootPath, depth + 1, maxDepth, ctx);
            continue;
        }

        if (!entry.isFile()) continue;

        // Get file stats
        let stats;
        try {
            stats = statSync(fullPath);
        } catch {
            ctx.skipped.push({ path: relPath, reason: 'stat-error' });
            continue;
        }

        // Pre-filter: binary, lock, too large, test files
        if (shouldPreExcludeFile(entry.name, stats.size, ctx.maxFileSize, ctx.allowTestFiles)) {
            ctx.skipped.push({ path: relPath, reason: 'pre-filtered' });
            continue;
        }

        // AI filter
        if (matchesAiExclusion(relPath, ctx.aiExcludePatterns)) {
            ctx.skipped.push({ path: relPath, reason: 'ai-excluded' });
            continue;
        }

        // Read the file
        try {
            const content = readFileSync(fullPath, 'utf-8');
            const ext = extname(entry.name);

            ctx.files.push({
                relativePath: relPath,
                absolutePath: fullPath,
                content,
                size: stats.size,
                language: extToLanguage(ext),
            });
        } catch {
            ctx.skipped.push({ path: relPath, reason: 'read-error' });
        }
    }
}

/**
 * Format read results into a markdown string suitable for LLM context.
 */
export function formatAsMarkdown(result: ReadResult, rootLabel?: string): string {
    const sections: string[] = [];

    if (rootLabel) {
        sections.push(`# Context: ${rootLabel}\n`);
    }

    for (const file of result.files) {
        sections.push(`## ${file.relativePath}\n`);
        const fence = file.language ? `\`\`\`${file.language}` : '```';
        sections.push(fence);
        sections.push(file.content);
        sections.push('```\n');
    }

    return sections.join('\n');
}
