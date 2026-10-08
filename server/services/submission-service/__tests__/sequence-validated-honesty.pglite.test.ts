/**
 * "Validated" means validated, and a governed step is asked before it is signed
 * (QA 2026-10-08, browser walk j6 of the Submission Center).
 *
 * Findings this pins, each reproduced on the running app first:
 *   2. A sequence moved Assembling → Validated with no validation run; the
 *      server checked only the state map and left validation_status NULL.
 *      Now the move runs the sequence's deterministic validation (the
 *      dispatch-readiness findings the Validation tab shows), refuses it while
 *      any finding is an error, and records validation_status 'passed'.
 *   3. A leaf placed into (or removed from) a Validated sequence left it
 *      Validated. Now a leaf change returns it to Assembling and clears the
 *      recorded verdict, in the same locked transaction; a placement that
 *      changes nothing (the same document again) leaves it Validated.
 *   5. No UI removed a leaf. The removal the Builder now offers carries its
 *      reason, and the LEAF_REMOVED row records it.
 *   1. The freeze e-signature was taken before the gate refused. The precheck
 *      runs the step's own gates without a signature and answers the refusal.
 *
 * Real SQL on in-process PGlite: the submission core and leaf sources from the
 * harness, the Shadow Review store the assessor reads; the release-signature
 * resolver is stubbed as in assess-dispatch-readiness.vault-leaf.pglite.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pool: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  get pool() { return holder.pool; },
}));
vi.mock('../../../db.js', () => ({
  get db() { return holder.db; },
  get pool() { return holder.pool; },
}));
const logAction = vi.hoisted(() => vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })));
vi.mock('../../auditService', () => ({ default: { logAction } }));
vi.mock('../../ectd/release-signature-status', async (importOriginal) => ({
  resolveReleaseSignatureStatus: async () => ({ verdict: 'unsigned', detail: 'stubbed: no release signature store in this harness' }),
  isReleaseSignatureRequired: () => false,
  signingNowResolvesRelease: (await importOriginal<typeof import('../../ectd/release-signature-status')>()).signingNowResolvesRelease,
}));

import { assessSequenceDispatchReadiness } from '../../ectd/assess-dispatch-readiness';
import {
  transitionSequence,
  upsertLeaf,
  removeLeaf,
  precheckGovernedStep,
  SubmissionError,
} from '../submission-service';

let harness: IndPgliteDb;
const CTX = { organizationId: 3, userId: 11 };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

async function q<T = any>(text: string, params: unknown[] = []) {
  return (await harness.pglite.query<T>(text, params)).rows;
}

async function doc(content: string, status = 'approved'): Promise<number> {
  const [r] = await q<{ id: number }>(
    `INSERT INTO coauthor_documents (organization_id, title, content, module_number, status)
     VALUES ($1, 'Clinical Overview', $2, 'm2.5', $3) RETURNING id`,
    [CTX.organizationId, content, status],
  );
  return Number(r.id);
}

async function sequence(status: string): Promise<number> {
  const [s] = await q<{ id: number }>(
    `INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by)
     VALUES ('IND', 'ind', 'biotech', 'fda', $1, $2) RETURNING id`,
    [CTX.organizationId, CTX.userId],
  );
  const [seq] = await q<{ id: number }>(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, organization_id, created_by)
     VALUES ($1, 'fda', '0000', 'original', $2, $3, $4) RETURNING id`,
    [Number(s.id), status, CTX.organizationId, CTX.userId],
  );
  return Number(seq.id);
}

async function rawLeaf(sequenceId: number, documentId: number, pin: string | null, sectionCode = '2.5'): Promise<void> {
  await q(
    `INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id,
       document_content_sha256, organization_id, created_by)
     VALUES ($1, $2, 'Clinical Overview', 'new', 'coauthor_documents', $3, $4, $5, $6)`,
    [sequenceId, sectionCode, documentId, pin, CTX.organizationId, CTX.userId],
  );
}

async function row(sequenceId: number): Promise<{ status: string; validation_status: string | null }> {
  const [r] = await q<{ status: string; validation_status: string | null }>(
    `SELECT status, validation_status FROM ectd_sequences WHERE id = $1`,
    [sequenceId],
  );
  return r;
}

/**
 * The Module 1 sections the regional record requires of an original IND
 * (1.14 and 1.14.4 are satisfied by their sub-sections). Since QA 2026-10-08
 * (j7) a missing one is a validation error, so a sequence that is meant to
 * validate cleanly carries them, each an approved document with content.
 */
