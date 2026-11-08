/**
 * Preview thumbnails of local vaults, encrypted on disk.
 *
 * The lobby draws each vault's thumbnail from the decrypted map. Server mode
 * keeps that thumbnail as an encrypted attachment on the server and reads it
 * back when the lobby opens; local mode had nothing of the kind and, until
 * 0.6.8, fell back to a plaintext cache in `localStorage`
 * (GHSA-3fq6-35q6-xcp9). This is the local counterpart: both theme variants,
 * the stats and the `updated_at` they belong to go into one JSON document,
 * AES-GCM under the preview key kept inside the encrypted lobby metadata
 * (`LobbyMeta.previewKey`), written as one more file beside the vault's
 * attachments. The lobby decrypts it on open and fills the session cache.
 *
 * The key never leaves the lobby metadata blob, which a password change
 * re-encrypts, so the preview files need no rotation of their own. Without an
 * unlocked profile there is no key and nothing is written.
 */

import { aesDecrypt, aesEncrypt } from '../crypto/aes';
import { readLocalVaultPreviewFile, writeLocalVaultPreviewFile } from '../storage/localAttachments';
import { useLobbyMetaStore } from '../store/lobbyMeta';
import type { MindMapTree } from '../types';
import type { VaultPreviewTheme } from './sessionCache';
import {
  loadCachedVaultPreview,
  restoreVaultPreviews,
  saveTreeVaultPreview,
  type VaultPreviewSummary,
} from './vaultPreview';

interface StoredLocalVaultPreview {
  version: 1;
  updated_at: string;
  dark?: VaultPreviewSummary;
  light?: VaultPreviewSummary;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Writes the previews the session cache holds for `updatedAt` to the vault's
 * encrypted preview file. Quiet on failure: the session cache still has them,
 * and the next save tries again.
 */
export async function persistLocalVaultPreview(vaultId: string, updatedAt: string): Promise<void> {
  try {
    const key = await useLobbyMetaStore.getState().ensurePreviewKey();
    if (!key) return;
    const dark = loadCachedVaultPreview(vaultId, updatedAt, 'dark');
    const light = loadCachedVaultPreview(vaultId, updatedAt, 'light');
    if (!dark && !light) return;
    const payload: StoredLocalVaultPreview = {
      version: 1,
      updated_at: updatedAt,
      ...(dark ? { dark } : {}),
      ...(light ? { light } : {}),
    };
    const ciphertext = await aesEncrypt(key, enc.encode(JSON.stringify(payload)));
    await writeLocalVaultPreviewFile(vaultId, ciphertext);
  } catch {
    // Disk or crypto trouble must not fail the save that triggered this.
  }
}

/** Renders a local vault's previews into the session cache and writes them to its encrypted file. */
export async function saveLocalVaultPreview(vaultId: string, updatedAt: string, tree: MindMapTree): Promise<VaultPreviewSummary> {
  const summary = await saveTreeVaultPreview(vaultId, updatedAt, tree);
  await persistLocalVaultPreview(vaultId, updatedAt);
  return summary;
}

function isSummary(value: unknown): value is VaultPreviewSummary {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.image_data_url === 'string'
    && v.image_data_url.startsWith('data:image/svg+xml')
    && typeof v.updated_at === 'string'
    && typeof v.nodeCount === 'number';
}

/**
 * Reads a local vault's encrypted preview file into the session cache and
 * returns the preview for `theme`, or null when there is no file, it belongs
 * to another save than `updatedAt`, or it cannot be decrypted.
 */
export async function restoreLocalVaultPreview(
  vaultId: string,
  updatedAt: string,
  theme: VaultPreviewTheme,
): Promise<VaultPreviewSummary | null> {
  try {
    const key = await useLobbyMetaStore.getState().ensurePreviewKey();
    if (!key) return null;
    const ciphertext = await readLocalVaultPreviewFile(vaultId);
    if (!ciphertext) return null;
    const parsed = JSON.parse(dec.decode(await aesDecrypt(key, ciphertext))) as Partial<StoredLocalVaultPreview>;
    if (parsed.version !== 1 || parsed.updated_at !== updatedAt) return null;
    const previews: Partial<Record<VaultPreviewTheme, VaultPreviewSummary>> = {};
    if (isSummary(parsed.dark)) previews.dark = parsed.dark;
    if (isSummary(parsed.light)) previews.light = parsed.light;
    restoreVaultPreviews(vaultId, previews);
    return loadCachedVaultPreview(vaultId, updatedAt, theme);
  } catch {
    return null;
  }
}
