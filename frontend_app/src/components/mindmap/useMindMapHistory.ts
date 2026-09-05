import { useCallback, useMemo, useRef, useState } from 'react';
import type { MindMapTreeNode } from '../../types';
import { cloneTree } from '../MindMapHelpers';
import {
  canRedo as canRedoAt,
  canUndo as canUndoAt,
  current,
  initHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
} from './history';

/**
 * Undo history for the map.
 *
 * The stack is held in a ref *and* in state. The ref is what the callbacks
 * read, so a burst of edits in one tick each sees the previous one rather than
 * a stale render's copy; the state is what the toolbar's enabled/disabled
 * buttons re-render from. Keeping only one of the two breaks a different half.
 *
 * `onRestore` is called with the tree to go back to — undo and redo change the
 * cursor here, but putting the tree back is the editor's business.
 */
export function useMindMapHistory(
  initialRoot: MindMapTreeNode,
  onRestore: (root: MindMapTreeNode) => void,
) {
  const ref = useRef<History<MindMapTreeNode>>(initHistory(initialRoot));
  const [state, setState] = useState<History<MindMapTreeNode>>(ref.current);

  const apply = useCallback((next: History<MindMapTreeNode>) => {
    ref.current = next;
    setState(next);
  }, []);

  /** Record an edit. The tree is cloned, so later edits cannot reach back into it. */
  const push = useCallback((root: MindMapTreeNode) => {
    apply(pushHistory(ref.current, cloneTree(root)));
  }, [apply]);

  /** Start over from one state — a freshly opened map has no past. */
  const reset = useCallback((root: MindMapTreeNode) => {
    apply(initHistory(cloneTree(root)));
  }, [apply]);

  const step = useCallback((next: History<MindMapTreeNode> | null) => {
    if (!next) return;
    apply(next);
    // Cloned on the way out too: the editor is free to mutate what it is
    // given, and the stack has to survive that.
    onRestore(cloneTree(current(next)));
  }, [apply, onRestore]);

  const undo = useCallback(() => step(undoHistory(ref.current)), [step]);
  const redo = useCallback(() => step(redoHistory(ref.current)), [step]);

  // Memoised for the same reason as the viewport's: the editor's `mutate`
  // takes this object as a dependency, and so does every callback built on
  // `mutate`. A fresh object each render would give all of them a new identity
  // every time anything at all re-rendered.
  return useMemo(() => ({
    push,
    reset,
    undo,
    redo,
    canUndo: canUndoAt(state),
    canRedo: canRedoAt(state),
    /** For the history panel, which lists the states and their positions. */
    entries: state.entries,
    index: state.index,
  }), [push, reset, undo, redo, state]);
}
