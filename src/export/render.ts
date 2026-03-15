/**
 * Export .excalidraw files to PNG or SVG using Puppeteer + @excalidraw/utils.
 *
 * Launches a headless browser, loads @excalidraw/utils from esm.sh CDN,
 * and renders the diagram to the requested format.
 */

import puppeteer from 'puppeteer';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, basename, extname, join } from 'path';

// FileReader is a browser-only API used inside page.evaluate (browser context).
// This declaration prevents TS errors without adding "DOM" to tsconfig lib.
declare const FileReader: {
  new (): {
    onloadend: (() => void) | null;
    result: string | ArrayBuffer | null;
    readAsDataURL(blob: Blob): void;
  };
};

export interface ExportOptions {
  format: 'png' | 'svg';
  output?: string;
}

export async function exportExcalidraw(inputPath: string, options: ExportOptions): Promise<string> {
  // Determine output path
  const outputPath =
    options.output ??
    join(dirname(inputPath), basename(inputPath, extname(inputPath)) + `.${options.format}`);

  // Read excalidraw file
  const excalidrawJson = readFileSync(inputPath, 'utf-8');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Navigate to a blank page (needed for ESM imports from CDN)
    await page.setContent('<html><body></body></html>', { waitUntil: 'domcontentloaded' });

    if (options.format === 'svg') {
      const svgString = await page.evaluate(async (json: string) => {
        // Runs in browser context — imports from CDN
        const mod = await Function('return import("https://esm.sh/@excalidraw/utils@0.1.2")')();
        const utils = mod.default || mod;
        const data = JSON.parse(json);
        const svg = await utils.exportToSvg({
          elements: data.elements,
          appState: { ...data.appState, exportBackground: true },
          files: data.files || {},
        });
        return svg.outerHTML as string;
      }, excalidrawJson);

      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, svgString, 'utf-8');
    } else {
      // PNG
      const pngBase64 = await page.evaluate(async (json: string) => {
        const mod = await Function('return import("https://esm.sh/@excalidraw/utils@0.1.2")')();
        const utils = mod.default || mod;
        const data = JSON.parse(json);
        const blob = await utils.exportToBlob({
          elements: data.elements,
          appState: { ...data.appState, exportBackground: true },
          files: data.files || {},
          mimeType: 'image/png',
        });
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      }, excalidrawJson);

      // Strip data URL prefix and decode
      const base64Data = pngBase64.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, buffer);
    }

    return outputPath;
  } finally {
    await browser.close();
  }
}
