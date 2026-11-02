"use client";

import type { CompiledFixture } from "@/domain/compiled";
import { materials } from "../materials";

/** Single-run kitchen. Local x = along run, +z = out of the wall. */
export function Kitchen({ f }: { f: CompiledFixture }) {
  const L = f.length;
  const base = materials.surface(f.base);
  const top = materials.surface(f.top);
  const upper = f.upper ? materials.surface(f.upper) : null;
  const splash = f.splash ? materials.surface(f.splash) : null;
  const groove = materials.color("#9f978c", 0.8);
  const steel = materials.color("#bfc1c2", 0.35, 0.8);
  const upperTop = Math.min(f.ceiling - 0.05, 2.3);
  const upperBottom = 1.45;
  const doors = Math.max(1, Math.round(L / 0.6));

  return (
    <group position={[f.origin[0], 0, f.origin[1]]} rotation={[0, (f.rotY * Math.PI) / 180, 0]}>
      <mesh position={[0, 0.05, 0.25]} material={materials.color("#8c857b", 0.8)}>
        <boxGeometry args={[L, 0.1, 0.5]} />
      </mesh>
      <mesh position={[0, 0.49, 0.29]} material={base}>
        <boxGeometry args={[L, 0.78, 0.58]} />
      </mesh>
      <mesh position={[0, 0.9, 0.31]} material={top}>
        <boxGeometry args={[L, 0.04, 0.62]} />
      </mesh>
      {splash && (
        <mesh position={[0, 0.92 + (upperBottom - 0.92) / 2, 0.006]} material={splash}>
          <boxGeometry args={[L, upperBottom - 0.92, 0.012]} />
        </mesh>
      )}
      {upper && (
        <mesh position={[0, (upperBottom + upperTop) / 2, 0.175]} material={upper}>
          <boxGeometry args={[L, upperTop - upperBottom, 0.35]} />
        </mesh>
      )}
      <mesh position={[0, upperBottom - 0.005, 0.3]} material={materials.emissive("#ffd9a8", 1.6)}>
        <boxGeometry args={[L - 0.1, 0.008, 0.02]} />
      </mesh>
      {Array.from({ length: doors - 1 }, (_, i) => {
        const x = -L / 2 + ((i + 1) * L) / doors;
        return (
          <group key={i}>
            <mesh position={[x, 0.49, 0.582]} material={groove}>
              <boxGeometry args={[0.006, 0.76, 0.004]} />
            </mesh>
            {upper && (
              <mesh position={[x, (upperBottom + upperTop) / 2, 0.352]} material={groove}>
                <boxGeometry args={[0.006, upperTop - upperBottom - 0.02, 0.004]} />
              </mesh>
            )}
          </group>
        );
      })}
      {f.appliances.map((a, i) => (
        <group key={i} position={[a.at, 0, 0]}>
          <mesh position={[0, 0.46, 0.3]} material={steel}>
            <boxGeometry args={[a.size[0], 0.86, 0.6]} />
          </mesh>
          <mesh position={[0, 0.42, 0.603]} material={materials.color("#121314", 0.1, 0.3)}>
            <boxGeometry args={[a.size[0] - 0.1, 0.42, 0.005]} />
          </mesh>
          <mesh position={[0, 0.79, 0.603]} material={materials.color("#2a2b2c", 0.4, 0.5)}>
            <boxGeometry args={[a.size[0] - 0.04, 0.08, 0.008]} />
          </mesh>
          <mesh position={[0, 0.925, 0.3]} material={materials.color("#1a1a1a", 0.3, 0.4)}>
            <boxGeometry args={[a.size[0] - 0.04, 0.012, 0.52]} />
          </mesh>
          <mesh position={[0, upperBottom - 0.025, 0.25]} material={steel}>
            <boxGeometry args={[a.size[0], 0.05, 0.5]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
