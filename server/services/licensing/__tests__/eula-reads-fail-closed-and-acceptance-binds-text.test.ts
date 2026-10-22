/**
 * EULA reads fail closed, and an acceptance is bound to the text accepted.
 *
 * What eula-service did until 2026-10-15:
 *   - getActiveAgreements, getOutstandingAgreements and getAcceptanceHistory
 *     each ended in `catch { return []; }`. Any failure reading
 *     license_agreements / license_acceptances became "nothing outstanding",
 *     so hasAcceptedAll() answered TRUE. In production every read fails that
 *     way: ensureSchema's CREATE TABLE is refused to the runtime role before
 *     IF NOT EXISTS is consulted (scripts/ci/check-runtime-ddl.mjs).
 *   - recordAcceptance recorded a clickwrap acceptance of an agreement that has
 *     no text in the system (the seeded 'eula' and 'tos' rows carry neither a
 *     body nor a url), and buildAcceptanceHash covered user, org, key, version
 *     and time only, so an edit to the text left every acceptance hash as it
 *     was.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
const logAction = vi.hoisted(() => vi.fn());

vi.mock('../../../db.js', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: async () => ({ query: (...a: unknown[]) => query(...a), release: () => undefined }),
  },
}));
vi.mock('../../auditService.js', () => ({
  default: { logAction: vi.fn() },
  writeChainedAuditRow: (_client: unknown, event: unknown) => logAction(event),
}));

/** A fresh module per test: ensureSchema memoises its first success. */
async function load() {
  vi.resetModules();
  return import('../eula-service');
}

const EULA_ROW = {
  id: 'a-eula',
  agreement_key: 'eula',
  version: '2026.06',
  title: 'End-User License Agreement',
  summary: null,
  body: null,
  url: null,
  scope: 'user',
  required: true,
  status: 'active',
  effective_at: '2026-06-21T00:00:00.000Z',
};

interface Wiring {
  /** The statement matching this rejects with `error`. */
  failing?: RegExp;
  error?: string;
  acceptedByUser?: string[];
  acceptedByOrg?: string[];
  /** The row `SELECT … FROM license_agreements WHERE id = $1` returns. */
  agreement?: Record<string, unknown>;
}

function wire(w: Wiring = {}) {
  query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const s = String(sql);
    if (w.failing?.test(s)) throw new Error(w.error ?? 'connection terminated unexpectedly');
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
    if (/CREATE TABLE|WHERE NOT EXISTS \(SELECT 1 FROM license_agreements/.test(s)) return { rows: [] };
    if (/FROM license_agreements WHERE status = 'active'/.test(s)) return { rows: [EULA_ROW] };
    if (/acceptance\.user_id = \$1/.test(s)) {
      return { rows: (w.acceptedByUser ?? []).map((agreement_id) => ({ agreement_id })) };
    }
    if (/acceptance\.organization_id = \$1/.test(s)) {
      return { rows: (w.acceptedByOrg ?? []).map((agreement_id) => ({ agreement_id })) };
    }
    if (/FROM license_acceptances WHERE user_id = \$1 ORDER BY accepted_at DESC/.test(s)) return { rows: [] };
    if (/FROM license_agreements WHERE id = \$1/.test(s)) return { rows: w.agreement ? [w.agreement] : [] };
    if (/INSERT INTO license_acceptances/.test(s)) {
      return {
        rows: [
          {
            id: 'acc-1',
            agreement_id: params[0],
            agreement_key: params[1],
            agreement_version: params[2],
            user_id: params[3],
            organization_id: params[4],
            accepted_at: params[5],
            method: params[9],
          },
        ],
      };
    }
    throw new Error(`unexpected statement in test: ${s.slice(0, 80)}`);
  });
}

const insertCalls = () =>
  query.mock.calls.filter(([sql]) => /INSERT INTO license_acceptances/.test(String(sql)));
/** acceptance_hash is the ninth bind parameter of the INSERT. */
const insertedHash = (call: unknown[]) => (call[1] as unknown[])[8] as string;

