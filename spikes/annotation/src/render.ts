// Turn one command into SVG. Every command becomes a `Drawn`: something that
// can be revealed gradually (setProgress) and taken back (undo).
import { layoutText } from "./hershey";
import type { MathSvg } from "./math";
import { placeBox } from "./place";
import { arrowPaths, edgePoint, loopPath, loopRadii, makeRng, markerPath, smoothPath, underlinePath } from "./rough";
import type { Box, Command, Layer, Page, Pt, SlideElement } from "./types";

const SVG_NS = "http://www.w3.org/2000/svg";
const NAMED: Record<string, string> = {
  red: "#c92a2a", blue: "#1864ab", green: "#2b8a3e", orange: "#e8590c", purple: "#7048e8", yellow: "#fcc419",
};
const LAYER_INK: Record<Layer, string> = { walkthrough: "#c92a2a", answers: "#1864ab" };
const LAYER_MARKER: Record<Layer, string> = { walkthrough: "#ffd43b", answers: "#74c0fc" };

export type Drawn = {
  /** How far the pen travels, in slide pixels. Used to pace the animation. */
  length: number;
  setProgress(p: number): void;
  undo(): void;
};

export type Scene = {
  page: Page;
  elements: Map<string, SlideElement>;
  layers: Record<Layer, SVGGElement>;
  /** Boxes of notes already written, per layer, so new notes do not overlap them. */
  notes: Record<Layer, Box[]>;
  renderMath: (latex: string) => MathSvg | null;
};

export function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const toBox = (e: SlideElement): Box => ({ x0: e.bbox[0], y0: e.bbox[1], x1: e.bbox[2], y1: e.bbox[3] });
const centre = (b: Box): Pt => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
const NOTHING: Drawn = { length: 0, setProgress() {}, undo() {} };

function ink(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  return NAMED[color.toLowerCase()] ?? (/^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback);
}

type PathSpec = { d: string; width: number; opacity?: number; cap?: "round" | "butt" };

