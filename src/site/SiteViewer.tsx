"use client";

import { Canvas } from "@react-three/fiber";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import * as THREE from "three";
import type { CompiledSite } from "@/domain/site-compiler";
import { SiteScene, type Tier } from "./scene/SiteScene";
import { useSiteTour } from "./store";
import { Overlay } from "./ui/Overlay";
import { useNarrationDriver } from "./voice/useNarrationDriver";

function detectTier(): Tier {
  if (typeof window === "undefined") return "low";
  return window.matchMedia("(pointer: coarse)").matches ? "low" : "high";
}

/** Resolve ?chapter= as 1-based index or chapter id. */
function chapterFromParam(site: CompiledSite, raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 1 && n <= site.chapters.length) return n - 1;
  const i = site.chapters.findIndex((c) => c.id === raw);
  return i >= 0 ? i : null;
}

export function SiteViewer({ site }: { site: CompiledSite }) {
  const params = useSearchParams();
  const clean = params.get("clean") === "1";
  const [tier] = useState<Tier>(detectTier);

  useEffect(() => {
    const tour = useSiteTour.getState();
    tour.init(site.chapters.length);
    const ch = chapterFromParam(site, params.get("chapter"));
    if (ch !== null) {
      const t = Number(params.get("t") ?? "0.5");
      tour.preview(ch, Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0.5);
    }
  }, [site, params]);

  // leaving the page: stop timers and pending auto-advance
  useEffect(() => () => useSiteTour.getState().init(1), []);

  useNarrationDriver(site.chapters);

  return (
    <div className="relative h-dvh w-full touch-none select-none overflow-hidden bg-[#cdd5dc]">
      <Canvas
        dpr={tier === "low" ? [1, 1.5] : [1, 2]}
        frameloop="demand"
        shadows={tier === "high" ? "percentage" : false}
        camera={{ fov: 40, near: 1, far: 6000, position: [0, 150, 320] }}
        gl={{ antialias: true, powerPreference: "high-performance", stencil: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1.05;
          if (process.env.NODE_ENV !== "production") (window as unknown as { __siteGl?: THREE.WebGLRenderer }).__siteGl = gl;
        }}
      >
        <SiteScene site={site} tier={tier} />
      </Canvas>
      {!clean && <Overlay site={site} />}
    </div>
  );
}
