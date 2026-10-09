// Platform-neutral helpers (WebCrypto only) so they run in Deno Edge Functions and in Node tests.

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison. */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function hmacSha512Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

/** Paystack signs the raw request body with the secret key (HMAC SHA-512) in `x-paystack-signature`. */
export async function verifyPaystackSignature(rawBody: string, signature: string | null, secretKey: string): Promise<boolean> {
  if (!signature || !secretKey) return false;
  return timingSafeEqual(await hmacSha512Hex(secretKey, rawBody), signature.toLowerCase());
}

/** Flutterwave sends the secret hash you configured, verbatim, in the `verif-hash` header. */
export function verifyFlutterwaveHash(header: string | null, secretHash: string): boolean {
  if (!header || !secretHash) return false;
  return timingSafeEqual(header, secretHash);
}
