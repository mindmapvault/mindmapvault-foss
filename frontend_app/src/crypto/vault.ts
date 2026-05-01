import type { MindMapGraph, MindMapTree } from '../types';
import { aesDecrypt, aesEncrypt, importAesKey } from './aes';
import { deriveTitleKey } from './kdf';
import { fromBase64, toBase64 } from './utils';

const enc = new TextEncoder();
const dec = new TextDecoder();

// ── Title helpers ─────────────────────────────────────────────────────────────

/**
 * Encrypts a plaintext title with the title key (derived from masterKey).
 * Returns a base64 string stored in the backend's `title_encrypted` field.
 */
export async function encryptTitle(title: string, masterKey: Uint8Array): Promise<string> {
  const key = await deriveTitleKey(masterKey);
  const ct = await aesEncrypt(key, enc.encode(title));
  return toBase64(ct);
}

/**
 * Decrypts a base64-encoded encrypted title.
 * Returns the original plaintext string.
 */
export async function decryptTitle(titleB64: string, masterKey: Uint8Array): Promise<string> {
  const key = await deriveTitleKey(masterKey);
  const pt = await aesDecrypt(key, fromBase64(titleB64));
  return dec.decode(pt);
}

// ── Mind map graph blob helpers ───────────────────────────────────────────────

/**
 * Encrypts a MindMapGraph to a binary blob using the given DEK.
 * The blob is uploaded directly to MinIO via a presigned URL.
 */
export async function encryptGraph(graph: MindMapGraph, dek: Uint8Array): Promise<Uint8Array> {
  const key = await importAesKey(dek);
  return aesEncrypt(key, enc.encode(JSON.stringify(graph)));
}

/**
 * Decrypts a binary blob downloaded from MinIO and parses it as a MindMapGraph.
 */
export async function decryptGraph(blob: Uint8Array, dek: Uint8Array): Promise<MindMapGraph> {
  const key = await importAesKey(dek);
  const plaintext = await aesDecrypt(key, blob);
  return JSON.parse(dec.decode(plaintext)) as MindMapGraph;
}

// ── Mind map tree blob helpers ────────────────────────────────────────────────

export async function encryptTree(tree: MindMapTree, dek: Uint8Array): Promise<Uint8Array> {
  const key = await importAesKey(dek);
  return aesEncrypt(key, enc.encode(JSON.stringify(tree)));
}

export async function decryptTree(blob: Uint8Array, dek: Uint8Array): Promise<MindMapTree> {
  const key = await importAesKey(dek);
  const plaintext = await aesDecrypt(key, blob);
  const parsed = JSON.parse(dec.decode(plaintext));
  // Migrate old graph format if needed
  if (!parsed.version || parsed.version !== 'tree') {
    return {
      version: 'tree',
      root: { id: 'root', text: 'Central Topic', children: [], collapsed: false },
    };
  }
  return parsed as MindMapTree;
}
