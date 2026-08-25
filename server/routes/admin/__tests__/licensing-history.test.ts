/**
 * Licensing decision history — the read side of licensing governance.
 *
 * Three properties carry this suite, and each is asserted by making the
 * opposite behaviour fail:
 *
 *   1. A FAILED READ IS NEVER AN EMPTY HISTORY. "No licensing decision was ever
 *      made" and "we could not read the record" are opposite facts, and an
 *      audit view that renders the second as the first produces a confident
 *      wrong answer to a compliance question.
 *   2. A TRUNCATED PAGE SAYS SO. The page reports the size of the whole
 *      filtered set and whether more is withheld, from the same statement that
 *      produced the rows.
 *   3. NO GREEN TICK IS INVENTED. A row reports `chain: 'verified'` only when
 *      the canonical verifier actually re-derived it and matched, and
 *      `seal: 'verified'` only when the seal was checked. Everything else says
 *      what did not happen.
 *
 * A fourth property is structural: the row filter is on the PRESENCE of a
 * governed action, not on a list of the ones this file knows, so an action
 * added after it was written still appears.
 *
 * DB and the audit-integrity service are mocked so these exercise the real
 * router. The platform-admin gate is inherited from the mount in
 * ./master-admin and is deliberately not re-implemented here.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const verifyMock = vi.fn();

vi.mock('../../../db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));
vi.mock('../../../services/audit/audit-integrity-service', () => ({
  verifyAuditIntegrity: (...args: unknown[]) => verifyMock(...args),
}));

// Imported after the mocks (vi.mock is hoisted).
import router, {
  clampLimit,
  clampOffset,
  clearIntegrityCache,
  rowIntegrity,
  toDetails,
  NON_LICENSING,
} from '../licensing-history';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/master', router);
  return app;
}

/** One audit row as the driver hands it back. */
function auditRow(over: Record<string, unknown> = {}) {
  return {
    id: 'aud-1',
    occurred_at: '2026-08-20T10:00:00.000Z',
    created_at: '2026-08-20T10:00:00.000Z',
    tenant_id: 7,
    user_id: 3,
    table_name: 'module_packaging',
    record_id: 'cmc',
    new_values: {
      masterAdminAction: 'module.repackage',
      moduleId: 'cmc',
      previousTier: 'standard',
      minTier: 'professional',
      reason: 'moved with the Q3 packaging review',
    },
    sha256_chain: 'a'.repeat(64),
    hmac_seal: 'seal-1',
    actor_email: 'owner@platform.io',
    organization_name: 'Bright Biosciences',
    module_name: 'CMC and quality',
    total_matching: '1',
    ...over,
  };
}

const CHAIN_OK = {
  chain: { ok: true, rowsChecked: 12 },
  seals: { checked: true, valid: true, brokenAt: null },
  ok: true,
  unverifiable: false,
};

/**
 * Route every statement the router issues. `history` returns the page; the
 * oversize probe answers "small enough to walk"; the break lookup answers with
 * whatever the test supplies.
 */
