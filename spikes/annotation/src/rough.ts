// Hand-drawn geometry. Pure functions: a seeded random source goes in, SVG
// path data comes out, so the same command always draws the same way.
import type { Box, Pt } from "./types";

/** Small deterministic PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);

/** A smooth curve through points (quadratic segments through the midpoints). */
export function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${f(pts[0][0])} ${f(pts[0][1])} L${f(pts[1][0])} ${f(pts[1][1])}`;
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += ` Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${f(last[0])} ${f(last[1])}`;
}

/** Radii of the loop drawn around a box (also used to keep notes off it). */
export function loopRadii(box: Box): { rx: number; ry: number } {
  const w = box.x1 - box.x0;
  // Long lines get a fixed margin: a proportional one would run off the slide.
  return { rx: w / 2 + Math.min(w * 0.1, 40) + 10, ry: ((box.y1 - box.y0) / 2) * 1.22 + 6 };
}

/** A pen loop around a box: slightly egg-shaped, and the ends overlap. */
export function loopPath(box: Box, rand: () => number): string {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const { rx, ry } = loopRadii(box);
  const start = -Math.PI * (0.6 + rand() * 0.25);
  const sweep = Math.PI * 2 + 0.2 + rand() * 0.15;
  const steps = 30;
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = start + t * sweep;
    const drift = 0.97 + 0.09 * t + (rand() - 0.5) * 0.03; // spiral out so the ends cross
    pts.push([cx + rx * drift * Math.cos(angle), cy + ry * drift * Math.sin(angle)]);
  }
  return smoothPath(pts);
}

/** A wavy line just under a box. */
export function underlinePath(box: Box, rand: () => number): string {
  const length = box.x1 - box.x0 + 10;
  const steps = Math.max(6, Math.round(length / 16));
  const phase = rand() * Math.PI * 2;
  const tilt = (rand() - 0.5) * 5;
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wave = Math.sin(i * 1.7 + phase) * 2.4 + (rand() - 0.5) * 1.4;
    pts.push([box.x0 - 5 + length * t, box.y1 + 6 + wave + tilt * t]);
  }
  return smoothPath(pts);
}

/** The centre line of a marker stroke through a box (drawn thick and translucent). */
export function markerPath(box: Box, rand: () => number): string {
  const cy = (box.y0 + box.y1) / 2;
  const pts: Pt[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    pts.push([box.x0 - 4 + (box.x1 - box.x0 + 8) * t, cy + (rand() - 0.5) * 3]);
  }
  return smoothPath(pts);
}

/** A curved arrow: a bowed shaft plus a two-stroke head. */
export function arrowPaths(from: Pt, to: Pt, rand: () => number): { shaft: string; head: string } {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  const bow = length * (0.12 + rand() * 0.1) * (rand() > 0.5 ? 1 : -1);
  const ctrl: Pt = [(from[0] + to[0]) / 2 - (dy / length) * bow, (from[1] + to[1]) / 2 + (dx / length) * bow];
  const steps = 14;
  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const edge = i === 0 || i === steps ? 0 : 1; // keep the ends exact
    pts.push([
      u * u * from[0] + 2 * u * t * ctrl[0] + t * t * to[0] + (rand() - 0.5) * 1.6 * edge,
      u * u * from[1] + 2 * u * t * ctrl[1] + t * t * to[1] + (rand() - 0.5) * 1.6 * edge,
    ]);
  }
  const angle = Math.atan2(to[1] - ctrl[1], to[0] - ctrl[0]);
  const size = Math.min(22, Math.max(12, length * 0.12));
  const wing = (offset: number): Pt => [
    to[0] - size * Math.cos(angle + offset),
    to[1] - size * Math.sin(angle + offset),
  ];
  const a = wing(0.45 + rand() * 0.1);
  const b = wing(-0.45 - rand() * 0.1);
  const head = `M${f(a[0])} ${f(a[1])} L${f(to[0])} ${f(to[1])} L${f(b[0])} ${f(b[1])}`;
  return { shaft: smoothPath(pts), head };
}

/** Where a line from the box centre toward `toward` leaves the box (plus a gap). */
export function edgePoint(box: Box, toward: Pt, gap = 10): Pt {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const dx = toward[0] - cx;
  const dy = toward[1] - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const hw = (box.x1 - box.x0) / 2 + gap;
  const hh = (box.y1 - box.y0) / 2 + gap;
  const scale = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  return [cx + dx * Math.min(scale, 1), cy + dy * Math.min(scale, 1)];
}
