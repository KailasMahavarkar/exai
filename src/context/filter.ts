/**
 * Context Filter - Two-layer filtering:
 * 1. Static pre-filter: obvious junk (node_modules, .git, binaries) never even shown to AI
 * 2. AI filter: the tree (minus obvious junk) goes to AI for intelligent exclusion decisions
 */

/** Directories that should NEVER appear in context or tree - not worth asking AI about */
const ALWAYS_EXCLUDE_DIRS: Set<string> = new Set([
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    '__pycache__',
    '.pytest_cache',
    '.mypy_cache',
    '.ruff_cache',
    '.tox',
    '.npm',
    '.yarn',
    '.pnpm-store',
    '.cache',
    '.parcel-cache',
    '.turbo',
    '.sass-cache',
    'bower_components',
    'Pods',
    '.gradle',
    '.terraform',
]);

/** File extensions that are binary/useless for code context */
const BINARY_EXTENSIONS: Set<string> = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp', '.avif',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.ogg', '.wav',
    '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.xz',
    '.exe', '.dll', '.so', '.dylib', '.bin', '.msi',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.pyc', '.pyo', '.class', '.o', '.obj',
    '.map',
]);

/** Files that are always noise (OS junk, env secrets) */
const ALWAYS_EXCLUDE_FILES: Set<string> = new Set([
    '.ds_store',
    '.dev.vars',
    'thumbs.db',
    'desktop.ini',
]);

/** Lock files - always noise */
const LOCK_FILES: Set<string> = new Set([
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lock',
    'bun.lockb',
    'composer.lock',
    'gemfile.lock',
    'cargo.lock',
    'poetry.lock',
]);

/** Test directory names - excluded when allowTestFiles=false */
const TEST_DIR_NAMES: Set<string> = new Set([
    '__tests__',
    '__mocks__',
    '__snapshots__',
    '__fixtures__',
]);

/** Test file suffixes - excluded when allowTestFiles=false */
const TEST_FILE_SUFFIXES: string[] = [
    // JS/TS
    '.test.ts', '.test.tsx', '.test.js', '.test.jsx', '.test.mjs', '.test.cjs',
    '.spec.ts', '.spec.tsx', '.spec.js', '.spec.jsx', '.spec.mjs', '.spec.cjs',
    // Python (suffix convention: foo_test.py)
    '_test.py',
    // Go
    '_test.go',
    // Ruby
    '_test.rb', '_spec.rb',
    // C/C++
    '_test.cpp', '_test.cc', '_test.cxx', '_test.c',
    // Rust
    '_test.rs',
];

/** Test file prefixes - excluded when allowTestFiles=false */
const TEST_FILE_PREFIXES: string[] = [
    'test_',  // Python convention: test_foo.py
];

function isTestFile(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    if (TEST_FILE_SUFFIXES.some(suffix => lower.endsWith(suffix))) return true;
    if (TEST_FILE_PREFIXES.some(prefix => lower.startsWith(prefix))) return true;
    return false;
}

function isTestDir(dirName: string): boolean {
    return TEST_DIR_NAMES.has(dirName);
}

/**
 * Should this directory be excluded from the tree entirely?
 * These are so obvious that we don't waste AI tokens on them.
 */
export function shouldPreExcludeDir(dirName: string, extra?: string[], allowTestFiles: boolean = false): boolean {
    if (ALWAYS_EXCLUDE_DIRS.has(dirName)) return true;
    if (extra && extra.some(e => e.toLowerCase() === dirName.toLowerCase())) return true;
    if (!allowTestFiles && isTestDir(dirName)) return true;
    return false;
}

/**
 * Should this file be excluded from reading? (binary, lock file, too large, test file)
 */
export function shouldPreExcludeFile(
    fileName: string,
    fileSize: number,
    maxFileSize: number = 512 * 1024,
    allowTestFiles: boolean = false
): boolean {
    if (shouldPreExcludeFileName(fileName, allowTestFiles)) return true;
    if (fileSize > maxFileSize) return true;
    return false;
}

/**
 * Should this file be excluded from the tree? (binary, lock file, test file - no size check)
 * Used by tree generator to hide obvious noise files.
 */
export function shouldPreExcludeFileName(fileName: string, allowTestFiles: boolean = false): boolean {
    const lower = fileName.toLowerCase();

    // OS junk / env secrets
    if (ALWAYS_EXCLUDE_FILES.has(lower)) return true;

    // Lock files
    if (LOCK_FILES.has(lower)) return true;

    // Binary extensions
    const dotIdx = lower.lastIndexOf('.');
    if (dotIdx !== -1) {
        const ext = lower.slice(dotIdx);
        if (BINARY_EXTENSIONS.has(ext)) return true;
    }

    // Test files
    if (!allowTestFiles && isTestFile(lower)) return true;

    return false;
}

/**
 * Given AI-returned exclude patterns, check if a path should be skipped.
 * Patterns can be folder names ("dist", "coverage") or globs ("*.test.ts").
 */
export function matchesAiExclusion(
    relativePath: string,
    aiExcludePatterns: string[]
): boolean {
    const parts = relativePath.split(/[/\\]/);

    for (const pattern of aiExcludePatterns) {
        const p = pattern.trim();
        if (!p) continue;

        // Simple folder/file name match (e.g. "dist", ".env", "coverage")
        if (!p.includes('*') && !p.includes('?')) {
            // Check if any path segment matches
            if (parts.some(seg => seg.toLowerCase() === p.toLowerCase())) return true;
            // Also check exact filename
            const fileName = parts[parts.length - 1];
            if (fileName.toLowerCase() === p.toLowerCase()) return true;
            continue;
        }

        // Glob-like extension match (e.g. "*.lock", "*.min.js")
        if (p.startsWith('*.')) {
            const ext = p.slice(1); // ".lock", ".min.js"
            const fileName = parts[parts.length - 1];
            if (fileName.toLowerCase().endsWith(ext.toLowerCase())) return true;
        }
    }

    return false;
}
