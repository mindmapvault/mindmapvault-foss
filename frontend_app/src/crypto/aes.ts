import { toBuf } from './utils';

const GCM_NONCE_LENGTH = 12; // bytes

export async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', toBuf(keyBytes), { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Encrypts plaintext with AES-256-GCM.
 * Returns a single Uint8Array: nonce (12 bytes) ‖ ciphertext+tag.
 */
export async function aesEncrypt(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(GCM_NONCE_LENGTH));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    key,
    toBuf(plaintext),
  );
  const result = new Uint8Array(GCM_NONCE_LENGTH + ct.byteLength);
  result.set(nonce, 0);
  result.set(new Uint8Array(ct), GCM_NONCE_LENGTH);
  return result;
}

/**
 * Decrypts AES-256-GCM ciphertext.
 * Expects nonce (12 bytes) ‖ ciphertext+tag.
 */
export async function aesDecrypt(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const nonce = toBuf(data.subarray(0, GCM_NONCE_LENGTH));
  const ct = toBuf(data.subarray(GCM_NONCE_LENGTH));
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    key,
    ct,
  );
  return new Uint8Array(pt);
}
