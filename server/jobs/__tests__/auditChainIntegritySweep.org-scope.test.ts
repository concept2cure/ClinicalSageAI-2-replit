/**
 * The audit integrity sweep verifies each organisation's chain in that
 * organisation's own scope (P-72 slice 1b;
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/).
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * runAuditChainIntegrityCheck took one pooled connection in the system scope
 * and sent every statement outside a transaction. The pool applies a scope only
 * when a transaction begins, so the connection carried no tenant:
 * connectionIsTenantScoped said "scoped to one tenant" and the sweep answered
 * ok:false over 0 rows every day on a production-shaped database, with the
 * platform arm or without it.
 *
 * ── What is asserted ─────────────────────────────────────────────────────────
 * - Every statement is inside a transaction (BEGIN first, on every connection).
 * - Each organisation's audit_logs chain and seals, and its audit_events rows
 *   and seals, are read in its own scope (its tenant id, no role), filtered to
 *   it; only the organisation list and the stores with no tenant key are read
 *   in the infrastructure scope.
 * - A break, a refused legacy walk or an empty store is reported per store
 *   with the organisation named; a store no organisation has a row in is
 *   unverifiable, never ok.
 * - The anchor is verified and written per organisation, in its own scope.
 * The production-shaped proof (real policies, a non-superuser owner, with and
 * without the platform arm) is the slice's probe, filed with its evidence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  verifyAuditChain: vi.fn(),
  verifyAuditChainSeals: vi.fn(),
  verifyAuditEventsChainSeals: vi.fn(),
  verifyAuditChainAnchor: vi.fn(),
  writeAuditChainAnchor: vi.fn(),
  reportSecurityAlert: vi.fn(),
  /** Every statement and verifier call, with its connection and the scope it ran in. */
  events: [] as Array<{ what: string; conn: number; tenantId: string | null; role: string | null; params?: unknown[] }>,
  orgs: [7, 8] as number[],
  auditEvents: new Map<number, unknown[]>(),
  connections: 0,
  released: 0,
}));

vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));
vi.mock('../../db.js', async () => {
  const { getTenantScope } = await import('../../db/tenantStore');
  const here = () => ({ tenantId: getTenantScope()?.tenantId ?? null, role: getTenantScope()?.role ?? null });
  return {
    pool: {
      connect: vi.fn(async () => {
        const conn = ++m.connections;
        return {
          query: vi.fn(async (sql: string, params: unknown[] = []) => {
            m.events.push({ what: sql.trim().split(/\s+/).slice(0, 4).join(' '), conn, ...here(), params });
            if (/^(BEGIN|ROLLBACK)\b/.test(sql)) return { rows: [] };
            if (sql.includes('FROM public.organizations')) return { rows: m.orgs.map((id) => ({ id })) };
            if (sql.includes('to_regclass')) return { rows: [{ present: true }] };
            if (sql.includes('FROM audit_events')) return { rows: m.auditEvents.get(Number(params[0])) ?? [] };
            if (sql.includes('FROM audit.tamper_proof_log')) return { rows: [] };
            throw new Error(`unexpected query in test: ${sql}`);
          }),
          release: vi.fn(() => { m.released += 1; }),
          conn,
        };
      }),
    },
  };
});
vi.mock('../../services/audit/chain.js', async () => {
  const { getTenantScope } = await import('../../db/tenantStore');
  const record = (what: string, c: { conn?: number }, opts?: unknown) =>
    m.events.push({ what, conn: c.conn ?? 0, tenantId: getTenantScope()?.tenantId ?? null, role: getTenantScope()?.role ?? null, params: [opts] });
  return {
    verifyAuditChain: (c: { conn?: number }, opts?: unknown) => (record('verifyAuditChain', c, opts), m.verifyAuditChain(c, opts)),
    verifyAuditChainSeals: (c: { conn?: number }, opts?: unknown) => (record('verifyAuditChainSeals', c, opts), m.verifyAuditChainSeals(c, opts)),
    verifyAuditEventsChainSeals: (c: { conn?: number }, opts?: unknown) =>
      (record('verifyAuditEventsChainSeals', c, opts), m.verifyAuditEventsChainSeals(c, opts)),
  };
});
vi.mock('../../lib/tamper-proof-audit.js', () => ({ verifyTamperProofLogRows: () => ({ valid: true }) }));
vi.mock('../../services/audit/audit-immutability-triggers.js', () => ({
  assertAuditImmutabilityTriggers: async () => ({ ok: true, expected: 8, present: 8, missing: [], disabled: [], tablesAbsent: [] }),
}));
vi.mock('../../services/security-alerts.js', () => ({ reportSecurityAlert: m.reportSecurityAlert }));
vi.mock('../../services/audit/chain-anchor.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  verifyAuditChainAnchor: m.verifyAuditChainAnchor,
  writeAuditChainAnchor: m.writeAuditChainAnchor,
}));

