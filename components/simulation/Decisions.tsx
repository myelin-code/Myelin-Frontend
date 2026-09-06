"use client";

/**
 * The department screen: a short list of grouped decisions with what each one buys and what
 * it costs you, and, folded away underneath, every underlying line with its published
 * formula and a live preview. Ported from the shipped `NadiWear.html` bundle.
 */

import {
  DECISION_GROUPS,
  DETAIL_LINES_BY_SCREEN,
  SCREEN_INBOX_SOURCES,
  SCREEN_META,
  SCREEN_TEACHING_NOTE,
  groupOverridden,
  groupTotal,
  numericAlloc,
  spreadGroup,
} from "@/lib/simulation/constants";
import { inr, lakh, num, spinnerKeyDown } from "@/lib/simulation/format";
import { BudgetMeter, Eyebrow, Inbox, ReadinessGrid, TeachingNote } from "@/components/simulation/Kit";
import { cn } from "@/lib/utils";
import type { DecisionItem, DetailLine } from "@/lib/simulation/constants";
import type { Alloc, Budget, CompanyState, InboxMessage, PreviewCtx, Readiness } from "@/lib/simulation/types";

/* ── one grouped decision ─────────────────────────────────────────── */

function DecisionCard({
  item,
  alloc,
  setAlloc,
  cash,
  budget,
  budgetExhausted,
  onBudgetExceeded,
  readOnly,
}: {
  item: DecisionItem;
  alloc: Alloc;
  setAlloc: (a: Alloc) => void;
  cash: number;
  budget: Budget;
  budgetExhausted: boolean;
  onBudgetExceeded: () => void;
  readOnly?: boolean;
}) {
  const A = numericAlloc(alloc);
  const total = groupTotal(A, item);
  const overridden = groupOverridden(A, item);
  const daysOfCash = cash > 0 ? Math.round(((total * 1e5) / cash) * 90) : 0;

  return (
    <div className="border border-line bg-raise">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="font-serif text-lg text-ink">{item.name}</div>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 mt-2">
            <div className="text-xs text-tone-good leading-snug">
              <span className="uppercase tracking-widest font-semibold">You gain</span>
              <br />
              {item.gain}
            </div>
            <div className="text-xs text-tone-bad leading-snug">
              <span className="uppercase tracking-widest font-semibold">You give up</span>
              <br />
              {item.cost}
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-dim font-mono text-sm">₹</span>
            <input
              type="number"
              min="0"
              step="1"
              value={total === 0 ? "" : total}
              placeholder="0"
              readOnly={readOnly}
              disabled={budgetExhausted && num(total) === 0}
              onChange={(e) => {
                const newVal = e.target.value.replace(/^-/, "");
                if (num(newVal) > total && budget.committed >= budget.ceiling) {
                  onBudgetExceeded();
                  return;
                }
                setAlloc(spreadGroup(alloc, item, newVal));
              }}
              onKeyDown={(e) => spinnerKeyDown(e, { step: 1, min: 0, onChange: (v) => {
                if (num(v) > total && budget.committed >= budget.ceiling) {
                  onBudgetExceeded();
                  return;
                }
                setAlloc(spreadGroup(alloc, item, v));
              }})}
              className={cn(
                "w-24 border border-line-2 px-2 py-1 text-right font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ink",
                (readOnly || (budgetExhausted && num(total) === 0)) && "opacity-60 cursor-not-allowed",
              )}
            />
            <span className="text-xs uppercase tracking-widest text-dim">lakh</span>
          </div>
          {total > 0 && (
            <div className="text-xs font-mono text-dim mt-1">
              {inr(total * 1e5)}
              {cash > 0 ? " · " + daysOfCash + " days of cash" : ""}
            </div>
          )}
          {overridden && <div className="text-xs text-tone-watch mt-1">set in detail view</div>}
        </div>
      </div>
      {item.learn && (
        <div className="px-4 pb-3">
          <TeachingNote id={item.learn} inline />
        </div>
      )}
    </div>
  );
}

/* ── one underlying line ──────────────────────────────────────────── */

