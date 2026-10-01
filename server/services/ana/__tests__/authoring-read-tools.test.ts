/**
 * AnA's three read-only authoring tools, driven through their handlers.
 *
 * No model turn: the handlers are registered on a local map and called with a
 * literal tool context. Every scope and result case runs twice, as the service
 * suite does: over the SQL-aware fake store
 * (services/authoring/__tests__/authoring-read-fixture.ts), which leaks another
 * program's rows to any query that forgets to filter on it, and over PGlite,
 * where the open program is looked up by the real resolveOpenProgram SQL. That
 * second run is what makes "another organization cannot open this program" a
 * property of the lookup query rather than of the fake. What is pinned:
 *
 *   - the open program comes from the tool context, never from input, and a
 *     turn with no open program is refused verbatim;
 *   - an id from another program or tenant is "not found in this project",
 *     with nothing of that record in the answer;
 *   - no result carries a top-level `status` (the stream treats
 *     status:'generated' with content as a draft to persist, stream.ts
 *     2388-2418);
 *   - no input is named like model prose (governed-write-tools FREE_TEXT_FIELD),
 *     which would put these read tools under the drafting-model gate;
 *   - every result fits 5000 characters as serialized, so a round of four
 *     parallel reads passes the per-round budget (agentic-loop.ts
 *     budgetToolResultsForModel, 24000) untouched, and each page's cursor or
 *     offset continues exactly where the delivered text stopped.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { ToolContext } from '../AnaToolExecutor';
import { budgetToolResultsForModel } from '../agentic-loop';
import { FREE_TEXT_FIELD, freeTextFields } from '../governed-write-tools';
import {
  AUTHORING_READ_NO_PROJECT,
  AUTHORING_READ_TOOLS,
  READ_AUTHORING_SECTION,
  registerAuthoringReadHandlers,
} from '../authoring-read-tools';
import type { AuthoringReadQueryable } from '../../authoring/authoring-read';
import {
  DOC_A1, DOC_B1, DOC_X1, OTHER_TENANT, PGLITE_DDL, PROGRAM_A, PROGRAM_B, PROGRAM_C, SEC, TENANT,
  makeFakePool, outsideProposals, pgliteInsertDoc, pgliteInsertSection, pglitePool, pgliteSeed, seedState,
  withoutContinuations, type FakeDoc, type FakeSection, type FakeState,
} from '../../authoring/__tests__/authoring-read-fixture';

type Handler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;

/** What a single tool result may weigh, serialized: a quarter of the round budget, less headroom. */
const RESULT_MAX = 5000;

interface Harness {
  name: string;
  pool: () => AuthoringReadQueryable;
  reset: () => Promise<void>;
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
    addDoc: (d) => pgliteInsertDoc(db, d),
    addSection: (s) => pgliteInsertSection(db, s),
  };
}

const OPEN: ToolContext = { organizationId: TENANT, userId: 7, projectRef: PROGRAM_A };
const NAMES = ['list_authoring_outline', 'read_authoring_section', 'search_authoring_sections'];

const SAMPLE_INPUT: Record<string, Record<string, unknown>> = {
  list_authoring_outline: {},
  read_authoring_section: { section_id: SEC.a2_3_2_P_1 },
  search_authoring_sections: { query: 'bioavailability' },
};

let n = 0;
const nextId = (prefix: string) => `00000000-0000-4000-${prefix}-${String(++n).padStart(12, '0')}`;

function sectionOf(code: string | null, title: string, content: string, order = 50, docId = DOC_A1): FakeSection {
  return {
    id: nextId('c000'), doc_id: docId, tenant_id: TENANT, code, title, content, order_index: order,
    updated_at: '2026-09-30T12:00:00.000Z',
  };
}

function docOf(title: string, createdAt: string): FakeDoc {
  return {
    id: nextId('d000'), title, module: 'Module 3 — Quality, drug substance and drug product', product_code: 'IND-123456',
    status: 'draft', tenant_id: TENANT, client_program_id: PROGRAM_A, created_at: createdAt, updated_at: createdAt,
  };
}

