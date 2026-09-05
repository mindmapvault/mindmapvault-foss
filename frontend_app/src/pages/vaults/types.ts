/**
 * Shared shapes for the vault list.
 *
 * `MapWithTitle` is a vault record plus the draft state its card or row edits
 * in place — see `buildVaultDrafts`, which fills the draft half.
 */

import type { MindMapListItem, VaultEncryptionMode, VaultSharingMode } from '../../types';
import type { VaultPreviewSummary } from '../../utils/vaultPreview';

export interface MapWithTitle extends MindMapListItem {
  title: string | null;
  vaultNote: string;
  draftNote: string;
  draftLabels: string[];
  draftColor: string;
  draftSharingMode: VaultSharingMode;
  draftEncryptionMode: VaultEncryptionMode;
  draftMaxVersions: number;
  metaSaving: boolean;
}

export interface VaultPreviewState {
  loading: boolean;
  summary?: VaultPreviewSummary;
  error?: string;
}

export interface PendingVaultDeletion {
  id: string;
  title: string | null;
}
