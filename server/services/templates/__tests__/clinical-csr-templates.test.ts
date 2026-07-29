/**
 * Unit tests for the Module 5 / Clinical Study Report template library.
 * Pure data + lookups — no DB, no network.
 */

import { describe, it, expect } from 'vitest';
import {
  clinicalTemplates,
  getClinicalTemplate,
  listClinicalTemplates,
} from '../clinical-csr-templates';

describe('clinical-csr-templates', () => {
  it('ships the Module 5 refuse-to-file scaffolds (CSR, synopsis, ISS, ISE, protocol)', () => {
    const granules = clinicalTemplates.map(t => t.granule_id);
    expect(granules).toEqual(
      expect.arrayContaining([
        'm5-3-5-1-csr',
        'm5-3-5-1-csr-synopsis',
        'm5-3-5-3-iss',
        'm5-3-5-3-ise',
        'm5-3-5-clinical-protocol',
      ]),
    );
  });

  it('every template is a Module 5 leaf with placeholder tokens', () => {
    for (const t of clinicalTemplates) {
      expect(t.module_number).toBe('5');
      expect(t.sectionCode).toMatch(/^5\.3\.5/);
      expect(t.content).toMatch(/\[[A-Z_]+\]/); // at least one [PLACEHOLDER]
      expect(t.category).toBe('clinical');
    }
  });

  it('the full CSR carries all 16 ICH E3 sections', () => {
    const csr = getClinicalTemplate('m5-3-5-1-csr');
    expect(csr).toBeDefined();
    // Spot-check the load-bearing sections.
    expect(csr!.content).toMatch(/2\. SYNOPSIS/);
    expect(csr!.content).toMatch(/9\. INVESTIGATIONAL PLAN/);
    expect(csr!.content).toMatch(/12\. SAFETY EVALUATION/);
    expect(csr!.content).toMatch(/16\. APPENDICES/);
  });

  it('looks up by granule id', () => {
    expect(getClinicalTemplate('m5-3-5-3-iss')?.title).toMatch(/Integrated Summary of Safety/);
    expect(getClinicalTemplate('m5-3-5-3-ise')?.title).toMatch(/Integrated Summary of Efficacy/);
  });

  it('looks up by section code (first registered granule for the shared code)', () => {
    const bySection = getClinicalTemplate('5.3.5.1');
    expect(bySection).toBeDefined();
    expect(bySection!.sectionCode).toBe('5.3.5.1');
  });

  it('returns undefined for an unknown key', () => {
    expect(getClinicalTemplate('nope')).toBeUndefined();
  });

  it('lists metadata only (no content blobs)', () => {
    const list = listClinicalTemplates();
    expect(list.length).toBe(clinicalTemplates.length);
    for (const item of list) {
      expect(item).toHaveProperty('granule_id');
      expect(item).toHaveProperty('sectionCode');
      expect(item).toHaveProperty('title');
      expect(item).not.toHaveProperty('content');
    }
  });
});
