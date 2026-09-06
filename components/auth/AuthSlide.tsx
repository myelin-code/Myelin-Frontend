"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AuthShell } from "@/components/auth/AuthShell";
import { OnboardingProfile } from "@/components/auth/OnboardingProfile";
import { easeOut, photos } from "@/lib/media";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { Action, Eyebrow } from "@/components/ui/Kit";
import { ButtonSpinner } from "@/components/ui/Loading";

type Mode = "login" | "signup";

/**
 * Sliding auth: login = form left + photo right.
 * Signup slides the track so photo is left and form is right.
 *
 * Signup is two screens, not one. Screen 1 is name + email + password and nothing else —
 * it registers the account, which is what surfaces "that address is taken" against the field
 * it belongs to. Screen 2 (`OnboardingProfile`) collects the institution/degree/goals data on
 * an account that already exists, so abandoning it costs the student nothing.
 */
export function AuthSlide({ initialMode }: { initialMode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/simulations";
  const { login, register } = useAuth();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<1 | 2>(1);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // Deferred a tick so this lands via a callback rather than synchronously in the effect
    // body (react-hooks/set-state-in-effect) -- resolves before the next paint regardless.
    queueMicrotask(() => {
      setMode(initialMode);
      setError(null);
    });
  }, [initialMode]);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setStep(1);
    setError(null);
    router.replace(`/${nextMode}?next=${encodeURIComponent(next)}`, {
      scroll: false,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setPending(true);
    try {
      if (mode === "login") {
        const auth = await login({ email, password });
        let isAdmin = !!auth.is_admin;
        if (!isAdmin) {
          try {
            const profile = await api.getProfile();
            if (profile.role === "admin") isAdmin = true;
          } catch (e) {}
        }
        if (isAdmin) {
          router.replace("/admin");
        } else {
          router.replace(next);
        }
      } else {
        await register({ email, password });
        // Save the name against the account *now*, not on the next screen. Screen 2 is
        // designed to be abandonable, and it used to be the only thing that ever persisted
        // the name -- so anyone who closed it ended up with an account the app could only
        // greet by the local part of their email address.
        try {
          await api.updateProfile({ first_name: firstName.trim() || null });
        } catch {
          /* The account exists and the next screen sends it again; never block on this. */
        }
        setStep(2);
      }
    } catch (err) {
      // Backend now returns user-friendly messages, so we primarily rely on those
      // with fallbacks for common scenarios and connection issues
      if (err instanceof ApiError) {
        // Rate limiting - backend provides clear guidance
        if (err.status === 429) {
          setError(
            err.message || 
            "Too many attempts. Please wait a moment before trying again."
          );
        } 
        // Login-specific errors with helpful guidance
        else if (mode === "login" && err.status === 401) {
          // Backend message already includes "no account found" or "wrong credentials"
          setError(
            err.message || 
            "Incorrect email or password. New here? Create an account to get started."
          );
        }
        // Signup-specific errors
        else if (mode === "signup" && err.status === 422) {
          const msg = err.message?.toLowerCase() || "";
          // These checks catch both old and new backend messages
          if (msg.includes("already registered") || msg.includes("already exists")) {
            setError(
              "This email is already registered. Log in instead, or use a different email address."
            );
          } else if (msg.includes("password") && (msg.includes("weak") || msg.includes("short") || msg.includes("8 character"))) {
            setError(
              "Password is too weak. Please use at least 8 characters with a mix of letters and numbers."
            );
          } else if (msg.includes("email") && msg.includes("invalid")) {
            setError("Please enter a valid email address.");
          } else {
            setError(err.message || "Unable to create account. Please check your information.");
          }
        }
        // Generic API errors - use backend message as-is (it's now user-friendly)
        else {
          setError(
            err.message || 
            (mode === "login" 
              ? "Unable to log in. Please check your credentials and try again." 
              : "Unable to create account. Please try again.")
          );
        }
      } else {
        // Network or connection errors
        setError(
          "Unable to reach the server. Please check your connection and try again."
        );
      }
    } finally {
      setPending(false);
    }
  }

  if (mode === "signup" && step === 2) {
    return (
      <OnboardingProfile
        firstName={firstName.trim()}
        onFinish={() => router.replace(next)}
      />
    );
  }

  return (
    <AuthShell>
      <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-line bg-void/60 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
        {/* Mobile: stacked photo + form */}
        <div className="lg:hidden">
          <PhotoPanel mode={mode} onSwitch={switchMode} compact />
          <div className="p-6 sm:p-8">
            <AuthForm
              mode={mode}
              firstName={firstName}
              email={email}
              password={password}
              error={error}
              pending={pending}
              onFirstName={setFirstName}
              onEmail={setEmail}
              onPassword={setPassword}
              onSubmit={onSubmit}
              onSwitch={switchMode}
              next={next}
            />
          </div>
        </div>

        {/* Desktop: sliding track — login [form|photo], signup [photo|form] */}
        <div className="relative hidden min-h-[36rem] overflow-hidden lg:block">
          <motion.div
            className="flex h-full w-[200%]"
            animate={{ x: mode === "login" ? "0%" : "-50%" }}
            transition={{ duration: 0.7, ease: easeOut }}
          >
            {/* Panel A — login layout */}
            <div
              className="grid h-full w-1/2 grid-cols-2"
              aria-hidden={mode !== "login"}
              inert={mode !== "login" ? true : undefined}
            >
              <div className="flex items-center p-8 xl:p-10">
                <AuthForm
                  mode="login"
                  firstName={firstName}
                  email={email}
                  password={password}
                  error={mode === "login" ? error : null}
                  pending={pending && mode === "login"}
                  onFirstName={setFirstName}
                  onEmail={setEmail}
                  onPassword={setPassword}
                  onSubmit={onSubmit}
                  onSwitch={switchMode}
                  next={next}
                  hideSwitch
                />
              </div>
              <PhotoPanel mode="login" onSwitch={switchMode} />
            </div>

            {/* Panel B — signup layout */}
            <div
              className="grid h-full w-1/2 grid-cols-2"
              aria-hidden={mode !== "signup"}
              inert={mode !== "signup" ? true : undefined}
            >
              <PhotoPanel mode="signup" onSwitch={switchMode} />
              <div className="flex items-center p-8 xl:p-10">
                <AuthForm
                  mode="signup"
                  firstName={firstName}
                  email={email}
                  password={password}
                  error={mode === "signup" ? error : null}
                  pending={pending && mode === "signup"}
                  onFirstName={setFirstName}
                  onEmail={setEmail}
                  onPassword={setPassword}
                  onSubmit={onSubmit}
                  onSwitch={switchMode}
                  next={next}
                  hideSwitch
                />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </AuthShell>
  );
}

