// Plays a list of commands on one layer: draws each one while its narration
// is spoken, and supports pause, back one step, and speed.
import { renderCommand, type Drawn, type Scene } from "./render";
import type { SpeakHandle, TTSProvider } from "./tts";
import type { Command, Layer } from "./types";

const PEN_SPEED = 0.9; // slide pixels per millisecond at 1x
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export type PlayerEvents = {
  onStep?: (index: number, total: number) => void;
  onCaption?: (text: string) => void;
  onState?: (playing: boolean) => void;
  onSkip?: (index: number, reason: string) => void;
  onFinish?: () => void;
};

export class Player {
  private commands: Command[] = [];
  private index = 0; // the command being drawn, or the next one to draw
  private playing = false;
  private speed = 1;
  private token = 0; // bumping this cancels whatever step is running
  private speech: SpeakHandle | null = null;
  private partial: Drawn | null = null; // a step that was interrupted mid-draw

  constructor(
    private scene: Scene,
    private layer: Layer,
    private tts: () => TTSProvider,
    private events: PlayerEvents = {},
  ) {}

  get isPlaying() {
    return this.playing;
  }
  get finished() {
    return this.index >= this.commands.length;
  }

  load(commands: Command[]) {
    this.stop();
    this.commands = commands;
    this.jumpTo(0);
  }

  setSpeed(speed: number) {
    this.speed = speed; // applies from the next command
  }

  play() {
    if (this.playing) return;
    if (this.finished) this.jumpTo(0);
    this.playing = true;
    this.events.onState?.(true);
    void this.run();
  }

  /** Freeze. The interrupted command is redrawn from its start on resume. */
  pause() {
    if (!this.playing) return;
    this.stop();
    this.events.onState?.(false);
  }

  /** Go back one command (works while playing or paused). */
  back() {
    const wasPlaying = this.playing;
    this.stop();
    this.jumpTo(Math.max(0, this.index - 1));
    if (wasPlaying) {
      this.playing = true;
      void this.run();
    }
  }

  restart() {
    this.stop();
    this.jumpTo(0);
    this.events.onState?.(false);
  }

  private stop() {
    this.playing = false;
    this.token++;
    this.speech?.cancel();
    this.speech = null;
  }

  /** Rebuild the layer as it looks just before command `target`. */
  private jumpTo(target: number) {
    this.partial = null;
    this.scene.layers[this.layer].replaceChildren();
    this.scene.notes[this.layer] = [];
    for (let i = 0; i < target; i++) {
      const cmd = this.commands[i];
      if (cmd.op === "clear" && cmd.layer === "all") {
        // Replaying must not wipe the other layer: clear only our own.
        this.scene.layers[this.layer].replaceChildren();
        this.scene.notes[this.layer] = [];
        continue;
      }
      renderCommand(cmd, this.seed(i), this.layer, this.scene)?.setProgress(1);
    }
    this.index = target;
    this.events.onStep?.(target, this.commands.length);
  }

  private seed(i: number) {
    return (this.layer === "answers" ? 500_000 : 0) + i * 7919 + 17;
  }

  private async run() {
    const token = this.token;
    while (this.playing && this.index < this.commands.length) {
      await this.step(this.index, token);
      if (token !== this.token) return; // paused or jumped while drawing
      this.index++;
      this.events.onStep?.(this.index, this.commands.length);
    }
    if (token === this.token) {
      this.playing = false;
      this.events.onState?.(false);
      this.events.onFinish?.();
    }
  }

  private step(i: number, token: number): Promise<void> {
    const cmd = this.commands[i];
    this.partial?.undo(); // resuming: redraw the interrupted command cleanly
    this.partial = null;
    this.events.onStep?.(i, this.commands.length);
    this.events.onCaption?.(cmd.say);

    const drawn = renderCommand(cmd, this.seed(i), this.layer, this.scene);
    if (!drawn) this.events.onSkip?.(i, `could not draw ${cmd.op}`);
    this.partial = drawn;

    const tts = this.tts();
    const speed = this.speed;
    const drawMs = (cmd.op === "pause" ? cmd.ms : drawn ? clamp(drawn.length / PEN_SPEED, 350, 3200) : 0) / speed;
    // Spread the drawing across the narration so pen and voice finish together.
    let targetMs = Math.max(drawMs, Math.min(tts.estimateMs(cmd.say, speed) * 0.85, 9000));
    const started = performance.now();
    let spoken = false;
    let shown = 0;

    const handle = tts.speak(cmd.say, {
      rate: speed,
      onBoundary: (charIndex) => {
        // Real timing from the speech engine: re-estimate when the sentence ends.
        const fraction = charIndex / Math.max(1, cmd.say.length);
        if (fraction > 0.2) {
          const total = (performance.now() - started) / fraction;
          targetMs = Math.max(drawMs, Math.min(total * 0.9, 9000));
        }
      },
    });
    this.speech = handle;
    void handle.done.then(() => (spoken = true));

    return new Promise((resolve) => {
      const tick = (now: number) => {
        if (token !== this.token) return resolve(); // cancelled: leave the partial drawing
        const p = targetMs > 0 ? clamp((now - started) / targetMs, 0, 1) : 1;
        shown = Math.max(shown, p); // never un-draw if the estimate grows
        drawn?.setProgress(shown);
        if (shown >= 1 && spoken) {
          this.partial = null;
          window.setTimeout(resolve, 160 / speed); // a breath between commands
        } else {
          requestAnimationFrame(tick);
        }
      };
      requestAnimationFrame(tick);
    });
  }
}
