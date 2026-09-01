/**
 * A promotion gate that ran zero checks has not cleared anything.
 *
 * GET /promotion-blockers collects blockers from two sources — the contradiction
 * engine and the readiness engine — each inside its own bare catch, and then
 * answered:
 *
 *     blocked: blockers.some(b => b.severity === 'critical'),
 *     blockerCount: blockers.length,
 *
 * unconditionally. When a source failed, its blockers were never collected, and
 * an empty list is indistinguishable from a clean one.
 *
 * That was not hypothetical. The readiness call built its payload by hand —
 * `{ project: { id }, organizationId }` through `as any` — carrying none of the
 * five fields the engine reads. computeReadinessAssessment evaluates
 * `completeness` first, whose first statement is `payload.moduleMap.filter(...)`,
 * so it threw a TypeError on EVERY call, the catch swallowed it, and the gate
 * reported blocked:false / blockerCount:0 having evaluated nothing.
 *
 * The payload now comes from assembleCrossObjectPayload — the canonical builder
 * that continuity-service, lumen-context-builder and workflow-orchestrator all
 * use — and a source that does not run leaves `blocked` null rather than false.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { behaviour } = vi.hoisted(() => ({
  behaviour: {
    readinessThrows: false,
    contradictionThrows: false,
    readinessBlockers: [] as unknown[],
    findings: [] as unknown[],
    payloadCalls: [] as unknown[],
  },
}));

vi.mock('../../services/orchestration/cross-object-resolver.js', () => ({
  assembleCrossObjectPayload: async (scope: unknown) => {
    behaviour.payloadCalls.push(scope);
    return { moduleMap: [], documents: [], validations: [], cmcSignals: [], scope };
  },
}));

vi.mock('../../services/orchestration/readiness-engine.js', () => ({
  computeReadinessAssessment: (_payload: unknown) => {
    if (behaviour.readinessThrows) throw new Error('readiness engine exploded');
    return { blockers: behaviour.readinessBlockers };
  },
}));

vi.mock('../../services/contradiction-engine-service.js', () => ({
  contradictionEngineService: {
    scanProject: async () => {
      if (behaviour.contradictionThrows) throw new Error('scan failed');
      return { findings: behaviour.findings };
    },
  },
}));

import router from '../authoring-actions';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { tenantId: number }).tenantId = 7;
    next();
  });
  app.use('/api/authoring-actions', router);
  return app;
}

const get = () => request(makeApp()).get('/api/authoring-actions/promotion-blockers/123');

beforeEach(() => {
  behaviour.readinessThrows = false;
  behaviour.contradictionThrows = false;
  behaviour.readinessBlockers = [];
  behaviour.findings = [];
  behaviour.payloadCalls.length = 0;
});

describe('GET /promotion-blockers', () => {
  it('does not report blocked:false when a blocker source did not run', async () => {
    // The defect: an unrun gate rendered exactly like a clean one.
    behaviour.readinessThrows = true;
    const res = await get();

    expect(res.body.blocked).toBeNull();
    expect(res.body.blocked).not.toBe(false);
    expect(res.body.checksNotRun).toContain('readiness-engine');
    expect(res.body.message).toMatch(/could not be evaluated/i);
  });

  it('names every source that failed, not just a count', async () => {
    behaviour.readinessThrows = true;
    behaviour.contradictionThrows = true;
    const res = await get();

    expect(res.body.checksNotRun).toEqual(
      expect.arrayContaining(['contradiction-engine', 'readiness-engine']),
    );
    expect(res.body.blocked).toBeNull();
  });

  it('gives a real verdict when every source ran', async () => {
    const res = await get();

    expect(res.body.blocked).toBe(false);
    expect(res.body.checksNotRun).toEqual([]);
    expect(res.body.checksRun).toEqual(
      expect.arrayContaining(['contradiction-engine', 'readiness-engine']),
    );
  });

  it('builds the readiness payload with the canonical resolver, org-scoped', async () => {
    // The hand-rolled payload is what threw on every call.
    await get();

    expect(behaviour.payloadCalls).toHaveLength(1);
    expect(behaviour.payloadCalls[0]).toEqual({ organizationId: 7, projectId: 123 });
  });

  it('actually collects readiness blockers now that the call succeeds', async () => {
    behaviour.readinessBlockers = [
      { severity: 'critical', category: 'completeness', message: 'Module 3 incomplete' },
    ];
    const res = await get();

    expect(res.body.blocked).toBe(true);
    expect(res.body.blockerCount).toBe(1);
    expect(res.body.blockers[0].source).toBe('readiness-engine');
  });
});
