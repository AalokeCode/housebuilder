"use client";

import { RoundedBox, useGLTF } from "@react-three/drei";
import { Suspense, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { CompiledItem } from "@/domain/compiled";
import { materials } from "../materials";

type V3 = [number, number, number];
type Colors = Record<string, string>;
interface BuilderProps {
  s: V3;
  c: Colors;
  /** GLB part for composite builders (e.g. vase body under procedural flowers) */
  model?: string;
}

// ───────── primitives ─────────

function Box({ s, p, c = "#cccccc", r = 0.7, m = 0, round, rot, mat: override }: { s: V3; p: V3; c?: string; r?: number; m?: number; round?: number; rot?: V3; mat?: THREE.Material }) {
  const mat = override ?? materials.color(c, r, m);
  if (round) return <RoundedBox args={s} radius={Math.min(round, Math.min(...s) / 2 - 0.001)} smoothness={3} position={p} rotation={rot} material={mat} />;
  return (
    <mesh position={p} rotation={rot} material={mat}>
      <boxGeometry args={s} />
    </mesh>
  );
}

function Cyl({ r, rb, h, p, c = "#cccccc", rough = 0.7, m = 0, seg = 24, rot, mat }: { r: number; rb?: number; h: number; p: V3; c?: string; rough?: number; m?: number; seg?: number; rot?: V3; mat?: THREE.Material }) {
  return (
    <mesh position={p} rotation={rot} material={mat ?? materials.color(c, rough, m)}>
      <cylinderGeometry args={[r, rb ?? r, h, seg]} />
    </mesh>
  );
}

function Ball({ r, p, mat, scale }: { r: number; p: V3; mat: THREE.Material; scale?: V3 }) {
  return (
    <mesh position={p} scale={scale} material={mat}>
      <sphereGeometry args={[r, 20, 14]} />
    </mesh>
  );
}

const W = (hex: string) => materials.textured(hex, "wood");
const F = (hex: string) => materials.textured(hex, "fabric");
const U = (hex: string) => materials.textured(hex, "weave");

// ───────── builders (origin = bottom center, front faces +z) ─────────

function Sofa({ s: [w, h, d], c }: BuilderProps) {
  const arm = 0.16;
  const inner = w - 2 * arm;
  const rolls = Math.max(3, Math.round(inner / 0.2));
  return (
    <group>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Cyl key={`${sx}${sz}`} r={0.02} h={0.1} p={[sx * (w / 2 - 0.08), 0.05, sz * (d / 2 - 0.08)]} c={c.leg} />))}
      <Box s={[w, 0.24, d]} p={[0, 0.22, 0]} mat={U(c.body)} round={0.04} />
      {[0, 1, 2].map((i) => (
        <Box key={i} s={[inner / 3 - 0.015, 0.14, d - 0.26]} p={[-inner / 3 + (i * inner) / 3, 0.41, 0.1]} mat={U(c.body)} round={0.05} />
      ))}
      {Array.from({ length: rolls }, (_, i) => (
        <Box key={i} s={[inner / rolls - 0.006, h - 0.34, 0.22]} p={[-inner / 2 + (i + 0.5) * (inner / rolls), 0.34 + (h - 0.34) / 2, -d / 2 + 0.13]} mat={U(c.body)} round={0.06} />
      ))}
      {[-1, 1].map((sx) => (
        <Box key={sx} s={[arm, h * 0.72, d]} p={[sx * (w / 2 - arm / 2), (h * 0.72) / 2 + 0.1, 0]} mat={U(c.body)} round={0.06} />
      ))}
      {[-1, 1].map((sx) => (
        <Box key={sx} s={[0.44, 0.4, 0.13]} p={[sx * (inner / 2 - 0.3), 0.66, -d / 2 + 0.32]} rot={[-0.3, sx * 0.15, 0]} mat={F(c.cushion)} round={0.05} />
      ))}
    </group>
  );
}

