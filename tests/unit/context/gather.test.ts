import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  validatePaths,
  gatherTree,
  gatherContext,
  readFiles,
  generateTree,
  shouldPreExcludeDir,
  shouldPreExcludeFile,
  matchesAiExclusion,
  compressFiles,
} from '../../../src/context/index.js';
import type { AiFilterFn } from '../../../src/context/index.js';

function createFixture(name: string): string {
  const root = join(tmpdir(), `excalidraw-ctx-test-${name}-${Date.now()}`);
  mkdirSync(root, { recursive: true });
  return root;
}

// ─── Filter tests ───────────────────────────────────────────────────────────

describe('filter', () => {
  describe('shouldPreExcludeDir', () => {
    it('excludes node_modules', () => {
      expect(shouldPreExcludeDir('node_modules')).toBe(true);
    });

    it('excludes .git', () => {
      expect(shouldPreExcludeDir('.git')).toBe(true);
    });

    it('does not exclude src', () => {
      expect(shouldPreExcludeDir('src')).toBe(false);
    });

    it('respects extra excludes', () => {
      expect(shouldPreExcludeDir('custom-junk', ['custom-junk'])).toBe(true);
    });

    it('excludes __tests__ by default', () => {
      expect(shouldPreExcludeDir('__tests__')).toBe(true);
      expect(shouldPreExcludeDir('__mocks__')).toBe(true);
      expect(shouldPreExcludeDir('__snapshots__')).toBe(true);
      expect(shouldPreExcludeDir('__fixtures__')).toBe(true);
    });

    it('includes __tests__ when allowTestFiles=true', () => {
      expect(shouldPreExcludeDir('__tests__', undefined, true)).toBe(false);
      expect(shouldPreExcludeDir('__mocks__', undefined, true)).toBe(false);
    });
  });

  describe('shouldPreExcludeFile', () => {
    it('excludes package-lock.json', () => {
      expect(shouldPreExcludeFile('package-lock.json', 1000)).toBe(true);
    });

    it('excludes binary files by extension', () => {
      expect(shouldPreExcludeFile('image.png', 1000)).toBe(true);
      expect(shouldPreExcludeFile('archive.zip', 1000)).toBe(true);
    });

    it('excludes files exceeding max size', () => {
      expect(shouldPreExcludeFile('big.ts', 1024 * 1024)).toBe(true);
    });

    it('includes normal code files', () => {
      expect(shouldPreExcludeFile('index.ts', 500, undefined, true)).toBe(false);
      expect(shouldPreExcludeFile('app.py', 500, undefined, true)).toBe(false);
    });

    it('excludes test files by default', () => {
      expect(shouldPreExcludeFile('app.test.ts', 500)).toBe(true);
      expect(shouldPreExcludeFile('app.spec.js', 500)).toBe(true);
      expect(shouldPreExcludeFile('test_utils.py', 500)).toBe(true);
      expect(shouldPreExcludeFile('handler_test.go', 500)).toBe(true);
    });

    it('includes test files when allowTestFiles=true', () => {
      expect(shouldPreExcludeFile('app.test.ts', 500, undefined, true)).toBe(false);
      expect(shouldPreExcludeFile('app.spec.js', 500, undefined, true)).toBe(false);
      expect(shouldPreExcludeFile('test_utils.py', 500, undefined, true)).toBe(false);
    });
  });

  describe('matchesAiExclusion', () => {
    it('matches folder name in path', () => {
      expect(matchesAiExclusion('dist/index.js', ['dist'])).toBe(true);
    });

    it('matches nested folder', () => {
      expect(matchesAiExclusion('src/coverage/report.html', ['coverage'])).toBe(true);
    });

    it('matches glob extension pattern', () => {
      expect(matchesAiExclusion('src/utils.test.ts', ['*.test.ts'])).toBe(true);
    });

    it('does not match unrelated paths', () => {
      expect(matchesAiExclusion('src/index.ts', ['dist', 'coverage'])).toBe(false);
    });
  });
});

// ─── Tree tests ─────────────────────────────────────────────────────────────

