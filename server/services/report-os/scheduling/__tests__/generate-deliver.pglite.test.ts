import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
const mocks = vi.hoisted(() => ({ validate: vi.fn(), compute: vi.fn(), persist: vi.fn(), audit: vi.fn() }));
vi.mock('../../../../db', () => ({ pool: {} }));
vi.mock('../configuration', () => ({ validateSubscriptionConfiguration: mocks.validate }));
vi.mock('../../compute-run', () => ({ computeRunForType: mocks.compute }));
vi.mock('../../persistence', () => ({ persistReportRun: mocks.persist }));
vi.mock('../../../auditService', () => ({ writeChainedAuditRow: mocks.audit }));
import { generateAndDeliver } from '../generate-deliver';
import type { ReportSubscriptionRow } from '@shared/schema/report-os';
let pg: PGlite;
let sub: ReportSubscriptionRow;
const now = new Date('2026-10-10T09:01:00Z');
beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE report_subscriptions (
      id int PRIMARY KEY, organization_id int, report_type_id text, scope_type text, scope_id text,
      schedule json, recipients json, channel text, format text, enabled bool,
      created_by int, client_workspace_id int, created_at timestamp, updated_at timestamp DEFAULT now(),
      last_run_at timestamp, next_run_at timestamp
    );
    CREATE TABLE mdx_notifications (
      id serial PRIMARY KEY, organization_id int, recipient_user_id int, recipient_role text,
      category text, severity text, title text, body text, resource_type text, resource_id text,
      action_url text, metadata json, expires_at timestamp
    );
    CREATE TABLE saved_run_probe (id int PRIMARY KEY);
    INSERT INTO report_subscriptions VALUES (10,11,'readiness.executive_digest','project','100',
      '{"cadence":"daily","hour":9}', '[]', 'platform','in_app',true,42,null,
      '2026-10-09 10:00:00','2026-10-09 10:00:00.123456',null,'2026-10-10 09:00:00');
  `);
  const selected = await pg.query<{ updated_at: Date }>('SELECT updated_at FROM report_subscriptions');
  sub = { id: 10, organizationId: 11, createdBy: 42, clientWorkspaceId: null, persona: null, reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '100', schedule: { cadence: 'daily', hour: 9 }, recipients: [], channel: 'platform', format: 'in_app', enabled: true, createdAt: new Date('2026-10-09T10:00:00Z'), updatedAt: new Date(selected.rows[0].updated_at), nextRunAt: new Date('2026-10-10T09:00:00Z'), lastRunAt: null } as ReportSubscriptionRow;
  mocks.validate.mockResolvedValue({ reportType: { label: 'Readiness' }, availability: { engine: 'readiness', computedScope: 'project' }, recipientUserIds: [42] });
  mocks.compute.mockResolvedValue({ computed: { providers: [], blockers: [], criticalBlockers: [], confidence: null, summary: {} } });
  mocks.audit.mockReset().mockResolvedValue(undefined);
  mocks.persist.mockImplementation(async (_rows, _actor, effect) => {
    await pg.exec('BEGIN');
    try {
      await pg.exec('INSERT INTO saved_run_probe VALUES (999)');
      await effect({ query: (sql: string, args: unknown[]) => pg.query(sql, args) }, { run: { id: 999 }, snapshot: { id: 1000 } });
      await pg.exec('COMMIT');
    } catch (error) { await pg.exec('ROLLBACK'); throw error; }
  });
}, 60_000);
afterEach(async () => { await pg.close(); });

describe('first scheduled firing against real PostgreSQL semantics', () => {
  it('handles a legacy microsecond updated_at and commits saved output, inbox row and cursor', async () => {
    // Reproduce why an exact JSDate comparison could never fire this first run.
    const exact = await pg.query<{ equal: boolean }>('SELECT updated_at = $1::timestamp AS equal FROM report_subscriptions', [sub.updatedAt]);
    expect(exact.rows[0].equal).toBe(false);
    await generateAndDeliver(sub, now);
    expect((await pg.query('SELECT * FROM saved_run_probe')).rows).toHaveLength(1);
    const notifications = await pg.query<{ resource_id: string; action_url: string }>('SELECT resource_id, action_url FROM mdx_notifications');
    expect(notifications.rows).toEqual([{ resource_id: '999', action_url: '/concept2cure/insights?reportRunId=999' }]);
    const rows = await pg.query<{ last_run_at: Date; next_run_at: Date }>('SELECT last_run_at, next_run_at FROM report_subscriptions');
    expect(new Date(rows.rows[0].last_run_at).toISOString()).toBe(now.toISOString());
    expect(new Date(rows.rows[0].next_run_at).toISOString()).toBe('2026-10-11T09:00:00.000Z');
  }, 60_000);
  it('rolls back the run, notification and cursor if delivery audit recording fails', async () => {
    mocks.audit.mockRejectedValueOnce(new Error('delivery audit unavailable'));
    await expect(generateAndDeliver(sub, now)).rejects.toThrow('delivery audit unavailable');
    expect((await pg.query('SELECT * FROM saved_run_probe')).rows).toHaveLength(0);
    expect((await pg.query('SELECT * FROM mdx_notifications')).rows).toHaveLength(0);
    const cursor = await pg.query<{ last_run_at: Date | null; next_run_at: Date }>('SELECT last_run_at, next_run_at FROM report_subscriptions');
    expect(cursor.rows[0].last_run_at).toBeNull();
    expect(new Date(cursor.rows[0].next_run_at).toISOString()).toBe('2026-10-10T09:00:00.000Z');
  }, 60_000);
  it('refuses changed schedule content even if its updated_at has the same millisecond', async () => {
    await pg.exec(`UPDATE report_subscriptions SET schedule = '{"cadence":"daily","hour":10}'`);
    await expect(generateAndDeliver(sub, now)).rejects.toThrow('subscription changed');
    expect((await pg.query('SELECT * FROM mdx_notifications')).rows).toHaveLength(0);
    expect((await pg.query('SELECT * FROM saved_run_probe')).rows).toHaveLength(0);
  }, 60_000);
});
