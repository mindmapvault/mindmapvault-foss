import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { isTauri } from './storage';
import { useAuthStore } from './store/auth';
import { useModeStore } from './store/mode';
import { useThemeStore } from './store/theme';

const EditorPage = lazy(() => import('./pages/EditorPage').then((module) => ({ default: module.EditorPage })));
const LocalUnlockPage = lazy(() => import('./pages/LocalUnlockPage').then((module) => ({ default: module.LocalUnlockPage })));
const VaultsPage = lazy(() => import('./pages/VaultsPage').then((module) => ({ default: module.VaultsPage })));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage').then((module) => ({ default: module.ChangePasswordPage })));

function darken(hex: string, amount = 25): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (n >> 16) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export default function App() {
  const { mode, primaryColor, autoLogoutMinutes } = useThemeStore();
  const appMode = useModeStore((s) => s.mode);
  const setAppMode = useModeStore((s) => s.setMode);
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionKeys = useAuthStore((s) => s.sessionKeys);
  const logout = useAuthStore((s) => s.logout);
  const isDesktop = isTauri();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('light', mode === 'light');
    root.style.setProperty('--accent', primaryColor);
    root.style.setProperty('--accent-hover', darken(primaryColor));
  }, [mode, primaryColor]);

  useEffect(() => {
    if (isDesktop && appMode === null) {
      setAppMode('local');
    }
  }, [isDesktop, appMode, setAppMode]);

  useEffect(() => {
    if (!autoLogoutMinutes || (!accessToken && !sessionKeys)) {
      return;
    }

    const timeoutMs = autoLogoutMinutes * 60 * 1000;
    let timer: number | undefined;

    const resetTimer = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        logout();
      }, timeoutMs);
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    document.addEventListener('visibilitychange', resetTimer);
    resetTimer();

    return () => {
      if (timer) window.clearTimeout(timer);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
      document.removeEventListener('visibilitychange', resetTimer);
    };
  }, [autoLogoutMinutes, accessToken, sessionKeys, logout]);

  const defaultRoute = '/local-unlock';

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-slate-300">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Navigate to={defaultRoute} replace />} />
          <Route path="/app" element={<Navigate to="/vaults" replace />} />

          <Route path="/mindmap" element={<Navigate to="/mindmap/vaults" replace />} />
          <Route path="/mindmap/vaults" element={<VaultsPage />} />
          <Route path="/mindmap/vaults/:id" element={<EditorPage />} />

          <Route path="/local-unlock" element={isDesktop ? <LocalUnlockPage /> : <Navigate to="/vaults" replace />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/vaults" element={<VaultsPage />} />
            <Route path="/vaults/:id" element={<EditorPage />} />
            <Route path="/change-password" element={isDesktop ? <ChangePasswordPage /> : <Navigate to="/vaults" replace />} />
          </Route>

          <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
