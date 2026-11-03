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

  /** Sentence ranges [start, end) — each is spoken as its own utterance (Chrome cuts long utterances off ~15 s). */
  private sentences(text: string): [number, number][] {
    return [...text.matchAll(/[^.!?]+[.!?]*["')]?/g)]
      .map((m) => {
        const lead = m[0].length - m[0].trimStart().length;
        return [m.index! + lead, m.index! + m[0].trimEnd().length] as [number, number];
      })
      .filter(([a, b]) => b > a);
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
    const ws = this.words(text);
    const chunks = this.sentences(text);
    const lastWordOf = (end: number) => {
      let i = 0;
      while (i + 1 < ws.length && ws[i + 1][0] < end) i++;
      return i;
    };
    // caption cursor: real word boundaries move it when the voice sends them; otherwise (many Chrome/Android voices
    // send a few boundaries then go quiet — captions froze on the first words) a watchdog keeps it moving at speech
    // pace, never past the sentence being spoken
    let wi = -1;
    let cap = 0;
    let moved = performance.now();
    const show = (i: number) => {
      if (i <= wi || i >= ws.length) return;
      wi = i;
      moved = performance.now();
      this.emit({ text, word: ws[i] });
    };
    this.timer = setInterval(() => {
      if (token !== this.token) return;
      if (performance.now() - moved > WORD_MS && wi < cap) show(wi + 1);
    }, 90);

    const say = (c: number) => {
      if (token !== this.token) return;
      if (c >= chunks.length) return this.finish(token, opts.onEnd);
      const [cs, ce] = chunks[c];
      cap = lastWordOf(ce);
      show(ws.findIndex(([a]) => a >= cs)); // first word of the sentence, as it starts
      const u = new SpeechSynthesisUtterance(text.slice(cs, ce));
      if (this.voice) u.voice = this.voice;
      u.rate = 0.98;
      u.onboundary = (e) => {
        if (token !== this.token || (e.name && e.name !== "word")) return;
        const at = cs + e.charIndex;
        let i = ws.findIndex(([a, b]) => at >= a && at < b);
        if (i < 0) i = ws.findIndex(([a]) => a >= at);
        if (i >= 0 && i <= cap) show(i);
      };
      u.onend = () => say(c + 1);
      u.onerror = (e) => {
        if (token !== this.token || e.error === "interrupted" || e.error === "canceled") return;
        // blocked (e.g. no gesture yet) → silent captions from here so the guided tour keeps moving
        this.paced(text, token, opts.onEnd, Math.max(0, wi));
      };
      window.speechSynthesis.speak(u);
    };
    say(0);
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
