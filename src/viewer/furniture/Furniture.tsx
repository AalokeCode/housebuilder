"use client";

import { RoundedBox, useGLTF } from "@react-three/drei";
import { asset } from "@/assets/asset-url";
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

/** Joints overlap by this much — parts never just touch (touching faces z-fight and show cut ends). */
const EMBED = 0.02;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A leg / rod defined by its end points: `from` on the floor, `to` where it meets the part it carries.
 * The top end is pushed EMBED into that part, so tilted legs stay attached (no rotation about the centre).
 */
function Leg({ from, to, t, mat, round = false }: { from: V3; to: V3; t: number; mat: THREE.Material; round?: boolean }) {
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a).normalize();
    b.addScaledVector(dir, EMBED);
    return { pos: a.clone().add(b).multiplyScalar(0.5), quat: new THREE.Quaternion().setFromUnitVectors(UP, dir), len: a.distanceTo(b) };
  }, [from, to]);
  return (
    <mesh position={pos} quaternion={quat} material={mat}>
      {round ? <cylinderGeometry args={[t / 2, t / 2, len, 12]} /> : <boxGeometry args={[t, len, t]} />}
    </mesh>
  );
}

const W = (hex: string) => materials.textured(hex, "wood");
const F = (hex: string) => materials.textured(hex, "fabric");
const U = (hex: string) => materials.textured(hex, "weave");
const B = (hex: string) => materials.textured(hex, "boucle");

// ───────── builders (origin = bottom center, front faces +z) ─────────

function Sofa({ s: [w, h, d], c }: BuilderProps) {
  const arm = 0.16;
  const inner = w - 2 * arm;
  const rolls = Math.max(3, Math.round(inner / 0.2));
  return (
    <group>
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Leg key={`${sx}${sz}`} from={[sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.08)]} to={[sx * (w / 2 - 0.08), 0.1, sz * (d / 2 - 0.08)]} t={0.04} mat={materials.color(c.leg, 0.6)} round />))}
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
      <Box s={[w, 0.3, d]} p={[0, 0.2, 0]} mat={B(c.body)} round={0.05} />
      <Box s={[w - 2 * arm, 0.12, d - 0.22]} p={[0, 0.41, 0.08]} mat={B(c.body)} round={0.05} />
      <Box s={[w - 0.04, h - 0.3, 0.18]} p={[0, 0.3 + (h - 0.3) / 2, -d / 2 + 0.1]} mat={B(c.body)} round={0.06} />
      {[-1, 1].map((sx) => (
        <Box key={sx} s={[arm, h * 0.68, d]} p={[sx * (w / 2 - arm / 2), (h * 0.68) / 2 + 0.06, 0]} mat={B(c.body)} round={0.05} />
      ))}
      <Box s={[0.4, 0.34, 0.12]} p={[0, 0.62, -d / 2 + 0.27]} rot={[-0.25, 0, 0]} mat={F(c.cushion)} round={0.05} />
    </group>
  );
}

function Pouf({ s: [w, h], c }: BuilderProps) {
  return (
    <group>
      <Cyl r={w / 2 - 0.03} h={h - 0.06} p={[0, (h - 0.06) / 2, 0]} mat={B(c.body)} seg={32} />
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
        return <Leg key={i} from={[Math.cos(a) * r * 0.75, 0.01, Math.sin(a) * r * 0.75]} to={[Math.cos(a) * r * 0.92, h - 0.03, Math.sin(a) * r * 0.92]} t={0.016} mat={materials.color(c.frame, 0.4, 0.7)} round />;
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
        // splayed: wide at the floor, meeting under the top's centre ring
        return <Leg key={i} from={[Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36]} to={[Math.cos(a) * 0.22, h - 0.035, Math.sin(a) * 0.22]} t={0.05} mat={W(c.wood)} />;
      })}
      <Box s={[0.62, 0.04, 0.04]} p={[0, 0.35, 0]} rot={[0, Math.PI / 4, 0]} mat={W(c.wood)} />
      <Box s={[0.62, 0.04, 0.04]} p={[0, 0.35, 0]} rot={[0, -Math.PI / 4, 0]} mat={W(c.wood)} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2;
        return <Cyl key={i} r={0.11} h={0.015} p={[Math.sin(a) * r * 0.62, h + 0.008, Math.cos(a) * r * 0.62]} c="#eeeae3" rough={0.3} seg={24} />;
      })}
    </group>
  );
}

