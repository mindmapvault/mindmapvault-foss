import { describe, expect, it } from 'vitest';
import type { MindMapTreeNode } from '../../../types';
import { countNodes, findNode } from '../../MindMapHelpers';
import {
  addChild,
  editNodes,
  removeNodes,
  addSibling,
  cloneSubtreeWithNewIds,
  editNode,
  insertAfter,
  moveSibling,
  nextInCycle,
  nodesWithAttachments,
  removeNode,
  removeUrl,
  reparentNode,
  resetPositions,
  toggleChecked,
  toggleIcon,
} from '../treeOps';

/**
 * These are the operations that can lose a subtree, so most of what is asserted
 * here is that nothing disappeared: the node count before and after, and that
 * the tree the caller passed in was not touched.
 */

const node = (id: string, children: MindMapTreeNode[] = []): MindMapTreeNode =>
  ({ id, text: id, children }) as MindMapTreeNode;

/** root ─┬─ a ─┬─ a1
 *        │     └─ a2
 *        └─ b */
const sample = (): MindMapTreeNode =>
  node('root', [node('a', [node('a1'), node('a2')]), node('b')]);

const ids = (tree: MindMapTreeNode): string[] => {
  const out: string[] = [];
  const walk = (n: MindMapTreeNode) => { out.push(n.id); n.children.forEach(walk); };
  walk(tree);
  return out;
};

describe('every operation leaves the caller\'s tree alone', () => {
  it('does not mutate the root it was given', () => {
    const root = sample();
    const before = JSON.stringify(root);

    addChild(root, 'a');
    addSibling(root, 'a1');
    removeNode(root, 'a1');
    moveSibling(root, 'a1', 'down');
    reparentNode(root, 'a1', 'b');
    resetPositions(root, null);
    editNode(root, 'a', (n) => { n.text = 'changed'; });

    expect(JSON.stringify(root)).toBe(before);
  });
});

describe('addChild', () => {
  it('adds under the named parent and hands back the new node', () => {
    const result = addChild(sample(), 'a')!;
    expect(result.node.text).toBe('');
    expect(findNode(result.root, 'a')!.node.children).toHaveLength(3);
    expect(countNodes(result.root)).toBe(countNodes(sample()) + 1);
  });

  it('opens a collapsed parent, so the new node is not invisible', () => {
    const root = sample();
    findNode(root, 'a')!.node.collapsed = true;
    const result = addChild(root, 'a')!;
    expect(findNode(result.root, 'a')!.node.collapsed).toBe(false);
  });

  it('clears dragged positions in the branch it inserts into', () => {
    const root = sample();
    const a = findNode(root, 'a')!.node;
    a.customX = 100; a.customY = 50;
    a.children[0].customX = 200;
    const result = addChild(root, 'a')!;
    expect(findNode(result.root, 'a')!.node.customX).toBeUndefined();
    expect(findNode(result.root, 'a1')!.node.customX).toBeUndefined();
  });

  it('records the side only for a child of the root', () => {
    expect(addChild(sample(), 'root', 'left')!.node.side).toBe('left');
    expect(addChild(sample(), 'root', 'left')!.side).toBe('left');
    expect(addChild(sample(), 'a', 'left')!.node.side).toBeUndefined();
    expect(addChild(sample(), 'a')!.side).toBeNull();
  });

  it('returns null for a parent that is not there', () => {
    expect(addChild(sample(), 'nope')).toBeNull();
  });
});

describe('addSibling', () => {
  it('inserts directly after the node, not at the end', () => {
    const result = addSibling(sample(), 'a1')!;
    const siblings = findNode(result.root, 'a')!.node.children.map((c) => c.id);
    expect(siblings).toEqual(['a1', result.node.id, 'a2']);
  });

  it('refuses on the root, which has no siblings', () => {
    expect(addSibling(sample(), 'root')).toBeNull();
  });

  it('inherits the side of the node it sits next to', () => {
    const root = node('root', [{ ...node('l'), side: 'left' } as MindMapTreeNode]);
    expect(addSibling(root, 'l')!.side).toBe('left');
  });
});

