/**
 * The native MindMapVault interchange format (`.mmvault`).
 *
 * Every other export format is an interchange with a third-party application
 * and loses fields the editor can set — icons, progress, dates, tags, images,
 * attachments. This one is the application's own: a versioned JSON envelope
 * carrying the tree verbatim, so export → re-import is lossless.
 *
 * It exists because of a concrete gap: a user could export a map, but no
 * importer could read the result back with its formatting intact.
 *
 * The envelope is versioned (`format` field) so a future change is an
 * explicit, detectable break rather than a silent mis-parse.
 */

import type { MindMapTreeNode } from '../types';

export const MMVAULT_FORMAT = 'mindmapvault-tree';
export const MMVAULT_VERSION = 1;

interface MmvaultEnvelope {
  format: typeof MMVAULT_FORMAT;
  version: number;
  exported_at: string;
  root: MindMapTreeNode;
}

/**
 * Serializes a tree to the native format. The tree is carried verbatim —
 * no field is dropped, renamed, or re-typed.
 */
export function treeToMmvault(root: MindMapTreeNode): string {
  const envelope: MmvaultEnvelope = {
    format: MMVAULT_FORMAT,
    version: MMVAULT_VERSION,
    exported_at: new Date().toISOString(),
    root,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Parses a `.mmvault` file back into a tree.
 *
 * The root is re-titled from the file name, matching the other importers.
 * Node ids are preserved as exported — they are stable within a vault and
 * re-importing creates a new vault, so there is no collision.
 */
export function mmvaultToTree(json: string, title: string): MindMapTreeNode {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid .mmvault file: not valid JSON');
  }

  const env = parsed as Partial<MmvaultEnvelope>;
  if (env?.format !== MMVAULT_FORMAT) {
    throw new Error('Invalid .mmvault file: missing format marker');
  }
  if (typeof env.version !== 'number' || env.version > MMVAULT_VERSION) {
    throw new Error(`Unsupported .mmvault version: ${String(env.version)}`);
  }
  if (!env.root || typeof env.root !== 'object' || !Array.isArray((env.root as MindMapTreeNode).children)) {
    throw new Error('Invalid .mmvault file: no root node');
  }

  const root = env.root as MindMapTreeNode;
  root.id = 'root';
  root.text = title || root.text;
  return root;
}
