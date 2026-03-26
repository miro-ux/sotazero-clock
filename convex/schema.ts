import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  employees: defineTable({
    name: v.string(),
    pin: v.string(),
    isAdmin: v.boolean(),
    createdAt: v.number(),
  }).index("by_pin", ["pin"]),

  clockEvents: defineTable({
    employeeId: v.id("employees"),
    employeeName: v.string(),
    type: v.union(v.literal("in"), v.literal("out")),
    timestamp: v.number(),
    date: v.string(), // "YYYY-MM-DD"
  }).index("by_date", ["date"]),
});
