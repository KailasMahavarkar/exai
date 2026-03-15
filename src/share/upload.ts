/**
 * Share .excalidraw files via excalidraw.com.
 *
 * Compresses with zlib, encrypts with AES-GCM (128-bit),
 * uploads to excalidraw.com JSON API, returns shareable URL.
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

  // Validate it's valid JSON
  try {
    JSON.parse(content);
  } catch {
    throw new Error('File is not valid JSON. Only .excalidraw files can be shared.');
  }

  if (options?.verbose) {
    console.log(`  File size: ${(stat.size / 1024).toFixed(1)}KB`);
  }

  // Compress
  const compressed = deflateSync(Buffer.from(content, 'utf-8'));
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

  // Combine IV + ciphertext
  const payload = new Uint8Array(iv.length + encrypted.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(encrypted), iv.length);

  if (options?.verbose) {
    console.log(`  Encrypted: ${(payload.length / 1024).toFixed(1)}KB`);
  }

  // Upload
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
    const rawKey = await subtle.exportKey('raw', key);
    const keyB64 = bufferToBase64Url(new Uint8Array(rawKey));
    return {
      url: `${EXCALIDRAW_BASE}/#json=${retryData.id},${keyB64}`,
      id: retryData.id,
      key: keyB64,
    };
  }

  const data = (await response.json()) as { id: string };

  // Export key as base64url
  const rawKey = await subtle.exportKey('raw', key);
  const keyB64 = bufferToBase64Url(new Uint8Array(rawKey));

  return {
    url: `${EXCALIDRAW_BASE}/#json=${data.id},${keyB64}`,
    id: data.id,
    key: keyB64,
  };
}

function bufferToBase64Url(buffer: Uint8Array): string {
  let binary = '';
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
