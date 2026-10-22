/**
 * structureSmPC (AnA tool structure_smpc) keeps section 1's additional-monitoring
 * text for a homeopathic product (2026-10-15).
 *
 * The homeopathic branch replaced section 1's guidance after the black-triangle
 * (▼) statement, or the "not determined" note for an unstated
 * hasAdditionalMonitoring, had been appended to it, so for a homeopathic product
 * section 1 said nothing about additional monitoring, as if stated not to apply.
 */
import { describe, expect, it } from 'vitest';
import { structureSmPC, type StructureSmPCInput } from '../labeling-intelligence-knowledge';

const section1 = (p: unknown) =>
  structureSmPC(p as StructureSmPCInput).smpcSections.find((s) => s.sectionNumber === '1')?.contentGuidance ?? '';
const HOMEOPATHIC = { productType: 'homeopathic', procedure: 'national' };

describe('structureSmPC for a homeopathic product', () => {
  it('keeps the black-triangle statement alongside the homeopathic guidance', () => {
    const g = section1({ ...HOMEOPATHIC, hasAdditionalMonitoring: true });
    expect(g).toMatch(/homeopathic medicinal products/);
    expect(g, 'homeopathic section 1 with hasAdditionalMonitoring: true').toMatch(/▼.*"This medicinal product is subject to additional monitoring/);
  });

  it('keeps "not determined" when additional monitoring was not stated', () => {
    const g = section1(HOMEOPATHIC);
    expect(g).toMatch(/homeopathic medicinal products/);
    expect(g, 'homeopathic section 1 with hasAdditionalMonitoring unstated').toMatch(/Additional monitoring: not determined/);
  });

  it('adds neither when it is stated not to apply', () => {
    const g = section1({ ...HOMEOPATHIC, hasAdditionalMonitoring: false });
    expect(g).toMatch(/homeopathic medicinal products/);
    expect(g).not.toMatch(/▼|not determined/);
  });
});
