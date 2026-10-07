import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromBase64, toBase64 } from '../../crypto/utils';
import type { MindMapTreeNode, NodeAttachmentRef } from '../../types';

/**
 * The Tauri side stood in for by a map of files, so these run the real crypto
 * and the real tree walking against something that behaves like the disk.
 */
const files = new Map<string, string>();
let failWrites = false;

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    const key = `${args.vaultId}/${args.attachmentId}`;
    switch (cmd) {
      case 'save_local_attachment':
        if (failWrites) throw new Error('disk full');
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

const {
  externalizeInlineAttachments,
  inlineLocalAttachments,
  pruneLocalAttachments,
  readLocalAttachment,
  withLocalVaultLock,
  writeLocalAttachment,
} = await import('../localAttachments');

const bytes = (text: string) => new TextEncoder().encode(text);

const ref = (id: string, over: Partial<NodeAttachmentRef> = {}): NodeAttachmentRef => ({
  attachment_id: id,
  name: `${id}.png`,
  content_type: 'image/png',
  size_bytes: 3,
  uploaded_at: '2026-10-06T00:00:00.000Z',
  ...over,
});

const node = (id: string, attachments: NodeAttachmentRef[] = [], children: MindMapTreeNode[] = []) =>
  ({ id, text: id, children, attachments }) as MindMapTreeNode;

/** A map as 0.6.3 saved it: originals inline, one of them a level down. */
const legacyMap = () =>
  node('root', [ref('a', { inline_data_base64: toBase64(bytes('photo A')) })], [
    node('child', [ref('b', { inline_data_base64: toBase64(bytes('photo B')) })]),
  ]);

const refsOf = (root: MindMapTreeNode): NodeAttachmentRef[] => {
  const out: NodeAttachmentRef[] = [];
  const walk = (n: MindMapTreeNode) => { out.push(...(n.attachments ?? [])); n.children.forEach(walk); };
  walk(root);
  return out;
};

beforeEach(() => {
  files.clear();
  failWrites = false;
});

describe('writeLocalAttachment / readLocalAttachment', () => {
  it('reads back what was written, and the file on disk is not the plaintext', async () => {
    const key = await writeLocalAttachment('v1', 'a', bytes('secret photo'));
    expect(new TextDecoder().decode(fromBase64(files.get('v1/a')!))).not.toContain('secret photo');
    const read = await readLocalAttachment('v1', ref('a', { local_file_key_b64: key }));
    expect(new TextDecoder().decode(read!)).toBe('secret photo');
  });

  it('still reads an inline original from an older map', async () => {
    const read = await readLocalAttachment('v1', ref('a', { inline_data_base64: toBase64(bytes('old')) }));
    expect(new TextDecoder().decode(read!)).toBe('old');
  });

  it('returns null for a ref with no original anywhere', async () => {
    expect(await readLocalAttachment('v1', ref('a'))).toBeNull();
  });
});

describe('externalizeInlineAttachments', () => {
  it('moves every inline original to a file and leaves only a key in the map', async () => {
    const moved = (await externalizeInlineAttachments('v1', legacyMap()))!;
    for (const r of refsOf(moved)) {
      expect(r.inline_data_base64).toBeUndefined();
      expect(r.local_file_key_b64).toBeTruthy();
    }
    expect([...files.keys()].sort()).toEqual(['v1/a', 'v1/b']);
    const b = refsOf(moved).find((r) => r.attachment_id === 'b')!;
    expect(new TextDecoder().decode((await readLocalAttachment('v1', b))!)).toBe('photo B');
  });

  it('does not touch the tree it was given', async () => {
    const original = legacyMap();
    const before = JSON.stringify(original);
    await externalizeInlineAttachments('v1', original);
    expect(JSON.stringify(original)).toBe(before);
  });

  it('keeps the inline copy when the file cannot be written', async () => {
    failWrites = true;
    expect(await externalizeInlineAttachments('v1', legacyMap())).toBeNull();
  });

  it('returns null when there is nothing inline', async () => {
    expect(await externalizeInlineAttachments('v1', node('root', [ref('a')]))).toBeNull();
  });
});

describe('inlineLocalAttachments', () => {
  it('puts the originals back for an export, without the local keys', async () => {
    const moved = (await externalizeInlineAttachments('v1', legacyMap()))!;
    const exported = await inlineLocalAttachments('v1', moved);
    for (const r of refsOf(exported)) {
      expect(r.local_file_key_b64).toBeUndefined();
    }
    expect(refsOf(exported).map((r) => new TextDecoder().decode(fromBase64(r.inline_data_base64!))))
      .toEqual(['photo A', 'photo B']);
  });
});

describe('pruneLocalAttachments', () => {
  it('deletes only the files the map no longer points at', async () => {
    const moved = (await externalizeInlineAttachments('v1', legacyMap()))!;
    await writeLocalAttachment('v1', 'removed-later', bytes('x'));
    await writeLocalAttachment('v2', 'other-vault', bytes('y'));
    await pruneLocalAttachments('v1', moved);
    expect([...files.keys()].sort()).toEqual(['v1/a', 'v1/b', 'v2/other-vault']);
  });
});

describe('withLocalVaultLock', () => {
  it('runs tasks for one vault one after another, and other vaults alongside', async () => {
    const log: string[] = [];
    const step = (name: string, ms: number) => async () => {
      log.push(`${name} start`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      log.push(`${name} end`);
    };
    await Promise.all([
      withLocalVaultLock('v1', step('first', 20)),
      withLocalVaultLock('v1', step('second', 1)),
      withLocalVaultLock('v2', step('other', 1)),
    ]);
    expect(log.indexOf('first end')).toBeLessThan(log.indexOf('second start'));
    expect(log.indexOf('other end')).toBeLessThan(log.indexOf('first end'));
  });

  it('keeps going after a task fails', async () => {
    await expect(withLocalVaultLock('v1', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(await withLocalVaultLock('v1', async () => 'next')).toBe('next');
  });
});
