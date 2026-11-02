"use client";

import { Move3d, Pause, Play, RotateCcw, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useEffect } from "react";
import type { CompiledSite } from "@/domain/site-compiler";
import { useSiteTour } from "../store";
import { chapterNarrator } from "../voice/chapter-narrator";

const btn =
  "inline-flex items-center justify-center rounded-full text-white transition-colors duration-150 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-40";

function Captions({ site }: { site: CompiledSite }) {
  const chapter = useSiteTour((s) => s.chapter);
  const word = useSiteTour((s) => s.word);
  const status = useSiteTour((s) => s.status);
  const ch = site.chapters[chapter];
  if (!ch || status === "idle" || status === "ended") return null;
  return (
    <div className="pointer-events-none mx-auto w-full max-w-2xl px-4" aria-live="polite">
      <div className="rounded-2xl bg-black/55 px-4 py-3 text-center shadow-lg backdrop-blur-md sm:px-6">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/90 sm:text-[11px]">{ch.title}</p>
        <p className="text-[15px] leading-snug sm:text-lg">
          {ch.words.map((w, i) => (
            <span
              key={i}
              className={`transition-colors duration-150 ${
                i === word ? "font-semibold text-amber-200" : i < word || status === "preview" ? "text-white" : "text-white/45"
              }`}
            >
              {w}{" "}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

export function Overlay({ site }: { site: CompiledSite }) {
  const status = useSiteTour((s) => s.status);
  const chapter = useSiteTour((s) => s.chapter);
  const muted = useSiteTour((s) => s.muted);
  const count = site.chapters.length;

  const start = () => {
    chapterNarrator.unlock(); // must run inside the gesture for iOS
    const s = useSiteTour.getState();
    if (s.status === "preview") s.goTo(s.chapter);
    else if (s.status === "paused") s.resume();
    else s.start();
  };
  const toggle = () => {
    const s = useSiteTour.getState();
    if (s.status === "playing") s.pause();
    else start();
  };
  const toggleMute = () => {
    chapterNarrator.unlock();
    useSiteTour.getState().setMuted(!muted);
  };
  const goTo = (i: number) => {
    chapterNarrator.unlock();
    useSiteTour.getState().goTo(i);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      const s = useSiteTour.getState();
      if (e.code === "Space") {
        e.preventDefault();
        if (s.status === "playing") s.pause();
        else if (s.status === "paused") s.resume();
      } else if (e.key === "ArrowRight" && s.status !== "idle") s.next();
      else if (e.key === "ArrowLeft" && s.status !== "idle") s.prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const playing = status === "playing";

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between text-white">
      {/* header */}
      <header className="flex items-start justify-between gap-3 p-3 sm:p-5">
        <div className="pointer-events-auto rounded-2xl bg-black/40 px-4 py-2.5 backdrop-blur-md">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300/90">Drone showcase</p>
          <h1 className="text-base font-semibold leading-tight sm:text-lg">{site.meta.title}</h1>
          {site.meta.location && <p className="text-xs text-white/70">{site.meta.location}</p>}
        </div>
        <button type="button" onClick={toggleMute} className={`${btn} pointer-events-auto h-11 w-11 bg-black/40 backdrop-blur-md`} aria-label={muted ? "Unmute voice-over" : "Mute voice-over"}>
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </header>

      {/* idle / ended splash */}
      {(status === "idle" || status === "ended") && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/60 via-black/20 to-transparent p-6">
          <div className="max-w-md text-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">{status === "ended" ? "Tour complete" : "Aerial tour"}</p>
            <h2 className="mb-3 text-3xl font-semibold leading-tight drop-shadow sm:text-4xl">{site.meta.title}</h2>
            <p className="mb-6 text-sm text-white/80">
              {count} chapters · voice-over with subtitles{status === "ended" ? " · drag to explore" : ""}
            </p>
            <button
              type="button"
              onClick={start}
              className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-neutral-900 shadow-lg transition-colors duration-150 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {status === "ended" ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
              {status === "ended" ? "Replay tour" : "Start tour"}
            </button>
            {site.meta.disclaimer && <p className="mt-6 text-[11px] text-white/60">{site.meta.disclaimer}</p>}
          </div>
        </div>
      )}

      {/* bottom: captions + controls */}
      <footer className="flex flex-col items-center gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-5">
        {status === "paused" && (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 text-xs text-white/85 backdrop-blur-md">
            <Move3d className="h-3.5 w-3.5" /> Paused · drag to orbit
          </p>
        )}
        <Captions site={site} />
        {status !== "idle" && (
          <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/45 px-2 py-1.5 backdrop-blur-md sm:gap-2 sm:px-3">
            <button type="button" className={`${btn} h-10 w-10`} onClick={() => goTo(chapter - 1)} disabled={chapter === 0} aria-label="Previous chapter">
              <SkipBack className="h-4 w-4" />
            </button>
            <button type="button" className={`${btn} h-11 w-11 bg-white/10`} onClick={toggle} aria-label={playing ? "Pause tour" : "Play tour"}>
              {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
            </button>
            <button type="button" className={`${btn} h-10 w-10`} onClick={() => goTo(chapter + 1)} disabled={chapter >= count - 1} aria-label="Next chapter">
              <SkipForward className="h-4 w-4" />
            </button>
            <div className="mx-1 flex items-center gap-1.5 sm:mx-2" role="tablist" aria-label="Chapters">
              {site.chapters.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={i === chapter}
                  aria-label={`Chapter ${i + 1}: ${c.title}`}
                  title={c.title}
                  onClick={() => goTo(i)}
                  className="flex h-6 items-center px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                >
                  <span className={`block h-1.5 rounded-full transition-colors duration-150 ${i === chapter ? "w-5 bg-amber-300" : "w-1.5 bg-white/50 hover:bg-white/80"}`} />
                </button>
              ))}
            </div>
            <span className="hidden pr-1 text-xs tabular-nums text-white/70 sm:inline">
              {chapter + 1} / {count}
            </span>
          </div>
        )}
      </footer>
    </div>
  );
}
