/**
 * POST /api/audit-services/figures/generate answers a refusal as a refusal and a
 * failure as a failure.
 *
 * Every unsuccessful figure was answered 422 with the engine's `error` — so a
 * model-gateway outage or a failed store read as "your request is
 * unprocessable", and the engine's error was whatever the failure's own text
 * was. A deliberate refusal stays 422 with its fixed sentence; a model-gateway
 * failure is 502 and an internal failure 500, each with the engine's fixed
 * sentence. Only the engine module is replaced.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../../services/figureGenerationService.js', () => ({
  autoInsertFigures: vi.fn(),
  generateFigure: h.generate,
}));

import router from '../audit-services';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 17, organizationId: 5 };
    next();
  });
  a.use('/api/audit-services', router);
  return a;
}

const post = () =>
  request(app()).post('/api/audit-services/figures/generate').send({ projectId: 12, figureType: 'bar_chart', rawData: [{ a: 1 }] });

beforeEach(() => {
  h.generate.mockReset();
});

describe('POST /api/audit-services/figures/generate — refusal 422, failure 5xx', () => {
  it('a deliberate refusal is 422 with its sentence', async () => {
    h.generate.mockResolvedValue({ success: false, failure: 'refused', error: 'figure reference 77 matched no data source, so no figure was generated.' });
    const r = await post();
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/figure reference 77 matched no data source/);
  });

  it('a model-gateway failure is 502, not 422', async () => {
    h.generate.mockResolvedValue({ success: false, failure: 'gateway', error: 'The drafting model did not return a figure, so no figure was generated.' });
    const r = await post();
    expect(r.status, 'a gateway outage was answered as an unprocessable request').toBe(502);
    expect(r.body.success).toBe(false);
  });

  it('an internal failure is 500, not 422', async () => {
    h.generate.mockResolvedValue({ success: false, failure: 'internal', error: 'The drafted figure could not be stored, so no figure was generated.' });
    const r = await post();
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/could not be stored/);
  });
});