function AuthForm({
  mode,
  firstName,
  email,
  password,
  error,
  pending,
  onFirstName,
  onEmail,
  onPassword,
  onSubmit,
  onSwitch,
  next,
  hideSwitch = false,
}: {
  mode: Mode;
  firstName: string;
  email: string;
  password: string;
  error: string | null;
  pending: boolean;
  onFirstName: (v: string) => void;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onSwitch: (m: Mode) => void;
  next: string;
  hideSwitch?: boolean;
}) {
  const isLogin = mode === "login";
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-4">
        <Eyebrow accent={isLogin ? "cyan" : "violet"}>
          {isLogin ? "Welcome back" : "Step 1 of 2"}
        </Eyebrow>
        {!isLogin && <span className="eyebrow text-faint">30 seconds</span>}
      </div>
      <h1 className="display mt-5 text-[clamp(1.7rem,3vw,2.25rem)] leading-[1.05] text-ink">
        {isLogin ? (
          <>
            Log in to <span className="text-grad">Myelin</span>
          </>
        ) : (
          <>
            Create your <span className="text-grad">Myelin</span> account
          </>
        )}
      </h1>
      <p className="mt-3 text-[14.5px] text-dim">
        {isLogin
          ? "Pick up where you left your last decision."
          : "Name, email, password. We'll personalize the rest on the next screen."}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        {!isLogin && (
          <div>
            <label className="eyebrow text-faint" htmlFor={`${mode}-first-name`}>
              First name <span className="text-rose">*</span>
            </label>
            <div className="relative mt-3">
              <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                id={`${mode}-first-name`}
                name="given-name"
                type="text"
                required
                maxLength={120}
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => onFirstName(e.target.value)}
                placeholder="Enter your first name"
                className="w-full rounded-full border border-line bg-[var(--panel-2)] py-3.5 pl-11 pr-5 text-[14.5px] text-ink outline-none transition-colors placeholder:text-faint focus:border-teal/60"
              />
            </div>
          </div>
        )}

        <div>
          <label className="eyebrow text-faint" htmlFor={`${mode}-email`}>
            Email <span className="text-rose">*</span>
          </label>
          <div className="relative mt-3">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              id={`${mode}-email`}
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => onEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-full border border-line bg-[var(--panel-2)] py-3.5 pl-11 pr-5 text-[14.5px] text-ink outline-none transition-colors placeholder:text-faint focus:border-teal/60"
            />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="eyebrow text-faint" htmlFor={`${mode}-password`}>
              Password <span className="text-rose">*</span>
            </label>
            {isLogin && (
              <Link
                href="/forgot-password"
                className="text-[12.5px] text-dim underline decoration-line-2 underline-offset-4 transition-colors hover:text-ink hover:decoration-teal"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <div className="relative mt-3">
            <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <input
              id={`${mode}-password`}
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={isLogin ? undefined : 8}
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              placeholder={isLogin ? "••••••••" : "At least 8 characters"}
              className="w-full rounded-full border border-line bg-[var(--panel-2)] py-3.5 pl-11 pr-11 text-[14.5px] text-ink outline-none transition-colors placeholder:text-faint focus:border-teal/60"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              tabIndex={-1}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-faint transition-colors hover:text-ink"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {error && (
          <p className="rounded-xl border border-rose/30 bg-rose/[0.07] px-4 py-3 text-[13px] text-rose">
            {error}
          </p>
        )}

        {/* The label already changes while the request is open; the spinner is what says the
            wait is *live* rather than a button stuck on a different word. Same swap on both
            sides so the control never changes width mid-request. */}
        <Action type="submit" className="w-full" size="lg" disabled={pending}>
          {pending
            ? isLogin
              ? "Signing in…"
              : "Creating account…"
            : isLogin
              ? "Log in"
              : "Continue"}
          {pending ? <ButtonSpinner /> : <ArrowRight className="h-4 w-4" />}
        </Action>
      </form>

      {!hideSwitch && (
        <p className="mt-7 text-center text-[14px] text-dim">
          {isLogin ? (
            <>
              New here?{" "}
              <button
                type="button"
                onClick={() => onSwitch("signup")}
                className="text-ink underline decoration-line-2 underline-offset-4 transition-colors hover:decoration-teal"
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => onSwitch("login")}
                className="text-ink underline decoration-line-2 underline-offset-4 transition-colors hover:decoration-teal"
              >
                Log in
              </button>
            </>
          )}
        </p>
      )}

      {/* Keep crawlable links for no-JS / SEO */}
      <p className="sr-only">
        <Link href={`/login?next=${encodeURIComponent(next)}`}>Log in</Link>
        <Link href={`/signup?next=${encodeURIComponent(next)}`}>Sign up</Link>
      </p>
    </div>
  );
}

