/**
 * The doubles report-os-audit-recording.test.ts runs routes/report-os.ts over:
 * a drizzle-shaped facade answering from queues, one pooled connection that
 * records every statement with its parameters, and the ceremony's and the
 * audit writer's edges as spies. Created inside the suite's vi.hoisted so its
 * vi.mock factories can return them; reset before every case.
 */
import { vi } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { switchPinTerms } from '../../db/sessionScope';

/**
 * The statement a governed transaction issues immediately after BEGIN, exactly
 * as server/services/tenant/governed-tenant-context.ts builds it.
 *
 * Derived, not transcribed. Three suites each held their own copy of the
 * one-term form, and when the pin of the isolation switches was added to the
 * same statement (so a governed transaction cannot inherit a bypass) all three
 * went red on a string compare while the route was correct. What these suites
 * pin is the ORDER — BEGIN, the stamp, the domain writes, the chain row, COMMIT
 * — and the tenant the chain row carries, which each case asserts separately.
 * The stamp's own text is server/db/sessionScope's subject, not this harness's.
 *
 * A function, not a constant: `switchPinTerms` reads RLS_ENFORCE at call time,
 * and this module is imported before the env is loaded, so a constant would
 * freeze `app.rls_enforce` at '' and disagree with the route for any developer
 * whose .env sets it on. Called at assertion time, the expectation and the
 * route read the same environment.
 */
export const tenantStampSql = (): string =>
  `SELECT set_config('app.current_tenant_id', $1, true), ${switchPinTerms(true)}`;

export function createReportOsHarness() {
  const queued = { select: [] as unknown[][], insert: [] as unknown[][], update: [] as unknown[][] };
  const reads = { select: 0 };
  /** A drizzle-shaped chain whose await yields the next queued result. */
  const chain = (next: () => unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit', 'orderBy', 'innerJoin', 'set', 'returning', 'values']) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve().then(next).then(ok, ko);
    return c;
  };
  const db = {
    select: () => {
      reads.select += 1;
      return chain(() => queued.select.shift() ?? []);
    },
    insert: () => chain(() => queued.insert.shift() ?? []),
    update: () => chain(() => queued.update.shift() ?? []),
  };
  /** Every statement the route sends on the connection it checks out, in order. */
  const statements: string[] = [];
  /** The parameters each statement was sent with, in the same order. */
  const params: unknown[][] = [];
  /**
   * Rows the connection answers a statement with (default: none). `arrayMode` is
   * drizzle's: a query built by drizzle on this connection (routes/report-os.ts
   * onTransaction) asks for its rows as arrays in the table's column order.
   */
  const respond = { fn: (_sql: string, _arrayMode?: boolean): unknown[] => [] };
  /** Real company-profile reads on exports; no branding unless a case enables it. */
  const company = { name: 'Fixture organization', settings: {} as Record<string, unknown>, unavailable: false };
  const client = {
    query: async (q: string | { text: string; rowMode?: string }, values?: unknown[]) => {
      const sql = typeof q === 'string' ? q : q.text;
      statements.push(sql.replace(/\s+/g, ' ').trim());
      params.push(values ?? []);
      const rows = /SELECT name, settings FROM organizations WHERE id=\$1/.test(sql)
        ? company.unavailable ? [] : [{ name: company.name, settings: company.settings }]
        : respond.fn(sql, typeof q !== 'string' && q.rowMode === 'array');
      return { rows, rowCount: 1 };
    },
    release: () => statements.push('<released>'),
  };
  const pool = { connect: async () => client, query: async () => ({ rows: [] }) };
  return {
    queued, reads, db, pool, statements, params, respond, company,
    audit: vi.fn(), gate: vi.fn(), compute: vi.fn(),
    reauth: vi.fn(), ledger: vi.fn(), signature: vi.fn(),
    /** The signer's role as the membership row holds it (resolveSignerOrgRole, P1-44b). */
    memberRole: vi.fn(),
    limiterScopes: [] as string[],
  };
}

export type ReportOsHarness = ReturnType<typeof createReportOsHarness>;

/** Inspect a bound insert column without relying on the table's ordinal order. */
export function boundInsertColumn(sql: string, params: unknown[], column: string): unknown {
  const insert = sql.match(/\(([^)]+)\) values \(([^)]+)\)/);
  if (!insert) throw new Error('Expected a parameterized insert');
  const columns = insert[1].split(',').map(value => value.trim().replaceAll('"', ''));
  const binding = insert[2].split(',')[columns.indexOf(column)]?.trim();
  if (!binding?.startsWith('$')) throw new Error(`Expected a bound value for ${column}`);
  return params[Number(binding.slice(1)) - 1];
}

/** Empty queues and statement logs; every spy back to its passing default. */
export function resetReportOsHarness(h: ReportOsHarness) {
  h.queued.select.length = h.queued.insert.length = h.queued.update.length = 0;
  h.reads.select = 0;
  h.statements.length = h.params.length = 0;
  h.respond.fn = () => [];
  h.company.name = 'Fixture organization';
  h.company.settings = {};
  h.company.unavailable = false;
  h.audit.mockReset().mockImplementation(async () => {
    h.statements.push('<audit row>');
  });
  h.gate.mockReset().mockResolvedValue({ entitled: true, tier: 'standard' });
  h.compute.mockReset().mockResolvedValue({ providers: [], blockers: [], criticalBlockers: [], summary: {}, confidence: 90 });
  h.reauth.mockReset().mockResolvedValue({ ok: true });
  h.ledger.mockReset().mockImplementation(async () => {
    h.statements.push('<sign ledger>');
    return { actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'c'.repeat(64) };
  });
  h.signature.mockReset().mockImplementation(async () => {
    h.statements.push('<signature row>');
    return { id: 'sig_1', signedAt: new Date('2026-10-01T09:00:00Z') };
  });
  h.memberRole.mockReset().mockResolvedValue('admin');
  delete process.env.ESIGNATURE_SIGNING_ROLES;
}

/**
 * A row as the driver returns it for a drizzle RETURNING on the connection: an
 * array in the table's column order, timestamps in the driver's text form.
 */
export function driverRow(table: Parameters<typeof getTableColumns>[0], row: Record<string, unknown>): unknown[] {
  return Object.entries(getTableColumns(table)).map(([key, col]) => {
    const v = row[key];
    if (!(v instanceof Date)) return v ?? null;
    return (col as { withTimezone?: boolean }).withTimezone ? v.toISOString() : v.toISOString().replace('T', ' ').replace('Z', '');
  });
}
