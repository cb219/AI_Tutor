"""Generate small synthetic Linear Algebra PDFs for demos and tests.

    python tools/sample_deck.py OUT_DIR

Writes `lecture-14.pdf` (4 slides on eigenvalues) and `practice-exam-1.pdf`.
These stand in for real course material until you add your own; nothing in the
app depends on them.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pymupdf

W, H = 960, 540  # 16:9 slide, in points
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
]
INK = (0.12, 0.14, 0.2)
ACCENT = (0.1, 0.3, 0.6)


def _font_file() -> str | None:
    return next((f for f in FONT_CANDIDATES if Path(f).exists()), None)


class Slide:
    """Tiny drawing helper around one PyMuPDF page."""

    def __init__(self, doc: pymupdf.Document, title: str):
        self.page = doc.new_page(width=W, height=H)
        self.font = _font_file()
        if self.font:
            self.page.insert_font(fontname="body", fontfile=self.font)
        self.page.draw_rect(pymupdf.Rect(0, 0, W, 8), color=None, fill=ACCENT)
        self.text(60, 78, title, size=34, color=ACCENT)

    def text(self, x: float, y: float, s: str, size: float = 22, color=INK) -> None:
        if self.font:
            self.page.insert_text((x, y), s, fontname="body", fontsize=size, color=color)
        else:  # base-14 fallback cannot draw Greek; spell it out
            plain = s.replace("λ", "lambda").replace("−", "-").replace("·", "*")
            self.page.insert_text((x, y), plain, fontname="helv", fontsize=size, color=color)

    def matrix(self, x: float, y: float, rows: list[list[str]], size: float = 22) -> None:
        """Draw a bracketed matrix with its top-left corner at (x, y)."""
        row_h, col_w = size * 1.5, size * 2.0
        height, width = row_h * len(rows), col_w * len(rows[0])
        for r, row in enumerate(rows):
            for c, cell in enumerate(row):
                self.text(x + 12 + c * col_w, y + (r + 0.75) * row_h, cell, size=size)
        for bx, tick in ((x, 8), (x + width + 10, -8)):  # left and right brackets
            self.page.draw_polyline(
                [(bx + tick, y), (bx, y), (bx, y + height), (bx + tick, y + height)],
                color=INK, width=1.6,
            )

    def vector_plot(self, x: float, y: float, size: float = 150) -> None:
        """Axes with v and A·v on the same line (the picture of an eigenvector)."""
        ox, oy = x + 20, y + size - 20
        p = self.page
        p.draw_line((ox - 10, oy), (ox + size - 20, oy), color=(0.5, 0.5, 0.5), width=1)
        p.draw_line((ox, oy + 10), (ox, oy - size + 20), color=(0.5, 0.5, 0.5), width=1)
        p.draw_line((ox, oy), (ox + 45, oy - 45), color=ACCENT, width=3)
        p.draw_line((ox, oy), (ox + 110, oy - 110), color=(0.8, 0.3, 0.2), width=1.5)
        self.text(ox + 50, oy - 30, "v", size=16, color=ACCENT)
        self.text(ox + 80, oy - 112, "Av = λv", size=16, color=(0.8, 0.3, 0.2))


def build_lecture(path: Path) -> None:
    doc = pymupdf.open()

    s = Slide(doc, "Lecture 14: Eigenvalues and Eigenvectors")
    s.text(60, 150, "Linear Algebra", size=26)
    s.text(60, 200, "Today: what eigenvectors are, how to find them, and why", size=20)
    s.text(60, 230, "diagonalization makes matrix powers easy.", size=20)
    s.text(60, 300, "Prerequisites: determinants, null space, linear systems", size=18)

    s = Slide(doc, "Eigenvalues and Eigenvectors")
    s.text(60, 140, "A nonzero vector v is an eigenvector of a square matrix A if", size=22)
    s.text(110, 195, "A v = λ v", size=34, color=ACCENT)
    s.text(60, 250, "The scalar λ is the eigenvalue: A only stretches v, it never turns it.", size=22)
    s.text(60, 310, "To find λ, solve the characteristic equation", size=22)
    s.text(110, 365, "det(A − λI) = 0", size=34, color=ACCENT)
    s.text(60, 430, "Then each eigenvector lies in the null space of A − λI.", size=22)
    s.vector_plot(720, 290)

    s = Slide(doc, "Worked example")
    s.text(60, 150, "A =", size=24)
    s.matrix(115, 112, [["2", "1"], ["1", "2"]])
    s.text(60, 235, "det(A − λI) = (2 − λ)² − 1 = λ² − 4λ + 3 = 0", size=24)
    s.text(60, 290, "λ₁ = 1    and    λ₂ = 3", size=26, color=ACCENT)
    s.text(60, 350, "For λ₁ = 1: solve (A − I)v = 0, giving v₁ = (1, −1)", size=22)
    s.text(60, 395, "For λ₂ = 3: solve (A − 3I)v = 0, giving v₂ = (1, 1)", size=22)
    s.text(60, 460, "Check: trace = 4 = λ₁ + λ₂ and det = 3 = λ₁ · λ₂", size=20)

    s = Slide(doc, "Diagonalization")
    s.text(60, 140, "If A has n linearly independent eigenvectors, then", size=22)
    s.text(110, 195, "A = P D P⁻¹", size=34, color=ACCENT)
    s.text(60, 250, "Columns of P are the eigenvectors; D holds the eigenvalues.", size=22)
    s.text(60, 310, "Powers become easy:", size=22)
    s.text(110, 365, "Aᵏ = P Dᵏ P⁻¹", size=34, color=ACCENT)
    s.text(60, 430, "A symmetric matrix is always diagonalizable.", size=22)

    doc.save(path)


def build_practice_exam(path: Path) -> None:
    doc = pymupdf.open()
    page = doc.new_page()  # letter-size portrait
    font = _font_file()
    if font:
        page.insert_font(fontname="body", fontfile=font)
    name = "body" if font else "helv"
    lines = [
        ("Linear Algebra: Practice Exam 1", 20),
        ("", 10),
        ("1. (10 pts) Find the eigenvalues of A = [[4, 1], [2, 3]].", 12),
        ("2. (10 pts) Compute det(B) for B = [[1, 2, 0], [0, 3, 1], [2, 0, 1]].", 12),
        ("3. (10 pts) Find a basis for the null space of C = [[1, 2], [2, 4]].", 12),
        ("4. (15 pts) Is D = [[1, 1], [0, 1]] diagonalizable? Justify your answer.", 12),
        ("5. (15 pts) Solve the system x + 2y = 5, 3x − y = 1.", 12),
    ]
    y = 80
    for text, size in lines:
        if text:
            safe = text if font else text.replace("−", "-")
            page.insert_text((60, y), safe, fontname=name, fontsize=size, color=INK)
        y += size * 2.2
    doc.save(path)


def main(out_dir: str) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    build_lecture(out / "lecture-14.pdf")
    build_practice_exam(out / "practice-exam-1.pdf")
    print(f"wrote {out / 'lecture-14.pdf'} and {out / 'practice-exam-1.pdf'}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
