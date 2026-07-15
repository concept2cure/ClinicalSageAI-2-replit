/**
 * Contract-stub route tests — change-assessment + enablement.
 *
 * These org-scoped endpoints back the change-assessment and training surfaces'
 * live reads. Until a backing store lands they return an empty canonical
 * envelope; the client fails closed to its fixture. The contract that must hold:
 * 403 without org context, and a `{ data: [] }` envelope with it.
 */
import { describe, it, expect } from 'vitest';
import express, { type Request, type Response, type NextFunction, type Router } from 'express';
import request from 'supertest';
import changeAssessmentRouter from '../../routes/change-assessment.routes';
import enablementRouter from '../../routes/enablement';

function appWith(router: Router, org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/x', router);
  return app;
}

const cases: Array<[string, Router]> = [
  ['change-assessment', changeAssessmentRouter],
  ['enablement', enablementRouter],
];

describe('contract-stub routes', () => {
  for (const [name, router] of cases) {
    it(`${name}: 403 without org context`, async () => {
      const res = await request(appWith(router, null)).get('/api/x');
      expect(res.status).toBe(403);
    });

    it(`${name}: empty canonical envelope with org context`, async () => {
      const res = await request(appWith(router, 42)).get('/api/x');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(0);
    });
  }
});
