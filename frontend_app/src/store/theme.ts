import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light';
export type AutosaveMode = 'change' | '30s' | '5m' | 'never';

interface ThemeState {
  mode: ThemeMode;
  primaryColor: string;
  /**
   * Canvas background override, or null to follow the light/dark theme.
   * Kept separate from the theme's own value so switching modes still works:
   * clearing this hands the canvas back to whichever palette is active.
   */
  canvasColor: string | null;
  autoLogoutMinutes: number | null;
  autosaveMode: AutosaveMode;
  setMode: (mode: ThemeMode) => void;
  setPrimaryColor: (color: string) => void;
  setCanvasColor: (color: string | null) => void;
  setAutoLogoutMinutes: (minutes: number | null) => void;
  setAutosaveMode: (mode: AutosaveMode) => void;
  toggleMode: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'dark',
      primaryColor: '#6366f1',
      canvasColor: null,
      autoLogoutMinutes: null,
      autosaveMode: 'change',
      setMode: (mode) => set({ mode }),
      setPrimaryColor: (primaryColor) => set({ primaryColor }),
      setCanvasColor: (canvasColor) => set({ canvasColor }),
      setAutoLogoutMinutes: (autoLogoutMinutes) => set({ autoLogoutMinutes }),
      setAutosaveMode: (autosaveMode) => set({ autosaveMode }),
      toggleMode: () => set({ mode: get().mode === 'dark' ? 'light' : 'dark' }),
    }),
    { name: 'mindmapvault-theme' },
  ),
);
