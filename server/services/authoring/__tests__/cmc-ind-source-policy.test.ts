import { describe, expect, it } from 'vitest';
import { getAllINDSections } from '../../../../services/regulatory/ind-ectd-sections';
import { buildModule2Or3Outline } from '../ind-template-outlines-m2-m3';

const rows = (code: string) => buildModule2Or3Outline(getAllINDSections().find(section => section.code === code)!);

describe('IND CMC aliases reuse the exact canonical source policy', () => {
  it.each([
    ['m3.2.S.4', '3.2.S.4.5', '3.2.S.4.1', '3.2.S.4.2'],
    ['m3.2.P', '3.2.P.2', '3.2.P.1', '3.2.P.3'],
  ])('keeps narrative, tabulated and mixed-source distinctions in %s', (code, narrative, table, mixed) => {
    const outline = rows(code);
    expect(outline.find(row => row.code === narrative)!.guidance.drafting_mode).toBe('narrative');
    for (const source of [table, mixed]) expect(outline.find(row => row.code === source)!.guidance.drafting_mode).toBe('manual');
  });

  it('does not apply a Module3 source policy to the Module2 summaries', () => {
    expect(rows('m2.5').every(row => row.guidance.drafting_mode === undefined)).toBe(true);
  });
});