describe('removeNode', () => {
  it('takes the node and its subtree, and says what to select', () => {
    const result = removeNode(sample(), 'a')!;
    expect(ids(result.root)).toEqual(['root', 'b']);
    expect(result.parentId).toBe('root');
  });

  it('refuses to remove the root', () => {
    expect(removeNode(sample(), 'root')).toBeNull();
  });
});

describe('moveSibling', () => {
  it('swaps with the neighbour in that direction', () => {
    const moved = moveSibling(sample(), 'a2', 'up')!;
    expect(findNode(moved, 'a')!.node.children.map((c) => c.id)).toEqual(['a2', 'a1']);
  });

  it('does nothing at either end', () => {
    expect(moveSibling(sample(), 'a1', 'up')).toBeNull();
    expect(moveSibling(sample(), 'a2', 'down')).toBeNull();
  });
});

describe('reparentNode', () => {
  it('moves the node and everything under it', () => {
    const moved = reparentNode(sample(), 'a', 'b')!;
    expect(countNodes(moved)).toBe(countNodes(sample()));
    expect(findNode(moved, 'b')!.node.children.map((c) => c.id)).toEqual(['a']);
    expect(findNode(moved, 'a1')).not.toBeNull();
    expect(findNode(moved, 'root')!.node.children.map((c) => c.id)).toEqual(['b']);
  });

  /**
   * The one that loses a subtree. Splicing the node out and pushing it into
   * its own descendant leaves the whole branch unreachable from the root — it
   * is gone from the document while still pointing at itself.
   */
  it('refuses to drop a node inside its own subtree', () => {
    expect(reparentNode(sample(), 'a', 'a1')).toBeNull();
    expect(reparentNode(sample(), 'a', 'a')).toBeNull();
  });

  it('refuses to move the root', () => {
    expect(reparentNode(sample(), 'root', 'a')).toBeNull();
  });

  it('opens the new parent and drops the dragged position', () => {
    const root = sample();
    findNode(root, 'b')!.node.collapsed = true;
    findNode(root, 'a')!.node.customX = 400;
    const moved = reparentNode(root, 'a', 'b')!;
    expect(findNode(moved, 'b')!.node.collapsed).toBe(false);
    expect(findNode(moved, 'a')!.node.customX).toBeUndefined();
  });

  it('returns null rather than removing the node when the target is missing', () => {
    const result = reparentNode(sample(), 'a', 'nope');
    expect(result).toBeNull();
  });
});

describe('cloneSubtreeWithNewIds', () => {
  it('copies the shape and gives every node a fresh id', () => {
    const original = findNode(sample(), 'a')!.node;
    const clone = cloneSubtreeWithNewIds(original);
    expect(ids(clone)).toHaveLength(ids(original).length);
    expect(ids(clone).some((id) => ids(original).includes(id))).toBe(false);
    expect(clone.children.map((c) => c.text)).toEqual(['a1', 'a2']);
  });

  it('leaves attachment ids alone — copying the files is the caller\'s job', () => {
    const withFile = node('x');
    withFile.attachments = [{ attachment_id: 'keep-me' } as never];
    expect(cloneSubtreeWithNewIds(withFile).attachments![0].attachment_id).toBe('keep-me');
  });
});

describe('insertAfter', () => {
  it('puts the duplicate next to its original, not at the end', () => {
    const clone = cloneSubtreeWithNewIds(findNode(sample(), 'a1')!.node);
    const next = insertAfter(sample(), 'a1', clone)!;
    expect(findNode(next, 'a')!.node.children.map((c) => c.text)).toEqual(['a1', 'a1', 'a2']);
  });
});

describe('nodesWithAttachments', () => {
  it('finds them at any depth, and skips nodes with none', () => {
    const root = sample();
    findNode(root, 'a2')!.node.attachments = [{ attachment_id: 'f' } as never];
    findNode(root, 'b')!.node.attachments = [];
    expect(nodesWithAttachments(root).map((n) => n.id)).toEqual(['a2']);
  });
});

