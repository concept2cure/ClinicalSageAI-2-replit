import { describe, expect, it } from 'vitest';
import {
  FDAFormsRegistryClass,
  reconcileFdaCatalogSnapshot,
  getFormsForProgram,
  getApplicableForms,
  applicabilityOf,
  FDAFormsRegistry,
} from '../FDAFormsRegistry';

const priority = ['FDA_1571', 'FDA_1572', 'FDA_1574', 'FDA_3454', 'FDA_3455', 'FDA_356H', 'FDA_3674'];

describe('governed FDA forms registry', () => {
  it('provides the complete governance and storage contract for every entry', () => {
    const registry = new FDAFormsRegistryClass().getFullRegistry();
    for (const form of Object.values(registry)) {
      expect(form.source?.authority).toBe('FDA');
      expect(form.governance).toEqual(expect.objectContaining({ approvalRequired: true, failClosed: true }));
      expect(form.pdf?.fallbackWatermarkedDraft).toBe(true);
      expect(form.storage).toEqual(expect.objectContaining({ versioned: true, provenanceRequired: true }));
      expect(['metadata', 'full']).toContain(form.implementationStatus);
    }
  });

  it('keeps full priority form field metadata aligned with builder output', () => {
    const registry = new FDAFormsRegistryClass();
    for (const id of priority) {
      const form = registry.getForm(id);
      expect(form?.implementationStatus).toBe('full');
      expect(form?.fields.length).toBeGreaterThan(0);
    }
    expect(registry.getForm('FDA_3674')).toEqual(expect.objectContaining({
      category: 'Clinical',
      title: expect.stringContaining('42 U.S.C.'),
    }));
    expect(registry.getForm('FDA_3455')?.fields.map((field) => field.id)).toContain('disclosure_details');
  });
});

describe('form applicability (center / domain / program)', () => {
  it('serves the drug-IND forms for an IND program and excludes device 510(k) forms', () => {
    const ids = getFormsForProgram('IND').map((f) => f.formId);
    expect(ids).toEqual(expect.arrayContaining(['FDA_1571', 'FDA_1572', 'FDA_3674', 'FDA_3454', 'FDA_3455']));
    expect(ids).not.toContain('FDA_3514'); // device 510(k) cover sheet
  });

  it('serves the device forms for a 510(k) program and excludes drug-only forms', () => {
    const ids = getFormsForProgram('510k').map((f) => f.formId);
    expect(ids).toEqual(expect.arrayContaining(['FDA_3514', 'FDA_3601', 'FDA_3881', 'FDA_3654']));
    expect(ids).not.toContain('FDA_1571'); // IND application
  });

  it('serves NDA/BLA marketing forms for an NDA program', () => {
    const ids = getFormsForProgram('NDA').map((f) => f.formId);
    expect(ids).toEqual(expect.arrayContaining(['FDA_356H', 'FDA_3674', 'FDA_3454', 'FDA_3455']));
  });

  it('filters by center AND domain AND program together', () => {
    const ids = getApplicableForms({ center: 'CDRH', domain: 'device', program: '510k' }).map((f) => f.formId);
    expect(ids).toContain('FDA_3514');
    expect(ids).not.toContain('FDA_1571'); // drug IND
    expect(ids).not.toContain('FDA_356H'); // drug marketing
  });

  it('derives applicability from category when no explicit override exists', () => {
    expect(applicabilityOf(FDAFormsRegistry.FDA_3514)).toEqual({ center: 'CDRH', domains: ['device'], programs: ['510k'] });
    expect(applicabilityOf(FDAFormsRegistry.FDA_1571)).toEqual({ center: 'CDER', domains: ['drug', 'biologic'], programs: ['IND'] });
  });

  it('exposes applicability on every governed registry entry', () => {
    const registry = new FDAFormsRegistryClass().getFullRegistry();
    for (const form of Object.values(registry)) {
      expect(form.applicability).toBeDefined();
      expect(Array.isArray(form.applicability!.programs)).toBe(true);
    }
  });
});

describe('official FDA catalog reconciliation gate', () => {
  it('reports missing, duplicate, and non-FDA catalog entries fail closed', () => {
    const result = reconcileFdaCatalogSnapshot([
      { formNumber: '1571', title: 'IND', sourceUrl: 'https://www.fda.gov/forms/1571' },
      { formNumber: '9999', title: 'Unregistered', sourceUrl: 'https://example.com/9999' },
      { formNumber: 'FDA 1571', title: 'Duplicate', sourceUrl: 'https://www.fda.gov/forms/1571-copy' },
    ]);
    expect(result.reconciled).toBe(false);
    expect(result.missingFromRegistry.map((entry) => entry.formNumber)).toContain('9999');
    expect(result.duplicateCatalogNumbers).toContain('1571');
    expect(result.invalidSourceUrls).toContain('https://example.com/9999');
  });

  it('accepts an exact reviewed snapshot of the current registry', () => {
    const forms = Object.values(new FDAFormsRegistryClass().getFullRegistry());
    const result = reconcileFdaCatalogSnapshot(forms.map((form) => ({
      formNumber: form.formNumber,
      title: form.title,
      sourceUrl: `https://www.fda.gov/forms/${form.formNumber}`,
    })));
    expect(result.reconciled).toBe(true);
    expect(result.missingFromRegistry).toEqual([]);
  });
});
