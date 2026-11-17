// Text-to-speech behind one small interface, so a local model or a paid API
// with word timestamps can replace the browser voice later.

export interface SpeakOptions {
  rate: number;
  /** Called with the character index reached, when the engine reports it. */
  onBoundary?: (charIndex: number) => void;
}
export interface SpeakHandle {
  /** Resolves when the speech ends, is cancelled, or times out. Never rejects. */
  done: Promise<void>;
  cancel(): void;
}
export interface TTSProvider {
  readonly name: string;
  /** Call from a tap handler: iOS only allows speech after a user gesture. */
  unlock(): void;
  estimateMs(text: string, rate: number): number;
  speak(text: string, opts: SpeakOptions): SpeakHandle;
}

/** A rough reading-time estimate for when the engine gives no timing. */
export function estimateSpeechMs(text: string, rate: number): number {
  const trimmed = text.trim();
  return trimmed ? (300 + trimmed.length * 62) / rate : 0;
}

/** No sound: just waits as long as the words would take (used when muted). */
export class SilentTTS implements TTSProvider {
  readonly name = "silent";
  unlock() {}
  estimateMs = estimateSpeechMs;
  speak(text: string, opts: SpeakOptions): SpeakHandle {
    let timer = 0;
    let finish = () => {};
    const done = new Promise<void>((resolve) => {
      finish = resolve;
      timer = window.setTimeout(resolve, estimateSpeechMs(text, opts.rate));
    });
    return { done, cancel: () => (window.clearTimeout(timer), finish()) };
  }
}

/** The browser's built-in voice (free, works offline on iPad). */
export class BrowserTTS implements TTSProvider {
  readonly name = "browser";
  private synth = window.speechSynthesis;
  estimateMs = estimateSpeechMs;

  static available(): boolean {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  unlock() {
    // An empty utterance inside a tap "unlocks" speech for later, untapped calls.
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    this.synth.speak(u);
  }

  speak(text: string, opts: SpeakOptions): SpeakHandle {
    if (!text.trim()) return { done: Promise.resolve(), cancel: () => {} };
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = opts.rate;
    utterance.lang = "en-US";
    const voice = this.synth.getVoices().find((v) => v.lang.startsWith("en") && v.localService);
    if (voice) utterance.voice = voice;

    let finish = () => {};
    const done = new Promise<void>((resolve) => (finish = resolve));
    // Safari sometimes never fires `end` (or `start`). Never let playback hang.
    const estimate = estimateSpeechMs(text, opts.rate);
    let watchdog = window.setTimeout(finish, 1500); // no `start` => no voice here
    utterance.onstart = () => {
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(finish, estimate * 2 + 3000);
    };
    utterance.onboundary = (e) => opts.onBoundary?.(e.charIndex);
    utterance.onend = utterance.onerror = () => {
      window.clearTimeout(watchdog);
      finish();
    };
    this.synth.speak(utterance);
    return {
      done,
      cancel: () => {
        window.clearTimeout(watchdog);
        utterance.onend = utterance.onerror = null;
        this.synth.cancel();
        finish();
      },
    };
  }
}
