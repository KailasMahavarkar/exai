# Context Gathering Module

A functional, testable library for gathering code context from filesystem paths. Designed for AI-powered analysis with intelligent filtering.

## Overview

Three-stage pipeline:

1. **Tree Generation** - creates clean directory tree (pre-filters obvious junk)
2. **AI Analysis** - you send tree to LLM for intelligent exclusion decisions
3. **Context Reading** - reads only relevant files, applies AI exclusions, optionally compresses

## Key Features

- ✅ **Functional API** - pure functions, no classes
- ✅ **Pre-filtering** - automatically excludes node_modules, .git, binaries, lock files
- ✅ **AI-powered filtering** - you decide what to exclude (AI returns patterns like `"dist"`, `"*.test.ts"`)
- ✅ **Native file reading** - no external dependencies (replaces genctx)
- ✅ **Optional compression** - reduce context size by 50-70%
- ✅ **Multiple paths** - gather from multiple source directories simultaneously
- ✅ **Fully tested** - 34 unit tests, 100% path isolation

## Installation

Already included in the main package. Import from:

```typescript
import {
  validatePaths,
  gatherTree,
  gatherContext,
  readFiles,
  compressFiles,
} from '../context/index.js';
```

## Usage

### 1. Basic Example

```typescript
import { validatePaths, gatherTree, gatherContext } from './context/index.js';

// Validate paths exist and are directories
const paths = validatePaths(['./src', './lib']);

// Stage 1: Generate tree for AI
const { tree } = gatherTree(paths);
console.log(tree);  // Clean structure, no node_modules

// Send `tree` to your AI here...
// const aiResponse = await askAI(tree);
// const excludePatterns = JSON.parse(aiResponse);

// Stage 2: Gather context with AI exclusions
const result = gatherContext(paths, {
  aiExcludePatterns: ['dist', 'coverage', '*.test.ts'],
  compress: true,
});

console.log(result.markdown);  // Ready for LLM
```

### 2. With Compression

```typescript
const result = gatherContext(paths, {
  compress: true,
  compressOptions: {
    removeComments: true,
    minifyWhitespace: true,
    maxFileLines: 100,
    preserveImports: true,
    preserveExports: true,
    preserveTypes: true,
  },
});

console.log(`Original: ${result.compression?.originalSize}B`);
console.log(`Compressed: ${result.totalSize}B`);
console.log(`Saved: ${result.compression?.ratio.toFixed(1)}%`);
```

### 3. Multiple Source Paths

```typescript
const paths = validatePaths(['./src', './tests', './lib']);

const result = gatherContext(paths, {
  aiExcludePatterns: ['node_modules', 'dist'],
});

// All files from all three paths are included
console.log(`Total files: ${result.fileCount}`);
```

### 4. Read Files Only (without markdown formatting)

```typescript
import { readFiles } from './context/index.js';

const readResult = readFiles(paths, {
  aiExcludePatterns: ['dist', '*.test.ts'],
  maxFileSize: 512 * 1024,  // 512KB per file
});

// Work with FileEntry[] directly
readResult.files.forEach(file => {
  console.log(`${file.relativePath}: ${file.content.length} bytes`);
});
```

### 5. Just Generate Tree (for sending to AI)

```typescript
const { tree, timeMs } = gatherTree(paths);

// Send to your LLM's analysis endpoint
const aiDecision = await yourAIAPI.analyzeStructure(tree);
```

## API Reference

### `validatePaths(paths: string[]): string[]`

Validates that all paths exist and are directories. Returns absolute paths.

**Throws:**
- If path doesn't exist
- If path is not a directory

```typescript
const absolutePaths = validatePaths(['./src', '../lib']);
```

### `gatherTree(paths: string[], options?): { tree: string; timeMs: number }`

Generates a directory tree structure (pre-filtered). No node_modules, .git, binaries shown.

