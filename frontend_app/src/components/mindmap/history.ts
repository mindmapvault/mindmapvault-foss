/**
 * Undo history, as data.
 *
 * A stack of past roots and a cursor into it. Kept separate from the React
 * hook that holds it so the awkward parts — that a new edit after an undo
 * discards the redo tail, that the stack is capped and dropping the oldest
 * entry moves the cursor — are testable without rendering anything.
 */

/** How many steps back a map remembers. Older entries fall off the bottom. */
export const HISTORY_LIMIT = 50;

export interface History<T> {
  entries: T[];
  index: number;
}

export const initHistory = <T,>(entry: T): History<T> => ({ entries: [entry], index: 0 });

export const canUndo = <T,>(history: History<T>): boolean => history.index > 0;
export const canRedo = <T,>(history: History<T>): boolean => history.index < history.entries.length - 1;

/** The state the cursor is currently on. */
export const current = <T,>(history: History<T>): T => history.entries[history.index];

/**
 * Record a new state.
 *
 * Anything after the cursor goes: having undone three steps and then edited,
 * the three you undid are no longer reachable, and keeping them would let redo
 * jump to a state that never followed this one.
 */
export const pushHistory = <T,>(history: History<T>, entry: T): History<T> => {
  const kept = [...history.entries.slice(0, history.index + 1), entry];
  const entries = kept.slice(-HISTORY_LIMIT);
  return { entries, index: entries.length - 1 };
};

/** One step back, or null when there is nothing behind the cursor. */
export const undoHistory = <T,>(history: History<T>): History<T> | null =>
  canUndo(history) ? { ...history, index: history.index - 1 } : null;

/** One step forward, or null when the cursor is already at the newest state. */
export const redoHistory = <T,>(history: History<T>): History<T> | null =>
  canRedo(history) ? { ...history, index: history.index + 1 } : null;
