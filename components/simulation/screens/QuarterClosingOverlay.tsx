"use client";

/**
 * QuarterClosingOverlay — the cinematic loading screen shown while the engine
 * scores a just-locked quarter.
 *
 * Exact match to the "QUARTER X CLOSED." design:
 *   • Animated Myelin logo ring
 *   • Dynamic quarter number in the headline
 *   • Hourglass + "CONSEQUENCES IN MOTION"
 *   • 5-step timeline that advances step-by-step, each step activating in
 *     sequence over the 5-second processing window
 *   • Lightbulb quote card at the bottom
 *   • Globe (lower-left) + bar-chart (lower-right) atmospheric background SVGs
 */

import { useEffect, useState } from "react";

/** How long the overlay is shown (must match the 5000ms delay in closeQuarter). */
const TOTAL_MS = 5000;

/** Timeline step definitions — each step activates in sequence. */
const TIMELINE_STEPS = [
  {
    id: "decisions",
    label: "DECISIONS\nRECORDED",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <rect x="9" y="2" width="6" height="4" rx="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    id: "world",
    label: "WORLD\nUPDATING",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M12 2a10 10 0 1 0 10 10" />
        <path d="M12 2c-2.76 0-5 4.48-5 10s2.24 10 5 10 5-4.48 5-10" />
        <path d="M2 12h20" />
        <path d="M15 3.58A17.44 17.44 0 0 1 17 12" />
        <path d={active ? "M19 6l1.5-1.5M19 6v3h-3" : "M20 6V3h-3"} />
      </svg>
    ),
  },
  {
    id: "impacts",
    label: "IMPACTS\nCALCULATING",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M21 7.5l-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
      </svg>
    ),
  },
  {
    id: "outcomes",
    label: "OUTCOMES\nEMERGING",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M3 3v18h18" />
        <path d="M7 16l4-4 4 4 4-6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "results",
    label: "RESULTS\nREVEALING",
    icon: (active: boolean) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
];

/** Ordinal label for a quarter number: 1 → 1, 2 → 2, etc. */
function quarterLabel(q: number): number {
  return q;
}

