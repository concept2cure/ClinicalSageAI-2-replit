/** Real SQL, canonical authoring DDL and the actual saved-guidance helper.
 * This proves scoped identity reads, not native PostgreSQL concurrency or RLS. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { AUTHOR, AUTHORING_ACCESS_DDL, ORG, OTHER_ORG, PREREQ, PROGRAM, TENANTLESS } from '../../../routes/__tests__/_authoring-canvas-fixture';
import { savedTemplateGuidance, TemplateGuidanceError } from '../authoring-template-guidance';
import type { RequestSqlClient } from '../../../db/requestDb';
import type { AuthoringPrincipal } from '../authoring-permissions';

const DOC = 'aaaaaaaa-0000-4000-8000-000000000001';
const SECTION = 'bbbbbbbb-0000-4000-8000-000000000001';
const TEMPLATE = 'cccccccc-0000-4000-8000-000000000001';
const GUIDE = { guidance_text: 'Read the retained study source.', compliance_checklist: ['Verify the study identity.'] };
let db: JourneyDb;
const statements: Array<{ sql: string; params?: unknown[]; rows: Array<Record<string, unknown>> }> = [];
const q: RequestSqlClient = {
  query: async (sql, params) => {
    const result = await db.pglite.query<Record<string, unknown>>(sql, params);
    statements.push({ sql, params, rows: result.rows });
    return result;
  },
};
const member: AuthoringPrincipal = { id: AUTHOR.id, email: AUTHOR.email, roles: ['MEMBER'] };
const actorRead = () => statements.find(statement => /SELECT\s+(?:u\.)?email\s+FROM\s+users/i.test(statement.sql));

beforeAll(async () => {
  db = await createJourneyDb({ prereqSql: PREREQ + AUTHORING_ACCESS_DDL, migrations: [
    'db/migrations/20260725_authoring_document_loop_tables.sql',
    'db/migrations/20260817_doc_revisions_immutable_ledger.sql',
    'db/migrations/20260725_authoring_audit_trail.sql',
    'db/migrations/20260730_authoring_comments_router_columns.sql',
    'db/migrations/20260727_authoring_object_permissions.sql',
    'migrations/20260727_authoring_document_program_scope.sql',
    'migrations/20260921_authoring_document_provenance.sql',
  ] });
  await db.pool.query('INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,$3)', [OTHER_ORG, Number(TENANTLESS.id), 'member']);
  await db.pool.query(`INSERT INTO authoring_documents(id,title,status,created_by,template_id,tenant_id,client_program_id)
    VALUES($1,'Saved template copy','draft',$2,$3,$4,$5)`, [DOC, AUTHOR.id, TEMPLATE, ORG, PROGRAM]);
  await db.pool.query(`INSERT INTO authoring_sections(id,doc_id,code,title,content,tenant_id)
    VALUES($1,$2,'2.5','Clinical overview','',$3)`, [SECTION, DOC, ORG]);
  await db.pool.query(`INSERT INTO authoring_audit_trail(doc_id,section_id,operation_type,actor_email,tenant_id,metadata)
    VALUES($1,$2,'CREATE',$3,$4,$5::jsonb)`, [DOC, SECTION, AUTHOR.email, ORG, JSON.stringify({
    templateSource: { id: TEMPLATE, kind: 'preparation', limitations: ['Keep the original study record.'] }, templateGuidance: GUIDE,
  })]);
}, 90_000);
beforeEach(() => { statements.length = 0; });
afterAll(async () => { await db?.close(); });

describe('saved template guidance binds actor identity to the captured tenant', () => {
  it('returns the exact saved reference for an active current member without writing', async () => {
    const guidance = await savedTemplateGuidance(q, ORG, SECTION, member);
    expect(guidance).toEqual([expect.objectContaining({ ...GUIDE, template_id: TEMPLATE,
      template_source: { id: TEMPLATE, kind: 'preparation', limitations: ['Keep the original study record.'] } })]);
    expect(actorRead()?.params).toEqual([AUTHOR.id, 'active', ORG]);
    expect(actorRead()?.rows).toEqual([{ email: AUTHOR.email }]);
    expect(statements.some(statement => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(statement.sql))).toBe(false);
  });

  it('does not read another organization’s actor email before refusing guidance', async () => {
    await expect(savedTemplateGuidance(q, ORG, SECTION, {
      id: TENANTLESS.id, email: TENANTLESS.email, roles: ['ADMIN'],
    })).rejects.toMatchObject({ status: 403 });
    const read = actorRead();
    expect(read).toBeDefined();
    expect(read?.rows).toEqual([]);
    // Execute the same production query in the user’s own organization: the
    // identity exists, so the refusal is a tenant boundary, not a missing user.
    expect((await db.pglite.query(read!.sql, [TENANTLESS.id, 'active', OTHER_ORG])).rows).toEqual([{ email: TENANTLESS.email }]);
    expect(statements.some(statement => /FROM authoring_audit_trail\b/i.test(statement.sql))).toBe(false);
  });

  it('refuses an inactive member before returning saved guidance', async () => {
    await db.pool.query("UPDATE users SET status='disabled' WHERE id=$1", [Number(AUTHOR.id)]);
    try {
      await expect(savedTemplateGuidance(q, ORG, SECTION, member)).rejects.toBeInstanceOf(TemplateGuidanceError);
      expect(actorRead()?.rows).toEqual([]);
      expect(statements.some(statement => /FROM authoring_audit_trail\b/i.test(statement.sql))).toBe(false);
    } finally { await db.pool.query("UPDATE users SET status='active' WHERE id=$1", [Number(AUTHOR.id)]); }
  });
});
