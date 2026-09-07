import { useState } from 'react';
import { buildPasswordRotationBundle } from '../crypto/keyRotation';
import type { LocalProfileForRotation, VaultEntryForRotation } from '../crypto/keyRotation';
import { useAuthStore } from '../store/auth';
import { PasswordInput } from './PasswordInput';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke<T>(cmd, args);
}

/**
 * Enabled for FOSS. This component is shared with the hosted product, where
 * an attachment's own key is wrapped directly by the master key
 * (`key_wrap: 'master-aes-256-gcm'` in crypto/encryptedVault.ts) — rotation
 * re-wraps the private keys and re-encrypts titles/notes, but never re-wraps
 * that per-attachment key, so a hosted rotation would leave every attachment
 * silently and irreversibly undecryptable. That is the failure this flag
 * originally guarded against.
 *
 * It does not apply here. FOSS is local-only (`useModeStore` hardcodes
 * `mode: 'local'`), and every call site of `encryptAttachmentForOwner` /
 * `decryptAttachmentForOwner` in this build is unreachable — each one is
 * gated behind an `isLocalMode` check (EditorPage's upload/download/preview/
 * delete handlers, VaultsPage's preview loader). A local attachment is never
 * wrapped by the master key at all: it's stored as inline base64 inside the
 * mind-map tree JSON, protected by the vault's KEM-derived key, which
 * `buildPasswordRotationBundle` never touches — confirmed on the Rust side
 * too, since `apply_local_password_rotation` only rewrites the profile file
 * and the vault title index, never a vault blob.
 *
 * If this file is ever shared into a build that talks to a hosted backend,
 * re-check this flag for that build rather than assuming it still holds.
 */
const ROTATION_ENABLED = true;

interface PasswordRotationFormProps {
  /** Rendered next to "Change password" — e.g. a Cancel button on the standalone page. */
  secondaryAction?: { label: string; onClick: () => void };
  /** Shown instead of the form once the rotation succeeds. */
  onDone?: () => void;
  doneAction?: { label: string; onClick: () => void };
}

/**
 * Local password rotation: re-derives the master key and re-wraps the private
 * keys and every vault title. Vault content is untouched — it is protected by
 * the key-pair, which does not change.
 *
 * Used both by the standalone /change-password route and the Account section
 * of the settings modal.
 */
export function PasswordRotationForm({ secondaryAction, onDone, doneAction }: PasswordRotationFormProps) {
  const { sessionKeys, setSessionKeys } = useAuthStore();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleRotate = async () => {
    setError('');

    if (!currentPassword) { setError('Current password is required'); return; }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (newPassword === currentPassword) { setError('New password must differ from the current password'); return; }
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return; }

    setWorking(true);
    try {
      setProgress('Loading profile…');
      const profile = await invoke<LocalProfileForRotation | null>('get_local_profile');
      if (!profile) throw new Error('No active profile found — are you logged in?');

      setProgress('Loading vault index…');
      const vaults = await invoke<VaultEntryForRotation[]>('list_local_vaults');

      setProgress('Verifying current password and deriving new keys… (this takes a few seconds)');
      const bundle = await buildPasswordRotationBundle(
        currentPassword,
        newPassword,
        profile,
        vaults,
      );

      setProgress(`Re-encrypting ${vaults.length} vault title${vaults.length === 1 ? '' : 's'}…`);
      await invoke('apply_local_password_rotation', {
        newProfile: bundle.newProfile,
        updatedVaults: bundle.updatedVaults,
      });

      // Update the in-memory session so the rest of the session stays valid.
      if (sessionKeys) {
        setSessionKeys({ ...sessionKeys, masterKey: bundle.newMasterKey });
      }

      setProgress('');
      setDone(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onDone?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('Current password is incorrect') ||
        msg.includes('decrypt') ||
        msg.includes('AES-GCM') ||
        msg.includes('OperationError')
      ) {
        setError('Current password is incorrect — please try again.');
      } else {
        setError(`Password change failed: ${msg}`);
      }
    } finally {
      setWorking(false);
      setProgress('');
    }
  };

  if (!ROTATION_ENABLED) {
    return (
      <div
        className="rounded-lg px-3 py-2 text-sm"
        style={{ background: 'rgba(234,179,8,0.12)', color: '#eab308' }}
      >
        <p className="font-medium">Changing your password is temporarily unavailable.</p>
        <p className="mt-1" style={{ color: 'var(--text-muted)' }}>
          Rotating the password would make existing attachments in your notes and nodes
          impossible to decrypt. We have disabled it until that is fixed, rather than risk
          your data. Your vaults and attachments are unaffected in the meantime.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-green-700/50 bg-green-900/20 px-4 py-3 text-sm text-green-300">
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Password changed successfully. All vault titles and keys have been re-encrypted.
        </div>
        {doneAction && (
          <button
            onClick={doneAction.onClick}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)]"
          >
            {doneAction.label}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--fg-muted)]">
        Your private keys and all vault titles will be re-encrypted with the new password.
        Vault data (the mind-map content) is not touched — it is protected by your key-pair,
        which does not change.
      </p>

      <div className="space-y-3">
        <label className="block text-sm text-[var(--fg-muted)]">
          Current password
          <PasswordInput
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            disabled={working}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--fg)] placeholder-[var(--fg-muted)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
            placeholder="Current password"
          />
        </label>

        <label className="block text-sm text-[var(--fg-muted)]">
          New password
          <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            disabled={working}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--fg)] placeholder-[var(--fg-muted)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
            placeholder="New password (min 8 characters)"
          />
        </label>

        <label className="block text-sm text-[var(--fg-muted)]">
          Confirm new password
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            disabled={working}
            onKeyDown={(e) => e.key === 'Enter' && !working && void handleRotate()}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--fg)] placeholder-[var(--fg-muted)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-60"
            placeholder="Repeat new password"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {working && progress && (
        <div className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {progress}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        {secondaryAction && (
          <button
            onClick={secondaryAction.onClick}
            disabled={working}
            className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--fg-muted)] transition hover:border-[var(--accent)] hover:text-[var(--fg)] disabled:opacity-50"
          >
            {secondaryAction.label}
          </button>
        )}
        <button
          onClick={() => void handleRotate()}
          disabled={working || !currentPassword || !newPassword || !confirmPassword}
          className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {working ? 'Changing…' : 'Change password'}
        </button>
      </div>

      <p className="text-xs text-[var(--fg-muted)]">
        This operation cannot be undone. Make sure you remember the new password —
        there is no recovery option without it.
      </p>
    </div>
  );
}

export default PasswordRotationForm;
