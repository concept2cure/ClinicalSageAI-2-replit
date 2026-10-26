/**
 * AnA's CTD planning tools take their headings from the one ICH M2–M5
 * record (D2 cleanup C4a, 2026-10-26).
 *
 * - plan_ind_module_authoring kept 2.5.1–2.5.6 and 2.7.1–2.7.4 in
 *   shared/ana/ind-module-authoring.ts: no 2.5.7, 2.7.5 or 2.7.6, and
 *   "2.7.1 Summary of Biopharmaceutic Studies" without "and Associated
 *   Analytical Methods".
 * - draft_clinical_overview_m2_5's outline mode kept six hand-written
 *   sections, with no 2.5.7 and no 2.5.6.1–2.5.6.5.
 */
import { describe, expect, it } from 'vitest';
import { IND_MODULE_TEMPLATES, buildIndModuleAuthoringPlan } from '../ind-module-authoring';
import { clinicalOverviewOutline } from '../clinical-overview-outline';
import { ctdRecordSubtree } from '../../market-specs/ctd-component-outlines';
import { ichHeadingTitle } from '../../ind/ctd/ich-m4-headings';

const children = (root: string) => ctdRecordSubtree(root).filter((h) => h.code.split('.').length === root.split('.').length + 1).map((h) => h.code);

describe('plan_ind_module_authoring plans the record’s sections', () => {
  it.each(['2.5', '2.7'])('%s: one section per heading the record holds directly below it, headed as the record titles it', (m) => {
    expect(IND_MODULE_TEMPLATES[m].map((s) => s.header)).toEqual(children(m).map((c) => `${c} ${ichHeadingTitle(c)}`));
    expect(IND_MODULE_TEMPLATES[m].map((s) => s.code)).toEqual(children(m));
  });

  it('a fact lands by its CTD code, and still by the id it had before (the tool’s existing contract)', () => {
    const plan = buildIndModuleAuthoringPlan({
      module: '2.5', productName: 'X', indication: 'Y', provenance: 'not_assessed',
      facts: [{ sectionId: '2.5.4', label: 'ORR', value: '42.3%' }, { sectionId: 'overview_safety', label: 'SAEs', value: '7' }],
    });
    expect(plan.content).toMatch(/## 2\.5\.4 Overview of Efficacy[\s\S]*ORR: 42\.3%/);
    expect(plan.content).toMatch(/## 2\.5\.5 Overview of Safety[\s\S]*SAEs: 7/);
    expect(plan.sectionsWithoutFacts).toContain('2.5.7');
  });
});

describe('draft_clinical_overview_m2_5 outlines the served Clinical Overview', () => {
  it('every section is the record’s, 2.5.7 and the 2.5.6 subdivisions included, with its 2.7 cross-reference kept', () => {
    const o = clinicalOverviewOutline();
    expect(o.map((s) => s.number)).toEqual(children('2.5'));
    for (const s of o) expect(s.title, s.number).toBe(ichHeadingTitle(s.number));
    expect(o.find((s) => s.number === '2.5.6')?.subsections?.map((s) => s.number)).toEqual(['2.5.6.1', '2.5.6.2', '2.5.6.3', '2.5.6.4', '2.5.6.5']);
    expect(o.find((s) => s.number === '2.5.4')?.cite_from_module).toBe('2.7.3');
  });
});
