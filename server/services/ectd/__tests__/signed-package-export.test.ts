/**
 * Tests for the orchestrator → export seam.
 *
 * The point of this service is REFUSAL, so the tests that matter are the ones
 * that prove it refuses: a tampered leaf manifest, a forged digest, a revoked
 * signature. A gate only ever seen to pass has not been tested.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ── Mocks ───────────────────────────────────────────────────────────────────
// The service imports getRun / findActiveReleaseSignature from the orchestrator
// (DB-backed) and computeBoundPayloadDigestFromComponents (pure). We mock the
// two DB functions and let the REAL digest function run — the digest is the
// thing under test, so stubbing it would test nothing.

const mockGetRun = vi.fn();
const mockFindActiveReleaseSignature = vi.fn();

vi.mock('../../submission-package-orchestrator.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../submission-package-orchestrator.js')
  >('../../submission-package-orchestrator.js');
  return {
    ...actual,
    getRun: (...args: unknown[]) => mockGetRun(...args),
    findActiveReleaseSignature: (...args: unknown[]) => mockFindActiveReleaseSignature(...args),
  };
});

vi.mock('../../../db.js', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  db: { execute: vi.fn(async () => ({ rows: [] })) },
}));

vi.mock('../../../lib/unified-ai-client.js', () => ({
  ai: { complete: vi.fn(async () => '') },
}));

import {
  resolveSignedPackageForExport,
  verifyLeafBytes,
  refusalHttpStatus,
} from '../signed-package-export';
import { computeBoundPayloadDigestFromComponents } from '../../submission-package-orchestrator';
import { sealSignPayloadDigest } from '../sign-payload-seal';
import type { ECTDLeaf } from '../ectd4-validator';

// ── Fixtures ────────────────────────────────────────────────────────────────

const ORG = 42;
const RUN_ID = 'run-0001';
const SEAL_KEY = 'test-audit-hmac-key-0123456789abcdef';
const SEALED_ENV = { AUDIT_HMAC_KEY: SEAL_KEY } as unknown as NodeJS.ProcessEnv;

function leaf(overrides: Partial<ECTDLeaf> = {}): ECTDLeaf {
  const payload = overrides.filePath ?? 'm3/32s1/ds.pdf';
  return {
    sectionCode: 'm3.2.S.1',
    title: 'Drug Substance General Information',
    checksum: crypto.createHash('md5').update(payload).digest('hex'),
    checksumType: 'md5',
    operation: 'new',
    filePath: payload,
    mimeType: 'application/pdf',
    fileSize: 2048,
    ...overrides,
  };
}

const SIGNED_LEAVES: ECTDLeaf[] = [
  leaf({ filePath: 'm3/32s1/ds.pdf' }),
  leaf({ filePath: 'm3/32s7/stability.pdf', sectionCode: 'm3.2.S.7', title: 'Stability' }),
];

const VALIDATOR_OUTCOME = {
  gatewayReady: true,
  hardenedScore: 96,
  summary: {
    errors: 0,
    warnings: 1,
    infos: 0,
    sectionsPresent: 15,
    sectionsRequired: 15,
    sectionsMissing: [],
  },
};

const SNAPSHOT = {
  leaves: SIGNED_LEAVES,
  backboneXml: '<?xml version="1.0"?><ectd:ectd/>',
  validatorOutcome: VALIDATOR_OUTCOME,
  submissionId: 'sub-001',
  organizationId: ORG,
  applicationNumber: 'IND123456',
  sequenceNumber: '0000',
  region: 'US' as const,
  submissionType: 'IND',
  totalSizeBytes: 4096,
};

/** The digest the signing path would have produced for SNAPSHOT. */
function digestFor(snapshot: typeof SNAPSHOT): string {
  return computeBoundPayloadDigestFromComponents({
    leaves: snapshot.leaves,
    validatorOutcome: snapshot.validatorOutcome,
    submissionId: snapshot.submissionId,
    applicationNumber: snapshot.applicationNumber,
    region: snapshot.region,
    submissionType: snapshot.submissionType,
    organizationId: snapshot.organizationId,
    backboneXml: snapshot.backboneXml || undefined,
  });
}

function runWithSignStep(opts: {
  status?: string;
  payload?: Record<string, unknown> | null;
  rawOutputRef?: string;
  omitSignStep?: boolean;
}) {
  const steps = [
    { key: 'package.assemble', status: 'complete', inputHash: 'a', dependsOn: [] },
    { key: 'package.validate', status: 'complete', inputHash: 'b', dependsOn: ['package.assemble'] },
  ];
  if (!opts.omitSignStep) {
    steps.push({
      key: 'package.sign',
      status: opts.status ?? 'complete',
      inputHash: 'c',
      dependsOn: ['package.validate'],
      ...(opts.rawOutputRef !== undefined
        ? { outputRef: opts.rawOutputRef }
        : opts.payload === null
          ? {}
          : { outputRef: JSON.stringify(opts.payload) }),
    } as never);
  }
  return {
    runId: RUN_ID,
    organizationId: ORG,
    submissionId: 'sub-001',
    applicationNumber: 'IND123456',
    region: 'US',
    submissionType: 'IND',
    startedAt: '2026-09-01T00:00:00Z',
    status: 'complete',
    steps,
  };
}

