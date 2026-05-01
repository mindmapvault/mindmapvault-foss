import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { aesDecrypt, aesEncrypt, importAesKey } from '../crypto/aes';
import { DesktopTauriBadge } from '../components/DesktopTauriBadge';
import { LegalDocumentDialog, type LegalDocument } from '../components/LegalDocumentDialog';
import { deriveMasterKey, DEFAULT_ARGON2_PARAMS } from '../crypto/kdf';
import { generateUserKeyPairs } from '../crypto/kem';
import { fromBase64, randomBytes, toBase64 } from '../crypto/utils';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';
import type { SessionKeys } from '../types';
import packageJson from '../../package.json';

interface LocalProfile {
  username: string;
  argon2_salt: string;
  argon2_params: { m_cost: number; t_cost: number; p_cost: number };
  classical_public_key: string;
  pq_public_key: string;
  classical_priv_encrypted: string;
  pq_priv_encrypted: string;
  key_version: number;
  created_at: string;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

export function LocalUnlockPage() {
  const navigate = useNavigate();
  const { setSessionKeys, setTokens } = useAuthStore();
  const { mode: themeMode, toggleMode } = useThemeStore();

  // 'loading'  — scanning the folder
  // 'unlock'   — profile found in folder → show login form
  // 'empty'    — folder exists but has no profile → offer to pick folder or create
  // 'create'   — user explicitly chose to create a new profile
  const [step, setStep] = useState<'loading' | 'unlock' | 'empty' | 'create'>('loading');
  const [prevStep, setPrevStep] = useState<'unlock' | 'empty'>('empty');
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [storageDir, setStorageDir] = useState('');
  const [changingDir, setChangingDir] = useState(false);
  const [profiles, setProfiles] = useState<string[]>([]);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [legalDocument, setLegalDocument] = useState<LegalDocument | null>(null);
  const appVersion = `v${String(packageJson.version ?? 'dev')}`;

  /** Switch to a different user: activates them in Rust config and loads their profile. */
  const handleSelectUser = async (uname: string) => {
    setError('');
    setPassword('');
    setStep('loading');
    try {
      const p = await invoke<LocalProfile>('set_active_user', { username: uname });
      setSelectedUsername(uname);
      setProfile(p);
      setUsername(p.username);
      setStep('unlock');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch user');
      setStep('empty');
    }
  };

  // On mount: run migrations, list profiles, activate the first one.
  useEffect(() => {
    (async () => {
      try {
        const info = await invoke<{ path: string; is_override: boolean }>('get_local_storage_dir');
        setStorageDir(info.path);
      } catch { /* non-fatal */ }
      try {
        const list = await invoke<string[]>('list_local_profiles');
        setProfiles(list);
        if (list.length > 0) {
          const p = await invoke<LocalProfile>('set_active_user', { username: list[0] });
          setSelectedUsername(list[0]);
          setProfile(p);
          setUsername(p.username);
          setStep('unlock');
        } else {
          setStep('empty');
        }
      } catch {
        setProfiles([]);
        setStep('empty');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePickFolder = async () => {
    setError('');
    setChangingDir(true);
    try {
      const picked = await invoke<string | null>('pick_local_storage_dir');
      if (picked) {
        const info = await invoke<{ path: string; is_override: boolean }>('set_local_storage_dir', { path: picked });
        setStorageDir(info.path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change folder');
    } finally {
      setChangingDir(false);
    }
  };

  const handleCreate = async () => {
    setError('');
    if (!username.trim()) { setError('Username is required'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setWorking(true);
    try {
      // Derive keys
      const salt = randomBytes(16);
      const saltB64 = toBase64(salt);
      const masterKey = await deriveMasterKey(password, saltB64, DEFAULT_ARGON2_PARAMS);

      // Generate keypairs
      const keys = generateUserKeyPairs();

      // Wrap private keys with master key
      const wrapKey = await importAesKey(masterKey);
      const classicalPrivEnc = await aesEncrypt(wrapKey, keys.classical.privateKey);
      const pqPrivEnc = await aesEncrypt(wrapKey, keys.pq.secretKey);

      const newProfile: LocalProfile = {
        username: username.trim(),
        argon2_salt: saltB64,
        argon2_params: DEFAULT_ARGON2_PARAMS,
        classical_public_key: toBase64(keys.classical.publicKey),
        pq_public_key: toBase64(keys.pq.publicKey),
        classical_priv_encrypted: toBase64(classicalPrivEnc),
        pq_priv_encrypted: toBase64(pqPrivEnc),
        key_version: 1,
        created_at: new Date().toISOString(),
      };

      await invoke('save_local_profile', { profile: newProfile });

      // Update profiles list so dropdown is current if user returns
      const updatedList = await invoke<string[]>('list_local_profiles');
      setProfiles(updatedList);
      setSelectedUsername(username.trim());

      // Set session keys in memory
      const sessionKeys: SessionKeys = {
        masterKey,
        classicalPrivKey: keys.classical.privateKey,
        classicalPubKey: keys.classical.publicKey,
        pqPrivKey: keys.pq.secretKey,
        pqPubKey: keys.pq.publicKey,
      };
      setSessionKeys(sessionKeys);
      setTokens('', '', username.trim());

      navigate('/vaults');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create profile');
    } finally {
      setWorking(false);
    }
  };

  const handleUnlock = async () => {
    setError('');
    if (!profile) return;
    if (!password) { setError('Password is required'); return; }

    setWorking(true);
    try {
      const masterKey = await deriveMasterKey(
        password,
        profile.argon2_salt,
        profile.argon2_params,
      );

      // Try to decrypt the private keys — this validates the password.
      const wrapKey = await importAesKey(masterKey);
      const classicalPriv = await aesDecrypt(wrapKey, fromBase64(profile.classical_priv_encrypted));
      const pqPriv = await aesDecrypt(wrapKey, fromBase64(profile.pq_priv_encrypted));

      const sessionKeys: SessionKeys = {
        masterKey,
        classicalPrivKey: classicalPriv,
        classicalPubKey: fromBase64(profile.classical_public_key),
        pqPrivKey: pqPriv,
        pqPubKey: fromBase64(profile.pq_public_key),
      };
      setSessionKeys(sessionKeys);
      setTokens('', '', profile.username);

      navigate('/vaults');
    } catch {
      setError('Wrong password — could not decrypt keys');
    } finally {
      setWorking(false);
    }
  };

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <p className="text-[var(--fg-muted)]">Scanning folder…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] transition-colors">
      <button
        type="button"
        onClick={toggleMode}
        className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg-muted)] transition hover:border-[var(--accent)] hover:text-[var(--fg)]"
        title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {themeMode === 'dark' ? (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="12" cy="12" r="4" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
            </svg>
            <span>Light</span>
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
            </svg>
            <span>Dark</span>
          </>
        )}
      </button>

      <div className="w-full max-w-sm px-6">

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[var(--fg)] mb-1">
            MindMapVault
          </h1>
          <p className="text-xs text-[var(--fg-muted)] mb-1">Privacy-first mind maps</p>
          <p className="text-sm text-[var(--fg-muted)]">
            {step === 'unlock' && `Local vault workspace — ${selectedUsername || profile?.username}`}
            {step === 'empty'  && 'No vault found in this folder'}
            {step === 'create' && 'Create a new local profile'}
          </p>
        </div>

        <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--fg-muted)]">
            Vault folder
          </p>
          <p className="truncate text-xs text-[var(--fg)] font-mono" title={storageDir}>
            {storageDir || '…'}
          </p>
          <button
            type="button"
            onClick={handlePickFolder}
            disabled={changingDir || working}
            className="mt-2 inline-flex items-center rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--fg)] hover:border-[var(--accent)] disabled:opacity-50"
          >
            {changingDir ? 'Opening…' : 'Choose folder'}
          </button>
        </div>

        {/* ── UNLOCK: profile detected → login fields only ── */}
        {step === 'unlock' && (
          <div className="space-y-4">
            {profiles.length > 1 ? (
              <select
                value={selectedUsername}
                onChange={(e) => { void handleSelectUser(e.target.value); }}
                className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--card)]
                           text-[var(--fg)] focus:border-[var(--accent)] outline-none cursor-pointer"
              >
                {profiles.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={username}
                readOnly
                autoComplete="username"
                className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--card)]
                           text-[var(--fg)] opacity-70 cursor-default outline-none"
              />
            )}
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
              autoComplete="current-password"
              autoFocus
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--card)]
                         text-[var(--fg)] focus:border-[var(--accent)] outline-none"
              disabled={working}
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              onClick={handleUnlock}
              disabled={working || !password}
              className="w-full py-3 rounded-lg bg-[var(--accent)] text-white font-medium
                         hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              {working ? 'Deriving keys…' : 'Unlock'}
            </button>
            <button
              type="button"
              onClick={() => { setError(''); setUsername(''); setPassword(''); setPrevStep('unlock'); setStep('create'); }}
              className="w-full text-sm text-[var(--fg-muted)] hover:text-[var(--accent)] transition-colors"
            >
              + Create a new user in this folder
            </button>
          </div>
        )}

