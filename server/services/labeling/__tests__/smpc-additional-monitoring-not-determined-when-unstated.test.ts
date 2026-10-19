/**
 * structureSmPC (AnA tool structure_smpc) does not settle additional monitoring
 * when nobody stated it (2026-10-15).
 *
 * With hasAdditionalMonitoring unstated, section 1 came back without the
 * black-triangle (▼) statement, exactly as for a product stated not to be under
 * additional monitoring, so "not required" and "not asked" read the same. With
 * productType or procedure unstated it structured a standard medicinal product
 * and gave no procedure guidance, without saying either was missing.
 */
import { describe, expect, it } from 'vitest';
import { structureSmPC, type StructureSmPCInput } from '../labeling-intelligence-knowledge';
import { STRUCTURE_SMPC } from '../../ana/labelingIntelligenceTools';

const smpc = (p: unknown) => structureSmPC(p as StructureSmPCInput);
const section1 = (p: unknown) => smpc(p).smpcSections.find((s) => s.sectionNumber === '1')?.contentGuidance ?? '';
const PRODUCT = { productType: 'medicinal_product', procedure: 'centralized' };

describe('structureSmPC', () => {
  it('says additional monitoring is not determined when it was not stated', () => {
    const g = section1(PRODUCT);
    expect(g, 'section 1 with hasAdditionalMonitoring unstated').toMatch(/Additional monitoring: not determined/);
    expect(g).toMatch(/hasAdditionalMonitoring/);
  });

  it('gives the black-triangle statement when monitoring is stated, and neither text when it is stated not to apply', () => {
    expect(section1({ ...PRODUCT, hasAdditionalMonitoring: true })).toMatch(/▼.*"This medicinal product is subject to additional monitoring/);
    const no = section1({ ...PRODUCT, hasAdditionalMonitoring: false });
    expect(no).not.toMatch(/▼/);
    expect(no).not.toMatch(/not determined/);
  });

  it('refuses to structure an SmPC for no stated product type or procedure', () => {
    expect(() => smpc({}), 'SmPC structured with productType and procedure unstated').toThrow(/productType.*procedure/);
    expect(() => smpc({ productType: 'medicinal_product' })).toThrow(/procedure/);
    expect(() => smpc({ productType: 'generic', procedure: 'centralized' })).toThrow(/productType/);
  });

  it('tells AnA what an unstated hasAdditionalMonitoring gives', () => {
    const props = STRUCTURE_SMPC.input_schema.properties as Record<string, { description: string }>;
    expect(props.hasAdditionalMonitoring.description).toMatch(/not determined/);
  });
});
