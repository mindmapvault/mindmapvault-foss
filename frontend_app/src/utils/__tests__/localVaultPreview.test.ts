// @vitest-environment jsdom
/**
 * The encrypted preview file beside a local vault: written after a render,
 * read back into the session cache, never in plaintext, kept by pruning.
 * The Tauri side is a map of files, as in `localAttachments.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from '../../crypto/utils';
import type { MindMapTree } from '../../types';

const files = new Map<string, string>();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    const key = `${args.vaultId}/${args.attachmentId}`;
    switch (cmd) {
      case 'save_local_attachment':
        files.set(key, args.dataBase64 as string);
        return null;
      case 'get_local_attachment':
        if (!files.has(key)) throw new Error('Not found');
        return files.get(key);
      case 'prune_local_attachments': {
        const keep = args.keep as string[];
        for (const name of [...files.keys()]) {
          const [vault, id] = name.split('/');
          if (vault === args.vaultId && !keep.includes(id)) files.delete(name);
        }
        return null;
      }
      default:
        throw new Error(`unexpected command ${cmd}`);
    }
  }),
}));

const { useLobbyMetaStore, flushLobbyMetaWrites } = await import('../../store/lobbyMeta');
const { clearSessionCache } = await import('../sessionCache');
const { loadCachedVaultPreview } = await import('../vaultPreview');
const { persistLocalVaultPreview, restoreLocalVaultPreview, saveLocalVaultPreview } = await import('../localVaultPreview');
const { pruneLocalAttachments, LOCAL_VAULT_PREVIEW_ATTACHMENT_ID } = await import('../../storage/localAttachments');

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

const masterKey = randomBytes(32);
const UPDATED = '2026-11-08T10:00:00.000Z';
const tree: MindMapTree = {
  version: 'tree',
  root: { id: 'root', text: 'SecretRootTopic', collapsed: false, children: [
    { id: 'c1', text: 'SecretChild', collapsed: false, children: [] },
  ] },
};

/** `renderTreeSvg` measures text on a canvas; jsdom has none, so widths are fixed. */
beforeEach(() => {
  vi.stubGlobal('localStorage', createStorage());
  files.clear();
  clearSessionCache();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    measureText: (text: string) => ({ width: text.length * 7 }),
    font: '',
  }) as unknown as CanvasRenderingContext2D);
});

describe('local vault preview file', () => {
  it('writes nothing without an unlocked profile', async () => {
    await saveLocalVaultPreview('v1', UPDATED, tree);
    expect(loadCachedVaultPreview('v1', UPDATED)).not.toBeNull();
    expect(files.size).toBe(0);
  });

  it('round-trips through the encrypted file into the session cache after a restart', async () => {
    await useLobbyMetaStore.getState().hydrateEncrypted(masterKey, 'alice');
    await saveLocalVaultPreview('v1', UPDATED, tree);
    await flushLobbyMetaWrites();

    expect(files.has(`v1/${LOCAL_VAULT_PREVIEW_ATTACHMENT_ID}`)).toBe(true);
    const onDisk = atob(files.get(`v1/${LOCAL_VAULT_PREVIEW_ATTACHMENT_ID}`)!);
    expect(onDisk).not.toContain('SecretRootTopic');
    expect(onDisk).not.toContain('svg');

    // A restart: the session cache is gone, the blob and the file remain.
    clearSessionCache();
    expect(loadCachedVaultPreview('v1', UPDATED)).toBeNull();
    await useLobbyMetaStore.getState().hydrateEncrypted(masterKey, 'alice');

    const dark = await restoreLocalVaultPreview('v1', UPDATED, 'dark');
    expect(dark?.nodeCount).toBe(2);
    expect(dark?.image_data_url.startsWith('data:image/svg+xml')).toBe(true);
    expect(loadCachedVaultPreview('v1', UPDATED, 'light')?.nodeCount).toBe(2);
  });

  it('ignores a file from another save', async () => {
    await useLobbyMetaStore.getState().hydrateEncrypted(masterKey, 'alice');
    await saveLocalVaultPreview('v1', UPDATED, tree);
    clearSessionCache();
    await useLobbyMetaStore.getState().hydrateEncrypted(masterKey, 'alice');
    expect(await restoreLocalVaultPreview('v1', '2026-11-09T10:00:00.000Z', 'dark')).toBeNull();
  });

  it('is unreadable for another profile and returns null instead of failing', async () => {
    await useLobbyMetaStore.getState().hydrateEncrypted(masterKey, 'alice');
    await saveLocalVaultPreview('v1', UPDATED, tree);
    clearSessionCache();
    await useLobbyMetaStore.getState().hydrateEncrypted(randomBytes(32), 'bob');
    expect(await restoreLocalVaultPreview('v1', UPDATED, 'dark')).toBeNull();
  });

  it('returns null when there is no file', async () => {
    await useLobbyMetaStore.getState().hydrateEncrypted(masterKey, 'alice');
    expect(await restoreLocalVaultPreview('v9', UPDATED, 'dark')).toBeNull();
  });

  it('does nothing when the session cache holds no preview for that save', async () => {
    await useLobbyMetaStore.getState().hydrateEncrypted(masterKey, 'alice');
    await persistLocalVaultPreview('v1', UPDATED);
    expect(files.size).toBe(0);
  });

  it('survives pruning of unreferenced attachments', async () => {
    await useLobbyMetaStore.getState().hydrateEncrypted(masterKey, 'alice');
    await saveLocalVaultPreview('v1', UPDATED, tree);
    files.set('v1/orphan', 'x');
    await pruneLocalAttachments('v1', tree.root);
    expect(files.has('v1/orphan')).toBe(false);
    expect(files.has(`v1/${LOCAL_VAULT_PREVIEW_ATTACHMENT_ID}`)).toBe(true);
  });
});
