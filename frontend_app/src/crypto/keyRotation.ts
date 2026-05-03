// ── Password rotation / key re-wrapping ──────────────────────────────────────
//
// All cryptographic work for a local password change happens here.
// The Tauri layer (`apply_local_password_rotation`) only performs the atomic
// file-write; it never sees plaintext keys or passwords.

import { aesDecrypt, aesEncrypt, importAesKey } from './aes';
import { DEFAULT_ARGON2_PARAMS, deriveMasterKey, deriveTitleKey } from './kdf';
import { fromBase64, randomBytes, toBase64 } from './utils';
import type { Argon2Params } from '../types';

// ── Minimal local types (mirrors Rust / LocalUnlockPage shapes) ───────────────

export interface LocalProfileForRotation {
  username: string;
  argon2_salt: string;
  argon2_params: Argon2Params;
  classical_public_key: string;
  pq_public_key: string;
  classical_priv_encrypted: string;
  pq_priv_encrypted: string;
  key_version: number;
  created_at: string;
}

export interface VaultEntryForRotation {
  id: string;
  title_encrypted: string;
  vault_note_encrypted: string | null | undefined;
}

export interface RotatedVaultEntry {
  id: string;
  title_encrypted: string;
  vault_note_encrypted: string | null;
}

export interface PasswordRotationBundle {
  newProfile: LocalProfileForRotation;
  updatedVaults: RotatedVaultEntry[];
  /** New master key bytes — use to update the in-memory session after rotation. */
  newMasterKey: Uint8Array;
}

// ── Rotation builder ──────────────────────────────────────────────────────────

/**
 * Verifies `oldPassword`, derives a new master key from `newPassword` with a
 * fresh Argon2id salt, re-wraps both private keys, and re-encrypts all vault
 * titles and notes.  Returns the bundle ready to pass to the Tauri
 * `apply_local_password_rotation` command.
 *
 * Throws:
 *  - if `oldPassword` fails to decrypt the stored private keys (wrong password)
 *  - if `newPassword` is the same as `oldPassword` (no change)
 *  - if any per-vault title re-encryption fails
 *
 * The vault blobs (mind-map trees) are NOT touched — they are protected by the
 * hybrid KEM envelope which uses the user's key-pair, and the key-pair itself
 * is not rotated here.
 */
export async function buildPasswordRotationBundle(
  oldPassword: string,
  newPassword: string,
  currentProfile: LocalProfileForRotation,
  vaults: VaultEntryForRotation[],
): Promise<PasswordRotationBundle> {
  // ── 1. Derive old master key and validate old password ────────────────────
  const oldMasterKey = await deriveMasterKey(
    oldPassword,
    currentProfile.argon2_salt,
    currentProfile.argon2_params,
  );

  const oldWrapKey = await importAesKey(oldMasterKey);

  // Decrypt both private keys — this serves as password proof.
  // Throws DOMException on wrong password (AES-GCM authentication failure).
  let classicalPriv: Uint8Array;
  let pqPriv: Uint8Array;
  try {
    classicalPriv = await aesDecrypt(oldWrapKey, fromBase64(currentProfile.classical_priv_encrypted));
    pqPriv = await aesDecrypt(oldWrapKey, fromBase64(currentProfile.pq_priv_encrypted));
  } catch {
    throw new Error('Current password is incorrect');
  }

  // ── 2. Derive new master key with a fresh salt ────────────────────────────
  const newSalt = randomBytes(16);
  const newSaltB64 = toBase64(newSalt);
  const newMasterKey = await deriveMasterKey(newPassword, newSaltB64, DEFAULT_ARGON2_PARAMS);

  // ── 3. Re-wrap private keys under the new master key ─────────────────────
  const newWrapKey = await importAesKey(newMasterKey);
  const newClassicalPrivEnc = await aesEncrypt(newWrapKey, classicalPriv);
  const newPqPrivEnc = await aesEncrypt(newWrapKey, pqPriv);

  // ── 4. Build updated profile ──────────────────────────────────────────────
  const newProfile: LocalProfileForRotation = {
    ...currentProfile,
    argon2_salt: newSaltB64,
    argon2_params: {
      m_cost: DEFAULT_ARGON2_PARAMS.m_cost,
      t_cost: DEFAULT_ARGON2_PARAMS.t_cost,
      p_cost: DEFAULT_ARGON2_PARAMS.p_cost,
    },
    classical_priv_encrypted: toBase64(newClassicalPrivEnc),
    pq_priv_encrypted: toBase64(newPqPrivEnc),
    key_version: (currentProfile.key_version ?? 1) + 1,
  };

  // ── 5. Re-encrypt vault titles and notes ─────────────────────────────────
  const oldTitleKey = await deriveTitleKey(oldMasterKey);
  const newTitleKey = await deriveTitleKey(newMasterKey);

  const updatedVaults: RotatedVaultEntry[] = await Promise.all(
    vaults.map(async (vault): Promise<RotatedVaultEntry> => {
      // Re-encrypt title
      let newTitleEncrypted: string;
      try {
        const titlePt = await aesDecrypt(oldTitleKey, fromBase64(vault.title_encrypted));
        const newTitleCt = await aesEncrypt(newTitleKey, titlePt);
        newTitleEncrypted = toBase64(newTitleCt);
      } catch {
        throw new Error(`Failed to re-encrypt title for vault ${vault.id}`);
      }

      // Re-encrypt note (only if non-empty — empty string and null are passed through)
      let newNoteEncrypted: string | null = null;
      const rawNote = vault.vault_note_encrypted;
      if (rawNote && rawNote.length > 0) {
        try {
          const notePt = await aesDecrypt(oldTitleKey, fromBase64(rawNote));
          const newNoteCt = await aesEncrypt(newTitleKey, notePt);
          newNoteEncrypted = toBase64(newNoteCt);
        } catch {
          throw new Error(`Failed to re-encrypt note for vault ${vault.id}`);
        }
      }

      return {
        id: vault.id,
        title_encrypted: newTitleEncrypted,
        vault_note_encrypted: newNoteEncrypted,
      };
    }),
  );

  return { newProfile, updatedVaults, newMasterKey };
}
