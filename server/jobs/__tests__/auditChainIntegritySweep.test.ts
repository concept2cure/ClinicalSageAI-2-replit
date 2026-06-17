import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Isolate the schedule gating from cron, the DB pool, and the chain verifier.
// vi.mock factories are hoisted above imports, so the mock fn must be created
// via vi.hoisted to be accessible inside the factory.
const { scheduleMock } = vi.hoisted(() => ({ scheduleMock: vi.fn() }));
vi.mock('node-cron', () => ({ default: { schedule: scheduleMock } }));
vi.mock('../../db.js', () => ({ pool: { connect: vi.fn() } }));
vi.mock('../../services/audit/chain.js', () => ({ verifyAuditChain: vi.fn() }));

import { startAuditChainIntegritySchedule } from '../auditChainIntegritySweep';

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
