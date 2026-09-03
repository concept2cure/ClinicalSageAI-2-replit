/**
 * A regional (3.2.R) section must score what it actually has.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `composeRegional` returned `completeness: 100, missingInputs: []` for every
 * regional subsection unconditionally, and attached EVERY source object in the
 * project as lineage whether or not the generator read it. The US generator is
 * largely a pointer section: with no manufacturing site recorded it still emits
 * `FEI / DUNS for [site]`, and still scored 100% complete.
 *
 * That number is load-bearing. The Module 3 export gate requires every compiled
 * section to be approved before placement, and a section presented as 100%
 * complete is the one a reviewer signs without looking. A placeholder that
 * reads "complete" is exactly the fabricated readiness this codebase forbids.
 *
 * Completeness is now the fraction of the section's declared source fields that
 * are actually present, `missingInputs` names the absent ones, and lineage
 * cites only the sources that supplied something.
 */
import { describe, it, expect } from 'vitest';
import { composeRegional } from '../module3-extensions';
import type { CanonicalSource } from '../module3Composer.js';

function source(id: string, payload: Record<string, unknown>): CanonicalSource {
  return {
    id,
    sourceType: 'drug_product',
    sourcePayload: payload,
    sourceHash: `hash-${id}`,
  } as unknown as CanonicalSource;
}

describe('composeRegional — the score reflects the inputs', () => {
  it('does not claim completeness for a section whose inputs are absent', () => {
    // A project with one source that carries none of the fields 3.2.R.1.US reads.
    const [us] = composeRegional([source('s1', { unrelatedField: 'x' })], 'US');

    expect(us.completeness).toBeLessThan(100);
    expect(us.missingInputs.length).toBeGreaterThan(0);
    // The absent fields are named, so the gap is actionable rather than implied.
    expect(us.missingInputs.join(' ')).toMatch(/manufacturingSite/);
  });

  it('scores 100 only when every declared field is present', () => {
    const complete = source('s2', {
      dosageFormDescription: 'Film-coated tablet',
      strength: '50 mg',
      composition: 'API + excipients',
      manufacturingSite: 'Site A, NJ',
      batchNumber: 'B-001',
      batchSize: '100,000 tablets',
    });
    const [us] = composeRegional([complete], 'US');

    expect(us.completeness).toBe(100);
    expect(us.missingInputs).toEqual([]);
  });

  it('scores partial credit proportionally rather than all-or-nothing', () => {
    const partial = source('s3', { dosageFormDescription: 'Tablet', strength: '10 mg' });
    const [us] = composeRegional([partial], 'US');

    expect(us.completeness).toBeGreaterThan(0);
    expect(us.completeness).toBeLessThan(100);
  });

  it('cites as lineage only the sources that supplied a field', () => {
    const contributing = source('used', { dosageFormDescription: 'Tablet' });
    const bystander = source('unused', { somethingElse: 'y' });
    const [us] = composeRegional([contributing, bystander], 'US');

    const cited = us.lineage.map((l) => l.sourceObjectId);
    expect(cited).toContain('used');
    // Attaching every object in the project asserted a provenance that did not exist.
    expect(cited).not.toContain('unused');
  });

  it('applies to every region, not only the US', () => {
    for (const region of ['EU', 'JP', 'CA'] as const) {
      const [section] = composeRegional([source('s', { unrelatedField: 'x' })], region);
      expect(section.completeness, `${region} scored full marks over no inputs`).toBeLessThan(100);
      expect(section.missingInputs.length, `${region} named no missing input`).toBeGreaterThan(0);
    }
  });
});
