import { describe, expect, it } from 'vitest';
import { buildDocumentPreparation, PREPARATION_TOPICS } from '../document-preparation';
import { basisProblems } from '../../../../shared/regulatory/regulatory-basis';

describe('biotech document preparation — region and evidence before drafting', () => {
  it('asks three decisive questions and never certifies readiness', () => {
    const p = buildDocumentPreparation({ templateId: 'clinical_study_report' });
    expect(p.questions.map(q => q.topic)).toEqual(['scope', 'source_versions', 'data_cutoff']);
    expect(p.readiness).toBe('not_assessed');
    expect(p.evidenceReviewed).toBe(false);
    expect(p.remainingTopics).toContain('statistical_results');
    expect(p.questions.every(q => q.why && q.requestedEvidence)).toBe(true);
  });
  it('continues an interview without re-asking answered topics or promoting them to evidence', () => {
    const p = buildDocumentPreparation({ templateId: 'clinical_study_report', discussedTopics: ['scope', 'source_versions', 'data_cutoff'] });
    expect(p.questions[0].topic).toBe('statistical_results');
    expect(p.discussedTopics).toEqual(['scope', 'source_versions', 'data_cutoff']);
    expect(p.readiness).toBe('not_assessed');
    expect(p.evidenceReviewed).toBe(false);
  });
  it('keeps all discussion markers from becoming a filing-ready verdict', () => {
    const p = buildDocumentPreparation({ templateId: 'clinical_study_report', discussedTopics: [...PREPARATION_TOPICS] });
    expect(p.questions).toEqual([]);
    expect(p.readiness).toBe('not_assessed');
    expect(p.reviewGates).toContain('Independent medical, statistical, quality and regulatory review as applicable.');
  });
  it('keeps an EU CTA on CTIS, with national documents and disclosure questions', () => {
    const p = buildDocumentPreparation({ templateId: 'protocol', registryId: 'EU_CTA' });
    expect(p.regionalRoute?.channel).toBe('CTIS');
    expect(p.regionalRoute?.scope).toContain('Part I');
    expect(p.regionalRoute?.scope).toContain('Part II');
    expect(p.regionalRoute?.scope).not.toContain('M1–M5');
    expect(p.remainingTopics).toContain('local_requirements');
  });
  it('does not confuse Canada CTA with a full marketing dossier', () => {
    const p = buildDocumentPreparation({ templateId: 'protocol', registryId: 'CA_CTA' });
    expect(p.regionalRoute?.scope).toContain('Modules 1–3');
    expect(p.regionalRoute?.scope).toContain('clinical');
    expect(p.regionalRoute?.channel).toContain('non-eCTD');
    expect(basisProblems(p.regionalRoute!.basis)).toEqual([]);
  });
  it('does not re-label a Japanese trial notification as a marketing eCTD', () => {
    const p = buildDocumentPreparation({ templateId: 'protocol', registryId: 'JP_CTN' });
    expect(p.regionalRoute?.channel).toBe('PMDA clinical trial notification');
    expect(p.regionalRoute?.scope).not.toContain('marketing eCTD');
    expect(p.remainingTopics).toContain('japan_evidence');
  });
  it('makes Japanese language and ethnic evidence conditional', () => {
    const p = buildDocumentPreparation({ templateId: 'clinical_overview', registryId: 'JP_MKT_APPROVAL', discussedTopics: ['scope', 'source_versions', 'statistical_results', 'safety', 'quality', 'agency_commitments'] });
    const questionText = p.questions.map(q => q.question).join(' ');
    expect(questionText).toContain('English');
    expect(p.cautions.join(' ')).toContain('not automatically');
    expect(p.cautions.join(' ')).toContain('advance PMDA consultation');
  });
  it('keeps pediatric and advanced-therapy overlays conditional', () => {
    const p = buildDocumentPreparation({ templateId: 'protocol', registryId: 'US_IND' });
    expect(p.applicabilityQuestions).toContain('Pediatric population: determine US iPSP and EU PIP applicability separately, including waivers or deferrals.');
    expect(p.applicabilityQuestions.join(' ')).toContain('cell or gene');
  });
});

describe('biotech document preparation — exact scope and document-specific inquiry', () => {
  it('does not infer an application from an ambiguous alias or an unknown id', () => {
    for (const registryId of ['CTA', 'marketing application', 'NOT_A_REAL_TYPE']) {
      expect(() => buildDocumentPreparation({ templateId: 'protocol', registryId })).toThrow(/registry/i);
    }
  });
  it('rejects contradictory market and filing identity', () => {
    expect(() => buildDocumentPreparation({ templateId: 'protocol', registryId: 'EU_CTA', market: 'US' })).toThrow(/market/i);
  });
  it('does not assume a drug pathway for a device entry', () => {
    expect(() => buildDocumentPreparation({ templateId: 'protocol', registryId: 'US_510K' })).toThrow(/biotech/i);
  });
  it('routes all four marketing regions with independent regional requirements', () => {
    for (const id of ['US_NDA', 'US_BLA', 'EU_MAA', 'CA_NDS', 'JP_MKT_APPROVAL']) {
      const p = buildDocumentPreparation({ templateId: 'clinical_overview', registryId: id });
      expect(p.regionalRoute?.scope).toContain('regional Module 1');
      expect(p.readiness).toBe('not_assessed');
    }
  });
  it('uses document-specific questions, not trial results for every build', () => {
    const p = buildDocumentPreparation({ templateId: 'statistical_analysis_plan' });
    expect(p.questions[2].topic).toBe('estimands');
    expect(p.remainingTopics).not.toContain('statistical_results');
    const cmc = buildDocumentPreparation({ templateId: 'drug_product' });
    expect(cmc.questions[2].topic).toBe('quality');
  });
  it('uses the shared component mapping for registry-only protocol and SAP builds', () => {
    for (const registryId of ['ICH_PROTOCOL', 'ICH_SAP']) {
      const p = buildDocumentPreparation({ registryId });
      expect(p.questions[2].topic).toBe('estimands');
      if (registryId === 'ICH_SAP') expect(p.remainingTopics).not.toContain('statistical_results');
    }
  });
  it('refuses device component preparation without requiring a registry id', () => {
    expect(() => buildDocumentPreparation({ templateId: 'k510_summary' })).toThrow(/biotech medicinal-product/i);
  });
  it.each(['smpc', 'impd', 'risk_management_plan', 'rmp'])('refuses %s as a direct non-EU build', templateId => {
    expect(() => buildDocumentPreparation({ templateId, market: 'US' })).toThrow(/current regional.*client template/i);
    expect(() => buildDocumentPreparation({ templateId, registryId: 'CA_NDS' })).toThrow(/current regional.*client template/i);
  });
  it('keeps safety messages and datasets outside generic prose build claims', () => {
    const p = buildDocumentPreparation({ templateId: 'dsur', registryId: 'ICH_DSUR', market: 'EU' });
    expect(p.cautions.join(' ')).toContain('E2B');
    expect(p.cautions.join(' ')).toContain('validated datasets');
  });
  it('rejects unrecognized topics instead of silently skipping questions', () => {
    expect(() => buildDocumentPreparation({ templateId: 'protocol', discussedTopics: ['made_up'] as never })).toThrow(/topic/i);
  });
});