function Armchair({ s: [w, h, d], c }: BuilderProps) {
  const arm = 0.13;
  return (
    <group>
      <Box s={[w, 0.3, d]} p={[0, 0.2, 0]} mat={U(c.body)} round={0.05} />
      <Box s={[w - 2 * arm, 0.12, d - 0.22]} p={[0, 0.41, 0.08]} mat={U(c.body)} round={0.05} />
      <Box s={[w - 0.04, h - 0.3, 0.18]} p={[0, 0.3 + (h - 0.3) / 2, -d / 2 + 0.1]} mat={U(c.body)} round={0.06} />
      {[-1, 1].map((sx) => (
        <Box key={sx} s={[arm, h * 0.68, d]} p={[sx * (w / 2 - arm / 2), (h * 0.68) / 2 + 0.06, 0]} mat={U(c.body)} round={0.05} />
      ))}
      <Box s={[0.4, 0.34, 0.12]} p={[0, 0.62, -d / 2 + 0.27]} rot={[-0.25, 0, 0]} mat={F(c.cushion)} round={0.05} />
    </group>
  );
}

function Pouf({ s: [w, h], c }: BuilderProps) {
  return (
    <group>
      <Cyl r={w / 2 - 0.03} h={h - 0.06} p={[0, (h - 0.06) / 2, 0]} mat={U(c.body)} seg={32} />
      <Ball r={w / 2} p={[0, h - 0.06, 0]} scale={[1, 0.14, 1]} mat={materials.color(c.body, 1)} />
    </group>
  );
}

function RoundTable({ s: [w, h], c, glass }: BuilderProps & { glass?: boolean }) {
  const r = w / 2;
  return (
    <group>
      <Cyl r={r} h={0.018} p={[0, h - 0.009, 0]} c={c.top} rough={glass ? 0.08 : 0.4} m={glass ? 0.3 : 0} seg={40} />
      <mesh position={[0, h - 0.03, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.color(c.frame, 0.4, 0.7)}>
        <torusGeometry args={[r * 0.92, 0.008, 6, 40]} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.color(c.frame, 0.4, 0.7)}>
        <torusGeometry args={[r * 0.75, 0.008, 6, 40]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        return <Cyl key={i} r={0.008} h={h - 0.03} p={[Math.cos(a) * r * 0.82, (h - 0.03) / 2, Math.sin(a) * r * 0.82]} c={c.frame} rough={0.4} m={0.7} rot={[Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]} />;
      })}
    </group>
  );
}

function DiningTable({ s: [w, h], c }: BuilderProps) {
  const r = w / 2;
  return (
    <group>
      <Cyl r={r} h={0.035} p={[0, h - 0.018, 0]} mat={W(c.wood)} seg={48} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        return <Box key={i} s={[0.05, h - 0.04, 0.05]} p={[Math.cos(a) * 0.3, (h - 0.04) / 2, Math.sin(a) * 0.3]} rot={[Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12]} mat={W(c.wood)} />;
      })}
      <Box s={[0.5, 0.04, 0.04]} p={[0, 0.35, 0]} mat={W(c.wood)} />
      <Box s={[0.04, 0.04, 0.5]} p={[0, 0.35, 0]} mat={W(c.wood)} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2;
        return <Cyl key={i} r={0.11} h={0.015} p={[Math.sin(a) * r * 0.62, h + 0.008, Math.cos(a) * r * 0.62]} c="#eeeae3" rough={0.3} seg={24} />;
      })}
    </group>
  );
}

function DiningChair({ s: [w, h, d], c }: BuilderProps) {
  return (
    <group>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} s={[0.035, 0.44, 0.035]} p={[sx * (w / 2 - 0.05), 0.22, sz * (d / 2 - 0.06)]} rot={[sz * 0.06, 0, 0]} mat={W(c.wood)} />))}
      <Box s={[w, 0.09, d - 0.06]} p={[0, 0.48, 0.02]} mat={F(c.fabric)} round={0.035} />
      <Box s={[w, h - 0.5, 0.08]} p={[0, 0.5 + (h - 0.5) / 2, -d / 2 + 0.06]} rot={[-0.12, 0, 0]} mat={F(c.fabric)} round={0.035} />
    </group>
  );
}

