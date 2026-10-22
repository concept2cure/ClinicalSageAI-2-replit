/**
 * A release signature clears the dispatch only when it covers the leaves that
 * would be transmitted.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The dispatch transmits the SUBMISSIONS spine: a sequence's ordered
 * `submission_leaves`. The orchestrator release signature is taken over a
 * different artifact — a leaf manifest the run composes in memory and freezes
 * into its signed snapshot. `submission-package-orchestrator.ts` writes no
 * `submission_leaves` row at all.
 *
 * `resolveSignedPackageForExport` verifies that signature by recomputing its
 * digest FROM THE FROZEN SNAPSHOT, so it catches an edit to the snapshot and
 * cannot, by construction, notice that the sequence's live leaves have since
 * become something else. `signed-package-export.ts` says exactly this in its
 * own header: a caller that wants bytes "must re-render deterministic leaves
 * and check each one against `descriptor.leaves[i].checksum` before shipping".
 * The dispatch gate is such a caller and did not check.
 *
 * So a verified release over run R cleared the dispatch gate for the sequence R
 * named no matter what that sequence held by dispatch time — leaves placed,
 * replaced or withdrawn after signing included. Placing Module 3 into a signed
 * sequence is one such change, and it is the ordinary CMC path.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • the pure comparison: a leaf only on one side, a leaf whose eCTD index-md5
 *     changed, the two spines' section-code vocabularies, lifecycle operations,
 *     duplicates, and an absent checksum (uncorroborated, never "verified");
 *   • the live read: live rows only, this organisation only, ordered; and a
 *     failed read returns null rather than an empty sequence;
 *   • the resolver: a signature over different content reads `unsigned` (so the
 *     sequence spine decides and signing it is offered), a matching one reads
 *     `signed` and says how much was corroborated, an unreadable sequence reads
 *     `undetermined`, and a caller with no sequence id is told coverage was not
 *     checked.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockResolveSignedPackageForExport = vi.fn();
const mockDbExecute = vi.fn();
const mockSequenceSpine = vi.fn();
const mockPoolQuery = vi.fn();
const mockReadIdentity = vi.fn();

vi.mock('../signed-package-export.js', async () => {
  const actual = await vi.importActual<typeof import('../signed-package-export.js')>(
    '../signed-package-export.js',
  );
  return {
    ...actual,
    resolveSignedPackageForExport: (...args: unknown[]) => mockResolveSignedPackageForExport(...args),
  };
});

vi.mock('../package-identity.js', async () => ({
  ...await vi.importActual<typeof import('../package-identity.js')>('../package-identity.js'),
  readSubmissionPackageIdentity: (...args: unknown[]) => mockReadIdentity(...args),
}));

vi.mock('../sequence-release-signature.js', () => ({
  resolveSequenceReleaseSignature: (...args: unknown[]) => mockSequenceSpine(...args),
}));

vi.mock('../../../db.js', () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
  db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));

vi.mock('../../../lib/unified-ai-client.js', () => ({
  ai: { complete: vi.fn(async () => '') },
}));

import { resolveReleaseSignatureStatus } from '../release-signature-status';
import {
  normalizeSectionCode,
  readSequenceLeavesForComparison,
  signedManifestCoversLeaves,
  type ComparableLeaf,
} from '../signed-manifest-covers-sequence';

const ORG = 42;
const SUBMISSION = 7;
const THIS_SEQUENCE = '0001';
const SEQUENCE_ID = 5150;
const RECORDED_IDENTITY = {
  programId: '11111111-1111-4111-8111-111111111111', applicationNumber: '123456',
  applicantName: 'Recorded Sponsor', applicantSponsorId: '22222222-2222-4222-8222-222222222222',
  applicantId: '123456789', contact: { name: 'Contact', phone: '+1 555 0100', email: 'ra@example.test' },
};
const RECORDED_SNAPSHOT = { version: 1 as const, identity: RECORDED_IDENTITY };

/** A leaf, stated the short way. */
function leaf(sectionCode: string, checksum: string | null = 'md5-a', operation = 'new'): ComparableLeaf {
  return { sectionCode, operation, checksum };
}

