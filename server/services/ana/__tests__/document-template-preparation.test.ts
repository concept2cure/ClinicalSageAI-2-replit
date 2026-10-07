import { describe, expect, it } from 'vitest';
import { documentTemplateTool } from '../document-template-tool';
import { getToolHandler } from '../AnaToolExecutor';
import { resolveSystemPrompt } from '../AnaDocumentDraftingService';
import { buildAnaRISystemPrompt } from '../../ana-ri/persona';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions';

const call = async (input: Record<string, unknown>) => JSON.parse(await documentTemplateTool(input));
describe('existing template tool — regional preparation reaches real Anna paths', () => {
  it('registered tool exposes the prepared outline and stays read-only', async () => {
    const handler = getToolHandler('get_document_template')!;
    const out = JSON.parse(await handler({ template_id: 'clinical_study_report', registry_id: 'EU_MAA', prepare: true }));
    expect(out.ok).toBe(true);
    expect(out.preparation.registryId).toBe('EU_MAA');
    expect(out.preparation.readiness).toBe('not_assessed');
    expect(out.saved).toBeUndefined();
    expect(out.status).toBeUndefined();
  });
  it('new named builds are discoverable without a second tool or renderer', async () => {
    for (const template_id of ['protocol', 'statistical_analysis_plan', 'informed_consent', 'drug_substance', 'drug_product', 'dsur', 'investigator_brochure', 'rmp']) {
      const out = await call({ template_id, prepare: true });
      expect(out.ok, template_id).toBe(true);
      expect(out.template.sections.length, template_id).toBeGreaterThan(0);
      expect(out.preparation.questions, template_id).toHaveLength(3);
    }
  });
  it('pages through CSR sections without truncation or skipping headings', async () => {
    let offset = 0;
    const numbers: string[] = [];
    for (let page = 0; page < 30; page++) {
      const raw = await documentTemplateTool({ template_id: 'clinical_study_report', registry_id: 'JP_MKT_APPROVAL', prepare: true, offset, limit: 30 });
      expect(raw.length).toBeLessThanOrEqual(7800);
      const out = JSON.parse(raw);
      expect(out.ok).toBe(true);
      numbers.push(...out.template.sections.map((s: {number: string}) => s.number));
      if (out.nextOffset === null) {
        expect(numbers).toHaveLength(out.sectionsTotal);
        expect(new Set(numbers).size).toBe(numbers.length);
        return;
      }
      expect(out.nextOffset).toBeGreaterThan(offset);
      offset = out.nextOffset;
    }
    throw new Error('CSR outline pagination did not terminate');
  });
  it('does not hide missing region-specific trial outlines behind a default CTD', async () => {
    for (const registry_id of ['EU_CTA', 'CA_CTA', 'CA_CTA_A', 'JP_CTN']) {
      const out = await call({ registry_id });
      expect(out.ok, registry_id).toBe(true);
      expect(out.outlineAvailable).toBe(false);
      expect(out.template).toBeUndefined();
      expect(out.preparation.regionalRoute).toBeDefined();
    }
  });
  it('reports available and unavailable existing types in a regional coverage page', async () => {
    const out = await call({ coverage: true, market: 'CA', limit: 30 });
    expect(out.ok).toBe(true);
    expect(out.coverage.some((r: {registryId: string;outlineAvailable:boolean}) => r.registryId === 'CA_CTA' && !r.outlineAvailable)).toBe(true);
    expect(out.coverage.some((r: {registryId: string;outlineAvailable:boolean}) => r.registryId === 'CA_NDS' && r.outlineAvailable)).toBe(true);
    expect(out.readiness).toBe('not_assessed');
  });
  it('returns catalog summaries and a continuation, not a truncated whole library', async () => {
    const out = await call({ limit: 3 });
    expect(out.templates).toHaveLength(3);
    expect(out.templates[0].sections).toBeUndefined();
    expect(out.total).toBeGreaterThan(3);
    expect(out.nextOffset).toBe(3);
  });
});

