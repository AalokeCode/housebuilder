import { create } from "zustand";
import type { Vec3 } from "@/domain/house-spec";

export type TourMode = "walk" | "dollhouse" | "photo";

interface TourState {
  mode: TourMode;
  photo: string | null;
  /** pending teleport destination (walk mode) */
  target: Vec3 | null;
  joystick: { x: number; y: number };
  setMode: (m: TourMode) => void;
  showPhoto: (id: string) => void;
  teleport: (p: Vec3) => void;
  clearTarget: () => void;
  setJoystick: (x: number, y: number) => void;
}

export const useTour = create<TourState>((set) => ({
  mode: "walk",
  photo: null,
  target: null,
  joystick: { x: 0, y: 0 },
  setMode: (mode) => set((s) => ({ mode, photo: mode === "photo" ? s.photo : null })),
  showPhoto: (photo) => set({ mode: "photo", photo }),
  teleport: (target) => set({ mode: "walk", target }),
  clearTarget: () => set({ target: null }),
  setJoystick: (x, y) => set({ joystick: { x, y } }),
}));
