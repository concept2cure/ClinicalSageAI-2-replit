/**
 * authoring-read — AnA's read path over the authoring store, scoped to one
 * program of one tenant.
 *
 * Every case runs twice: over the SQL-aware fake (authoring-read-fixture.ts),
 * which filters only on the predicates the SQL contains, and over in-process
 * PGlite, which runs the same statements on a real Postgres engine. The fake is
 * what makes a missing tenant or program predicate leak; PGlite is what proves
 * the SQL is valid and that the hash, length, drafted and pending flags
 * computed in SQL are what the fake says they are.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  loadSection,
  outlineForProgram,
  readSection,
  searchSections,
  sectionDepth,
  sectionReadableText,
  sectionWindow,
  type AuthoringReadQueryable,
  type ReadOutcome,
  type SectionSearch,
  type SectionWindow,
} from '../authoring-read';
import {
  DOC_A1, DOC_A2, DOC_B1, DOC_X1, LONG_PARAGRAPH, OTHER_TENANT, PGLITE_DDL, PROGRAM_A, SEC, TENANT,
  FIGURE_PROPOSED_EMITTED, FIGURE_SETTLED_EMITTED, LONE_SURROGATE, WALK_CASES, WALK_SIZES,
  makeFakePool, outsideProposals, pgliteInsertDoc, pgliteInsertSection, pglitePool, pgliteSeed, seedState,
  withoutContinuations, type FakeDoc, type FakeSection, type FakeState,
} from './authoring-read-fixture';

interface Harness {
  name: string;
  pool: () => AuthoringReadQueryable;
  reset: () => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  addDoc: (d: FakeDoc) => Promise<void>;
  addSection: (s: FakeSection) => Promise<void>;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

function fakeHarness(): Harness {
  let state: FakeState = seedState();
  return {
    name: 'the SQL-aware fake',
    pool: () => makeFakePool(state),
    reset: async () => { state = seedState(); },
    deleteSection: async (id) => { state.sections = state.sections.filter((s) => s.id !== id); },
    addDoc: async (d) => { state.docs.push(d); },
    addSection: async (s) => { state.sections.push(s); },
  };
}

function pgliteHarness(): Harness {
  let db: PGlite;
  return {
    name: 'PGlite',
    pool: () => pglitePool(db),
    setup: async () => { db = new PGlite(); await db.exec(PGLITE_DDL); },
    teardown: async () => { await db.close(); },
    reset: async () => { await pgliteSeed(db, seedState()); },
    deleteSection: async (id) => { await db.query('DELETE FROM authoring_sections WHERE id = $1', [id]); },
    addDoc: (d) => pgliteInsertDoc(db, d),
    addSection: (s) => pgliteInsertSection(db, s),
  };
}

let extra = 0;
/** A section of program A's first document, with a fresh id. */
function sectionOf(code: string | null, content: string, order = 50, docId = DOC_A1): FakeSection {
  extra++;
  return {
    id: `00000000-0000-4000-a000-${String(extra).padStart(12, '0')}`, doc_id: docId, tenant_id: TENANT,
    code, title: `Extra ${extra}`, content, order_index: order, updated_at: '2026-09-30T12:00:00.000Z',
  };
}

const PROPOSED_TEXT = 'Zeta zone zigzag. ';
const SETTLED_TEXT = 'Settled text. ';

function value<T>(o: ReadOutcome<T>): T {
  if (!o.ok) throw new Error(`expected ok, got ${o.code}: ${o.message}`);
  return o.value;
}

const A = { tenantId: TENANT, programId: PROGRAM_A };
const FOREIGN_SECTIONS = [SEC.b1_2_5, SEC.x1_2_5, SEC.x2_2_5];

