import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { argon2id } from 'hash-wasm';
import type { Argon2Params } from '../types';
import { fromBase64, toBuf, toHex } from './utils';

export const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  m_cost: 65_536,
  t_cost: 3,
  p_cost: 4,
};

/**
 * Derives a 32-byte master key from a password using Argon2id.
 * The salt must be a base64-encoded 16-byte value.
 */
export async function deriveMasterKey(
  password: string,
  saltB64: string,
  params: Argon2Params = DEFAULT_ARGON2_PARAMS,
): Promise<Uint8Array> {
  const salt = fromBase64(saltB64);
  // hash-wasm returns a typed-array when outputType is 'binary'
  const result = await argon2id({
    password,
    salt,
    parallelism: params.p_cost,
    iterations: params.t_cost,
    memorySize: params.m_cost,
    hashLength: 32,
    outputType: 'binary',
  });
  return result as unknown as Uint8Array;
}

/**
 * Derives the auth_token sent to the server:
 *   auth_token = HKDF-SHA256(master_key, info="crypt-mind-auth-v1", len=32)
 *
 * The result is hex-encoded so it can be sent as a JSON string.
 * The server stores Argon2id(auth_token) — it never sees the master_key.
 */
export function deriveAuthToken(masterKey: Uint8Array): string {
  const bytes = hkdf(sha256, masterKey, undefined, 'crypt-mind-auth-v1', 32);
  return toHex(bytes);
}

/**
 * Derives the title encryption key:
 *   title_key = HKDF-SHA256(master_key, info="crypt-mind-title-v1", len=32)
 *
 * Titles are encrypted with this key so they can be decrypted in the list
 * view without needing to fetch the full hybrid-KEM envelope.
 */
export async function deriveTitleKey(masterKey: Uint8Array): Promise<CryptoKey> {
  const keyBytes = hkdf(sha256, masterKey, undefined, 'crypt-mind-title-v1', 32);
  return crypto.subtle.importKey('raw', toBuf(keyBytes), { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Returns a CryptoKey wrapping the master key bytes directly.
 * Used only for encrypting/decrypting the user's own private keys at rest.
 */
export async function deriveMasterAesKey(masterKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toBuf(masterKey), { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}
