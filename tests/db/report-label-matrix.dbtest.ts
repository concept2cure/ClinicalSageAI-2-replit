/** Actual runtime role, authenticated routes and scheduled generation over provisioned RIM tables. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';
import reportRoutes from '../../server/routes/report-os';
import { computeDomainReport } from '../../server/services/report-os/research-compliance-report-providers';
import { LABEL_CURRENCY_TYPE } from '../../server/services/report-os/label-currency-matrix';
import { generateAndDeliver } from '../../server/services/report-os/scheduling/generate-deliver';
import type { ReportSubscriptionRow } from '../../shared/schema/report-os';
import { ORG_A, ORG_B, FIXTURE_ORGS, TAG, owner, userA, userB, tokenA, tokenB, auth, accessToken, provisionMember, provisionTwoTenantFixture, teardownTwoTenantFixture, workspaceA, ids } from './two-tenant-fixture';
const app = express(); app.use(express.json()); app.use('/api/report-os', reportRoutes);
let managerToken: string;
let runA: number;
beforeAll(async () => {
  await provisionTwoTenantFixture();
  await owner.query("UPDATE organizations SET tier='enterprise' WHERE id=ANY($1::int[])", [FIXTURE_ORGS]);
  managerToken = accessToken(await provisionMember(ORG_A, 'manager', 'label-manager'), ORG_A, 'manager');
  for (const [org, actor, side] of [[ORG_A, userA, 'A'], [ORG_B, userB, 'B']] as const) {
    const product = (await owner.query('INSERT INTO rim_products(organization_id,product_name,status,created_by) VALUES($1,$2,\'active\',$3) RETURNING id', [org, `${TAG}-matrix-product-${side}`, actor])).rows[0].id;
    await owner.query("INSERT INTO rim_registrations(organization_id,product_id,country,market_status,registration_number,created_by) VALUES($1,$2,'US','approved',$3,$4)", [org, product, `${TAG}-registration-${side}`, actor]);
    await owner.query("INSERT INTO rim_labels(organization_id,product_id,country,label_type,version,status,approved_date,created_by) VALUES($1,$2,'US','uspi',$3,'approved','2026-01-02',$4)", [org, product, `${TAG}-label-${side}`, actor]);
    await owner.query("INSERT INTO lifecycle_obligations(organization_id,product_id,region,obligation_type,title,status,due_date,created_by) VALUES($1,$2,'fda','supplement',$3,'planned','2000-01-01',$4)", [org, product, `${TAG}-obligation-${side}`, actor]);
  }
});
afterAll(async () => {
  if (owner) {
    await owner.query('DELETE FROM mdx_notifications WHERE organization_id=ANY($1::int[]) AND resource_type=$2', [FIXTURE_ORGS, 'report_run']);
    await owner.query('DELETE FROM report_subscriptions WHERE organization_id=ANY($1::int[])', [FIXTURE_ORGS]);
    for (const table of ['lifecycle_obligation_events', 'lifecycle_obligations', 'rim_labels', 'rim_registrations', 'rim_products']) await owner.query(`DELETE FROM ${table} WHERE organization_id=ANY($1::int[])`, [FIXTURE_ORGS]);
  }
  await teardownTwoTenantFixture();
});
const scope = <T>(work: () => Promise<T>) => runWithTenantScope({ tenantId: String(ORG_A), role: 'member', source: 'test', caller: 'label-matrix-native-proof' }, work);

describe('label matrix on actual provisioned tenant policies', () => {
  it('has a positive app_service read under FORCE RLS and excludes the foreign source', async () => {
    const posture = await scope(() => getPool().query("SELECT current_user AS actor, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE rolname=current_user"));
    expect(posture.rows).toEqual([{ actor: 'app_service', rolsuper: false, rolbypassrls: false }]);
    const policies = await owner.query('SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1::text[])', [['rim_products', 'rim_registrations', 'rim_labels', 'lifecycle_obligations']]);
    expect(policies.rows).toHaveLength(4); expect(policies.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const result = await scope(() => computeDomainReport(LABEL_CURRENCY_TYPE, ORG_A));
    expect(JSON.stringify(result)).toContain(`${TAG}-label-A`); expect(JSON.stringify(result)).not.toContain(`${TAG}-label-B`);
    const hidden = await scope(() => computeDomainReport(LABEL_CURRENCY_TYPE, ORG_B));
    expect(hidden?.provider.status).toBe('missing'); expect(JSON.stringify(hidden)).not.toContain(`${TAG}-label-B`);
  });
  it('the real authenticated route creates its own tenant matrix and readback renders it', async () => {
    const created = await request(app).post('/api/report-os/runs').set(auth(tokenA)).send({ scopeType: 'account', scopeId: String(ORG_A), reportTypeId: LABEL_CURRENCY_TYPE, organizationId: ORG_B });
    expect(created.status, JSON.stringify(created.body)).toBe(201); runA = created.body.data.run.id;
    const readback = await request(app).get(`/api/report-os/runs/${runA}/rendered`).set(auth(tokenA));
    expect(readback.status, JSON.stringify(readback.body)).toBe(200);
    expect(readback.body.data.computedScope).toBe('organization');
    expect(JSON.stringify(readback.body.data.sections)).toContain(`${TAG}-label-A`); expect(JSON.stringify(readback.body)).not.toContain(`${TAG}-label-B`);
    expect((await request(app).get(`/api/report-os/runs/${runA}/rendered`).set(auth(tokenB))).status).toBe(404);
  });
  it('the real route refuses a client filter instead of disclosing organization data as client data', async () => {
    const created = await request(app).post('/api/report-os/runs').set(auth(tokenA)).send({ scopeType: 'project', scopeId: ids.A.projects, reportTypeId: LABEL_CURRENCY_TYPE, clientWorkspaceId: workspaceA });
    expect(created.status, JSON.stringify(created.body)).toBe(422); expect(created.body.code).toBe('REPORT_CLIENT_SCOPE_UNSUPPORTED');
  });
  it('the actual finalization route refuses unknown legal currency before any signing act', async () => {
    const finalized = await request(app).post(`/api/report-os/runs/${runA}/finalize`).set(auth(managerToken)).send({ reason: 'Review recorded labeling matrix before issue' });
    expect(finalized.status, JSON.stringify(finalized.body)).toBe(409); expect(finalized.body.downgradedTo).toBe('partial');
    expect((await owner.query('SELECT status FROM report_runs WHERE id=$1', [runA])).rows[0].status).toBe('partial');
  });
  it('scheduled generation uses the same actual matrix engine, persists it, and notifies the tenant recipient', async () => {
    const seeded = (await owner.query("INSERT INTO report_subscriptions(organization_id,report_type_id,scope_type,scope_id,schedule,recipients,channel,format,enabled,created_by,next_run_at) VALUES($1,$2,'account',$3,$4::json,'[]','platform','in_app',true,$5,$6) RETURNING *", [ORG_A, LABEL_CURRENCY_TYPE, String(ORG_A), JSON.stringify({ cadence: 'daily', hour: 9 }), userA, new Date(Date.now() - 86_400_000)])).rows[0];
    const subscription: ReportSubscriptionRow = { id: seeded.id, organizationId: ORG_A, reportTypeId: LABEL_CURRENCY_TYPE, scopeType: 'account', scopeId: String(ORG_A), clientWorkspaceId: null, createdBy: userA, persona: null, schedule: seeded.schedule, recipients: [], format: 'in_app', channel: 'platform', enabled: true, createdAt: seeded.created_at, updatedAt: seeded.updated_at, nextRunAt: seeded.next_run_at, lastRunAt: null };
    await scope(() => generateAndDeliver(subscription));
    const stored = (await owner.query('SELECT id,dependency_summary,status FROM report_runs WHERE organization_id=$1 AND dependency_summary::jsonb @> $2::jsonb', [ORG_A, JSON.stringify({ subscription: { id: subscription.id } })])).rows;
    expect(stored).toHaveLength(1); expect(stored[0].status).toBe('partial');
    expect(JSON.stringify(stored[0].dependency_summary)).toContain(`${TAG}-label-A`); expect(JSON.stringify(stored[0].dependency_summary)).not.toContain(`${TAG}-label-B`);
    const notice = await owner.query('SELECT recipient_user_id,resource_id,body FROM mdx_notifications WHERE organization_id=$1 AND resource_type=$2 AND resource_id=$3', [ORG_A, 'report_run', String(stored[0].id)]);
    expect(notice.rows).toHaveLength(1); expect(notice.rows[0].recipient_user_id).toBe(userA); expect(notice.rows[0].body).toContain('covers the organization');
    expect((await owner.query('SELECT last_run_at FROM report_subscriptions WHERE id=$1', [subscription.id])).rows[0].last_run_at).not.toBeNull();
  });
});
