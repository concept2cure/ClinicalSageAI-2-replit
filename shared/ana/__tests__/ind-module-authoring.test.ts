/**
 * Unit tests for the shared IND narrative-module authoring core (E11): the CTD
 * Module 2.5 / 2.7 templates, the required_strings derivation from structured
 * source facts/figures (which CATCHES a missing/mistyped figure), the
 * authored-plan/verification pass-fail, and the 21 CFR Part 11 honesty contract
 * (sample/not_assessed sources are non-sealable).
 */
import { describe, it, expect } from 'vitest';
import {
  IND_MODULE_TEMPLATES,
  listIndModules,
  deriveIndRequiredStrings,
  buildIndModuleAuthoringPlan,
  evaluateIndModuleVerification,
  assessIndModuleSealability,
  type IndSourceFact,
} from '../ind-module-authoring';

const FACTS: IndSourceFact[] = [
  { sectionId: 'overview_efficacy', label: 'Primary endpoint ORR', value: '42.3%', source: 'TLF Table 14.2.1' },
  { sectionId: 'overview_safety', label: 'Median exposure', value: '24 months', source: 'ADSL' },
  { sectionId: 'overview_clinical_pharmacology', label: 'Recommended dose', value: '200 mg', source: 'PK report' },
];

describe('IND module templates', () => {
  it('exposes the 2.5 and 2.7 CTD Module 2 templates', () => {
    expect(listIndModules().sort()).toEqual(['2.5', '2.7']);
    expect(IND_MODULE_TEMPLATES['2.5'].length).toBeGreaterThan(0);
    expect(IND_MODULE_TEMPLATES['2.7'].length).toBeGreaterThan(0);
    // Section ids are unique within a module.
    for (const mod of listIndModules()) {
      const ids = IND_MODULE_TEMPLATES[mod].map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('deriveIndRequiredStrings — figures become required strings', () => {
  it('includes every section header AND every source figure value', () => {
    const required = deriveIndRequiredStrings({ module: '2.5', facts: FACTS });
    // Each section header present.
    for (const section of IND_MODULE_TEMPLATES['2.5']) {
      expect(required).toContain(section.header);
    }
    // Each figure value present — the transcription-fidelity anchor.
    expect(required).toContain('42.3%');
    expect(required).toContain('24 months');
    expect(required).toContain('200 mg');
  });

  it('de-duplicates and normalizes figure whitespace', () => {
    const required = deriveIndRequiredStrings({
      module: '2.5',
      facts: [
        { sectionId: 'overview_efficacy', label: 'ORR', value: '  42.3%  ' },
        { sectionId: 'overview_safety', label: 'ORR (dup)', value: '42.3%' },
      ],
    });
    expect(required.filter((s) => s === '42.3%')).toHaveLength(1);
  });
});

describe('buildIndModuleAuthoringPlan + verification', () => {
  it('verifies clean when every figure is transcribed verbatim', () => {
    const plan = buildIndModuleAuthoringPlan({
      module: '2.5',
      productName: 'ABC-123',
      indication: 'relapsed/refractory AML',
      facts: FACTS,
      provenance: 'live',
    });
    expect(plan.title).toContain('IND Module 2.5');
    expect(plan.content).toContain('42.3%');
    const verification = evaluateIndModuleVerification({
      documentText: plan.content,
      requiredStrings: plan.requiredStrings,
    });
    expect(verification.ok).toBe(true);
    expect(verification.missingRequiredStrings).toEqual([]);
  });

  it('CATCHES a mistyped figure: the source value is missing from a corrupted document', () => {
    const plan = buildIndModuleAuthoringPlan({
      module: '2.5',
      productName: 'ABC-123',
      indication: 'relapsed/refractory AML',
      facts: FACTS,
      provenance: 'live',
    });
    // Simulate a transcription error in the authored prose: "24 months" → "12 months".
    const corrupted = plan.content.replace('24 months', '12 months');
    const verification = evaluateIndModuleVerification({
      documentText: corrupted,
      requiredStrings: plan.requiredStrings,
    });
    expect(verification.ok).toBe(false);
    expect(verification.missingRequiredStrings).toContain('24 months');
  });

  it('CATCHES a missing figure: an omitted figure fails verification', () => {
    const plan = buildIndModuleAuthoringPlan({
      module: '2.5',
      productName: 'ABC-123',
      indication: 'relapsed/refractory AML',
      facts: FACTS,
      provenance: 'live',
    });
    const withoutDose = plan.content.replace('200 mg', '[omitted]');
    const verification = evaluateIndModuleVerification({
      documentText: withoutDose,
      requiredStrings: plan.requiredStrings,
    });
    expect(verification.ok).toBe(false);
    expect(verification.missingRequiredStrings).toContain('200 mg');
  });
});

describe('IND module honesty contract — sealability', () => {
  const cleanVerification = { ok: true, requiredStringsChecked: 9, missingRequiredStrings: [] };

  it('a live source with clean verification is sealable', () => {
    expect(assessIndModuleSealability({ provenance: 'live', verification: cleanVerification }).sealable).toBe(true);
  });

  it('a sample source is NEVER sealable', () => {
    const verdict = assessIndModuleSealability({ provenance: 'sample', verification: cleanVerification });
    expect(verdict.sealable).toBe(false);
    expect(verdict.blockers.join(' ')).toMatch(/sample/i);
  });

  it('a not_assessed source is NEVER sealable', () => {
    expect(assessIndModuleSealability({ provenance: 'not_assessed', verification: cleanVerification }).sealable).toBe(false);
  });

  it('a failed verification (missing/mistyped figure) blocks sealing even when live', () => {
    const verdict = assessIndModuleSealability({
      provenance: 'live',
      verification: { ok: false, requiredStringsChecked: 9, missingRequiredStrings: ['24 months'] },
    });
    expect(verdict.sealable).toBe(false);
    expect(verdict.blockers.join(' ')).toMatch(/missing or mistyped figure/i);
  });
});
