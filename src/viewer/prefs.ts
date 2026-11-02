/** Per-viewer preferences (localStorage, best-effort) + device capability probes. Client-only. */

export type Quality = "auto" | "high" | "low";
export type Tier = "low" | "high";

const KEY = "tour.prefs.v1";

interface Prefs {
  quality: Quality;
  voice: boolean;
  hintsSeen: boolean;
}

const DEFAULTS: Prefs = { quality: "auto", voice: false, hintsSeen: false };

export function readPrefs(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(window.localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function writePrefs(patch: Partial<Prefs>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    /* private mode / blocked storage: preference just isn't remembered */
  }
}

export const isCoarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function resolveTier(q: Quality): Tier {
  if (q !== "auto") return q;
  const lowMemory = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 3;
  return isCoarse() || lowMemory ? "low" : "high";
}

/** True when this browser can create a WebGL context at all. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}
