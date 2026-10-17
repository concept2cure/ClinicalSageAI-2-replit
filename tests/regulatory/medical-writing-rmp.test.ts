/**
 * The medical-writing advisor gives the EU RMP structure the platform holds
 * (D2, 2026-10-15). Measured at 83138b464: it listed five parts of its own,
 * without Part IV (plans for post-authorisation efficacy studies) or Part VII
 * (annexes) of the GVP Module V structure in market-specs 'risk_management_plan'.
 */
import { describe, it, expect } from 'vitest';
import { getDocumentTemplate } from '../../server/services/market-specs/document-template-library';
import { getDocumentTypeStandard } from '../../server/services/ana/medical-writing';

describe('the medical-writing RMP structure', () => {
  it('is the GVP Module V parts from the library, in order', () => {
    const lib = getDocumentTemplate('risk_management_plan')!;
    expect(getDocumentTypeStandard('rmp')!.structure).toEqual(lib.sections.map((s) => `Part ${s.number} ${s.heading}`));
  });
});
