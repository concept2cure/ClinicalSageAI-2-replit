/**
 * Tool telemetry — unit tests.
 *
 * Part 1 tests the pure accounting module. Part 2 tests the registration
 * wrapper seam in AnaToolExecutor: every registered handler is instrumented, so
 * outcomes recorded here prove coverage for all dispatch paths.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordToolOutcome,
  recordContractViolation,
  classifyResult,
  getToolReliability,
  getUnhealthyTools,
  resetToolTelemetry,
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
