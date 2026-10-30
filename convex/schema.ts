import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  pastes: defineTable({
    slug: v.string(),
    ciphertext: v.bytes(),
    iv: v.bytes(),
    version: v.number(),
    expiresAt: v.number(),
    cleanupJobId: v.optional(v.id("_scheduled_functions")),
  })
    .index("by_slug", ["slug"])
    .index("by_expiresAt", ["expiresAt"]),
});
