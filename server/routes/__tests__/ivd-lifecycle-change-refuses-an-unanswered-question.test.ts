/**
 * POST /api/ivd-lifecycle/change/fda-510k and /change/eu-significant refuse an unanswered question (P-122,
 * 2026-11-12).
 *
 * What the routes did before: each handed the request body to its engine (services/regulatory/change-assessment.ts),
 * and the engine read an absent answer as "no". An empty body answered 200 with decision letter_to_file ("No
 * flowchart trigger is met") and 200 with significant: false. Neither is a determination: nobody answered anything.
 * The engines now refuse each unanswered question by field, and the routes say so as 422.
 */
import { describe, it, expect, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

/* The auth gate is not what these cases are about; it installs a user and passes. */
vi.mock('../../middleware/auth', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: unknown }).user = { id: 1, organizationId: 1 };
    next();
  },
}));

import router from '../ivd-lifecycle';
import { DEVICE_CHANGE_QUESTIONS } from '../../../shared/regulatory/change-control-taxonomy';

const app = express();
app.use(express.json());
app.use('/api/ivd-lifecycle', router);

const post = (path: string, body: object) => request(app).post(`/api/ivd-lifecycle${path}`).send(body);
const allNo = (market: 'us' | 'eu') => Object.fromEntries(DEVICE_CHANGE_QUESTIONS[market].map((q) => [q.key, false]));

describe('POST /change/fda-510k', () => {
  it('an empty body is refused, naming the questions: it is not a letter to file', async () => {
    const res = await post('/change/fda-510k', {});
    expect(res.status).toBe(422);
    expect(res.body.decision).toBeUndefined();
    for (const q of DEVICE_CHANGE_QUESTIONS.us) expect(res.body.error).toContain(q.key);
  });

  it('one unanswered question is refused, by name', async () => {
    const res = await post('/change/fda-510k', { ...allNo('us'), softwareChangeAffectsRisk: undefined });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/softwareChangeAffectsRisk \(true or false\)/);
  });

  it('every question answered gets the engine\'s decision, with its rationale', async () => {
    const res = await post('/change/fda-510k', { ...allNo('us'), couldSignificantlyAffectSafetyOrEffectiveness: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ decision: 'new_510k', triggers: ['Change could significantly affect safety or effectiveness.'] });
    expect(res.body.rationale).toMatch(/a new 510\(k\) is indicated/);
  });
});

describe('POST /change/eu-significant', () => {
  it('an empty body is refused: it is not "not significant"', async () => {
    const res = await post('/change/eu-significant', {});
    expect(res.status).toBe(422);
    expect(res.body.significant).toBeUndefined();
    for (const q of DEVICE_CHANGE_QUESTIONS.eu) expect(res.body.error).toContain(q.key);
  });

  it('every question answered no is the engine\'s "not significant"; one yes is significant', async () => {
    const none = await post('/change/eu-significant', allNo('eu'));
    expect(none.status).toBe(200);
    expect(none.body).toMatchObject({ significant: false, triggers: [] });
    const one = await post('/change/eu-significant', { ...allNo('eu'), changesIntendedPurpose: true });
    expect(one.body).toMatchObject({ significant: true, triggers: ['Change of intended purpose.'] });
  });
});
