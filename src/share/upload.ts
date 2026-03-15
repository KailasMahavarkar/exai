/**
 * Share .excalidraw files via excalidraw.com.
 *
 * Uses the concatBuffers wire format that excalidraw.com expects:
 *   Inner data = concatBuffers(fileMetadata='{}', sceneJSON)
 *   Compress inner data with zlib deflate
 *   Encrypt with AES-GCM 128-bit
 *   Outer payload = concatBuffers(encodingMeta, iv, ciphertext)
 *   Upload outer payload, export key as JWK for URL
 *
 * Uses Node.js built-in crypto.webcrypto + zlib — no extra dependencies.
 */

import { readFileSync, statSync } from 'fs';
import { deflateSync } from 'zlib';
import { webcrypto } from 'crypto';

const EXCALIDRAW_API = 'https://json.excalidraw.com/api/v2/post/';
const EXCALIDRAW_BASE = 'https://excalidraw.com';
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2MB warning threshold

export interface ShareResult {
  url: string;
  id: string;
  key: string;
}

export interface ShareOptions {
  verbose?: boolean;
}

/**
 * Build concatBuffers format: [4-byte version=1][4-byte len][chunk]...
 * Each chunk is prefixed with its 4-byte length (big-endian).
 */
function concatBuffers(...buffers: Uint8Array[]): Uint8Array {
  // Calculate total size: 4 bytes version + (4 bytes length + data) per buffer
  let totalSize = 4; // version header
  for (const buf of buffers) {
    totalSize += 4 + buf.length;
  }

  const result = new Uint8Array(totalSize);
  const view = new DataView(result.buffer);

  // Version = 1
  view.setUint32(0, 1, false); // big-endian
  let offset = 4;

  for (const buf of buffers) {
    view.setUint32(offset, buf.length, false); // big-endian
    offset += 4;
    result.set(buf, offset);
    offset += buf.length;
  }

  return result;
}

/**
 * Share an .excalidraw file. Returns the shareable URL.
 */
export async function shareExcalidraw(
  filePath: string,
  options?: ShareOptions
): Promise<ShareResult> {
  // Read and validate
  const stat = statSync(filePath);
  if (stat.size > MAX_SIZE_BYTES) {
    console.warn(
      `Warning: File is ${(stat.size / 1024 / 1024).toFixed(1)}MB — large files may fail to upload.`
    );
  }

  const content = readFileSync(filePath, 'utf-8');

  // Validate it's valid JSON and build proper scene
  let scene: Record<string, unknown>;
  try {
    scene = JSON.parse(content);
  } catch {
    throw new Error('File is not valid JSON. Only .excalidraw files can be shared.');
  }

  // Ensure files: {} is present in the scene
  if (!('files' in scene)) {
    scene.files = {};
  }

  const sceneJSON = JSON.stringify(scene);

  if (options?.verbose) {
    console.log(`  File size: ${(stat.size / 1024).toFixed(1)}KB`);
  }

  // Build inner data using concatBuffers format
  const fileMetadata = new TextEncoder().encode('{}');
  const sceneData = new TextEncoder().encode(sceneJSON);
  const innerData = concatBuffers(fileMetadata, sceneData);

  // Compress inner data with zlib deflate
  const compressed = deflateSync(Buffer.from(innerData));
  if (options?.verbose) {
    console.log(
      `  Compressed: ${(compressed.length / 1024).toFixed(1)}KB (${((1 - compressed.length / stat.size) * 100).toFixed(0)}% reduction)`
    );
  }

  // Encrypt with AES-GCM 128-bit
  const subtle = webcrypto.subtle;
  const key = await subtle.generateKey({ name: 'AES-GCM', length: 128 }, true, ['encrypt']);

  const iv = webcrypto.getRandomValues(new Uint8Array(12));

  const encrypted = await subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed);

  // Build encoding metadata
  const encodingMeta = new TextEncoder().encode(
    JSON.stringify({ version: 2, compression: 'pako@1', encryption: 'AES-GCM' })
  );

  // Outer payload = concatBuffers(encodingMeta, iv, ciphertext)
  const payload = concatBuffers(encodingMeta, iv, new Uint8Array(encrypted));

  if (options?.verbose) {
    console.log(`  Encrypted: ${(payload.length / 1024).toFixed(1)}KB`);
  }

  // Export key as JWK and use jwk.k for the URL
  const jwk = await subtle.exportKey('jwk', key);
  const keyString = jwk.k!;

  // Upload
  const result = await uploadPayload(payload, keyString, options);
  return result;
}

async function uploadPayload(
  payload: Uint8Array,
  keyString: string,
  options?: ShareOptions
): Promise<ShareResult> {
  const response = await fetch(EXCALIDRAW_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: payload,
  });

  if (!response.ok) {
    // Retry once
    if (options?.verbose) {
      console.log(`  Upload failed (${response.status}), retrying...`);
    }
    const retry = await fetch(EXCALIDRAW_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload,
    });
    if (!retry.ok) {
      throw new Error(`Upload failed: ${retry.status} ${retry.statusText}`);
    }
    const retryData = (await retry.json()) as { id: string };
    return {
      url: `${EXCALIDRAW_BASE}/#json=${retryData.id},${keyString}`,
      id: retryData.id,
      key: keyString,
    };
  }

  const data = (await response.json()) as { id: string };

  return {
    url: `${EXCALIDRAW_BASE}/#json=${data.id},${keyString}`,
    id: data.id,
    key: keyString,
  };
}
