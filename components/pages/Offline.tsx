import { WifiOff, RefreshCw } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Action, Eyebrow } from "@/components/ui/Kit";

/**
 * Offline/No connection page - shown when the application detects
 * the user has lost internet connectivity.
 */
export function Offline() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-void">
      <div className="aurora" />
      <div className="grid-lines absolute inset-0" />

      <div className="relative z-20 px-5 pt-7 sm:px-8">
        <div className="inline-flex">
          <Logo priority />
        </div>
      </div>

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-2xl text-center">
          <div className="mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-full border-2 border-line bg-void/60">
            <WifiOff className="h-16 w-16 text-faint" strokeWidth={1.5} />
          </div>

          <Eyebrow accent="cyan" className="justify-center">
            Connection lost
          </Eyebrow>

          <h1 className="display mt-5 text-[clamp(2rem,4vw,3rem)] leading-[1.05] text-ink">
            You&apos;re currently{" "}
            <span className="text-grad">offline.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-dim">
            It looks like you&apos;ve lost your internet connection. Check your
            network settings and try again. Don&apos;t worry — your progress is
            saved and will be here when you reconnect.
          </p>

          <div className="mt-10">
            <Action onClick={handleRetry} size="lg" className="w-full sm:w-auto">
              <RefreshCw className="h-4 w-4" />
              Retry connection
            </Action>
          </div>

          <div className="mt-12 space-y-4">
            <div className="rounded-2xl border border-line bg-void/40 p-6 text-left">
              <p className="text-[13px] font-medium text-ink">
                Troubleshooting tips:
              </p>
              <ul className="mt-3 space-y-2 text-[13px] text-dim">
                <li className="flex items-start gap-2">
                  <span className="text-cyan">•</span>
                  Check your Wi-Fi or mobile data connection
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan">•</span>
                  Try disabling airplane mode if it&apos;s on
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan">•</span>
                  Restart your router or modem
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan">•</span>
                  Try accessing other websites to confirm connectivity
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-emerald/30 bg-emerald/5 p-6">
              <p className="text-[13px] font-medium text-emerald">
                Your data is safe
              </p>
              <p className="mt-2 text-[13px] text-dim">
                All your allocations, decisions, and progress are automatically
                saved. Once you&apos;re back online, everything will be exactly as
                you left it.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
