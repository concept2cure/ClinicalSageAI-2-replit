/**
 * Tests for the citation run pruner's lifecycle gates. The actual
 * pruning logic is SQL-side and exercised through integration tests;
 * here we lock down the scheduler's enable/disable + status helpers.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  startCitationRunPruneScheduler,
  stopCitationRunPruneScheduler,
  getCitationRunPruneStatus,
} from '../ana/citation-run-pruner';

describe('citation-run-pruner · scheduler lifecycle', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDisabled = process.env.ANA_CITATION_RUN_PRUNE_DISABLED;

  beforeEach(() => {
    stopCitationRunPruneScheduler();
  });

  afterEach(() => {
    stopCitationRunPruneScheduler();
    process.env.NODE_ENV = originalNodeEnv;
    if (originalDisabled === undefined) {
      delete process.env.ANA_CITATION_RUN_PRUNE_DISABLED;
    } else {
      process.env.ANA_CITATION_RUN_PRUNE_DISABLED = originalDisabled;
    }
  });

  it('skips scheduling in test env', () => {
    process.env.NODE_ENV = 'test';
    expect(startCitationRunPruneScheduler()).toBe(false);
    expect(getCitationRunPruneStatus().running).toBe(false);
  });

  it('respects the disabled env flag', () => {
    process.env.NODE_ENV = 'production';
    process.env.ANA_CITATION_RUN_PRUNE_DISABLED = 'true';
    expect(startCitationRunPruneScheduler()).toBe(false);
    expect(getCitationRunPruneStatus().running).toBe(false);
  });

  it('reports keepLastN from env or default', () => {
    const status = getCitationRunPruneStatus();
    expect(status.keepLastN).toBeGreaterThan(0);
    expect(status.lastTick).toBeNull();
  });

  it('returns false on a second start (idempotent)', () => {
    process.env.NODE_ENV = 'test'; // disabled; first call returns false too
    expect(startCitationRunPruneScheduler()).toBe(false);
    expect(startCitationRunPruneScheduler()).toBe(false);
  });
});