describe('tool definitions', () => {
  let handlers: Map<string, Handler>;
  beforeEach(() => {
    handlers = new Map();
    registerAuthoringReadHandlers((name, h) => handlers.set(name, h), { pool: () => makeFakePool(seedState()) });
  });

  it('defines and registers exactly the three read tools', () => {
    expect(AUTHORING_READ_TOOLS.map((t) => t.name)).toEqual(NAMES);
    expect([...handlers.keys()]).toEqual(NAMES);
  });

  it('names no input like model-written prose', () => {
    for (const t of AUTHORING_READ_TOOLS) {
      expect(freeTextFields(t.input_schema), t.name).toEqual([]);
      for (const key of Object.keys(t.input_schema.properties)) expect(FREE_TEXT_FIELD.test(key), key).toBe(false);
    }
  });

  it('says what it reads, that it is read-only and project-scoped, and where the Vault tools fit', () => {
    for (const t of AUTHORING_READ_TOOLS) {
      expect(t.description, t.name).toMatch(/read-only/i);
      expect(t.description, t.name).toMatch(/open project/i);
      expect(t.description, t.name).toMatch(/read_project_document|list_project_documents/);
    }
  });

  it('says what a pending change means: deleted text is still in the document, inserted text is not yet', () => {
    const d = READ_AUTHORING_SECTION.description;
    expect(d).toMatch(/proposed deletion[^.]*still (?:part of |in )the (?:current )?document/i);
    expect(d).toMatch(/proposed insertion[^.]*not (?:yet )?(?:part of |in )the document/i);
    expect(d).toContain('⟦');
  });

  it('takes no program or project id as input — the scope is the conversation\'s open project', () => {
    for (const t of AUTHORING_READ_TOOLS) {
      expect(Object.keys(t.input_schema.properties).filter((k) => /program|project|tenant|org/i.test(k)), t.name).toEqual([]);
    }
  });

  it('imports only types from the executor (no runtime import cycle)', () => {
    const src = readFileSync(path.resolve(__dirname, '..', 'authoring-read-tools.ts'), 'utf8');
    const fromExecutor = src.split('\n').filter((l) => /from '\.\/AnaToolExecutor(\.js)?'/.test(l));
    expect(fromExecutor.length).toBeGreaterThan(0);
    for (const line of fromExecutor) expect(line).toMatch(/^import type /);
  });
});

type Call = (name: string, input: Record<string, unknown>, ctx?: ToolContext) => Promise<{ raw: string; json: Record<string, unknown> }>;

/** Set the harness up around a describe block, re-seed it before each case, and hand back a caller of its handlers. */
function useHarness(h: Harness): Call {
  let handlers: Map<string, Handler>;
  beforeAll(async () => { await h.setup?.(); }, 60_000);
  afterAll(async () => { await h.teardown?.(); });
  beforeEach(async () => {
    await h.reset();
    handlers = new Map();
    registerAuthoringReadHandlers((name, fn) => handlers.set(name, fn), { pool: () => h.pool() });
  });
  return async (name, input, ctx = OPEN) => {
    const fn = handlers.get(name);
    if (!fn) throw new Error(`${name} not registered`);
    const raw = await fn(input, ctx);
    return { raw, json: JSON.parse(raw) as Record<string, unknown> };
  };
}

function scopeCases(call: Call): void {
  for (const name of NAMES) {
    it(`${name} refuses verbatim with no open project`, async () => {
      const { json } = await call(name, SAMPLE_INPUT[name], { organizationId: TENANT, userId: 7 });
      expect(json.error).toBe(AUTHORING_READ_NO_PROJECT(name));
    });

    it(`${name} refuses a project of another organization as no open project`, async () => {
      const { json } = await call(name, SAMPLE_INPUT[name], { organizationId: TENANT, userId: 7, projectRef: PROGRAM_C });
      expect(json.error).toBe(AUTHORING_READ_NO_PROJECT(name));
    });

    it(`${name} never returns a top-level status (the stream would persist status:'generated' as a draft)`, async () => {
      const { json } = await call(name, SAMPLE_INPUT[name]);
      expect(json.error).toBeUndefined();
      expect(Object.keys(json)).not.toContain('status');
    });
  }

  it('read_authoring_section: another program\'s and another tenant\'s sections are not found in this project', async () => {
    for (const id of [SEC.b1_2_5, SEC.x1_2_5, SEC.x2_2_5]) {
      const { raw, json } = await call('read_authoring_section', { section_id: id });
      expect(String(json.error), id).toMatch(/not found in this project/);
      expect(raw).not.toMatch(/FOREIGN/);
    }
  });

  it('list_authoring_outline: another program\'s or tenant\'s document is not found in this project', async () => {
    for (const id of [DOC_B1, DOC_X1]) {
      const { raw, json } = await call('list_authoring_outline', { document_id: id });
      expect(String(json.error), id).toMatch(/not found in this project/);
      expect(raw).not.toMatch(/FOREIGN|Other program|Other tenant/);
    }
  });

  it('the open program decides, not the tenant alone: program B sees only its own document', async () => {
    const { raw } = await call('list_authoring_outline', {}, { organizationId: TENANT, userId: 7, projectRef: PROGRAM_B });
    expect(raw).toContain(DOC_B1);
    expect(raw).not.toContain(DOC_A1);
  });

  it('search_authoring_sections never surfaces another program\'s or tenant\'s text', async () => {
    const { raw } = await call('search_authoring_sections', { query: 'FOREIGN' });
    expect(raw).not.toMatch(/FOREIGN-/);
    expect(JSON.parse(raw).hits).toEqual([]);
  });

  it('another organization cannot open this project\'s program, so cannot read its sections', async () => {
    const ctx = { organizationId: OTHER_TENANT, userId: 8, projectRef: PROGRAM_A };
    // PROGRAM_A belongs to TENANT, so for OTHER_TENANT it is no open project at all.
    const { raw, json } = await call('read_authoring_section', { section_id: SEC.a2_3_2_P_1 }, ctx);
    expect(json.error).toBe(AUTHORING_READ_NO_PROJECT('read_authoring_section'));
    expect(raw).not.toMatch(/Batch formula/);
  });
}

