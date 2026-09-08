/**
 * Authoring AI-draft ACCEPT — the wiring of the Phase 3 persistence point.
 *
 * The heavy logic (verified-quote attribution, author remainder, coverage gate,
 * stale-quote retirement, single-use tenant-scoped consume) is proven at the
 * service level against real migrations in
 * clinical-regulatory-evidence/__tests__. This pins the ROUTE contract: input
 * validation, the not-found / expired paths, and that a successful accept commits
 * content + lineage together and returns the attribution summary.
 *
 * The router carries its own §11 JWT gate, so the test signs a real HS256 token
 * (matching the fallback test). The DB and the two attribution services are
 * mocked — the route's job here is orchestration, not the SQL.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockClientQuery, mockConsume, mockEnforce } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockClientQuery: vi.fn(),
  mockConsume: vi.fn(),
  mockEnforce: vi.fn(),
}));

// The router binds `const pool = getPool()` at import, and the accept handler
// uses pool.connect() for its transaction — so getPool() MUST return connect too.
// The factory is hoisted, so build the api object inside it (only the hoisted
// mock fns may be referenced).
vi.mock('../../db', () => {
  const api = {
    query: (...a: unknown[]) => mockQuery(...a),
    connect: async () => ({
      query: (...a: unknown[]) => mockClientQuery(...a),
      release: () => {},
    }),
  };
  return { pool: api, getPool: () => api, query: (...a: unknown[]) => mockQuery(...a), db: {} };
});
vi.mock('../../services/clinical-regulatory-evidence/draft-candidate-store.js', () => ({
  consumeDraftCandidate: (...a: unknown[]) => mockConsume(...a),
  createDraftCandidate: vi.fn(async () => ({ id: 'draft-xyz', expiresAt: 'later' })),
}));
vi.mock('../../services/clinical-regulatory-evidence/lineage-gate.js', () => ({
  enforceSourceAndAuthorLineage: (...a: unknown[]) => mockEnforce(...a),
  enforceAuthorLineage: vi.fn(async () => {}),
}));

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authoring-accept';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ sub: 'u1', organizationId: 7, email: 'author@test.co' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

/** Default DB: the section exists and belongs to org 7; everything else empty. */
function sectionExists() {
  mockQuery.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('FROM authoring_sections')) {
      return { rowCount: 1, rows: [{ id: 'S1', doc_id: 'D1', content: 'prior text' }] };
    }
    return { rowCount: 0, rows: [] };
  });
}

/** Default tx client: BEGIN/COMMIT/ROLLBACK are no-ops; the UPDATE returns a row. */
function txOk() {
  mockClientQuery.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('UPDATE authoring_sections')) {
      return { rowCount: 1, rows: [{ id: 'S1', doc_id: 'D1', content: 'accepted text' }] };
    }
    return { rowCount: 0, rows: [] };
  });
}

