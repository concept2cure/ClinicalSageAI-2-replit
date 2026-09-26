/**
 * The retention sweep is scheduled by the process, not left to a CLI nobody
 * runs (security audit 2026-09-24, DP-20; plan P1-22). Same gating shape as the
 * audit-chain sweep: explicit ENABLE_RETENTION_SWEEP wins, production defaults
 * on, anything else is opt-in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ scheduleMock: vi.fn() }));
vi.mock('node-cron', () => ({ default: { schedule: m.scheduleMock } }));
vi.mock('../../db', () => ({ db: {}, pool: { connect: vi.fn(), query: vi.fn() } }));
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow: vi.fn() }));
vi.mock('../../services/security-alerts', () => ({ reportSecurityAlert: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: vi.fn() }) } }));

import { resolveRetentionSweepPosture, startRetentionSchedule } from '../retentionCron';

const savedEnv = { ...process.env };
beforeEach(() => {
  m.scheduleMock.mockClear();
  delete process.env.ENABLE_RETENTION_SWEEP;
  delete process.env.RETENTION_SWEEP_CRON;
  process.env.NODE_ENV = 'test';
});
afterEach(() => {
  process.env = { ...savedEnv };
});

describe('resolveRetentionSweepPosture', () => {
  it('explicit false disables, explicit true enables, production defaults on, otherwise opt-in', () => {
    expect(resolveRetentionSweepPosture({ ENABLE_RETENTION_SWEEP: 'false', NODE_ENV: 'production' }).enabled).toBe(false);
    expect(resolveRetentionSweepPosture({ ENABLE_RETENTION_SWEEP: 'true', NODE_ENV: 'test' }).enabled).toBe(true);
    expect(resolveRetentionSweepPosture({ NODE_ENV: 'production' }).enabled).toBe(true);
    expect(resolveRetentionSweepPosture({ NODE_ENV: 'development' }).enabled).toBe(false);
  });
});

describe('startRetentionSchedule', () => {
  it('schedules the nightly sweep in production with nothing else configured, at the default hour', () => {
    process.env.NODE_ENV = 'production';
    startRetentionSchedule();
    expect(m.scheduleMock).toHaveBeenCalledTimes(1);
    expect(m.scheduleMock.mock.calls[0][0]).toBe('30 3 * * *');
  });

  it('honours RETENTION_SWEEP_CRON and an explicit opt-in outside production', () => {
    process.env.ENABLE_RETENTION_SWEEP = 'true';
    process.env.RETENTION_SWEEP_CRON = '15 1 * * *';
    startRetentionSchedule();
    expect(m.scheduleMock).toHaveBeenCalledWith('15 1 * * *', expect.any(Function));
  });

  it('does not schedule when explicitly disabled, even in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_RETENTION_SWEEP = 'false';
    startRetentionSchedule();
    expect(m.scheduleMock).not.toHaveBeenCalled();
  });

  it('does not schedule outside production without an opt-in', () => {
    startRetentionSchedule();
    expect(m.scheduleMock).not.toHaveBeenCalled();
  });
});
