"use client";

import { useEffect } from "react";
import type { CompiledChapter } from "@/domain/site-compiler";
import { useSiteTour } from "../store";
import { chapterNarrator } from "./chapter-narrator";

/** Keeps the narrator in sync with tour state (chapter, play/pause, mute). */
export function useNarrationDriver(chapters: CompiledChapter[]): void {
  const status = useSiteTour((s) => s.status);
  const chapter = useSiteTour((s) => s.chapter);
  const epoch = useSiteTour((s) => s.epoch);
  const muted = useSiteTour((s) => s.muted);

  useEffect(() => {
    if (status !== "playing") {
      chapterNarrator.stop();
      return;
    }
    const st = useSiteTour.getState();
    const ch = chapters[chapter];
    if (!ch || st.speechDone) return;
    chapterNarrator.play(
      ch.words,
      { from: Math.max(0, st.word), muted },
      {
        onWord: (i) => useSiteTour.getState().setWord(i),
        onEnd: () => useSiteTour.getState().markSpeechDone(),
      },
    );
    return () => chapterNarrator.stop();
  }, [status, chapter, epoch, muted, chapters]);

  useEffect(() => () => chapterNarrator.stop(), []);
}
