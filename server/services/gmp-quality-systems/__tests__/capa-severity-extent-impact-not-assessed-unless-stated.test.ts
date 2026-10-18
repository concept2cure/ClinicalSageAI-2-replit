/**
 * A CAPA plan does not state a severity, an extent or a product impact nobody
 * assessed (audit finding 12 of the f/g/h fabrication sweep, 2026-10-15).
 *
 * What the code used to do: designCAPA defaulted severity to 'medium' (or
 * 'high' when productImpact was true) and wrote the unstated facts into the
 * problem statement as findings:
 * `designCAPA({ problemDescription: 'Balance calibration overdue', source })`
 * gave "Severity assessed as medium; failure appears isolated; no product
 * impact identified at this stage.", a 'standard' formality and a 60-day
 * target, in text meant to be pasted into a CAPA record.
 *
 * Now the statement says "not assessed" / "not determined" for what was not
 * supplied, severity is 'not_assessed', formality and the target timeline are
 * undetermined, and notAssessed lists the facts to ask for.
 */
import { describe, expect, it } from 'vitest';
import { designCAPA } from '../gmp-quality-systems-knowledge';

describe('designCAPA: unstated severity, extent and product impact are not assessed', () => {
  it('does not write an assessment nobody made into the problem statement', () => {
    const r = designCAPA({ problemDescription: 'Balance calibration overdue', source: 'audit_finding' });

    expect(r.problemStatement).not.toMatch(/Severity assessed as/);
    expect(r.problemStatement).not.toMatch(/failure appears isolated/);
    expect(r.problemStatement).not.toMatch(/no product impact identified/);
    expect(r.problemStatement).toMatch(/Severity not assessed/);
    expect(r.problemStatement).toMatch(/extent \(isolated vs systemic\) not determined/);
    expect(r.problemStatement).toMatch(/product impact not assessed/);
    expect(r.severity).toBe('not_assessed');
    expect(r.formality).toBe('undetermined');
    expect(r.recommendedTargetDays).toBeNull();
    expect(r.notAssessed).toEqual(expect.arrayContaining(['severity', 'systemic', 'productImpact']));
  });

  it('states what was supplied', () => {
    const r = designCAPA({
      problemDescription: 'Balance calibration overdue',
      source: 'audit_finding',
      severity: 'low',
      systemic: false,
      productImpact: false,
      recurring: false,
      contributingFactorCount: 1,
    });

    expect(r.problemStatement).toMatch(/Severity assessed as low/);
    expect(r.problemStatement).toMatch(/failure appears isolated/);
    expect(r.problemStatement).toMatch(/no product impact identified at this stage/);
    expect(r.formality).toBe('streamlined');
    expect(r.recommendedTargetDays).toBe(90);
    expect(r.notAssessed).toEqual([]);
  });

  it('labels a severity inferred from stated product impact as inferred, not assessed', () => {
    const r = designCAPA({ problemDescription: 'Mislabelled carton shipped', source: 'complaint', productImpact: true });

    expect(r.severity).toBe('high');
    expect(r.severityBasis).toBe('inferred_from_product_impact');
    expect(r.problemStatement).not.toMatch(/Severity assessed as/);
    expect(r.problemStatement).toMatch(/inferred as high/);
    expect(r.formality).toBe('formal');
  });
});
