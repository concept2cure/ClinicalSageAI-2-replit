/**
 * Each nightly sweep runs once per day across every server process (U19).
 *
 * Production starts every scheduler on two API tasks and the worker. A
 * node-cron tick fires on all three at the same minute, and the advisory lease
 * alone only stops OVERLAPPING runs: a run that finished before another task's
 * tick took the lease ran again. So the retention sweep could archive and audit
 * each disposition three times, and the external-intelligence sweep called
 * FDA, EMA, MHRA, TGA and NCBI three times a night.
 *
 * Each tick must go through runScheduledOncePerWindow with a one-day window
 * (the claim itself is proven against Postgres in
 * tests/db/scheduled-once-window.dbtest.ts). The claim here answers "already
 * ran", so a job body that is called directly — bypassing the claim — shows
 * up as a call to its own spy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  ticks: [] as Array<() => void>,
  claims: [] as Array<{ job: string; window: string }>,
  externalSweep: vi.fn(async () => undefined),
  auditVerify: vi.fn(async () => ({ valid: true })),
}));

vi.mock('node-cron', () => ({ default: { schedule: (_expr: string, fn: () => void) => { m.ticks.push(fn); } } }));
vi.mock('../../db/scheduledOnce', async (orig) => {
  const real = await orig<typeof import('../../db/scheduledOnce')>();
  return {
    ...real,
    runScheduledOncePerWindow: vi.fn(async (job: string, window: string) => {
      m.claims.push({ job, window });
      return { ran: false, reason: 'already_ran_this_window' };
    }),
  };
});
vi.mock('../../db', () => ({ db: {}, pool: { connect: vi.fn(), query: vi.fn() } }));
vi.mock('../../db.js', () => ({ pool: { connect: vi.fn(async () => { throw new Error('ran outside the claim'); }), query: vi.fn() } }));
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow: vi.fn() }));
vi.mock('../../services/security-alerts', () => ({ reportSecurityAlert: vi.fn() }));
vi.mock('../../services/security-alerts.js', () => ({ reportSecurityAlert: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: vi.fn() }) } }));
vi.mock('../../services/external-intelligence/index.js', () => ({ runExternalIntelligenceSweep: m.externalSweep }));
vi.mock('../../services/audit/audit-integrity-service.js', () => ({ verifyAuditIntegrity: m.auditVerify }));

import { windowKeyOf } from '../../db/scheduledOnce';
import { startRetentionSchedule } from '../retentionCron';
import { startExternalIntelligenceSchedule } from '../externalIntelligenceSweep';
import { startAuditChainIntegritySchedule } from '../auditChainIntegritySweep';

const DAY = windowKeyOf(24 * 60 * 60 * 1000);

beforeEach(() => {
  m.ticks.length = 0;
  m.claims.length = 0;
  m.externalSweep.mockClear();
  m.auditVerify.mockClear();
  process.env.NODE_ENV = 'production';
  delete process.env.ENABLE_RETENTION_SWEEP;
  delete process.env.ENABLE_EXTERNAL_INTELLIGENCE;
});

async function tick(): Promise<void> {
  expect(m.ticks).toHaveLength(1);
  m.ticks[0]();
  await new Promise((r) => setTimeout(r, 20));
}

describe('a nightly tick on any process claims the day before it runs', () => {
  it('retention sweep', async () => {
    startRetentionSchedule();
    await tick();
    expect(m.claims).toEqual([{ job: 'retention-sweep', window: DAY }]);
  });

  it('external intelligence sweep (FDA, EMA, MHRA, TGA, NCBI)', async () => {
    startExternalIntelligenceSchedule();
    await tick();
    expect(m.claims).toEqual([{ job: 'external-intelligence-sweep', window: DAY }]);
    expect(m.externalSweep).not.toHaveBeenCalled();
  });

  it('audit chain integrity sweep', async () => {
    startAuditChainIntegritySchedule();
    await tick();
    expect(m.claims).toEqual([{ job: 'audit-chain-integrity-sweep', window: DAY }]);
    expect(m.auditVerify).not.toHaveBeenCalled();
  });
});