function Cabinet({ s: [w, h, d], c }: BuilderProps) {
  return (
    <group>
      <Box s={[w - 0.04, 0.06, d - 0.06]} p={[0, 0.03, -0.02]} c="#3a3a3a" />
      <Box s={[w, h - 0.06, d]} p={[0, 0.06 + (h - 0.06) / 2, 0]} c={c.body} r={0.5} round={0.01} />
      {Array.from({ length: Math.max(1, Math.round(w / 0.45)) - 1 }, (_, i) => (
        <Box key={i} s={[0.005, h - 0.1, 0.004]} p={[-w / 2 + ((i + 1) * w) / Math.max(1, Math.round(w / 0.45)), 0.06 + (h - 0.06) / 2, d / 2 + 0.002]} c={c.accent} />
      ))}
    </group>
  );
}

function Tv({ s: [w, h], c }: BuilderProps) {
  return (
    <group>
      <Box s={[0.35, 0.015, 0.2]} p={[0, 0.008, 0]} c={c.frame} r={0.3} m={0.5} />
      <Box s={[0.05, 0.1, 0.03]} p={[0, 0.06, -0.02]} c={c.frame} r={0.3} m={0.5} />
      <Box s={[w, h - 0.1, 0.035]} p={[0, 0.1 + (h - 0.1) / 2, -0.02]} c={c.frame} r={0.3} />
      <Box s={[w - 0.02, h - 0.12, 0.002]} p={[0, 0.1 + (h - 0.1) / 2, -0.001]} c={c.screen} r={0.12} m={0.4} />
    </group>
  );
}

function Mirror({ s: [w, h, d], c }: BuilderProps) {
  return (
    <group position={[0, 0, d / 2]} rotation={[-0.09, 0, 0]}>
      <Box s={[w, h, 0.03]} p={[0, h / 2, -0.015]} c={c.frame} r={0.4} />
      <Box s={[w - 0.05, h - 0.05, 0.004]} p={[0, h / 2, 0.002]} c={c.glass} r={0.04} m={0.95} />
    </group>
  );
}

function Plant({ s: [w, h], c }: BuilderProps) {
  const leaf = materials.color(c.leaf, 0.8);
  const leaves = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2;
        const t = 0.35 + (i % 3) * 0.2;
        return { p: [Math.cos(a) * 0.12, 0.35 + t * (h - 0.35), Math.sin(a) * 0.12] as V3, rot: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6] as V3 };
      }),
    [h],
  );
  return (
    <group>
      <Cyl r={w * 0.3} rb={w * 0.24} h={0.34} p={[0, 0.17, 0]} c={c.pot} rough={0.6} />
      <Cyl r={0.01} h={h - 0.3} p={[0, 0.3 + (h - 0.3) / 2, 0]} c="#4b5a33" />
      {leaves.map((l, i) => (
        <mesh key={i} position={l.p} rotation={l.rot} scale={[0.6, 1.6, 0.18]} material={leaf}>
          <sphereGeometry args={[0.1, 10, 8]} />
        </mesh>
      ))}
    </group>
  );
}

function FloorLamp({ s: [w, h], c }: BuilderProps) {
  return (
    <group>
      <Cyl r={0.14} h={0.02} p={[0, 0.01, 0]} c={c.stem} rough={0.4} m={0.6} />
      <Cyl r={0.012} h={h - 0.3} p={[0, (h - 0.3) / 2, 0]} c={c.stem} rough={0.4} m={0.6} />
      <Ball r={w / 2} p={[0, h - 0.17, 0]} scale={[1, 0.62, 1]} mat={materials.emissive("#ffd9a8", 1.3)} />
    </group>
  );
}

