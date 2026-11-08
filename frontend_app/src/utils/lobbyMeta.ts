/**
 * Per-device vault metadata the lobby keeps outside the vault files: the
 * colour and labels of each vault, and the label library (names and colours)
 * the editor's tag picker and the lobby share.
 *
 * Label names are chosen by the user and double as node tags, so they say
 * what a vault is about. Until 0.6.8 all of this sat in `localStorage` as
 * plaintext, which WebKitGTK, WKWebView and WebView2 write to disk as-is.
 * It is now one blob per profile, AES-GCM under a key derived from the master
 * key (`deriveLobbyMetaKey`), like vault titles and notes. The plaintext keys
 * older builds wrote are folded into the blob on first unlock and removed.
 *
 * Nothing here touches React or the store; it is all testable in Node.
 */

import { aesDecrypt, aesEncrypt } from '../crypto/aes';
import { fromBase64, toBase64 } from '../crypto/utils';
import {
  normalizeVaultLabels,
  vaultColorStorageKey,
  vaultLabelsStorageKey,
} from '../pages/vaults/vaultState';

export interface UserLabel {
  name: string;
  color: string;
}

export interface VaultLobbyMeta {
  /** Six-digit hex, or absent for the default. */
  color?: string;
  /** Normalised: lower-cased, trimmed, de-duplicated, order preserved. */
  labels?: string[];
}

export interface LobbyMeta {
  userLabels: UserLabel[];
  vaults: Record<string, VaultLobbyMeta>;
  /**
   * Base64 of a random 32-byte AES key the encrypted preview files beside each
   * local vault are written with. It lives inside this blob, so a password
   * change re-encrypts it along with everything else and the previews stay
   * readable. Absent until the first preview is stored.
   */
  previewKey?: string;
}

// ── Storage keys ───────────────────────────────────────────────────────────

/**
 * One encrypted blob per profile. Profiles that share a WebView profile (two
 * local users on one machine) must not read each other's blob, and could not
 * decrypt it anyway.
 */
const LOBBY_META_KEY_PREFIX = 'mindmapvault-lobby-meta-v1:';

export function lobbyMetaStorageKey(username: string): string {
  return `${LOBBY_META_KEY_PREFIX}${username}`;
}

/** Plaintext key the label library used before 0.6.8. */
export const LEGACY_USER_LABELS_KEY = 'user-labels';

// ── Normalising ────────────────────────────────────────────────────────────

const DEFAULT_LABEL_COLORS = [
  '#7c3aed', '#10b981', '#ef4444', '#f59e0b',
  '#3b82f6', '#ec4899', '#06b6d4', '#f97316',
];

export function defaultLabelColor(index: number): string {
  return DEFAULT_LABEL_COLORS[index % DEFAULT_LABEL_COLORS.length];
}

export function normalizeLabelColor(input: string | undefined, fallback: string): string {
  if (!input) return fallback;
  return /^#[0-9a-fA-F]{6}$/.test(input) ? input.toLowerCase() : fallback;
}

export function normalizeLabelName(input: string): string {
  return input.trim().toLowerCase();
}

/** Drops anything that is not a label, de-duplicates by name, fills colours. */
export function sanitizeUserLabels(input: unknown): UserLabel[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: UserLabel[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const maybeName = (entry as { name?: unknown }).name;
    const maybeColor = (entry as { color?: unknown }).color;
    if (typeof maybeName !== 'string') continue;
    const name = normalizeLabelName(maybeName);
    if (!name || seen.has(name)) continue;
    out.push({
      name,
      color: normalizeLabelColor(typeof maybeColor === 'string' ? maybeColor : undefined, defaultLabelColor(out.length)),
    });
    seen.add(name);
  }
  return out;
}

function sanitizeVaultMeta(input: unknown): VaultLobbyMeta | null {
  if (!input || typeof input !== 'object') return null;
  const { color, labels } = input as { color?: unknown; labels?: unknown };
  const out: VaultLobbyMeta = {};
  if (typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)) out.color = color;
  if (Array.isArray(labels)) {
    const normalized = normalizeVaultLabels(labels as string[]);
    if (normalized.length > 0) out.labels = normalized;
  }
  return out.color || out.labels ? out : null;
}

