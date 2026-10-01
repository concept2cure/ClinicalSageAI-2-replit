/**
 * The doubles report-os-audit-recording.test.ts runs routes/report-os.ts over:
 * a drizzle-shaped facade answering from queues, one pooled connection that
 * records every statement with its parameters, and the ceremony's and the
 * audit writer's edges as spies. Created inside the suite's vi.hoisted so its
 * vi.mock factories can return them; reset before every case.
 */
import { vi } from 'vitest';

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
  /** Rows the connection answers a statement with (default: none). */
  const respond = { fn: (_sql: string): unknown[] => [] };
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      statements.push(sql.replace(/\s+/g, ' ').trim());
      params.push(values ?? []);
      return { rows: respond.fn(sql), rowCount: 1 };
    },
    release: () => statements.push('<released>'),
  };
  const pool = { connect: async () => client, query: async () => ({ rows: [] }) };
  return {
    queued, reads, db, pool, statements, params, respond,
    audit: vi.fn(), gate: vi.fn(), compute: vi.fn(),
    reauth: vi.fn(), ledger: vi.fn(), signature: vi.fn(),
    limiterScopes: [] as string[],
  };
}

export type ReportOsHarness = ReturnType<typeof createReportOsHarness>;

/** Empty queues and statement logs; every spy back to its passing default. */
export function resetReportOsHarness(h: ReportOsHarness) {
  h.queued.select.length = h.queued.insert.length = h.queued.update.length = 0;
  h.reads.select = 0;
  h.statements.length = h.params.length = 0;
  h.respond.fn = () => [];
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
}