describe('POST /sections/:id/ai/draft/accept', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockConsume.mockReset();
    mockEnforce.mockReset();
  });

  it('400 when draftId is missing', async () => {
    sectionExists();
    const res = await request(makeApp())
      .post('/api/authoring/sections/S1/ai/draft/accept')
      .set('Authorization', await bearer())
      .send({});
    expect(res.status).toBe(400);
    expect(mockConsume).not.toHaveBeenCalled();
  });

  it('404 when the section is not found for this tenant (past the edit guard)', async () => {
    // The edit guard's own lookup (SELECT d.status …) passes, but the handler's
    // tenant-scoped section SELECT returns nothing — so the handler 404s.
    mockQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('d.status')) return { rowCount: 1, rows: [{ status: null }] };
      return { rowCount: 0, rows: [] };
    });
    const res = await request(makeApp())
      .post('/api/authoring/sections/S1/ai/draft/accept')
      .set('Authorization', await bearer())
      .send({ draftId: 'd1' });
    expect(res.status).toBe(404);
  });

  it('410 when the draft candidate is missing/expired/already accepted', async () => {
    sectionExists();
    txOk();
    mockConsume.mockResolvedValue(null); // nothing to claim
    const res = await request(makeApp())
      .post('/api/authoring/sections/S1/ai/draft/accept')
      .set('Authorization', await bearer())
      .send({ draftId: 'gone' });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('DRAFT_EXPIRED');
    expect(mockEnforce).not.toHaveBeenCalled();
  });

  it('accepts a draft: consumes it, records lineage, returns the attribution summary', async () => {
    sectionExists();
    txOk();
    mockConsume.mockResolvedValue({
      id: 'd1',
      sectionId: 'S1',
      content: 'The primary endpoint was met.',
      sources: [{ evidenceSourceId: 42, content: 'The primary endpoint was met.', title: 'csr.pdf' }],
      createdBy: 'u1',
    });
    mockEnforce.mockResolvedValue({ sourceSpans: 1, authorSpans: 0, distinctSources: 1, coverage: 100 });

    const res = await request(makeApp())
      .post('/api/authoring/sections/S1/ai/draft/accept')
      .set('Authorization', await bearer())
      .send({ draftId: 'd1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.attribution).toEqual({ sourceSpans: 1, authorSpans: 0, distinctSources: 1, coverage: 100 });
    // The gate was invoked with org 7, the authoring_sections ref, and the sources
    // mapped to source-attribution's RetrievedSource shape (sourceId, not evidenceSourceId).
    expect(mockEnforce).toHaveBeenCalledTimes(1);
    const [, orgArg, refArg, contentArg, actorArg, sourcesArg] = mockEnforce.mock.calls[0];
    expect(orgArg).toBe(7);
    expect(refArg).toEqual({ documentTable: 'authoring_sections', documentId: 'S1' });
    expect(contentArg).toBe('The primary endpoint was met.');
    expect(actorArg).toBe('u1');
    expect(sourcesArg).toEqual([{ sourceId: 42, content: 'The primary endpoint was met.', title: 'csr.pdf' }]);
  });

  it('attributes the EDITED text when the client sends its own content', async () => {
    sectionExists();
    txOk();
    mockConsume.mockResolvedValue({
      id: 'd1',
      sectionId: 'S1',
      content: 'original draft',
      sources: [],
      createdBy: 'u1',
    });
    mockEnforce.mockResolvedValue({ sourceSpans: 0, authorSpans: 1, distinctSources: 0, coverage: 0 });

    const res = await request(makeApp())
      .post('/api/authoring/sections/S1/ai/draft/accept')
      .set('Authorization', await bearer())
      .send({ draftId: 'd1', content: 'the author edited this before saving' });

    expect(res.status).toBe(200);
    const [, , , contentArg] = mockEnforce.mock.calls[0];
    expect(contentArg).toBe('the author edited this before saving');
  });

  it('commits the accepted draft to the filing, and reports whether it landed', async () => {
    /* The handler used to write authoring_sections (the working copy) and stop,
       leaving c2c_document_sections — what the filing IS — holding the
       pre-draft content: the same working-copy/filing drift the revert path
       had, and the widest one, since AI drafting is a primary use of this
       surface. The accept now runs commitSectionToFiling in its transaction. */
    sectionExists();
    txOk();
    mockConsume.mockResolvedValue({ id: 'd1', sectionId: 'S1', content: 'x', sources: [], createdBy: 'u1' });
    mockEnforce.mockResolvedValue({ sourceSpans: 0, authorSpans: 1, distinctSources: 0, coverage: 0 });

    const res = await request(makeApp())
      .post('/api/authoring/sections/S1/ai/draft/accept')
      .set('Authorization', await bearer())
      .send({ draftId: 'd1' });

    expect(res.status).toBe(200);
    // commitSectionToFiling's capability probe ran on the TRANSACTION client —
    // proof the filing commit is inside the same transaction as the content.
    const probed = mockClientQuery.mock.calls.some((c) =>
      String(c[0]).includes("to_regclass('public.c2c_document_sections')"));
    expect(probed, 'the accept never tried to reach the filing').toBe(true);
    // And the response states the outcome, honest either way (here: not
    // provisioned under the mock), rather than letting the stores drift silently.
    expect(res.body).toHaveProperty('filing');
    expect(res.body.filing.committed).toBe(false);
  });

  it('never records "Accepted AI draft" as the reason for change', async () => {
    /* That fallback put a MECHANISM in the reason-for-change field, where it
       read as the author's justification — the pattern removed from the manual
       save. When the author states nothing, the record says nothing; the fact
       that it was an AI draft lives in the metadata, not the reason. */
    sectionExists();
    txOk();
    mockConsume.mockResolvedValue({ id: 'd1', sectionId: 'S1', content: 'x', sources: [], createdBy: 'u1' });
    mockEnforce.mockResolvedValue({ sourceSpans: 0, authorSpans: 1, distinctSources: 0, coverage: 0 });

    await request(makeApp())
      .post('/api/authoring/sections/S1/ai/draft/accept')
      .set('Authorization', await bearer())
      .send({ draftId: 'd1' });

    // The audit INSERT carries change_reason at value index 9.
    const insert = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO') && String(c[0]).includes('authoring_audit_trail'));
    expect(insert, 'no authoring_audit_trail row was written').toBeTruthy();
    const reason = (insert![1] as unknown[])[9];
    expect(reason, 'a mechanism string was recorded as the reason').not.toBe('Accepted AI draft');
    expect(reason).toBeNull();
  });

  it('records the author\'s stated reason when they give one', async () => {
    sectionExists();
    txOk();
    mockConsume.mockResolvedValue({ id: 'd1', sectionId: 'S1', content: 'x', sources: [], createdBy: 'u1' });
    mockEnforce.mockResolvedValue({ sourceSpans: 0, authorSpans: 1, distinctSources: 0, coverage: 0 });

    await request(makeApp())
      .post('/api/authoring/sections/S1/ai/draft/accept')
      .set('Authorization', await bearer())
      .send({ draftId: 'd1', changeReason: 'Incorporated the reviewer’s requested safety language.' });

    const insert = mockQuery.mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO') && String(c[0]).includes('authoring_audit_trail'));
    expect((insert![1] as unknown[])[9]).toBe('Incorporated the reviewer’s requested safety language.');
  });

  it('500 (fails closed) when lineage cannot be recorded — rolls content back', async () => {
    sectionExists();
    txOk();
    mockConsume.mockResolvedValue({ id: 'd1', sectionId: 'S1', content: 'x', sources: [], createdBy: 'u1' });
    mockEnforce.mockRejectedValue(new Error('lineage does not cover the saved content'));

    const res = await request(makeApp())
      .post('/api/authoring/sections/S1/ai/draft/accept')
      .set('Authorization', await bearer())
      .send({ draftId: 'd1' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('LINEAGE_REQUIRED');
    // ROLLBACK was issued on the transaction client.
    expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
  });
});
