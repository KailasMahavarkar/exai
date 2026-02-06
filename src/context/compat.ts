/**
 * Re-exports from node built-ins.
 * Exists so gather.ts can import path/fs utils from one place,
 * and tests can verify imports without mocking node internals.
 */

export { resolve, basename } from 'path';
export { existsSync, statSync } from 'fs';
