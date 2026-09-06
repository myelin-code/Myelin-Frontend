"use client";

/**
 * Profile menu — 5-item main dropdown with a "More" submenu.
 *
 * Main dropdown:
 *   1. Name (identity header, not a nav link)
 *   2. Edit Profile  → /profile
 *   3. My Simulations → /runs
 *   4. More           → opens submenu with remaining items
 *   5. Logout
 *
 * "More" submenu contains:
 *   - Recent runs, Completed, New simulation
 *   - Security & password, Send a password reset
 *   - Help & FAQ, Contact us
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  LifeBuoy,
  LogOut,
  Mail,
  Play,
  Plus,
  ShieldCheck,
  UserPen,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { api } from "@/lib/api/client";
import { runHref } from "@/lib/run/ref";
import type { CompanyListItem, RunStatus } from "@/lib/api/types";
import { ApiError } from "@/lib/api/types";
import { Pill, type Accent } from "@/components/ui/Kit";
import { humanizeId } from "@/lib/format/display";
import {
  displayName as nameFor,
  identityServerSnapshot,
  identitySnapshot,
  initials,
  primeIdentity,
  subscribeIdentity,
} from "@/lib/identity";
import { cn } from "@/lib/utils";
import { useSimulationHref } from "@/components/play/entry";

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  active: "Active",
  distressed: "Distressed",
  failed: "Failed",
  completed: "Completed",
};

const RUN_STATUS_ACCENT: Record<RunStatus, Accent> = {
  active: "teal",
  distressed: "amber",
  failed: "rose",
  completed: "emerald",
};

const RECENT_LIMIT = 3;

function Avatar({
  email,
  firstName,
  size = 28,
}: {
  email: string;
  firstName?: string | null;
  size?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold uppercase text-[#071a16]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: "linear-gradient(135deg, var(--teal), var(--teal-bright))",
      }}
    >
      {initials(email, firstName)}
    </span>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line px-2 py-2">
      <p className="px-3 pb-1 pt-1.5 text-[10.5px] uppercase tracking-[0.14em] text-faint">
        {label}
      </p>
      {children}
    </div>
  );
}

const rowClass =
  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] text-dim transition-all duration-150 ease-out hover:bg-[var(--panel-2)] hover:text-ink hover:translate-x-0.5";

function Row({
  href,
  icon: Icon,
  children,
  onSelect,
  meta,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onSelect: () => void;
  meta?: React.ReactNode;
}) {
  return (
    <Link href={href} onClick={onSelect} className={rowClass}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {meta}
    </Link>
  );
}

export function ProfileMenu() {
  const simulationHref = useSimulationHref();

  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [runs, setRuns] = useState<CompanyListItem[] | null>(null);
  const profile = useSyncExternalStore(subscribeIdentity, identitySnapshot, identityServerSnapshot);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) primeIdentity();
  }, [user]);

  useEffect(() => {
    if (!open || !user || runs !== null) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const { entries } = await api.listCompanies();
        if (!cancelled) setRuns(entries);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load your account.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, runs]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowMore(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setShowMore(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const close = () => {
    setOpen(false);
    setShowMore(false);
  };
  const displayName = nameFor(profile, user.email);
  const recent = (runs ?? []).slice(0, RECENT_LIMIT);
  const completed = (runs ?? []).filter(
    (r) => r.run_status === "completed" || r.run_status === "failed",
  ).length;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setShowMore(false);
        }}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-2.5 text-[13px] text-ink transition-colors hover:border-line-2 hover:bg-[var(--panel-2)] sm:pr-3"
      >
        <Avatar email={user.email} firstName={profile?.first_name} />
        <span className="hidden max-w-[140px] truncate sm:inline">{displayName}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-dim transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+10px)] max-h-[min(78vh,42rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-void/97 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        >
          {showMore ? (
            /* ── More submenu ────────────────────────────── */
            <div>
              {/* Back header */}
              <div className="flex items-center border-b border-line px-4 py-3">
                <button
                  type="button"
                  onClick={() => setShowMore(false)}
                  className="flex items-center gap-1.5 text-[12.5px] text-dim transition-all duration-150 ease-out hover:text-ink hover:-translate-x-0.5"
                >
                  <ChevronRight className="h-3.5 w-3.5 rotate-180" />
                  Back
                </button>
                <span className="ml-2 text-[13px] font-medium text-ink">More</span>
              </div>

              {/* Simulations */}
              <Section label="Simulations">
                {loading && (
                  <p className="px-3 py-2 text-[12.5px] text-dim">Loading your runs…</p>
                )}
                {!loading && error && (
                  <p className="px-3 py-2 text-[12.5px] text-dim">{error}</p>
                )}
                {!loading && !error && recent.length > 0 && (
                  <div className="pb-1">
                    {recent.map((run) => (
                      <Link
                        key={run.id}
                        href={runHref(run.seq, "/simulation")}
                        onClick={close}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 transition-all duration-150 ease-out hover:bg-[var(--panel-2)] hover:translate-x-0.5"
                      >
                        <span className="num w-8 shrink-0 text-[11px] text-faint">
                          #{run.seq}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink">{run.name}</span>
                          <span className="num block text-[11px] text-faint">
                            Q{run.quarters_locked}/{run.total_quarters}
                          </span>
                        </span>
                        <Pill accent={RUN_STATUS_ACCENT[run.run_status]}>
                          {RUN_STATUS_LABEL[run.run_status]}
                        </Pill>
                      </Link>
                    ))}
                  </div>
                )}
                {!loading && !error && runs !== null && runs.length === 0 && (
                  <p className="px-3 py-2 text-[12.5px] text-dim">No simulations started yet.</p>
                )}
                <Row href="/runs" icon={Play} onSelect={close} meta={
                  runs ? <span className="num text-[11px] text-faint">{runs.length}</span> : null
                }>
                  My simulations
                </Row>
                <Row href="/runs?filter=completed" icon={CircleCheck} onSelect={close} meta={
                  runs ? <span className="num text-[11px] text-faint">{completed}</span> : null
                }>
                  Completed
                </Row>
                <Row href={simulationHref} icon={Plus} onSelect={close}>
                  New simulation
                </Row>
              </Section>

              {/* Account & security */}
              <Section label="Account & security">
                <Row href="/account/security" icon={ShieldCheck} onSelect={close}>
                  Security &amp; password
                </Row>
                <Row href="/forgot-password" icon={Mail} onSelect={close}>
                  Send a password reset
                </Row>
              </Section>

              {/* Support */}
              <Section label="Support">
                <Row href="/faq" icon={LifeBuoy} onSelect={close}>
                  Help &amp; FAQ
                </Row>
                <Row href="/#institutions" icon={Mail} onSelect={close}>
                  Contact us
                </Row>
              </Section>

            </div>
          ) : (
            /* ── Main dropdown: 4 items ──────────────────── */
            <div className="p-2">
              {/* 1. Name — identity header */}
              <Link
                href="/profile"
                onClick={close}
                className="flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-150 ease-out hover:bg-[var(--panel-2)] hover:translate-x-0.5"
              >
                <Avatar email={user.email} firstName={profile?.first_name} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-ink">{displayName}</p>
                  <p className="truncate text-[11.5px] text-faint">{user.email}</p>
                </div>
                <Pill accent={profile?.role === "admin" || user?.is_admin || user?.email.toLowerCase() === "myelindi@gmail.com" ? "amber" : "teal"}>{profile?.role === "admin" || user?.is_admin || user?.email.toLowerCase() === "myelindi@gmail.com" ? "ADMIN" : humanizeId(profile?.role ?? "student")}</Pill>
              </Link>

              {/* 2. Edit Profile */}
              <div className="mt-1">
                <Row href="/profile" icon={UserPen} onSelect={close}>
                  Edit Profile
                </Row>
              </div>

              {/* 3. My Simulations */}
              <Row href="/runs" icon={Play} onSelect={close}>
                My Simulations
              </Row>

              {/* 4. More */}
              <button
                type="button"
                onClick={() => setShowMore(true)}
                className={cn(rowClass, "mt-0.5")}
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  <span className="block h-1 w-1 rounded-full bg-current" />
                  <span className="mx-0.5 block h-1 w-1 rounded-full bg-current" />
                  <span className="block h-1 w-1 rounded-full bg-current" />
                </span>
                <span className="min-w-0 flex-1 truncate">More</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" />
              </button>

              {/* 5. Logout */}
              <div className="mt-1 border-t border-line pt-1">
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    close();
                  }}
                  className={cn(rowClass, "hover:bg-rose/[0.09] hover:text-rose hover:translate-x-0.5")}
                >
                  <LogOut className="h-3.5 w-3.5 shrink-0" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
