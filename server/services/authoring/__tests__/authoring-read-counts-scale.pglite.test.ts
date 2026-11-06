/** Actual admitted read queries and PostgreSQL plans over canonical fixture DDL.
 * Measures counter row growth, not a 10,000-page editor or native-RLS qualification. */
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createCurrentReadDb, DOC, SECTION } from '../../../routes/__tests__/_authoring-current-read-fixture';
import { makeRequestDbClient, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import type { RequestSqlClient } from '../../../db/requestDb';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../../db', () => ({ get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool }));
let jdb: JourneyDb;
let readDocument: typeof import('../authoring-document-read').readAuthoringDocument;
let readSections: typeof import('../authoring-document-read').readAuthoringDocumentSections;
const identity = { organizationId: 1, userId: 21, documentId: DOC.full };
const queries: Array<{ sql: string; args: unknown[] }> = [];
let q: RequestSqlClient;
type Plan = { 'Actual Rows'?: number; 'Actual Loops'?: number; Plans?: Plan[] };
const workRows = (plan: Plan): number => Math.max((plan['Actual Rows'] ?? 0) * (plan['Actual Loops'] ?? 1),
  ...(plan.Plans ?? []).map(workRows));

beforeAll(async () => {
  jdb = await createCurrentReadDb(); h.db = jdb.db; h.pool = jdb.pool;
  ({ readAuthoringDocument: readDocument, readAuthoringDocumentSections: readSections } = await import('../authoring-document-read'));
  const client = makeRequestDbClient(jdb.pglite);
  q = { query: async (...args: Parameters<typeof client.query>) => {
    const sql = typeof args[0] === 'string' ? args[0] : String((args[0] as { text: string }).text);
    if ((sql.includes('d.title') && sql.includes('AS section_count')) ||
      (sql.includes('s.content') && sql.includes('AS citation_count'))) queries.push({ sql, args: args[1] ?? [] });
    const result = await client.query(...args);
    return { ...result, rows: result.rows as Record<string, unknown>[] };
  } };
  await jdb.pool.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,order_index,tenant_id)
    SELECT gen_random_uuid(),$1,'16.' || n,'Synthetic scale section','<p>Synthetic content.</p>',n,1
    FROM generate_series(1,11) n`, [DOC.full]);
  await jdb.pool.query(`INSERT INTO doc_revisions(id,section_id,content,tenant_id)
    SELECT gen_random_uuid(),s.id,'Synthetic revision',1 FROM authoring_sections s
    CROSS JOIN generate_series(1,32) n WHERE s.doc_id=$1 AND s.tenant_id=1`, [DOC.full]);
  await jdb.pool.query(`INSERT INTO authoring_comments(id,doc_id,section_id,body,tenant_id)
    SELECT gen_random_uuid(),$1,$2,'Synthetic section comment',1 FROM generate_series(1,200) n`, [DOC.full, SECTION.full]);
  await jdb.pool.query(`INSERT INTO authoring_citations(id,section_id,citation_text,tenant_id)
    SELECT gen_random_uuid(),$1,'Synthetic citation',1 FROM generate_series(1,40) n`, [SECTION.full]);
}, 180_000);
afterAll(async () => { await jdb?.close(); });

async function measuredPlan(kind: 'document' | 'sections') {
  const saved = [...queries].reverse().find(query => kind === 'document' ? query.sql.includes('d.title') : query.sql.includes('s.content'));
  expect(saved).toBeDefined();
  const rows = await jdb.pglite.query<{ 'QUERY PLAN': Array<{ Plan: Plan }> }>(
    'EXPLAIN (ANALYZE, FORMAT JSON) ' + saved!.sql, saved!.args);
  return workRows(rows.rows[0]['QUERY PLAN'][0].Plan);
}

it('keeps exact admitted header totals without multiplying comments by every section revision', async () => {
  const result = await readDocument(q, identity);
  const document = result.document as Record<string, unknown>;
  expect(['section_count', 'comment_count', 'revision_count'].map(key => Number(document[key])))
    .toEqual([12, 200, 384]);
  // Allow planner freedom, while prohibiting the 76,800-row cross product for 636 input rows.
  expect(await measuredPlan('document')).toBeLessThanOrEqual(2_544);
});

it('keeps each section counter independent when comments, citations and history all grow', async () => {
  const result = await readSections(q, identity);
  const sections = result.sections as Array<Record<string, unknown>>;
  const first = sections.find(section => section.id === SECTION.full)!;
  expect(['comment_count', 'revision_count', 'citation_count'].map(key => Number(first[key])))
    .toEqual([200, 32, 40]);
  expect(sections.filter(section => section.id !== SECTION.full).every(section =>
    Number(section.comment_count) === 0 && Number(section.revision_count) === 32 && Number(section.citation_count) === 0)).toBe(true);
  // The old join materializes 256,352 rows; counts must not multiply the three stores.
  expect(await measuredPlan('sections')).toBeLessThanOrEqual(2_544);
});
