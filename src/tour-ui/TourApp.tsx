"use client";

import { ArrowLeft, Box, Images, Play, RotateCcw, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Component, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CompiledHouse, Issue } from "@/domain/compiled";
import { formatDuration, guidedSeconds, guidedStops, tourSummary, type TourPhoto } from "@/domain/tour-model";
import { prefersReducedMotion, webglAvailable } from "@/viewer/prefs";
import type { ViewerStart } from "@/viewer/Viewer";
import { narrator } from "@/viewer/voice/narrator";
import { Gallery } from "./Gallery";
import { PlanSvg } from "./PlanSvg";
import { FactsRow, TourDetails } from "./TourDetails";

const loadViewer = () => import("@/viewer/Viewer").then((m) => m.Viewer);
const Viewer = dynamic(loadViewer, { ssr: false });

type Failure = "webgl" | "context-lost" | "crash";

class CanvasBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[tour] viewer crashed", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface TourAppProps {
  house: CompiledHouse;
  photos: TourPhoto[];
  cover: TourPhoto | null;
  revision: string;
  /** authoring preview: show validation issues above the page */
  issues?: Issue[];
  backHref?: string;
}

const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (fn: () => void) => {
  const m = window.matchMedia(REDUCED);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
};

function readStart(): { start: ViewerStart | null; clean: boolean } {
  const q = new URLSearchParams(window.location.search);
  const start: ViewerStart = {
    cam: q.get("cam") ?? undefined,
    mode: q.get("mode") === "dollhouse" ? "dollhouse" : undefined,
    room: q.get("room") ?? undefined,
    guided: q.get("tour") === "guided",
  };
  const any = start.cam || start.mode || start.room || start.guided || q.get("view") === "3d";
  return { start: any ? start : null, clean: q.get("clean") === "1" };
}

