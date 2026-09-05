"use client";

/**
 * The Myelin simulation component vocabulary — premium redesign.
 * Ruled panels, a monospace column for every number, serif for headings.
 * Tonal left-border accents, glassmorphic panel headers, glowing bars.
 */

import { createContext, useContext, useState } from "react";
import {
  BUFFER,
  LEVEL_TONE,
  MESSAGE_TONE,
  TEACHING_NOTES,
  TICKER_TONE,
  TONE_BAR,
  TONE_CARD,
  TONE_TEXT,
} from "@/lib/simulation/constants";
import { clamp, inr, n0, n1 } from "@/lib/simulation/format";
import type { Budget, HealthBar, InboxMessage, Readiness, Tone } from "@/lib/simulation/types";

/* ── chart colours ────────────────────────────────────────────────────
   SVG and recharts take paint values rather than Tailwind classes. */

export const CHART_RISE = "var(--tone-good)";
export const CHART_FALL = "var(--tone-bad)";
export const CHART_GRID = "var(--sim-line)";
export const CHART_AXIS = "var(--faint)";

/* ── tone → accent border colour map ─────────────────────────────── */

const TONE_BORDER: Record<Tone, string> = {
  good: "border-l-teal",
  watch: "border-l-ember",
  bad: "border-l-danger",
  flat: "border-l-line-2",
};

const TONE_GLOW: Record<Tone, string> = {
  good: "shadow-[0_0_12px_-3px_var(--teal)]",
  watch: "shadow-[0_0_12px_-3px_var(--ember)]",
  bad: "shadow-[0_0_12px_-3px_var(--danger)]",
  flat: "",
};

/* ── type and rules ───────────────────────────────────────────────── */

export function Eyebrow({
  children,
  tone = "text-dim",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className={"text-[10.5px] uppercase tracking-[0.22em] font-semibold " + tone}>
      {children}
    </div>
  );
}

/* ── selectable option cards ────────────────────────────────────────
   Every "pick one" control: payment terms, warranty, priority etc. */

export const optionCard = (on: boolean, pad = "p-3") =>
  `text-left border ${pad} transition-all duration-150 ease-out ` +
  (on
    ? "border-teal-deep bg-chrome text-white shadow-[0_0_16px_-4px_var(--teal)]"
    : "border-line bg-raise text-ink hover:border-teal/50 hover:bg-raise-2");

export const optionTitle = (on: boolean) => (on ? "text-white" : "text-ink");
export const optionMeta = "text-tone-good";
export const optionNote = (on: boolean) => (on ? "text-faint" : "text-dim");

/* ── panel ────────────────────────────────────────────────────────── */

export function Panel({
  eyebrow,
  title,
  right,
  children,
  className = "",
  headerClassName = "",
  bodyClassName = "",
}: {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={
        "border border-line overflow-hidden transition-shadow duration-200 hover:shadow-[0_0_24px_-8px_rgba(36,177,177,0.18)] " +
        className
      }
    >
      {(eyebrow || title) && (
        <header
          className={
            "border-b border-line px-4 py-3.5 flex flex-wrap items-end justify-between gap-2 " +
            "bg-gradient-to-r from-panel to-transparent " +
            headerClassName
          }
        >
          <div>
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            {title && (
              <h3 className="font-serif text-lg text-ink leading-snug mt-0.5">{title}</h3>
            )}
          </div>
          {right}
        </header>
      )}
      <div className={"p-4 bg-raise " + bodyClassName}>{children}</div>
    </section>
  );
}

/* ── stat card ────────────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  sub,
  tone = "text-ink",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="h-full overflow-hidden border border-line border-l-4 border-l-teal-deep bg-raise p-3.5 flex flex-col justify-start transition-all duration-200 hover:border-l-teal hover:shadow-[0_0_16px_-4px_rgba(36,177,177,0.22)]">
      <Eyebrow>{label}</Eyebrow>
      <div className={"font-mono text-2xl leading-tight mt-2 " + tone}>{value}</div>
      {sub && <div className="text-xs text-dim mt-1 font-mono">{sub}</div>}
    </div>
  );
}

/* ── bar ──────────────────────────────────────────────────────────── */

