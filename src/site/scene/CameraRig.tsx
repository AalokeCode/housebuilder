"use client";

import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type ComponentRef } from "react";
import * as THREE from "three";
import { easeInOut, sampleCamera, type CompiledChapter } from "@/domain/site-compiler";
import { useSiteTour } from "../store";

const tmpPos = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();

/**
 * Automated drone camera. Each chapter has a keyframed move (orbit or dolly);
 * entering a chapter (or resuming) blends from wherever the camera is along a
 * lifted arc. Frames are only requested while moving (frameloop="demand").
 * When paused / ended, OrbitControls take over for free orbit.
 */
export function CameraRig({ chapters }: { chapters: CompiledChapter[] }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const st = useRef({ epoch: -1, chapter: -1, t: 0, blend: 0, blendDur: 3, lift: 0, from: new THREE.Vector3(), fromTarget: new THREE.Vector3(), target: new THREE.Vector3() });
  const status = useSiteTour((s) => s.status);

  // initial pose: chapter 0 start
  useEffect(() => {
    const ch = chapters[0];
    if (!ch) return;
    const p = sampleCamera(ch.camera, 0);
    camera.position.set(...p.pos);
    st.current.target.set(...p.target);
    camera.lookAt(st.current.target);
    controls.current?.target.copy(st.current.target);
    invalidate();
  }, [chapters, camera, invalidate]);

  useEffect(() => useSiteTour.subscribe(() => invalidate()), [invalidate]);

  // portrait phones: widen the vertical FOV so framing keeps roughly the landscape horizontal FOV
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const base = 40;
    const ref = 1.5; // aspect the chapter framings were authored for
    const fov = aspect >= ref ? base : (2 * Math.atan(Math.tan((base * Math.PI) / 360) * (ref / aspect) * 0.62) * 180) / Math.PI;
    camera.fov = THREE.MathUtils.clamp(fov, base, 72);
    camera.updateProjectionMatrix();
    invalidate();
  }, [aspect, camera, invalidate]);

  useFrame((_, rawDt) => {
    const s = useSiteTour.getState();
    const r = st.current;
    const ch = chapters[s.chapter];
    if (!ch) return;
    const dt = Math.min(rawDt, 0.1);

    if (s.status === "preview") {
      if (r.epoch !== s.epoch) {
        r.epoch = s.epoch;
        r.chapter = s.chapter;
        const p = sampleCamera(ch.camera, s.previewT);
        camera.position.set(...p.pos);
        r.target.set(...p.target);
        camera.lookAt(r.target);
        controls.current?.target.copy(r.target);
      }
      return;
    }
    if (s.status !== "playing") return;

    if (r.epoch !== s.epoch) {
      if (r.chapter !== s.chapter || !s.cameraDone) {
        // new chapter (or re-entered via prev/next/goTo) → restart its move
        if (r.chapter !== s.chapter || r.t >= ch.duration) r.t = 0;
        r.chapter = s.chapter;
      }
      r.epoch = s.epoch;
      r.blend = 0;
      r.from.copy(camera.position);
      r.fromTarget.copy(controls.current?.target ?? r.target);
      const goal = sampleCamera(ch.camera, r.t / ch.duration);
      const dist = r.from.distanceTo(tmpPos.set(...goal.pos));
      r.blendDur = THREE.MathUtils.clamp(dist / 70, 1.6, 4.5);
      r.lift = Math.min(45, dist * 0.18);
    }

    r.t = Math.min(ch.duration, r.t + dt);
    r.blend = Math.min(r.blendDur, r.blend + dt);
    const pose = sampleCamera(ch.camera, r.t / ch.duration);
    const b = easeInOut(r.blend / r.blendDur);
    tmpPos.set(...pose.pos).lerp(r.from, 1 - b);
    tmpPos.y += Math.sin(Math.PI * b) * r.lift;
    tmpTarget.set(...pose.target).lerp(r.fromTarget, 1 - b);
    camera.position.copy(tmpPos);
    r.target.copy(tmpTarget);
    camera.lookAt(r.target);
    controls.current?.target.copy(r.target);

    const done = r.t >= ch.duration && r.blend >= r.blendDur;
    if (done) {
      if (!s.cameraDone) s.markCameraDone();
    } else invalidate();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={status !== "preview"}
      enableDamping
      dampingFactor={0.08}
      minDistance={25}
      maxDistance={1100}
      maxPolarAngle={Math.PI * 0.47}
      onStart={() => {
        if (useSiteTour.getState().status === "playing") useSiteTour.getState().pause();
      }}
    />
  );
}