function TableLamp({ s: [w, h], c }: BuilderProps) {
  return (
    <group>
      <Cyl r={0.07} h={0.015} p={[0, 0.008, 0]} c={c.metal} rough={0.3} m={0.9} />
      <Cyl r={0.006} h={h - 0.05} p={[0, (h - 0.05) / 2, 0]} c={c.metal} rough={0.3} m={0.9} rot={[0, 0, 0.12]} />
      <Cyl r={w / 2} h={0.008} p={[0.04, h - 0.04, 0.03]} c={c.metal} rough={0.3} m={0.9} rot={[0.5, 0, -0.2]} />
    </group>
  );
}

function Pendant({ s: [w, h], c }: BuilderProps) {
  const glow = materials.emissive("#ffe2bd", 1.6);
  // origin at ceiling; hangs downward
  return (
    <group>
      <Cyl r={0.05} h={0.02} p={[0, -0.01, 0]} c={c.rod} rough={0.4} m={0.6} />
      <Cyl r={0.006} h={h - 0.2} p={[0, -(h - 0.2) / 2, 0]} c={c.rod} rough={0.4} m={0.6} />
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        const p: V3 = [Math.cos(a) * w * 0.32, -h + 0.12 + i * 0.05, Math.sin(a) * w * 0.32];
        return (
          <group key={i}>
            <Cyl r={0.004} h={w * 0.32} p={[p[0] / 2, -h + 0.25, p[2] / 2]} rot={[0, -a, Math.PI / 2]} c={c.rod} />
            <Ball r={0.11} p={p} mat={glow} />
          </group>
        );
      })}
    </group>
  );
}

function Rug({ s: [w, h, d], c }: BuilderProps) {
  return <Box s={[w, h, d]} p={[0, h / 2, 0]} mat={F(c.base)} round={0.004} />;
}

function Art({ s: [w, h, d], c }: BuilderProps) {
  return (
    <group>
      <Box s={[w, h, d]} p={[0, 0, 0]} c={c.frame} r={0.5} />
      <mesh position={[0, 0, d / 2 + 0.001]}>
        <planeGeometry args={[w - 0.04, h - 0.04]} />
        <meshStandardMaterial map={c.image ? materials.picture(c.image) : materials.art(c.pattern)} roughness={0.9} />
      </mesh>
    </group>
  );
}

function Curtain({ s: [w, h, d], c }: BuilderProps) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, h, 40, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / w) * Math.PI * 2 * (w / 0.12)) * (d / 3));
    g.computeVertexNormals();
    return g;
  }, [w, h, d]);
  return (
    <mesh geometry={geo} position={[0, h / 2 + 0.02, 0]}>
      <meshStandardMaterial color={c.fabric} roughness={1} side={THREE.DoubleSide} transparent opacity={0.92} />
    </mesh>
  );
}

function VaseFlowers({ s: [w, h], c }: BuilderProps) {
  const flower = materials.color(c.flower, 0.9);
  const blooms = useMemo(
    () => Array.from({ length: 9 }, (_, i) => [Math.cos(i * 2.4) * w * 0.32, h * 0.62 + (i % 3) * h * 0.1, Math.sin(i * 2.4) * w * 0.32] as V3),
    [w, h],
  );
  return (
    <group>
      <Cyl r={w * 0.22} rb={w * 0.2} h={h * 0.4} p={[0, h * 0.2, 0]} c={c.vase} rough={0.2} m={0.1} />
      {blooms.map((p, i) => (
        <group key={i}>
          <Cyl r={0.004} h={h * 0.35} p={[p[0] / 2, h * 0.5, p[2] / 2]} c={c.leaf} />
          <Ball r={w * 0.1} p={p} mat={flower} />
        </group>
      ))}
    </group>
  );
}

