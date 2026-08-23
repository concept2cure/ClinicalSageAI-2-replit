/**
 * `logAction` must not report a row as persisted when NOTHING was written.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * The two outcome flags were initialised optimistically:
 *
 *     let chained = true;
 *     let tamperProof = true;
 *     …
 *     try { const { pool } = await import('../db'); if (pool) { …write… } }
 *     catch (error) { chained = false; … }
 *     …
 *     return { persisted: chained || tamperProof, … };
 *
 * They were only ever demoted inside a `catch`, so they tracked "nothing threw"
 * rather than "a store accepted the row". With no pool configured, `if (pool)`
 * was skipped, no catch ran, and this returned
 * `{ persisted: true, chained: true, tamperProof: true }` for an audit row that
 * reached no store at all. `AuditWriteResult.persisted` is documented as "true
 * when at least one durable store accepted the row"; the comment beside the
 * flags claimed an unconfigured store "leaves its flag false". Neither was what
 * the code did.
 *
 * ── Why it matters more than a wrong boolean ─────────────────────────────────
 * This return value is the ONLY way a caller can learn the outcome — logAction
 * resolves normally on failure and never rejects. Every `if (!audit.persisted)`
 * in the codebase was therefore being handed a success it had not earned,
 * including the §11.10(e) gate in routes/ana-ri/utility.ts that refuses to
 * execute a governed Part 11 action unless the sign-off was recorded. A guard
 * that cannot observe the failure it guards against is the "control that
 * reports success while doing nothing" pattern, one layer below the controls.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * The no-store case specifically. The sibling suite audit-write-result.test.ts
 * drives the write-fails and write-succeeds paths against a working pool; both
 * of those passed throughout the defect, because both reach a branch that
 * assigns the flag. Only the path where NO branch assigns anything exposed it.
 *
 * The subject under test is the real auditService. `../../db` is substituted
 * because "there is no database pool" is precisely the condition being
 * described, and it is not otherwise reachable in-process.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../db', () => ({
  pool: null,
  getPool: () => null,
  db: {},
}));

const ENTRY = {
  tenantId: 3,
  userId: 7,
  action: 'test.action',
  resourceType: 'test_resource',
  resourceId: 'R1',
};

beforeEach(() => {
  // auditService caches the tamper-proof log in a module-level binding, so the
  // module is re-imported per test rather than shared across them.
  vi.resetModules();
});

describe('logAction with no durable store configured', () => {
  it('reports persisted:false — a row written nowhere is not persisted', async () => {
    const { default: auditService } = await import('../auditService');

    const result = await auditService.logAction({ ...ENTRY });

    expect(result.persisted).toBe(false);
    expect(result.chained).toBe(false);
    expect(result.tamperProof).toBe(false);
  });

  it('says WHY, so the caller can log something true', async () => {
    const { default: auditService } = await import('../auditService');

    const result = await auditService.logAction({ ...ENTRY });

    // The reason is for the caller's own log line, never for a user. Callers
    // fall back to a generic string when `error` is absent, which would have
    // read as "no durable store accepted the row" with no indication that the
    // write was never even attempted.
    expect(typeof result.error).toBe('string');
    expect(result.error).toMatch(/not attempted/i);
  });

  it('still resolves rather than rejecting — the swallow policy is unchanged', async () => {
    const { default: auditService } = await import('../auditService');

    // ~270 call sites depend on this. Making the outcome honest must not turn
    // an audit-trail outage into a failed user action.
    await expect(auditService.logAction({ ...ENTRY })).resolves.toBeDefined();
  });
});
