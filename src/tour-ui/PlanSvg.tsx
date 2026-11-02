"use client";

import type { CompiledHouse } from "@/domain/compiled";
import { planGeometry } from "@/domain/tour-model";

interface Props {
  house: CompiledHouse;
  /** highlighted room */
  current?: string | null;
  /** viewer position + heading (yaw, three.js convention) */
  pose?: { x: number; z: number; yaw: number } | null;
  onSelect?: (roomId: string) => void;
  /** show room names */
  labels?: boolean;
  className?: string;
}

/** Schematic plan drawn from room polygons. Estimated rooms are hatched. */
export function PlanSvg({ house, current, pose, onSelect, labels = true, className }: Props) {
  const g = planGeometry(house);
  const size = Math.max(house.bounds.max[0] - house.bounds.min[0], house.bounds.max[1] - house.bounds.min[1]);
  const fs = size / 34;
  return (
    <svg viewBox={g.viewBox} className={className} role="img" aria-label={`Schematic floor plan of ${house.title}`}>
      <defs>
        <pattern id="plan-est" width={size / 40} height={size / 40} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={size / 40} stroke="currentColor" strokeOpacity="0.18" strokeWidth={size / 160} />
        </pattern>
      </defs>
      {g.rooms.map((r) => {
        const on = r.id === current;
        const shape = (
          <>
            <path d={r.d} className={on ? "fill-amber-300/35" : r.balcony ? "fill-white/5" : "fill-white/10"} />
            {r.est && <path d={r.d} fill="url(#plan-est)" />}
            <path d={r.d} fill="none" className={on ? "stroke-amber-300" : "stroke-white/60"} strokeWidth={size / (on ? 110 : 160)} strokeLinejoin="round" />
            {labels && (
              <text x={r.label[0]} y={r.label[1]} fontSize={fs} textAnchor="middle" dominantBaseline="middle" className={on ? "fill-amber-100 font-semibold" : "fill-white/80"}>
                {r.name}
              </text>
            )}
          </>
        );
        return onSelect ? (
          <g
            key={r.id}
            role="button"
            tabIndex={0}
            aria-label={`Go to ${r.name}`}
            className="cursor-pointer outline-none [&:focus-visible>path:last-of-type]:stroke-amber-300"
            onClick={() => onSelect(r.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(r.id))}
          >
            {shape}
          </g>
        ) : (
          <g key={r.id}>{shape}</g>
        );
      })}
      {pose && (
        <g transform={`translate(${pose.x} ${pose.z}) rotate(${(-pose.yaw * 180) / Math.PI})`} className="pointer-events-none">
          <path d={`M0 0 L${-size / 14} ${-size / 7} A${size / 6} ${size / 6} 0 0 1 ${size / 14} ${-size / 7} Z`} className="fill-amber-300/40" />
          <circle r={size / 55} className="fill-amber-300 stroke-neutral-950" strokeWidth={size / 220} />
        </g>
      )}
    </svg>
  );
}
