/**
 * save_document_version saves a version. It does not approve, publish, reject
 * or archive a document, and it records who saved by id.
 *
 * Until 2026-10-15 the AI action took `payload.status` and wrote any valid
 * status — 'approved' and 'published' included — onto the unified document, with
 * no review, quorum or signature; a new version of an approved document kept
 * 'approved' for content nobody approved; a version with no content anywhere
 * was saved as an empty body; and created_by / updated_by held the actor's
 * display name, where every other writer of these tables stores the user id.
 *
 * Run through the real handler on a real engine (PGlite + drizzle).
 */
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

const handlers = vi.hoisted(() => new Map<string, any>());
vi.mock('../../action-registry', () => ({
  registerActionHandler: (h: any) => handlers.set(h.actionType, h),
}));

import '../save-document-version';

const pg = new PGlite();
const db = drizzle(pg);
const ORG = 7;

const DDL = `
DROP TABLE IF EXISTS workflow_document_versions, unified_documents CASCADE;
CREATE TABLE unified_documents (
  id SERIAL PRIMARY KEY, title TEXT NOT NULL, document_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', created_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_by TEXT, updated_at TIMESTAMP DEFAULT NOW(),
  organization_id INTEGER NOT NULL, latest_version INTEGER NOT NULL DEFAULT 1, metadata JSON
);
CREATE TABLE workflow_document_versions (
  id SERIAL PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, content JSON, created_by TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), comments TEXT, organization_id INTEGER NOT NULL
);
`;

beforeEach(async () => {
  await pg.exec(DDL);
  await pg.exec(`
    INSERT INTO unified_documents (id, title, document_type, status, created_by, organization_id, latest_version, metadata) VALUES
      (1, 'Clinical Overview', 'clinical_overview', 'draft', '11', ${ORG}, 1, '{"content":"body v1"}'),
      (2, 'Nonclinical Overview', 'nonclinical_overview', 'approved', '11', ${ORG}, 3, '{"content":"approved body"}'),
      (3, 'Empty shell', 'cover_letter', 'draft', '11', ${ORG}, 1, '{}');
  `);
});
afterAll(async () => {
  await pg.close();
});

const handler = () => handlers.get('save_document_version');
const ctx = () =>
  ({ user: { userId: 11, userName: 'Ada Author', userRole: 'author', organizationId: ORG }, db, actionId: 'act_1' }) as any;
const request = (targetId: number, payload: Record<string, unknown>) =>
  ({ actionType: 'save_document_version', targetId, sourceSurface: 'ai_panel', payload }) as any;

const doc = async (id: number) =>
  (await pg.query<{ status: string; updated_by: string | null; latest_version: number }>(
    'SELECT status, updated_by, latest_version FROM unified_documents WHERE id = $1', [id],
  )).rows[0];

describe('save_document_version', () => {
  it.each(['approved', 'published', 'rejected', 'archived'])('refuses to set status %s', (status) => {
    const errors = handler().validate(request(1, { content: 'body v2', status }));
    expect(errors.map((e: { code: string }) => e.code)).toContain('GOVERNED_STATUS');
  });

  it('may move a draft into review (a workflow step, not a decision)', () => {
    expect(handler().validate(request(1, { content: 'body v2', status: 'in_review' }))).toEqual([]);
  });

  it('records the saver by user id, not display name', async () => {
    await handler().execute(request(1, { content: 'body v2' }), ctx());
    expect((await doc(1)).updated_by).toBe('11');
    const v = await pg.query<{ created_by: string }>('SELECT created_by FROM workflow_document_versions WHERE document_id = 1');
    expect(v.rows.map((r) => r.created_by)).toEqual(['11']);
  });

  it('returns an approved document to draft when it saves changed content, and says so', async () => {
    const res = await handler().execute(request(2, { content: 'edited after approval' }), ctx());
    expect((await doc(2)).status).toBe('draft');
    expect(res.result.status).toBe('draft');
    expect(res.warnings.join(' ')).toMatch(/not approved/i);
  });

  it('refuses to save a version with no content anywhere', async () => {
    await expect(handler().execute(request(3, {}), ctx())).rejects.toMatchObject({ code: 'NO_CONTENT' });
    const v = await pg.query('SELECT 1 FROM workflow_document_versions WHERE document_id = 3');
    expect(v.rows).toEqual([]);
  });
});
