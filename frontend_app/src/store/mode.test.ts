// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

describe('mode store (FOSS)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stays local even when the hosted app persisted a server mode under the shared key', async () => {
    window.localStorage.setItem(
      'mindmapvault-mode',
      JSON.stringify({ state: { mode: 'server' }, version: 0 }),
    );
    const { useModeStore } = await import('./mode');
    expect(useModeStore.getState().mode).toBe('local');
    expect(window.localStorage.getItem('mindmapvault-mode')).toBeNull();
  });

  it('cannot be switched away from local', async () => {
    const { useModeStore } = await import('./mode');
    useModeStore.getState().setMode('local');
    useModeStore.getState().clearMode();
    expect(useModeStore.getState().mode).toBe('local');
  });
});
