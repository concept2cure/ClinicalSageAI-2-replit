import { describe, expect, it } from 'vitest';
import { evaluateReadiness } from '../readinessEvaluator';
import { getResolvedSectionBlueprint } from '../sectionBlueprintCatalog';
import { getApplicationType } from '../../../../shared/regulatory/global-document-registry';

const REGIONAL_IDS = ['US_HDE', 'CA_MDL', 'CA_IVD_LICENCE', 'JP_SHONIN', 'JP_NINTEI', 'JP_TODOKEDE', 'JP_IVD_APPROVAL', 'JP_CDX'];

describe('empty regional working outlines do not establish submission requirements', () => {
  it.each(REGIONAL_IDS)('%s has unassessed section requirements, not complete requirements', registryIdOrLegacy => {
    const blueprint = getResolvedSectionBlueprint(getApplicationType(registryIdOrLegacy)!);
    expect(blueprint.sections.length).toBeGreaterThan(0);
    expect(blueprint.sections.every(s => !s.required)).toBe(true);
    const result = evaluateReadiness({ registryIdOrLegacy, sections: [], artifacts: [] });
    expect(result.sectionReadiness.completionPercent).toBe(0);
    expect(result.sectionReadiness.assessed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.level).toBe('not_ready');
    expect(result.gaps).toContainEqual(expect.objectContaining({ code: 'SECTION_REQUIREMENTS_NOT_MODELLED', severity: 'critical' }));
    expect(result.gaps.find(g => g.code === 'SECTION_REQUIREMENTS_NOT_MODELLED')?.message).toContain(registryIdOrLegacy);
  });

  it.each(REGIONAL_IDS)('%s approved optional authoring groups do not determine an unknown requirement set', registryIdOrLegacy => {
    const blueprint = getResolvedSectionBlueprint(getApplicationType(registryIdOrLegacy)!);
    const result = evaluateReadiness({ registryIdOrLegacy,
      sections: blueprint.sections.map(s => ({ code: s.code, title: s.title, status: 'approved', artifactCount: 1 })), artifacts: [] });
    expect(result.sectionReadiness.required).toBe(0);
    expect(result.sectionReadiness.assessed).toBe(false);
    expect(result.sectionReadiness.completionPercent).toBe(0);
    expect(result.score).toBe(0);
    expect(result.level).toBe('not_ready');
  });

  it('retains normal assessment for modelled FDA IND sections', () => {
    const registryIdOrLegacy = 'US_IND';
    const blueprint = getResolvedSectionBlueprint(getApplicationType(registryIdOrLegacy)!);
    const result = evaluateReadiness({ registryIdOrLegacy,
      sections: blueprint.sections.filter(s => s.required).map(s => ({ code: s.code, title: s.title, status: 'approved', artifactCount: 1 })), artifacts: [] });
    expect(result.sectionReadiness.required).toBeGreaterThan(0);
    expect(result.sectionReadiness.assessed).not.toBe(false);
    expect(result.sectionReadiness.completionPercent).toBe(100);
    expect(result.gaps.some(g => g.code === 'SECTION_REQUIREMENTS_NOT_MODELLED')).toBe(false);
  });
});