function DiningChair({ s: [w, h, d], c }: BuilderProps) {
  const seatY = 0.47; // seat top
  const seatT = 0.08;
  const under = seatY - seatT; // seat underside
  const legT = 0.035;
  const ix = w / 2 - 0.05; // legs sit inside the seat outline
  const fz = d / 2 - 0.07;
  const bz = -d / 2 + 0.07;
  const wood = W(c.wood);
  const fabric = F(c.fabric);
  const backH = h - seatY;
  return (
    <group>
      {/* front legs: slight forward splay, top buried in the apron */}
      {[-1, 1].map((sx) => (
        <Leg key={`f${sx}`} from={[sx * ix, 0, fz + 0.02]} to={[sx * ix, under - 0.03, fz]} t={legT} mat={wood} />
      ))}
      {/* back legs: raked back, ending inside the apron like the front ones (photo: wood shows only below the seat) */}
      {[-1, 1].map((sx) => (
        <Leg key={`b${sx}`} from={[sx * ix, 0, bz - 0.04]} to={[sx * ix, under - 0.03, bz]} t={legT} mat={wood} />
      ))}
      {/* apron: rails tying the legs together under the seat */}
      <Box s={[2 * ix, 0.05, 0.02]} p={[0, under - 0.02, fz]} mat={wood} />
      <Box s={[2 * ix, 0.05, 0.02]} p={[0, under - 0.02, bz]} mat={wood} />
      {[-1, 1].map((sx) => (
        <Box key={`r${sx}`} s={[0.02, 0.05, fz - bz]} p={[sx * ix, under - 0.02, (fz + bz) / 2]} mat={wood} />
      ))}
      {/* upholstered seat overlaps the apron top */}
      <Box s={[w, seatT + EMBED, d - 0.04]} p={[0, under + (seatT - EMBED) / 2, 0.01]} mat={fabric} round={0.03} />
      {/* backrest hinged at its bottom edge (sits on the seat, leans back) */}
      <group position={[0, seatY - EMBED, -d / 2 + 0.05]} rotation={[-0.1, 0, 0]}>
        <Box s={[w - 0.02, backH + EMBED, 0.06]} p={[0, (backH + EMBED) / 2, 0]} mat={fabric} round={0.03} />
      </group>
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
  if (!c.image) return <Box s={[w, h, d]} p={[0, h / 2, 0]} mat={F(c.base)} round={0.004} />;
  // photo-sourced rug: the cropped listing texture on top, plain pile colour on the edges
  return (
    <group>
      <Box s={[w, h, d]} p={[0, h / 2, 0]} mat={F(c.base)} round={0.004} />
      <mesh position={[0, h + 0.0015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w - 0.01, d - 0.01]} />
        <meshStandardMaterial map={materials.picture(c.image)} roughness={0.95} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </group>
  );
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

/**
 * Cloth sheet draped over a w×l top: flat in the middle, rolling over the long edges (and optionally the foot)
 * and hanging `drop` m. Gentle low-frequency wrinkles; planar UVs (metres) for the fabric detail map.
 */
function drapeGeometry(w: number, l: number, drop: number, foot: boolean, seed = 1): THREE.BufferGeometry {
  const over = drop + 0.06;
  const W = w + 2 * over;
  const L = l + (foot ? over : 0);
  const g = new THREE.PlaneGeometry(W, L, 64, 48);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, (foot ? over : 0) / 2);
  const p = g.attributes.position;
  const R = 0.06; // roll radius over the mattress edge
  const fold = (u: number) => {
    // u = distance beyond the edge → [outward offset, height]
    if (u <= 0) return [0, 0];
    const arc = Math.min(u, (Math.PI / 2) * R);
    const a = arc / R;
    const x = R * Math.sin(a);
    const y = -R * (1 - Math.cos(a));
    const rest = u - arc;
    return [x + rest * 0.06, y - rest];
  };
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = 0;
    let z = p.getZ(i);
    const ux = Math.abs(x) - w / 2;
    if (ux > 0) {
      const [dx, dy] = fold(ux);
      x = Math.sign(x) * (w / 2 + dx);
      y += dy;
    }
    if (foot) {
      const uz = z - l / 2;
      if (uz > 0) {
        const [dz, dy] = fold(uz);
        z = l / 2 + dz;
        y = Math.min(y, dy);
      }
    }
    // soft wrinkles, stronger on the hanging part
    const hang = Math.min(1, Math.max(0, -y / Math.max(drop, 0.01)));
    y += Math.sin(x * 7 + seed) * Math.sin(z * 5 + seed * 2) * (0.004 + hang * 0.006);
    x += Math.sin(z * 9 + seed) * hang * 0.012;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Puffy pillow: subdivided box, partly spherized; UVs projected on the front face (x,y) so a photo texture doesn't smear. */
function pillowGeometry(w: number, h: number, t: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1, 12, 12, 6);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize().multiplyScalar(0.62);
    v.lerp(n, 0.55); // round off corners, belly out the faces
    v.z *= 1 - 0.55 * (Math.abs(v.x) * 2) ** 2 * (Math.abs(v.y) * 2) ** 2; // pinched seams at the corners
    p.setXYZ(i, v.x * w, v.y * h, v.z * t);
    uv.setXY(i, v.x + 0.5, v.y + 0.5);
  }
  g.computeVertexNormals();
  return g;
}

