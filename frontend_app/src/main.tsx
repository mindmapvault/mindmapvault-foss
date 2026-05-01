import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Apply persisted theme synchronously before first render to avoid flash.
(function applyStoredTheme() {
  try {
    const raw = localStorage.getItem('mindmapvault-theme') ?? localStorage.getItem('crypt-mind-theme');
    if (!raw) return;
    const { state } = JSON.parse(raw) as { state: { mode?: string; primaryColor?: string } };
    if (state?.mode === 'light') document.documentElement.classList.add('light');
    if (state?.primaryColor) {
      const hex = state.primaryColor.replace('#', '');
      const n = parseInt(hex, 16);
      const darken = (ch: number) => Math.max(0, ch - 25).toString(16).padStart(2, '0');
      const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
      document.documentElement.style.setProperty('--accent', state.primaryColor);
      document.documentElement.style.setProperty('--accent-hover', `#${darken(r)}${darken(g)}${darken(b)}`);
    }
  } catch { /* ignore */ }
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
