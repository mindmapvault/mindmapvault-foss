/**
 * Pure tests for the lobby metadata codec and migration. They run in Node:
 * `globalThis.crypto` has full WebCrypto there, so the AES-GCM path is the
 * one the browser runs.
 */
import { describe, expect, it } from 'vitest';
import { deriveLobbyMetaKey } from '../../crypto/kdf';
import { randomBytes, toBase64 } from '../../crypto/utils';
import {
  collectLegacyLobbyMeta,
  decryptLobbyMeta,
  encryptLobbyMeta,
  mergeLobbyMeta,
  sanitizeLobbyMeta,
  sanitizeUserLabels,
  type LobbyMeta,
} from '../lobbyMeta';

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

describe('sanitizeUserLabels', () => {
  it('lower-cases, trims, de-duplicates and fills missing colours', () => {
    const labels = sanitizeUserLabels([
      { name: ' Work ', color: '#FF0000' },
      { name: 'work', color: '#00ff00' },
      { name: 'taxes' },
      { name: '', color: '#123456' },
      'not a label',
      { color: '#123456' },
    ]);
    expect(labels).toEqual([
      { name: 'work', color: '#ff0000' },
      { name: 'taxes', color: '#10b981' },
    ]);
  });

  it('returns nothing for anything that is not a list', () => {
    expect(sanitizeUserLabels(null)).toEqual([]);
    expect(sanitizeUserLabels({ name: 'x' })).toEqual([]);
  });
});

describe('sanitizeLobbyMeta', () => {
  it('keeps only well-formed vault entries', () => {
    const meta = sanitizeLobbyMeta({
      userLabels: [{ name: 'a', color: '#111111' }],
      vaults: {
        v1: { color: '#abcdef', labels: ['X', 'x', ' y '] },
        v2: { color: 'red' },
        v3: 'junk',
        v4: { labels: [] },
      },
    });
    expect(meta.userLabels).toEqual([{ name: 'a', color: '#111111' }]);
    expect(meta.vaults).toEqual({ v1: { color: '#abcdef', labels: ['x', 'y'] } });
  });
});

describe('collectLegacyLobbyMeta', () => {
  it('folds the plaintext keys into one record and names them for removal', () => {
    const storage = createStorage({
      'user-labels': JSON.stringify([{ name: 'Work', color: '#ff0000' }]),
      'vault-color-v1': '#abcdef',
      'vault-labels-v1': JSON.stringify(['work', 'taxes']),
      'vault-labels-v2': JSON.stringify(['home']),
      'vault-color-v3': 'not-a-colour',
      'mmv-lobby-view': 'table',
    });

    const { meta, keys } = collectLegacyLobbyMeta(storage);

    expect(meta.userLabels).toEqual([{ name: 'work', color: '#ff0000' }]);
    expect(meta.vaults).toEqual({
      v1: { color: '#abcdef', labels: ['work', 'taxes'] },
      v2: { labels: ['home'] },
    });
    expect(keys.sort()).toEqual([
      'user-labels',
      'vault-color-v1',
      'vault-color-v3',
      'vault-labels-v1',
      'vault-labels-v2',
    ]);
    expect(keys).not.toContain('mmv-lobby-view');
  });

  it('reports nothing to migrate on a clean storage', () => {
    const { meta, keys } = collectLegacyLobbyMeta(createStorage({ 'mmv-lobby-view': 'grid' }));
    expect(meta).toEqual({ userLabels: [], vaults: {} });
    expect(keys).toEqual([]);
  });
});

describe('mergeLobbyMeta', () => {
  it('lets the primary win field by field and fills gaps from the fallback', () => {
    const primary: LobbyMeta = {
      userLabels: [{ name: 'work', color: '#111111' }],
      vaults: { v1: { color: '#111111' } },
    };
    const fallback: LobbyMeta = {
      userLabels: [{ name: 'work', color: '#222222' }, { name: 'home', color: '#333333' }],
      vaults: { v1: { color: '#222222', labels: ['old'] }, v2: { labels: ['x'] } },
    };
    expect(mergeLobbyMeta(primary, fallback)).toEqual({
      userLabels: [{ name: 'work', color: '#111111' }, { name: 'home', color: '#333333' }],
      vaults: { v1: { color: '#111111', labels: ['old'] }, v2: { labels: ['x'] } },
    });
  });
});

describe('sanitizeLobbyMeta preview key', () => {
  it('keeps a 32-byte key and drops anything else', () => {
    const good = toBase64(randomBytes(32));
    expect(sanitizeLobbyMeta({ previewKey: good }).previewKey).toBe(good);
    expect(sanitizeLobbyMeta({ previewKey: toBase64(randomBytes(16)) }).previewKey).toBeUndefined();
    expect(sanitizeLobbyMeta({ previewKey: 'not base64!' }).previewKey).toBeUndefined();
    expect(sanitizeLobbyMeta({ previewKey: 42 }).previewKey).toBeUndefined();
  });

  it('survives the codec and merging', async () => {
    const previewKey = toBase64(randomBytes(32));
    const meta: LobbyMeta = { userLabels: [], vaults: {}, previewKey };
    const key = await deriveLobbyMetaKey(randomBytes(32));
    expect((await decryptLobbyMeta(await encryptLobbyMeta(meta, key), key)).previewKey).toBe(previewKey);
    expect(mergeLobbyMeta({ userLabels: [], vaults: {} }, meta).previewKey).toBe(previewKey);
    expect(mergeLobbyMeta(meta, { userLabels: [], vaults: {}, previewKey: 'other' }).previewKey).toBe(previewKey);
  });
});

describe('lobby meta codec', () => {
  const meta: LobbyMeta = {
    userLabels: [{ name: 'divorce', color: '#ef4444' }],
    vaults: { v1: { color: '#abcdef', labels: ['divorce'] } },
  };

  it('round-trips under the derived key and leaks no plaintext', async () => {
    const key = await deriveLobbyMetaKey(randomBytes(32));
    const blob = await encryptLobbyMeta(meta, key);

    expect(blob).not.toContain('divorce');
    expect(blob).not.toContain('abcdef');
    expect(await decryptLobbyMeta(blob, key)).toEqual(meta);
  });

  it('uses a fresh nonce for every write', async () => {
    const key = await deriveLobbyMetaKey(randomBytes(32));
    expect(await encryptLobbyMeta(meta, key)).not.toBe(await encryptLobbyMeta(meta, key));
  });

  it('refuses another profile\'s key', async () => {
    const blob = await encryptLobbyMeta(meta, await deriveLobbyMetaKey(randomBytes(32)));
    const otherKey = await deriveLobbyMetaKey(randomBytes(32));
    await expect(decryptLobbyMeta(blob, otherKey)).rejects.toThrow();
  });
});
