import { SECONDS_PER_WORD } from "@/domain/site-compiler";

export interface NarrationCallbacks {
  /** absolute word index within the chapter */
  onWord(index: number): void;
  onEnd(): void;
}

export interface PlayOptions {
  /** first word to speak (resume support) */
  from: number;
  muted: boolean;
}

/**
 * Word-synced narrator on the Web Speech API with a timer fallback.
 * - speech: `boundary` events drive word highlighting; if a voice never emits
 *   boundaries (some network voices), words are estimated from elapsed time.
 * - muted / unsupported / blocked: words advance every SECONDS_PER_WORD.
 * Every play() supersedes the previous one (token guard), so callers can fire freely.
 */
export class ChapterNarrator {
  private token = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private voice: SpeechSynthesisVoice | null = null;
  private unlocked = false;
  readonly rate = 0.98;

  get supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
  }

  /** Call synchronously inside a user gesture (iOS requires it before the first speak). */
  unlock(): void {
    if (!this.supported || this.unlocked) return;
    this.unlocked = true;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }

  private pickVoice() {
    if (!this.supported || this.voice) return;
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
    const prefer = [/natural/i, /samantha/i, /google uk english female/i, /daniel/i, /google us english/i, /serena|karen|moira/i];
    this.voice = prefer.map((re) => voices.find((v) => re.test(v.name))).find(Boolean) ?? voices.find((v) => v.localService) ?? voices[0] ?? null;
  }

  stop(): void {
    this.token++;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.supported) window.speechSynthesis.cancel();
  }

  play(words: string[], opts: PlayOptions, cb: NarrationCallbacks): void {
    this.stop();
    const from = Math.max(0, Math.min(words.length, opts.from));
    if (from >= words.length) {
      cb.onEnd();
      return;
    }
    if (opts.muted || !this.supported) this.runTimer(words, from, cb, this.token, true);
    else this.speak(words, from, cb);
  }

  private later(fn: () => void, ms: number) {
    this.timers.push(setTimeout(fn, ms));
  }

  /** Timer-driven word stepping. `ends` = whether reaching the last word ends narration. */
  private runTimer(words: string[], from: number, cb: NarrationCallbacks, token: number, ends: boolean, secPerWord = SECONDS_PER_WORD) {
    let i = from;
    const step = () => {
      if (token !== this.token) return;
      if (i >= words.length) {
        if (ends) cb.onEnd();
        return;
      }
      cb.onWord(i);
      // linger a little on sentence ends
      const pause = /[.!?]$/.test(words[i]) ? 0.35 : /[,;:—]$/.test(words[i]) ? 0.15 : 0;
      i++;
      this.later(step, (secPerWord + pause) * 1000);
    };
    step();
  }

  private speak(words: string[], from: number, cb: NarrationCallbacks) {
    const token = this.token;
    this.pickVoice();
    const slice = words.slice(from);
    const text = slice.join(" ");
    const offsets: number[] = [];
    let acc = 0;
    for (const w of slice) {
      offsets.push(acc);
      acc += w.length + 1;
    }
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang ?? "en-US";
    u.rate = this.rate;
    let started = false;
    let gotBoundary = false;
    let estimating = false;
    let ended = false;
    const finish = () => {
      if (ended || token !== this.token) return;
      ended = true;
      cb.onWord(words.length - 1);
      cb.onEnd();
    };

    u.onstart = () => {
      if (token !== this.token) return;
      started = true;
      cb.onWord(from);
      // voices without boundary events → estimate word timing
      this.later(() => {
        if (token !== this.token || gotBoundary || ended) return;
        estimating = true;
        this.runTimer(words, from + 1, cb, token, false, SECONDS_PER_WORD / this.rate);
      }, 900);
      // safety net for engines that never fire `end` (Chrome long-utterance bug)
      this.later(finish, (slice.length * 0.62 + 4) * 1000);
    };
    u.onboundary = (e) => {
      if (token !== this.token || estimating) return;
      if (e.name && e.name !== "word") return;
      gotBoundary = true;
      let lo = 0;
      let hi = offsets.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (offsets[mid] <= e.charIndex) lo = mid;
        else hi = mid - 1;
      }
      cb.onWord(from + lo);
    };
    u.onend = finish;
    u.onerror = (e) => {
      if (token !== this.token || e.error === "interrupted" || e.error === "canceled") return;
      // blocked (e.g. iOS without gesture) or synthesis failure → silent fallback
      this.stop();
      this.runTimer(words, from, cb, this.token, true);
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    // never started (no voices / autoplay policy) → fallback keeps the tour moving
    this.later(() => {
      if (token !== this.token || started) return;
      this.stop();
      this.runTimer(words, from, cb, this.token, true);
    }, 2500);
  }
}

export const chapterNarrator = new ChapterNarrator();
