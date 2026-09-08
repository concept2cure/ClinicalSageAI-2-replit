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

vi.mock('../signed-package-export.js', async () => {
  const actual = await vi.importActual<typeof import('../signed-package-export.js')>(
    '../signed-package-export.js',
  );
  return {
    ...actual,
    resolveSignedPackageForExport: (...args: unknown[]) => mockResolveSignedPackageForExport(...args),
  };
});

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

/** The runs the submission-grained query returns, newest first. */
function runsAre(...runIds: string[]) {
  mockDbExecute.mockResolvedValue({ rows: runIds.map(run_id => ({ run_id })) });
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

beforeEach(() => {
  mockResolveSignedPackageForExport.mockReset();
  mockDbExecute.mockReset();
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
    const status = await resolveReleaseSignatureStatus({
      submissionId: SUBMISSION,
      organizationId: ORG,
      sequenceNumber: THIS_SEQUENCE,
    });
    expect(status.verdict).toBe('unsigned');
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
});
