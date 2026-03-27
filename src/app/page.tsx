"use client";

import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import PinPad from "@/components/PinPad";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Clock, Coffee, Loader2, LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

type Stage = "pin" | "lookup" | "confirm" | "submitting" | "success";

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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
      // Work segment: from this "in" to next "out" or now
      const end = events[i + 1]?.type === "out" ? events[i + 1].timestamp : now;
      workMs += end - e.timestamp;
      segments.push({ type: "work", start: e.timestamp, end });
    } else if (e.type === "out") {
      // Break segment: from this "out" to next "in" or now (if still on break — shouldn't happen for currently-in)
      const nextIn = events[i + 1]?.type === "in" ? events[i + 1].timestamp : null;
      if (nextIn) {
        breakMs += nextIn - e.timestamp;
        segments.push({ type: "break", start: e.timestamp, end: nextIn });
      }
    }
  }

  return { workMs, breakMs, segments };
}

/**
 * Radial clock showing work/break segments at their real clock positions.
 * 12h face: 12 at top (0°), 3 at right (90°), 6 at bottom (180°), 9 at left (270°).
 * Breaks only show orange if followed by a subsequent work segment.
 */
function ShiftClock({ workMs, segments }: {
  workMs: number;
  breakMs?: number;
  segments: Array<{ type: "work" | "break"; start: number; end: number }>;
}) {
  if (segments.length === 0 || workMs <= 0) return null;

  const R = 20;
  const CX = 24;
  const CY = 24;

  /** Convert a timestamp to degrees on a 12h clock (12=0°, 3=90°, 6=180°, 9=270°) */
  function tsToDeg(ts: number): number {
    const d = new Date(ts);
    const h = d.getHours() % 12;
    const m = d.getMinutes();
    return (h * 30) + (m * 0.5); // 360° / 12h = 30°/h, 0.5°/min
  }

  /** SVG arc path from startDeg to endDeg (clockwise) */
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

  // Build arcs for each segment
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
    <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0" role="img" aria-label="Shift clock">
      {/* Background ring */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
      {/* Segment arcs */}
      {arcs.map((arc) => (
        <path
          key={arc.key}
          d={arc.path}
          fill="none"
          stroke={arc.color}
          strokeWidth="5"
          strokeLinecap="round"
          style={{ opacity: 0.8 }}
        />
      ))}
      {/* 12 hour tick marks — 12 at top, 3 at right, 6 at bottom, 9 at left */}
      {Array.from({ length: 12 }).map((_, i) => {
        const deg = i * 30; // 0=12, 90=3, 180=6, 270=9
        const rad = (deg - 90) * (Math.PI / 180);
        const x1 = CX + (R + 2) * Math.cos(rad);
        const y1 = CY + (R + 2) * Math.sin(rad);
        const x2 = CX + (R - 1) * Math.cos(rad);
        const y2 = CY + (R - 1) * Math.sin(rad);
        return (
          <line
            key={`t${deg}`}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={i % 3 === 0 ? 1.5 : 0.5}
          />
        );
      })}
    </svg>
  );
}

/** Compute shift day params: 6am today to 3am tomorrow.
 *  If current time is before 3am, the "shift day" is actually yesterday's. */
