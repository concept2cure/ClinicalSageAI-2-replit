/** Scheduler admission through the real lease, tenant scope and connection wrapper.
 * SQL/service boundaries are mocked; native RLS and advisory-lock contention are
 * qualified separately by tests/db/scheduler-jobs-under-rls.dbtest.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTenantScope, type TenantScope } from '../../db/tenantStore';

type Plan = { scheduleId: number; orgId: number; projectId: number };
type Client = { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn>; scope?: TenantScope };
const m = vi.hoisted(() => ({
  list: vi.fn(), review: vi.fn(), humanReview: vi.fn(), claim: vi.fn(),
  connect: vi.fn(), globalQuery: vi.fn(), warn: vi.fn(), info: vi.fn(),
  clients: [] as Client[], leaseHeld: false,
  /** Organizations whose lifecycle posture permits background work. */
  entitled: null as Set<number> | null,
}));
vi.mock('../../db/runtime', () => ({ getPool: () => ({ connect: m.connect }) }));
// The old sweep used this estate-wide pool for protected claims. Its use must
// remain observable while the current sweep uses the checked-out tenant client.
vi.mock('../../db', () => ({ pool: { query: m.globalQuery } }));
vi.mock('../../services/projects/schedule-of-events', () => ({
  listActiveSchedulePlans: m.list,
  reviewScheduleHealthForSweep: m.review,
  reviewScheduleHealth: m.humanReview,
}));
vi.mock('../../utils/logger', () => ({ createScopedLogger: () => ({ warn: m.warn, info: m.info }) }));
vi.mock('../../services/tenant/tenant-lifecycle', () => ({
  filterTenantsForBackgroundWork: vi.fn(async (ids: Iterable<number>) =>
    new Set([...ids].filter(id => m.entitled === null || m.entitled.has(id)))),
}));

import { runScheduleOfEventsSweep } from '../scheduleOfEventsSweep';

const PLANS: Plan[] = [
  { scheduleId: 11, orgId: 71, projectId: 710 },
  { scheduleId: 22, orgId: 72, projectId: 720 },
];
const tenantClients = () => m.clients.filter(c => c.scope?.tenantId !== '0');
const expectedScope = (orgId: number) => ({
  tenantId: String(orgId), orgUuid: null, role: null,
  source: 'job', caller: 'schedule-of-events-sweep:review',
});

beforeEach(() => {
  vi.clearAllMocks();
  m.clients = [];
  m.leaseHeld = false;
  m.entitled = null;
  m.list.mockImplementation(async () => PLANS);
  m.review.mockResolvedValue({ ok: true, tasksCreated: 1, alertsCreated: 2 });
  m.humanReview.mockResolvedValue({ ok: true, tasksCreated: 1, alertsCreated: 2 });
  m.claim.mockImplementation(async (_sql: string, values: unknown[]) => ({ rows: [{ id: values[0] }] }));
  m.globalQuery.mockImplementation((sql: string, values: unknown[]) => m.claim(sql, values));
  m.connect.mockImplementation(async () => {
    const scope = getTenantScope();
    const client: Client = { query: vi.fn(), release: vi.fn(), scope: scope && { ...scope } };
    client.query.mockImplementation(async (sql: string, values: unknown[]) => {
      if (sql.includes('pg_try_advisory_lock')) {
        const acquired = !m.leaseHeld;
        if (acquired) m.leaseHeld = true;
        return { rows: [{ acquired }] };
      }
      if (sql.includes('pg_advisory_unlock')) {
        m.leaseHeld = false;
        return { rows: [{ released: true }] };
      }
      if (sql.includes('UPDATE project_schedule_of_events')) return m.claim(sql, values);
      return { rows: [], rowCount: 0 };
    });
    m.clients.push(client);
    return client;
  });
});

