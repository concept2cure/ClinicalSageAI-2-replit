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

  it('does not let optional documents block readiness', () => {
    // 510(k): biocompatibility is optional; provide the required set only.
    const k = getRequirements('510k')!;
    const a = assessRequirements('510k', {
      templateIds: k.requiredDocuments.filter((d) => d.required && d.templateId).map((d) => d.templateId!),
      documentNames: k.requiredDocuments.filter((d) => d.required && !d.templateId).map((d) => d.name),
      forms: k.requiredForms,
    })!;
    expect(a.ready).toBe(true);
  });

  it('returns undefined for an unknown submission type', () => {
    expect(assessRequirements('nope', {})).toBeUndefined();
  });
});