const IND_MODULE1 = ['1.1', '1.2', '1.3', '1.12.14', '1.14.4.1', '1.14.4.2', '1.20'];
async function completeModule1(sequenceId: number): Promise<void> {
  for (const code of IND_MODULE1) {
    const body = `Module 1 ${code} body.`;
    await rawLeaf(sequenceId, await doc(body), sha(body), code);
  }
}

const place = (sequenceId: number, documentId: number, sectionCode = '2.5') =>
  upsertLeaf(
    { sequenceId, sectionCode, title: 'Clinical Overview', lifecycleOp: 'new', documentTable: 'coauthor_documents', documentId, reason: 'Approved overview for this sequence' },
    CTX,
  );

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  holder.pool = { query: (text: string, params?: unknown[]) => harness.pglite.query(text, params as unknown[]) };
  await harness.pglite.exec(`
    CREATE TABLE IF NOT EXISTS shadow_review_runs (
      id SERIAL PRIMARY KEY, sequence_id INTEGER NOT NULL, region TEXT NOT NULL DEFAULT 'fda', lens TEXT NOT NULL DEFAULT 'fda_filing',
      model TEXT, prompt_version TEXT, status TEXT NOT NULL DEFAULT 'running', rtf_risk_score REAL, crl_risk_score REAL, summary TEXT,
      organization_id INTEGER NOT NULL, created_by INTEGER, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), deleted_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS shadow_review_findings (
      id SERIAL PRIMARY KEY, run_id INTEGER NOT NULL, dimension TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL, detail TEXT,
      basis TEXT, recommendation TEXT, leaf_ref TEXT, status TEXT NOT NULL DEFAULT 'open', organization_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), deleted_at TIMESTAMPTZ
    );
  `);
}, 60_000);

afterAll(async () => {
  await harness?.close();
});

beforeEach(() => logAction.mockClear());

describe('Validated is reached only through a validation with no errors (finding 2)', () => {
  it('refuses Validated while the validation finds an error, names it, and changes nothing', async () => {
    const seq = await sequence('assembling');
    await completeModule1(seq);
    await rawLeaf(seq, await doc(''), null); // an empty document: it cannot be assembled

    const err = await transitionSequence(seq, 'validated', CTX).catch((e) => e);

    expect(err).toBeInstanceOf(SubmissionError);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.message).toMatch(/1 error/);
    expect(err.message).toContain('2.5');
    expect(err.message).toContain('no authored content');
    expect(await row(seq)).toEqual({ status: 'assembling', validation_status: null });
  });

  it('marks a sequence Validated when its validation finds no error, and records the verdict', async () => {
    const seq = await sequence('assembling');
    await completeModule1(seq);
    await rawLeaf(seq, await doc('Approved clinical overview body.'), sha('Approved clinical overview body.'));

    const moved = await transitionSequence(seq, 'validated', CTX);

    expect(moved.status).toBe('validated');
    expect(await row(seq)).toEqual({ status: 'validated', validation_status: 'passed' });
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SEQUENCE_TRANSITIONED', details: expect.objectContaining({ to: 'validated', validation: expect.objectContaining({ errors: 0 }) }) }),
    );
  });

  /* QA 2026-10-08 (j7, finding 4): a one-leaf original IND read "structural
     gate satisfied" because every missing section was a warning. */
  it('an original IND missing a section the regulation requires is not Validated, and the refusal names it', async () => {
    const seq = await sequence('assembling');
    await rawLeaf(seq, await doc('Approved clinical overview body.'), sha('Approved clinical overview body.'));

    const err = await transitionSequence(seq, 'validated', CTX).catch((e) => e);

    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.message).toMatch(/found 7 errors/); // 1.1, 1.2, 1.3, 1.12.14, 1.14.4.1, 1.14.4.2, 1.20
    expect(err.message).toContain('1.1: Required section 1.1 has no leaf in this sequence.');
    expect(err.message).toContain('original IND application');
    expect(await row(seq)).toEqual({ status: 'assembling', validation_status: null });
  });
});

