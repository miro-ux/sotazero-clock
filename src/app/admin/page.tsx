"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import PinPad from "@/components/PinPad";
import { useRouter } from "next/navigation";
import {
  Shield,
  UserPlus,
  Users,
  Clock,
  LogIn,
  LogOut,
  Trash2,
  ArrowLeft,
  CheckCircle,
  Timer,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_PIN = "8599";

type Tab = "employees" | "events" | "add";

/** Format a timestamp as HH:MM:SS (24h, zero-padded, always consistent) */
function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Format a timestamp as DD/MM/YYYY */
function fmtDate(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mo}/${yyyy}`;
}

/** Format today's date as "Wednesday, 26 March" */
function fmtToday(): string {
  const d = new Date();
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

/** Compute total time worked from a list of clock events for one employee. */
function calcWorkedMs(
  events: Array<{ type: "in" | "out"; timestamp: number }>
): number {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  let total = 0;
  let lastIn: number | null = null;
  for (const e of sorted) {
    if (e.type === "in") {
      lastIn = e.timestamp;
    } else if (e.type === "out" && lastIn !== null) {
      total += e.timestamp - lastIn;
      lastIn = null;
    }
  }
  if (lastIn !== null) {
    total += Date.now() - lastIn;
  }
  return total;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

/** Compute cumulative work ms, break ms, and timeline segments from shift events */
function computeShift(events: Array<{ type: "in" | "out"; timestamp: number }>) {
  const now = Date.now();
  let workMs = 0;
  let breakMs = 0;
  const segments: Array<{ type: "work" | "break"; start: number; end: number }> = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "in") {
      const end = events[i + 1]?.type === "out" ? events[i + 1].timestamp : now;
      workMs += end - e.timestamp;
      segments.push({ type: "work", start: e.timestamp, end });
    } else if (e.type === "out") {
      const nextIn = events[i + 1]?.type === "in" ? events[i + 1].timestamp : null;
      if (nextIn) {
        breakMs += nextIn - e.timestamp;
        segments.push({ type: "break", start: e.timestamp, end: nextIn });
      }
    }
  }
  return { workMs, breakMs, segments };
}

/** Radial clock showing work/break segments at real clock positions (larger version for admin). */
function ShiftClock({ workMs, segments, size = 80 }: {
  workMs: number;
  segments: Array<{ type: "work" | "break"; start: number; end: number }>;
  size?: number;
}) {
  if (segments.length === 0 || workMs <= 0) return null;
  const R = 32;
  const CX = 40;
  const CY = 40;

  function tsToDeg(ts: number): number {
    const d = new Date(ts);
    const h = d.getHours() % 12;
    const m = d.getMinutes();
    return (h * 30) + (m * 0.5);
  }

  function arcPath(startDeg: number, endDeg: number): string {
    let sweep = endDeg - startDeg;
    if (sweep <= 0) sweep += 360;
    if (sweep > 360) sweep = 360;
    const startRad = (startDeg - 90) * (Math.PI / 180);
    const endRad = (startDeg + sweep - 90) * (Math.PI / 180);
    const x1 = CX + R * Math.cos(startRad);
    const y1 = CY + R * Math.sin(startRad);
    const x2 = CX + R * Math.cos(endRad);
    const y2 = CY + R * Math.sin(endRad);
    const largeArc = sweep > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  const arcs: Array<{ path: string; color: string }> = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type === "work") {
      arcs.push({ path: arcPath(tsToDeg(seg.start), tsToDeg(seg.end)), color: "#34d399" });
    } else if (seg.type === "break") {
      const hasNextWork = segments.slice(i + 1).some(s => s.type === "work");
      if (hasNextWork) {
        arcs.push({ path: arcPath(tsToDeg(seg.start), tsToDeg(seg.end)), color: "#fb923c" });
      }
    }
  }

  return (
    <svg width={size} height={size} viewBox="0 0 80 80" className="shrink-0" role="img" aria-label="Shift clock">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
      {arcs.map((arc) => (
        <path key={arc.path} d={arc.path} fill="none" stroke={arc.color} strokeWidth="7" strokeLinecap="round" style={{ opacity: 0.8 }} />
      ))}
      {Array.from({ length: 12 }).map((_, i) => {
        const deg = i * 30;
        const rad = (deg - 90) * (Math.PI / 180);
        const x1 = CX + (R + 3) * Math.cos(rad);
        const y1 = CY + (R + 3) * Math.sin(rad);
        const x2 = CX + (R - 2) * Math.cos(rad);
        const y2 = CY + (R - 2) * Math.sin(rad);
        return (
          <line key={`t${deg}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.15)" strokeWidth={i % 3 === 0 ? 2 : 0.7} />
        );
      })}
    </svg>
  );
}