describe('generateTree', () => {
  let fixture: string;

  beforeEach(() => {
    fixture = createFixture('tree');
    mkdirSync(join(fixture, 'src'), { recursive: true });
    mkdirSync(join(fixture, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(fixture, 'src', 'index.ts'), 'export default 1;');
    writeFileSync(join(fixture, 'src', 'utils.ts'), 'export const x = 2;');
    writeFileSync(join(fixture, 'node_modules', 'pkg', 'index.js'), 'module.exports = {}');
    writeFileSync(join(fixture, 'README.md'), '# Test');
  });

  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it('generates tree with directory structure', () => {
    const tree = generateTree([fixture]);
    expect(tree).toContain('src');
    expect(tree).toContain('index.ts');
    expect(tree).toContain('README.md');
  });

  it('pre-excludes node_modules from tree', () => {
    const tree = generateTree([fixture]);
    expect(tree).not.toContain('node_modules');
    expect(tree).not.toContain('pkg');
  });
});

// ─── Reader tests ───────────────────────────────────────────────────────────

describe('readFiles', () => {
  let fixtureA: string;
  let fixtureB: string;

  beforeEach(() => {
    fixtureA = createFixture('reader-a');
    mkdirSync(join(fixtureA, 'src'), { recursive: true });
    mkdirSync(join(fixtureA, 'dist'), { recursive: true });
    writeFileSync(join(fixtureA, 'src', 'app.ts'), 'console.log("a");');
    writeFileSync(join(fixtureA, 'src', 'helper.ts'), 'export function help() {}');
    writeFileSync(join(fixtureA, 'dist', 'app.js'), 'compiled code');
    writeFileSync(join(fixtureA, 'package.json'), '{"name":"a"}');

    fixtureB = createFixture('reader-b');
    mkdirSync(join(fixtureB, 'lib'), { recursive: true });
    writeFileSync(join(fixtureB, 'lib', 'main.py'), 'print("b")');
    writeFileSync(join(fixtureB, 'config.yaml'), 'key: value');
  });

  afterEach(() => {
    rmSync(fixtureA, { recursive: true, force: true });
    rmSync(fixtureB, { recursive: true, force: true });
  });

  it('reads files only from specified path', () => {
    const result = readFiles([fixtureA]);
    const paths = result.files.map(f => f.relativePath);

    expect(paths).toContain(join('src', 'app.ts'));
    expect(paths).toContain(join('src', 'helper.ts'));

    const allContent = result.files.map(f => f.content).join('');
    expect(allContent).not.toContain('print("b")');
  });

  it('reads files from multiple specified paths', () => {
    const result = readFiles([fixtureA, fixtureB]);
    const allContent = result.files.map(f => f.content).join('');

    expect(allContent).toContain('console.log("a")');
    expect(allContent).toContain('print("b")');
  });

  it('applies AI exclusion patterns', () => {
    const result = readFiles([fixtureA], { aiExcludePatterns: ['dist'] });
    const paths = result.files.map(f => f.relativePath);

    expect(paths).toContain(join('src', 'app.ts'));
    expect(paths).not.toContain(join('dist', 'app.js'));
  });

  it('skips binary files automatically', () => {
    writeFileSync(join(fixtureA, 'logo.png'), 'fake-binary');
    const result = readFiles([fixtureA]);
    const paths = result.files.map(f => f.relativePath);

    expect(paths).not.toContain('logo.png');
  });

  it('skips lock files automatically', () => {
    writeFileSync(join(fixtureA, 'package-lock.json'), '{}');
    const result = readFiles([fixtureA]);
    const paths = result.files.map(f => f.relativePath);

    expect(paths).not.toContain('package-lock.json');
  });

  it('skips node_modules automatically', () => {
    mkdirSync(join(fixtureA, 'node_modules', 'dep'), { recursive: true });
    writeFileSync(join(fixtureA, 'node_modules', 'dep', 'index.js'), 'noise');

    const result = readFiles([fixtureA]);
    const allContent = result.files.map(f => f.content).join('');

    expect(allContent).not.toContain('noise');
  });

  it('file content matches the actual file on disk', () => {
    const result = readFiles([fixtureA]);
    const appFile = result.files.find(f => f.relativePath === join('src', 'app.ts'));

    expect(appFile).toBeDefined();
    expect(appFile!.content).toBe('console.log("a");');
  });
});

// ─── Compression tests ─────────────────────────────────────────────────────

describe('compressFiles', () => {
  it('reduces size by removing comments', () => {
    const files = [{
      relativePath: 'src/app.ts',
      absolutePath: '/fake/src/app.ts',
      content: [
        '// This is a comment',
        '/* block comment */',
        'const x = 1;',
        'const y = 2; // inline comment',
      ].join('\n'),
      size: 0,
      language: 'typescript',
    }];
    files[0].size = Buffer.byteLength(files[0].content);

    const result = compressFiles(files, { removeComments: true });

    expect(result.files[0].content).not.toContain('This is a comment');
    expect(result.files[0].content).not.toContain('block comment');
    expect(result.files[0].content).toContain('const x = 1;');
    expect(result.compressionRatio).toBeGreaterThan(0);
  });

  it('returns files unchanged when no options enabled', () => {
    const files = [{
      relativePath: 'readme.md',
      absolutePath: '/fake/readme.md',
      content: '# Hello',
      size: 7,
      language: 'markdown',
    }];

    const result = compressFiles(files, {
      removeComments: false,
      minifyWhitespace: false,
      maxFileLines: 9999,
    });

    expect(result.files[0].content).toContain('# Hello');
  });
});

// ─── Full pipeline tests (gatherContext) ────────────────────────────────────

describe('gatherContext', () => {
  let fixture: string;

  beforeEach(() => {
    fixture = createFixture('gather');
    mkdirSync(join(fixture, 'src'), { recursive: true });
    mkdirSync(join(fixture, 'tests'), { recursive: true });
    mkdirSync(join(fixture, 'dist'), { recursive: true });
    mkdirSync(join(fixture, 'coverage'), { recursive: true });
    writeFileSync(join(fixture, 'src', 'index.ts'), 'export const main = () => {};');
    writeFileSync(join(fixture, 'src', 'utils.ts'), 'export const add = (a: number, b: number) => a + b;');
    writeFileSync(join(fixture, 'tests', 'index.test.ts'), 'test("works", () => {});');
    writeFileSync(join(fixture, 'dist', 'index.js'), 'compiled output');
    writeFileSync(join(fixture, 'coverage', 'lcov.info'), 'coverage data');
    writeFileSync(join(fixture, 'tsconfig.json'), '{"compilerOptions":{}}');
  });

  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it('produces markdown containing source files', async () => {
    const result = await gatherContext([fixture], { allowTestFiles: true });

    expect(result.markdown).toContain('index.ts');
    expect(result.markdown).toContain('export const main');
    expect(result.fileCount).toBeGreaterThan(0);
  });

  it('applies manual excludePatterns to skip dist folder', async () => {
    const result = await gatherContext([fixture], {
      excludePatterns: ['dist'],
    });

    expect(result.markdown).toContain('export const main');
    expect(result.markdown).not.toContain('compiled output');
  });

  it('excludePatterns also removes dirs from tree', async () => {
    const result = await gatherContext([fixture], {
      excludePatterns: ['dist', 'coverage'],
    });

    // dist and coverage should not appear in the tree
    expect(result.tree).not.toContain('dist');
    expect(result.tree).not.toContain('coverage');
    // src should still be there
    expect(result.tree).toContain('src');
  });

  it('AI sees tree WITHOUT manually excluded dirs', async () => {
    let treeSeenByAi = '';
    const mockAiFilter: AiFilterFn = async (tree) => {
      treeSeenByAi = tree;
      return [];
    };

    await gatherContext([fixture], {
      excludePatterns: ['dist'],
      aiFilter: mockAiFilter,
      allowTestFiles: true,
    });

    // AI should NOT see dist (manually excluded)
    expect(treeSeenByAi).not.toContain('dist');
    // AI should still see everything else
    expect(treeSeenByAi).toContain('src');
    expect(treeSeenByAi).toContain('tests');
    expect(treeSeenByAi).toContain('coverage');
  });

  it('includes tree structure in output', async () => {
    const result = await gatherContext([fixture], { allowTestFiles: true });

    expect(result.tree).toContain('src');
    expect(result.markdown).toContain('Project Structure');
  });

  it('compresses when compress=true', async () => {
    const uncompressed = await gatherContext([fixture], { compress: false, allowTestFiles: true });
    const compressed = await gatherContext([fixture], { compress: true, allowTestFiles: true });

    expect(compressed.compression).toBeDefined();
    expect(compressed.compression!.ratio).toBeGreaterThanOrEqual(0);
  });

  it('returns timing information', async () => {
    const result = await gatherContext([fixture]);

    expect(result.timing.treeMs).toBeGreaterThanOrEqual(0);
    expect(result.timing.filterMs).toBeGreaterThanOrEqual(0);
    expect(result.timing.readMs).toBeGreaterThanOrEqual(0);
    expect(result.timing.totalMs).toBeGreaterThanOrEqual(0);
  });

  // ── AI filter pipeline tests ──────────────────────────────────────────────

  it('calls aiFilter with the pre-filtered tree', async () => {
    const mockAiFilter = vi.fn<AiFilterFn>(async (_tree) => []);

    await gatherContext([fixture], { aiFilter: mockAiFilter, allowTestFiles: true });

    // aiFilter was called exactly once
    expect(mockAiFilter).toHaveBeenCalledOnce();

    // It received the tree string (which should contain "src" but not "node_modules")
    const treeArg = mockAiFilter.mock.calls[0][0];
    expect(treeArg).toContain('src');
    expect(treeArg).not.toContain('node_modules');
  });

  it('aiFilter exclusions are applied to file reading AND tree', async () => {
    // Mock AI says: exclude "dist" and "coverage"
    const mockAiFilter: AiFilterFn = async (_tree) => ['dist', 'coverage'];

    const result = await gatherContext([fixture], { aiFilter: mockAiFilter, allowTestFiles: true });

    // Files excluded
    expect(result.markdown).toContain('export const main');   // src/index.ts kept
    expect(result.markdown).not.toContain('compiled output');  // dist/index.js excluded
    expect(result.markdown).not.toContain('coverage data');    // coverage/lcov.info excluded
    expect(result.aiExcludePatterns).toEqual(['dist', 'coverage']);

    // Tree also reflects AI exclusions
    expect(result.tree).not.toContain('dist');
    expect(result.tree).not.toContain('coverage');
    expect(result.tree).toContain('src');
  });

  it('aiFilter can exclude by glob pattern', async () => {
    // Mock AI says: exclude all test files
    const mockAiFilter: AiFilterFn = async (_tree) => ['*.test.ts'];

    const result = await gatherContext([fixture], { aiFilter: mockAiFilter, allowTestFiles: true });

    expect(result.markdown).toContain('export const main');       // src/index.ts kept
    expect(result.markdown).not.toContain('test("works"');        // tests/index.test.ts excluded
  });

  it('aiFilter receives tree that reflects the actual directory', async () => {
    // The tree should contain the fixture's real structure
    let receivedTree = '';
    const mockAiFilter: AiFilterFn = async (tree) => {
      receivedTree = tree;
      return [];
    };

    await gatherContext([fixture], { aiFilter: mockAiFilter, allowTestFiles: true });

    // Tree should contain all non-pre-filtered dirs
    expect(receivedTree).toContain('src');
    expect(receivedTree).toContain('dist');
    expect(receivedTree).toContain('tests');
    expect(receivedTree).toContain('coverage');
    expect(receivedTree).toContain('tsconfig.json');
  });

  it('without aiFilter or patterns, reads everything (only pre-filter)', async () => {
    const result = await gatherContext([fixture], { allowTestFiles: true });

    // Everything except pre-filtered stuff should be present
    expect(result.markdown).toContain('export const main');   // src
    expect(result.markdown).toContain('compiled output');      // dist (not pre-filtered)
    expect(result.markdown).toContain('coverage data');        // coverage (not pre-filtered)
    expect(result.aiExcludePatterns).toEqual([]);
  });

  it('filterMs is non-zero when aiFilter is provided', async () => {
    const mockAiFilter: AiFilterFn = async (_tree) => {
      // Simulate some processing time
      await new Promise(r => setTimeout(r, 5));
      return ['dist'];
    };

    const result = await gatherContext([fixture], { aiFilter: mockAiFilter, allowTestFiles: true });

    expect(result.timing.filterMs).toBeGreaterThan(0);
  });

  it('manual and AI exclusions combine together', async () => {
    // Manual: exclude "dist"
    // AI: exclude "*.test.ts"
    const mockAiFilter: AiFilterFn = async (_tree) => ['*.test.ts'];

    const result = await gatherContext([fixture], {
      excludePatterns: ['dist'],
      aiFilter: mockAiFilter,
      allowTestFiles: true,
    });

    expect(result.markdown).toContain('export const main');   // src/index.ts kept
    expect(result.markdown).not.toContain('compiled output');  // dist excluded (manual)
    expect(result.markdown).not.toContain('test("works"');     // *.test.ts excluded (AI)
    expect(result.aiExcludePatterns).toEqual(['dist', '*.test.ts']);
  });

  it('filterMs is zero when no aiFilter is provided', async () => {
    const result = await gatherContext([fixture], {
      excludePatterns: ['dist'],
    });

    expect(result.timing.filterMs).toBe(0);
  });

  // ── allowTestFiles tests ──────────────────────────────────────────────────

  it('excludes test files by default (allowTestFiles=false)', async () => {
    const result = await gatherContext([fixture]);

    // test file should be excluded
    expect(result.markdown).not.toContain('test("works"');
    // tree should not show test file
    expect(result.tree).not.toContain('index.test.ts');
    // source files still present
    expect(result.markdown).toContain('export const main');
  });

  it('includes test files when allowTestFiles=true', async () => {
    const result = await gatherContext([fixture], { allowTestFiles: true });

    expect(result.markdown).toContain('test("works"');
    expect(result.tree).toContain('index.test.ts');
  });

  it('AI never sees test files when allowTestFiles=false', async () => {
    let treeSeenByAi = '';
    const mockAiFilter: AiFilterFn = async (tree) => {
      treeSeenByAi = tree;
      return [];
    };

    await gatherContext([fixture], { aiFilter: mockAiFilter });

    expect(treeSeenByAi).not.toContain('index.test.ts');
    expect(treeSeenByAi).toContain('src');
  });

  it('excludes Python test files by default', async () => {
    // Create Python test files
    writeFileSync(join(fixture, 'src', 'test_utils.py'), 'def test_add(): pass');
    writeFileSync(join(fixture, 'src', 'utils_test.py'), 'def test_sub(): pass');
    writeFileSync(join(fixture, 'src', 'utils.py'), 'def add(a, b): return a + b');

    const result = await gatherContext([fixture]);

    expect(result.markdown).not.toContain('test_add');
    expect(result.markdown).not.toContain('test_sub');
    expect(result.markdown).toContain('def add');
  });

  it('excludes Go test files by default', async () => {
    writeFileSync(join(fixture, 'src', 'handler_test.go'), 'func TestHandler(t *testing.T) {}');
    writeFileSync(join(fixture, 'src', 'handler.go'), 'func Handler() {}');

    const result = await gatherContext([fixture]);

    expect(result.markdown).not.toContain('TestHandler');
    expect(result.markdown).toContain('func Handler');
  });

  it('excludes __tests__ directory by default', async () => {
    mkdirSync(join(fixture, '__tests__'), { recursive: true });
    writeFileSync(join(fixture, '__tests__', 'app.js'), 'describe("app", () => {})');

    const result = await gatherContext([fixture]);

    expect(result.tree).not.toContain('__tests__');
    expect(result.markdown).not.toContain('describe("app"');
  });
});

// ─── validatePaths tests ────────────────────────────────────────────────────

describe('validatePaths', () => {
  let fixture: string;

  beforeEach(() => {
    fixture = createFixture('validate');
    writeFileSync(join(fixture, 'file.txt'), 'hello');
  });

  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it('returns absolute paths for valid directories', () => {
    const result = validatePaths([fixture]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(fixture);
  });

  it('throws for non-existent path', () => {
    expect(() => validatePaths(['/nonexistent/path/xyz'])).toThrow('does not exist');
  });

  it('throws for file path (not directory)', () => {
    expect(() => validatePaths([join(fixture, 'file.txt')])).toThrow('not a directory');
  });
});

// ─── gatherTree tests ──────────────────────────────────────────────────────

describe('gatherTree', () => {
  let fixture: string;

  beforeEach(() => {
    fixture = createFixture('gatherTree');
    mkdirSync(join(fixture, 'src'), { recursive: true });
    mkdirSync(join(fixture, 'node_modules', 'dep'), { recursive: true });
    writeFileSync(join(fixture, 'src', 'main.ts'), 'code');
    writeFileSync(join(fixture, 'node_modules', 'dep', 'index.js'), 'dep code');
  });

  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it('returns tree without node_modules', () => {
    const { tree } = gatherTree([fixture]);

    expect(tree).toContain('src');
    expect(tree).toContain('main.ts');
    expect(tree).not.toContain('node_modules');
  });

  it('returns timing info', () => {
    const { timeMs } = gatherTree([fixture]);
    expect(timeMs).toBeGreaterThanOrEqual(0);
  });
});
