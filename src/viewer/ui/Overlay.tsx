"use client";

import { Box, Camera, Footprints, Volume2, VolumeX } from "lucide-react";
import type { CompiledHouse } from "@/domain/compiled";
import { useTour, type TourMode } from "../store";
import { Joystick } from "./Joystick";
import { Subtitles } from "./Subtitles";

interface Props {
  house: CompiledHouse;
  room: string | null;
  voice: boolean;
  onVoice: () => void;
}

const MODES: { id: TourMode; label: string; Icon: typeof Box }[] = [
  { id: "walk", label: "Walk", Icon: Footprints },
  { id: "dollhouse", label: "Dollhouse", Icon: Box },
];

export function Overlay({ house, room, voice, onVoice }: Props) {
  const { mode, photo, setMode, showPhoto, teleport } = useTour();
  const roomName = house.rooms.find((r) => r.id === room)?.name;
  const estimated = house.rooms.some((r) => r.est);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      {/* top bar */}
      <div className="flex items-start justify-between gap-3">
        <div className="pointer-events-auto rounded-2xl bg-white/85 px-4 py-3 shadow-sm backdrop-blur">
          <h1 className="text-sm font-semibold text-neutral-900">{house.title}</h1>
          <p className="text-xs text-neutral-500">
            {mode === "walk" && roomName ? roomName : mode === "photo" ? `Photo match · ${photo}` : "Overview"}
            {estimated && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">Estimated layout</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={onVoice}
          className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-white/85 text-neutral-800 shadow-sm backdrop-blur transition-colors hover:bg-white"
          aria-label={voice ? "Mute voice-over" : "Play voice-over"}
        >
          {voice ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
      </div>

      {/* bottom */}
      <div className="flex flex-col gap-3">
        <Subtitles />
        <div className="flex items-end justify-between gap-3">
          <div className="hidden pointer-coarse:block">{mode === "walk" && <Joystick />}</div>
          <p className="pointer-events-none hidden rounded-full bg-black/40 px-3 py-1.5 text-xs text-white pointer-fine:block">
            Drag to look · WASD to move · click rings to jump
          </p>
        </div>

        <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {house.hotspots.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => teleport([h.pos[0], 0, h.pos[2]])}
              className="shrink-0 rounded-full bg-white/85 px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-sm backdrop-blur transition-colors hover:bg-white"
            >
              {house.rooms.find((r) => r.id === h.room)?.name ?? h.room}
              <span className="ml-1 text-neutral-400">{h.id.replace("hs-", "")}</span>
            </button>
          ))}
        </div>

        <div className="pointer-events-auto mx-auto flex items-center gap-1 rounded-full bg-white/90 p-1 shadow-md backdrop-blur">
          {MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${mode === id ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
          {house.photoCams.map((c) => (
            <button
              key={c.photo}
              type="button"
              onClick={() => showPhoto(c.photo)}
              className={`flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium transition-colors ${mode === "photo" && photo === c.photo ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
              title={`Photo-match camera ${c.photo}`}
            >
              <Camera className="size-4" />
              {c.photo}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
