#!/usr/bin/env node
/**
 * Creates a large (~10 MB) vault with REAL crypto, openable in the CryptMind UI.
 *
 * Run from the frontend/ directory:
 *   node gen_perf_vault.mjs [username] [password] [title]
 *
 * Defaults:
 *   username = kornelko@msn.com
 *   password = mindmapvault
 *   title    = Perf Test — Large Vault
 */

import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { ml_kem768 } from '@noble/post-quantum/ml-kem';
import { argon2id } from 'hash-wasm';

const BASE_URL = 'http://localhost:8090/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toB64(bytes) { return Buffer.from(bytes).toString('base64'); }
function fromB64(s)   { return new Uint8Array(Buffer.from(s, 'base64')); }
function toHex(bytes) { return Buffer.from(bytes).toString('hex'); }

function concat(...arrs) {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

async function importAesKey(bytes) {
  return globalThis.crypto.subtle.importKey(
    'raw', bytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

async function aesEncrypt(key, plaintext) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return concat(iv, new Uint8Array(ct));
}

// ── Crypto matching the frontend exactly ──────────────────────────────────────

async function hybridEncap(classicalPub, pqPub) {
  const ephPrivate   = x25519.utils.randomPrivateKey();
  const ephPublic    = x25519.getPublicKey(ephPrivate);
  const classShared  = x25519.getSharedSecret(ephPrivate, classicalPub);
  const { cipherText: pqCt, sharedSecret: pqShared } = ml_kem768.encapsulate(pqPub);
  const combinedKey  = hkdf(sha256, concat(classShared, pqShared), undefined, 'crypt-mind-dek-v1', 32);
  const ckKey        = await importAesKey(combinedKey);
  const dek          = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const wrappedDek   = await aesEncrypt(ckKey, dek);
  return { ephClassicalPublic: ephPublic, ephPqCiphertext: pqCt, wrappedDek, dek };
}

async function encryptTitle(title, masterKey) {
  const keyBytes = hkdf(sha256, masterKey, undefined, 'crypt-mind-title-v1', 32);
  const key = await importAesKey(keyBytes);
  const ct  = await aesEncrypt(key, new TextEncoder().encode(title));
  return toB64(ct);
}

async function encryptTree(tree, dek) {
  const key = await importAesKey(dek);
  return aesEncrypt(key, new TextEncoder().encode(JSON.stringify(tree)));
}

// ── Large tree generator ──────────────────────────────────────────────────────

function generateLargeTree(targetMB, maxNodes = Infinity) {
  const target = targetMB * 1024 * 1024;
  const pad    = 'x'.repeat(300); // padding per node
  const root   = { id: 'root', text: `Perf Test Root — ${new Date().toISOString()}`, children: [], collapsed: false };
  let id = 0;
  // Add nodes until JSON is ~targetMB or maxNodes reached
  while (id < maxNodes) {
    root.children.push({
      id: `n${id}`,
      text: `Node ${id} — ${pad}`,
      children: [],
      collapsed: false,
    });
    id++;
    if (id % 200 === 0) {
      if (JSON.stringify({ version: 'tree', root }).length >= target) break;
    }
  }
  return { version: 'tree', root };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const username  = process.argv[2] ?? 'kornelko@msn.com';
  const password  = process.argv[3] ?? 'mindmapvault';
  const TARGET_MB = parseFloat(process.argv[4] ?? '1');
  const MAX_NODES = parseInt(process.argv[5] ?? 'Infinity', 10);
  const title     = process.argv[6] ?? (isFinite(MAX_NODES) ? `Perf Test — ${MAX_NODES} nodes` : `Perf Test — ${TARGET_MB} MB Vault`);

  // 1. Salt
  process.stdout.write(`[1/5] Fetching salt for '${username}'... `);
  const saltRes = await fetch(`${BASE_URL}/auth/salt?username=${encodeURIComponent(username)}`);
  if (!saltRes.ok) { console.error('FAILED:', await saltRes.text()); process.exit(1); }
  const { argon2_salt, argon2_params } = await saltRes.json();
  console.log('ok');

  // 2. Derive master key + auth_token
  process.stdout.write(`[2/5] Argon2id (m=${argon2_params.m_cost}, t=${argon2_params.t_cost}, p=${argon2_params.p_cost})... `);
  const masterKeyBuf = await argon2id({
    password,
    salt:         fromB64(argon2_salt),
    parallelism:  argon2_params.p_cost,
    iterations:   argon2_params.t_cost,
    memorySize:   argon2_params.m_cost,
    hashLength:   32,
    outputType:   'binary',
  });
  const masterKey = new Uint8Array(masterKeyBuf);
  const authToken = toHex(hkdf(sha256, masterKey, undefined, 'crypt-mind-auth-v1', 32));
  console.log('ok');

  // 3. Login
  process.stdout.write('[3/5] Logging in... ');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, auth_token: authToken }),
  });
  if (!loginRes.ok) { console.error('FAILED:', await loginRes.text()); process.exit(1); }
  const login = await loginRes.json();
  console.log('ok');

  const classicalPub = fromB64(login.classical_public_key);
  const pqPub        = fromB64(login.pq_public_key);
  const bearer       = `Bearer ${login.access_token}`;

  // 4. Build + encrypt tree
  process.stdout.write(`[4/5] Building ${TARGET_MB} MB tree... `);
  const tree = generateLargeTree(TARGET_MB, MAX_NODES);
  const rawSize = JSON.stringify(tree).length;
  process.stdout.write(`${(rawSize / 1024 / 1024).toFixed(1)} MB JSON, encrypting... `);

  const { ephClassicalPublic, ephPqCiphertext, wrappedDek, dek } = await hybridEncap(classicalPub, pqPub);
  const blob         = await encryptTree(tree, dek);
  const titleEnc     = await encryptTitle(title, masterKey);
  console.log(`${(blob.length / 1024 / 1024).toFixed(1)} MB encrypted`);

  // 5. Create vault + upload + confirm
  process.stdout.write('[5/5] Creating vault... ');
  const createRes = await fetch(`${BASE_URL}/mindmaps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: bearer },
    body: JSON.stringify({
      title_encrypted:     titleEnc,
      eph_classical_public: toB64(ephClassicalPublic),
      eph_pq_ciphertext:    toB64(ephPqCiphertext),
      wrapped_dek:          toB64(wrappedDek),
    }),
  });
  if (!createRes.ok) { console.error('FAILED:', await createRes.text()); process.exit(1); }
  const { id: vaultId, upload_url } = await createRes.json();
  process.stdout.write(`${vaultId}, uploading ${(blob.length / 1024 / 1024).toFixed(1)} MB... `);

  const upRes = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    // node-fetch / native fetch accepts Uint8Array
    body: blob,
    duplex: 'half', // required in Node 18+ for streaming bodies
  });
  if (!upRes.ok) { console.error('Upload FAILED:', upRes.status, upRes.statusText); process.exit(1); }
  const versionId = upRes.headers.get('x-amz-version-id') ?? '';
  process.stdout.write('confirming... ');

  const confirmRes = await fetch(`${BASE_URL}/mindmaps/${vaultId}/confirm-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: bearer },
    body: JSON.stringify({ version_id: versionId }),
  });
  if (!confirmRes.ok) { console.error('Confirm FAILED:', await confirmRes.text()); process.exit(1); }
  console.log('done!');

  console.log(`\n✓ Vault "${title}" created!`);
  console.log(`  ID:        ${vaultId}`);
  console.log(`  Blob size: ${(blob.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Nodes:     ${tree.root.children.length}`);
  console.log('\nOpen the CryptMind UI and it should appear in your vault list (fully decryptable).');
}

main().catch(e => { console.error('\n', e); process.exit(1); });