export function TourApp({ house, photos, cover, revision, issues, backHref = "/" }: TourAppProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [start, setStart] = useState<ViewerStart | undefined>();
  const [clean, setClean] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [gallery, setGallery] = useState<number | null>(null);
  const reduced = useSyncExternalStore(subscribeReduced, prefersReducedMotion, () => false);
  const stops = useMemo(() => guidedStops(house), [house]);
  const duration = formatDuration(guidedSeconds(house));
  const roomName = useCallback((id: string | null) => house.rooms.find((r) => r.id === id)?.name ?? null, [house]);

  const enter = useCallback((s: ViewerStart = {}, push = true, screenshot = false) => {
    if (!webglAvailable()) {
      setFailure("webgl");
      return;
    }
    if (s.guided) narrator.unlock(); // inside the click: unlocks speech on iOS
    setStart(s);
    setClean(screenshot);
    setFailure(null);
    setMounted(true);
    setOpen(true);
    if (push) window.history.pushState({ tour3d: true }, "");
  }, []);

  const leave = useCallback(() => {
    if (window.history.state?.tour3d) window.history.back();
    else setOpen(false);
  }, []);

  // deep links open the 3D view directly; otherwise warm the viewer chunk while the visitor reads
  useEffect(() => {
    const { start: s, clean: c } = readStart();
    // URL is external state only readable after hydration (the page itself is prerendered)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s) enter(s, false, c);
    else {
      const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500));
      idle(() => void loadViewer());
    }
  }, [enter]);

  // hardware/browser back closes the 3D view instead of leaving the page
  useEffect(() => {
    const pop = () => setOpen(!!window.history.state?.tour3d);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    return () => void (document.documentElement.style.overflow = "");
  }, [open]);

  const fail = useCallback((f: Failure) => {
    setFailure(f);
    setOpen(false);
    setMounted(false);
  }, []);

  const cta = house.meta.cta;
  const errors = issues?.filter((i) => i.level === "error") ?? [];

  return (
    <div className="min-h-dvh bg-neutral-950 text-white">
      {issues && issues.length > 0 && (
        <details className="border-b border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs text-amber-100" open={errors.length > 0}>
          <summary className="cursor-pointer font-semibold">
            Preview · {house.meta.status} · rev {revision} · {errors.length} error(s), {issues.length - errors.length} warning(s)
          </summary>
          <ul className="mt-2 space-y-0.5 font-mono">
            {issues.map((i, k) => (
              <li key={k}>
                {i.level === "error" ? "✖" : "⚠"} [{i.code}] {i.where}: {i.msg}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* hero */}
      <header className="relative isolate flex min-h-[78dvh] flex-col justify-end overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- pre-sized webp, LCP image
          <img src={cover.src} alt={`Listing photo of the ${roomName(cover.room)?.toLowerCase() ?? "property"}`} width={cover.w} height={cover.h} fetchPriority="high" className="absolute inset-0 -z-10 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-neutral-800 to-neutral-950" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-neutral-950 via-neutral-950/55 to-neutral-950/10" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
          <Link href={backHref} className="flex size-11 items-center justify-center rounded-full bg-neutral-950/60 ring-1 ring-white/10 backdrop-blur-md transition-colors hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" aria-label="All tours">
            <ArrowLeft className="size-5" />
          </Link>
          {cover && <span className="rounded-full bg-neutral-950/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300 ring-1 ring-white/10 backdrop-blur-md">Actual photo</span>}
        </div>

        <div className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-8 sm:pb-12">
          {house.meta.locality && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">{house.meta.locality}</p>}
          <h1 className="max-w-2xl text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">{house.title}</h1>
          <FactsRow house={house} className="mt-3 text-white/85" />
          <p className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-white/70 sm:text-base">{tourSummary(house)}</p>

          {failure && (
            <div role="alert" className="mt-5 flex max-w-xl items-start gap-3 rounded-2xl bg-amber-300/10 p-4 text-sm text-amber-50 ring-1 ring-amber-300/30">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />
              <div className="flex-1">
                <p className="font-medium">{failure === "webgl" ? "3D isn't supported in this browser." : "The 3D view stopped unexpectedly."}</p>
                <p className="mt-0.5 text-amber-50/70">Photos, plan and room details are below.</p>
                {failure !== "webgl" && (
                  <button
                    type="button"
                    onClick={() => {
                      setAttempt((a) => a + 1);
                      enter({});
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <RotateCcw className="size-4" /> Try again
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2.5">
            {stops.length > 0 && failure !== "webgl" && (
              <button
                type="button"
                onClick={() => enter({ guided: true })}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-amber-300 px-6 text-sm font-semibold text-neutral-950 shadow-lg shadow-amber-950/30 transition-colors hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Play className="size-4 fill-current" /> Guided tour · {duration}
              </button>
            )}
            {failure !== "webgl" && (
              <button
                type="button"
                onClick={() => enter({})}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-neutral-950 transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                <Box className="size-4" /> Explore in 3D
              </button>
            )}
            {photos.length > 0 && (
              <button
                type="button"
                onClick={() => setGallery(0)}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-semibold ring-1 ring-white/15 backdrop-blur-md transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                <Images className="size-4" /> Photos ({photos.length})
              </button>
            )}
          </div>
        </div>
      </header>

      {/* details: also the complete non-3D experience */}
      <main id="details" className="mx-auto grid w-full max-w-5xl gap-8 px-4 pb-16 pt-4 sm:px-8 lg:grid-cols-[1fr_340px]">
        <TourDetails house={house} photos={photos} revision={revision} onPhoto={setGallery} onRoom={failure === "webgl" ? undefined : (id) => enter({ room: id })} />
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-3xl bg-white/5 p-4 ring-1 ring-white/10">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">Floor plan · schematic</p>
            <PlanSvg house={house} onSelect={failure === "webgl" ? undefined : (id) => enter({ room: id })} className="h-auto w-full" />
            <p className="mt-2 text-xs text-white/50">Drawn from the 3D model, not to survey accuracy. Hatched rooms are estimated.</p>
          </div>
          {cta && (
            <a
              href={cta.href}
              className="flex h-12 items-center justify-center rounded-full bg-white text-sm font-semibold text-neutral-950 transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              {cta.label}
            </a>
          )}
        </aside>
      </main>

      <Gallery photos={photos} index={gallery} roomName={roomName} onIndex={setGallery} onClose={() => setGallery(null)} />

      {mounted && (
        <div className={`fixed inset-0 z-40 bg-neutral-950 ${open ? "" : "invisible"}`} aria-hidden={!open}>
          <CanvasBoundary key={attempt} onError={() => fail("crash")}>
            <Viewer
              house={house}
              photos={photos}
              active={open}
              start={start}
              clean={clean}
              reducedMotion={reduced}
              onExit={leave}
              onFail={() => fail("context-lost")}
              onDetails={leave}
            />
          </CanvasBoundary>
        </div>
      )}
    </div>
  );
}
