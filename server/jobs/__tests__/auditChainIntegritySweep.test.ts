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
  verifyAuditChainAnchor: vi.fn(),
  writeAuditChainAnchor: vi.fn(),
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
// The anchor's verifier and writer are faked; how the store is chosen from the
// environment (AUDIT_ANCHOR_BUCKET) is the real code.
vi.mock('../../services/audit/chain-anchor.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  verifyAuditChainAnchor: m.verifyAuditChainAnchor,
  writeAuditChainAnchor: m.writeAuditChainAnchor,
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
const ANCHOR_KEY = 'anchors/audit-chain/2026/09/30/2026-09-30T02-00-00-000Z-0a1b2c3d.json';
const anchorOk = {
  status: 'ok', anchorKey: ANCHOR_KEY, anchoredAt: '2026-09-30T02:00:00.000Z',
  organizations: 2, breaks: [], archived: [], reason: 'every anchored head is present and unchanged',
};

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

const originalEnv = { ...process.env };
let emitWarning: ReturnType<typeof vi.spyOn>;

/**
 * The run's clock: the next daily sweep, 24 hours after `anchorOk` was written
 * (the day `writeAuditChainAnchor` is faked to anchor). The sweep ages the
 * anchor against Date.now() and calls anything past 48 hours `stale`, an
 * incident (f97d49331). Left on the wall clock, this fixed-date fixture went
 * stale on 2026-10-02T02:00Z and every "clean run" case failed from then on.
 */
const SWEEP_RUN_AT = Date.parse(anchorOk.anchoredAt) + 24 * 3_600_000;

/** Every store verifies, the anchor bucket is configured and its latest anchor holds. */
function setUpSweep(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SWEEP_RUN_AT);
  process.env.NODE_ENV = 'test';
  process.env.AUDIT_HMAC_KEY = 'k'.repeat(32);
  process.env.AUDIT_HMAC_SECRET = 's'.repeat(32);
  process.env.AUDIT_ANCHOR_BUCKET = 'c2c-prod-part11-evidence';
  m.verifyAuditChainAnchor.mockReset().mockResolvedValue(anchorOk);
  m.writeAuditChainAnchor.mockReset().mockResolvedValue({ key: 'anchors/audit-chain/2026/10/01/new.json', organizations: 2 });
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
}

function tearDownSweep(): void {
  vi.useRealTimers();
  emitWarning.mockRestore();
  process.env = { ...originalEnv };
}

