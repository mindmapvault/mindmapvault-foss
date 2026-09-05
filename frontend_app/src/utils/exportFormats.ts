/**
 * The mind map formats a vault can be exported to.
 *
 * These were five handlers that each built a blob and named a file, and five
 * menu buttons that each built the same tree snapshot inline. Only the
 * serializer and the extension ever differed.
 *
 * FreeMind and Freeplane share the `.mm` extension but not their serializer,
 * so the format id is not the extension.
 */

import type { MindMapTreeNode } from '../types';
import { treeToMarkdown } from './markdownExport';
import { treeToFreemind } from './freemindExport';
import { treeToFreeplane } from './freeplaneExport';
import { treeToWisemapping } from './wisemappingExport';

export type ExportFormatId = 'md' | 'freemind' | 'freeplane' | 'wisemapping' | 'xmind';

export interface ExportFormat {
  id: ExportFormatId;
  /** Menu wording, extension included. */
  label: string;
  /** Appended to the base name, with its dot. */
  extension: string;
  /** Builds the file. `title` is only used by formats that embed it. */
  serialize: (root: MindMapTreeNode, title: string) => Blob | Promise<Blob>;
}

const xml = (text: string) => new Blob([text], { type: 'application/xml' });

export const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: 'md',
    label: 'Markdown (.md)',
    extension: '.md',
    serialize: (root, title) => new Blob([treeToMarkdown(root, title)], { type: 'text/markdown' }),
  },
  {
    id: 'freemind',
    label: 'FreeMind (.mm)',
    extension: '.mm',
    serialize: (root) => xml(treeToFreemind(root)),
  },
  {
    id: 'freeplane',
    label: 'FreePlane (.mm)',
    extension: '.mm',
    serialize: (root) => xml(treeToFreeplane(root)),
  },
  {
    id: 'wisemapping',
    label: 'WiseMapping (.wxml)',
    extension: '.wxml',
    serialize: (root) => xml(treeToWisemapping(root)),
  },
  {
    id: 'xmind',
    label: 'XMind (.xmind)',
    extension: '.xmind',
    // Loaded on demand: the XMind writer pulls in a zip encoder nothing else needs.
    serialize: async (root, title) => {
      const { treeToXmind } = await import('./xmindExport');
      return treeToXmind(root, title);
    },
  },
];
