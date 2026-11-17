# Phase 0: annotation spike (throwaway)

One slide, one hand-written command script covering every op, the renderer,
and the browser's voice. The only question it answers: **does the drawing feel
good on an iPad?** Nothing here is imported by the real app.

## Run it

```bash
cd spikes/annotation
```

```bash
npm install
```

```bash
npm run dev
```

Then open `http://<server-name>:5173` in Safari on the iPad (the dev server
listens on all interfaces, so the Tailscale name works).

## What to try

- **Play**: the walkthrough draws stroke by stroke in red while the voice reads
  each command's `say` text. The caption under the slide shows the same text.
- **Pause / Back / Speed / Voice off**: Back rewinds one command. Speed applies
  from the next command.
- **Tap any part of the slide**: the walkthrough pauses, a (canned) answer is
  drawn in blue on its own layer, and the walkthrough resumes. "Clear answers"
  removes only the blue layer.
- **Show element boxes**: the element map the commands point at.
- The orange lines under the controls are the three deliberately invalid
  commands in `public/script.json` being skipped (unknown op, unknown element,
  broken LaTeX). Playback carries on.

## What to judge

1. Do the loops, underlines, arrows and marker strokes look hand drawn?
2. Is the single-stroke lettering readable at iPad size?
3. Does `write_math` (MathJax + wobble filter + left-to-right reveal) pass as
   handwriting, or does it still look typeset?
4. Do pen and voice finish together? Safari reports word boundaries for some
   voices only; without them the pen follows an estimate of the reading time.

## Files

| File | What it is |
|---|---|
| `public/script.json` | The command script. Edit it and reload. |
| `public/elements.json` | Element map for the slide (`p1_e0` ...). |
| `src/types.ts` | Command schema (Zod) and validation. |
| `src/rough.ts` | Hand-drawn path generators (seeded, so replays match). |
| `src/hershey.ts` | Single-stroke lettering from the Hershey fonts. |
| `src/math.ts` | LaTeX to SVG with a locally bundled MathJax. |
| `src/place.ts` | Finds empty space for notes. |
| `src/render.ts` | One command in, animated SVG out. |
| `src/player.ts` | Play, pause, back, speed, voice sync. |
| `src/tts.ts` | `TTSProvider` interface + browser voice + silent fallback. |
| `tools/make_assets.py` | Regenerates the slide, element map and font data. |

`npm test` runs the unit tests (validation, geometry, placement, lettering).