function DetailLineRow({
  line,
  value,
  onChange,
  ctx,
  budget,
  budgetExhausted,
  onBudgetExceeded,
  readOnly,
}: {
  line: DetailLine;
  value: string;
  onChange: (v: string) => void;
  ctx: PreviewCtx;
  budget: Budget;
  budgetExhausted: boolean;
  onBudgetExceeded: () => void;
  readOnly?: boolean;
}) {
  const amount = num(value);
  const preview = (line.preview ? line.preview(amount, ctx) : []).filter(Boolean) as string[];
  const cap = line.cap ? line.cap(ctx) : null;
  const overCap = cap != null && amount > cap + 0.001;

  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-ink">{line.name}</div>
          <div className="text-xs font-mono text-dim mt-0.5">{line.formula}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-dim font-mono text-sm">₹</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={value}
            placeholder="0"
            readOnly={readOnly}
            disabled={budgetExhausted && num(value) === 0}
            onChange={(e) => {
              const newVal = e.target.value.replace(/^-/, "");
              if (num(newVal) > num(value) && budget.committed >= budget.ceiling) {
                onBudgetExceeded();
                return;
              }
              onChange(newVal);
            }}
            onKeyDown={(e) => spinnerKeyDown(e, { step: 0.5, min: 0, onChange: (v) => {
              if (num(v) > num(value) && budget.committed >= budget.ceiling) {
                onBudgetExceeded();
                return;
              }
              onChange(v);
            }})}
            className={
              "w-24 border px-2 py-1 text-right font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ink " +
              (overCap ? "border-danger text-tone-bad" : "border-line-2") +
              ((readOnly || (budgetExhausted && num(value) === 0)) ? " opacity-60 cursor-not-allowed" : "")
            }
          />
          <span className="text-xs uppercase tracking-widest text-dim w-10">lakh</span>
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {preview.map((p, i) => (
          <span key={i} className={"text-xs font-mono " + (i === 0 ? "text-tone-good" : "text-dim")}>
            {p}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── the screen ───────────────────────────────────────────────────── */

export function DepartmentScreen({
  id,
  s,
  alloc,
  setAlloc,
  ctx,
  budget,
  budgetExhausted,
  onBudgetExceeded,
  dirs,
  inbox,
  advanced,
  setAdvanced,
  readOnly,
  extraTop,
  extra,
}: {
  id: string;
  s: CompanyState;
  alloc: Alloc;
  setAlloc: (a: Alloc) => void;
  ctx: PreviewCtx;
  budget: Budget;
  budgetExhausted: boolean;
  onBudgetExceeded: () => void;
  dirs: Readiness[];
  inbox: InboxMessage[];
  advanced: boolean;
  setAdvanced: (v: boolean) => void;
  readOnly?: boolean;
  extraTop?: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const meta = SCREEN_META[id];
  const group = DECISION_GROUPS[id];
  const A = numericAlloc(alloc);
  const committedHere = group.items.reduce((sum, it) => sum + groupTotal(A, it), 0);
  const sources = SCREEN_INBOX_SOURCES[id] || [];
  const mine = inbox.filter((m) => sources.indexOf(m.from) >= 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow tone="text-tone-bad">{meta.label}</Eyebrow>
          <h2 className="font-serif text-3xl text-ink">{meta.question}</h2>
        </div>
        <div className="text-right">
          <Eyebrow>Committed here</Eyebrow>
          <div className="font-mono text-2xl">{lakh(committedHere)}</div>
        </div>
      </div>

      <ReadinessGrid dirs={dirs} only={meta.dirs} />
      <TeachingNote id={SCREEN_TEACHING_NOTE[id]} />

      {mine.length > 0 && (
        <Inbox messages={mine} eyebrow="From this function" title="What your team is telling you" />
      )}

      {extraTop}

      <div className="space-y-3">
        {group.items.map((item) => (
          <DecisionCard key={item.id} item={item} alloc={alloc} setAlloc={setAlloc} cash={s.cash} budget={budget} budgetExhausted={budgetExhausted} onBudgetExceeded={onBudgetExceeded} readOnly={readOnly} />
        ))}
      </div>

      {extra}

      <div className="border border-line bg-raise">
        <button
          onClick={() => setAdvanced(!advanced)}
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-raise"
        >
          <div>
            <Eyebrow>Detailed planning</Eyebrow>
            <div className="font-serif text-base text-ink">
              {advanced ? "Hide the underlying lines" : "Open the underlying lines and formulas"}
            </div>
          </div>
          <span className="font-mono text-sm text-dim">{advanced ? "−" : "+"}</span>
        </button>
        {advanced && (
          <div className="border-t border-line p-4">
            <p className="text-sm text-dim mb-3">
              Every published formula, exactly as the engine runs it. Editing here overrides the grouped decision above.
            </p>
            {(DETAIL_LINES_BY_SCREEN[id] || []).map((line) => (
              <DetailLineRow
                key={line.key}
                line={line}
                value={alloc[line.key]}
                ctx={ctx}
                budget={budget}
                budgetExhausted={budgetExhausted}
                onBudgetExceeded={onBudgetExceeded}
                readOnly={readOnly}
                onChange={(val) => setAlloc({ ...alloc, [line.key]: val })}
              />
            ))}
          </div>
        )}
      </div>

      <BudgetMeter budget={budget} />
    </div>
  );
}
