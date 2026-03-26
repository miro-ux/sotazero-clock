import { mutation } from "./_generated/server";

export const seedAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("employees")
      .withIndex("by_pin", (q) => q.eq("pin", "8599"))
      .unique();
    if (existing) return { message: "Admin already exists" };

    await ctx.db.insert("employees", {
      name: "Ivan",
      pin: "8599",
      isAdmin: true,
      createdAt: Date.now(),
    });
    return { message: "Admin seeded" };
  },
});
