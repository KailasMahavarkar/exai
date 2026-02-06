export { validatePaths, gatherTree, gatherContext } from './gather.js';
export type { AiFilterFn, GatherOptions, GatherResult } from './gather.js';

// File reading
export { readFiles, formatAsMarkdown } from './reader.js';
export type { FileEntry, ReadResult, ReadOptions } from './reader.js';

// Tree generation
export { generateTree } from './tree.js';
export type { TreeOptions } from './tree.js';

// Compression
export { compressFiles } from './compress.js';
export type { CompressOptions, CompressResult } from './compress.js';

// Filtering
export { shouldPreExcludeDir, shouldPreExcludeFile, shouldPreExcludeFileName, matchesAiExclusion } from './filter.js';
