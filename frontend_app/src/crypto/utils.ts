/**
 * Ensures a Uint8Array is backed by a plain ArrayBuffer (required by WebCrypto
 * and Fetch). TypeScript 5.7 made Uint8Array generic; external libs may return
 * Uint8Array<ArrayBufferLike> which WebCrypto rejects at the type level.
 */
export function toBuf(u: Uint8Array): Uint8Array<ArrayBuffer> {
  if (u.buffer instanceof ArrayBuffer) return u as Uint8Array<ArrayBuffer>;
  return new Uint8Array(u);
}

/** Base64 encode/decode helpers that work in all modern browsers. */
export function toBase64(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str);
}

export function fromBase64(str: string): Uint8Array {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}
