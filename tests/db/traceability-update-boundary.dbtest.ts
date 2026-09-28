/**
 * D3: an UPDATE can cross the tenant boundary too.
 *
 * Runs on the shared two-tenant fixture (./two-tenant-fixture.ts) under the
 * production posture that fixture asserts: `app_service`, not superuser, no
 * BYPASSRLS, `app.rls_enforce=on`, the real JWT/scope middleware and the real
 * router.
 *
 * PUT /api/tenant-traceability/:id parsed its body with
 * `insertQmpTraceabilityMatrixSchema.partial()` — which accepts
 * `organizationId` and `qmpId` — and spread the result into `.set()`. Its WHERE
 * was scoped to the caller's org, so the row it found was always the caller's;
 * what the body could do was change which org, or which QMP, that row belonged
 * to. RLS checks the new row's organization on UPDATE; it does not check a
 * foreign key, and a FK check does not go through RLS. So the org move is
 * refused in production posture and the QMP re-point is not.
 *
 * Row state is read through the OWNER pool, which is exempt from RLS: reading
 * through the app role would be circular, since a row RLS hid from the app would
 * look exactly like a row that was never written.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authenticateToken } from '../../server/middleware/auth';
import tenantTraceabilityRouter from '../../server/routes/tenant-traceability';
import {
  TAG,
  ORG_A,
  ORG_B,
  owner,
  tokenA,
  auth,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

beforeAll(provisionTwoTenantFixture, 60_000);
afterAll(teardownTwoTenantFixture);

describe('A traceability update cannot move an item across the tenant boundary (D3)', () => {
  let tr: express.Express;
  let qmpA: number;
  let qmpB: number;
  let itemA: number;

  const item = async () =>
    (
      await owner.query(
        'SELECT organization_id, qmp_id, notes FROM qmp_traceability_matrix WHERE id=$1',
        [itemA]
      )
    ).rows[0] as { organization_id: number; qmp_id: number; notes: string | null };

  beforeAll(async () => {
    // Mounted behind authenticateToken, as the sibling suites mount the routers
    // the global /api auth boundary fronts in production
    // (server/bootstrap/register-tenant-routes.ts).
    tr = express();
    tr.use(express.json());
    tr.use('/api/tenant-traceability', authenticateToken, tenantTraceabilityRouter);

    const plans = await owner.query(
      `INSERT INTO quality_management_plans (organization_id, name) VALUES ($1,$2),($3,$4) RETURNING id`,
      [ORG_A, `${TAG}-qmp-A`, ORG_B, `${TAG}-qmp-B`]
    );
    [qmpA, qmpB] = plans.rows.map(r => r.id);
    const it = await owner.query(
      `INSERT INTO qmp_traceability_matrix (organization_id, qmp_id, requirement_id, requirement_text)
       VALUES ($1,$2,$3,'fixture-body-A') RETURNING id`,
      [ORG_A, qmpA, `${TAG}-REQ-A`]
    );
    itemA = it.rows[0].id;
  });

  it('an update naming another org leaves the item in its own tenant, and still applies', async () => {
    const res = await request(tr)
      .put(`/api/tenant-traceability/${itemA}`)
      .set(auth(tokenA))
      .send({ organizationId: ORG_B, notes: `${TAG}-noted` });
    const after = await item();
    expect(after.organization_id, "tenant A's item must remain tenant A's").toBe(ORG_A);
    expect(res.status, 'the rest of the update must go through, not be refused as a whole').toBe(
      200
    );
    expect(after.notes).toBe(`${TAG}-noted`);
  });

  it("an update cannot re-point the item at another tenant's QMP", async () => {
    const res = await request(tr)
      .put(`/api/tenant-traceability/${itemA}`)
      .set(auth(tokenA))
      .send({ qmpId: qmpB });
    expect((await item()).qmp_id, "tenant A's item must not reference tenant B's QMP").toBe(qmpA);
    expect(res.status, "another tenant's QMP must read as not found").toBe(404);
  });
});
