"use client";

import { useMemo } from "react";
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

function wallPieces(w: CompiledWall): THREE.BufferGeometry[] {
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
  return boxes
    .filter(([u0, u1, y0, y1]) => u1 - u0 > 0.005 && y1 - y0 > 0.005)
    .map(([u0, u1, y0, y1]) => {
      const g = new THREE.BoxGeometry(u1 - u0, y1 - y0, w.thickness);
      g.translate((u0 + u1) / 2, (y0 + y1) / 2, 0);
      g.applyMatrix4(m);
      return g;
    });
}

export function Walls({ house, cutaway }: { house: CompiledHouse; cutaway: boolean }) {
  const groups = useMemo(() => {
    const byMat = new Map<string, { ref: MaterialRef; geos: THREE.BufferGeometry[] }>();
    for (const w of house.walls) {
      if (w.kind === "railing") continue;
      const k = keyOf(w.material);
      const g = byMat.get(k) ?? { ref: w.material, geos: [] };
      g.geos.push(...wallPieces(w));
      byMat.set(k, g);
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
        {/* perimeter */}
        <mesh position={[0, o.h - f / 2, 0]} material={frame}>
          <boxGeometry args={[o.w, f, t * 0.6]} />
        </mesh>
        <mesh position={[0, f / 2, 0]} material={frame}>
          <boxGeometry args={[o.w, f, t * 0.6]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * (o.w - f)) / 2, o.h / 2, 0]} material={frame}>
            <boxGeometry args={[f, o.h, t * 0.6]} />
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

  // doors: frame + closed leaf + handle
  const leaf = materials.surface(o.leaf);
  return (
    <group position={pos} rotation={[0, theta, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * (o.w + 0.04)) / 2, o.h / 2, 0]} material={frame}>
          <boxGeometry args={[0.04, o.h, t + 0.02]} />
        </mesh>
      ))}
      <mesh position={[0, o.h + 0.02, 0]} material={frame}>
        <boxGeometry args={[o.w + 0.08, 0.04, t + 0.02]} />
      </mesh>
      <mesh position={[0, o.h / 2, 0]} material={leaf}>
        <boxGeometry args={[o.w - 0.01, o.h - 0.01, 0.04]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[o.w / 2 - 0.09, 1.02, s * 0.035]} material={materials.color("#222222", 0.3, 0.8)}>
          <boxGeometry args={[0.13, 0.02, 0.02]} />
        </mesh>
      ))}
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
