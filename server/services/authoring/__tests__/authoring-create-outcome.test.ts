/** Real canonical PGlite writes, with synthetic transport loss (not native socket/provider proof). */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type express from 'express';
import { createJourneyDb, type JourneyDb } from '../../../../tests/golden-journeys/harness';
import { PREREQ, VAULT_DDL, AUTHORING_ACCESS_DDL, PROGRAM, ORG, AUTHOR, makeApp, mint, asToken } from '../../../routes/__tests__/_authoring-canvas-fixture';
import { AUTHORING_TOOL_MIGRATIONS, DISPOSITION_IMPACT_PREREQ } from '../../ana/__tests__/support/authoring-tool-db';
import { approvedToolHandler } from '../../ana/__tests__/support/approved-tool-handler';
import { createDocumentFromDraft } from '../authoring-from-draft';
import { insertDocumentTx, type AuthoringPool, type CreateContext, type DocumentRowSpec } from '../authoring-documents';
import { AuthoringCreateOutcomeError, authoringCreationRecoveryPayload } from '../authoring-create-outcome';

// Test-only mutation control replays the former rollback/clean-release behavior.
// Select only the after-commit case when recording its expected failing proof.
vi.mock('../authoring-create-outcome', async importOriginal => {
  const actual = await importOriginal<typeof import('../authoring-create-outcome')>();
  if (process.env.OCT17_AUTHORING_LEGACY_CONTROL !== '1') return actual;
  const legacy: typeof actual.rejectAuthoringCreateTransaction = async (client, state, error) => {
    await client.query('ROLLBACK').catch(() => { state.discardConnection = new Error('Legacy rollback failed'); });
    throw error;
  };
  return { ...actual, rejectAuthoringCreateTransaction: legacy };
});

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../../db.js', () => ({
  get db() { return h.db; }, get pool() { return h.pool; }, getPool: () => h.pool,
  query: (text: string, params?: unknown[]) => (h.pool as AuthoringPool).query(text, params),
}));
let jdb: JourneyDb;
let app: express.Express;
let author: (r: request.Test) => request.Test;
let pool: AuthoringPool;
let mode: 'none' | 'before-commit' | 'after-commit' | 'readback' | 'revoked' | 'rollback-fails' | 'revoked-during-read' = 'none';
let committed = false;
let releaseCleanup = Promise.resolve();
let statements: string[] = [];
const releases = vi.fn();
const draft = { programId: PROGRAM, title: 'Synthetic creation outcome', module: 'M2',
  sections: [{ code: '2.5', title: 'Overview', content: '<p>Saved synthetic content.</p>' }], provenance: { source: 'seed' as const } };
const ctx = (): CreateContext => ({ pool, tenantId: ORG, actor: { id: String(AUTHOR.id), email: AUTHOR.email },
  audit: { pool, tenantId: ORG, actorId: String(AUTHOR.id), actorEmail: AUTHOR.email, actorRole: 'member', ipAddress: 'test', userAgent: 'test' } });

