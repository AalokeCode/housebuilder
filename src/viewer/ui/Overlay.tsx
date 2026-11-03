"use client";

import {
  ArrowLeft,
  Box,
  Camera,
  CircleHelp,
  Footprints,
  Info,
  Map as MapIcon,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompiledHouse } from "@/domain/compiled";
import { formatDuration, guidedSeconds, roomInfos, type GuidedStop, type TourPhoto } from "@/domain/tour-model";
import { PlanSvg } from "@/tour-ui/PlanSvg";
import { Sheet } from "@/tour-ui/Sheet";
import { TourDetails } from "@/tour-ui/TourDetails";
import { readPrefs, writePrefs, type Quality } from "../prefs";
import { useTour } from "../store";
import { travelTo, type GuidedTour } from "../tour-flow";
import { Joystick } from "./Joystick";
import { Subtitles } from "./Subtitles";

interface Props {
  house: CompiledHouse;
  photos: TourPhoto[];
  stops: GuidedStop[];
  guide: GuidedTour;
  room: string | null;
  ready: boolean;
  voice: boolean;
  onVoice: (on: boolean) => void;
  quality: Quality;
  onQuality: (q: Quality) => void;
  reducedMotion: boolean;
  onExit: () => void;
  onDetails: () => void;
}

export const glass = "bg-neutral-950/65 text-white ring-1 ring-white/10 backdrop-blur-md";
export const iconBtn = `${glass} pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-150 hover:bg-neutral-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300`;
const tool =
  "pointer-events-auto flex size-10 shrink-0 items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";
const chip =
  "pointer-events-auto shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";

/** Black cover during fade-cuts between rooms. Opacity-only transition (GPU, no layout). */
function Fade({ reduced }: { reduced: boolean }) {
  const fading = useTour((s) => s.fading);
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 bg-neutral-950 transition-opacity ease-out ${reduced ? "duration-75" : "duration-200"} ${fading ? "opacity-100" : "opacity-0"}`}
    />
  );
}

function Loading({ ready }: { ready: boolean }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setShown(false), 350);
    return () => clearTimeout(t);
  }, [ready]);
  if (!shown) return null;
  return (
    <div
      className={`pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral-950 transition-opacity duration-300 ${ready ? "opacity-0" : "opacity-100"}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-white/80">
        <span className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-amber-300" />
        <p className="text-sm">Preparing the 3D model…</p>
      </div>
    </div>
  );
}