function Bed({ s: [w, h, d], c, model }: BuilderProps) {
  const top = 0.58;
  const duvetZ = d * 0.16;
  const duvetL = d * 0.66;
  const cushion = useMemo(
    () => new THREE.MeshStandardMaterial({ map: c.image ? materials.picture(c.image) : null, color: c.image ? "#ffffff" : c.accent, roughness: 1 }),
    [c.image, c.accent],
  );
  return (
    <group>
      {/* plinth */}
      <Box s={[w - 0.12, 0.08, d - 0.24]} p={[0, 0.04, 0.05]} c="#3a3733" />
      {model ? (
        /* AI-generated body (TRELLIS, from listing photo 01b): base + mattress + duvet + throw + towels */
        <group position={[0, 0.06, 0.07]}>
          <Suspense fallback={null}>
            <Glb url={model} s={[w + 0.02, top + 0.1, d - 0.12]} fit="stretch" yaw={BED_MODEL_YAW} matte />
          </Suspense>
        </group>
      ) : (
        <Box s={[w, 0.26, d - 0.08]} p={[0, 0.21, 0.04]} mat={U(c.frame)} round={0.05} />
      )}
      {/* piped headboard with proud inset panel */}
      <Box s={[w + 0.08, h, 0.12]} p={[0, h / 2, -d / 2 + 0.06]} mat={U(c.frame)} round={0.06} />
      <Box s={[w - 0.16, h - 0.42, 0.05]} p={[0, h / 2 + 0.14, -d / 2 + 0.135]} mat={U(c.frame)} round={0.025} />
      {!model && (
        <>
      {/* mattress */}
      <Box s={[w - 0.1, 0.24, d - 0.24]} p={[0, 0.46, 0.06]} mat={F(c.sheet)} round={0.07} />
      {/* duvet: top, side + foot drapes, turned-down band */}
      <Box s={[w - 0.02, 0.07, duvetL]} p={[0, top + 0.025, duvetZ]} mat={F(c.sheet)} round={0.035} />
      {[-1, 1].map((sx) => (
        <Box key={sx} s={[0.05, 0.3, duvetL]} p={[sx * (w / 2 - 0.01), top - 0.11, duvetZ]} mat={F(c.sheet)} round={0.024} />
      ))}
      <Box s={[w - 0.02, 0.3, 0.05]} p={[0, top - 0.11, duvetZ + duvetL / 2]} mat={F(c.sheet)} round={0.024} />
      <Box s={[w - 0.02, 0.055, 0.24]} p={[0, top + 0.075, duvetZ - duvetL / 2 + 0.12]} mat={F(c.sheet)} round={0.026} />
      {/* blue throw wrapped over the foot */}
      <Box s={[w + 0.05, 0.03, 0.52]} p={[0, top + 0.075, d / 2 - 0.44]} mat={F(c.throw)} round={0.012} />
      {[-1, 1].map((sx) => (
        <Box key={sx} s={[0.03, 0.36, 0.52]} p={[sx * (w / 2 + 0.025), top - 0.1, d / 2 - 0.44]} mat={F(c.throw)} round={0.012} />
      ))}
        </>
      )}
      {/* damask cushions (texture cropped from the reference photo) */}
      {[-1, 1].map((sx) => (
        <RoundedBox key={`c${sx}`} args={[0.46, 0.42, 0.13]} radius={0.06} smoothness={3} position={[sx * 0.27, top + 0.2, -d / 2 + 0.62]} rotation={[-0.3, sx * -0.12, sx * 0.04]} material={cushion} />
      ))}
      {!model && (
        <>
          {/* folded towels */}
          <Box s={[0.34, 0.05, 0.24]} p={[0.18, top + 0.1, 0.32]} mat={F("#ffffff")} round={0.02} />
          <Box s={[0.32, 0.045, 0.22]} p={[0.18, top + 0.147, 0.32]} mat={F("#f3f3f1")} round={0.02} />
          <Box s={[0.3, 0.04, 0.2]} p={[0.5, top + 0.095, 0.36]} rot={[0, 0.2, 0]} mat={F("#ffffff")} round={0.018} />
        </>
      )}
    </group>
  );
}

function Nightstand({ s: [w, h, d], c }: BuilderProps) {
  return (
    <group>
      <Box s={[w, h - 0.08, d]} p={[0, 0.08 + (h - 0.08) / 2, 0]} mat={W(c.wood)} round={0.01} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} s={[0.03, 0.08, 0.03]} p={[sx * (w / 2 - 0.04), 0.04, sz * (d / 2 - 0.04)]} mat={W(c.wood)} />))}
      <Box s={[w - 0.04, 0.005, 0.004]} p={[0, h * 0.6, d / 2 + 0.002]} c="#2a1d15" />
    </group>
  );
}

