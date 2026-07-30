import { describe, it, expect } from 'vitest';
import {
  ESTAR_TEMPLATE_MANIFEST,
  resolveEstarTemplateDir,
  descriptorFor,
  descriptorsForFamily,
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

  it('covers the whole eSTAR program: 510(k)/De Novo/PMA and the PreSTAR requests', () => {
    // Marketing pathways × device/ivd
    expect(descriptorFor('pma', 'device')?.id).toBe('pma-device');
    expect(descriptorFor('pma', 'ivd')?.id).toBe('pma-ivd');
    // PreSTAR request types
    expect(descriptorFor('q_sub', 'prestar')?.id).toBe('q_sub-prestar');
    expect(descriptorFor('ide', 'prestar')?.id).toBe('ide-prestar');
    expect(descriptorFor('513g', 'prestar')?.id).toBe('513g-prestar');
  });

  it('assigns every descriptor to a template family', () => {
    expect(descriptorFor('510k', 'device')?.family).toBe('nivd');
    expect(descriptorFor('510k', 'ivd')?.family).toBe('ivd');
    expect(descriptorFor('pma', 'device')?.family).toBe('nivd');
    expect(descriptorFor('q_sub', 'prestar')?.family).toBe('prestar');
  });

  it('lists descriptors by family', () => {
    expect(descriptorsForFamily('nivd').map((d) => d.id).sort()).toEqual(
      ['510k-device', 'de_novo-device', 'pma-device'].sort(),
    );
    expect(descriptorsForFamily('prestar').map((d) => d.id).sort()).toEqual(
      ['513g-prestar', 'ide-prestar', 'q_sub-prestar'].sort(),
    );
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
    // Surfaces the current FDA program version for the family (nIVD → 7.0).
    expect(r.programVersion).toBe('7.0');
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
