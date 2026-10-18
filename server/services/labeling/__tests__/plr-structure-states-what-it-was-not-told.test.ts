/**
 * assessPLRStructure (AnA tool assess_plr_structure) answers without the inputs
 * its tool definition calls optional, and does not settle what they decide
 * (2026-10-15).
 *
 * therapeuticArea is optional in the tool definition, but the engine called
 * therapeuticArea.toLowerCase() and threw a TypeError without it, which AnA got
 * as "assess_plr_structure failed: Cannot read properties of undefined". With
 * hasBoxedWarning unstated, the Highlights boxed warning (H.1) came back
 * required: false, exactly as for a product stated to have none. An unstated
 * productType or applicationType (both required by the tool) was structured as
 * a plain NDA prescription drug, without saying so.
 */
import { describe, expect, it } from 'vitest';
import { assessPLRStructure, type AssessPLRStructureInput } from '../labeling-intelligence-knowledge';
import { ASSESS_PLR_STRUCTURE } from '../../ana/labelingIntelligenceTools';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler } from '../../ana/AnaToolExecutor';

const plr = (p: unknown) => assessPLRStructure(p as AssessPLRStructureInput);
const NDA = { productType: 'prescription_drug', applicationType: 'NDA' };
const h1 = (p: unknown) => plr(p).highlightsStructure.find((s) => s.sectionNumber === 'H.1');

describe('assessPLRStructure', () => {
  it('structures a PI with no therapeutic area, and says its considerations were not assessed', () => {
    const r = plr(NDA);
    expect(r.specialConsiderations.join('\n')).toMatch(/therapeuticArea was not stated/);
    expect(plr({ ...NDA, therapeuticArea: 'oncology' }).specialConsiderations.join('\n')).not.toMatch(/therapeuticArea was not stated/);
  });

  it('reaches AnA as a computed structure, not a failure, when therapeuticArea is left out', async () => {
    const reply = await getToolHandler('assess_plr_structure')!(NDA, { organizationId: 1, userId: 1 } as never);
    expect(JSON.parse(reply), 'assess_plr_structure reply without therapeuticArea').toMatchObject({ status: 'computed' });
  });

  it('leaves the Highlights boxed warning undetermined when hasBoxedWarning is unstated', () => {
    const s = h1({ ...NDA, therapeuticArea: 'oncology' });
    expect(s?.required, 'H.1 with hasBoxedWarning unstated').toBe('undetermined');
    expect(s?.contentGuidance).toMatch(/hasBoxedWarning\) was not stated/);
  });

  it('takes H.1 from a stated hasBoxedWarning', () => {
    expect(h1({ ...NDA, hasBoxedWarning: true })?.required).toBe(true);
    const none = h1({ ...NDA, hasBoxedWarning: false });
    expect(none?.required).toBe(false);
    expect(none?.contentGuidance).not.toMatch(/not stated/);
  });

  it('refuses to structure a PI for no stated product or application type', async () => {
    expect(() => plr({}), 'PLR structure with productType and applicationType unstated').toThrow(/productType.*applicationType/);
    expect(() => plr({ productType: 'prescription_drug', applicationType: 'IND' })).toThrow(/applicationType/);
    const reply = await getToolHandler('assess_plr_structure')!({ therapeuticArea: 'oncology' }, { organizationId: 1, userId: 1 } as never);
    expect(JSON.parse(reply)).toMatchObject({ status: 'needs_parameters', field: 'productType' });
  });

  it('tells AnA what an unstated hasBoxedWarning or therapeuticArea gives', () => {
    const props = ASSESS_PLR_STRUCTURE.input_schema.properties as Record<string, { description: string }>;
    expect(props.hasBoxedWarning.description).toMatch(/undetermined/);
    expect(props.therapeuticArea.description).toMatch(/not assessed/);
  });
});