function outlineCases(h: Harness): void {
  it('lists the program\'s documents, oldest first, with their section counts — and no other program\'s', async () => {
    const page = value(await outlineForProgram(h.pool(), A));
    expect(page.documents.map((d) => [d.id, d.sectionCount])).toEqual([[DOC_A1, 4], [DOC_A2, 3]]);
    expect(page.totalSections).toBe(7);
  });

  it('orders sections by CTD code (2.5 < 2.5.1 < 2.5.10; S before P), uncoded last, with depth from the code', async () => {
    const page = value(await outlineForProgram(h.pool(), A));
    expect(page.sections.map((s) => [s.code, s.depth])).toEqual([
      ['2.5', 2], ['2.5.1', 3], ['2.5.10', 3], [null, 1],
      ['3.2.S.1', 4], ['3.2.S.1.1', 5], ['3.2.P.1', 4],
    ]);
  });

  it('describes each section without its content: length, SQL sha256, drafted, pending changes', async () => {
    const page = value(await outlineForProgram(h.pool(), A));
    const st = seedState();
    for (const s of page.sections) {
      const stored = st.sections.find((x) => x.id === s.id)?.content ?? '';
      expect(s.sha256, String(s.code)).toBe(createHash('sha256').update(stored, 'utf8').digest('hex'));
      expect(s.length, String(s.code)).toBe(stored.length);
      expect(Object.keys(s)).not.toContain('content');
    }
    const by = (code: string | null) => page.sections.find((s) => s.code === code);
    expect(by(null)?.drafted).toBe(false);
    expect(by('2.5.1')?.drafted).toBe(false); // markup and whitespace only
    expect(by('2.5')?.drafted).toBe(true);
    expect(page.sections.filter((s) => s.pendingChanges).map((s) => s.code)).toEqual(['3.2.P.1']);
  });

  it('an empty-string code has no place in the CTD order either: it follows the coded sections, like null', async () => {
    await h.addSection(sectionOf('', '<p>blank code</p>', 0));
    await h.addSection(sectionOf('  ', '<p>spaces for a code</p>', 0));
    const codes = value(await outlineForProgram(h.pool(), { ...A, documentId: DOC_A1 })).sections.map((s) => s.code);
    expect(codes.slice(0, 3)).toEqual(['2.5', '2.5.1', '2.5.10']);
    expect(codes.slice(3).map((c) => (c ?? '').trim())).toEqual(['', '', '']);
  });

  it('flags pending changes from <ins>/<del> tags in any case, and not from prose that starts like one', async () => {
    const upper = sectionOf('9.1', '<P>Upper <INS data-author-name="X">pending</INS></P>');
    const del = sectionOf('9.2', '<p>Old <Del data-author-name="X">text</Del></p>');
    const prose = sectionOf('9.3', '<p>Dose of &lt;insulin&gt; per <input> form and <insulin> or <delta></p>');
    for (const x of [upper, del, prose]) await h.addSection(x);
    const by = new Map(value(await outlineForProgram(h.pool(), { ...A, documentId: DOC_A1 })).sections.map((s) => [s.id, s.pendingChanges]));
    expect([by.get(upper.id), by.get(del.id), by.get(prose.id)]).toEqual([true, true, false]);
  });

  it('narrows to one document of the program; another program\'s or tenant\'s document is not found', async () => {
    const one = value(await outlineForProgram(h.pool(), { ...A, documentId: DOC_A2 }));
    expect(one.documents.map((d) => d.id)).toEqual([DOC_A2]);
    expect(one.sections.map((s) => s.code)).toEqual(['3.2.S.1', '3.2.S.1.1', '3.2.P.1']);
    for (const foreign of [DOC_B1, DOC_X1, 'not-a-uuid']) {
      const out = await outlineForProgram(h.pool(), { ...A, documentId: foreign });
      expect(out.ok, foreign).toBe(false);
      if (!out.ok) expect(out.code).toBe('not_found');
    }
  });
}

