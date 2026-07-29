import { describe, it, expect } from 'vitest';
import {
  ESTAR_TEMPLATE_MANIFEST,
  resolveEstarTemplateDir,
  descriptorFor,
  assessEstarTemplateReadiness,
  estarTemplateRequiredFromEnv,
} from '../estar-template-registry';

describe('eSTAR template registry', () => {
  it('resolves the drop-point dir from env or the default', () => {
    expect(resolveEstarTemplateDir({ ESTAR_TEMPLATE_DIR: '/tmp/x' } as any)).toBe('/tmp/x');
    expect(resolveEstarTemplateDir({} as any)).toMatch(/assets[\\/]estar-templates$/);
  });

  it('maps every pathway+variant in the manifest to a descriptor', () => {
    for (const d of ESTAR_TEMPLATE_MANIFEST) {
      expect(descriptorFor(d.type, d.variant)).toEqual(d);
    }
    expect(descriptorFor('510k', 'ivd')?.expectedFileName).toBe('eSTAR-510k-ivd.pdf');
  });

  it('reports available when the required template is present (case-insensitive)', () => {
    const r = assessEstarTemplateReadiness({
      type: '510k',
      variant: 'device',
      present: ['ESTAR-510K-NON-IVD.PDF'],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.available).toBe(true);
    expect(r.cleared).toBe(true);
    expect(r.blockers).toHaveLength(0);
  });

  it('fails closed in production when the required template is missing and required', () => {
    const r = assessEstarTemplateReadiness({
      type: '510k',
      variant: 'device',
      present: [],
      environment: 'production',
      requireTemplate: true,
    });
    expect(r.available).toBe(false);
    expect(r.cleared).toBe(false);
    expect(r.blockers[0]).toMatch(/Cannot produce a submittable eSTAR/);
  });

  it('never blocks in staging or when not required (report-only)', () => {
    const staging = assessEstarTemplateReadiness({
      type: 'de_novo',
      variant: 'ivd',
      present: [],
      environment: 'staging',
      requireTemplate: true,
    });
    expect(staging.available).toBe(false);
    expect(staging.cleared).toBe(true);

    const notRequired = assessEstarTemplateReadiness({
      type: 'de_novo',
      variant: 'ivd',
      present: [],
      environment: 'production',
      requireTemplate: false,
    });
    expect(notRequired.cleared).toBe(true);
  });

  it('reads the opt-in enforcement flag from the environment', () => {
    expect(estarTemplateRequiredFromEnv({ ESTAR_REQUIRE_TEMPLATE: 'true' } as any)).toBe(true);
    expect(estarTemplateRequiredFromEnv({ ESTAR_REQUIRE_TEMPLATE: 'false' } as any)).toBe(false);
    expect(estarTemplateRequiredFromEnv({} as any)).toBe(false);
  });
});
