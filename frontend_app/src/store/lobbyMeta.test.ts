// @vitest-environment jsdom
/**
 * The lobby metadata store against a stubbed `localStorage`: what lands on
 * disk is encrypted, the plaintext keys of older builds are migrated away,
 * logout drops the decrypted copy, and a password change re-encrypts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deriveLobbyMetaKey } from '../crypto/kdf';
import { randomBytes } from '../crypto/utils';
import { decryptLobbyMeta, lobbyMetaStorageKey } from '../utils/lobbyMeta';
import { clearSessionCache } from '../utils/sessionCache';
import { flushLobbyMetaWrites, useLobbyMetaStore } from './lobbyMeta';

function createStorage(entries: Record<string, string> = {}): Storage {
  const data = new Map<string, string>(Object.entries(entries));
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

const masterKey = randomBytes(32);
const store = () => useLobbyMetaStore.getState();

/** Everything currently in storage, as one string, to search for leaks. */
function storageDump(): string {
  const parts: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i)!;
    parts.push(`${key}=${window.localStorage.getItem(key)}`);
  }
  return parts.join('\n');
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
  store().reset();
});

afterEach(async () => {
  await flushLobbyMetaWrites();
});

describe('hydrateEncrypted', () => {
  it('migrates the plaintext keys into an encrypted blob and removes them', async () => {
    window.localStorage.setItem('user-labels', JSON.stringify([{ name: 'divorce', color: '#ef4444' }]));
    window.localStorage.setItem('vault-color-v1', '#abcdef');
    window.localStorage.setItem('vault-labels-v1', JSON.stringify(['divorce']));
    window.localStorage.setItem('mmv-lobby-view', 'table');

    await store().hydrateEncrypted(masterKey, 'alice');
    await flushLobbyMetaWrites();

    expect(store().source).toBe('encrypted');
    expect(store().userLabels).toEqual([{ name: 'divorce', color: '#ef4444' }]);
    expect(store().vaults).toEqual({ v1: { color: '#abcdef', labels: ['divorce'] } });

    expect(window.localStorage.getItem('user-labels')).toBeNull();
    expect(window.localStorage.getItem('vault-color-v1')).toBeNull();
    expect(window.localStorage.getItem('vault-labels-v1')).toBeNull();
    expect(window.localStorage.getItem('mmv-lobby-view')).toBe('table');

    const blob = window.localStorage.getItem(lobbyMetaStorageKey('alice'));
    expect(blob).toBeTruthy();
    expect(storageDump()).not.toContain('divorce');
    expect(storageDump()).not.toContain('abcdef');
    expect(await decryptLobbyMeta(blob!, await deriveLobbyMetaKey(masterKey))).toEqual({
      userLabels: [{ name: 'divorce', color: '#ef4444' }],
      vaults: { v1: { color: '#abcdef', labels: ['divorce'] } },
    });
  });

  it('writes nothing when there is nothing to migrate', async () => {
    await store().hydrateEncrypted(masterKey, 'alice');
    await flushLobbyMetaWrites();
    expect(window.localStorage.length).toBe(0);
  });

  it('starts over when the blob cannot be decrypted', async () => {
    window.localStorage.setItem(lobbyMetaStorageKey('alice'), 'bm90IGEgcmVhbCBibG9i');
    await store().hydrateEncrypted(masterKey, 'alice');
    expect(store().source).toBe('encrypted');
    expect(store().userLabels).toEqual([]);
    expect(store().vaults).toEqual({});
  });

  it('runs one hydration for concurrent callers', async () => {
    const first = store().hydrateEncrypted(masterKey, 'alice');
    const second = store().hydrateEncrypted(masterKey, 'alice');
    await Promise.all([first, second]);
    expect(store().source).toBe('encrypted');
  });
});

