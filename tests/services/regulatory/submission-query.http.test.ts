/** Native Express parser/HTTP regression; not a gateway or license proof. */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ plan: vi.fn(), coverage: vi.fn() }));
vi.mock('../../../server/services/regulatory/submission-resolver.js', () => ({
  resolveSubmissionPlan: h.plan, submissionCoverageMatrix: h.coverage,
}));
import router from '../../../server/routes/biopharma/submissions';
beforeEach(() => {
  h.plan.mockReset().mockReturnValue({ coverage: 'partial' });
  h.coverage.mockReset().mockReturnValue({ rows: [] });
});

describe.each(['simple', 'extended'] as const)('planning query parser: %s', parser => {
  function app() {
    const a = express();
    a.set('query parser', parser);
    a.use('/api/biopharma/submissions', router);
    return a;
  }
  it('retains a diagnostic product and the selected Canada/Australia region list', async () => {
    const result = await request(app()).get('/api/biopharma/submissions/plan')
      .query({ filingType: 'US_510K', productClass: 'ivd', regions: ' ca, au ' });
    expect(result.status).toBe(200);
    expect(h.plan).toHaveBeenCalledWith({ filingType: 'US_510K', productClass: 'ivd',
      applicationFamily: undefined, regions: ['CA', 'AU'] });
  });
  it('rejects a repeated region parameter rather than using the first value or crashing', async () => {
    const result = await request(app()).get('/api/biopharma/submissions/plan?regions=US&regions=AU');
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('SUBMISSION_QUERY_INVALID');
    expect(h.plan).not.toHaveBeenCalled();
  });
  it('rejects nested parameters under both real query parsers', async () => {
    const result = await request(app()).get('/api/biopharma/submissions/plan?productClass[value]=ivd');
    expect(result.status).toBe(400);
    expect(h.plan).not.toHaveBeenCalled();
  });
  it('does not reinterpret an explicit empty region as default markets', async () => {
    const result = await request(app()).get('/api/biopharma/submissions/coverage?regions=');
    expect(result.status).toBe(400);
    expect(h.coverage).not.toHaveBeenCalled();
  });
  it('does not silently ignore a coverage filter that this route does not apply', async () => {
    const result = await request(app()).get('/api/biopharma/submissions/coverage?productClass=ivd');
    expect(result.status).toBe(400);
    expect(h.coverage).not.toHaveBeenCalled();
  });
  it('keeps the existing omitted-parameter behavior', async () => {
    expect((await request(app()).get('/api/biopharma/submissions/coverage')).status).toBe(200);
    expect(h.coverage).toHaveBeenCalledWith(undefined);
  });
});
