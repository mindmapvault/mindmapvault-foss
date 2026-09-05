import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  current,
  initHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from '../history';

describe('history', () => {
  it('starts on the first entry with nowhere to go', () => {
    const h = initHistory('a');
    expect(current(h)).toBe('a');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(undoHistory(h)).toBeNull();
    expect(redoHistory(h)).toBeNull();
  });

  it('walks back and forward over what was pushed', () => {
    let h = pushHistory(pushHistory(initHistory('a'), 'b'), 'c');
    expect(current(h)).toBe('c');
    h = undoHistory(h)!;
    expect(current(h)).toBe('b');
    h = undoHistory(h)!;
    expect(current(h)).toBe('a');
    expect(undoHistory(h)).toBeNull();
    h = redoHistory(h)!;
    expect(current(h)).toBe('b');
  });

  /**
   * Editing after an undo makes the undone states unreachable. Keeping them
   * would let redo jump to a state that never followed this one.
   */
  it('drops the redo tail once you edit from a rewound cursor', () => {
    let h = pushHistory(pushHistory(initHistory('a'), 'b'), 'c');
    h = undoHistory(undoHistory(h)!)!;
    expect(current(h)).toBe('a');

    h = pushHistory(h, 'd');
    expect(h.entries).toEqual(['a', 'd']);
    expect(canRedo(h)).toBe(false);
  });

  it('caps the stack and keeps the cursor on the newest entry', () => {
    let h = initHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = pushHistory(h, i);

    expect(h.entries).toHaveLength(HISTORY_LIMIT);
    expect(current(h)).toBe(HISTORY_LIMIT + 10);
    expect(h.index).toBe(HISTORY_LIMIT - 1);
    // The oldest states fell off the bottom rather than the newest.
    expect(h.entries[0]).toBe(11);
  });

  it('never mutates the history it was given', () => {
    const h = initHistory('a');
    pushHistory(h, 'b');
    expect(h.entries).toEqual(['a']);
    expect(h.index).toBe(0);
  });
});
