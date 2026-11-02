"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CompiledHouse } from "@/domain/compiled";
import { walkBlocked } from "@/domain/collision";
import { pointInPolygon } from "@/domain/geometry";
import { useTour } from "../store";

export const EYE = 1.55;
const SPEED = 1.6;
const LOOK = 0.0042;
const MOVE_KEYS = new Set(["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"]);

/** Typing in a field or holding a shortcut modifier must never move the camera. */
function ignoreKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return e.metaKey || e.ctrlKey || e.altKey || !!t?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']");
}

/** Shortest signed angle from a to b. */
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/** Walk (first-person + hotspots), dollhouse (orbit), photo (locked photo-match camera). */
export function TourControls({ house, reducedMotion, onRoom }: { house: CompiledHouse; reducedMotion: boolean; onRoom: (id: string | null) => void }) {
  const { camera, gl, invalidate } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const mode = useTour((s) => s.mode);
  const photo = useTour((s) => s.photo);

  const start = useMemo(() => {
    const c = house.photoCams[0];
    if (c) return { pos: new THREE.Vector3(c.pos[0], EYE, c.pos[2]), yaw: Math.atan2(-(c.lookAt[0] - c.pos[0]), -(c.lookAt[2] - c.pos[2])) };
    const h = house.hotspots[0];
    return { pos: new THREE.Vector3(h?.pos[0] ?? 1, EYE, h?.pos[2] ?? 1), yaw: 0 };
  }, [house]);

  const walkPos = useRef(start.pos.clone());
  const yaw = useRef(start.yaw);
  const pitch = useRef(0);
  const keys = useRef(new Set<string>());
  const room = useRef<string | null>(null);
  const lastPose = useRef({ x: NaN, z: NaN, yaw: NaN });
  const center = useMemo(() => new THREE.Vector3((house.bounds.min[0] + house.bounds.max[0]) / 2, 0.8, (house.bounds.min[1] + house.bounds.max[1]) / 2), [house]);

  // demand frameloop: any store change (joystick, travel, mode) schedules a frame
  useEffect(() => useTour.subscribe(() => invalidate()), [invalidate]);

  // enter mode
  useEffect(() => {
    if (mode === "photo" && photo) {
      const c = house.photoCams.find((p) => p.photo === photo);
      if (!c) return;
      cam.fov = c.fov;
      cam.position.set(...c.pos);
      cam.lookAt(new THREE.Vector3(...c.lookAt));
      cam.updateProjectionMatrix();
    } else if (mode === "dollhouse") {
      cam.fov = 45;
      cam.position.set(center.x + 7, 13, center.z + 9);
      cam.lookAt(center);
      cam.updateProjectionMatrix();
    } else if (mode === "walk") {
      cam.fov = 70;
      cam.updateProjectionMatrix();
    }
    invalidate();
  }, [mode, photo, house, cam, center, invalidate]);

  // pointer look + keys (walk only)
  useEffect(() => {
    if (mode !== "walk") return;
    const el = gl.domElement;
    const pressed = keys.current;
    let drag: { id: number; x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!drag || drag.id !== e.pointerId) return;
      yaw.current += (e.clientX - drag.x) * LOOK;
      pitch.current = THREE.MathUtils.clamp(pitch.current + (e.clientY - drag.y) * LOOK, -1.2, 1.2);
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      invalidate();
    };
    const up = () => (drag = null);
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!MOVE_KEYS.has(k) || ignoreKey(e) || useTour.getState().guided !== "off") return;
      if (k.startsWith("arrow")) e.preventDefault(); // don't scroll focused toolbars
      pressed.add(k);
      invalidate();
    };
    const ku = (e: KeyboardEvent) => pressed.delete(e.key.toLowerCase());
    const release = () => {
      pressed.clear();
      drag = null;
      useTour.getState().setJoystick(0, 0);
    };
    const vis = () => document.visibilityState === "hidden" && release();
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", vis);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", vis);
      pressed.clear();
    };
  }, [mode, gl, invalidate]);

  // walls, room bounds and furniture footprints; if already stuck (e.g. a deep link), allow moving out
  const blocked = (x: number, z: number) => walkBlocked(house, [x, z]) && !walkBlocked(house, [walkPos.current.x, walkPos.current.z]) ;

  useFrame((_, dt) => {
    if (mode !== "walk") return;
    const st = useTour.getState();
    const p = walkPos.current;
    const t = st.travel;
    const steer = st.guided === "off";

    if (t) {
      const goal = new THREE.Vector3(t.pos[0], EYE, t.pos[1]);
      if (t.cut || reducedMotion) {
        p.copy(goal);
        if (t.yaw !== undefined) {
          yaw.current = t.yaw;
          pitch.current = 0;
        }
        st.arrived();
      } else {
        const k = Math.min(1, dt * 3.2);
        p.lerp(goal, k);
        if (t.yaw !== undefined) {
          yaw.current += angleDelta(yaw.current, t.yaw) * k;
          pitch.current *= 1 - k;
        }
        const yawDone = t.yaw === undefined || Math.abs(angleDelta(yaw.current, t.yaw)) < 0.01;
        if (p.distanceTo(goal) < 0.02 && yawDone) {
          p.copy(goal);
          if (t.yaw !== undefined) yaw.current = t.yaw;
          st.arrived();
        }
      }
      invalidate();
    } else if (steer) {
      const k = keys.current;
      let f = -st.joystick.y;
      let s = st.joystick.x;
      if (k.has("w") || k.has("arrowup")) f += 1;
      if (k.has("s") || k.has("arrowdown")) f -= 1;
      if (k.has("d")) s += 1;
      if (k.has("a")) s -= 1;
      if (k.has("arrowleft")) yaw.current += dt * 1.6;
      if (k.has("arrowright")) yaw.current -= dt * 1.6;
      if (f || s || k.size) invalidate();
      if (f || s) {
        const sin = Math.sin(yaw.current);
        const cos = Math.cos(yaw.current);
        const dx = (-sin * f + cos * s) * SPEED * dt;
        const dz = (-cos * f - sin * s) * SPEED * dt;
        if (!blocked(p.x + dx, p.z)) p.x += dx;
        if (!blocked(p.x, p.z + dz)) p.z += dz;
      }
    }
    cam.position.copy(p);
    cam.rotation.set(pitch.current, yaw.current, 0, "YXZ");

    const r = house.rooms.find((rm) => pointInPolygon([p.x, p.z], rm.poly))?.id ?? null;
    if (r !== room.current) {
      room.current = r;
      onRoom(r);
    }
    // publish pose for the mini-plan, only on meaningful change (keeps React renders rare)
    const lp = lastPose.current;
    if (Math.abs(lp.x - p.x) > 0.05 || Math.abs(lp.z - p.z) > 0.05 || Math.abs(angleDelta(lp.yaw, yaw.current)) > 0.05 || Number.isNaN(lp.x)) {
      lastPose.current = { x: p.x, z: p.z, yaw: yaw.current };
      st.setPose({ x: p.x, z: p.z, yaw: yaw.current, room: r });
    }
  });

  return mode === "dollhouse" ? <OrbitControls makeDefault target={center} maxPolarAngle={1.3} minDistance={4} maxDistance={30} enableDamping={!reducedMotion} /> : null;
}
