"use client";

import { ContactShadows, Environment, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect } from "react";
import * as THREE from "three";
import type { CompiledHouse } from "@/domain/compiled";
import { asset } from "@/assets/asset-url";
import { materials } from "../materials";

/**
 * Lighting: warm sunset HDR (image-based light only).
 * Background: river-skyline skybox built from Poly Haven "shanghai_bund" (CC0) by scripts/skybox/build-skyline.py —
 * promenade + people removed, horizon on the centre row (eye level), river reflections below, 4k phone / 8k desktop.
 */
export const SKY = {
  hdr: asset("/env/sunset_jhbcentral_1k.hdr"),
  bg: { low: asset("/env/skyline_bg_4k.jpg"), high: asset("/env/skyline_bg_8k.jpg") },
};

/** Quality tier: phones get performance AO, no SMAA, 4k sky. */
export type Tier = "low" | "high";

/** Background yaw that puts the skyline's centre (Pudong) in the -z (north) view — the glazing side. */
export const SKYLINE_YAW = 1.885;

export function Sky({ rotation = 0, tier }: { rotation?: number; tier: Tier }) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const tex = useTexture(tier === "high" && gl.capabilities.maxTextureSize >= 8192 ? SKY.bg.high : SKY.bg.low);
  useEffect(() => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = gl.capabilities.getMaxAnisotropy();
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true; // re-upload: useTexture may have uploaded before colorSpace was set (renders washed out)
    scene.background = tex;
    return () => {
      scene.background = null;
    };
  }, [tex, scene, gl]);
  // drei's <Environment> owns scene.background/environment rotation + intensity — set them here, not on the scene
  return (
    <Environment
      files={SKY.hdr}
      environmentIntensity={0.32}
      environmentRotation={[0, rotation, 0]}
      backgroundRotation={[0, SKYLINE_YAW, 0]}
      backgroundIntensity={0.85}
    />
  );
}

/** Bridges async texture loads into demand-mode redraws. */
export function InvalidateOnLoad() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    materials.onLoad = () => invalidate();
    return () => {
      materials.onLoad = () => {};
    };
  }, [invalidate]);
  return null;
}

/** Soft grounding shadows rendered ONCE (frames=1) — zero per-frame cost. */
export function GroundShadows({ house }: { house: CompiledHouse }) {
  const w = house.bounds.max[0] - house.bounds.min[0] + 1;
  const d = house.bounds.max[1] - house.bounds.min[1] + 1;
  return (
    <ContactShadows
      position={[(house.bounds.min[0] + house.bounds.max[0]) / 2, 0.004, (house.bounds.min[1] + house.bounds.max[1]) / 2]}
      scale={[w, d]}
      resolution={1024}
      frames={1}
      far={1.1}
      blur={2.2}
      opacity={0.55}
      color="#3d3a36"
    />
  );
}

export function Effects({ tier }: { tier: Tier }) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {/* never halfRes: its depth-downsample pass blanks the canvas on mobile GPUs (tested on touch profiles) */}
      <N8AO aoRadius={0.55} distanceFalloff={0.9} intensity={tier === "low" ? 2.4 : 3.2} quality={tier === "low" ? "performance" : "medium"} color="#2b2620" />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {tier === "high" ? <SMAA /> : <></>}
    </EffectComposer>
  );
}
