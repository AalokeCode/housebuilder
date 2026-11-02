"use client";

import { AdaptiveDpr } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { CompiledHouse } from "@/domain/compiled";
import { TourControls } from "./controls/TourControls";
import { FurnitureItem } from "./furniture/Furniture";
import { Effects, GroundShadows, InvalidateOnLoad, Sky, type Tier } from "./scene/Atmosphere";
import { Lighting } from "./scene/Environment";
import { Kitchen } from "./scene/Kitchen";
import { Ceilings, Floors, Walls } from "./scene/Structure";
import { useTour } from "./store";
import { Overlay } from "./ui/Overlay";
import { narrator } from "./voice/narrator";

function Hotspots({ house }: { house: CompiledHouse }) {
  const teleport = useTour((s) => s.teleport);
  return (
    <group>
      {house.hotspots.map((h) => (
        <group key={h.id} position={[h.pos[0], 0.012, h.pos[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh
            onClick={(e) => {
              e.stopPropagation();
              teleport(h.pos);
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

export function Viewer({ house }: { house: CompiledHouse }) {
  const params = useSearchParams();
  const mode = useTour((s) => s.mode);
  const [room, setRoom] = useState<string | null>(null);
  const [voice, setVoice] = useState(false);
  // client-only component (ssr: false), so matchMedia is available on first render
  const [coarse] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const dpr: [number, number] = coarse ? [1, 1.5] : [1, 2];
  const tier: Tier = coarse ? "low" : "high";
  const clean = params.get("clean") === "1";

  useEffect(() => {
    const cam = params.get("cam");
    const m = params.get("mode");
    if (cam) useTour.getState().showPhoto(cam);
    else if (m === "dollhouse") useTour.getState().setMode("dollhouse");
  }, [params]);

  const onRoom = useCallback(
    (id: string | null) => {
      setRoom(id);
      if (voice && id && house.narration[id]) narrator.speak(id, house.narration[id]);
    },
    [voice, house],
  );

  const toggleVoice = () => {
    if (voice) {
      narrator.stop();
      setVoice(false);
      return;
    }
    setVoice(true);
    // user gesture unlocks speech on iOS
    const text = [house.narration._intro, room && house.narration[room]].filter(Boolean).join(" ");
    narrator.speak(room ?? "_intro", text, true);
  };

  return (
    <div className="relative h-dvh w-full touch-none overflow-hidden bg-[#dfe6ea]">
      <Canvas
        dpr={dpr}
        frameloop="demand"
        camera={{ fov: 70, near: 0.05, far: 600, position: [3, 1.55, 6] }}
        gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
        onCreated={({ gl }) => {
          gl.localClippingEnabled = true;
          gl.toneMappingExposure = 0.92;
        }}
      >
        <AdaptiveDpr pixelated={false} />
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
        {mode !== "photo" && <Hotspots house={house} />}
        <TourControls house={house} onRoom={onRoom} />
        <Effects tier={tier} />
      </Canvas>
      {!clean && <Overlay house={house} room={room} voice={voice} onVoice={toggleVoice} />}
    </div>
  );
}
