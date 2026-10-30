import { base64UrlDecode, base64UrlEncode } from "./encoding";

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;

export const CRYPTO_VERSION = 1;

export type EncryptedPayload = {
  ciphertext: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  key: string;
  version: typeof CRYPTO_VERSION;
};

export function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGORITHM, length: KEY_LENGTH }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return base64UrlEncode(new Uint8Array(raw));
}

export function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = base64UrlDecode(keyB64);
  if (raw.length !== KEY_LENGTH / 8) {
    throw new Error("Invalid key length");
  }
  return crypto.subtle.importKey("raw", raw, { name: ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptText(plaintext: string): Promise<EncryptedPayload> {
  const key = await generateKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded);
  return {
    ciphertext: new Uint8Array(ciphertext),
    iv,
    key: await exportKey(key),
    version: CRYPTO_VERSION,
  };
}

export async function decryptText(
  ciphertext: Uint8Array<ArrayBuffer>,
  iv: Uint8Array<ArrayBuffer>,
  keyB64: string,
): Promise<string> {
  const key = await importKey(keyB64);
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext);
  return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
}
