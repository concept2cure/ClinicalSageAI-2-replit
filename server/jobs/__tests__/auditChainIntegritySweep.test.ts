import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Isolate the schedule gating from cron, the DB pool, and the verifiers.
// vi.mock factories are hoisted above imports, so the mock fns must be created
// via vi.hoisted to be accessible inside the factories.
const m = vi.hoisted(() => ({
  scheduleMock: vi.fn(),
  clientQuery: vi.fn(),
  clientRelease: vi.fn(),
  verifyAuditChain: vi.fn(),
  verifyAuditChainSeals: vi.fn(),
  verifyAuditEventsChainSeals: vi.fn(),
  verifyTamperProofLogRows: vi.fn(),
  assertAuditImmutabilityTriggers: vi.fn(),
  reportSecurityAlert: vi.fn(),
}));
const { scheduleMock } = m;
vi.mock('node-cron', () => ({ default: { schedule: m.scheduleMock } }));
vi.mock('../../db.js', () => ({
  pool: { connect: vi.fn(async () => ({ query: m.clientQuery, release: m.clientRelease })) },
}));
vi.mock('../../services/audit/chain.js', () => ({
  verifyAuditChain: m.verifyAuditChain,
  verifyAuditChainSeals: m.verifyAuditChainSeals,
  verifyAuditEventsChainSeals: m.verifyAuditEventsChainSeals,
}));
vi.mock('../../lib/tamper-proof-audit.js', () => ({
  verifyTamperProofLogRows: m.verifyTamperProofLogRows,
}));
vi.mock('../../services/audit/audit-immutability-triggers.js', () => ({
  assertAuditImmutabilityTriggers: m.assertAuditImmutabilityTriggers,
}));
vi.mock('../../services/security-alerts.js', () => ({
  reportSecurityAlert: m.reportSecurityAlert,
}));

import { startAuditChainIntegritySchedule, runAuditChainIntegrityCheck } from '../auditChainIntegritySweep';

