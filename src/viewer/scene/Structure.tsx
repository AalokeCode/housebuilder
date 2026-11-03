"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CompiledHouse, CompiledOpening, CompiledWall } from "@/domain/compiled";
import type { MaterialRef } from "@/domain/house-spec";
import { materials } from "../materials";

const keyOf = (m: MaterialRef) => (typeof m === "string" ? m : JSON.stringify(m));

/** Wall transform: local x along a→b, local z across thickness. */
function wallFrame(w: CompiledWall) {
  const dx = w.b[0] - w.a[0];
  const dz = w.b[1] - w.a[1];
  return { len: Math.hypot(dx, dz), theta: Math.atan2(-dz, dx) };
}

/** Box faces (BoxGeometry groups): 0 +x, 1 −x, 2 +y, 3 −y, 4 +z, 5 −z. Wall local z = across the thickness. */
function facesOf(g: THREE.BufferGeometry, groups: number[]): THREE.BufferGeometry {
  const src = g.index!.array;
  const idx: number[] = [];
  for (const gi of groups) {
    const { start, count } = g.groups[gi];
    for (let i = start; i < start + count; i++) idx.push(src[i]);
  }
  const out = g.clone();
  out.setIndex(idx);
  out.clearGroups();
  return out;
}

/** World-metre UVs (u along the wall, v up) so photo surfaces keep their real scale on every wall piece. */
function metreUVs(g: THREE.BufferGeometry) {
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [nx, ny] = [Math.abs(nrm.getX(i)), Math.abs(nrm.getY(i))];
    if (ny > 0.5) uv.setXY(i, x, z);
    else if (nx > 0.5) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}

/** Wall pieces around its openings, split into the +z face (+ ends/top) and the −z face. */
function wallPieces(w: CompiledWall): { front: THREE.BufferGeometry[]; back: THREE.BufferGeometry[] } {
  const { len, theta } = wallFrame(w);
  const boxes: [number, number, number, number][] = []; // u0,u1,y0,y1
  let u = 0;
  for (const o of [...w.openings].sort((a, b) => a.offset - b.offset)) {
    boxes.push([u, o.offset, w.bottom, w.top]);
    if (o.sill > 0.01) boxes.push([o.offset, o.offset + o.w, w.bottom, o.sill]);
    if (o.sill + o.h < w.top - 0.01) boxes.push([o.offset, o.offset + o.w, o.sill + o.h, w.top]);
    u = o.offset + o.w;
  }
  boxes.push([u, len, w.bottom, w.top]);
  const m = new THREE.Matrix4().makeRotationY(theta).setPosition(w.a[0], 0, w.a[1]);
  const front: THREE.BufferGeometry[] = [];
  const back: THREE.BufferGeometry[] = [];
  for (const [u0, u1, y0, y1] of boxes) {
    if (u1 - u0 <= 0.005 || y1 - y0 <= 0.005) continue;
    const g = new THREE.BoxGeometry(u1 - u0, y1 - y0, w.thickness);
    g.translate((u0 + u1) / 2, (y0 + y1) / 2, 0);
    metreUVs(g);
    g.applyMatrix4(m);
    front.push(facesOf(g, [0, 1, 2, 3, 4]));
    back.push(facesOf(g, [5]));
    g.dispose();
  }
  return { front, back };
}

export function Walls({ house, cutaway }: { house: CompiledHouse; cutaway: boolean }) {
  const groups = useMemo(() => {
    const byMat = new Map<string, { ref: MaterialRef; geos: THREE.BufferGeometry[] }>();
    const add = (ref: MaterialRef, geos: THREE.BufferGeometry[]) => {
      const k = keyOf(ref);
      const g = byMat.get(k) ?? { ref, geos: [] };
      g.geos.push(...geos);
      byMat.set(k, g);
    };
    for (const w of house.walls) {
      if (w.kind === "railing") continue;
      const { front, back } = wallPieces(w);
      add(w.material, front);
      add(w.back ?? w.material, back);
    }
    return [...byMat.values()].map(({ ref, geos }) => {
      const mat = (materials.surface(ref) as THREE.MeshStandardMaterial).clone();
      return { geo: mergeGeometries(geos), mat };
    });
  }, [house]);

  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 1.25), []);
  for (const { mat } of groups) {
    mat.clippingPlanes = cutaway ? [plane] : [];
    mat.needsUpdate = true;
  }

  return (
    <group>
      {groups.map(({ geo, mat }, i) => (
        <mesh key={i} geometry={geo} material={mat} />
      ))}
      {house.walls
        .filter((w) => w.kind === "railing")
        .map((w) => (
          <Railing key={w.id} wall={w} />
        ))}
      {house.walls.flatMap((w) => w.openings.map((o) => <Opening key={o.id} wall={w} o={o} />))}
    </group>
  );
}

