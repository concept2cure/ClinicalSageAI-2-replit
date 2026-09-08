/**
 * resolveReleaseSignatureStatus — a release signature clears the sequence it
 * signed, and no other.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `assess-dispatch-readiness` is keyed on a SEQUENCE — it reads `ectd_sequences`
 * and that sequence's ordered `submission_leaves`, and every other gate it
 * composes is computed from them. Its release-signature verdict was not: it
 * passed `sequence.submissionId` and the resolver selected the newest
 * orchestrator runs for that SUBMISSION, comparing none of them to the sequence
 * being assessed.
 *
 * A submission holds many sequences — 0000 original, 0001 amendment, and so on.
 * So a release signed over sequence 0000's package cleared the dispatch gate for
 * 0001, 0002 and every later sequence under the same submission, none of which
 * anyone had signed. That is precisely the failure signed-package-export.ts:8-13
 * says the signed-export path exists to prevent — "a user could orchestrate +
 * sign package A and then export package B under the same submission id — the
 * signature did not bind what actually shipped" — reintroduced one layer up, at
 * the gate that decides whether the dispatch may happen at all.
 *
 * The resolver had no test of any kind; the file added alongside it tests only
 * the pure `evaluateReleaseSignatureGate` and `isReleaseSignatureRequired`, so
 * nothing exercised the lookup itself.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • a run that signed THIS sequence clears it;
 *   • a run that signed a DIFFERENT sequence under the same submission does NOT
 *     clear it, and says so rather than reporting a signature that exists;
 *   • among several runs, the one matching this sequence is the one that counts;
 *   • integrity verdicts still win: a tampered package on a run for THIS
 *     sequence reports 'invalid' rather than being skipped as non-matching;
 *   • a lookup failure is still 'undetermined', never 'unsigned'.
 *
 * The digest and seal are computed by the REAL functions, so a run that clears
 * here is one that genuinely satisfies the integrity chain.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockResolveSignedPackageForExport = vi.fn();
const mockDbExecute = vi.fn();
const mockSequenceSpine = vi.fn();

vi.mock('../signed-package-export.js', async () => {
  const actual = await vi.importActual<typeof import('../signed-package-export.js')>(
    '../signed-package-export.js',
  );
  return {
    ...actual,
    resolveSignedPackageForExport: (...args: unknown[]) => mockResolveSignedPackageForExport(...args),
  };
});

vi.mock('../sequence-release-signature.js', () => ({
  resolveSequenceReleaseSignature: (...args: unknown[]) => mockSequenceSpine(...args),
}));

vi.mock('../../../db.js', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));

vi.mock('../../../lib/unified-ai-client.js', () => ({
  ai: { complete: vi.fn(async () => '') },
}));

import fs from 'node:fs';
import path from 'node:path';

import { resolveReleaseSignatureStatus } from '../release-signature-status';

const ORG = 42;
const SUBMISSION = 7;
/** The sequence being assessed. */
const THIS_SEQUENCE = '0001';
/** Another sequence under the SAME submission — signed, but not this one. */
const OTHER_SEQUENCE = '0000';

/** The runs the submission-grained query returns, newest first.
 *  A second, defaulted result covers the unlinked-run probe below. */
function runsAre(...runIds: string[]) {
  mockDbExecute.mockResolvedValue({ rows: [] });
  mockDbExecute.mockResolvedValueOnce({ rows: runIds.map(run_id => ({ run_id })) });
}

/** How many runs carry this submission's id as TEXT but no joinable FK. */
function unlinkedRunsAre(n: number) {
  mockDbExecute.mockResolvedValueOnce({ rows: [{ n }] });
}

/** A signed descriptor for `sequenceNumber`, as resolveSignedPackageForExport returns. */
function signedFor(sequenceNumber: string, runId: string) {
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
      leaves: [],
      signatureId: 991,
      payloadDigest: `digest-for-${sequenceNumber}`,
      sealVerdict: 'ok',
    },
  };
}

