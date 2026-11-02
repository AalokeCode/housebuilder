"use client";

import type { CompiledHouse } from "@/domain/compiled";
import type { Tier } from "./Atmosphere";

const WARM = "#ffb46b"; // ≈2700K
const LAMP_BUILDERS = new Set(["floorLamp", "tableLamp", "pendant"]);

/**
 * Warm, moody grade: low ambient, warm room fills, sunset key through the glazing,
 * practical lamps on desktop only (each extra point light costs per-fragment on phones).
 */
export function Lighting({ house, tier }: { house: CompiledHouse; tier: Tier }) {
  const lamps = tier === "high" ? house.items.filter((i) => LAMP_BUILDERS.has(i.builder)) : [];
  return (
    <>
      <hemisphereLight args={["#ffd9b0", "#3a2c22", 0.14]} />
      <directionalLight position={[2, 3.2, -14]} intensity={1.5} color="#ff9e5e" />
      {house.rooms
        .filter((r) => r.hasCeiling)
        .map((r) => (
          <pointLight key={r.id} position={[r.center[0], r.ceilingHeight - 0.3, r.center[1]]} intensity={r.area > 12 ? 7 : 3.5} distance={6.5} decay={2} color={WARM} />
        ))}
      {lamps.map((l) => (
        <pointLight
          key={`${l.room}-${l.id}`}
          position={[l.pos[0], l.builder === "pendant" ? l.pos[1] - l.size[1] + 0.1 : l.pos[1] + l.size[1] - 0.1, l.pos[2]]}
          intensity={l.builder === "tableLamp" ? 0.9 : 1.8}
          distance={3}
          decay={2}
          color="#ffc58a"
        />
      ))}
    </>
  );
}
