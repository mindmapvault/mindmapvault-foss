/**
 * What a vault *is*, derived from its record.
 *
 * These were computed inside `VaultCard` and again inside `VaultTableRow` —
 * the grid and table views of the same vault — from the same fields, verbatim.
 * Two copies of one derivation have to agree, and nothing was keeping them in
 * step; the mind map editor had the same shape of bug in its node measurement
 * and it put text outside the box that was measured for it.
 *
 * Nothing here touches React, storage or the DOM, so all of it is testable.
 */

import type { VaultEncryptionMode, VaultSharingMode } from '../../types';

// ── Normalising what the store sent ─────────────────────────────

const DEFAULT_VAULT_COLOR = '#334155';

/** Anything that is not a six-digit hex colour becomes the default. */
export function normalizeHexColor(input?: string): string {
  if (!input) return DEFAULT_VAULT_COLOR;
  return /^#[0-9a-fA-F]{6}$/.test(input) ? input : DEFAULT_VAULT_COLOR;
}

export function normalizeSharingMode(input?: string): VaultSharingMode {
  return input === 'shared' ? 'shared' : 'private';
}

export function normalizeEncryptionMode(input?: string): VaultEncryptionMode {
  return input === 're-encrypted' ? 're-encrypted' : 'standard';
}

/** Lower-cased, trimmed, de-duplicated, order preserved. */
export function normalizeVaultLabels(input?: string[]): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const label = raw.trim().toLowerCase();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/** Order-sensitive: the label list is a sequence the user can reorder. */
export function labelsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((label, idx) => label === b[idx]);
}

// ── Per-device vault colour and labels ──────────────────────────

/**
 * A vault's colour lives in `localStorage` under this key. The key is
 * persisted data: renaming it silently resets every vault to the default
 * colour.
 */
export function vaultColorStorageKey(vaultId: string): string {
  return `vault-color-${vaultId}`;
}

/**
 * Where a local vault's labels live — persisted data, like the colour key
 * above. This was written out as a template literal at both of the two places
 * that read it.
 */
export function vaultLabelsStorageKey(vaultId: string): string {
  return `vault-labels-${vaultId}`;
}

// ── The row a vault becomes in the list ─────────────────────────

/**
 * The draft fields every vault row carries.
 *
 * Each card and row edits its vault's settings in place, so the row holds both
 * what the store said and the draft the user is editing. This was built twice
 * inside `loadMaps` — once for the unlocked case and once without keys — and
 * the two copies differed only in the title and the note.
 */
export interface VaultDrafts {
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

/** The default a vault falls back to when the record names no limit. */
export const DEFAULT_MAX_VERSIONS = 50;

export interface VaultDraftsInput {
  vault_labels?: string[] | null;
  vault_sharing_mode?: string;
  vault_encryption_mode?: string;
  max_versions?: number | null;
}

export function buildVaultDrafts(
  record: VaultDraftsInput,
  options: {
    /** Decrypted, or null when there are no keys to decrypt with. */
    title: string | null;
    /** Decrypted, or empty. */
    note: string;
    /** Labels held on this device. */
    localLabels?: string[];
    color: string;
  },
): VaultDrafts {
  return {
    title: options.title,
    vaultNote: options.note,
    draftNote: options.note,
    draftLabels: normalizeVaultLabels(record.vault_labels ?? options.localLabels ?? []),
    draftColor: options.color,
    draftSharingMode: normalizeSharingMode(record.vault_sharing_mode),
    draftEncryptionMode: normalizeEncryptionMode(record.vault_encryption_mode),
    // A vault that reports zero or a negative limit still keeps one version.
    draftMaxVersions: Math.max(1, record.max_versions ?? DEFAULT_MAX_VERSIONS),
    metaSaving: false,
  };
}

// ── The derivation both views need ──────────────────────────────

/** Only the fields the derivation reads, so tests need not build a whole vault. */
export interface VaultRecordLike {
  id: string;
  vault_sharing_mode?: string;
}

export interface VaultState {
  /** Where opening this vault goes. */
  path: string;
  /** What the record says, before live share counts are considered. */
  persistedSharingMode: VaultSharingMode;
  /**
   * Shared *now*: either the record says so, or shares are currently active.
   * A vault can hold live shares while its record still reads `private`, so
   * the live count wins.
   */
  isShared: boolean;
}

export function deriveVaultState(
  map: VaultRecordLike,
  activeShareCount: number,
): VaultState {
  const persistedSharingMode = normalizeSharingMode(map.vault_sharing_mode);
  return {
    path: `/vaults/${map.id}`,
    persistedSharingMode,
    isShared: activeShareCount > 0 || persistedSharingMode === 'shared',
  };
}

// ── Re-render rule for the two vault views ──────────────────────

export interface RenameContext {
  map: { id: string };
  renamingId: string | null;
  renameValue: string;
  renaming: boolean;
}

/**
 * Whether a vault's rename state is unchanged for `memo` purposes.
 *
 * The asymmetry is deliberate and easy to break: the vault *being* renamed has
 * to re-render on every keystroke, so it compares the draft text too. Every
 * other vault compares only which vault is being renamed — otherwise typing a
 * name re-renders the whole list on each character.
 */
export function sameRenameContext(prev: RenameContext, next: RenameContext): boolean {
  if (prev.renamingId !== prev.map.id) return prev.renamingId === next.renamingId;
  return prev.renamingId === next.renamingId
    && prev.renameValue === next.renameValue
    && prev.renaming === next.renaming;
}
