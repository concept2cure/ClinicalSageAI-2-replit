/**
 * "Artifact marked submission-ready" must not be said about an artifact that
 * does not exist.
 *
 * The block that resolves the artifact and persists the governed
 * submission-ready contract throws `new Error('Artifact not found')` when the
 * artifact does not resolve for this project and org. Its catch handled ONE
 * case — a governed-contract violation — and then ended:
 *
 *     } catch (metadataErr: unknown) {
 *       if (isGovernedContractInvalidError(metadataErr) && metadataErr.governed) {
 *         return sendGovernedContractInvalid(res, metadataErr.governed);
 *       }
 *     }
 *     return res.json({ submissionReady: true, message: 'Artifact marked submission-ready.' … })
 *
 * Everything else fell straight through to that success body. Measured against
 * the unfixed code, the response for a non-existent artifact was
 *
 *     {"submissionReady":true,"message":"Artifact marked submission-ready.",
 *      "decisionId":"dec_…","receiptId":"rcpt_…"}
 *
 * so it did not merely claim success — it minted a governance decision and
 * receipt for a transition that never happened.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { selectRows } = vi.hoisted(() => ({ selectRows: { value: [] as unknown[] } }));

/** A drizzle stand-in: every builder method chains, and awaiting the chain
 *  resolves to whatever the test set. */
function chain(result: unknown) {
  const p: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return (resolve: (v: unknown) => unknown) => resolve(result);
        return () => p;
      },
    },
  );
  return p;
}

const dbStub = () => ({
  select: () => chain(selectRows.value),
  update: () => chain([]),
  insert: () => chain([]),
  query: new Proxy(
    {},
    { get: () => ({ findFirst: async () => undefined, findMany: async () => [] }) },
  ),
});

/* The router does `await import('../db.js')` from server/routes/, i.e.
   server/db. vi.mock resolves relative to THIS file, so it is one level up
   again — a wrong specifier here silently mocks nothing and the test would
   pass for a reason unrelated to the fix. */
vi.mock('../../db.js', () => ({ get db() { return dbStub(); } }));
vi.mock('../../db', () => ({ get db() { return dbStub(); } }));

import router from '../authoring-actions';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { tenantId: number }).tenantId = 7;
    (req as unknown as { user: unknown }).user = { id: 'u1', organizationId: 7, email: 'ra@test.co' };
    /* The governance boundary refuses the transition without an identified
       actor, and again without an authorised role — both are guards BEFORE the
       block under test, and a request that stops at either proves nothing. */
    (req as unknown as { userId: number }).userId = 42;
    (req as unknown as { userRole: string }).userRole = 'submission_lead';
    next();
  });
  app.use('/api/authoring-actions', router);
  return app;
}

const postMarkReady = () =>
  request(makeApp())
    .post('/api/authoring-actions/mark-submission-ready')
    .send({ projectId: 1, artifactId: 99999 });

beforeEach(() => {
  selectRows.value = [];
});

describe('POST /mark-submission-ready when the artifact does not resolve', () => {
  it('does not answer "Artifact marked submission-ready"', async () => {
    const res = await postMarkReady();

    expect(res.body?.submissionReady).not.toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/Artifact marked submission-ready/);
    // Fail closed: the state was not changed, and the response says so.
    expect(res.status).toBe(500);
  });

  it('does not mint a governance receipt for an artifact that does not exist', async () => {
    const res = await postMarkReady();

    expect(res.body?.decisionId ?? null).toBeNull();
    expect(res.body?.receiptId ?? null).toBeNull();
  });
});