beforeAll(async () => {
  jdb = await createJourneyDb({ prereqSql: PREREQ + VAULT_DDL + DISPOSITION_IMPACT_PREREQ,
    migrations: [...AUTHORING_TOOL_MIGRATIONS], testOnlySql: AUTHORING_ACCESS_DDL });
  pool = {
    query: async (sql, values) => {
      if (committed && mode === 'readback' && /FROM authoring_sections WHERE doc_id/.test(sql)) throw new Error('Synthetic post-commit read failure');
      const result = await jdb.pool.query(sql, values);
      if (committed && mode === 'revoked-during-read' && /FROM authoring_sections WHERE doc_id/.test(sql)) {
        await jdb.pool.query('UPDATE projects SET owner_id=7,created_by_id=7 WHERE id=42');
        await jdb.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
      }
      return result;
    },
    connect: async () => ({
      query: async (sql, values) => {
        statements.push(sql);
        if (sql === 'ROLLBACK' && mode === 'rollback-fails') throw new Error('Synthetic rollback failure');
        if (sql === 'COMMIT' && mode === 'before-commit') throw new Error('Synthetic COMMIT send failure');
        const result = await jdb.pool.query(sql, values);
        if (sql === 'COMMIT') {
          committed = true;
          if (mode === 'after-commit') throw new Error('Synthetic lost COMMIT reply');
          if (mode === 'revoked') {
            await jdb.pool.query('UPDATE projects SET owner_id=7,created_by_id=7 WHERE id=42');
            await jdb.pool.query("UPDATE project_visibility_settings SET visibility='private' WHERE project_id=42");
          }
        }
        return result;
      },
      release: error => {
        releases(error);
        // PGlite has one connection. Model disposal's server-side rollback for
        // the unsent-COMMIT control without issuing ROLLBACK on the tested client.
        if (error && (mode === 'before-commit' || mode === 'rollback-fails')) releaseCleanup = jdb.pool.query('ROLLBACK').then(() => undefined);
      },
    }),
  };
  h.db = jdb.db; h.pool = pool;
  await import('../../ana/AnaToolExecutor');
  author = asToken(await mint(AUTHOR));
  app = makeApp((await import('../../../routes/authoring.router')).default);
}, 240_000);
beforeEach(async () => {
  await releaseCleanup;
  mode = 'none'; committed = false; statements = []; releases.mockClear();
  await jdb.pool.query('UPDATE projects SET owner_id=$1,created_by_id=$1 WHERE id=42', [Number(AUTHOR.id)]);
  await jdb.pool.query("UPDATE project_visibility_settings SET visibility='org_public' WHERE project_id=42");
});
afterAll(async () => { await releaseCleanup; await jdb?.close(); });

async function retained(documentId: string) {
  return (await jdb.pool.query(`SELECT
    (SELECT COUNT(*)::int FROM authoring_documents WHERE id=$1 AND tenant_id=$2) AS documents,
    (SELECT COUNT(*)::int FROM authoring_sections WHERE doc_id=$1 AND tenant_id=$2) AS sections,
    (SELECT COUNT(*)::int FROM authoring_audit_trail WHERE doc_id=$1 AND tenant_id=$2 AND operation_type='CREATE') AS creates`, [documentId, ORG])).rows[0];
}
function expectDiscarded() {
  expect(statements.filter(sql => sql === 'COMMIT')).toHaveLength(1);
  expect(statements).not.toContain('ROLLBACK');
  expect(releases).toHaveBeenCalledTimes(1);
  expect(releases).toHaveBeenCalledWith(expect.any(AuthoringCreateOutcomeError));
}
function checkRecovery(body: Record<string, any>, outcome: 'committed' | 'unconfirmed') {
  expect(body).toMatchObject({ ok: false, retryAllowed: false, creationOutcome: outcome,
    recovery: { organizationId: ORG, programId: PROGRAM, documentId: body.recovery?.documentId } });
  expect(body.recovery?.documentId).toMatch(/^[a-f0-9-]{36}$/);
  expect(body.error).not.toMatch(/nothing (?:was )?(saved|created)|not created|not written/i);
  for (const key of ['content', 'sections', 'document', 'provenance', 'title', 'authoringDocId', 'programId']) expect(body).not.toHaveProperty(key);
  if (outcome === 'unconfirmed') expect(body).not.toHaveProperty('saved');
  else expect(body.saved).toBe(true);
}