function Railing({ wall }: { wall: CompiledWall }) {
  const { len, theta } = wallFrame(wall);
  return (
    <group position={[wall.a[0], 0, wall.a[1]]} rotation={[0, theta, 0]}>
      <mesh position={[len / 2, wall.top / 2, 0]} material={materials.glass()}>
        <boxGeometry args={[len, wall.top, 0.02]} />
      </mesh>
      <mesh position={[len / 2, wall.top, 0]} material={materials.color("#2a2a2a", 0.4, 0.6)}>
        <boxGeometry args={[len, 0.04, 0.06]} />
      </mesh>
    </group>
  );
}

function Opening({ wall, o }: { wall: CompiledWall; o: CompiledOpening }) {
  const { theta } = wallFrame(wall);
  const dx = (wall.b[0] - wall.a[0]) / Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  const dz = (wall.b[1] - wall.a[1]) / Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
  const c = o.offset + o.w / 2;
  const pos: [number, number, number] = [wall.a[0] + dx * c, o.sill, wall.a[1] + dz * c];
  const t = wall.thickness;
  const frame = materials.surface(o.frame);

  if (o.kind === "opening") return null;

  if (o.kind === "slider" || o.kind === "window") {
    const f = 0.05;
    return (
      <group position={pos} rotation={[0, theta, 0]}>
        {/* perimeter — overlaps the wall by LAP on every side so no frame face is coplanar with the wall's cut face */}
        <mesh position={[0, o.h - f / 2 + LAP / 2, 0]} material={frame}>
          <boxGeometry args={[o.w + 2 * LAP, f + LAP, t * 0.6]} />
        </mesh>
        <mesh position={[0, f / 2 - LAP / 2, 0]} material={frame}>
          <boxGeometry args={[o.w + 2 * LAP, f + LAP, t * 0.6]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * (o.w - f + LAP)) / 2, o.h / 2, 0]} material={frame}>
            <boxGeometry args={[f + LAP, o.h, t * 0.6]} />
          </mesh>
        ))}
        {/* panels */}
        {(o.kind === "slider" ? [-1, 1] : [0]).map((s, i) => {
          const pw = o.kind === "slider" ? o.w / 2 : o.w;
          return (
            <group key={i} position={[(s * pw) / 2, 0, s * 0.025]}>
              <mesh position={[0, o.h / 2, 0]} material={materials.glass()}>
                <boxGeometry args={[pw - f, o.h - 2 * f, 0.01]} />
              </mesh>
              <mesh position={[pw / 2 - f / 2 - 0.01, o.h / 2, 0]} material={frame}>
                <boxGeometry args={[0.035, o.h - 2 * f, 0.04]} />
              </mesh>
            </group>
          );
        })}
        {/* transom like the photos */}
        {o.h > 2.4 && (
          <mesh position={[0, 2.2, 0]} material={frame}>
            <boxGeometry args={[o.w, 0.04, t * 0.6]} />
          </mesh>
        )}
      </group>
    );
  }

  // doors: frame + hinged leaf (click to open / close)
  return <Door o={o} pos={pos} theta={theta} t={t} frame={frame} />;
}

/** Frame overlap into the wall (m) — keeps frame faces off the wall's cut faces (they z-fought). */
const LAP = 0.01;

