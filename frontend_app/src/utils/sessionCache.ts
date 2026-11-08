/**
 * Decrypted data that lives for one unlock session and no longer.
 *
 * Everything here is process memory. Nothing is written to WebView storage:
 * WebKitGTK, WKWebView and WebView2 all persist `localStorage` to disk in
 * plaintext, which is how decrypted vault previews outlived lock and logout
 * (GHSA-3fq6-35q6-xcp9).
 *
 * `clearSessionCache()` is called from the auth store's `logout()`, which is
 * in the initial bundle. This module therefore has no runtime imports: the
 * preview renderer and the crypto layer stay in the lazily loaded pages.
 * Other session-scoped state registers a clearer instead of being imported
 * here.
 */

import type { VaultPreviewSummary } from './vaultPreview';

export type VaultPreviewTheme = 'dark' | 'light';
export type VaultPreviewThemeMap = Partial<Record<VaultPreviewTheme, VaultPreviewSummary>>;
export type VaultPreviewCache = Record<string, VaultPreviewThemeMap>;

/** Key prefix every build before 0.6.8 wrote plaintext previews under. */
const LEGACY_PREVIEW_CACHE_KEY_PREFIX = 'cryptmind-vault-preview-cache-';

let previewCache: VaultPreviewCache = {};
const clearers = new Set<() => void>();

export function readVaultPreviewCache(): VaultPreviewCache {
  return previewCache;
}

export function writeVaultPreviewCache(cache: VaultPreviewCache): void {
  previewCache = cache;
}

export function clearVaultPreviewCache(): void {
  previewCache = {};
}

/**
 * Register something else to drop when the session ends. Returns the
 * unregister function.
 */
export function onSessionCacheClear(clear: () => void): () => void {
  clearers.add(clear);
  return () => {
    clearers.delete(clear);
  };
}

/** Drop everything decrypted that this session cached. Called on logout. */
export function clearSessionCache(): void {
  clearVaultPreviewCache();
  clearers.forEach((clear) => {
    try {
      clear();
    } catch {
      // One failing clearer must not keep the others from running.
    }
  });
}

/** Remove plaintext preview caches written by builds before this fix. */
export function purgeLegacyVaultPreviewCaches(): void {
  if (typeof window === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(LEGACY_PREVIEW_CACHE_KEY_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Storage can be unavailable (privacy mode, sandbox); nothing to purge.
  }
}

purgeLegacyVaultPreviewCaches();
