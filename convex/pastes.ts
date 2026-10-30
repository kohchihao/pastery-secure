import { ConvexError, v } from "convex/values";
import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components, internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";

const TTL_MS = 24 * 60 * 60 * 1000;
// 4000 chars of UTF-8 (up to 4 bytes each) + AES-GCM tag (16) + headroom (64).
const MAX_CIPHERTEXT_BYTES = 4000 * 4 + 16 + 64;
const IV_BYTES = 12;
const KEY_CHECK_BYTES = 16;
const SLUG_LENGTH = 10;
const BASE62 =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SWEEP_BATCH = 100;

const rateLimiter = new RateLimiter(components.rateLimiter, {
  createPaste: { kind: "token bucket", rate: 60, period: MINUTE },
  openPaste: { kind: "token bucket", rate: 600, period: MINUTE },
});

// Constant-time so response timing can't be used to guess the check byte by byte.
function bytesEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function randomSlug(): string {
  let slug = "";
  const buf = new Uint8Array(32);
  while (slug.length < SLUG_LENGTH) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      // Rejection sampling: 248 = 62 * 4, avoids modulo bias.
      if (b < 248) slug += BASE62[b % 62];
      if (slug.length === SLUG_LENGTH) break;
    }
  }
  return slug;
}

export const createPaste = mutation({
  args: {
    ciphertext: v.bytes(),
    iv: v.bytes(),
    version: v.number(),
    keyCheck: v.bytes(),
  },
  handler: async (ctx, { ciphertext, iv, version, keyCheck }) => {
    await rateLimiter.limit(ctx, "createPaste", { throws: true });

    if (ciphertext.byteLength === 0) {
      throw new ConvexError("Ciphertext is empty");
    }
    if (ciphertext.byteLength > MAX_CIPHERTEXT_BYTES) {
      throw new ConvexError("Ciphertext too large");
    }
    if (iv.byteLength !== IV_BYTES) {
      throw new ConvexError("Invalid IV length");
    }
    if (keyCheck.byteLength !== KEY_CHECK_BYTES) {
      throw new ConvexError("Invalid key check length");
    }

    let slug = randomSlug();
    while (
      await ctx.db
        .query("pastes")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique()
    ) {
      slug = randomSlug();
    }

    const expiresAt = Date.now() + TTL_MS;
    const id = await ctx.db.insert("pastes", {
      slug,
      ciphertext,
      iv,
      version,
      expiresAt,
      keyCheck,
    });
    const cleanupJobId = await ctx.scheduler.runAt(
      expiresAt,
      internal.pastes.deletePaste,
      { id },
    );
    await ctx.db.patch(id, { cleanupJobId });

    return { slug, expiresAt };
  },
});

export const peekPaste = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const paste = await ctx.db
      .query("pastes")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!paste || paste.expiresAt <= Date.now()) {
      return { exists: false as const };
    }
    return { exists: true as const, expiresAt: paste.expiresAt };
  },
});

export const openPaste = mutation({
  args: { slug: v.string(), keyCheck: v.bytes() },
  handler: async (ctx, { slug, keyCheck }) => {
    await rateLimiter.limit(ctx, "openPaste", { throws: true });

    const paste = await ctx.db
      .query("pastes")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!paste) return { status: "gone" as const };
    if (paste.expiresAt <= Date.now()) {
      await ctx.db.delete(paste._id);
      return { status: "gone" as const };
    }

    // Key commitment: a link whose key doesn't match what the creator committed
    // to can never decrypt this paste, so refuse it and leave the row in place
    // rather than burning it. Rows without a keyCheck predate this and still
    // burn on open.
    if (paste.keyCheck && !bytesEqual(paste.keyCheck, keyCheck)) {
      return { status: "badKey" as const };
    }

    if (paste.cleanupJobId) {
      await ctx.scheduler.cancel(paste.cleanupJobId);
    }
    await ctx.db.delete(paste._id);
    return {
      status: "ok" as const,
      ciphertext: paste.ciphertext,
      iv: paste.iv,
      version: paste.version,
    };
  },
});

export const deletePaste = internalMutation({
  args: { id: v.id("pastes") },
  handler: async (ctx, { id }) => {
    const paste = await ctx.db.get(id);
    if (paste) await ctx.db.delete(id);
  },
});

export const sweepExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("pastes")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", Date.now()))
      .take(SWEEP_BATCH + 1);
    for (const paste of expired.slice(0, SWEEP_BATCH)) {
      await ctx.db.delete(paste._id);
    }
    if (expired.length > SWEEP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.pastes.sweepExpired, {});
    }
  },
});
