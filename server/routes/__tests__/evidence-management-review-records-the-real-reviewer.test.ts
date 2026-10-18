/**
 * Evidence review records the authenticated reviewer, approves nothing without
 * a signature, touches only the caller's organization, and says when nothing
 * matched.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 *   - POST /review/approve/:fileId set regulatory_status = 'approved' with the
 *     reviewer taken from the request BODY, 'system' when absent: no signature,
 *     no authenticated reviewer, no organization predicate.
 *   - POST /review/request-changes/:fileId wrote the body's reviewerId (or
 *     'system') into the review timeline as the reviewer.
 *   - POST /review/submit/:fileId assigned the file to reviewer 'system' when
 *     none was named, and every review/link write answered success when no row
 *     matched.
 *   - GET /requirements/:projectId counted a requirement "completed" on one
 *     approved file under any key (unknown and optional ones included), out of
 *     a hard-coded 8.
 *   - POST /auto-populate/:formId with no projectId answered 200 with an empty form.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../db', () => ({ db: { execute }, pool: {} }));
vi.mock('../../lib/unified-ai-client', () => ({ aiComplete: vi.fn() }));
vi.mock('../../middleware/uploadSafety', () => ({
  assertUploadSafe: vi.fn(),
  UploadSafetyError: class UploadSafetyError extends Error {},
}));
vi.mock('../../services/ingestion/tikaClient', () => ({ extractWithTika: vi.fn() }));
vi.mock('../../services/literature/grobidClient', () => ({
  extractWithGrobid: vi.fn(),
  looksScholarlyDocument: () => false,
}));
vi.mock('../../services/search/opensearchClient', () => ({ indexGovernedDocument: vi.fn(async () => undefined) }));

import router from '../evidence-management.routes';

const ORG = 7;
const SESSION_USER = 5;

function app(user: { id?: number; organizationId: number } = { id: SESSION_USER, organizationId: ORG }) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: typeof user }).user = user;
    next();
  });
  a.use('/api/evidence-management', router);
  return a;
}

const dialect = new PgDialect();
const statements = () => execute.mock.calls.map(([q]) => dialect.sqlToQuery(q as SQL));

beforeEach(() => {
  execute.mockReset();
  execute.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('approval is an electronic signature this endpoint does not take', () => {
  it('approves nothing, whatever reviewer the body names', async () => {
    const res = await request(app())
      .post('/api/evidence-management/review/approve/f1')
      .send({ reviewerId: 'mallory', comments: 'looks fine' });
    expect(execute).not.toHaveBeenCalled();
    expect(res.status).toBe(501);
    expect(res.body.error).toBe('EVIDENCE_APPROVAL_REQUIRES_SIGNATURE');
  });

  it('approves nothing as "system" when the body names nobody', async () => {
    const res = await request(app()).post('/api/evidence-management/review/approve/f1').send({});
    expect(execute).not.toHaveBeenCalled();
    expect(res.status).toBe(501);
  });
});

describe('the reviewer on the record is the authenticated user', () => {
  it('records the session user as the reviewer requesting changes, not the body', async () => {
    const res = await request(app())
      .post('/api/evidence-management/review/request-changes/f1')
      .send({ reviewerId: 'mallory', comments: 'fix table 3' });
    expect(res.status).toBe(200);
    const [q] = statements();
    expect(JSON.stringify(q.params)).not.toContain('mallory');
    expect(q.params).toContain(String(SESSION_USER));
    expect(q.sql).toMatch(/organization_id\s*=\s*\$\d+/);
    expect(q.params).toContain(ORG);
  });

  it('refuses a change request with no authenticated user instead of writing "system"', async () => {
    const res = await request(app({ organizationId: ORG }))
      .post('/api/evidence-management/review/request-changes/f1')
      .send({ comments: 'fix table 3' });
    expect(execute).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it('refuses to submit for review without a named reviewer instead of assigning "system"', async () => {
    const res = await request(app()).post('/api/evidence-management/review/submit/f1').send({});
    expect(execute).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reviewerId/);
  });

  it("scopes a submission to the caller's organization and says when no file matched", async () => {
    execute.mockResolvedValue({ rows: [], rowCount: 0 });
    const res = await request(app()).post('/api/evidence-management/review/submit/f1').send({ reviewerId: '9' });
    const [q] = statements();
    expect(q.sql).toMatch(/organization_id\s*=\s*\$\d+/);
    expect(res.status).toBe(404);
  });

  it('does not report a workflow link that matched no file', async () => {
    execute.mockResolvedValue({ rows: [], rowCount: 0 });
    const res = await request(app())
      .post('/api/evidence-management/link-workflow')
      .send({ fileId: 'f1', workflowStage: 2 });
    expect(res.status).toBe(404);
  });
});

describe('reads are scoped and complete only by the gap-analysis rules', () => {
  it("reads stage evidence for the caller's organization only", async () => {
    await request(app()).get('/api/evidence-management/stage-evidence/p1/1');
    const [q] = statements();
    expect(q.sql).toMatch(/organization_id\s*=\s*\$\d+/);
    expect(q.params).toContain(ORG);
  });

  it('does not count unknown or optional requirements toward completion', async () => {
    execute.mockResolvedValue({
      rows: [
        { fda_requirement: 'general', fda_section: null, regulatory_status: 'approved', file_count: '2', approved_count: '2' },
        { fda_requirement: 'software', fda_section: 'sds', regulatory_status: 'approved', file_count: '1', approved_count: '1' },
      ],
    });
    const res = await request(app()).get('/api/evidence-management/requirements/p1');
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(0);
    expect(res.body.total).toBe(6);
    expect(res.body.percentage).toBe(0);
  });

  it('refuses form auto-population without a projectId instead of answering an empty form', async () => {
    const res = await request(app()).post('/api/evidence-management/auto-populate/form-1').send({});
    expect(execute).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
  });
});
