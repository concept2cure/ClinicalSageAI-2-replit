/**
 * AnA can review a client's SOP against what its topic requires
 * (2026-10-08, D2; shared/regulatory/sop-requirements.ts).
 *
 * generate_sop only wrote SOPs; nothing read one back. "Is our CAPA SOP
 * inspection-ready?" was answered by a model reading the text. The tool is a
 * thin handler over the deterministic review: each requirement addressed (with
 * the sentence) or not found, each with its basis, and no compliance verdict.
 */
import { describe, expect, it } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import { getToolPedigree } from '../tool-pedigree.js';

const run = async (input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler('review_sop_requirements')!(input, { organizationId: 7, userId: 3 } as any));

const SOP =
  'Complaints received by telephone or in writing are logged on receipt. Quality Assurance reviews each complaint. ' +
  'Each complaint is evaluated to decide whether an investigation is needed under 21 CFR 211.192. ' +
  'The file records the product name and strength, lot number, the complainant and the nature of the complaint.';

describe('review_sop_requirements', () => {
  it('is defined and deterministic', () => {
    expect(ALL_ANA_TOOLS.map((t) => t.name)).toContain('review_sop_requirements');
    expect(getToolPedigree('review_sop_requirements').pedigree).toBe('deterministic_registry');
  });

  it('reports each requirement of a drug complaint SOP as addressed, with its sentence, or not found', async () => {
    const out = await run({ sop_text: SOP, topic: 'complaint_handling', product_type: 'drug' });
    const byId = Object.fromEntries(out.elements.map((e: any) => [e.id, e]));
    expect(byId.written_oral.status).toBe('addressed');
    expect(byId.quality_unit.evidence).toMatch(/Quality Assurance/);
    expect(byId.record_content.status).toBe('addressed');
    expect(byId.retention.status).toBe('not_found');
    expect(byId.adverse_experience.status).toBe('not_found');
    expect(out.governing.join(' ')).toMatch(/21 CFR 211\.198/);
    expect(out.instruction).toMatch(/Do not call the SOP compliant/);
  });

  it('refuses a topic or product type it does not model, rather than guessing', async () => {
    expect((await run({ sop_text: SOP, topic: 'cleaning_validation', product_type: 'drug' })).error).toMatch(/topic must be/);
    expect((await run({ sop_text: SOP, topic: 'capa' })).error).toMatch(/product_type must be/);
  });

  it('with no text, reviews nothing and says so', async () => {
    const out = await run({ sop_text: '', topic: 'capa', product_type: 'device' });
    expect(out.status).toBe('no_text');
    expect(out.instruction).toMatch(/nothing was reviewed/);
  });
});