describe('canonical authoring creation recovery', () => {
  it.each(['before-commit', 'after-commit'] as const)('evicts without rollback/retry when %s cannot be confirmed', async fault => {
    mode = fault;
    let error: unknown;
    try { await createDocumentFromDraft(ctx(), draft); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(AuthoringCreateOutcomeError);
    const body = authoringCreationRecoveryPayload(error as AuthoringCreateOutcomeError);
    checkRecovery(body, 'unconfirmed'); expectDiscarded(); await releaseCleanup;
    expect(await retained(body.recovery.documentId)).toEqual(fault === 'after-commit'
      ? { documents: 1, sections: 1, creates: 1 } : { documents: 0, sections: 0, creates: 0 });
  });

  it.each(['readback', 'revoked', 'revoked-during-read'] as const)('retains confirmed identity without private content after %s failure', async fault => {
    mode = fault;
    let error: unknown;
    try { await createDocumentFromDraft(ctx(), draft); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(AuthoringCreateOutcomeError);
    const body = authoringCreationRecoveryPayload(error as AuthoringCreateOutcomeError);
    checkRecovery(body, 'committed');
    expect(await retained(body.recovery.documentId)).toEqual({ documents: 1, sections: 1, creates: 1 });
    expect(statements).not.toContain('ROLLBACK'); expect(releases).toHaveBeenCalledWith(undefined);
  });

  it.each(['draft_authoring_document', 'save_document_to_vault'].flatMap(tool => ['after-commit', 'readback'].map(fault => [tool, fault])))('%s carries actual creation identity after %s without content or retry', async (tool, fault) => {
    mode = fault as typeof mode;
    const handler = approvedToolHandler(tool)!;
    const input = tool === 'draft_authoring_document' ? draft : { title: draft.title, content: 'A synthetic draft.', reason: 'Saving the synthetic qualification draft.' };
    const body = JSON.parse(await handler(input, { organizationId: ORG, userId: Number(AUTHOR.id), projectRef: PROGRAM, humanConfirmed: true }));
    checkRecovery(body, fault === 'after-commit' ? 'unconfirmed' : 'committed');
    if (fault === 'after-commit') expectDiscarded();
    else expect(releases).toHaveBeenCalledWith(undefined);
    expect(await retained(body.recovery.documentId)).toEqual({ documents: 1, sections: 1, creates: 1 });
  });

  it.each(['/docs', '/docs/from-draft'])('%s returns 503 and real recovery IDs after a committed lost reply', async route => {
    mode = 'after-commit';
    const res = await author(request(app).post(`/api/authoring${route}`)).send(route === '/docs' ? { title: draft.title, client_program_id: PROGRAM } : draft);
    expect(res.status).toBe(503); checkRecovery(res.body, 'unconfirmed'); expectDiscarded();
    expect((await retained(res.body.recovery.documentId)) as Record<string, unknown>).toMatchObject({ documents: 1 });
  });

  it.each([false, true])('rolls back pre-commit failures and discards on rollback failure: %s', async rollbackFails => {
    if (rollbackFails) mode = 'rollback-fails';
    const spec: DocumentRowSpec = { docId: randomUUID(), title: draft.title, module: 'M2', productCode: null, locale: 'en-US', templateId: null, clientProgramId: PROGRAM, binding: { documentId: null } };
    await expect(insertDocumentTx(ctx(), spec, [], async () => { throw new Error('Before any write'); })).rejects.toThrow('Before any write');
    expect(statements).toEqual(['BEGIN', 'ROLLBACK']);
    expect(releases).toHaveBeenCalledWith(rollbackFails ? expect.any(Error) : undefined); await releaseCleanup;
    expect(await retained(spec.docId)).toEqual({ documents: 0, sections: 0, creates: 0 });
  });

  it('confirmed creation returns the canonical saved record and audited section', async () => {
    const outcome = await createDocumentFromDraft(ctx(), draft);
    expect(outcome.kind).toBe('created');
    if (outcome.kind !== 'created') throw new Error('Expected created record');
    expect(outcome.sections).toHaveLength(1);
    expect(await retained(String(outcome.document.id))).toEqual({ documents: 1, sections: 1, creates: 1 });
    expect(releases).toHaveBeenCalledWith(undefined);
  });
});