// ── The comparison ──────────────────────────────────────────────────────────

describe('signedManifestCoversLeaves — does the signed manifest describe this sequence', () => {
  it('covers an identical manifest, and says how much the index-md5 corroborated', () => {
    const both = [leaf('m3.2.S.1', 'md5-s1'), leaf('m3.2.P.5', 'md5-p5')];
    const result = signedManifestCoversLeaves(both, [leaf('3.2.S.1', 'md5-s1'), leaf('3.2.P.5', 'md5-p5')]);
    expect(result).toEqual({ covers: true, leafCount: 2, corroboratedLeaves: 2 });
  });

  it('refuses a leaf the sequence now holds that nobody signed — the Module 3 placement case', () => {
    const result = signedManifestCoversLeaves(
      [leaf('m1.us.cover', 'md5-cover')],
      [leaf('1.us.cover', 'md5-cover'), leaf('3.2.S.1', 'md5-s1')],
    );
    expect(result).toMatchObject({ covers: false });
    expect(String((result as { detail: string }).detail)).toMatch(/were not signed/);
    expect(String((result as { detail: string }).detail)).toContain('3.2.s.1');
  });

  it('refuses a signed leaf the sequence no longer holds', () => {
    const result = signedManifestCoversLeaves(
      [leaf('m3.2.S.1', 'md5-s1'), leaf('m3.2.P.5', 'md5-p5')],
      [leaf('3.2.S.1', 'md5-s1')],
    );
    expect(result).toMatchObject({ covers: false });
    expect(String((result as { detail: string }).detail)).toMatch(/no longer in the sequence/);
  });

  it('refuses the same leaves when the bytes under one of them changed', () => {
    const result = signedManifestCoversLeaves(
      [leaf('m3.2.S.1', 'md5-as-signed')],
      [leaf('3.2.S.1', 'md5-replaced-after-signing')],
    );
    expect(result).toMatchObject({ covers: false });
    expect(String((result as { detail: string }).detail)).toMatch(/changed after signing/);
    expect(String((result as { detail: string }).detail)).toMatch(/index-md5/);
  });

  it('is case- and vocabulary-insensitive about the section code, on both sides', () => {
    expect(normalizeSectionCode('m3.2.S.1')).toBe('3.2.s.1');
    expect(normalizeSectionCode('3.2.S.1')).toBe('3.2.s.1');
    expect(normalizeSectionCode('m1.us.cover')).toBe('1.us.cover');
    // Not a leading module number — left exactly as it stands, never guessed at.
    expect(normalizeSectionCode('module3')).toBe('module3');
  });

  it('treats the lifecycle operation as part of the leaf — a delete is not a new', () => {
    const result = signedManifestCoversLeaves(
      [leaf('3.2.S.1', 'md5-s1', 'new')],
      [leaf('3.2.S.1', 'md5-s1', 'delete')],
    );
    expect(result).toMatchObject({ covers: false });
  });

  it('counts leaves, so dropping one of two identical leaves is caught', () => {
    const result = signedManifestCoversLeaves(
      [leaf('3.2.P.8.3', 'md5-x'), leaf('3.2.P.8.3', 'md5-y')],
      [leaf('3.2.P.8.3', 'md5-x')],
    );
    expect(result).toMatchObject({ covers: false });
  });

  it('matches a leaf with no recorded checksum on its identity, and does NOT count it as corroborated', () => {
    const result = signedManifestCoversLeaves(
      [leaf('3.2.S.1', 'md5-s1'), leaf('3.2.P.5', null)],
      [leaf('3.2.S.1', 'md5-s1'), leaf('3.2.P.5', null)],
    );
    // Honest: two leaves correspond, only one of them was fingerprinted. A
    // caller that reports "verified" off leafCount alone would be overclaiming.
    expect(result).toEqual({ covers: true, leafCount: 2, corroboratedLeaves: 1 });
  });

  it('does not invent a mismatch when only one side recorded a checksum', () => {
    const result = signedManifestCoversLeaves([leaf('3.2.S.1', 'md5-s1')], [leaf('3.2.S.1', null)]);
    expect(result).toEqual({ covers: true, leafCount: 1, corroboratedLeaves: 0 });
  });

  it('covers an empty sequence only when nothing was signed either', () => {
    expect(signedManifestCoversLeaves([], [])).toEqual({ covers: true, leafCount: 0, corroboratedLeaves: 0 });
    expect(signedManifestCoversLeaves([leaf('3.2.S.1')], [])).toMatchObject({ covers: false });
  });
});

