/**
 * Tests for the combination-products assessment (21 CFR Part 3 PMOA logic).
 */
import { describe, it, expect } from 'vitest';
import { assessCombinationProduct } from '../combination-products';

describe('combination products — detection', () => {
  it('a single-component product is not a combination', () => {
    const a = assessCombinationProduct({ components: ['drug'] });
    expect(a.isCombination).toBe(false);
    expect(a.fdaLeadCenter).toBeUndefined();
  });

  it('≥2 distinct component types is a combination', () => {
    expect(assessCombinationProduct({ components: ['drug', 'device'] }).isCombination).toBe(true);
    expect(assessCombinationProduct({ components: ['device', 'device'] }).isCombination).toBe(false); // not distinct
  });
});

describe('combination products — PMOA → lead center', () => {
  it('drug PMOA → CDER', () => {
    const a = assessCombinationProduct({ components: ['drug', 'device'], primaryModeOfAction: 'drug' });
    expect(a.fdaLeadCenter).toBe('CDER');
    expect(a.fdaLeadCenterLabel).toMatch(/CDER/);
  });
  it('device PMOA → CDRH', () => {
    expect(assessCombinationProduct({ components: ['drug', 'device'], primaryModeOfAction: 'device' }).fdaLeadCenter).toBe('CDRH');
  });
  it('biologic PMOA → CBER', () => {
    expect(assessCombinationProduct({ components: ['biologic', 'device'], primaryModeOfAction: 'biologic' }).fdaLeadCenter).toBe('CBER');
  });

  it('recommends an RFD when PMOA is not established', () => {
    const a = assessCombinationProduct({ components: ['drug', 'device'] });
    expect(a.fdaLeadCenter).toBeUndefined();
    expect(a.considerations.some((c) => /Request for Designation|RFD/.test(c))).toBe(true);
  });

  it('ignores a PMOA that is not one of the components', () => {
    const a = assessCombinationProduct({ components: ['drug', 'device'], primaryModeOfAction: 'biologic' });
    expect(a.fdaLeadCenter).toBeUndefined(); // biologic isn't a component → RFD
  });
});

describe('combination products — EU + Part 4', () => {
  it('surfaces the EU Article 117 consideration for drug+device', () => {
    const a = assessCombinationProduct({ components: ['drug', 'device'], primaryModeOfAction: 'drug' });
    expect(a.euConsideration).toMatch(/Article 117|medicines framework/);
    expect(a.considerations.some((c) => /21 CFR Part 4/.test(c))).toBe(true);
  });
  it('notes co-packaged labeling coordination', () => {
    const a = assessCombinationProduct({ components: ['drug', 'device'], primaryModeOfAction: 'drug', combinationType: 'co_packaged' });
    expect(a.considerations.some((c) => /Co-packaged|cross-labeled/i.test(c))).toBe(true);
  });
});
