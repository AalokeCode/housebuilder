"use client";

import { ContactShadows, Environment, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect } from "react";
import * as THREE from "three";
import type { CompiledHouse } from "@/domain/compiled";
import { materials } from "../materials";

export const SKY = { hdr: "/env/sunset_jhbcentral_1k.hdr", bg: { low: "/env/sunset_jhbcentral_bg_4k.jpg", high: "/env/sunset_jhbcentral_bg_8k.jpg" } };

/** Quality tier: phones get half-res AO and no SMAA. */
export type Tier = "low" | "high";

/** Skyline skybox (2k JPG, sharp) + 1k HDR for image-based lighting. */
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
    scene.background = tex;
    scene.backgroundIntensity = 0.85;
    scene.backgroundRotation.set(0, rotation, 0);
    scene.environmentRotation.set(0, rotation, 0);
    return () => {
      scene.background = null;
    };
  }, [tex, scene, rotation, gl]);
  return <Environment files={SKY.hdr} environmentIntensity={0.32} />;
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
      <N8AO aoRadius={0.55} distanceFalloff={0.9} intensity={tier === "low" ? 2.4 : 3.2} halfRes={tier === "low"} quality={tier === "low" ? "performance" : "medium"} color="#2b2620" />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {tier === "high" ? <SMAA /> : <></>}
    </EffectComposer>
  );
}
