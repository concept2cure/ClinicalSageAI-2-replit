/**
 * Tool telemetry — unit tests.
 *
 * Part 1 tests the pure accounting module. Part 2 tests the registration
 * wrapper seam in AnaToolExecutor: every registered handler is instrumented, so
 * outcomes recorded here prove coverage for all dispatch paths.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  recordToolOutcome,
  recordContractViolation,
  classifyResult,
  getToolReliability,
  getUnhealthyTools,
  resetToolTelemetry,
  setTelemetryBackend,
  hydrateTelemetry,
  persistTelemetry,
  snapshotTelemetry,
  isTelemetryPersistenceEnabled,
  type TelemetryBackend,
  type TelemetrySnapshot,
} from '../tool-telemetry';
import { registerToolHandler, getToolHandler } from '../AnaToolExecutor.js';

describe('tool-telemetry (module)', () => {
  beforeEach(() => resetToolTelemetry());

  it('accumulates outcomes, running latency, and consecutive-failure resets', () => {
    recordToolOutcome('t1', 'success', 100);
    recordToolOutcome('t1', 'failure', 300, 'boom');
    recordToolOutcome('t1', 'degraded', 200, 'api 503');
    recordToolOutcome('t1', 'success', 200);

    const [e] = getToolReliability();
    expect(e.calls).toBe(4);
    expect(e.successes).toBe(2);
    expect(e.failures).toBe(1);
    expect(e.degraded).toBe(1);
    expect(e.consecutiveFailures).toBe(0); // reset by the trailing success
    expect(e.avgLatencyMs).toBe(200); // running mean of 100,300,200,200
    expect(e.lastError).toBe('api 503');
    expect(e.lastUsedAt).toBeTruthy();
  });

  it('flags unhealthy tools at the consecutive-failure threshold', () => {
    for (let i = 0; i < 3; i++) recordToolOutcome('flaky', 'degraded', 50, 'down');
    recordToolOutcome('fine', 'success', 10);
    const unhealthy = getUnhealthyTools(3);
    expect(unhealthy.map(t => t.tool)).toEqual(['flaky']);
  });

  it('classifyResult: top-level error → degraded; plain text / clean JSON → success', () => {
    expect(classifyResult(JSON.stringify({ error: 'HTTP 503' }))).toEqual({
      outcome: 'degraded',
      note: 'HTTP 503',
    });
    expect(classifyResult(JSON.stringify({ ok: true })).outcome).toBe('success');
    expect(classifyResult('plain text result').outcome).toBe('success');
    expect(classifyResult(JSON.stringify([{ error: 'x' }])).outcome).toBe('success'); // arrays not envelopes
  });

  it('counts contract violations separately', () => {
    recordContractViolation('t2');
    recordContractViolation('t2');
    expect(getToolReliability().find(t => t.tool === 't2')?.contractViolations).toBe(2);
  });
});

describe('tool-telemetry (registration wrapper)', () => {
  beforeEach(() => resetToolTelemetry());

  it('records success and failure outcomes for registered handlers, preserving throw', async () => {
    registerToolHandler('__test_ok', async () => JSON.stringify({ ok: true }));
    registerToolHandler('__test_throws', async () => {
      throw new Error('exploded');
    });

    await getToolHandler('__test_ok')!({});
    await expect(getToolHandler('__test_throws')!({})).rejects.toThrow('exploded');

    const byTool = new Map(getToolReliability().map(t => [t.tool, t]));
    expect(byTool.get('__test_ok')?.successes).toBe(1);
    expect(byTool.get('__test_throws')?.failures).toBe(1);
    expect(byTool.get('__test_throws')?.lastError).toBe('exploded');
  });

  it('classifies a graceful error payload as degraded', async () => {
    registerToolHandler('__test_degraded', async () => JSON.stringify({ error: 'API unavailable' }));
    await getToolHandler('__test_degraded')!({});
    const e = getToolReliability().find(t => t.tool === '__test_degraded')!;
    expect(e.degraded).toBe(1);
    expect(e.lastError).toBe('API unavailable');
  });

  it('records a contract violation when schema-required input is missing (report-only)', async () => {
    // Register a stub under a real tool name whose schema requires `query`.
    registerToolHandler('search_crm', async () => JSON.stringify({ ok: true }));

    await getToolHandler('search_crm')!({}); // missing required `query`
    await getToolHandler('search_crm')!({ query: 'acme' }); // compliant

    const e = getToolReliability().find(t => t.tool === 'search_crm')!;
    expect(e.contractViolations).toBe(1);
    expect(e.successes).toBe(2); // report-only: both calls still executed
  });
});

describe('tool-telemetry (persistence)', () => {
  beforeEach(() => resetToolTelemetry());
  afterEach(() => setTelemetryBackend(null));

  function fakeBackend(initial: TelemetrySnapshot | null = null): TelemetryBackend & { saved: TelemetrySnapshot[] } {
    const saved: TelemetrySnapshot[] = [];
    return {
      saved,
      load: vi.fn().mockResolvedValue(initial),
      save: vi.fn().mockImplementation(async (s: TelemetrySnapshot) => {
        saved.push(s);
      }),
    };
  }

  it('no-ops with no backend installed', async () => {
    expect(isTelemetryPersistenceEnabled()).toBe(false);
    await persistTelemetry(); // must not throw
    expect(await hydrateTelemetry()).toBe(0);
  });

  it('persistTelemetry saves the current snapshot via the backend', async () => {
    const be = fakeBackend();
    setTelemetryBackend(be);
    expect(isTelemetryPersistenceEnabled()).toBe(true);
    recordToolOutcome('search_literature', 'success', 120);
    await persistTelemetry();

    expect(be.save).toHaveBeenCalledTimes(1);
    expect(be.saved[0].version).toBe(1);
    expect(be.saved[0].tools.find(t => t.tool === 'search_literature')?.successes).toBe(1);
  });

  it('hydrateTelemetry seeds prior tools but never clobbers live counts', async () => {
    // Live: one call this session for search_crm.
    recordToolOutcome('search_crm', 'success', 50);
    const prior: TelemetrySnapshot = {
      version: 1,
      savedAt: '2026-01-01T00:00:00Z',
      tools: [
        { tool: 'search_crm', calls: 99, successes: 99, degraded: 0, failures: 0, consecutiveFailures: 0, avgLatencyMs: 10, lastError: null, lastUsedAt: 'old', contractViolations: 0 },
        { tool: 'search_drug_labels', calls: 5, successes: 4, degraded: 1, failures: 0, consecutiveFailures: 0, avgLatencyMs: 200, lastError: 'x', lastUsedAt: 'old', contractViolations: 0 },
      ],
    };
    setTelemetryBackend(fakeBackend(prior));

    const seeded = await hydrateTelemetry();
    expect(seeded).toBe(1); // only search_drug_labels seeded; search_crm already live

    const byTool = new Map(getToolReliability().map(t => [t.tool, t]));
    expect(byTool.get('search_crm')?.calls).toBe(1); // live count preserved, NOT 99
    expect(byTool.get('search_drug_labels')?.calls).toBe(5); // history restored
  });

  it('snapshotTelemetry is versioned and round-trippable', () => {
    recordToolOutcome('t', 'failure', 1, 'boom');
    const snap = snapshotTelemetry();
    expect(snap.version).toBe(1);
    expect(snap.savedAt).toBeTruthy();
    expect(snap.tools[0].tool).toBe('t');
  });
});
