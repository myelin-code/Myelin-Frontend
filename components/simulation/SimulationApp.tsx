"use client";

/**
 * Nadi Wear — four quarters, computed by the backend.
 *
 * The simulation engine lives in `MyElin-Backend/app/engines/simulation/`. This component holds the
 * plan the CEO is building and nothing else: every number on every screen comes from the
 * server.
 *
 *   `preview`  runs the draft plan and returns the whole chain -- readiness, the binding gate,
 *              the directors' evidence, the budget -- without persisting anything. Debounced,
 *              so typing into a spend box stays responsive while the figures stay the API's.
 *   `lock`     commits and scores the quarter.
 *
 * That split is the point: the screens can show pressure while the CEO decides without ever
 * leaking the revenue, and what they were shown before committing is computed by the same
 * engine that grades them afterwards, so the two can never disagree.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Pause, Play, Clock, AlertTriangle, RotateCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogOut, PanelLeftOpen, X } from "lucide-react";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { useRun } from "@/components/run/RunProvider";
import { SimulationLeaderboardModal } from "@/components/simulation/SimulationLeaderboard";
import { useRewindSFX } from "@/lib/simulation/use-rewind-sfx";
import { forgetRunIndex, runHref } from "@/lib/run/ref";

// Clean company name by removing email suffix (e.g., "dengey · email" -> "dengey")
function cleanCompanyName(name: string): string {
  const parts = name.split(" · ");
  return parts[0] || name;
}
import {
  ARCHETYPES,
  DECISION_GROUPS,
  DEPARTMENTS,
  INITIAL_STATE,
  INNOVATION_BY_ID,
  PRIORITY_BY_ID,
  SCREEN_META,
  emptyAlloc,
  numericAlloc,
  opexLakh,
  capexLakh,
} from "@/lib/simulation/constants";
import { inr, num } from "@/lib/simulation/format";
import {
  playProcessing,
  playQuarterClosed,
  setSoundEnabled,
  soundEnabled,
  soundEnabledOnServer,
  stopProcessing,
  subscribeSound,
} from "@/lib/sound";
import {
  bindingConstraint,
  boardAsks,
  changesSince,
  companyHealth,
  inbox as buildInbox,
  readiness,
  tickerItems,
} from "@/lib/simulation/insights";
import { simulationApi } from "@/lib/simulation/remote";
import type {
  Budget as RemoteBudget,
  CrisisBriefing,
  QuarterPlan,
  QuarterScore,
} from "@/lib/simulation/remote";
import { Ticker, TeachingContext } from "@/components/simulation/Kit";
import {
  InlineLoading,
  PageLoading,
  ProcessingOverlay,
} from "@/components/ui/Loading";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { useSimulationTimer } from "@/lib/simulation/timer";
import { DepartmentScreen } from "@/components/simulation/Decisions";
import {
  FinancePanel,
  InnovationBoard,
  PeoplePanel,
  ProductFocus,
  ProductPortfolio,
  WarrantyPanel,
} from "@/components/simulation/Panels";
import { IntroScreen } from "@/components/simulation/screens/Intro";
import { BriefingScreen } from "@/components/simulation/screens/Briefing";
import { DashboardScreen } from "@/components/simulation/screens/Dashboard";
import { CrisisScreen } from "@/components/simulation/screens/Crisis";
import { ReviewScreen } from "@/components/simulation/screens/Review";
import { ClosedScreen } from "@/components/simulation/screens/Closed";
import { TermSheetScreen } from "@/components/simulation/screens/TermSheet";
import { FinalScreen } from "@/components/simulation/screens/Final";
import { PrinciplesScreen } from "@/components/simulation/screens/Principles";
import { BalanceSheetScreen } from "@/components/simulation/screens/BalanceSheetScreen";
import { SectionNav } from "@/components/simulation/SectionNav";
import { RewindModal } from "@/components/simulation/RewindModal";
import { BudgetExhaustedModal } from "@/components/simulation/BudgetExhaustedModal";
import { RewindPreloader } from "@/components/simulation/RewindPreloader";
import type {
  Alloc,
  ArchetypeId,
  CompanyState,
  CrisisInput,
  PayTermsId,
  PriorityId,
  ProductId,
  ProductState,
  QuarterResultShape,
  Reflection,
  TermSheet,
  WarrantyId,
} from "@/lib/simulation/types";

type Phase = "intro" | "briefing" | "play" | "closed" | "termsheet" | "final";

/**
 * A named, multi-second wait the CEO is shown by name.
 *
 * `dismiss` is the label on the way out of the *failed* version of this wait -- it says where
 * the reader lands if the engine refuses, which is always the screen they submitted from.
 */
type Working = { title: string; message: string; dismiss: string };

/** The section the quarter is actually committed from -- the last one in the rail. */
const CLOSURE_TAB = "review";

/** Screen ids the sidebar can deep-link to. Anything else falls back to the dashboard. */
export const SIMULATION_TABS = [
  { id: "dashboard", label: "Company" },
  { id: "crisis", label: "Market event" },
  { id: "marketing", label: "Marketing" },
  { id: "sales", label: "Sales" },
  { id: "rnd", label: "Product" },
  { id: "ops", label: "Operations" },
  { id: "hr", label: "People" },
  { id: "finance", label: "Finance" },
  { id: "balance", label: "Balance sheet" },
  { id: "learning", label: "Principles" },
  { id: "review", label: "Close the quarter" },
] as const;

const emptyCrisis = (): CrisisInput => ({
  diagnosis: null,
  reasoning: "",
  strategy: null,
  commit: "",
});

/**
 * Where an in-progress quarter's draft is kept.
 *
 * Only the *unlocked* quarter is ever stored, keyed by company and quarter number, so opening
 * the next quarter starts clean without anything to clear. A locked quarter's decisions live on
 * the server, which is the record that matters; this is purely so a reload, a sidebar
 * deep-link or a closed laptop does not throw away numbers the CEO has already typed in.
 */
const draftKey = (companyId: string, quarter: number) =>
  `simulation.draft.${companyId}.q${quarter}`;

type Draft = {
  lines: Alloc;
  warranty: WarrantyId;
  payTerms: PayTermsId;
  startInno: string[];
  products: Record<ProductId, ProductState> | null;
  priority: PriorityId | null;
  reflection: Reflection;
  crisis: CrisisInput;
};

function readDraft(companyId: string, quarter: number): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(companyId, quarter));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

/**
 * The simulation's own content column. It runs inside `RunShell`'s `main`, to the right of the
 * 268px rail, so it carries the same gutter and the same 1440px ceiling as the shell's other
 * screens -- otherwise the review and year-end screens sit in a narrower column than the report
 * they are read next to, with the header's rules running past them on both sides.
 */
/* The shell's one horizontal grid.

   SHELL caps the rail and the document together rather than capping the
   document alone. Capping the document meant its width was measured against a
   container that changes size with the rail, so on a wide screen collapsing the
   rail pushed the column back into `mx-auto` centring and pulled its right edge
   *inward* -- the opposite of what collapsing is for. Capping the pair pins the
   right edge, so toggling only ever moves the left one, by exactly the rail's
   width.

   COLUMN is therefore gutter only: no max-width and no centring of its own, or
   it would reintroduce the same drift one level down. Every band inside the
   document (header, main, footer) uses it, so they share one left rule. */
const RAIL_W = 220;
const SHELL = "mx-auto w-full max-w-[1660px]"; // 1440 document + 220 rail
const COLUMN = "w-full px-4 sm:px-6 lg:px-8";

/* Whether the department rail is open, kept in localStorage so it survives a reload.
   Read through `useSyncExternalStore` rather than an effect: the server has no storage to
   read, and this is exactly the "external value that must not desync from hydration" case
   the hook exists for. */
const NAV_STORAGE_KEY = "myelin_sim_nav_open";

const navListeners = new Set<() => void>();

const subscribeNav = (fn: () => void) => {
  navListeners.add(fn);
  return () => {
    navListeners.delete(fn);
  };
};

function readNavOpen() {
  try {
    return window.localStorage.getItem(NAV_STORAGE_KEY) !== "0";
  } catch {
    /* private browsing -- the toggle still works, it just won't be remembered. */
    return true;
  }
}

function writeNavOpen(next: boolean) {
  try {
    window.localStorage.setItem(NAV_STORAGE_KEY, next ? "1" : "0");
  } catch {
    /* see above */
  }
  navListeners.forEach((fn) => fn());
}

function CompanyNameEditor({
  name,
  onSave,
}: {
  name: string;
  onSave: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(name);
          setEditing(true);
        }}
        className="group truncate font-serif text-xl cursor-text hover:text-white/80 transition-colors"
        title="Click to rename"
      >
        {name}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      onSave(trimmed);
    } else {
      setDraft(name);
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      maxLength={32}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(name);
          setEditing(false);
        }
      }}
      className="font-serif text-xl bg-transparent border-b border-white/40 outline-none text-white px-0 py-0 min-w-[4rem] max-w-[16rem]"
    />
  );
}

const EMPTY_BUDGET: RemoteBudget = {
  opex: 0,
  capex: 0,
  inno: 0,
  people: 0,
  repay: 0,
  drawn: 0,
  investment: 0,
  committed: 0,
  ceiling: 0,
};

