"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Landmark } from "lucide-react";
import { Action, Eyebrow } from "@/components/ui/Kit";
import { DEPARTMENTS, formatLakhs, formatInr, asNumber } from "@/lib/api/catalog";
import { useRun } from "@/components/run/RunProvider";

/** Screen: confirm then navigate to processing which calls POST …/lock. */
export function LockScreen({ quarterId }: { quarterId: string }) {
  const router = useRouter();
  const { href, run, quarter, can, allocatedLakhs } = useRun();
  const [armed, setArmed] = useState(false);

  const alloc = quarter?.allocations;
  const lines = alloc
    ? Object.entries(alloc).filter(
        ([k, v]) => k !== "warranty_years" && asNumber(v) > 0,
      )
    : [];

  const isCrisisQuarter =
    run?.crisis_quarter != null && run.crisis_quarter === run.current_quarter_number;
  const crisis = quarter?.crisis;
  const crisisChoice = crisis?.crisis_choice ?? null;
  const crisisLines = crisis
    ? Object.entries(crisis).filter(([k, v]) => k !== "crisis_choice" && asNumber(v) > 0)
    : [];

  // Calculate if locking would result in insufficient cash
  // This is a simplified check - the actual computation happens server-side
  const cashValidation = useMemo(() => {
    if (!quarter) return { hasIssue: false, message: "" };
    
    const cashBalance = asNumber(quarter.cash_balance);
    const totalAllocated = allocatedLakhs * 100_000; // Convert lakhs to rupees
    
    // Simple check: if allocated amount is close to or exceeds cash balance
    if (totalAllocated >= cashBalance) {
      return {
        hasIssue: true,
        message: `Total allocations (${formatInr(totalAllocated)}) are at or exceed available cash (${formatInr(cashBalance)}). This may result in negative cash after quarter execution.`
      };
    }
    
    // Warning if using > 95% of cash
    if (totalAllocated > cashBalance * 0.95) {
      return {
        hasIssue: true,
        message: `Total allocations (${formatInr(totalAllocated)}) use ${Math.round((totalAllocated / cashBalance) * 100)}% of available cash (${formatInr(cashBalance)}). Consider leaving buffer for fixed costs and operations.`
      };
    }
    
    return { hasIssue: false, message: "" };
  }, [quarter, allocatedLakhs]);

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow accent="teal">POST …/lock · irreversible compute</Eyebrow>
        <h1 className="display mt-3 text-[clamp(1.6rem,3.2vw,2.3rem)] text-ink">
          Lock Q{run?.current_quarter_number ?? "—"}
        </h1>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-dim">
          This is the single mutating action that runs the simulation engine.
          Unsubmitted lines stay at ₹0. The call is idempotent — locking again
          returns the same report.
        </p>
      </header>

      <div className="rounded-xl border border-line bg-raise/50 p-5">
        <p className="eyebrow text-faint">Submitted spend so far</p>
        {lines.length === 0 ? (
          <p className="mt-3 text-[13px] text-dim">
            No non-zero allocations yet — locking will run with all zeros
            (legal, inert).
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {lines.map(([key, val]) => (
              <li
                key={key}
                className="flex justify-between text-[12.5px] text-dim"
              >
                <span>{key}</span>
                <span className="num text-ink">{formatLakhs(val)}</span>
              </li>
            ))}
          </ul>
        )}
        {quarter?.warranty_years != null && quarter.warranty_years > 0 && (
          <p className="mt-3 text-[12.5px] text-dim">
            warranty_years:{" "}
            <span className="text-ink">{quarter.warranty_years}</span>
          </p>
        )}
      </div>

      {isCrisisQuarter && (
        <div className="rounded-xl border border-rose/30 bg-rose/[0.06] p-5">
          <p className="eyebrow text-rose">Crisis response · Q{run?.crisis_quarter}</p>
          {crisisLines.length === 0 && !crisisChoice ? (
            <p className="mt-3 text-[13px] text-dim">
              No crisis response submitted yet — this is legal, but the report will
              show a fired <span className="text-ink">crisis_ignored</span> modifier (−4).
            </p>
          ) : (
            <>
              <p className="mt-3 text-[12.5px] text-dim">
                crisis_choice:{" "}
                <span className="text-ink">{crisisChoice ? String(crisisChoice) : "null (ignored)"}</span>
              </p>
              {crisisLines.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {crisisLines.map(([key, val]) => (
                    <li key={key} className="flex justify-between text-[12.5px] text-dim">
                      <span>{key}</span>
                      <span className="num text-ink">{formatLakhs(val)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {cashValidation.hasIssue && (
        <div className="rounded-xl border border-amber/30 bg-amber/[0.07] p-4">
          <p className="text-[13.5px] font-medium text-amber">
            ⚠ Cash Flow Warning
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-dim">
            {cashValidation.message}
          </p>
          <p className="mt-2 text-[12px] text-faint">
            You may need to reduce allocations to ensure positive cash balance after quarter execution.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {DEPARTMENTS.map((d) => (
          <Action
            key={d.id}
            variant="ghost"
            href={href(`/quarter/${quarterId}/allocate/${d.id}`)}
          >
            Edit {d.name}
          </Action>
        ))}
        {isCrisisQuarter && (
          <Action variant="ghost" href={href(`/quarter/${quarterId}/crisis`)}>
            Edit Crisis response
          </Action>
        )}
      </div>

      {!armed ? (
        <Action
          onClick={() => setArmed(true)}
          disabled={!can("lock_quarter")}
        >
          <Landmark className="h-4 w-4" />
          Confirm lock
        </Action>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Action variant="outline" onClick={() => setArmed(false)}>
            Back
          </Action>
          <Action
            onClick={() =>
              router.push(
                href(`/quarter/${quarterId}/processing`),
              )
            }
          >
            Lock quarter — run the engine
          </Action>
        </div>
      )}

      {!can("lock_quarter") && (
        <p className="text-[13px] text-amber">
          lock_quarter is not in legal_moves — the quarter may already be
          closed, or no quarter is open.
        </p>
      )}
    </div>
  );
}
