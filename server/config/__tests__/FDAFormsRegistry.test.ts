import { describe, expect, it } from 'vitest';
import { FDAFormsRegistryClass } from '../FDAFormsRegistry';

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