describe('schedule sweep tenant admission', () => {
  it('lists the estate only inside the existing audited system lease', async () => {
    m.list.mockImplementation(async () => {
      expect(getTenantScope()).toMatchObject({ tenantId: '0', role: 'app_super_admin', source: 'job', caller: 'scheduled-once:schedule-of-events-sweep' });
      return [];
    });
    expect(await runScheduleOfEventsSweep()).toMatchObject({ schedules: 0, errors: 0 });
    expect(m.clients).toHaveLength(1);
    expect(m.clients[0].query.mock.calls[0]).toEqual([
      'SELECT pg_try_advisory_lock($1::int4, hashtext($2)) AS acquired',
      [20_260_924, 'schedule-of-events-sweep'],
    ]);
    expect(m.clients[0].release).toHaveBeenCalledWith(undefined);
  });

  it('claims and reviews each plan with the same least-privilege tenant client', async () => {
    m.review.mockImplementation(async (params: { orgId: number; projectId: number }, client: Client) => {
      expect(getTenantScope()).toEqual(expectedScope(params.orgId));
      expect(client).toBe(tenantClients().at(-1));
      expect(client.scope).toEqual(expectedScope(params.orgId));
      return { ok: true, tasksCreated: 1, alertsCreated: 2 };
    });
    expect(await runScheduleOfEventsSweep()).toEqual({ schedules: 2, reviewed: 2, recentlyReviewed: 0, skippedNotEntitled: 0, tasksCreated: 2, alertsCreated: 4, errors: 0 });
    expect(m.review).toHaveBeenCalledTimes(2);
    expect(m.humanReview).not.toHaveBeenCalled();
    expect(m.globalQuery).not.toHaveBeenCalled();
    expect(tenantClients().map(c => c.scope)).toEqual(PLANS.map(p => expectedScope(p.orgId)));
    for (const client of tenantClients()) {
      expect(client.query.mock.calls[0][1]).toEqual([client.scope?.tenantId, '', '']);
      expect(client.release).toHaveBeenCalledWith(undefined);
    }
    expect(getTenantScope()).toBeUndefined();
  });

  it('binds schedule, organization, project and the unchanged claim window', async () => {
    m.list.mockResolvedValue([PLANS[0]]);
    await runScheduleOfEventsSweep({ minReviewAgeMs: 15_000 });
    const [sql, values] = m.claim.mock.calls[0];
    expect(sql).toMatch(/WHERE id = \$1/);
    expect(sql).toMatch(/organization_id = \$2/);
    expect(sql).toMatch(/project_id = \$3/);
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain('p.id = project_schedule_of_events.project_id');
    expect(sql).toContain('p.organization_id = project_schedule_of_events.organization_id');
    expect(sql).toContain("p.status = 'active' AND o.status = 'active'");
    expect(sql).toMatch(/last_reviewed_by_ana_at IS NULL/);
    expect(sql).toMatch(/last_reviewed_by_ana_at < now\(\) - make_interval\(secs => \$4::double precision\)/);
    expect(values).toEqual([11, 71, 710, 15]);
  });

  it('does no listing or tenant work when another process holds the lease', async () => {
    m.leaseHeld = true;
    expect(await runScheduleOfEventsSweep()).toEqual({ schedules: 0, reviewed: 0, recentlyReviewed: 0, skippedNotEntitled: 0, tasksCreated: 0, alertsCreated: 0, errors: 0, skipped: 'held_elsewhere' });
    expect(m.list).not.toHaveBeenCalled();
    expect(m.claim).not.toHaveBeenCalled();
    expect(m.review).not.toHaveBeenCalled();
    expect(tenantClients()).toEqual([]);
  });

  it('skips the review when the guarded claim loses inside the review window', async () => {
    m.list.mockResolvedValue([PLANS[0]]);
    m.claim.mockResolvedValue({ rows: [] });
    expect(await runScheduleOfEventsSweep()).toMatchObject({ schedules: 1, reviewed: 0, recentlyReviewed: 1, errors: 0 });
    expect(m.review).not.toHaveBeenCalled();
    expect(tenantClients()[0].release).toHaveBeenCalledWith(undefined);
  });

  it.each([
    { name: 'organization', plan: { scheduleId: 11, orgId: 72, projectId: 710 } },
    { name: 'project', plan: { scheduleId: 11, orgId: 71, projectId: 711 } },
  ])('a stale listing with the wrong $name cannot claim the real schedule', async ({ plan }) => {
    m.list.mockResolvedValue([plan]);
    m.claim.mockImplementation(async (sql: string, values: unknown[]) => {
      // Model the UPDATE predicate against the persisted tuple. Native RLS is
      // not simulated here; this control checks all SQL keys are actually bound.
      const orgMatches = !sql.includes('organization_id = $2') || values[1] === PLANS[0].orgId;
      const projectMatches = !sql.includes('project_id = $3') || values[2] === PLANS[0].projectId;
      return { rows: orgMatches && projectMatches ? [{ id: 11 }] : [] };
    });
    expect(await runScheduleOfEventsSweep()).toMatchObject({ reviewed: 0, recentlyReviewed: 1 });
    expect(m.review).not.toHaveBeenCalled();
    expect(m.humanReview).not.toHaveBeenCalled();
  });

});

