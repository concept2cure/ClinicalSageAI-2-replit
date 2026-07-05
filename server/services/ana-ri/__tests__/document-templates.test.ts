/**
 * Unit tests for the regulatory document template registry.
 *
 * Covers registry integrity, phrase detection, confidence scoring,
 * specificity tie-breaking, and prompt block structure.
 */

import { describe, it, expect } from 'vitest';
import {
  detectDocumentTemplate,
  buildDocumentTemplateBlock,
  DOCUMENT_TEMPLATES,
  type RegulatoryDocumentTemplate,
} from '../document-templates';

// ─── Registry integrity ───────────────────────────────────────────────────────

describe('DOCUMENT_TEMPLATES registry integrity', () => {
  const templates = Object.values(DOCUMENT_TEMPLATES);

  it('has at least 10 registered document types', () => {
    expect(templates.length).toBeGreaterThanOrEqual(10);
  });

  it.each(templates.map((t) => [t.id, t] as [string, RegulatoryDocumentTemplate]))(
    '%s — required fields present',
    (id, t) => {
      expect(t.id, `${id}: id`).toBeTruthy();
      expect(t.displayName, `${id}: displayName`).toBeTruthy();
      expect(t.chipLabel, `${id}: chipLabel`).toBeTruthy();
      expect(t.authority, `${id}: authority`).toBeTruthy();
      expect(t.draftingInstructions, `${id}: draftingInstructions`).toBeTruthy();
      expect(t.detectionPatterns.length, `${id}: detectionPatterns`).toBeGreaterThan(0);
      expect(t.sections.length, `${id}: sections`).toBeGreaterThan(0);
      expect(t.minConfidence).toBeGreaterThan(0);
      expect(t.minConfidence).toBeLessThanOrEqual(1);
    }
  );

  it('every template has at least one required section with heading and guidance', () => {
    for (const t of templates) {
      const required = t.sections.filter((s) => s.required);
      expect(required.length, `${t.id}: required sections`).toBeGreaterThan(0);
      for (const s of t.sections) {
        expect(s.heading, `${t.id}/${s.heading}: heading`).toBeTruthy();
        expect(s.guidance, `${t.id}/${s.heading}: guidance`).toBeTruthy();
      }
    }
  });
});

// ─── Positive matches ─────────────────────────────────────────────────────────

describe('detectDocumentTemplate — positive matches', () => {
  const cases: Array<[string, string, string]> = [
    ['Clinical Overview', 'draft a clinical overview for the NDA', 'ctd_2_5_clinical_overview'],
    ['Clinical Overview section', 'please write section 2.5', 'ctd_2_5_clinical_overview'],
    ['QOS', 'draft the quality overall summary', 'ctd_2_3_qos'],
    ['QOS section ref', 'ctd section 2.3', 'ctd_2_3_qos'],
    ['Nonclinical Overview', 'draft the nonclinical overview 2.4', 'ctd_2_4_nonclinical_overview'],
    ['Efficacy Summary', 'summary of clinical efficacy', 'ctd_2_7_4_efficacy_summary'],
    ['Efficacy Summary section', 'section 2.7.4', 'ctd_2_7_4_efficacy_summary'],
    ['Safety Summary', 'summary of clinical safety', 'ctd_2_7_5_safety_summary'],
    ['CMC Drug Substance', 'cmc drug substance section', 'cmc_drug_substance'],
    ['CMC 3.2.S', 'module 3.2.s drug substance narrative', 'cmc_drug_substance'],
    ['CMC Drug Product', 'cmc drug product section', 'cmc_drug_product'],
    ['CMC 3.2.P', '3.2.p drug product narrative', 'cmc_drug_product'],
    ["Investigator's Brochure", "draft an investigator's brochure", 'ind_investigator_brochure'],
    ['Phase 1 Protocol', 'draft a phase 1 clinical protocol', 'ind_phase1_protocol'],
    ['FIH Protocol', 'first-in-human protocol', 'ind_phase1_protocol'],
    ['510(k) SE', 'draft a 510(k) substantial equivalence statement', 'fda_510k_se_statement'],
    ['PMA SSED', 'pma summary of safety and effectiveness', 'pma_summary_safety_effectiveness'],
    ['CSR', 'draft a clinical study report', 'clinical_study_report'],
    ['DSUR', 'write the dsur for this ind', 'dsur'],
    ['Type B Meeting', 'draft a type b meeting request package', 'fda_type_b_meeting_package'],
    ['EOP2 meeting', 'end of phase 2 meeting', 'fda_type_b_meeting_package'],
    ['PBRER', 'draft a pbrer', 'psur_pbrer'],
    ['Safety Narrative', 'write a safety narrative for this sae', 'safety_narrative'],
    ['FDA IR Response', 'draft an fda information request response', 'fda_information_request_response'],
  ];

  it.each(cases)('%s', (_label, message, expectedId) => {
    const result = detectDocumentTemplate(message);
    expect(result, `Expected match for: "${message}"`).not.toBeNull();
    expect(result!.template.id).toBe(expectedId);
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.matchedPatterns.length).toBeGreaterThan(0);
  });
});

