// LaTeX -> SVG with MathJax, bundled locally (no CDN). Loaded lazily because
// it is the biggest dependency by far.
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document("", {
  InputJax: new TeX({ packages: AllPackages }),
  OutputJax: new SVG({ fontCache: "none" }),
});

export type MathSvg = { inner: string; viewBox: [number, number, number, number] };

/** Render LaTeX. Returns null when MathJax reports a TeX error. */
export function texToSvg(latex: string): MathSvg | null {
  const container = doc.convert(latex, { display: true });
  const svg = adaptor.firstChild(container) as any;
  const markup: string = adaptor.outerHTML(svg);
  if (markup.includes("data-mjx-error")) return null;
  const viewBox = (adaptor.getAttribute(svg, "viewBox") as string).split(/\s+/).map(Number);
  return { inner: adaptor.innerHTML(svg), viewBox: viewBox as [number, number, number, number] };
}
