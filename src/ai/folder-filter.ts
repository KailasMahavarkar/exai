/**
 * Folder Filter - Uses lightweight AI to intelligently exclude folders from context
 *
 * Uses callLLM() from openrouter.ts as the base API call.
 */

import { DEFAULT_MODEL } from "./contants.js";
import { callLLM } from './openrouter.js';

const FILTER_SYSTEM_PROMPT = `You are an expert code analyst. Analyze the given project structure and identify which folders should be EXCLUDED from code analysis to reduce context size while preserving important source code.

ANALYSIS RULES:
1. ALWAYS exclude: node_modules, .git, venv, __pycache__, build artifacts, dist, out, coverage, .next, .nuxt
2. ALWAYS exclude: dependency caches (.npm, .yarn, Pods, vendor for PHP)
3. ALWAYS exclude: IDE/editor files (.vscode, .idea, .env files)
4. ALWAYS exclude: lock files and temporary files
5. KEEP: src, lib, app, components, pages - source code folders
6. KEEP: config files in root (package.json, tsconfig.json, etc)
7. KEEP: tests if they help understand code structure
8. KEEP: docs, README, and similar documentation

OUTPUT FORMAT:
Return ONLY a JSON array of simple glob patterns for folders/files to EXCLUDE.
Use simple folder/file names without regex. The tool will convert them to proper patterns.
Example:
["node_modules", "dist", ".git", "coverage", ".vscode", ".idea", ".env", "*.lock"]

IMPORTANT: Do NOT use regex escape sequences like \\. - just use plain names like ".git" not "\\.git"

Do NOT include explanations or other text. ONLY the JSON array.`;

interface FilterResult {
  excludePatterns: string[];
  analysisTime: number;
  fromCache?: boolean;
}

/**
 * Ask AI model to filter folders from a tree structure.
 * Uses callLLM() as the underlying API call.
 */
export async function filterFolders(
  treeStructure: string,
  apiKey?: string,
  model: string = DEFAULT_MODEL,
  verbose: boolean = false,
  useCache: boolean = true,
  timeoutMs?: number,
): Promise<FilterResult> {
  const startTime = Date.now();

  const userMessage = `Analyze this project structure and suggest folders to exclude:\n\n${treeStructure}`;

  const output = await callLLM(userMessage, FILTER_SYSTEM_PROMPT, {
    apiKey,
    model,
    temperature: 0,
    verbose,
    useCache,
    cacheFormat: 'folder-filter',
    timeoutMs,
  });

  // Parse JSON output
  let excludePatterns: string[];
  try {
    let cleaned = output.replace(/```json\n?|\n?```/g, '').trim();

    // Extract JSON array from response
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      cleaned = arrayMatch[0];
    }

    // Fix common AI mistakes: single backslashes in JSON strings
    cleaned = cleaned.replace(/\\([^"\\/bfnrtu])/g, '$1');

    excludePatterns = JSON.parse(cleaned);

    if (!Array.isArray(excludePatterns)) {
      throw new Error('Expected array of patterns');
    }

    if (!excludePatterns.every((p) => typeof p === 'string')) {
      throw new Error('All patterns must be strings');
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Failed to parse filter response as JSON.\nGot: ${output}\n\nError: ${error.message}`
      );
    }
    throw error;
  }

  const analysisTime = Date.now() - startTime;

  return {
    excludePatterns,
    analysisTime,
    fromCache: false,
  };
}
