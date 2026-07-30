/**
 * GET /api/shadow-review — the converged reviewer-worklist read for the v2 surface.
 *
 * The route is thin: guard the org, delegate to the real-store assembler, and shape the
 * envelope. It reads ONLY the real shadow-review store (shadow_review_runs +
 * shadow_review_findings) — no legacy/seed blob and no fallback — so an org that has
 * never run a reviewer gets an honest empty list. (The full mapping is proven against
 * real SQL in shadow-review-view-assembler.pglite.integration.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const assembleOrgShadowReview = vi.fn();
vi.mock('../../services/shadow-review/shadow-review-view-assembler', () => ({
  assembleOrgShadowReview: (...a: unknown[]) => assembleOrgShadowReview(...a),
}));

import shadowReviewRouter from '../shadow-review.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/shadow-review', shadowReviewRouter);
  return app;
}

beforeEach(() => assembleOrgShadowReview.mockReset());

describe('GET /api/shadow-review', () => {
  it('403 without org context', async () => {
    const res = await request(appWith(null)).get('/api/shadow-review');
    expect(res.status).toBe(403);
    expect(assembleOrgShadowReview).not.toHaveBeenCalled();
  });

  it('returns the real-store lenses for the acting org, source = shadow_review_runs', async () => {
    assembleOrgShadowReview.mockResolvedValue([
      {
        lens: 'fda_filing',
        findings: [
          {
            dimension: 'crl', severity: 'major',
            title: 'Single pivotal trial without confirmatory support',
            detail: 'Efficacy rests on one pivotal study (BX204-301).',
            basis: 'FDA 1998 guidance; 21 CFR 314.126.',
            recommendation: 'Pre-empt in §2.5.4.', leafRef: '2.5.4',
          },
        ],
      },
    ]);
    const res = await request(appWith(7)).get('/api/shadow-review');
    expect(res.status).toBe(200);
    expect(assembleOrgShadowReview).toHaveBeenCalledWith(7);
    expect(res.body.meta.source).toBe('shadow_review_runs');
    const first = res.body.data[0];
    expect(first).toHaveProperty('lens', 'fda_filing');
    const f = first.findings[0];
    for (const k of ['dimension', 'severity', 'title', 'detail', 'basis', 'recommendation', 'leafRef']) {
      expect(f).toHaveProperty(k);
    }
    expect(f.leafRef).toBe('2.5.4');
    expect(res.body.meta.count).toBe(1);
  });

  it('honest empty list when the org has never run a reviewer — no fallback data', async () => {
    assembleOrgShadowReview.mockResolvedValue([]);
    const res = await request(appWith(7)).get('/api/shadow-review');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });
});
