/**
 * POST /api/governed-intelligence/contradictions/:id/review is a governed
 * decision, and records itself as one.
 *
 * Resolving a finding is what clears the submission gate: checkPromotionBlocked
 * and the Inconsistency surface's giPromotionGate both drop a finding once its
 * review_state is 'approved_resolution' or 'superseded'. Before this change the
 * route passed `req.body.reviewState` unvalidated into a bare
 * `UPDATE contradiction_findings` on the shared pool — no reason, no role gate,
 * no audit row — and the surface rendered the resolver as the literal
 * 'AnA + you'. A contradiction could leave the gate with nothing on the
 * record saying who cleared it or why.
 *
 * Run against real Postgres (PGlite) through the real router and service, with
 * the table taken from its creating migration, because the properties under
 * test are transactional: the UPDATE and the ledger row commit together or not
 * at all. Only the ledger primitive is stubbed, so the test can see which
 * client it ran on and make it fail.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';

const pg = new PGlite();

type Logged = { log: string[] };

/** Classifies each statement so the order on the client can be asserted. */
function kind(sql: string): string {
  const s = sql.replace(/\s+/g, ' ').trim();
  if (/^BEGIN/i.test(s)) return 'BEGIN';
  if (/^COMMIT/i.test(s)) return 'COMMIT';
  if (/^ROLLBACK/i.test(s)) return 'ROLLBACK';
  if (/set_config\('app\.current_tenant_id'/.test(s)) return 'TENANT';
  if (/FROM contradiction_findings[\s\S]*FOR UPDATE/i.test(s)) return 'LOCK';
  if (/^UPDATE contradiction_findings/i.test(s)) return 'UPDATE';
  return 'OTHER';
}

const run = async (sql: string, params?: unknown[]) => {
  const r = await pg.query(sql, (params ?? []) as unknown[]);
  return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? r.rows.length };
};

const H = vi.hoisted(() => ({
  clients: [] as Array<{ log: string[] }>,
  poolQueries: [] as string[],
  ledger: [] as Array<{ client: unknown; params: Record<string, unknown> }>,
  failLedger: false,
  failCommit: false,
}));

vi.mock('../../db', () => ({
  db: {},
  pool: {
    query: (sql: string, params?: unknown[]) => {
      H.poolQueries.push(sql);
      return run(sql, params);
    },
    connect: async () => {
      const c = {
        log: [] as string[],
        query: (sql: string, params?: unknown[]) => {
          c.log.push(kind(sql));
          if (H.failCommit && kind(sql) === 'COMMIT') {
            H.failCommit = false;
            return Promise.reject(new Error('Connection terminated unexpectedly'));
          }
          return run(sql, params);
        },
        release: () => {},
      };
      H.clients.push(c);
      return c;
    },
  },
}));

vi.mock('../c2c/actions', () => ({
  recordGovernedAction: async (client: Logged, params: Record<string, unknown>) => {
    client.log?.push('LEDGER');
    H.ledger.push({ client, params });
    if (H.failLedger) throw new Error('audit chain lock timeout');
    return { actionId: 'act_test1', auditId: 'aud-test-1', sha256Chain: 'c0ffee' };
  },
}));

import governedIntelRoutes from '../assumption-decision-contradiction';
import { contradictionEngineService } from '../../services/contradiction-engine-service';

const ORG = 9;
const OTHER_ORG = 4;
const USER = 7;
const OPEN_ID = '0c7f3a52-6a61-4b1e-9d7e-2f1a3b4c5d6e';
const RESOLVED_ID = '1d8e4b63-7b72-4c2f-8e8f-3a2b4c5d6e7f';
const FOREIGN_ID = '2e9f5c74-8c83-4d3a-9f90-4b3c5d6e7f80';
const REASON = 'IB §5.3 corrected to 400 mg BID to match the protocol';

function app(role = 'member', userId: number | null = USER) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: userId, organizationId: ORG, role };
    (req as any).userRole = role;
    next();
  });
  a.use('/api/governed-intelligence', governedIntelRoutes);
  return a;
}

