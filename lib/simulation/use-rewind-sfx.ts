"use client";

import { useRef } from "react";
import { soundEnabled } from "@/lib/sound";

/**
 * Rewind sound effect hook.
 *
 * start() is fully self-contained — it creates the Audio element on demand and
 * plays immediately. This means it works correctly whether called from a
 * synchronous click handler (before any useEffect has run) or from inside a
 * React effect. No ref-initialization race, no useEffect dependency.
 *
 * loop: true so the ~2 s clip covers the full 3-second countdown without gaps.
 * All playback failures are swallowed — the rewind must never depend on audio.
 */

const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REWIND_SFX_URL = BASE_URL
  ? `${BASE_URL}/storage/v1/object/public/simulation-assets/whatsapp-audio-2026-08-28.mp3`
  : `/sounds/whatsapp-audio-2026-08-28.mp3`;

const VOLUME = 0.5;

export function useRewindSFX() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function getOrCreate(): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const el = new Audio(REWIND_SFX_URL);
      el.loop = true;
      el.volume = VOLUME;
      el.preload = "auto";
      audioRef.current = el;
    }
    return audioRef.current;
  }

  function start() {
    if (!soundEnabled()) return;
    const el = getOrCreate();
    if (!el) return;
    try {
      el.currentTime = 0;
      void el.play().catch(() => { });
    } catch { /* never break the rewind */ }
  }

  function stop() {
    const el = audioRef.current;
    if (!el) return;
    try {
      el.pause();
      el.currentTime = 0;
    } catch { /* element may be GC'd on fast unmount */ }
  }

  return { start, stop };
}
