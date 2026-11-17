import { Player } from "./player";
import { el, wobbleFilter, type Scene } from "./render";
import { BrowserTTS, SilentTTS, type TTSProvider } from "./tts";
import { validateCommands, type Command, type Layer, type Page } from "./types";

const $ = <T extends Element>(selector: string) => document.querySelector(selector) as T;

async function main() {
  const [page, rawScript, math] = await Promise.all([
    fetch("/elements.json").then((r) => r.json() as Promise<Page>),
    fetch("/script.json").then((r) => r.json() as Promise<unknown[]>),
    import("./math"),
  ]);

  // The overlay uses the slide's own pixel coordinates, whatever size it is shown at.
  const svg = $<SVGSVGElement>("#overlay");
  svg.setAttribute("viewBox", `0 0 ${page.width} ${page.height}`);
  const defs = el("defs");
  defs.appendChild(wobbleFilter());
  const layers: Record<Layer, SVGGElement> = { walkthrough: el("g"), answers: el("g") };
  const hits = el("g");
  svg.append(defs, layers.walkthrough, layers.answers, hits);

  const scene: Scene = {
    page,
    elements: new Map(page.elements.map((e) => [e.id, e])),
    layers,
    notes: { walkthrough: [], answers: [] },
    renderMath: math.texToSvg,
  };

  // Voice
  const silent = new SilentTTS();
  const voice: TTSProvider = BrowserTTS.available() ? new BrowserTTS() : silent;
  let muted = false;
  const tts = () => (muted ? silent : voice);

  // Script: invalid commands are reported and skipped
  const log = $<HTMLPreElement>("#log");
  const report = (line: string) => (log.textContent += `${line}\n`);
  const { commands, skipped } = validateCommands(rawScript, new Set(scene.elements.keys()));
  skipped.forEach((s) => report(`skipped script[${s.index}]: ${s.reason}`));

  const caption = $<HTMLParagraphElement>("#caption");
  const playButton = $<HTMLButtonElement>("#play");
  const stepLabel = $<HTMLSpanElement>("#step");

  const walkthrough = new Player(scene, "walkthrough", tts, {
    onCaption: (text) => (caption.textContent = text),
    onStep: (i, total) => (stepLabel.textContent = `${Math.min(i + 1, total)} / ${total}`),
    onState: (playing) => (playButton.textContent = playing ? "⏸ Pause" : "▶ Play"),
    onSkip: (i, reason) => report(`skipped command ${i}: ${reason}`),
    onFinish: () => (caption.textContent = "Done. Press Play to watch again."),
  });
  walkthrough.load(commands);

  const answers = new Player(scene, "answers", tts, {
    onCaption: (text) => (caption.textContent = text),
  });

  playButton.onclick = () => {
    voice.unlock();
    walkthrough.isPlaying ? walkthrough.pause() : walkthrough.play();
  };
  $<HTMLButtonElement>("#back").onclick = () => walkthrough.back();
  $<HTMLButtonElement>("#restart").onclick = () => walkthrough.restart();
  $<HTMLSelectElement>("#speed").onchange = (e) => {
    const speed = Number((e.target as HTMLSelectElement).value);
    walkthrough.setSpeed(speed);
    answers.setSpeed(speed);
  };
  const muteButton = $<HTMLButtonElement>("#mute");
  muteButton.onclick = () => {
    muted = !muted;
    muteButton.textContent = muted ? "🔇 Voice off" : "🔊 Voice on";
  };
  $<HTMLButtonElement>("#clear-answers").onclick = () => answers.load([]);

  // Tap an element: pause the walkthrough, "answer" on the blue layer, resume.
  for (const element of page.elements) {
    const [x0, y0, x1, y1] = element.bbox;
    const hit = el("rect", { x: x0 - 6, y: y0 - 6, width: x1 - x0 + 12, height: y1 - y0 + 12, class: "hit" });
    hit.addEventListener("pointerup", () => {
      voice.unlock();
      const wasPlaying = walkthrough.isPlaying;
      walkthrough.pause();
      const reply: Command[] = [
        { op: "circle", target: element.id, say: "You tapped this part. In the real app your question goes to the professor." },
        { op: "write_text", text: "your question lands here", near: element.id, side: "below", say: "The answer is drawn in blue, so it stays separate from the walkthrough." },
      ];
      answers.load(reply);
      answers.play();
      const resume = window.setInterval(() => {
        if (answers.isPlaying) return;
        window.clearInterval(resume);
        if (wasPlaying) walkthrough.play();
      }, 200);
    });
    hits.appendChild(hit);
  }
  $<HTMLInputElement>("#boxes").onchange = (e) => {
    const show = (e.target as HTMLInputElement).checked;
    hits.querySelectorAll(".hit").forEach((h) => h.classList.toggle("show", show));
  };

  // Test hook: `?autoplay` starts immediately and muted (used for screenshots).
  if (new URLSearchParams(location.search).has("autoplay")) {
    muted = true;
    walkthrough.setSpeed(Number(new URLSearchParams(location.search).get("autoplay")) || 2);
    walkthrough.play();
  }
}

main().catch((err) => {
  document.querySelector("#log")!.textContent = `Failed to start: ${err}`;
});
