/**
 * A SQL-aware fake of the authoring store, for the authoring-read tests.
 *
 * Why a fake that reads the SQL rather than one that returns canned rows: the
 * property under test is that every read is filtered by tenant AND program. A
 * fake that answers "the rows for this test" whatever the SQL says would pass a
 * query that forgot either predicate. This one holds documents and sections in
 * two programs of one tenant and a third program of another tenant, and it
 * filters ONLY on the predicates the SQL actually contains. A query missing
 * `d.client_program_id = $n` returns the other program's rows, and the leak
 * tests fail for the right reason.
 *
 * It refuses SQL it does not understand (an unknown table, a placeholder it
 * cannot place) instead of guessing, so the fake cannot quietly drift into
 * answering a query shape it was never written for. It reads every
 * `alias.col = $n` in the WHERE clause as a conjunct and does not evaluate OR,
 * so a predicate neutralised inside an OR (`… = $2 OR TRUE`) stays green here;
 * PGlite catches that one (1-mutation-scope-predicates-red.txt). Nor does it
 * evaluate SQL functions: the computed columns (length, sha256, drafted,
 * pending) are recomputed here in JS. The PGlite block in authoring-read.test.ts
 * runs the same queries on a real Postgres engine for that.
 */
import { createHash } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';

export const TENANT = 1;
export const OTHER_TENANT = 2;
export const PROGRAM_A = '11111111-1111-4111-8111-111111111111';
export const PROGRAM_B = '22222222-2222-4222-8222-222222222222';
export const PROGRAM_C = '33333333-3333-4333-8333-333333333333';

export interface FakeDoc {
  id: string;
  title: string;
  module: string | null;
  product_code: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  tenant_id: number;
  client_program_id: string | null;
}

export interface FakeSection {
  id: string;
  doc_id: string;
  code: string | null;
  title: string | null;
  content: string | null;
  order_index: number;
  updated_at: string;
  tenant_id: number;
}

export interface FakeProgram {
  id: string;
  organization_id: number;
  deleted: boolean;
}

export interface FakeState {
  programs: FakeProgram[];
  docs: FakeDoc[];
  sections: FakeSection[];
  /** Every statement the code under test sent, for assertions on shape. */
  sql: string[];
}

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const DOC_A1 = uuid(101);
export const DOC_A2 = uuid(102);
export const DOC_B1 = uuid(201);
export const DOC_X1 = uuid(301);
export const DOC_X2 = uuid(302);

export const SEC = {
  a1_2_5_10: uuid(1001),
  a1_2_5: uuid(1002),
  a1_uncoded: uuid(1003),
  a1_2_5_1: uuid(1004),
  a2_3_2_P_1: uuid(1101),
  a2_3_2_S_1_1: uuid(1102),
  a2_3_2_S_1: uuid(1103),
  b1_2_5: uuid(2001),
  x1_2_5: uuid(3001),
  x2_2_5: uuid(3002),
} as const;

/** A paragraph long enough that one window cannot hold it (the cap is 6000). */
export const LONG_PARAGRAPH = 'Stability data support the proposed shelf life. '.repeat(160).trim();

export const PENDING_HTML =
  '<h2>Batch formula</h2>' +
  '<p>The batch size is <del data-author-name="Dr. Lee" data-at="2026-09-30T10:00:00Z">100</del>' +
  '<ins data-author-name="AnA" data-at="2026-09-30T10:01:00Z">200</ins> kg.</p>' +
  '<ul><li>Granulation</li><li>Compression</li></ul>' +
  '<table><tr><th>Component</th><th>Amount</th></tr><tr><td>API</td><td>50 mg</td></tr></table>';

function doc(id: string, tenant: number, program: string, title: string, createdAt: string): FakeDoc {
  return {
    id, title, module: 'M2', product_code: 'IND', status: 'draft',
    created_at: createdAt, updated_at: createdAt, tenant_id: tenant, client_program_id: program,
  };
}

/** [code, title, content, order_index] */
type SectionSpec = [string | null, string, string | null, number];

function section(id: string, docId: string, tenant: number, [code, title, content, order]: SectionSpec): FakeSection {
  return { id, doc_id: docId, code, title, content, order_index: order, updated_at: '2026-09-30T12:00:00.000Z', tenant_id: tenant };
}

