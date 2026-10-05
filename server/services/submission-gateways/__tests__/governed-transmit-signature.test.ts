/**
 * The governed transmit's `sign` is an electronic signature, not only a ledger row.
 *
 * Freeze and dispatch always wrote the electronic_signatures row (printed name,
 * declared meaning, authentication method, content binding). Transmit — the one
 * irreversible act — recorded a governed-action ledger entry whose meaning was
 * the constant 'submission', a meaning nobody declared, and wrote no signature
 * row at all. This test runs the real executeGovernedTransmit against a fake
 * pool and a stubbed gateway and pins:
 *
 *   - one INSERT INTO electronic_signatures inside the ledger transaction
 *     (BEGIN … COMMIT), carrying the signer's declared meaning, the factors the
 *     caller actually verified, and the bundle sha256 as the §11.70 binding;
 *   - a failed signature write rolls the transaction back and is reported as
 *     ledgerWriteFailed (the agency already accepted the bytes; that is never
 *     hidden).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queries, connectMock, transmitMock } = vi.hoisted(() => {
  const queries: Array<{ sql: string; args: unknown[] }> = [];
  const transmitMock = vi.fn();
  const connectMock = vi.fn();
  return { queries, connectMock, transmitMock };
});

vi.mock('../../../db', () => ({ pool: { connect: connectMock, query: vi.fn() } }));
// This suite tests the signature record, not separation of duties. Its pool is
// a bare stub, so the package-author lookup assertTransmitterIndependent runs
// would fail and refuse every transmit. The signer is modelled as independent
// of the package here; requiresIndependence stays real. Independence itself is
// tested in governed-transmit-independence.test.ts.
vi.mock('../../governance/separation-of-duties', async (orig) => ({
  ...(await orig<typeof import('../../governance/separation-of-duties')>()),
  assertSignerIsNotAuthor: vi.fn().mockResolvedValue({ checked: true, reason: 'test: signer independent of the package' }),
}));
vi.mock('../index', () => ({ getGateway: () => ({ transmit: transmitMock }) }));
vi.mock('../fda-esg', () => ({ findActiveTransmittal: vi.fn().mockResolvedValue(null) }));
vi.mock('../../submission-bundle-storage', () => ({ getBundle: vi.fn() }));
vi.mock('fs', () => ({ promises: { stat: vi.fn().mockResolvedValue({ size: 1234 }), mkdir: vi.fn(), writeFile: vi.fn() } }));

import { executeGovernedTransmit } from '../governed-transmit';

const SIGNER_SQL = /FROM users u/;
const SIG_INSERT = /INSERT INTO electronic_signatures/;

function fakeClient(opts: { failSignature?: boolean } = {}) {
  return {
    query: vi.fn(async (sql: string, args: unknown[] = []) => {
      queries.push({ sql, args });
      if (SIGNER_SQL.test(sql)) return { rows: [{ name: 'Dr Ada Lovelace', email: 'ada@sponsor.example', title: 'RA Lead' }] };
      if (SIG_INSERT.test(sql)) {
        if (opts.failSignature) throw new Error('electronic_signatures insert refused');
        return { rows: [{ id: 501, signed_at: new Date('2026-09-05T10:00:00Z') }] };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
}

const BUNDLE = {
  path: '/tmp/bundles/pkg-42.zip',
  sha256: 'c'.repeat(64),
  sizeBytes: 1234,
  format: 'ectd' as const,
  validation: { errorCount: 0 },
};

function input(over: Record<string, unknown> = {}) {
  return {
    region: 'fda' as const,
    gateway: 'esg' as const,
    organizationId: 7,
    userId: 11,
    packageId: 42,
    environment: 'test' as const,
    reason: 'RA and QA sign-off complete',
    meaning: 'release',
    authenticationMethod: 'password+totp',
    secondFactorVerified: true,
    ipAddress: '10.0.0.5',
    reauthVerifiedAt: new Date('2026-09-05T09:59:00Z'),
    clientBundle: BUNDLE,
    recordGovernedAction: vi.fn().mockResolvedValue({ actionId: 'act_77', auditId: 'aud_77', sha256Chain: 'a'.repeat(64) }),
    ...over,
  } as any;
}

describe('executeGovernedTransmit — the sign is an electronic signature', () => {
  beforeEach(() => {
    queries.length = 0;
    transmitMock.mockReset();
    transmitMock.mockResolvedValue({ transmittalId: 900, transmissionId: 'core-id-1', status: 'received' });
    process.env.NODE_ENV = 'test';
  });

  it('writes the electronic_signatures row inside the ledger transaction with the declared meaning and the bundle digest', async () => {
    const client = fakeClient();
    connectMock.mockResolvedValue(client);
    const recorder = vi.fn().mockResolvedValue({ actionId: 'act_77', auditId: 'aud_77', sha256Chain: 'a'.repeat(64) });

    const out = await executeGovernedTransmit(input({ recordGovernedAction: recorder }));
    expect(out.ledgerWriteFailed).toBe(false);

    // The ledger entry carries the declared meaning — never the old constant.
    expect(recorder).toHaveBeenCalledTimes(1);
    const ledger = recorder.mock.calls[0][1];
    expect(ledger.command).toBe('sign');
    expect(ledger.payload.meaning).toBe('release');
    expect(ledger.payload.meaning).not.toBe('submission');

    const order = queries.map((q) => q.sql);
    const begin = order.findIndex((s) => s === 'BEGIN');
    const insert = order.findIndex((s) => SIG_INSERT.test(s));
    const commit = order.findIndex((s) => s === 'COMMIT');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(begin);
    expect(commit).toBeGreaterThan(insert);

    const args = queries[insert].args as unknown[];
    // signed_target, binding_basis
    expect(args[2]).toBe('submission:42');
    expect(args[3]).toBe('transmitted-bundle-sha256');
    // signer identity is the resolved person, not a placeholder
    expect(args[7]).toBe(11);
    expect(args[8]).toBe('Dr Ada Lovelace');
    expect(args[10]).toBe('ada@sponsor.example');
    // the factors the caller verified — not asserted stronger than they were
    expect(args[11]).toBe('password+totp');
    expect(args[13]).toBe(true);
    // §11.50 meaning and §11.70 binding
    expect(args[15]).toBe('release');
    const manifest = JSON.parse(args[16] as string);
    expect(manifest.kind).toBe('governed-transmit');
    expect(manifest.meaning).toBe('release');
    expect(manifest.actionId).toBe('act_77');
    expect(manifest.boundPayloadDigest).toBe(BUNDLE.sha256);
    expect(args[24]).toBe(BUNDLE.sha256);
    expect(args[21]).toBe('10.0.0.5');
    expect(args[25]).toBe(7);
  });

  it('records the weaker factors honestly when only a password was verified', async () => {
    const client = fakeClient();
    connectMock.mockResolvedValue(client);
    await executeGovernedTransmit(input({ authenticationMethod: 'password', secondFactorVerified: false, meaning: 'approval' }));
    const insert = queries.find((q) => SIG_INSERT.test(q.sql))!;
    expect(insert.args[11]).toBe('password');
    expect(insert.args[13]).toBe(false);
    expect(insert.args[15]).toBe('approval');
  });

  it('rolls the ledger transaction back and reports ledgerWriteFailed when the signature row cannot be written', async () => {
    const client = fakeClient({ failSignature: true });
    connectMock.mockResolvedValue(client);
    const log = { error: vi.fn() };
    const out = await executeGovernedTransmit(input({ log }));
    expect(out.ledgerWriteFailed).toBe(true);
    const order = queries.map((q) => q.sql);
    expect(order).toContain('ROLLBACK');
    expect(order).not.toContain('COMMIT');
    expect(log.error).toHaveBeenCalledWith('transmit-ledger-write-failed-after-successful-transmit', expect.objectContaining({ message: expect.stringMatching(/electronic_signatures/) }));
  });

  /* 2026-09-28 (Q-0928-3): the declared meaning was persisted on the signature
     and nowhere the transmittal log reads, so the log could not show it back. It
     is recorded on the transmittal row, in the SAME transaction as the
     signature, merged into metadata (the gateways read metadata.environment). */
  it('records the declared meaning and the signature id on the transmittal row, inside the signature transaction', async () => {
    const client = fakeClient();
    connectMock.mockResolvedValue(client);
    const out = await executeGovernedTransmit(input({ meaning: 'approval' }));
    expect(out.ledgerWriteFailed).toBe(false);

    const order = queries.map((q) => q.sql);
    const insert = order.findIndex((s) => SIG_INSERT.test(s));
    const stamp = order.findIndex((s) => /UPDATE submission_transmittals[\s\S]*SET metadata/.test(s));
    const commit = order.findIndex((s) => s === 'COMMIT');
    expect(stamp).toBeGreaterThan(insert);
    expect(commit).toBeGreaterThan(stamp);

    const { sql, args } = queries[stamp];
    // Merged, never replacing the metadata the gateway wrote.
    expect(sql).toMatch(/COALESCE\(metadata, '\{\}'::jsonb\) \|\|/);
    // Tenant-scoped.
    expect(sql).toMatch(/organization_id = \$\d/);
    expect(args).toContain(900);
    expect(args).toContain(7);
    const stamped = JSON.parse(args.find((a) => typeof a === 'string' && a.includes('meaning')) as string);
    expect(stamped).toEqual({ signature: { meaning: 'approval', signatureId: 501 } });
  });

  it('a failed signature write stamps nothing (the stamp rolls back with it)', async () => {
    const client = fakeClient({ failSignature: true });
    connectMock.mockResolvedValue(client);
    await executeGovernedTransmit(input({ log: { error: vi.fn() } }));
    expect(queries.some((q) => /UPDATE submission_transmittals[\s\S]*SET metadata/.test(q.sql))).toBe(false);
  });
});