/** A preview key is base64 of exactly 32 bytes; anything else is dropped. */
export function sanitizePreviewKey(input: unknown): string | undefined {
  if (typeof input !== 'string' || !input) return undefined;
  try {
    return fromBase64(input).length === 32 ? input : undefined;
  } catch {
    return undefined;
  }
}

/** Whatever was decrypted or migrated becomes a well-formed `LobbyMeta`. */
export function sanitizeLobbyMeta(input: unknown): LobbyMeta {
  const meta: LobbyMeta = { userLabels: [], vaults: {} };
  if (!input || typeof input !== 'object') return meta;
  const { userLabels, vaults, previewKey } = input as { userLabels?: unknown; vaults?: unknown; previewKey?: unknown };
  meta.userLabels = sanitizeUserLabels(userLabels);
  const key = sanitizePreviewKey(previewKey);
  if (key) meta.previewKey = key;
  if (vaults && typeof vaults === 'object') {
    for (const [id, value] of Object.entries(vaults as Record<string, unknown>)) {
      const entry = sanitizeVaultMeta(value);
      if (entry) meta.vaults[id] = entry;
    }
  }
  return meta;
}

// ── Migration from the plaintext keys ──────────────────────────────────────

export interface LegacyLobbyMeta {
  meta: LobbyMeta;
  /** The plaintext keys the data came from, to remove once it is encrypted. */
  keys: string[];
}

/**
 * Reads everything older builds kept in plaintext. Returns an empty result
 * with no keys when there is nothing to migrate.
 */
export function collectLegacyLobbyMeta(storage: Storage): LegacyLobbyMeta {
  const meta: LobbyMeta = { userLabels: [], vaults: {} };
  const keys: string[] = [];
  const colorPrefix = vaultColorStorageKey('');
  const labelsPrefix = vaultLabelsStorageKey('');

  const parse = (raw: string | null): unknown => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    if (key === LEGACY_USER_LABELS_KEY) {
      meta.userLabels = sanitizeUserLabels(parse(storage.getItem(key)));
      keys.push(key);
    } else if (key.startsWith(colorPrefix)) {
      const id = key.slice(colorPrefix.length);
      const entry = sanitizeVaultMeta({ color: storage.getItem(key) });
      if (id && entry?.color) meta.vaults[id] = { ...meta.vaults[id], color: entry.color };
      keys.push(key);
    } else if (key.startsWith(labelsPrefix)) {
      const id = key.slice(labelsPrefix.length);
      const entry = sanitizeVaultMeta({ labels: parse(storage.getItem(key)) });
      if (id && entry?.labels) meta.vaults[id] = { ...meta.vaults[id], labels: entry.labels };
      keys.push(key);
    }
  }
  return { meta, keys };
}

/** `primary` wins field by field; `fallback` fills what it lacks. */
export function mergeLobbyMeta(primary: LobbyMeta, fallback: LobbyMeta): LobbyMeta {
  const names = new Set(primary.userLabels.map((l) => l.name));
  const userLabels = [
    ...primary.userLabels,
    ...fallback.userLabels.filter((l) => !names.has(l.name)),
  ];
  const vaults: Record<string, VaultLobbyMeta> = { ...fallback.vaults };
  for (const [id, entry] of Object.entries(primary.vaults)) {
    vaults[id] = { ...fallback.vaults[id], ...entry };
  }
  const merged: LobbyMeta = { userLabels, vaults };
  const previewKey = primary.previewKey ?? fallback.previewKey;
  if (previewKey) merged.previewKey = previewKey;
  return merged;
}

// ── Codec ──────────────────────────────────────────────────────────────────

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Encrypts to base64 of nonce ‖ ciphertext+tag, like titles. */
export async function encryptLobbyMeta(meta: LobbyMeta, key: CryptoKey): Promise<string> {
  const payload = { version: 1, userLabels: meta.userLabels, vaults: meta.vaults, previewKey: meta.previewKey };
  const ct = await aesEncrypt(key, enc.encode(JSON.stringify(payload)));
  return toBase64(ct);
}

/** Throws when the key is wrong or the blob is damaged. */
export async function decryptLobbyMeta(blobB64: string, key: CryptoKey): Promise<LobbyMeta> {
  const pt = await aesDecrypt(key, fromBase64(blobB64));
  return sanitizeLobbyMeta(JSON.parse(dec.decode(pt)));
}
