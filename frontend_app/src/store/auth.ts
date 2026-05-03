import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SessionKeys } from '../types';

interface AuthState {
  // ── Persisted (localStorage) ──────────────────────────────────────────────
  accessToken: string | null;
  refreshToken: string | null;
  username: string | null;

  // ── Memory-only — NEVER written to storage ────────────────────────────────
  sessionKeys: SessionKeys | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  setTokens: (access: string, refresh: string, username: string) => void;
  setAccessToken: (token: string) => void;
  setSessionKeys: (keys: SessionKeys) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  hasSessionKeys: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      username: null,
      sessionKeys: null,

      setTokens: (access, refresh, username) =>
        set({ accessToken: access, refreshToken: refresh, username }),

      setAccessToken: (token) => set({ accessToken: token }),

      setSessionKeys: (keys) => set({ sessionKeys: keys }),

      logout: () =>
        set({ accessToken: null, refreshToken: null, username: null, sessionKeys: null }),

      isAuthenticated: () => {
        const state = get();
        return !!state.accessToken || (!!state.username && !!state.sessionKeys);
      },

      hasSessionKeys: () => !!get().sessionKeys,
    }),
    {
      name: 'mindmapvault-auth',
      // Only persist tokens and username — cryptographic keys stay in memory only.
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        username: state.username,
      }),
    },
  ),
);
