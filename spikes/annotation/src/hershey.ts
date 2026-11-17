// Single-stroke (Hershey) lettering: every glyph is a list of pen strokes, so
// text can be traced the way a hand would write it.
//
// Glyph data: the Hershey fonts, digitised by Dr. A. V. Hershey at the U.S.
// National Bureau of Standards. "Futural" (simplex roman) plus the Greek set.
import data from "./hershey.json";
import type { Pt } from "./types";

type Glyph = { w: number; s: number[][][] };
const CAP: number = data.cap; // cap height in font units; the baseline is y = 0
const roman = data.fonts.futural as Record<string, Glyph>;
const greek = data.fonts.greek as Record<string, Glyph>;

// Unicode Greek -> the Latin key the Hershey Greek font files use.
const GREEK_KEYS: Record<string, string> = {
  α: "a", β: "b", χ: "c", δ: "d", ε: "e", φ: "f", γ: "g", η: "h", ι: "i", κ: "k", λ: "l", μ: "m",
  ν: "n", ο: "o", π: "p", θ: "q", ρ: "r", σ: "s", τ: "t", υ: "u", ω: "w", ξ: "x", ψ: "y", ζ: "z",
  Δ: "D", Φ: "F", Γ: "G", Λ: "L", Π: "P", Θ: "Q", Σ: "S", Ω: "W", Ξ: "X", Ψ: "Y",
};
// A few symbols models like to write, mapped to something the font can draw.
const SUBSTITUTES: Record<string, string> = { "−": "-", "–": "-", "—": "-", "×": "x", "·": ".", "’": "'", "“": '"', "”": '"', "≠": "!=", "≤": "<=", "≥": ">=", "→": "->" };

function glyphFor(ch: string): Glyph | undefined {
  const key = GREEK_KEYS[ch];
  return key ? greek[key] : roman[ch];
}

export type TextLayout = { strokes: Pt[][]; width: number; height: number };

/** Split text into lines no wider than `maxWidth` pixels. */
export function wrapText(text: string, capPx: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measureLine(candidate, capPx) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

function expand(text: string): string {
  return Array.from(text, (ch) => SUBSTITUTES[ch] ?? ch).join("");
}

export function measureLine(text: string, capPx: number): number {
  const scale = capPx / CAP;
  return Array.from(expand(text)).reduce((sum, ch) => sum + (glyphFor(ch)?.w ?? 16) * scale * 0.92, 0);
}

/**
 * Lay out text as pen strokes. The origin is the top-left of the text block.
 * `rand` adds the small wobble that keeps it from looking like a plotter.
 */
export function layoutText(text: string, capPx: number, rand: () => number, maxWidth = Infinity): TextLayout {
  const scale = capPx / CAP;
  const lineHeight = capPx * 1.75;
  const lines = wrapText(text, capPx, maxWidth);
  const strokes: Pt[][] = [];
  let width = 0;
  lines.forEach((line, row) => {
    let x = 0;
    const baseline = capPx + row * lineHeight;
    const drift = (rand() - 0.5) * capPx * 0.1; // each line wanders a little
    for (const ch of Array.from(expand(line))) {
      const glyph = glyphFor(ch);
      const advance = (glyph?.w ?? 16) * scale * 0.92;
      if (glyph) {
        const lift = (rand() - 0.5) * capPx * 0.07;
        const slant = 0.1 + (rand() - 0.5) * 0.06;
        for (const stroke of glyph.s) {
          if (stroke.length < 2) continue;
          strokes.push(
            stroke.map(([gx, gy]): Pt => [
              x + gx * scale - gy * scale * slant + (rand() - 0.5) * capPx * 0.03,
              baseline + gy * scale + lift + drift * (x / Math.max(1, capPx * 10)) + (rand() - 0.5) * capPx * 0.03,
            ]),
          );
        }
      }
      x += advance;
    }
    width = Math.max(width, x);
  });
  return { strokes, width, height: capPx * 1.35 + (lines.length - 1) * lineHeight };
}
