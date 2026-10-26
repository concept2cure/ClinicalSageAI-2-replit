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
import { clinicalOverviewLimits, clinicalOverviewOutline } from '../ctd-component-outline';
import { DRAFT_CLINICAL_OVERVIEW_M2_5 } from '../legacy-import-tool-defs';
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

/*
 * C4c (2026-10-26), the review of C4a (wf_4db15643-511): a fact named by a code
 * below a planned section (2.7.4.2.1.2) was dropped and its section read "no
 * source fact supplied"; the outline mode served the briefs without the
 * template's own limits; the tool's description still promised six sections.
 */
describe('C4c: what the review of C4a found', () => {
  it('a fact named by a code below a planned section lands in that section, with its own code', () => {
    const plan = buildIndModuleAuthoringPlan({
      module: '2.7', productName: 'X', indication: 'Y', provenance: 'not_assessed',
      facts: [{ sectionId: '2.7.4.2.1.2', label: 'Deaths', value: '3 deaths' }, { sectionId: 'm2.7.3', label: 'ORR', value: '41%' }],
    });
    expect(plan.content).toMatch(/## 2\.7\.4 Summary of Clinical Safety[\s\S]*- Deaths \(2\.7\.4\.2\.1\.2\): 3 deaths/);
    expect(plan.content).toMatch(/## 2\.7\.3 Summary of Clinical Efficacy[\s\S]*- ORR: 41%/);
    expect(plan.sectionsWithoutFacts).not.toContain('2.7.4');
    expect(plan.unplacedFacts).toEqual([]);
  });

  it('a fact naming no section of the template is returned as unplaced, never dropped silently', () => {
    const plan = buildIndModuleAuthoringPlan({
      module: '2.5', productName: 'X', indication: 'Y', provenance: 'not_assessed',
      facts: [{ sectionId: '2.7.4', label: 'SAEs', value: '7' }],
    });
    expect(plan.unplacedFacts).toEqual([{ sectionId: '2.7.4', label: 'SAEs', value: '7' }]);
    expect(plan.content).not.toMatch(/SAEs/);
  });

  it('the outline carries the served template’s limits and basis, scaling to the development phase included', () => {
    const { outline_limitations, basis } = clinicalOverviewLimits();
    expect(outline_limitations.join(' ')).toMatch(/Scale content to the development phase/);
    expect(basis).toMatch(/Headings as the record holds them/);
  });

  it('the tool tells the model the shape it returns: 2.5.1–2.5.7, never six sections', () => {
    expect(DRAFT_CLINICAL_OVERVIEW_M2_5.description).toContain('2.5.1–2.5.7');
    expect(DRAFT_CLINICAL_OVERVIEW_M2_5.description).not.toMatch(/six-subsection|2\.5\.1–2\.5\.6/);
  });
});
