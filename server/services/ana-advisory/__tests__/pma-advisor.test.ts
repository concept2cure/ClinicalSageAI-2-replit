import { describe, it, expect } from 'vitest';
import { advisePmaReadiness, PMA_ADVISORY_TOOL_SPEC } from '../pma-advisor';
import type { PmaInputLeaf } from '../../pathway-engines/pma/pma-mapper';

const completePma: PmaInputLeaf[] = [
  { sectionCode: '1', title: 'Cover letter and administrative information', substantive: true },
  { sectionCode: '2', title: 'Device description and indications for use', substantive: true },
  { sectionCode: '3', title: 'Manufacturing and quality system information', substantive: true },
  { sectionCode: '4', title: 'Nonclinical bench and biocompatibility studies', substantive: true },
  { sectionCode: '5', title: 'Clinical investigation — pivotal study', substantive: true },
  { sectionCode: '6', title: 'Proposed labeling', substantive: true },
  { sectionCode: '7', title: 'Summary of safety and effectiveness data', substantive: true },
  { sectionCode: '8', title: 'Statistical analysis plan and results', substantive: true },
];

describe('advisePmaReadiness', () => {
  it('advises filing-ready when all required modules present', () => {
    const a = advisePmaReadiness({ leaves: completePma });
    expect(a.ready).toBe(true);
    expect(a.completeness).toBe(100);
    expect(a.missingRequiredModules).toHaveLength(0);
    expect(a.headline).toMatch(/filing-ready/i);
    expect(a.headline).toMatch(/you submit it to FDA/i);
  });

  it('advises not-fileable with missing modules + actions when incomplete', () => {
    const a = advisePmaReadiness({ leaves: [{ sectionCode: '1', title: 'Cover letter', substantive: true }] });
    expect(a.ready).toBe(false);
    expect(a.missingRequiredModules.length).toBeGreaterThan(0);
    expect(a.recommendedActions.length).toBe(a.missingRequiredModules.length);
    expect(a.headline).toMatch(/Not yet fileable/i);
    // modules sorted ascending
    const mods = a.missingRequiredModules.map((m) => m.module);
    expect([...mods]).toEqual([...mods].sort((x, y) => x - y));
  });

  it('threads submission type and is honest on empty input', () => {
    const a = advisePmaReadiness({ leaves: [], submissionType: '180_day_supplement' });
    expect(a.submissionType).toBe('180_day_supplement');
    expect(a.ready).toBe(false);
    expect(a.completeness).toBe(0);
  });

  it('exposes a well-formed tool spec', () => {
    expect(PMA_ADVISORY_TOOL_SPEC.name).toBe('advise_pma_readiness');
    expect(PMA_ADVISORY_TOOL_SPEC.input_schema.type).toBe('object');
    expect(PMA_ADVISORY_TOOL_SPEC.input_schema.properties).toHaveProperty('leaves');
  });
});
