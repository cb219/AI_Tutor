# AI Tutor: project notes

Personal learning platform: AI professor / TA / examiner roles teach from your
own course PDFs, annotate the real slides, and keep their memory in a markdown
vault you can also open in Obsidian. The build prompt is the source of truth.

## Status

| Phase | What | State |
|---|---|---|
| 0 | Annotation spike (`spikes/annotation/`) | done |
| 1 | Skeleton + model layer | next |
| 2 | Vault + roles + grounded chat | |
| 3 | Examiner loop | |
| 4 | Slide viewer + walkthroughs | |
| 5 | Evals + costs page | |

## Phase 0: annotation spike

Throwaway. See `spikes/annotation/README.md` for how to run it on the iPad and
what to judge. Findings that carry into Phase 4:

- **Seeded wobble.** Every shape takes a seed, so replaying a walkthrough (and
  "back one step") redraws exactly the same strokes.
- **Back = rebuild.** Stepping back wipes the layer and instantly redraws
  commands `0..n-1`. No per-command undo bookkeeping.
- **Pause restarts the sentence.** `speechSynthesis.pause()` is unreliable on
  iOS, so pause cancels speech and resume redraws the interrupted command.
- **Voice sync.** The pen is spread over an estimate of the reading time and
  re-timed from `boundary` events when the browser sends them. A watchdog ends
  the step if `end` never fires.
- **Notes avoid ink.** A circle reserves its footprint so later notes are
  placed beside the loop, not on it.
- **Fonts.** Single-stroke lettering uses the Hershey fonts ("futural" + Greek),
  digitised by Dr. A. V. Hershey at the U.S. National Bureau of Standards.
  MathJax is bundled locally (no CDN) so the app works offline over Tailscale.

Not testable from the build environment: real Safari, the Apple Pencil, and
real speech voices. The spike was checked in headless Chromium only.
