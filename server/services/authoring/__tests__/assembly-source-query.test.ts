import { describe, expect, it, vi } from 'vitest';
import type { AssemblySelection } from '../../../../shared/authoring/assembly';
import { ASSEMBLY_SOURCE_EXCERPT_LIMIT } from '../../../../shared/authoring/assembly-sources';
import { chooseSourceWindow, sectionTerms } from '../../ana/draft-source-window';
import { AssemblyError, assemblySourceQuery, buildAssemblyPlan,
  type AssemblyDocument, type AssemblyStoredSection, type AssemblyTemplate } from '../authoring-assembly-plan';

const DOC = '11111111-1111-4111-8111-111111111111';
const PROGRAM = '22222222-2222-4222-8222-222222222222';
const TEMPLATE = '33333333-3333-4333-8333-333333333333';
const SECTION = '44444444-4444-4444-8444-444444444444';
const selected: AssemblySelection = { target: 'section', code: 'purpose' };
const filler = 'Administrative front matter and table of contents. '.repeat(600);
function template(title = 'Bioanalytical assay validation', guidance?: string): AssemblyTemplate {
  return { id: TEMPLATE, name: 'Broad project reference catalogue', snapshot: 'template-snapshot',
    sections: [{ code: 'purpose', title, content: '', ordering: 0 }],
    draftRegion: 'FDA', aiDraftable: true, aiDraftableReason: 'Recorded narrative', limitations: ['Reference only'],
    metadataFor: () => ({}), guidanceFor: vi.fn(() => guidance) };
}
function served(source: string, query: string) {
  const span = chooseSourceWindow(source, query, ASSEMBLY_SOURCE_EXCERPT_LIMIT);
  return { span, text: source.slice(span.start, span.end) };
}
function refusal(action: () => unknown, code: string, status: number) {
  let error: unknown;
  try { action(); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(AssemblyError);
  expect(error).toMatchObject({ code, status });
}

describe('canonical exact-template-section source query', () => {
  it('normalizes only selection identity and retains the canonical raw title followed by raw guidance', () => {
    const title = '  Bioanalytical assay validation  ';
    const guidance = 'Precision and reproducibility.\nRetain the stated limitations.';
    const source = template(title, guidance); source.sections[0].code = ' Purpose ';
    const query = assemblySourceQuery('M5', source, { target: 'section', code: ' pUrPoSe ' });

    expect(query).toContain(title);
    expect(query).toContain(guidance);
    expect(query.indexOf(title)).toBe(0);
    expect(query.indexOf(guidance)).toBeGreaterThan(query.indexOf(title));
    expect(query).not.toContain('M5');
    expect(query).not.toContain(source.name);
    expect(query).not.toContain('Purpose');
    expect(source.guidanceFor).toHaveBeenCalledExactlyOnceWith(' Purpose ');
  });

  it('uses the selected template heading even when planning correctly preserves a renamed saved heading', () => {
    const source = template('Assay performance', 'Precision reproducibility quantitation');
    const doc: AssemblyDocument = { id: DOC, module: 'M5', client_program_id: PROGRAM, status: 'draft' };
    const saved: AssemblyStoredSection[] = [{ id: SECTION, doc_id: DOC, code: ' PURPOSE ', title: 'Renamed working narrative',
      content: 'Preserve the human-written text.', order_index: 7, updated_at: null }];
    const before = saved.map(row => ({ ...row }));
    const plan = buildAssemblyPlan(doc, saved, source, { programId: PROGRAM, templateId: TEMPLATE, selection: selected });
    const query = assemblySourceQuery(doc.module, source, selected);

    expect(plan.rows[0]).toMatchObject({ title: 'Renamed working narrative', disposition: 'preserve', existingSectionId: SECTION });
    expect(query).toContain('Assay performance');
    expect(query).not.toContain('Renamed working narrative');
    expect(query).not.toContain('Preserve the human-written text.');
    expect(saved).toEqual(before);
  });

  it('does not query another section or let a long generic template name consume relevance terms', () => {
    const source = template('Bioanalytical assay validation', 'Precision reproducibility quantitation');
    source.name = Array.from({ length: 60 }, (_, index) => `catalogue${index}`).join(' ');
    source.sections.push({ code: 'other', title: 'Unselected manufacturing process', content: '', ordering: 1 });
    source.guidanceFor = vi.fn(code => code === 'purpose' ? 'Precision reproducibility quantitation' : 'Unselected toxicology instructions');
    const query = assemblySourceQuery('M5', source, selected);
    const marker = 'Bioanalytical assay validation confirmed precision reproducibility quantitation.';
    const picked = served(`${source.name}\n${filler}\n${marker}\n${filler}`, query);

    expect(picked.text).toContain(marker);
    expect(picked.span.start).toBeGreaterThan(0);
    expect(picked.span.end - picked.span.start).toBe(ASSEMBLY_SOURCE_EXCERPT_LIMIT);
    expect(query).not.toContain('catalogue0');
    expect(query).not.toContain('manufacturing');
    expect(query).not.toContain('toxicology');
    expect(source.guidanceFor).toHaveBeenCalledExactlyOnceWith('purpose');
  });

  it('puts title terms before guidance while retaining the selector\'s existing 40-term cap', () => {
    const guidance = Array.from({ length: 60 }, (_, index) => `guidance${index}`).join(' ');
    const query = assemblySourceQuery('M5', template('Precision reproducibility', guidance), selected);
    const terms = sectionTerms(query);

    expect(query).toContain(guidance);
    expect(terms).toHaveLength(40);
    expect(terms.slice(0, 2)).toEqual(['precision', 'reproducibility']);
    expect(terms).not.toContain('guidance59');
  });

  it('uses title alone when persisted templates have no drafting guidance', () => {
    const query = assemblySourceQuery(null, template('Assay reproducibility'), selected);
    const marker = 'Assay reproducibility was measured in this synthetic record.';
    expect(served(`${filler}\n${marker}\n${filler}`, query).text).toContain(marker);
    expect(query).not.toContain('undefined');
    expect(query).not.toContain('null');
  });

  it('can locate an English guidance-only passage when the title contains only selector stop words', () => {
    const query = assemblySourceQuery('M5', template('Summary', 'Bioanalytical precision reproducibility'), selected);
    const marker = 'Bioanalytical precision reproducibility results were recorded.';
    const picked = served(`${filler}\n${marker}\n${filler}`, query);
    expect(picked.span.start).toBeGreaterThan(0);
    expect(picked.text).toContain(marker);
  });

  it('retains raw Japanese guidance and the existing compound/bigram grouping', () => {
    const guidance = '有害事象発現率';
    const query = assemblySourceQuery(null, template('概要', guidance), selected);
    const background = '背景情報。'.repeat(3000);
    const marker = '有害事象の発現率は12％であった。';
    const source = `${background}\n重篤な事象は認められなかった。\n${background}\n${marker}\n${background}`;
    const picked = served(source, query);

    expect(query).toContain(guidance);
    expect(sectionTerms(query)).toEqual(sectionTerms(`概要 ${guidance}`));
    expect(picked.span.start).toBeGreaterThan(0);
    expect(picked.text).toContain(marker);
    expect(picked.text).not.toContain('重篤な事象は認められなかった。');
  });

  it('keeps the opening when selected terms do not match rather than falling back to generic metadata', () => {
    const source = template('Pharmacokinetics clearance');
    const text = `${filler}\n${source.name} M5\n${filler}`;
    const picked = served(text, assemblySourceQuery('M5', source, selected));
    expect(picked.span).toEqual({ start: 0, end: ASSEMBLY_SOURCE_EXCERPT_LIMIT, basis: 'opening' });
    expect(picked.text).toBe(text.slice(0, ASSEMBLY_SOURCE_EXCERPT_LIMIT));
  });

  it('keeps stop-only title/no-guidance selection at the opening', () => {
    const query = assemblySourceQuery(null, template('Summary'), selected);
    expect(sectionTerms(query)).toEqual([]);
    expect(served(filler, query).span).toEqual({ start: 0, end: ASSEMBLY_SOURCE_EXCERPT_LIMIT, basis: 'opening' });
  });

  it('keeps a short source whole irrespective of whether selected terms match', () => {
    const text = 'Short retained source with no assay result.';
    const picked = served(text, assemblySourceQuery(null, template('Pharmacokinetics clearance'), selected));
    expect(picked.span).toEqual({ start: 0, end: text.length, basis: 'whole' });
    expect(picked.text).toBe(text);
  });
});

describe('unchanged whole-document scope and canonical refusal', () => {
  it.each(['M5', null])('keeps the exact old whole-document query for module %s without adding section references', module => {
    const source = template('Specific assay title', 'Specific reference guidance');
    expect(assemblySourceQuery(module, source, { target: 'document' })).toBe(`${module ?? ''} ${source.name} `);
    expect(source.guidanceFor).not.toHaveBeenCalled();
  });

  it('refuses an unknown selected code before asking for any guidance', () => {
    const source = template();
    refusal(() => assemblySourceQuery('M5', source, { target: 'section', code: 'absent' }), 'ASSEMBLY_SECTION_NOT_FOUND', 404);
    expect(source.guidanceFor).not.toHaveBeenCalled();
  });

  it.each(['empty', 'empty-code', 'empty-title', 'unsafe-order', 'duplicate-other-code'] as const)(
    'refuses a %s template before selecting relevance context', invalid => {
      const source = template();
      if (invalid === 'empty') source.sections = [];
      if (invalid === 'empty-code') source.sections[0].code = ' ';
      if (invalid === 'empty-title') source.sections[0].title = ' ';
      if (invalid === 'unsafe-order') source.sections[0].ordering = Number.NaN;
      if (invalid === 'duplicate-other-code') source.sections.push(
        { code: 'other', title: 'Other heading', content: '', ordering: 1 },
        { code: ' OTHER ', title: 'Repeated unselected heading', content: '', ordering: 2 });
      refusal(() => assemblySourceQuery('M5', source, selected), 'ASSEMBLY_TEMPLATE_INVALID', 409);
      expect(source.guidanceFor).not.toHaveBeenCalled();
    });
});
