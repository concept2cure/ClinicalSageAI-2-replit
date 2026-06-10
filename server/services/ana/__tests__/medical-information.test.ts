/**
 * Medical-information advisor — unit tests. Deterministic; verifies response-type
 * resolution, off-label guardrails, the SRD structure, and the AE overlay.
 */
import { describe, it, expect } from 'vitest';
import { adviseMedicalInformation, listMedInfoResponseTypes } from '../medical-information';

describe('adviseMedicalInformation', () => {
  it('surfaces off-label compliance guardrails for unsolicited requests', () => {
    const r = adviseMedicalInformation({ responseType: 'off_label' });
    expect(r.resolved.responseType).toBe('off_label');
    expect(r.brief.toLowerCase()).toContain('unsolicited');
    expect(r.brief.toLowerCase()).toContain('non-promotional');
    expect(r.brief.toLowerCase()).toContain('not approved');
  });

  it('resolves an alias (unsolicited → off_label)', () => {
    const r = adviseMedicalInformation({ responseType: 'unsolicited' });
    expect(r.resolved.responseType).toBe('off_label');
  });

  it('always includes the SRD structure and PV/AE overlay', () => {
    const r = adviseMedicalInformation({ responseType: 'on_label' });
    expect(r.brief).toContain('Standard Response Document');
    expect(r.brief).toContain('Pharmacovigilance overlay');
    expect(r.brief.toLowerCase()).toContain('fair balance');
  });

  it('handles product-complaint enquiries', () => {
    const r = adviseMedicalInformation({ responseType: 'pqc' });
    expect(r.resolved.responseType).toBe('product_complaint');
    expect(r.brief.toLowerCase()).toContain('quality');
  });

  it('lists the response types', () => {
    expect(listMedInfoResponseTypes().map(t => t.id)).toEqual(['on_label', 'off_label', 'product_complaint']);
  });
});