// ─── Negative matches ─────────────────────────────────────────────────────────

describe('detectDocumentTemplate — no match for generic messages', () => {
  const noMatchCases = [
    'What are the risks of this drug?',
    'Can you audit my submission?',
    'Help me improve this section',
    'Run a war game on this protocol',
    'What is the regulatory strategy for our IND?',
    'section',
    'draft',
    'clinical',
  ];

  it.each(noMatchCases)('no match: %s', (message) => {
    expect(detectDocumentTemplate(message)).toBeNull();
  });
});

// ─── Specificity ──────────────────────────────────────────────────────────────

describe('detectDocumentTemplate — specificity', () => {
  it('clinical overview wins when section 2.5 is mentioned', () => {
    expect(detectDocumentTemplate('draft section 2.5 clinical overview')!.template.id)
      .toBe('ctd_2_5_clinical_overview');
  });

  it('efficacy summary wins when section 2.7.4 is mentioned', () => {
    expect(detectDocumentTemplate('section 2.7.4 summary of clinical efficacy')!.template.id)
      .toBe('ctd_2_7_4_efficacy_summary');
  });

  it('CMC drug substance wins when 3.2.S is mentioned', () => {
    expect(detectDocumentTemplate('write the module 3.2.s drug substance section')!.template.id)
      .toBe('cmc_drug_substance');
  });

  it('CMC drug product wins when 3.2.P is mentioned', () => {
    expect(detectDocumentTemplate('draft the 3.2.p drug product narrative')!.template.id)
      .toBe('cmc_drug_product');
  });
});

// ─── buildDocumentTemplateBlock ───────────────────────────────────────────────

describe('buildDocumentTemplateBlock', () => {
  it('returns a non-empty block with required structural elements', () => {
    const detected = detectDocumentTemplate('draft a clinical overview');
    expect(detected).not.toBeNull();
    const block = buildDocumentTemplateBlock(detected!);
    expect(block).toContain('CLINICAL OVERVIEW');
    expect(block).toContain('DRAFTING INSTRUCTIONS');
    expect(block).toContain('REQUIRED DOCUMENT STRUCTURE');
    expect(block).toContain('OUTPUT RULES');
    expect(block).toContain('[PLACEHOLDER]');
  });

  it('includes all required section headings for the matched template', () => {
    const detected = detectDocumentTemplate('draft a clinical overview');
    const block = buildDocumentTemplateBlock(detected!);
    const template = DOCUMENT_TEMPLATES['ctd_2_5_clinical_overview'];
    for (const s of template.sections.filter((s) => s.required)) {
      expect(block).toContain(s.heading);
    }
  });

  it('includes regulatory references when present', () => {
    const detected = detectDocumentTemplate('draft a clinical overview');
    const block = buildDocumentTemplateBlock(detected!);
    expect(block).toContain('KEY REGULATORY REFERENCES');
    expect(block).toContain('ICH M4E');
  });

  it('includes word count targets in the section outline', () => {
    const detected = detectDocumentTemplate('draft a clinical overview');
    const block = buildDocumentTemplateBlock(detected!);
    expect(block).toMatch(/~\d+–\d+ words/);
  });
});
