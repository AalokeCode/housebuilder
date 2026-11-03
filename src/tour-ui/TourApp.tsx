"use client";

import { ArrowLeft, Box, ChevronDown, Images, Play, RotateCcw, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import { Component, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CompiledHouse, Issue } from "@/domain/compiled";
import { formatDuration, guidedSeconds, guidedStops, tourFacts, tourSummary, type TourPhoto } from "@/domain/tour-model";
import { prefersReducedMotion, webglAvailable } from "@/viewer/prefs";
import type { ViewerStart } from "@/viewer/Viewer";
import { narrator } from "@/viewer/voice/narrator";
import { Gallery } from "./Gallery";
import { PlanSvg } from "./PlanSvg";
import { FactsRow, TourDetails } from "./TourDetails";

gsap.registerPlugin(useGSAP, ScrollTrigger);

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
  /** hero on screen → the dollhouse preview keeps rendering; scrolled away → it pauses */
  const [heroVisible, setHeroVisible] = useState(true);
  const hero = useRef<HTMLElement>(null);
  const root = useRef<HTMLDivElement>(null);

  // entrances (GSAP): top bar drops in, the card slides in from the side with its rows staggered, details sections
  // rise in as they scroll into view. Transform/opacity only; nothing animated here uses CSS transitions on the same
  // properties (buttons only transition colours). Skipped entirely for reduced motion.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const wide = window.matchMedia("(min-width: 1024px)").matches;
        gsap
          .timeline({ defaults: { ease: "power3.out" } })
          .from("[data-anim='nav']", { y: -14, autoAlpha: 0, duration: 0.6 })
          .from("[data-anim='card']", wide ? { x: 48, autoAlpha: 0, duration: 0.8 } : { y: 40, autoAlpha: 0, duration: 0.8 }, "-=0.35")
          .from("[data-anim='card'] [data-anim-item]", { y: 14, autoAlpha: 0, duration: 0.5, stagger: 0.06 }, "-=0.5")
          .from("[data-anim='cue']", { autoAlpha: 0, duration: 0.6 }, "-=0.2");
        ScrollTrigger.batch("[data-reveal]", {
          start: "top 88%",
          once: true,
          onEnter: (els) => gsap.from(els, { y: 28, autoAlpha: 0, duration: 0.7, ease: "power3.out", stagger: 0.1 }),
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );
  const reduced = useSyncExternalStore(subscribeReduced, prefersReducedMotion, () => false);
  const stops = useMemo(() => guidedStops(house), [house]);
  const facts = useMemo(() => tourFacts(house), [house]);
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

  // deep links open the 3D view directly; otherwise the viewer mounts in the hero as a turning dollhouse preview
  // once the browser is idle (the cover photo is the poster until its first frame is ready)
  useEffect(() => {
    const { start: s, clean: c } = readStart();
    // URL is external state only readable after hydration (the page itself is prerendered)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (s) enter(s, false, c);
    else if (webglAvailable()) {
      const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 600));
      idle(() => void loadViewer().then(() => setMounted(true)));
    }
  }, [enter]);

  useEffect(() => {
    const el = hero.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
    <div ref={root} className="min-h-dvh bg-neutral-950 text-white">
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

      {/* hero: the dollhouse fills a black stage; a slim top bar and one floating card carry the listing.
          Facts beyond the card, the plan, photos and room details are below the fold. */}
      <header ref={hero} className="relative flex min-h-dvh flex-col overflow-hidden bg-stage">
        {!mounted &&
          (cover ? (
            // eslint-disable-next-line @next/next/no-img-element -- pre-sized webp; shown only when 3D is unavailable / not yet mounted
            <img src={cover.src} alt={`Listing photo of the ${roomName(cover.room)?.toLowerCase() ?? "property"}`} width={cover.w} height={cover.h} fetchPriority="high" className="absolute inset-0 size-full object-cover opacity-40" />
          ) : null)}
        {mounted && (
          <div
            className={open ? "fixed inset-0 z-40 h-dvh bg-neutral-950" : "absolute inset-0 z-0"}
            // the preview is decorative; the full-screen tour is the accessible one
            aria-hidden={!open}
          >
            <CanvasBoundary key={attempt} onError={() => fail("crash")}>
              <Viewer
                house={house}
                photos={photos}
                active={open || heroVisible}
                preview={!open}
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

        {/* top bar */}
        <nav data-anim="nav" className="relative z-10 flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:pt-6" aria-label="Listing">
          <Link href={backHref} className="flex size-10 items-center justify-center rounded-full ring-1 ring-white/15 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne" aria-label="All tours">
            <ArrowLeft className="size-4" />
          </Link>
          {house.meta.locality && <p className="truncate text-[11px] font-medium uppercase tracking-[0.2em] text-white/55">{house.meta.locality}</p>}
          <div className="ml-auto flex items-center gap-5">
            <a href="#details" className="hidden text-[11px] font-medium uppercase tracking-[0.18em] text-white/60 transition-colors hover:text-white sm:inline">
              Details
            </a>
            {photos.length > 0 && (
              <button type="button" onClick={() => setGallery(0)} className="hidden items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-white/60 transition-colors hover:text-white sm:inline-flex">
                <Images className="size-3.5" /> Photos ({photos.length})
              </button>
            )}
          </div>
        </nav>

        {/* floating card: right on desktop, bottom on phones (the model is framed above it) */}
        <div className="relative z-10 mt-auto px-4 pb-16 sm:px-8 lg:pointer-events-none lg:absolute lg:inset-y-0 lg:right-10 lg:mt-0 lg:flex lg:items-center lg:px-0 lg:pb-14 lg:pt-24">
          <section
            data-anim="card"
            className="scrollbar-thin w-full rounded-3xl bg-neutral-950/80 p-6 ring-1 ring-white/10 backdrop-blur-md sm:p-8 lg:pointer-events-auto lg:max-h-full lg:w-[400px] lg:overflow-y-auto"
            aria-labelledby="listing-title"
          >
            <p data-anim-item className="text-[10px] font-semibold uppercase tracking-[0.22em] text-champagne/80">{house.meta.status === "draft" ? "Draft · 3D reconstruction" : "3D reconstruction"}</p>
            <h1 data-anim-item id="listing-title" className="mt-3 text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-[28px]">{house.title}</h1>

            <dl data-anim-item className="mt-6 grid grid-cols-3 divide-x divide-white/10 border-y border-white/10 py-4 text-center">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-white/50">Bedrooms</dt>
                <dd className="mt-1 text-lg font-semibold">{facts.bedrooms || "Studio"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-white/50">Baths</dt>
                <dd className="mt-1 text-lg font-semibold">{facts.bathrooms}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-white/50">Inside</dt>
                <dd className="mt-1 text-lg font-semibold">≈ {Math.round(facts.interiorArea)} m²</dd>
              </div>
            </dl>

            <p data-anim-item className="mt-5 text-pretty text-sm leading-relaxed text-white/70">{house.meta.summary ?? tourSummary(house)}</p>

            {failure && (
              <div role="alert" className="mt-6 flex items-start gap-2.5 rounded-xl bg-amber-300/10 p-3 text-[13px] text-amber-50 ring-1 ring-amber-300/30">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
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
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-3 py-1.5 text-[13px] font-semibold text-neutral-950 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <RotateCcw className="size-3.5" /> Try again
                    </button>
                  )}
                </div>
              </div>
            )}

            <div data-anim-item className="mt-7 flex flex-col gap-3">
              {failure !== "webgl" && (
                <button
                  type="button"
                  onClick={() => enter({})}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-champagne px-4 text-sm font-semibold text-neutral-950 transition-colors hover:bg-[#f0e2bd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Box className="size-4" /> Explore in 3D
                </button>
              )}
              {stops.length > 0 && failure !== "webgl" && (
                <button
                  type="button"
                  onClick={() => enter({ guided: true })}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold ring-1 ring-white/20 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne"
                >
                  <Play className="size-3.5 fill-current" /> Guided tour · {duration}
                </button>
              )}
              {photos.length > 0 && (
                <button type="button" onClick={() => setGallery(0)} className="inline-flex h-9 items-center justify-center gap-1.5 text-[12px] font-medium text-white/60 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne sm:hidden">
                  <Images className="size-3.5" /> Photos ({photos.length})
                </button>
              )}
            </div>
          </section>
        </div>

        <a data-anim="cue" href="#details" className="absolute inset-x-0 bottom-3 z-10 mx-auto flex w-fit flex-col items-center gap-0.5 rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/45 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-champagne">
          Details
          <ChevronDown className="size-4 motion-safe:animate-bounce" />
        </a>
      </header>

      {/* details: also the complete non-3D experience */}
      <main id="details" className="mx-auto grid w-full max-w-5xl gap-8 px-4 pb-16 pt-4 sm:px-8 lg:grid-cols-[1fr_340px]">
        <div data-reveal className="space-y-6">
          <FactsRow house={house} className="text-white/85" />
          <TourDetails house={house} photos={photos} revision={revision} onPhoto={setGallery} onRoom={failure === "webgl" ? undefined : (id) => enter({ room: id })} />
        </div>
        <aside data-reveal className="space-y-4 lg:sticky lg:top-6 lg:self-start">
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

    </div>
  );
}
