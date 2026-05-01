import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
// @noble/post-quantum >= 0.2 — pure-JS ML-KEM-768 (no WASM)
import { ml_kem768 } from '@noble/post-quantum/ml-kem';
import { aesDecrypt, aesEncrypt, importAesKey } from './aes';
import { concat, randomBytes } from './utils';

export interface UserKeyPairs {
  classical: { publicKey: Uint8Array; privateKey: Uint8Array };
  pq: { publicKey: Uint8Array; secretKey: Uint8Array };
}

export interface HybridEncapResult {
  ephClassicalPublic: Uint8Array;
  ephPqCiphertext: Uint8Array;
  wrappedDek: Uint8Array;
  dek: Uint8Array;
}

/** Generates fresh X25519 + ML-KEM-768 keypairs for a new user. */
export function generateUserKeyPairs(): UserKeyPairs {
  const classical_priv = x25519.utils.randomPrivateKey();
  const classical_pub = x25519.getPublicKey(classical_priv);
  const pqKeys = ml_kem768.keygen();
  return {
    classical: { publicKey: classical_pub, privateKey: classical_priv },
    pq: { publicKey: pqKeys.publicKey, secretKey: pqKeys.secretKey },
  };
}

/**
 * Hybrid encapsulate — called when encrypting a mind-map blob.
 *
 * 1. Generate ephemeral X25519 keypair.
 * 2. ECDH(eph_private, recipient_classical_pub) → classical_shared.
 * 3. ML-KEM-768 encapsulate(recipient_pq_pub) → (eph_pq_ct, pq_shared).
 * 4. combined_key = HKDF(classical_shared ‖ pq_shared, "crypt-mind-dek-v1").
 * 5. DEK = random 32 bytes.
 * 6. wrapped_dek = AES-GCM-256(combined_key, DEK).
 */
export async function hybridEncap(
  recipientClassicalPub: Uint8Array,
  recipientPqPub: Uint8Array,
): Promise<HybridEncapResult> {
  const ephPrivate = x25519.utils.randomPrivateKey();
  const ephPublic = x25519.getPublicKey(ephPrivate);

  const classicalShared = x25519.getSharedSecret(ephPrivate, recipientClassicalPub);
  const { cipherText: pqCiphertext, sharedSecret: pqShared } =
    ml_kem768.encapsulate(recipientPqPub);

  const combinedKey = deriveCombinedKey(classicalShared, pqShared);
  const ckCrypto = await importAesKey(combinedKey);

  const dek = randomBytes(32);
  const wrappedDek = await aesEncrypt(ckCrypto, dek);

  return { ephClassicalPublic: ephPublic, ephPqCiphertext: pqCiphertext, wrappedDek, dek };
}

/**
 * Hybrid decapsulate — called when opening a mind-map blob.
 * Returns the DEK so the caller can decrypt the blob.
 */
export async function hybridDecap(
  userClassicalPriv: Uint8Array,
  userPqPriv: Uint8Array,
  ephClassicalPublic: Uint8Array,
  ephPqCiphertext: Uint8Array,
  wrappedDek: Uint8Array,
): Promise<Uint8Array> {
  const classicalShared = x25519.getSharedSecret(userClassicalPriv, ephClassicalPublic);
  const pqShared = ml_kem768.decapsulate(ephPqCiphertext, userPqPriv);

  const combinedKey = deriveCombinedKey(classicalShared, pqShared);
  const ckCrypto = await importAesKey(combinedKey);

  return aesDecrypt(ckCrypto, wrappedDek);
}

function deriveCombinedKey(classicalShared: Uint8Array, pqShared: Uint8Array): Uint8Array {
  const ikm = concat(classicalShared, pqShared);
  return hkdf(sha256, ikm, undefined, 'crypt-mind-dek-v1', 32);
}
