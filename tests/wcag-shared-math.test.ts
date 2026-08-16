/**
 * `scripts/lib/wcag.mjs` — the single WCAG contrast implementation.
 *
 * ── Why this is tested at all ────────────────────────────────────────────────
 * The formula was written twice: once in `scripts/ci/check-token-contrast.mjs`
 * (static, reads the token declarations) and once inside the function
 * `scripts/visual-qa/check-contrast.mjs` hands to Playwright (live, reads
 * computed pixels). Both were correct, which is what made the duplication
 * dangerous — a correction to either would have applied to one half of the
 * product's contrast reporting and not the other, and the two checks would then
 * have disagreed about the same colour while both claiming to measure it.
 *
 * The browser copy existed for a real reason: Playwright SERIALISES an evaluated
 * function, and a serialised function cannot close over a Node import. That is
 * resolved by `browserSource()`, which ships this module's own source into the
 * page — so the constraint no longer buys a second copy.
 *
 * ── What the last test is really for ─────────────────────────────────────────
 * `browserSource()` is the seam where "one implementation" could quietly become
 * "one implementation and one broken copy", and it did: the first version
 * emitted the functions as OBJECT PROPERTIES, so `contrastRatio` — which calls
 * `relativeLuminance` by bare name — resolved against a global that has no such
 * name and threw on the first measurement. The unit tests here all passed; only
 * running it in a browser caught it. This reproduces that in-process.
 */
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- plain .mjs helper, no types
import {
  browserSource,
  contrastRatio,
  oklchToRgb,
  parseColor,
  parseRgbString,
  measurable,
  over,
  relativeLuminance,
} from '../scripts/lib/wcag.mjs';

describe('WCAG arithmetic', () => {
  it('reproduces the reference ratios', () => {
    expect(contrastRatio(parseColor('#000000'), parseColor('#ffffff'))).toBeCloseTo(21, 2);
    expect(contrastRatio(parseColor('#ffffff'), parseColor('#ffffff'))).toBeCloseTo(1, 5);
    // The canonical AA boundary example.
    expect(contrastRatio(parseColor('#777777'), parseColor('#ffffff'))).toBeCloseTo(4.48, 2);
  });

  it('is order-independent', () => {
    const a = parseColor('#1a1a1a');
    const b = parseColor('#e5e5e5');
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });

  it('puts white at luminance 1 and black at 0', () => {
    expect(relativeLuminance(parseColor('#ffffff')!)).toBeCloseTo(1, 6);
    expect(relativeLuminance(parseColor('#000000')!)).toBeCloseTo(0, 6);
  });

  it('composites a semi-transparent colour the way the eye does', () => {
    // 50% black over white is mid grey.
    expect(over({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 }).r).toBeCloseTo(127.5, 1);
  });
});

describe('reading the palette', () => {
  /* The tokens are authored in oklch. A checker that reads only hex is blind to
     most of the palette — which is how --border (1.34:1) and --sidebar-border
     (12.72:1 on the dark page) went unmeasured for so long. */
  it('converts oklch to the hex the palette itself documents', () => {
    const c = oklchToRgb(0.8847, 0.0069, 97.3627); // light --border
    const hex = '#' + [c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, '0')).join('');
    expect(hex).toBe('#dad9d4');
  });

  it('accepts hex, shorthand hex and oklch, and rejects anything it cannot measure', () => {
    expect(measurable('#faf9f5')).toBe(true);
    expect(measurable('#fff')).toBe(true);
    expect(measurable('oklch(0.8847 0.0069 97.3627)')).toBe(true);
    // An unresolved alias must be refused, not guessed at.
    expect(measurable('var(--bg-300)')).toBe(false);
    expect(measurable(undefined)).toBe(false);
    expect(parseColor('var(--bg-300)')).toBeNull();
  });

  it('parses the rgb() form a browser reports', () => {
    expect(parseRgbString('rgb(250, 249, 245)')).toEqual({ r: 250, g: 249, b: 245, a: 1 });
    expect(parseRgbString('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });
});

describe('browserSource — the injected copy is the same implementation', () => {
  /** Evaluate the injected source against a stand-in `window`, as a page would. */
  function inject(): any {
    const win: any = {};
    // eslint-disable-next-line no-new-func
    new Function('window', browserSource())(win);
    return win.__wcag;
  }

  it('exposes the functions the measurement code destructures', () => {
    const w = inject();
    for (const name of ['relativeLuminance', 'contrastRatio', 'over', 'parseRgbString']) {
      expect(typeof w[name]).toBe('function');
    }
  });

  /* THE REGRESSION. Emitted as object properties, `contrastRatio` could not see
     `relativeLuminance` and threw on the first call — with every unit test above
     still green, because they exercise the module, not the injected copy. */
  it('keeps contrastRatio able to reach relativeLuminance once injected', () => {
    const w = inject();
    expect(() => w.contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).not.toThrow();
  });

  it('agrees with the module it was generated from', () => {
    const w = inject();
    for (const [fg, bg] of [['#000000', '#ffffff'], ['#777777', '#ffffff'], ['#6b6963', '#faf9f5']]) {
      expect(w.contrastRatio(parseColor(fg), parseColor(bg))).toBeCloseTo(
        contrastRatio(parseColor(fg), parseColor(bg)),
        10,
      );
    }
  });
});
