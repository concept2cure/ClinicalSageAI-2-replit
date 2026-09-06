/**
 * Filing placement — where each statistical deliverable goes for each filing.
 *
 * The property that matters is totality: every deliverable × every application
 * type the Submission Center can file resolves to a placement with a heading,
 * and a deliverable that is not a submission document says so instead of being
 * mapped "somewhere". The vocabulary is pinned to APPLICATION_TYPES so a new
 * filing type cannot appear in the product without a row here.
 */
import { describe, expect, it } from 'vitest';

import { APPLICATION_TYPES } from '../../../../shared/types/submission-constants';
import {
  APPLICATION_TYPE_VALUES,
  BACKBONE_FOR_APPLICATION,
  STATISTICAL_DELIVERABLES,
  applicationTypeForProgramType,
  authoringModuleFor,
  isApplicationType,
  placementFor,
  placementsForApplication,
} from '../filing-placement';

describe('vocabulary', () => {
  it('mirrors APPLICATION_TYPES from the shared submission contract exactly', () => {
    expect([...APPLICATION_TYPE_VALUES].sort()).toEqual(APPLICATION_TYPES.map((c) => c.value).sort());
  });

  it('covers every StatisticalDocumentType the biostatistics engine can generate', () => {
    // The union has 14 members; a new document type must be placed here too.
    expect(STATISTICAL_DELIVERABLES).toHaveLength(14);
    expect(new Set(STATISTICAL_DELIVERABLES).size).toBe(14);
  });
});

describe('totality — every pair resolves', () => {
  for (const app of APPLICATION_TYPE_VALUES) {
    it(`${app}: every deliverable has a placement with a heading and the right backbone`, () => {
      const all = placementsForApplication(app);
      expect(all).toHaveLength(STATISTICAL_DELIVERABLES.length);
      for (const p of all) {
        expect(p.heading.length).toBeGreaterThan(10);
        expect(p.note.length).toBeGreaterThan(10);
        expect(p.backbone).toBe(BACKBONE_FOR_APPLICATION[app]);
        if (p.required === 'not_applicable') expect(p.code).toBeNull();
        else expect(p.code).toBeTruthy();
        // A CTD module is only meaningful on the eCTD backbone.
        if (p.backbone !== 'ectd') expect(p.module).toBeNull();
        if (p.backbone === 'ectd' && p.required !== 'not_applicable') expect(p.module).toMatch(/^M[1-5]$/);
      }
      // Filed deliverables sort ahead of unfiled ones.
      const grades = all.map((p) => p.required);
      const firstNa = grades.indexOf('not_applicable');
      if (firstNa >= 0) expect(grades.slice(firstNa).every((g) => g === 'not_applicable')).toBe(true);
    });
  }
});

describe('the placements a reviewer would check', () => {
  it('internal working papers are never filed, for any application', () => {
    for (const app of APPLICATION_TYPE_VALUES) {
      for (const d of ['statistical_risk_memo', 'design_assumption_note', 'scenario_comparison_brief'] as const) {
        const p = placementFor(d, app);
        expect(p.required).toBe('not_applicable');
        expect(p.module).toBeNull();
        expect(authoringModuleFor(d, app)).toBeNull();
      }
    }
  });

  it('the SAP files with the CSR under 5.3.5.1 for an NDA/BLA/MAA, and in the PMA clinical section', () => {
    for (const app of ['nda', 'bla', 'maa'] as const) {
      expect(placementFor('full_statistical_analysis_plan', app)).toMatchObject({ required: 'required', code: '5.3.5.1', module: 'M5', backbone: 'ectd' });
    }
    expect(placementFor('full_statistical_analysis_plan', 'pma')).toMatchObject({ required: 'required', backbone: 'estar', module: null });
    expect(placementFor('full_statistical_analysis_plan', 'ind').required).toBe('expected');
  });

  it('the cross-study statistical summary is a Module 2.7.3 document, not Module 5 — and does not exist at IND', () => {
    expect(placementFor('submission_statistical_note', 'nda')).toMatchObject({ code: '2.7.3', module: 'M2', required: 'required' });
    expect(placementFor('submission_statistical_note', 'anda')).toMatchObject({ code: '2.7.1', module: 'M2' });
    expect(placementFor('submission_statistical_note', 'ind').required).toBe('not_applicable');
    expect(placementFor('submission_statistical_note', 'cta').required).toBe('not_applicable');
  });

  it('a CTA files on CTIS Part I, never eCTD', () => {
    expect(placementFor('protocol_statistical_section', 'cta')).toMatchObject({ backbone: 'ctis', code: 'part-i.protocol', required: 'required', module: null });
  });

  it('authoringModuleFor replaces the surface\'s blanket M5', () => {
    expect(authoringModuleFor('full_statistical_analysis_plan', 'nda')).toBe('M5');
    expect(authoringModuleFor('submission_statistical_note', 'nda')).toBe('M2');
    expect(authoringModuleFor('statistical_reviewer_response', 'bla')).toBe('M1');
    expect(authoringModuleFor('full_statistical_analysis_plan', '510k')).toBeNull(); // eSTAR, not CTD
    expect(authoringModuleFor('full_statistical_analysis_plan', null)).toBeNull();
  });

  it('maps regulatory_programs.program_type to an application type, and refuses a CER', () => {
    expect(applicationTypeForProgramType('DE_NOVO')).toBe('de_novo');
    expect(applicationTypeForProgramType('510K')).toBe('510k');
    expect(applicationTypeForProgramType('ind')).toBe('ind');
    expect(applicationTypeForProgramType('CER')).toBeNull();
    expect(applicationTypeForProgramType(undefined)).toBeNull();
    expect(isApplicationType('nda')).toBe(true);
    expect(isApplicationType('rocket')).toBe(false);
  });
});
