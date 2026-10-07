// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { MindMapGraph } from '../../types';
import { loadCachedVaultPreview, saveGraphVaultPreview } from '../vaultPreview';

const graph = (count: number) => ({
  nodes: Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    position: { x: i * 10, y: 0 },
    data: { label: `n${i}` },
  })),
  edges: [],
}) as unknown as MindMapGraph;

beforeEach(() => localStorage.clear());

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
});
