import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { VaultIcon } from './Logo';
import { PasswordRotationForm } from './PasswordRotationForm';
import { LegalDocumentDialog, type LegalDocument } from './LegalDocumentDialog';
import { APP_VERSION, CHANGELOG, type ChangeKind } from '../changelog';
import { useAuthStore } from '../store/auth';
import { AutosaveMode, useThemeStore } from '../store/theme';
import {
  useUiStore,
  useEffectiveKeyboardLayout,
  resolveDensity,
  type KeyboardLayoutName,
  type DensityPreset,
  type TrayPosition,
} from '../store/ui';
import { isMac } from '../platform/isMac';

export type SettingsTab = 'account' | 'changelog' | 'appearance' | 'interface' | 'help';

interface LocalStorageDirInfo {
  path: string;
  is_override: boolean;
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

const PRESETS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

/** Canvas backgrounds: a dark row and a light row, so either theme has options. */
const CANVAS_PRESETS = [
  '#0f172a', '#111827', '#1c1917', '#172554', '#134e4a',
  '#f1f5f9', '#ffffff', '#fefce8', '#f5f3ff', '#ecfdf5',
];

const autosaveOptions: Array<{ value: AutosaveMode; label: string }> = [
  { value: 'change', label: 'After each change' },
  { value: '30s', label: 'Every 30 seconds' },
  { value: '5m', label: 'Every 5 minutes' },
  { value: 'never', label: 'Never' },
];

const icons: Record<SettingsTab, ReactNode> = {
  account: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="8" r="4" />
      <path strokeLinecap="round" d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  ),
  changelog: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path strokeLinecap="round" d="M9 12h6M9 16h4" />
    </svg>
  ),
  appearance: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 3a9 9 0 0 0 0 18" fill="currentColor" stroke="none" opacity="0.35" />
    </svg>
  ),
  interface: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M3 9h18M8 9v11" />
    </svg>
  ),
  help: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.5.2-.7.6-.7 1.1v.5" />
      <circle cx="12" cy="17" r=".6" fill="currentColor" stroke="none" />
    </svg>
  ),
};

const tabTitles: Record<SettingsTab, string> = {
  account: 'Account',
  changelog: "What's New",
  appearance: 'Appearance',
  interface: 'Interface',
  help: 'Help',
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-2 block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
      {children}
    </span>
  );
}

/**
 * On/off switch for the settings rows. It stays a real checkbox under the
 * paint — `appearance-none` turns the input itself into the track — so the
 * wrapping `<label>`, keyboard operation and focus handling all keep working.
 */
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-11 cursor-pointer appearance-none rounded-full transition-colors"
        style={{
          background: checked ? 'var(--accent)' : 'var(--surface-2)',
          border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-light)'}`,
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-[3px] top-1/2 h-[18px] w-[18px] rounded-full transition-transform"
        style={{
          transform: `translateY(-50%) translateX(${checked ? '20px' : '0'})`,
          background: checked ? '#fff' : 'var(--text-muted)',
        }}
      />
    </span>
  );
}

// ─── Local storage folder ────────────────────────────────────────────────────

