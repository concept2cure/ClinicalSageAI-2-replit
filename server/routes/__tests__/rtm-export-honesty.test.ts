/**
 * A traceability matrix must not report a state it never established.
 *
 * THE STORE THIS ROUTE READS HAS NO WRITERS. `evidence_claims`,
 * `evidence_sources` and `evidence_claim_links` are created only by
 * db/migrations/20260319_evidence_fabric.sql, which is on no durable apply path
 * (absent from C2C_MIGRATION_FILES and from the drizzle journal), and nothing in
 * the repo INSERTs into them. So in practice this route either raises 42P01 or
 * reads an empty table — and it used to render both as an answer:
 *
 *   - zero claims produced `untracedClaims: 0`, which a regulatory reviewer
 *     reads as "nothing is untraced", i.e. everything is traced, beside a
 *     `coverageScore: 0` that asserts a MEASURED nought where nothing was
 *     measured;
 *   - a missing relation produced a bare 500 "Failed to generate traceability
 *     matrix", indistinguishable from a transient fault;
 *   - and the CSV route hashed a header-only file and filed it as a governed
 *     regulated export titled "RTM Export: Program N", with nothing on the
 *     artifact saying it traces nothing.
 *
 * These tests pin the three states apart. The rule is the repo's own: an empty
 * result is not a finding of "none".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { dbState } = vi.hoisted(() => ({
  // The route runs TWO queries per request — claims, then links — off the same
  // chain, so the mock has to answer them differently. Returning one row set for
  // both made every claim look linked, i.e. 100% traced.
  dbState: { claims: [] as any[], links: [] as any[], throwCode: null as string | null, call: 0 },
}));

// Minimal drizzle chain: .select().from().innerJoin().where() resolves to rows.
vi.mock('../../db', () => {
  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => {
      if (dbState.throwCode) {
        const e: any = new Error('relation does not exist');
        e.code = dbState.throwCode;
        return Promise.reject(e);
      }
      const rows = dbState.call === 0 ? dbState.claims : dbState.links;
      dbState.call += 1;
      return Promise.resolve(rows);
    },
  };
  return { db: { select: () => chain } };
});

// The governed-export registrar is exercised separately; here it must simply
// not be the reason a request fails.
vi.mock('../../services/compute/exportGovernance', () => ({
  registerExportGovernanceQuick: vi.fn(async () => ({ ok: true, id: 'gov-1' })),
}));

let app: express.Express;

beforeEach(async () => {
  dbState.claims = [];
  dbState.links = [];
  dbState.throwCode = null;
  dbState.call = 0;
  const mod = await import('../rtm-export');
  app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 3, organizationId: 1, name: 'Avery Author' };
    (req as any).tenantId = 1;
    next();
  });
  app.use('/api/rtm', mod.default);
});

describe('RTM — an unprovisioned store is not an empty matrix', () => {
  it('JSON: a missing relation fails closed and says so, rather than 500-ing generically', async () => {
    dbState.throwCode = '42P01';
    const res = await request(app).get('/api/rtm/programs/7/rtm');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('CLAIM_STORE_UNPROVISIONED');
    // The distinction is the whole point: nothing was read.
    expect(res.body.error.message).toMatch(/not an empty matrix/i);
  });

  it('CSV: a missing relation refuses instead of filing a governed export', async () => {
    dbState.throwCode = '42P01';
    const res = await request(app).get('/api/rtm/programs/7/rtm/csv');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('CLAIM_STORE_UNPROVISIONED');
    const gov = await import('../../services/compute/exportGovernance');
    // Nothing may be registered as a regulated export when nothing was read.
    expect(gov.registerExportGovernanceQuick).not.toHaveBeenCalled();
  });
});

describe('RTM — zero claims is not full coverage', () => {
  it('does not report a measured coverage score when nothing was measured', async () => {
    const res = await request(app).get('/api/rtm/programs/7/rtm');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('no-claims-recorded');
    // 0 asserts "we checked and none of it is traced". null says nothing was
    // there to check.
    expect(res.body.summary.coverageScore).toBeNull();
    // 0 - 0 = 0 read as "nothing is untraced", i.e. everything is traced.
    expect(res.body.summary.untracedClaims).toBeNull();
    expect(res.body.summary.totalClaims).toBe(0);
  });

  it('the exported CSV states its own emptiness on the artifact', async () => {
    const res = await request(app).get('/api/rtm/programs/7/rtm/csv');
    expect(res.status).toBe(200);
    // The file is hashed and filed as a governed export; a reviewer opening it
    // must be able to tell an empty program from an unwired feature.
    expect(res.text).toMatch(/No evidence claims are recorded/i);
    expect(res.text).toMatch(/not a finding that every claim is traced/i);
  });
});

describe('RTM — a real matrix still reports real numbers', () => {
  it('computes coverage when claims exist, and does not suppress it', async () => {
    // The guards above must not cost a genuine measurement. One claim, no
    // links → 0% traced, which here IS a finding.
    dbState.claims = [
      {
        claimId: 1, claimText: 'Device meets MARD ≤ 10%', claimType: 'performance',
        confidence: 0.9, extractionMethod: 'manual', sourceTitle: 'Study A',
        sourceType: 'csr', contentHash: 'abc', sourceFileName: 'a.pdf',
      },
    ];
    const res = await request(app).get('/api/rtm/programs/7/rtm');
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('claims-present');
    expect(res.body.summary.totalClaims).toBe(1);
    // Now 0 is a measurement, and it is reported as one.
    expect(res.body.summary.coverageScore).toBe(0);
    expect(res.body.summary.untracedClaims).toBe(1);
  });
});
