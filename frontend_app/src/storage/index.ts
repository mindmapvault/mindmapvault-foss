// ── Storage factory ──────────────────────────────────────────────────────────
//
// Returns the correct StorageAdapter based on the current app mode.

import { LocalStorageAdapter } from './local';
import type { StorageAdapter } from './types';

export type { StorageAdapter } from './types';

let localAdapter: LocalStorageAdapter | null = null;

export function getLocalStorage(): StorageAdapter {
  if (!localAdapter) localAdapter = new LocalStorageAdapter();
  return localAdapter;
}

/** Returns the storage adapter for the standalone app. */
export function getStorage(): StorageAdapter {
  return getLocalStorage();
}

/** Detects whether we're running inside the Tauri desktop shell. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
