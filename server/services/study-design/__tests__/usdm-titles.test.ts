/**
 * USDM export — the design's titles. `title` is the protocol's official title;
 * `publicTitle` (the lay title a person recorded) and `acronym` are separate
 * StudyTitles. Each is typed by what the design records it as, with a
 * C2C-INTERNAL code (not a CDISC controlled term); a title the design does not
 * record is not emitted, and the official title is never reused as another kind.
 */
import { describe, it, expect } from 'vitest';
import { projectUsdm } from '../usdm-projection';
import { C2C_CODE_SYSTEM } from '../usdm-types';
import { type StudyDesign } from '../study-design-types';

function design(extra: Partial<StudyDesign> = {}): StudyDesign {
  return {
    title: 'A randomised, double-blind study of Drug X versus placebo in adults with type 2 diabetes',
    phase: '3', indication: 'type 2 diabetes', objectives: [], estimands: [], endpoints: [],
    framework: { inferentialFrame: 'superiority' }, arms: [], statisticalPlan: { plannedAnalyses: [] },
    population: { targetDescription: 'adults', analysisPopulations: [], eligibility: [] },
    ...extra,
  } as StudyDesign;
}

const titlesOf = (d: StudyDesign) => projectUsdm(d).study.versions[0].titles;

describe('projectUsdm: titles', () => {
  it('types the one recorded title as official, and emits no public title or acronym it does not have', () => {
    const t = titlesOf(design());
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ id: 'StudyTitle_1', text: design().title, type: { code: 'official', codeSystem: C2C_CODE_SYSTEM } });
  });

  it('emits a recorded public title and acronym as their own typed titles, trimmed, with positional ids', () => {
    const t = titlesOf(design({ publicTitle: '  A study of Drug X for adults with type 2 diabetes ', acronym: 'DX-T2D' }));
    expect(t.map((x) => [x.id, x.type.code, x.text])).toEqual([
      ['StudyTitle_1', 'official', design().title],
      ['StudyTitle_2', 'public', 'A study of Drug X for adults with type 2 diabetes'],
      ['StudyTitle_3', 'acronym', 'DX-T2D'],
    ]);
  });

  it('a blank public title or acronym is not emitted, and is not listed as an unmapped field', () => {
    const p = projectUsdm(design({ publicTitle: '   ', acronym: '' }));
    expect(p.study.versions[0].titles.map((x) => x.type.code)).toEqual(['official']);
    const q = projectUsdm(design({ publicTitle: 'A lay title', acronym: 'LT' }));
    expect(q.unmappedDesignFields.filter((f) => /publicTitle|acronym/.test(f))).toEqual([]);
  });

  it('no official title: no official StudyTitle is invented from the public one', () => {
    const t = titlesOf(design({ title: '', publicTitle: 'A lay title' }));
    expect(t.map((x) => x.type.code)).toEqual(['public']);
  });
});
