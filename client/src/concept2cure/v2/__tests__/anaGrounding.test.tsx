// @vitest-environment jsdom
/**
 * How far can this answer be trusted?
 *
 * WHAT WENT WRONG
 * The server grades every answer it finishes — sources counted, claims split
 * into grounded and weak, each weak one flagged by kind, plus a reviewer risk
 * summary — and ships it as `grounding_strip`. `useAnaChat` stores it under a
 * comment reading "for the grounding chip on the reply". There was no chip.
 * Nothing in the product read `groundedClaims`, `weakClaims` or
 * `flaggedClaims`, so a reviewer could not tell whether a sentence rested on
 * six sources or on nothing.
 *
 * THE RULE THIS SUITE EXISTS FOR
 * `useAnaChat` fills every count with 0 when the field is absent. So a turn the
 * pipeline never graded arrives as `{validated:false, sourceCount:0,
 * groundedClaims:0, weakClaims:0}` — byte-identical to a turn that WAS graded
 * and came back clean. Rendered without care that becomes "0 weak claims": the
 * strongest reassurance the surface can offer, produced by having checked
 * nothing. Every assertion about the unvalidated state is guarding that.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { AnaGrounding } from '../AnaGrounding';

afterEach(cleanup);

const graded = {
  validated: true,
  sourceCount: 6,
  groundedClaims: 11,
  weakClaims: 2,
  missingSupport: 0,
  flaggedClaims: [
    { kind: 'overclaim' as const, text: 'the three cited precedents cleared at 0.4-0.55' },
    { kind: 'ungrounded' as const, text: 'EMA accepts this without further justification' },
  ],
};

describe('AnaGrounding — it reports the verdict the server reached', () => {
  it('states how many claims are grounded, and on how many sources', () => {
    render(<AnaGrounding evidence={graded} />);
    expect(screen.getByText(/11 of 13 claims grounded/)).toBeTruthy();
    expect(screen.getByText(/6 sources/)).toBeTruthy();
  });

  it('names the weak claims by kind, not just by count', () => {
    render(<AnaGrounding evidence={graded} />);
    // "2 weak" alone says there is a problem without saying what kind.
    expect(screen.getByText(/one overclaim, one unsupported/)).toBeTruthy();
  });

  it('quotes a flagged claim, so the soft sentence is findable', () => {
    render(<AnaGrounding evidence={graded} />);
    expect(screen.getByText(/the three cited precedents cleared at 0\.4-0\.55/)).toBeTruthy();
  });

  it('carries the server risk summary verbatim when there is one', () => {
    render(<AnaGrounding evidence={{ ...graded, riskSummary: 'Two claims need a citation before filing.' }} />);
    expect(screen.getByText('Two claims need a citation before filing.')).toBeTruthy();
  });

  it('says nothing about weakness when there is none', () => {
    const clean = { ...graded, weakClaims: 0, groundedClaims: 13, flaggedClaims: [] };
    const { container } = render(<AnaGrounding evidence={clean} />);
    expect(screen.getByText(/13 of 13 claims grounded/)).toBeTruthy();
    expect(container.querySelector('.ana-grounding-ic.is-weak')).toBeNull();
  });
});

describe('AnaGrounding — not assessed is not a clean bill of health', () => {
  const unassessed = {
    validated: false, sourceCount: 0, groundedClaims: 0, weakClaims: 0, missingSupport: 0,
  };

  it('says the answer was not assessed', () => {
    render(<AnaGrounding evidence={unassessed} />);
    expect(screen.getByText(/not assessed/i)).toBeTruthy();
  });

  it('renders no count at all — a zero here means "unchecked", not "clean"', () => {
    // The defect this component exists to prevent, stated as the thing a
    // reviewer must never read: a reassuring number nothing computed.
    const { container } = render(<AnaGrounding evidence={unassessed} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\b0 weak\b/);
    expect(text).not.toMatch(/claims grounded/);
    expect(text).not.toMatch(/\bsources?\b/);
  });

  it('does not dress the unassessed state as a failure either', () => {
    // It is not an error that a turn went ungraded; plenty legitimately do.
    const { container } = render(<AnaGrounding evidence={unassessed} />);
    expect(container.querySelector('.ana-grounding-ic.is-weak')).toBeNull();
    expect(container.querySelector('.ana-grounding-ic.is-unknown')).toBeTruthy();
  });

  it('ignores counts that arrive alongside validated:false', () => {
    // Trusting the numbers over the flag is how the zero-means-clean bug comes
    // back: the flag is the only thing that says the pipeline ran.
    const { container } = render(
      <AnaGrounding evidence={{ ...unassessed, sourceCount: 4, groundedClaims: 9, weakClaims: 1 }} />,
    );
    expect(container.textContent).not.toMatch(/9|4 sources|1 weak/);
    expect(screen.getByText(/not assessed/i)).toBeTruthy();
  });

  it('renders nothing when the turn carries no verdict at all', () => {
    const { container } = render(<AnaGrounding />);
    expect(container.firstChild).toBeNull();
  });

  describe('assessed, but nothing graded, is not a pass either', () => {
    /* The other route to the same false reassurance, and the one `validated`
       could not close. The server computes `validated` as
       `totalIssues === 0 || …`, so an answer the claim extractor found NOTHING
       in comes back validated with every count at zero — and this row drew a
       green check reading the bare "Claims grounded".

       Grounded on what? No claim was graded; none was identified to grade.
       Above, zero means ungraded; here, zero means nothing found. Neither is a
       clean bill of health and only one of them was said honestly. */
    const nothingGraded = {
      validated: true, sourceCount: 0, groundedClaims: 0, weakClaims: 0, missingSupport: 0,
    };

    it('does not claim claims are grounded when none were graded', () => {
      const { container } = render(<AnaGrounding evidence={nothingGraded} />);
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/claims grounded/i);
      expect(text).toMatch(/no claims identified/i);
    });

    it('does not wear the check it has not earned', () => {
      const { container } = render(<AnaGrounding evidence={nothingGraded} />);
      expect(
        container.querySelector('.ana-grounding-ic.is-ok'),
        'a green check certifying nothing',
      ).toBeNull();
      expect(container.querySelector('.ana-grounding-ic.is-unknown')).toBeTruthy();
    });

    it('still certifies an answer whose claims WERE graded and grounded', () => {
      /* The working path. The check is earned here and must remain. */
      const { container } = render(
        <AnaGrounding
          evidence={{
            validated: true, sourceCount: 3, groundedClaims: 4, weakClaims: 0, missingSupport: 0,
          }}
        />,
      );
      expect(container.textContent).toMatch(/4 of 4 claims grounded/i);
      expect(container.querySelector('.ana-grounding-ic.is-ok')).toBeTruthy();
    });
  });

  it('never states the verdict in colour alone', () => {
    // WCAG 1.4.1: each row carries its own glyph and its own words.
    const { container } = render(<AnaGrounding evidence={graded} />);
    const weak = container.querySelector('.ana-grounding-ic.is-weak');
    expect(weak?.querySelector('svg')).toBeTruthy();
    expect(container.textContent).toContain('2 weak');
  });
});
