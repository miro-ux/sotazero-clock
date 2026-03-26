import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const clockInOut = mutation({
  args: {
    employeeId: v.id("employees"),
    employeeName: v.string(),
    type: v.union(v.literal("in"), v.literal("out")),
  },
  handler: async (ctx, { employeeId, employeeName, type }) => {
    const now = Date.now();
    const date = new Date(now).toISOString().split("T")[0]; // YYYY-MM-DD
    return await ctx.db.insert("clockEvents", {
      employeeId,
      employeeName,
      type,
      timestamp: now,
      date,
    });
  },
});

export const getTodayEvents = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    return await ctx.db
      .query("clockEvents")
      .withIndex("by_date", (q) => q.eq("date", date))
      .order("desc")
      .collect();
  },
});

export const getRecentEvents = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("clockEvents")
      .order("desc")
      .take(100);
  },
});

/** Returns the most recent clock event for a given employee */
export const getLastEventForEmployee = query({
  args: { employeeId: v.id("employees") },
  handler: async (ctx, { employeeId }) => {
    return await ctx.db
      .query("clockEvents")
      .filter((q) => q.eq(q.field("employeeId"), employeeId))
      .order("desc")
      .first();
  },
});

/** Returns all employees currently clocked in (last event = "in") */
export const getCurrentlyIn = query({
  args: {},
  handler: async (ctx) => {
    // Get all employees
    const employees = await ctx.db.query("employees").collect();
    const result: Array<{ employeeId: string; employeeName: string; since: number }> = [];

    for (const emp of employees) {
      const last = await ctx.db
        .query("clockEvents")
        .filter((q) => q.eq(q.field("employeeId"), emp._id))
        .order("desc")
        .first();
      if (last && last.type === "in") {
        result.push({ employeeId: emp._id, employeeName: emp.name, since: last.timestamp });
      }
    }
    return result.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  },
});
