/**
 * A deep-research job is read for one organisation, on both routes that read it
 * (D3, 2026-10-11; evidence docs/evidence/D6/2026-10-11-trunk-ci/).
 *
 * `getJobStatus(jobId, organizationId?)` took the organisation as OPTIONAL and
 * its SQL read `($2::int IS NULL OR organization_id = $2)`, so a null lifted the
 * predicate over every tenant's row. `GET /jobs/:id` refused with 400 when it
 * could not resolve an organisation; `GET /jobs/:id/stream`, over the same read,
 * passed `undefined` instead — so a request with no resolvable organisation
 * streamed any tenant's job, its results and synthesis included, by guessing an
 * id. Its comment claimed "a foreign-tenant job id reads as not found".
 *
 * The scope is in the SQL and in the signature: the organisation is required,
 * and both routes refuse before the read when they cannot resolve one.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { query, pass } = vi.hoisted(() => ({
  query: vi.fn(),
  pass: (_q: unknown, _s: unknown, n: () => void) => n(),
}));

vi.mock('../../middleware/auth.js', () => ({ authenticateToken: pass }));
vi.mock('../../services/license-manager.js', () => ({ loadLicense: () => pass, requireTier: () => pass }));
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import router from '../deep-research';

/** Another organisation's job, as the table holds it. */
const FOREIGN_JOB = {
  id: 4242,
  uuid: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  organization_id: 999,
  project_id: null,
  user_id: 1,
  status: 'complete',
  query: 'Everything org 999 asked about its competitor',
  progress: 100,
  results: [{ secret: 'another tenant’s findings' }],
  synthesis: 'another tenant’s synthesis',
  credits_used: 10,
  connector_logs: null,
  created_at: new Date(),
  completed_at: new Date(),
};

/** `app(org)`: a request whose organisation is `org`, or none at all when null. */
function app(org: number | null) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as any).user = { organizationId: org, id: 1 };
    next();
  });
  a.use('/api/deep-research', router);
  return a;
}

beforeEach(() => {
  query.mockReset();
  // The store answers only for the organisation the statement asks for: a read
  // with no organisation in its parameters finds nothing here, so the proof is
  // the refusal and the absent read, not a row this double happened to return.
  query.mockImplementation(async (_sql: string, params: unknown[] = []) => {
    const org = params[1];
    return { rows: org === 999 ? [FOREIGN_JOB] : [], rowCount: org === 999 ? 1 : 0 };
  });
});

describe('GET /api/deep-research/jobs/:id/stream is scoped to one organisation', () => {
  it('a request with no resolvable organisation is refused, and reads no job at all', async () => {
    const res = await request(app(null)).get('/api/deep-research/jobs/4242/stream');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body ?? res.text)).not.toContain('synthesis');
    expect(query).not.toHaveBeenCalled();
  });

  it("control: with an organisation, another organisation's job id streams as not found", async () => {
    const res = await request(app(7)).get('/api/deep-research/jobs/4242/stream');
    expect(res.text).toContain('Job not found');
    expect(res.text).not.toContain('synthesis');
    // The organisation reached the statement, so the store could refuse the row.
    expect(query.mock.calls[0][1]).toEqual([4242, 7]);
  });
});

describe('GET /api/deep-research/jobs/:id keeps refusing without an organisation', () => {
  it('is 400 and reads nothing (unchanged)', async () => {
    const res = await request(app(null)).get('/api/deep-research/jobs/4242');
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('getJobStatus cannot be called without an organisation', () => {
  it('refuses rather than reading every tenant: no statement runs', async () => {
    const { getJobStatus } = await import('../../services/deep-research-orchestrator');
    await expect(
      // The hole as it was: the organisation omitted at the call.
      (getJobStatus as unknown as (id: number) => Promise<unknown>)(4242),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
});
