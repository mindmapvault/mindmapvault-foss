/**
 * Unit tests for the password rotation crypto helper.
 *
 * These tests run in Node (vitest, environment: 'node').  Node 18+ exposes
 * `globalThis.crypto` with full WebCrypto support, so the same WebCrypto
 * primitives used in the browser are exercised here.
 */
import { describe, it, expect } from 'vitest';
import { buildPasswordRotationBundle } from '../keyRotation';
import type { LocalProfileForRotation, VaultEntryForRotation } from '../keyRotation';
import { deriveMasterKey, DEFAULT_ARGON2_PARAMS, deriveTitleKey } from '../kdf';
import { importAesKey } from '../aes';
import { aesDecrypt, aesEncrypt } from '../aes';
import { fromBase64, toBase64, randomBytes } from '../utils';

// ── helpers ──────────────────────────────────────────────────────────────────

async function makeProfile(password: string): Promise<{
  profile: LocalProfileForRotation;
  masterKey: Uint8Array;
  classicalPriv: Uint8Array;
  pqPriv: Uint8Array;
}> {
  const salt = toBase64(randomBytes(16));
  const masterKey = await deriveMasterKey(password, salt, DEFAULT_ARGON2_PARAMS);
  const wrapKey = await importAesKey(masterKey);

  const classicalPriv = randomBytes(32);
  const pqPriv = randomBytes(64);

  const classicalPrivEnc = toBase64(await aesEncrypt(wrapKey, classicalPriv));
  const pqPrivEnc = toBase64(await aesEncrypt(wrapKey, pqPriv));

  const profile: LocalProfileForRotation = {
    username: 'testuser',
    argon2_salt: salt,
    argon2_params: { ...DEFAULT_ARGON2_PARAMS },
    classical_public_key: toBase64(randomBytes(32)),
    pq_public_key: toBase64(randomBytes(64)),
    classical_priv_encrypted: classicalPrivEnc,
    pq_priv_encrypted: pqPrivEnc,
    key_version: 1,
    created_at: new Date().toISOString(),
  };
  return { profile, masterKey, classicalPriv, pqPriv };
}