export function SimulationApp() {
  const { companyId, company } = useRun();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /* ── what the server says ─────────────────────────────────────── */

  const [state, setState] = useState<CompanyState>(INITIAL_STATE);
  const [history, setHistory] = useState<QuarterResultShape[]>([]);
  const [scores, setScores] = useState<QuarterScore[]>([]);
  const [briefing, setBriefing] = useState<CrisisBriefing | null>(null);
  const [runStatus, setRunStatus] = useState<"active" | "distressed" | "failed" | "completed">("active");
  const [rewindsUsed, setRewindsUsed] = useState(0);

  /* ── the plan being built ─────────────────────────────────────── */

  const [alloc, setAlloc] = useState<Alloc>(emptyAlloc);
  const [warranty, setWarranty] = useState<WarrantyId>("6mo");
  const [payTerms, setPayTerms] = useState<PayTermsId>("net30");
  const [startInno, setStartInno] = useState<string[]>([]);
  const [products, setProducts] = useState<Record<ProductId, ProductState>>(
    INITIAL_STATE.products,
  );
  const [priority, setPriority] = useState<PriorityId | null>(null);
  const [reflection, setReflection] = useState<Reflection>({ sacrifice: [] });
  const [crisis, setCrisis] = useState<CrisisInput>(emptyCrisis);
  const [priorities, setPriorities] = useState<(PriorityId | null)[]>([]);

  /* ── what the preview returned for it ─────────────────────────── */

  const [projection, setProjection] = useState<QuarterResultShape | null>(null);
  const [budget, setBudget] = useState<RemoteBudget>(EMPTY_BUDGET);
  const [commitReading, setCommitReading] = useState<{
    band: string;
    strain: string;
    line: string;
    trade: string;
  } | null>(null);

  /* ── chrome and lifecycle ─────────────────────────────────────── */

  const [phase, setPhase] = useState<Phase>("intro");
  const [advanced, setAdvanced] = useState(true);
  const [notesOn, setNotesOn] = useState(true);
  const [companyName, setCompanyName] = useState<string>("Nadi Wear");
  // `localStorage` is the store here, not component state: reading it during render would
  // differ between server and client and trip hydration, and mirroring it into `useState`
  // would mean a second render for a value that was already known.
  const soundOn = useSyncExternalStore(
    subscribeSound,
    soundEnabled,
    soundEnabledOnServer,
  );
  const [ts, setTs] = useState<TermSheet | null>(null);
  const [endgameOutcome, setEndgameOutcome] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [closed, setClosed] = useState<{
    result: QuarterResultShape;
    score: QuarterScore;
  } | null>(null);

  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ── timer ──────────────────────────────────────────────────────── */

  const timer = useSimulationTimer(companyId, state.quarter);
  const readOnly = timer.paused || timer.expired;
  const timerActive =
    (phase === "briefing" || phase === "play") && runStatus !== "completed" && runStatus !== "failed";

  /**
   * Whether the user has dismissed the "Time Limit Reached" popup.
   *
   * Dismissing hides the popup and reveals the play surface in read-only mode, letting the
   * CEO navigate between sections and review all previously-entered values. It does NOT
   * restore editing: `readOnly` stays true because `timer.expired` stays true. The dismissed
   * flag is ephemeral (session only) — a page refresh shows the popup again, but the
   * simulation remains read-only because the localStorage-backed timer still reads `expired`.
   */
  const [timerExpiredDismissed, setTimerExpiredDismissed] = useState(false);

  /**
   * When the timer has expired and the popup is dismissed, the CEO enters review mode.
   * `reviewQuarter` is the 1-based quarter number they are currently viewing (null = the
   * live play surface for the current quarter, which is already read-only). Switching quarter
   * shows the read-only ClosedScreen for that historical quarter without re-running anything.
   */
  const [reviewQuarter, setReviewQuarter] = useState<number | null>(null);

  /* ── rewind ────────────────────────────────────────────────────── */
  const MAX_REWINDS = 2;
  const rewindsRemaining = MAX_REWINDS - rewindsUsed;
  const [rewindModalOpen, setRewindModalOpen] = useState(false);
  const [rewindBusy, setRewindBusy] = useState(false);
  const rewindSFX = useRewindSFX();
  // Stable ref so handleRewind (a useCallback) can call start/stop without
  // listing rewindSFX in its dependency array (the object changes every render).
  const rewindSFXRef = useRef(rewindSFX);
  rewindSFXRef.current = rewindSFX;
  /**
   * Set to a quarter number while the 3-second preloader is running, null otherwise.
   * Drives the RewindPreloader overlay; the actual API call fires when the preloader
   * calls its onComplete callback.
   */
  const [rewindTargetQuarter, setRewindTargetQuarter] = useState<number | null>(
    null,
  );

  const [budgetExhaustedModalOpen, setBudgetExhaustedModalOpen] = useState(false);
  const handleBudgetExceeded = useCallback(() => {
    setBudgetExhaustedModalOpen(true);
  }, []);

  /* Read-only wrappers: when the simulation is paused or expired, every setter becomes a no-op
     so no value can be changed through any code path. */
  const guardAlloc = useCallback(
    (a: Alloc) => {
      if (!readOnly) setAlloc(a);
    },
    [readOnly],
  );
  const guardSetWarranty = useCallback(
    (w: WarrantyId) => {
      if (!readOnly) setWarranty(w);
    },
    [readOnly],
  );
  const guardSetPayTerms = useCallback(
    (p: PayTermsId) => {
      if (!readOnly) setPayTerms(p);
    },
    [readOnly],
  );
  const guardSetStartInno = useCallback(
    (s: string[]) => {
      if (!readOnly) setStartInno(s);
    },
    [readOnly],
  );
  const guardSetProducts = useCallback(
    (p: Record<ProductId, ProductState>) => {
      if (!readOnly) setProducts(p);
    },
    [readOnly],
  );
  const guardSetPriority = useCallback(
    (p: PriorityId | null) => {
      if (!readOnly) setPriority(p);
    },
    [readOnly],
  );
  const guardSetReflection = useCallback(
    (r: Reflection) => {
      if (!readOnly) setReflection(r);
    },
    [readOnly],
  );
  const guardSetCrisis = useCallback(
    (c: CrisisInput) => {
      if (!readOnly) setCrisis(c);
    },
    [readOnly],
  );

  // Live budget tracking: computes committed spend instantly from current React state
  const localCommitted = useMemo(() => {
    const opex = opexLakh(numericAlloc(alloc)) * 1e5;
    const capex = capexLakh(numericAlloc(alloc)) * 1e5;
    const inno = startInno.reduce((sum, id) => sum + (INNOVATION_BY_ID[id]?.cost || 0), 0);
    const people = DEPARTMENTS.reduce((sum, d) => {
      const hire = Math.round(num(alloc["hire_" + d.id]));
      const fire = Math.round(num(alloc["fire_" + d.id]));
      return sum + hire * d.hire + fire * d.sever;
    }, 0);
    const repay = num(alloc.repay) * 1e5;
    const crisisCommit = num(crisis?.commit || "0") * 1e5;
    return opex + capex + inno + people + repay + crisisCommit;
  }, [alloc, startInno, crisis]);

  const budgetRemaining = budget.ceiling - localCommitted;
  // Budget ceiling is 0 until the first preview loads, which means budgetRemaining is
  // negative and budgetExhausted is true — disabling inputs before the CEO has even
  // started typing. Only consider the budget exhausted when the ceiling is actually loaded.
  const budgetExhausted = budget.ceiling > 0 && budgetRemaining <= 0;

  /**
   * The named wait, when there is one.
   *
   * `busy` says a request is open, which is enough to disable a button. It is not enough for
   * closing a quarter: that is a multi-second scoring run whose result is a whole new screen,
   * so it gets an overlay that says which quarter is being processed and stays put -- switching
   * to its own error state -- if the engine refuses. Nothing else on the surface changes while
   * it is up, so a failure returns the CEO to exactly the review they submitted.
   */
  const [working, setWorking] = useState<Working | null>(null);
  /** True for the entire quarter-close window (API call + 5 s delay).
   *  Kept separate from `phase` so `setPhase("closed")` can fire immediately
   *  (auto-save guard) while the cinematic loader stays visible for the full 5 s. */
  const [processingOverlay, setProcessingOverlay] = useState(false);
  /** Quarter number captured at the moment Close Quarter is clicked.
   *  `state.quarter` advances after `setState(locked.nextState)`, so reading it
   *  at render time would show the NEXT quarter's number in the loader. */
  const [closingQuarter, setClosingQuarter] = useState(1);

  /* `busy` is state, so two clicks landing in the same tick would both read `false`. The
     buttons are disabled on `busy` and that is what normally prevents it, but a lock is the one
     request that must never be sent twice -- a duplicate would score the quarter again -- so it
     is also guarded by a ref, which updates synchronously. */
  const inFlight = useRef(false);

  /* Nav visibility. Desktop and mobile are tracked separately on purpose: the rail is
     open by default on a wide screen and its state is worth remembering, while the
     mobile drawer must start closed or it would cover the screen on every load. */
  const navOpen = useSyncExternalStore(subscribeNav, readNavOpen, () => true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  /* The rail's own state is the only thing that decides whether the header's trigger is on
     screen, so the two directions are separate calls rather than one toggle: the trigger
     exists only while the rail is shut and can only ever open it, and the control that
     closes it lives on the rail itself. */
  const openNav = useCallback(() => writeNavOpen(true), []);
  const closeNav = useCallback(() => writeNavOpen(false), []);

  /**
   * Every section opens at the top.
   *
   * The document column is its own scroll container (`overflow-y-auto` below), not the window,
   * so neither the browser nor Next's router ever touched it -- switching department left the
   * new section scrolled to wherever the CEO had been reading in the old one, which on the
   * longer screens meant landing halfway down a form they had not seen the start of.
   *
   * Keyed on the section and the lifecycle phase and nothing else: it must not fire while a
   * section is being filled in, or every keystroke that re-renders would yank the page up.
   */
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Escape closes the mobile drawer, the same as tapping the backdrop.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  const urlTab = searchParams.get("tab");
  const tab =
    urlTab && SIMULATION_TABS.some((t) => t.id === urlTab)
      ? urlTab
      : "dashboard";

  const setTab = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", id);
      // `scroll: false` because the router's own scroll handling targets the *window*, which
      // is not what scrolls here. The column below is reset directly instead.
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // See `scrollerRef` above. Runs on every way into a new section -- the rail, the mobile
  // drawer, "Close the quarter", the deep-linked `?tab=`, and each lifecycle phase -- because
  // it keys off where the CEO has ended up, not off the control that took them there.
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [tab, phase]);

  /**
   * Set the plan up for `next`, restoring any draft already saved for that quarter.
   *
   * Restoring rather than always clearing is the point: this runs on every load and after
   * every close, so without it a reload halfway through a quarter silently discarded every
   * number the CEO had entered.
   * 
   * IMPORTANT: Only restore draft if the quarter was already started (has a saved priority).
   * For a brand new quarter, always start with clean defaults.
   */
  const resetPlan = useCallback(
    (next: CompanyState) => {
      const draft = readDraft(companyId, next.quarter);
      
      // Only restore the draft if this quarter was already started (has a priority saved)
      // This prevents Q1 values from bleeding into Q2, Q3, Q4
      const shouldRestoreDraft = draft && draft.priority !== null;
      
      setAlloc(shouldRestoreDraft ? draft.lines : emptyAlloc());
      setWarranty(shouldRestoreDraft ? draft.warranty : "6mo");
      setStartInno(shouldRestoreDraft ? draft.startInno : []);
      // Always honour the canonical live/status state from the server. A stale draft for the
      // next quarter can have `pro.live = false` even after NPD cleared 100 and the backend's
      // next_state flipped it to true -- merging live-status from next.products prevents the
      // product development cycle from appearing to un-complete on reload.
      const draftProducts = shouldRestoreDraft ? draft.products : next.products;
      const mergedProducts = draftProducts ? Object.fromEntries(
        Object.entries(draftProducts).map(([id, p]) => [
          id,
          {
            ...p,
            live:
              next.products[id as keyof typeof next.products]?.live ?? p.live,
          },
        ]),
      ) as typeof draftProducts : next.products;
      setProducts(mergedProducts);
      setPayTerms(shouldRestoreDraft ? draft.payTerms : next.payTerms);
      setPriority(shouldRestoreDraft ? draft.priority : null);
      setReflection(shouldRestoreDraft ? draft.reflection : { sacrifice: [] });
      setCrisis(shouldRestoreDraft ? draft.crisis : emptyCrisis());
      setAdvanced(true);
      setProjection(null);
    },
    [companyId],
  );

  /* ── load the run ─────────────────────────────────────────────── */

  /**
   * Load the run, and the term sheet whenever one is outstanding.
   *
   * The term sheet is fetched here rather than only in the moment Q3 closes, because the run
   * state is the single source of truth for where the CEO actually is: three quarters locked
   * with no `endgamePath` means the decision is still owed, whether they got there by closing
   * Q3 a second ago or by reloading the page a day later.
   */
  const loadRun = useCallback(async () => {
    const run = await simulationApi.run(companyId);
    setState(run.state);
    setHistory(run.history);
    setScores(run.scores);
    setBriefing(run.crisis);
    setRunStatus(run.runStatus);
    setRewindsUsed(run.rewindsUsed);
    setPriorities(
      run.history.map(
        (h) =>
          ((h as Record<string, unknown>).priority as PriorityId | null) ??
          null,
      ),
    );
    // A reopen of a completed run carries the settled term-sheet outcome from the server so the
    // final report renders exactly as it did the moment the year closed, instead of rebuilding
    // it from nothing (which produced a materially different report on every reopen).
    if (run.settlement)
      setEndgameOutcome(run.settlement as unknown as Record<string, unknown>);

    if (run.quartersLocked >= 3 && run.history.length >= 3) {
      try {
        const eg = await simulationApi.endgame(companyId);
        setTs({
          tier: eg.tier,
          V: eg.q3ValuationInr,
          M: eg.momentum,
          trueContinuation: eg.trueContinuationValueInr,
          offers: eg.offers as unknown as TermSheet["offers"],
          q1: run.history[0],
          q2: run.history[1],
          q3: run.history[2],
        });
      } catch {
        /* Not readable yet. The rest of the run still works without it. */
      }
    }
    return run;
  }, [companyId]);

  /**
   * Derive the phase from the run itself, never from wherever the user happened to be.
   *
   * This is what makes the term sheet impossible to lose: a reload, a sidebar deep-link and the
   * browser back button all recompute the same answer from `quartersLocked` and `endgamePath`.
   * The previous version fell back to the briefing whenever any quarter was locked, which
   * silently skipped the Q4 term sheet -- and because the screen was only ever reachable from
   * the moment Q3 closed, the endgame decision could then never be recorded at all.
   *
   * No `didRun` ref guards this. Under StrictMode the effect is deliberately invoked twice, and
   * a ref guard would let the first (already-cancelled) pass claim the slot while the second
   * returned early -- leaving the page on its loading state forever.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const run = await loadRun();
        if (cancelled) return;
        resetPlan(run.state);
        // A saved draft that already names a priority means this quarter was started, so
        // resume on the decision screens rather than sending the CEO back through the
        // briefing to re-declare something they have already committed to.
        const started = Boolean(
          readDraft(companyId, run.state.quarter)?.priority,
        );

        setPhase(
          run.runStatus === "completed" || run.runStatus === "failed"
            ? "final"
            : run.quartersLocked === 0 && !started
              ? "intro"
              : // Q3 closed and path C chosen: run is complete, go to final
                run.quartersLocked === 3 && run.endgamePath === "C"
                ? "final"
                : // Q3 closed and nothing signed: the term sheet is owed before Q4 can be run.
                  run.quartersLocked === 3 && !run.endgamePath
                  ? "termsheet"
                  : started
                    ? "play"
                    : "briefing",
        );
      } catch (err) {
        if (!cancelled)
          setError(
            err instanceof ApiError ? err.message : "Could not load this run.",
          );
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, loadRun, resetPlan]);

  // Sync the header name with the server once the company loads.
  useEffect(() => {
    if (company?.name) setCompanyName(company.name); // eslint-disable-line react-hooks/set-state-in-effect
  }, [company?.name]);

  /* ── the live projection, from the server ─────────────────────── */

  const plan: QuarterPlan = useMemo(
    () => ({
      lines: alloc,
      warranty,
      payTerms,
      startInno,
      products,
      priority,
      reflection,
      crisis,
    }),
    [
      alloc,
      warranty,
      payTerms,
      startInno,
      products,
      priority,
      reflection,
      crisis,
    ],
  );

  /**
   * Save the draft on every change, so nothing typed is ever only in memory.
   *
   * There is no "save" button by design: an allocation the CEO can lose by reloading is worse
   * than one they have to remember to save, and the quarter is only *committed* when they close
   * it. Skipped while booting so the freshly-restored draft is not immediately written back.
   */
  useEffect(() => {
    if (booting || typeof window === "undefined") return;
    if (phase !== "play" && phase !== "briefing") return;
    try {
      window.localStorage.setItem(
        draftKey(companyId, state.quarter),
        JSON.stringify(plan),
      );
    } catch {
      /* A full or blocked localStorage must never break the run. */
    }
  }, [booting, companyId, phase, plan, state.quarter]);

  /**
   * Debounced so a spend box stays responsive: the CEO types, and 350ms after they stop the
   * server re-runs the whole quarter. Every in-flight preview is superseded by the next, so a
   * slow response can never overwrite a newer one.
   */
  useEffect(() => {
    if (phase !== "play" && phase !== "briefing") return;
    if (runStatus === "completed" || runStatus === "failed") return;
    // While paused (or expired) the plan is frozen and the inputs are read-only, so there is
    // nothing new to preview -- and firing one would just race the resume transition. Skipping
    // it here (and re-firing on the first render after Resume, via `readOnly` flipping false in
    // the deps) guarantees exactly one preview runs when the CEO comes back, never a duplicate.
    if (readOnly) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      simulationApi
        .preview(companyId, plan)
        .then((pv) => {
          if (cancelled) return;
          setProjection(pv.projection);
          setBudget(pv.budget);
          setCommitReading(pv.commitReading);
          if (pv.crisis) setBriefing(pv.crisis);
          // A plan ran successfully: whichever transient preview failure (a dropped/aborted
          // request during a pause or tab transition) put the banner up no longer applies.
          setError((cur) =>
            cur && cur.endsWith("Could not run the plan.") ? null : cur,
          );
        })
        .catch((err) => {
          if (!cancelled)
            setError(
              err instanceof ApiError ? err.message : "Could not run the plan.",
            );
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [companyId, plan, phase, runStatus, readOnly]);

  /* ── derived readings (pure functions of the server's result) ─── */

  const last = history[history.length - 1];
  const prior = history[history.length - 2];
  const archId = (briefing?.archetype as ArchetypeId) ?? null;
  const crisisLive = Boolean(briefing);

  const health = useMemo(() => companyHealth(state, last), [state, last]);
  const changes = useMemo(() => changesSince(prior, last), [prior, last]);
  const openingConstraint = useMemo(
    () => bindingConstraint(last ?? null, state),
    [last, state],
  );
  const liveConstraint = useMemo(
    () => bindingConstraint(projection, state),
    [projection, state],
  );
  const board = useMemo(
    () => boardAsks(state, last, history),
    [state, last, history],
  );
  const dirs = useMemo(() => readiness(projection, state), [projection, state]);
  /* The report's readiness is read from the *closed* result, never from `dirs` above: that one
     belongs to the preview of a plan which stopped existing the moment the quarter locked.
     Both call the same `readiness()`, so the report and the decision screens are one scale. */
  const closedDirs = useMemo(
    () => (closed ? readiness(closed.result, state) : []),
    [closed, state],
  );
  const messages = useMemo(
    () => buildInbox(projection, state, history),
    [projection, state, history],
  );
  const ticker = useMemo(
    () => tickerItems(state, projection, history, liveConstraint),
    [state, projection, history, liveConstraint],
  );

  const A = useMemo(() => numericAlloc(alloc), [alloc]);
  const ctx = useMemo(
    () => ({
      s: state,
      A,
      alloc,
      mk: projection
        ? (projection.staffing as Record<string, number>).marketing
        : 1,
      sl: projection
        ? (projection.staffing as Record<string, number>).sales
        : 1,
      en: projection
        ? (projection.staffing as Record<string, number>).engineering
        : 1,
      op: projection
        ? (projection.staffing as Record<string, number>).operations
        : 1,
      sp: projection
        ? (projection.staffing as Record<string, number>).support
        : 1,
      ad: projection
        ? (projection.staffing as Record<string, number>).admin
        : 1,
    }),
    [state, A, alloc, projection],
  );

  /* ── lifecycle actions ────────────────────────────────────────── */

  const startQuarter = useCallback(() => {
    setPhase("play");
    setTab("dashboard");
    // Timer is initialized once on mount (persisted in localStorage) and counts down
    // continuously across all four quarters. We must NOT call startTimer() here because
    // that would overwrite the stored timer with a fresh 50 minutes on every quarter entry.
  }, [setTab]);

  /**
   * Phase 1 — user clicks "Confirm Rewind" in the modal.
   *
   * Closes the modal immediately and shows the 3-second RewindPreloader overlay.
   * The actual API call does NOT happen yet — it fires in executeRewind() once the
   * preloader's onComplete fires.
   *
   * The inFlight guard is set here (synchronously) so a second click arriving
   * in the same event loop tick is ignored by every other action too.
   */
  const handleRewind = useCallback(
    (targetQuarter: number) => {
      if (inFlight.current || rewindBusy) return;
      inFlight.current = true;
      setRewindBusy(true);
      setError(null);
      setRewindModalOpen(false);
      // Start SFX here — synchronously inside the click handler (user-gesture task),
      // before React re-renders. This is the earliest possible moment and avoids the
      // post-paint delay that useEffect inside the preloader would cause.
      rewindSFXRef.current.start();
      setRewindTargetQuarter(targetQuarter);
    },
    [rewindBusy],
  );

  /**
   * Phase 2 — called by RewindPreloader exactly once, after its 3-second countdown.
   *
   * Performs the actual POST /rewind, reloads the run, and transitions to briefing.
   * On failure the preloader is dismissed, the error banner is shown, and the guard
   * is released so the CEO can try again.
   */
  const executeRewind = useCallback(
    async (targetQuarter: number) => {
      try {
        const result = await simulationApi.rewind(companyId, targetQuarter);
        // Clear localStorage drafts for all deleted quarters
        for (const q of result.deletedQuarters) {
          try {
            window.localStorage.removeItem(draftKey(companyId, q));
          } catch {
            /* nothing to recover from */
          }
        }
        // Reload full state from server — replay architecture handles restoration
        await loadRun();
        
        // NEW: Restore timer from checkpoint if available
        if (result.checkpoint) {
          timer.restoreFromCheckpoint(result.checkpoint.timerRemaining);
        } else {
          // Legacy fallback: no checkpoint exists (old simulation), timer continues from current
          console.warn(
            `No checkpoint found for Q${targetQuarter}, timer may be inaccurate (legacy run)`
          );
        }
        
        setPhase("briefing");
      } catch (err) {
        // Stop audio immediately if the API call fails — the preloader is gone but the
        // sound could still be mid-loop since onStop wasn't called via the normal path.
        rewindSFXRef.current.stop();
        setError(
          err instanceof ApiError
            ? ((err.body as { reason?: string })?.reason ?? err.message)
            : "Rewind failed",
        );
      } finally {
        setRewindTargetQuarter(null);
        setRewindBusy(false);
        inFlight.current = false;
      }
    },
    [companyId, loadRun, timer],
  );

  const closeQuarter = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setWorking({
      title: "Processing quarter " + state.quarter,
      message: "We are working on your inputs and calculating your results…",
      dismiss: "Back to the review",
    });
    setProcessingOverlay(true);
    setClosingQuarter(state.quarter);
    // Start the processing loop synchronously inside this click's task — before the first
    // `await` — so browser autoplay allows it. Calling `.play()` after an `await` has left
    // the user-gesture task and gets blocked silently. This play also unlocks the page's
    // audio so playQuarterClosed() can fire a few seconds later.
    playProcessing();
    try {
      // Capture timer value before locking to enable checkpoint creation
      const timerRemaining = timer.remaining;
      const locked = await simulationApi.lock(companyId, plan, timerRemaining);
      // Committed to the server, so the local draft has done its job.
      try {
        window.localStorage.removeItem(draftKey(companyId, locked.quarter));
      } catch {
        /* nothing to recover from */
      }
      setClosed({ result: locked.result, score: locked.score });
      setHistory((h) => [...h, locked.result]);
      setScores((s) => [...s, locked.score]);
      setPriorities((p) => [...p, priority]);
      setState(locked.nextState);
      if (locked.settlement)
        setEndgameOutcome(
          locked.settlement as unknown as Record<string, unknown>,
        );
      if (locked.quarter >= 4) setRunStatus("completed");
      // Phase must change in the same batch as setState so the auto-save effect sees
      // phase="closed" immediately and does NOT write the old alloc to the next
      // quarter's draft key. Previously this was after the 5 s timeout, which let the
      // auto-save fire with state.quarter already advanced but alloc still belonging
      // to the quarter that just closed.
      setPhase("closed");

      await new Promise((resolve) => setTimeout(resolve, 5000));
      setProcessingOverlay(false);
      stopProcessing();

      // The quarter took real thought to close and the numbers arrive a beat later, so the
      // report gets an audible arrival. The processing loop started above unlocked the page's
      // audio, so this chime plays even though it fires a few seconds after the click.
      playQuarterClosed();
      setWorking(null);
    } catch (err) {
      // If the quarter could not be locked, the processing loop would otherwise keep
      // playing forever. Stop it here so the error is seen (and heard nothing) plainly.
      stopProcessing();
      setProcessingOverlay(false);
      setError(
        err instanceof ApiError
          ? err.message + (err.body.reason ? " — " + err.body.reason : "")
          : "Could not close the quarter.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [companyId, plan, priority, state.quarter]);

  const afterClosed = useCallback(async () => {
    const justClosed = closed?.result.q as number;
    if (justClosed === 4) {
      setPhase("final");
      return;
    }

    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setWorking({
      title: "Opening quarter " + (justClosed + 1),
      message: "Carrying the closing balance sheet into the next briefing…",
      dismiss: "Back to the report",
    });
    try {
      // `loadRun` fetches the term sheet whenever one is outstanding, so Q3 needs no special
      // case here beyond sending the CEO to it.
      const run = await loadRun();
      
      // If run is distressed or failed (e.g., budget exhausted, cash ran out), end the simulation
      // and show the final scorecard instead of opening the next quarter
      if (run.runStatus === "distressed" || run.runStatus === "failed") {
        setPhase("final");
        setWorking(null);
        inFlight.current = false;
        setBusy(false);
        return;
      }
      
      resetPlan(run.state);
      setPhase(justClosed === 3 && !run.endgamePath ? "termsheet" : "briefing");
      // Timer continues running across quarters - don't reset
      setWorking(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not open the next quarter.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [closed, loadRun, resetPlan]);

  const acceptDeal = useCallback(
    async (path: "A" | "B" | "C", termSheetName: string, reasoning: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      setWorking({
        title: "Recording the board's decision",
        message:
          path === "B" || path === "C"
            ? "Signing the term sheet and finalizing the run…"
            : "Signing the term sheet and reopening the company for quarter 4…",
        dismiss: "Back to the term sheet",
      });
      try {
        const response: {
          path: string;
          termSheetName: string;
          tier: string;
          endsEarly?: boolean;
        } = await simulationApi.signTermSheet(
          companyId,
          path,
          termSheetName,
          reasoning,
        );
        // Re-read the run rather than walking straight into Q4 on the state we already had.
        // Signing Path A puts the cheque on Q4's opening state as `pendingInvestment`, which
        // is what raises the ceiling and what every cash figure has to say is coming -- and
        // it is the server that decides that, so the client has to ask.
        const run = await loadRun();
        resetPlan(run.state);

        // Path B (acquisitions) and some Path C options end the simulation immediately.
        // The backend returns endsEarly: true for these cases.
        if (response.endsEarly || run.runStatus === "completed") {
          setPhase("final");
        } else {
          // Path A and some Path C options continue to Q4
          setPhase("briefing");
          setTab("dashboard");
        }
        // Timer continues running across quarters - don't reset
        setWorking(null);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not record that decision.",
        );
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [companyId, loadRun, resetPlan, setTab],
  );

  const restart = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setWorking({
      title: "Starting a new run",
      message: "Creating a fresh company and opening quarter 1…",
      dismiss: "Back to the year end",
    });
    try {
      const created = await api.createCompany({
        name: (company?.name ?? "Nadi Wear") + " (rerun)",
      });
      // The cached run list is what `/run/<n>` resolves against; the new run is not in it yet.
      forgetRunIndex();
      window.location.href = runHref(created.seq, "/simulation");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not start a new run.",
      );
      inFlight.current = false;
      setBusy(false);
    }
  }, [company]);

  /* ── chrome ───────────────────────────────────────────────────── */

  const tabs = [
    {
      id: "dashboard",
      label: "Company",
      badge: messages.filter((m) => m.tone === "critical").length,
      hot: false,
    },
    ...(crisisLive
      ? [{ id: "crisis", label: "Market event", badge: 0, hot: true }]
      : []),
    ...Object.keys(SCREEN_META).map((id) => ({
      id,
      label: SCREEN_META[id].label,
      badge: 0,
      hot: false,
    })),
    { id: "balance", label: "Balance sheet", badge: 0, hot: false },
    { id: "learning", label: "Principles", badge: 0, hot: false },
    { id: "review", label: "Close the quarter", badge: 0, hot: false },
  ];

  /** The department list. Rendered twice -- as the desktop rail and as the mobile drawer -- so
   *  the two can never drift apart. `onClose` is the one thing that differs: the rail and the
   *  drawer are two separate pieces of state, and each panel closes only itself. */
  const navBody = (onClose: () => void) => (
    <>
      {/* The panel carries the only control that shuts it, because the header trigger is not
          on screen while it is open. It is no longer `lg:hidden`: the rail needs it just as
          much as the drawer does, and it is the same gesture in both. */}
      {/* pl-3 against the rail's px-5 puts this label on the same 32px left rule as the
          nav labels below it. */}
      <div className="flex items-center justify-between gap-2 pb-2 pl-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-sim-faint">
          {cleanCompanyName(companyName)} · 4 quarters
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close departments"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sim-faint transition-colors hover:bg-sim-surface-hover hover:text-sim-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setMobileNavOpen(false);
            }}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "flex w-full items-center justify-between gap-1.5 rounded-xl border px-3 py-2.5 text-left text-[13.5px] transition-colors duration-150 ease-out",
              tab === t.id
                ? "border-teal-deep bg-teal-deep text-white font-medium"
                : t.hot
                  ? "border-amber/60 bg-amber/10 text-amber font-semibold hover:border-amber hover:bg-amber/15 animate-pulse"
                  : "border-sim-line bg-sim-surface-raised text-sim-ink hover:border-teal/40 hover:bg-sim-surface-hover",
            )}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="rounded-full bg-danger px-1.5 text-xs font-mono text-white">
                {t.badge}
              </span>
            )}
            {t.hot && (
              <span className="flex h-2 w-2">
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-amber opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber"></span>
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="mt-3 shrink-0 border-t border-sim-line pt-3">
        {/* Leaving the simulation pauses the shared timer so the countdown freezes at the
            current remaining time. On return the timer auto-resumes from exactly where it
            left off; time spent away is never charged. */}
        <button
          type="button"
          onClick={() => {
            timer.pauseForExit();
            router.push("/simulations");
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-sim-faint transition-colors hover:bg-sim-surface-hover hover:text-sim-ink"
        >
          <LogOut className="h-3.5 w-3.5 shrink-0" />
          Exit run
        </button>
      </div>
    </>
  );

  const chrome = (body: React.ReactNode, showNav: boolean) => (
    <TeachingContext.Provider value={notesOn}>
      {/* One viewport-height frame: the toolbar and the rail stay put and only the document
          column scrolls, so switching department never means scrolling back up to the nav. */}
      <div className="flex h-full flex-col overflow-hidden">
        {/* App-themed toolbar -- sits outside `.simulation` so ThemeToggle/ProfileMenu keep
            reading the app's own light/dark tokens (text-ink etc.) instead of clashing with
            the simulation's fixed cream surface below.

            `relative z-50` is what makes the account menu usable in here. `ProfileMenu` hangs
            its panel below the button with `position: absolute` and no z-index of its own --
            everywhere else in the app that is fine, because `Nav` carries it in a
            `fixed ... z-50` header. On this screen the bar was a static box whose *next
            sibling* is the positioned, opaque `.simulation` surface, so the panel dropped into
            the region that surface paints over: same z-index (auto), later in the DOM, so the
            simulation won. The menu opened on every click -- it was just painted underneath the
            department it was opened from, and the clicks landed on the screen behind it.

            Lifting the bar to its own layer is the whole fix; the menu keeps the component,
            the state and the markup it has on every other page. */}
        <div className="relative z-50 shrink-0 border-b border-line bg-base">
          <div
            className={
              SHELL +
              " flex items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8"
            }
          >
            {/* Account chrome only. The department toggle used to sit here, which put the
              control for a panel inside the simulation on the bar that carries "log out" --
              two different scopes on one rule. It now lives in the simulation's own header
              below, beside the quarter it belongs to. */}
            {/* The full lockup, as everywhere else. The glyph alone read as a missing asset here
              rather than as a deliberate mark -- this bar has the room the run's own header
              does not. */}
            <Link
              href="/"
              aria-label="Myelin home"
              className="flex shrink-0 items-center"
            >
              <Logo />
            </Link>
            <div className="flex shrink-0 items-center gap-3">
              <ThemeToggle />
              <div className="h-5 w-px bg-line" aria-hidden />
              <ProfileMenu />
            </div>
          </div>
        </div>

        {/* `isolate` keeps every layer the simulation raises -- the sticky quarter header, the
            processing overlay, the mobile department drawer and its scrim -- inside this
            subtree. Without it those z-indexes are quoted against the page root, where the
            drawer's own `z-50` ties with the toolbar's and wins on DOM order, which would put
            the account menu back underneath a screen it is supposed to open over. */}
        <div className="simulation relative isolate min-h-0 flex-1 overflow-hidden bg-base text-ink">
          {/* Anchored to the simulation surface rather than the viewport: the account bar
              above stays live and legible, so a quarter being scored reads as this workspace
              being busy rather than the whole app having locked up. */}
          {processingOverlay &&
            (() => {
              /* ── Cinematic quarter-close loader ──────────────────────────────
               Quarter-specific copy mirrors the two screenshot designs exactly:
               - Q1–Q3: "THE MARKET HAS RESPONDED." / 5-step market pipeline
               - Q4   : "THE DECISIONS ARE MADE."   / 5-step reveal pipeline   */
              const qNum = closingQuarter;
              const isFinal = qNum >= 4;
              const headline = isFinal
                ? "THE DECISIONS ARE MADE."
                : "THE MARKET HAS RESPONDED.";
              const subA = isFinal
                ? "Every choice had a consequence."
                : "New signals are emerging.";
              const subB = isFinal
                ? "Now we reveal what you've created."
                : "Your next move matters.";
              const statusLabel = isFinal
                ? "REVEALING YOUR OUTCOME"
                : "SITUATION EVOLVING";
              const statusSub = isFinal
                ? "Almost there..."
                : "Processing outcomes and updating the world...";
              const steps = isFinal
                ? [
                    {
                      icon: "📋",
                      label: "DECISIONS\nRECORDED",
                      active: false,
                      done: true,
                    },
                    {
                      icon: "📊",
                      label: "MARKET\nRESPONDED",
                      active: false,
                      done: true,
                    },
                    {
                      icon: "📈",
                      label: "TRENDS\nEMERGED",
                      active: false,
                      done: true,
                    },
                    {
                      icon: "⚙️",
                      label: "SYSTEMS\nADJUSTED",
                      active: false,
                      done: true,
                    },
                    {
                      icon: "🎯",
                      label: "OUTCOME\nREVEALING",
                      active: true,
                      done: false,
                    },
                  ]
                : [
                    {
                      icon: "📋",
                      label: "DECISIONS\nRECORDED",
                      active: false,
                      done: true,
                    },
                    {
                      icon: "⚙️",
                      label: "MARKET\nRESPONDED",
                      active: true,
                      done: false,
                    },
                    {
                      icon: "📦",
                      label: "IMPACTS\nCALCULATING",
                      active: false,
                      done: false,
                    },
                    {
                      icon: "📈",
                      label: "OUTCOMES\nEMERGING",
                      active: false,
                      done: false,
                    },
                    {
                      icon: "👁️",
                      label: "NEXT QUARTER\nLOADING",
                      active: false,
                      done: false,
                    },
                  ];
              const quote = isFinal
                ? "You faced uncertainty. You made trade-offs.\nNow see the full picture."
                : "Every quarter is a test of judgment under uncertainty.\nThe numbers will tell their story.";
              return (
                <div
                  className="absolute inset-0 z-[60] overflow-hidden"
                  style={{
                    background:
                      "radial-gradient(ellipse at 60% 40%, #0d1f2d 0%, #050c12 60%, #000 100%)",
                  }}
                >
                  {/* ── Atmospheric background layers ─────────────────── */}
                  {/* City skyline silhouette — lower-left */}
                  <div
                    className="absolute bottom-0 left-0 w-1/2 h-2/3 opacity-20 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(to top, rgba(0,200,170,0.08) 0%, transparent 100%)",
                    }}
                  >
                    <svg
                      viewBox="0 0 400 300"
                      className="w-full h-full"
                      preserveAspectRatio="xMinYMax meet"
                    >
                      <rect
                        x="10"
                        y="180"
                        width="30"
                        height="120"
                        fill="#14b8a6"
                        opacity="0.3"
                      />
                      <rect
                        x="50"
                        y="140"
                        width="20"
                        height="160"
                        fill="#14b8a6"
                        opacity="0.25"
                      />
                      <rect
                        x="80"
                        y="160"
                        width="40"
                        height="140"
                        fill="#14b8a6"
                        opacity="0.2"
                      />
                      <rect
                        x="130"
                        y="120"
                        width="25"
                        height="180"
                        fill="#14b8a6"
                        opacity="0.3"
                      />
                      <rect
                        x="165"
                        y="150"
                        width="35"
                        height="150"
                        fill="#14b8a6"
                        opacity="0.2"
                      />
                      <rect
                        x="210"
                        y="100"
                        width="20"
                        height="200"
                        fill="#14b8a6"
                        opacity="0.25"
                      />
                      <rect
                        x="240"
                        y="130"
                        width="45"
                        height="170"
                        fill="#14b8a6"
                        opacity="0.15"
                      />
                      <rect
                        x="295"
                        y="160"
                        width="30"
                        height="140"
                        fill="#14b8a6"
                        opacity="0.2"
                      />
                      <rect
                        x="335"
                        y="110"
                        width="25"
                        height="190"
                        fill="#14b8a6"
                        opacity="0.25"
                      />
                      <rect
                        x="370"
                        y="145"
                        width="30"
                        height="155"
                        fill="#14b8a6"
                        opacity="0.2"
                      />
                      {/* Windows */}
                      {[10, 50, 80, 130, 165, 210, 240, 295, 335, 370].map(
                        (x, i) =>
                          Array.from({ length: 6 }).map((_, j) => (
                            <rect
                              key={`${i}-${j}`}
                              x={x + 4}
                              y={310 - j * 22 - 20}
                              width="4"
                              height="3"
                              fill="#14b8a6"
                              opacity={Math.random() > 0.4 ? 0.6 : 0.1}
                            />
                          )),
                      )}
                    </svg>
                  </div>
                  {/* Galaxy / particle cluster — upper-right */}
                  <div className="absolute top-0 right-0 w-1/2 h-full opacity-25 pointer-events-none">
                    <svg viewBox="0 0 400 400" className="w-full h-full">
                      <defs>
                        <radialGradient id="gx" cx="70%" cy="30%" r="50%">
                          <stop
                            offset="0%"
                            stopColor="#14b8a6"
                            stopOpacity="0.4"
                          />
                          <stop
                            offset="100%"
                            stopColor="#14b8a6"
                            stopOpacity="0"
                          />
                        </radialGradient>
                      </defs>
                      <ellipse
                        cx="280"
                        cy="120"
                        rx="180"
                        ry="100"
                        fill="url(#gx)"
                        transform="rotate(-30 280 120)"
                      />
                      {Array.from({ length: 60 }).map((_, i) => (
                        <circle
                          key={i}
                          cx={200 + Math.cos(i * 0.7) * 150 + i * 2}
                          cy={80 + Math.sin(i * 0.5) * 100 + i * 1.5}
                          r={Math.random() * 1.5 + 0.5}
                          fill="#14b8a6"
                          opacity={Math.random() * 0.8 + 0.2}
                        />
                      ))}
                    </svg>
                  </div>
                  {/* Teal road / light trail leading to center */}
                  <div
                    className="absolute bottom-0 left-1/4 w-1/2 h-2/3 pointer-events-none opacity-15"
                    style={{
                      background:
                        "linear-gradient(to top, rgba(20,184,166,0.6) 0%, transparent 80%)",
                    }}
                  ></div>
                  {/* Top and bottom edge vignettes */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 20%, transparent 75%, rgba(0,0,0,0.7) 100%)",
                    }}
                  />

                  {/* ── Error state ───────────────────────────────────── */}
                  {error ? (
                    <div className="absolute inset-0 flex items-center justify-center px-6">
                      <div className="max-w-md w-full border border-red-500/30 bg-red-900/20 backdrop-blur-md px-8 py-6 text-center">
                        <h2 className="font-serif text-3xl text-white mb-3">
                          Processing Error
                        </h2>
                        <p className="text-white/60 mb-8">{error}</p>
                        <button
                          onClick={() => setWorking(null)}
                          className="px-6 py-2.5 border border-white/20 text-white/80 text-sm uppercase tracking-widest hover:bg-white/10 transition-colors"
                        >
                          {working?.dismiss ?? "Dismiss"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center gap-0">
                      {/* ── Animated logo ring ─────────────────────────── */}
                      <div className="relative w-24 h-24 mb-6 flex items-center justify-center shrink-0">
                        {/* Outer arc ring — teal partial circle */}
                        <svg
                          className="absolute inset-0 w-full h-full animate-spin"
                          style={{
                            animationDuration: "4s",
                            animationTimingFunction: "linear",
                          }}
                          viewBox="0 0 96 96"
                        >
                          <circle
                            cx="48"
                            cy="48"
                            r="44"
                            fill="none"
                            stroke="#14b8a6"
                            strokeWidth="2.5"
                            strokeDasharray="180 100"
                            strokeLinecap="round"
                            opacity="0.8"
                          />
                        </svg>
                        {/* Inner pulsing dot on ring */}
                        <svg
                          className="absolute inset-0 w-full h-full animate-spin"
                          style={{
                            animationDuration: "4s",
                            animationTimingFunction: "linear",
                          }}
                          viewBox="0 0 96 96"
                        >
                          <circle cx="48" cy="4" r="4" fill="#14b8a6" />
                        </svg>
                        {/* Static base ring */}
                        <svg
                          className="absolute inset-0 w-full h-full"
                          viewBox="0 0 96 96"
                        >
                          <circle
                            cx="48"
                            cy="48"
                            r="44"
                            fill="none"
                            stroke="#14b8a6"
                            strokeWidth="0.5"
                            opacity="0.2"
                          />
                        </svg>
                        {/* M logo in center */}
                        <div className="relative w-12 h-12 rounded-full bg-[#0a1a24] border border-[#14b8a6]/30 flex items-center justify-center">
                          <svg
                            viewBox="0 0 24 24"
                            className="w-7 h-7"
                            fill="none"
                          >
                            <path
                              d="M3 18V6l4.5 6 4.5-6 4.5 6 4.5-6v12"
                              stroke="#14b8a6"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </div>

                      {/* ── Quarter label ──────────────────────────────── */}
                      <div className="flex items-center gap-3 mb-2 shrink-0">
                        <div className="h-px w-10 bg-[#14b8a6]/50" />
                        <span className="text-[#14b8a6] text-xs uppercase tracking-[0.25em] font-mono">
                          Quarter {qNum} Closed.
                        </span>
                        <div className="h-px w-10 bg-[#14b8a6]/50" />
                      </div>

                      {/* ── Main headline ──────────────────────────────── */}
                      <h1
                        className="text-white font-bold text-3xl sm:text-4xl md:text-5xl tracking-wide mb-4 leading-tight shrink-0"
                        style={{
                          fontFamily: "system-ui, sans-serif",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {headline}
                      </h1>

                      {/* ── Subtitle pair ──────────────────────────────── */}
                      <p className="text-[#14b8a6] text-sm mb-1 shrink-0">
                        {subA}
                      </p>
                      <p className="text-white/70 text-sm mb-5 shrink-0">
                        {subB}
                      </p>

                      {/* ── Divider dot ────────────────────────────────── */}
                      <div className="w-1.5 h-1.5 rounded-full bg-[#14b8a6] mb-5 animate-pulse shrink-0" />

                      {/* ── Status icon + label ────────────────────────── */}
                      {isFinal ? (
                        /* Hourglass icon for revealing */
                        <svg
                          viewBox="0 0 24 24"
                          className="w-7 h-7 text-[#14b8a6] mb-2 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M5 3h14M5 21h14M7 3v5l5 4-5 4v5M17 3v5l-5 4 5 4v5" />
                        </svg>
                      ) : (
                        /* Refresh / evolving icon */
                        <svg
                          viewBox="0 0 24 24"
                          className="w-7 h-7 text-[#14b8a6] mb-2 shrink-0 animate-spin"
                          style={{ animationDuration: "2s" }}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      )}
                      <p className="text-[#14b8a6] text-xs font-bold uppercase tracking-[0.2em] mb-1 shrink-0">
                        {statusLabel}
                      </p>
                      <p className="text-white/50 text-xs mb-6 shrink-0">
                        {statusSub}
                      </p>

                      {/* ── 5-step progress pipeline ───────────────────── */}
                      <div className="flex items-start justify-center gap-0 mb-7 w-full max-w-xl shrink-0">
                        {steps.map((step, i) => (
                          <div key={i} className="flex items-center">
                            <div className="flex flex-col items-center gap-2">
                              {/* Icon circle */}
                              <div
                                className={[
                                  "w-11 h-11 rounded-full border-2 flex items-center justify-center text-base transition-all",
                                  step.active
                                    ? "border-[#14b8a6] bg-transparent shadow-[0_0_16px_rgba(20,184,166,0.5)]"
                                    : step.done
                                      ? "border-[#14b8a6]/40 bg-transparent opacity-70"
                                      : "border-white/10 bg-transparent opacity-30",
                                ].join(" ")}
                              >
                                <span>{step.icon}</span>
                              </div>
                              {/* Label */}
                              <p
                                className={[
                                  "text-[9px] uppercase tracking-widest text-center leading-tight w-16 whitespace-pre-line",
                                  step.active
                                    ? "text-[#14b8a6] font-bold"
                                    : "text-white/40",
                                ].join(" ")}
                              >
                                {step.label}
                              </p>
                            </div>
                            {/* Dashed connector */}
                            {i < steps.length - 1 && (
                              <div className="w-8 sm:w-12 h-px border-t border-dashed border-white/20 mb-6 mx-1" />
                            )}
                          </div>
                        ))}
                      </div>

                      {/* ── Quote card ─────────────────────────────────── */}
                      <div className="max-w-sm w-full border border-[#14b8a6]/20 bg-[#14b8a6]/5 backdrop-blur-sm px-5 py-3 flex items-start gap-3 shrink-0">
                        <span className="text-[#14b8a6] text-2xl leading-none mt-0.5 shrink-0">
                          &ldquo;
                        </span>
                        <p className="text-white/70 text-xs leading-relaxed text-left whitespace-pre-line">
                          {quote}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          {/* Rewind preloader — 3-second immersive transition between Confirm Rewind and
              the actual API call. Sits at the same z-level as the working overlay but uses
              amber theming and a countdown rather than the teal spinner, making it feel
              intentionally different from a normal processing wait. */}
          {rewindTargetQuarter !== null && (
            <RewindPreloader
              targetQuarter={rewindTargetQuarter}
              onStop={() => rewindSFXRef.current.stop()}
              onComplete={() => void executeRewind(rewindTargetQuarter)}
            />
          )}
          {timerActive && timer.paused && !working && (
            <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-amber/40 bg-amber/10 px-6 py-3 backdrop-blur-sm">
              <Pause className="h-4 w-4 shrink-0 text-amber" />
              <div className="min-w-0 flex-1">
                <span className="font-serif text-sm text-ink">
                  Simulation paused
                </span>
                <span className="ml-2 text-xs text-dim">
                  All inputs are read-only while paused.
                </span>
              </div>
              <button
                onClick={timer.unpause}
                className="flex shrink-0 items-center gap-1.5 border border-amber/60 px-3 py-1.5 text-xs uppercase tracking-widest text-amber hover:bg-amber/10 transition-colors"
              >
                <Play className="h-3 w-3" />
                Resume
              </button>
            </div>
          )}
          {timerActive &&
            timer.expired &&
            !working &&
            !timerExpiredDismissed && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="relative max-w-md rounded-lg border border-danger/40 bg-danger/10 px-8 py-6 backdrop-blur-sm shadow-2xl">
                  {/* Dismiss button — closes the popup but keeps simulation read-only */}
                  <button
                    onClick={() => setTimerExpiredDismissed(true)}
                    aria-label="Close notification"
                    className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded text-ink/50 transition-colors hover:bg-danger/20 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/60"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="flex items-start gap-4">
                    <AlertTriangle className="h-6 w-6 shrink-0 text-danger-soft mt-1" />
                    <div>
                      <div className="font-serif text-2xl text-ink mb-2">
                        Time Limit Reached
                      </div>
                      <div className="text-sm text-ink/90 leading-relaxed space-y-2">
                        <p>
                          The 50-minute timer for this simulation has expired.
                          All inputs are now read-only and you can no longer
                          make changes or close quarters.
                        </p>
                        <p>
                          You can review your decisions and progress, but no
                          further actions are allowed.
                        </p>
                      </div>
                      <button
                        onClick={() => setTimerExpiredDismissed(true)}
                        className="mt-5 flex items-center gap-2 border border-danger/40 px-4 py-2 text-xs uppercase tracking-widest text-ink/80 transition-colors hover:border-danger/70 hover:bg-danger/10 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/60"
                      >
                        Review my simulation
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          <div className={SHELL + " flex h-full"}>
            {/* Always mounted while there is a rail to show, and collapsed by animating its
              width to zero rather than by unmounting.

              Mounting and unmounting could not be transitioned -- the panel and the document
              both jumped by 220px -- and it also threw away the rail's scroll position every
              time it was closed. The outer element is the only thing that changes size; the
              inner one keeps the full rail width throughout, so the nav labels slide out of
              view intact instead of reflowing to nothing on the way. */}
            {showNav && (
              <aside
                inert={!navOpen ? true : undefined}
                className={cn(
                  "hidden shrink-0 overflow-hidden bg-sim-surface transition-[width] duration-300 ease-out motion-reduce:transition-none lg:block",
                  navOpen ? "border-r border-sim-line" : "border-r-0",
                )}
                style={{ width: navOpen ? RAIL_W : 0 }}
              >
                <div
                  className={cn(
                    "flex h-full flex-col px-5 py-4 transition-opacity duration-200 ease-out motion-reduce:transition-none",
                    navOpen ? "opacity-100" : "opacity-0",
                  )}
                  style={{ width: RAIL_W }}
                >
                  {navBody(closeNav)}
                </div>
              </aside>
            )}

            {showNav && mobileNavOpen && (
              <>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close navigation"
                  className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                />
                <aside className="fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-sim-line bg-sim-surface px-3 py-4 shadow-xl lg:hidden">
                  {navBody(() => setMobileNavOpen(false))}
                </aside>
              </>
            )}

            <div
              ref={scrollerRef}
              className="flex min-w-0 flex-1 flex-col overflow-y-auto"
            >
              {/* Sticky header: two rows matching the reference design.
                  Row 1 — identity: nav trigger | company name | role label | leaderboard
                  Row 2 — status bar (only while playing): timer | pause | rewind | quarter | cash | priority | left | notes | sound */}
              <header className="sticky top-0 z-20 shrink-0 bg-chrome text-white">
                {/* ── Row 1: identity ─────────────────────────────────────── */}
                <div className={COLUMN + " flex items-center justify-between gap-3 py-2 border-b border-white/10"}>
                  <div className="flex min-w-0 items-center gap-3">
                    {/* Desktop rail trigger — only when the rail is shut */}
                    {showNav && !navOpen && (
                      <button
                        type="button"
                        onClick={openNav}
                        aria-expanded={false}
                        aria-label="Open departments"
                        className="dept-trigger hidden shrink-0 items-center gap-1.5 border border-line-2 px-2 py-1 text-xs uppercase tracking-widest text-dim transition-colors hover:text-white lg:inline-flex"
                      >
                        <PanelLeftOpen className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Departments</span>
                      </button>
                    )}
                    {/* Mobile drawer trigger */}
                    {showNav && !mobileNavOpen && (
                      <button
                        type="button"
                        onClick={() => setMobileNavOpen(true)}
                        aria-expanded={false}
                        aria-label="Open departments"
                        className="dept-trigger inline-flex shrink-0 items-center gap-1.5 border border-line-2 px-2 py-1 text-xs uppercase tracking-widest text-dim transition-colors hover:text-white lg:hidden"
                      >
                        <PanelLeftOpen className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Departments</span>
                      </button>
                    )}
                    <CompanyNameEditor
                      name={cleanCompanyName(companyName)}
                      onSave={async (newName) => {
                        setCompanyName(newName);
                        try {
                          await api.updateCompany(companyId, { name: newName });
                        } catch {
                          /* name persists locally even if server update fails */
                        }
                      }}
                    />
                    <span className="hidden text-xs uppercase tracking-widest text-dim md:inline">
                      Chief Executive
                    </span>
                  </div>
                  {/* Quick link to standings */}
                  <button
                    onClick={() => setLeaderboardOpen(true)}
                    title="View your standings"
                    className="shrink-0 px-2 py-1 text-xs uppercase tracking-widest border border-teal/40 text-teal transition-colors hover:border-teal hover:text-teal-bright"
                  >
                    Leaderboard
                  </button>
                </div>

                {/* ── Row 2: status bar — only rendered while playing ──────── */}
                {showNav && (
                  <div className={COLUMN + " flex flex-wrap items-center gap-x-4 gap-y-1 py-2 font-mono text-sm"}>
                    {/* Timer with clock icon — inline, no border box */}
                    {timerActive && (
                      <span
                        className={cn(
                          "flex items-center gap-1.5",
                          timer.expired
                            ? "text-danger-soft"
                            : timer.paused
                              ? "text-amber"
                              : timer.remaining <= 300
                                ? "text-danger-soft"
                                : "text-white",
                        )}
                      >
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        {timer.formatTime()}
                      </span>
                    )}
                    {/* Pause / Resume — plain button matching reference style */}
                    {timerActive && !timer.expired && (
                      <button
                        onClick={() =>
                          timer.paused ? timer.unpause() : timer.pause()
                        }
                        className={cn(
                          "flex items-center gap-1 border px-2 py-0.5 text-xs uppercase tracking-widest transition-colors",
                          timer.paused
                            ? "border-amber/60 text-amber hover:bg-amber/10"
                            : "border-line-2 text-dim hover:text-white",
                        )}
                        title={timer.paused ? "Resume simulation" : "Pause simulation"}
                      >
                        {timer.paused ? (
                          <><Play className="h-3 w-3" /><span>Resume</span></>
                        ) : (
                          <><Pause className="h-3 w-3" /><span>Pause</span></>
                        )}
                      </button>
                    )}
                    {/* Rewind */}
                    {rewindsRemaining > 0 &&
                      history.length > 0 &&
                      phase !== "final" &&
                      !timer.expired && (
                        <button
                          onClick={() => setRewindModalOpen(true)}
                          disabled={rewindBusy}
                          className="flex items-center gap-1 border border-line-2 px-2 py-0.5 text-xs uppercase tracking-widest text-dim transition-colors hover:text-white disabled:opacity-50"
                          title="Rewind to a previous quarter"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Rewind ({rewindsRemaining})</span>
                        </button>
                      )}
                    {/* Quarter */}
                    <span>
                      <span className="text-dim text-xs uppercase tracking-widest mr-1">Quarter</span>
                      {state.quarter}/4
                    </span>
                    {/* Cash */}
                    <span>
                      <span className="text-dim text-xs uppercase tracking-widest mr-1">Cash</span>
                      {inr(state.cash)}
                      {state.pendingInvestment > 0 && (
                        <span className="text-teal-bright ml-1">
                          +{inr(state.pendingInvestment)} pending
                        </span>
                      )}
                    </span>
                    {/* Priority — only shown once declared */}
                    {priority && (
                      <span className="text-teal-bright">
                        <span className="text-dim text-xs uppercase tracking-widest mr-1">Priority</span>
                        {PRIORITY_BY_ID[priority].name}
                      </span>
                    )}
                    {/* Left to commit - with investment breakdown when present */}
                    {state.pendingInvestment > 0 ? (
                      <span className="text-faint flex items-center gap-1">
                        <span className="text-dim text-xs uppercase tracking-widest">Left</span>
                        <span className="font-mono text-sm">
                          {inr(budgetRemaining - state.pendingInvestment)}
                        </span>
                        <span className="text-teal-bright text-xs">+</span>
                        <span className="font-mono text-sm text-teal-bright">
                          {inr(state.pendingInvestment)}
                        </span>
                        <span className="text-dim text-xs">=</span>
                        <span className="font-mono text-base font-semibold text-ink">
                          {inr(budgetRemaining)}
                        </span>
                      </span>
                    ) : (
                      <span className={budgetRemaining < 0 ? "text-danger-soft" : "text-faint"}>
                        <span className="text-dim text-xs uppercase tracking-widest mr-1">Left</span>
                        {inr(budgetRemaining)}
                      </span>
                    )}
                    {/* Notes toggle */}
                    <button
                      onClick={() => setNotesOn(!notesOn)}
                      className={
                        "px-2 py-0.5 text-xs uppercase tracking-widest border transition-colors " +
                        (notesOn ? "border-teal text-teal-bright" : "border-line-2 text-dim")
                      }
                    >
                      Notes {notesOn ? "on" : "off"}
                    </button>
                    {/* Sound toggle — the only way to silence the quarter-close chime */}
                    <button
                      onClick={() => {
                        setSoundEnabled(!soundOn);
                        if (!soundOn) playQuarterClosed();
                      }}
                      aria-pressed={soundOn}
                      title={soundOn ? "Mute the quarter-close chime" : "Play a chime when a quarter closes"}
                      className={
                        "px-2 py-0.5 text-xs uppercase tracking-widest border transition-colors " +
                        (soundOn ? "border-teal text-teal-bright" : "border-line-2 text-dim")
                      }
                    >
                      Sound {soundOn ? "on" : "off"}
                    </button>
                  </div>
                )}
                {showNav && <Ticker items={ticker} />}
              </header>

              <main className={COLUMN + " py-6"}>{body}</main>

              <footer
                className={COLUMN + " pb-10 pt-2 text-xs text-faint font-mono"}
              >
                Teaching simulation. All figures fictional. Every number is
                computed by the MyElin engine.
              </footer>
            </div>
          </div>
        </div>
      </div>
      <SimulationLeaderboardModal
        open={leaderboardOpen}
        scenarioId={company?.scenario_id}
        scenarioTitle={company?.scenario.display_name}
        onClose={() => setLeaderboardOpen(false)}
      />
      <BudgetExhaustedModal
        open={budgetExhaustedModalOpen}
        onClose={() => setBudgetExhaustedModalOpen(false)}
        budgetRemaining={budgetRemaining}
      />

      <RewindModal
        open={rewindModalOpen}
        onClose={() => setRewindModalOpen(false)}
        onConfirm={handleRewind}
        completedQuarters={history.map((_, i) => i + 1)}
        rewindsRemaining={rewindsRemaining}
        busy={rewindBusy}
      />
    </TeachingContext.Provider>
  );

  const errorBanner = error && (
    <div className="border-l-4 border-danger bg-danger/10 px-4 py-3 text-sm text-tone-bad">
      {error}
    </div>
  );

  /* ── render ───────────────────────────────────────────────────── */

  if (booting) {
    return (
      <div className="simulation flex min-h-full items-center justify-center bg-base text-ink">
        <PageLoading
          label="Loading your company…"
          sub="Reading the run's closed quarters."
        />
      </div>
    );
  }

  if (phase === "intro") {
    return chrome(
      <div className="space-y-5">
        {errorBanner}
        <IntroScreen
          companyName={companyName}
          onStart={() => setPhase("briefing")}
          busy={busy}
        />
      </div>,
      false,
    );
  }

  if (phase === "briefing") {
    return chrome(
      <div className="space-y-5">
        {errorBanner}
        <BriefingScreen
          s={state}
          history={history}
          health={health}
          changes={changes}
          constraint={openingConstraint}
          board={board}
          priority={priority}
          setPriority={setPriority}
          onStart={startQuarter}
          busy={busy}
          rewindsRemaining={rewindsRemaining}
          onRewind={() => setRewindModalOpen(true)}
        />
      </div>,
      false,
    );
  }

  if (phase === "closed" && closed) {
    return chrome(
      <ClosedScreen
        r={closed.result}
        prior={history[history.length - 2]}
        history={history}
        score={closed.score}
        constraint={bindingConstraint(closed.result, closed.result.entering)}
        dirs={closedDirs}
        priority={priorities[priorities.length - 1] ?? null}
        reflection={reflection}
        onNext={afterClosed}
        busy={busy}
      />,
      false,
    );
  }

  if (phase === "termsheet") {
    // `ts` should always be loaded by the time the phase is set, but say so plainly rather
    // than falling through to the play surface -- a silent fall-through is exactly what made
    // the term sheet look like a dead end before.
    return chrome(
      ts ? (
        <TermSheetScreen
          ts={ts}
          onAccept={acceptDeal}
          busy={busy}
          error={error}
        />
      ) : (
        <div className="space-y-4">
          {errorBanner}
          <div className="border-l-4 border-ember bg-ember/10 px-4 py-3 text-sm text-ink">
            The board&apos;s term sheet could not be loaded. Reload the page to
            try again — your three closed quarters are safe, and nothing is
            lost.
          </div>
        </div>
      ),
      false,
    );
  }

  if (phase === "final") {
    return chrome(
      <FinalScreen
        ts={ts}
        eg={endgameOutcome}
        scores={scores}
        history={history}
        priorities={priorities}
        s={state}
        onRestart={restart}
        busy={busy}
      />,
      false,
    );
  }

  /* The section the footer's "Move to next section" advances to.
     `tabs` is the rail's list, so this is the rail's order by construction. It is null on the
     last section before the closure, and on a section the rail is not currently showing (the
     market event, once it has passed) -- in both cases the closure is the only step left, and
     `SectionNav` promotes it. */
  const sectionIndex = tabs.findIndex((t) => t.id === tab);
  const after = sectionIndex >= 0 ? tabs[sectionIndex + 1] : undefined;
  const nextSection =
    after && after.id !== CLOSURE_TAB
      ? { id: after.id, label: after.label }
      : null;

  let body: React.ReactNode;

  if (tab === "learning") {
    body = <PrinciplesScreen />;
  } else if (tab === "balance") {
    body = <BalanceSheetScreen s={state} budget={budget} history={history} />;
  } else if (tab === "dashboard") {
    body = (
      <DashboardScreen
        s={state}
        history={history}
        health={health}
        constraint={liveConstraint}
        dirs={dirs}
        inbox={messages}
        priority={priority}
        budget={budget}
      />
    );
  } else if (tab === "crisis" && archId) {
    body = (
      <CrisisScreen
        s={state}

        archId={archId}
        crisis={crisis}
        setCrisis={guardSetCrisis}
        budget={budget}
        budgetRemaining={budgetRemaining}
        onBudgetExceeded={handleBudgetExceeded}
        briefing={briefing}
        commitReading={commitReading}
        readOnly={readOnly}
      />
    );
  } else if (tab === "crisis") {
    body = (
      <div className="border-l-4 border-line-2 bg-raise px-4 py-3 text-sm text-ink">
        No market event is live this quarter.
      </div>
    );
  } else if (tab === "review") {
    body = (
      <ReviewScreen
        quarter={state.quarter}
        state={state}
        dirs={dirs}
        inbox={messages}
        constraint={liveConstraint}
        reflection={reflection}
        setReflection={guardSetReflection}
        priority={priority}
        alloc={alloc}
        budget={budget}
        crisisLive={crisisLive}
        crisis={crisis}
        onClose={closeQuarter}
        busy={busy}
        error={error}
        readOnly={readOnly}
      />
    );
  } else if (DECISION_GROUPS[tab]) {
    body = (
    <DepartmentScreen
        id={tab}
        s={state}
        alloc={alloc}
        setAlloc={guardAlloc}
        ctx={ctx}
        budget={budget}
        budgetExhausted={budgetExhausted}
        budgetRemaining={budgetRemaining}
        onBudgetExceeded={handleBudgetExceeded}
        dirs={dirs}
        inbox={messages}
        advanced={advanced}
        setAdvanced={readOnly ? () => {} : setAdvanced}
        readOnly={readOnly}
        extraTop={
          tab === "rnd" ? (
            <>
              <ProductFocus
                s={state}
                p={projection}
                last={last}
                startInno={startInno}
                alloc={alloc}
              />
              <ProductPortfolio
                s={state}
                products={products}
                setProducts={guardSetProducts}
                p={projection}
                readOnly={readOnly}
              />
            </>
          ) : tab === "hr" ? (
            <PeoplePanel
              s={state}
              alloc={alloc}
              setAlloc={guardAlloc}
              p={projection}
              budget={budget}
              budgetExhausted={budgetExhausted}
              budgetRemaining={budgetRemaining}
              onBudgetExceeded={handleBudgetExceeded}
              readOnly={readOnly}
            />
          ) : null
        }
        extra={
          tab === "rnd" ? (
            <>
              <InnovationBoard
                s={state}
                startInno={startInno}
                setStartInno={guardSetStartInno}
                p={projection}
                budget={budget}
                budgetExhausted={budgetExhausted}
                budgetRemaining={budgetRemaining}
                onBudgetExceeded={handleBudgetExceeded}
                readOnly={readOnly}
              />
              <WarrantyPanel
                warranty={warranty}
                setWarranty={guardSetWarranty}
                p={projection}
                readOnly={readOnly}
              />
            </>
          ) : tab === "finance" ? (
            <FinancePanel
              s={state}
              alloc={alloc}
              setAlloc={guardAlloc}
              payTerms={payTerms}
              setPayTerms={guardSetPayTerms}
              p={projection}
              budget={budget}
              budgetExhausted={budgetExhausted}
              budgetRemaining={budgetRemaining}
              onBudgetExceeded={handleBudgetExceeded}
              readOnly={readOnly}
            />
          ) : null
        }
      />
    );
  } else {
    body = <div className="text-sm text-dim">Pick a screen above.</div>;
  }

  return chrome(
    <div className="space-y-5">
      {errorBanner}
      {/* ── Post-expiry review banner ───────────────────────────────
          Only visible after the time limit has expired and the popup is dismissed.
          Lets the CEO jump to any closed quarter's full read-only report, or return
          to the current quarter view. Quarter tabs remain usable for navigation. */}
      {timer.expired && timerExpiredDismissed && (
        <div className="border border-danger/30 bg-danger/5 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-danger-soft shrink-0">
              <Clock className="h-3.5 w-3.5" />
              <span>Time expired — review mode</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Button for the live (current) quarter view */}
              <button
                onClick={() => setReviewQuarter(null)}
                className={cn(
                  "border px-3 py-1 text-xs uppercase tracking-widest transition-colors",
                  reviewQuarter === null
                    ? "border-danger/40 bg-danger/15 text-danger-soft"
                    : "border-line-2 text-dim hover:border-ink/40 hover:text-ink",
                )}
              >
                Current view
              </button>
              {/* One button per closed quarter */}
              {history.map((_, i) => {
                const q = i + 1;
                return (
                  <button
                    key={q}
                    onClick={() => setReviewQuarter(q)}
                    className={cn(
                      "border px-3 py-1 text-xs uppercase tracking-widest transition-colors",
                      reviewQuarter === q
                        ? "border-danger/40 bg-danger/15 text-danger-soft"
                        : "border-line-2 text-dim hover:border-ink/40 hover:text-ink",
                    )}
                  >
                    Quarter {q} report
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {/* ── Body: either the historical quarter report or the live play surface ── */}
      {reviewQuarter !== null && timer.expired && timerExpiredDismissed ? (
        (() => {
          /* Render the closed report for the selected review quarter. All data comes from
             the already-loaded history/scores/priorities arrays — no network call needed. */
          const rIdx = reviewQuarter - 1;
          const rResult = history[rIdx];
          const rScore = scores[rIdx];
          const rPriority = priorities[rIdx] ?? null;
          // Reflection is stored only for the live quarter's draft; historical quarters
          // show an empty reflection (all questions unanswered) which is fine — the report
          // bands that use it (priority match, risk) will simply show nothing.
          const rReflection: Reflection = { sacrifice: [] };
          const rConstraint = bindingConstraint(rResult, rResult.entering);
          const rDirs = readiness(rResult, rResult.entering);
          const rHistory = history.slice(0, reviewQuarter);
          const rPrior = history[rIdx - 1];
          return (
            <ClosedScreen
              r={rResult}
              prior={rPrior}
              history={rHistory}
              score={rScore}
              constraint={rConstraint}
              dirs={rDirs}
              priority={rPriority}
              reflection={rReflection}
              onNext={() => {
                // Advance to the next closed quarter if one exists, otherwise clear review.
                if (reviewQuarter < history.length) {
                  setReviewQuarter(reviewQuarter + 1);
                } else {
                  setReviewQuarter(null);
                }
              }}
              busy={false}
            />
          );
        })()
      ) : (
        <>
          {/* The preview is debounced and re-runs on every edit, so this is the one wait the CEO
              sees repeatedly -- it stays a single quiet line rather than anything that redraws the
              screen under the form they are filling in. */}
          {!projection && (
            <InlineLoading
              label="Running the plan…"
              sub="The engine is costing what you have entered so far."
              className="border-l-4 border-line-2 bg-raise px-4 py-3"
            />
          )}
          {body}
          {/* Rendered here rather than inside each section, so every section ends the same way and
              a new one inherits it for free. `tabs` is the rail's own list, so the order these
              walk is the order the rail shows -- including the market event, which is only in
              both when it is live.

              Left off the closure section itself: that screen already ends with the button that
              commits the quarter, and a second one beside it would be either a duplicate or a way
              past the reflection gate. */}
          {tab !== CLOSURE_TAB && (
            <SectionNav
              next={nextSection}
              onNext={() => nextSection && setTab(nextSection.id)}
              onClosure={() => setTab(CLOSURE_TAB)}
            />
          )}
        </>
      )}
    </div>,
    true,
  );
}

export { ARCHETYPES };
