import { describe, expect, it } from "vitest";
import { encryptText, exportKey, generateKey } from "../lib/crypto";
import { base64UrlDecode, base64UrlEncode } from "../lib/encoding";
import { computeKeyCheck, KEY_CHECK_BYTES, parseLinkKey } from "../lib/linkKey";

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

describe("parseLinkKey", () => {
  it("accepts a freshly exported key", async () => {
    const { key } = await encryptText("x");
    const parsed = await parseLinkKey(key);
    expect(parsed).not.toBeNull();
    expect(parsed!.rawKey).toEqual(base64UrlDecode(key));
    expect(parsed!.keyCheck).toEqual(await computeKeyCheck(base64UrlDecode(key)));
  });

  it("rejects empty, truncated and over-long keys", async () => {
    const key = await exportKey(await generateKey());
    for (const bad of ["", key.slice(0, 42), key.slice(0, 20), key + "A", key + "AAAA"]) {
      expect(await parseLinkKey(bad)).toBeNull();
    }
  });

  it("rejects keys that aren't base64url", async () => {
    const key = await exportKey(await generateKey());
    expect(await parseLinkKey("!".repeat(43))).toBeNull();
    expect(await parseLinkKey(key.slice(0, 42) + "=")).toBeNull();
    expect(await parseLinkKey(key.replace(/./, "+"))).toBeNull();
    expect(await parseLinkKey(`${key.slice(0, 20)}%20${key.slice(23)}`)).toBeNull();
    // 1 mod 4 length can never be valid base64.
    expect(await parseLinkKey("A")).toBeNull();
  });

  it("accepts any 32 bytes, including a wrong-but-well-formed key", async () => {
    const other = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
    expect(await parseLinkKey(other)).not.toBeNull();
  });
});

describe("computeKeyCheck", () => {
  it("is the first 16 bytes of SHA-256(label || rawKey)", async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const label = new TextEncoder().encode("pastery-keycheck-v1");
    const input = new Uint8Array([...label, ...raw]);
    const expected = (await sha256(input)).slice(0, 16);
    const check = await computeKeyCheck(raw);
    expect(check).toHaveLength(KEY_CHECK_BYTES);
    expect(check).toEqual(expected);
  });

  it("matches a fixed vector for the all-zero key", async () => {
    const check = await computeKeyCheck(new Uint8Array(32));
    expect(Buffer.from(check).toString("hex")).toBe("0ab0db60aca275cb873a6532a1249203");
  });

  it("is deterministic and differs for different keys", async () => {
    const a = crypto.getRandomValues(new Uint8Array(32));
    const b = new Uint8Array(a);
    b[31] ^= 0x01;
    expect(await computeKeyCheck(a)).toEqual(await computeKeyCheck(new Uint8Array(a)));
    expect(await computeKeyCheck(a)).not.toEqual(await computeKeyCheck(b));
  });

  it("is not the plain SHA-256 of the key (domain separated)", async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    expect(await computeKeyCheck(raw)).not.toEqual((await sha256(raw)).slice(0, 16));
  });
});
