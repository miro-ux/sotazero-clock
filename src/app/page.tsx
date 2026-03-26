"use client";

import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import PinPad from "@/components/PinPad";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Clock, Loader2, LogIn, LogOut, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

type Stage = "pin" | "lookup" | "confirm" | "submitting" | "success";

function formatSince(ts: number): string {
  const ms = Date.now() - ts;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function HomePage() {
  const router = useRouter();
  const currentlyIn = useQuery(api.clockEvents.getCurrentlyIn);

  const [stage, setStage] = useState<Stage>("pin");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [resolvedAction, setResolvedAction] = useState<"in" | "out">("in");

  const employee = useQuery(
    api.employees.getByPin,
    stage === "lookup" || stage === "confirm" ? { pin } : "skip"
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

  // Step 2: determine action from last event
  useEffect(() => {
    if (stage !== "lookup") return;
    if (!employee) return;
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
      <div className={cn("h-screen w-screen flex flex-col items-center justify-center gap-8 fade-in", successBg)}>
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
      <div className={cn("h-screen w-screen flex flex-col items-center justify-center gap-10 px-8", successBg)}>
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
      <div className="h-screen w-screen flex items-center justify-center bg-[#0a0a0f]">
        <Loader2 size={56} className="text-white/30 animate-spin" />
      </div>
    );
  }

  // ── Main view: currently-in list + pin pad ──
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0a0f]">
      {/* Admin gear */}
      <button
        type="button"
        onClick={() => router.push("/admin")}
        className="absolute top-5 right-5 z-10 p-3 rounded-full bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors"
        aria-label="Admin"
      >
        <Settings size={26} className="text-white/35" />
      </button>

      {/* Currently In — top */}
      <div className="shrink-0 px-6 pt-6 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Clock size={16} className="text-emerald-400/70" />
          <span className="text-white/30 text-xs uppercase tracking-widest">Currently In</span>
          {currentlyIn && currentlyIn.length > 0 && (
            <span className="ml-auto text-emerald-400/60 text-sm font-mono">{currentlyIn.length}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
          {!currentlyIn ? (
            <span className="text-white/15 text-sm">Loading...</span>
          ) : currentlyIn.length === 0 ? (
            <span className="text-white/15 text-sm">Nobody clocked in</span>
          ) : (
            currentlyIn.map((person) => (
              <div
                key={person.employeeId}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-950/60 border border-emerald-800/30"
              >
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-300 text-sm font-light shrink-0">
                  {person.employeeName[0].toUpperCase()}
                </div>
                <span className="text-white/80 text-sm font-light">{person.employeeName}</span>
                <span className="text-emerald-400/40 text-xs font-mono">{formatSince(person.since)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-white/8 mx-6" />

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
          accentColor="blue"
        />
      </div>
    </div>
  );
}