**Options:**
- `maxDepth?: number` - max recursion depth (default: 8)
- `maxItems?: number` - max items before truncating (default: 1000)
- `extraExcludeDirs?: string[]` - additional dirs to exclude

```typescript
const { tree, timeMs } = gatherTree(paths, {
  maxDepth: 5,
  extraExcludeDirs: ['custom-junk'],
});
```

### `gatherContext(paths: string[], options?): GatherResult`

Reads all files, applies filters, and returns context markdown.

**Options:**
- `aiExcludePatterns?: string[]` - patterns from AI analysis
- `compress?: boolean` - enable compression (default: false)
- `compressOptions?: CompressOptions` - compression settings
- `extraExcludeDirs?: string[]` - additional dirs to exclude
- `maxFileSize?: number` - max file size in bytes (default: 512KB)
- `verbose?: boolean` - verbose logging

**Returns:**
```typescript
{
  markdown: string;           // Full context ready for LLM
  tree: string;               // The directory structure
  fileCount: number;          // Files included
  totalSize: number;          // Bytes of context
  skippedFiles: Array;        // Files that were filtered out
  aiExcludePatterns: string[];// Patterns applied
  compression?: {
    originalSize: number;
    compressedSize: number;
    ratio: number;            // Percentage saved
  };
  timing: {
    treeMs: number;
    readMs: number;
    compressMs: number;
    totalMs: number;
  };
}
```

### `readFiles(paths: string[], options?): ReadResult`

Reads files without markdown formatting. Use if you need raw FileEntry[] objects.

**Options:**
- `aiExcludePatterns?: string[]` - patterns to exclude
- `maxFileSize?: number` - max file size (default: 512KB)
- `maxDepth?: number` - max recursion depth (default: 20)

**Returns:**
```typescript
{
  files: FileEntry[];         // Array of {relativePath, content, language, size, ...}
  totalFiles: number;
  totalSize: number;
  skipped: Array;             // Excluded files and why
}
```

### `compressFiles(files: FileEntry[], options?): CompressResult`

Compresses an array of FileEntry objects.

**Options:**
- `removeComments?: boolean` - strip comments (default: true)
- `minifyWhitespace?: boolean` - reduce blank lines (default: true)
- `extractSignaturesOnly?: boolean` - keep only function/class signatures (default: false)
- `maxFileLines?: number` - truncate long files (default: 100)
- `preserveImports?: boolean` - always keep import statements (default: true)
- `preserveExports?: boolean` - always keep export statements (default: true)
- `preserveTypes?: boolean` - always keep type/interface definitions (default: true)
- `preserveFunctionSignatures?: boolean` - always keep function signatures (default: true)

### Filtering Functions

#### `shouldPreExcludeDir(dirName: string, extra?: string[]): boolean`

Returns true if directory should be excluded from tree/reading.

Pre-excludes: node_modules, .git, __pycache__, .cache, etc.

#### `shouldPreExcludeFile(fileName: string, fileSize: number, maxSize?: number): boolean`

Returns true if file should be pre-filtered (binary, lock file, too large).

#### `matchesAiExclusion(relativePath: string, patterns: string[]): boolean`

Checks if a file path matches AI-returned exclusion patterns.

Supports:
- Exact names: `"dist"`, `".env"`
- Glob extensions: `"*.test.ts"`, `"*.min.js"`
- Folder names in path: `"coverage"` matches `src/coverage/report.html`

## Pre-filtering (always automatic)

These directories are **always** excluded from tree/reading:

```
node_modules, .git, .svn, .hg, __pycache__, .pytest_cache,
.mypy_cache, .cache, .parcel-cache, .turbo, bower_components,
Pods, .gradle, .terraform, and 10+ others
```

These file types are **always** excluded:

```
Binary:  .png, .jpg, .gif, .mp3, .zip, .exe, .so, etc.
Lock:    package-lock.json, yarn.lock, Cargo.lock, poetry.lock, etc.
Config:  (only if matched by AI patterns)
```

