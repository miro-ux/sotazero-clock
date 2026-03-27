"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface PinPadProps {
  onComplete: (pin: string) => void;
  onBack?: () => void;
  loading?: boolean;
  error?: boolean;
  title?: string;
  subtitle?: string;
  accentColor?: "emerald" | "rose" | "blue";
}

const PIN_LENGTH = 4;

export default function PinPad({
  onComplete,
  onBack,
  loading = false,
  error = false,
  title,
  subtitle,
  accentColor = "blue",
}: PinPadProps) {
  const [digits, setDigits] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const prevErrorRef = useRef(false);

  // Shake + reset dots when error flips to true
  useEffect(() => {
    if (error && !prevErrorRef.current) {
      setShake(true);
      setDigits([]);
      setTimeout(() => setShake(false), 500);
    }
    prevErrorRef.current = error;
  }, [error]);

  const handleDigit = useCallback(
    (d: string) => {
      if (loading || digits.length >= PIN_LENGTH) return;
      const next = [...digits, d];
      setDigits(next);
      if (next.length === PIN_LENGTH) {
        // Reset immediately so pad is ready for next attempt
        setTimeout(() => setDigits([]), 0);
        onComplete(next.join(""));
      }
    },
    [digits, loading, onComplete]
  );

  const handleBackspace = useCallback(() => {
    if (loading) return;
    setDigits((prev) => prev.slice(0, -1));
  }, [loading]);

  // Keyboard support: number keys, numpad, backspace, escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Escape" && onBack) {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDigit, handleBackspace, onBack]);

  const dotColor = {
    emerald: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]",
    rose: "bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.5)]",
    blue: "bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]",
  }[accentColor];

  const dotEmpty = {
    emerald: "border-emerald-500/25",
    rose: "border-rose-500/25",
    blue: "border-blue-500/25",
  }[accentColor];

  const btnActive = {
    emerald: "active:bg-emerald-900/50",
    rose: "active:bg-rose-900/50",
    blue: "active:bg-blue-900/50",
  }[accentColor];

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xs mx-auto">
      {/* Header */}
      {(title || subtitle) && (
        <div className="text-center">
          {title && <p className="text-white/90 text-2xl font-light">{title}</p>}
          {subtitle && <p className="text-white/40 text-sm mt-1">{subtitle}</p>}
        </div>
      )}

      {/* PIN dots */}
      <div className={cn("flex gap-4", shake && "shake")}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-5 h-5 rounded-full border-2 transition-all duration-150",
              digits.length > i
                ? `${dotColor} border-transparent scale-110`
                : error
                ? "border-red-500/60 bg-red-500/20"
                : `${dotEmpty} bg-transparent`
            )}
          />
        ))}
      </div>

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n) => (
          <PadButton key={n} label={n} onClick={() => handleDigit(n)} activeClass={btnActive} disabled={loading} />
        ))}
        <div />
        <PadButton label="0" onClick={() => handleDigit("0")} activeClass={btnActive} disabled={loading} />
        <PadButton
          icon={<Delete size={24} className="text-white/60" />}
          onClick={handleBackspace}
          activeClass={btnActive}
          disabled={loading || digits.length === 0}
        />
      </div>

      {/* Back button */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-white/30 hover:text-white/60 transition-colors text-sm mt-2"
        >
          <ArrowLeft size={16} />
          Back
        </button>
      )}
    </div>
  );
}

function PadButton({
  label,
  icon,
  onClick,
  activeClass,
  disabled,
}: {
  label?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  activeClass: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "pad-btn h-20 md:h-24 rounded-2xl text-2xl font-light text-white/80 flex items-center justify-center transition-all",
        activeClass,
        "disabled:opacity-30 disabled:cursor-not-allowed"
      )}
    >
      {icon ?? label}
    </button>
  );
}
