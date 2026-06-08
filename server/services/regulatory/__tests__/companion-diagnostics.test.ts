/**
 * Companion diagnostics — co-development readiness and drug↔Dx linkage.
 */

import { describe, it, expect } from 'vitest';
import { assessCdxReadiness } from '../companion-diagnostics';

describe('assessCdxReadiness', () => {
  it('linkage established when therapeutic + device + biomarker + intended-use align', () => {
    const r = assessCdxReadiness({
      therapeuticProductIdentified: true,
      diagnosticDeviceIdentified: true,
      biomarkerDefined: true,
      intendedUseAlignment: true,
    });
    expect(r.linkageEstablished).toBe(true);
    expect(r.ready).toBe(false); // validation/labeling/review still missing
    expect(r.readinessScore).toBeCloseTo(4 / 8, 8);
  });

  it('no linkage when the biomarker is undefined', () => {
    const r = assessCdxReadiness({
      therapeuticProductIdentified: true,
      diagnosticDeviceIdentified: true,
      intendedUseAlignment: true,
    });
    expect(r.linkageEstablished).toBe(false);
    expect(r.gaps).toContain('biomarkerDefined');
  });

  it('ready when every co-development element is present', () => {
    const r = assessCdxReadiness({
      therapeuticProductIdentified: true,
      diagnosticDeviceIdentified: true,
      biomarkerDefined: true,
      intendedUseAlignment: true,
      analyticalValidation: true,
      clinicalValidation: true,
      labelingCrossReference: true,
      contemporaneousReview: true,
    });
    expect(r.ready).toBe(true);
    expect(r.linkageEstablished).toBe(true);
    expect(r.readinessScore).toBeCloseTo(1, 10);
  });
});
