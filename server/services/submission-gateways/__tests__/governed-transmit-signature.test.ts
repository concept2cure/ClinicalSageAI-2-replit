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
});
