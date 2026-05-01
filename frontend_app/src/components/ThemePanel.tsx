import { useEffect, useRef, useState } from 'react';
import { AutosaveMode, useThemeStore } from '../store/theme';
import { LegalDocumentDialog, type LegalDocument } from './LegalDocumentDialog';
import packageJson from '../../package.json';

const PRESETS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
];

export function ThemePanel() {
  const {
    mode,
    primaryColor,
    autoLogoutMinutes,
    autosaveMode,
    toggleMode,
    setPrimaryColor,
    setAutoLogoutMinutes,
    setAutosaveMode,
  } = useThemeStore();
  const [open, setOpen] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const appVersion = `v${String(packageJson.version ?? 'dev')}`;

  const autosaveOptions: Array<{ value: AutosaveMode; label: string }> = [
    { value: 'change', label: 'After each change' },
    { value: '30s', label: 'Every 30 seconds' },
    { value: '5m', label: 'Every 5 minutes' },
    { value: 'never', label: 'Never' },
  ];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title={`Appearance settings (${appVersion})`}
        style={{ color: 'var(--text-secondary)' }}
        className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
        </svg>
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
          {appVersion}
        </span>
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute right-0 top-10 z-50 max-h-[calc(100vh-6rem)] w-64 overflow-y-auto rounded-xl p-4 shadow-2xl"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
        >
          {/* Mode toggle */}
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Appearance
            </span>
            <button
              onClick={toggleMode}
              title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-light)',
              }}
            >
              {mode === 'dark' ? (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="4" />
                    <path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
                  </svg>
                  Light mode
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                  Dark mode
                </>
              )}
            </button>
          </div>

          {/* Colour swatches */}
          <div className="mb-3">
            <span
              className="mb-2 block text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Accent colour
            </span>
            <div className="grid grid-cols-5 gap-2">
              {PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setPrimaryColor(c)}
                  className="h-8 w-8 rounded-lg transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    outline: primaryColor.toLowerCase() === c ? `2.5px solid ${c}` : 'none',
                    outlineOffset: '2px',
                    boxShadow: primaryColor.toLowerCase() === c ? `0 0 0 1px var(--surface-1)` : 'none',
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Custom colour picker */}
          <div
            className="flex items-center gap-3 rounded-lg px-3 py-2"
            style={{ background: 'var(--surface-2)' }}
          >
            <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Custom
            </label>
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
              {primaryColor}
            </span>
          </div>

          <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <span
              className="mb-2 block text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Editor
            </span>
            <label className="mb-2 block text-sm" style={{ color: 'var(--text-primary)' }}>
              Autosave
            </label>
            <select
              value={autosaveMode}
              onChange={(e) => setAutosaveMode(e.target.value as AutosaveMode)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-light)',
              }}
            >
              {autosaveOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Choose whether vault edits save after each change, on an interval, or only when saved manually.
            </p>
          </div>

          <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <span
              className="mb-2 block text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Security
            </span>
            <label className="mb-2 block text-sm" style={{ color: 'var(--text-primary)' }}>
              Auto-logout after inactivity
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={1440}
                step={1}
                value={autoLogoutMinutes ?? ''}
                onChange={(e) => {
                  const value = e.target.value.trim();
                  if (!value) {
                    setAutoLogoutMinutes(null);
                    return;
                  }
                  const minutes = Math.max(1, Math.min(1440, Math.trunc(Number(value))));
                  if (Number.isFinite(minutes)) setAutoLogoutMinutes(minutes);
                }}
                placeholder="Never"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: 'var(--surface-2)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-light)',
                }}
              />
              <button
                type="button"
                onClick={() => setAutoLogoutMinutes(null)}
                title="Disable automatic logout"
                className="rounded-lg px-3 py-2 text-sm font-medium transition"
                style={{
                  background: 'var(--surface-2)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-light)',
                }}
              >
                Never
              </button>
            </div>
            <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              Enter minutes of inactivity before automatic logout. Leave empty or use Never to disable.
            </p>
          </div>

          <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <button
              type="button"
              onClick={() => setLegalDocument('credits')}
              className="text-xs font-medium underline decoration-dotted underline-offset-2"
              style={{ color: 'var(--accent)' }}
            >
              View credits and acknowledgements
            </button>
          </div>
        </div>
      )}
      <LegalDocumentDialog document={legalDocument} onClose={() => setLegalDocument(null)} />
    </div>
  );
}
