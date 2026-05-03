import { argon2id } from 'hash-wasm';
import { aesDecrypt, aesEncrypt, importAesKey } from './aes';
import { deriveAttachmentWrapKey, deriveMasterAesKey } from './kdf';
import { fromBase64, randomBytes, toBase64, toBuf, toHex } from './utils';
import type { MindMapTree } from '../types';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type AttachmentEncryptionMeta = {
  format: 'cryptmind-attachment-v1';
  algorithm: 'aes-256-gcm';
  wrapped_key_b64: string;
  key_wrap: 'master-aes-256-gcm' | 'hkdf-attachment-v1';
};

type ShareEncryptionMeta = {
  format: 'cryptmind-share-v1';
  algorithm: 'aes-256-gcm';
  kdf: 'argon2id';
  salt_b64: string;
  memory_kib: number;
  iterations: number;
  parallelism: number;
};

export type EncryptedAttachmentBundle = {
  ciphertext: Uint8Array;
  checksumSha256: string;
  encryptionMeta: AttachmentEncryptionMeta;
};

export type ShareCipherBundle = {
  ciphertext: Uint8Array;
  checksumSha256: string;
  encryptionMeta: ShareEncryptionMeta;
  shareKey: Uint8Array;
};

export type UnlockedShareBundle = {
  payload: {
    title: string;
    tree: MindMapTree;
    exported_at: string;
    source_vault_id: string;
    include_attachments: boolean;
  };
  shareKey: Uint8Array;
};

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toBuf(bytes));
  return toHex(new Uint8Array(digest));
}

export async function encryptAttachmentForOwner(
  plaintext: Uint8Array,
  masterKey: Uint8Array,
): Promise<EncryptedAttachmentBundle> {
  const fileKey = randomBytes(32);
  const fileCryptoKey = await importAesKey(fileKey);
  const ciphertext = await aesEncrypt(fileCryptoKey, plaintext);
  const wrapKey = await deriveAttachmentWrapKey(masterKey);
  const wrappedKey = await aesEncrypt(wrapKey, fileKey);

  return {
    ciphertext,
    checksumSha256: await sha256Hex(ciphertext),
    encryptionMeta: {
      format: 'cryptmind-attachment-v1',
      algorithm: 'aes-256-gcm',
      wrapped_key_b64: toBase64(wrappedKey),
      key_wrap: 'hkdf-attachment-v1',
    },
  };
}

export async function decryptAttachmentForOwner(
  ciphertext: Uint8Array,
  encryptionMeta: Record<string, unknown> | null | undefined,
  masterKey: Uint8Array,
): Promise<Uint8Array> {
  const meta = encryptionMeta as Partial<AttachmentEncryptionMeta> | null | undefined;
  if (!meta?.wrapped_key_b64) {
    throw new Error('Attachment is missing owner-side encryption metadata');
  }

  const wrapKey = meta.key_wrap === 'hkdf-attachment-v1'
    ? await deriveAttachmentWrapKey(masterKey)
    : await deriveMasterAesKey(masterKey);
  const fileKey = await aesDecrypt(wrapKey, fromBase64(meta.wrapped_key_b64));
  const fileCryptoKey = await importAesKey(fileKey);
  return aesDecrypt(fileCryptoKey, ciphertext);
}

async function deriveShareKey(passphrase: string, salt: Uint8Array, params = { memory_kib: 65536, iterations: 3, parallelism: 4 }) {
  const result = await argon2id({
    password: passphrase,
    salt,
    parallelism: params.parallelism,
    iterations: params.iterations,
    memorySize: params.memory_kib,
    hashLength: 32,
    outputType: 'binary',
  });

  return {
    key: result as unknown as Uint8Array,
    params,
  };
}

export async function createEncryptedShareBundle(
  payload: {
    title: string;
    tree: MindMapTree;
    exported_at: string;
    source_vault_id: string;
    include_attachments: boolean;
  },
  passphrase: string,
): Promise<ShareCipherBundle> {
  const salt = randomBytes(32);
  const { key, params } = await deriveShareKey(passphrase, salt);
  const shareCryptoKey = await importAesKey(key);
  const ciphertext = await aesEncrypt(shareCryptoKey, textEncoder.encode(JSON.stringify(payload)));

  return {
    ciphertext,
    checksumSha256: await sha256Hex(ciphertext),
    encryptionMeta: {
      format: 'cryptmind-share-v1',
      algorithm: 'aes-256-gcm',
      kdf: 'argon2id',
      salt_b64: toBase64(salt),
      memory_kib: params.memory_kib,
      iterations: params.iterations,
      parallelism: params.parallelism,
    },
    shareKey: key,
  };
}

export async function encryptBytesForShare(bytes: Uint8Array, shareKey: Uint8Array): Promise<{ ciphertext: Uint8Array; checksumSha256: string }> {
  const shareCryptoKey = await importAesKey(shareKey);
  const ciphertext = await aesEncrypt(shareCryptoKey, bytes);
  return {
    ciphertext,
    checksumSha256: await sha256Hex(ciphertext),
  };
}

export async function decryptShareBundle(ciphertext: Uint8Array, passphrase: string, encryptionMeta: Record<string, unknown>): Promise<{
  title: string;
  tree: MindMapTree;
  exported_at: string;
  source_vault_id: string;
  include_attachments: boolean;
}> {
  const unlocked = await unlockEncryptedShareBundle(ciphertext, passphrase, encryptionMeta);
  return unlocked.payload;
}

export async function unlockEncryptedShareBundle(
  ciphertext: Uint8Array,
  passphrase: string,
  encryptionMeta: Record<string, unknown>,
): Promise<UnlockedShareBundle> {
  const meta = encryptionMeta as Partial<ShareEncryptionMeta>;
  if (!meta.salt_b64) {
    throw new Error('Share metadata is missing the passphrase salt');
  }
  const { key } = await deriveShareKey(passphrase, fromBase64(meta.salt_b64), {
    memory_kib: meta.memory_kib ?? 65536,
    iterations: meta.iterations ?? 3,
    parallelism: meta.parallelism ?? 1,
  });
  const shareCryptoKey = await importAesKey(key);
  const plaintext = await aesDecrypt(shareCryptoKey, ciphertext);
  return {
    payload: JSON.parse(textDecoder.decode(plaintext)) as {
      title: string;
      tree: MindMapTree;
      exported_at: string;
      source_vault_id: string;
      include_attachments: boolean;
    },
    shareKey: key,
  };
}

export async function decryptBytesForShare(
  ciphertext: Uint8Array,
  shareKey: Uint8Array,
): Promise<Uint8Array> {
  const shareCryptoKey = await importAesKey(shareKey);
  return aesDecrypt(shareCryptoKey, ciphertext);
}