function outlinePagingCases(h: Harness): void {
  it('pages with a cursor: walking limit=2 yields the single-page order exactly, then a null cursor', async () => {
    const all = value(await outlineForProgram(h.pool(), A)).sections.map((s) => s.id);
    const walked: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = value(await outlineForProgram(h.pool(), { ...A, limit: 2, cursor }));
      walked.push(...page.sections.map((s) => s.id));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);
    expect(walked).toEqual(all);
    // Two document entries and seven sections: nine entries, five pages of two.
    expect(pages).toBe(5);
  });

  it('pages the documents too: each is listed once, where the walk reaches it, and the count still to come is exact', async () => {
    const DOCS = 30;
    for (let i = 0; i < DOCS; i++) {
      const id = `00000000-0000-4000-b000-${String(i).padStart(12, '0')}`;
      await h.addDoc({
        id, title: `Extra document ${i}`, module: 'M3', product_code: 'IND', status: 'draft', tenant_id: TENANT,
        client_program_id: PROGRAM_A, created_at: `2026-09-10T00:00:${String(i).padStart(2, '0')}.000Z`, updated_at: '2026-09-10T00:00:00.000Z',
      });
      if (i % 3 === 0) await h.addSection(sectionOf(`3.2.A.${i}`, '<p>x</p>', 0, id));
    }
    const total = 2 + DOCS;
    const listed: string[] = [];
    const sections: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = value(await outlineForProgram(h.pool(), { ...A, limit: 4, cursor }));
      expect(page.sections.length + page.documents.length, `page ${pages}`).toBeLessThanOrEqual(4);
      listed.push(...page.documents.map((d) => d.id));
      sections.push(...page.sections.map((s) => s.id));
      expect(page.documentCount).toBe(total);
      expect(page.documentsAfterPage, `page ${pages}`).toBe(total - listed.length);
      // A section whose document entry was on an earlier page says which document it continues.
      const here = new Set(page.documents.map((d) => d.id));
      for (const s of page.sections) {
        if (!here.has(s.docId)) expect(page.continuingDocument?.id, `page ${pages}`).toBe(s.docId);
      }
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 100);
    expect(new Set(listed).size).toBe(total);
    expect(listed).toHaveLength(total);
    expect(sections).toHaveLength(7 + DOCS / 3);
  });

  it('a cursor still resumes after the section it names has been deleted', async () => {
    const first = value(await outlineForProgram(h.pool(), { ...A, limit: 3 }));
    expect(first.documents.map((d) => d.id)).toEqual([DOC_A1]);
    expect(first.sections.map((s) => s.code)).toEqual(['2.5', '2.5.1']);
    await h.deleteSection(SEC.a1_2_5_1);
    const next = value(await outlineForProgram(h.pool(), { ...A, limit: 2, cursor: first.nextCursor ?? undefined }));
    expect(next.sections.map((s) => s.code)).toEqual(['2.5.10', null]);
  });

  it('refuses a cursor it did not issue', async () => {
    const out = await outlineForProgram(h.pool(), { ...A, cursor: 'not-a-cursor' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('bad_input');
  });

}

function readCases(h: Harness): void {
  it('keeps block structure and labels pending tracked changes as proposals, never as settled text', async () => {
    const w = value(await readSection(h.pool(), { ...A, sectionId: SEC.a2_3_2_P_1 }));
    expect(w.text).toContain('## Batch formula');
    expect(w.text).toContain('The batch size is \u27E6proposed deletion by Dr. Lee: 100\u27E7\u27E6proposed insertion by AnA: 200\u27E7 kg.');
    expect(w.text).toContain('- Granulation\n- Compression');
    expect(w.text).toContain('Component | Amount\nAPI | 50 mg');
    expect(w).toMatchObject({ docId: DOC_A2, docTitle: 'Quality', code: '3.2.P.1', offset: 0, nextOffset: null });
  });

  it('windows by offset/maxChars; the windows concatenate to the whole section', async () => {
    const whole = value(await readSection(h.pool(), { ...A, sectionId: SEC.a2_3_2_P_1 }));
    const parts: string[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const w: Awaited<ReturnType<typeof readSection>> = await readSection(h.pool(), { ...A, sectionId: SEC.a2_3_2_P_1, offset, maxChars: 50 });
      const v = value(w);
      expect(v.offset).toBe(offset);
      // At most 50 of the section's own characters; the labels a cut adds come on top.
      expect((v.nextOffset ?? v.totalChars) - v.offset).toBeLessThanOrEqual(51);
      expect(v.totalChars).toBe(whole.totalChars);
      outsideProposals(v.text); // every window closes what it opens
      parts.push(withoutContinuations(v.text));
      offset = v.nextOffset;
    }
    expect(parts.join('')).toBe(whole.text);
  });

  it('caps a window at 4000 characters whatever is asked for', async () => {
    const w = value(await readSection(h.pool(), { ...A, sectionId: SEC.a1_2_5, maxChars: 99_999 }));
    expect(LONG_PARAGRAPH.length).toBeGreaterThan(4000);
    expect(w.text.length).toBe(4000);
    expect(w.nextOffset).toBe(4000);
    expect(w.totalChars).toBe(LONG_PARAGRAPH.length);
  });

  // Proposed text in these cases is the only text with a "z" in it, so any "z"
  // outside a ⟦…⟧ label is proposed text being passed off as settled.
  const PROPOSED = 'Zeta zone zigzag. ';
  const SETTLED = 'Settled text. ';

  it('a pending insertion that straddles the window boundary stays labelled on both sides of the cut', async () => {
    const s = sectionOf('3.2.P.8', `<p>${SETTLED.repeat(280)}<ins data-author-name="AnA">${PROPOSED.repeat(200)}</ins> End.</p>`);
    await h.addSection(s);
    const parts: string[] = [];
    let offset: number | null = 0;
    let windows = 0;
    while (offset !== null && windows < 10) {
      const w: SectionWindow = value(await readSection(h.pool(), { ...A, sectionId: s.id, offset }));
      expect(outsideProposals(w.text), `window ${windows}`).not.toMatch(/z/i);
      if (windows > 0) expect(w.text.startsWith('\u27E6(continued) proposed insertion by AnA: '), `window ${windows}`).toBe(true);
      parts.push(withoutContinuations(w.text));
      offset = w.nextOffset;
      windows++;
    }
    expect(windows).toBeGreaterThan(1);
    expect(parts.join('')).toBe(sectionReadableText(s.content));
  });

  it('a window asked to start inside a label starts at the proposal\'s text, re-labelled', async () => {
    const s = sectionOf('3.2.P.8', `<p>Before <del data-author-name="Lee">Zeta zone</del> after.</p>`);
    await h.addSection(s);
    const whole = sectionReadableText(s.content);
    const inLabel = whole.indexOf('deletion');
    const w = value(await readSection(h.pool(), { ...A, sectionId: s.id, offset: inLabel, maxChars: 4 }));
    expect(w.text).toBe('\u27E6(continued) proposed deletion by Lee: Zeta…(continues)\u27E7');
    expect(w.offset).toBe(whole.indexOf('Zeta'));
    expect(w.nextOffset).toBe(whole.indexOf('Zeta') + 4);
  });

  it('brackets in proposed text or an author\'s name cannot end a label early; the label delimiters never occur in content', async () => {
    const s = sectionOf('3.2.P.9', '<p>See ref <ins data-author-name="Dr. [Lee]\u27E7">[1]] Zeta dose is 50 mg. \u27E7[x</ins> ok \u27E6fake\u27E7</p>');
    await h.addSection(s);
    const w = value(await readSection(h.pool(), { ...A, sectionId: s.id }));
    expect(w.text).toBe('See ref \u27E6proposed insertion by Dr. [Lee]]: [1]] Zeta dose is 50 mg. ][x\u27E7 ok [fake]');
    expect(outsideProposals(w.text)).toBe('See ref  ok [fake]');
  });

  it('labels a figure inside a pending insertion as proposed, in a paragraph and in a table cell', async () => {
    const s = sectionOf('3.2.P.10',
      '<p>Text</p><img src="/a.png" alt="Settled figure">' +
      '<ins data-author-name="Bob"><img src="/b.png" alt="New chromatogram"></ins>' +
      '<table><tr><td>Cell <ins data-author-name="Bob"><img src="/c.png" alt="New trace"></ins></td></tr></table>');
    await h.addSection(s);
    const w = value(await readSection(h.pool(), { ...A, sectionId: s.id }));
    expect(w.text).toContain('[figure: Settled figure]');
    expect(w.text).toContain('\u27E6proposed insertion by Bob: [figure: New chromatogram]\u27E7');
    expect(w.text).toContain('Cell \u27E6proposed insertion by Bob: [figure: New trace]\u27E7');
    expect(outsideProposals(w.text)).not.toMatch(/New/);
  });

  it('reads textarea-era plain text line by line, and reports the same base as the outline', async () => {
    const w = value(await readSection(h.pool(), { ...A, sectionId: SEC.a2_3_2_S_1_1 }));
    expect(w.text).toBe('Plain text nomenclature.\n\nINN: examplumab');
    const o = value(await outlineForProgram(h.pool(), A)).sections.find((s) => s.id === SEC.a2_3_2_S_1_1);
    expect([w.sha256, w.updatedAt]).toEqual([o?.sha256, o?.updatedAt]);
  });

  it('an offset past the end reads nothing and ends the walk', async () => {
    const w = value(await readSection(h.pool(), { ...A, sectionId: SEC.a2_3_2_S_1_1, offset: 10_000 }));
    expect([w.text, w.nextOffset]).toEqual(['', null]);
  });
}

/** Second verifier round: walks at every window size, captions, and figures the parser skipped. */
function renderingCases(h: Harness): void {
  // D1 (round 2): a 1-character window stopped advancing on an emoji inside a
  // proposal (0→1 1→2 2→29 29→29). These sections put astral characters in
  // settled text, at a proposal's first and last character, in adjacent
  // proposals, in a caption and in table cells.
  it('a walk at every window size from 1 up advances on every call, never splits a surrogate pair, and delivers every character once', async () => {
    for (const html of WALK_CASES) {
      const s = sectionOf('7.1', html);
      await h.addSection(s);
      const loaded = value(await loadSection(h.pool(), { ...A, sectionId: s.id }));
      const whole = loaded.rendered.text;
      expect(whole).not.toMatch(LONE_SURROGATE);
      for (const size of WALK_SIZES) {
        const parts: string[] = [];
        let offset = 0;
        let calls = 0;
        for (;;) {
          const w = sectionWindow(loaded, offset, size);
          const at = `${html} size ${size} offset ${offset}`;
          expect(w.offset, at).toBe(offset);
          expect(w.text, at).not.toMatch(LONE_SURROGATE);
          outsideProposals(w.text);
          parts.push(withoutContinuations(w.text));
          if (w.nextOffset === null) break;
          expect(w.nextOffset, at).toBeGreaterThan(offset);
          offset = w.nextOffset;
          if (++calls > whole.length) throw new Error(`the walk did not end: ${at}`);
        }
        expect(parts.join(''), `${html} size ${size}`).toBe(whole);
      }
      // From ANY offset, even one inside a pair or a label, a 1-character window moves on and splits nothing.
      for (let off = 0; off < whole.length; off++) {
        const w = sectionWindow(loaded, off, 1);
        expect(w.text, `${html} offset ${off}`).not.toMatch(LONE_SURROGATE);
        expect(w.nextOffset ?? whole.length, `${html} offset ${off}`).toBeGreaterThan(off);
      }
    }
  });

  // D2 (round 2): a table caption was read as plain text, so proposed words in it went unlabelled.
  it('labels proposed text in a table caption, and reads only the table\'s own caption, never a nested table\'s', async () => {
    const cases: Array<[string, string]> = [
      ['<table><caption>Assay <ins data-author-name="Ann">zeta limits</ins></caption><tr><td>Row</td></tr></table>',
        'Table: Assay ⟦proposed insertion by Ann: zeta limits⟧\nRow'],
      ['<table><caption>Assay <del data-author-name="Ann">zeta limits</del></caption><tr><td>Row</td></tr></table>',
        'Table: Assay ⟦proposed deletion by Ann: zeta limits⟧\nRow'],
      ['<ins data-author-name="Ann"><table><caption>Zeta caption</caption><tr><td>Zeta cell</td></tr></table></ins><p>After.</p>',
        'Table: ⟦proposed insertion by Ann: Zeta caption⟧\n⟦proposed insertion by Ann: Zeta cell⟧\n\nAfter.'],
      ['<table><caption>Outer caption</caption><tr><td><table><caption>Inner</caption><tr><td>x</td></tr></table></td></tr></table>',
        'Table: Outer caption\nInner x'],
    ];
    for (const [html, want] of cases) {
      const s = sectionOf('7.2', html);
      await h.addSection(s);
      const w = value(await readSection(h.pool(), { ...A, sectionId: s.id }));
      expect(w.text, html).toBe(want);
      expect(outsideProposals(w.text), html).not.toMatch(/zeta/i);
    }
    const nested = sectionOf('7.3', '<table><tr><td>Outer <table><caption>Inner caption</caption><tr><td>inner</td></tr></table></td></tr></table>');
    await h.addSection(nested);
    const w = value(await readSection(h.pool(), { ...A, sectionId: nested.id }));
    expect(w.text).not.toContain('Table:');
    expect(w.text).toContain('Outer');
  });

  // D3 (round 2): figure state was queued per src, so an image the parser
  // skipped (in a caption, directly in a row, in an empty citation anchor)
  // took the state meant for the next copy of the same image.
  it('a figure the parser skipped never shifts a later copy\'s proposal state, in either order', async () => {
    for (const html of FIGURE_PROPOSED_EMITTED) {
      const s = sectionOf('7.4', html);
      await h.addSection(s);
      const t = value(await readSection(h.pool(), { ...A, sectionId: s.id })).text;
      expect(t, html).toContain('⟦proposed insertion by Ann: [figure: Zeta figure]⟧');
      expect(outsideProposals(t), html).not.toMatch(/zeta/i);
    }
    for (const html of FIGURE_SETTLED_EMITTED) {
      const s = sectionOf('7.5', html);
      await h.addSection(s);
      const t = value(await readSection(h.pool(), { ...A, sectionId: s.id })).text;
      expect(outsideProposals(t), html).toContain('[figure: Settled figure]');
    }
  });
}

function searchCases(h: Harness): void {
  it('finds a phrase in tag-stripped content, with a snippet around the hit', async () => {
    const r = value(await searchSections(h.pool(), { ...A, query: 'BIOAVAILABILITY' }));
    expect(r.hits.map((x) => x.sectionId)).toEqual([SEC.a1_2_5_10]);
    expect(r.hits[0]).toMatchObject({ docId: DOC_A1, docTitle: 'Module 2 summaries', code: '2.5.10' });
    expect(r.hits[0].snippet).toContain('bioavailability is adequate');
  });

  it('matches section codes and titles too', async () => {
    expect(value(await searchSections(h.pool(), { ...A, query: '3.2.S.1.1' })).hits.map((x) => x.code)).toEqual(['3.2.S.1.1']);
    expect(value(await searchSections(h.pool(), { ...A, query: 'nomenclature' })).hits.map((x) => x.code)).toEqual(['3.2.S.1.1']);
  });

  it('treats % and _ in the query as literal characters, not wildcards', async () => {
    expect(value(await searchSections(h.pool(), { ...A, query: '0%' })).hits.map((x) => x.code)).toEqual(['3.2.S.1']);
    expect(value(await searchSections(h.pool(), { ...A, query: '50_m' })).hits.map((x) => x.code)).toEqual(['3.2.S.1']);
  });

  it('keeps snippets short in a long section', async () => {
    const r = value(await searchSections(h.pool(), { ...A, query: 'shelf life' }));
    expect(r.hits.map((x) => x.code)).toEqual(['2.5']);
    expect(r.hits[0].snippet.length).toBeLessThanOrEqual(260);
  });

  it('honours the limit and says the list was cut', async () => {
    const r = value(await searchSections(h.pool(), { ...A, query: 'the', limit: 2 }));
    expect(r.hits).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });

  it('orders matches in CTD order BEFORE the limit, so the first hit is the first section, not the first stored', async () => {
    // 2.5.10 is stored first (order_index 0) and 2.5 second; both say "the".
    const r = value(await searchSections(h.pool(), { ...A, query: 'the', limit: 1 }));
    expect(r.hits.map((x) => x.code)).toEqual(['2.5']);
  });

  it('says so when more sections matched than are ranked', async () => {
    const r = value(await searchSections(h.pool(), { ...A, query: 'the', scanMax: 1 }));
    expect([r.scanCapped, r.truncated, r.totalMatches, r.hits.length]).toEqual([true, true, 1, 1]);
  });

  it('pages by offset: the pages together are every match once, in CTD order', async () => {
    const all = value(await searchSections(h.pool(), { ...A, query: 'the', limit: 25 }));
    expect(all.nextOffset).toBeNull();
    const walked: string[] = [];
    let offset: number | null = 0;
    let pages = 0;
    while (offset !== null && pages < 10) {
      const r: SectionSearch = value(await searchSections(h.pool(), { ...A, query: 'the', limit: 1, offset }));
      expect(r.totalMatches).toBe(all.hits.length);
      walked.push(...r.hits.map((x) => x.sectionId));
      offset = r.nextOffset;
      pages++;
    }
    expect(walked).toEqual(all.hits.map((x) => x.sectionId));
    expect(all.hits.length).toBeGreaterThan(1);
  });

  it('a snippet deep inside a pending insertion, or a deletion, is labelled as proposed', async () => {
    const ins = sectionOf('4.1', `<p>${SETTLED_TEXT.repeat(40)}<ins data-author-name="AnA">${PROPOSED_TEXT.repeat(60)}MARKER-Zq ${PROPOSED_TEXT.repeat(60)}</ins></p>`);
    const del = sectionOf('4.2', `<p>${SETTLED_TEXT.repeat(40)}<del data-author-name="Lee">${PROPOSED_TEXT.repeat(60)}MARKER-Zd ${PROPOSED_TEXT.repeat(60)}</del></p>`);
    for (const x of [ins, del]) await h.addSection(x);
    for (const [q, kind] of [['MARKER-Zq', 'insertion'], ['MARKER-Zd', 'deletion']] as const) {
      const r = value(await searchSections(h.pool(), { ...A, query: q }));
      expect(r.hits).toHaveLength(1);
      const snip = r.hits[0].snippet;
      expect(snip).toContain(q);
      expect(snip).toContain(`\u27E6(continued) proposed ${kind} by`);
      expect(outsideProposals(snip), snip).not.toMatch(/z/i);
    }
  });

  it('a snippet whose hit spans settled and proposed text still finds the hit and labels the proposed part', async () => {
    const s = sectionOf('4.3', '<p>The dose is <ins data-author-name="AnA">zeta-raised to 40 mg</ins> daily.</p>');
    await h.addSection(s);
    const r = value(await searchSections(h.pool(), { ...A, query: 'dose is zeta-raised' }));
    expect(r.hits[0].snippet).toBe('The dose is \u27E6proposed insertion by AnA: zeta-raised to 40 mg\u27E7 daily.');
  });

  // D5 (round 2): the SQL match turns every tag into a space; the rendered
  // text has none between `is` and an insertion, and puts list markers, cell
  // separators and heading marks between blocks. The snippet must still show the match.
  it('a snippet shows the matched text when the match runs across a tag, list items, table cells or blocks', async () => {
    const pad = 'Filler sentence here. '.repeat(40);
    const sections = [
      sectionOf('4.4', `<p>${pad}The dose is<ins data-author-name="AnA">zeta-raised to 50 mg</ins>.</p>`),
      sectionOf('4.5', `<ul><li>${pad}</li><li>alpha beta</li><li>gamma delta</li></ul>`),
      sectionOf('4.6', `<p>${pad}</p><table><tr><td>kappa</td><td>lambda</td></tr></table>`),
      sectionOf('4.7', `<p>${pad}end of omicron</p><h2>Sigma heading</h2>`),
    ];
    for (const x of sections) await h.addSection(x);
    const snippet = async (query: string): Promise<string> => {
      const r = value(await searchSections(h.pool(), { ...A, query }));
      expect(r.hits, query).toHaveLength(1);
      return r.hits[0].snippet;
    };
    const ins = await snippet('dose is zeta-raised');
    expect(ins).toContain('The dose is⟦proposed insertion by AnA: zeta-raised to 50 mg⟧.');
    expect(outsideProposals(ins)).not.toMatch(/zeta/i);
    expect(await snippet('beta gamma')).toContain('- alpha beta - gamma delta');
    expect(await snippet('kappa lambda')).toContain('kappa | lambda');
    expect(await snippet('omicron sigma')).toContain('end of omicron ## Sigma heading');
  });

  it('refuses a query too short to mean anything', async () => {
    const out = await searchSections(h.pool(), { ...A, query: ' ' });
    expect(out.ok).toBe(false);
  });
}

function scopeCases(h: Harness): void {
  it('another program and another tenant are invisible to the outline', async () => {
    const ids = value(await outlineForProgram(h.pool(), A)).sections.map((s) => s.id);
    for (const f of FOREIGN_SECTIONS) expect(ids, f).not.toContain(f);
  });

  it('another program\'s and another tenant\'s sections are not found by id', async () => {
    for (const f of FOREIGN_SECTIONS) {
      const out = await readSection(h.pool(), { ...A, sectionId: f });
      expect(out.ok, f).toBe(false);
      if (!out.ok) expect(out.code).toBe('not_found');
    }
  });

  it('search never returns another program\'s or tenant\'s text', async () => {
    const r = value(await searchSections(h.pool(), { ...A, query: 'FOREIGN' }));
    expect(r.hits).toEqual([]);
  });

  it('the other tenant, asking for the same program id, sees only its own document', async () => {
    const page = value(await outlineForProgram(h.pool(), { tenantId: OTHER_TENANT, programId: PROGRAM_A }));
    expect(page.documents.map((d) => d.id)).toEqual([DOC_X1]);
    expect(page.sections.map((s) => s.id)).toEqual([SEC.x1_2_5]);
  });
}

describe.each([fakeHarness(), pgliteHarness()])('authoring-read over $name', (h) => {
  beforeAll(async () => { await h.setup?.(); }, 60_000);
  afterAll(async () => { await h.teardown?.(); });
  beforeEach(async () => { await h.reset(); });
  describe('outlineForProgram', () => outlineCases(h));
  describe('outlineForProgram paging', () => outlinePagingCases(h));
  describe('readSection', () => readCases(h));
  describe('readSection rendering', () => renderingCases(h));
  describe('searchSections', () => searchCases(h));
  describe('tenant and program scope', () => scopeCases(h));
});

describe('sectionDepth', () => {
  it('counts dotted segments of a numeric-led code, and calls anything else depth 1', () => {
    expect(['2.5', '2.5.1', '2.5.10', '3.2.S.1.1', 'M3', '1', 'Introduction', '', null].map(sectionDepth))
      .toEqual([2, 3, 3, 5, 1, 1, 1, 1, 1]);
  });
});
