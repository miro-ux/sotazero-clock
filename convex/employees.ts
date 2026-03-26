import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByPin = query({
  args: { pin: v.string() },
  handler: async (ctx, { pin }) => {
    return await ctx.db
      .query("employees")
      .withIndex("by_pin", (q) => q.eq("pin", pin))
      .unique();
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("employees").order("asc").collect();
  },
});

export const addEmployee = mutation({
  args: {
    name: v.string(),
    pin: v.string(),
    isAdmin: v.optional(v.boolean()),
  },
  handler: async (ctx, { name, pin, isAdmin }) => {
    // Check if PIN already in use
    const existing = await ctx.db
      .query("employees")
      .withIndex("by_pin", (q) => q.eq("pin", pin))
      .unique();
    if (existing) {
      throw new Error("PIN already in use");
    }
    return await ctx.db.insert("employees", {
      name,
      pin,
      isAdmin: isAdmin ?? false,
      createdAt: Date.now(),
    });
  },
});

export const removeEmployee = mutation({
  args: { id: v.id("employees") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