describe('startAuditChainIntegritySchedule gating (on-by-default)', () => {
  const original = { ...process.env };

  beforeEach(() => {
    scheduleMock.mockClear();
    delete process.env.ENABLE_AUDIT_CHAIN_CHECK;
    delete process.env.AUDIT_TRAIL_ENABLED;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('schedules by default when the audit trail is enabled', () => {
    process.env.AUDIT_TRAIL_ENABLED = 'true';
    startAuditChainIntegritySchedule();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT schedule when explicitly opted out, even if the trail is on', () => {
    process.env.AUDIT_TRAIL_ENABLED = 'true';
    process.env.ENABLE_AUDIT_CHAIN_CHECK = 'false';
    startAuditChainIntegritySchedule();
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('schedules when explicitly opted in, even if the trail flag is unset', () => {
    process.env.ENABLE_AUDIT_CHAIN_CHECK = 'true';
    startAuditChainIntegritySchedule();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT schedule when neither the trail nor an explicit opt-in is set', () => {
    startAuditChainIntegritySchedule();
    expect(scheduleMock).not.toHaveBeenCalled();
  });
});

describe('startAuditChainIntegritySchedule in production (Part 11 default-ON)', () => {
  const original = { ...process.env };

  beforeEach(() => {
    scheduleMock.mockClear();
    delete process.env.ENABLE_AUDIT_CHAIN_CHECK;
    delete process.env.AUDIT_TRAIL_ENABLED;
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('schedules by default in production with nothing else configured', () => {
    startAuditChainIntegritySchedule();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
  });

  it('schedules in production even when the audit trail flag is unset', () => {
    delete process.env.AUDIT_TRAIL_ENABLED;
    startAuditChainIntegritySchedule();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
  });

  it('respects an explicit production opt-out (ENABLE_AUDIT_CHAIN_CHECK=false)', () => {
    process.env.ENABLE_AUDIT_CHAIN_CHECK = 'false';
    startAuditChainIntegritySchedule();
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('schedules in production with an explicit opt-in too', () => {
    process.env.ENABLE_AUDIT_CHAIN_CHECK = 'true';
    startAuditChainIntegritySchedule();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
  });
});

// ── P0-8a (sweep half): every store is verified, not just the plain chain ────
//
// Audit finding DP-06 / DP-04: the sweep called verifyAuditChain alone, so a
// broken HMAC seal, a tampered audit.tamper_proof_log row, a broken
// audit_events link or a dropped immutability trigger were never reported by
// the daily tamper-evidence check. These cases drive runAuditChainIntegrityCheck
// with mocked verifiers and a fake client whose queries answer the sweep's own
// SELECTs, and assert the alert path (process.emitWarning + the [SECURITY]
// webhook) fires for each store.

const chainOk = { ok: true, rowsChecked: 12, tenants: 2, legacyRows: 0, sequencedRows: 12 };

/** Rows the fake client returns per statement, keyed by a substring of the SQL. */
function answerQueries(overrides: Partial<Record<'regclass' | 'audit_events' | 'tamper_proof_log', unknown>> = {}) {
  m.clientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('to_regclass')) {
      return overrides.regclass ?? { rows: [{ present: true }] };
    }
    if (sql.includes('FROM audit_events')) {
      return (
        overrides.audit_events ?? {
          rows: [
            { id: 1, organization_id: 1, sequence_number: 1, record_hash: 'h1', previous_hash: null },
            { id: 2, organization_id: 1, sequence_number: 2, record_hash: 'h2', previous_hash: 'h1' },
          ],
        }
      );
    }
    if (sql.includes('FROM audit.tamper_proof_log')) {
      return overrides.tamper_proof_log ?? { rows: [{ sequence_number: 1 }, { sequence_number: 2 }] };
    }
    throw new Error(`unexpected query in test: ${sql} ${JSON.stringify(params ?? [])}`);
  });
}

describe('runAuditChainIntegrityCheck verifies every audit store', () => {
  const original = { ...process.env };
  let emitWarning: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.AUDIT_HMAC_KEY = 'k'.repeat(32);
    process.env.AUDIT_HMAC_SECRET = 's'.repeat(32);
    m.clientQuery.mockReset();
    m.clientRelease.mockReset();
    m.reportSecurityAlert.mockReset();
    m.verifyAuditChain.mockReset().mockResolvedValue(chainOk);
    m.verifyAuditChainSeals.mockReset().mockResolvedValue({ valid: true, brokenAt: null });
    m.verifyAuditEventsChainSeals.mockReset().mockResolvedValue({ valid: true, brokenAt: null });
    m.verifyTamperProofLogRows
      .mockReset()
      .mockReturnValue({ valid: true, entriesVerified: 2, lastChainHash: 'x', signedEntries: 2 });
    m.assertAuditImmutabilityTriggers
      .mockReset()
      .mockResolvedValue({ ok: true, expected: 8, present: 8, missing: [], disabled: [], tablesAbsent: [] });
    answerQueries();
    emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
  });

  afterEach(() => {
    emitWarning.mockRestore();
    process.env = { ...original };
  });

  it('reports ok and raises no alert when every store verifies', async () => {
    const result = await runAuditChainIntegrityCheck();
    expect(result.ok).toBe(true);
    expect(result.rowsChecked).toBe(12);
    expect(result.failures).toEqual([]);
    expect(result.stores.map((s) => [s.store, s.status])).toEqual([
      ['audit_logs.chain', 'ok'],
      ['audit_logs.seals', 'ok'],
      ['audit_events.linkage', 'ok'],
      ['audit_events.seals', 'ok'],
      ['audit.tamper_proof_log', 'ok'],
      ['immutability_triggers', 'ok'],
    ]);
    expect(m.verifyAuditChain).toHaveBeenCalledOnce();
    expect(m.verifyAuditChainSeals).toHaveBeenCalledOnce();
    expect(m.verifyAuditEventsChainSeals).toHaveBeenCalledOnce();
    expect(m.verifyTamperProofLogRows).toHaveBeenCalledOnce();
    expect(m.assertAuditImmutabilityTriggers).toHaveBeenCalledOnce();
    expect(emitWarning).not.toHaveBeenCalled();
    expect(m.reportSecurityAlert).not.toHaveBeenCalled();
    expect(m.clientRelease).toHaveBeenCalledOnce();
  });

  it('a broken audit_logs HMAC seal raises the alert path with the failing index and no row content', async () => {
    m.verifyAuditChainSeals.mockResolvedValue({ valid: false, brokenAt: 7 });
    const result = await runAuditChainIntegrityCheck();
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(['audit_logs.seals']);
    expect(result.stores.find((s) => s.store === 'audit_logs.seals')).toMatchObject({ status: 'broken', firstFailure: '7' });
    expect(emitWarning).toHaveBeenCalledOnce();
    expect(emitWarning.mock.calls[0][1]).toBe('AuditChainIntegrity');
    expect(m.reportSecurityAlert).toHaveBeenCalledOnce();
    const alert = m.reportSecurityAlert.mock.calls[0][0];
    expect(alert.kind).toBe('audit_integrity_sweep_failed');
    expect(alert.detail.failures).toEqual(['audit_logs.seals']);
    expect(JSON.stringify(alert)).not.toMatch(/payload|action|target|details/);
  });

  it('a tampered audit.tamper_proof_log row raises the alert path with the sequence number', async () => {
    m.verifyTamperProofLogRows.mockReturnValue({
      valid: false, entriesVerified: 2, firstInvalidEntry: 2,
      invalidReason: 'Content tampered: content_hash mismatch at sequence 2', lastChainHash: 'x', signedEntries: 1,
    });
    const result = await runAuditChainIntegrityCheck();
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(['audit.tamper_proof_log']);
    expect(result.stores.find((s) => s.store === 'audit.tamper_proof_log')).toMatchObject({
      status: 'broken', firstFailure: '2', rowsChecked: 2,
    });
    expect(m.verifyTamperProofLogRows).toHaveBeenCalledWith(
      expect.any(Array), expect.objectContaining({ hmacSecret: 's'.repeat(32) }),
    );
    expect(emitWarning).toHaveBeenCalledOnce();
    expect(m.reportSecurityAlert).toHaveBeenCalledOnce();
  });

  it('a broken audit_events link raises the alert path with the first broken id', async () => {
    answerQueries({
      audit_events: {
        rows: [
          { id: 1, organization_id: 1, sequence_number: 1, record_hash: 'h1', previous_hash: null },
          { id: 2, organization_id: 1, sequence_number: 2, record_hash: 'h2', previous_hash: 'TAMPERED' },
        ],
      },
    });
    const result = await runAuditChainIntegrityCheck();
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(['audit_events.linkage']);
    expect(result.stores.find((s) => s.store === 'audit_events.linkage')).toMatchObject({
      status: 'broken', firstFailure: '2', rowsChecked: 2,
    });
    expect(m.reportSecurityAlert).toHaveBeenCalledOnce();
  });

  it('a missing immutability trigger raises the alert path, naming the trigger', async () => {
    m.assertAuditImmutabilityTriggers.mockResolvedValue({
      ok: false, expected: 8, present: 7, missing: ['public.audit_logs.trg_audit_logs_no_delete'], disabled: [], tablesAbsent: [],
    });
    const result = await runAuditChainIntegrityCheck();
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(['immutability_triggers']);
    expect(result.stores.find((s) => s.store === 'immutability_triggers')).toMatchObject({
      status: 'missing', firstFailure: 'public.audit_logs.trg_audit_logs_no_delete',
    });
    expect(m.reportSecurityAlert).toHaveBeenCalledOnce();
    expect(m.reportSecurityAlert.mock.calls[0][0].detail.failures).toEqual(['immutability_triggers']);
  });

  it('the plain-chain break still reports brokenAt and alerts, as before', async () => {
    m.verifyAuditChain.mockResolvedValue({
      ...chainOk, ok: false, brokenAt: { id: 'row-9', expected: 'e', stored: 's', tenantId: 1, segment: 'sequenced', commitsTo: null },
    });
    const result = await runAuditChainIntegrityCheck();
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toMatchObject({ id: 'row-9' });
    expect(result.failures).toContain('audit_logs.chain');
    expect(emitWarning).toHaveBeenCalledOnce();
    expect(m.reportSecurityAlert).toHaveBeenCalledOnce();
  });

  it('one verifier throwing is an incident for that store and does not hide the others', async () => {
    m.verifyTamperProofLogRows.mockImplementation(() => { throw new Error('boom'); });
    m.verifyAuditChainSeals.mockResolvedValue({ valid: false, brokenAt: 0 });
    const result = await runAuditChainIntegrityCheck();
    expect(result.failures).toEqual(['audit_logs.seals', 'audit.tamper_proof_log']);
    expect(result.stores.find((s) => s.store === 'audit.tamper_proof_log')).toMatchObject({ status: 'error' });
    expect(m.assertAuditImmutabilityTriggers).toHaveBeenCalledOnce();
    expect(m.reportSecurityAlert).toHaveBeenCalledOnce();
  });

  it('an absent audit.tamper_proof_log is reported as missing (an incident), never as verified', async () => {
    m.clientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('to_regclass')) {
        return { rows: [{ present: params?.[0] !== 'audit.tamper_proof_log' }] };
      }
      if (sql.includes('FROM audit_events')) return { rows: [] };
      throw new Error(`unexpected query in test: ${sql}`);
    });
    const result = await runAuditChainIntegrityCheck();
    expect(result.stores.find((s) => s.store === 'audit.tamper_proof_log')).toMatchObject({ status: 'missing' });
    expect(result.failures).toContain('audit.tamper_proof_log');
    expect(m.verifyTamperProofLogRows).not.toHaveBeenCalled();
  });

  it('without AUDIT_HMAC_KEY the seals are unverifiable: not ok, not an incident, no [SECURITY] alert', async () => {
    delete process.env.AUDIT_HMAC_KEY;
    const result = await runAuditChainIntegrityCheck();
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([]);
    expect(result.unverifiable).toEqual(['audit_logs.seals', 'audit_events.seals']);
    expect(m.verifyAuditChainSeals).not.toHaveBeenCalled();
    expect(m.verifyAuditEventsChainSeals).not.toHaveBeenCalled();
    expect(emitWarning).not.toHaveBeenCalled();
    expect(m.reportSecurityAlert).not.toHaveBeenCalled();
  });

  it('audit_events rows that carry no record_hash are unverified, not verified', async () => {
    answerQueries({
      audit_events: {
        rows: [
          { id: 1, organization_id: 1, sequence_number: 1, record_hash: null, previous_hash: null },
          { id: 2, organization_id: 1, sequence_number: 2, record_hash: null, previous_hash: null },
        ],
      },
    });
    const result = await runAuditChainIntegrityCheck();
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([]);
    expect(result.unverifiable).toContain('audit_events.linkage');
  });

  it('still never throws when the pool itself is unavailable', async () => {
    const { pool } = await import('../../db.js');
    (pool.connect as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('pool down'));
    const result = await runAuditChainIntegrityCheck();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/pool down/);
  });
});