function shiftDayParams() {
  const now = new Date();
  const hour = now.getHours();

  // Before 3am: we're still in yesterday's shift day
  const shiftDate = hour < 3
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    : now;

  const todayStr = shiftDate.toISOString().split("T")[0];
  const yesterday = new Date(shiftDate.getTime() - 86400000);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  // Shift starts at 6am on the shift date
  const shiftStart = new Date(shiftDate);
  shiftStart.setHours(6, 0, 0, 0);

  return { todayDate: todayStr, yesterdayDate: yesterdayStr, shiftStartTs: shiftStart.getTime() };
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function HomePage() {
  const router = useRouter();
  const currentlyIn = useQuery(api.clockEvents.getCurrentlyIn);
  const clockedOutToday = useQuery(api.clockEvents.getClockedOutToday, { shiftStartTs: shiftDayParams().shiftStartTs });

  const [stage, setStage] = useState<Stage>("pin");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [resolvedAction, setResolvedAction] = useState<"in" | "out">("in");
  const [, setTick] = useState(0);

  // Refresh "time since" display every 15s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);

  const employee = useQuery(
    api.employees.getByPin,
    pin.length === 4 ? { pin } : "skip"
  );

  const lastEvent = useQuery(
    api.clockEvents.getLastEventForEmployee,
    employee ? { employeeId: employee._id } : "skip"
  );

  const clockInOut = useMutation(api.clockEvents.clockInOut);

  // Step 1: employee lookup — admin goes straight to admin panel
  useEffect(() => {
    if (stage !== "lookup") return;
    if (employee === undefined) return;
    if (employee === null) {
      setPinError(true);
      setTimeout(() => {
        setPinError(false);
        setPin("");
        setStage("pin");
      }, 800);
    } else if (employee.isAdmin) {
      router.push("/admin?auth=1");
      setStage("pin");
      setPin("");
    }
  }, [employee, stage, router]);

  // Step 2: determine action from last event (skip for admins — they go to admin panel)
  useEffect(() => {
    if (stage !== "lookup") return;
    if (!employee) return;
    if (employee.isAdmin) return;
    if (lastEvent === undefined) return;
    const action = lastEvent?.type === "in" ? "out" : "in";
    setResolvedAction(action);
    setStage("confirm");
  }, [employee, lastEvent, stage]);

  const handlePinComplete = useCallback((enteredPin: string) => {
    setPin(enteredPin);
    setStage("lookup");
  }, []);

  const handleConfirm = async () => {
    if (!employee) return;
    setStage("submitting");
    try {
      await clockInOut({
        employeeId: employee._id,
        employeeName: employee.name,
        type: resolvedAction,
      });
      setStage("success");
      setTimeout(() => {
        setStage("pin");
        setPin("");
      }, 2200);
    } catch {
      setSubmitError("Something went wrong. Try again.");
      setStage("pin");
      setPin("");
    }
  };

  const isIn = resolvedAction === "in";
  const Icon = isIn ? LogIn : LogOut;
  const iconColor = isIn ? "text-emerald-400" : "text-rose-400";
  const labelColor = isIn ? "text-emerald-300" : "text-rose-300";
  const confirmBtnClass = isIn
    ? "bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600"
    : "bg-rose-500 hover:bg-rose-400 active:bg-rose-600";
  const successBg = isIn
    ? "bg-gradient-to-b from-emerald-950 to-[#0a0a0f]"
    : "bg-gradient-to-b from-rose-950 to-[#0a0a0f]";

  // ── Success overlay ──
  if (stage === "success" && employee) {
    return (
      <div className={cn("fixed inset-0 overflow-hidden flex flex-col items-center justify-center gap-8 fade-in", successBg)}>
        <CheckCircle size={96} className={iconColor} strokeWidth={1.5} />
        <div className="text-center">
          <p className="text-white/90 text-4xl font-light">{employee.name}</p>
          <p className={cn("text-2xl mt-3 font-light", labelColor)}>
            Clocked {isIn ? "In" : "Out"}
          </p>
        </div>
      </div>
    );
  }

  // ── Confirm overlay ──
  if (stage === "confirm" && employee) {
    return (
      <div className={cn("fixed inset-0 overflow-hidden flex flex-col items-center justify-center gap-10 px-8", successBg)}>
        <div className="fade-in flex flex-col items-center gap-8 text-center w-full max-w-sm">
          <div>
            <p className="text-white/40 text-sm uppercase tracking-widest mb-2">
              {isIn ? "Clock In" : "Clock Out"}
            </p>
            <p className="text-white text-5xl font-light">{employee.name}</p>
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            className={cn(
              "w-full py-8 rounded-3xl text-3xl font-light transition-all active:scale-95 text-white flex items-center justify-center gap-4",
              confirmBtnClass
            )}
          >
            <Icon size={36} strokeWidth={1.5} />
            {isIn ? "Clock In" : "Clock Out"}
          </button>
          <button
            type="button"
            onClick={() => { setStage("pin"); setPin(""); }}
            className="text-white/25 hover:text-white/55 text-lg transition-colors py-2 px-6"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ── Loading overlay ──
  if (stage === "submitting" || (stage === "lookup" && employee !== null)) {
    return (
      <div className="fixed inset-0 overflow-hidden flex items-center justify-center bg-[#0a0a0f]">
        <Loader2 size={56} className="text-white/30 animate-spin" />
      </div>
    );
  }

  const inCount = currentlyIn?.length ?? 0;

  // ── Currently In sidebar/panel content ──
  const currentlyInPanel = (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Clock size={22} className="text-emerald-400/70" />
        <span className="text-white/40 text-sm uppercase tracking-widest">Currently In</span>
        <span className="ml-auto bg-emerald-500/20 text-emerald-400 text-lg font-mono px-3 py-1 rounded-full">
          {inCount}
        </span>
      </div>
      <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
        {!currentlyIn ? (
          <span className="text-white/15 text-lg">Loading...</span>
        ) : currentlyIn.length === 0 ? (
          <span className="text-white/15 text-lg">Nobody clocked in</span>
        ) : (
          currentlyIn.map((person) => {
            const shift = computeShift(person.shiftEvents ?? []);
            return (
              <div
                key={person.employeeId}
                className="px-5 py-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/20"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-300 text-xl font-light shrink-0">
                    {person.employeeName[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/90 text-2xl font-bold truncate">{person.employeeName}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-emerald-400 text-sm font-mono">{formatDuration(shift.workMs)}</span>
                      {shift.breakMs > 0 && (
                        <span className="text-orange-400 text-sm font-mono flex items-center gap-1">
                          <Coffee size={12} />
                          {formatDuration(shift.breakMs)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ShiftClock workMs={shift.workMs} segments={shift.segments} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Clocked Out Today */}
      {clockedOutToday && clockedOutToday.length > 0 && (
        <>
          <div className="h-px bg-white/8 my-4" />
          <div className="flex items-center gap-3 mb-4">
            <LogOut size={18} className="text-white/30" />
            <span className="text-white/30 text-sm uppercase tracking-widest">Clocked Out</span>
          </div>
          <div className="flex flex-col gap-2" style={{ filter: "saturate(0.5)", opacity: 0.5 }}>
            {clockedOutToday.map((person) => {
              const shift = computeShift(person.shiftEvents ?? []);
              return (
                <div
                  key={person.employeeId}
                  className="px-5 py-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/20"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-300 text-xl font-light shrink-0">
                      {person.employeeName[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/90 text-2xl font-bold truncate">{person.employeeName}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-emerald-400 text-sm font-mono">{formatDuration(shift.workMs)}</span>
                        {shift.breakMs > 0 && (
                          <span className="text-orange-400 text-sm font-mono flex items-center gap-1">
                            <Coffee size={12} />
                            {formatDuration(shift.breakMs)}
                          </span>
                        )}
                        <span className="text-white/30 text-xs font-mono">out {fmtTime(person.lastOutTs)}</span>
                      </div>
                    </div>
                    <ShiftClock workMs={shift.workMs} segments={shift.segments} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );

  // ── Main view: sidebar (desktop) / top (mobile) + pin pad ──
  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-[#0a0a0f]">
      {/* Currently In — left sidebar on desktop, top on mobile */}
      {/* Mobile: horizontal strip */}
      <div className="md:hidden shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={18} className="text-emerald-400/70" />
          <span className="text-white/40 text-xs uppercase tracking-widest">Currently In</span>
          <span className="ml-auto bg-emerald-500/20 text-emerald-400 text-sm font-mono px-2.5 py-0.5 rounded-full">
            {inCount}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
          {!currentlyIn ? (
            <span className="text-white/15 text-sm">Loading...</span>
          ) : currentlyIn.length === 0 ? (
            <span className="text-white/15 text-sm">Nobody clocked in</span>
          ) : (
            currentlyIn.map((person) => {
              const shift = computeShift(person.shiftEvents ?? []);
              return (
                <div
                  key={person.employeeId}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-950/40 border border-emerald-800/20"
                >
                  <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-300 text-base font-light shrink-0">
                    {person.employeeName[0].toUpperCase()}
                  </div>
                  <span className="text-white/80 text-base font-light">{person.employeeName}</span>
                  <span className="text-emerald-400/40 text-sm font-mono">{formatDuration(shift.workMs)}</span>
                  {shift.breakMs > 0 && (
                    <span className="text-orange-400/60 text-sm font-mono flex items-center gap-1">
                      <Coffee size={11} />
                      {formatDuration(shift.breakMs)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="h-px bg-white/8 mt-3" />
      </div>

      {/* Desktop: left sidebar */}
      <div className="hidden md:flex flex-col w-96 lg:w-[28rem] shrink-0 border-r border-white/8 p-6 lg:p-8">
        {currentlyInPanel}
      </div>

      {/* PIN pad — center */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
        {submitError && (
          <p className="text-red-400 text-lg fade-in">{submitError}</p>
        )}
        {pinError && (
          <p className="text-red-400 text-lg fade-in">PIN not recognised</p>
        )}
        <PinPad
          key={pinError ? "error" : "normal"}
          onComplete={handlePinComplete}
          error={pinError}
          accentColor="emerald"
        />
      </div>
    </div>
  );
}