export function Bar({
  value,
  max,
  tone = "bg-chrome",
  glow,
}: {
  value: number;
  max: number;
  tone?: string;
  glow?: string;
}) {
  return (
    <div className="h-1.5 w-full bg-raise-2 overflow-hidden rounded-full">
      <div
        className={"h-1.5 rounded-full transition-all duration-500 ease-out " + tone}
        style={{
          width: clamp((value / (max || 1)) * 100, 0, 100) + "%",
          boxShadow: glow,
        }}
      />
    </div>
  );
}

/* ── ledger row ───────────────────────────────────────────────────── */

export function LedgerRow({
  label,
  working,
  value,
  tone = "text-ink",
  strong,
  flag,
  indent,
}: {
  label: React.ReactNode;
  working?: React.ReactNode;
  value: React.ReactNode;
  tone?: string;
  strong?: boolean;
  flag?: boolean;
  indent?: boolean;
}) {
  return (
    <div
      className={
        "grid grid-cols-12 gap-2 items-baseline py-1.5 border-b border-line " +
        (flag ? "bg-danger/10" : "")
      }
    >
      <div
        className={
          "col-span-6 sm:col-span-4 text-sm " +
          (indent ? "pl-4 " : "") +
          (strong ? "font-semibold text-ink" : "text-ink")
        }
      >
        {label}
      </div>
      <div className="col-span-6 sm:col-span-5 text-xs text-dim font-mono break-words order-3 sm:order-none">
        {working}
      </div>
      <div
        className={
          "col-span-6 sm:col-span-3 text-right font-mono text-sm " +
          tone +
          (strong ? " font-semibold" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}

/* ── teaching notes ───────────────────────────────────────────────── */

export const TeachingContext = createContext(true);

export function TeachingNote({ id, inline }: { id?: string; inline?: boolean }) {
  const enabled = useContext(TeachingContext);
  const [open, setOpen] = useState(false);
  const note = id ? TEACHING_NOTES[id] : undefined;
  if (!enabled || !note) return null;

  return (
    <div className={inline ? "mt-2" : "mt-3"}>
      <button
        onClick={() => setOpen(!open)}
        className="text-xs uppercase tracking-widest font-semibold text-dim hover:text-tone-bad border-b border-dotted border-line-2"
      >
        {open ? "Hide note" : "Why this works this way"}
      </button>
      {open && (
        <div className="mt-2 border-l-2 border-teal bg-panel px-3 py-2 rounded-r">
          <div className="text-xs uppercase tracking-widest text-tone-bad font-semibold">{note.cat}</div>
          <div className="font-serif text-base text-ink mt-0.5">{note.title}</div>
          <p className="text-sm text-ink mt-1 leading-snug">{note.body}</p>
        </div>
      )}
    </div>
  );
}

/* ── inbox ────────────────────────────────────────────────────────── */

export function Inbox({
  messages,
  limit,
  title = "Your inbox",
  eyebrow = "This morning",
}: {
  messages: InboxMessage[];
  limit?: number;
  title?: string;
  eyebrow?: string;
}) {
  const shown = limit ? messages.slice(0, limit) : messages;
  if (!shown.length) {
    return (
      <Panel eyebrow={eyebrow} title={title}>
        <p className="text-sm text-dim">
          Nothing from your team. Quiet quarters are rarer than they look.
        </p>
      </Panel>
    );
  }

  const toneAccent: Record<string, string> = {
    critical: "border-l-danger bg-danger/5",
    warning: "border-l-ember bg-ember/5",
    info: "border-l-teal bg-teal/5",
    good: "border-l-teal-bright bg-teal/5",
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <Eyebrow tone="text-tone-bad">{eyebrow}</Eyebrow>
          <h3 className="font-serif text-xl text-ink mt-0.5">{title}</h3>
        </div>
        {limit && messages.length > limit && (
          <span className="text-xs font-mono text-dim px-2 py-1 border border-line rounded-full">
            +{messages.length - limit} more on the dashboard
          </span>
        )}
      </div>
      <div className="space-y-2">
        {shown.map((m, i) => (
          <div
            key={i}
            className={
              "border border-line border-l-4 px-4 py-3.5 transition-all duration-150 hover:border-l-[5px] " +
              (toneAccent[m.tone] ?? "border-l-line-2 bg-raise")
            }
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-serif text-base text-ink">{m.name}</span>
              <span className="text-xs uppercase tracking-widest text-dim">{m.role}</span>
              <span
                className={
                  "px-2 py-0.5 text-[10px] uppercase tracking-widest font-semibold ml-auto rounded-sm " +
                  (MESSAGE_TONE[m.tone]?.tag ?? "bg-chrome text-white")
                }
              >
                {MESSAGE_TONE[m.tone]?.label ?? m.tone}
              </span>
            </div>
            <div className="font-semibold text-ink text-sm mt-1.5">{m.subject}</div>
            <p className="text-sm text-dim mt-1 leading-snug">{m.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── sparkline ────────────────────────────────────────────────────── */

export function Sparkline({
  values,
  tone,
  w = 72,
  h = 24,
}: {
  values: number[];
  tone?: "invert" | "normal";
  w?: number;
  h?: number;
}) {
  const pts = (values || []).filter((v) => Number.isFinite(v));
  if (pts.length < 2) return null;

  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const span = hi - lo || 1;
  const coords = pts.map((v, i) => [
    (i / (pts.length - 1)) * (w - 2) + 1,
    h - 1 - ((v - lo) / span) * (h - 2),
  ]);
  const points = coords.map((c) => c[0].toFixed(1) + "," + c[1].toFixed(1)).join(" ");
  const rising = pts[pts.length - 1] >= pts[0];
  const colour =
    tone === "invert" ? (rising ? CHART_FALL : CHART_RISE) : rising ? CHART_RISE : CHART_FALL;
  const last = coords[coords.length - 1];

  return (
    <svg width={w} height={h} className="inline-block align-middle" role="img" aria-label="trend">
      <polyline
        points={points}
        fill="none"
        stroke={colour}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={colour} />
    </svg>
  );
}

/* ── trend stat card ──────────────────────────────────────────────── */

export function TrendStat({
  label,
  value,
  sub,
  tone = "flat",
  series,
  invert,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  series?: number[];
  invert?: boolean;
}) {
  const pts = (series || []).filter((v) => Number.isFinite(v));
  const delta = pts.length >= 2 ? pts[pts.length - 1] - pts[pts.length - 2] : null;
  const better = delta === null ? null : invert ? delta < 0 : delta > 0;

  return (
    <div
      className={
        "h-full overflow-hidden border border-line border-l-4 bg-raise p-3.5 flex flex-col justify-start " +
        "transition-all duration-200 hover:shadow-[0_0_20px_-6px_rgba(36,177,177,0.2)] " +
        TONE_BORDER[tone]
      }
    >
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-2 flex flex-col justify-between gap-y-3 flex-1">
        <div className="min-w-0 max-w-full">
          <div className={"font-mono text-2xl tracking-tighter leading-none break-words " + TONE_TEXT[tone]}>{value}</div>
          {sub && <div className="text-[11px] text-dim mt-1.5 font-mono leading-tight max-w-full break-words">{sub}</div>}
        </div>
        <div className="shrink-0 flex flex-row items-end justify-between w-full mt-auto">
          <Sparkline values={pts} tone={invert ? "invert" : "normal"} />
          {delta !== null && (
            <div
              className={
                "text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-sm shrink-0 " +
                (better
                  ? "text-teal-bright bg-teal/10"
                  : "text-tone-bad bg-danger/10")
              }
            >
              {better ? "▲" : "▼"}{" "}
              {Math.abs(delta) >= 1000 ? n0(Math.abs(delta)) : n1(Math.abs(delta))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── ticker ───────────────────────────────────────────────────────── */

export function Ticker({
  items,
}: {
  items: { label: string; value: string; tone: Tone; dir: "up" | "down" | null }[];
}) {
  if (!items.length) return null;

  const run = (key: string) => (
    <div key={key} className="flex shrink-0 items-center" aria-hidden={key === "b"}>
      {items.map((item, i) => (
        <div 
          key={i} 
          className="group flex items-center gap-3 px-6 py-0.5 border-r border-white/10 hover:bg-white/5 transition-colors duration-200"
        >
          <span className="text-[11px] uppercase tracking-[0.15em] font-semibold text-white/60 group-hover:text-white/80 transition-colors">
            {item.label}
          </span>
          <div className="flex items-center gap-2">
            <span 
              className={
                "font-mono text-[15px] font-semibold tracking-tight transition-all duration-200 " + 
                (item.tone === "good" 
                  ? "text-teal-bright group-hover:text-teal" 
                  : item.tone === "bad" 
                  ? "text-danger-soft group-hover:text-danger" 
                  : item.tone === "watch" 
                  ? "text-amber group-hover:text-amber-bright" 
                  : "text-white group-hover:text-white/90")
              }
            >
              {item.value}
            </span>
            {item.dir && (
              <span 
                className={
                  "text-[10px] font-bold transition-transform duration-200 group-hover:scale-110 " + 
                  (item.dir === "up" 
                    ? "text-teal-bright animate-pulse" 
                    : "text-danger-soft animate-pulse")
                }
                style={{ animationDuration: "2s" }}
              >
                {item.dir === "up" ? "▲" : "▼"}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="bg-gradient-to-r from-chrome via-chrome/95 to-chrome border-t border-b border-white/20 overflow-hidden shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),inset_0_-1px_0_0_rgba(0,0,0,0.2)]">
      <style>
        {
          "@keyframes simTick{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}.simulation-tick{animation:simTick 90s linear infinite;will-change:transform}.simulation-tick:hover{animation-play-state:paused}@media (prefers-reduced-motion:reduce){.simulation-tick{animation:none}}"
        }
      </style>
      <div className="flex w-max simulation-tick py-2">
        {run("a")}
        {run("b")}
      </div>
    </div>
  );
}

/* ── readiness grid ───────────────────────────────────────────────── */

const LEVEL_ICON: Record<string, string> = {
  STRONG: "●",
  ADEQUATE: "●",
  TIGHT: "◆",
  CONSTRAINED: "◆",
  EXCESS: "◆",
  OVERBUILT: "▲",
  CRITICAL: "▲",
  NONE: "—",
};

export function ReadinessGrid({ dirs, only }: { dirs: Readiness[]; only?: string[] }) {
  const shown = only ? dirs.filter((d) => only.indexOf(d.id) >= 0) : dirs;
  if (!shown.length) return null;

  const cols =
    shown.length > 6
      ? "grid-cols-1 min-[560px]:grid-cols-3 xl:grid-cols-5"
      : "[grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]";

  return (
    <div className={"grid gap-2 " + cols}>
      {shown.map((d) => {
        const tone: Tone = LEVEL_TONE[d.level] ?? "watch";
        const icon = LEVEL_ICON[d.level] ?? "◆";
        return (
          <div
            key={d.id}
            className={
              "border p-3.5 transition-all duration-200 hover:shadow-[0_0_16px_-4px_rgba(36,177,177,0.15)] " +
              TONE_CARD[tone]
            }
          >
            <Eyebrow>{d.label}</Eyebrow>
            <div
              className={
                "font-mono text-sm font-bold mt-1 flex items-center gap-1.5 " + TONE_TEXT[tone]
              }
            >
              <span className="text-[8px]">{icon}</span>
              {d.level}
            </div>
            <div className="text-xs text-dim mt-1.5 leading-snug">{d.note}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── health panel ─────────────────────────────────────────────────── */

const BAR_GLOW: Record<Tone, string> = {
  good: "0 0 8px 0 var(--teal)",
  watch: "0 0 8px 0 var(--ember)",
  bad: "0 0 8px 0 var(--danger)",
  flat: "none",
};

export function HealthPanel({ health, compact }: { health: HealthBar[]; compact?: boolean }) {
  return (
    <Panel eyebrow="Orientation" title="Company health">
      <div className={"grid gap-x-6 gap-y-4 " + (compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
        {health.map((h) => (
          <div key={h.key}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-sm text-ink font-medium">{h.label}</span>
              <span className={"text-sm font-mono font-bold " + TONE_TEXT[h.tone]}>
                {n0(h.value)}
              </span>
            </div>
            <Bar value={h.value} max={100} tone={TONE_BAR[h.tone]} glow={BAR_GLOW[h.tone]} />
            <div className="text-xs text-dim mt-1.5 leading-snug">{h.note}</div>
          </div>
        ))}
      </div>
      <TeachingNote id="health" />
    </Panel>
  );
}

/* ── budget meter ─────────────────────────────────────────────────── */

export function BudgetMeter({ budget }: { budget: Budget }) {
  const left = budget.ceiling - budget.committed;
  const over = left < 0;

  return (
    <div
      className={
        "border px-4 py-3.5 transition-all duration-200 " +
        (over
          ? "border-danger bg-danger/10 shadow-[0_0_20px_-6px_var(--danger)]"
          : "border-line bg-raise")
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2.5">
        <Eyebrow tone={over ? "text-tone-bad" : "text-dim"}>
          {over ? "Over the quarter's ceiling" : "Cash left to commit"}
        </Eyebrow>
        <div className={"font-mono text-lg font-bold " + (over ? "text-tone-bad" : "text-ink")}>
          {inr(left)}{" "}
          <span className="text-faint text-xs font-normal">of {inr(budget.ceiling)}</span>
        </div>
      </div>
      <Bar
        value={budget.committed}
        max={budget.ceiling}
        tone={over ? "bg-danger" : budget.committed > budget.ceiling * 0.85 ? "bg-ember" : "bg-teal-deep"}
        glow={over ? BAR_GLOW.bad : budget.committed > budget.ceiling * 0.85 ? BAR_GLOW.watch : "none"}
      />
      <div className="text-xs text-dim mt-2.5 font-mono leading-relaxed">
        {inr(budget.opex)} operating · {inr(budget.capex)} plant · {inr(budget.inno)} innovation ·{" "}
        {inr(budget.people)} people.
      </div>
      {budget.investment > 0 && (
        <div className="mt-2.5 p-2.5 rounded border border-teal/30 bg-teal/5">
          <div className="text-xs font-semibold text-teal-bright mb-1.5">Budget Breakdown:</div>
          <div className="text-xs font-mono text-ink space-y-0.5">
            <div className="flex justify-between">
              <span className="text-dim">Cash on hand:</span>
              <span>{inr((budget as any).cash_available || 0)}</span>
            </div>
            <div className="flex justify-between text-teal-bright">
              <span>+ Signed investment:</span>
              <span className="font-semibold">+{inr(budget.investment)}</span>
            </div>
            {budget.drawn > 0 && (
              <div className="flex justify-between">
                <span className="text-dim">+ Credit drawn:</span>
                <span>+{inr(budget.drawn)}</span>
              </div>
            )}
            <div className="border-t border-teal/20 pt-0.5 mt-0.5 flex justify-between">
              <span className="text-dim">Total available:</span>
              <span className="font-semibold">{inr((budget as any).total_funds || (budget.ceiling + (budget as any).fixed_costs + (budget as any).buffer))}</span>
            </div>
            <div className="flex justify-between text-faint text-[11px]">
              <span>- Fixed costs & buffer:</span>
              <span>-{inr(((budget as any).fixed_costs || 0) + ((budget as any).buffer || BUFFER))}</span>
            </div>
            <div className="border-t border-teal/20 pt-0.5 mt-0.5 flex justify-between font-semibold">
              <span>Available to allocate:</span>
              <span className="text-teal-bright">{inr(budget.ceiling)}</span>
            </div>
          </div>
        </div>
      )}
      {!budget.investment && (
        <div className="text-faint text-xs mt-1.5 font-mono">
          Ceiling = cash + credit - fixed costs - {inr(BUFFER)} buffer
        </div>
      )}
    </div>
  );
}