import { runAuditChainIntegrityCheck } from '../auditChainIntegritySweep';

const RUN_AT = Date.parse('2026-10-30T02:00:00.000Z');
const anchorOk = {
  status: 'ok', anchorKey: 'anchors/audit-chain/2026/10/29/a.json', anchoredAt: '2026-10-29T02:00:00.000Z',
  organizations: 2, breaks: [], archived: [], reason: 'every anchored head is present and unchanged',
};
const walk = (rows: number) => ({ ok: true, rowsChecked: rows, tenants: rows ? 1 : 0, legacyRows: 0, sequencedRows: rows });
const seals = (verified: number) => ({ valid: true, brokenAt: null, verified, unsealed: 0, unsealedAfterSealed: 0, firstUnsealedAfterSealed: null });
const event = (org: number, seq: number, hash: string, prev: string | null) =>
  ({ id: org * 100 + seq, organization_id: org, sequence_number: seq, record_hash: hash, previous_hash: prev });
const store = (r: Awaited<ReturnType<typeof runAuditChainIntegrityCheck>>, name: string) => r.stores.find((s) => s.store === name);
const tenantOf = (opts: unknown) => (opts as { tenantId?: number } | undefined)?.tenantId;
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(RUN_AT);
  process.env.AUDIT_HMAC_KEY = 'k'.repeat(32);
  process.env.AUDIT_HMAC_SECRET = 's'.repeat(32);
  m.events = [];
  m.orgs = [7, 8];
  m.connections = 0;
  m.released = 0;
  m.auditEvents = new Map([[7, [event(7, 1, 'a1', null), event(7, 2, 'a2', 'a1')]], [8, [event(8, 1, 'b1', null)]]]);
  m.verifyAuditChain.mockReset().mockImplementation(async (_c: unknown, opts: unknown) => walk(tenantOf(opts) === 7 ? 3 : 2));
  m.verifyAuditChainSeals.mockReset().mockImplementation(async (_c: unknown, opts: unknown) => seals(tenantOf(opts) === 7 ? 3 : 2));
  m.verifyAuditEventsChainSeals.mockReset().mockResolvedValue(seals(1));
  m.verifyAuditChainAnchor.mockReset().mockResolvedValue(anchorOk);
  m.writeAuditChainAnchor.mockReset().mockResolvedValue({ key: 'anchors/audit-chain/2026/10/30/b.json', organizations: 2 });
  m.reportSecurityAlert.mockReset();
  vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
});