/** A group of pen strokes revealed one after another with stroke-dash. */
function penStrokes(parent: SVGGElement, color: string, specs: PathSpec[], onUndo?: () => void): Drawn {
  const group = el("g");
  parent.appendChild(group);
  const items = specs.map((spec) => {
    const path = el("path", {
      d: spec.d, fill: "none", stroke: color, "stroke-width": spec.width,
      "stroke-linecap": spec.cap ?? "round", "stroke-linejoin": "round", opacity: spec.opacity ?? 1,
    });
    group.appendChild(path);
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length} ${length + 10}`;
    return { path, length };
  });
  const total = items.reduce((sum, item) => sum + item.length, 0);
  const drawn: Drawn = {
    length: total,
    setProgress(p) {
      let budget = p * total;
      for (const { path, length } of items) {
        const shown = Math.max(0, Math.min(length, budget));
        path.style.strokeDashoffset = `${length - shown}`;
        path.style.visibility = shown > 0 ? "visible" : "hidden"; // no stray round-cap dots
        budget -= length;
      }
    },
    undo() {
      group.remove();
      onUndo?.();
    },
  };
  drawn.setProgress(0);
  return drawn;
}

function obstacles(scene: Scene): Box[] {
  return [...scene.page.elements.map(toBox), ...scene.notes.walkthrough, ...scene.notes.answers];
}

function reserve(scene: Scene, layer: Layer, box: Box): () => void {
  scene.notes[layer].push(box);
  return () => {
    const i = scene.notes[layer].indexOf(box);
    if (i >= 0) scene.notes[layer].splice(i, 1);
  };
}

/**
 * Draw one command on a layer. Returns null if it cannot be drawn (the caller
 * logs it and moves on). `seed` fixes the wobble so replays look identical.
 */
export function renderCommand(cmd: Command, seed: number, layer: Layer, scene: Scene): Drawn | null {
  const rand = makeRng(seed);
  const parent = scene.layers[layer];
  const unit = scene.page.width / 1456; // stroke sizes follow the slide size
  const bounds: Box = { x0: 8, y0: 8, x1: scene.page.width - 8, y1: scene.page.height - 8 };
  const boxOf = (id: string) => toBox(scene.elements.get(id)!);

  switch (cmd.op) {
    case "circle": {
      const box = boxOf(cmd.target);
      const [cx, cy] = centre(box);
      const { rx, ry } = loopRadii(box);
      // Reserve the loop's footprint so later notes are written beside it, not on it.
      const release = reserve(scene, layer, { x0: cx - rx * 1.06, y0: cy - ry * 1.06, x1: cx + rx * 1.06, y1: cy + ry * 1.06 });
      return penStrokes(parent, ink(cmd.color, LAYER_INK[layer]), [{ d: loopPath(box, rand), width: 3.2 * unit }], release);
    }

    case "underline":
      return penStrokes(parent, ink(cmd.color, LAYER_INK[layer]), [{ d: underlinePath(boxOf(cmd.target), rand), width: 3.2 * unit }]);

    case "highlight": {
      const box = boxOf(cmd.target);
      const spec: PathSpec = { d: markerPath(box, rand), width: (box.y1 - box.y0) * 0.9, opacity: 0.38, cap: "butt" };
      const drawn = penStrokes(parent, ink(cmd.color, LAYER_MARKER[layer]), [spec]);
      (parent.lastChild as SVGGElement).style.mixBlendMode = "multiply";
      return drawn;
    }

    case "arrow": {
      const middle = (a: typeof cmd.from): Pt => (typeof a === "string" ? centre(boxOf(a)) : [a.x, a.y]);
      const end = (a: typeof cmd.from, other: Pt): Pt => (typeof a === "string" ? edgePoint(boxOf(a), other) : [a.x, a.y]);
      const { shaft, head } = arrowPaths(end(cmd.from, middle(cmd.to)), end(cmd.to, middle(cmd.from)), rand);
      const width = 3 * unit;
      return penStrokes(parent, ink(cmd.color, LAYER_INK[layer]), [{ d: shaft, width }, { d: head, width }]);
    }

    case "write_text": {
      const cap = 24 * unit;
      const layout = layoutText(cmd.text, cap, rand, scene.page.width * 0.3);
      const box = placeBox(boxOf(cmd.near), cmd.side, layout.width, layout.height, obstacles(scene), bounds);
      const specs = layout.strokes.map((stroke) => ({
        d: smoothPath(stroke.map(([x, y]): Pt => [x + box.x0, y + box.y0])),
        width: 2.3 * unit,
      }));
      return penStrokes(parent, ink(cmd.color, LAYER_INK[layer]), specs, reserve(scene, layer, box));
    }

    case "write_math": {
      const math = scene.renderMath(cmd.latex);
      if (!math) return null;
      const em = 34 * unit;
      const [vx, vy, vw, vh] = math.viewBox;
      const w = (vw / 1000) * em;
      const h = (vh / 1000) * em;
      const box = placeBox(boxOf(cmd.near), cmd.side, w, h, obstacles(scene), bounds);
      const release = reserve(scene, layer, box);

      const clipId = `reveal-${layer}-${seed}`;
      const group = el("g", { "clip-path": `url(#${clipId})`, color: ink(cmd.color, LAYER_INK[layer]) });
      const clip = el("clipPath", { id: clipId });
      const window_ = el("rect", { x: box.x0 - 8, y: box.y0 - 12, width: 0, height: h + 24 });
      clip.appendChild(window_);
      const tilt = (rand() - 0.5) * 3; // degrees: nobody writes perfectly level
      const inner = el("svg", { x: box.x0, y: box.y0, width: w, height: h, viewBox: `${vx} ${vy} ${vw} ${vh}`, overflow: "visible" });
      const parsed = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${math.inner}</svg>`, "image/svg+xml");
      for (const child of Array.from(parsed.documentElement.childNodes)) inner.appendChild(document.importNode(child, true));
      const wobble = el("g", { filter: "url(#wobble)", transform: `rotate(${tilt.toFixed(2)} ${box.x0 + w / 2} ${box.y0 + h / 2})` });
      wobble.appendChild(inner);
      group.append(clip, wobble);
      parent.appendChild(group);
      return {
        length: w * 3, // writing an equation takes longer than its width suggests
        setProgress: (p) => window_.setAttribute("width", String((w + 16) * p)),
        undo() {
          group.remove();
          release();
        },
      };
    }

    case "pause":
      return NOTHING;

    case "clear": {
      const targets: Layer[] = cmd.layer === "all" ? ["walkthrough", "answers"] : [cmd.layer ?? layer];
      for (const target of targets) {
        scene.layers[target].replaceChildren();
        scene.notes[target] = [];
      }
      return NOTHING;
    }
  }
}

/** The SVG filter that makes typeset math look a little hand-drawn. */
export function wobbleFilter(): SVGFilterElement {
  const filter = el("filter", { id: "wobble", x: "-5%", y: "-10%", width: "110%", height: "120%" });
  filter.append(
    el("feTurbulence", { type: "fractalNoise", baseFrequency: 0.04, numOctaves: 2, seed: 7, result: "noise" }),
    el("feDisplacementMap", { in: "SourceGraphic", in2: "noise", scale: 3.2, xChannelSelector: "R", yChannelSelector: "G" }),
  );
  return filter;
}