function readResultCases(h: Harness, call: Call): void {
  it('read_authoring_section returns the section with pending changes labelled and its base for a later proposal', async () => {
    const { json } = await call('read_authoring_section', { section_id: SEC.a2_3_2_P_1, max_chars: 120 });
    expect(json).toMatchObject({ sectionId: SEC.a2_3_2_P_1, code: '3.2.P.1', offset: 0 });
    expect(String(json.text)).toContain('⟦proposed deletion by Dr. Lee: 100⟧');
    expect(typeof json.sha256).toBe('string');
    expect(typeof json.nextOffset).toBe('number');
  });
  it('read_authoring_section fits 5000 serialized characters on escape-heavy text, titles clipped, and its offsets skip nothing', async () => {
    const longTitle = 'Specification "justification" \\ '.repeat(10);
    const doc = docOf(longTitle, '2026-09-05T00:00:00.000Z');
    await h.addDoc(doc);
    const items = Array.from({ length: 300 }, (_, i) => `<li>"Q${i}" \\ "path\\to\\file" <ins data-author-name="AnA">"zeta" ${i}</ins></li>`).join('');
    const s = sectionOf('3.2.P.5.6', longTitle, `<ul>${items}</ul>`, 0, doc.id);
    await h.addSection(s);
    const parts: string[] = [];
    let offset: number | null = 0;
    let windows = 0;
    let totalChars = 0;
    while (offset !== null && windows < 50) {
      const { raw, json } = await call('read_authoring_section', { section_id: s.id, offset });
      expect(raw.length, `window ${windows}`).toBeLessThanOrEqual(RESULT_MAX);
      expect(String(json.title).length).toBeLessThanOrEqual(120);
      expect(String(json.docTitle).length).toBeLessThanOrEqual(120);
      expect(json.offset).toBe(offset);
      expect(outsideProposals(String(json.text)), `window ${windows}`).not.toMatch(/zeta/);
      parts.push(withoutContinuations(String(json.text)));
      totalChars = Number(json.totalChars);
      offset = json.nextOffset as number | null;
      windows++;
    }
    expect(windows).toBeGreaterThan(1);
    expect(parts.join('').length).toBe(totalChars);
  });
  // D4 (round 2): the shrink cut one character per serialized byte over the
  // budget, so text whose characters each serialize to several bytes fell to
  // tiny windows — a control-character-heavy section to 1-character windows.
  it('read_authoring_section walks a 16k control-character section in a few calls, each window near the budget', async () => {
    const s = sectionOf('3.2.P.5.7', 'Raw instrument dump', `<p>${'\u0001\u0002'.repeat(8000)}</p>`);
    await h.addSection(s);
    let delivered = 0;
    let offset: number | null = 0;
    let calls = 0;
    while (offset !== null && calls < 40) {
      const { raw, json } = await call('read_authoring_section', { section_id: s.id, offset });
      expect(raw.length, `call ${calls}`).toBeLessThanOrEqual(RESULT_MAX);
      expect(Number(json.totalChars)).toBe(16000);
      offset = json.nextOffset as number | null;
      if (offset !== null) expect(raw.length, `call ${calls}`).toBeGreaterThanOrEqual(RESULT_MAX - 20);
      delivered += String(json.text).length;
      calls++;
    }
    expect(offset).toBeNull();
    expect(delivered).toBe(16000);
    // Each character serializes to six bytes: about 760 fit beside the result's other fields.
    expect(calls).toBeLessThanOrEqual(24);
  });
  it('read_authoring_section gives quote- and backslash-heavy text windows at the largest size that fits', async () => {
    const s = sectionOf('3.2.P.5.8', 'Escapes', `<p>${'"\\'.repeat(3000)}</p>`);
    await h.addSection(s);
    let offset: number | null = 0;
    let calls = 0;
    while (offset !== null && calls < 20) {
      const { raw, json } = await call('read_authoring_section', { section_id: s.id, offset });
      expect(raw.length, `call ${calls}`).toBeLessThanOrEqual(RESULT_MAX);
      offset = json.nextOffset as number | null;
      // Every character here costs two bytes, so the largest window that fits leaves at most a byte or two over.
      if (offset !== null) expect(raw.length, `call ${calls}`).toBeGreaterThanOrEqual(RESULT_MAX - 10);
      calls++;
    }
    expect(offset).toBeNull();
    expect(calls).toBeLessThanOrEqual(4);
  });
  it('four parallel full-window reads pass the per-round budget untouched', async () => {
    const s = sectionOf('4.1', 'Pharmacology', `<p>${'Normal regulatory prose about the product. '.repeat(200)}</p>`);
    await h.addSection(s);
    const results = await Promise.all([0, 1, 2, 3].map(() => call('read_authoring_section', { section_id: s.id })));
    const entries = results.map((r, i) => ({ tool_use_id: String(i), name: 'read_authoring_section', content: r.raw }));
    expect(budgetToolResultsForModel(entries).map((e) => e.content)).toEqual(entries.map((e) => e.content));
  });
}