/* P-22 (product decision 2026-10-08): approval gates the release, not the
   technical validation. Until then an unapproved document failed Validated
   (FD5 applied as an error); now Validated reports it as a warning and every
   release step refuses it, naming it, before any signature is taken. */
describe('a document not yet approved: a warning at Validated, a refusal at freeze, dispatch and transmit (P-22)', () => {
  async function validatedWithDraft(): Promise<number> {
    const seq = await sequence('assembling');
    await completeModule1(seq);
    await rawLeaf(seq, await doc('Draft overview body.', 'draft'), sha('Draft overview body.'));
    return seq;
  }

  it('Validated records the sequence and counts the document as not yet approved', async () => {
    const seq = await validatedWithDraft();

    const moved = await transitionSequence(seq, 'validated', CTX);

    expect(moved.status).toBe('validated');
    expect(await row(seq)).toEqual({ status: 'validated', validation_status: 'passed' });
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SEQUENCE_TRANSITIONED',
        details: expect.objectContaining({ to: 'validated', validation: expect.objectContaining({ errors: 0, notYetApproved: 1 }) }),
      }),
    );
  });

  it('the freeze and dispatch prechecks refuse it by name, before any signature', async () => {
    const seq = await validatedWithDraft();
    await transitionSequence(seq, 'validated', CTX);

    const freeze = await precheckGovernedStep(seq, 'freeze', CTX);
    expect(freeze.cleared).toBe(false);
    expect(freeze.refusal).toMatch(/Dispatch gate blocks frozen: 1 leaf points at a document not yet approved/);

    await q(`UPDATE ectd_sequences SET status = 'frozen' WHERE id = $1`, [seq]);
    const dispatch = await precheckGovernedStep(seq, 'dispatch', CTX);
    expect(dispatch.cleared).toBe(false);
    expect(dispatch.refusal).toMatch(/Dispatch gate blocks dispatched: 1 leaf points at a document not yet approved/);
  });

  it('transmit refuses a dispatched sequence that still carries it', async () => {
    const seq = await validatedWithDraft();
    await q(`UPDATE ectd_sequences SET status = 'dispatched' WHERE id = $1`, [seq]);

    const transmit = await precheckGovernedStep(seq, 'transmit', CTX, { environment: 'staging' });

    expect(transmit.cleared).toBe(false);
    expect(transmit.refusal).toMatch(/^Dispatch gate blocks transmit: .*1 leaf points at a document not yet approved/);
  });
});

