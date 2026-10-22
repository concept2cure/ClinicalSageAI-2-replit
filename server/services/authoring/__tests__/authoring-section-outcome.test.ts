/** Canonical PGlite section/candidate/evidence writes; transport failure is synthetic.
 * This checks release(error), not native socket disposal or a provider/filing acknowledgement. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type express from 'express';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, AUTHORING_ACCESS_DDL, PROGRAM, ORG, AUTHOR, makeApp, mint, asToken } from '../../../routes/__tests__/_authoring-canvas-fixture';
import { AUTHORING_TOOL_MIGRATIONS, DISPOSITION_IMPACT_PREREQ } from '../../ana/__tests__/support/authoring-tool-db';
import { createDocumentFromDraft } from '../authoring-from-draft';
import { createSection, type AuthoringPool, type CreateContext } from '../authoring-documents';
import { createDraftCandidate, savedSectionDraftBase } from '../../clinical-regulatory-evidence/draft-candidate-store';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../../db.js', () => ({
  get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (sql: string, values?: unknown[]) => (h.pool as AuthoringPool).query(sql, values),
}));
let jdb: JourneyDb;
let pool: AuthoringPool;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let mode: 'none' | 'before-commit' | 'after-commit' | 'rollback-fails' | 'audit-fails' = 'none';
let cleanup = Promise.resolve();
let statements: string[] = [];
let insertedSection: string | undefined;
let documentId: string;
let sectionId: string;
const releases = vi.fn();
const PRIOR = '<p>Prior synthetic section content.</p>';
const ACCEPTED = '<p>Accepted synthetic draft content.</p>';
const ctx = (): CreateContext => ({ pool, tenantId: ORG, actor: { id: String(AUTHOR.id), email: AUTHOR.email },
  audit: { pool, tenantId: ORG, actorId: String(AUTHOR.id), actorEmail: AUTHOR.email, actorRole: 'member', ipAddress: 'test', userAgent: 'test' } });
beforeAll(async () => {
  jdb = await createJourneyDb({ prereqSql: PREREQ + VAULT_DDL + DISPOSITION_IMPACT_PREREQ,
    migrations: [...AUTHORING_TOOL_MIGRATIONS, 'db/migrations/20260809_source_attribution_draft_candidates.sql',
      'migrations/20260814i_draft_candidate_generator.sql', 'migrations/20260906c_draft_candidate_assertions.sql'],
    testOnlySql: AUTHORING_ACCESS_DDL });
  pool = { query: (sql, values) => jdb.pool.query(sql, values), connect: async () => ({
    query: async (sql, values) => {
      statements.push(sql);
      if (sql === 'COMMIT' && mode === 'before-commit') throw new Error('Synthetic COMMIT send failure');
      if (sql === 'ROLLBACK' && mode === 'rollback-fails') throw new Error('Synthetic rollback failure');
      if (/INSERT INTO authoring_sections/.test(sql)) insertedSection = String(values?.[0]);
      if (/INSERT INTO authoring_audit_trail/.test(sql) && mode === 'audit-fails') throw new Error('Synthetic required audit failure');
      const result = await jdb.pool.query(sql, values);
      if (sql === 'COMMIT' && mode === 'after-commit') throw new Error('Synthetic lost COMMIT reply');
      return result;
    },
    release: error => {
      releases(error);
      // PGlite is one session: model destruction's server rollback separately
      // from the tested client, whose SQL must contain no post-COMMIT ROLLBACK.
      if (error && (mode === 'before-commit' || mode === 'rollback-fails')) cleanup = jdb.pool.query('ROLLBACK').then(() => undefined);
    },
  }) };
  h.db = jdb.db; h.pool = pool;
  author = asToken(await mint(AUTHOR));
  app = makeApp((await import('../../../routes/authoring.router')).default);
}, 240_000);
beforeEach(async () => {
  await cleanup; mode = 'none';
  const created = await createDocumentFromDraft(ctx(), { programId: PROGRAM, title: 'Synthetic section lifecycle', module: 'M2',
    sections: [{ code: '2.5', title: 'Prior section', content: PRIOR }], provenance: { source: 'seed' } });
  if (created.kind !== 'created') throw new Error('Parent fixture could not be created');
  documentId = String(created.document.id); sectionId = String(created.sections[0].id);
  statements = []; releases.mockClear(); insertedSection = undefined;
});
afterAll(async () => { await cleanup; await jdb?.close(); });
async function candidate() {
  const saved = (await jdb.pool.query('SELECT *,updated_at::text AS base_updated_at FROM authoring_sections WHERE id=$1 AND tenant_id=$2', [sectionId, ORG])).rows[0];
  return createDraftCandidate(ORG, sectionId, ACCEPTED, [], String(AUTHOR.id), jdb.pool as never,
    { model: null, provider: null, promptSha256: null, generatedAt: new Date().toISOString(), savedSectionBase: savedSectionDraftBase(saved as Record<string, unknown>) });
}
async function persisted(id: string, draftId?: string) {
  return (await jdb.pool.query(`SELECT
    (SELECT content FROM authoring_sections WHERE id=$1 AND tenant_id=$2) AS content,
    (SELECT COUNT(*)::int FROM doc_revisions WHERE section_id=$1 AND tenant_id=$2) AS revisions,
    (SELECT COUNT(*)::int FROM authoring_audit_trail WHERE section_id=$1 AND tenant_id=$2) AS audits,
    (SELECT COUNT(*)::int FROM authoring_ai_draft_candidates WHERE id=$3 AND organization_id=$2) AS candidates`, [id, ORG, draftId ?? null])).rows[0] as Record<string, unknown>;
}
function unconfirmed(body: Record<string, any>, code: string, id: string, draftId?: string) {
  expect(body).toMatchObject({ code, writeOutcome: 'unconfirmed', retryAllowed: false,
    recovery: { organizationId: ORG, documentId, sectionId: id, ...(draftId ? { draftId } : {}) } });
  expect(JSON.stringify(body)).not.toMatch(/nothing (?:was )?(saved|created)|not saved|not created|lineage_required/i);
  for (const key of ['content', 'section', 'attribution', 'filing', 'saved', 'created']) expect(body).not.toHaveProperty(key);
}
function discarded() {
  expect(statements.filter(sql => sql === 'COMMIT')).toHaveLength(1);
  expect(statements).not.toContain('ROLLBACK');
  expect(releases).toHaveBeenCalledTimes(1); expect(releases).toHaveBeenCalledWith(expect.any(Error));
}

describe('section create uncertain transaction outcome', () => {
  it.each(['before-commit', 'after-commit'] as const)('retains actual section recovery after %s', async fault => {
    mode = fault; let error: any;
    try { await createSection(ctx(), { doc_id: documentId, code: '2.6', title: 'New section', content: '<p>New synthetic content.</p>' }); }
    catch (caught) { error = caught; }
    expect(error?.code).toBe('AUTHORING_SECTION_CREATE_COMMIT_UNCONFIRMED');
    unconfirmed({ ...error, error: { code: error.code, message: error.message }, retryAllowed: false, writeOutcome: 'unconfirmed' }, error.code, insertedSection!);
    discarded(); await cleanup;
    expect(await persisted(insertedSection!)).toMatchObject(fault === 'after-commit'
      ? { content: '<p>New synthetic content.</p>', revisions: 1, audits: 1 } : { content: null, revisions: 0, audits: 0 });
  });

  it('HTTP create returns recovery rather than a false lineage refusal after a lost reply', async () => {
    mode = 'after-commit';
    const res = await author(request(app).post('/api/authoring/sections')).send({ doc_id: documentId, code: '2.6', title: 'New section' });
    expect(res.status).toBe(503); unconfirmed(res.body, 'AUTHORING_SECTION_CREATE_COMMIT_UNCONFIRMED', insertedSection!); discarded();
  });

  it.each([false, true])('duplicate refusal rolls back once and discards only a failed rollback: %s', async failedRollback => {
    if (failedRollback) mode = 'rollback-fails';
    const result = await createSection(ctx(), { doc_id: documentId, code: '2.5', title: 'Duplicate' });
    expect(result).toMatchObject({ kind: 'refused', code: 'SECTION_CODE_EXISTS' });
    expect(statements.filter(sql => sql === 'ROLLBACK')).toHaveLength(1);
    expect(statements).not.toContain('COMMIT'); expect(releases).toHaveBeenCalledWith(failedRollback ? expect.any(Error) : undefined); await cleanup;
  });
});

describe('AI accept uncertain transaction outcome', () => {
  it.each(['before-commit', 'after-commit'] as const)('retains consumed-candidate recovery after %s', async fault => {
    const draft = await candidate(); const before = await persisted(sectionId, draft.id); mode = fault;
    const res = await author(request(app).post(`/api/authoring/sections/${sectionId}/ai/draft/accept`)).send({ draftId: draft.id });
    expect(res.status).toBe(503); unconfirmed(res.body, 'AUTHORING_AI_ACCEPT_COMMIT_UNCONFIRMED', sectionId, draft.id); discarded(); await cleanup;
    const after = await persisted(sectionId, draft.id);
    expect(after).toEqual(fault === 'after-commit' ? { content: ACCEPTED, revisions: Number(before.revisions) + 1, audits: Number(before.audits) + 1, candidates: 0 } : before);
  });

  it('a required audit failure before COMMIT rolls back content, candidate and evidence', async () => {
    const draft = await candidate(); const before = await persisted(sectionId, draft.id); mode = 'audit-fails';
    const res = await author(request(app).post(`/api/authoring/sections/${sectionId}/ai/draft/accept`)).send({ draftId: draft.id });
    expect(res.status).toBe(500); expect(res.body.error.code).toBe('LINEAGE_REQUIRED');
    expect(statements).not.toContain('COMMIT'); expect(statements.filter(sql => sql === 'ROLLBACK')).toHaveLength(1);
    expect(releases).toHaveBeenCalledWith(undefined); expect(await persisted(sectionId, draft.id)).toEqual(before);
  });

  it.each([false, true])('missing candidate rolls back once and discards only a failed rollback: %s', async failedRollback => {
    if (failedRollback) mode = 'rollback-fails';
    const res = await author(request(app).post(`/api/authoring/sections/${sectionId}/ai/draft/accept`)).send({ draftId: '00000000-0000-4000-8000-000000000001' });
    expect(res.status).toBe(410); expect(res.body.error.code).toBe('DRAFT_EXPIRED');
    expect(statements.filter(sql => sql === 'ROLLBACK')).toHaveLength(1); expect(statements).not.toContain('COMMIT');
    expect(releases).toHaveBeenCalledWith(failedRollback ? expect.any(Error) : undefined); await cleanup;
  });
});
