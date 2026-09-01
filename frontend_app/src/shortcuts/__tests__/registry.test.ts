// @vitest-environment jsdom
/**
 * `isMac` in ../../platform/isMac is a module-level const computed from
 * `navigator` at import time, so exercising both platforms means stubbing
 * `navigator` and re-importing the registry fresh for each one.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

async function loadRegistry(platform: 'mac' | 'pc') {
  vi.resetModules();
  vi.stubGlobal('navigator', {
    platform: platform === 'mac' ? 'MacIntel' : 'Win32',
    userAgent: platform === 'mac'
      ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });
  return import('../registry');
}

function key(init: KeyboardEventInit & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('matchBinding — PC', () => {
  it('Mod+Z fires on Ctrl+Z', async () => {
    const { matchBinding } = await loadRegistry('pc');
    expect(matchBinding(key({ key: 'z', ctrlKey: true }), 'Mod+Z')).toBe(true);
  });

  it('Mod+Z does not fire on Cmd+Z alone', async () => {
    const { matchBinding } = await loadRegistry('pc');
    expect(matchBinding(key({ key: 'z', metaKey: true }), 'Mod+Z')).toBe(false);
  });

  it('a bare letter fires regardless of Shift (case-insensitive)', async () => {
    const { matchBinding } = await loadRegistry('pc');
    expect(matchBinding(key({ key: 'c' }), 'C')).toBe(true);
    expect(matchBinding(key({ key: 'C', shiftKey: true }), 'C')).toBe(true);
  });

  it('a bare letter does not fire while Ctrl or Cmd is held', async () => {
    const { matchBinding } = await loadRegistry('pc');
    expect(matchBinding(key({ key: 'c', ctrlKey: true }), 'C')).toBe(false);
    expect(matchBinding(key({ key: 'c', metaKey: true }), 'C')).toBe(false);
  });

  it('Shift+Tab is distinct from Tab', async () => {
    const { matchBinding } = await loadRegistry('pc');
    expect(matchBinding(key({ key: 'Tab', shiftKey: true }), 'Tab')).toBe(false);
    expect(matchBinding(key({ key: 'Tab', shiftKey: true }), 'Shift+Tab')).toBe(true);
  });

  it('Alt+KeyK matches by code, not key', async () => {
    const { matchBinding } = await loadRegistry('pc');
    expect(matchBinding(key({ key: 'k', code: 'KeyK', altKey: true }), 'Alt+KeyK')).toBe(true);
  });
});

describe('matchBinding — Mac', () => {
  it('Mod+Z fires on Cmd+Z, not on Ctrl+Z', async () => {
    const { matchBinding } = await loadRegistry('mac');
    expect(matchBinding(key({ key: 'z', metaKey: true }), 'Mod+Z')).toBe(true);
    expect(matchBinding(key({ key: 'z', ctrlKey: true }), 'Mod+Z')).toBe(false);
  });

  it('Alt+KeyK matches the physical key even though Option+K types "˚"', async () => {
    const { matchBinding } = await loadRegistry('mac');
    expect(matchBinding(key({ key: '˚', code: 'KeyK', altKey: true }), 'Alt+KeyK')).toBe(true);
  });

  it('a bare letter does not fire while Cmd is held', async () => {
    const { matchBinding } = await loadRegistry('mac');
    expect(matchBinding(key({ key: 'b', metaKey: true }), 'B')).toBe(false);
  });
});

describe('matchShortcut — layout dispatch', () => {
  it('freemind: F2 renames', async () => {
    const { matchShortcut } = await loadRegistry('pc');
    expect(matchShortcut(key({ key: 'F2' }), 'freemind')).toBe('node.rename');
  });

  it('mac: F2 does nothing, Mod+Enter renames', async () => {
    const { matchShortcut } = await loadRegistry('mac');
    expect(matchShortcut(key({ key: 'F2' }), 'mac')).toBeNull();
    expect(matchShortcut(key({ key: 'Enter', metaKey: true }), 'mac')).toBe('node.rename');
  });

  it('freemind is a closed set — Mod+Enter does not fire node.rename', async () => {
    const { matchShortcut } = await loadRegistry('pc');
    expect(matchShortcut(key({ key: 'Enter', ctrlKey: true }), 'freemind')).toBeNull();
  });

  it('mac: B opens the colour picker, F4 does not', async () => {
    const { matchShortcut } = await loadRegistry('mac');
    expect(matchShortcut(key({ key: 'b' }), 'mac')).toBe('node.colour');
    expect(matchShortcut(key({ key: 'F4' }), 'mac')).toBeNull();
  });

  it('shared actions fire identically on both layouts', async () => {
    const pc = await loadRegistry('pc');
    expect(pc.matchShortcut(key({ key: ' ' }), 'freemind')).toBe('node.fold');
    const mac = await loadRegistry('mac');
    expect(mac.matchShortcut(key({ key: ' ' }), 'mac')).toBe('node.fold');
  });
});

describe('formatBinding', () => {
  it('renders mac symbols with no separator', async () => {
    const { formatBinding } = await loadRegistry('mac');
    expect(formatBinding('Mod+Shift+Z')).toBe('⌘⇧Z');
    expect(formatBinding('Mod+O')).toBe('⌘O');
  });

  it('renders PC words with plus separators', async () => {
    const { formatBinding } = await loadRegistry('pc');
    expect(formatBinding('Mod+Shift+Z')).toBe('Ctrl+Shift+Z');
  });

  it('formats the code-based Alt+K binding by its letter', async () => {
    const { formatBinding } = await loadRegistry('mac');
    expect(formatBinding('Alt+KeyK')).toBe('⌥K');
  });
});

describe('formatShortcut', () => {
  it('joins multiple bindings for the same action', async () => {
    const { formatShortcut } = await loadRegistry('pc');
    expect(formatShortcut('edit.undo', 'freemind')).toBe('F9 / Ctrl+Z');
  });

  it('mac layout has a single, closed binding per action where the table says so', async () => {
    const { formatShortcut } = await loadRegistry('mac');
    expect(formatShortcut('edit.undo', 'mac')).toBe('⌘Z');
  });
});