function wireQuery(opts: {
  history?: () => Promise<{ rows: unknown[] }>;
  oversize?: unknown[];
  breakRow?: unknown[];
}) {
  queryMock.mockImplementation(async (sql: string) => {
    if (/SELECT 1 FROM audit_logs OFFSET/.test(sql)) return { rows: opts.oversize ?? [] };
    if (/SELECT id, occurred_at FROM audit_logs WHERE id/.test(sql)) {
      return { rows: opts.breakRow ?? [] };
    }
    if (/FROM audit_logs a/.test(sql)) {
      return opts.history ? opts.history() : { rows: [auditRow()] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  queryMock.mockReset();
  verifyMock.mockReset();
  verifyMock.mockResolvedValue(CHAIN_OK);
  clearIntegrityCache();
});

describe('pure helpers', () => {
  it('clamps the page size into range and falls back on nonsense', () => {
    expect(clampLimit(undefined)).toBe(25);
    expect(clampLimit('10')).toBe(10);
    expect(clampLimit('5000')).toBe(100);
    expect(clampLimit('0')).toBe(25);
    expect(clampLimit('-4')).toBe(25);
    expect(clampLimit('abc')).toBe(25);
  });

  it('clamps the offset to a non-negative integer', () => {
    expect(clampOffset(undefined)).toBe(0);
    expect(clampOffset('40')).toBe(40);
    expect(clampOffset('-1')).toBe(0);
    expect(clampOffset('x')).toBe(0);
  });

  it('reads a detail payload as an object, and reports one it cannot', () => {
    expect(toDetails({ a: 1 })).toEqual({ a: 1 });
    expect(toDetails('{"a":1}')).toEqual({ a: 1 });
    // Null, not `{}`: the caller must be able to tell "nothing recorded" from
    // "we could not read what was recorded".
    expect(toDetails('not json')).toBeNull();
    expect(toDetails('[1,2]')).toBeNull();
    expect(toDetails(null)).toBeNull();
    expect(toDetails(42)).toBeNull();
  });
});

describe('GET /licensing/history — the decisions, newest first', () => {
  it('returns what changed, on which workspace and module, by whom, and why', async () => {
    wireQuery({});
    const res = await request(makeApp()).get('/api/admin/master/licensing/history');

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    const e = res.body.entries[0];
    expect(e.action).toBe('module.repackage');
    expect(e.reason).toBe('moved with the Q3 packaging review');
    expect(e.actorEmail).toBe('owner@platform.io');
    expect(e.organizationName).toBe('Bright Biosciences');
    expect(e.moduleId).toBe('cmc');
    expect(e.moduleName).toBe('CMC and quality');
    expect(e.occurredAt).toBe('2026-08-20T10:00:00.000Z');
    // The recorded fields survive so the row says WHAT changed, without the
    // two that are already their own columns.
    expect(e.changed).toEqual({ moduleId: 'cmc', previousTier: 'standard', minTier: 'professional' });
    expect(e.readable).toBe(true);
  });

  it('orders newest first and excludes the two non-licensing actions', async () => {
    wireQuery({});
    await request(makeApp()).get('/api/admin/master/licensing/history');

    const call = queryMock.mock.calls.find((c) => /FROM audit_logs a/.test(c[0] as string));
    expect(call).toBeTruthy();
    expect(call![0]).toMatch(/ORDER BY a\.occurred_at DESC, a\.id DESC/);
    // Selection is on PRESENCE of the governed action, minus a short exclusion
    // list — never on a list of the actions this file happens to know.
    expect(call![0]).toMatch(/masterAdminAction' IS NOT NULL/);
    expect((call![1] as unknown[])[0]).toEqual([...NON_LICENSING]);
  });

  it('renders an action it has never heard of, rather than dropping it', async () => {
    // The vocabulary is open: an enforcement-mode change, a trial grant and an
    // access-request approval are being added in parallel. A row this file
    // cannot name must still carry its operator, time, reason and fields.
    wireQuery({
      history: async () => ({
        rows: [
          auditRow({
            id: 'aud-new',
            table_name: 'access_request',
            record_id: '99',
            new_values: {
              masterAdminAction: 'access_request.approve',
              requestId: 99,
              grantedModules: ['ectd'],
              reason: 'approved after the security review',
            },
            module_name: null,
          }),
        ],
      }),
    });

    const res = await request(makeApp()).get('/api/admin/master/licensing/history');
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].action).toBe('access_request.approve');
    expect(res.body.entries[0].reason).toBe('approved after the security review');
    expect(res.body.entries[0].changed).toEqual({ requestId: 99, grantedModules: ['ectd'] });
  });

  it('passes the workspace and module filters through to the read', async () => {
    wireQuery({});
    await request(makeApp())
      .get('/api/admin/master/licensing/history')
      .query({ organizationId: '7', moduleId: 'cmc' });

    const call = queryMock.mock.calls.find((c) => /FROM audit_logs a/.test(c[0] as string));
    const params = call![1] as unknown[];
    expect(params[1]).toBe(7);
    expect(params[2]).toBe('cmc');
  });
});

describe('honest about completeness', () => {
  it('says a page is truncated, with the size of the whole filtered set', async () => {
    // THE MUTATION THIS CATCHES: presenting a page as the complete history.
    // 3 rows returned out of 40 — anyone reading this page is looking at 7% of
    // the record and must be told so.
    wireQuery({
      history: async () => ({
        rows: [
          auditRow({ id: 'a1', total_matching: '40' }),
          auditRow({ id: 'a2', total_matching: '40' }),
          auditRow({ id: 'a3', total_matching: '40' }),
        ],
      }),
    });

    const res = await request(makeApp())
      .get('/api/admin/master/licensing/history')
      .query({ limit: '3' });

    expect(res.body.page.returned).toBe(3);
    expect(res.body.page.total).toBe(40);
    expect(res.body.page.hasMore).toBe(true);
  });

  it('says a page is complete when it is', async () => {
    wireQuery({});
    const res = await request(makeApp()).get('/api/admin/master/licensing/history');
    expect(res.body.page.total).toBe(1);
    expect(res.body.page.hasMore).toBe(false);
  });

  it('returns a row whose recorded detail cannot be read, flagged and counted', async () => {
    // Dropping it would understate the history by exactly one decision and
    // leave nothing on screen to say so.
    wireQuery({
      history: async () => ({
        rows: [auditRow({ id: 'bad', new_values: 'not json at all', total_matching: '1' })],
      }),
    });

    const res = await request(makeApp()).get('/api/admin/master/licensing/history');
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].readable).toBe(false);
    expect(res.body.entries[0].action).toBeNull();
    expect(res.body.entries[0].occurredAt).toBe('2026-08-20T10:00:00.000Z');
    expect(res.body.unreadable).toBe(1);
  });

  it('a failed read is a 500 — never an empty history', async () => {
    // THE MUTATION THIS CATCHES: `return res.json({ entries: [] })` in the
    // catch. An empty list renders as "this platform has never made a
    // licensing decision", which is the opposite of what happened.
    queryMock.mockImplementation(async (sql: string) => {
      if (/FROM audit_logs a/.test(sql)) throw new Error('read failed');
      return { rows: [] };
    });

    const res = await request(makeApp()).get('/api/admin/master/licensing/history');
    expect(res.status).toBe(500);
    expect(res.body.entries).toBeUndefined();
    expect(res.body.error).toBeTruthy();
    // The failure is not described to the operator in the store's own words.
    expect(JSON.stringify(res.body)).not.toContain('read failed');
  });
});

