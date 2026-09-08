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

// WO-8 Phase 3: De Novo and PMA are produced on the vendored 510(k)-named files.
describe('eSTAR template registry — De Novo and PMA on the vendored files', () => {
  it('files De Novo and PMA on the same vendored v7.0 PDFs as 510(k) — FDA ships one file per family', () => {
    // nIVD family: one physical file for all three marketing pathways.
    for (const type of ['510k', 'de_novo', 'pma'] as const) {
      expect(descriptorFor(type, 'device')).toMatchObject({
        family: 'nivd',
        expectedFileName: 'eSTAR-510k-non-ivd.pdf',
        version: '7.0',
      });
      expect(descriptorFor(type, 'ivd')).toMatchObject({
        family: 'ivd',
        expectedFileName: 'eSTAR-510k-ivd.pdf',
        version: '7.0',
      });
    }
    // The descriptor ids stay distinct (each pathway carries its own field map).
    expect(descriptorFor('de_novo', 'device')?.id).toBe('de_novo-device');
    expect(descriptorFor('pma', 'ivd')?.id).toBe('pma-ivd');
    // PreSTAR2 is not vendored: those three stay unpinned.
    for (const type of ['q_sub', 'ide', '513g'] as const) {
      expect(descriptorFor(type, 'prestar')?.version).toBe('unset');
    }
  });

  it('reports De Novo and PMA available in production once the two vendored files are present', () => {
    const present = ['eSTAR-510k-non-ivd.pdf', 'eSTAR-510k-ivd.pdf'];
    const cases = [
      { type: 'de_novo', variant: 'device', file: 'eSTAR-510k-non-ivd.pdf' },
      { type: 'pma', variant: 'device', file: 'eSTAR-510k-non-ivd.pdf' },
      { type: 'de_novo', variant: 'ivd', file: 'eSTAR-510k-ivd.pdf' },
      { type: 'pma', variant: 'ivd', file: 'eSTAR-510k-ivd.pdf' },
    ] as const;
    for (const c of cases) {
      const r = assessEstarTemplateReadiness({
        type: c.type,
        variant: c.variant,
        present,
        environment: 'production',
        requireTemplate: true,
      });
      expect(r.requiredFileName).toBe(c.file);
      expect(r.available).toBe(true);
      expect(r.cleared).toBe(true);
      expect(r.blockers).toEqual([]);
      expect(r.programVersion).toBe('7.0');
    }
    // The PreSTAR template is still absent, so a Q-Sub still fails closed.
    const qsub = assessEstarTemplateReadiness({
      type: 'q_sub',
      variant: 'prestar',
      present,
      environment: 'production',
      requireTemplate: true,
    });
    expect(qsub.available).toBe(false);
    expect(qsub.cleared).toBe(false);
  });
});