export function QuarterClosingOverlay({
  quarter,
  error,
  onDismiss,
  dismissLabel,
}: {
  quarter: number;
  error?: string | null;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  /**
   * `activeStep` advances from 0 → 4 over TOTAL_MS, so each of the 5 steps
   * is active for ~1 second before the next lights up.
   */
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (error) return; // don't advance if we errored out
    const stepDuration = TOTAL_MS / TIMELINE_STEPS.length;
    const timers = TIMELINE_STEPS.map((_, i) =>
      setTimeout(() => setActiveStep(i), i * stepDuration),
    );
    return () => timers.forEach(clearTimeout);
  }, [error]);

  return (
    <div
      className="absolute inset-0 z-[60] overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 40%, #091824 0%, #040c12 55%, #010608 100%)",
      }}
    >
      {/* ── Atmospheric globe — lower-left ──────────────────────────────── */}
      <div className="absolute bottom-0 left-0 w-[44%] h-[80%] opacity-25 pointer-events-none">
        <svg viewBox="0 0 320 320" className="w-full h-full" preserveAspectRatio="xMinYMax meet">
          <defs>
            <radialGradient id="globe-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Globe outer circle */}
          <circle cx="120" cy="200" r="110" fill="none" stroke="#14b8a6" strokeWidth="0.6" opacity="0.5" />
          {/* Latitude lines */}
          {[-60, -30, 0, 30, 60].map((lat, i) => {
            const r = Math.cos((lat * Math.PI) / 180) * 110;
            return (
              <ellipse key={i} cx="120" cy={200 + Math.sin((lat * Math.PI) / 180) * 110} rx={r} ry={r * 0.3} fill="none" stroke="#14b8a6" strokeWidth="0.4" opacity="0.3" />
            );
          })}
          {/* Longitude lines */}
          {[0, 30, 60, 90, 120, 150].map((lon, i) => (
            <ellipse key={i} cx="120" cy="200" rx={Math.abs(Math.cos((lon * Math.PI) / 180)) * 110} ry="110" fill="none" stroke="#14b8a6" strokeWidth="0.4" opacity="0.25" transform={`rotate(${lon} 120 200)`} />
          ))}
          {/* Glow fill */}
          <circle cx="120" cy="200" r="110" fill="url(#globe-grad)" />
          {/* Network dots */}
          {Array.from({ length: 20 }).map((_, i) => (
            <circle key={i} cx={120 + Math.cos(i * 1.1) * 80} cy={200 + Math.sin(i * 1.1) * 80 * 0.4} r="1.5" fill="#14b8a6" opacity={0.4 + (i % 3) * 0.15} />
          ))}
        </svg>
      </div>

      {/* ── Bar chart — lower-right ───────────────────────────────────── */}
      <div className="absolute bottom-0 right-0 w-[38%] h-[65%] opacity-20 pointer-events-none">
        <svg viewBox="0 0 300 280" className="w-full h-full" preserveAspectRatio="xMaxYMax meet">
          {/* Baseline */}
          <line x1="20" y1="250" x2="280" y2="250" stroke="#14b8a6" strokeWidth="0.8" opacity="0.5" />
          {/* Bars (ascending, like the screenshot) */}
          {[
            { x: 30, h: 60 },
            { x: 70, h: 90 },
            { x: 110, h: 120 },
            { x: 150, h: 155 },
            { x: 190, h: 185 },
            { x: 230, h: 215 },
          ].map((bar, i) => (
            <rect key={i} x={bar.x} y={250 - bar.h} width="28" height={bar.h} fill="#14b8a6" opacity={0.15 + i * 0.04} />
          ))}
          {/* Trend line */}
          <polyline
            points="44,190 84,160 124,130 164,95 204,65 244,35"
            fill="none"
            stroke="#14b8a6"
            strokeWidth="1.5"
            opacity="0.7"
          />
          {/* Trend dots */}
          {[
            [44, 190], [84, 160], [124, 130], [164, 95], [204, 65], [244, 35],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="3" fill="#14b8a6" opacity="0.8" />
          ))}
        </svg>
      </div>

      {/* ── Vignette overlays ────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 18%, transparent 72%, rgba(0,0,0,0.65) 100%)",
        }}
      />

      {/* ── Error state ──────────────────────────────────────────────────── */}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-md w-full border border-red-500/30 bg-red-900/20 backdrop-blur-md px-8 py-6 text-center">
            <h2 className="font-serif text-3xl text-white mb-3">Processing Error</h2>
            <p className="text-white/60 mb-8">{error}</p>
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="px-6 py-2.5 border border-white/20 text-white/80 text-sm uppercase tracking-widest hover:bg-white/10 transition-colors"
              >
                {dismissLabel ?? "Dismiss"}
              </button>
            )}
          </div>
        </div>
      ) : (
        /* ── Main content ─────────────────────────────────────────────── */
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">

          {/* ── Animated Myelin logo ring ──────────────────────────────── */}
          <div className="relative w-[88px] h-[88px] mb-7 flex items-center justify-center shrink-0">
            {/* Outer spinning arc */}
            <svg
              className="absolute inset-0 w-full h-full"
              style={{ animation: "spin 4s linear infinite" }}
              viewBox="0 0 88 88"
            >
              <circle
                cx="44" cy="44" r="40"
                fill="none"
                stroke="#14b8a6"
                strokeWidth="2"
                strokeDasharray="170 83"
                strokeLinecap="round"
                opacity="0.85"
              />
            </svg>
            {/* Dot orbiting on the ring */}
            <svg
              className="absolute inset-0 w-full h-full"
              style={{ animation: "spin 4s linear infinite" }}
              viewBox="0 0 88 88"
            >
              <circle cx="44" cy="4" r="3.5" fill="#14b8a6" />
            </svg>
            {/* Static faint base ring */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r="40" fill="none" stroke="#14b8a6" strokeWidth="0.5" opacity="0.18" />
            </svg>
            {/* M glyph in center */}
            <div
              className="relative w-[48px] h-[48px] rounded-full flex items-center justify-center"
              style={{ background: "#0a1a24", border: "1px solid rgba(20,184,166,0.35)" }}
            >
              <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                <path
                  d="M3 18V6l4.5 6 4.5-6 4.5 6 4.5-6v12"
                  stroke="#14b8a6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          {/* ── QUARTER X CLOSED. ──────────────────────────────────────── */}
          <h1
            className="text-white font-bold tracking-[0.08em] mb-2 shrink-0"
            style={{ fontSize: "clamp(1.75rem, 5vw, 3rem)", fontFamily: "system-ui, -apple-system, sans-serif" }}
          >
            QUARTER {quarterLabel(quarter)} CLOSED.
          </h1>

          {/* ── Subtitle ──────────────────────────────────────────────── */}
          <p className="text-[#14b8a6] text-sm mb-6 shrink-0">
            Your decisions are now taking effect.
          </p>

          {/* ── Hourglass divider ─────────────────────────────────────── */}
          <div className="flex flex-col items-center mb-2 shrink-0">
            <div className="h-px w-20 bg-white/10 mb-3" />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#14b8a6"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-6 h-6 mb-3"
            >
              <path d="M5 3h14M5 21h14M7 3v5l5 4-5 4v5M17 3v5l-5 4 5 4v5" />
            </svg>
          </div>

          {/* ── CONSEQUENCES IN MOTION ────────────────────────────────── */}
          <p className="text-[#14b8a6] text-xs font-bold uppercase tracking-[0.22em] mb-1 shrink-0">
            CONSEQUENCES IN MOTION
          </p>
          <p className="text-white/55 text-[13px] mb-8 shrink-0">
            Sit tight while the world responds to your decisions.
          </p>

          {/* ── Animated 5-step timeline ──────────────────────────────── */}
          <div className="flex items-start justify-center gap-0 mb-8 w-full max-w-[680px] shrink-0">
            {TIMELINE_STEPS.map((step, i) => {
              const isDone = i < activeStep;
              const isActive = i === activeStep;
              const isPending = i > activeStep;

              return (
                <div key={step.id} className="flex items-center">
                  {/* Step node */}
                  <div className="flex flex-col items-center gap-2.5">
                    {/* Icon circle */}
                    <div
                      className="w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-700"
                      style={{
                        borderColor: isActive
                          ? "#14b8a6"
                          : isDone
                          ? "rgba(20,184,166,0.45)"
                          : "rgba(255,255,255,0.12)",
                        background: isActive
                          ? "rgba(20,184,166,0.08)"
                          : "transparent",
                        boxShadow: isActive
                          ? "0 0 20px rgba(20,184,166,0.45), 0 0 6px rgba(20,184,166,0.25)"
                          : "none",
                        color: isActive
                          ? "#14b8a6"
                          : isDone
                          ? "rgba(20,184,166,0.5)"
                          : "rgba(255,255,255,0.2)",
                        opacity: isPending ? 0.35 : 1,
                        transition: "all 0.6s ease",
                      }}
                    >
                      {step.icon(isActive)}
                    </div>
                    {/* Label */}
                    <p
                      className="text-[9.5px] uppercase tracking-widest text-center leading-tight whitespace-pre-line"
                      style={{
                        width: "4.5rem",
                        color: isActive
                          ? "#14b8a6"
                          : isDone
                          ? "rgba(20,184,166,0.45)"
                          : "rgba(255,255,255,0.3)",
                        fontWeight: isActive ? 700 : 400,
                        transition: "color 0.6s ease",
                      }}
                    >
                      {step.label}
                    </p>
                  </div>

                  {/* Connector line between steps */}
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div className="relative mx-1 mb-7 shrink-0" style={{ width: "clamp(2rem, 5vw, 3.5rem)", height: "1px" }}>
                      {/* Background dashed track */}
                      <div
                        className="absolute inset-0"
                        style={{
                          borderTop: "1px dashed rgba(255,255,255,0.15)",
                        }}
                      />
                      {/* Advancing teal fill */}
                      <div
                        className="absolute inset-y-0 left-0"
                        style={{
                          borderTop: "1px solid rgba(20,184,166,0.6)",
                          width: isDone ? "100%" : isActive ? "50%" : "0%",
                          transition: "width 0.8s ease",
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Quote card with lightbulb ─────────────────────────────── */}
          <div
            className="max-w-[440px] w-full flex items-start gap-3.5 px-5 py-4 shrink-0"
            style={{
              background: "rgba(20,184,166,0.06)",
              border: "1px solid rgba(20,184,166,0.2)",
            }}
          >
            {/* Lightbulb icon */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#14b8a6"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5 shrink-0 mt-0.5"
              style={{ opacity: 0.85 }}
            >
              <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 4 12.77V17H8v-2.23A7 7 0 0 1 12 2z" />
            </svg>
            <div className="text-left min-w-0">
              <p className="text-[#14b8a6] text-[12.5px] font-semibold leading-snug mb-0.5">
                Every decision creates a ripple.
              </p>
              <p className="text-white/55 text-[12.5px] leading-snug">
                Some you see. Some you&apos;ll feel. All of them matter.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Inline keyframes for the ring spin (avoids Tailwind animation dependency) */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
