import { describe, expect, it } from 'vitest';
import { buildDocumentPreparation, PREPARATION_TOPICS } from '../document-preparation';
import { documentTemplateTool } from '../../ana/document-template-tool';
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

describe('biotech preparation — lifecycle inquiry depth', () => {
  const continuation = ['scope', 'source_versions'] as const;
  it.each(['US_DMF', 'EU_ASMF', 'CA_MF', 'JP_MF'])('asks %s about access rights and confidential quality records, not trial outcomes', registryId => {
    const p = buildDocumentPreparation({ registryId, discussedTopics: [...continuation] });
    expect(p.questions[0].topic).toBe('quality');
    expect(p.questions[0].question).toMatch(/access|reference|confidential/i);
    expect([...p.questions.map(q => q.topic), ...p.remainingTopics]).not.toContain('statistical_results');
  });
  it.each(['US_IND_AMENDMENT', 'CA_CTA_A'])('resolves %s change scope and agency issues before generic scientific drafting', registryId => {
    const p = buildDocumentPreparation({ registryId });
    expect(p.questions[0].question).toMatch(/amendment|change/i);
    expect(p.questions[1].requestedEvidence).toMatch(/baseline|tracked|comparison/i);
    expect(p.questions[2].topic).toBe('agency_commitments');
    expect(p.questions[2].question).toMatch(/hold|requested|trigger/i);
  });
  it.each(['US_NDA_SUPP', 'US_BLA_SUPP', 'US_CBE', 'US_SUPAC', 'EU_VARIATION_IA', 'EU_VARIATION_IB', 'EU_VARIATION_II', 'EU_LINE_EXTENSION', 'CA_SNDS', 'CA_SANDS', 'JP_PARTIAL_CHANGE', 'JP_MINOR_CHANGE'])('prioritizes %s approved-to-proposed changes and affected evidence', registryId => {
    const p = buildDocumentPreparation({ registryId });
    expect(p.questions[0].question).toMatch(/approved|authorized/i);
    expect(p.questions[1].question).toMatch(/proposed|tracked/i);
    expect(p.questions[2].topic).toBe('quality');
    expect(p.questions[2].question).toMatch(/affected|comparability/i);
  });
  it.each(['US_PRE_IND', 'US_TYPE_A_MEETING', 'US_TYPE_B_MEETING', 'US_TYPE_C_MEETING', 'EU_SCIENTIFIC_ADVICE', 'CA_PRESUB_MEETING', 'JP_PRE_CONSULT'])('prepares %s around questions and sponsor positions', registryId => {
    const p = buildDocumentPreparation({ registryId, discussedTopics: [...continuation] });
    expect(p.questions[0].topic).toBe('agency_commitments');
    expect(p.questions[0].question).toMatch(/decisions|questions/);
    expect(p.questions[0].requestedEvidence).toMatch(/sponsor positions/i);
  });
  it.each(['US_PSP', 'EU_PIP'])('asks %s about age groups, extrapolation and existing plan decisions', registryId => {
    const p = buildDocumentPreparation({ registryId, discussedTopics: [...continuation] });
    expect(p.questions[0].topic).toBe('estimands');
    expect(p.questions[0].question).toMatch(/age groups|age-group/);
    expect(p.questions[0].requestedEvidence).toMatch(/waiver|deferral/);
    expect(p.questions[0].question).toMatch(/extrapolation/);
  });
  it.each(['US_ORPHAN', 'EU_ORPHAN'])('asks %s for regional rarity evidence and a defensible condition definition', registryId => {
    const p = buildDocumentPreparation({ registryId, discussedTopics: [...continuation] });
    expect(p.questions[0].topic).toBe('statistical_results');
    expect(p.questions[0].question).toMatch(/prevalence|rarity/);
    expect(p.questions[0].requestedEvidence).toMatch(/method|source/);
    if (registryId === 'EU_ORPHAN') expect(p.questions[0].question).toMatch(/significant benefit/);
  });
  it.each(['US_351K', 'EU_BIOSIMILAR_MAA', 'JP_BIOSIMILAR'])('asks %s for reference-product comparative evidence without prescribing a universal study', registryId => {
    const p = buildDocumentPreparation({ registryId, discussedTopics: [...continuation] });
    expect(p.questions[0].topic).toBe('quality');
    expect(p.questions[0].question).toMatch(/reference product/);
    expect(p.questions[0].question).toMatch(/residual uncertainty/);
    expect(p.questions.map(q => q.question).join(' ')).not.toMatch(/must conduct|always requires/);
  });
  it.each(['ICH_ICSR', 'ICH_SUSAR', 'US_ICSR_15DAY', 'EU_EUDRAVIGILANCE_ICSR', 'US_IND_SR'])('prepares %s as a reconciled safety case, not an aggregate efficacy report', registryId => {
    const p = buildDocumentPreparation({ registryId, discussedTopics: [...continuation] });
    expect(p.questions[0].topic).toBe('safety');
    expect(p.questions[0].question).toMatch(/receipt|awareness/);
    expect(p.questions[0].question).toMatch(/follow-up|duplicate/);
    expect([...p.questions.map(q => q.topic), ...p.remainingTopics]).not.toContain('statistical_results');
    expect(p.cautions.join(' ')).toContain('E2B');
  });
  it.each(['US_IND_ANNUAL', 'US_NDA_ANNUAL', 'EU_PSUR', 'US_PADER'])('asks %s about the actual reporting interval and cumulative versus interval data', registryId => {
    const p = buildDocumentPreparation({ registryId, discussedTopics: [...continuation] });
    expect(p.questions[0].topic).toBe('data_cutoff');
    expect(p.questions[0].question).toMatch(/interval|period/);
    expect(p.questions[0].requestedEvidence).toMatch(/cumulative|interval/);
  });
  it('prepares post-marketing studies from the actual obligation and milestone record', () => {
    const p = buildDocumentPreparation({ registryId: 'US_PMR', discussedTopics: [...continuation] });
    expect(p.questions[0].topic).toBe('agency_commitments');
    expect(p.questions[0].requestedEvidence).toMatch(/milestone|obligation/i);
    expect(p.questions[0].question).toMatch(/status|final report/i);
  });
  it.each(['ICH_COMPARABILITY', 'ICH_STABILITY_PROTOCOL', 'ICH_CTD_M3'])('asks %s for the specific quality experiment rather than human trial results', registryId => {
    const p = buildDocumentPreparation({ registryId, market: 'US', discussedTopics: [...continuation] });
    expect(p.questions[0].topic).toBe('quality');
    expect([...p.questions.map(q => q.topic), ...p.remainingTopics]).not.toContain('statistical_results');
    if (registryId === 'ICH_COMPARABILITY') expect(p.questions[0].question).toMatch(/acceptance criteria/);
    if (registryId === 'ICH_STABILITY_PROTOCOL') expect(p.questions[0].question).toMatch(/conditions|timepoints/);
  });
  it.each(['ICH_NONCLIN_SUMMARY', 'ICH_CTD_M4'])('asks %s about nonclinical findings and their translational limits', registryId => {
    const p = buildDocumentPreparation({ registryId, market: 'US', discussedTopics: [...continuation] });
    expect(p.questions[0].topic).toBe('safety');
    expect(p.questions[0].question).toMatch(/nonclinical/);
    expect(p.questions[0].requestedEvidence).toMatch(/study reports|GLP/);
    expect([...p.questions.map(q => q.topic), ...p.remainingTopics]).not.toContain('statistical_results');
  });
  it('keeps a selected protocol interview scientific even when the filing context is an amendment', () => {
    const p = buildDocumentPreparation({ registryId: 'CA_CTA_A', templateId: 'protocol', discussedTopics: [...continuation] });
    expect(p.questions[0].topic).toBe('estimands');
  });
  it('rejects a global device clinical-investigation entry instead of treating its family as a medicinal product', () => {
    expect(() => buildDocumentPreparation({ registryId: 'ISO_CIP', market: 'EU' })).toThrow(/biotech medicinal-product/);
  });
  it('does not turn complete lifecycle discussion markers into qualified evidence', () => {
    const p = buildDocumentPreparation({ registryId: 'JP_MINOR_CHANGE', discussedTopics: [...PREPARATION_TOPICS] });
    expect(p.questions).toEqual([]);
    expect(p.evidenceReviewed).toBe(false);
    expect(p.readiness).toBe('not_assessed');
  });
});

