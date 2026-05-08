import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  startSubmissionChatSweepScheduler,
  stopSubmissionChatSweepScheduler,
  getSweepSchedulerStatus,
} from '../ana/submission-chat-sweep-scheduler';

describe('submission-chat-sweep-scheduler', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDisabled = process.env.ANA_SUBMISSION_CHAT_SWEEP_DISABLED;

  beforeEach(() => {
    stopSubmissionChatSweepScheduler();
  });

  afterEach(() => {
    stopSubmissionChatSweepScheduler();
    process.env.NODE_ENV = originalNodeEnv;
    if (originalDisabled === undefined) {
      delete process.env.ANA_SUBMISSION_CHAT_SWEEP_DISABLED;
    } else {
      process.env.ANA_SUBMISSION_CHAT_SWEEP_DISABLED = originalDisabled;
    }
  });

  it('skips scheduling in test env', () => {
    process.env.NODE_ENV = 'test';
    expect(startSubmissionChatSweepScheduler()).toBe(false);
    expect(getSweepSchedulerStatus().running).toBe(false);
  });

  it('respects the disabled env flag', () => {
    process.env.NODE_ENV = 'production';
    process.env.ANA_SUBMISSION_CHAT_SWEEP_DISABLED = 'true';
    expect(startSubmissionChatSweepScheduler()).toBe(false);
    expect(getSweepSchedulerStatus().running).toBe(false);
  });

  it('reports a default interval', () => {
    const status = getSweepSchedulerStatus();
    expect(status.intervalMs).toBe(60 * 60 * 1000);
    expect(status.lastTick).toBeNull();
  });

  it('honors a custom interval from env', () => {
    process.env.ANA_SUBMISSION_CHAT_SWEEP_INTERVAL_MS = '60000';
    expect(getSweepSchedulerStatus().intervalMs).toBe(60_000);
    delete process.env.ANA_SUBMISSION_CHAT_SWEEP_INTERVAL_MS;
  });
});