/**
 * Two programs in the acting tenant, and a third tenant's documents.
 *
 * DOC_X1 belongs to the OTHER tenant but carries PROGRAM_A's id. The same-org
 * foreign key (20260926b_program_same_org_keys.sql) makes that impossible in a
 * real database; it is here so the tenant predicate is tested on its own. With
 * every other-tenant row in another program, a query that dropped the tenant
 * predicate would still be saved by the program predicate and nothing would
 * show it.
 */
export function seedState(): FakeState {
  return {
    sql: [],
    programs: [
      { id: PROGRAM_A, organization_id: TENANT, deleted: false },
      { id: PROGRAM_B, organization_id: TENANT, deleted: false },
      { id: PROGRAM_C, organization_id: OTHER_TENANT, deleted: false },
    ],
    docs: [
      doc(DOC_A1, TENANT, PROGRAM_A, 'Module 2 summaries', '2026-09-01T00:00:00.000Z'),
      doc(DOC_A2, TENANT, PROGRAM_A, 'Quality', '2026-09-02T00:00:00.000Z'),
      doc(DOC_B1, TENANT, PROGRAM_B, 'Other program', '2026-08-01T00:00:00.000Z'),
      doc(DOC_X1, OTHER_TENANT, PROGRAM_A, 'Other tenant, same program id', '2026-07-01T00:00:00.000Z'),
      doc(DOC_X2, OTHER_TENANT, PROGRAM_C, 'Other tenant', '2026-07-02T00:00:00.000Z'),
    ],
    sections: [
      // Stored out of code order on purpose: the outline must not trust order_index alone.
      section(SEC.a1_2_5_10, DOC_A1, TENANT, ['2.5.10', 'Benefit-risk conclusions', '<p>Overall the bioavailability is adequate.</p>', 0]),
      section(SEC.a1_2_5, DOC_A1, TENANT, ['2.5', 'Clinical overview', `<p>${LONG_PARAGRAPH}</p>`, 1]),
      section(SEC.a1_uncoded, DOC_A1, TENANT, [null, 'Notes', '', 2]),
      section(SEC.a1_2_5_1, DOC_A1, TENANT, ['2.5.1', 'Product development rationale', '<p>   </p>', 3]),
      section(SEC.a2_3_2_P_1, DOC_A2, TENANT, ['3.2.P.1', 'Description of the drug product', PENDING_HTML, 0]),
      section(SEC.a2_3_2_S_1_1, DOC_A2, TENANT, ['3.2.S.1.1', 'Nomenclature', 'Plain text nomenclature.\nINN: examplumab', 1]),
      section(SEC.a2_3_2_S_1, DOC_A2, TENANT, ['3.2.S.1', 'General information', '<p>100% of 50_mg lots</p>', 2]),
      section(SEC.b1_2_5, DOC_B1, TENANT, ['2.5', 'FOREIGN-PROGRAM overview', '<p>FOREIGN-PROGRAM bioavailability</p>', 0]),
      section(SEC.x1_2_5, DOC_X1, OTHER_TENANT, ['2.5', 'FOREIGN-TENANT overview', '<p>FOREIGN-TENANT bioavailability</p>', 0]),
      section(SEC.x2_2_5, DOC_X2, OTHER_TENANT, ['2.5', 'FOREIGN-TENANT C overview', '<p>FOREIGN-TENANT bioavailability</p>', 0]),
    ],
  };
}

// ── The SQL reader ───────────────────────────────────────────────────────────

type Row = { s?: FakeSection; d?: FakeDoc };

/** Split a SELECT list on top-level commas. */
function selectItems(sql: string): string[] {
  const m = /^\s*SELECT\s+([\s\S]+?)\s+FROM\s/i.exec(sql);
  if (!m) throw new Error(`fake pool: no SELECT list in: ${sql}`);
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of m[1]) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const plain = (html: string | null): string =>
  String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

