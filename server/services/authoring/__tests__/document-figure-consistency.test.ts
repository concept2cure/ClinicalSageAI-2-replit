/**
 * Does the document agree with itself?
 *
 * `section-claims-check.ts` sets a section's figures against the documents it
 * cites. It needs cited sources, so it runs only where a section has them — at
 * the save of an AnA draft — and a document a person wrote or edited by hand
 * carries no such record.
 *
 * This is the check that needs nothing outside the document: the same figure,
 * in the same frame, stated twice in two different sections, with two different
 * values. A CSR synopsis that disagrees with its own body, a 2.7.4 whose
 * overall-profile paragraph disagrees with its per-study one. It is the oldest
 * finding in medical writing and the engine already answers it
 * (`compareWithin`, 37 cases of the corpus's synopsis-body lens).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CONSISTENCY_KEPT, checkDocumentFigureConsistency, type ConsistencySection } from '../document-figure-consistency';

const section = (code: string, title: string, text: string): ConsistencySection => ({ code, title, text });

const SAFETY = (rate: string) =>
  `In the safety analysis set, nausea was reported in ${rate} of patients treated with dapralutide 1.5 mg.`;

describe('a figure stated twice in one document, two different ways', () => {
  it('reports the disagreement, and names both sections', () => {
    const r = checkDocumentFigureConsistency('m2_7_4', [
      section('2.7.4.1', 'Study DPL-301 (NCT05551234) safety summary', SAFETY('18.0%')),
      section('2.7.4.2', 'Overall safety profile, Study DPL-301 (NCT05551234)', SAFETY('12.0%')),
    ]);
    expect(r.conflicts).toBe(1);
    expect(r.verdict).toBe('conflicts_found');
    const c = r.comparisons[0];
    expect(c.outcome).toBe('conflict');
    expect([c.a.section, c.b.section].sort()).toEqual(['2.7.4.1', '2.7.4.2']);
    expect([c.a.values.join(), c.b.values.join()].sort()).toEqual(['12.0', '18.0']);
    // A disagreement carries both quotes, so the author reads the context without hunting.
    expect(c.a.quote).toBeTruthy();
    expect(c.b.quote).toBeTruthy();
  });

  it('says nothing when the two agree, and never calls that "consistent" as a verdict', () => {
    const r = checkDocumentFigureConsistency('m2_7_4', [
      section('2.7.4.1', 'Study DPL-301 (NCT05551234) safety summary', SAFETY('18.0%')),
      section('2.7.4.2', 'Overall safety profile, Study DPL-301 (NCT05551234)', SAFETY('18.0%')),
    ]);
    expect(r.conflicts).toBe(0);
    expect(r.compared).toBeGreaterThanOrEqual(1);
    expect(r.verdict).toBe('no_conflict_among_compared');
    expect(JSON.stringify(r)).not.toContain('"verdict":"consistent"');
  });

  it('does not compare two figures whose frames differ, and never calls that a conflict', () => {
    const r = checkDocumentFigureConsistency('m2_7_4', [
      section('2.7.4.1', 'Study DPL-301 (NCT05551234), safety analysis set', SAFETY('18.0%')),
      section(
        '2.7.4.2',
        'Study DPL-302 (NCT05551247), safety analysis set',
        'In the safety analysis set, nausea was reported in 12.0% of patients treated with dapralutide 1.5 mg.',
      ),
    ]);
    // Two different studies, so not the same measure however alike the sentences look.
    expect(r.conflicts).toBe(0);
  });

  it('a figure stated once in one section is not set against itself', () => {
    const r = checkDocumentFigureConsistency('m2_7_4', [
      section('2.7.4.1', 'Study DPL-301 (NCT05551234) safety summary', `${SAFETY('18.0%')} ${SAFETY('18.0%')}`),
    ]);
    expect(r.compared).toBe(0);
    expect(r.verdict).toBe('nothing_compared');
  });

  it('reports nothing compared as nothing compared, for a document with no figures', () => {
    const r = checkDocumentFigureConsistency('m2_7_4', [
      section('2.7.4.1', 'Safety summary', 'The safety profile was consistent with the known profile.'),
      section('2.7.4.2', 'Overall safety profile', 'No new safety signal was identified.'),
    ]);
    expect(r.compared).toBe(0);
    expect(r.conflicts).toBe(0);
    expect(r.verdict).toBe('nothing_compared');
  });

  it('is empty, not an error, for a document with one section or none', () => {
    expect(checkDocumentFigureConsistency('m2_7_4', []).verdict).toBe('nothing_compared');
    expect(checkDocumentFigureConsistency('m2_7_4', []).comparisons).toEqual([]);
  });

  it('keeps the counts complete when it truncates the detail', () => {
    const terms = ['nausea', 'diarrhoea', 'vomiting', 'fatigue', 'headache', 'constipation'];
    const body = (pct: (i: number) => string) =>
      terms.map((t, i) => `In the safety analysis set, ${t} was reported in ${pct(i)} of patients treated with dapralutide 1.5 mg.`).join(' ');
    const r = checkDocumentFigureConsistency('m2_7_4', [
      section('2.7.4.1', 'Study DPL-301 (NCT05551234) safety summary', body((i) => `${10 + i}.0%`)),
      section('2.7.4.2', 'Overall safety profile, Study DPL-301 (NCT05551234)', body((i) => `${20 + i}.0%`)),
    ]);
    expect(r.conflicts).toBe(terms.length);
    expect(r.comparisons.length).toBeLessThanOrEqual(CONSISTENCY_KEPT);
    if (r.conflicts > CONSISTENCY_KEPT) expect(r.truncated).toBe(true);
  });
});

describe('the record cannot contradict itself', () => {
  const cases: Array<[string, Parameters<typeof checkDocumentFigureConsistency>[1]]> = [
    ['a disagreement', [section('2.7.4.1', 'Study DPL-301 (NCT05551234) safety', SAFETY('18.0%')), section('2.7.4.2', 'Overall, Study DPL-301 (NCT05551234)', SAFETY('12.0%'))]],
    ['an agreement', [section('2.7.4.1', 'Study DPL-301 (NCT05551234) safety', SAFETY('18.0%')), section('2.7.4.2', 'Overall, Study DPL-301 (NCT05551234)', SAFETY('18.0%'))]],
    ['no figures', [section('2.7.4.1', 'Safety', 'No new signal.'), section('2.7.4.2', 'Overall', 'As expected.')]],
    ['one section', [section('2.7.4.1', 'Safety', SAFETY('18.0%'))]],
  ];
  it.each(cases)('%s: the verdict says exactly what the list holds', (_name, sections) => {
    const r = checkDocumentFigureConsistency('m2_7_4', sections);
    const listed = r.comparisons.filter((c) => c.outcome === 'conflict').length;
    // The verdict is never "conflicts found" with no conflict listed, and never anything else
    // with one listed. The counts are of everything; the list is capped, so a capped record may
    // hold fewer conflicts than it counts — but never more, and never none while it counts some.
    if (r.conflicts > 0) {
      expect(r.verdict).toBe('conflicts_found');
      expect(listed).toBeGreaterThan(0);
    } else {
      expect(r.verdict).not.toBe('conflicts_found');
      expect(listed).toBe(0);
      expect(r.verdict).toBe(r.compared > 0 ? 'no_conflict_among_compared' : 'nothing_compared');
    }
    expect(r.conflicts).toBeLessThanOrEqual(r.compared);
    expect(r.comparisons.length).toBeLessThanOrEqual(Math.min(r.compared, CONSISTENCY_KEPT));
  });
});

describe('the check is on the surface the author already runs', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');

  it('the section check returns it, over every section of the open document', () => {
    const router = read('routes/authoring.router.ts');
    expect(router).toContain("from '../services/authoring/document-figure-consistency'");
    expect(router).toContain('checkDocumentFigureConsistency(');
    // The handler runs it over the whole document and spreads the named field into its response.
    const scan = router.slice(router.indexOf("router.post('/sections/:sectionId/ai/deficiency-scan'"));
    expect(scan.slice(0, 12000)).toContain('documentFigureConsistency(section.doc_id');
    expect(scan.slice(0, 12000)).toContain('...consistencyField(documentConsistency)');
    // And the field is named once, where that spread comes from — present only when the read
    // succeeded, because an empty one would say the document agrees with itself.
    expect(router).toMatch(/function consistencyField[\s\S]{0,400}document_figure_consistency: check/);
  });

  it('the editor renders it where it renders the record requirements', () => {
    const wb = read('../client/src/concept2cure/v2/editor/DocumentWorkbench.tsx');
    expect(wb).toContain('document_figure_consistency');
    expect(wb).toContain('section-check-consistency');
  });
});
