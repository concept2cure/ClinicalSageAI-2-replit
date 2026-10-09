/**
 * The governed transmit records the pre-transmit checks that failed without
 * blocking, on its Part 11 sign record.
 *
 * 2026-09-23 (W5/D7, round-2 review). The getGateway guard attaches
 * `preTransmit` {checks, warnings, leafSecurity} to every gateway result, and
 * transmitSequence wrote the failed checks into its §11.10(e) row. The other
 * consumer of the same guard — executeGovernedTransmit, behind the HTTP transmit
 * route (a package-model IND to fda/esg included) and the AnA 510(k) transmit —
 * wrote a sign ledger payload and an electronic-signature manifest that never
 * mentioned them. A package that failed dtd-self-contained (every FDA package
 * while the DTDs are not vendored) transmitted with no transmit-time record that
 * the check failed and the send went ahead anyway.
 *
 * This runs the real executeGovernedTransmit against a fake pool and a stubbed
 * gateway result, and pins: the failed checks and the guard's warnings on the
 * ledger payload, in the electronic_signatures manifest, and on the outcome;
 * `null` (never `[]`) when the guard reported nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queries, connectMock, transmitMock } = vi.hoisted(() => ({
  queries: [] as Array<{ sql: string; args: unknown[] }>,
  connectMock: vi.fn(),
  transmitMock: vi.fn(),
}));

vi.mock('../../../db', () => ({ pool: { connect: connectMock, query: vi.fn() } }));
vi.mock('../index', () => ({ getGateway: () => ({ transmit: transmitMock }) }));
vi.mock('../fda-esg', () => ({ findActiveTransmittal: vi.fn().mockResolvedValue(null) }));
vi.mock('../../submission-bundle-storage', () => ({ getBundle: vi.fn() }));
vi.mock('fs', () => ({ promises: { access: vi.fn().mockResolvedValue(undefined), mkdir: vi.fn(), writeFile: vi.fn() } }));

import { executeGovernedTransmit } from '../governed-transmit';

const SIG_INSERT = /INSERT INTO electronic_signatures/;

function fakeClient() {
  return {
    query: vi.fn(async (sql: string, args: unknown[] = []) => {
      queries.push({ sql, args });
      if (/FROM users u/.test(sql)) return { rows: [{ name: 'Dr Ada Lovelace', email: 'ada@sponsor.example', title: 'RA Lead' }] };
      if (SIG_INSERT.test(sql)) return { rows: [{ id: 501, signed_at: new Date('2026-09-23T10:00:00Z') }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
}

function input(recorder: ReturnType<typeof vi.fn>) {
  return {
    region: 'fda' as const,
    gateway: 'esg' as const,
    organizationId: 7,
    userId: 11,
    packageId: 42,
    environment: 'staging' as const,
    reason: 'RA and QA sign-off complete',
    meaning: 'release',
    authenticationMethod: 'password',
    secondFactorVerified: false,
    reauthVerifiedAt: new Date('2026-09-23T09:59:00Z'),
    clientBundle: { path: '/tmp/bundles/pkg-42.zip', sha256: 'c'.repeat(64), sizeBytes: 1234, format: 'ectd' as const, validation: { errorCount: 0 } },
    recordGovernedAction: recorder,
  } as any;
}

const GUARD_REPORT = {
  checks: [
    { name: 'gateway-size-limit', passed: true, detail: '1234 bytes vs 10737418240 byte limit for FDA' },
    { name: 'dtd-self-contained', passed: false, detail: 'missing: ich-ectd-3-2.dtd, us-regional-v3-3.dtd' },
  ],
  warnings: ['The bundle carries no record of the region it was built for; cannot prove it matches the FDA gateway.'],
  leafSecurity: { pdfEntries: 3, agencyFormsAsIssued: ['m1/us/11-form/form-fda-1571.pdf'] },
};

async function run(preTransmit: unknown) {
  connectMock.mockResolvedValue(fakeClient());
  transmitMock.mockResolvedValue({
    transmittalId: 900, transmissionId: 'core-1', status: 'received', transport: 'as2',
    httpStatus: 200, ackReceivedAt: null, message: 'ok',
    ...(preTransmit === undefined ? {} : { preTransmit }),
  });
  const recorder = vi.fn().mockResolvedValue({ actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'a'.repeat(64) });
  const out = await executeGovernedTransmit(input(recorder));
  const ledger = recorder.mock.calls[0][1].payload as Record<string, unknown>;
  const insert = queries.find((q) => SIG_INSERT.test(q.sql));
  const manifest = JSON.parse(String(insert?.args[16] ?? '{}')) as Record<string, unknown>;
  return { out: out as unknown as Record<string, unknown>, ledger, manifest };
}

describe('executeGovernedTransmit — failed pre-transmit checks are on the sign record', () => {
  beforeEach(() => {
    queries.length = 0;
    transmitMock.mockReset();
    process.env.NODE_ENV = 'test';
  });

  it('records a failed, non-blocking check and the guard warnings on the ledger payload, the signature manifest and the outcome', async () => {
    const { out, ledger, manifest } = await run(GUARD_REPORT);
    expect(out.ledgerWriteFailed).toBe(false);

    const failed = ['dtd-self-contained: missing: ich-ectd-3-2.dtd, us-regional-v3-3.dtd'];
    // The governed `sign` ledger entry.
    expect(ledger.preTransmitFailedChecks).toEqual(failed);
    expect(ledger.preTransmitWarnings).toEqual(GUARD_REPORT.warnings);
    // The electronic-signature manifest — the attributed record an auditor reads.
    expect(manifest.kind).toBe('governed-transmit');
    expect(manifest.preTransmitFailedChecks).toEqual(failed);
    expect(manifest.preTransmitWarnings).toEqual(GUARD_REPORT.warnings);
    // And the caller is handed the same facts.
    expect(out.preTransmitFailedChecks).toEqual(failed);
    expect(out.preTransmitWarnings).toEqual(GUARD_REPORT.warnings);
  });

  it('records an empty list — not null — when the guard ran and every check passed', async () => {
    const { out, ledger, manifest } = await run({ checks: [GUARD_REPORT.checks[0]], warnings: [], leafSecurity: null });
    expect(ledger.preTransmitFailedChecks).toEqual([]);
    expect(manifest.preTransmitFailedChecks).toEqual([]);
    expect(out.preTransmitFailedChecks).toEqual([]);
    expect(out.preTransmitWarnings).toEqual([]);
  });

  it('records null — never "all passed" — when the guard reported nothing', async () => {
    const { out, ledger, manifest } = await run(undefined);
    expect(ledger).toHaveProperty('preTransmitFailedChecks', null);
    expect(ledger).toHaveProperty('preTransmitWarnings', null);
    expect(manifest).toHaveProperty('preTransmitFailedChecks', null);
    expect(manifest).toHaveProperty('preTransmitWarnings', null);
    expect(out).toHaveProperty('preTransmitFailedChecks', null);
    expect(out).toHaveProperty('preTransmitWarnings', null);
  });
});