function Bistro({ s: [w], c }: BuilderProps) {
  return (
    <group>
      <Cyl r={0.3} h={0.02} p={[0, 0.72, 0]} c={c.top} rough={0.3} />
      <Cyl r={0.02} h={0.72} p={[0, 0.36, 0]} c={c.metal} rough={0.4} m={0.6} />
      <Cyl r={0.2} h={0.02} p={[0, 0.01, 0]} c={c.metal} rough={0.4} m={0.6} />
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * (w / 2 - 0.25), 0, 0]} rotation={[0, (-sx * Math.PI) / 2, 0]}>
          <Box s={[0.45, 0.03, 0.45]} p={[0, 0.45, 0]} c={c.metal} r={0.5} />
          <Box s={[0.45, 0.45, 0.03]} p={[0, 0.68, -0.21]} c={c.metal} r={0.5} />
          {[-1, 1].flatMap((a) => [-1, 1].map((b) => <Box key={`${a}${b}`} s={[0.02, 0.45, 0.02]} p={[a * 0.2, 0.225, b * 0.2]} c={c.metal} />))}
        </group>
      ))}
    </group>
  );
}

/** White phalaenopsis sprays: all petals/stems/leaves merged → 3 draw calls per vase. */
function useOrchid(h: number, base: number, spread: number, seed: number) {
  return useMemo(() => {
    let a = seed;
    const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
    const stems: THREE.BufferGeometry[] = [];
    const petals: THREE.BufferGeometry[] = [];
    const leaves: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + rnd() * 0.8;
      const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, base, 0),
        new THREE.Vector3(dir.x * 0.03, base + (h - base) * 0.55, dir.z * 0.03),
        new THREE.Vector3(dir.x * spread * 0.6, h * (0.93 + rnd() * 0.07), dir.z * spread * 0.6),
        new THREE.Vector3(dir.x * spread, h * (0.78 + rnd() * 0.06), dir.z * spread),
      ]);
      stems.push(new THREE.TubeGeometry(curve, 16, 0.0035, 4));
      for (let t = 0.5; t <= 1.001; t += 0.1) {
        const p = curve.getPoint(t);
        const size = 0.026 * (1.15 - t * 0.35);
        for (let k = 0; k < 5; k++) {
          const pa = (k / 5) * Math.PI * 2 + t * 3;
          const off = new THREE.Vector3(Math.cos(pa), Math.sin(pa) * 0.9, 0).multiplyScalar(size * 0.75);
          off.applyAxisAngle(new THREE.Vector3(0, 1, 0), -ang + Math.PI / 2);
          const g = new THREE.SphereGeometry(size, 7, 5);
          q.setFromEuler(new THREE.Euler(0, -ang + Math.PI / 2, pa));
          m.compose(p.clone().add(off), q, new THREE.Vector3(1, 0.6, 0.22));
          g.applyMatrix4(m);
          petals.push(g);
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2 + 0.5;
      const g = new THREE.SphereGeometry(0.05, 8, 6);
      q.setFromEuler(new THREE.Euler(0.9, ang, 0));
      m.compose(new THREE.Vector3(Math.cos(ang) * 0.05, base + 0.01, Math.sin(ang) * 0.05), q, new THREE.Vector3(0.55, 0.12, 1.6));
      g.applyMatrix4(m);
      leaves.push(g);
    }
    return { stems: mergeGeometries(stems), petals: mergeGeometries(petals), leaves: mergeGeometries(leaves) };
  }, [h, base, spread, seed]);
}