const SEQUENCE_ID = 5150;

beforeEach(() => {
  mockResolveSignedPackageForExport.mockReset();
  mockDbExecute.mockReset();
  mockSequenceSpine.mockReset();
  // Default: the submissions spine holds nothing, so every case above keeps
  // asserting the orchestrator spine's own behaviour.
  mockSequenceSpine.mockResolvedValue({ verdict: 'unsigned', detail: 'no dispatch-intent signature' });
});

describe('resolveReleaseSignatureStatus — the verdict is about THIS sequence', () => {
  it('clears when a run signed this very sequence', async () => {
    runsAre('run-a');
    mockResolveSignedPackageForExport.mockResolvedValue(signedFor(THIS_SEQUENCE, 'run-a'));

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
    });

    expect(status.verdict).toBe('signed');
    expect(status.runId).toBe('run-a');
    expect(status.signatureId).toBe(991);
  });

  it('does NOT clear on a signature taken over a different sequence of the same submission', async () => {
    // The whole defect in one case: the submission has exactly one signed run,
    // and it signed sequence 0000. Sequence 0001 has been signed by nobody.
    runsAre('run-for-0000');
    mockResolveSignedPackageForExport.mockResolvedValue(signedFor(OTHER_SEQUENCE, 'run-for-0000'));

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
    });

    expect(status.verdict, 'another sequence\'s signature cleared this one').toBe('unsigned');
    // And it must say WHY, rather than implying no signature exists anywhere.
    expect(String(status.detail)).toMatch(/sequence/i);
  });

  it('picks the run that signed this sequence out of several', async () => {
    runsAre('run-newest-other', 'run-mine', 'run-older-other');
    mockResolveSignedPackageForExport.mockImplementation(async ({ runId }: { runId: string }) =>
      runId === 'run-mine' ? signedFor(THIS_SEQUENCE, 'run-mine') : signedFor(OTHER_SEQUENCE, runId),
    );

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
    });

    expect(status.verdict).toBe('signed');
    expect(status.runId).toBe('run-mine');
  });

  it('reports a tampered package on THIS sequence as invalid, not as non-matching', async () => {
    // Integrity failures must never be skipped over in the search for a
    // matching run: 'invalid' is evidence of tampering and blocks
    // unconditionally, so it has to survive the sequence filter.
    runsAre('run-a');
    mockResolveSignedPackageForExport.mockResolvedValue({
      ok: false,
      refusal: 'digest-drift',
      detail: 'the package content changed after signing',
    });

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
    });

    expect(status.verdict).toBe('invalid');
  });

  it('reports a lookup failure as undetermined, never as unsigned', async () => {
    mockDbExecute.mockRejectedValue(new Error('connection reset'));

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
    });

    expect(status.verdict).toBe('undetermined');
  });

  it('is unsigned when the submission has no runs at all', async () => {
    runsAre();
    unlinkedRunsAre(0);
    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
    });
    expect(status.verdict).toBe('unsigned');
  });

  /* ── Runs exist, but nothing can join them ─────────────────────────────────
     submission_orchestrator_runs.submission_id_fk is OPTIONAL by design: the
     orchestrator writes it only when a caller supplies it, and the route never
     did, so every run the product created carried NULL. The lookup above joins
     on exactly that column, so it found nothing — and the gate then reported
     'unsigned', i.e. "you have not signed a release", to a customer who had
     orchestrated and signed one. 'unsigned' is a fixable state an operator is
     told to resolve by signing; signing again produces another unlinked run and
     changes nothing.
     Absence of a JOIN is not absence of a SIGNATURE. When runs carry this
     submission's id as TEXT but no FK, the honest verdict is that it cannot be
     determined — which blocks just the same, but says something true and names
     the thing to repair. */
  it('reports undetermined, not unsigned, when runs exist under this submission but carry no FK', async () => {
    runsAre();
    unlinkedRunsAre(3);

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
    });

    expect(status.verdict, 'an unlinked run read as "no signature"').toBe('undetermined');
    expect(String(status.detail)).toMatch(/not linked|unlinked/i);
  });

  it('still says unsigned when the probe itself fails — no positive evidence of a run', async () => {
    // The probe is the only thing that can upgrade the verdict, so a probe that
    // cannot answer must not invent an upgrade. The primary lookup succeeded
    // and found nothing, which is what gets reported.
    mockDbExecute.mockResolvedValueOnce({ rows: [] });
    mockDbExecute.mockRejectedValueOnce(new Error('probe failed'));

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
    });

    expect(status.verdict).toBe('unsigned');
  });
});

