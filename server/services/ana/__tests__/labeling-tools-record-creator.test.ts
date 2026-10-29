/**
 * AnA's labeling create tools record who added the row, as the HTTP creates do
 * (D5, 2026-10-29; docs/evidence/D5-LABELING-TRANSLATION-SIGNATURE/2026-10-29/followups/).
 *
 * A labeling document's or translation's approval refuses its creator
 * (separation of duties, `created_by`, 20261029b). POST /api/mdx/labeling and
 * POST /api/mdx/labeling/:id/translations record the user. AnA's
 * `create_labeling_document` and `add_labeling_translation` inserted the same
 * rows with no creator, so a record AnA added carried none and its approval was
 * signed with the two-person rule recorded as not applicable. Each tool now
 * writes `created_by` = the acting user (ctx.userId), and adds nothing when no
 * acting user is known.
 *
 * Through the real tool wrapper and the real handlers. Only the database and
 * the role lookup are doubles; the double records every INSERT.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG = 7;
const ACTOR = 42;

const h = vi.hoisted(() => {
  const inserts: Array<{ sql: string; args: unknown[] }> = [];
  const query = vi.fn(async (sql: string, args: unknown[] = []): Promise<{ rows: Array<Record<string, unknown>> }> => {
    if (/^\s*INSERT INTO labeling_(documents|translations)\b/.test(sql)) {
      inserts.push({ sql, args });
      return { rows: [{ id: 1 }] };
    }
    // add_labeling_translation's check that the document is the organization's.
    if (/SELECT 1 FROM labeling_documents/.test(sql)) return { rows: [{ '?column?': 1 }] };
    return { rows: [] };
  });
  return { inserts, query };
});

vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }) }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'member' }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: async () => 'member' }));

import { getToolHandler } from '../AnaToolExecutor';

const TOOLS = [
  { tool: 'create_labeling_document', table: 'labeling_documents', input: { device_name: 'Infusion pump', doc_kind: 'ifu' } },
  { tool: 'add_labeling_translation', table: 'labeling_translations', input: { labeling_document_id: 4, language: 'de' } },
] as const;

async function run(tool: string, input: Record<string, unknown>, ctx: Record<string, unknown>) {
  const handler = getToolHandler(tool);
  if (!handler) throw new Error(`${tool} is not registered`);
  return JSON.parse(await handler({ ...input }, ctx as never)) as Record<string, unknown>;
}

/** Split a SQL list on its top-level commas: `$1,COALESCE($2,false),$3` is three items. */
function items(list: string): string[] {
  const out: string[] = [];
  let depth = 0; let cur = '';
  for (const ch of list) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** The value an INSERT writes into `column`, read through its VALUES placeholder. */
function insertedValue(insert: { sql: string; args: unknown[] }, column: string): unknown {
  const m = /INSERT INTO \w+\s*\(([^)]*)\)\s*VALUES\s*\(([\s\S]*)\)\s*RETURNING/i.exec(insert.sql);
  if (!m) throw new Error(`not an INSERT … VALUES … RETURNING: ${insert.sql}`);
  const columns = items(m[1]);
  const values = items(m[2]);
  const at = columns.indexOf(column);
  if (at < 0) return undefined;
  const slot = /^\$(\d+)$/.exec(values[at]);
  if (!slot) throw new Error(`${column} is not a bound parameter: ${values[at]}`);
  return insert.args[Number(slot[1]) - 1];
}

beforeEach(() => {
  h.inserts.length = 0;
  h.query.mockClear();
});

describe.each(TOOLS)('$tool records who added the row', ({ tool, table, input }) => {
  it('writes created_by as the acting user, as the HTTP create does', async () => {
    const out = await run(tool, input, { organizationId: ORG, userId: ACTOR, humanConfirmed: true });
    expect(out.ok).toBe(true);
    expect(h.inserts).toHaveLength(1);
    expect(h.inserts[0].sql).toContain(`INSERT INTO ${table}`);
    expect(insertedValue(h.inserts[0], 'created_by')).toBe(ACTOR);
    expect(insertedValue(h.inserts[0], 'organization_id')).toBe(ORG);
  });

  it('with no acting user, adds nothing', async () => {
    const out = await run(tool, input, { organizationId: ORG, humanConfirmed: true });
    expect(h.inserts).toEqual([]);
    expect(out.ok).not.toBe(true);
  });
});