describe('honest about integrity — per row', () => {
  it('reports a row verified only when the chain AND its seal were checked', async () => {
    wireQuery({});
    const res = await request(makeApp()).get('/api/admin/master/licensing/history');
    expect(res.body.entries[0].integrity).toEqual({ chain: 'verified', seal: 'verified' });
    expect(res.body.integrity.status).toBe('verified');
    expect(res.body.integrity.reason).toBe('chain-and-seals-verified');
    expect(res.body.integrity.rowsChecked).toBe(12);
  });

  it('does not call an unchecked seal verified when sealing is not configured', async () => {
    verifyMock.mockResolvedValue({
      chain: { ok: true, rowsChecked: 12 },
      seals: { checked: false, reason: 'seal key unavailable' },
      ok: false,
      unverifiable: true,
    });
    wireQuery({});

    const res = await request(makeApp()).get('/api/admin/master/licensing/history');
    expect(res.body.entries[0].integrity).toEqual({ chain: 'verified', seal: 'unverified' });
    expect(res.body.integrity.reason).toBe('chain-verified-seals-not-configured');
    // The service's own sentence names a configuration key. It must not travel.
    expect(JSON.stringify(res.body)).not.toContain('seal key unavailable');
  });

  it('reports a row that was never committed to the chain as exactly that', async () => {
    wireQuery({
      history: async () => ({ rows: [auditRow({ sha256_chain: null, hmac_seal: null })] }),
    });
    const res = await request(makeApp()).get('/api/admin/master/licensing/history');
    expect(res.body.entries[0].integrity).toEqual({ chain: 'not-recorded', seal: 'not-sealed' });
  });

  it('checks nothing, and claims nothing, when verification could not run', async () => {
    verifyMock.mockRejectedValue(new Error('verification exploded'));
    wireQuery({});

    const res = await request(makeApp()).get('/api/admin/master/licensing/history');
    // The page still renders — the READ succeeded. What it must not do is
    // report a verification that did not happen.
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].integrity).toEqual({ chain: 'not-checked', seal: 'unverified' });
    expect(res.body.integrity.status).toBe('unavailable');
    expect(res.body.integrity.reason).toBe('check-failed');
    expect(JSON.stringify(res.body)).not.toContain('verification exploded');
  });

  it('does not walk a store larger than it verifies in one pass, and says so', async () => {
    wireQuery({ oversize: [{ '?column?': 1 }] });
    const res = await request(makeApp()).get('/api/admin/master/licensing/history');
    expect(res.body.integrity.status).toBe('unavailable');
    expect(res.body.integrity.reason).toBe('store-too-large');
    expect(res.body.entries[0].integrity.chain).toBe('not-checked');
    expect(verifyMock).not.toHaveBeenCalled();
  });

  it('places a break: rows before it stay verified, the break and after do not', async () => {
    verifyMock.mockResolvedValue({
      chain: { ok: false, rowsChecked: 5, brokenAt: { id: 'mid', expected: 'x', stored: 'y' } },
      seals: { checked: true, valid: true, brokenAt: null },
      ok: false,
      unverifiable: false,
    });
    wireQuery({
      breakRow: [{ id: 'mid', occurred_at: '2026-08-20T10:00:00.000Z' }],
      history: async () => ({
        rows: [
          auditRow({ id: 'late', occurred_at: '2026-08-21T10:00:00.000Z', total_matching: '3' }),
          auditRow({ id: 'mid', total_matching: '3' }),
          auditRow({ id: 'early', occurred_at: '2026-08-19T10:00:00.000Z', total_matching: '3' }),
        ],
      }),
    });

    const res = await request(makeApp()).get('/api/admin/master/licensing/history');
    const byId = Object.fromEntries(
      res.body.entries.map((e: any) => [e.id, e.integrity.chain]),
    );
    expect(byId).toEqual({ late: 'after-break', mid: 'broken', early: 'verified' });
    expect(res.body.integrity.status).toBe('broken');
  });
});