describe('runAuditChainIntegrityCheck verifies every audit store', () => {
  beforeEach(setUpSweep);
  afterEach(tearDownSweep);

  it('reports ok and raises no alert when every store verifies', async () => {
    const result = await runAuditChainIntegrityCheck();
    expect(result.ok).toBe(true);
    expect(result.rowsChecked).toBe(12);
    expect(result.failures).toEqual([]);
    expect(result.stores.map((s) => [s.store, s.status])).toEqual([
      ['audit_logs.chain', 'ok'],
      ['audit_logs.seals', 'ok'],
      ['audit_logs.anchor', 'ok'],
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

describe('runAuditChainIntegrityCheck anchors the chain head outside the database (P0-8)', () => {
  beforeEach(setUpSweep);
  afterEach(tearDownSweep);

  // ── P0-8 (anchor half): the chain head recorded outside the database ──────
  //
  // DP-04: nothing outside the database recorded the chain head, so deleting
  // or rewriting the newest rows was undetectable — the walk proves each row
  // derives from the one before it, and a chain that ends early still does.
  // The sweep now verifies the database against the latest anchor in the
  // object-locked evidence bucket, then writes today's anchor.

  const anchorVerdict = (result: Awaited<ReturnType<typeof runAuditChainIntegrityCheck>>) =>
    result.stores.find((s) => s.store === 'audit_logs.anchor');

  it('in production without AUDIT_ANCHOR_BUCKET the anchor is "not configured": never ok, never written', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUDIT_ANCHOR_BUCKET;
    const result = await runAuditChainIntegrityCheck();
    expect(anchorVerdict(result)).toMatchObject({ status: 'unverifiable' });
    expect(anchorVerdict(result)?.reason).toMatch(/anchor not configured.*AUDIT_ANCHOR_BUCKET/);
    expect(result.ok).toBe(false);
    expect(result.unverifiable).toEqual(['audit_logs.anchor']);
    expect(result.failures).toEqual([]);
    expect(result.anchorWrite).toMatchObject({ written: false });
    expect(result.anchorWrite?.reason).toMatch(/anchor not configured/);
    expect(m.verifyAuditChainAnchor).not.toHaveBeenCalled();
    expect(m.writeAuditChainAnchor).not.toHaveBeenCalled();
    expect(m.reportSecurityAlert).not.toHaveBeenCalled();
  });

  it('verifies against the latest anchor FIRST, then writes the new anchor to the configured bucket', async () => {
    const result = await runAuditChainIntegrityCheck();
    expect(anchorVerdict(result)).toMatchObject({ status: 'ok' });
    expect(anchorVerdict(result)?.reason).toContain(ANCHOR_KEY);
    expect(result.ok).toBe(true);
    expect(m.verifyAuditChainAnchor).toHaveBeenCalledOnce();
    expect(m.writeAuditChainAnchor).toHaveBeenCalledOnce();
    expect(m.verifyAuditChainAnchor.mock.invocationCallOrder[0]).toBeLessThan(
      m.writeAuditChainAnchor.mock.invocationCallOrder[0],
    );
    const store = m.writeAuditChainAnchor.mock.calls[0][1];
    expect(store.location).toBe('s3://c2c-prod-part11-evidence/anchors/audit-chain/');
    expect(m.verifyAuditChainAnchor.mock.calls[0][1]).toBe(store);
    expect(result.anchorWrite).toEqual({ written: true, key: 'anchors/audit-chain/2026/10/01/new.json', organizations: 2 });
  });

  it('a truncated chain after an anchor is an incident: alerted, and no new anchor papers over it', async () => {
    m.verifyAuditChainAnchor.mockResolvedValue({
      ...anchorOk, status: 'broken', reason: '1 anchored head(s) missing or different',
      breaks: [{ organizationId: 7, rowId: '6f1c0d2e-0000-4000-8000-000000000007', kind: 'head_missing', anchoredRows: 4, currentRows: 2 }],
    });
    const result = await runAuditChainIntegrityCheck();
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(['audit_logs.anchor']);
    expect(anchorVerdict(result)).toMatchObject({
      status: 'broken', firstFailure: '6f1c0d2e-0000-4000-8000-000000000007',
    });
    expect(anchorVerdict(result)?.reason).toMatch(/organization 7: head_missing \(4 rows anchored at or before the head, 2 now\)/);
    expect(m.reportSecurityAlert).toHaveBeenCalledOnce();
    expect(m.reportSecurityAlert.mock.calls[0][0].detail.failures).toEqual(['audit_logs.anchor']);
    expect(m.writeAuditChainAnchor).not.toHaveBeenCalled();
    expect(result.anchorWrite?.reason).toMatch(/incident in audit_logs\.anchor/);
  });

  it('with no anchor written yet the head is "not verified" (unverifiable), and the first anchor is written', async () => {
    m.verifyAuditChainAnchor.mockResolvedValue({
      status: 'not_anchored', anchorKey: null, anchoredAt: null, organizations: 0, breaks: [], archived: [],
      reason: 'no anchor has been written to s3://c2c-prod-part11-evidence/anchors/audit-chain/',
    });
    const result = await runAuditChainIntegrityCheck();
    expect(anchorVerdict(result)).toMatchObject({ status: 'unverifiable' });
    expect(anchorVerdict(result)?.reason).toMatch(/not verified: no anchor has been written/);
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([]);
    expect(m.writeAuditChainAnchor).toHaveBeenCalledOnce();
  });

  it('the anchor cannot be read: an incident for that store, and nothing is anchored', async () => {
    m.verifyAuditChainAnchor.mockRejectedValue(new Error('AccessDenied'));
    const result = await runAuditChainIntegrityCheck();
    expect(anchorVerdict(result)).toMatchObject({ status: 'error', reason: 'AccessDenied' });
    expect(result.failures).toEqual(['audit_logs.anchor']);
    expect(m.writeAuditChainAnchor).not.toHaveBeenCalled();
  });

  it('an incident in another store blocks the new anchor too: a tampered state is never anchored', async () => {
    m.verifyAuditChainSeals.mockResolvedValue({ valid: false, brokenAt: 3 });
    const result = await runAuditChainIntegrityCheck();
    expect(anchorVerdict(result)).toMatchObject({ status: 'ok' });
    expect(result.failures).toEqual(['audit_logs.seals']);
    expect(m.writeAuditChainAnchor).not.toHaveBeenCalled();
  });

  it('a failed anchor write is reported, not swallowed', async () => {
    m.writeAuditChainAnchor.mockRejectedValue(new Error('SlowDown'));
    const result = await runAuditChainIntegrityCheck();
    expect(result.anchorWrite).toEqual({ written: false, reason: 'anchor write failed: SlowDown' });
  });
});

describe('runAuditChainIntegrityCheck reports how old the latest anchor is (P0-8 follow-up)', () => {
  // Rows written after the latest anchor can be removed without the anchor
  // showing it until the next anchor is written. A stale anchor widens that
  // window, so its age is reported on every run and past 48 hours it is an
  // incident: before this, a sweep whose anchor writes kept failing reported
  // `ok` against an ever older anchor, and only the write's error line said so.
  const ANCHORED_AT = Date.parse(anchorOk.anchoredAt);
  const HOUR = 3_600_000;
  const anchorVerdict = (result: Awaited<ReturnType<typeof runAuditChainIntegrityCheck>>) =>
    result.stores.find((s) => s.store === 'audit_logs.anchor');

  beforeEach(() => {
    setUpSweep();
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    tearDownSweep();
  });

  it('reports the age on a clean run, and a 24-hour-old anchor is not an incident', async () => {
    vi.setSystemTime(ANCHORED_AT + 24 * HOUR);
    const result = await runAuditChainIntegrityCheck();
    expect(result.anchorAge).toEqual({ anchorKey: ANCHOR_KEY, anchoredAt: anchorOk.anchoredAt, hours: 24, staleAfterHours: 48 });
    expect(anchorVerdict(result)).toMatchObject({ status: 'ok' });
    expect(anchorVerdict(result)?.reason).toMatch(/24 hour\(s\) old/);
    expect(result.ok).toBe(true);
    expect(m.reportSecurityAlert).not.toHaveBeenCalled();
  });

  it('at exactly 48 hours the anchor is not yet stale', async () => {
    vi.setSystemTime(ANCHORED_AT + 48 * HOUR);
    const result = await runAuditChainIntegrityCheck();
    expect(anchorVerdict(result)).toMatchObject({ status: 'ok' });
    expect(result.anchorAge?.hours).toBe(48);
  });

  it('an anchor older than 48 hours is an incident: alerted, and a fresh anchor is still written to close the window', async () => {
    vi.setSystemTime(ANCHORED_AT + 49 * HOUR);
    const result = await runAuditChainIntegrityCheck();
    expect(anchorVerdict(result)).toMatchObject({ status: 'stale' });
    expect(anchorVerdict(result)?.reason).toMatch(/latest anchor is 49 hour\(s\) old, past the 48-hour limit/);
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(['audit_logs.anchor']);
    expect(result.anchorAge?.hours).toBe(49);
    expect(emitWarning).toHaveBeenCalledOnce();
    expect(m.reportSecurityAlert).toHaveBeenCalledOnce();
    expect(m.reportSecurityAlert.mock.calls[0][0].detail.failures).toEqual(['audit_logs.anchor']);
    // Every head the stale anchor names was verified present: today's anchor
    // is what shortens the window again, so staleness alone does not block it.
    expect(m.writeAuditChainAnchor).toHaveBeenCalledOnce();
    expect(result.anchorWrite).toMatchObject({ written: true });
  });

  it('a stale anchor that the database also breaks is broken, and nothing is anchored over it', async () => {
    vi.setSystemTime(ANCHORED_AT + 72 * HOUR);
    m.verifyAuditChainAnchor.mockResolvedValue({
      ...anchorOk, status: 'broken', reason: '1 anchored head(s) missing or different',
      breaks: [{ organizationId: 7, rowId: '6f1c0d2e-0000-4000-8000-000000000007', kind: 'head_missing', anchoredRows: 4, currentRows: 2 }],
    });
    const result = await runAuditChainIntegrityCheck();
    expect(anchorVerdict(result)).toMatchObject({ status: 'broken' });
    expect(result.anchorAge?.hours).toBe(72);
    expect(m.writeAuditChainAnchor).not.toHaveBeenCalled();
  });

  it('a stale anchor beside another incident does not get a new anchor written over that incident', async () => {
    vi.setSystemTime(ANCHORED_AT + 49 * HOUR);
    m.verifyAuditChainSeals.mockResolvedValue({ valid: false, brokenAt: 3 });
    const result = await runAuditChainIntegrityCheck();
    expect(result.failures).toEqual(['audit_logs.seals', 'audit_logs.anchor']);
    expect(m.writeAuditChainAnchor).not.toHaveBeenCalled();
  });

  it('with no anchor yet there is no age to report, and the run says so', async () => {
    m.verifyAuditChainAnchor.mockResolvedValue({
      status: 'not_anchored', anchorKey: null, anchoredAt: null, organizations: 0, breaks: [], archived: [],
      reason: 'no anchor has been written to s3://c2c-prod-part11-evidence/anchors/audit-chain/',
    });
    const result = await runAuditChainIntegrityCheck();
    expect(result.anchorAge).toBeNull();
    expect(anchorVerdict(result)).toMatchObject({ status: 'unverifiable' });
  });
});
