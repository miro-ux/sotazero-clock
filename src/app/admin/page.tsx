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

  const arcs: Array<{ path: string; color: string; key: string }> = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type === "work") {
      arcs.push({ path: arcPath(tsToDeg(seg.start), tsToDeg(seg.end)), color: "#34d399", key: `w-${seg.start}` });
    } else if (seg.type === "break") {
      const hasNextWork = segments.slice(i + 1).some(s => s.type === "work");
      if (hasNextWork) {
        arcs.push({ path: arcPath(tsToDeg(seg.start), tsToDeg(seg.end)), color: "#fb923c", key: `b-${seg.start}` });
      }
    }
  }

  return (
    <svg width={size} height={size} viewBox="0 0 80 80" className="shrink-0" role="img" aria-label="Shift clock">
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
      {arcs.map((arc) => (
        <path key={arc.key} d={arc.path} fill="none" stroke={arc.color} strokeWidth="7" strokeLinecap="butt" style={{ opacity: 0.8 }} />
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

  const [selectedSummary, setSelectedSummary] = useState<{
    name: string;
    sortedEvents: Array<{ type: "in" | "out"; timestamp: number }>;
    isCurrentlyIn: boolean;
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
    return (
      <EmployeeDetailView
        employee={selectedEmployee}
        selectedEvents={selectedEvents}
        onBack={() => setSelectedEmployee(null)}
      />
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
                  {summary.map(({ name, lastType, eventCount, sortedEvents }) => {
                    const shift = computeShift(sortedEvents);
                    return (
                    <button
                      type="button"
                      key={name}
                      className="w-full flex items-center gap-4 p-5 rounded-2xl bg-white/6 border border-white/8 cursor-pointer hover:bg-white/8 transition-colors text-left"
                      onClick={() => setSelectedSummary({ name, sortedEvents, isCurrentlyIn: lastType === "in" })}
                    >
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xl font-light shrink-0">
                        {name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white/90 text-lg font-bold">{name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Timer size={13} className="text-white/30 shrink-0" />
                          <span className="text-emerald-400/70 text-sm font-mono">{formatDuration(shift.workMs)}</span>
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

      {/* Person detail modal */}
      {selectedSummary && (
        <AdminPersonModal person={selectedSummary} onClose={() => setSelectedSummary(null)} />
      )}

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

// ── Helpers for calendar ──
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES = ["Su","Mo","Tu","We","Th","Fr","Sa"];

/** ms worked for a day → intensity 0–1 (8h = full) */
function hoursIntensity(ms: number): number {
  return Math.min(ms / (8 * 3600_000), 1);
}

/** YYYY-MM-DD → { y, m, d } */
function parseYMD(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d }; // m is 0-based
}

function EmployeeDetailView({
  employee,
  selectedEvents,
  onBack,
}: {
  employee: { id: string; name: string };
  selectedEvents: Array<{ type: "in" | "out"; timestamp: number; date: string }> | undefined;
  onBack: () => void;
}) {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-based
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // YYYY-MM-DD

  // Build a map of YYYY-MM-DD → workedMs from events
  const dayMap = new Map<string, Array<{ type: "in" | "out"; timestamp: number }>>();
  if (selectedEvents) {
    for (const e of selectedEvents) {
      const key = e.date; // already YYYY-MM-DD from Convex
      const arr = dayMap.get(key) ?? [];
      arr.push(e);
      dayMap.set(key, arr);
    }
  }

  // Calendar grid for calYear/calMonth
  const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  // Total hours this month
  let monthMs = 0;
  for (const [key, evts] of dayMap) {
    const { y, m } = parseYMD(key);
    if (y === calYear && m === calMonth) monthMs += calcWorkedMs(evts);
  }

  // Day detail
  const selectedDayEvents = selectedDay ? (dayMap.get(selectedDay) ?? []).sort((a, b) => a.timestamp - b.timestamp) : null;
  const selectedDayMs = selectedDayEvents ? calcWorkedMs(selectedDayEvents) : 0;

  function dayLabel(iso: string) {
    const { y, m, d } = parseYMD(iso);
    const date = new Date(y, m, d);
    const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][date.getDay()];
    return `${wd} ${d} ${MONTH_NAMES[m]}`;
  }

  return (
    <div className="min-h-screen w-full bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <button type="button" onClick={onBack} className="p-3 rounded-xl hover:bg-white/8 transition-colors text-white/40 hover:text-white/70">
          <ArrowLeft size={22} />
        </button>
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-lg font-light shrink-0">
          {employee.name[0].toUpperCase()}
        </div>
        <span className="text-white/80 text-lg font-bold">{employee.name}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 md:p-8">
        <div className="max-w-md mx-auto space-y-6">
          {!selectedEvents ? (
            <p className="text-white/20 text-center py-12">Loading...</p>
          ) : (
            <>
              {/* Month navigation */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { const d = new Date(calYear, calMonth - 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); setSelectedDay(null); }}
                  className="p-2 rounded-xl hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors"
                >
                  ‹
                </button>
                <div className="text-center">
                  <p className="text-white/80 text-lg font-light">{MONTH_NAMES[calMonth]} {calYear}</p>
                  <p className="text-white/30 text-xs font-mono mt-0.5">{formatDuration(monthMs)} this month</p>
                </div>
                <button
                  type="button"
                  onClick={() => { const d = new Date(calYear, calMonth + 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); setSelectedDay(null); }}
                  disabled={calYear === today.getFullYear() && calMonth === today.getMonth()}
                  className="p-2 rounded-xl hover:bg-white/8 text-white/40 hover:text-white/70 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  ›
                </button>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 gap-1 text-center">
                {DAY_NAMES.map(d => (
                  <div key={d} className="text-white/20 text-xs py-1">{d}</div>
                ))}
                {/* Leading empty cells */}
                {DAY_NAMES.slice(0, firstDay).map((d) => <div key={`pad-${calYear}-${calMonth}-${d}`} />)}
                {/* Day cells */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const iso = `${calYear}-${String(calMonth + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                  const evts = dayMap.get(iso);
                  const ms = evts ? calcWorkedMs(evts) : 0;
                  const intensity = hoursIntensity(ms);
                  const isToday = iso === today.toISOString().split("T")[0];
                  const isSelected = iso === selectedDay;
                  const isFuture = new Date(calYear, calMonth, day) > today;

                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={!evts || isFuture}
                      onClick={() => setSelectedDay(isSelected ? null : iso)}
                      className={cn(
                        "relative aspect-square rounded-lg text-xs font-mono transition-all flex flex-col items-center justify-center gap-0.5",
                        isSelected
                          ? "ring-2 ring-emerald-400 ring-offset-1 ring-offset-[#0a0a0f]"
                          : "",
                        isToday && !isSelected ? "ring-1 ring-white/20" : "",
                        !evts || isFuture ? "cursor-default" : "cursor-pointer hover:ring-1 hover:ring-white/20"
                      )}
                      style={{
                        backgroundColor: ms > 0
                          ? `rgba(52,211,153,${0.1 + intensity * 0.55})`
                          : "rgba(255,255,255,0.03)",
                      }}
                    >
                      <span className={cn("leading-none", ms > 0 ? "text-emerald-200" : isToday ? "text-white/50" : "text-white/20")}>
                        {day}
                      </span>
                      {ms > 0 && (
                        <span className="text-emerald-300/70 leading-none" style={{ fontSize: "9px" }}>
                          {Math.floor(ms / 3600_000)}h{Math.floor((ms % 3600_000) / 60_000) > 0 ? `${Math.floor((ms % 3600_000) / 60_000)}m` : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Day detail panel */}
              {selectedDay && selectedDayEvents && (
                <div className="rounded-2xl border border-white/10 bg-white/4 p-5 fade-in">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-white/60 text-sm font-light">{dayLabel(selectedDay)}</p>
                    <span className="text-emerald-400 text-sm font-mono">{formatDuration(selectedDayMs)}</span>
                  </div>
                  {selectedDayEvents.length === 0 ? (
                    <p className="text-white/20 text-sm">No events</p>
                  ) : (
                    <AdminSessionRows events={selectedDayEvents} />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AdminPersonModal({
  person,
  onClose,
}: {
  person: { name: string; sortedEvents: Array<{ type: "in" | "out"; timestamp: number }>; isCurrentlyIn: boolean };
  onClose: () => void;
}) {
  const shift = computeShift(person.sortedEvents);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center fade-in">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default" onClick={onClose} />
      <div className="relative bg-[#0e0e16] border border-white/10 rounded-3xl p-8 w-full max-w-md mx-4 flex flex-col items-center gap-6 shadow-2xl">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-white/25 hover:text-white/60 transition-colors text-xl leading-none">✕</button>

        {/* Name + status */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-3xl font-light mx-auto mb-3">
            {person.name[0].toUpperCase()}
          </div>
          <p className="text-white text-3xl font-light">{person.name}</p>
          <p className={cn("text-sm mt-1 uppercase tracking-widest", person.isCurrentlyIn ? "text-emerald-400" : "text-white/30")}>
            {person.isCurrentlyIn ? "Currently In" : "Clocked Out"}
          </p>
        </div>

        {/* Large ShiftClock */}
        <div className="flex flex-col items-center gap-3">
          <ShiftClock workMs={shift.workMs} segments={shift.segments} size={160} />
          <div className="flex gap-6 text-sm">
            <span className="text-emerald-400 font-mono flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              Work {formatDuration(shift.workMs)}
            </span>
            {shift.breakMs > 0 && (
              <span className="text-orange-400 font-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                Break {formatDuration(shift.breakMs)}
              </span>
            )}
          </div>
        </div>

        {/* Sessions */}
        {person.sortedEvents.length > 0 && (
          <div className="w-full">
            <p className="text-white/25 text-xs uppercase tracking-widest mb-3">Sessions</p>
            <AdminSessionRows events={person.sortedEvents} />
          </div>
        )}
      </div>
    </div>
  );
}

function AdminSessionRows({ events }: { events: Array<{ type: "in" | "out"; timestamp: number }> }) {
  function hhmm(ts: number) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }
  function ddmmyyyy(ts: number) {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
  }

  type Session = { inTs: number; outTs: number | null; breakAfterMs: number | null };
  const sessions: Session[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type !== "in") continue;
    const outEvent = events[i + 1]?.type === "out" ? events[i + 1] : null;
    const outTs = outEvent?.timestamp ?? null;
    const nextIn = outTs != null ? (events[i + 2]?.type === "in" ? events[i + 2] : null) : null;
    const breakAfterMs = outTs != null && nextIn ? nextIn.timestamp - outTs : null;
    sessions.push({ inTs: e.timestamp, outTs, breakAfterMs });
  }
  if (sessions.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {sessions.map((s, idx) => {
        const durationMs = s.outTs != null ? s.outTs - s.inTs : Date.now() - s.inTs;
        const isLast = idx === sessions.length - 1;
        return (
          <div key={s.inTs}>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/20">
              <div className="flex flex-col items-center min-w-[52px]">
                <span className="text-emerald-400/50 text-[10px] uppercase tracking-widest leading-none mb-0.5">In</span>
                <span className="text-emerald-300 text-base font-mono leading-none">{hhmm(s.inTs)}</span>
                <span className="text-emerald-900/80 text-[9px] font-mono leading-none mt-0.5">{ddmmyyyy(s.inTs)}</span>
              </div>
              <div className="flex-1 flex items-center gap-1">
                <div className="flex-1 h-px bg-emerald-800/40" />
                <span className="text-white/30 text-[10px] font-mono shrink-0">{formatDuration(durationMs)}</span>
                <div className="flex-1 h-px bg-emerald-800/40" />
              </div>
              <div className="flex flex-col items-center min-w-[52px]">
                <span className="text-white/30 text-[10px] uppercase tracking-widest leading-none mb-0.5">Out</span>
                {s.outTs != null ? (
                  <>
                    <span className="text-white/60 text-base font-mono leading-none">{hhmm(s.outTs)}</span>
                    <span className="text-white/20 text-[9px] font-mono leading-none mt-0.5">{ddmmyyyy(s.outTs)}</span>
                  </>
                ) : (
                  <span className="text-emerald-400 text-xs font-mono leading-none animate-pulse">now</span>
                )}
              </div>
            </div>
            {!isLast && s.breakAfterMs != null && s.breakAfterMs > 60_000 && (
              <div className="flex items-center gap-2 px-4 py-1.5 my-1">
                <div className="flex-1 h-px border-t border-dashed border-orange-900/40" />
                <span className="text-orange-400/50 text-[10px] font-mono shrink-0">break {formatDuration(s.breakAfterMs)}</span>
                <div className="flex-1 h-px border-t border-dashed border-orange-900/40" />
              </div>
            )}
          </div>
        );
      })}
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
