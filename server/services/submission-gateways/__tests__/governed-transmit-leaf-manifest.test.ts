/**
 * The governed transmit hands the transmit guard the package that SHIPS,
 * leaf manifest included.
 *
 * 2026-09-23 (W5/D7, round-2 skeptic). executeGovernedTransmit passed
 * gw.transmit a trimmed bundle (path, digest, size, format, packager evidence)
 * and left out `leafManifest`, although the resolved bundle carries one — the
 * same function uses it to record the filed sequence. transmitSequence passes
 * the packager's whole bundle. The guard's Module 3 regional gate
 * (evaluateModule3RegionalGate) reads the shipped CTD sections from that
 * manifest, so for every region with no authored 3.2.R template (UK, CN, AU,
 * CH, BR, IN, KR, SG) the package spine recorded a FAILED
 * `module3-regional-section` check on the Part 11 sign ledger, the electronic-
 * signature manifest and the outcome — for a package that ships a 3.2.R leaf,
 * which the sequence spine records as passed. In production with
 * M3_REQUIRE_REGIONAL_SECTION=true the same omission refused the package.
 *
 * This runs the real executeGovernedTransmit with a gateway whose guard is the
 * real evaluatePreTransmit (the one getGateway runs), for UK / mhra_gateway.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { seen, connectMock } = vi.hoisted(() => ({ seen: [] as any[], connectMock: vi.fn() }));

vi.mock('../../../db', () => ({ pool: { connect: connectMock, query: vi.fn() } }));
// The guard getGateway wraps every gateway in, reduced to the part under test:
// evaluatePreTransmit over the bundle the caller hands the gateway, refusing on
// a blocker and reporting its checks on the result exactly as index.ts does.
vi.mock('../index', async () => {
  const { evaluatePreTransmit } = await import('../pre-transmit-check');
  return {
    getGateway: (region: any) => ({
      transmit: async (req: any) => {
        seen.push(req.bundle);
        const pre = evaluatePreTransmit({ region, bundle: req.bundle, environment: req.environment, enforceExternal: false });
        if (!pre.cleared) throw new Error(`Refusing to transmit: ${pre.blockers.join(' ')}`);
        return {
          transmittalId: 1, transmissionId: 't-1', status: 'received', transport: 'as2', httpStatus: 200,
          ackReceivedAt: null, message: 'ok',
          preTransmit: { checks: pre.checks, warnings: pre.warnings, leafSecurity: null },
        };
      },
    }),
  };
});
vi.mock('../fda-esg', () => ({ findActiveTransmittal: vi.fn().mockResolvedValue(null) }));
vi.mock('../../submission-bundle-storage', () => ({ getBundle: vi.fn() }));
vi.mock('fs', () => ({ promises: { access: vi.fn().mockResolvedValue(undefined), mkdir: vi.fn(), writeFile: vi.fn() } }));

import { executeGovernedTransmit } from '../governed-transmit';

const LEAF_MANIFEST = [
  { ctdSection: '3.2.R', fileName: 'regional-info.pdf', href: 'm3/32-body-data/32r-reg-info/regional-info.pdf', md5: 'a'.repeat(32) },
  { ctdSection: '2.5', fileName: 'clinical-overview.pdf', href: 'm2/25-clin-over/clinical-overview.pdf', md5: 'b'.repeat(32) },
];

function fakeClient() {
  return {
    query: vi.fn(async (sql: string) => {
      if (/FROM users u/.test(sql)) return { rows: [{ name: 'Dr Ada Lovelace', email: 'ada@sponsor.example', title: 'RA Lead' }] };
      if (/INSERT INTO electronic_signatures/.test(sql)) return { rows: [{ id: 1, signed_at: new Date('2026-09-23T10:00:00Z') }] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
}

function run(environment: 'staging' | 'production') {
  const recorder = vi.fn().mockResolvedValue({ actionId: 'act_1', auditId: 'aud_1', sha256Chain: 'd'.repeat(64) });
  const bundle = {
    path: '/tmp/bundles/pkg-7.zip', sha256: 'c'.repeat(64), sizeBytes: 100, format: 'ectd' as const,
    validation: { errorCount: 0 }, builtRegion: 'uk', leafManifest: LEAF_MANIFEST,
  };
  const outcome = executeGovernedTransmit({
    region: 'uk', gateway: 'mhra_gateway', organizationId: 7, userId: 11, packageId: null,
    environment, reason: 'RA and QA sign-off complete', meaning: 'release',
    authenticationMethod: 'password', secondFactorVerified: false,
    reauthVerifiedAt: new Date('2026-09-23T09:59:00Z'),
    clientBundle: bundle, recordGovernedAction: recorder,
  } as any);
  return { outcome, recorder };
}

const M3 = /^module3-regional-section/;

describe('executeGovernedTransmit — the guard judges the package that ships (leafManifest)', () => {
  const savedM3 = process.env.M3_REQUIRE_REGIONAL_SECTION;
  beforeEach(() => {
    seen.length = 0;
    process.env.NODE_ENV = 'test';
    connectMock.mockResolvedValue(fakeClient());
  });
  afterEach(() => {
    if (savedM3 === undefined) delete process.env.M3_REQUIRE_REGIONAL_SECTION;
    else process.env.M3_REQUIRE_REGIONAL_SECTION = savedM3;
  });

  it('hands gw.transmit the bundle leafManifest', async () => {
    const { outcome } = run('staging');
    await outcome;
    expect(seen).toHaveLength(1);
    expect(seen[0].leafManifest).toEqual(LEAF_MANIFEST);
  });

  it('a UK package that ships a 3.2.R leaf records no failed module3-regional-section check on the outcome or the sign ledger', async () => {
    const { outcome, recorder } = run('staging');
    const out: any = await outcome;
    expect(out.preTransmitFailedChecks).toEqual(expect.any(Array));
    expect(out.preTransmitFailedChecks.filter((c: string) => M3.test(c))).toEqual([]);
    const ledger = recorder.mock.calls[0][1].payload as { preTransmitFailedChecks: string[] };
    expect(ledger.preTransmitFailedChecks.filter((c) => M3.test(c))).toEqual([]);
  });

  it('production with M3_REQUIRE_REGIONAL_SECTION=true: a UK package that ships 3.2.R is not refused for missing 3.2.R', async () => {
    process.env.M3_REQUIRE_REGIONAL_SECTION = 'true';
    const { outcome } = run('production');
    const settled = await outcome.then((o) => ({ ok: true as const, o }), (e: unknown) => ({ ok: false as const, e }));
    expect(settled.ok ? null : String((settled as { e: unknown }).e)).toBeNull();
  });
});