describe('biotech preparation — scientific and regional boundaries', () => {
  it('keeps IND aggregate safety assessment available alongside individual cases', () => {
    const p = buildDocumentPreparation({ registryId: 'US_IND_SR', discussedTopics: ['scope', 'source_versions'] });
    expect(p.questions[0].question).toMatch(/aggregate/);
    expect(p.questions[0].requestedEvidence).toMatch(/comparison|aggregate/);
  });
  it.each(['JP_CTN', 'JP_MF', 'JP_MINOR_CHANGE', 'JP_PRE_CONSULT'])('does not assign the English marketing-application measure to %s', registryId => {
    const p = buildDocumentPreparation({ registryId, discussedTopics: PREPARATION_TOPICS.filter(t => t !== 'local_requirements') });
    expect(p.questions.map(q => q.question).join(' ')).not.toMatch(/English-application/);
    expect(p.regionalEvidenceSources.map(s => s.url)).not.toContain('https://www.pmda.go.jp/files/000270639.pdf');
  });
  it('does not turn an integral-device opinion into a medicines meeting package', () => {
    const p = buildDocumentPreparation({ registryId: 'EU_MDR_ART117_NBOP', discussedTopics: ['scope', 'source_versions'] });
    expect(p.questions[0].topic).toBe('quality');
    expect(p.questions[0].question).toMatch(/device part|integral device/);
    expect(p.questions[0].requestedEvidence).toMatch(/Notified Body/);
  });
  it.each(['US_REMS', 'EU_RMP'])('asks %s about risk controls and their assessment, not just adverse events', registryId => {
    const p = buildDocumentPreparation({ registryId, discussedTopics: ['scope', 'source_versions'] });
    expect(p.questions[0].topic).toBe('safety');
    expect(p.questions[0].question).toMatch(/risk.minimi|risk.control/);
    expect(p.questions[0].requestedEvidence).toMatch(/effectiveness|assessment/);
  });
  it('requires reviewed signal evidence and alternative explanations before concluding a risk', () => {
    const p = buildDocumentPreparation({ registryId: 'ICH_SIGNAL', discussedTopics: ['scope', 'source_versions'] });
    expect(p.questions[0].topic).toBe('safety');
    expect(p.questions[0].question).toMatch(/alternative explanations/);
    expect(p.questions[0].requestedEvidence).toMatch(/medical review/);
  });
});


describe('biotech preparation — existing tool delivery', () => {
  it.each(['US_DMF', 'EU_ASMF', 'CA_MF', 'JP_MF', 'US_IND_AMENDMENT', 'CA_CTA_A', 'US_351K', 'US_PSP', 'EU_PIP', 'EU_ORPHAN', 'ICH_COMPARABILITY', 'ICH_STABILITY_PROTOCOL', 'US_IND_SR'])('delivers the %s inquiry within the existing paged tool budget', async registry_id => {
    const raw = await documentTemplateTool({ registry_id, prepare: true, limit: 30, discussed_topics: ['scope', 'source_versions'] });
    expect(raw.length).toBeLessThanOrEqual(7800);
    const result = JSON.parse(raw);
    expect(result.ok).toBe(true);
    expect(result.preparation.questions.length).toBeLessThanOrEqual(3);
    expect(result.preparation.questions.length).toBeGreaterThan(0);
    expect(result.preparation.questions.every((q: { why: string; requestedEvidence: string }) => q.why && q.requestedEvidence)).toBe(true);
    expect(result.preparation.readiness).toBe('not_assessed');
    expect(result.preparation.evidenceReviewed).toBe(false);
  });
});