function Hints({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="pointer-events-auto absolute inset-x-3 top-20 z-20 mx-auto max-w-sm sm:top-24"
      role="dialog"
      aria-label="How to explore"
    >
      <div className={`${glass} rounded-2xl p-4 shadow-xl`}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">How to explore</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tips"
            className="flex size-9 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            <X className="size-4" />
          </button>
        </div>
        <ul className="space-y-1.5 text-[13px] text-white/80">
          <li className="pointer-fine:hidden">Drag anywhere to look around</li>
          <li className="pointer-fine:hidden">Use the joystick to walk</li>
          <li className="pointer-coarse:hidden">Drag to look · W A S D or arrow keys to walk</li>
          <li>Tap a white ring on the floor to step there</li>
          <li>Open the map (bottom left) and tap a room to jump there</li>
          <li>Tools sit bottom right: guided tour, walk, dollhouse, photo compare, voice and room info</li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-full bg-amber-300 py-2.5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function GuidedBar({ stops, guide }: { stops: GuidedStop[]; guide: GuidedTour }) {
  const guided = useTour((s) => s.guided);
  const stop = useTour((s) => s.stop);
  const s = stops[stop];
  if (guided === "ended") {
    return (
      <div className={`${glass} pointer-events-auto mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-3xl p-4 text-center`}>
        <p className="text-sm font-semibold">That&apos;s the tour</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => guide.start()}
            className={`${chip} inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/20`}
          >
            <RotateCcw className="size-4" /> Replay
          </button>
          <button type="button" onClick={() => guide.exit()} className={`${chip} bg-amber-300 text-neutral-950 hover:bg-amber-200`}>
            Explore yourself
          </button>
        </div>
      </div>
    );
  }
  const playing = guided === "playing";
  return (
    <div className={`${glass} pointer-events-auto mx-auto flex w-full max-w-md items-center gap-1 rounded-full p-1.5`}>
      <button
        type="button"
        onClick={() => guide.prev()}
        disabled={stop === 0}
        aria-label="Previous room"
        className="flex size-10 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <SkipBack className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => (playing ? guide.pause() : guide.resume())}
        aria-label={playing ? "Pause guided tour" : "Resume guided tour"}
        className="flex size-11 items-center justify-center rounded-full bg-amber-300 text-neutral-950 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
      </button>
      <button
        type="button"
        onClick={() => guide.next()}
        aria-label="Next room"
        className="flex size-10 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <SkipForward className="size-4" />
      </button>
      <div className="min-w-0 flex-1 px-2">
        <p className="truncate text-sm font-medium">{s?.title}</p>
        <div className="mt-1 flex gap-1" aria-label={`Stop ${stop + 1} of ${stops.length}`}>
          {stops.map((x, i) => (
            <span
              key={x.hotspot}
              className={`h-1 flex-1 rounded-full ${i < stop ? "bg-amber-300/70" : i === stop ? "bg-amber-300" : "bg-white/20"}`}
            />
          ))}
        </div>
      </div>
      <button type="button" onClick={() => guide.exit()} className={`${chip} bg-white/10 hover:bg-white/20`}>
        Exit
      </button>
    </div>
  );
}

function PhotoBar({ house, photos }: { house: CompiledHouse; photos: TourPhoto[] }) {
  const photo = useTour((s) => s.photo);
  const [showOriginal, setShowOriginal] = useState(false);
  const cams = house.photoCams;
  const i = cams.findIndex((c) => c.photo === photo);
  const original = photos.find((p) => p.id === photo);
  const go = (d: number) => {
    setShowOriginal(false);
    useTour.getState().showPhoto(cams[(i + d + cams.length) % cams.length].photo);
  };
  return (
    <>
      {showOriginal && original && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={original.src}
            alt="Original listing photo"
            width={original.w}
            height={original.h}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}
      <div className={`${glass} pointer-events-auto relative mx-auto flex w-full max-w-md items-center gap-1 rounded-full p-1.5`}>
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous photo view"
          className="flex size-10 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          <SkipBack className="size-4" />
        </button>
        <div className="flex flex-1 justify-center rounded-full bg-white/10 p-0.5" role="radiogroup" aria-label="Compare">
          <button
            type="button"
            role="radio"
            aria-checked={!showOriginal}
            onClick={() => setShowOriginal(false)}
            className={`${chip} flex-1 ${!showOriginal ? "bg-white text-neutral-950" : "text-white/80"}`}
          >
            3D model
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={showOriginal}
            disabled={!original}
            onClick={() => setShowOriginal(true)}
            className={`${chip} flex-1 disabled:opacity-40 ${showOriginal ? "bg-emerald-300 text-neutral-950" : "text-white/80"}`}
          >
            Actual photo
          </button>
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next photo view"
          className="flex size-10 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          <SkipForward className="size-4" />
        </button>
        <button type="button" onClick={() => useTour.getState().setMode("walk")} className={`${chip} bg-white/10 hover:bg-white/20`}>
          Done
        </button>
      </div>
    </>
  );
}

function MiniPlan({ house, onGo, onClose }: { house: CompiledHouse; onGo: (room: string) => void; onClose: () => void }) {
  const pose = useTour((s) => s.pose);
  const mode = useTour((s) => s.mode);
  return (
    <div className={`${glass} pointer-events-auto w-[min(78vw,260px)] rounded-2xl p-3 shadow-xl`}>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Plan · schematic</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide plan"
          className="flex size-8 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          <X className="size-4" />
        </button>
      </div>
      <PlanSvg
        house={house}
        current={pose.room}
        pose={mode === "walk" ? pose : null}
        onSelect={onGo}
        className="h-auto w-full text-white"
      />
      <p className="mt-1 text-[11px] text-white/50">Tap a room to go there. Hatched = estimated.</p>
    </div>
  );
}

export function Overlay({
  house,
  photos,
  stops,
  guide,
  room,
  ready,
  voice,
  onVoice,
  quality,
  onQuality,
  reducedMotion,
  onExit,
  onDetails,
}: Props) {
  const mode = useTour((s) => s.mode);
  const guided = useTour((s) => s.guided);
  const infos = useMemo(() => roomInfos(house), [house]);
  const roomInfo = infos.find((r) => r.id === room);
  // client-only component (viewer is ssr:false), so window is available in initialisers
  const [plan, setPlan] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const [info, setInfo] = useState(false);
  const [hintsSeen] = useState(() => readPrefs().hintsSeen);
  /** null = automatic: show once the scene is ready, for first-time visitors */
  const [hintsOpen, setHints] = useState<boolean | null>(null);
  const hints = hintsOpen ?? (ready && !hintsSeen);
  const [toast, setToast] = useState<string | null>(null);
  const duration = useMemo(() => formatDuration(guidedSeconds(house)), [house]);
  const shell = useRef<HTMLDivElement>(null);

  // corners slide in from their edges once the scene is ready (GSAP; transform/opacity only, skipped for reduced motion)
  useGSAP(
    () => {
      if (!ready || reducedMotion) return;
      gsap
        .timeline({ defaults: { ease: "power3.out", duration: 0.55 } })
        .from("[data-anim='tl']", { x: -18, autoAlpha: 0 })
        .from("[data-anim='bl']", { x: -18, autoAlpha: 0 }, "-=0.4")
        .from("[data-anim='br']", { x: 18, autoAlpha: 0 }, "<")
        .from("[data-anim='bc']", { y: 16, autoAlpha: 0 }, "-=0.3");
    },
    { scope: shell, dependencies: [ready, reducedMotion] },
  );

  const closeHints = () => {
    setHints(false);
    writePrefs({ hintsSeen: true });
  };

  const goRoom = useCallback(
    (id: string) => {
      if (useTour.getState().guided !== "off") guide.exit();
      const stop = stops.find((s) => s.room === id);
      const h = house.hotspots.find((x) => x.room === id);
      if (stop) travelTo(house, stop.pos, stop.yaw);
      else if (h) travelTo(house, [h.pos[0], h.pos[2]]);
    },
    [guide, house, stops],
  );

  // guided keyboard: space pause/resume, ←/→ prev/next
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [role='dialog']")) return;
      const g = useTour.getState().guided;
      if (g === "off") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (g === "playing") guide.pause();
        else guide.resume();
      } else if (e.key === "ArrowRight") guide.next();
      else if (e.key === "ArrowLeft") guide.prev();
      else if (e.key === "Escape") guide.exit();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [guide]);

  const share = async () => {
    const url = new URL(window.location.href);
    url.search = "";
    if (room) url.searchParams.set("room", room);
    const data = { title: house.title, url: url.toString() };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(data.url);
        setToast("Link copied");
      }
    } catch {
      /* share sheet dismissed */
    }
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  const status = mode === "photo" ? "Photo view" : mode === "dollhouse" ? "Dollhouse overview" : (roomInfo?.name ?? "Overview");

  return (
    <div ref={shell} className="pointer-events-none absolute inset-0">
      <Fade reduced={reducedMotion} />
      <Loading ready={ready} />

      <div className="absolute inset-0 flex flex-col justify-between gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 sm:pb-5 sm:pt-5">
        {/* top-left: back + where you are. Nothing else up top — the view stays clear. */}
        <header data-anim="tl" className="flex items-start gap-2">
          <button type="button" onClick={onExit} className={iconBtn} aria-label="Back to property details">
            <ArrowLeft className="size-5" />
          </button>
          <div className={`${glass} pointer-events-auto min-w-0 max-w-[min(70vw,22rem)] rounded-2xl px-3.5 py-2 sm:px-4`}>
            <h1 className="truncate text-sm font-semibold leading-tight">{house.title}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-white/70">
              <span className="truncate">{status}</span>
              {mode === "walk" && roomInfo?.est && (
                <span className="shrink-0 rounded-full bg-amber-300/15 px-1.5 py-px text-[10px] font-semibold text-amber-200">
                  Estimated
                </span>
              )}
            </p>
          </div>
        </header>

        <Hints open={hints && mode === "walk" && guided === "off"} onClose={closeHints} />

        {/* bottom edge: map (left) · captions + guided/photo player (centre, on the very bottom) · tools + help (right).
            Phones: map/tools row first, captions + player underneath at the bottom edge. */}
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2.5 lg:grid lg:grid-cols-[1fr_minmax(0,28rem)_1fr] lg:gap-4">
          <div data-anim="bl" className="order-1 flex flex-col items-start gap-2 lg:order-none">
            {mode !== "photo" &&
              (plan ? (
                <MiniPlan house={house} onGo={goRoom} onClose={() => setPlan(false)} />
              ) : (
                <button type="button" onClick={() => setPlan(true)} className={iconBtn} aria-label="Show floor plan">
                  <MapIcon className="size-5" />
                </button>
              ))}
          </div>
          <div data-anim="bc" className="order-3 flex basis-full flex-col gap-2 lg:order-none lg:basis-auto">
            <Subtitles />
            {guided !== "off" ? (
              <GuidedBar stops={stops} guide={guide} />
            ) : mode === "photo" ? (
              <PhotoBar house={house} photos={photos} />
            ) : null}
          </div>
          <div data-anim="br" className="order-2 flex flex-col items-end gap-2 lg:order-none">
            {mode === "walk" && guided === "off" && (
              <div className="hidden pointer-coarse:block">
                <Joystick />
              </div>
            )}
            <div className="flex items-center gap-2">
              <div
                className={`${glass} pointer-events-auto flex items-center gap-0.5 rounded-full p-1`}
                role="toolbar"
                aria-label="Tour tools"
              >
                {stops.length > 0 && guided === "off" && (
                  <button
                    type="button"
                    onClick={() => guide.start()}
                    aria-label={`Guided · ${duration}`}
                    title={`Guided tour · ${duration}`}
                    className={`${tool} gap-1.5 bg-amber-300 text-neutral-950 hover:bg-amber-200 sm:w-auto sm:px-3`}
                  >
                    <Play className="size-4 fill-current" />
                    <span className="hidden text-[13px] font-semibold sm:inline">{duration}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => useTour.getState().setMode("walk")}
                  aria-pressed={mode === "walk"}
                  aria-label="Walk"
                  title="Walk"
                  className={`${tool} ${mode === "walk" ? "bg-white text-neutral-950" : "hover:bg-white/10"}`}
                >
                  <Footprints className="size-[18px]" />
                </button>
                <button
                  type="button"
                  onClick={() => useTour.getState().setMode("dollhouse")}
                  aria-pressed={mode === "dollhouse"}
                  aria-label="Dollhouse"
                  title="Dollhouse"
                  className={`${tool} ${mode === "dollhouse" ? "bg-white text-neutral-950" : "hover:bg-white/10"}`}
                >
                  <Box className="size-[18px]" />
                </button>
                {house.photoCams.length > 0 && (
                  <button
                    type="button"
                    onClick={() => useTour.getState().showPhoto(house.photoCams[0].photo)}
                    aria-pressed={mode === "photo"}
                    aria-label="Compare photos"
                    title="Compare with the listing photos"
                    className={`${tool} ${mode === "photo" ? "bg-white text-neutral-950" : "hover:bg-white/10"}`}
                  >
                    <Camera className="size-[18px]" />
                  </button>
                )}
                <span aria-hidden className="mx-0.5 h-5 w-px bg-white/15" />
                <button
                  type="button"
                  onClick={() => onVoice(!voice)}
                  aria-pressed={voice}
                  aria-label={voice ? "Mute voice-over" : "Play voice-over"}
                  title={voice ? "Mute voice-over" : "Play voice-over"}
                  className={`${tool} hover:bg-white/10`}
                >
                  {voice ? <Volume2 className="size-[18px]" /> : <VolumeX className="size-[18px]" />}
                </button>
                <button
                  type="button"
                  onClick={() => setInfo(true)}
                  aria-label="Rooms and model information"
                  title="Rooms, share & settings"
                  className={`${tool} hover:bg-white/10`}
                >
                  <Info className="size-[18px]" />
                </button>
              </div>
              <button type="button" onClick={() => setHints(true)} className={iconBtn} aria-label="How to explore" title="How to explore">
                <CircleHelp className="size-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <p role="status" className={`${glass} absolute left-1/2 top-20 -translate-x-1/2 rounded-full px-4 py-2 text-sm`}>
          {toast}
        </p>
      )}

      <Sheet open={info} title="Rooms & model" onClose={() => setInfo(false)}>
        <TourDetails
          house={house}
          photos={photos}
          current={room}
          onRoom={(id) => {
            setInfo(false);
            goRoom(id);
          }}
          onShare={share}
          onAllDetails={() => {
            setInfo(false);
            onDetails();
          }}
        />
        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">Graphics quality</p>
          <div className="flex rounded-full bg-white/10 p-0.5" role="radiogroup" aria-label="Graphics quality">
            {(["auto", "high", "low"] as Quality[]).map((q) => (
              <button
                key={q}
                type="button"
                role="radio"
                aria-checked={quality === q}
                onClick={() => onQuality(q)}
                className={`${chip} flex-1 capitalize ${quality === q ? "bg-white text-neutral-950" : "text-white/80"}`}
              >
                {q}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/50">Use Low if the tour feels slow on this device.</p>
        </div>
      </Sheet>
    </div>
  );
}