// ── The live read ───────────────────────────────────────────────────────────

describe('readSequenceLeavesForComparison — the rows the dispatch would transmit', () => {
  beforeEach(() => mockPoolQuery.mockReset());

  it('reads live rows for this sequence and organisation, ordered as the signing digest is', async () => {
    mockPoolQuery.mockResolvedValue({
      rows: [{ section_code: '3.2.S.1', lifecycle_op: 'new', checksum: 'MD5-S1' }],
    });
    const leaves = await readSequenceLeavesForComparison({ sequenceId: SEQUENCE_ID, organizationId: ORG });

    const [sql, params] = mockPoolQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/FROM submission_leaves/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(sql).toMatch(/ORDER BY section_code, id/);
    expect(params).toEqual([SEQUENCE_ID, ORG]);
    // Checksums compare case-insensitively — one spine may upper-case its md5.
    expect(leaves).toEqual([{ sectionCode: '3.2.S.1', operation: 'new', checksum: 'md5-s1' }]);
  });

  it('returns null — not an empty sequence — when the read cannot run', async () => {
    /* Driven through the function's own `pool` seam rather than the module
       mock: the two are the same code path (the module-level pool is the
       default for that very parameter) and the resolver case below covers the
       wiring, while a rejection raised here inside the shared module mock is
       reported by the runner as an unhandled one even once awaited. */
    const failing = {
      query: async () => {
        throw new Error('connection terminated');
      },
    };
    expect(
      await readSequenceLeavesForComparison({ sequenceId: SEQUENCE_ID, organizationId: ORG, pool: failing }),
    ).toBeNull();
  });
});

// ── The resolver ────────────────────────────────────────────────────────────

/** The runs the submission-grained query returns, newest first. */
function runsAre(...runIds: string[]) {
  mockDbExecute.mockResolvedValue({ rows: [] });
  mockDbExecute.mockResolvedValueOnce({ rows: runIds.map(run_id => ({ run_id })) });
}

/** A verified signed package for `sequenceNumber`, over `leaves`. */
function signedOver(sequenceNumber: string, runId: string, leaves: Array<Record<string, unknown>>) {
  return {
    ok: true,
    descriptor: {
      runId,
      submissionId: String(SUBMISSION),
      organizationId: ORG,
      applicationNumber: 'NDA-000000',
      sequenceNumber,
      region: 'US',
      submissionType: 'NDA',
      leaves,
      recordedPackageIdentity: RECORDED_SNAPSHOT,
      signatureId: 991,
      payloadDigest: `digest-${runId}`,
      sealVerdict: 'ok',
    },
  };
}

const SIGNED_LEAVES = [
  { sectionCode: 'm1.us.cover', operation: 'new', checksum: 'md5-cover' },
  { sectionCode: 'm2.3', operation: 'new', checksum: 'md5-qos' },
];