## Two-Layer Filtering

```
┌─────────────────────────────────────────────┐
│ Stage 1: Pre-filter (automatic)             │
│ Exclude: node_modules, .git, binaries       │
└──────────────┬────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│ Clean tree → Send to AI for analysis        │
└──────────────┬────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────┐
│ Stage 2: AI filter (your exclusions)        │
│ Patterns: "dist", "*.test.ts", "coverage"   │
└──────────────┬────────────────────────────┘
               │
               ▼
         ┌─────────────┐
         │ Final files │
         │ + context   │
         └─────────────┘
```

## Compression Examples

### Balanced (default for CLI)
```typescript
{
  removeComments: true,
  minifyWhitespace: true,
  maxFileLines: 100,
  preserveImports: true,
  preserveExports: true,
  preserveTypes: true,
}
// Typical: 50% reduction
```

### Aggressive (for large codebases)
```typescript
{
  removeComments: true,
  minifyWhitespace: true,
  extractSignaturesOnly: true,  // Only function/class signatures
  maxFileLines: 50,
  preserveImports: true,
  preserveExports: true,
  preserveTypes: true,
}
// Typical: 70% reduction
```

### Minimal (preserve most code)
```typescript
{
  removeComments: false,
  minifyWhitespace: true,
  maxFileLines: 200,
  preserveImports: true,
  preserveExports: true,
  preserveTypes: true,
}
// Typical: 20-30% reduction
```

## Error Handling

```typescript
try {
  const paths = validatePaths(['./nonexistent']);
} catch (error) {
  // "Path does not exist: ./nonexistent"
}

try {
  const paths = validatePaths(['./package.json']);
} catch (error) {
  // "Path is not a directory: ./package.json"
}
```

## Performance Notes

- **Tree generation:** 10-100ms for typical projects
- **File reading:** 50-500ms depending on total size
- **Compression:** 10-100ms
- **Pre-filtering:** O(1) per file (Set lookups)
- **AI pattern matching:** O(n patterns * m path segments)

For a 10K-file project with 5MB total:
- Uncompressed: 2-3s, 5MB context
- Compressed: 2-3s, 1-2MB context

## Testing

All functions are tested with real filesystem fixtures:

```bash
npm test -- tests/unit/context/gather.test.ts
```

34 tests covering:
- Path validation and isolation
- Pre-filtering (node_modules, binaries, lock files)
- AI exclusion pattern matching
- File content correctness
- Compression ratios
- Tree generation
- Multiple source paths

## Integration with CLI

The CLI uses this module automatically in the `ai` command:

```bash
# With context gathering
excal ai "create a flowchart for login flow" --context ./src --compress

# Multiple contexts
excal ai "diagram the architecture" -c ./src -c ./lib -c ./types

# Disable compression
excal ai "show user service" --context ./src --no-compress
```

The CLI handles:
1. Tree generation
2. Calling your AI for exclusions (via folder-filter.ts)
3. Context gathering
4. Passing markdown to flowchart generation

## Troubleshooting

**Issue: Context is too large**
- Use compression: `compress: true`
- Use aggressive compression: `extractSignaturesOnly: true`
- Increase `maxFileLines` reduction

**Issue: Important files are being excluded**
- Check `aiExcludePatterns` - don't exclude what you need
- Use `matchesAiExclusion()` to test pattern matching
- Exclude specific files, not whole directories

**Issue: Binary files are included**
- Already handled by pre-filter (check `shouldPreExcludeFile`)
- If custom binary types, add to AI exclusions

**Issue: Certain files aren't being read**
- Check file size (`maxFileSize`, default 512KB)
- Check pre-filter list (node_modules, .git, etc.)
- Check AI exclusion patterns

## Future Enhancements

Possible improvements:
- Symbolic link handling
- .gitignore aware filtering
- Incremental reading (cache file hashes)
- Custom language detection
- Streaming output for huge contexts
- Format output as JSON instead of markdown
