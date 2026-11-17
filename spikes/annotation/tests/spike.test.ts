import { describe, expect, it } from "vitest";
import { layoutText, wrapText } from "../src/hershey";
import { overlapArea, placeBox } from "../src/place";
import { arrowPaths, edgePoint, loopPath, makeRng, underlinePath } from "../src/rough";
import { validateCommands } from "../src/types";

const ids = new Set(["p1_e0", "p1_e1"]);

describe("command validation", () => {
  it("accepts every op", () => {
    const { commands, skipped } = validateCommands(
      [
        { op: "circle", target: "p1_e0", say: "a" },
        { op: "underline", target: "p1_e0" },
        { op: "highlight", target: "p1_e1", color: "yellow" },
        { op: "arrow", from: "p1_e0", to: { x: 10, y: 20 } },
        { op: "write_text", text: "hi", near: "p1_e0", side: "right" },
        { op: "write_math", latex: "x^2", near: "p1_e1", side: "below" },
        { op: "pause", ms: 300 },
        { op: "clear", layer: "answers" },
      ],
      ids,
    );
    expect(skipped).toEqual([]);
    expect(commands).toHaveLength(8);
    expect(commands[1].say).toBe(""); // `say` defaults to empty
  });

  it("skips bad commands without throwing", () => {
    const { commands, skipped } = validateCommands(
      [
        { op: "frobnicate", target: "p1_e0" },
        { op: "circle", target: "p9_e9" },
        { op: "write_text", text: "x", near: "p1_e0", side: "diagonal" },
        "not an object",
        { op: "circle", target: "p1_e0" },
      ],
      ids,
    );
    expect(commands).toHaveLength(1);
    expect(skipped.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(skipped[1].reason).toContain("p9_e9");
  });
});

describe("hand-drawn geometry", () => {
  const box = { x0: 100, y0: 100, x1: 300, y1: 140 };

  it("is deterministic for a seed", () => {
    expect(loopPath(box, makeRng(5))).toBe(loopPath(box, makeRng(5)));
    expect(loopPath(box, makeRng(5))).not.toBe(loopPath(box, makeRng(6)));
  });

  it("draws an underline below the box", () => {
    const ys = [...underlinePath(box, makeRng(1)).matchAll(/[ML ]\S+ (\S+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThan(box.y1 - 4);
  });

  it("ends the arrow exactly at its target", () => {
    const { shaft, head } = arrowPaths([0, 0], [200, 100], makeRng(2));
    expect(shaft.endsWith("L200.0 100.0")).toBe(true);
    expect(head).toContain("L200.0 100.0");
  });

  it("anchors arrows on the box edge", () => {
    const [x, y] = edgePoint(box, [600, 120], 10);
    expect(x).toBeCloseTo(310);
    expect(y).toBeCloseTo(120);
  });
});

describe("placement", () => {
  const bounds = { x0: 0, y0: 0, x1: 1000, y1: 600 };
  const near = { x0: 100, y0: 100, x1: 300, y1: 140 };

  it("uses the requested side when it is free", () => {
    const box = placeBox(near, "right", 120, 30, [near], bounds);
    expect(box.x0).toBeGreaterThanOrEqual(near.x1);
    // fractional sizes must not be rejected by float rounding
    const odd = placeBox({ x0: 166.8, y0: 507.3, x1: 570.1, y1: 567.9 }, "right", 254.37, 44.13, [], bounds);
    expect(odd.x0).toBeCloseTo(570.1 + 18);
  });

  it("moves elsewhere rather than cover slide content", () => {
    const blocker = { x0: 300, y0: 60, x1: 700, y1: 200 };
    const box = placeBox(near, "right", 120, 30, [near, blocker], bounds);
    expect(overlapArea(box, blocker)).toBe(0);
    expect(overlapArea(box, near)).toBe(0);
  });

  it("keeps clear of a loop drawn around the same element", () => {
    const loop = { x0: 70, y0: 85, x1: 330, y1: 155 };
    const box = placeBox(near, "right", 120, 30, [near, loop], bounds);
    expect(overlapArea(box, loop)).toBe(0);
    expect(box.x0).toBeGreaterThanOrEqual(loop.x1); // still on the requested side
  });

  it("stays on the slide", () => {
    const edge = { x0: 850, y0: 100, x1: 990, y1: 140 };
    const box = placeBox(edge, "right", 120, 30, [edge], bounds);
    expect(box.x1).toBeLessThanOrEqual(bounds.x1);
  });
});

describe("single-stroke text", () => {
  it("lays out pen strokes for roman and Greek letters", () => {
    const plain = layoutText("Av", 20, makeRng(1));
    const greek = layoutText("Av = λv", 20, makeRng(1));
    expect(plain.strokes.length).toBeGreaterThan(2);
    expect(greek.strokes.length).toBeGreaterThan(plain.strokes.length);
    expect(greek.width).toBeGreaterThan(plain.width);
  });

  it("wraps long lines", () => {
    expect(wrapText("one two three four five six", 20, 120).length).toBeGreaterThan(1);
  });
});
