/**
 * AnA's load_user_context lists the organization's projects with the
 * submission type each project records, and reports a failed read as a
 * failure — never as success with empty lists.
 *
 * What the command used to do (until 2026-10-15): it selected
 * projects.submission_type, a column projects does not have, so the read always
 * failed — and its catch answered success: true with no projects, no
 * conversations and no artifacts ("Loaded partial context"). AnA was told the
 * user had nothing in flight.
 *
 * Real tables (drizzle definitions) on PGlite, with two organizations.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { concept2cureArtifacts, concept2cureConversations, projects, users } from '../../../../shared/schema';

const H = vi.hoisted(() => {
  const h = {
    pg: null as any,
    failOn: null as RegExp | null,
    pool: {
      query: async (text: string, params?: unknown[]) => {
        if (h.failOn?.test(text)) throw new Error('SENTINEL relation does not exist');
        return { rows: (await h.pg.query(text, params ?? [])).rows };
      },
    },
  };
  return h;
});
vi.mock('../../../db', () => ({ db: {}, pool: H.pool, getPool: () => H.pool, getDb: () => ({}) }));
vi.mock('../../../db.js', () => ({ db: {}, pool: H.pool, getPool: () => H.pool, getDb: () => ({}) }));

import { loadUserContext } from '../command-executor';

const ALPHA = 1;
const BETA = 2;
const PRIYA = 7;

/** CREATE TABLE from the drizzle definition: columns, types, literal defaults. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => {
    const d = col.default;
    const literal = typeof d === 'number' || typeof d === 'boolean' ? ` DEFAULT ${d}`
      : typeof d === 'string' ? ` DEFAULT '${d.replace(/'/g, "''")}'` : '';
    return `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}${literal}`;
  });
  return `CREATE TABLE IF NOT EXISTS "${c.name}" (${cols.join(', ')});`;
}

beforeAll(async () => {
  H.pg = new PGlite();
  for (const t of [users, projects, concept2cureConversations, concept2cureArtifacts]) await H.pg.exec(ddlOf(t as PgTable));
  await H.pg.query(`INSERT INTO users (id, email, name, password_hash) VALUES ($1, 'priya@example.test', 'Priya Raman', 'x')`, [PRIYA]);
  await H.pg.query(
    `INSERT INTO projects (id, organization_id, client_workspace_id, name, type, status, metadata, updated_at) VALUES
       (101, $1, 1, 'Alpha IND', 'regulatory', 'active', '{"submissionType":"us_ind","registryId":"US_IND"}', NOW()),
       (102, $1, 1, 'Alpha untyped', 'regulatory', 'active', NULL, NOW() - interval '1 day'),
       (201, $2, 2, 'Beta BX-990', 'regulatory', 'active', '{"submissionType":"us_nda"}', NOW())`,
    [ALPHA, BETA],
  );
  await H.pg.query(
    `INSERT INTO concept2cure_conversations (conversation_id, project_id, organization_id, title, status, created_by_id, updated_at) VALUES
       ('conv_a', 101, $1, 'Alpha 2.5 draft', 'active', $3, NOW()),
       ('conv_b', 201, $2, 'Beta BX-990 safety', 'active', $3, NOW())`,
    [ALPHA, BETA, PRIYA],
  );
}, 60_000);

afterAll(async () => {
  await H.pg?.close();
});

beforeEach(() => {
  H.failOn = null;
});

describe('load_user_context', () => {
  it("lists the organization's projects with each one's recorded submission type", async () => {
    const r = await loadUserContext({ userId: PRIYA, organizationId: ALPHA });

    const listed = (r.data?.projects ?? []) as Array<{ name: string; submission_type: string | null }>;
    expect(listed.map((p) => [p.name, p.submission_type]), `the read failed: ${r.message}`).toEqual([
      ['Alpha IND', 'us_ind'],
      ['Alpha untyped', null],
    ]);
    expect(r.success).toBe(true);
    expect((r.data?.recentConversations as Array<{ title: string }>).map((c) => c.title)).toEqual(['Alpha 2.5 draft']);
    expect(JSON.stringify(r)).not.toContain('BX-990');
  });

  it('reports a failed read as a failure, not as success with empty lists', async () => {
    H.failOn = /FROM concept2cure_conversations/;
    const r = await loadUserContext({ userId: PRIYA, organizationId: ALPHA });

    expect(r.success, 'a failed read was answered as an empty context').toBe(false);
    expect(r.error).toBe('CONTEXT_UNAVAILABLE');
    expect(r.data).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('SENTINEL');
  });
});