describe('each organisation is verified in its own scope', () => {
  it('every statement is inside a transaction: each connection begins before it reads, and every connection goes back', async () => {
    await runAuditChainIntegrityCheck({ anchorStore: null });
    const byConn = new Map<number, string[]>();
    for (const e of m.events.filter((x) => x.conn > 0)) byConn.set(e.conn, [...(byConn.get(e.conn) ?? []), e.what]);
    expect(byConn.size).toBeGreaterThanOrEqual(4); // the list, two organisations, the infrastructure snapshot
    for (const statements of byConn.values()) {
      expect(statements[0]).toMatch(/^BEGIN ISOLATION LEVEL REPEATABLE/);
      expect(statements.at(-1)).toBe('ROLLBACK');
    }
    expect(m.released).toBe(m.connections);
  });

  it('reads each organisation\'s audit_logs chain and seals in its tenant scope, with no role, for that organisation only', async () => {
    const result = await runAuditChainIntegrityCheck({ anchorStore: null });
    for (const what of ['verifyAuditChain', 'verifyAuditChainSeals']) {
      expect(m.events.filter((e) => e.what === what).map((e) => [e.tenantId, e.role, tenantOf(e.params?.[0])])).toEqual([
        ['7', null, 7],
        ['8', null, 8],
      ]);
    }
    expect(result.rowsChecked).toBe(5);
    expect(result.organizations).toBe(2);
    expect(store(result, 'audit_logs.chain')).toMatchObject({ status: 'ok', rowsChecked: 5 });
    expect(store(result, 'audit_logs.seals')).toMatchObject({ status: 'ok', rowsChecked: 5 });
  });

  it('reads each organisation\'s audit_events rows and seals in its own scope, filtered to it', async () => {
    const result = await runAuditChainIntegrityCheck({ anchorStore: null });
    const reads = m.events.filter((e) => e.what.startsWith('SELECT id, organization_id,'));
    expect(reads.map((e) => [e.tenantId, e.role, e.params])).toEqual([['7', null, [7]], ['8', null, [8]]]);
    expect(m.events.filter((e) => e.what === 'verifyAuditEventsChainSeals').map((e) => [e.tenantId, e.params?.[0]])).toEqual([
      ['7', { organizationId: 7 }],
      ['8', { organizationId: 8 }],
    ]);
    expect(store(result, 'audit_events.linkage')).toMatchObject({ status: 'ok', rowsChecked: 3 });
  });

  it('reads only the organisation list and the stores with no tenant key in the infrastructure scope', async () => {
    await runAuditChainIntegrityCheck({ anchorStore: null });
    const system = m.events.filter((e) => e.tenantId === '0');
    expect(system.every((e) => /^(BEGIN|ROLLBACK|SELECT id FROM public\.organizations|SELECT to_regclass|SELECT \* FROM audit\.tamper_proof_log)/.test(e.what))).toBe(true);
    expect(m.events.some((e) => e.tenantId === null && e.conn > 0)).toBe(false);
  });
});

