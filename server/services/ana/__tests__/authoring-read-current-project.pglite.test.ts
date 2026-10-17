/** Current project access is checked on each saved-authoring read, including
 * later calls in a turn admitted before sharing or membership changed. */
import { beforeEach, describe, expect, it } from 'vitest';
import type { RequestSqlClient } from '../../../db/requestDb';
import type { ToolContext } from '../AnaToolExecutor';
import { registerAuthoringReadHandlers } from '../authoring-read-tools';
import { admitAnaProjectScope } from '../project-scope-admission';
import { context, DOCUMENT, METHODS, pg, sectionId, statements } from './_saved-document-critique-fixture';

type Handler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;
const handlers = new Map<string, Handler>();
const cases = [
  ['list_authoring_outline', { document_id: DOCUMENT }],
  ['read_authoring_section', { section_id: sectionId(1) }],
  ['search_authoring_sections', { query: 'Enrolled' }],
] as const;
let failPolicyRead = false;
const q: RequestSqlClient = { query: async (sql, params) => {
  statements.push(sql);
  if (failPolicyRead && /FROM projects p LEFT JOIN project_visibility_settings/.test(sql)) throw new Error('Policy read unavailable');
  return pg.query<Record<string, unknown>>(sql, params);
} };
const currentContext = (): ToolContext => ({ ...context, sqlClient: q });

beforeEach(async () => {
  // The shared review fixture has no document creation date; the existing
  // outline reader needs that production column for its stable walk order.
  await pg.exec("ALTER TABLE authoring_documents ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT '2026-10-01'");
  failPolicyRead = false;
  handlers.clear();
  registerAuthoringReadHandlers((name, handler) => handlers.set(name, handler), { pool: () => q });
  statements.length = 0;
});

async function call(name: string, input: Record<string, unknown>, ctx = currentContext()) {
  return JSON.parse(await handlers.get(name)!(input, ctx)) as Record<string, unknown>;
}

async function refused(name: string, input: Record<string, unknown>, ctx = currentContext()) {
  statements.length = 0;
  const result = await call(name, input, ctx);
  expect(result.error).toBeTypeOf('string');
  expect(JSON.stringify(result)).not.toContain(METHODS);
  expect(statements.some(sql => /FROM authoring_(?:documents|sections)\b/i.test(sql))).toBe(false);
}

describe.each(cases)('%s current project admission', (name, input) => {
  it('reads the real saved record for an active private-project member, including a read-only organization role', async () => {
    const result = await call(name, input);
    expect(result.error).toBeUndefined();
    expect(statements.some(sql => /FROM authoring_(?:documents|sections)\b/i.test(sql))).toBe(true);
  });

  it('refuses a project member revoked after the conversation was admitted', async () => {
    const ctx = currentContext();
    expect((await admitAnaProjectScope(q, { organizationId: ctx.organizationId, userId: ctx.userId,
      projectId: ctx.projectId, projectRef: ctx.projectRef })).projectId).toBe(11);
    await pg.query("UPDATE project_members SET status='revoked' WHERE project_id=11 AND user_id=7");
    await refused(name, input);
  });

  it('refuses organization membership removed after an earlier successful tool call', async () => {
    expect((await call(name, input)).error).toBeUndefined();
    await pg.query('DELETE FROM organization_users WHERE organization_id=7 AND user_id=7');
    await refused(name, input);
  });

  it('refuses a disabled account before reading saved authoring data', async () => {
    await pg.query("UPDATE users SET status='inactive' WHERE id=7");
    await refused(name, input);
  });

  it('refuses an unidentified actor even with a valid organization and program', async () => {
    await refused(name, input, { ...currentContext(), userId: null });
    expect(statements).toHaveLength(0);
  });

  it('fails closed when the current project sharing policy cannot be read', async () => {
    failPolicyRead = true;
    await refused(name, input);
  });

  it('refuses contradictory project identifiers before reading saved authoring data', async () => {
    await refused(name, input, { ...currentContext(), projectId: 12 });
  });

  it('uses the supplied request executor instead of checking out an alternate pool', async () => {
    registerAuthoringReadHandlers((tool, handler) => handlers.set(tool, handler), {
      pool: () => { throw new Error('The request executor must take precedence'); },
    });
    expect((await call(name, input)).error).toBeUndefined();
  });

  it('checks fresh access on the isolated executor when no request executor is supplied', async () => {
    expect((await call(name, input, context)).error).toBeUndefined();
    await pg.query("UPDATE project_members SET status='revoked' WHERE project_id=11 AND user_id=7");
    await refused(name, input, context);
  });
});
