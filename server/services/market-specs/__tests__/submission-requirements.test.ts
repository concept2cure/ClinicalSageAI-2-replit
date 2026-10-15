/**
 * Tests for the submission requirements matrix — proves the per-type required
 * documents/forms are consistent and that the gap assessment is deterministic.
 */
import { describe, it, expect } from 'vitest';
import {
  SUBMISSION_REQUIREMENTS,
  getRequirements,
  submissionTypes,
  assessRequirements,
} from '../submission-requirements';
import { getDocumentTemplate } from '../document-template-library';
import * as estar from '../../pathway-engines/estar/estar-mapper';

describe('submission requirements — consistency', () => {
  it('has unique types, required fields, and at least one required document each', () => {
    const types = submissionTypes();
    expect(new Set(types).size).toBe(types.length);
    for (const r of SUBMISSION_REQUIREMENTS) {
      expect(r.label).toBeTruthy();
      expect(r.basis).toBeTruthy();
      expect(r.requiredDocuments.some((d) => d.required)).toBe(true);
    }
  });

  it('every referenced templateId resolves in the document template library', () => {
    for (const r of SUBMISSION_REQUIREMENTS) {
      for (const d of r.requiredDocuments) {
        if (d.templateId) {
          expect(getDocumentTemplate(d.templateId), `${r.submissionType} → ${d.templateId} missing`).toBeTruthy();
        }
      }
    }
  });

  it('covers the major submission types', () => {
    for (const t of ['ind', 'nda', 'bla', '510k', 'de_novo', 'maa', 'cta', 'jnda', 'mdr_td', 'ivdr_td']) {
      expect(getRequirements(t), `${t} missing`).toBeTruthy();
    }
  });
});

describe('submission requirements — gap assessment', () => {
  it('reports ready when all required documents and forms are present', () => {
    const nda = getRequirements('nda')!;
    const a = assessRequirements('nda', {
      templateIds: nda.requiredDocuments.filter((d) => d.required && d.templateId).map((d) => d.templateId!),
      documentNames: nda.requiredDocuments.filter((d) => d.required && !d.templateId).map((d) => d.name),
      forms: nda.requiredForms,
    })!;
    expect(a.ready).toBe(true);
    expect(a.missingDocuments).toHaveLength(0);
    expect(a.missingForms).toHaveLength(0);
    expect(a.presentRequiredCount).toBe(a.totalRequiredCount);
  });

  it('reports the specific missing required documents and forms', () => {
    const a = assessRequirements('nda', { templateIds: ['quality_overall_summary'] })!;
    expect(a.ready).toBe(false);
    expect(a.missingDocuments).toContain('Clinical Overview (2.5)');
    expect(a.missingForms).toContain('FDA 356h');
  });

  it('does not let not-applicable documents block readiness once every deciding fact is known', () => {
    /* Amended (g-510k-requirements-from-estar). This test used to pin
       biocompatibility as optional for every 510(k) — the defect: the eSTAR
       mapper requires it for every device (patient contact is not an intake
       flag), so a readiness surface that dropped it under-asked. What stays true
       is narrower: a conditional section whose flag is answered "no" does not
       block, and a section nobody can decide from the flags never blocks. */
    const k = getRequirements('510k')!;
    const a = assessRequirements('510k', {
      templateIds: k.requiredDocuments.filter((d) => d.required && d.templateId).map((d) => d.templateId!),
      documentNames: k.requiredDocuments.filter((d) => d.required && !d.templateId).map((d) => d.name),
      forms: k.requiredForms,
      flags: ALL_FLAGS_NO,
    })!;
    expect(a.missingDocuments).toEqual([]);
    expect(a.undetermined).toEqual([]);
    expect(a.ready).toBe(true);
    expect(k.requiredDocuments.find((d) => /biocompatib/i.test(d.name))?.required).toBe(true);
  });

  it('returns undefined for an unknown submission type', () => {
    expect(assessRequirements('nope', {})).toBeUndefined();
  });
});

/* ── 510(k) and De Novo come from the eSTAR slot registry ────────────────────
 * The hand-written 510k and de_novo rows omitted proposed labeling, the
 * Indications for Use, the Truthful and Accurate Statement and the user fee,
 * and marked biocompatibility optional — while the canonical eSTAR registry
 * (server/services/pathway-engines/estar/estar-mapper.ts) requires every one.
 * The probe below is a 510(k) with none of them; it read ready:true.
 */
const ALL_FLAGS_NO = {
  sterile: false, softwareAiMl: false, cyberDevice: false, clinicalData: false,
  combinationProduct: false, implantable: false, cliaWaived: false,
} as const;

const PROBE_510K = {
  templateIds: ['cover_letter', 'k510_summary'],
  documentNames: [
    'Device description',
    'Substantial equivalence / predicate comparison',
    'Performance testing (bench / clinical as applicable)',
  ],
  forms: ['eSTAR 510(k) template'],
};

