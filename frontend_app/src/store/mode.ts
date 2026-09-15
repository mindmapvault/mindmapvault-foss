import { create } from 'zustand';

export type AppMode = 'local';

interface ModeState {
  /** FOSS is local-only by product contract. */
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  clearMode: () => void;
}

/**
 * Key the hosted desktop app persists its mode under. Both desktop builds
 * share the Tauri identifier `com.mindmapvault.desktop`, so on Linux they
 * share one WebKitGTK profile and its localStorage. An earlier FOSS build
 * persisted this store under the same key, so a `mode: "server"` written by
 * the hosted app rehydrated here, flipped `isLocalMode` off, and the editor
 * started calling the stubbed server API — the "Offline-only mode active"
 * banner on every map, and a failing Save. The mode is now a constant and is
 * never persisted; the stale key is removed so nothing else can read it.
 */
const LEGACY_PERSIST_KEY = 'mindmapvault-mode';

try {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LEGACY_PERSIST_KEY);
  }
} catch {
  // Storage can be unavailable (privacy mode, sandbox); the default is 'local' regardless.
}

export const useModeStore = create<ModeState>()((set) => ({
  mode: 'local',
  setMode: () => set({ mode: 'local' }),
  clearMode: () => set({ mode: 'local' }),
}));
