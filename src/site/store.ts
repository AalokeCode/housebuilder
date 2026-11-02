import { create } from "zustand";

export type TourStatus = "idle" | "playing" | "paused" | "ended" | "preview";

interface SiteTourState {
  status: TourStatus;
  chapter: number;
  chapterCount: number;
  /** word index within the current chapter (−1 = none yet) */
  word: number;
  muted: boolean;
  speechDone: boolean;
  cameraDone: boolean;
  /** bumps on every (re)start of camera motion: chapter change, resume */
  epoch: number;
  /** normalised time used in preview mode */
  previewT: number;
  init(count: number): void;
  start(): void;
  pause(): void;
  resume(): void;
  goTo(index: number): void;
  next(): void;
  prev(): void;
  preview(index: number, t: number): void;
  setMuted(m: boolean): void;
  setWord(i: number): void;
  markSpeechDone(): void;
  markCameraDone(): void;
}

let advanceTimer: ReturnType<typeof setTimeout> | null = null;
const clearAdvance = () => {
  if (advanceTimer) clearTimeout(advanceTimer);
  advanceTimer = null;
};

export const useSiteTour = create<SiteTourState>((set, get) => {
  const enter = (index: number, status: TourStatus = "playing") => {
    clearAdvance();
    set((s) => ({ status, chapter: Math.max(0, Math.min(s.chapterCount - 1, index)), word: -1, speechDone: false, cameraDone: false, epoch: s.epoch + 1 }));
  };
  const maybeAdvance = () => {
    const s = get();
    if (s.status !== "playing" || !s.speechDone || !s.cameraDone || advanceTimer) return;
    advanceTimer = setTimeout(() => {
      advanceTimer = null;
      const st = get();
      if (st.status !== "playing") return;
      if (st.chapter + 1 >= st.chapterCount) set({ status: "ended" });
      else enter(st.chapter + 1);
    }, 700);
  };
  return {
    status: "idle",
    chapter: 0,
    chapterCount: 1,
    word: -1,
    muted: false,
    speechDone: false,
    cameraDone: false,
    epoch: 0,
    previewT: 0.5,
    /** full reset per site — no chapter/status/timer carries over between showcases */
    init: (count) => {
      clearAdvance();
      set((s) => ({ status: "idle", chapter: 0, chapterCount: Math.max(1, count), word: -1, speechDone: false, cameraDone: false, epoch: s.epoch + 1, previewT: 0.5 }));
    },
    start: () => enter(0),
    pause: () => {
      clearAdvance();
      if (get().status === "playing") set({ status: "paused" });
    },
    resume: () => {
      const s = get();
      if (s.status === "ended" || s.status === "idle") return enter(0);
      // camera blends back to the path; speech restarts from the current word
      set({ status: "playing", epoch: s.epoch + 1 });
      maybeAdvance();
    },
    goTo: (i) => enter(i, "playing"),
    next: () => {
      const s = get();
      if (s.chapter + 1 < s.chapterCount) enter(s.chapter + 1);
      else {
        clearAdvance();
        set({ status: "ended" });
      }
    },
    prev: () => enter(get().chapter - 1),
    preview: (i, t) => {
      clearAdvance();
      set((s) => ({ status: "preview", chapter: Math.max(0, Math.min(s.chapterCount - 1, i)), previewT: t, word: -1, epoch: s.epoch + 1 }));
    },
    setMuted: (muted) => set({ muted }),
    setWord: (word) => set({ word }),
    markSpeechDone: () => {
      set({ speechDone: true });
      maybeAdvance();
    },
    markCameraDone: () => {
      set({ cameraDone: true });
      maybeAdvance();
    },
  };
});