describe('submission requirements — 510(k) and De Novo derive from the eSTAR registry', () => {
  it('a 510(k) with no labeling, IFU, T&A statement, biocompatibility or user fee is not ready', () => {
    const a = assessRequirements('510k', PROBE_510K)!;
    expect(a.ready).toBe(false);
    const missing = a.missingDocuments.join(' | ');
    expect(missing).toMatch(/Indications for use/i);
    expect(missing).toMatch(/Proposed labeling/i);
    expect(missing).toMatch(/Truthful and Accurate/i);
    expect(missing).toMatch(/Biocompatibility/i);
    expect(a.missingForms).toContain('FDA 3601');
  });

  it('the same gaps hold for a De Novo request', () => {
    const a = assessRequirements('de_novo', {
      templateIds: ['cover_letter'],
      documentNames: ['Device description', 'Performance testing'],
      forms: ['eSTAR De Novo template'],
    })!;
    expect(a.ready).toBe(false);
    const missing = a.missingDocuments.join(' | ');
    expect(missing).toMatch(/Indications for use/i);
    expect(missing).toMatch(/Proposed labeling/i);
    expect(missing).toMatch(/Truthful and Accurate/i);
    expect(missing).toMatch(/special controls/i);
    expect(a.missingForms).toContain('FDA 3601');
  });

  it.each(['510k', 'de_novo'] as const)('every always-slot of the %s eSTAR registry is a required row, and nothing else is', (type) => {
    expect(typeof estar.estarSlots).toBe('function');
    const slots = estar.estarSlots(type);
    const rows = getRequirements(type)!.requiredDocuments;
    // One row per slot, each naming its slot — no hand-listed rows beside them.
    expect(rows.map((r) => r.estarSlotId)).toEqual(slots.map((s) => s.id));
    for (const s of slots) {
      const row = rows.find((r) => r.estarSlotId === s.id)!;
      expect(row.name).toBe(s.label);
      expect(row.required).toBe(s.necessity === 'always');
      expect(row.necessity).toBe(s.necessity);
      expect(row.authority).toBe(s.authority);
      if (s.necessity === 'conditional') expect(row.flag).toBe(s.flag);
      if (s.necessity === 'when-applicable') expect(row.appliesWhen).toBe(s.appliesWhen);
    }
  });

  it.each(['510k', 'de_novo'] as const)('%s is filed as an eSTAR through the CDRH Portal, with the FDA 3601 user fee', (type) => {
    const forms = getRequirements(type)!.requiredForms;
    expect(forms).toEqual(['eSTAR (submitted via CDRH Portal)', 'FDA 3601']);
  });

  it('a 510(k) Statement satisfies the summary-or-statement requirement, and so does the summary template', () => {
    const row = '510(k) Summary or 510(k) Statement';
    const byStatement = assessRequirements('510k', { documentNames: ['510(k) Statement'] })!;
    expect(byStatement.missingDocuments).not.toContain(row);
    const bySummary = assessRequirements('510k', { templateIds: ['k510_summary'] })!;
    expect(bySummary.missingDocuments).not.toContain(row);
    const neither = assessRequirements('510k', { documentNames: ['Device description'] })!;
    expect(neither.missingDocuments).toContain(row);
  });

  it('an unanswered device flag is undetermined and keeps ready false', () => {
    const k = getRequirements('510k')!;
    const everyAlways = {
      templateIds: k.requiredDocuments.filter((d) => d.required && d.templateId).map((d) => d.templateId!),
      documentNames: k.requiredDocuments.filter((d) => d.required && !d.templateId).map((d) => d.name),
      forms: k.requiredForms,
    };
    const a = assessRequirements('510k', everyAlways)!;
    expect(a.missingDocuments).toEqual([]);
    expect(a.ready).toBe(false);
    expect(a.undetermined.join(' | ')).toMatch(/Sterilization/);
    expect(a.undetermined.join(' | ')).toMatch(/Cybersecurity/);
  });

  it('a conditional section becomes required when its flag is set', () => {
    const k = getRequirements('510k')!;
    const a = assessRequirements('510k', {
      templateIds: k.requiredDocuments.filter((d) => d.required && d.templateId).map((d) => d.templateId!),
      documentNames: k.requiredDocuments.filter((d) => d.required && !d.templateId).map((d) => d.name),
      forms: k.requiredForms,
      flags: { ...ALL_FLAGS_NO, sterile: true },
    })!;
    expect(a.ready).toBe(false);
    expect(a.missingDocuments).toEqual(['Sterilization, shelf life and packaging validation']);
    expect(a.totalRequiredCount).toBe(a.presentRequiredCount + 1);
  });

  it('an IVD 510(k) is held to the IVD registry: no analytical performance, not ready', () => {
    const k = getRequirements('510k')!;
    const a = assessRequirements('510k', {
      templateIds: k.requiredDocuments.filter((d) => d.required && d.templateId).map((d) => d.templateId!),
      documentNames: k.requiredDocuments.filter((d) => d.required && !d.templateId).map((d) => d.name),
      forms: k.requiredForms,
      flags: ALL_FLAGS_NO,
      variant: 'ivd',
    })!;
    expect(a.ready).toBe(false);
    expect(a.missingDocuments.join(' | ')).toMatch(/Analytical performance/);
  });
});