/* ── The two spines ────────────────────────────────────────────────────────────
   A release can be signed on either of two spines, and this resolver could see
   only one. The orchestrator spine signs a built package (package.sign on a
   run); the SUBMISSIONS spine signs the sequence itself — a governed sign on
   'ectd-sequence:<id>' whose bound_payload_digest is a sha256 over that
   sequence's row and its ordered leaf manifest, i.e. exactly what a dispatch
   would transmit.

   A submission authored through the submissions spine has no orchestrator run
   at all. It was therefore reported 'unsigned' — and because the gate REQUIRES
   a release signature for IND / NDA / BLA / MAA, which is every type it applies
   to, dispatch and transmit were unreachable for it however correctly the
   operator signed. The gate was not protecting anything there; it was denying a
   signature that existed.

   What must not change while fixing that: the orchestrator spine's DEFINITE
   answers still win, an integrity failure on either spine still blocks, and an
   undetermined orchestrator lookup is never rescued by the other spine — an
   outage there is an 'invalid' we cannot see. */
describe('a release signed on the submissions spine', () => {
  /** The orchestrator spine holds nothing for this submission. */
  function noOrchestratorRuns() {
    runsAre();
    unlinkedRunsAre(0);
  }

  it('clears the gate when the sequence itself carries a verified release signature', async () => {
    noOrchestratorRuns();
    mockSequenceSpine.mockResolvedValue({
      verdict: 'signed',
      detail: 'signed for dispatch on ectd-sequence:5150, bound to the current leaf manifest',
      signatureId: 4242,
    });

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
      sequenceId: SEQUENCE_ID,
    });

    expect(
      status.verdict,
      'a sequence signed through the product\'s own governed path still reads as unsigned',
    ).toBe('signed');
    expect(status.signatureId).toBe(4242);
  });

  it('addresses the submissions spine by SEQUENCE id, scoped to this organization', async () => {
    noOrchestratorRuns();
    await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
      sequenceId: SEQUENCE_ID,
    });
    expect(mockSequenceSpine).toHaveBeenCalledWith({ sequenceId: SEQUENCE_ID, organizationId: ORG });
  });

  it('blocks on a sequence signature that no longer binds its content', async () => {
    // Drift is evidence of tampering or staleness, and it blocks whether or not
    // the orchestrator spine had anything to say.
    noOrchestratorRuns();
    mockSequenceSpine.mockResolvedValue({
      verdict: 'invalid',
      detail: 'the sequence changed after it was signed for dispatch',
    });

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
      sequenceId: SEQUENCE_ID,
    });

    expect(status.verdict).toBe('invalid');
  });

  it('reports a revoked sequence signature as revoked, not as unsigned', async () => {
    noOrchestratorRuns();
    mockSequenceSpine.mockResolvedValue({ verdict: 'revoked', detail: 'superseded' });

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
      sequenceId: SEQUENCE_ID,
    });

    expect(status.verdict).toBe('revoked');
  });

  it('says so about BOTH spines when neither holds a signature', async () => {
    noOrchestratorRuns();

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
      sequenceId: SEQUENCE_ID,
    });

    expect(status.verdict).toBe('unsigned');
    expect(String(status.detail)).toMatch(/orchestrator/i);
    expect(
      String(status.detail),
      'the detail implies only the orchestrator spine was checked',
    ).toMatch(/dispatch-intent signature/i);
  });

  it('NEVER rescues a tampered orchestrator signature', async () => {
    // The whole point of returning early on a definite orchestrator verdict.
    // 'invalid' means a signature exists on that spine and does not verify; a
    // valid signature elsewhere is not permission to ignore it.
    runsAre('run-a');
    mockResolveSignedPackageForExport.mockResolvedValue({
      ok: false,
      refusal: 'digest-drift',
      detail: 'the package content changed after signing',
    });
    mockSequenceSpine.mockResolvedValue({ verdict: 'signed', signatureId: 1 });

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
      sequenceId: SEQUENCE_ID,
    });

    expect(status.verdict, 'a tampered orchestrator signature was cleared by the other spine').toBe('invalid');
    expect(mockSequenceSpine, 'the other spine was consulted at all').not.toHaveBeenCalled();
  });

  it('does NOT consult the other spine when the orchestrator lookup is undetermined', async () => {
    // An outage on the orchestrator spine hides whatever it would have said —
    // possibly 'invalid'. Clearing on the other spine would let that through.
    mockDbExecute.mockRejectedValue(new Error('connection reset'));
    mockSequenceSpine.mockResolvedValue({ verdict: 'signed', signatureId: 1 });

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
      sequenceId: SEQUENCE_ID,
    });

    expect(status.verdict).toBe('undetermined');
    expect(mockSequenceSpine).not.toHaveBeenCalled();
  });

  it('leaves the orchestrator answer alone when no sequence id is supplied', async () => {
    noOrchestratorRuns();
    mockSequenceSpine.mockResolvedValue({ verdict: 'signed', signatureId: 1 });

    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
    });

    expect(status.verdict).toBe('unsigned');
    expect(mockSequenceSpine).not.toHaveBeenCalled();
  });
});

