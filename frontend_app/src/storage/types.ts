// ── Storage adapter interface ─────────────────────────────────────────────────
//
// Both server-mode and local-mode implement this interface so the UI code
// doesn't need to know which backend it's talking to.

import type {
  MindMapCreatedResponse,
  MindMapDetail,
  MindMapListItem,
  StorageSummary,
  UpdateVaultMetaRequest,
  UpsertMindMapRequest,
} from '../types';

export interface StorageAdapter {
  /** List all vaults for the current user. */
  listVaults(): Promise<MindMapListItem[]>;

  /** Get full metadata for a single vault. */
  getVault(id: string): Promise<MindMapDetail>;

  /** Create a new vault. Returns id + upload mechanism. */
  createVault(body: UpsertMindMapRequest): Promise<MindMapCreatedResponse>;

  /** Update vault KEM envelope (before re-uploading the blob). */
  updateVault(id: string, body: UpsertMindMapRequest): Promise<void>;

  /** Delete a vault and its blob. */
  deleteVault(id: string): Promise<void>;

  /** Upload the encrypted blob for a vault. */
  uploadBlob(id: string, blob: Uint8Array): Promise<void>;

  /** Download the encrypted blob for a vault. */
  downloadBlob(id: string): Promise<Uint8Array>;

  /** Update display metadata (color, note, max_versions, title). */
  updateMeta(id: string, body: UpdateVaultMetaRequest): Promise<void>;

  /** Get storage summary (optional — local mode calculates from fs). */
  getStorage(): Promise<StorageSummary>;
}