beforeEach(() => {
  query.mockReset();
  logAction.mockReset();
  logAction.mockResolvedValue({ persisted: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('agreement reads fail closed', () => {
  it('getActiveAgreements rejects when license_agreements cannot be read (it answered [])', async () => {
    const eula = await load();
    wire({ failing: /FROM license_agreements WHERE status = 'active'/ });
    await expect(eula.getActiveAgreements()).rejects.toThrow('connection terminated');
  });

  it('getOutstandingAgreements rejects when the acceptances cannot be read (it answered "nothing outstanding")', async () => {
    const eula = await load();
    wire({ failing: /acceptance\.user_id = \$1/ });
    await expect(eula.getOutstandingAgreements(7, 3)).rejects.toThrow('connection terminated');
  });

  it('hasAcceptedAll rejects instead of answering true', async () => {
    const eula = await load();
    wire({ failing: /acceptance\.organization_id = \$1/ });
    await expect(eula.hasAcceptedAll(7, 3)).rejects.toThrow('connection terminated');
  });

  it('a schema bootstrap the runtime role is refused is a failed read, not an empty one', async () => {
    // The production shape: DDL is refused before any SELECT runs.
    const eula = await load();
    wire({ failing: /CREATE TABLE/, error: 'permission denied for schema public' });
    await expect(eula.getOutstandingAgreements(7, 3)).rejects.toThrow('permission denied');
  });

  it('getAcceptanceHistory rejects: an unreadable ledger is not an empty one', async () => {
    const eula = await load();
    wire({ failing: /ORDER BY accepted_at DESC/ });
    await expect(eula.getAcceptanceHistory(7)).rejects.toThrow('connection terminated');
  });

  it('a readable store still answers: an unaccepted required agreement is outstanding', async () => {
    const eula = await load();
    wire();
    const outstanding = await eula.getOutstandingAgreements(7, 3);
    expect(outstanding.map((a) => a.id)).toEqual(['a-eula']);
    expect(await eula.hasAcceptedAll(7, 3)).toBe(false);

    wire({ acceptedByUser: ['a-eula'] });
    expect(await eula.getOutstandingAgreements(7, 3)).toEqual([]);
    expect(await eula.hasAcceptedAll(7, 3)).toBe(true);
  });
});

describe('an acceptance is bound to the agreement text', () => {
  it('refuses an agreement with neither body nor url, and writes nothing', async () => {
    const eula = await load();
    wire({ agreement: { ...EULA_ROW, body: null, url: null } });
    await expect(
      eula.recordAcceptance({ agreementId: 'a-eula', userId: 7, organizationId: 3 }),
    ).rejects.toMatchObject({ code: 'AGREEMENT_TEXT_MISSING' });
    expect(insertCalls()).toHaveLength(0);
    expect(logAction).not.toHaveBeenCalled();
  });

  it('whitespace is not text', async () => {
    const eula = await load();
    wire({ agreement: { ...EULA_ROW, body: '  \n ', url: ' ' } });
    await expect(
      eula.recordAcceptance({ agreementId: 'a-eula', userId: 7, organizationId: 3 }),
    ).rejects.toMatchObject({ code: 'AGREEMENT_TEXT_MISSING' });
    expect(insertCalls()).toHaveLength(0);
  });

  it('the acceptance hash changes when the agreement text changes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T09:00:00.000Z'));
    const eula = await load();

    wire({ agreement: { ...EULA_ROW, body: 'You may use the platform.' } });
    await eula.recordAcceptance({ agreementId: 'a-eula', userId: 7, organizationId: 3 });
    wire({ agreement: { ...EULA_ROW, body: 'You may use the platform. We may audit you.' } });
    await eula.recordAcceptance({ agreementId: 'a-eula', userId: 7, organizationId: 3 });

    const [first, second] = insertCalls();
    // Same user, org, key, version and instant: only the text differs.
    expect(insertedHash(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(insertedHash(second)).not.toBe(insertedHash(first));
  });

  it('accepts an agreement whose text lives at a url, and the hash covers that url', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T09:00:00.000Z'));
    const eula = await load();

    wire({ agreement: { ...EULA_ROW, url: 'https://legal.example.test/eula/2026.06' } });
    const record = await eula.recordAcceptance({ agreementId: 'a-eula', userId: 7, organizationId: 3 });
    expect(record.agreementKey).toBe('eula');
    wire({ agreement: { ...EULA_ROW, url: 'https://legal.example.test/eula/2026.06-rev2' } });
    await eula.recordAcceptance({ agreementId: 'a-eula', userId: 7, organizationId: 3 });

    const [first, second] = insertCalls();
    expect(insertedHash(second)).not.toBe(insertedHash(first));
    expect(logAction).toHaveBeenCalledTimes(2);
  });
});
