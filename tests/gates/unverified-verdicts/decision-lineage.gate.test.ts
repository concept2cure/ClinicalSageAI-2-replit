/**
 * WO-16B findings 12 and 13 — /api/decision-lineage reports verdicts for a
 * chain verification that did not run.
 *
 * Failure is injected at the DEPENDENCY: the process-wide `pg` stub's
 * `query()` rejects with a Postgres error for the tamper-proof log, exactly as
 * a database missing that table (or refusing the role) would. Nothing at the
 * service boundary is mocked, so the route, auditService and
 * TamperProofAuditLog all run for real over the failing pool.
 *
 * RED on the pre-fix head: verify-chain answered 200 with
 * `chainIntegrity: 'INTEGRITY_FAILURE'` and `complianceStatus: 'NON_COMPLIANT'`
 * against four named regulations, and compliance-report emitted its attestation
 * and two unconditional `COMPLIANT` framework verdicts.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockPool } from '../../setup';
import { assertNoVerdictClaims } from '../../../scripts/ci/lib/verdict-inspector.mjs';

const storeDown = Object.assign(new Error('relation "audit.tamper_proof_log" does not exist'), {
  code: '42P01',
});

function queryText(arg: unknown): string {
  return typeof arg === 'string' ? arg : String((arg as { text?: string })?.text ?? '');
}

/**
 * Only the tamper-proof chain fails; every other query answers an honest empty
 * set. The stub's `query` is REASSIGNED rather than re-implemented: the
 * runtime's pool instrumentation wraps `pool.query` in place at import time,
 * so the vi.fn tests/setup created is no longer what services call.
 */
function failOnlyTheChain() {
  (mockPool as { query: unknown }).query = vi.fn((sql: unknown) =>
    /tamper_proof_log/i.test(queryText(sql))
      ? Promise.reject(storeDown)
      : Promise.resolve({ rows: [], rowCount: 0 }),
  );
}

async function app() {
  const router = (await import('../../../server/routes/decision-lineage')).default;
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 1, organizationId: 7, role: 'admin' };
    next();
  });
  a.use('/api/decision-lineage', router);
  return a;
}

describe('decision-lineage: the chain verifier could not run', () => {
  beforeEach(() => {
    failOnlyTheChain();
  });

  it('auditService.verifyChain says it did not run, rather than "invalid"', async () => {
    const { default: auditService } = await import('../../../server/services/auditService');
    const outcome = (await auditService.verifyChain()) as { ran?: boolean; reason?: string };
    expect(outcome.ran).toBe(false);
    expect(outcome.reason).toMatch(/42P01|does not exist/);
  });

  it('GET /verify-chain answers 503 and asserts no verdict', async () => {
    const res = await request(await app()).get('/api/decision-lineage/verify-chain');
    expect(res.status).toBe(503);
    expect(res.body.chainIntegrity).toBe('UNVERIFIABLE');
    expect(res.body.complianceStatus).toBe('UNVERIFIABLE');
    assertNoVerdictClaims(res.body, 'GET /api/decision-lineage/verify-chain');
  });

  it('GET /compliance-report withholds the attestation and every chain-dependent verdict', async () => {
    const res = await request(await app()).get('/api/decision-lineage/compliance-report');
    expect(res.status).toBe(200);
    expect(res.body.chainIntegrity?.status).toBe('UNVERIFIABLE');
    expect(res.body.attestation).toBeNull();
    expect(typeof res.body.attestationWithheld).toBe('string');
    const statuses = (res.body.complianceFrameworks as Array<{ status: string }>).map(f => f.status);
    // Nothing in this report evaluates ICH E6 or GAMP 5; those were hardcoded
    // COMPLIANT. The chain-dependent three cannot be COMPLIANT when the chain
    // verifier did not run.
    expect(statuses).not.toContain('COMPLIANT');
    assertNoVerdictClaims(res.body, 'GET /api/decision-lineage/compliance-report');
  });
});