describe('the assessor actually passes the sequence', () => {
  /* Everything above tests the resolver in isolation, and the resolver falls
     back to submission-wide behaviour when no sequenceNumber is supplied. So a
     call site that stops passing one would silently restore the very defect
     this file exists to prevent, with all six cases above still green.
     assessSequenceDispatchReadiness is DB-bound — which is why its own tests
     extract pure helpers rather than drive it — so the call site is pinned at
     the source, the same way aiDraftAttribution pins the editor's two capture
     sites. */
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', 'assess-dispatch-readiness.ts'),
    'utf8',
  );

  it('is the only caller, and it hands the resolver this sequence', () => {
    const calls = src.match(/resolveReleaseSignatureStatus\(\{[\s\S]*?\}\)/g) ?? [];
    expect(calls, 'the assessor no longer calls the resolver').toHaveLength(1);
    expect(
      /sequenceNumber:\s*sequence\.sequenceNumber/.test(calls[0] ?? ''),
      'the assessor resolves a release signature WITHOUT naming its sequence, so a ' +
        'signature over any other sequence of the same submission clears this one',
    ).toBe(true);
  });

  it('hands the resolver the sequence ID, or the submissions spine is unreachable', () => {
    // sequenceId is typed optional so a submission-grained caller keeps
    // compiling; that leaves the second spine one deleted argument away from
    // being dead code, and its absence reads as 'unsigned' — the exact false
    // statement this pair of changes removes.
    const calls = src.match(/resolveReleaseSignatureStatus\(\{[\s\S]*?\}\)/g) ?? [];
    expect(
      /(^|[^A-Za-z])sequenceId\s*,/.test(calls[0] ?? ''),
      'the assessor no longer passes sequenceId, so a release signed on the ' +
        'submissions spine cannot be seen and reads as unsigned',
    ).toBe(true);
  });
});
