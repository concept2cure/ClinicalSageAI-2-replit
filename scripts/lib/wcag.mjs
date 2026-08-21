/**
 * WCAG contrast arithmetic. The only copy.
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 * The relative-luminance formula was implemented twice, in two checks that both
 * describe themselves as measuring rather than asserting:
 *
 *   scripts/ci/check-token-contrast.mjs   static, reads the token declarations
 *   scripts/visual-qa/check-contrast.mjs  live, reads computed pixels in Chromium
 *
 * Their INPUTS genuinely differ — one parses `oklch()` and hex out of a
 * stylesheet, the other parses `rgb()` out of `getComputedStyle` and composites
 * alpha against the ancestor chain — and neither can do the other's job. But
 * `0.2126 R + 0.7152 G + 0.0722 B`, the 0.03928 linearisation threshold and the
 * `(hi + 0.05) / (lo + 0.05)` ratio are one capability, written twice.
 *
 * That is the kind of duplication that does not announce itself. Both copies
 * were correct; a correction to either — the coefficients, the threshold, the
 * rounding at the reporting boundary — would have silently applied to one
 * surface of the product and not the other, and the two checks would then
 * disagree about the same colour while both claiming to compute it.
 *
 * ── The browser constraint, and why it does not justify a second copy ───────
 * `check-contrast.mjs` hands its measurement function to Playwright, which
 * serialises it into the page. A serialised function cannot close over a Node
 * import, which is the reason the second copy existed. `browserSource()` below
 * resolves that: the same source text is injected into the page, so the browser
 * runs THIS file rather than a transcription of it.
 */

/** WCAG relative luminance of an sRGB triple (0–255). */
export function relativeLuminance({ r, g, b }) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two sRGB triples. Order-independent. */
export function contrastRatio(a, b) {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite a semi-transparent colour over an opaque one. */
export function over(fg, bg) {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

/**
 * `oklch(L C H)` → sRGB 0–255.
 *
 * The design tokens are authored in oklch, so a check that reads only hex is
 * blind to most of the palette — which is exactly how `--border` (1.34:1) and
 * `--sidebar-border` (12.72:1 on the dark page, from a value never declared for
 * dark) went unmeasured. Reading the `/* #dad9d4 *​/` comments beside the
 * declarations was the alternative and is worse: a comment can disagree with
 * its value, and then the check reports a colour that is not on screen.
 *
 * OKLab → linear sRGB uses Björn Ottosson's matrices. Verified against the
 * palette's own comments: oklch(0.8847 0.0069 97.3627) computes to #dad9d4.
 */
export function oklchToRgb(L, C, Hdeg) {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const bb = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * bb) ** 3;
  const lin = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  const [r, g, b] = lin.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255);
  });
  return { r, g, b };
}

export const OKLCH_RE = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/i;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Is this a colour literal that can be measured at all? */
export function measurable(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return HEX_RE.test(s) || OKLCH_RE.test(s);
}

/** A hex or `oklch()` literal → sRGB triple. Returns null if unmeasurable. */
export function parseColor(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  const ok = v.match(OKLCH_RE);
  if (ok) {
    const L = ok[1].endsWith('%') ? parseFloat(ok[1]) / 100 : parseFloat(ok[1]);
    return oklchToRgb(L, parseFloat(ok[2]), parseFloat(ok[3]));
  }
  if (!HEX_RE.test(v)) return null;
  let h = v.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return { r, g, b };
}

/** Parse a browser `rgb()` / `rgba()` string, as `getComputedStyle` returns it. */
export function parseRgbString(c) {
  const m = /^rgba?\(([^)]+)\)$/.exec(String(c));
  if (!m) return null;
  const p = m[1].split(',').map((x) => parseFloat(x.trim()));
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}

/**
 * Is this string incidental or purely decorative text, exempt from SC 1.4.3?
 *
 * A lone separator glyph between metadata items — the `·` in "v2.0 · 88% · L.
 * Tran" — conveys nothing a screen reader reads out, and counting them inflates
 * a failure rate with characters no user needs to perceive.
 *
 * It lives here because two instruments were measuring the same product and
 * disagreeing by thirty: `check-contrast.mjs` excluded these, and
 * `contrast-breakdown.mjs` — the tool whose entire purpose is deciding what to
 * fix — did not, so it attributed a block of failures to a token that had none.
 * Two copies of a judgement call is two places for it to drift, and this one
 * had already drifted before the second copy existed.
 *
 * @param {string} text an element's own trimmed text
 */
export function decorativeText(text) {
  return /^[·•|/\\\-–—,:;()\[\]]{1,2}$/.test(text);
}

/**
 * This module's functions as source text, for injection into a browser page.
 *
 * Playwright serialises an evaluated function, so it cannot reference a Node
 * import. Rather than transcribe the formulas into the page — which is the
 * duplication this module removes — the page is given these definitions on
 * `window.__wcag` and calls them.
 */
export function browserSource() {
  /* Bound as consts inside one scope before being attached, NOT as object
     properties. `contrastRatio` calls `relativeLuminance` by bare name; as a
     property it would resolve against the global scope, where the name does not
     exist, and every measurement would throw at the first call. Declaring them
     together restores the lexical relationship the module has. */
  return `(() => {
    const relativeLuminance = ${relativeLuminance.toString()};
    const contrastRatio = ${contrastRatio.toString()};
    const over = ${over.toString()};
    const parseRgbString = ${parseRgbString.toString()};
    const decorativeText = ${decorativeText.toString()};
    window.__wcag = { relativeLuminance, contrastRatio, over, parseRgbString, decorativeText };
  })();`;
}
