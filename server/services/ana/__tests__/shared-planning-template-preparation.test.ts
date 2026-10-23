import { describe, expect, it } from 'vitest';
import { documentTemplateTool } from '../document-template-tool';
import { buildDocumentPreparation, BIOTECH_AUTHORING_GUIDANCE } from '../../market-specs/document-preparation';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../../authoring/builtin-authoring-templates';

const IDS = ['RI_STRATEGY', 'RI_GAP_ANALYSIS', 'RI_COMPETITIVE', 'RI_HA_MEETING'] as const;
const call = async (input: Record<string, unknown>) => JSON.parse(await documentTemplateTool(input));
const medicinalDefaults = /pediatric|iPSP|\bPIP\b|PK\/PD|immunogenicity|database lock|safety exposure/i;

describe('the existing template tool prepares shared planning work without medicinal defaults', () => {
  it.each(IDS)('%s is an internal working outline, without a mandatory market or filing verdict', async registry_id => {
    const out = await call({ registry_id, prepare: true });
    expect(out.ok).toBe(true);
    expect(out.outlineAvailable).toBe(true);
    expect(out.template.sections.length).toBeGreaterThan(0);
    expect(out.preparation).toMatchObject({ registryId: registry_id, market: null,
      regionalRoute: null, readiness: 'not_assessed', evidenceReviewed: false });
    expect(out.preparation.questions).toHaveLength(3);
    expect(out.preparation.questions[0].question).toMatch(/purpose.*audience/i);
    expect(out.preparation.applicabilityQuestions).toEqual([]);
    expect(JSON.stringify(out.preparation)).not.toMatch(medicinalDefaults);
    expect(out.preparation.cautions.join(' ')).toMatch(/not.*ICH.*mandat/i);
    expect(out.saved).toBeUndefined();
    expect(out.status).toBeUndefined();
  });

  it.each(['US', 'CA', 'EU', 'JP'] as const)('%s narrows the analysis but creates no delivery route or local drug obligations', async market => {
    const out = await call({ registry_id: 'RI_GAP_ANALYSIS', market, prepare: true });
    expect(out.ok).toBe(true);
    expect(out.preparation).toMatchObject({ market, regionalRoute: null, readiness: 'not_assessed', evidenceReviewed: false });
    expect(out.preparation.regionalEvidenceSources).toEqual([]);
    expect(JSON.stringify(out.preparation)).not.toMatch(medicinalDefaults);
  });

  it('discussion markers paginate inquiries without turning answers into reviewed evidence', () => {
    const first = buildDocumentPreparation({ registryId: 'RI_HA_MEETING' });
    const discussedTopics = first.questions.map(row => row.topic);
    const second = buildDocumentPreparation({ registryId: 'RI_HA_MEETING', discussedTopics });
    expect(first.questions).toHaveLength(3);
    expect(second.questions.every(row => !discussedTopics.includes(row.topic))).toBe(true);
    expect(second.questions.some(row => row.topic === 'agency_commitments')).toBe(true);
    expect(second).toMatchObject({ evidenceReviewed: false, readiness: 'not_assessed' });
    const finished = buildDocumentPreparation({ registryId: 'RI_HA_MEETING',
      discussedTopics: [...discussedTopics, ...second.questions.map(row => row.topic)] });
    expect(finished.questions).toEqual([]);
    expect(finished.remainingTopics).toEqual([]);
    expect(finished.evidenceReviewed).toBe(false);
  });

  it.each(['drug_product', 'k510_summary', 'protocol'])('refuses an unrelated %s component for a shared planning identity, including outline-only', async template_id => {
    for (const prepare of [true, false]) {
      const out = await call({ registry_id: 'RI_STRATEGY', template_id, prepare });
      expect(out.error).toMatch(/shared planning|internal.*scope/i);
      expect(out.ok).toBeUndefined();
    }
  });

  it.each(['ectd', 'ctis', 'estar', 'eu_mdr', 'eu_ivdr'])('refuses the %s package family for a shared planning work product', async family => {
    for (const prepare of [true, false]) {
      const out = await call({ registry_id: 'RI_STRATEGY', family, prepare });
      expect(out.error).toMatch(/shared planning|internal.*scope/i);
      expect(out.ok).toBeUndefined();
    }
  });

  it.each(IDS)('%s has the same internal preparation through paginated builtin UUID references', async registryId => {
    const template = (await getBuiltinAuthoringTemplate(builtinAuthoringTemplateId('registry:' + registryId)))!;
    expect(template).toBeDefined();
    const direct = buildDocumentPreparation({ registryId });
    const parts: Array<{ characterOffset: number; text: string }> = [];
    const headings: string[] = [];
    let offset = 0;
    for (let page = 0; page < 100; page++) {
      const raw = await documentTemplateTool({ template_id: template.id, prepare: true, offset, limit: 30 });
      expect(raw.length).toBeLessThanOrEqual(5000);
      const out = JSON.parse(raw);
      expect(out.ok, raw).toBe(true);
      expect(out.template).toMatchObject({ id: template.id, entryId: template.entryId,
        module: null, aiDraftable: false, families: [] });
      for (const item of out.items) {
        if (item.kind === 'preparation') parts.push(item);
        if (item.kind === 'heading') headings.push(item.code);
      }
      if (out.nextOffset === null) {
        expect(headings).toEqual(template.sections.map(row => row.code));
        const assembled = parts.sort((a, b) => a.characterOffset - b.characterOffset).map(part => part.text).join('');
        expect(JSON.parse(assembled)).toEqual(direct);
        return;
      }
      expect(out.nextOffset).toBeGreaterThan(offset);
      offset = out.nextOffset;
    }
    throw new Error('Shared planning reference pagination did not terminate');
  });

  it('keeps UUID outline-only scope checks without turning the internal document into a filing', async () => {
    const template_id = builtinAuthoringTemplateId('registry:RI_STRATEGY');
    const reference = await call({ template_id, prepare: false, market: 'JP' });
    expect(reference.ok).toBe(true);
    expect(reference.items.every((item: { kind: string }) => item.kind !== 'preparation')).toBe(true);
    for (const input of [{ registry_id: 'RI_COMPETITIVE' }, { registry_id: 'US_NDA' },
      { family: 'ectd' }, { family: 'eu_ivdr' }]) {
      for (const prepare of [true, false]) {
        const out = await call({ template_id, prepare, ...input });
        expect(out.error).toBeTruthy();
        expect(out.ok).toBeUndefined();
      }
    }
  });

  it('names the shared documents in the authoring instructions already supplied to conversation', () => {
    expect(BIOTECH_AUTHORING_GUIDANCE).toContain('SHARED PLANNING DOCUMENT PREPARATION');
    for (const id of IDS) expect(BIOTECH_AUTHORING_GUIDANCE).toContain(id);
    expect(BIOTECH_AUTHORING_GUIDANCE).toContain('No market is mandatory');
  });
});
