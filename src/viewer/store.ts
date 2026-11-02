import { create } from "zustand";
import type { Vec2 } from "@/domain/house-spec";

export type TourMode = "walk" | "dollhouse" | "photo";
export type GuidedStatus = "off" | "playing" | "paused" | "ended";

/** Camera destination. `cut` = jump behind a fade (different room / reduced motion); else glide. */
export interface Travel {
  pos: Vec2;
  yaw?: number;
  cut: boolean;
  /** bumps so repeated travel to the same spot still fires */
  seq: number;
}

export interface Pose {
  x: number;
  z: number;
  yaw: number;
  room: string | null;
}

interface TourState {
  mode: TourMode;
  photo: string | null;
  travel: Travel | null;
  /** screen fade (0 → 1 covers the canvas while the camera cuts) */
  fading: boolean;
  joystick: { x: number; y: number };
  pose: Pose;
  guided: GuidedStatus;
  /** current guided stop index */
  stop: number;
  setMode: (m: TourMode) => void;
  showPhoto: (id: string) => void;
  go: (t: Omit<Travel, "seq">) => void;
  arrived: () => void;
  setFading: (f: boolean) => void;
  setJoystick: (x: number, y: number) => void;
  setPose: (p: Pose) => void;
  setGuided: (g: GuidedStatus, stop?: number) => void;
  /** clear transient state between tours (module-level store survives client navigation) */
  reset: () => void;
}

const initial = {
  mode: "walk" as TourMode,
  photo: null,
  travel: null,
  fading: false,
  joystick: { x: 0, y: 0 },
  pose: { x: 0, z: 0, yaw: 0, room: null },
  guided: "off" as GuidedStatus,
  stop: 0,
};

let seq = 0;

export const useTour = create<TourState>((set) => ({
  ...initial,
  setMode: (mode) => set((s) => ({ mode, photo: mode === "photo" ? s.photo : null, guided: mode === "walk" ? s.guided : "off" })),
  showPhoto: (photo) => set({ mode: "photo", photo, guided: "off" }),
  go: (t) => set({ mode: "walk", travel: { ...t, seq: ++seq } }),
  arrived: () => set({ travel: null }),
  setFading: (fading) => set({ fading }),
  setJoystick: (x, y) => set({ joystick: { x, y } }),
  setPose: (pose) => set({ pose }),
  setGuided: (guided, stop) => set((s) => ({ guided, stop: stop ?? s.stop })),
  reset: () => set({ ...initial, joystick: { x: 0, y: 0 } }),
}));
