"""Build the spike's static assets: slide.png, elements.json, hershey.json.

    python spikes/annotation/tools/make_assets.py

Needs `pymupdf` and `Hershey-Fonts` (pip). Throwaway: the real ingestion
pipeline lives in backend/app/ingest/.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[3]
PUBLIC = Path(__file__).resolve().parents[1] / "public"
sys.path.insert(0, str(ROOT / "tools"))

import sample_deck  # noqa: E402

LONG_EDGE = 1456


def make_slide() -> None:
    pdf = PUBLIC / "_deck.pdf"
    sample_deck.build_lecture(pdf)
    page = pymupdf.open(pdf)[1]  # the "Eigenvalues and Eigenvectors" slide
    scale = LONG_EDGE / max(page.rect.width, page.rect.height)
    page.get_pixmap(matrix=pymupdf.Matrix(scale, scale)).save(PUBLIC / "slide.png")

    boxes = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        text = " ".join(span["text"] for line in block["lines"] for span in line["spans"]).strip()
        if text:
            boxes.append(("text", block["bbox"], text))
    drawings = [d["rect"] for d in page.get_drawings() if d["rect"].y0 > 20]
    if drawings:  # the vector plot: merge its strokes into one region
        r = drawings[0]
        for d in drawings[1:]:
            r |= d
        boxes.append(("drawing", tuple(r), None))

    boxes.sort(key=lambda b: (round(b[1][1] / 8), b[1][0]))
    elements = [
        {"id": f"p1_e{i}", "kind": kind, "bbox": [round(v * scale, 1) for v in bbox], **({"text": text} if text else {})}
        for i, (kind, bbox, text) in enumerate(boxes)
    ]
    page_json = {
        "width": round(page.rect.width * scale),
        "height": round(page.rect.height * scale),
        "elements": elements,
    }
    (PUBLIC / "elements.json").write_text(json.dumps(page_json, indent=1))
    pdf.unlink()
    for e in elements:
        print(e["id"], e["kind"], e.get("text", ""))


def make_font() -> None:
    """Dump two Hershey fonts as compact JSON: baseline at y=0, x starts at 0."""
    from HersheyFonts import HersheyFonts

    out = {"cap": 21, "fonts": {}}
    for name in ("futural", "greek"):
        font = HersheyFonts()
        font.load_default_font(name)
        glyphs = {}
        for ch, g in font.all_glyphs.items():
            strokes = [[[x - g.left_offset, y - 9] for x, y in stroke] for stroke in g.strokes]
            glyphs[ch] = {"w": g.char_width, "s": strokes}
        out["fonts"][name] = glyphs
    (PUBLIC.parent / "src" / "hershey.json").write_text(json.dumps(out, separators=(",", ":")))


if __name__ == "__main__":
    PUBLIC.mkdir(exist_ok=True)
    make_slide()
    make_font()
