/**
 * buildIndTimeline refuses a horizonDays or dueSoonDays that is not a positive
 * integer (VALIDATION: the routes answer 400).
 *
 * What it used to do (until 2026-10-15): `horizonDays ?? 730` passed any value
 * through, so a non-numeric horizon (from the raw POST /timeline body) made the
 * horizon NaN and the timeline silently held no annual-report milestones; a
 * non-numeric dueSoonDays silently marked nothing due soon.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { vi } from 'vitest';

vi.mock('../../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { buildIndTimeline } from '../ind-timeline-service';
import computeRoutes from '../../../routes/ind-lifecycle/compute.routes';

const BASE = { receiptDate: '2020-01-01', effectiveDate: '2020-01-31', asOf: '2026-01-01' };

describe('horizonDays and dueSoonDays are positive integers or refused', () => {
  it.each(['two years', '730', 0, -5, 1.5, Number.NaN])('horizonDays %j is refused', (horizonDays) => {
    expect(() => buildIndTimeline({ ...BASE, horizonDays: horizonDays as number })).toThrow(/^VALIDATION: horizonDays/);
  });

  it.each(['soon', 0, -1, 2.5])('dueSoonDays %j is refused', (dueSoonDays) => {
    expect(() => buildIndTimeline({ ...BASE, dueSoonDays: dueSoonDays as number })).toThrow(/^VALIDATION: dueSoonDays/);
  });

  it('absent: the stated defaults apply and milestones are projected', () => {
    expect(buildIndTimeline(BASE).milestones.length).toBeGreaterThan(0);
  });

  it('POST /timeline answers 400 naming horizonDays', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { user: unknown }).user = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
      next();
    });
    app.use('/api/ind-lifecycle', computeRoutes);
    const res = await request(app).post('/api/ind-lifecycle/timeline').send({ ...BASE, horizonDays: 'two years' });
    expect(res.status, 'a non-numeric horizon gave a timeline with no milestones').toBe(400);
    expect(res.body.error.message).toMatch(/horizonDays/);
  });
});