function searchResultCases(h: Harness, call: Call): void {
  it('search_authoring_sections returns snippets with where each hit lives', async () => {
    const { json } = await call('search_authoring_sections', { query: 'bioavailability' });
    expect(json.hits).toEqual([
      expect.objectContaining({ docId: DOC_A1, sectionId: SEC.a1_2_5_10, code: '2.5.10' }),
    ]);
  });
  it('search_authoring_sections at its maximum limit fits 5000 characters, in walk order, and pages through every match once', async () => {
    // Thirty matching sections, titles past the clip. The first twenty-four sit
    // one to a document — the heaviest page, each hit carrying its own document
    // title — and the oldest document holds 2.7.1. The last six share one
    // document and are stored in reverse code order, so within it the order is
    // the CTD code, not the stored order.
    const shared = docOf('Clinical summary, late sections '.padEnd(300, 'v'), '2026-09-06T00:00:00.000Z');
    await h.addDoc(shared);
    for (let i = 30; i >= 1; i--) {
      let docId = shared.id;
      if (i <= 24) {
        const doc = docOf(`Clinical summary volume ${i} `.padEnd(300, 'v'), `2026-09-05T00:00:${String(i).padStart(2, '0')}.000Z`);
        await h.addDoc(doc);
        docId = doc.id;
      }
      await h.addSection(sectionOf(`2.7.${i}`, `Summary of clinical efficacy ${i} `.padEnd(300, 't'), `<p>${'efficacy "data" '.repeat(100)}</p>`, 30 - i, docId));
    }
    const first = await call('search_authoring_sections', { query: 'efficacy', limit: 999 });
    expect(first.raw.length).toBeLessThanOrEqual(RESULT_MAX);
    const max = (first.json.hits as unknown[]).length;
    expect(max).toBeGreaterThanOrEqual(5);
    expect(first.json.totalMatches).toBe(30);
    expect(first.json.truncated).toBe(true);
    const codes: string[] = [];
    let offset: number | null = 0;
    let pages = 0;
    while (offset !== null && pages < 20) {
      const { raw, json } = await call('search_authoring_sections', { query: 'efficacy', limit: 999, offset });
      expect(raw.length, `page ${pages}`).toBeLessThanOrEqual(RESULT_MAX);
      for (const hit of json.hits as Array<{ code: string; title: string }>) {
        codes.push(hit.code);
        expect(hit.title.length).toBeLessThanOrEqual(120);
      }
      offset = json.nextOffset as number | null;
      pages++;
    }
    expect(codes).toEqual(Array.from({ length: 30 }, (_, i) => `2.7.${i + 1}`));
  });
}