/** Upholstered bed dressed like listing photo 01b: duvet, sleeping pillows, damask cushions, blue throw, towels. */
function Bed({ s: [w, h, d], c }: BuilderProps) {
  const base = 0.4; // top of the upholstered frame
  const matT = 0.2;
  const top = base + matT; // mattress top
  const matW = w - 0.08;
  const matL = d - 0.2;
  const z0 = -d / 2 + 0.1; // mattress head end
  const sheet = F(c.sheet);
  const throwMat = F(c.throw);
  const geo = useMemo(
    () => ({
      duvet: drapeGeometry(matW, matL * 0.78, matT + 0.08, true, 1.3),
      throw: drapeGeometry(matW + 0.03, 0.62, matT + 0.12, false, 4.1),
      pillow: pillowGeometry(0.66, 0.42, 0.16),
      cushion: pillowGeometry(0.44, 0.42, 0.12),
    }),
    [matW, matL],
  );
  const damask = useMemo(
    () => new THREE.MeshStandardMaterial({ map: c.image ? materials.picture(c.image) : null, color: c.image ? "#ffffff" : c.accent, roughness: 0.95 }),
    [c.image, c.accent],
  );
  return (
    <group>
      {/* recessed plinth + upholstered frame */}
      <Box s={[w - 0.16, 0.06, d - 0.24]} p={[0, 0.03, 0.04]} c="#2f2c29" />
      <RoundedBox args={[w, base - 0.05, d - 0.06]} radius={0.06} smoothness={4} position={[0, 0.05 + (base - 0.05) / 2, 0.03]} material={U(c.frame)} />
      {/* plain headboard, softly rounded */}
      <RoundedBox args={[w + 0.06, h, 0.12]} radius={0.05} smoothness={4} position={[0, h / 2, -d / 2 + 0.06]} material={U(c.frame)} />
      {/* mattress */}
      <RoundedBox args={[matW, matT, matL]} radius={0.07} smoothness={4} position={[0, base + matT / 2 - EMBED / 2, z0 + matL / 2]} material={sheet} />
      {/* duvet over the lower 78 %, draping over the sides and foot */}
      <mesh geometry={geo.duvet} position={[0, top + 0.012, z0 + matL * 0.22 + (matL * 0.78) / 2]} material={sheet} />
      {/* blue throw across the lower third */}
      <mesh geometry={geo.throw} position={[0, top + 0.03, z0 + matL * 0.72]} material={throwMat} />
      {/* sleeping pillows against the headboard, damask cushions in front */}
      {[-1, 1].map((sx) => (
        <mesh key={`p${sx}`} geometry={geo.pillow} position={[sx * 0.36, top + 0.2, z0 + 0.14]} rotation={[-0.22, 0, 0]} material={F(c.pillow)} />
      ))}
      {[-1, 1].map((sx) => (
        <mesh key={`c${sx}`} geometry={geo.cushion} position={[sx * 0.26, top + 0.19, z0 + 0.34]} rotation={[-0.3, sx * -0.1, 0]} material={damask} />
      ))}
      {/* folded towel sets on the throw line */}
      {[-1, 1].map((sx) => (
        <group key={`t${sx}`} position={[sx * 0.36, top + 0.045, z0 + matL * 0.6]} rotation={[0, sx * 0.08, 0]}>
          <RoundedBox args={[0.38, 0.06, 0.24]} radius={0.025} smoothness={3} position={[0, 0.03, 0]} material={F("#fbfbf9")} />
          <RoundedBox args={[0.32, 0.05, 0.2]} radius={0.022} smoothness={3} position={[0, 0.085, 0]} material={F("#f6f6f3")} />
          <RoundedBox args={[0.22, 0.02, 0.09]} radius={0.008} smoothness={2} position={[0.02, 0.12, 0.02]} material={F("#2b2b2d")} />
        </group>
      ))}
    </group>
  );
}

