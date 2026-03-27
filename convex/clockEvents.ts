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

/** Returns all clock events for a given employee, newest first */
export const getEventsForEmployee = query({
  args: { employeeId: v.id("employees") },
  handler: async (ctx, { employeeId }) => {
    return await ctx.db
      .query("clockEvents")
      .filter((q) => q.eq(q.field("employeeId"), employeeId))
      .order("desc")
      .collect();
  },
});

/** Returns employees who worked today but are currently clocked out.
 *  A "shift day" runs from 6am today to 3am tomorrow.
 *  Accepts today + yesterday date strings to cover early morning events. */
export const getClockedOutToday = query({
  args: { todayDate: v.string(), yesterdayDate: v.string(), shiftStartTs: v.number() },
  handler: async (ctx, { todayDate, yesterdayDate, shiftStartTs }) => {
    // Fetch events from both calendar dates
    const todayEvents = await ctx.db
      .query("clockEvents")
      .withIndex("by_date", (q) => q.eq("date", todayDate))
      .order("asc")
      .collect();
    const yesterdayEvents = await ctx.db
      .query("clockEvents")
      .withIndex("by_date", (q) => q.eq("date", yesterdayDate))
      .order("asc")
      .collect();

    // Merge and filter to shift window (>= shiftStartTs)
    const allEvents = [...yesterdayEvents, ...todayEvents]
      .filter((e) => e.timestamp >= shiftStartTs)
      .sort((a, b) => a.timestamp - b.timestamp);

    // Group by employee
    const byEmployee = new Map<string, { employeeName: string; events: Array<{ type: "in" | "out"; timestamp: number }> }>();
    for (const e of allEvents) {
      const existing = byEmployee.get(e.employeeId);
      if (existing) {
        existing.events.push({ type: e.type, timestamp: e.timestamp });
      } else {
        byEmployee.set(e.employeeId, { employeeName: e.employeeName, events: [{ type: e.type, timestamp: e.timestamp }] });
      }
    }

    // Filter: last event is "out" AND has actual work time
    const result: Array<{
      employeeId: string;
      employeeName: string;
      workedMs: number;
      lastOutTs: number;
      shiftEvents: Array<{ type: "in" | "out"; timestamp: number }>;
    }> = [];
    for (const [employeeId, { employeeName, events }] of byEmployee) {
      const last = events[events.length - 1];
      if (last.type === "out") {
        let workedMs = 0;
        for (let i = 0; i < events.length; i++) {
          if (events[i].type === "in" && events[i + 1]?.type === "out") {
            workedMs += events[i + 1].timestamp - events[i].timestamp;
          }
        }
        if (workedMs > 0) {
          result.push({ employeeId, employeeName, workedMs, lastOutTs: last.timestamp, shiftEvents: events });
        }
      }
    }
    return result.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  },
});

/** Returns all employees currently clocked in (last event = "in") with today's shift events */
export const getCurrentlyIn = query({
  args: {},
  handler: async (ctx) => {
    const employees = await ctx.db.query("employees").collect();
    const result: Array<{
      employeeId: string;
      employeeName: string;
      since: number;
      shiftEvents: Array<{ type: "in" | "out"; timestamp: number }>;
    }> = [];

    // Compute "shift day" date strings: today and yesterday (for shifts starting before midnight)
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const yesterday = new Date(now.getTime() - 86400000);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    // Shift window: 6am today (local approx via UTC) — we send raw events, client computes with local time
    for (const emp of employees) {
      const last = await ctx.db
        .query("clockEvents")
        .filter((q) => q.eq(q.field("employeeId"), emp._id))
        .order("desc")
        .first();
      if (last && last.type === "in") {
        // Get today's + yesterday's events for this employee (to cover overnight shifts)
        const todayEvents = await ctx.db
          .query("clockEvents")
          .withIndex("by_date", (q) => q.eq("date", todayStr))
          .filter((q) => q.eq(q.field("employeeId"), emp._id))
          .order("asc")
          .collect();
        const yesterdayEvents = await ctx.db
          .query("clockEvents")
          .withIndex("by_date", (q) => q.eq("date", yesterdayStr))
          .filter((q) => q.eq(q.field("employeeId"), emp._id))
          .order("asc")
          .collect();

        const allEvents = [...yesterdayEvents, ...todayEvents].sort(
          (a, b) => a.timestamp - b.timestamp
        );

        // Trim to shift events: find the first "in" that starts this shift
        // (walk backwards from the end to find the shift start)
        const shiftEvents: Array<{ type: "in" | "out"; timestamp: number }> = [];
        let shiftStartFound = false;
        for (let i = allEvents.length - 1; i >= 0; i--) {
          shiftEvents.unshift({ type: allEvents[i].type, timestamp: allEvents[i].timestamp });
          if (allEvents[i].type === "in" && i > 0 && allEvents[i - 1]?.type !== "out") {
            // This "in" has no preceding "out" — it's the shift start
            shiftStartFound = true;
            break;
          }
          if (i === 0) {
            shiftStartFound = true;
          }
        }

        result.push({
          employeeId: emp._id,
          employeeName: emp.name,
          since: last.timestamp,
          shiftEvents: shiftStartFound ? shiftEvents : [{ type: "in", timestamp: last.timestamp }],
        });
      }
    }
    return result.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  },
});
