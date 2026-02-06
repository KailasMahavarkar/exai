import { validatePaths, gatherContext } from "./src/context/index.js"
import { callLLM } from "./src/ai/openrouter.js";

const FILTER_PROMPT = `Given this project tree, return a JSON array of folder/file names to EXCLUDE from code analysis.
Only exclude build artifacts, caches, generated files, and noise, the files which may possibly be noise (remove them as well like .gitignore folder)
Keep source code, configs, and tests.
Return ONLY the JSON array, nothing else. Example: ["dist", ".vscode", "*.lock"]`;

async function main() {
    const paths = validatePaths(['C:/codingFiles/orkait/orka-scheduler']);

    const result = await gatherContext(paths, {
        // manual exclusions (always applied to tree + reading)
        excludePatterns: ['dist', 'coverage', "postman_collection.json"],

        aiFilter: async (tree) => {
            try {
                const response = await callLLM(
                    `${FILTER_PROMPT}\n\n${tree}`,
                    'You are a code analyst. Return ONLY valid JSON.',
                    {
                        temperature: 0,
                        apiKey: process.env.OPENROUTER_API_KEY,
                    },

                );
                return JSON.parse(response.replace(/```json?\n?|\n?```/g, '').trim());
            } catch {
                return []; // fallback: no AI exclusions
            }
        },

        compress: true,
        maxFileSize: 32 * 1024,
        compressOptions: {
            minifyWhitespace: true,
            maxFileLines: 1000,
            removeComments: true,
            preserveImports: true,
            preserveExports: true,
            preserveTypes: true,
            preserveFunctionSignatures: true,
        },
        verbose: true
    });

    console.log(result.tree)
    console.log(`Files: ${result.fileCount}, Size: ${(result.totalSize / 1024).toFixed(1)}KB`);
    console.log(`Excluded: ${result.aiExcludePatterns.join(', ')}`);
}

main();