        {/* ── EMPTY: no profile in folder → pick folder or create ── */}
        {step === 'empty' && (
          <div className="space-y-3">
            {error && <p className="text-sm text-red-400 mb-1">{error}</p>}
            <button
              onClick={handlePickFolder}
              disabled={changingDir}
              className="w-full py-3 rounded-lg bg-[var(--accent)] text-white font-medium
                         hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              {changingDir ? 'Opening…' : 'Open existing vault folder'}
            </button>
            <button
              onClick={() => { setError(''); setPrevStep('empty'); setStep('create'); }}
              className="w-full py-3 rounded-lg border border-[var(--border)] text-[var(--fg)]
                         hover:border-[var(--accent)] transition-colors"
            >
              Create new offline profile
            </button>
          </div>
          
        )}
        {(
          <div className="mt-6 mb-2 flex flex-col items-center justify-center gap-2 text-xs">
            <p className="text-xs text-[var(--fg-muted)]">Version {appVersion}</p>
            <button
              type="button"
              onClick={() => setLegalDocument('credits')}
              className="font-medium underline decoration-dotted underline-offset-2"
              style={{ color: 'var(--accent)' }}
            >
              Credits and acknowledgements
            </button>
            <a
              href="https://github.com/mindmapvault/mindmapvault-foss"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium transition-colors hover:opacity-90"
              style={{ color: 'var(--fg-muted)' }}
              title="MindMapVault FOSS on GitHub"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              <span>GitHub</span>
            </a>
          </div>
        )}
        {/* ── CREATE: new profile setup ── */}
        {step === 'create' && (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--card)]
                         text-[var(--fg)] focus:border-[var(--accent)] outline-none"
              disabled={working}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--card)]
                         text-[var(--fg)] focus:border-[var(--accent)] outline-none"
              disabled={working}
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--card)]
                         text-[var(--fg)] focus:border-[var(--accent)] outline-none"
              disabled={working}
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={working}
              className="w-full py-3 rounded-lg bg-[var(--accent)] text-white font-medium
                         hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              {working ? 'Deriving keys…' : 'Set up offline profile'}
            </button>
            <button
              onClick={() => {
                setError('');
                setPassword('');
                setConfirmPassword('');
                if (prevStep === 'unlock' && profile) {
                  setUsername(profile.username);
                  setSelectedUsername(profile.username);
                }
                setStep(prevStep);
              }}
              className="w-full text-sm text-[var(--fg-muted)] hover:text-[var(--accent)] transition-colors"
            >
              ← Back
            </button>
          </div>
        )}
      </div>

      <DesktopTauriBadge />
      <LegalDocumentDialog document={legalDocument} onClose={() => setLegalDocument(null)} />
    </div>
  );
}
