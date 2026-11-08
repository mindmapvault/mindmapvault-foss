// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MindMapGraph } from '../../types';
import {
  clearVaultPreviewCache,
  loadCachedVaultPreview,
  purgeLegacyVaultPreviewCaches,
  saveGraphVaultPreview,
} from '../vaultPreview';

const graph = (count: number) => ({
  nodes: Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    position: { x: i * 10, y: 0 },
    data: { label: `n${i}` },
  })),
  edges: [],
}) as unknown as MindMapGraph;

/**
 * Node 26 defines an experimental `localStorage` global that shadows jsdom's,
 * so install an explicit in-memory Storage for the test.
 */
function createStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
  clearVaultPreviewCache();
});

describe('vault preview cache', () => {
  /** An import renders its preview while the editor has already saved a newer version. */
  it('keeps the newer preview when an older one finishes last', () => {
    saveGraphVaultPreview('v1', '2026-10-06T19:03:07.718546+00:00', graph(3));
    saveGraphVaultPreview('v1', '2026-10-06T19:03:07.600789+00:00', graph(9));
    const cached = loadCachedVaultPreview('v1', '2026-10-06T19:03:07.718546+00:00');
    expect(cached?.nodeCount).toBe(3);
  });

  it('replaces an older preview with a newer one', () => {
    saveGraphVaultPreview('v1', '2026-10-06T19:00:00.000000+00:00', graph(1));
    saveGraphVaultPreview('v1', '2026-10-06T19:05:00.000000+00:00', graph(2));
    expect(loadCachedVaultPreview('v1', '2026-10-06T19:05:00.000000+00:00')?.nodeCount).toBe(2);
  });

  it('never persists decrypted previews to WebView storage', () => {
    saveGraphVaultPreview('v1', '2026-10-06T19:00:00.000000+00:00', graph(1));
    expect(window.localStorage.length).toBe(0);
  });

  it('purges plaintext preview caches left by older builds', () => {
    window.localStorage.setItem('cryptmind-vault-preview-cache-v3', '{"v1":{}}');
    window.localStorage.setItem('cryptmind-vault-preview-cache-v4', '{"v1":{}}');
    window.localStorage.setItem('unrelated-key', 'keep');

    purgeLegacyVaultPreviewCaches();

    expect(window.localStorage.getItem('cryptmind-vault-preview-cache-v3')).toBeNull();
    expect(window.localStorage.getItem('cryptmind-vault-preview-cache-v4')).toBeNull();
    expect(window.localStorage.getItem('unrelated-key')).toBe('keep');
  });

  it('drops cached previews when the cache is cleared', () => {
    saveGraphVaultPreview('v1', '2026-10-06T19:00:00.000000+00:00', graph(1));
    clearVaultPreviewCache();
    expect(loadCachedVaultPreview('v1', '2026-10-06T19:00:00.000000+00:00')).toBeNull();
  });
});
