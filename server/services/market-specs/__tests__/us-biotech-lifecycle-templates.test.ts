import { describe, expect, it } from 'vitest';
import { LIFECYCLE_DOCUMENT_TYPES } from '../../ind/ctd/lifecycle-document-types';
import {
  isUsBiotechLifecycleComponent, US_BIOTECH_LIFECYCLE_METADATA, US_BIOTECH_LIFECYCLE_TEMPLATES,
} from '../us-biotech-lifecycle-templates';

const manualCodes: Readonly<Record<string, string[]>> = {
  pre_ind_meeting: ['MTG-ATTEND'], end_of_phase_2_meeting: ['MTG-ATTEND'],
  pre_nda_meeting: ['MTG-ATTEND'], pre_bla_meeting: ['MTG-ATTEND'],
  ind_protocol_amendment: ['FORM-FDA-1571'],
  ind_information_amendment: ['FORM-FDA-1571', 'TECHNICAL-DATA'],
  ind_cmc_amendment: ['FORM-FDA-1571'],
  ind_response_to_clinical_hold: ['FORM-FDA-1571', 'REVISED-DOCUMENTS'],
  cbe_30: ['CBE30-356H', 'CBE30-LABELING'], cbe_0: ['CBE0-356H', 'CBE0-LABELING'],
  iss: ['ISS-EXP', 'ISS-DEMO'], ise: ['ISE-DEMO'],
};

describe('one projection of exact existing FDA lifecycle parts', () => {
  it('retains each source component, guidance, requirements and honest basis without copied trees', () => {
    expect(US_BIOTECH_LIFECYCLE_TEMPLATES).toHaveLength(12);
    for (const outline of US_BIOTECH_LIFECYCLE_TEMPLATES) {
      const recordId = outline.id.replace(/^us_lifecycle_/, '');
      const source = LIFECYCLE_DOCUMENT_TYPES.find(record => record.id === recordId)!;
      expect(source.agency).toBe('FDA');
      expect(outline.title).toBe(source.label);
      expect(outline.sections.map(section => [section.number, section.heading, section.required])).toEqual(
        source.components.map(component => [component.code, component.title, component.required]),
      );
      for (const [index, section] of outline.sections.entries()) {
        expect(section.purpose).toContain(source.components[index].authoringGuidance);
        for (const element of source.components[index].keyContentElements) expect(section.purpose).toContain(element);
      }
      expect(outline.basis).toMatchObject({ confidence: 'recall' });
      expect(outline.basis?.note).toContain('not independently re-read');
      expect(outline.outlineLimitations?.join(' ')).toContain('not a new filing registry identity');
      expect(outline.outlineSource).toEqual({ kind: 'lifecycle-component', record: `LIFECYCLE_DOCUMENT_TYPES:${recordId}` });
    }
  });

  it.each(Object.entries(manualCodes))('retains exact original-source preparation policy for %s', (recordId, codes) => {
    const outline = US_BIOTECH_LIFECYCLE_TEMPLATES.find(row => row.id === `us_lifecycle_${recordId}`)!;
    expect(outline.sections.filter(section => section.drafting_mode === 'manual').map(section => section.number)).toEqual(codes);
    expect(outline.sections.filter(section => section.drafting_mode === 'narrative').length).toBeGreaterThan(0);
    for (const section of outline.sections) {
      expect(section.purpose).toContain(section.drafting_mode === 'manual'
        ? 'AnA does not generate or replace the original' : 'Do not compute or reconstruct statistical outputs');
    }
  });

  it('does not introduce equivalent whole-filing/annual/DSUR/PAS copies or scope arbitrary similar IDs', () => {
    for (const id of ['ind_initial', 'nda', 'bla', 'dsur', 'ind_annual_report', 'nda_bla_annual_report', 'nda_pas']) {
      expect(isUsBiotechLifecycleComponent(`us_lifecycle_${id}`)).toBe(false);
      expect(US_BIOTECH_LIFECYCLE_TEMPLATES.some(outline => outline.id === `us_lifecycle_${id}`)).toBe(false);
    }
    expect(isUsBiotechLifecycleComponent('us_lifecycle_unverified_response')).toBe(false);
    expect(isUsBiotechLifecycleComponent('us_lifecycle_iss')).toBe(true);
    expect(new Set(US_BIOTECH_LIFECYCLE_TEMPLATES.map(outline => outline.id)).size).toBe(12);
    expect(US_BIOTECH_LIFECYCLE_METADATA).toHaveLength(12);
    expect(US_BIOTECH_LIFECYCLE_METADATA.every(metadata => metadata.aiDraftable && metadata.format === 'mixed')).toBe(true);
  });

  it('does not turn PDUFA meeting or NDA CBE records into broader biologics procedures', () => {
    const find = (id: string) => US_BIOTECH_LIFECYCLE_TEMPLATES.find(outline => outline.id === `us_lifecycle_${id}`)!;
    expect(find('pre_bla_meeting').outlineLimitations?.join(' ')).toContain('BsUFA');
    for (const id of ['cbe_30', 'cbe_0']) {
      expect(find(id).outlineLimitations?.join(' ')).toContain('NDA/ANDA record under 21 CFR 314.70');
      expect(find(id).outlineLimitations?.join(' ')).toContain('21 CFR 601.12');
    }
  });
});
