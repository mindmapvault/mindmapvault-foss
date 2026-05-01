/**
 * MindMapHelpers
 *
 * Pure helper functions for the MindMap editor.
 * No React state or side effects — safe to import anywhere.
 */

import type { MindMapTreeNode } from '../types';

let _nextId = 1;

/** Generate a unique node ID. */
export const uid = (): string => `n${Date.now()}_${_nextId++}`;

/** Deep clone a node tree (plain JSON). */
export const cloneTree = (node: MindMapTreeNode): MindMapTreeNode =>
  JSON.parse(JSON.stringify(node));

export interface FindResult {
  node: MindMapTreeNode;
  parent: MindMapTreeNode | null;
  index: number;
}

/** Find a node by id in the tree. Returns { node, parent, index } or null. */
export const findNode = (
  root: MindMapTreeNode,
  id: string,
  parent: MindMapTreeNode | null = null,
  index = 0,
): FindResult | null => {
  if (root.id === id) return { node: root, parent, index };
  for (let i = 0; i < (root.children || []).length; i++) {
    const result = findNode(root.children[i], id, root, i);
    if (result) return result;
  }
  return null;
};

/** Return the node path from root to a given id. */
export const findNodePath = (
  root: MindMapTreeNode,
  id: string,
): MindMapTreeNode[] => {
  const path: MindMapTreeNode[] = [];
  const walk = (node: MindMapTreeNode): boolean => {
    path.push(node);
    if (node.id === id) return true;
    for (const child of node.children || []) {
      if (walk(child)) return true;
    }
    path.pop();
    return false;
  };
  return walk(root) ? path : [];
};

/** Check if `ancestorId` is an ancestor of `nodeId` (or same node). */
export const isDescendant = (
  root: MindMapTreeNode,
  ancestorId: string,
  nodeId: string,
): boolean => {
  const ancestorResult = findNode(root, ancestorId);
  if (!ancestorResult) return false;
  const check = (node: MindMapTreeNode): boolean => {
    if (node.id === nodeId) return true;
    return (node.children || []).some(check);
  };
  return check(ancestorResult.node);
};

/** Count total nodes in tree. */
export const countNodes = (node: MindMapTreeNode): number => {
  if (!node) return 0;
  let c = 1;
  (node.children || []).forEach((ch) => (c += countNodes(ch)));
  return c;
};

/** Count checked/total for children that have checkboxes. */
export const countChecked = (
  node: MindMapTreeNode,
): { total: number; checked: number } => {
  let total = 0;
  let checked = 0;
  const walk = (n: MindMapTreeNode) => {
    if (n.checked === true) { total++; checked++; }
    else if (n.checked === false) { total++; }
    (n.children || []).forEach(walk);
  };
  (node.children || []).forEach(walk);
  return { total, checked };
};

/** Flatten tree to array of { node, depth, parent } — respects collapsed state. */
export interface FlatNode {
  node: MindMapTreeNode;
  depth: number;
  parent: MindMapTreeNode | null;
}

export const flattenTree = (
  node: MindMapTreeNode,
  depth = 0,
  parent: MindMapTreeNode | null = null,
): FlatNode[] => {
  const arr: FlatNode[] = [{ node, depth, parent }];
  if (!node.collapsed) {
    (node.children || []).forEach((ch) => {
      arr.push(...flattenTree(ch, depth + 1, node));
    });
  }
  return arr;
};

/** Flatten entire tree (ignoring collapsed state) for search. */
export const flattenAll = (node: MindMapTreeNode): MindMapTreeNode[] => {
  const arr: MindMapTreeNode[] = [node];
  (node.children || []).forEach((ch) => {
    arr.push(...flattenAll(ch));
  });
  return arr;
};

/** Determine which side (left/right) a node is on relative to root. */
export const getNodeSide = (
  root: MindMapTreeNode,
  nodeId: string,
): 'left' | 'right' | null => {
  if (nodeId === 'root') return null;
  for (const ch of root.children || []) {
    if (ch.id === nodeId) return ch.side || 'right';
    if (findNode(ch, nodeId)) return ch.side || 'right';
  }
  return 'right';
};

/** Default root node with all fields. */
export const defaultRoot = (): MindMapTreeNode => ({
  id: 'root',
  text: 'Central Topic',
  notes: '',
  collapsed: false,
  color: null,
  icons: [],
  checked: null,
  progress: null,
  startDate: null,
  endDate: null,
  link: null,
  urls: [],
  children: [],
});

/**
 * Migrate a node: ensure new fields exist.
 * Call when loading mindmaps that may have the old format.
 */
export const migrateNode = (node: MindMapTreeNode): MindMapTreeNode => {
  if (!node) return node;
  if (!node.icons) node.icons = [];
  if (!node.urls) node.urls = [];
  if (!node.attachments) node.attachments = [];
  if (!node.tags) node.tags = [];
  if (node.checked === undefined) node.checked = null;
  if (node.progress === undefined) node.progress = null;
  if (node.startDate === undefined) node.startDate = null;
  if (node.endDate === undefined) node.endDate = null;
  if (node.children) node.children.forEach(migrateNode);
  return node;
};