describe('a leaf change returns a Validated sequence to Assembling (finding 3)', () => {
  it('placing a leaf into a Validated sequence reverts it, clears the verdict, and says so', async () => {
    const seq = await sequence('assembling');
    await completeModule1(seq);
    await rawLeaf(seq, await doc('Body one.'), sha('Body one.'));
    await transitionSequence(seq, 'validated', CTX);
    const second = await doc('Body two.');

    const placed = await place(seq, second, '2.7.1');

    expect(placed.sequenceStatusChanged).toMatchObject({ from: 'validated', to: 'assembling' });
    expect(await row(seq)).toEqual({ status: 'assembling', validation_status: null });
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SEQUENCE_TRANSITIONED', details: expect.objectContaining({ from: 'validated', to: 'assembling', cause: 'leaf_changed' }) }),
    );
  });

  it('placing the same document again changes nothing, so the sequence stays Validated', async () => {
    const seq = await sequence('assembling');
    await completeModule1(seq);
    const d = await doc('Body three.');
    await place(seq, d);
    await transitionSequence(seq, 'validated', CTX);

    const again = await place(seq, d);

    expect(again.unchanged).toBe(true);
    expect(again.sequenceStatusChanged).toBeUndefined();
    expect(await row(seq)).toEqual({ status: 'validated', validation_status: 'passed' });
  });

  it('removing a leaf from a Validated sequence reverts it, and the removal records its reason (finding 5)', async () => {
    const seq = await sequence('assembling');
    await completeModule1(seq);
    const keep = await place(seq, await doc('Body four.'));
    const extra = await place(seq, await doc('Body five.'), '2.7.2');
    await transitionSequence(seq, 'validated', CTX);
    logAction.mockClear();

    const removal = await removeLeaf(extra.id, seq, CTX, 'Placed by mistake; not part of this sequence');

    expect(removal.sequenceStatusChanged).toMatchObject({ from: 'validated', to: 'assembling' });
    expect(await row(seq)).toEqual({ status: 'assembling', validation_status: null });
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LEAF_REMOVED', details: expect.objectContaining({ reason: 'Placed by mistake; not part of this sequence' }) }),
    );
    expect(keep.id).not.toBe(extra.id);
  });
});

describe('a governed step is asked before it is signed (finding 1)', () => {
  it('the freeze precheck answers the gate refusal without any signature', async () => {
    const seq = await sequence('assembling');
    await completeModule1(seq);
    await rawLeaf(seq, await doc('Body six.'), sha('Body six.'));
    await transitionSequence(seq, 'validated', CTX);

    const verdict = await precheckGovernedStep(seq, 'freeze', CTX);

    expect(verdict.cleared).toBe(false);
    expect(verdict.refusal).toMatch(/Dispatch gate blocks frozen: .*Shadow Review/);
    expect(await row(seq)).toEqual({ status: 'validated', validation_status: 'passed' });
  });

  it('a step the state map does not allow is refused by the precheck, not thrown', async () => {
    const seq = await sequence('draft');
    const verdict = await precheckGovernedStep(seq, 'freeze', CTX);
    expect(verdict).toMatchObject({ cleared: false, refusal: 'Cannot transition sequence from draft to frozen.' });
  });

  it('the transmit precheck refuses a sequence that is not dispatched, before anything is signed', async () => {
    const seq = await sequence('validated');
    const verdict = await precheckGovernedStep(seq, 'transmit', CTX, { environment: 'staging' });
    expect(verdict.cleared).toBe(false);
    expect(verdict.refusal).toBe('Sequence must be dispatched before transmit (current: validated).');
    expect(verdict.transmit?.route).toMatchObject({ ok: true, gateway: 'esg' });
  });
});

/* QA 2026-10-08 (j7, finding 20): Vorelinib sequence 0000 read "VALIDATED"
   (stored before 0e50993c5, no verdict) beside a gate its validation errors
   block. The assessment says whether the stored stage still holds. */
describe('a stored Validated stage is checked against the current validation (finding 20)', () => {
  it('a sequence stored as Validated with no verdict, whose validation finds errors, does not hold — and says why', async () => {
    const seq = await sequence('validated'); // as stored before verdicts were recorded
    await rawLeaf(seq, await doc('Approved clinical overview body.'), sha('Approved clinical overview body.'));

    const a = await assessSequenceDispatchReadiness({ sequenceId: seq, organizationId: CTX.organizationId });

    expect(a.validatedStage).toMatchObject({ holds: false, verdictRecorded: false, errors: 7 });
    expect(a.validatedStage && !a.validatedStage.holds && a.validatedStage.reason).toMatch(/recorded as Validated, but its validation now finds 7 errors/);
  });

  it('a sequence Validated through the validation holds', async () => {
    const seq = await sequence('assembling');
    await completeModule1(seq);
    await transitionSequence(seq, 'validated', CTX);

    const a = await assessSequenceDispatchReadiness({ sequenceId: seq, organizationId: CTX.organizationId });

    expect(a.validatedStage).toEqual({ holds: true, verdictRecorded: true });
  });
});
