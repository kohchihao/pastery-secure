import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  pastes: defineTable({
    slug: v.string(),
    ciphertext: v.bytes(),
    iv: v.bytes(),
    version: v.number(),
    expiresAt: v.number(),
    // 16-byte key commitment (see lib/linkKey.ts). Absent on rows created
    // before it existed; those keep the burn-on-open behaviour.
    keyCheck: v.optional(v.bytes()),
    cleanupJobId: v.optional(v.id("_scheduled_functions")),
  })
    .index("by_slug", ["slug"])
    .index("by_expiresAt", ["expiresAt"]),
});
