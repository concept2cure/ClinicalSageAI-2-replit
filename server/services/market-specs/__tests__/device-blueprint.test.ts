/**
 * Tests for the device submission blueprint — proves the orchestrator assembles
 * classification + requirements + applicable evidence modules + reviewer checklist
 * and derives applicability deterministically from the device facts.
 */
import { describe, it, expect } from 'vitest';
import { buildDeviceBlueprint } from '../device-blueprint';

describe('device blueprint — 510(k) software implant', () => {
  const bp = buildDeviceBlueprint({
    submissionType: '510k',
    classification: { framework: 'fda', facts: { fdaClass: 'II', predicateAvailable: true } },
    contact: { nature: 'implant_tissue_bone', duration: 'long_term' },
    software: { applicable: true, canContributeToNonSeriousInjury: true },
  });

  it('recommends the 510(k) pathway from FDA facts', () => {
    expect((bp.classification as { pathway: string }).pathway).toBe('510k');
  });

  it('pulls the 510(k) required documents and forms', () => {
    expect(bp.requiredForms).toContain('eSTAR 510(k) template');
    expect(bp.requiredDocuments.some((d) => d.templateId === 'k510_summary')).toBe(true);
  });

  it('marks risk management, biocompatibility and software applicable (CER/PER not)', () => {
    const applicable = new Set(bp.evidenceModules.filter((m) => m.applicable).map((m) => m.id));
    expect(applicable).toContain('risk_management');
    expect(applicable).toContain('biocompatibility');
    expect(applicable).toContain('software');
    expect(applicable).not.toContain('clinical_evaluation');
    expect(applicable).not.toContain('performance_evaluation');
  });

  it('classifies software Class B with architecture (not detailed design)', () => {
    const sw = bp.evidenceModules.find((m) => m.id === 'software')!.detail as { classification: { class: string }; deliverables: Array<{ id: string }> };
    expect(sw.classification.class).toBe('B');
    expect(sw.deliverables.map((d) => d.id)).toContain('architecture');
    expect(sw.deliverables.map((d) => d.id)).not.toContain('detailed_design');
  });

  it('includes the biocompatibility endpoints for a permanent implant', () => {
    const bio = bp.evidenceModules.find((m) => m.id === 'biocompatibility')!.detail as { endpoints: Array<{ id: string }> };
    expect(bio.endpoints.map((e) => e.id)).toEqual(expect.arrayContaining(['implantation', 'carcinogenicity']));
  });

  it('attaches the FDA 510(k) reviewer checklist', () => {
    expect(bp.reviewer.reviewer).toMatch(/510\(k\)/);
    expect(bp.reviewer.questionCount).toBeGreaterThan(0);
    expect(bp.reviewer.criticalCount).toBeGreaterThan(0);
  });
});

describe('device blueprint — EU MDR technical file', () => {
  const bp = buildDeviceBlueprint({
    submissionType: 'mdr_td',
    classification: { framework: 'mdr', facts: { implantable: true } },
    present: { cerSectionIds: ['summary', 'scope'], rmfSectionIds: ['plan'] },
  });

  it('classifies the device IIb (implantable)', () => {
    expect((bp.classification as { class: string }).class).toBe('IIb');
  });

  it('marks clinical evaluation applicable and gap-checks it', () => {
    const cer = bp.evidenceModules.find((m) => m.id === 'clinical_evaluation')!;
    expect(cer.applicable).toBe(true);
    expect((cer.detail as { ready: boolean }).ready).toBe(false);
  });

  it('uses the Notified Body CER reviewer checklist', () => {
    expect(bp.reviewer.reviewer).toMatch(/Notified Body/);
  });

  it('evidenceReady is false while assessed modules are incomplete', () => {
    expect(bp.evidenceReady).toBe(false);
  });
});

describe('device blueprint — IVDR companion diagnostic', () => {
  const bp = buildDeviceBlueprint({
    submissionType: 'ivdr_td',
    classification: { framework: 'ivdr', facts: { companionDiagnostic: true } },
  });

  it('classifies the IVD Class C', () => {
    expect((bp.classification as { class: string }).class).toBe('C');
  });
  it('marks performance evaluation applicable (not clinical evaluation)', () => {
    const applicable = new Set(bp.evidenceModules.filter((m) => m.applicable).map((m) => m.id));
    expect(applicable).toContain('performance_evaluation');
    expect(applicable).not.toContain('clinical_evaluation');
  });
});
