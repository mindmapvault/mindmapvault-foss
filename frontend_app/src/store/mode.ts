import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppMode = 'local';

interface ModeState {
  /** FOSS is local-only by product contract. */
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  clearMode: () => void;
}

export const useModeStore = create<ModeState>()(
  persist(
    (set) => ({
      mode: 'local',
      setMode: () => set({ mode: 'local' }),
      clearMode: () => set({ mode: 'local' }),
    }),
    { name: 'mindmapvault-mode' },
  ),
);