/** Group events by employee name and compute worked time + last status */
function buildSummary(
  events: Array<{ employeeId: Id<"employees">; employeeName: string; type: "in" | "out"; timestamp: number }>
) {
  const map = new Map<
    string,
    { employeeId: Id<"employees">; events: typeof events }
  >();

  for (const e of events) {
    const existing = map.get(e.employeeName);
    if (existing) {
      existing.events.push(e);
    } else {
      map.set(e.employeeName, { employeeId: e.employeeId, events: [e] });
    }
  }

  return Array.from(map.entries())
    .map(([name, { employeeId, events: evts }]) => {
      const sorted = [...evts].sort((a, b) => a.timestamp - b.timestamp);
      const lastType = sorted[sorted.length - 1]?.type ?? null;
      const workedMs = calcWorkedMs(evts);
      return { name, employeeId, lastType, workedMs, eventCount: evts.length, sortedEvents: sorted };
    })
    .sort((a, b) => {
      // Clocked-in first, then alphabetical
      if (a.lastType === "in" && b.lastType !== "in") return -1;
      if (a.lastType !== "in" && b.lastType === "in") return 1;
      return a.name.localeCompare(b.name);
    });
}

export default function AdminPage() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("auth") === "1") {
      setAuthenticated(true);
    }
    setCheckingAuth(false);
  }, []);

  const [pinError, setPinError] = useState(false);
  const [tab, setTab] = useState<Tab>("events");
  const [, setTick] = useState(0);

  // Refresh durations every 15s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);
  const [selectedEmployee, setSelectedEmployee] = useState<{
    id: Id<"employees">;
    name: string;
  } | null>(null);

  const [pendingDelete, setPendingDelete] = useState<{
    id: Id<"employees">;
    name: string;
  } | null>(null);

  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState(false);

  const employees = useQuery(api.employees.listAll, authenticated ? {} : "skip");
  const todayEvents = useQuery(
    api.clockEvents.getTodayEvents,
    authenticated ? { date: new Date().toISOString().split("T")[0] } : "skip"
  );
  const adminEmployee = useQuery(
    api.employees.getByPin,
    authenticated ? { pin: ADMIN_PIN } : "skip"
  );
  const adminLastEvent = useQuery(
    api.clockEvents.getLastEventForEmployee,
    adminEmployee ? { employeeId: adminEmployee._id } : "skip"
  );
  const selectedEvents = useQuery(
    api.clockEvents.getEventsForEmployee,
    selectedEmployee ? { employeeId: selectedEmployee.id } : "skip"
  );

  const addEmployee = useMutation(api.employees.addEmployee);
  const removeEmployee = useMutation(api.employees.removeEmployee);
  const clockInOut = useMutation(api.clockEvents.clockInOut);

  const adminIsIn = adminLastEvent?.type === "in";
  const [clockLoading, setClockLoading] = useState(false);

  const handleAdminClock = async () => {
    if (!adminEmployee || clockLoading) return;
    const action = adminIsIn ? "out" : "in";
    setClockLoading(true);
    try {
      await clockInOut({
        employeeId: adminEmployee._id,
        employeeName: adminEmployee.name,
        type: action,
      });
    } finally {
      setClockLoading(false);
    }
  };

  const handleAdminPin = (pin: string) => {
    if (pin === ADMIN_PIN) {
      setAuthenticated(true);
    } else {
      setPinError(true);
      setTimeout(() => setPinError(false), 600);
    }
  };

  const handleAddEmployee = async () => {
    setAddError("");
    if (!newName.trim()) { setAddError("Name is required"); return; }
    if (!/^\d{4}$/.test(newPin)) { setAddError("PIN must be exactly 4 digits"); return; }
    try {
      await addEmployee({ name: newName.trim(), pin: newPin });
      setNewName("");
      setNewPin("");
      setAddSuccess(true);
      setTimeout(() => setAddSuccess(false), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("PIN already in use")) {
        setAddError("This PIN is already taken. Choose a different one.");
      } else {
        setAddError("Failed to add employee. Please try again.");
      }
    }
  };

  // ── Loading while checking auth ──
  if (checkingAuth) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#0a0a0f]" />
    );
  }

  // ── PIN gate ──
  if (!authenticated) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-8 px-6 bg-[#0a0a0f]">
        <div className="flex items-center gap-3">
          <Shield size={32} className="text-blue-400" strokeWidth={1.5} />
          <span className="text-blue-300 text-xl font-light">Admin Access</span>
        </div>
        <PinPad
          onComplete={handleAdminPin}
          onBack={() => router.push("/")}
          error={pinError}
          accentColor="blue"
        />
      </div>
    );
  }

  // ── Employee Detail View ──
  if (selectedEmployee) {
    // Group events by date
    const eventsByDate = new Map<string, Array<{ type: "in" | "out"; timestamp: number }>>();
    if (selectedEvents) {
      for (const e of selectedEvents) {
        const dateKey = fmtDate(e.timestamp);
        const existing = eventsByDate.get(dateKey);
        if (existing) {
          existing.push(e);
        } else {
          eventsByDate.set(dateKey, [e]);
        }
      }
    }

    return (
      <div className="min-h-screen w-full bg-[#0a0a0f] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <button
            type="button"
            onClick={() => setSelectedEmployee(null)}
            className="p-3 rounded-xl hover:bg-white/8 transition-colors text-white/40 hover:text-white/70"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-lg font-light shrink-0">
            {selectedEmployee.name[0].toUpperCase()}
          </div>
          <span className="text-white/80 text-lg font-bold">{selectedEmployee.name}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-lg mx-auto">
            {!selectedEvents ? (
              <p className="text-white/20 text-center py-12">Loading...</p>
            ) : selectedEvents.length === 0 ? (
              <p className="text-white/20 text-center py-12">No events yet</p>
            ) : (
              <>
                {/* Total worked */}
                <div className="flex items-center gap-3 mb-6 p-5 rounded-2xl bg-white/6 border border-white/8">
                  <Timer size={20} className="text-white/40" />
                  <div>
                    <p className="text-white/40 text-xs uppercase tracking-widest">Total Today</p>
                    <p className="text-white/80 text-xl font-mono">
                      {formatDuration(calcWorkedMs(
                        selectedEvents.filter(e => e.date === new Date().toISOString().split("T")[0])
                      ))}
                    </p>
                  </div>
                </div>

                {/* Events grouped by date */}
                {Array.from(eventsByDate.entries()).map(([dateStr, events]) => {
                  const dayWorked = calcWorkedMs(events);
                  return (
                    <div key={dateStr} className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-white/30 text-xs uppercase tracking-widest">{dateStr}</p>
                        <span className="text-white/30 text-xs font-mono">{formatDuration(dayWorked)}</span>
                      </div>
                      <div className="space-y-2">
                        {[...events].sort((a, b) => b.timestamp - a.timestamp).map((e) => (
                          <div
                            key={e.timestamp}
                            className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/4"
                          >
                            {e.type === "in" ? (
                              <LogIn size={16} className="text-emerald-400 shrink-0" />
                            ) : (
                              <LogOut size={16} className="text-rose-400 shrink-0" />
                            )}
                            <span className={cn(
                              "font-light flex-1",
                              e.type === "in" ? "text-emerald-400/70" : "text-rose-400/70"
                            )}>
                              Clock {e.type === "in" ? "In" : "Out"}
                            </span>
                            <span className="text-white/30 text-sm font-mono">
                              {fmtTime(e.timestamp)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const summary = todayEvents ? buildSummary(todayEvents) : null;

  // ── Admin Panel ──
  return (
    <div className="min-h-screen w-full bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="p-3 rounded-xl hover:bg-white/8 transition-colors text-white/40 hover:text-white/70"
        >
          <ArrowLeft size={22} />
        </button>
        <Shield size={22} className="text-blue-400" />
        <span className="text-white/80 text-lg font-light">Admin Panel</span>
        {adminEmployee && (
          <button
            type="button"
            onClick={handleAdminClock}
            disabled={clockLoading}
            className={cn(
              "ml-auto flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all active:scale-95",
              adminIsIn
                ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30"
                : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
            )}
          >
            {adminIsIn ? <LogOut size={18} /> : <LogIn size={18} />}
            {adminIsIn ? "Clock Out" : "Clock In"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <TabBtn active={tab === "events"} onClick={() => setTab("events")}>
          <Clock size={26} />
          Today
        </TabBtn>
        <TabBtn active={tab === "employees"} onClick={() => setTab("employees")}>
          <Users size={26} />
          Staff
        </TabBtn>
        <TabBtn active={tab === "add"} onClick={() => setTab("add")}>
          <UserPlus size={26} />
          Add
        </TabBtn>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8">

        {/* ── Today's Events ── */}
        {tab === "events" && (
          <div className="space-y-3 max-w-lg mx-auto">
            <p className="text-white/30 text-xs uppercase tracking-widest mb-5">
              {fmtToday()}
            </p>

            {!todayEvents || !summary ? (
              <p className="text-white/20 text-center py-12">Loading...</p>
            ) : todayEvents.length === 0 ? (
              <p className="text-white/20 text-center py-12">No events today</p>
            ) : (
              <>
                {/* Per-person summary cards */}
                <div className="space-y-3 mb-8">
                  {summary.map(({ name, employeeId, lastType, workedMs, eventCount, sortedEvents }) => {
                    const shift = computeShift(sortedEvents);
                    return (
                    <button
                      type="button"
                      key={name}
                      className="w-full flex items-center gap-4 p-5 rounded-2xl bg-white/6 border border-white/8 cursor-pointer hover:bg-white/8 transition-colors text-left"
                      onClick={() => setSelectedEmployee({ id: employeeId, name })}
                    >
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xl font-light shrink-0">
                        {name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white/90 text-lg font-bold">{name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Timer size={13} className="text-white/30 shrink-0" />
                          <span className="text-emerald-400/70 text-sm font-mono">{formatDuration(workedMs)}</span>
                          {shift.breakMs > 0 && (
                            <span className="text-orange-400/70 text-sm font-mono">{formatDuration(shift.breakMs)}</span>
                          )}
                          <span className="text-white/20 text-xs ml-1">({eventCount})</span>
                        </div>
                      </div>
                      <ShiftClock workMs={shift.workMs} segments={shift.segments} />
                      <span
                        className={cn(
                          "text-xs uppercase tracking-widest px-3 py-1.5 rounded-full font-medium shrink-0",
                          lastType === "in"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-rose-500/20 text-rose-400"
                        )}
                      >
                        {lastType === "in" ? "In" : "Out"}
                      </span>
                    </button>
                    );
                  })}
                </div>

                {/* Raw event log */}
                <p className="text-white/20 text-xs uppercase tracking-widest mb-3">Event Log</p>
                <div className="space-y-2">
                  {todayEvents.map((e) => (
                    <div
                      key={e._id}
                      className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/4"
                    >
                      {e.type === "in" ? (
                        <LogIn size={16} className="text-emerald-400 shrink-0" />
                      ) : (
                        <LogOut size={16} className="text-rose-400 shrink-0" />
                      )}
                      <span className="text-white/70 font-light flex-1">{e.employeeName}</span>
                      <span className="text-white/30 text-sm font-mono">
                        {fmtTime(e.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Employee List ── */}
        {tab === "employees" && (
          <div className="space-y-3 max-w-lg mx-auto">
            {!employees ? (
              <p className="text-white/20 text-center py-12">Loading...</p>
            ) : employees.length === 0 ? (
              <p className="text-white/20 text-center py-12">No employees yet</p>
            ) : (
              employees.map((emp) => (
                <div key={emp._id} className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex-1 flex items-center gap-4 p-5 rounded-2xl bg-white/6 border border-white/8 cursor-pointer hover:bg-white/8 transition-colors text-left"
                    onClick={() => setSelectedEmployee({ id: emp._id, name: emp.name })}
                  >
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xl font-light shrink-0">
                      {emp.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-white/90 text-lg font-bold">{emp.name}</p>
                      {emp.isAdmin && (
                        <span className="text-blue-400/70 text-xs flex items-center gap-1 mt-0.5">
                          <Shield size={10} /> Admin
                        </span>
                      )}
                    </div>
                    <ChevronRight size={18} className="text-white/20 shrink-0" />
                  </button>
                  {!emp.isAdmin && (
                    <button
                      type="button"
                      onClick={() => setPendingDelete({ id: emp._id, name: emp.name })}
                      className="p-3 rounded-xl hover:bg-red-900/40 text-white/20 hover:text-red-400 transition-colors shrink-0"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Add Employee ── */}
        {tab === "add" && (
          <div className="max-w-md mx-auto space-y-6 pt-2">
            <p className="text-white/30 text-xs uppercase tracking-widest">New Employee</p>

            <div className="space-y-3">
              <label htmlFor="emp-name" className="block text-white/60 text-lg">Full Name</label>
              <input
                id="emp-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Maria"
                className="w-full bg-white/8 border border-white/12 rounded-2xl px-6 py-5 text-white text-2xl placeholder:text-white/20 focus:outline-none focus:border-blue-500/60"
              />
            </div>

            <div className="space-y-3">
              <label htmlFor="emp-pin" className="block text-white/60 text-lg">4-Digit PIN</label>
              <input
                id="emp-pin"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234"
                className="w-full bg-white/8 border border-white/12 rounded-2xl px-6 py-5 text-white text-3xl placeholder:text-white/15 focus:outline-none focus:border-blue-500/60 tracking-[0.5em]"
              />
            </div>

            {addError && <p className="text-red-400 text-lg">{addError}</p>}

            {addSuccess && (
              <div className="flex items-center gap-3 text-emerald-400 text-lg fade-in">
                <CheckCircle size={22} />
                Employee added successfully!
              </div>
            )}

            <button
              type="button"
              onClick={handleAddEmployee}
              className="w-full py-6 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-light text-2xl transition-colors flex items-center justify-center gap-3"
            >
              <UserPlus size={26} />
              Add Employee
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {pendingDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
          <div className="bg-[#141419] border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center space-y-6">
            <Trash2 size={40} className="text-red-400 mx-auto" />
            <div>
              <p className="text-white/90 text-2xl font-light">{pendingDelete.name}</p>
              <p className="text-red-400 text-lg uppercase tracking-widest font-bold mt-3">
                DELETE THIS EMPLOYEE?
              </p>
              <p className="text-white/30 text-sm mt-2">THIS ACTION CANNOT BE UNDONE</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="flex-1 py-5 rounded-2xl bg-white/8 hover:bg-white/12 text-white/60 text-lg font-light transition-colors"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={() => {
                  removeEmployee({ id: pendingDelete.id });
                  setPendingDelete(null);
                }}
                className="flex-1 py-5 rounded-2xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-lg font-bold uppercase tracking-wider transition-colors"
              >
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-3 py-8 text-xl font-light transition-colors border-b-4",
        active
          ? "text-white border-blue-500"
          : "text-white/30 border-transparent hover:text-white/60"
      )}
    >
      {children}
    </button>
  );
}
