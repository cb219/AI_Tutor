// Find empty space for a handwritten note next to a slide element.
import type { Box } from "./types";

export type Side = "above" | "below" | "left" | "right";
const SIDES: Side[] = ["right", "below", "above", "left"];

export function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

function candidates(near: Box, side: Side, w: number, h: number, gap: number): Box[] {
  const at = (x0: number, y0: number): Box => ({ x0, y0, x1: x0 + w, y1: y0 + h });
  const midY = (near.y0 + near.y1) / 2 - h / 2;
  const midX = (near.x0 + near.x1) / 2 - w / 2;
  switch (side) {
    case "right":
      return [midY, near.y0, near.y1 - h, near.y0 - h * 0.8, near.y1 - h * 0.2].map((y) => at(near.x1 + gap, y));
    case "left":
      return [midY, near.y0, near.y1 - h, near.y0 - h * 0.8, near.y1 - h * 0.2].map((y) => at(near.x0 - gap - w, y));
    case "below":
      return [near.x0, midX, near.x1 - w, near.x1 + gap].map((x) => at(x, near.y1 + gap));
    case "above":
      return [near.x0, midX, near.x1 - w, near.x1 + gap].map((x) => at(x, near.y0 - gap - h));
  }
}

/**
 * Place a w×h box beside `near`. Tries the requested side first, then the
 * others, and returns the first spot that is on the slide and touches nothing
 * in `obstacles`. If every spot collides, returns the least-bad one.
 */
export function placeBox(near: Box, side: Side, w: number, h: number, obstacles: Box[], bounds: Box): Box {
  const order = [side, ...SIDES.filter((s) => s !== side)];
  const others = obstacles.filter((o) => o !== near);
  let best: Box | null = null;
  let bestCost = Infinity;
  for (const [rank, s] of order.entries()) {
    for (const gap of [18, 44, 80, 120]) {
      for (const box of candidates(near, s, w, h, gap)) {
        const outside = w * h - overlapArea(box, bounds);
        const covered = overlapArea(box, near) + others.reduce((sum, o) => sum + overlapArea(box, o), 0);
        if (outside < 0.5 && covered < 0.5) return box; // tolerate float rounding
        const cost = outside * 4 + covered + rank * 50 + gap; // prefer the requested side, close by
        if (cost < bestCost) {
          bestCost = cost;
          best = box;
        }
      }
    }
  }
  return best!;
}