/** The columns this fake knows how to compute, by output name. */
const COMPUTED: Record<string, (r: Row) => unknown> = {
  length: (r) => String(r.s?.content ?? '').length,
  sha256: (r) => createHash('sha256').update(String(r.s?.content ?? ''), 'utf8').digest('hex'),
  drafted: (r) => plain(r.s?.content ?? '').replace(/\s/g, '').length > 0,
  // A tag, not a word that starts like one: `<insulin>` and `<input>` are prose.
  pending_changes: (r) => /<(ins|del)[\s>/]/i.test(String(r.s?.content ?? '')),
  doc_title: (r) => r.d?.title,
  doc_created_at: (r) => r.d?.created_at,
};

function project(items: string[], r: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const item of items) {
    const alias = /\bAS\s+(\w+)\s*$/i.exec(item);
    const col = /^([sd])\.(\w+)$/.exec(item);
    if (col && !alias) {
      const src = col[1] === 's' ? r.s : r.d;
      if (!src) throw new Error(`fake pool: ${item} selected without its table`);
      out[col[2]] = (src as unknown as Record<string, unknown>)[col[2]];
    } else if (alias && COMPUTED[alias[1]]) {
      out[alias[1]] = COMPUTED[alias[1]](r);
    } else {
      throw new Error(`fake pool: cannot evaluate select item "${item}"`);
    }
  }
  return out;
}

/** A LIKE pattern with backslash escapes, as a case-insensitive regex. */
function likeToRegex(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    else if (ch === '%') re += '[\\s\\S]*';
    else if (ch === '_') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}

function baseRows(state: FakeState, sql: string): Row[] {
  if (/FROM\s+authoring_sections\s+s\b/i.test(sql)) {
    const joined = /JOIN\s+authoring_documents\s+d\s+ON\s+d\.id\s*=\s*s\.doc_id/i.test(sql);
    const tenantJoin = /d\.tenant_id\s*=\s*s\.tenant_id/i.test(sql);
    return state.sections.flatMap((s): Row[] => {
      if (!joined) return [{ s }];
      const d = state.docs.find((x) => x.id === s.doc_id && (!tenantJoin || x.tenant_id === s.tenant_id));
      return d ? [{ s, d }] : [];
    });
  }
  if (/FROM\s+authoring_documents\s+d\b/i.test(sql)) return state.docs.map((d) => ({ d }));
  throw new Error(`fake pool: unexpected table in: ${sql}`);
}

interface Filtered { rows: Row[]; used: Set<number> }

function applyPredicates(rows: Row[], sql: string, params: unknown[]): Filtered {
  const used = new Set<number>();
  const where = sql.split(/\bWHERE\b/i)[1] ?? '';
  let out = rows;
  for (const m of where.matchAll(/\b([sd])\.(\w+)\s*=\s*\$(\d+)/g)) {
    const [, alias, col, n] = m;
    used.add(Number(n));
    const want = params[Number(n) - 1];
    out = out.filter((r) => {
      const src = (alias === 's' ? r.s : r.d) as unknown as Record<string, unknown> | undefined;
      return src !== undefined && src[col] === want;
    });
  }
  for (const m of where.matchAll(/\b([sd])\.(\w+)\s*=\s*ANY\s*\(\s*\$(\d+)/g)) {
    const [, alias, col, n] = m;
    used.add(Number(n));
    const want = params[Number(n) - 1] as unknown[];
    out = out.filter((r) => {
      const src = (alias === 's' ? r.s : r.d) as unknown as Record<string, unknown> | undefined;
      return src !== undefined && want.includes(src[col]);
    });
  }
  return { rows: out, used };
}

function applySearch(f: Filtered, sql: string, params: unknown[]): Filtered {
  const m = /ILIKE\s+\$(\d+)/i.exec(sql);
  if (!m) return f;
  f.used.add(Number(m[1]));
  const re = likeToRegex(String(params[Number(m[1]) - 1]));
  const rows = f.rows.filter((r) => {
    const s = r.s;
    if (!s) return false;
    return (
      (/s\.title\s+ILIKE/i.test(sql) && re.test(s.title ?? '')) ||
      (/s\.code\s+ILIKE/i.test(sql) && re.test(s.code ?? '')) ||
      (/s\.content/i.test(sql) && re.test(plain(s.content)))
    );
  });
  return { rows, used: f.used };
}

function applyLimit(f: Filtered, sql: string, params: unknown[]): Row[] {
  const m = /LIMIT\s+\$(\d+)/i.exec(sql);
  if (m) {
    f.used.add(Number(m[1]));
    return f.rows.slice(0, Number(params[Number(m[1]) - 1]));
  }
  const lit = /LIMIT\s+(\d+)/i.exec(sql);
  return lit ? f.rows.slice(0, Number(lit[1])) : f.rows;
}

function programQuery(state: FakeState, sql: string, params: unknown[]): { rows: unknown[] } {
  const live = /deleted_at\s+IS\s+NULL/i.test(sql);
  const rows = state.programs
    .filter((p) => p.id === params[0] && p.organization_id === params[1] && (!live || !p.deleted))
    .map((p) => ({ id: p.id }));
  return { rows };
}

export function makeFakePool(state: FakeState) {
  return {
    async query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[] }> {
      state.sql.push(sql);
      if (/FROM\s+regulatory_programs/i.test(sql)) return programQuery(state, sql, params);
      // No legacy integer projects in this fixture: the v2 shell sends a program UUID.
      if (/FROM\s+projects\b/i.test(sql)) return { rows: [] };
      const filtered = applySearch(applyPredicates(baseRows(state, sql), sql, params), sql, params);
      const limited = applyLimit(filtered, sql, params);
      const unplaced = params.map((_, i) => i + 1).filter((n) => !filtered.used.has(n));
      if (unplaced.length) throw new Error(`fake pool: placeholder(s) $${unplaced.join(', $')} not understood in: ${sql}`);
      const items = selectItems(sql);
      return { rows: limited.map((r) => project(items, r)) };
    },
  };
}

