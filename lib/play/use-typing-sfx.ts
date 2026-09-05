"use client";

import { useEffect, useRef } from "react";
import { soundEnabled } from "@/lib/sound";

/**
 * Typing sound effect for ChunkReveal animations.
 *
 * Loads the MP3 from Supabase Storage (public bucket — no credentials needed in the browser).
 * The audio loops while the animation is in progress and stops the moment the last word lands.
 *
 * Design notes:
 *
 * - One HTMLAudioElement is created per hook instance. ChunkReveal is only ever mounted once
 *   per page phase (story, kpi) so there is never more than one active instance at a time.
 * - The element is created lazily on first play(), not at hook mount, so a page that never
 *   starts an animation never allocates the decoder.
 * - `loop: true` avoids a gap if the MP3 ends before the text does. If the sound is shorter
 *   than the animation the browser seamlessly restarts it.
 * - Autoplay: the animation is only triggered after a user interaction (EntryGate "take the
 *   desk" button), so the play() call is inside the browser's allowed autoplay window. A
 *   rejected play() is silently swallowed — the animation must never depend on audio.
 * - Cleanup: `stop()` pauses and resets the element, so a remount or a fast navigation does
 *   not leave audio playing in the background.
 */

const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TYPING_SFX_URL = BASE_URL
  ? `${BASE_URL}/storage/v1/object/public/simulation-assets/typing-sound.mp3`
  : `/sounds/typing-sound.mp3`;

/** Volume — audible but clearly background; the newspaper ceremony is visual-first. */
const VOLUME = 0.4;

export function useTypingSFX() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  /** Ensure the element exists and is ready. Called lazily so we never allocate on the server. */
  function getAudio(): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const el = new Audio(TYPING_SFX_URL);
      el.loop = true;
      el.volume = VOLUME;
      el.preload = "auto";
      audioRef.current = el;
    }
    return audioRef.current;
  }

  /**
   * Start playing. Called when the first word chunk appears.
   * Respects the global sound toggle so a CEO who turned sound off stays unaffected.
   */
  function start() {
    if (!soundEnabled()) return;
    const audio = getAudio();
    if (!audio) return;
    try {
      // Reset position in case a previous run left it mid-track.
      audio.currentTime = 0;
      void audio.play().catch(() => {
        /* Autoplay blocked or no output device — animation continues normally. */
      });
    } catch {
      /* Never break the animation. */
    }
  }

  /**
   * Stop playing. Called when the last word is shown, or when the user skips,
   * or when the component unmounts.
   */
  function stop() {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      /* Ignore — element may already be GC'd during a fast unmount. */
    }
  }

  // Guarantee cleanup if the component using this hook unmounts while audio is still playing
  // (e.g. navigating away mid-animation).
  useEffect(() => {
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { start, stop };
}