const review = (id: string, body: Record<string, unknown>, role?: string) =>
  request(app(role)).post(`/api/governed-intelligence/contradictions/${id}/review`).send(body);

async function row(id: string) {
  return (
    await pg.query<Record<string, any>>(
      'SELECT review_state, resolved_by, resolved_at, resolution_notes FROM contradiction_findings WHERE id = $1',
      [id],
    )
  ).rows[0];
}

beforeAll(async () => {
  // The table as its creating migration declares it, not a hand-copied subset.
  const migration = readFileSync(
    path.resolve(process.cwd(), 'migrations/20260524_contradiction_engine_schema.sql'),
    'utf8',
  );
  const ddl = migration.match(/CREATE TABLE IF NOT EXISTS contradiction_findings \([\s\S]*?\n\);/);
  if (!ddl) throw new Error('contradiction_findings DDL not found in its creating migration');
  await pg.exec(ddl[0]);
}, 60_000);

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  H.clients.length = 0;
  H.poolQueries.length = 0;
  H.ledger.length = 0;
  H.failLedger = false;
  H.failCommit = false;
  await pg.exec('DELETE FROM contradiction_findings;');
  await pg.exec(`
    INSERT INTO contradiction_findings
      (id, organization_id, project_id, object_a_type, object_a_id, object_b_type, object_b_id,
       contradiction_type, severity, title, authority_state, review_state, resolved_by, resolved_at, resolution_notes)
    VALUES
      ('${OPEN_ID}', ${ORG}, 3, 'section', 'a', 'section', 'b', 'dosage_conflict', 'critical',
       'Starting dose disagrees', 'blocks_promotion', 'unresolved', NULL, NULL, NULL),
      ('${RESOLVED_ID}', ${ORG}, 3, 'section', 'c', 'section', 'd', 'parameter_mismatch', 'medium',
       'Dropout rate differs', 'requires_review', 'approved_resolution', '12', '2026-09-01 10:00:00', 'Reconciled earlier'),
      ('${FOREIGN_ID}', ${OTHER_ORG}, 3, 'section', 'e', 'section', 'f', 'dosage_conflict', 'critical',
       'Another tenant''s finding', 'blocks_promotion', 'unresolved', NULL, NULL, NULL);
  `);
});

