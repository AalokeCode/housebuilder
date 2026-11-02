"use client";

import { Environment } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { CompiledSite } from "@/domain/site-compiler";
import { Bridge, ContextBlock, Deck, Entrance, Filler, Podium, Signage, Tower } from "./Buildings";
import { CameraRig } from "./CameraRig";
import { Ground, Planting, Road } from "./Landscape";
import { SUN_DIR, SkyDome } from "./SkyDome";

export type Tier = "low" | "high";

/** Static scene → shadow map rendered once (desktop only), never per frame. */
function ShadowOnce({ enabled }: { enabled: boolean }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!enabled) return;
    gl.shadowMap.autoUpdate = false;
    // after the first commit (geometry + instancing are in place)
    const id = requestAnimationFrame(() => {
      gl.shadowMap.needsUpdate = true;
      invalidate();
    });
    return () => cancelAnimationFrame(id);
  }, [gl, enabled, invalidate]);
  return null;
}

export function SiteScene({ site, tier }: { site: CompiledSite; tier: Tier }) {
  const chapters = site.chapters;
  const sun = SUN_DIR.map((v) => v * 420) as [number, number, number];
  const shadows = tier === "high";
  return (
    <>
      <fog attach="fog" args={["#d3dae0", 520, 2300]} />
      <SkyDome />
      <Environment frames={1} resolution={64}>
        <SkyDome />
      </Environment>
      <hemisphereLight args={["#e4ecf3", "#59574c", 0.85]} />
      <directionalLight
        position={sun}
        intensity={2.1}
        color="#fff6ea"
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.8}
        shadow-camera-left={-210}
        shadow-camera-right={210}
        shadow-camera-top={210}
        shadow-camera-bottom={-210}
        shadow-camera-near={50}
        shadow-camera-far={1000}
      />
      <ShadowOnce enabled={shadows} />

      <Ground />
      <Road l={site.landscape} chapters={chapters} />
      <Planting l={site.landscape} chapters={chapters} />
      <Podium p={site.podium} chapters={chapters} />
      {site.towers.map((t) => (
        <Tower key={t.id} t={t} chapters={chapters} />
      ))}
      {site.deck && <Deck d={site.deck} chapters={chapters} />}
      {site.entrance && <Entrance e={site.entrance} chapters={chapters} />}
      {site.signage && <Signage s={site.signage} chapters={chapters} />}
      {site.bridge && <Bridge b={site.bridge} chapters={chapters} />}
      {site.context.map((b) => (
        <ContextBlock key={b.id} b={b} chapters={chapters} />
      ))}
      <Filler items={site.filler} />
      <CameraRig chapters={chapters} />
    </>
  );
}