async function makeVaults(
  masterKey: Uint8Array,
  count: number,
): Promise<{ vaults: VaultEntryForRotation[]; plaintexts: string[] }> {
  const titleKey = await deriveTitleKey(masterKey);
  const vaults: VaultEntryForRotation[] = [];
  const plaintexts: string[] = [];

  for (let i = 0; i < count; i++) {
    const plaintext = `Vault title ${i + 1}`;
    plaintexts.push(plaintext);
    const ct = await aesEncrypt(titleKey, new TextEncoder().encode(plaintext));
    vaults.push({
      id: `vault-${i + 1}`,
      title_encrypted: toBase64(ct),
      vault_note_encrypted: null,
    });
  }

  return { vaults, plaintexts };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('buildPasswordRotationBundle', () => {
  it('returns a bundle with incremented key_version', async () => {
    const { profile, masterKey } = await makeProfile('old-pass-111');
    const { vaults } = await makeVaults(masterKey, 1);

    const bundle = await buildPasswordRotationBundle('old-pass-111', 'new-pass-222', profile, vaults);

    expect(bundle.newProfile.key_version).toBe(profile.key_version + 1);
  });

  it('new profile has a different salt than the old one', async () => {
    const { profile, masterKey } = await makeProfile('old-pass-111');
    const { vaults } = await makeVaults(masterKey, 1);

    const bundle = await buildPasswordRotationBundle('old-pass-111', 'new-pass-222', profile, vaults);

    expect(bundle.newProfile.argon2_salt).not.toBe(profile.argon2_salt);
  });

  it('private keys are recoverable with the new password', async () => {
    const { profile, masterKey, classicalPriv, pqPriv } = await makeProfile('old-pass-111');
    const { vaults } = await makeVaults(masterKey, 0);

    const bundle = await buildPasswordRotationBundle('old-pass-111', 'new-pass-222', profile, vaults);

    // Derive new master key from the new password + new salt.
    const newMasterKey = await deriveMasterKey(
      'new-pass-222',
      bundle.newProfile.argon2_salt,
      bundle.newProfile.argon2_params,
    );
    const newWrapKey = await importAesKey(newMasterKey);

    const recoveredClassical = await aesDecrypt(
      newWrapKey,
      fromBase64(bundle.newProfile.classical_priv_encrypted),
    );
    const recoveredPq = await aesDecrypt(
      newWrapKey,
      fromBase64(bundle.newProfile.pq_priv_encrypted),
    );

    expect(recoveredClassical).toEqual(classicalPriv);
    expect(recoveredPq).toEqual(pqPriv);
  });

  it('vault titles decrypt correctly with the new title key', async () => {
    const { profile, masterKey } = await makeProfile('old-pass-111');
    const { vaults, plaintexts } = await makeVaults(masterKey, 3);

    const bundle = await buildPasswordRotationBundle('old-pass-111', 'new-pass-222', profile, vaults);

    const newTitleKey = await deriveTitleKey(bundle.newMasterKey);
    for (let i = 0; i < bundle.updatedVaults.length; i++) {
      const decrypted = new TextDecoder().decode(
        await aesDecrypt(newTitleKey, fromBase64(bundle.updatedVaults[i].title_encrypted)),
      );
      expect(decrypted).toBe(plaintexts[i]);
    }
  });

  it('old title key no longer decrypts the new ciphertext', async () => {
    const { profile, masterKey } = await makeProfile('old-pass-111');
    const { vaults } = await makeVaults(masterKey, 1);

    const bundle = await buildPasswordRotationBundle('old-pass-111', 'new-pass-222', profile, vaults);

    // Old title key should fail to decrypt the new ciphertext.
    const oldTitleKey = await deriveTitleKey(masterKey);
    await expect(
      aesDecrypt(oldTitleKey, fromBase64(bundle.updatedVaults[0].title_encrypted)),
    ).rejects.toThrow();
  });

  it('throws on wrong current password', async () => {
    const { profile, masterKey } = await makeProfile('correct-pass-123');
    const { vaults } = await makeVaults(masterKey, 0);

    await expect(
      buildPasswordRotationBundle('WRONG-PASS', 'new-pass-456', profile, vaults),
    ).rejects.toThrow(/Current password is incorrect/);
  });

  it('vault_note_encrypted is re-encrypted when non-empty', async () => {
    const { profile, masterKey } = await makeProfile('old-pass-111');
    const titleKey = await deriveTitleKey(masterKey);
    const noteText = 'My vault note';
    const noteCt = await aesEncrypt(titleKey, new TextEncoder().encode(noteText));

    const vaults: VaultEntryForRotation[] = [
      {
        id: 'vault-with-note',
        title_encrypted: toBase64(await aesEncrypt(titleKey, new TextEncoder().encode('Title'))),
        vault_note_encrypted: toBase64(noteCt),
      },
    ];

    const bundle = await buildPasswordRotationBundle('old-pass-111', 'new-pass-222', profile, vaults);

    expect(bundle.updatedVaults[0].vault_note_encrypted).not.toBeNull();
    const newTitleKey = await deriveTitleKey(bundle.newMasterKey);
    const recoveredNote = new TextDecoder().decode(
      await aesDecrypt(newTitleKey, fromBase64(bundle.updatedVaults[0].vault_note_encrypted!)),
    );
    expect(recoveredNote).toBe(noteText);
  });

  it('null vault_note_encrypted passes through as null', async () => {
    const { profile, masterKey } = await makeProfile('old-pass-111');
    const { vaults } = await makeVaults(masterKey, 1);
    // vaults from makeVaults have vault_note_encrypted: null

    const bundle = await buildPasswordRotationBundle('old-pass-111', 'new-pass-222', profile, vaults);

    expect(bundle.updatedVaults[0].vault_note_encrypted).toBeNull();
  });
});