describe('editNodes', () => {
  it('applies the edit to every id, in one new tree', () => {
    const next = editNodes(sample(), ['a1', 'b'], (n) => { n.color = '#f00'; });
    expect(findNode(next, 'a1')!.node.color).toBe('#f00');
    expect(findNode(next, 'b')!.node.color).toBe('#f00');
    expect(findNode(next, 'a2')!.node.color).toBeUndefined();
  });

  it('skips ids that are not in the tree rather than giving up', () => {
    const next = editNodes(sample(), ['nope', 'b'], (n) => { n.color = '#f00'; });
    expect(findNode(next, 'b')!.node.color).toBe('#f00');
  });
});

describe('removeNodes', () => {
  it('removes several and reports where the selection should land', () => {
    const result = removeNodes(sample(), ['a1', 'a2'])!;
    expect(findNode(result.root, 'a')!.node.children).toHaveLength(0);
    expect(result.parentId).toBe('a');
  });

  it('never removes the root, and returns null when that leaves nothing', () => {
    expect(removeNodes(sample(), ['root'])).toBeNull();
    const result = removeNodes(sample(), ['root', 'b'])!;
    expect(findNode(result.root, 'root')).not.toBeNull();
    expect(findNode(result.root, 'b')).toBeNull();
  });

  /** A parent and its child both selected: the child goes with the parent. */
  it('copes with a selection that contains both a node and its descendant', () => {
    const result = removeNodes(sample(), ['a', 'a1'])!;
    expect(ids(result.root)).toEqual(['root', 'b']);
    expect(result.parentId).toBe('root');
  });
});

describe('resetPositions', () => {
  it('clears the whole tree when given no node', () => {
    const root = sample();
    findNode(root, 'a1')!.node.customX = 10;
    findNode(root, 'b')!.node.customY = 20;
    const next = resetPositions(root, null)!;
    expect(findNode(next, 'a1')!.node.customX).toBeUndefined();
    expect(findNode(next, 'b')!.node.customY).toBeUndefined();
  });

  it('clears one branch and leaves the rest dragged', () => {
    const root = sample();
    findNode(root, 'a1')!.node.customX = 10;
    findNode(root, 'b')!.node.customX = 20;
    const next = resetPositions(root, 'a')!;
    expect(findNode(next, 'a1')!.node.customX).toBeUndefined();
    expect(findNode(next, 'b')!.node.customX).toBe(20);
  });
});

describe('editNode', () => {
  it('returns a new root with the change applied', () => {
    const next = editNode(sample(), 'b', (n) => { n.text = 'changed'; })!;
    expect(findNode(next, 'b')!.node.text).toBe('changed');
  });

  it('returns null when the node is gone, or when the edit declines', () => {
    expect(editNode(sample(), 'nope', () => {})).toBeNull();
    expect(editNode(sample(), 'b', () => false)).toBeNull();
  });
});

describe('field edits', () => {
  it('cycles round and starts over from an unrecognised value', () => {
    expect(nextInCycle([0, 25, 50], 0)).toBe(25);
    expect(nextInCycle([0, 25, 50], 50)).toBe(0);
    expect(nextInCycle([0, 25, 50], 99)).toBe(0); // indexOf -1, so back to the start
  });

  it('gives a node without a box an unchecked one, then toggles', () => {
    expect(toggleChecked(null)).toBe(false);
    expect(toggleChecked(undefined)).toBe(false);
    expect(toggleChecked(false)).toBe(true);
    expect(toggleChecked(true)).toBe(false);
  });

  it('adds an icon, removes one already on, and clears on null', () => {
    expect(toggleIcon([], 'star')).toEqual(['star']);
    expect(toggleIcon(['star', 'flag'], 'star')).toEqual(['flag']);
    expect(toggleIcon(['star'], null)).toEqual([]);
    expect(toggleIcon(undefined, 'star')).toEqual(['star']);
  });

  it('removes a url by index without touching the original array', () => {
    const urls = [{ url: 'a', label: 'a' }, { url: 'b', label: 'b' }];
    expect(removeUrl(urls, 0)).toEqual([{ url: 'b', label: 'b' }]);
    expect(urls).toHaveLength(2);
  });
});
