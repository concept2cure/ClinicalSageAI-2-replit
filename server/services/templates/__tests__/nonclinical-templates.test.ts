/**
 * Unit tests for the nonclinical/clin-pharm document templates.
 * Pure data module — no mocks.
 */

import { describe, it, expect } from 'vitest';

import {
  nonclinicalTemplates,
  getNonclinicalTemplate,
  listNonclinicalTemplates,
} from '../nonclinical-templates';

describe('nonclinical templates', () => {
  it('covers the Module 4 study reports, M2.6, and FIH dose justification', () => {
    const sections = nonclinicalTemplates.map(t => t.sectionCode);
    expect(sections).toEqual(expect.arrayContaining(['4.2.1', '4.2.2', '4.2.3', '2.6']));
    expect(nonclinicalTemplates.some(t => t.granule_id === 'fih-dose-justification')).toBe(true);
  });

  it('looks up a template by granule id and by section code', () => {
    expect(getNonclinicalTemplate('m4-2-3-toxicology')?.sectionCode).toBe('4.2.3');
    expect(getNonclinicalTemplate('4.2.3')?.granule_id).toBe('m4-2-3-toxicology');
    expect(getNonclinicalTemplate('nope')).toBeUndefined();
  });

  it('toxicology template scaffolds the key tox endpoints', () => {
    const content = getNonclinicalTemplate('4.2.3')!.content;
    for (const token of ['[NOAEL]', '[TARGET_ORGAN_FINDINGS]', '[GLP_STATUS]', '[SAFETY_MARGIN]']) {
      expect(content).toContain(token);
    }
  });

  it('FIH template scaffolds both the MRSD and MABEL derivations', () => {
    const content = getNonclinicalTemplate('fih-dose-justification')!.content;
    expect(content).toMatch(/HED/);
    expect(content).toMatch(/MRSD/);
    expect(content).toMatch(/MABEL/);
  });

  it('lists template metadata', () => {
    const list = listNonclinicalTemplates();
    expect(list.length).toBe(nonclinicalTemplates.length);
    expect(list[0]).toHaveProperty('granule_id');
    expect(list[0]).toHaveProperty('sectionCode');
  });
});
