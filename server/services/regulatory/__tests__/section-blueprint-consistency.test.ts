import { describe, expect, it } from 'vitest';
import { getSectionBlueprint } from '../sectionBlueprintCatalog';
import { resolveOutlineForType } from '../canonicalDocumentStore';
import { resolve } from '../registry/globalDocumentRegistryService';
import { evaluateReadiness } from '../readinessEvaluator';
import { buildPackageManifest } from '../submissionPackageBuilder';
import { ICH_E2F_DSUR_SECTIONS } from '../../ind/ctd/lifecycle-document-types';
import { e3TopLevel } from '../../ind/ctd/csr-e3-guidance';

describe('one server outline across authoring and submission consumers', () => {
  for (const id of ['EU_MAA', 'CA_NDS', 'JP_MKT_APPROVAL', 'EU_CTA', 'CA_CTA', 'CA_CTA_A', 'JP_CTN', 'US_IND_AMENDMENT', 'ICH_NONCLIN_SUMMARY']) {
    it(`${id} uses the project catalog in persistence, resolution, readiness and packaging`, async () => {
      const blueprint = await getSectionBlueprint(id);
      expect(blueprint).not.toBeNull();
      const expected = blueprint!.sections;
      expect(resolveOutlineForType(id)).toEqual(expected);
      expect(resolve(id)?.sectionBlueprint).toEqual(blueprint);
      const readiness = evaluateReadiness({ registryIdOrLegacy: id, sections: [], artifacts: [] });
      expect(readiness.sectionReadiness.total).toBe(expected.length);
      expect(readiness.gaps.filter(g => g.type === 'section' && g.code !== 'SECTION_APPLICABILITY_NOT_ASSESSED').map(g => g.code))
        .toEqual(expected.filter(s => s.required).map(s => s.code));
      expect(buildPackageManifest(id, 'outline-consistency', [], [])?.sections.map(s => ({
        code: s.code, title: s.title, module: s.module, required: s.required,
      }))).toEqual(expected.map(s => ({ code: s.code, title: s.title, module: s.module, required: s.required })));
    });
  }

  it('DSUR uses the existing E2F record, including section 20 Conclusions', async () => {
    const expected = ICH_E2F_DSUR_SECTIONS.map(s => ({
      code: s.number ?? s.title.toLowerCase().replace(/\s+/g, '_'), title: s.title,
    }));
    const outline = resolveOutlineForType('ICH_DSUR');
    expect(outline.map(s => ({ code: s.code, title: s.title }))).toEqual(expected);
    expect((await getSectionBlueprint('ICH_DSUR'))?.sections).toEqual(outline);
    expect(outline.every(s => s.module === 0)).toBe(true);
  });

  it('CSR uses the canonical E3 top-level record through saved outlines and manifests', async () => {
    const expected = e3TopLevel().map(s => ({ code: s.number, title: s.title }));
    const outline = resolveOutlineForType('ICH_CSR');
    expect(outline.map(s => ({ code: s.code, title: s.title }))).toEqual(expected);
    expect((await getSectionBlueprint('ICH_CSR'))?.sections).toEqual(outline);
    expect(buildPackageManifest('ICH_CSR', 'csr', [], [])?.sections.map(s => ({ code: s.code, title: s.title }))).toEqual(expected);
  });

  it('an approved DSUR scaffold cannot imply assessed filing readiness or package completeness', () => {
    const sections = resolveOutlineForType('ICH_DSUR').map(s => ({
      code: s.code, title: s.title, status: 'approved', artifactCount: 1, documentIds: ['source-doc'],
    }));
    const readiness = evaluateReadiness({ registryIdOrLegacy: 'ICH_DSUR', sections, artifacts: [] });
    expect(readiness.sectionReadiness.completionPercent).toBe(100);
    expect(readiness.artifactReadiness.assessed).toBe(false);
    expect(readiness.level).toBe('not_ready');
    const manifest = buildPackageManifest('ICH_DSUR', 'dsur', sections, [])!;
    expect(manifest.metadata.packageComplete).toBe(false);
    expect(manifest.validationRules).toContain('artifact_requirements_not_modelled');
  });

  it.each(['EU_CTA', 'CA_CTA', 'CA_CTA_A', 'JP_CTN', 'US_IND_AMENDMENT'])('%s requires a conditional-scope assessment even with approved baseline rows', (id) => {
    const sections = resolveOutlineForType(id).filter(s => s.required).map(s => ({ code: s.code, title: s.title, status: 'approved', artifactCount: 1, documentIds: ['source-doc'] }));
    const readiness = evaluateReadiness({ registryIdOrLegacy: id, sections, artifacts: [] });
    expect(readiness.sectionReadiness.completionPercent).toBe(100);
    expect(readiness.level).toBe('not_ready');
    expect(readiness.gaps.map(g => g.code)).toContain('SECTION_APPLICABILITY_NOT_ASSESSED');
    const manifest = buildPackageManifest(id, 'trial', sections, [])!;
    expect(manifest.metadata.packageComplete).toBe(false);
    expect(manifest.validationRules).toContain('section_applicability_not_assessed');
    expect(manifest.metadata.sectionApplicabilityAssessed).toBe(false);
    expect(manifest.metadata.artifactRequirementsAssessed).toBe(false);
    expect(manifest.outlineLimitations?.length).toBeGreaterThan(0);
    if (id === 'EU_CTA') {
      expect(readiness.artifactReadiness.assessed).toBe(false);
      expect(readiness.gaps.filter(g => g.type === 'artifact').map(g => g.code)).not.toContain('investigator_brochure');
      expect(manifest.submissionGateway).toBe('CTIS');
      expect(manifest.validationRules.join(' ')).not.toMatch(/ectd|module1|smpc/);
      expect(readiness.regionalWarnings.join(' ')).not.toContain('Risk Management Plan');
    }
    if (['CA_CTA', 'CA_CTA_A', 'JP_CTN'].includes(id)) {
      expect(manifest.submissionGateway).toBeNull();
      expect(manifest.validationRules.join(' ')).not.toContain('ectd_structure_valid');
    }
  });
});
