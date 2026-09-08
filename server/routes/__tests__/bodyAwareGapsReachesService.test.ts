/**
 * A working capability reported as unavailable for its whole life.
 *
 * POST /body-aware-gaps resolved its service like this:
 *
 *     const service = m.bodyAwareAuthoringService || m.BodyAwareAuthoringService || m.default;
 *     if (service) { … svc.detectBodySpecificGaps(…) }
 *
 * server/services/body-aware-authoring.ts exports plain NAMED functions —
 * getSectionExpectations, getBodyAwareContext, detectBodySpecificGaps — and none
 * of those three lookup names. `service` was always undefined, the guard never
 * opened, and every call fell through to the handler's 'service_unavailable'
 * response.
 *
 * The capability was never missing: detectBodySpecificGaps is implemented, and
 * its signature is exactly the four arguments the handler already had ready.
 *
 * Note WHY this hid so well. The fallback is honest — it says the analysis could
 * not be run rather than returning an empty gap list, which would have claimed
 * "no gaps found" for a section nobody examined. That honesty is correct, and it
 * is also why a permanently-degraded path drew no attention.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { detectCalls, gapResult, exportsShape } = vi.hoisted(() => ({
  detectCalls: [] as unknown[][],
  gapResult: { value: null as unknown },
  exportsShape: { omitFunction: false },
}));

vi.mock('../../services/body-aware-authoring.js', () => ({
  /* A getter, so the test can decide per-call whether the export is present.
     A plain property would be fixed when the factory first ran, and the router
     imports the module once. */
  get detectBodySpecificGaps() {
    if (exportsShape.omitFunction) return undefined;
    return async (...args: unknown[]) => {
      detectCalls.push(args);
      return gapResult.value;
    };
  },
  getSectionExpectations: async () => ({}),
}));

import router from '../authoring-actions';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { tenantId: number }).tenantId = 7;
    (req as unknown as { userId: number }).userId = 42;
    next();
  });
  app.use('/api/authoring-actions', router);
  return app;
}

const post = (body: Record<string, unknown>) =>
  request(makeApp()).post('/api/authoring-actions/body-aware-gaps').send(body);

const VALID = {
  regulatorBody: 'fda',
  submissionType: '510k',
  sectionCode: '3.2.S.1',
  currentContent: 'some drafted content',
};

beforeEach(() => {
  detectCalls.length = 0;
  gapResult.value = null;
  exportsShape.omitFunction = false;
});

describe('POST /body-aware-gaps', () => {
  it('actually calls the exported gap detector', async () => {
    // The defect: this was never reached, because the handler looked for the
    // function under three names the module does not export.
    gapResult.value = { gaps: [{ text: 'Missing biocompatibility', status: 'missing' }] };
    const res = await post(VALID);

    expect(detectCalls).toHaveLength(1);
    expect(res.body.status).toBe('data');
    expect(res.body.status).not.toBe('service_unavailable');
  });

  it('passes the four arguments the detector actually takes, in order', async () => {
    gapResult.value = { gaps: [] };
    await post(VALID);

    expect(detectCalls[0]).toEqual(['fda', '510k', '3.2.S.1', 'some drafted content']);
  });

  it('unwraps the GapAnalysis the detector returns', async () => {
    gapResult.value = { gaps: [{ text: 'a' }, { text: 'b' }] };
    const res = await post(VALID);

    expect(res.body.gapCount).toBe(2);
    expect(res.body.gaps).toHaveLength(2);
  });

  it('reports zero gaps as a RESULT, not as unavailability', async () => {
    // A section that was examined and found complete is a different fact from
    // one that was never examined. Both used to render as the same response.
    gapResult.value = { gaps: [] };
    const res = await post(VALID);

    expect(res.body.status).toBe('data');
    expect(res.body.gapCount).toBe(0);
  });

  it('still degrades honestly when the detector genuinely is not there', async () => {
    exportsShape.omitFunction = true;
    const res = await post(VALID);

    expect(res.body.status).toBe('service_unavailable');
    // It must say the analysis did not run — never imply a clean result.
    expect(res.body.message).toMatch(/could not be analyzed/i);
    expect(res.body.gapCount ?? null).toBeNull();
  });

  it('still validates its inputs', async () => {
    const res = await post({ regulatorBody: 'fda' });
    expect(res.status).toBe(400);
    expect(detectCalls).toHaveLength(0);
  });
});
