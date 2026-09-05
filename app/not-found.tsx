"use client";

import Link from "next/link";
import { Home, Search, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Action, Eyebrow } from "@/components/ui/Kit";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-void">
      <div className="aurora" />
      <div className="grid-lines absolute inset-0" />

      <div className="relative z-20 px-5 pt-7 sm:px-8">
        <Link href="/" aria-label="Myelin home" className="inline-flex">
          <Logo priority />
        </Link>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-2xl text-center">
          <div className="mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-full border-2 border-line bg-void/60">
            <Search className="h-16 w-16 text-faint" strokeWidth={1.5} />
          </div>

          <Eyebrow accent="amber" className="justify-center">
            404 Error
          </Eyebrow>

          <h1 className="display mt-5 text-[clamp(2rem,4vw,3rem)] leading-[1.05] text-ink">
            This page took an{" "}
            <span className="text-grad">unplanned sabbatical.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-dim">
            We searched high and low, checked the quarterly reports, and even asked
            the CEO — but this page doesn&apos;t exist. It might have moved, been
            retired, or perhaps it never made it past the pilot phase.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Action href="/" size="lg" className="w-full sm:w-auto">
              <Home className="h-4 w-4" />
              Back to home
            </Action>
            <button
              onClick={() => window.history.back()}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-void/40 px-6 py-3.5 text-[14px] font-medium text-ink transition-colors hover:border-teal/40 hover:bg-void/60 sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
              Go back
            </button>
          </div>

          <div className="mt-12 rounded-2xl border border-line bg-void/40 p-6">
            <p className="text-[13px] text-faint">
              Looking for something specific?
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[13px]">
              <Link
                href="/simulations"
                className="text-dim underline decoration-line-2 underline-offset-4 transition-colors hover:text-ink hover:decoration-teal"
              >
                Simulations
              </Link>
              <span className="text-line">•</span>
              <Link
                href="/login"
                className="text-dim underline decoration-line-2 underline-offset-4 transition-colors hover:text-ink hover:decoration-teal"
              >
                Log in
              </Link>
              <span className="text-line">•</span>
              <Link
                href="/signup"
                className="text-dim underline decoration-line-2 underline-offset-4 transition-colors hover:text-ink hover:decoration-teal"
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