describe('schedule sweep tenant lifecycle', () => {
  // A tenant whose organization row reads active but whose payment is past_due
  // or canceled is read_only: every HTTP write is refused. The sweep checked
  // only organizations.status, so it still claimed the schedule and created
  // AnA's tasks and alerts for that tenant (taskDueSweep has the same filter).
  it('does not claim or review a schedule whose tenant may not run background work', async () => {
    m.entitled = new Set([72]);
    expect(await runScheduleOfEventsSweep()).toMatchObject({ schedules: 2, reviewed: 1, skippedNotEntitled: 1, errors: 0 });
    expect(m.review).toHaveBeenCalledTimes(1);
    expect(m.review.mock.calls[0][0]).toMatchObject({ orgId: 72, projectId: 720 });
    expect(m.claim.mock.calls.map(([, values]) => (values as unknown[])[1])).toEqual([72]);
    expect(tenantClients().map(c => c.scope?.tenantId)).toEqual(['72']);
  });

  it('reviews nothing when entitlement cannot be read, and says so', async () => {
    const { filterTenantsForBackgroundWork } = await import('../../services/tenant/tenant-lifecycle');
    vi.mocked(filterTenantsForBackgroundWork).mockRejectedValueOnce(new Error('posture read failed'));
    expect(await runScheduleOfEventsSweep()).toMatchObject({ schedules: 2, reviewed: 0, errors: 1 });
    expect(m.claim).not.toHaveBeenCalled();
    expect(m.warn).toHaveBeenCalledWith('tenant lifecycle read failed; no schedule was reviewed');
  });

  it('does no tenant work when no tenant is entitled', async () => {
    m.entitled = new Set();
    expect(await runScheduleOfEventsSweep()).toMatchObject({ schedules: 2, reviewed: 0, skippedNotEntitled: 2 });
    expect(m.claim).not.toHaveBeenCalled();
    expect(tenantClients()).toEqual([]);
  });
});

describe('schedule sweep failed and inactive work', () => {
  it('reports a listing failure as an error and never logs its private payload', async () => {
    m.list.mockRejectedValue(new Error('private database detail must not be logged'));
    expect(await runScheduleOfEventsSweep()).toMatchObject({ schedules: 0, reviewed: 0, errors: 1 });
    expect(m.warn).toHaveBeenCalledWith('active schedule listing failed');
    expect(JSON.stringify(m.warn.mock.calls)).not.toContain('private database detail');
    expect(tenantClients()).toEqual([]);
  });

  it.each(['project', 'organization'])('does not stamp or review an inactive %s parent', async parent => {
    m.list.mockResolvedValue([PLANS[0]]);
    let stamped = false;
    m.claim.mockImplementation(async (sql: string) => {
      // Only a SQL-shape control; the adjacent native cases exercise the real
      // inactive parent rows and prove no stamp survives in PostgreSQL.
      if (sql.includes(parent === 'project' ? "p.status = 'active'" : "o.status = 'active'")) return { rows: [] };
      stamped = true;
      return { rows: [{ id: 11 }] };
    });
    expect(await runScheduleOfEventsSweep()).toMatchObject({ reviewed: 0, recentlyReviewed: 1 });
    expect(stamped).toBe(false);
    expect(m.review).not.toHaveBeenCalled();
  });

  it('lets an unknown-commit failure reach the tenant wrapper for eviction and continues other plans', async () => {
    const failure = new Error('schedule commit acknowledgement unavailable');
    m.review.mockRejectedValueOnce(failure);
    expect(await runScheduleOfEventsSweep()).toMatchObject({ schedules: 2, reviewed: 1, tasksCreated: 1, alertsCreated: 2, errors: 1 });
    expect(tenantClients()[0].release).toHaveBeenCalledWith(failure);
    expect(tenantClients()[1].release).toHaveBeenCalledWith(undefined);
    expect(tenantClients()[0].query.mock.calls.some(([sql]) => sql.includes("set_config('app.current_tenant_id', '', false)"))).toBe(true);
    expect(tenantClients()[0].query.mock.calls.at(-1)?.[0]).toBe('RESET app.rls_enforce');
    expect(m.review).toHaveBeenCalledTimes(2);
  });

  it('counts a refused review as an error instead of implying a successful review', async () => {
    m.list.mockResolvedValue([PLANS[0]]);
    m.review.mockResolvedValue({ ok: false, tasksCreated: 0, alertsCreated: 0 });
    expect(await runScheduleOfEventsSweep()).toMatchObject({ schedules: 1, reviewed: 0, errors: 1 });
  });
});