// D6 (round 2): titles reached the model with ⟦ and ⟧ in them, so a title
// could open or close a proposal label the description says only proposals use.
function titleCases(h: Harness, call: Call): void {
  it('no tool result carries the label delimiters in a document or section title', async () => {
    const doc = docOf('Quality \u27E6draft\u27E7 volume', '2026-09-05T00:00:00.000Z');
    await h.addDoc(doc);
    const s = sectionOf('3.2.P.2', 'Pharmaceutical \u27E6development\u27E7 zircon', '<p>Zircon text.</p>', 0, doc.id);
    await h.addSection(s);
    const outline = await call('list_authoring_outline', { document_id: doc.id });
    expect(outline.raw).not.toMatch(/[\u27E6\u27E7]/);
    expect((outline.json.documents as Array<{ title: string }>)[0].title).toBe('Quality [draft] volume');
    expect((outline.json.sections as Array<{ title: string }>)[0].title).toBe('Pharmaceutical [development] zircon');
    const read = await call('read_authoring_section', { section_id: s.id });
    expect(read.raw).not.toMatch(/[\u27E6\u27E7]/);
    expect([read.json.title, read.json.docTitle]).toEqual(['Pharmaceutical [development] zircon', 'Quality [draft] volume']);
    const found = await call('search_authoring_sections', { query: 'zircon' });
    expect(found.raw).not.toMatch(/[\u27E6\u27E7]/);
    expect((found.json.documents as Array<{ title: string }>)[0].title).toBe('Quality [draft] volume');
    expect((found.json.hits as Array<{ title: string }>)[0].title).toBe('Pharmaceutical [development] zircon');
    // A page that continues a document names it: that title is cleaned too.
    for (let i = 0; i < 3; i++) await h.addSection(sectionOf(`3.2.P.2.${i + 1}`, `Sub ${i}`, '<p>x</p>', i + 1, doc.id));
    const first = await call('list_authoring_outline', { document_id: doc.id, limit: 2 });
    const next = await call('list_authoring_outline', { document_id: doc.id, limit: 2, cursor: first.json.nextCursor });
    expect((next.json.continuingDocument as { title: string }).title).toBe('Quality [draft] volume');
    expect(next.raw).not.toMatch(/[\u27E6\u27E7]/);
  });
}

function outlineResultCases(h: Harness, call: Call): void {
  it('an outline page fits 5000 characters with its cursor, and the cursor walks every section', async () => {
    for (let i = 0; i < 300; i++) {
      await h.addSection({
        id: `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`, doc_id: DOC_A1, tenant_id: TENANT,
        code: `5.3.5.${i + 1}`, title: `Clinical study report ${i + 1} — `.padEnd(180, 'x'),
        content: `<p>Study ${i}</p>`, order_index: 10 + i, updated_at: '2026-09-30T12:00:00.000Z',
      });
    }
    const seen = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const { raw, json } = await call('list_authoring_outline', { cursor, limit: 500 });
      expect(raw.length, `page ${pages}`).toBeLessThanOrEqual(RESULT_MAX);
      for (const s of json.sections as Array<{ id: string }>) seen.add(s.id);
      cursor = (json.nextCursor as string | null) ?? undefined;
      pages++;
    } while (cursor && pages < 200);
    expect(seen.size).toBe(307);
  });
  it('an outline over many long-titled documents pages the documents too: every one listed once, every page under 5000', async () => {
    for (let i = 0; i < 40; i++) {
      await h.addDoc(docOf(`Quality overall summary for drug substance ${i} `.repeat(6), `2026-09-10T00:00:${String(i).padStart(2, '0')}.000Z`));
    }
    const listed: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const { raw, json } = await call('list_authoring_outline', { cursor, limit: 40 });
      expect(raw.length, `page ${pages}`).toBeLessThanOrEqual(RESULT_MAX);
      listed.push(...(json.documents as Array<{ id: string }>).map((d) => d.id));
      expect(json.documentCount).toBe(42);
      expect(json.documentsNotYetListed, `page ${pages}`).toBe(42 - listed.length);
      cursor = (json.nextCursor as string | null) ?? undefined;
      pages++;
    } while (cursor && pages < 100);
    expect(listed).toHaveLength(42);
    expect(new Set(listed).size).toBe(42);
  });
}

describe.each([fakeHarness(), pgliteHarness()])('authoring read tools over $name', (h) => {
  const call = useHarness(h);
  describe('scope', () => scopeCases(call));
  describe('read_authoring_section results', () => readResultCases(h, call));
  describe('search_authoring_sections results', () => searchResultCases(h, call));
  describe('list_authoring_outline results', () => outlineResultCases(h, call));
  describe('titles', () => titleCases(h, call));
});