/**
 * Membership: the independence check is ON the transmit path, before anything
 * reaches the gateway. A check that exists but is never called refuses nothing,
 * and every test of the check alone still passes.
 */
describe('executeGovernedTransmit — the package creator cannot transmit it', () => {
  beforeEach(() => {
    queries.length = 0;
    transmitMock.mockReset();
    transmitMock.mockResolvedValue({ transmittalId: 901, transmissionId: 'core-id-2', status: 'received' });
    process.env.NODE_ENV = 'test';
  });

  it('refuses when the signer created the package, and the gateway is never called', async () => {
    const sod = await import('../../governance/separation-of-duties');
    vi.mocked(sod.assertSignerIsNotAuthor).mockRejectedValueOnce(new sod.SeparationOfDutiesError('author'));
    await expect(executeGovernedTransmit(input())).rejects.toMatchObject({
      name: 'GovernedTransmitRefusal',
      code: 'SIGNER_IS_AUTHOR',
      httpStatus: 403,
    });
    expect(transmitMock, 'bytes left for the agency under a refused signer').not.toHaveBeenCalled();
  });

  it('refuses a transmission signed as authorship before asking who authored the package', async () => {
    const sod = await import('../../governance/separation-of-duties');
    vi.mocked(sod.assertSignerIsNotAuthor).mockClear();
    await expect(executeGovernedTransmit(input({ meaning: 'authorship' }))).rejects.toMatchObject({
      code: 'AUTHORSHIP_NOT_A_RELEASE',
    });
    expect(sod.assertSignerIsNotAuthor).not.toHaveBeenCalled();
    expect(transmitMock).not.toHaveBeenCalled();
  });
});
