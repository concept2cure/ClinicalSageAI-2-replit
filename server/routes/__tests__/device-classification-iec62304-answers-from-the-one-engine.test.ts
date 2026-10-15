/**
 * POST /api/device-classification/iec62304-class answers from the one IEC 62304
 * engine (2026-10-15).
 *
 * The route ran classifyIec62304 (server/services/regulatory/samd-classification.ts),
 * a third IEC 62304 software safety classifier beside the canonical classifySoftware
 * (server/services/market-specs/software-lifecycle.ts), with its own rationale text and
 * its own response shape ({ softwareSafetyClass, rationale, framework }). The route now
 * maps its two inputs onto classifySoftware's harm facts (both judged after external
 * risk controls) and returns the canonical classification; classifyIec62304 is gone.
 */
import { describe, it, expect, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

vi.mock('../../middleware/auth', () => ({
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import router from '../device-classification';
import { classifySoftware } from '../../services/market-specs/software-lifecycle';

const app = express();
app.use(express.json());
app.use('/api/device-classification', router);

const post = (body: object) => request(app).post('/api/device-classification/iec62304-class').send(body);

type Severity = 'none' | 'non-serious' | 'serious-or-death';

/* Each input pair, the harm facts it states, and the class those facts decide. */
const CASES: Array<[boolean, Severity, Parameters<typeof classifySoftware>[0], 'A' | 'B' | 'C']> = [
  [false, 'none', { canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: false }, 'A'],
  [false, 'non-serious', { canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: false }, 'A'],
  [false, 'serious-or-death', { canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: false }, 'A'],
  [true, 'none', { canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: false }, 'A'],
  [true, 'non-serious', { canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: true }, 'B'],
  [true, 'serious-or-death', { canContributeToDeathOrSeriousInjury: true }, 'C'],
];

describe('POST /iec62304-class', () => {
  it.each(CASES)(
    'canContributeToHazard=%s, harm=%s answers the canonical classification',
    async (canContributeToHazard, harmSeverityAfterExternalControls, facts, cls) => {
      const res = await post({ canContributeToHazard, harmSeverityAfterExternalControls });
      expect(res.status).toBe(200);
      expect(res.body.result, 'the route answered from a classifier other than classifySoftware').toEqual(classifySoftware(facts));
      expect(res.body.result).toMatchObject({ class: cls, missingFacts: [] });
    },
  );

  it('still refuses a body missing an input with 400', async () => {
    const res = await post({ canContributeToHazard: true });
    expect(res.status).toBe(400);
  });
});

it('the third IEC 62304 classifier is gone from samd-classification, and IMDRF categorization stays', async () => {
  const mod = await import('../../services/regulatory/samd-classification');
  expect(Object.keys(mod)).not.toContain('classifyIec62304');
  expect(typeof mod.categorizeSamd).toBe('function');
});
