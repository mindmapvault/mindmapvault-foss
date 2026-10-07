/**
 * Node attachments in local mode, kept as files beside the map.
 *
 * Up to 0.6.3 the original of every attachment rode inside the map as
 * `inline_data_base64`, so a map with a hundred photos carried all of them
 * through every save and every undo step. Now each original is a file of its
 * own under the vault folder, encrypted with a key of its own. That key sits
 * in the attachment ref, inside the encrypted map: the file is exactly as
 * protected as the inline copy was, and a password change — which gives the
 * profile a new master key but leaves the maps alone — does not orphan it.
 *
 * Maps saved by older versions still carry inline originals. They are moved
 * out when the map is opened (`externalizeInlineAttachments`), and an export
 * puts them back in (`inlineLocalAttachments`), so a `.mmvault` file stays
 * self-contained and readable by any version.
 */

import { aesDecrypt, aesEncrypt, importAesKey } from '../crypto/aes';
import { fromBase64, randomBytes, toBase64 } from '../crypto/utils';
import type { MindMapTreeNode, NodeAttachmentRef } from '../types';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

const eachAttachment = (root: MindMapTreeNode, visit: (ref: NodeAttachmentRef) => void): void => {
  const walk = (node: MindMapTreeNode) => {
    node.attachments?.forEach(visit);
    node.children.forEach(walk);
  };
  walk(root);
};

/** Encrypts `plaintext` into its own file and returns the key for the ref. */
export async function writeLocalAttachment(
  vaultId: string,
  attachmentId: string,
  plaintext: Uint8Array,
): Promise<string> {
  const key = randomBytes(32);
  const ciphertext = await aesEncrypt(await importAesKey(key), plaintext);
  await invoke('save_local_attachment', { vaultId, attachmentId, dataBase64: toBase64(ciphertext) });
  return toBase64(key);
}

/** The original bytes, wherever this ref keeps them; null if it has none. */
export async function readLocalAttachment(
  vaultId: string,
  ref: NodeAttachmentRef,
): Promise<Uint8Array | null> {
  if (ref.inline_data_base64) return fromBase64(ref.inline_data_base64);
  if (!ref.local_file_key_b64) return null;
  const encrypted = await invoke<string>('get_local_attachment', { vaultId, attachmentId: ref.attachment_id });
  return aesDecrypt(await importAesKey(fromBase64(ref.local_file_key_b64)), fromBase64(encrypted));
}

/**
 * Moves inline originals out to files. Returns a new tree, or null when there
 * was nothing to move. A ref whose file could not be written keeps its inline
 * copy — the next open tries again.
 */
export async function externalizeInlineAttachments(
  vaultId: string,
  root: MindMapTreeNode,
): Promise<MindMapTreeNode | null> {
  const next = structuredClone(root);
  const pending: NodeAttachmentRef[] = [];
  eachAttachment(next, (ref) => {
    if (ref.inline_data_base64 && !ref.local_file_key_b64) pending.push(ref);
  });
  if (pending.length === 0) return null;

  let moved = 0;
  for (const ref of pending) {
    try {
      ref.local_file_key_b64 = await writeLocalAttachment(
        vaultId,
        ref.attachment_id,
        fromBase64(ref.inline_data_base64!),
      );
      delete ref.inline_data_base64;
      moved += 1;
    } catch {
      // Left inline; nothing is lost.
    }
  }
  return moved > 0 ? next : null;
}

/**
 * Puts the originals back into the tree, for an export that has to stand on
 * its own. A file that cannot be read leaves the ref without an original, as
 * an attachment whose upload failed would be.
 */
export async function inlineLocalAttachments(
  vaultId: string,
  root: MindMapTreeNode,
): Promise<MindMapTreeNode> {
  const next = structuredClone(root);
  const refs: NodeAttachmentRef[] = [];
  eachAttachment(next, (ref) => {
    if (ref.local_file_key_b64) refs.push(ref);
  });
  for (const ref of refs) {
    try {
      const bytes = await readLocalAttachment(vaultId, ref);
      if (bytes) ref.inline_data_base64 = toBase64(bytes);
    } catch {
      // Exported without its original.
    }
    delete ref.local_file_key_b64;
  }
  return next;
}

const vaultLocks = new Map<string, Promise<unknown>>();

/**
 * Runs `task` once every earlier task for the same vault has finished. Opening
 * a map reads it, may move its originals out under fresh keys, and saves it
 * again; React runs effects twice in development, and two opens interleaving
 * would write the files under one set of keys and the map under the other.
 */
export function withLocalVaultLock<T>(vaultId: string, task: () => Promise<T>): Promise<T> {
  const previous = vaultLocks.get(vaultId) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(task);
  vaultLocks.set(vaultId, run);
  void run.catch(() => {}).finally(() => {
    if (vaultLocks.get(vaultId) === run) vaultLocks.delete(vaultId);
  });
  return run;
}

/** Deletes the files the saved map no longer points at. Call right after opening it. */
export async function pruneLocalAttachments(vaultId: string, root: MindMapTreeNode): Promise<void> {
  const keep = new Set<string>();
  eachAttachment(root, (ref) => {
    if (ref.local_file_key_b64) keep.add(ref.attachment_id);
  });
  await invoke('prune_local_attachments', { vaultId, keep: [...keep] });
}