function Door({ o, pos, theta, t, frame }: { o: CompiledOpening; pos: [number, number, number]; theta: number; t: number; frame: THREE.Material }) {
  const leafMat = materials.surface(o.leaf);
  const handle = materials.color("#222222", 0.3, 0.8);
  const jamb = 0.05;
  const leafW = o.w - 0.03;
  const leafH = o.h - 0.02;
  // swing: hinge side (left/right as seen from the wall's +z side) and direction (in = +z)
  const hinge = o.swing?.endsWith("right") ? 1 : -1;
  const dir = o.swing?.startsWith("out") ? -1 : 1;
  const [open, setOpen] = useState(false);
  const leaf = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const [hover, setHover] = useState(false);

  useFrame((_, dt) => {
    const g = leaf.current;
    if (!g) return;
    const target = open ? hinge * dir * -1.6 : 0;
    const d = target - g.rotation.y;
    if (Math.abs(d) < 0.001) return;
    g.rotation.y += d * Math.min(1, dt * 7); // eased swing ≈ 0.5 s
    invalidate();
  });
  useEffect(() => {
    document.body.style.cursor = hover ? "pointer" : "";
    return () => void (document.body.style.cursor = "");
  }, [hover]);

  return (
    <group position={pos} rotation={[0, theta, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (o.w / 2 + jamb / 2 - 0.015), o.h / 2, 0]} material={frame}>
          <boxGeometry args={[jamb, o.h, t + 0.02]} />
        </mesh>
      ))}
      <mesh position={[0, o.h + jamb / 2 - 0.015, 0]} material={frame}>
        <boxGeometry args={[o.w + 2 * jamb, jamb, t + 0.02]} />
      </mesh>
      {/* leaf pivots on its hinge edge */}
      <group ref={leaf} position={[hinge * (leafW / 2), 0, 0]}>
        <group position={[-hinge * (leafW / 2), 0, 0]}>
          <mesh
            position={[0, leafH / 2 + 0.005, 0]}
            material={leafMat}
            onClick={(e) => {
              if (e.delta > 6) return; // a look-drag, not a click
              e.stopPropagation();
              setOpen((v) => !v);
              invalidate();
            }}
            onPointerOver={(e) => (e.stopPropagation(), setHover(true))}
            onPointerOut={() => setHover(false)}
          >
            <boxGeometry args={[leafW, leafH, 0.04]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[-hinge * (leafW / 2 - 0.08), 1.02, s * 0.035]} material={handle}>
              <boxGeometry args={[0.13, 0.02, 0.02]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

export function Floors({ house }: { house: CompiledHouse }) {
  return (
    <group>
      {house.rooms.map((r) => {
        const shape = new THREE.Shape(r.poly.map(([x, z]) => new THREE.Vector2(x, -z)));
        return (
          <mesh key={r.id} rotation={[-Math.PI / 2, 0, 0]} material={materials.surface(r.floor)}>
            <shapeGeometry args={[shape]} />
          </mesh>
        );
      })}
    </group>
  );
}

export function Ceilings({ house }: { house: CompiledHouse }) {
  return (
    <group>
      {house.rooms
        .filter((r) => r.hasCeiling)
        .map((r) => {
          const shape = new THREE.Shape(r.poly.map(([x, z]) => new THREE.Vector2(x, z)));
          return (
            <mesh key={r.id} position={[0, r.ceilingHeight, 0]} rotation={[Math.PI / 2, 0, 0]} material={materials.surface(r.ceilingMaterial)}>
              <shapeGeometry args={[shape]} />
            </mesh>
          );
        })}
      {house.lights.map((l, i) =>
        l.kind === "downlight" ? (
          <mesh key={i} position={[l.pos[0], l.pos[1] - 0.004, l.pos[2]]} rotation={[Math.PI / 2, 0, 0]} material={materials.emissive("#ffe6c4", 2.4)}>
            <circleGeometry args={[0.05, 16]} />
          </mesh>
        ) : l.kind === "linear" && l.end ? (
          <mesh
            key={i}
            position={[(l.pos[0] + l.end[0]) / 2, l.pos[1] - 0.004, (l.pos[2] + l.end[2]) / 2]}
            rotation={[0, Math.atan2(-(l.end[2] - l.pos[2]), l.end[0] - l.pos[0]), 0]}
            material={materials.color("#3a3a3a", 0.8)}
          >
            <boxGeometry args={[Math.hypot(l.end[0] - l.pos[0], l.end[2] - l.pos[2]), 0.006, 0.06]} />
          </mesh>
        ) : null,
      )}
    </group>
  );
}
