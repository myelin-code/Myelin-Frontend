"use client";

import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";
import { Action, Container } from "@/components/ui/Kit";
import { Masthead } from "@/components/layout/PageChrome";
import { usePlaySimulationHref } from "@/components/play/entry";
import { cn } from "@/lib/utils";

const conceptCards = [
  {
    label: "THE LOOP",
    line1: "Decide → See →",
    line2: "Decide again",
  },
  {
    label: "THE PROMISE",
    line1: "Practice before",
    line2: "it's real",
  },
  {
    label: "THE STANCE",
    line1: "A mirror, not a",
    line2: "judge",
  },
];

const audienceItems = [
  {
    label: "STUDENTS",
    headline: "Try it before it's real.",
    copy: "Practice the decisions your degree can't ask you to make yet.",
  },
  {
    label: "UNIVERSITIES",
    headline: "Turn lessons into real choices.",
    copy: "A place to use what's already being taught in class — not replace it.",
  },
  {
    label: "COMPANIES",
    headline: "See how people actually decide.",
    copy: "Practice judgment before the stakes — and the cost of a bad call — are real.",
  },
];

export function Hero() {
  const trySimulationHref = usePlaySimulationHref();

  return (
    <section
      id="home"
      className="relative flex min-h-svh flex-col border-b border-line pt-[68px]"
    >
      <div className="grid-lines absolute inset-0 pointer-events-none" />

      <Masthead section="Decision Intelligence" />

      {/* ── Main Hero Row ────────────────────────────────────────────── */}
      <Container
        wide
        className="relative z-10 grid flex-1 items-center gap-y-12 py-[clamp(2.5rem,6vh,5.5rem)] lg:grid-cols-[1.1fr_auto] lg:gap-x-16"
      >
        <div className="rise">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1 border border-line rounded-full bg-panel">
            <span className="h-1.5 w-1.5 rounded-full bg-teal live-dot" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-teal font-semibold">
              MYELIN · DECISION INTELLIGENCE
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="display text-balance text-[clamp(2.75rem,5.8vw,4.75rem)] text-ink font-normal leading-[1.08] lg:max-w-[18ch]">
            You decide.
            <br />
            Then you see
            <br />
            <span className="italic text-teal">what happens.</span>
          </h1>

          {/* Supporting Text & CTAs */}
          <div className="rise rise-1 mt-[clamp(1.75rem,4vh,2.25rem)] max-w-[48ch] border-t border-line pt-6">
            <p className="text-pretty text-[16.5px] leading-[1.7] text-dim">
              Myelin puts you in a real situation. You make the choice — not a
              quiz, not a lecture. You watch what happens because of it. Then
              you choose again, a little wiser than before.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Action href={trySimulationHref} size="lg">
                Try a situation
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Action>
              <Action href="#how" variant="outline" size="lg">
                How Myelin works
              </Action>
            </div>
          </div>
        </div>

        {/* ── Right side: How Any Myelin Situation Works panel ──────── */}
        <div className="rise rise-2 lg:justify-self-end w-full lg:w-auto">
          <div className="w-full lg:w-[27rem] border border-line bg-raise/80 backdrop-blur-md shadow-[0_0_40px_-12px_rgba(36,177,177,0.2)]">
            <div className="border-b border-line px-6 py-4 bg-gradient-to-r from-panel to-transparent">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-teal font-semibold">
                HOW ANY MYELIN SITUATION WORKS
              </p>
              <p className="display text-[1.2rem] font-medium text-ink mt-0.5">
                The same loop, every time
              </p>
            </div>

            <div className="divide-y divide-line">
              <div className="px-6 py-4 transition-colors hover:bg-panel">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-semibold text-teal">
                    01 —
                  </span>
                  <h3 className="font-mono text-xs font-semibold tracking-wider text-ink uppercase">
                    DECIDE
                  </h3>
                </div>
                <p className="text-[13.5px] leading-relaxed text-dim">
                  You&apos;re given a real situation and you choose what to do.
                </p>
              </div>

              <div className="px-6 py-4 transition-colors hover:bg-panel">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-semibold text-teal">
                    02 —
                  </span>
                  <h3 className="font-mono text-xs font-semibold tracking-wider text-ink uppercase">
                    SEE WHAT HAPPENS
                  </h3>
                </div>
                <p className="text-[13.5px] leading-relaxed text-dim">
                  The situation changes because of your choice — sometimes right
                  away, sometimes later.
                </p>
              </div>

              <div className="px-6 py-4 transition-colors hover:bg-panel">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-semibold text-teal">
                    03 —
                  </span>
                  <h3 className="font-mono text-xs font-semibold tracking-wider text-ink uppercase">
                    ADAPT
                  </h3>
                </div>
                <p className="text-[13.5px] leading-relaxed text-dim">
                  New information shows up. What you knew before isn&apos;t the
                  whole picture anymore.
                </p>
              </div>

              <div className="px-6 py-4 transition-colors hover:bg-panel">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-semibold text-teal">
                    04 —
                  </span>
                  <h3 className="font-mono text-xs font-semibold tracking-wider text-ink uppercase">
                    DECIDE AGAIN
                  </h3>
                </div>
                <p className="text-[13.5px] leading-relaxed text-dim">
                  You choose again — wiser this time, because you felt what the
                  last choice cost.
                </p>
              </div>
            </div>

            <div className="border-t border-line px-6 py-3 bg-panel/50 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 font-mono text-[11px] text-teal">
                <RotateCcw className="h-3.5 w-3.5" />
                back to Decide
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-teal live-dot" />
            </div>
          </div>
        </div>
      </Container>

      {/* ── Three Supporting Concept Cards ──────────────────────────── */}
      <div className="border-t border-line bg-panel/30">
        <Container wide className="py-8">
          <div className="grid gap-4 sm:grid-cols-3">
            {conceptCards.map((card) => (
              <div
                key={card.label}
                className="border border-line bg-raise/50 px-6 py-5 transition-colors hover:border-line-2 hover:bg-panel"
              >
                <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-teal font-semibold">
                  {card.label}
                </p>
                <p className="display text-[1.35rem] font-medium text-ink mt-2 leading-snug">
                  {card.line1}
                  <br />
                  {card.line2}
                </p>
              </div>
            ))}
          </div>
        </Container>
      </div>

      {/* ── Audience Section ────────────────────────────────────────── */}
      <div id="audience" className="border-t border-line bg-void relative">
        <Container wide className="py-[clamp(3.5rem,6vh,5rem)]">
          <div className="mb-10">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-teal font-semibold">
              FOR EVERY DECISION MAKER
            </p>
            <h2 className="display text-[clamp(1.75rem,3.5vw,2.75rem)] text-ink font-normal mt-2">
              Built for those who practice <span className="italic text-teal">judgment.</span>
            </h2>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {audienceItems.map((item) => (
              <div
                key={item.label}
                className="border border-line bg-raise/60 p-6 sm:p-7 flex flex-col justify-between transition-colors hover:bg-panel"
              >
                <div>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-teal font-semibold">
                    {item.label}
                  </span>
                  <h3 className="display text-[1.35rem] text-ink font-medium mt-3 leading-snug">
                    {item.headline}
                  </h3>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-dim">
                    {item.copy}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </div>
    </section>
  );
}
