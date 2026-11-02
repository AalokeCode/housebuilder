"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CompiledHouse } from "@/domain/compiled";
import { pointInPolygon, pointSegment } from "@/domain/geometry";
import type { Vec2 } from "@/domain/house-spec";
import { useTour } from "../store";

const EYE = 1.55;
const SPEED = 1.6;
const BODY = 0.22;
const LOOK = 0.0042;

/** Walk (first-person + hotspots), dollhouse (orbit), photo (locked photo-match camera). */
export function TourControls({ house, onRoom }: { house: CompiledHouse; onRoom: (id: string | null) => void }) {
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
  const center = useMemo(() => new THREE.Vector3((house.bounds.min[0] + house.bounds.max[0]) / 2, 0.8, (house.bounds.min[1] + house.bounds.max[1]) / 2), [house]);

  // demand frameloop: any store change (joystick, teleport, mode) schedules a frame
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
      pressed.add(e.key.toLowerCase());
      invalidate();
    };
    const ku = (e: KeyboardEvent) => pressed.delete(e.key.toLowerCase());
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      pressed.clear();
    };
  }, [mode, gl, invalidate]);

  const blocked = (x: number, z: number) => {
    const p: Vec2 = [x, z];
    if (!house.rooms.some((r) => pointInPolygon(p, r.poly))) return true;
    return house.colliders.some((c) => pointSegment(p, c.a, c.b).d < c.radius + BODY);
  };

  useFrame((_, dt) => {
    if (mode !== "walk") return;
    const st = useTour.getState();
    const p = walkPos.current;

    const moving = !!st.target || keys.current.size > 0 || st.joystick.x !== 0 || st.joystick.y !== 0;
    if (moving) invalidate();
    if (st.target) {
      const goal = new THREE.Vector3(st.target[0], EYE, st.target[2]);
      p.lerp(goal, Math.min(1, dt * 4));
      if (p.distanceTo(goal) < 0.02) {
        p.copy(goal);
        st.clearTarget();
      }
    } else {
      const k = keys.current;
      let f = -st.joystick.y;
      let s = st.joystick.x;
      if (k.has("w") || k.has("arrowup")) f += 1;
      if (k.has("s") || k.has("arrowdown")) f -= 1;
      if (k.has("d")) s += 1;
      if (k.has("a")) s -= 1;
      if (k.has("arrowleft")) yaw.current += dt * 1.6;
      if (k.has("arrowright")) yaw.current -= dt * 1.6;
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
  });

  return mode === "dollhouse" ? <OrbitControls makeDefault target={center} maxPolarAngle={1.3} minDistance={4} maxDistance={30} enableDamping /> : null;
}
