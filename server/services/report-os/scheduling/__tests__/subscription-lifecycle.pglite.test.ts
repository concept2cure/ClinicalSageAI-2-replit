import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PoolClient } from 'pg';

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  client: null as unknown,
  validate: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../../../../db', () => ({
  get db() { return mocks.db; },
  transaction: async (fn: (client: PoolClient) => Promise<unknown>) => {
    const client = mocks.client as PoolClient;
    await client.query('BEGIN');
    try { const result = await fn(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
  },
}));
vi.mock('../../../tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn() }));
vi.mock('../../../auditService', () => ({ writeChainedAuditRow: mocks.audit }));
vi.mock('../configuration', async (importOriginal) => {
  const real = await importOriginal<typeof import('../configuration')>();
  return { ...real, validateSubscriptionConfiguration: mocks.validate };
});

import { createSubscription, listDueSubscriptions, setEnabled } from '../subscription-service';
import type { CreateSubscriptionInput } from '../subscription-service';

let pg: PGlite;
const input: CreateSubscriptionInput = {
  organizationId: 11, createdBy: 42, reportTypeId: 'readiness.executive_digest',
  scopeType: 'project', scopeId: '100', schedule: { cadence: 'daily', hour: 9 },
};

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE report_subscriptions (
    id serial PRIMARY KEY, organization_id int NOT NULL, client_workspace_id int,
    report_type_id text NOT NULL, scope_type text NOT NULL, scope_id text NOT NULL,
    schedule json NOT NULL, recipients json, format text DEFAULT 'pdf',
    channel text DEFAULT 'platform', persona text, enabled bool DEFAULT true,
    last_run_at timestamp, next_run_at timestamp, created_by int,
    created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
  )`);
  const client = {
    query: async (config: string | { text: string; rowMode?: string }, values?: unknown[]) => {
      const result = await pg.query<Record<string, unknown>>(typeof config === 'string' ? config : config.text, values);
      return { rows: typeof config !== 'string' && config.rowMode === 'array' ? result.rows.map(Object.values) : result.rows, rowCount: result.affectedRows };
    },
  } as unknown as PoolClient;
  mocks.client = client;
  mocks.db = drizzle(client);
  mocks.validate.mockReset().mockResolvedValue({});
  mocks.audit.mockReset().mockResolvedValue(undefined);
}, 60_000);
afterEach(async () => { await pg.close(); vi.useRealTimers(); });

async function legacySubscription(): Promise<number> {
  const rows = await pg.query<{ id: number }>(`INSERT INTO report_subscriptions
    (organization_id, report_type_id, scope_type, scope_id, schedule, recipients,
     format, channel, enabled, created_by, created_at, updated_at, next_run_at)
    VALUES (11, 'readiness.executive_digest', 'project', '100',
      '{"cadence":"daily","hour":9}', '[]', 'in_app', 'platform', false, 42,
      '2026-10-09 10:00:00', '2026-10-09 10:00:00.123456', '2026-10-10 09:00:00')
    RETURNING id`);
  return rows.rows[0].id;
}

describe('subscription lifecycle against PostgreSQL semantics', () => {
  it('creates a governed schedule and does not fire before its first stored occurrence', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
    const sub = await createSubscription(input);
    expect(sub.createdBy).toBe(42);
    expect(sub.format).toBe('in_app');
    expect(sub.nextRunAt?.toISOString()).toBe('2026-10-11T09:00:00.000Z');
    expect(mocks.audit).toHaveBeenCalledWith(mocks.client, expect.objectContaining({ action: 'report_os.subscription_created' }));
    expect(await listDueSubscriptions(new Date('2026-10-10T11:00:00Z'))).toEqual([]);
    expect((await listDueSubscriptions(new Date('2026-10-11T09:00:00Z'))).map(row => row.id)).toEqual([sub.id]);
  }, 60_000);

  it('rolls back creation when its chained audit event cannot be recorded', async () => {
    mocks.audit.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(createSubscription(input)).rejects.toThrow('audit unavailable');
    expect((await pg.query('SELECT * FROM report_subscriptions')).rows).toEqual([]);
  }, 60_000);

  it('enables a legacy microsecond row and recomputes its next future occurrence', async () => {
    const id = await legacySubscription();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    const sub = await setEnabled(id, 11, true, 42);
    expect(sub?.enabled).toBe(true);
    expect(sub?.nextRunAt?.toISOString()).toBe('2026-10-14T09:00:00.000Z');
    expect(mocks.validate).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith(mocks.client, expect.objectContaining({ userId: 42, action: 'report_os.subscription_enablement_changed' }));
  }, 60_000);

  it('refuses a changed recurrence within the same timestamp millisecond', async () => {
    const id = await legacySubscription();
    mocks.validate.mockImplementationOnce(async () => {
      await pg.exec(`UPDATE report_subscriptions SET schedule = '{"cadence":"daily","hour":10}'`);
    });
    await expect(setEnabled(id, 11, true, 42)).rejects.toMatchObject({ code: 'REPORT_SUBSCRIPTION_CHANGED', status: 409 });
    const stored = await pg.query<{ enabled: boolean; schedule: { hour: number } }>('SELECT enabled, schedule FROM report_subscriptions');
    expect(stored.rows).toEqual([{ enabled: false, schedule: { cadence: 'daily', hour: 10 } }]);
    expect(mocks.audit).not.toHaveBeenCalled();
  }, 60_000);

  it('cannot toggle a subscription through a different organization', async () => {
    const id = await legacySubscription();
    expect(await setEnabled(id, 12, true, 42)).toBeNull();
    expect(mocks.validate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  }, 60_000);
});