describe('refusals happen before anything is written', () => {
  it('400s a reviewState outside the service enum, and touches no row', async () => {
    const res = await review(OPEN_ID, { reviewState: 'closed', reason: REASON });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REVIEW_STATE_INVALID');
    expect(H.clients.length, 'a transaction was opened for an invalid state').toBe(0);
    expect((await row(OPEN_ID)).review_state).toBe('unresolved');
  });

  it('400s a missing reviewState', async () => {
    const res = await review(OPEN_ID, { reason: REASON });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REVIEW_STATE_INVALID');
  });

  it('400s a transition with no reason', async () => {
    const res = await review(OPEN_ID, { reviewState: 'approved_resolution' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REASON_REQUIRED');
    expect(H.ledger.length).toBe(0);
    expect((await row(OPEN_ID)).review_state).toBe('unresolved');
  });

  it('400s a reason that is under 8 characters once trimmed', async () => {
    const res = await review(OPEN_ID, { reviewState: 'approved_resolution', reason: '   fixed    ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('REASON_REQUIRED');
    expect((await row(OPEN_ID)).review_state).toBe('unresolved');
  });

  it('403s a viewer — the one organisation role that does not write', async () => {
    const res = await review(OPEN_ID, { reviewState: 'approved_resolution', reason: REASON }, 'viewer');
    expect(res.status).toBe(403);
    expect(H.ledger.length).toBe(0);
    expect((await row(OPEN_ID)).review_state).toBe('unresolved');
  });

  it("404s another tenant's finding and records nothing", async () => {
    const res = await review(FOREIGN_ID, { reviewState: 'approved_resolution', reason: REASON });
    expect(res.status).toBe(404);
    expect(H.ledger.length).toBe(0);
    expect((await row(FOREIGN_ID)).review_state).toBe('unresolved');
  });
});

describe('a resolution is one transaction: the UPDATE and its ledger row', () => {
  it('runs UPDATE and recordGovernedAction on the SAME client, then COMMITs', async () => {
    const res = await review(OPEN_ID, { reviewState: 'approved_resolution', reason: `  ${REASON}  ` });
    expect(res.status).toBe(200);

    expect(H.clients.length).toBe(1);
    expect(H.clients[0].log).toEqual(['BEGIN', 'TENANT', 'LOCK', 'UPDATE', 'LEDGER', 'COMMIT']);
    expect(H.ledger.length).toBe(1);
    expect(H.ledger[0].client, 'the ledger ran on a different client from the UPDATE').toBe(H.clients[0]);
    // Nothing governed went around the transaction on the shared pool.
    expect(H.poolQueries.some((q) => /UPDATE contradiction_findings/i.test(q))).toBe(false);

    expect(H.ledger[0].params).toMatchObject({
      orgId: ORG,
      userId: USER,
      command: 'resolve',
      target: `contradiction-finding:${OPEN_ID}`,
      reason: REASON,
      payload: { from: 'unresolved', to: 'approved_resolution' },
    });
  });

  it('returns the PERSISTED resolver and time, plus the governance ids', async () => {
    const res = await review(OPEN_ID, { reviewState: 'approved_resolution', reason: REASON });
    expect(res.status).toBe(200);

    const persisted = await row(OPEN_ID);
    expect(persisted.review_state).toBe('approved_resolution');
    expect(persisted.resolved_by).toBe(String(USER));
    expect(persisted.resolved_at).not.toBeNull();
    expect(persisted.resolution_notes).toBe(REASON);

    expect(res.body.finding.reviewState).toBe('approved_resolution');
    expect(res.body.finding.resolvedBy).toBe(String(USER));
    expect(res.body.finding.resolvedAt).toBe(new Date(persisted.resolved_at).toISOString());
    expect(res.body.previousReviewState).toBe('unresolved');
    expect(res.body.governance).toEqual({
      command: 'resolve',
      actionId: 'act_test1',
      auditId: 'aud-test-1',
      sha256Chain: 'c0ffee',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/AnA \+ you/);
  });

  it('records a re-open as `reopen` and clears the resolver it no longer has', async () => {
    const res = await review(RESOLVED_ID, {
      reviewState: 'unresolved',
      reason: 'The IB amendment was withdrawn; the conflict is live again',
    });
    expect(res.status).toBe(200);
    expect(H.ledger[0].params).toMatchObject({
      command: 'reopen',
      payload: { from: 'approved_resolution', to: 'unresolved' },
    });
    // A reopened finding carrying the old resolved_at is counted as resolved by
    // readers that key on it (pdev-contradiction-bridge counts resolvedAt).
    const persisted = await row(RESOLVED_ID);
    expect(persisted.review_state).toBe('unresolved');
    expect(persisted.resolved_by).toBeNull();
    expect(persisted.resolved_at).toBeNull();
    expect(res.body.finding.resolvedBy).toBeNull();
    expect(res.body.finding.resolvedAt).toBeNull();
  });

  it('a ledger failure ROLLS BACK, answers 5xx, and leaves the finding as it was', async () => {
    H.failLedger = true;
    const res = await review(OPEN_ID, { reviewState: 'approved_resolution', reason: REASON });

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.error).toBe('REVIEW_NOT_RECORDED');
    expect(res.body.message).toMatch(/unchanged/);
    expect(H.clients[0].log).toContain('ROLLBACK');
    expect(H.clients[0].log).not.toContain('COMMIT');

    // The UPDATE ran inside the transaction, so the rollback undid it.
    const persisted = await row(OPEN_ID);
    expect(persisted.review_state).toBe('unresolved');
    expect(persisted.resolved_by).toBeNull();
    expect(persisted.resolved_at).toBeNull();
    expect(persisted.resolution_notes).toBeNull();
  });
});

describe('an outcome nobody can confirm, and an unattributed caller', () => {
  it('a COMMIT that fails is OUTCOME_UNKNOWN, never "left unchanged"', async () => {
    H.failCommit = true;
    const res = await review(OPEN_ID, { reviewState: 'approved_resolution', reason: REASON });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('OUTCOME_UNKNOWN');
    expect(res.body.message).toMatch(/could not be confirmed/);
    expect(res.body.message).not.toMatch(/unchanged/);
  });

  it('401s a session with no numeric user, before anything is opened', async () => {
    const res = await request(app('member', null))
      .post(`/api/governed-intelligence/contradictions/${OPEN_ID}/review`)
      .send({ reviewState: 'approved_resolution', reason: REASON });
    expect(res.status).toBe(401);
    expect(H.clients).toHaveLength(0);
    expect(H.ledger).toHaveLength(0);
    expect((await row(OPEN_ID)).review_state).toBe('unresolved');
  });
});

describe('a decision already on the record is not recorded again', () => {
  // A stale board (a second reviewer's tab, or the same form re-submitted after
  // a network failure) sends the state the finding already has. Accepting it
  // wrote a second 'resolve' ledger row {from: X, to: X} and re-stamped
  // resolved_by / resolved_at, crediting a person who only repeated a decision
  // someone else had made.
  it('409s resolving an already-resolved finding: no UPDATE, no ledger row, the recorded resolver kept', async () => {
    const before = await row(RESOLVED_ID);
    const res = await review(RESOLVED_ID, { reviewState: 'approved_resolution', reason: REASON });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('REVIEW_STATE_UNCHANGED');
    expect(H.ledger.length, 'a repeated decision was written to the ledger').toBe(0);
    expect(H.clients[0].log).toEqual(['BEGIN', 'TENANT', 'LOCK', 'ROLLBACK']);

    const after = await row(RESOLVED_ID);
    expect(after.resolved_by, 'the resolver was re-stamped with the repeating actor').toBe('12');
    expect(after).toEqual(before);
  });

  it('refuses a repeated non-clearing transition the same way (the orchestrator path)', async () => {
    const note = 'Bundle b-1 execution: 3 executed, 0 prepared, 0 blocked';
    await contradictionEngineService.transitionReviewState(OPEN_ID, ORG, 'reviewed', String(USER), note);
    await expect(
      contradictionEngineService.transitionReviewState(OPEN_ID, ORG, 'reviewed', String(USER), note),
    ).rejects.toMatchObject({ code: 'REVIEW_STATE_UNCHANGED' });
    expect(H.ledger.length).toBe(1);
  });
});

describe('the service refuses an unattributable transition', () => {
  it('throws before opening a transaction when the actor is not a numeric user', async () => {
    await expect(
      contradictionEngineService.transitionReviewState(OPEN_ID, ORG, 'reviewed', 'system', REASON),
    ).rejects.toMatchObject({ code: 'ACTOR_REQUIRED' });
    expect(H.clients.length).toBe(0);
    expect((await row(OPEN_ID)).review_state).toBe('unresolved');
  });

  it('records the orchestrator’s non-clearing transition as `transition`', async () => {
    const out = await contradictionEngineService.transitionReviewState(
      OPEN_ID,
      ORG,
      'reviewed',
      String(USER),
      'Bundle b-1 execution: 3 executed, 0 prepared, 0 blocked',
    );
    expect(out?.finding.reviewState).toBe('reviewed');
    expect(H.ledger[0].params).toMatchObject({ command: 'transition', payload: { from: 'unresolved', to: 'reviewed' } });
    // Reviewed is not resolved: the gate still counts it, so no resolver is stamped.
    expect(out?.finding.resolvedAt).toBeNull();
  });
});
