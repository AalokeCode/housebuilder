/**
 * Voice-over via the browser Web Speech API (free, offline-capable, no key) + live captions.
 * Swap `speak()` for pre-rendered MP3s (e.g. a TTS API at build time) without touching callers.
 */
export interface Caption {
  text: string;
  /** [start, end) char range of the word being spoken; null before the first boundary */
  word: [number, number] | null;
}

type Listener = (c: Caption | null) => void;

const WORD_MS = 360;

export class Narrator {
  private voice: SpeechSynthesisVoice | null = null;
  private lastKey: string | null = null;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;

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

  /** Word ranges for the timer fallback (when boundary events are missing, e.g. some Android voices). */
  private words(text: string): [number, number][] {
    return [...text.matchAll(/\S+/g)].map((m) => [m.index!, m.index! + m[0].length]);
  }

  private startFallback(text: string, from = 0) {
    this.clearTimer();
    const ws = this.words(text);
    let i = from;
    this.timer = setInterval(() => {
      if (i >= ws.length) {
        this.clearTimer();
        setTimeout(() => this.emit(null), 900);
        return;
      }
      this.emit({ text, word: ws[i++] });
    }, WORD_MS);
  }

  private clearTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Speak `text` once per key (re-entering the same room doesn't repeat). */
  speak(key: string, text: string, force = false) {
    if (!text) return;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;
    this.clearTimer();
    this.emit({ text, word: null });
    if (!this.supported) return this.startFallback(text);

    this.pickVoice();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.rate = 0.98;
    let gotBoundary = false;
    u.onboundary = (e) => {
      if (e.name && e.name !== "word") return;
      gotBoundary = true;
      const rest = text.slice(e.charIndex);
      const sp = rest.search(/\s/);
      const end = e.charLength ? e.charIndex + e.charLength : e.charIndex + (sp < 0 ? rest.length : sp);
      this.emit({ text, word: [e.charIndex, end] });
    };
    u.onstart = () => setTimeout(() => !gotBoundary && this.startFallback(text), 700);
    u.onend = () => {
      this.clearTimer();
      setTimeout(() => this.emit(null), 900);
    };
    window.speechSynthesis.speak(u);
  }

  stop() {
    if (this.supported) window.speechSynthesis.cancel();
    this.clearTimer();
    this.lastKey = null;
    this.emit(null);
  }
}

export const narrator = new Narrator();
