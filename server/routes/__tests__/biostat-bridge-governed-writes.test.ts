/**
 * The biostatistics bridge's two writes are governed writes.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `/api/biostat-bridge` is mounted behind `authMiddleware` alone
 * (`server/bootstrap/register-inline-routes.ts:375`) and the router installs no
 * gate of its own — `grep -nE "router\.use|requireEditor" biostat-bridge.ts`
 * returned nothing. Two governed writes sit on it:
 *
 *   POST /designs/:studyId/apply-sample-size  writes the study design's planned
 *                                             sample size and power, with a
 *                                             `recordGovernedAction` ledger row
 *   POST /designs/:studyId/tasks              writes `unified_tasks` rows plus
 *                                             their Part 11 audit rows
 *
 * So an organization `viewer` — the one role whose meaning is "does not write"
 * (`server/middleware/orgMembership.ts`) — could change the planned size of a
 * study and raise tasks on the canonical board.
 *
 * This is the SAME defect as T2 on `/api/tasks` and `/api/task-management`,
 * fixed there and pinned by `task-management-governed-writes.test.ts`. The repo
 * states the invariant it breaks, in the module the two gated routers share:
 *
 *   server/services/tasking/governed-task-write.ts:4
 *   "Two routers write `unified_tasks` ... Both gate each write with
 *    requireEditorAccess and run it with its ledger row on ONE transaction, so
 *    a refusal has to read the same whichever URL the caller used."
 *
 * This was the third URL, and it read differently.
 *
 * The fix is `requireEditorAccessForWrites` at the router's top rather than a
 * gate per route — the middleware written for this shape, whose own docstring
 * says why: "so a write route added later is gated without anyone remembering
 * to gate it." The bridge's three GETs stay open to a viewer, which is the
 * point of that middleware and what the last two cases here pin.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const S = vi.hoisted(() => ({
  applySampleSize: vi.fn(),
  createTasks: vi.fn(),
  listDesigns: vi.fn(),
}));

/* Only the service is replaced. The router, its validators and the real
   `requireEditorAccessForWrites` all run, because the gate is what is on
   trial: a stubbed middleware would pass whatever this file asserted. */
vi.mock('../../services/biostatistics-bridge/bridge-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/biostatistics-bridge/bridge-service')>()),
  applySampleSizeToDesign: S.applySampleSize,
  createTasksForDesign: S.createTasks,
  listBridgeDesigns: S.listDesigns,
}));

import biostatBridgeRouter from '../biostat-bridge';

const BASE = '/api/biostat-bridge';

/** The app as `register-inline-routes.ts` builds it: auth context, then the router. */
function makeApp(role: string | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 7, organizationId: 2, ...(role ? { role } : {}) };
    (req as any).userId = 7;
    if (role) (req as any).userRole = role;
    (req as any).tenantContext = { organizationId: 2 };
    next();
  });
  app.use(BASE, biostatBridgeRouter);
  return app;
}

/** The two writes, each with a body its validators accept. */
const WRITES = [
  {
    name: 'POST /designs/:studyId/apply-sample-size',
    send: (app: express.Express) =>
      request(app)
        .post(`${BASE}/designs/STUDY-1/apply-sample-size`)
        .send({ reason: 'The engine sized this design at 640 and the team accepted it.' }),
  },
  {
    name: 'POST /designs/:studyId/tasks',
    send: (app: express.Express) =>
      request(app).post(`${BASE}/designs/STUDY-1/tasks`).send({ keys: ['deliverable:sap'], reason: 'Raised from the assessment.' }),
  },
];

beforeEach(() => {
  S.applySampleSize.mockReset();
  S.createTasks.mockReset();
  S.listDesigns.mockReset();
  S.applySampleSize.mockResolvedValue({
    studyId: 'STUDY-1', plannedSampleSize: 640, power: 0.9,
    actionId: 'ACT-1', auditId: 'AUD-1', sha256Chain: 'abc',
  });
  S.createTasks.mockResolvedValue({ created: ['TASK-1'], skipped: [] });
  S.listDesigns.mockResolvedValue([]);
});

describe('the biostatistics bridge', () => {
  for (const w of WRITES) {
    it(`refuses ${w.name} from a viewer`, async () => {
      const res = await w.send(makeApp('viewer'));
      expect(res.status, `${w.name} let a viewer write`).toBe(403);
    });

    it(`refuses ${w.name} from a session with no role at all`, async () => {
      const res = await w.send(makeApp(null));
      expect(res.status).toBe(403);
    });

    it(`reaches the service for ${w.name} when the role may write`, async () => {
      const res = await w.send(makeApp('member'));
      expect(res.status, `a member was refused: ${JSON.stringify(res.body)}`).toBe(200);
    });
  }

  it('writes NOTHING when a viewer is refused — the gate precedes the service', async () => {
    for (const w of WRITES) await w.send(makeApp('viewer'));
    expect(S.applySampleSize).not.toHaveBeenCalled();
    expect(S.createTasks).not.toHaveBeenCalled();
  });

  /* The reads stay open. A viewer reading an assessment is the normal use of
     this surface, and gating the whole router would have taken it away. */
  it('still lets a viewer read the designs list', async () => {
    const res = await request(makeApp('viewer')).get(`${BASE}/designs`);
    expect(res.status).not.toBe(403);
  });

  it('still lets a viewer read the filing-placement catalog', async () => {
    const res = await request(makeApp('viewer')).get(`${BASE}/filing-placements?applicationType=IND`);
    expect(res.status).not.toBe(403);
  });
});