describe('existing template tool — scope checks and reference lookups', () => {
  it('explicit prepare:false returns an outline-only page even with a confirmed registry id', async () => {
    const raw = await documentTemplateTool({ registry_id: 'CA_NDS', prepare: false, limit: 30 });
    expect(raw.length).toBeLessThanOrEqual(7800);
    const out = JSON.parse(raw);
    expect(out.ok).toBe(true);
    expect(out.template.id).toBe('CA_NDS');
    expect(out.preparation).toBeUndefined();
    expect(out.template.sections.length).toBeGreaterThan(0);
  });
  it.each([
    { registry_id: 'CTA', prepare: false },
    { registry_id: 'EU_CTA', market: 'US', prepare: false },
  ])('outline-only cannot bypass the registry and market scope checks: %j', async (input) => {
    const out = await call(input);
    expect(out.error).toBeTruthy();
    expect(out.ok).toBeUndefined();
  });
  it('registry-only components receive their document-specific inquiry profile', async () => {
    for (const registry_id of ['ICH_PROTOCOL', 'ICH_SAP']) {
      const out = await call({ registry_id, prepare: true });
      expect(out.ok).toBe(true);
      expect(out.preparation.questions[2].topic).toBe('estimands');
      if (registry_id === 'ICH_SAP') expect(out.preparation.remainingTopics).not.toContain('statistical_results');
    }
  });
  it.each(['k510_summary', 'gspr_checklist', 'ivdr_gspr_checklist', 'performance_evaluation_report'])('keeps %s available as an outline but refuses medicinal preparation', async template_id => {
    const reference = await call({ template_id, prepare: false });
    expect(reference.ok).toBe(true);
    expect(reference.preparation).toBeUndefined();
    const prepared = await call({ template_id, prepare: true });
    expect(prepared.error).toMatch(/biotech medicinal-product/i);
  });
  it('preserves an exact device registry outline without allowing a drug preparation plan', async () => {
    const reference = await call({ registry_id: 'US_510K', prepare: false });
    expect(reference.ok).toBe(true);
    expect(reference.preparation).toBeUndefined();
    expect((await call({ registry_id: 'US_510K', prepare: true })).error).toMatch(/biotech medicinal-product/i);
    expect((await call({ family: 'estar', prepare: true })).error).toMatch(/biotech medicinal-product/i);
  });
  it.each(['smpc', 'impd', 'risk_management_plan', 'rmp'])('requires EU scope for a targeted %s build, including outline-only', async template_id => {
    for (const market of ['US', 'CA', 'JP']) {
      for (const prepare of [true, false]) {
        expect((await call({ template_id, market, prepare })).error).toMatch(/current regional.*client template/i);
      }
    }
    expect((await call({ template_id, registry_id: 'US_NDA', prepare: false })).error).toMatch(/current regional.*client template/i);
    expect((await call({ template_id, market: 'EU', prepare: true })).ok).toBe(true);
    expect((await call({ template_id })).ok).toBe(true);
  });
  it.each([{ market:'UK' }, { registry_id:'CTA' }, { offset:-1 }, { offset:null }, { limit:0 }, { limit:null }, { prepare:'yes' }, { discussed_topics:['approved'] }, { template_id:'missing' }, { template_id:'protocol',registry_id:'CA_CTA',market:'EU' }])('rejects invalid scope without a successful build claim: %j', async input => {
    const out = await call(input);
    expect(out.error).toBeTruthy();
    expect(out.ok).toBeUndefined();
  });
  it('exposes the preparation fields in Anna’s actual schema', () => {
    const def = ALL_ANA_TOOLS.find(t => t.name === 'get_document_template')!;
    for (const key of ['registry_id', 'market', 'prepare', 'discussed_topics', 'coverage', 'offset', 'limit']) expect(def.input_schema.properties).toHaveProperty(key);
  });
  it('passes preparation instructions and the correct region to drafting rather than only the ICH generic prompt', () => {
    for (const [type, scope] of [['EU_CTA', 'CTIS'], ['CA_CTA', 'Modules 1–3'], ['JP_CTN', 'PMDA clinical trial notification']]) {
      const prompt = resolveSystemPrompt(type);
      expect(prompt).toContain(scope);
      expect(prompt).toContain('client interview occurs in conversation');
      expect(prompt).toContain('Keep preparation questions outside the formal document');
      expect(prompt).not.toContain('use get_document_template');
      expect(prompt).not.toContain('- Primary CTD Module: M1–M5');
    }
    expect(resolveSystemPrompt('ich_clinical')).toContain('ICH E6(R3)');
  });
  it('makes the same preparation rule available to conversation', () => {
    expect(buildAnaRISystemPrompt({})).toContain('BIOTECH DOCUMENT PREPARATION');
  });
});