describe('changes', () => {
  it('persist encrypted and read back after the session is cleared', async () => {
    await store().hydrateEncrypted(masterKey, 'alice');
    store().addUserLabel(' Taxes ', '#F59E0B');
    store().setVaultColor('v1', '#abcdef');
    store().setVaultLabels('v1', ['Taxes', 'taxes']);
    store().setVaultLabels('v2', ['home']);
    store().forgetVault('v2');
    await flushLobbyMetaWrites();

    expect(storageDump()).not.toContain('taxes');
    expect(storageDump()).not.toContain('abcdef');

    clearSessionCache();
    expect(store().source).toBe('none');
    expect(store().userLabels).toEqual([]);
    expect(store().vaults).toEqual({});

    await store().hydrateEncrypted(masterKey, 'alice');
    expect(store().userLabels).toEqual([{ name: 'taxes', color: '#f59e0b' }]);
    expect(store().vaults).toEqual({ v1: { color: '#abcdef', labels: ['taxes'] } });
  });

  it('keep profiles apart', async () => {
    await store().hydrateEncrypted(masterKey, 'alice');
    store().addUserLabel('alice-only');
    await flushLobbyMetaWrites();
    clearSessionCache();

    await store().hydrateEncrypted(randomBytes(32), 'bob');
    expect(store().userLabels).toEqual([]);
    expect(window.localStorage.getItem(lobbyMetaStorageKey('alice'))).toBeTruthy();
  });
});

describe('ensurePreviewKey', () => {
  it('is minted once, stored in the blob, and comes back after a re-hydrate', async () => {
    expect(await store().ensurePreviewKey()).toBeNull();

    await store().hydrateEncrypted(masterKey, 'alice');
    const first = await store().ensurePreviewKey();
    const minted = store().previewKey;
    expect(first).toBeInstanceOf(CryptoKey);
    expect(minted).toBeTruthy();
    expect(await store().ensurePreviewKey()).toBe(first);
    await flushLobbyMetaWrites();
    expect(storageDump()).not.toContain(minted!);

    clearSessionCache();
    await store().hydrateEncrypted(masterKey, 'alice');
    expect(store().previewKey).toBe(minted);
    expect(await store().ensurePreviewKey()).toBeInstanceOf(CryptoKey);
  });
});

describe('rotateKey', () => {
  it('re-encrypts the blob so the new master key reads it and the old one does not', async () => {
    await store().hydrateEncrypted(masterKey, 'alice');
    store().addUserLabel('work');
    await flushLobbyMetaWrites();

    const newMasterKey = randomBytes(32);
    await store().rotateKey(masterKey, newMasterKey, 'alice');

    const blob = window.localStorage.getItem(lobbyMetaStorageKey('alice'))!;
    await expect(decryptLobbyMeta(blob, await deriveLobbyMetaKey(masterKey))).rejects.toThrow();
    expect(await decryptLobbyMeta(blob, await deriveLobbyMetaKey(newMasterKey))).toEqual({
      userLabels: [{ name: 'work', color: '#7c3aed' }],
      vaults: {},
    });

    clearSessionCache();
    await store().hydrateEncrypted(newMasterKey, 'alice');
    expect(store().userLabels).toEqual([{ name: 'work', color: '#7c3aed' }]);
  });

  /** The password form can run before the lobby was opened this session. */
  it('hydrates with the old key first when nothing is loaded', async () => {
    await store().hydrateEncrypted(masterKey, 'alice');
    store().setVaultColor('v1', '#abcdef');
    await flushLobbyMetaWrites();
    clearSessionCache();

    const newMasterKey = randomBytes(32);
    await store().rotateKey(masterKey, newMasterKey, 'alice');

    clearSessionCache();
    await store().hydrateEncrypted(newMasterKey, 'alice');
    expect(store().vaults).toEqual({ v1: { color: '#abcdef' } });
  });
});

describe('hydratePlain', () => {
  /** The demos have no profile and seed the library in plaintext themselves. */
  it('reads and writes the plaintext library for shells without a profile', () => {
    window.localStorage.setItem('user-labels', JSON.stringify([{ name: 'idea', color: '#3b82f6' }]));
    store().hydratePlain();
    expect(store().source).toBe('plain');
    expect(store().userLabels).toEqual([{ name: 'idea', color: '#3b82f6' }]);

    store().addUserLabel('todo');
    expect(JSON.parse(window.localStorage.getItem('user-labels')!)).toEqual([
      { name: 'idea', color: '#3b82f6' },
      { name: 'todo', color: '#10b981' },
    ]);
  });

  it('does not replace an unlocked profile', async () => {
    await store().hydrateEncrypted(masterKey, 'alice');
    store().hydratePlain();
    expect(store().source).toBe('encrypted');
  });
});