/** A fully valid, sealed, signed payload for the happy path. */
function validPayload(snapshot = SNAPSHOT) {
  const payloadDigest = digestFor(snapshot);
  return {
    payloadDigest,
    payloadSeal: sealSignPayloadDigest(payloadDigest, ORG, SEALED_ENV),
    signatureId: 7,
    awaitingSince: '2026-09-01T00:05:00Z',
    signedSnapshot: snapshot,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindActiveReleaseSignature.mockResolvedValue({ id: 7 });
});

// ── Happy path ──────────────────────────────────────────────────────────────

describe('resolveSignedPackageForExport — accepts an intact signed package', () => {
  it('returns the signed manifest when every control verifies', async () => {
    mockGetRun.mockResolvedValue(runWithSignStep({ payload: validPayload() }));

    const result = await resolveSignedPackageForExport({
      runId: RUN_ID,
      organizationId: ORG,
      env: SEALED_ENV,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.descriptor.leaves).toHaveLength(2);
    expect(result.descriptor.signatureId).toBe(7);
    expect(result.descriptor.sealVerdict).toBe('ok');
    expect(result.descriptor.gatewayReady).toBe(true);
    expect(result.descriptor.applicationNumber).toBe('IND123456');
  });

  it('accepts an unsealed run under an unsealed posture', async () => {
    const digest = digestFor(SNAPSHOT);
    mockGetRun.mockResolvedValue(
      runWithSignStep({
        payload: { payloadDigest: digest, signatureId: 7, signedSnapshot: SNAPSHOT },
      }),
    );

    const result = await resolveSignedPackageForExport({
      runId: RUN_ID,
      organizationId: ORG,
      env: {} as NodeJS.ProcessEnv,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.descriptor.sealVerdict).toBe('unsealed');
  });
});

// ── The refusals that justify the gate ──────────────────────────────────────

describe('resolveSignedPackageForExport — refuses tampered packages', () => {
  it('REFUSES when a leaf was swapped after signing (digest drift)', async () => {
    // The attack: edit the steps JSONB to point at a different leaf manifest,
    // leaving the stored digest + seal untouched. The recomputed digest moves.
    const tampered = {
      ...SNAPSHOT,
      leaves: [leaf({ filePath: 'm3/32s1/ATTACKER.pdf' }), SIGNED_LEAVES[1]],
    };
    const payload = validPayload(SNAPSHOT); // digest + seal over the ORIGINAL
    mockGetRun.mockResolvedValue(
      runWithSignStep({ payload: { ...payload, signedSnapshot: tampered } }),
    );

    const result = await resolveSignedPackageForExport({
      runId: RUN_ID,
      organizationId: ORG,
      env: SEALED_ENV,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('digest-drift');
    expect(result.detail).toContain('changed after signing');
  });

  it('REFUSES when the digest was forged to match a tampered manifest (seal failure)', async () => {
    // The smarter attack: swap the manifest AND recompute the stored digest so
    // they agree. The server-keyed HMAC is what they cannot forge.
    const tampered = {
      ...SNAPSHOT,
      leaves: [leaf({ filePath: 'm3/32s1/ATTACKER.pdf' })],
    };
    mockGetRun.mockResolvedValue(
      runWithSignStep({
        payload: {
          payloadDigest: digestFor(tampered), // self-consistent...
          payloadSeal: sealSignPayloadDigest(digestFor(SNAPSHOT), ORG, SEALED_ENV), // ...but sealed over the original
          signatureId: 7,
          signedSnapshot: tampered,
        },
      }),
    );

    const result = await resolveSignedPackageForExport({
      runId: RUN_ID,
      organizationId: ORG,
      env: SEALED_ENV,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('seal-failed');
  });

  it('REFUSES when a seal exists but the key is gone (unverifiable control)', async () => {
    mockGetRun.mockResolvedValue(runWithSignStep({ payload: validPayload() }));

    const result = await resolveSignedPackageForExport({
      runId: RUN_ID,
      organizationId: ORG,
      env: {} as NodeJS.ProcessEnv, // key absent, but a seal is stored
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('seal-failed');
  });

  it('REFUSES when the signature was superseded or rolled back', async () => {
    mockGetRun.mockResolvedValue(runWithSignStep({ payload: validPayload() }));
    mockFindActiveReleaseSignature.mockResolvedValue(null);

    const result = await resolveSignedPackageForExport({
      runId: RUN_ID,
      organizationId: ORG,
      env: SEALED_ENV,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('signature-revoked');
  });

  it('REFUSES as signature-unverifiable — NOT revoked — when the signature lookup could not run (WO-16B finding 14)', async () => {
    mockGetRun.mockResolvedValue(runWithSignStep({ payload: validPayload() }));
    const notRun = Object.assign(new Error('release-signature lookup could not be run: 42703: column "bound_payload_digest" does not exist'), {
      name: 'VerificationUnavailableError',
      detail: '42703: column "bound_payload_digest" does not exist',
      what: 'release-signature lookup',
    });
    mockFindActiveReleaseSignature.mockRejectedValue(notRun);

    const result = await resolveSignedPackageForExport({
      runId: RUN_ID,
      organizationId: ORG,
      env: SEALED_ENV,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('signature-unverifiable');
    expect(result.detail).toMatch(/NOT been found revoked/);
    expect(refusalHttpStatus('signature-unverifiable')).toBe(503);
  });

  it('REFUSES a change to the identity tuple (org swap) even with intact leaves', async () => {
    // Cross-tenant re-pointing: same package bytes, different owning org.
    const reassigned = { ...SNAPSHOT, organizationId: 999 };
    const payload = validPayload(SNAPSHOT);
    mockGetRun.mockResolvedValue(
      runWithSignStep({ payload: { ...payload, signedSnapshot: reassigned } }),
    );

    const result = await resolveSignedPackageForExport({
      runId: RUN_ID,
      organizationId: ORG,
      env: SEALED_ENV,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('digest-drift');
  });
});

describe('resolveSignedPackageForExport — refuses unsigned / incomplete states', () => {
  it('refuses an unknown or cross-tenant run', async () => {
    mockGetRun.mockResolvedValue(null);
    const result = await resolveSignedPackageForExport({ runId: RUN_ID, organizationId: ORG });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('run-not-found');
  });

  it('refuses a run with no package.sign step', async () => {
    mockGetRun.mockResolvedValue(runWithSignStep({ omitSignStep: true }));
    const result = await resolveSignedPackageForExport({ runId: RUN_ID, organizationId: ORG });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('not-signed');
  });

  it('refuses a run still awaiting a signature', async () => {
    mockGetRun.mockResolvedValue(
      runWithSignStep({ status: 'awaiting-signature', payload: validPayload() }),
    );
    const result = await resolveSignedPackageForExport({
      runId: RUN_ID,
      organizationId: ORG,
      env: SEALED_ENV,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('awaiting-signature');
  });

  it('refuses a skipped signature gate rather than treating it as signed', async () => {
    mockGetRun.mockResolvedValue(
      runWithSignStep({ status: 'skipped', rawOutputRef: 'skipped:not-required' }),
    );
    const result = await resolveSignedPackageForExport({ runId: RUN_ID, organizationId: ORG });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('not-signed');
  });

  it('refuses a legacy run signed before snapshot persistence', async () => {
    const digest = digestFor(SNAPSHOT);
    mockGetRun.mockResolvedValue(
      runWithSignStep({
        payload: {
          payloadDigest: digest,
          payloadSeal: sealSignPayloadDigest(digest, ORG, SEALED_ENV),
          signatureId: 7,
          // no signedSnapshot
        },
      }),
    );
    const result = await resolveSignedPackageForExport({
      runId: RUN_ID,
      organizationId: ORG,
      env: SEALED_ENV,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('snapshot-missing');
  });
});

// ── Byte verification ───────────────────────────────────────────────────────

describe('verifyLeafBytes', () => {
  it('passes when rendered bytes hash to the signed checksums', () => {
    const buffers: Record<string, Buffer> = {};
    for (const l of SIGNED_LEAVES) buffers[l.filePath] = Buffer.from(l.filePath);
    const v = verifyLeafBytes(SIGNED_LEAVES, buffers);
    expect(v.ok).toBe(true);
    expect(v.missing).toHaveLength(0);
    expect(v.mismatched).toHaveLength(0);
  });

  it('fails closed on a missing leaf rather than passing it', () => {
    const buffers = { [SIGNED_LEAVES[0].filePath]: Buffer.from(SIGNED_LEAVES[0].filePath) };
    const v = verifyLeafBytes(SIGNED_LEAVES, buffers);
    expect(v.ok).toBe(false);
    expect(v.missing).toContain(SIGNED_LEAVES[1].filePath);
  });

  it('reports a leaf whose bytes do not match the signed checksum', () => {
    const buffers: Record<string, Buffer> = {};
    for (const l of SIGNED_LEAVES) buffers[l.filePath] = Buffer.from(l.filePath);
    buffers[SIGNED_LEAVES[0].filePath] = Buffer.from('substituted content');
    const v = verifyLeafBytes(SIGNED_LEAVES, buffers);
    expect(v.ok).toBe(false);
    expect(v.mismatched).toHaveLength(1);
    expect(v.mismatched[0].filePath).toBe(SIGNED_LEAVES[0].filePath);
  });
});

// ── Status mapping ──────────────────────────────────────────────────────────

describe('refusalHttpStatus', () => {
  it('maps integrity failures to 422, distinct from workflow-state 409s', () => {
    expect(refusalHttpStatus('seal-failed')).toBe(422);
    expect(refusalHttpStatus('digest-drift')).toBe(422);
    expect(refusalHttpStatus('awaiting-signature')).toBe(409);
    expect(refusalHttpStatus('not-signed')).toBe(409);
    expect(refusalHttpStatus('signature-revoked')).toBe(409);
    expect(refusalHttpStatus('snapshot-missing')).toBe(409);
    expect(refusalHttpStatus('run-not-found')).toBe(404);
  });
});
