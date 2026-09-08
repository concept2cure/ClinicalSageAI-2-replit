/**
 * "Not failed" is not "passed" — the module-preflight verdict.
 *
 * The per-section verdict read
 *
 *     const allUnknown = statuses.every(s => s === 'unknown')
 *     ... else if (allUnknown) overall = 'needs-review'
 *     else overall = 'ready'
 *
 * so anything short of EVERY check being unknown fell through to 'ready'. Two
 * of the five entries — crossSectionConsistency and approvedBaselineCompare —
 * were hardcoded 'unknown' placeholders that have never had an implementation,
 * and `readiness` returns 'unknown' whenever its engine throws. So a section
 * where FOUR checks never ran and exactly ONE passed was reported 'Ready'.
 *
 * That is not a dark-endpoint curiosity. POST /module-preflight is the ONLY
 * route in server/routes/authoring-actions.ts with a live consumer:
 * server/services/ana-ri/mdx-command-handlers.ts calls it over internal HTTP for
 * the AnA 510(k) preflight command, writes `overall` into a GxP audit record via
 * auditService.logAction, and reports it to the user. A fabricated "ready"
 * landed in the regulated record.
 */
import { describe, expect, it } from 'vitest';
import { sectionPreflightVerdict } from '../authoring-actions';

const PASS = { status: 'pass' };
const FAIL = { status: 'fail' };
const WARN = { status: 'warn' };
const UNKNOWN = { status: 'unknown' };
const TODO = { status: 'not-implemented' };

describe('sectionPreflightVerdict', () => {
  it('does NOT call a section ready when checks did not run', () => {
    // The exact shape that produced a false "Ready": one real pass, the rest
    // never ran. Under the old rule `allUnknown` was false, so it fell to ready.
    const v = sectionPreflightVerdict({
      readiness: UNKNOWN,
      contradictions: UNKNOWN,
      bodyExpectations: PASS,
      crossSectionConsistency: TODO,
      approvedBaselineCompare: TODO,
    });
    expect(v.overall).toBe('needs-review');
    expect(v.overall).not.toBe('ready');
  });

  it('names the checks that did not run, so the verdict is legible', () => {
    const v = sectionPreflightVerdict({
      readiness: UNKNOWN,
      contradictions: UNKNOWN,
      bodyExpectations: PASS,
    });
    expect(v.checksDidNotRun).toEqual(['readiness', 'contradictions']);
    expect(v.summary).toMatch(/2 check\(s\) did not run: readiness, contradictions/);
    expect(v.checksRan).toBe(1);
  });

  it('is ready only when every assessed check actually ran and passed', () => {
    const v = sectionPreflightVerdict({
      readiness: PASS,
      contradictions: PASS,
      bodyExpectations: PASS,
      crossSectionConsistency: TODO,
      approvedBaselineCompare: TODO,
    });
    expect(v.overall).toBe('ready');
    // The placeholders are excluded from the count, not counted as passes.
    expect(v.checksRan).toBe(3);
    expect(v.summary).toMatch(/3 check\(s\) ran and passed/);
  });

  it('never reports ready when nothing was assessed at all', () => {
    // A TODO is not evidence. Neither is an empty check set.
    expect(sectionPreflightVerdict({}).overall).toBe('needs-review');
    expect(
      sectionPreflightVerdict({ crossSectionConsistency: TODO, approvedBaselineCompare: TODO })
        .overall,
    ).toBe('needs-review');
    expect(sectionPreflightVerdict({}).summary).toMatch(/no check produced a result/);
  });

  it('keeps fail and warn dominant over an unrun check', () => {
    expect(sectionPreflightVerdict({ a: FAIL, b: UNKNOWN }).overall).toBe('blocked');
    expect(sectionPreflightVerdict({ a: WARN, b: UNKNOWN }).overall).toBe('provisional');
    // fail outranks warn
    expect(sectionPreflightVerdict({ a: FAIL, b: WARN }).overall).toBe('blocked');
  });

  it('excludes placeholders from the verdict rather than treating them as inconclusive', () => {
    // Under the old rule these two dragged every section toward a denominator
    // they could never satisfy, while still not preventing 'ready'.
    const withTodos = sectionPreflightVerdict({ real: PASS, x: TODO, y: TODO });
    const without = sectionPreflightVerdict({ real: PASS });
    expect(withTodos).toEqual(without);
  });
});
