/**
 * Voice-over via the browser Web Speech API (free, offline-capable, no key) + live captions.
 * Swap `speak()` for pre-rendered MP3s (e.g. a TTS API at build time) without touching callers.
 */
export interface Caption {
  text: string;
  /** [start, end) char range of the word being spoken; null before the first boundary */
  word: [number, number] | null;
}

export interface SpeakOptions {
  /** speak even if `key` was the last thing spoken */
  force?: boolean;
  /** captions only (voice muted / speech unavailable) — paced by a timer */
  silent?: boolean;
  /** fires once when the line finished (not when stopped) */
  onEnd?: () => void;
}

type Listener = (c: Caption | null) => void;

const WORD_MS = 380;
const CLEAR_MS = 900;

export class Narrator {
  private voice: SpeechSynthesisVoice | null = null;
  private lastKey: string | null = null;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  /** bumps on every speak/stop so stale callbacks from a cancelled utterance are ignored */
  private token = 0;

  get supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit(c: Caption | null) {
    for (const fn of this.listeners) fn(c);
  }

  private pickVoice() {
    if (!this.supported || this.voice) return;
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    const prefer = [/natural/i, /samantha/i, /google uk english female/i, /google us english/i, /serena|karen|daniel/i];
    this.voice = prefer.map((re) => voices.find((v) => re.test(v.name))).find(Boolean) ?? voices[0] ?? null;
  }

  /** Must run inside a user gesture once (iOS keeps speech locked otherwise). */
  unlock() {
    if (!this.supported) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }

  private words(text: string): [number, number][] {
    return [...text.matchAll(/\S+/g)].map((m) => [m.index!, m.index! + m[0].length]);
  }

  private stopTimers() {
    if (this.timer) clearInterval(this.timer);
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.timer = null;
    this.clearTimer = null;
  }

  private finish(token: number, onEnd?: () => void) {
    if (token !== this.token) return;
    this.stopTimers();
    this.clearTimer = setTimeout(() => token === this.token && this.emit(null), CLEAR_MS);
    onEnd?.();
  }

  /** Timer-paced captions: used when muted, unsupported, or boundary events never arrive (some Android voices). */
  private paced(text: string, token: number, onEnd?: () => void, from = 0) {
    if (this.timer) clearInterval(this.timer);
    const ws = this.words(text);
    let i = from;
    this.timer = setInterval(() => {
      if (token !== this.token) return;
      if (i >= ws.length) return this.finish(token, onEnd);
      this.emit({ text, word: ws[i++] });
    }, WORD_MS);
  }

  /** Speak `text` once per key (re-entering the same room doesn't repeat unless `force`). */
  speak(key: string, text: string, opts: SpeakOptions = {}) {
    if (!text) return;
    if (!opts.force && key === this.lastKey) return;
    this.lastKey = key;
    const token = ++this.token;
    this.stopTimers();
    if (this.supported) window.speechSynthesis.cancel();
    this.emit({ text, word: null });
    if (opts.silent || !this.supported) return this.paced(text, token, opts.onEnd);

    this.pickVoice();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.rate = 0.98;
    let gotBoundary = false;
    let fellBack = false;
    u.onboundary = (e) => {
      if (token !== this.token || fellBack || (e.name && e.name !== "word")) return;
      gotBoundary = true;
      const rest = text.slice(e.charIndex);
      const sp = rest.search(/\s/);
      const end = e.charLength ? e.charIndex + e.charLength : e.charIndex + (sp < 0 ? rest.length : sp);
      this.emit({ text, word: [e.charIndex, end] });
    };
    u.onstart = () =>
      setTimeout(() => {
        if (token !== this.token || gotBoundary) return;
        fellBack = true;
        this.paced(text, token); // captions only; speech end still drives onEnd
      }, 700);
    u.onend = () => this.finish(token, opts.onEnd);
    u.onerror = (e) => {
      if (token !== this.token || e.error === "interrupted" || e.error === "canceled") return;
      // blocked (e.g. no gesture yet) → fall back to silent captions so the guided tour keeps moving
      this.paced(text, token, opts.onEnd);
    };
    window.speechSynthesis.speak(u);
  }

  stop() {
    this.token++;
    if (this.supported) window.speechSynthesis.cancel();
    this.stopTimers();
    this.lastKey = null;
    this.emit(null);
  }
}

export const narrator = new Narrator();