// ── PGlite: the same store on a real Postgres engine ────────────────────────

/** The columns the read path touches, with the production types. */
export const PGLITE_DDL = `
CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id int NOT NULL, deleted_at timestamptz);
CREATE TABLE projects (id int PRIMARY KEY, organization_id int NOT NULL, regulatory_program_id uuid);
CREATE TABLE authoring_documents (id uuid PRIMARY KEY, title text NOT NULL, module text, product_code text,
  status text NOT NULL DEFAULT 'draft', tenant_id int NOT NULL, client_program_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE authoring_sections (id uuid PRIMARY KEY, doc_id uuid NOT NULL, code text, title text, content text,
  order_index int DEFAULT 0, tenant_id int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
`;

export async function pgliteInsertDoc(db: PGlite, d: FakeDoc): Promise<void> {
  await db.query(
    `INSERT INTO authoring_documents (id, title, module, product_code, status, tenant_id, client_program_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [d.id, d.title, d.module, d.product_code, d.status, d.tenant_id, d.client_program_id, d.created_at, d.updated_at],
  );
}

export async function pgliteInsertSection(db: PGlite, s: FakeSection): Promise<void> {
  await db.query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, order_index, tenant_id, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [s.id, s.doc_id, s.code, s.title, s.content, s.order_index, s.tenant_id, s.updated_at],
  );
}

/** Replace whatever the database holds with `st`. */
export async function pgliteSeed(db: PGlite, st: FakeState): Promise<void> {
  // tenant-isolation-safe: resets this test's own in-memory PGlite database before seeding it; no tenant's data exists outside the test
  await db.exec('DELETE FROM authoring_sections; DELETE FROM authoring_documents; DELETE FROM regulatory_programs; DELETE FROM projects;');
  for (const p of st.programs) {
    await db.query('INSERT INTO regulatory_programs (id, organization_id, deleted_at) VALUES ($1,$2,$3)', [p.id, p.organization_id, p.deleted ? new Date().toISOString() : null]);
  }
  for (const d of st.docs) await pgliteInsertDoc(db, d);
  for (const s of st.sections) await pgliteInsertSection(db, s);
}

export function pglitePool(db: PGlite) {
  return {
    query: async (sql: string, params?: unknown[]) => ({ rows: (await db.query(sql, params)).rows as unknown[] }),
  };
}

// ── Reading the proposal labels back ────────────────────────────────────────

/**
 * The characters of `text` that sit OUTSIDE a ⟦…⟧ proposal label — what a
 * reader would take as the document's settled text. Throws on a ⟧ that closes
 * nothing, a nested ⟦, or a label left open at the end: each is a window or
 * snippet that lets proposed text escape its label.
 */
export function outsideProposals(text: string): string {
  let depth = 0;
  let out = '';
  for (const ch of text) {
    if (ch === '\u27E6') {
      if (depth > 0) throw new Error(`a proposal label opens inside another in: ${text}`);
      depth++;
    } else if (ch === '\u27E7') {
      if (depth === 0) throw new Error(`a ⟧ closes no label in: ${text}`);
      depth--;
    } else if (depth === 0) out += ch;
  }
  if (depth !== 0) throw new Error(`a proposal label is left open in: ${text}`);
  return out;
}

/** A window's own text with the continuation labels the window added removed. */
export function withoutContinuations(text: string): string {
  return text.replace(/^\u27E6\(continued\) proposed (?:insertion|deletion) by [^:]*: /, '').replace(/…\(continues\)\u27E7$/, '');
}

// ── Sections for the second verifier round's rendering cases ────────────────

/**
 * Astral characters in settled text, at a proposal's first and last character,
 * in adjacent proposals, in a caption and in table cells: a 1-character window
 * once stopped advancing on the first of these (0→1 1→2 2→29 29→29).
 */
export const WALK_CASES = [
  '<p>a <ins data-author-name="A">x\u{1F600}y z</ins> b</p>',
  '<p>\u{1F600}<ins data-author-name="A">\u{1F600}</ins>\u{1F600}<del data-author-name="B">\u{1F600}\u{1F600}</del>\u{1F600}</p>',
  '<p>ab \u{1F600} cd \u{1D518}\u{1D52B}</p><ul><li>\u{1F600} item <ins data-author-name="C">\u{2070E} new</ins></li></ul>',
  '<table><caption>Cap <ins data-author-name="A">\u{1F600} more</ins></caption><tr><td>\u{1F600}</td><td><del data-author-name="B">\u{2070E}</del></td></tr></table>',
  '<p><ins data-author-name="A">a</ins><ins data-author-name="B">\u{1F600}</ins><del data-author-name="C">b</del></p>',
  `<p>${'\u{1F600}'.repeat(30)}<ins data-author-name="A">${'é\u{1F600}'.repeat(25)}</ins></p>`,
];
export const WALK_SIZES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 31, 200, 4000];
/** Half of a surrogate pair with its other half missing. */
export const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** A settled copy of /f.png the parser skips (caption, row, table body, empty citation), then a proposed copy it emits. */
export const FIGURE_PROPOSED_EMITTED = [
  '<table><caption><img src="/f.png"></caption><tr><td>Cell</td></tr></table><ins data-author-name="Ann"><img src="/f.png" alt="Zeta figure"></ins>',
  '<table><tr><img src="/f.png"><td>Cell</td></tr></table><ins data-author-name="Ann"><img src="/f.png" alt="Zeta figure"></ins>',
  '<p>See <a data-cite="src-1"><img src="/f.png"></a></p><ins data-author-name="Ann"><img src="/f.png" alt="Zeta figure"></ins>',
  '<table><tr><td>Cell</td></tr><img src="/f.png"></table><table><tr><td><ins data-author-name="Ann"><img src="/f.png" alt="Zeta figure"></ins></td></tr></table>',
];
/** The other order: a proposed copy the parser skips, then a settled copy it emits. */
export const FIGURE_SETTLED_EMITTED = [
  '<table><caption><ins data-author-name="Ann"><img src="/f.png" alt="Zeta"></ins></caption><tr><td>Cell</td></tr></table><img src="/f.png" alt="Settled figure">',
  '<table><tr><ins data-author-name="Ann"><img src="/f.png"></ins><td>Cell</td></tr></table><img src="/f.png" alt="Settled figure">',
  '<table><tr><td>Cell</td></tr><ins data-author-name="Ann"><img src="/f.png"></ins></table><img src="/f.png" alt="Settled figure">',
  '<p>See <ins data-author-name="Ann"><a data-cite="src-1"><img src="/f.png"></a></ins></p><img src="/f.png" alt="Settled figure">',
  '<table><tr><td>Cell</td></tr><ins data-author-name="Ann"><img src="/f.png"></ins></table><table><tr><td><img src="/f.png" alt="Settled figure"></td></tr></table>',
];
