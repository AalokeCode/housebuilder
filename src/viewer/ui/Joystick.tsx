"use client";

import { useRef, useState } from "react";
import { useTour } from "../store";

const R = 44;

/** Touch joystick for walk mode (mobile). */
export function Joystick() {
  const setJoystick = useTour((s) => s.setJoystick);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (x: number, y: number) => {
    const d = Math.hypot(x, y);
    const k = d > R ? R / d : 1;
    setKnob({ x: x * k, y: y * k });
    setJoystick((x * k) / R, (y * k) / R);
  };

  return (
    <div
      className="pointer-events-auto relative size-28 touch-none rounded-full border border-white/40 bg-black/25 backdrop-blur-sm"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        origin.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        update(e.clientX - origin.current.x, e.clientY - origin.current.y);
      }}
      onPointerMove={(e) => origin.current && update(e.clientX - origin.current.x, e.clientY - origin.current.y)}
      onPointerUp={() => {
        origin.current = null;
        update(0, 0);
      }}
      onPointerCancel={() => {
        origin.current = null;
        update(0, 0);
      }}
      aria-label="Move joystick"
    >
      <div
        className="absolute left-1/2 top-1/2 size-12 rounded-full bg-white/85 shadow-lg"
        style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
      />
    </div>
  );
}