function Nightstand({ s: [w, h, d], c }: BuilderProps) {
  return (
    <group>
      <Box s={[w, h - 0.08, d]} p={[0, 0.08 + (h - 0.08) / 2, 0]} mat={W(c.wood)} round={0.01} />
      {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Leg key={`${sx}${sz}`} from={[sx * (w / 2 - 0.04), 0, sz * (d / 2 - 0.04)]} to={[sx * (w / 2 - 0.04), 0.08, sz * (d / 2 - 0.04)]} t={0.03} mat={W(c.wood)} />))}
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

// ───────── bathroom ─────────
// not fully metallic: the warm grade keeps env light low, so metal 1 reads black
const CHROME = () => materials.color("#e4e5e6", 0.22, 0.55);
const CERAMIC = () => materials.color("#f5f4f1", 0.18);

/** Wall-hung vanity: floating cabinet, integrated basin top, wall tap, backlit mirror above. Back = −z (wall). */
function Vanity({ s: [w, , d], c }: BuilderProps) {
  const top = 0.86;
  const cab = 0.42;
  return (
    <group>
      <Box s={[w, cab, d - 0.02]} p={[0, top - 0.03 - cab / 2, 0.01]} mat={W(c.body)} round={0.008} />
      {/* handle-less drawer reveal */}
      <Box s={[w - 0.04, 0.006, 0.004]} p={[0, top - 0.03 - cab / 2, d / 2 + 0.012]} c="#2a2622" />
      {/* solid-surface top with a basin recess */}
      <Box s={[w + 0.02, 0.04, d + 0.01]} p={[0, top - 0.015, 0.005]} mat={CERAMIC()} round={0.01} />
      <mesh position={[0.08, top + 0.006, 0.04]} rotation={[-Math.PI / 2, 0, 0]} material={materials.color("#e9e7e2", 0.1)}>
        <circleGeometry args={[0.17, 40]} />
      </mesh>
      <Cyl r={0.02} h={0.006} p={[0.08, top + 0.008, 0.04]} mat={CHROME()} seg={20} />
      {/* wall tap */}
      <Box s={[0.05, 0.05, 0.03]} p={[0.08, top + 0.14, -d / 2 + 0.015]} mat={CHROME()} />
      <Box s={[0.022, 0.022, 0.16]} p={[0.08, top + 0.15, -d / 2 + 0.1]} mat={CHROME()} />
      {/* mirror with a warm halo (backlight) */}
      <Box s={[w - 0.04, 0.82, 0.02]} p={[0, top + 0.68, -d / 2 + 0.02]} c="#1d1d1d" />
      <mesh position={[0, top + 0.68, -d / 2 + 0.032]} material={materials.color("#c9d2d6", 0.02, 1)}>
        <planeGeometry args={[w - 0.08, 0.78]} />
      </mesh>
      <Box s={[w - 0.08, 0.006, 0.01]} p={[0, top + 0.27, -d / 2 + 0.03]} mat={materials.emissive("#ffd9a8", 1.4)} />
    </group>
  );
}

/** Wall-hung WC: concealed cistern ledge, shaped bowl, slim seat, flush plate. */
function Wc({ s: [w, , d], c }: BuilderProps) {
  const seatY = 0.42;
  const bowl = useMemo(() => {
    const g = new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); // lower hemisphere
    g.scale(w, 0.36, d - 0.08);
    return g;
  }, [w, d]);
  return (
    <group>
      {/* boxed-in cistern, wall finish */}
      <Box s={[w + 0.3, 1.0, 0.18]} p={[0, 0.5, -d / 2 + 0.09]} c={c.ledge ?? "#e8e4dd"} r={0.8} />
      <Box s={[0.22, 0.14, 0.01]} p={[0, 0.88, -d / 2 + 0.185]} mat={CHROME()} />
      {/* bowl hangs off the wall */}
      <mesh geometry={bowl} position={[0, seatY - 0.01, 0.06]} material={CERAMIC()} />
      <mesh position={[0, seatY + 0.012, 0.06]} scale={[w, 1, d - 0.08]} material={CERAMIC()}>
        <cylinderGeometry args={[0.5, 0.5, 0.025, 40]} />
      </mesh>
      <Box s={[w * 0.75, 0.2, 0.12]} p={[0, seatY - 0.1, -d / 2 + 0.23]} mat={CERAMIC()} round={0.04} />
    </group>
  );
}