function OrchidVase({ s: [w, h, d], c, model }: BuilderProps) {
  const vaseH = h * 0.36;
  const orchid = useOrchid(h, vaseH * 0.9, w * 0.9, Math.round(w * 1000 + h * 100));
  return (
    <group>
      {model ? (
        <Suspense fallback={<Cyl r={w * 0.3} h={vaseH} p={[0, vaseH / 2, 0]} c={c.vase} rough={0.3} />}>
          <Glb url={model} s={[w * 0.8, vaseH, d * 0.8]} fit="contain" />
        </Suspense>
      ) : (
        <Cyl r={w * 0.3} h={vaseH} p={[0, vaseH / 2, 0]} c={c.vase} rough={0.3} />
      )}
      <mesh geometry={orchid.stems} material={materials.color("#5c6b3a", 0.8)} />
      <mesh geometry={orchid.petals} material={materials.color(c.flower, 0.6)} />
      <mesh geometry={orchid.leaves} material={materials.color(c.leaf, 0.5)} />
    </group>
  );
}

function Placeholder({ s: [w, h, d], c }: BuilderProps) {
  return <Box s={[w, h, d]} p={[0, h / 2, 0]} c={c.body} r={0.6} round={0.02} />;
}

function Glb({ url, s, fit, yaw = 0, matte = false }: { url: string; s: V3; fit: "contain" | "height" | "stretch"; yaw?: number; matte?: boolean }) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const inner = cloneSkinned(scene);
    inner.rotation.y = yaw;
    if (matte) {
      // AI-generated meshes often export metallic PBR — force fabric-like response
      inner.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && "metalness" in m) {
          const mm = m.clone();
          mm.metalness = 0;
          mm.roughness = 0.92;
          (o as THREE.Mesh).material = mm;
        }
      });
    }
    const clone = new THREE.Group();
    clone.add(inner);
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone, true);
    const size = box.getSize(new THREE.Vector3());
    if (fit === "stretch") clone.scale.set(s[0] / size.x, s[1] / size.y, s[2] / size.z);
    else clone.scale.setScalar(fit === "height" ? s[1] / size.y : Math.min(s[0] / size.x, s[1] / size.y, s[2] / size.z));
    clone.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(clone, true);
    const center = b2.getCenter(new THREE.Vector3());
    clone.position.set(-center.x, -b2.min.y, -center.z);
    return clone;
  }, [scene, s, fit, yaw, matte]);
  return <primitive object={obj} />;
}

const BUILDERS: Record<string, (p: BuilderProps) => ReactNode> = {
  sofa: Sofa,
  armchair: Armchair,
  pouf: Pouf,
  coffeeTable: (p) => <RoundTable {...p} glass />,
  sideTable: (p) => <RoundTable {...p} glass />,
  diningTable: DiningTable,
  diningChair: DiningChair,
  tvUnit: Cabinet,
  tv: Tv,
  mirror: Mirror,
  plant: Plant,
  floorLamp: FloorLamp,
  tableLamp: TableLamp,
  pendant: Pendant,
  rug: Rug,
  art: Art,
  curtain: Curtain,
  vaseFlowers: VaseFlowers,
  bed: Bed,
  nightstand: Nightstand,
  bistro: Bistro,
  orchidVase: OrchidVase,
  placeholder: Placeholder,
};

/** organic / posed models: scale by height, not bounding box */
const HEIGHT_FIT = new Set(["plant"]);
/** builders that place their own GLB part */
const COMPOSITE = new Set(["orchidVase", "bed"]);
/** TRELLIS export has the foot at -Z; rotate so the foot faces the room (+Z) */
const BED_MODEL_YAW = Math.PI;

export function FurnitureItem({ item }: { item: CompiledItem }) {
  const s = item.size as V3;
  const Procedural = BUILDERS[item.builder] ?? Placeholder;
  const fallback = <Procedural s={s} c={item.colors} model={item.model} />;
  const body = item.model && !COMPOSITE.has(item.builder) ? (
    <Suspense fallback={fallback}>
      <Glb url={item.model} s={s} fit={HEIGHT_FIT.has(item.builder) ? "height" : "contain"} />
    </Suspense>
  ) : (
    fallback
  );
  return (
    <group position={item.pos} rotation={[0, (item.rotY * Math.PI) / 180, 0]}>
      {body}
    </group>
  );
}
