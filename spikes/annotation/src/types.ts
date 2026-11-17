// The annotation command schema. The model never outputs pixels: it outputs
// these commands, which point at element IDs from the slide's element map.
import { z } from "zod";

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Pt = [number, number];
export type SlideElement = { id: string; kind: string; bbox: [number, number, number, number]; text?: string };
export type Page = { width: number; height: number; elements: SlideElement[] };
export type Layer = "walkthrough" | "answers";

const say = z.string().default("");
const color = z.string().optional();
const side = z.enum(["above", "below", "left", "right"]);
const anchor = z.union([z.string().min(1), z.object({ x: z.number(), y: z.number() })]);

export const CommandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("circle"), target: z.string().min(1), color, say }),
  z.object({ op: z.literal("underline"), target: z.string().min(1), color, say }),
  z.object({ op: z.literal("highlight"), target: z.string().min(1), color, say }),
  z.object({ op: z.literal("arrow"), from: anchor, to: anchor, color, say }),
  z.object({ op: z.literal("write_text"), text: z.string().min(1), near: z.string().min(1), side, color, say }),
  z.object({ op: z.literal("write_math"), latex: z.string().min(1), near: z.string().min(1), side, color, say }),
  z.object({ op: z.literal("pause"), ms: z.number().min(0).max(10000), say }),
  z.object({ op: z.literal("clear"), layer: z.enum(["walkthrough", "answers", "all"]).optional(), say }),
]);
export type Command = z.infer<typeof CommandSchema>;
export type Skipped = { index: number; reason: string };

/** Element IDs a command points at (so we can check they exist). */
export function referencedIds(cmd: Command): string[] {
  switch (cmd.op) {
    case "circle":
    case "underline":
    case "highlight":
      return [cmd.target];
    case "arrow":
      return [cmd.from, cmd.to].filter((a): a is string => typeof a === "string");
    case "write_text":
    case "write_math":
      return [cmd.near];
    default:
      return [];
  }
}

/** Validate one raw command. Returns the command, or the reason it was rejected. */
export function validateCommand(raw: unknown, elementIds: Set<string>): Command | string {
  const parsed = CommandSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return `${issue.path.join(".") || "command"}: ${issue.message}`;
  }
  const missing = referencedIds(parsed.data).find((id) => !elementIds.has(id));
  return missing ? `unknown element "${missing}"` : parsed.data;
}

/** Invalid commands are skipped and reported; they never stop playback. */
export function validateCommands(raw: unknown[], elementIds: Set<string>) {
  const commands: Command[] = [];
  const skipped: Skipped[] = [];
  raw.forEach((item, index) => {
    const result = validateCommand(item, elementIds);
    if (typeof result === "string") skipped.push({ index, reason: result });
    else commands.push(result);
  });
  return { commands, skipped };
}
