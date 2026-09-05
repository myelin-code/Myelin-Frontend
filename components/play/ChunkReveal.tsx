"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/play/use-reduced-motion";
import { useTypingSFX } from "@/lib/play/use-typing-sfx";

/**
 * Streams text in word-chunks, the way a generated response arrives -- irregular chunk sizes and
 * gaps, not a steady per-character typewriter. Click/tap skips straight to the full paragraph;
 * reduced-motion shows it complete on first paint.
 *
 * Pass `enableSfx` to play a synchronized typing sound while words are being revealed.
 * The sound starts the moment the first chunk appears and stops exactly when the last word lands
 * (or immediately when the user skips). Audio failures are silenced; the animation is unaffected.
 */
export function ChunkReveal({
  text,
  className,
  onDone,
  enableSfx = false,
}: {
  text: string;
  className?: string;
  onDone?: () => void;
  /** Play the typing SFX while words are being revealed. Default: false. */
  enableSfx?: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const words = text.split(" ");
  const [shown, setShown] = useState(() => (reduced ? words.length : 0));
  const skippedRef = useRef(false);
  const doneFiredRef = useRef(false);
  const sfx = useTypingSFX();

  useEffect(() => {
    doneFiredRef.current = false;
  }, [text]);

  // Stop SFX and fire onDone when all words are shown.
  useEffect(() => {
    if (shown >= words.length && !doneFiredRef.current) {
      doneFiredRef.current = true;
      if (enableSfx) sfx.stop();
      onDone?.();
    }
  }, [shown, words.length, onDone, enableSfx, sfx]);

  useEffect(() => {
    if (reduced) return;
    skippedRef.current = false;
    let i = 0;
    let timeoutId = 0;

    function step() {
      if (skippedRef.current) return;
      const chunk = 1 + Math.floor(Math.random() * 3);
      i = Math.min(words.length, i + chunk);
      setShown(i);
      if (i < words.length) {
        timeoutId = window.setTimeout(step, 60 + Math.random() * 160);
      }
    }
    
    // Start SFX 1 second earlier for better alignment with the design
    if (enableSfx) {
      sfx.start();
      // Delay the first visual word by 1 second so sound and animation align
      timeoutId = window.setTimeout(step, 1000);
    } else {
      // Without SFX, start immediately
      step();
    }
    
    return () => {
      window.clearTimeout(timeoutId);
      // Stop SFX if this effect tears down before the animation completes (text prop changed,
      // reduced-motion toggled, or component unmounting).
      if (enableSfx) sfx.stop();
    };
  // sfx is a stable object from useRef — its identity does not change across renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, reduced, words.length, enableSfx]);

  return (
    <p
      className={`cursor-pointer ${className ?? ""}`}
      title="Click to skip ahead"
      onClick={() => {
        skippedRef.current = true;
        // Stop SFX immediately when user skips — don't let it outlive the visible animation.
        if (enableSfx) sfx.stop();
        setShown(words.length);
      }}
    >
      {words.map((word, i) => (
        // The space after each word is a sibling text node, not trailing content inside the
        // inline-block span -- a trailing space *inside* an inline-block gets collapsed away at
        // the box's own edge (the classic word-by-word-span bug), which is why this can't just be
        // `{word} ` inside the span below.
        <span key={i}>
          <span
            className="chunk-word"
            style={{
              opacity: i < shown ? 1 : 0,
              transform: i < shown ? "translateY(0)" : "translateY(4px)",
            }}
          >
            {word}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
      {shown < words.length && <span className="newsprint-caret" aria-hidden />}
    </p>
  );
}
