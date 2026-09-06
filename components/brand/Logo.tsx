import { cn } from "@/lib/utils";

type LogoProps = {
  /** `lockup` = glyph + wordmark side by side, `glyph` = the M only. */
  variant?: "lockup" | "glyph";
  className?: string;
  priority?: boolean;
};

/**
 * Renders the Myelin logo matching the reference design with SVG icon and text.
 */
export function Logo({
  variant = "lockup",
  className = "",
  priority = false,
}: LogoProps) {
  if (variant === "glyph") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={cn("h-7 w-auto", className)}
        aria-label="Myelin"
      >
        <path
          d="M3 18V6l4.5 6 4.5-6 4.5 6 4.5-6v12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[#14b8a6]"
        />
      </svg>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-[26px] w-[26px] shrink-0"
        aria-hidden
      >
        <path
          d="M3 18V6l4.5 6 4.5-6 4.5 6 4.5-6v12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[#14b8a6]"
        />
      </svg>
      <span
        className="text-[15px] font-semibold uppercase tracking-[0.08em] text-[#14b8a6]"
        aria-hidden
        style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      >
        MYELIN
      </span>
      <span className="sr-only">Myelin</span>
    </span>
  );
}
