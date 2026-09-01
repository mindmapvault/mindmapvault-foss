import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isMac } from '../platform/isMac';

export type KeyboardLayoutName = 'freemind' | 'mac';

interface UiState {
  /**
   * `null` until the user picks one explicitly — the effective layout is
   * then `keyboardLayout ?? (isMac ? 'mac' : 'freemind')`, so the
   * per-platform default keeps applying on every future launch until the
   * user overrides it, and never gets "frozen in" as an explicit choice
   * just because the app happened to compute it once.
   */
  keyboardLayout: KeyboardLayoutName | null;
  setKeyboardLayout: (layout: KeyboardLayoutName | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      keyboardLayout: null,
      setKeyboardLayout: (keyboardLayout) => set({ keyboardLayout }),
    }),
    { name: 'mindmapvault-ui' },
  ),
);

/** The layout actually in effect: the user's explicit choice, else the per-platform default. */
export function useEffectiveKeyboardLayout(): KeyboardLayoutName {
  const chosen = useUiStore((s) => s.keyboardLayout);
  return chosen ?? (isMac ? 'mac' : 'freemind');
}
