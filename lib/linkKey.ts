import { importKey } from "./crypto";
import { base64UrlDecode } from "./encoding";

const RAW_KEY_BYTES = 32;
export const KEY_CHECK_BYTES = 16;
const KEY_CHECK_LABEL = new TextEncoder().encode("pastery-keycheck-v1");

/**
 * Key commitment stored next to the ciphertext so the server can reject a wrong
 * key without deleting the paste: first 16 bytes of
 * SHA-256("pastery-keycheck-v1" || rawKey).
 *
 * Why this is safe to hand to the server:
 * - The key is 256 bits from a CSPRNG, so the hash can't be brute-forced or
 *   looked up; SHA-256 is preimage-resistant, so the check reveals nothing that
 *   helps recover the key or decrypt the ciphertext.
 * - The domain-separation label means the value isn't reusable as any other
 *   hash of the key.
 * - 128 bits is plenty to tell a damaged key from the real one (an accidental
 *   match is ~2^-128). Producing a matching value takes either the key itself
 *   or the stored check, and the server, which holds the check, could already
 *   delete the row whenever it likes.
 */
export async function computeKeyCheck(
  rawKey: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const input = new Uint8Array(KEY_CHECK_LABEL.length + rawKey.length);
  input.set(KEY_CHECK_LABEL, 0);
  input.set(rawKey, KEY_CHECK_LABEL.length);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return new Uint8Array(digest.slice(0, KEY_CHECK_BYTES));
}

export type ParsedLinkKey = {
  rawKey: Uint8Array<ArrayBuffer>;
  keyCheck: Uint8Array<ArrayBuffer>;
};

/**
 * Validates the key from a link fragment without touching the server: it must
 * be base64url that decodes to exactly 32 bytes and imports as an AES key.
 * Returns null for anything else, so a truncated or mangled link can be
 * reported as damaged before `openPaste` gets a chance to burn the paste.
 */
export async function parseLinkKey(fragment: string): Promise<ParsedLinkKey | null> {
  let rawKey: Uint8Array<ArrayBuffer>;
  try {
    rawKey = base64UrlDecode(fragment);
  } catch {
    return null;
  }
  if (rawKey.length !== RAW_KEY_BYTES) return null;
  try {
    await importKey(fragment);
  } catch {
    return null;
  }
  return { rawKey, keyCheck: await computeKeyCheck(rawKey) };
}
