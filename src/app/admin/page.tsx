"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import PinPad from "@/components/PinPad";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_PIN = "8599";

type Tab = "employees" | "events" | "add";

/** Compute total time worked from a list of clock events for one employee.
 *  Pairs each "in" with the next "out" chronologically. */
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
  // If still clocked in, count up to now
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

/** Group events by employee name and compute worked time + last status */
function buildSummary(
  events: Array<{ employeeName: string; type: "in" | "out"; timestamp: number }>
) {
  const map = new Map<
    string,
    { events: typeof events; lastType: "in" | "out" | null }
  >();

  for (const e of events) {
    if (!map.has(e.employeeName)) {
      map.set(e.employeeName, { events: [], lastType: null });
    }
    const entry = map.get(e.employeeName);
    if (!entry) continue;
    entry.events.push(e);
  }

  return Array.from(map.entries())
    .map(([name, { events }]) => {
      const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
      const lastType = sorted[sorted.length - 1]?.type ?? null;
      const workedMs = calcWorkedMs(events);
      return { name, lastType, workedMs, eventCount: events.length };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function AdminPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preAuthed = searchParams.get("auth") === "1";
  const [authenticated, setAuthenticated] = useState(preAuthed);
  const [pinError, setPinError] = useState(false);
  const [tab, setTab] = useState<Tab>("events");

  const [newName, setNewName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState(false);

  const employees = useQuery(api.employees.listAll, authenticated ? {} : "skip");
  const todayEvents = useQuery(
    api.clockEvents.getTodayEvents,
    authenticated ? { date: new Date().toISOString().split("T")[0] } : "skip"
  );

  const addEmployee = useMutation(api.employees.addEmployee);
  const removeEmployee = useMutation(api.employees.removeEmployee);

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
      setAddError(e instanceof Error ? e.message : "Failed to add employee");
    }
  };

  // ── PIN gate ──
  if (!authenticated) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-8 px-6 bg-[#0a0a0f]">
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

  const summary = todayEvents ? buildSummary(todayEvents) : null;

  // ── Admin Panel ──
  return (
    <div className="min-h-screen w-screen bg-[#0a0a0f] flex flex-col">
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
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </p>

            {!todayEvents || !summary ? (
              <p className="text-white/20 text-center py-12">Loading...</p>
            ) : todayEvents.length === 0 ? (
              <p className="text-white/20 text-center py-12">No events today</p>
            ) : (
              <>
                {/* Per-person summary cards */}
                <div className="space-y-3 mb-8">
                  {summary.map(({ name, lastType, workedMs, eventCount }) => (
                    <div key={name} className="flex items-center gap-4 p-5 rounded-2xl bg-white/6 border border-white/8">
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xl font-light shrink-0">
                        {name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white/90 text-lg font-light">{name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Timer size={13} className="text-white/30 shrink-0" />
                          <span className="text-white/50 text-sm font-mono">{formatDuration(workedMs)}</span>
                          <span className="text-white/20 text-xs ml-1">({eventCount} events)</span>
                        </div>
                      </div>
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
                    </div>
                  ))}
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
                        {new Date(e.timestamp).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
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
                <div
                  key={emp._id}
                  className="flex items-center gap-4 p-5 rounded-2xl bg-white/6 border border-white/8"
                >
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xl font-light shrink-0">
                    {emp.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-white/90 text-lg font-light">{emp.name}</p>
                    {emp.isAdmin && (
                      <span className="text-blue-400/70 text-xs flex items-center gap-1 mt-0.5">
                        <Shield size={10} /> Admin
                      </span>
                    )}
                  </div>
                  {!emp.isAdmin && (
                    <button
                      type="button"
                      onClick={() => removeEmployee({ id: emp._id })}
                      className="p-3 rounded-xl hover:bg-red-900/40 text-white/20 hover:text-red-400 transition-colors"
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
