"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type {
  CompiledBridge,
  CompiledChapter,
  CompiledContextBlock,
  CompiledDeck,
  CompiledEntrance,
  CompiledFiller,
  CompiledPodium,
  CompiledSignage,
  CompiledTower,
} from "@/domain/site-compiler";
import { box, flatPolygon, merge, paint, prismGeometry, treeGeometry } from "./geometry";
import { Glow, useHighlight } from "./highlight";
import { contextMaterial, podiumMaterial, siteMaterial, towerMaterial, type SiteMaterial } from "./materials";

type Ch = { chapters: CompiledChapter[] };

function useDispose(...items: { dispose(): void }[]) {
  useEffect(() => () => items.forEach((i) => i.dispose()), items); // eslint-disable-line react-hooks/exhaustive-deps
}

export function Tower({ t, chapters }: { t: CompiledTower } & Ch) {
  const geo = useMemo(() => prismGeometry(t.outline, t.baseY, t.height), [t]);
  const mat = useMemo(() => towerMaterial(t), [t]);
  const hl = useHighlight(t.id, chapters, [mat]);
  useDispose(geo, mat);
  return (
    <mesh geometry={geo} material={mat} castShadow receiveShadow>
      <Glow level={hl} />
    </mesh>
  );
}

export function Podium({ p, chapters }: { p: CompiledPodium } & Ch) {
  const geo = useMemo(() => prismGeometry(p.outline, 0, p.height), [p]);
  const mat = useMemo(() => podiumMaterial(p.color, p.retailHeight, p.height), [p]);
  const hl = useHighlight(p.id, chapters, [mat]);
  useDispose(geo, mat);
  return (
    <mesh geometry={geo} material={mat} castShadow receiveShadow>
      <Glow level={hl} />
    </mesh>
  );
}

function signTexture(text: string, sub: string | null): THREE.CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 192;
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "#2b2b2e";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "500 92px Georgia, 'Times New Roman', serif";
  const spaced = text.split("").join(String.fromCharCode(8202));
  ctx.fillText(spaced, cv.width / 2, sub ? 78 : 96);
  if (sub) {
    ctx.fillStyle = "#b5452b";
    ctx.font = "600 38px Georgia, serif";
    ctx.fillText(sub.split("").join(" "), cv.width / 2, 158);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function Signage({ s, chapters }: { s: CompiledSignage } & Ch) {
  const tex = useMemo(() => signTexture(s.text, s.sub), [s]);
  const mat = useMemo(() => siteMaterial("kit", { map: tex, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }), [tex]);
  const geo = useMemo(() => new THREE.PlaneGeometry(s.width, s.height), [s]);
  useHighlight(s.id, chapters, [mat]);
  useDispose(tex, mat, geo);
  return <mesh geometry={geo} material={mat} position={s.pos} rotation={[0, s.rotY, 0]} />;
}

export function Deck({ d, chapters }: { d: CompiledDeck } & Ch) {
  const { solid, water } = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const wparts: THREE.BufferGeometry[] = [];
    const y = d.y;
    for (const [x, z, w, dd] of d.pools) {
      // coping ring
      parts.push(paint(box(w + 1.6, 0.35, 0.8, x, y + 0.17, z - dd / 2 - 0.4), "#f4f2ec"));
      parts.push(paint(box(w + 1.6, 0.35, 0.8, x, y + 0.17, z + dd / 2 + 0.4), "#f4f2ec"));
      parts.push(paint(box(0.8, 0.35, dd, x - w / 2 - 0.4, y + 0.17, z), "#f4f2ec"));
      parts.push(paint(box(0.8, 0.35, dd, x + w / 2 + 0.4, y + 0.17, z), "#f4f2ec"));
      wparts.push(paint(box(w, 0.25, dd, x, y + 0.12, z), "#3fb7c9"));
      // loungers along the long side
      const n = Math.max(2, Math.floor(w / 3.2));
      for (let i = 0; i < n; i++) {
        const lx = x - w / 2 + 1.6 + (i * (w - 3.2)) / Math.max(1, n - 1);
        parts.push(paint(box(0.75, 0.35, 1.9, lx, y + 0.2, z - dd / 2 - 2.2), "#fbfbf8"));
      }
      // timber deck around the pool
      parts.push(paint(box(w + 8, 0.08, dd + 8, x, y + 0.04, z), "#9c7a58"));
    }
    for (const [x, z, w, dd] of d.planters) {
      parts.push(paint(box(w, 0.8, dd, x, y + 0.4, z), "#d9d6cf"));
      parts.push(paint(box(w - 0.3, 0.5, dd - 0.3, x, y + 0.9, z), "#3d6b2f"));
    }
    const tree = treeGeometry();
    for (const [x, z] of d.trees) {
      const t = tree.clone();
      t.scale(0.6, 0.6, 0.6);
      t.translate(x, y, z);
      parts.push(t);
    }
    tree.dispose();
    return { solid: merge(parts), water: merge(wparts.length ? wparts : [paint(box(0.01, 0.01, 0.01, 0, -10, 0), "#000000")]) };
  }, [d]);
  const solidMat = useMemo(() => siteMaterial("kit", { vertexColors: true, roughness: 0.85 }), []);
  const waterMat = useMemo(() => siteMaterial("kit", { vertexColors: true, roughness: 0.04, metalness: 0.15 }), []);
  const hl = useHighlight(d.id, chapters, [solidMat, waterMat]);
  useDispose(solid, water, solidMat, waterMat);
  return (
    <group>
      <mesh geometry={solid} material={solidMat} castShadow receiveShadow>
        <Glow level={hl} thickness={2.5} />
      </mesh>
      <mesh geometry={water} material={waterMat} receiveShadow />
    </group>
  );
}