describe('rowIntegrity — the pure rule', () => {
  const pos = { id: 'r', occurredAt: 100 };

  it('claims nothing when no verification ran', () => {
    expect(
      rowIntegrity(
        { sha256Chain: 'h', hmacSeal: 's', position: pos },
        { chainOk: null, breakAt: null, sealsValid: null },
      ),
    ).toEqual({ chain: 'not-checked', seal: 'unverified' });
  });

  it('falls back to not-checked when a break cannot be placed', () => {
    // A break was found but its position is unknown, so nothing can be said
    // about where this row sits relative to it — including that it is fine.
    expect(
      rowIntegrity(
        { sha256Chain: 'h', hmacSeal: null, position: pos },
        { chainOk: false, breakAt: null, sealsValid: true },
      ),
    ).toEqual({ chain: 'not-checked', seal: 'not-sealed' });
  });

  it('breaks the tie on id when two rows share a timestamp', () => {
    const breakAt = { id: 'b', occurredAt: 100 };
    expect(
      rowIntegrity(
        { sha256Chain: 'h', hmacSeal: null, position: { id: 'a', occurredAt: 100 } },
        { chainOk: false, breakAt, sealsValid: null },
      ).chain,
    ).toBe('verified');
    expect(
      rowIntegrity(
        { sha256Chain: 'h', hmacSeal: null, position: { id: 'c', occurredAt: 100 } },
        { chainOk: false, breakAt, sealsValid: null },
      ).chain,
    ).toBe('after-break');
  });
});
