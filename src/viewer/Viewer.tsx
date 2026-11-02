"use client";

import { useProgress } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompiledHouse } from "@/domain/compiled";
import { guidedStops, type TourPhoto } from "@/domain/tour-model";
import { TourControls } from "./controls/TourControls";
import { FurnitureItem } from "./furniture/Furniture";
import { readPrefs, resolveTier, writePrefs, type Quality } from "./prefs";
import { Effects, GroundShadows, InvalidateOnLoad, Sky } from "./scene/Atmosphere";
import { Lighting } from "./scene/Environment";
import { Kitchen } from "./scene/Kitchen";
import { Ceilings, Floors, Walls } from "./scene/Structure";
import { useTour } from "./store";
import { GuidedTour, travelTo } from "./tour-flow";
import { Overlay } from "./ui/Overlay";
import { narrator } from "./voice/narrator";

export interface ViewerStart {
  cam?: string;
  mode?: "dollhouse";
  room?: string;
  guided?: boolean;
}

export interface ViewerProps {
  house: CompiledHouse;
  photos: TourPhoto[];
  /** false while the cover/details page is shown — rendering and audio pause, viewpoint is kept */
  active: boolean;
  start?: ViewerStart;
  /** hide all UI (screenshots) */
  clean?: boolean;
  reducedMotion: boolean;
  onExit: () => void;
  onFail: (reason: "context-lost") => void;
  onDetails: () => void;
}

