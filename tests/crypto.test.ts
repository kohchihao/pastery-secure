import { describe, expect, it } from "vitest";
import { decryptText, encryptText, exportKey, generateKey, importKey } from "../lib/crypto";
import { base64UrlDecode, base64UrlEncode } from "../lib/encoding";

describe("crypto", () => {
  it("round-trips plaintext", async () => {
    const { ciphertext, iv, key, version } = await encryptText("hello world");
    expect(version).toBe(1);
    expect(await decryptText(ciphertext, iv, key)).toBe("hello world");
  });

  it("round-trips unicode and empty strings", async () => {
    for (const text of ["", "héllo wörld", "日本語テキスト", "🔐🥐✨", "line1\nline2\t\0end"]) {
      const { ciphertext, iv, key } = await encryptText(text);
      expect(await decryptText(ciphertext, iv, key)).toBe(text);
    }
  });

  it("exports a 43-char base64url key that re-imports", async () => {
    const key = await generateKey();
    const exported = await exportKey(key);
    expect(exported).toHaveLength(43);
    expect(exported).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(importKey(exported)).resolves.toBeDefined();

    const { key: payloadKey } = await encryptText("x");
    expect(payloadKey).toHaveLength(43);
  });

  it("uses a unique 12-byte IV per encryption", async () => {
    const ivs = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const { iv } = await encryptText("same");
      expect(iv).toHaveLength(12);
      ivs.add(base64UrlEncode(iv));
    }
    expect(ivs.size).toBe(50);
  });

  it("fails to decrypt with the wrong key", async () => {
    const { ciphertext, iv } = await encryptText("secret");
    const wrongKey = await exportKey(await generateKey());
    await expect(decryptText(ciphertext, iv, wrongKey)).rejects.toThrow();
  });

  it("rejects malformed keys", async () => {
    const { ciphertext, iv } = await encryptText("secret");
    await expect(decryptText(ciphertext, iv, "short")).rejects.toThrow();
    await expect(decryptText(ciphertext, iv, "!".repeat(43))).rejects.toThrow();
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const { ciphertext, iv, key } = await encryptText("secret message");
    const tampered = new Uint8Array(ciphertext);
    tampered[0] ^= 0x01;
    await expect(decryptText(tampered, iv, key)).rejects.toThrow();
  });

  it("fails to decrypt with a tampered IV", async () => {
    const { ciphertext, iv, key } = await encryptText("secret message");
    const tampered = new Uint8Array(iv);
    tampered[0] ^= 0x01;
    await expect(decryptText(ciphertext, tampered, key)).rejects.toThrow();
  });
});

describe("encoding", () => {
  it("round-trips arbitrary bytes for all lengths", () => {
    for (let len = 0; len < 70; len++) {
      const bytes = crypto.getRandomValues(new Uint8Array(len));
      const encoded = base64UrlEncode(bytes);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(base64UrlDecode(encoded)).toEqual(bytes);
    }
  });

  it("uses url-safe alphabet without padding", () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf]);
    expect(base64UrlEncode(bytes)).toBe("-_-_");
    expect(base64UrlEncode(new Uint8Array([0xff]))).toBe("_w");
  });

  it("rejects invalid characters", () => {
    expect(() => base64UrlDecode("abc=")).toThrow();
    expect(() => base64UrlDecode("a+b/")).toThrow();
  });
});