export function Entrance({ e, chapters }: { e: CompiledEntrance } & Ch) {
  const geo = useMemo(() => {
    const w = e.width;
    const h = e.height;
    const local: THREE.BufferGeometry[] = [
      paint(box(w, h, 1.2, 0, h / 2, -0.4), "#0b0c0e"), // dark opening
      paint(box(w + 1.6, 0.9, 1.6, 0, h + 0.45, 0.2), "#f2f1ec"), // lintel
      paint(box(0.8, h, 1.6, -w / 2 - 0.4, h / 2, 0.2), "#f2f1ec"),
      paint(box(0.8, h, 1.6, w / 2 + 0.4, h / 2, 0.2), "#f2f1ec"),
      paint(box(w + 4, 0.35, 6, 0, h + 0.3, 3.4), "#ecebe6"), // canopy
      paint(box(0.35, h + 0.2, 0.35, -w / 2 - 1.2, (h + 0.2) / 2, 6), "#d8d7d2"),
      paint(box(0.35, h + 0.2, 0.35, w / 2 + 1.2, (h + 0.2) / 2, 6), "#d8d7d2"),
      paint(box(w - 1, 0.25, 7, 0, 0.12, 1.5), "#57595c"), // ramp apron
      paint(box(0.25, 1.1, 7, 0, 0.55, 1.5), "#e4c24b"), // lane divider
    ];
    const m = new THREE.Matrix4().makeRotationY(e.rotY).setPosition(e.pos[0], 0, e.pos[1]);
    for (const g of local) g.applyMatrix4(m);
    if (e.forecourt) local.push(paint(flatPolygon(e.forecourt, 0.05), "#6d6f72"));
    return merge(local);
  }, [e]);
  const mat = useMemo(() => siteMaterial("kit", { vertexColors: true, roughness: 0.8 }), []);
  const hl = useHighlight(e.id, chapters, [mat]);
  useDispose(geo, mat);
  return (
    <mesh geometry={geo} material={mat} castShadow receiveShadow>
      <Glow level={hl} />
    </mesh>
  );
}

export function Bridge({ b, chapters }: { b: CompiledBridge } & Ch) {
  const geo = useMemo(() => {
    const dx = b.to[0] - b.from[0];
    const dz = b.to[1] - b.from[1];
    const len = Math.hypot(dx, dz);
    const rot = Math.atan2(-dz, dx);
    const cx = (b.from[0] + b.to[0]) / 2;
    const cz = (b.from[1] + b.to[1]) / 2;
    const parts = [
      paint(box(len, 0.6, b.width, 0, b.y, 0), "#efeeea"),
      paint(box(len, 0.4, b.width + 0.4, 0, b.y + b.height, 0), "#efeeea"),
      paint(box(len, b.height - 0.4, b.width - 0.2, 0, b.y + b.height / 2, 0), "#9fb6c4"),
      paint(box(0.8, b.y, 0.8, 0, b.y / 2, 0), "#dddcd7"),
    ];
    const m = new THREE.Matrix4().makeRotationY(rot).setPosition(cx, 0, cz);
    for (const g of parts) g.applyMatrix4(m);
    return merge(parts);
  }, [b]);
  const mat = useMemo(() => siteMaterial("kit", { vertexColors: true, roughness: 0.35, metalness: 0.1 }), []);
  const hl = useHighlight(b.id, chapters, [mat]);
  useDispose(geo, mat);
  return (
    <mesh geometry={geo} material={mat} castShadow>
      <Glow level={hl} />
    </mesh>
  );
}

export function ContextBlock({ b, chapters }: { b: CompiledContextBlock } & Ch) {
  const geo = useMemo(() => prismGeometry(b.outline, 0, b.height), [b]);
  const mat = useMemo(() => contextMaterial(b), [b]);
  const hl = useHighlight(b.id, chapters, [mat]);
  useDispose(geo, mat);
  return (
    <mesh geometry={geo} material={mat} castShadow receiveShadow>
      <Glow level={hl} />
    </mesh>
  );
}

const FILLER_TONES = ["#d9d4c8", "#c7ccd0", "#e6e1d3", "#b8bfc4", "#d2c9b5", "#cfd3d6"];

/** Distant city ring: one InstancedMesh, one draw call. */
export function Filler({ items }: { items: CompiledFiller[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  const mat = useMemo<SiteMaterial>(() => siteMaterial("filler", { roughness: 0.9 }), []);
  useDispose(geo, mat);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    items.forEach((f, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.rot);
      m.compose(new THREE.Vector3(f.pos[0], 0, f.pos[1]), q, new THREE.Vector3(f.w, f.h, f.d));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.set(FILLER_TONES[Math.floor(f.shade * FILLER_TONES.length) % FILLER_TONES.length]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);
  if (!items.length) return null;
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} receiveShadow />;
}