function LocalStorageFolderSection({ onFolderChanged }: { onFolderChanged?: () => void }) {
  const [pathInfo, setPathInfo] = useState<LocalStorageDirInfo | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [working, setWorking] = useState(false);
  const [pathError, setPathError] = useState('');
  const [isWslRuntime, setIsWslRuntime] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const info = await invokeTauri<LocalStorageDirInfo>('get_local_storage_dir');
        setPathInfo(info);
        setPathInput(info.path);
      } catch (err) {
        setPathError(err instanceof Error ? err.message : String(err));
      }
      try {
        setIsWslRuntime(await invokeTauri<boolean>('is_wsl_environment'));
      } catch {
        setIsWslRuntime(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!pathInput.trim()) return;
    setWorking(true);
    setPathError('');
    try {
      const info = await invokeTauri<LocalStorageDirInfo>('set_local_storage_dir', { path: pathInput.trim() });
      setPathInfo(info);
      setPathInput(info.path);
      onFolderChanged?.();
    } catch (err) {
      setPathError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  const handleBrowse = async () => {
    setPathError('');
    try {
      const selected = await invokeTauri<string | null>('pick_local_storage_dir');
      if (selected) setPathInput(selected);
    } catch (err) {
      setPathError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleReset = async () => {
    setWorking(true);
    setPathError('');
    try {
      const info = await invokeTauri<LocalStorageDirInfo>('reset_local_storage_dir');
      setPathInfo(info);
      setPathInput(info.path);
      onFolderChanged?.();
    } catch (err) {
      setPathError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
      <SectionLabel>Local storage folder</SectionLabel>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Use a writable folder for offline vault files. Change this if vault creation fails due to permissions.
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          placeholder="/path/to/mindmapvault-local"
          disabled={working}
          className="flex-1 rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
        />
        <button
          type="button"
          onClick={() => void handleBrowse()}
          disabled={working || isWslRuntime}
          title={isWslRuntime ? 'Browse dialog is disabled in WSL for stability. Paste path manually.' : 'Browse folders'}
          className="rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
        >
          Browse…
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={working || !pathInput.trim()}
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {working ? 'Saving…' : 'Set folder'}
        </button>
        <button
          type="button"
          onClick={() => void handleReset()}
          disabled={working}
          className="rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
        >
          Use default
        </button>
      </div>

      {pathInfo && (
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Active folder: {pathInfo.path}{pathInfo.is_override ? ' (custom)' : ' (default)'}
        </p>
      )}

      {pathError && (
        <p className="mt-2 text-xs text-red-400">{pathError}</p>
      )}

      {isWslRuntime && (
        <p className="mt-2 text-xs text-amber-300">
          WSL mode detected: folder browse popup is disabled for stability. Paste a path manually, e.g. /home/kornelko/mindmapvault-local.
        </p>
      )}
    </section>
  );
}

// ─── Keyboard layout ──────────────────────────────────────────────────────────

const LAYOUT_OPTIONS: { value: KeyboardLayoutName; title: string; blurb: string }[] = [
  { value: 'freemind', title: 'FreeMind', blurb: 'F-key driven — Tab/Enter to add, F2 rename, F9/F10 undo/redo. The classic mind-map layout.' },
  { value: 'mac', title: 'Mac', blurb: 'Modelled on MindNode — no function keys. ⌘Return rename, ⌘Z/⇧⌘Z undo/redo, B for colour, H for root.' },
];

function KeyboardLayoutPicker() {
  const chosen = useUiStore((s) => s.keyboardLayout);
  const setKeyboardLayout = useUiStore((s) => s.setKeyboardLayout);
  const effective = useEffectiveKeyboardLayout();

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {LAYOUT_OPTIONS.map((opt) => {
          const active = effective === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setKeyboardLayout(opt.value)}
              className="rounded-lg p-3 text-left text-sm transition"
              style={{
                background: active ? 'var(--accent-soft, var(--surface-2))' : 'var(--surface-2)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border-light)'}`,
                color: 'var(--text-primary)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{opt.title}</span>
                {active && <span className="text-xs" style={{ color: 'var(--accent)' }}>Active</span>}
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{opt.blurb}</p>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        {chosen == null
          ? `Following this device's default (${isMac ? 'Mac' : 'FreeMind'} — macOS uses Mac, everything else uses FreeMind).`
          : 'Set explicitly — stays this way on this device regardless of the operating system default.'}
        {chosen != null && (
          <>
            {' '}
            <button type="button" onClick={() => setKeyboardLayout(null)} className="underline decoration-dotted underline-offset-2" style={{ color: 'var(--accent)' }}>
              Reset to device default
            </button>
          </>
        )}
      </p>
    </div>
  );
}

// ─── Account ─────────────────────────────────────────────────────────────────

function AccountTab({
  username,
  autoLogoutMinutes,
  setAutoLogoutMinutes,
  onClose,
  onStorageFolderChanged,
}: {
  username: string | null;
  autoLogoutMinutes: number | null;
  setAutoLogoutMinutes: (minutes: number | null) => void;
  onClose: () => void;
  onStorageFolderChanged?: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Local profile</SectionLabel>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)' }}>
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            {username ?? 'local user'}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            MindMapVault FOSS is local-only. Your vaults never leave this device, and there is no
            account on any server.
          </p>
        </div>
      </section>

      <LocalStorageFolderSection onFolderChanged={onStorageFolderChanged} />

      <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <SectionLabel>Auto-logout after inactivity</SectionLabel>
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
            style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
          />
          <button
            type="button"
            onClick={() => setAutoLogoutMinutes(null)}
            title="Disable automatic logout"
            className="rounded-lg px-3 py-2 text-sm font-medium transition"
            style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
          >
            Never
          </button>
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Minutes of inactivity before the session locks. Leave empty or use Never to disable.
        </p>
      </section>

      <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <SectionLabel>Change password</SectionLabel>
        <PasswordRotationForm
          doneAction={{
            label: 'Done',
            onClick: () => { onClose(); navigate('/vaults'); },
          }}
        />
      </section>
    </div>
  );
}

// ─── Changelog / What's New ──────────────────────────────────────────────────

const changeKindStyle: Record<ChangeKind, { label: string; color: string; bg: string }> = {
  feature: { label: 'New', color: '#a78bfa', bg: 'rgba(124,58,237,0.14)' },
  improvement: { label: 'Improved', color: '#38bdf8', bg: 'rgba(56,189,248,0.14)' },
  fix: { label: 'Fixed', color: '#34d399', bg: 'rgba(16,185,129,0.14)' },
};

function ChangelogTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>What's new</SectionLabel>
        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)' }}>
          v{APP_VERSION}
        </span>
      </div>

      {CHANGELOG.map((entry) => (
        <section key={entry.version} className="rounded-xl p-4" style={{ background: 'var(--surface-2)' }}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Version {entry.version}</h3>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(entry.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
          {entry.highlights && (
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>{entry.highlights}</p>
          )}
          <ul className="mt-3 space-y-2.5">
            {entry.items.map((item, i) => {
              const k = changeKindStyle[item.kind];
              return (
                <li key={i} className="flex gap-2.5">
                  <span
                    className="mt-0.5 inline-flex h-5 w-[4.5rem] shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2 text-[10px] font-semibold uppercase leading-none tracking-wide"
                    style={{ background: k.bg, color: k.color }}
                  >
                    {k.label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{item.title}</p>
                    {item.desc && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.desc}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ─── Appearance ──────────────────────────────────────────────────────────────

function AppearanceTab({
  mode,
  primaryColor,
  canvasColor,
  autosaveMode,
  toggleMode,
  setPrimaryColor,
  setCanvasColor,
  setAutosaveMode,
  onOpenLegal,
}: {
  mode: 'dark' | 'light';
  primaryColor: string;
  canvasColor: string | null;
  autosaveMode: AutosaveMode;
  toggleMode: () => void;
  setPrimaryColor: (color: string) => void;
  setCanvasColor: (color: string | null) => void;
  setAutosaveMode: (mode: AutosaveMode) => void;
  onOpenLegal: (doc: LegalDocument) => void;
}) {
  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between">
          <SectionLabel>Theme</SectionLabel>
          <button
            onClick={toggleMode}
            title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition"
            style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
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
      </section>

      <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <SectionLabel>Accent colour</SectionLabel>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {PRESETS.map((c) => (
            <button
              key={c}
              onClick={() => setPrimaryColor(c)}
              className="h-8 w-8 rounded-lg transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                outline: primaryColor.toLowerCase() === c ? `2.5px solid ${c}` : 'none',
                outlineOffset: '2px',
                boxShadow: primaryColor.toLowerCase() === c ? '0 0 0 1px var(--surface-1)' : 'none',
              }}
              title={c}
              aria-label={`Use accent colour ${c}`}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)' }}>
          <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Custom</label>
          <input
            type="color"
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            aria-label="Custom accent colour"
            className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{primaryColor}</span>
        </div>
      </section>
      <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <SectionLabel>Canvas background</SectionLabel>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {CANVAS_PRESETS.map((c) => (
            <button
              key={c}
              onClick={() => setCanvasColor(c)}
              className="h-8 w-8 rounded-lg transition-transform hover:scale-110"
              style={{
                backgroundColor: c,
                border: '1px solid var(--border-light)',
                outline: canvasColor?.toLowerCase() === c ? '2.5px solid var(--accent)' : 'none',
                outlineOffset: '2px',
              }}
              title={c}
              aria-label={`Use canvas background ${c}`}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)' }}>
          <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Custom</label>
          <input
            type="color"
            value={canvasColor ?? (mode === 'dark' ? '#0f172a' : '#f1f5f9')}
            onChange={(e) => setCanvasColor(e.target.value)}
            aria-label="Custom canvas background"
            className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            {canvasColor ?? 'theme default'}
          </span>
          <button
            type="button"
            onClick={() => setCanvasColor(null)}
            disabled={canvasColor === null}
            className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-40"
            style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
          >
            Match theme
          </button>
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Applies to the mind map canvas in both light and dark mode. Node colours still
          come from the theme, so a background far from it may read poorly — “Match theme”
          hands the canvas back.
        </p>
      </section>

      <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <SectionLabel>Autosave</SectionLabel>
        <select
          value={autosaveMode}
          onChange={(e) => setAutosaveMode(e.target.value as AutosaveMode)}
          aria-label="Autosave"
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
        >
          {autosaveOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Choose whether vault edits save after each change, on an interval, or only when saved manually.
        </p>
      </section>

      <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <SectionLabel>About</SectionLabel>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Version {APP_VERSION}</p>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => onOpenLegal('credits')}
            className="text-xs font-medium underline decoration-dotted underline-offset-2"
            style={{ color: 'var(--accent)' }}
          >
            Credits and acknowledgements
          </button>
          <a
            href="https://github.com/mindmapvault/mindmapvault-foss"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
            GitHub
          </a>
        </div>
      </section>
    </div>
  );
}

// ─── Interface ────────────────────────────────────────────────────────────────

const DENSITY_OPTIONS: { value: DensityPreset; title: string; blurb: string }[] = [
  { value: 'lean', title: 'Lean', blurb: 'Smaller buttons. Only the essentials stay on the toolbar; the rest live in a "More actions" menu. Status bar hidden by default.' },
  { value: 'standard', title: 'Standard', blurb: 'Today\'s toolbar — every action visible, default sizing.' },
  { value: 'large', title: 'Large', blurb: 'Bigger buttons with labels under the essentials. Colour and icon trays turn on by default.' },
];

const TRAY_POSITIONS: TrayPosition[] = ['top', 'bottom', 'left', 'right'];

function InterfaceTab() {
  const densityPreset = useUiStore((s) => s.densityPreset);
  const setDensityPreset = useUiStore((s) => s.setDensityPreset);
  const statusBarOverride = useUiStore((s) => s.statusBarOverride);
  const setStatusBarOverride = useUiStore((s) => s.setStatusBarOverride);
  const toolbarLabelsOverride = useUiStore((s) => s.toolbarLabelsOverride);
  const setToolbarLabelsOverride = useUiStore((s) => s.setToolbarLabelsOverride);
  const buttonShortcutsOverride = useUiStore((s) => s.buttonShortcutsOverride);
  const setButtonShortcutsOverride = useUiStore((s) => s.setButtonShortcutsOverride);
  const colourTrayEnabled = useUiStore((s) => s.colourTrayEnabled);
  const colourTrayPosition = useUiStore((s) => s.colourTrayPosition);
  const setColourTray = useUiStore((s) => s.setColourTray);
  const iconTrayEnabled = useUiStore((s) => s.iconTrayEnabled);
  const iconTrayPosition = useUiStore((s) => s.iconTrayPosition);
  const setIconTray = useUiStore((s) => s.setIconTray);

  const resolved = resolveDensity(densityPreset, statusBarOverride, toolbarLabelsOverride, buttonShortcutsOverride);

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Density</SectionLabel>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {DENSITY_OPTIONS.map((opt) => {
            const active = densityPreset === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDensityPreset(opt.value)}
                className="rounded-lg p-3 text-left text-sm transition"
                style={{
                  background: 'var(--surface-2)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border-light)'}`,
                  color: 'var(--text-primary)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{opt.title}</span>
                  {active && <span className="text-xs" style={{ color: 'var(--accent)' }}>Active</span>}
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{opt.blurb}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <SectionLabel>Overrides</SectionLabel>
        <label className="flex items-center justify-between gap-3 py-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
          <span>
            Status bar
            <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              {statusBarOverride == null ? `(following ${densityPreset} default: ${resolved.statusBarVisible ? 'on' : 'off'})` : '(set explicitly)'}
            </span>
          </span>
          <ToggleSwitch checked={resolved.statusBarVisible} onChange={setStatusBarOverride} />
        </label>
        {statusBarOverride != null && (
          <button type="button" onClick={() => setStatusBarOverride(null)} className="text-xs underline decoration-dotted underline-offset-2" style={{ color: 'var(--accent)' }}>
            Reset to density default
          </button>
        )}

        <label className="mt-2 flex items-center justify-between gap-3 py-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
          <span>
            Toolbar labels
            <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              {toolbarLabelsOverride == null ? `(following ${densityPreset} default: ${resolved.toolbarLabels ? 'on' : 'off'})` : '(set explicitly)'}
            </span>
          </span>
          <ToggleSwitch checked={resolved.toolbarLabels} onChange={setToolbarLabelsOverride} />
        </label>
        {toolbarLabelsOverride != null && (
          <button type="button" onClick={() => setToolbarLabelsOverride(null)} className="text-xs underline decoration-dotted underline-offset-2" style={{ color: 'var(--accent)' }}>
            Reset to density default
          </button>
        )}

        <label className="mt-2 flex items-center justify-between gap-3 py-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
          <span>
            Keyboard shortcuts on buttons
            <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              {buttonShortcutsOverride == null ? `(following ${densityPreset} default: ${resolved.buttonShortcuts ? 'on' : 'off'})` : '(set explicitly)'}
            </span>
          </span>
          <ToggleSwitch checked={resolved.buttonShortcuts} onChange={setButtonShortcutsOverride} />
        </label>
        {buttonShortcutsOverride != null && (
          <button type="button" onClick={() => setButtonShortcutsOverride(null)} className="text-xs underline decoration-dotted underline-offset-2" style={{ color: 'var(--accent)' }}>
            Reset to density default
          </button>
        )}
      </section>

      <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <SectionLabel>Colour tray</SectionLabel>
        <label className="flex items-center justify-between gap-3 py-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
          <span>Show the colour swatch strip on the canvas</span>
          <ToggleSwitch checked={colourTrayEnabled} onChange={(v) => setColourTray(v)} />
        </label>
        {colourTrayEnabled && (
          <div className="mt-1 flex gap-1.5">
            {TRAY_POSITIONS.map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setColourTray(true, pos)}
                className="rounded px-2.5 py-1 text-xs capitalize transition"
                style={{
                  background: colourTrayPosition === pos ? 'var(--accent)' : 'var(--surface-2)',
                  color: colourTrayPosition === pos ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-light)',
                }}
              >
                {pos}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <SectionLabel>Icon tray</SectionLabel>
        <label className="flex items-center justify-between gap-3 py-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
          <span>Show the icon strip on the canvas</span>
          <ToggleSwitch checked={iconTrayEnabled} onChange={(v) => setIconTray(v)} />
        </label>
        {iconTrayEnabled && (
          <div className="mt-1 flex gap-1.5">
            {TRAY_POSITIONS.map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setIconTray(true, pos)}
                className="rounded px-2.5 py-1 text-xs capitalize transition"
                style={{
                  background: iconTrayPosition === pos ? 'var(--accent)' : 'var(--surface-2)',
                  color: iconTrayPosition === pos ? '#fff' : 'var(--text-secondary)',
                  border: '1px solid var(--border-light)',
                }}
              >
                {pos}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <SectionLabel>Keyboard layout</SectionLabel>
        <KeyboardLayoutPicker />
      </section>
    </div>
  );
}

// ─── Modal shell ─────────────────────────────────────────────────────────────

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
  /** Called after the local storage folder is set or reset, so a vault list can refresh. */
  onStorageFolderChanged?: () => void;
}

/**
 * Tabbed settings hub: Account, What's New, Appearance.
 *
 * The FOSS build is local-only, so there is no profile, plan, notification or
 * feedback section — everything here is device-local state.
 */
export function SettingsModal({ open, onClose, initialTab = 'account', onStorageFolderChanged }: SettingsModalProps) {
  const {
    mode, primaryColor, canvasColor, autoLogoutMinutes, autosaveMode,
    toggleMode, setPrimaryColor, setCanvasColor, setAutoLogoutMinutes, setAutosaveMode,
  } = useThemeStore();
  const username = useAuthStore((s) => s.username);

  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);

  const order: SettingsTab[] = ['account', 'appearance', 'interface', 'changelog', 'help'];

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[1400] flex items-center justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:p-4"
        onClick={onClose}
      >
        <div
          className="flex h-full w-full flex-col overflow-hidden rounded-none shadow-2xl sm:h-[min(82vh,46rem)] sm:max-w-4xl sm:flex-row sm:rounded-2xl"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sidebar */}
          <aside
            className="shrink-0 border-b sm:w-56 sm:border-b-0 sm:border-r"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="flex items-center gap-2 px-4 py-4 sm:px-5">
              <VaultIcon size={24} />
              <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>MindMapVault</span>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-2 pb-2 sm:flex-col sm:px-3 sm:pb-4">
              {order.map((id) => {
                const active = id === tab;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition"
                    style={{
                      background: active ? 'var(--surface-2)' : 'transparent',
                      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {icons[id]}
                    {tabTitles[id]}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{tabTitles[tab]}</h2>
              <button
                type="button"
                onClick={onClose}
                title="Close"
                className="rounded-lg p-1.5 transition hover:bg-[var(--surface-2)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {tab === 'account' && (
                <AccountTab
                  username={username}
                  autoLogoutMinutes={autoLogoutMinutes}
                  setAutoLogoutMinutes={setAutoLogoutMinutes}
                  onClose={onClose}
                  onStorageFolderChanged={onStorageFolderChanged}
                />
              )}
              {tab === 'changelog' && <ChangelogTab />}
              {tab === 'appearance' && (
                <AppearanceTab
                  mode={mode}
                  primaryColor={primaryColor}
                  canvasColor={canvasColor}
                  autosaveMode={autosaveMode}
                  toggleMode={toggleMode}
                  setPrimaryColor={setPrimaryColor}
                  setCanvasColor={setCanvasColor}
                  setAutosaveMode={setAutosaveMode}
                  onOpenLegal={setLegalDocument}
                />
              )}
              {tab === 'interface' && <InterfaceTab />}
              {tab === 'help' && <HelpTab />}
            </div>
          </div>
        </div>
      </div>
      <LegalDocumentDialog document={legalDocument} onClose={() => setLegalDocument(null)} />
    </>,
    document.body,
  );
}

// ─── Help ────────────────────────────────────────────────────────────────────

function HelpTab() {
  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Getting help</SectionLabel>
        <p className="text-sm leading-6" style={{ color: 'var(--text-primary)' }}>
          MindMapVault FOSS is local-only — there is no account or server to write to. For bugs,
          questions, and ideas, the project's GitHub repository is the place to go.
        </p>
      </section>

      <section className="border-t pt-6" style={{ borderColor: 'var(--border)' }}>
        <SectionLabel>Links</SectionLabel>
        <a
          href="https://github.com/mindmapvault/mindmapvault-foss/discussions"
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition"
          style={{ background: 'var(--surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
        >
          Ask a question in Discussions
        </a>
        <a
          href="https://github.com/mindmapvault/mindmapvault-foss/issues"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition"
          style={{ background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
        >
          Report a bug
        </a>
        <a
          href="https://github.com/mindmapvault/mindmapvault-foss"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition"
          style={{ background: 'transparent', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
        >
          Open project repository
        </a>
      </section>
    </div>
  );
}

export default SettingsModal;
