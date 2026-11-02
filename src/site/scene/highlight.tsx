"use client";

import { Outlines } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import type * as THREE from "three";
import type { CompiledChapter } from "@/domain/site-compiler";
import { useSiteTour } from "../store";
import { HIGHLIGHT_COLOR, type SiteMaterial } from "./materials";

/** Ids highlighted right now (empty when idle / ended). */
export function activeHighlight(chapters: CompiledChapter[]): string[] {
  const s = useSiteTour.getState();
  if (s.status === "idle" || s.status === "ended") return [];
  return chapters[s.chapter]?.highlight ?? [];
}

export interface HighlightLevel {
  hi: number;
  dim: number;
}

/**
 * Damps uHi / uDim on the given materials toward the chapter's target.
 * Only requests frames while animating (frameloop="demand").
 */
export function useHighlight(id: string, chapters: CompiledChapter[], mats: SiteMaterial[]): RefObject<HighlightLevel> {
  const level = useRef<HighlightLevel>({ hi: 0, dim: 0 });
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => useSiteTour.subscribe(() => invalidate()), [invalidate]);
  useFrame((_, dt) => {
    const active = activeHighlight(chapters);
    const on = active.includes(id);
    const tHi = on ? 1 : 0;
    const tDim = active.length && !on ? 1 : 0;
    const instant = useSiteTour.getState().status === "preview";
    const k = instant ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 3.2);
    const l = level.current;
    l.hi += (tHi - l.hi) * k;
    l.dim += (tDim - l.dim) * k;
    if (Math.abs(tHi - l.hi) < 0.003) l.hi = tHi;
    if (Math.abs(tDim - l.dim) < 0.003) l.dim = tDim;
    // gentle pulse while highlighted
    const pulse = l.hi > 0 && !instant ? 0.85 + 0.15 * Math.sin(performance.now() / 420) : 1;
    for (const m of mats) {
      m.userData.hl.uHi.value = l.hi * pulse;
      m.userData.hl.uDim.value = l.dim;
    }
    if (l.hi !== tHi || l.dim !== tDim) invalidate();
  });
  return level;
}

/** Inverted-hull glow outline (drei <Outlines>), faded by a highlight level. Child of a mesh. */
export function Glow({ level, thickness = 4 }: { level: RefObject<HighlightLevel>; thickness?: number }) {
  const probe = useRef<THREE.Group>(null);
  const outline = useRef<THREE.Object3D | null>(null);
  useFrame(() => {
    const parent = probe.current?.parent;
    if (!parent) return;
    if (!outline.current) {
      outline.current =
        parent.children.find((c) => {
          const m = c.children[0] as THREE.Mesh | undefined;
          return c !== probe.current && !!(m?.material as THREE.ShaderMaterial | undefined)?.uniforms?.thickness;
        }) ?? null;
    }
    const g = outline.current;
    if (!g) return;
    const v = level.current?.hi ?? 0;
    g.visible = v > 0.01;
    const mat = (g.children[0] as THREE.Mesh).material as THREE.ShaderMaterial;
    mat.uniforms.opacity.value = Math.min(1, v * 1.1);
  });
  return (
    <>
      <group ref={probe} />
      <Outlines color={HIGHLIGHT_COLOR} thickness={thickness} transparent opacity={0} toneMapped={false} />
    </>
  );
}
