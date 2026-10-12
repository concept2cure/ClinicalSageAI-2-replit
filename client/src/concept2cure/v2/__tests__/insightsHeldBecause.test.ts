/**
 * What the canvas says when asked why a report is held at its status.
 *
 * HS-1008-3, honest-state review 2026-10-08: the reply introduced the
 * truthfulness gate's `reasons` as "the gate's own reasons, verbatim" without
 * checking that the list had anything in it. The gate records a reason only
 * when it downgraded a status that was asked for, so a run held at `partial` by
 * its own outstanding blockers has `reasons == []` — and the reply read
 * '"X" is held at partial because: . Those are the gate's own reasons,
 * verbatim.' A claim to quote is a claim that something was said.
 */
import { describe, expect, it } from 'vitest';
import { roHeldBecause } from '../surfaces/Insights';

describe('roHeldBecause', () => {
  it('quotes the gate when the gate recorded reasons', () => {
    const held = roHeldBecause(['final forbidden with a critical gap outstanding'], []);
    expect(held).toContain('because: final forbidden with a critical gap outstanding.');
    expect(held).toContain("the gate's own reasons, verbatim");
  });

  /* THE CASE THE OLD WORDING GOT WRONG. */
  it('does not claim to quote an empty reason list, and names the real cause instead', () => {
    const held = roHeldBecause([], ['Artifact requirements not assessed: no matrix for this filing type.']);
    expect(held).not.toContain('verbatim');
    expect(held).not.toMatch(/because:\s*\./);
    expect(held).toContain('Artifact requirements not assessed');
    expect(held).toContain("run's blocker list");
  });

  /* Neither list holds anything: say that, rather than introducing nothing as
     a quotation or inventing a cause. */
  it('says nothing explains the status when neither list holds anything', () => {
    const held = roHeldBecause([], []);
    expect(held).not.toContain('verbatim');
    expect(held).not.toMatch(/because:/);
    expect(held).toContain('records a cause');
  });

  it('never emits an empty quotation, for any combination', () => {
    for (const reasons of [[], ['r']]) {
      for (const blockers of [[], ['b']]) {
        const held = roHeldBecause(reasons, blockers);
        expect(held).not.toMatch(/because:\s*\./);
        expect(held).not.toMatch(/stand:\s*\./);
        if (held.includes('verbatim')) expect(reasons.length).toBeGreaterThan(0);
      }
    }
  });
});