function Hotspots({ house }: { house: CompiledHouse }) {
  return (
    <group>
      {house.hotspots.map((h) => (
        // 2.5 cm up: clears rugs (≤ 2 cm) so the rings never z-fight with them
        <group key={h.id} position={[h.pos[0], 0.025, h.pos[2]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <mesh
            onClick={(e) => {
              if (e.delta > 6) return; // it was a look-drag, not a tap
              e.stopPropagation();
              if (useTour.getState().guided !== "off") return;
              travelTo(house, [h.pos[0], h.pos[2]]);
            }}
          >
            <circleGeometry args={[0.26, 32]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.18} depthWrite={false} />
          </mesh>
          <mesh>
            <ringGeometry args={[0.2, 0.26, 40]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthWrite={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Scene-ready signal: all loads settled and a few frames drawn.
 * Exposed as `data-tour-ready` on the viewer root (Playwright + screenshot scripts wait on it).
 */
function ReadyProbe({ onReady }: { onReady: () => void }) {
  const { active } = useProgress();
  const invalidate = useThree((s) => s.invalidate);
  const frames = useRef(0);
  const quietSince = useRef<number | null>(null);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    frames.current++;
    const now = performance.now();
    if (active) quietSince.current = null;
    else quietSince.current ??= now;
    if (frames.current > 3 && quietSince.current !== null && now - quietSince.current > 400) {
      done.current = true;
      onReady();
    } else invalidate(); // keep ticking until settled (demand frameloop)
  });
  return null;
}

function ContextGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => {
      e.preventDefault();
      onLost();
    };
    el.addEventListener("webglcontextlost", lost);
    return () => el.removeEventListener("webglcontextlost", lost);
  }, [gl, onLost]);
  return null;
}

export function Viewer({ house, photos, active, start, clean = false, reducedMotion, onExit, onFail, onDetails }: ViewerProps) {
  const mode = useTour((s) => s.mode);
  const [room, setRoom] = useState<string | null>(null);
  const [voice, setVoiceState] = useState(() => readPrefs().voice);
  const [quality, setQualityState] = useState<Quality>(() => readPrefs().quality);
  const [ready, setReady] = useState(false);
  const tier = resolveTier(quality);
  const dpr: [number, number] = tier === "low" ? [1, 1.5] : [1, 2];
  const voiceRef = useRef(voice);

  const stops = useMemo(() => guidedStops(house), [house]);
  const guide = useMemo(() => new GuidedTour(house, stops, voiceRef), [house, stops]);

  // fresh transient state per tour; stop speech + timers when leaving
  useEffect(() => {
    useTour.getState().reset();
    return () => {
      guide.dispose();
      narrator.stop();
      useTour.getState().reset();
    };
  }, [guide]);

  // deep links (validated — unknown ids fall back to walk mode)
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current || !start) return;
    applied.current = true;
    const st = useTour.getState();
    if (start.cam && house.photoCams.some((c) => c.photo === start.cam)) st.showPhoto(start.cam);
    else if (start.mode === "dollhouse") st.setMode("dollhouse");
    else if (start.room) {
      const stop = stops.find((s) => s.room === start.room);
      const h = house.hotspots.find((x) => x.room === start.room);
      if (stop) st.go({ pos: stop.pos, yaw: stop.yaw, cut: true });
      else if (h) st.go({ pos: [h.pos[0], h.pos[2]], cut: true });
    }
    if (start.guided && stops.length) guide.start();
    // StrictMode / remount resets the store in the cleanup above — re-apply on the next mount
    return () => void (applied.current = false);
  }, [start, house, stops, guide]);

  // leaving the 3D view pauses the guided tour and speech
  useEffect(() => {
    if (!active) {
      guide.pause();
      narrator.stop();
    }
  }, [active, guide]);

  const onRoom = useCallback(
    (id: string | null) => {
      setRoom(id);
      // free exploration: speak each room once when entered (the guided tour narrates itself)
      if (voiceRef.current && id && house.narration[id] && useTour.getState().guided === "off") narrator.speak(id, house.narration[id]);
    },
    [house],
  );

  const setVoice = (on: boolean) => {
    setVoiceState(on);
    voiceRef.current = on;
    writePrefs({ voice: on });
    const st = useTour.getState();
    if (st.guided === "playing") return guide.replay();
    if (!on) return narrator.stop();
    narrator.unlock();
    const text = [house.narration._intro, room && house.narration[room]].filter(Boolean).join(" ");
    narrator.speak(room ?? "_intro", text, { force: true });
  };

  const setQuality = (q: Quality) => {
    setQualityState(q);
    writePrefs({ quality: q });
  };

  const lost = useCallback(() => onFail("context-lost"), [onFail]);

  return (
    <div className="relative h-dvh w-full touch-none select-none overflow-hidden bg-neutral-950" data-tour-ready={ready ? "true" : "false"} data-tier={tier}>
      <Canvas
        dpr={dpr}
        frameloop={active ? "demand" : "never"}
        camera={{ fov: 70, near: 0.1, far: 120, position: [3, 1.55, 6] }}
        gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
          gl.toneMappingExposure = 0.92;
        }}
        aria-label={`3D model of ${house.title}`}
      >
        <ContextGuard onLost={lost} />
        {/* no AdaptiveDpr: its resolution drops while moving read as blocky flicker; DPR is fixed per tier instead */}
        <InvalidateOnLoad />
        <Suspense fallback={null}>
          <Sky rotation={Math.PI * 0.5} tier={tier} />
        </Suspense>
        <Lighting house={house} tier={tier} />
        <GroundShadows house={house} />
        <Floors house={house} />
        <Walls house={house} cutaway={mode === "dollhouse"} />
        {mode !== "dollhouse" && <Ceilings house={house} />}
        {house.fixtures.map((f) => (
          <Kitchen key={f.id} f={f} />
        ))}
        {house.items
          .filter((i) => mode !== "dollhouse" || (i.mount === "floor" && !["curtain", "mirror", "tv"].includes(i.builder)))
          .map((i) => (
            <FurnitureItem key={`${i.room}-${i.id}`} item={i} />
          ))}
        {mode === "walk" && <Hotspots house={house} />}
        <TourControls house={house} reducedMotion={reducedMotion} onRoom={onRoom} />
        <Effects tier={tier} />
        <ReadyProbe onReady={() => setReady(true)} />
      </Canvas>
      {!clean && (
        <Overlay
          house={house}
          photos={photos}
          stops={stops}
          guide={guide}
          room={room}
          ready={ready}
          voice={voice}
          onVoice={setVoice}
          quality={quality}
          onQuality={setQuality}
          reducedMotion={reducedMotion}
          onExit={onExit}
          onDetails={onDetails}
        />
      )}
    </div>
  );
}