function PhotoPanel({
  mode,
  onSwitch,
  compact = false,
}: {
  mode: Mode;
  onSwitch: (m: Mode) => void;
  compact?: boolean;
}) {
  const isLogin = mode === "login";
  const src = isLogin ? photos.teamDecide : photos.whiteboard;

  return (
    <div
      className={`photo-panel relative overflow-hidden ${compact ? "h-52" : "h-full min-h-[36rem]"}`}
    >
      <Image
        src={src}
        alt={
          isLogin
            ? "Operators deciding around a table"
            : "Team planning strategy on a whiteboard"
        }
        fill
        priority
        sizes="(min-width: 1024px) 40vw, 100vw"
        className="object-cover"
      />
      {/* Bottom-weighted, so the photograph reads across the top two-thirds and the copy
          sits on enough ground to be legible. A single ramp from the top left the image
          invisible in the dark theme and the words unreadable in the light one. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(4,14,12,0.12) 0%, rgba(4,14,12,0.42) 45%, rgba(4,14,12,0.9) 100%)",
        }}
      />

      <div
        className={`absolute inset-x-0 ${compact ? "bottom-0 p-5" : "bottom-0 p-8 xl:p-10"}`}
      >
        <Eyebrow accent={isLogin ? "pink" : "emerald"}>
          {isLogin ? "New operator?" : "Already running?"}
        </Eyebrow>
        <p
          className={`display mt-3 leading-[1.15] text-ink ${compact ? "text-[22px]" : "text-[28px]"}`}
        >
          {isLogin ? (
            <>
              Create an account and{" "}
              <span className="text-grad-iris">open Q1.</span>
            </>
          ) : (
            <>
              Welcome back —{" "}
              <span className="text-grad-iris">resume the run.</span>
            </>
          )}
        </p>
        <p className={`mt-3 max-w-sm text-dim ${compact ? "text-[12.5px]" : "text-[14px]"}`}>
          {isLogin
            ? "Four quarters of company pressure, compressed into consequential choices."
            : "Your allocations, crisis, and lock state wait where you left them."}
        </p>

        <button
          type="button"
          onClick={() => onSwitch(isLogin ? "signup" : "login")}
          className="sweep group relative mt-6 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium text-white"
          style={{ background: "var(--grad-primary)" }}
        >
          {isLogin ? "Sign up" : "Log in"}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}