function liveRows(rows: Array<[string, string, string | null]>) {
  mockPoolQuery.mockImplementation(async (sql: string) => /FROM ectd_sequences/i.test(sql)
    ? { rows: [{ submission_id: SUBMISSION }] }
    : { rows: rows.map(([section_code, lifecycle_op, checksum]) => ({ section_code, lifecycle_op, checksum })) });
}

describe('resolveReleaseSignatureStatus — the signature must cover the sequence that ships', () => {
  beforeEach(() => {
    mockResolveSignedPackageForExport.mockReset();
    mockDbExecute.mockReset();
    mockSequenceSpine.mockReset();
    mockPoolQuery.mockReset();
    mockReadIdentity.mockReset().mockResolvedValue(RECORDED_IDENTITY);
    mockSequenceSpine.mockResolvedValue({ verdict: 'unsigned', detail: 'no dispatch-intent signature' });
  });

  it('treats a historical FDA snapshot without applicant proof as intact but not covering, retaining the sequence fallback', async () => {
    runsAre('historical');
    const historical = signedOver(THIS_SEQUENCE, 'historical', SIGNED_LEAVES);
    delete (historical.descriptor as { recordedPackageIdentity?: unknown }).recordedPackageIdentity;
    mockResolveSignedPackageForExport.mockResolvedValue(historical);
    liveRows([['1.us.cover', 'new', 'md5-cover'], ['2.3', 'new', 'md5-qos']]);
    mockSequenceSpine.mockResolvedValue({ verdict: 'signed', detail: 'current sequence signed', signatureId: 77 });
    const status = await resolveReleaseSignatureStatus({ submissionId: SUBMISSION, organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE, sequenceId: SEQUENCE_ID, region: 'fda' });
    expect(status).toMatchObject({ verdict: 'signed', decidedBy: 'sequence', signatureId: 77 });
    expect(mockReadIdentity).not.toHaveBeenCalled();
  });

  it('reports changed current contact as no covering signature rather than snapshot tampering', async () => {
    runsAre('run-a');
    mockResolveSignedPackageForExport.mockResolvedValue(signedOver(THIS_SEQUENCE, 'run-a', SIGNED_LEAVES));
    liveRows([['1.us.cover', 'new', 'md5-cover'], ['2.3', 'new', 'md5-qos']]);
    mockReadIdentity.mockResolvedValue({ ...RECORDED_IDENTITY, contact: { ...RECORDED_IDENTITY.contact, email: 'updated@example.test' } });
    const status = await resolveReleaseSignatureStatus({ submissionId: SUBMISSION, organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE, sequenceId: SEQUENCE_ID, region: 'fda' });
    expect(status.verdict).toBe('unsigned');
    expect(status.detail).toMatch(/applicant identity differs/);
  });

  it('clears a signature whose manifest IS this sequence, and says what corroborated it', async () => {
    runsAre('run-a');
    mockResolveSignedPackageForExport.mockResolvedValue(signedOver(THIS_SEQUENCE, 'run-a', SIGNED_LEAVES));
    liveRows([
      ['1.us.cover', 'new', 'md5-cover'],
      ['2.3', 'new', 'md5-qos'],
    ]);

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
      sequenceId: SEQUENCE_ID,
    });

    expect(status.verdict, String(status.detail)).toBe('signed');
    expect(status.runId).toBe('run-a');
    expect(String(status.detail)).toMatch(/2 leaf\/leaves/);
    expect(String(status.detail)).toMatch(/2 matched on their eCTD index-md5/);
  });

  it('does NOT clear a verified signature over content this sequence no longer holds', async () => {
    // The defect, in the ordinary CMC path: the release was signed, and THEN
    // Module 3 was placed into the same sequence.
    runsAre('run-a');
    mockResolveSignedPackageForExport.mockResolvedValue(signedOver(THIS_SEQUENCE, 'run-a', SIGNED_LEAVES));
    liveRows([
      ['1.us.cover', 'new', 'md5-cover'],
      ['2.3', 'new', 'md5-qos'],
      ['3.2.S.1', 'new', 'md5-placed-after-signing'],
    ]);

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
      sequenceId: SEQUENCE_ID,
    });

    expect(status.verdict, 'a signature over different content cleared the dispatch').toBe('unsigned');
    expect(String(status.detail)).toMatch(/signed it over different content/);
    expect(String(status.detail)).toContain('3.2.s.1');
    // The remedy is named, and it is the one that binds what ships.
    expect(String(status.detail)).toMatch(/Sign this sequence for release/);
  });

  it('refuses it as an intact signature, not as tampering — so the sequence spine still decides', async () => {
    runsAre('run-a');
    mockResolveSignedPackageForExport.mockResolvedValue(signedOver(THIS_SEQUENCE, 'run-a', SIGNED_LEAVES));
    liveRows([['3.2.S.1', 'new', 'md5-something-else']]);
    mockSequenceSpine.mockResolvedValue({ verdict: 'signed', detail: 'the sequence itself is signed', signatureId: 77 });

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
      sequenceId: SEQUENCE_ID,
    });

    // `invalid` would accuse an intact signature of tampering AND stop the
    // fall-through, leaving a correctly signed sequence undispatchable.
    expect(status.verdict).toBe('signed');
    expect(status.decidedBy).toBe('sequence');
    expect(status.signatureId).toBe(77);
  });

  it('reports undetermined — never signed — when this sequence’s leaves cannot be read', async () => {
    runsAre('run-a');
    mockResolveSignedPackageForExport.mockResolvedValue(signedOver(THIS_SEQUENCE, 'run-a', SIGNED_LEAVES));
    mockPoolQuery.mockImplementation(async () => {
      throw new Error('connection terminated');
    });

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
      sequenceId: SEQUENCE_ID,
    });

    expect(status.verdict).toBe('undetermined');
    expect(String(status.detail)).toMatch(/could not be read/);
    // An unreadable sequence is not an unsigned one, so nothing is offered on it.
    expect(mockSequenceSpine).not.toHaveBeenCalled();
  });

});

