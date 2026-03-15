/**
 * Renders D2 source to SVG/PNG by shelling out to the d2 binary.
 */

import { writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { nanoid } from 'nanoid';

export interface D2RenderConfig {
  d2Source: string;
  outputPath: string;
  theme?: number;
  layout?: 'dagre' | 'elk';
  sketch?: boolean;
  pad?: number;
  verbose?: boolean;
}

export function checkD2Installed(): boolean {
  try {
    execSync('d2 --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function renderD2(config: D2RenderConfig): string {
  if (!checkD2Installed()) {
    throw new Error(
      'D2 is not installed.\n' +
      'Install it from: https://d2lang.com/tour/install\n' +
      '  curl -fsSL https://d2lang.com/install.sh | sh'
    );
  }

  const tempFile = join(tmpdir(), `exai-${nanoid(8)}.d2`);

  try {
    writeFileSync(tempFile, config.d2Source, 'utf-8');

    const args: string[] = [];
    if (config.theme !== undefined) args.push(`--theme=${config.theme}`);
    if (config.layout) args.push(`--layout=${config.layout}`);
    if (config.sketch) args.push('--sketch');
    if (config.pad !== undefined) args.push(`--pad=${config.pad}`);

    const cmd = `d2 ${args.join(' ')} "${tempFile}" "${config.outputPath}"`;

    if (config.verbose) {
      console.log(`  Running: ${cmd}`);
    }

    execSync(cmd, {
      stdio: config.verbose ? 'inherit' : 'ignore',
      timeout: 30000,
    });

    return config.outputPath;
  } finally {
    try { unlinkSync(tempFile); } catch { /* ignore cleanup errors */ }
  }
}
