import { describe, expect, it } from 'vitest';
import { buildDocumentPreparation, documentComponentContext, documentComponentRegion, PREPARATION_TOPICS } from '../../market-specs/document-preparation';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../../authoring/builtin-authoring-templates';
import { documentTemplateTool } from '../document-template-tool';
import { resolveSystemPrompt } from '../AnaDocumentDraftingService';

const devices = ['US_510K', 'US_PMA', 'US_DE_NOVO', 'US_510K_IVD', 'EU_MDR_CLASS_IIA', 'EU_IVDR_CLASS_CD',
  'CA_MDL', 'CA_IVD_LICENCE', 'JP_SHONIN', 'JP_IVD_APPROVAL', 'JP_CDX', 'ISO_CIP', 'IEC_62304'];
const call = async (input: Record<string, unknown>) => JSON.parse(await documentTemplateTool(input));
function questions(registryId: string): string {
  return PREPARATION_TOPICS.map(topic => buildDocumentPreparation({ registryId,
    discussedTopics: PREPARATION_TOPICS.filter(t => t !== topic) }).questions).flat().map(q => `${q.question} ${q.requestedEvidence}`).join(' ');
}

describe('device preparation reaches the existing reference and drafting paths', () => {
  it.each(devices)('prepares exact %s with source-scoped device questions and no readiness claim', registryId => {
    const plan = buildDocumentPreparation({ registryId });
    expect(plan.registryId).toBe(registryId);
    expect(plan.questions).toHaveLength(3);
    expect(plan.questions[0].question).toMatch(/intended (use|purpose)/i);
    expect(plan.questions[1].requestedEvidence).toMatch(/(device|assay|software).*(version|configuration)/i);
    expect(plan.readiness).toBe('not_assessed');
    expect(plan.evidenceReviewed).toBe(false);
    expect(plan.applicabilityQuestions.join(' ')).not.toMatch(/iPSP|PIP|immunogenicity/);
  });
  it('the actual template tool prepares a Japanese IVD without medicinal questions or authority to transmit', async () => {
    const plan = await call({ registry_id: 'JP_IVD_APPROVAL', prepare: true });
    expect(plan.ok).toBe(true);
    expect(plan.template.id).toBe('JP_IVD_APPROVAL');
    expect(plan.preparation.regionalRoute.scope).toMatch(/(no|not).*transmi/i);
    const text = questions('JP_IVD_APPROVAL');
    expect(text).toMatch(/analytical.*clinical/i);
    expect(text).toMatch(/Japanese.*(data|population|evidence)/i);
    expect(text).not.toMatch(/PK\/PD|Phase I|iPSP|PIP/);
    expect(plan.preparation.regionalEvidenceSources).toEqual([]);
  });
  it.each(['CA_MDL', 'CA_IVD_LICENCE', 'JP_SHONIN'])('%s preparation leaves the unavailable transmit step explicit', registryId => {
    const route = buildDocumentPreparation({ registryId }).regionalRoute;
    expect(route?.scope).toMatch(/(no|not).*transmi/i);
    expect(route?.basis.confidence).toBe('platform-convention');
  });
  it('EU device technical documentation and performance studies use their own receiving bodies', () => {
    expect(buildDocumentPreparation({ registryId: 'EU_IVDR' }).regionalRoute?.channel).toMatch(/Notified Body/);
    expect(buildDocumentPreparation({ registryId: 'EU_PERF_STUDY' }).regionalRoute?.channel).toMatch(/national competent authority/i);
    expect(buildDocumentPreparation({ registryId: 'EU_PERF_STUDY' }).regionalRoute?.channel).not.toMatch(/CTIS|EMA/);
  });
  it('discussion markers exhaust questions without verifying evidence or permitting a build', () => {
    const plan = buildDocumentPreparation({ registryId: 'US_510K', discussedTopics: [...PREPARATION_TOPICS] });
    expect(plan.questions).toEqual([]);
    expect(plan.readiness).toBe('not_assessed');
    expect(plan.evidenceReviewed).toBe(false);
    expect(plan.discussionNotice).toMatch(/do not verify/);
  });
  it.each(['JP_SHONIN', 'JP_IVD_APPROVAL', 'CA_MDL', 'EU_IVDR'])('%s section drafting receives device delivery scope', registryId => {
    const prompt = resolveSystemPrompt(registryId);
    expect(prompt).toContain('DEVICE AND DIAGNOSTICS EVIDENCE-BASED DRAFTING');
    expect(prompt).toMatch(/(no|not).*transmi/i);
    expect(prompt).not.toMatch(/PK\/PD|Phase I|estimands/);
    expect(prompt).not.toContain('Use none formatting');
  });
  it.each(['EU_IVDR', 'EU_IVDR_TECHDOC', 'IVDR_TD'])('%s never borrows the MDR clinical-evaluation framework', id => {
    const prompt = resolveSystemPrompt(id);
    expect(prompt).toContain('EU_IVDR');
    expect(prompt).toContain('DEVICE AND DIAGNOSTICS EVIDENCE-BASED DRAFTING');
    expect(prompt).not.toContain('Annex XIV — Clinical Evaluation');
    expect(prompt).not.toContain('MEDDEV 2.7/1');
  });
  it.each([
    ['k510_summary', 'US', 'FDA'], ['gspr_checklist', 'EU', 'Notified_Body'],
    ['ivdr_gspr_checklist', 'EU', 'Notified_Body'], ['performance_evaluation_report', 'EU', 'Notified_Body'],
    ['smpc', 'EU', 'EMA'], ['rmp', 'EU', 'EMA'], ['clinical_study_report', 'GLOBAL', 'ICH'],
  ])('%s component has one regional and receiving-body context', (templateId, region, agency) => {
    expect(documentComponentContext(templateId)).toEqual({ region, agency });
    expect(documentComponentRegion(templateId)).toBe(region);
  });
  it.each([
    { template_id: 'k510_summary', market: 'EU' }, { template_id: 'gspr_checklist', market: 'US' },
    { template_id: 'ivdr_gspr_checklist', market: 'JP' },
    { template_id: 'performance_evaluation_report', registry_id: 'CA_IVD_LICENCE' },
    { template_id: 'protocol', registry_id: 'US_510K' },
    { template_id: 'k510_summary', registry_id: 'US_NDA' },
  ])('conflicting scope fails before device preparation: %j', async input => {
    for (const prepare of [true, false]) {
      const result = await call({ ...input, prepare });
      // Product compatibility belongs to preparation; exact regional conflicts
      // remain refused even for outline-only reference use.
      if (prepare || 'market' in input || input.registry_id === 'CA_IVD_LICENCE') expect(result.error).toBeTruthy();
    }
  });
  it.each(['US_510K', 'EU_IVDR', 'CA_MDL', 'JP_IVD_APPROVAL', 'QMS_QUALITY_MANUAL', 'QMS_DESIGN_CONTROLS',
    'QMS_DMR', 'QMS_DHR', 'QMS_MDSAP', 'QMS_QSR_820', 'QMS_ISO_13485'])('%s built-in UUID uses the same preparation and retains manual eligibility', async registryId => {
    const id = builtinAuthoringTemplateId(`registry:${registryId}`);
    const template = await getBuiltinAuthoringTemplate(id);
    expect(template?.filingContext?.registryId).toBe(registryId);
    expect(template?.aiDraftable).toBe(false);
    const result = await call({ template_id: id, prepare: true, limit: 30 });
    expect(result.ok).toBe(true);
    expect(result.template.filingContext.registryId).toBe(registryId);
    expect(result.template.aiDraftable).toBe(false);
    const items = [...result.items];
    let next = result.nextOffset;
    while (next !== null) {
      const page = await call({ template_id: id, prepare: true, offset: next, limit: 30 });
      expect(page.ok).toBe(true);
      expect(page.template.filingContext.registryId).toBe(registryId);
      expect(page.nextOffset === null || page.nextOffset > next).toBe(true);
      items.push(...page.items); next = page.nextOffset;
    }
    const text = items.filter(item => item.kind === 'preparation').map(item => item.text).join('');
    expect(JSON.parse(text).readiness).toBe('not_assessed');
    expect(JSON.parse(text).registryId).toBe(registryId);
  });
});