describe('what a per-organisation verdict says', () => {
  it('a break in one organisation\'s chain is broken, names that organisation, and still counts the other\'s rows', async () => {
    m.verifyAuditChain.mockImplementation(async (_c: unknown, opts: unknown) =>
      tenantOf(opts) === 8
        ? { ...walk(2), ok: false, brokenAt: { id: 'row-b2', expected: 'e', stored: 's', tenantId: 8 } }
        : walk(3));
    const result = await runAuditChainIntegrityCheck({ anchorStore: null });
    expect(store(result, 'audit_logs.chain')).toMatchObject({ status: 'broken', firstFailure: 'row-b2', organizationId: 8, rowsChecked: 5 });
    expect(result.brokenAt).toMatchObject({ id: 'row-b2' });
    expect(result.failures).toContain('audit_logs.chain');
    expect(m.reportSecurityAlert).toHaveBeenCalledOnce();
  });

  it('legacy rows the walk refuses in an organisation\'s scope are unverifiable for it, never ok and not an incident', async () => {
    m.verifyAuditChain.mockImplementation(async (_c: unknown, opts: unknown) => {
      if (tenantOf(opts) === 7) {
        throw Object.assign(new Error('audit chain: tenant 7 has legacy (unsequenced) rows that may link to other tenants\' rows'), {
          code: 'AUDIT_CHAIN_PARTIAL_VIEW',
        });
      }
      return walk(2);
    });
    const result = await runAuditChainIntegrityCheck({ anchorStore: null });
    expect(store(result, 'audit_logs.chain')).toMatchObject({ status: 'unverifiable', organizationId: 7 });
    expect(store(result, 'audit_logs.chain')?.reason).toMatch(/tenant 7 has legacy/);
    expect(result.ok).toBe(false);
    expect(result.failures).not.toContain('audit_logs.chain');
  });

  it('a store in which no organisation has a row verified nothing: unverifiable, never ok', async () => {
    m.verifyAuditChain.mockResolvedValue(walk(0));
    m.verifyAuditChainSeals.mockResolvedValue(seals(0));
    m.auditEvents = new Map();
    const result = await runAuditChainIntegrityCheck({ anchorStore: null });
    expect(store(result, 'audit_logs.chain')).toMatchObject({ status: 'unverifiable', rowsChecked: 0 });
    expect(store(result, 'audit_logs.chain')?.reason).toMatch(/no organisation has a chained audit_logs row/);
    expect(store(result, 'audit_logs.seals')).toMatchObject({ status: 'unverifiable' });
    expect(store(result, 'audit_events.linkage')).toMatchObject({ status: 'unverifiable', reason: 'no entries: there is no chain to verify' });
    expect(result.ok).toBe(false);
  });

  it('an organisation with no rows neither passes nor fails a store the others verify', async () => {
    m.orgs = [7, 8, 9];
    m.verifyAuditChain.mockImplementation(async (_c: unknown, opts: unknown) => walk(tenantOf(opts) === 9 ? 0 : 2));
    const result = await runAuditChainIntegrityCheck({ anchorStore: null });
    expect(store(result, 'audit_logs.chain')).toMatchObject({ status: 'ok', rowsChecked: 4 });
    expect(store(result, 'audit_events.linkage')).toMatchObject({ status: 'ok', rowsChecked: 3 });
  });
});

describe('the anchor is verified and written per organisation', () => {
  const memoryStore = { location: 'memory://test', put: vi.fn(), latest: vi.fn() };

  it('passes a scope opener that runs in the named organisation\'s own scope, inside a transaction', async () => {
    let seen: Array<{ tenantId: string | null; role: string | null; first: string }> = [];
    m.verifyAuditChainAnchor.mockImplementation(async (_c: unknown, _s: unknown, _now: unknown, opts: any) => {
      expect(typeof opts?.inOrganizationScope).toBe('function');
      const before = m.events.length;
      await opts.inOrganizationScope(8, async (c: { query: (s: string) => Promise<unknown> }) => {
        await c.query('SELECT to_regclass(\'probe\')');
      });
      const mine = m.events.slice(before);
      seen = mine.filter((e) => e.what.startsWith('SELECT to_regclass')).map((e) => ({ tenantId: e.tenantId, role: e.role, first: mine[0].what }));
      return anchorOk;
    });
    const result = await runAuditChainIntegrityCheck({ anchorStore: memoryStore as never });
    expect(seen).toEqual([{ tenantId: '8', role: null, first: 'BEGIN ISOLATION LEVEL REPEATABLE' }]);
    expect(store(result, 'audit_logs.anchor')).toMatchObject({ status: 'ok' });
  });

  it('writes the next anchor from every organisation\'s head, each read in its own scope', async () => {
    const result = await runAuditChainIntegrityCheck({ anchorStore: memoryStore as never });
    expect(m.writeAuditChainAnchor).toHaveBeenCalledOnce();
    const opts = m.writeAuditChainAnchor.mock.calls[0][3];
    expect(opts.organizations).toEqual([7, 8]);
    expect(typeof opts.inOrganizationScope).toBe('function');
    expect(result.anchorWrite).toMatchObject({ written: true, organizations: 2 });
  });
});
