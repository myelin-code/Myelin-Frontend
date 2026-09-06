"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api/client";
import {
  asNumber,
  CRISIS_CHOICES,
  CRISIS_FIELDS,
  DEPARTMENTS,
  formatInr,
  formatLakhs,
  type DeptId,
} from "@/lib/api/catalog";
import { ApiError } from "@/lib/api/types";
import type {
  CrisisBriefingResponse,
  CrisisChoice,
  QuarterAllocationResponse,
} from "@/lib/api/types";
import { accentVar } from "@/components/ui/Kit";
import { Action } from "@/components/ui/Kit";
import { useRun } from "@/components/run/RunProvider";
import { SpendDial } from "@/components/run/SpendDial";
import { SpendSplit } from "@/components/run/SpendSplit";
import { SpendColumns } from "@/components/run/SpendColumns";
import { useAutosave, type SaveStatus } from "@/components/run/useAutosave";

type SpendMap = Record<string, number>;

function emptySpend(keys: string[]): SpendMap {
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

/** Reads either a fresh submit response or `quarter.allocations` -- both are a flat
 *  field-name -> Money map for the same 22 columns, just typed differently. */
function fromAlloc(
  alloc: Record<string, unknown> | null | undefined,
  keys: string[],
): SpendMap {
  if (!alloc) return emptySpend(keys);
  const out: SpendMap = {};
  for (const k of keys) {
    out[k] = asNumber(alloc[k] as string | number | undefined);
  }
  return out;
}

export function AllocationWorkspace({ deptId }: { deptId: DeptId }) {
  const { companyId, href, run, quarter, can, setAllocations, refresh, financeUnlocked, allocatedLakhs } =
    useRun();
  const catalog = DEPARTMENTS.find((d) => d.id === deptId)!;
  const keys = catalog.fields.map((f) => f.key);
  // Seeded from `quarter.allocations` so reopening a department after saving elsewhere shows
  // what's actually on the server instead of resetting every field to ₹0.
  const [spend, setSpend] = useState<SpendMap>(() =>
    fromAlloc(quarter?.allocations, keys),
  );
  const [warranty, setWarranty] = useState(() => quarter?.warranty_years ?? 0);
  const color = accentVar[catalog.accent];
  const enabled = can("submit_allocation");
  const quarterId = run?.current_quarter_id;
  const locked = deptId !== "finance_admin" && !financeUnlocked;

  // What every *other* department already has saved (server truth). `allocatedLakhs` covers all
  // six, so subtracting this department's persisted total leaves the five this form isn't
  // editing -- this department's own figures are counted live from `spend` instead, or a
  // just-saved amount would be charged to the budget twice.
  const persistedDeptTotal = keys.reduce(
    (s, k) => s + asNumber(quarter?.allocations?.[k]),
    0,
  );
  const cashLakhs = asNumber(quarter?.cash_balance) / 100_000;
  const otherDeptsLakhs = allocatedLakhs - persistedDeptTotal;
  // What this department may still commit. Clamped at 0: the other five can already have
  // committed more than the quarter's cash (the API allows it -- insolvency is a real move),
  // and a negative budget would make every slider jump backwards instead of simply refusing.
  const deptBudgetLakhs = Math.max(0, cashLakhs - otherDeptsLakhs);

  // Headroom for one line = the department's budget minus every *other* line in it, so raising
  // one line stops exactly where the quarter's cash runs out rather than borrowing from a
  // sibling's saved value. Read both by `setField` (which enforces it) and by the controls
  // (which show it).
  const headroomFor = (key: string, from: SpendMap = spend) =>
    Math.max(
      0,
      deptBudgetLakhs - keys.reduce((s, k) => (k === key ? s : s + (from[k] ?? 0)), 0),
    );

  const setField = (key: string, value: number) => {
    setSpend((prev) => ({
      ...prev,
      [key]: Math.min(Math.max(0, value), headroomFor(key, prev)),
    }));
  };

  // One payload object covering every control on the form -- the dials, the split rows, the
  // columns and R&D's warranty choice all land here, so autosave is driven by *what the form
  // holds*, not by remembering to call a save from each control's handler.
  const payload = useMemo(
    () => (catalog.warranty ? { ...spend, warranty_years: warranty } : { ...spend }),
    [spend, warranty, catalog.warranty],
  );

  // Takes the figures to save as an argument rather than reading `spend`/`warranty` off the
  // closure: autosave hands it the value it captured at request time, which is the one thing
  // that keeps a debounced write from persisting a stale render's numbers.
  async function persist(body: SpendMap) {
    if (!quarterId) throw new Error("No open quarter");
    
    // Validate that there's budget available before attempting to save
    if (deptBudgetLakhs <= 0) {
      throw new Error(
        "Insufficient cash. You cannot allocate any money when available cash is ₹0."
      );
    }
    
    // Validate that the submission doesn't exceed available budget
    const submissionTotal = Object.values(body).reduce((a, b) => a + (b || 0), 0);
    if (submissionTotal > deptBudgetLakhs) {
      throw new Error(
        `Total allocation (₹${formatLakhs(submissionTotal)}) exceeds available budget (₹${formatLakhs(deptBudgetLakhs)}). ` +
        `Reduce allocations by ₹${formatLakhs(submissionTotal - deptBudgetLakhs)}.`
      );
    }
    
    let res: QuarterAllocationResponse;
    try {
      switch (deptId) {
        case "marketing":
          res = await api.submitMarketing(companyId, quarterId, body);
          break;
        case "sales":
          res = await api.submitSales(companyId, quarterId, body);
          break;
        case "rnd":
          res = await api.submitRnd(companyId, quarterId, {
            ...body,
            warranty_years: body.warranty_years ?? 0,
          });
          break;
        case "operations":
          res = await api.submitOperations(companyId, quarterId, body);
          break;
        case "hr":
          res = await api.submitHr(companyId, quarterId, body);
          break;
        case "finance_admin":
          res = await api.submitFinanceAdmin(companyId, quarterId, body);
          break;
      }
    } catch (err) {
      // The API's own explanation ("quarter is locked", a validation message) is worth showing;
      // a transport failure is not, and "Failed to fetch" would be the only technical string
      // left on this screen.
      throw new Error(
        err instanceof ApiError ? err.message : "Couldn't reach the server",
      );
    }
    setAllocations(res);
    // Deliberately *not* writing the response back over `spend`: with no Save button the user is
    // quite likely mid-keystroke on the next line when this lands, and echoing the server's copy
    // of the figures into the fields would undo that edit. The response carries the numbers we
    // just sent, so there is nothing to gain by it.
    // `refresh()` still runs, so the KPI bar, the remaining-cash figure and the nav's
    // finance-unlocked gate all reflect the save that just happened.
    await refresh();
  }

  const {
    status: saveStatus,
    error: saveError,
    retry,
  } = useAutosave({
    value: payload,
    enabled: Boolean(quarterId) && enabled,
    save: persist,
  });

  const total = Object.values(spend).reduce((a, b) => a + b, 0);
  const projectedRemaining = (cashLakhs - otherDeptsLakhs - total) * 100_000;
  // Share of this department's own headroom, not of the whole quarter -- the meter sits under
  // this form's fields, so it answers "how much of what I can still spend have I spent".
  const usedPct =
    deptBudgetLakhs > 0
      ? Math.min(100, (total / deptBudgetLakhs) * 100)
      : 100;
  const atCap = deptBudgetLakhs > 0 && total >= deptBudgetLakhs - 0.0001;

  if (locked) {
    return (
      <div className="space-y-5">
        <header>
          <p className="eyebrow" style={{ color }}>
            {catalog.owner}
          </p>
          <h2 className="display mt-2 text-[28px] text-ink">{catalog.name}</h2>
          <p className="mt-1 text-[13.5px] text-dim">{catalog.tagline}</p>
        </header>
        <div className="rounded-xl border border-amber/30 bg-amber/[0.07] p-5">
          <p className="text-[13.5px] font-medium text-amber">
            Set your Finance & Admin plan first
          </p>
          <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-dim">
            Every other department is spent against the cash picture Finance &
            Admin establishes for the quarter. Enter that allocation — it saves
            itself — and this and the remaining departments unlock.
          </p>
          <Action
            className="mt-4"
            href={
              quarterId
                ? href(`/quarter/${quarterId}/allocate/finance_admin`)
                : "#"
            }
          >
            Go to Finance & Admin
          </Action>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow" style={{ color }}>
          {catalog.owner}
        </p>
        <h2 className="display mt-2 text-[28px] text-ink">{catalog.name}</h2>
        <p className="mt-1 text-[13.5px] text-dim">{catalog.tagline}</p>
      </header>

      <div className="rounded-xl border border-line bg-raise/50 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow text-faint">Budget available to this department</p>
          <p className="num text-[13px] text-ink">
            {formatLakhs(total)} <span className="text-faint">/ {formatLakhs(deptBudgetLakhs)}</span>
          </p>
        </div>
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line/60"
          role="progressbar"
          aria-valuenow={Math.round(usedPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Share of this department's budget allocated"
        >
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{ width: `${usedPct}%`, background: atCap ? "var(--amber)" : color }}
          />
        </div>
        <p className={`num mt-2 text-[12px] ${atCap ? "text-amber" : "text-faint"}`}>
          {atCap
            ? "Fully committed — lower another line here to raise this one"
            : `Cash remaining after this department · ${formatInr(projectedRemaining)}`}
        </p>
        {otherDeptsLakhs > 0 && (
          <p className="num mt-1 text-[12px] text-faint">
            Other departments hold {formatLakhs(otherDeptsLakhs)} of the quarter&apos;s{" "}
            {formatLakhs(cashLakhs)}
          </p>
        )}
      </div>

      {!enabled && (
        <p className="rounded-xl border border-amber/30 bg-amber/[0.07] px-4 py-3 text-[13px] text-amber">
          submit_allocation is not in legal_moves right now — open a quarter first,
          or the quarter may already be locked.
        </p>
      )}

      {catalog.input === "dial" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog.fields.map((field) => (
            <SpendDial
              key={field.key}
              label={field.label}
              hint={field.hint}
              value={spend[field.key] ?? 0}
              color={color}
              disabled={!enabled}
              // The same headroom `setField` enforces, handed to the control so it can enforce
              // it visibly -- the + button greys out at the cap instead of quietly doing
              // nothing, and a typed figure lands on the ceiling rather than being swallowed.
              max={headroomFor(field.key)}
              onChange={(v) => setField(field.key, v)}
            />
          ))}
        </div>
      )}

      {catalog.input === "split" && (
        <SpendSplit
          color={color}
          disabled={!enabled}
          onChange={setField}
          lines={catalog.fields.map((f) => ({
            key: f.key,
            label: f.label,
            hint: f.hint,
            value: spend[f.key] ?? 0,
          }))}
        />
      )}

      {catalog.input === "columns" && (
        <SpendColumns
          color={color}
          disabled={!enabled}
          onChange={setField}
          lines={catalog.fields.map((f) => ({
            key: f.key,
            label: f.label,
            hint: f.hint,
            value: spend[f.key] ?? 0,
          }))}
        />
      )}

      {catalog.warranty && (
        <div className="rounded-xl border border-line bg-raise/50 p-4">
          <p className="eyebrow text-faint">warranty_years · strategic choice</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((y) => (
              <button
                key={y}
                type="button"
                disabled={!enabled}
                onClick={() => setWarranty(y)}
                className="rounded-full border px-4 py-2 text-[13px]"
                style={{
                  borderColor:
                    warranty === y
                      ? `color-mix(in srgb, ${color} 55%, transparent)`
                      : "var(--line)",
                  background:
                    warranty === y
                      ? `color-mix(in srgb, ${color} 14%, transparent)`
                      : "transparent",
                  color: warranty === y ? "var(--ink)" : "var(--dim)",
                }}
              >
                {y === 0 ? "None" : `${y} year${y > 1 ? "s" : ""}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {saveStatus === "error" && (
        <p className="rounded-xl border border-rose/30 bg-rose/[0.07] px-4 py-3 text-[13px] text-rose">
          {saveError ?? "Could not save this allocation."} Your figures are still on screen —
          change anything, or use Retry, to send them again.
        </p>
      )}

      {enabled && (
        <AutosaveStatus status={saveStatus} onRetry={retry} />
      )}
    </div>
  );
}

/**
 * The whole action area, now that there is no Save button: allocations persist on their own, so
 * this reports *state* rather than offering work. Retry is the one thing still worth a button --
 * a failed save is the only case where the user has something to do.
 */
function AutosaveStatus({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <div className="flex items-center gap-3" role="status" aria-live="polite">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-rose">
          <TriangleAlert className="h-3.5 w-3.5" />
          Save failed
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-line px-3 py-1 text-[12px] text-dim transition-colors hover:border-line-2 hover:text-ink"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <p
      className="flex items-center gap-1.5 text-[13px] text-faint"
      role="status"
      aria-live="polite"
    >
      {status === "saving" ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Saving…
        </>
      ) : status === "saved" ? (
        <>
          <Check className="h-3.5 w-3.5 text-teal" />
          Saved
        </>
      ) : (
        "Changes save automatically"
      )}
    </p>
  );
}

export function CrisisWorkspace() {
  const { companyId, run, can, setAllocations, refresh } = useRun();
  const enabled = can("submit_crisis_allocation");
  const quarterId = run?.current_quarter_id;
  const [briefing, setBriefing] = useState<CrisisBriefingResponse | null>(null);
  const [briefingLoaded, setBriefingLoaded] = useState(false);
  const [choice, setChoice] = useState<CrisisChoice | null>(null);
  const [spend, setSpend] = useState<SpendMap>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The briefing decides which spend lines and Strategic Choices this scenario actually
  // responds to. Each event's recovery formulas read only a subset of the five crisis fields --
  // Feature Leapfrog reads exactly one -- so rendering all five to everyone invites a student to
  // spend their whole response budget on lines that do nothing. If the briefing can't be read we
  // fall back to the full generic form rather than blocking the response.
  useEffect(() => {
    if (!quarterId) return;
    let cancelled = false;
    void api
      .getCrisisBriefing(companyId, quarterId)
      .then((b) => {
        if (!cancelled) setBriefing(b);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setBriefingLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, quarterId]);

  const fields: { key: string; label: string; hint?: string }[] = briefing
    ? briefing.response_lines.map((line) => ({ key: line.field, label: line.label }))
    : CRISIS_FIELDS;
  const choices: { code: string; label: string; effect?: string }[] = briefing
    ? briefing.choices.map((c) => ({ code: c.code as string, label: c.label, effect: c.effect }))
    : CRISIS_CHOICES.map((c) => ({ code: c.id as string, label: c.label }));

  async function submit() {
    if (!quarterId || !enabled) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.submitCrisis(companyId, quarterId, {
        crisis_choice: choice,
        ...spend,
      });
      setAllocations(res);
      setSaved(true);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Crisis submit failed");
    } finally {
      setSaving(false);
    }
  }

  const total = Object.values(spend).reduce((a, b) => a + b, 0);
  const selected = choices.find((c) => c.code === choice);

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow text-rose">
          Crisis quarter · Q{run?.crisis_quarter ?? "?"}
          {briefing ? ` · ${briefing.category}` : ""}
        </p>
        <h2 className="display mt-2 text-[28px] text-ink">
          {briefing ? briefing.title : "Crisis response"}
        </h2>
        {briefing ? (
          <>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-dim">
              {briefing.narrative}
            </p>
            <p className="mt-3 max-w-2xl text-[12.5px] leading-relaxed text-faint">
              Only the lines below feed this event&apos;s recovery -- the other crisis fields do
              nothing here. How much to spend is yours to judge from your own results.
            </p>
          </>
        ) : (
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-dim">
            {briefingLoaded
              ? "The briefing is unavailable right now, so every response line is shown below."
              : "Loading the briefing…"}
          </p>
        )}
      </header>

      {!enabled && (
        <p className="rounded-xl border border-amber/30 bg-amber/[0.07] px-4 py-3 text-[13px] text-amber">
          submit_crisis_allocation is only legal in the crisis quarter.
        </p>
      )}

      <div>
        <p className="eyebrow text-faint">Strategic choice · optional</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!enabled}
            onClick={() => setChoice(null)}
            className="rounded-full border px-4 py-2 text-[13px] disabled:opacity-40"
            style={{
              borderColor: choice === null ? "var(--rose)" : "var(--line)",
              background:
                choice === null
                  ? "color-mix(in srgb, var(--rose) 14%, transparent)"
                  : "transparent",
              color: choice === null ? "var(--ink)" : "var(--dim)",
            }}
          >
            Do nothing
          </button>
          {choices.map((c) => (
            <button
              key={c.code}
              type="button"
              disabled={!enabled}
              onClick={() => setChoice(c.code as CrisisChoice)}
              className="rounded-full border px-4 py-2 text-[13px] disabled:opacity-40"
              style={{
                borderColor: choice === c.code ? "var(--rose)" : "var(--line)",
                background:
                  choice === c.code
                    ? "color-mix(in srgb, var(--rose) 14%, transparent)"
                    : "transparent",
                color: choice === c.code ? "var(--ink)" : "var(--dim)",
              }}
            >
              {c.code} · {c.label}
            </button>
          ))}
        </div>
        {selected?.effect && (
          <p className="mt-3 max-w-2xl rounded-xl border border-line bg-raise/40 px-4 py-3 text-[12.5px] leading-relaxed text-dim">
            {selected.effect}
          </p>
        )}
        <p className="mt-2 text-[12px] text-faint">
          Doing nothing is a legal response -- it is simply penalised.
        </p>
      </div>

      <div>
        <p className="eyebrow text-faint">
          Response lines{briefing ? " that matter here" : ""} · {formatLakhs(total)}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <SpendDial
              key={field.key}
              label={field.label}
              hint={field.hint}
              value={spend[field.key] ?? 0}
              color="var(--rose)"
              disabled={!enabled}
              onChange={(v) => setSpend((p) => ({ ...p, [field.key]: v }))}
            />
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose/30 bg-rose/[0.07] px-4 py-3 text-[13px] text-rose">
          {error}
        </p>
      )}

      <Action onClick={submit} disabled={!enabled || saving}>
        {saving ? "Saving…" : saved ? "Saved — upsert again anytime" : "Save crisis allocation"}
        {saved && <Check className="h-4 w-4" />}
      </Action>
    </div>
  );
}
