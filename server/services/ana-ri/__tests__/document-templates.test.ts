/**
 * Unit tests for the regulatory document template registry.
 *
 * Covers:
 *  - detectDocumentTemplate() phrase matching for every registered type
 *  - Confidence scoring and threshold enforcement
 *  - buildDocumentTemplateBlock() output structure
 *  - Registry integrity (all templates have required fields)
 */

import { describe, it, expect } from 'vitest';
import {
  detectDocumentTemplate,
  buildDocumentTemplateBlock,
  DOCUMENT_TEMPLATES,
  type RegulatoryDocumentTemplate,
} from '../document-templates';

// ─────────────────────────────────────────────────────────────────────────────
// Registry integrity
// ─────────────────────────────────────────────────────────────────────────────

describe('DOCUMENT_TEMPLATES registry integrity', () => {
  const templates = Object.values(DOCUMENT_TEMPLATES);

  it('has at least 10 registered document types', () => {
    expect(templates.length).toBeGreaterThanOrEqual(10);
  });

  it.each(templates.map((t) => [t.id, t] as [string, RegulatoryDocumentTemplate]))(
    '%s — has required fields',
    (id, template) => {
      expect(template.id, `${id}: id`).toBeTruthy();
      expect(template.displayName, `${id}: displayName`).toBeTruthy();
      expect(template.chipLabel, `${id}: chipLabel`).toBeTruthy();
      expect(template.authority, `${id}: authority`).toBeTruthy();
      expect(template.submissionFamily, `${id}: submissionFamily`).toBeTruthy();
      expect(template.detectionPatterns.length, `${id}: detectionPatterns`).toBeGreaterThan(0);
      expect(template.draftingInstructions, `${id}: draftingInstructions`).toBeTruthy();
      expect(template.sections.length, `${id}: sections`).toBeGreaterThan(0);
    }
  );

  it.each(templates.map((t) => [t.id, t] as [string, RegulatoryDocumentTemplate]))(
    '%s — every section has heading and guidance',
    (id, template) => {
      for (const section of template.sections) {
        expect(section.heading, `${id}: section heading`).toBeTruthy();
        expect(section.guidance, `${id}: section guidance`).toBeTruthy();
        expect(typeof section.required, `${id}: section.required`).toBe('boolean');
      }
    }
  );

  it('every template has at least one required section', () => {
    for (const template of templates) {
      const requiredSections = template.sections.filter((s) => s.required);
      expect(requiredSections.length, `${template.id}: required sections`).toBeGreaterThan(0);
    }
  });

  it('minConfidence is between 0 and 1 for all templates', () => {
    for (const template of templates) {
      expect(template.minConfidence).toBeGreaterThan(0);
      expect(template.minConfidence).toBeLessThanOrEqual(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectDocumentTemplate — positive matches
// ─────────────────────────────────────────────────────────────────────────────

describe('detectDocumentTemplate — positive matches', () => {
  const cases: Array<[string, string, string]> = [
    ['Clinical Overview 2.5', 'draft a clinical overview for the NDA', 'ctd_2_5_clinical_overview'],
    ['Clinical Overview section ref', 'please write section 2.5', 'ctd_2_5_clinical_overview'],
    ['QOS 2.3', 'draft the quality overall summary', 'ctd_2_3_qos'],
    ['QOS section ref', 'help me with ctd section 2.3', 'ctd_2_3_qos'],
    ['Nonclinical Overview', 'draft the nonclinical overview section 2.4', 'ctd_2_4_nonclinical_overview'],
    ['Efficacy Summary 2.7.4', 'write a summary of clinical efficacy', 'ctd_2_7_4_efficacy_summary'],
    ['Efficacy Summary section', 'section 2.7.4', 'ctd_2_7_4_efficacy_summary'],
    ['Safety Summary 2.7.5', 'write a summary of clinical safety', 'ctd_2_7_5_safety_summary'],
    ['Safety Summary aggregate', 'help with aggregate safety reporting', 'ctd_2_7_5_safety_summary'],
    ['CMC Drug Substance', 'draft the cmc drug substance section', 'cmc_drug_substance'],
    ['CMC Drug Substance 3.2.S', 'module 3.2.s drug substance narrative', 'cmc_drug_substance'],
    ['CMC Drug Product', 'help with the cmc drug product section', 'cmc_drug_product'],
    ['CMC Drug Product 3.2.P', '3.2.p drug product narrative', 'cmc_drug_product'],
    ["Investigator's Brochure", "draft an investigator's brochure", 'ind_investigator_brochure'],
    ['IB short form', "write an ib draft", 'ind_investigator_brochure'],
    ['Phase 1 Protocol', 'draft a phase 1 clinical protocol', 'ind_phase1_protocol'],
    ['FIH Protocol', 'first-in-human protocol', 'ind_phase1_protocol'],
    ['510(k) SE Statement', 'draft a 510(k) substantial equivalence statement', 'fda_510k_se_statement'],
    ['510(k) summary', 'create a 510k summary', 'fda_510k_se_statement'],
    ['PMA SSED', 'draft the pma summary of safety and effectiveness', 'pma_summary_safety_effectiveness'],
    ['CSR', 'draft a clinical study report', 'clinical_study_report'],
    ['CSR short', 'write a csr outline', 'clinical_study_report'],
    ['DSUR', 'write the dsur for this ind', 'dsur'],
    ['DSUR full', 'development safety update report', 'dsur'],
    ['Type B Meeting', 'draft a type b meeting request package', 'fda_type_b_meeting_package'],
    ['EOP meeting', 'end of phase 2 meeting', 'fda_type_b_meeting_package'],
    ['PBRER', 'draft a pbrer', 'psur_pbrer'],
    ['PSUR', 'write the psur', 'psur_pbrer'],
    ['Safety Narrative', 'write a safety narrative for this sae', 'safety_narrative'],
    ['Patient narrative', 'write a patient narrative', 'safety_narrative'],
    ['FDA IR Response', 'draft an fda information request response', 'fda_information_request_response'],
  ];

  it.each(cases)('%s', (_label, message, expectedId) => {
    const result = detectDocumentTemplate(message);
    expect(result, `Expected a match for: "${message}"`).not.toBeNull();
    expect(result!.template.id).toBe(expectedId);
    expect(result!.confidence).toBeGreaterThan(0);
    expect(result!.matchedPatterns.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectDocumentTemplate — negative matches (generic messages)
// ─────────────────────────────────────────────────────────────────────────────

describe('detectDocumentTemplate — no match for generic messages', () => {
  const noMatchCases = [
    'What are the risks of this drug?',
    'Can you audit my submission?',
    'Help me improve this section',
    'What does the FDA think about our endpoint?',
    'Summarize the conversation so far',
    'Run a war game on this protocol',
    'What is the regulatory strategy for our IND?',
    // Short messages with partial words that should not trigger
    'section',
    'draft',
    'clinical',
  ];

  it.each(noMatchCases)('no match: %s', (message) => {
    const result = detectDocumentTemplate(message);
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectDocumentTemplate — specificity (more specific match wins)
// ─────────────────────────────────────────────────────────────────────────────

describe('detectDocumentTemplate — specificity', () => {
  it('clinical overview wins over generic clinical safety when both could match', () => {
    const result = detectDocumentTemplate('draft a clinical overview section 2.5 for the NDA');
    expect(result!.template.id).toBe('ctd_2_5_clinical_overview');
  });

  it('efficacy summary wins when section 2.7.4 is mentioned', () => {
    const result = detectDocumentTemplate('help me with section 2.7.4 summary of clinical efficacy');
    expect(result!.template.id).toBe('ctd_2_7_4_efficacy_summary');
  });

  it('CMC drug substance wins over drug product when 3.2.S is mentioned', () => {
    const result = detectDocumentTemplate('write the module 3.2.s drug substance section');
    expect(result!.template.id).toBe('cmc_drug_substance');
  });

  it('CMC drug product wins when 3.2.P is mentioned', () => {
    const result = detectDocumentTemplate('draft the 3.2.p drug product narrative');
    expect(result!.template.id).toBe('cmc_drug_product');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildDocumentTemplateBlock — output structure
// ─────────────────────────────────────────────────────────────────────────────

describe('buildDocumentTemplateBlock', () => {
  it('returns a non-empty string', () => {
    const detected = detectDocumentTemplate('draft a clinical overview');
    expect(detected).not.toBeNull();
    const block = buildDocumentTemplateBlock(detected!);
    expect(block.length).toBeGreaterThan(100);
  });

  it('includes the document type in the header', () => {
    const detected = detectDocumentTemplate('draft a clinical overview');
    const block = buildDocumentTemplateBlock(detected!);
    expect(block).toContain('CLINICAL OVERVIEW');
  });

  it('includes DRAFTING INSTRUCTIONS', () => {
    const detected = detectDocumentTemplate('draft the quality overall summary');
    const block = buildDocumentTemplateBlock(detected!);
    expect(block).toContain('DRAFTING INSTRUCTIONS');
  });

  it('includes REQUIRED DOCUMENT STRUCTURE', () => {
    const detected = detectDocumentTemplate('draft a clinical study report');
    const block = buildDocumentTemplateBlock(detected!);
    expect(block).toContain('REQUIRED DOCUMENT STRUCTURE');
  });

  it('includes OUTPUT RULES', () => {
    const detected = detectDocumentTemplate('draft a clinical overview');
    const block = buildDocumentTemplateBlock(detected!);
    expect(block).toContain('OUTPUT RULES');
    expect(block).toContain('[PLACEHOLDER]');
  });

  it('lists all required section headings', () => {
    const detected = detectDocumentTemplate('draft a clinical overview');
    const block = buildDocumentTemplateBlock(detected!);
    const template = DOCUMENT_TEMPLATES['ctd_2_5_clinical_overview'];
    for (const section of template.sections.filter((s) => s.required)) {
      expect(block).toContain(section.heading);
    }
  });

  it('includes regulatory references when present', () => {
    const detected = detectDocumentTemplate('draft a clinical overview');
    const block = buildDocumentTemplateBlock(detected!);
    expect(block).toContain('KEY REGULATORY REFERENCES');
    expect(block).toContain('ICH M4E');
  });

  it('includes authority and submission family', () => {
    const detected = detectDocumentTemplate('draft the cmc drug substance section');
    const block = buildDocumentTemplateBlock(detected!);
    expect(block).toContain('ICH');
    expect(block).toContain('NDA/BLA/MAA/IND');
  });

  it('includes word count targets in required sections', () => {
    const detected = detectDocumentTemplate('draft a clinical overview');
    const block = buildDocumentTemplateBlock(detected!);
    // Clinical Overview 2.5.1 has targetWords [400, 700]
    expect(block).toMatch(/~\d+–\d+ words/);
  });
});