/** Walk-in shower: low tray, frameless glass screen on the open side, rain head + mixer on the back wall. */
function Shower({ s: [w, h, d] }: BuilderProps) {
  const glass = materials.glass();
  return (
    <group>
      <Box s={[w, 0.035, d]} p={[0, 0.0175, 0]} c="#d8d5cf" r={0.6} />
      <Box s={[w * 0.5, 0.004, 0.06]} p={[0, 0.037, d / 2 - 0.12]} mat={CHROME()} />
      {/* glass screen along the front edge (+z), leaving a walk-in gap */}
      <mesh position={[-w * 0.18, 1.0 + 0.035, d / 2]} material={glass}>
        <boxGeometry args={[w * 0.64, 2.0, 0.008]} />
      </mesh>
      <Box s={[w * 0.64, 0.012, 0.012]} p={[-w * 0.18, 2.04, d / 2]} mat={CHROME()} />
      {/* back wall: rain head on an arm, thermostatic mixer, niche */}
      <Box s={[0.02, 0.02, 0.36]} p={[0, Math.min(h, 2.1) + 0.02, -d / 2 + 0.18]} mat={CHROME()} />
      <Cyl r={0.13} h={0.01} p={[0, Math.min(h, 2.1), -d / 2 + 0.34]} mat={CHROME()} seg={36} />
      <Box s={[0.16, 0.16, 0.03]} p={[0, 1.1, -d / 2 + 0.015]} mat={CHROME()} round={0.01} />
      <Box s={[0.36, 0.3, 0.02]} p={[w * 0.22, 1.25, -d / 2 + 0.01]} c="#cfc9bf" />
    </group>
  );
}

/** Heated towel rail with a folded towel. */
function TowelRail({ s: [w, h], c }: BuilderProps) {
  return (
    <group>
      {[-1, 1].map((sx) => (
        <Box key={sx} s={[0.02, h, 0.02]} p={[(sx * w) / 2, h / 2, 0]} mat={CHROME()} />
      ))}
      {[0.15, 0.35, 0.55, 0.75].map((f) => (
        <Box key={f} s={[w, 0.015, 0.015]} p={[0, h * f, 0.02]} mat={CHROME()} />
      ))}
      <Box s={[w * 0.8, h * 0.42, 0.03]} p={[0, h * 0.62, 0.05]} mat={F(c.towel ?? "#efe9df")} round={0.012} />
    </group>
  );
}

function Placeholder({ s: [w, h, d], c }: BuilderProps) {
  return <Box s={[w, h, d]} p={[0, h / 2, 0]} c={c.body} r={0.6} round={0.02} />;
}

/**
 * fit: "native" = keep the model's own metres (Poly Haven / CC0 scans are real-world scale — never shrink them),
 * "height" = scale to the item height (organic models), "contain" = fit inside the box, "stretch" = fill the box.
 */
function Glb({ url, s, fit, yaw = 0, matte = false }: { url: string; s: V3; fit: "native" | "contain" | "height" | "stretch"; yaw?: number; matte?: boolean }) {
  const { scene } = useGLTF(asset(url));
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
    if (fit === "native") clone.scale.setScalar(1);
    else if (fit === "stretch") clone.scale.set(s[0] / size.x, s[1] / size.y, s[2] / size.z);
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
  vanity: Vanity,
  wc: Wc,
  shower: Shower,
  towelRail: TowelRail,
  placeholder: Placeholder,
};

/** organic / posed models: scale by height, not bounding box */
const HEIGHT_FIT = new Set(["plant"]);
/** real-world-scale models whose catalog box is only a footprint estimate */
const NATIVE_FIT = new Set(["bistro"]);
/** builders that place their own GLB part */
const COMPOSITE = new Set(["orchidVase"]);

export function FurnitureItem({ item }: { item: CompiledItem }) {
  const s = item.size as V3;
  const Procedural = BUILDERS[item.builder] ?? Placeholder;
  const fallback = <Procedural s={s} c={item.colors} model={item.model} />;
  const body = item.model && !COMPOSITE.has(item.builder) ? (
    <Suspense fallback={fallback}>
      <Glb url={item.model} s={s} fit={NATIVE_FIT.has(item.builder) ? "native" : HEIGHT_FIT.has(item.builder) ? "height" : "contain"} />
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
