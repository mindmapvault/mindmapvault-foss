// ── Local-mode storage adapter ───────────────────────────────────────────────
//
// Uses Tauri invoke() commands to read/write encrypted files on disk.
// Only available when running inside the Tauri desktop shell.

import type {
  MindMapCreatedResponse,
  MindMapDetail,
  MindMapListItem,
  StorageSummary,
  UpdateVaultMetaRequest,
  UpsertMindMapRequest,
} from '../types';
import type { StorageAdapter } from './types';

// Lazy import — only resolves when running inside Tauri.
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

/** Metadata shape returned by the Tauri local_store commands. */
interface LocalVaultMeta {
  id: string;
  title_encrypted: string;
  eph_classical_public: string;
  eph_pq_ciphertext: string;
  wrapped_dek: string;
  vault_color: string | null;
  vault_note_encrypted: string | null;
  vault_sharing_mode?: 'private' | 'shared';
  vault_encryption_mode?: 'standard' | 're-encrypted';
  max_versions: number;
  created_at: string;
  updated_at: string;
}

export class LocalStorageAdapter implements StorageAdapter {
  async listVaults(): Promise<MindMapListItem[]> {
    const vaults = await invoke<LocalVaultMeta[]>('list_local_vaults');
    return vaults.map((v) => ({
      id: v.id,
      title_encrypted: v.title_encrypted,
      vault_color: v.vault_color ?? undefined,
      vault_note_encrypted: v.vault_note_encrypted ?? undefined,
      vault_sharing_mode: v.vault_sharing_mode ?? 'private',
      vault_encryption_mode: v.vault_encryption_mode ?? 'standard',
      max_versions: v.max_versions,
      created_at: v.created_at,
      updated_at: v.updated_at,
    }));
  }

  async getVault(id: string): Promise<MindMapDetail> {
    const v = await invoke<LocalVaultMeta>('get_local_vault_detail', { id });
    return {
      id: v.id,
      title_encrypted: v.title_encrypted,
      eph_classical_public: v.eph_classical_public,
      eph_pq_ciphertext: v.eph_pq_ciphertext,
      wrapped_dek: v.wrapped_dek,
      vault_color: v.vault_color ?? undefined,
      vault_note_encrypted: v.vault_note_encrypted ?? undefined,
      vault_sharing_mode: v.vault_sharing_mode ?? 'private',
      vault_encryption_mode: v.vault_encryption_mode ?? 'standard',
      max_versions: v.max_versions,
      minio_version_id: null,
      created_at: v.created_at,
      updated_at: v.updated_at,
    };
  }

  async createVault(body: UpsertMindMapRequest): Promise<MindMapCreatedResponse> {
    const id = await invoke<string>('save_local_vault', {
      titleEncrypted: body.title_encrypted,
      ephClassicalPublic: body.eph_classical_public,
      ephPqCiphertext: body.eph_pq_ciphertext,
      wrappedDek: body.wrapped_dek,
    });
    return {
      id,
      minio_object_key: id, // not used in local mode
      upload_url: '',        // not used in local mode
    };
  }

  async updateVault(id: string, body: UpsertMindMapRequest): Promise<void> {
    await invoke('update_local_vault_meta', {
      id,
      titleEncrypted: body.title_encrypted,
      ephClassicalPublic: body.eph_classical_public,
      ephPqCiphertext: body.eph_pq_ciphertext,
      wrappedDek: body.wrapped_dek,
    });
  }

  async deleteVault(id: string): Promise<void> {
    await invoke('delete_local_vault', { id });
  }

  async uploadBlob(id: string, blob: Uint8Array): Promise<void> {
    await invoke('save_local_vault_blob', { id, blob: Array.from(blob) });
  }

  async downloadBlob(id: string): Promise<Uint8Array> {
    const data = await invoke<number[]>('get_local_vault_blob', { id });
    return new Uint8Array(data);
  }

  async updateMeta(id: string, body: UpdateVaultMetaRequest): Promise<void> {
    await invoke('update_local_vault_meta', {
      id,
      vaultNoteEncrypted: body.vault_note_encrypted ?? null,
      vaultSharingMode: body.vault_sharing_mode ?? null,
      vaultEncryptionMode: body.vault_encryption_mode ?? null,
      maxVersions: body.max_versions ?? null,
      titleEncrypted: body.title_encrypted ?? null,
    });
  }

  async getStorage(): Promise<StorageSummary> {
    return invoke<StorageSummary>('get_local_storage_summary');
  }
}