describe('resolveReleaseSignatureStatus — picking among runs, and saying what a clear answer rests on', () => {
  beforeEach(() => {
    mockResolveSignedPackageForExport.mockReset();
    mockDbExecute.mockReset();
    mockSequenceSpine.mockReset();
    mockPoolQuery.mockReset();
    mockReadIdentity.mockReset().mockResolvedValue(RECORDED_IDENTITY);
    mockSequenceSpine.mockResolvedValue({ verdict: 'unsigned', detail: 'no dispatch-intent signature' });
  });

  it('prefers a run that DOES cover this sequence over one that does not', async () => {
    runsAre('run-newest-stale', 'run-covering');
    mockResolveSignedPackageForExport.mockImplementation(async ({ runId }: { runId: string }) =>
      runId === 'run-covering'
        ? signedOver(THIS_SEQUENCE, 'run-covering', SIGNED_LEAVES)
        : signedOver(THIS_SEQUENCE, runId, [{ sectionCode: 'm5.3.5.1', operation: 'new', checksum: 'md5-old' }]),
    );
    liveRows([
      ['1.us.cover', 'new', 'md5-cover'],
      ['2.3', 'new', 'md5-qos'],
    ]);

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
      sequenceId: SEQUENCE_ID,
    });

    expect(status.verdict, String(status.detail)).toBe('signed');
    expect(status.runId).toBe('run-covering');
  });

  it('says coverage was not checked when the caller names no sequence id', async () => {
    runsAre('run-a');
    mockResolveSignedPackageForExport.mockResolvedValue(signedOver(THIS_SEQUENCE, 'run-a', SIGNED_LEAVES));

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
    });

    expect(status.verdict).toBe('signed');
    expect(String(status.detail)).toMatch(/was not checked/);
    // And no leaf read was attempted — there is no sequence to read.
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });
});
