import type { CompiledHouse } from "@/domain/compiled";
import { pathClear } from "@/domain/collision";
import type { Vec2 } from "@/domain/house-spec";
import { roomAt, type GuidedStop } from "@/domain/tour-model";
import { useTour } from "./store";
import { narrator } from "./voice/narrator";

const FADE_MS = 220;

/**
 * Moves the walk camera. Same room → glide; another room (or from dollhouse/photo) → fade-cut,
 * so the camera never visibly passes through walls.
 */
export function travelTo(house: CompiledHouse, pos: Vec2, yaw?: number): number {
  const st = useTour.getState();
  const sameRoom = st.mode === "walk" && st.pose.room !== null && roomAt(house, pos)?.id === st.pose.room;
  // glide only along a collision-free straight line; otherwise fade-cut (never slide through furniture)
  if (sameRoom && pathClear(house, [st.pose.x, st.pose.z], pos)) {
    st.go({ pos, yaw, cut: false });
    return 900;
  }
  st.setFading(true);
  setTimeout(() => {
    useTour.getState().go({ pos, yaw, cut: true });
    setTimeout(() => useTour.getState().setFading(false), 80);
  }, FADE_MS);
  return FADE_MS + 420;
}

/** Guided visit: one stop per room — travel, narrate (or silent captions), pause, advance. */
export class GuidedTour {
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly house: CompiledHouse,
    readonly stops: GuidedStop[],
    /** live voice preference (a ref, read at speak time) */
    private readonly voice: { readonly current: boolean },
  ) {}

  get length() {
    return this.stops.length;
  }

  start() {
    narrator.unlock(); // inside the click — iOS needs a gesture before speech
    this.play(0, true);
  }

  play(i: number, withIntro = false) {
    const stop = this.stops[i];
    if (!stop) return this.end();
    this.clear();
    narrator.stop();
    useTour.getState().setGuided("playing", i);
    const wait = travelTo(this.house, stop.pos, stop.yaw);
    this.later(wait, () => this.say(i, withIntro));
  }

  /** (Re)speak the current stop without moving, e.g. after toggling voice. */
  replay() {
    const { guided, stop } = useTour.getState();
    if (guided === "playing") {
      this.clear();
      this.say(stop, false);
    }
  }

  pause() {
    this.clear();
    narrator.stop();
    if (useTour.getState().guided === "playing") useTour.getState().setGuided("paused");
  }

  resume() {
    const { guided, stop } = useTour.getState();
    if (guided === "ended") return this.play(0, true);
    this.play(stop);
  }

  next() {
    const { stop } = useTour.getState();
    if (stop + 1 < this.length) this.play(stop + 1);
    else this.end();
  }

  prev() {
    this.play(Math.max(0, useTour.getState().stop - 1));
  }

  exit() {
    this.clear();
    narrator.stop();
    useTour.getState().setGuided("off");
  }

  dispose() {
    this.clear();
  }

  private say(i: number, withIntro: boolean) {
    const stop = this.stops[i];
    const intro = withIntro ? this.house.narration._intro : "";
    const text = [intro, stop.text || stop.title].filter(Boolean).join(" ");
    narrator.speak(`guided:${i}`, text, {
      force: true,
      silent: !this.voice.current,
      onEnd: () =>
        this.later(1100, () => {
          const s = useTour.getState();
          if (s.guided === "playing" && s.stop === i) this.next();
        }),
    });
  }

  private end() {
    this.clear();
    useTour.getState().setGuided("ended");
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private clear() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
