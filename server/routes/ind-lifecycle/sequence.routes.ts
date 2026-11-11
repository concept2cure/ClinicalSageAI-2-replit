/**
 * IND lifecycle — sequence-scoped routes (load a specific eCTD sequence's
 * leaves): structural validation, package manifest, sequence diff, dispatch
 * gate + snapshot, snapshot history.
 * Merged under /api/ind-lifecycle (auth applied at mount).
 */

import { Router, type Request, type Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { validateSequenceLeaves, filingTypeForSequence } from '../../services/ind-lifecycle/ind-sequence-validation';
import { buildPackageManifest } from '../../services/ind-lifecycle/ind-package-manifest';
import { assessSequenceDispatchReadiness } from '../../services/ectd/assess-dispatch-readiness';
import { indVerdictFromAssessment } from '../../services/ind-lifecycle/ind-cockpit';
import { deriveIndActionItems } from '../../services/ind-lifecycle/ind-action-items';
import { evaluateRegulatoryClock } from '../../services/ind-lifecycle/ind-regulatory-clock';
import { buildIndTimeline } from '../../services/ind-lifecycle/ind-timeline-service';
import { diffSequences } from '../../services/ind-lifecycle/ind-sequence-diff';
import { createDispatchSnapshot, listDispatchSnapshots } from '../../services/ind-lifecycle/ind-dispatch-snapshot-service';
import { renderPackageManifestPdf, renderSequenceDiffPdf } from '../../services/ind-lifecycle/ind-document-renderer';
import { listLeaves, getSequence } from '../../services/submission-service/submission-service';
import { readSubmissionSequenceForRequest, SubmissionReadError } from '../../services/submission-service/submission-request-read';
import { ProgramReadAccessError } from '../../services/c2c/current-program-access';
import { MissingRequestDbContextError, requestPgClient } from '../../db/requestDb';
import { listOverdueSafetyReports } from '../../services/ind-lifecycle/ind-safety-report-persistence';
import { AUTHOR, limiter, ctxOf, body, fail, noAuth, sendPdf, readinessFrom, filingTypeParam, FILING_TYPE_VALUES } from './shared';

const router = Router();

type Ctx = { organizationId: number; userId: number };

/** Validate a numeric path/query param > 0. */
function seqIdOf(raw: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Load a sequence + its leaves and build the package manifest. */
async function manifestForSequence(seqId: number, ctx: Ctx) {
  const [sequence, leaves] = await Promise.all([getSequence(seqId, ctx), listLeaves(seqId, ctx)]);
  return buildPackageManifest({
    sequenceNumber: sequence.sequenceNumber,
    submissionType: sequence.type,
    leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, lifecycleOp: l.lifecycleOp, checksum: l.checksum })),
  });
}

/**
 * The sequence QC reads (diff, manifest and their PDFs) admit the sequence's project for this person first, as every
 * Submission Center sequence read does (readSubmissionSequenceForRequest): getSequence answers for any sequence of
 * the organisation, so without this a colleague not on a private project read its leaves and checksums. Production
 * serves these four since P-122 (2026-11-10), claimed by the eCTD view (`ectd-compile`); a diff compares two
 * sequences of the same submission. tests/db/p122-sequence-qc.dbtest.ts.
 */
async function admitSequences(req: Request, ctx: Ctx, ids: number[]): Promise<void> {
  const q = requestPgClient(req);
  const admitted = [];
  for (const id of ids) admitted.push(await readSubmissionSequenceForRequest(q, ctx, id));
  if (new Set(admitted.map((a) => a.submissionId)).size > 1) {
    throw new SubmissionReadError(400, 'VALIDATION', 'The prior sequence must belong to the same submission.');
  }
}

/** A project or read refusal, answered with its own status; anything else goes to `fail`. */
function refuse(res: Response, err: unknown): void {
  if (err instanceof MissingRequestDbContextError) {
    // No request scope to admit the project in: refused, never read organisation-wide.
    return void res.status(503).json({ error: { code: err.code, message: 'The project could not be verified for this read.' } });
  }
  if (err instanceof SubmissionReadError || err instanceof ProgramReadAccessError) {
    const message = err.status === 503 ? 'The submission records could not be verified. Refresh and try again.' : err.message;
    return void res.status(err.status).json({ error: { code: err.code, message } });
  }
  fail(res, err);
}

/** Load a sequence's number + leaves (for the diff). */
async function sequenceForDiff(seqId: number, ctx: Ctx) {
  const [sequence, leaves] = await Promise.all([getSequence(seqId, ctx), listLeaves(seqId, ctx)]);
  return {
    sequenceNumber: sequence.sequenceNumber,
    leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, checksum: l.checksum })),
  };
}

/**
 * The dispatch verdict for a sequence, with the parts a snapshot needs.
 *
 * One verdict per sequence (decision P-33, 2026-10-15): the verdict is
 * assessSequenceDispatchReadiness — the one Submit, the Submission Center and
 * the governed freeze / dispatch / transmit steps read — mapped by
 * indVerdictFromAssessment. Nothing in the request body changes it: a clinical
 * hold is stated as not assessed rather than read from a body, and the
 * sequence's own type decides what it must carry. The structural validation,
 * package manifest and action items are returned beside it for display; the
 * body's `filingType` and readiness / clock / timeline inputs shape those, and
 * never the verdict.
 */
async function computeGateForSequence(seqId: number, b: any, ctx: Ctx) {
  const explicitFilingType = filingTypeParam(b.filingType);
  if (explicitFilingType === null) throw new Error(`VALIDATION: filingType must be one of ${FILING_TYPE_VALUES}.`);
  const [sequence, leaves] = await Promise.all([getSequence(seqId, ctx), listLeaves(seqId, ctx)]);
  const assessment = await assessSequenceDispatchReadiness({ sequenceId: seqId, organizationId: ctx.organizationId });
  const verdict = indVerdictFromAssessment(assessment);
  const filingType = explicitFilingType ?? filingTypeForSequence(sequence.type, leaves);
  const sequenceValidation = validateSequenceLeaves({ filingType, leaves: leaves.map((l) => ({ sectionCode: l.sectionCode })) });
  const manifest = buildPackageManifest({
    sequenceNumber: sequence.sequenceNumber,
    submissionType: sequence.type,
    leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, lifecycleOp: l.lifecycleOp, checksum: l.checksum })),
  });
  const clock = b.clockInput?.receiptDate ? evaluateRegulatoryClock(b.clockInput) : null;
  const timeline = b.timelineInput?.receiptDate ? buildIndTimeline(b.timelineInput) : null;
  // From the register, never the request body (see submission.routes).
  const overdueSafetyReports = (await listOverdueSafetyReports(sequence.submissionId, ctx)).length;
  const actionItems = deriveIndActionItems({
    readiness: readinessFrom(b.readinessInput, overdueSafetyReports),
    clock,
    timeline,
    sequenceValidation,
    overdueSafetyReports,
  });
  return { sequence, verdict, result: { verdict, assessment, sequenceValidation, manifest, actionItems } };
}

/**
 * Validate an existing sequence's leaves against the required section map.
 * Loads the sequence + its leaves tenant-scoped. Query: ?filingType=initial|
 * amendment|safety_report|annual|response|withdrawal; when omitted it is derived
 * from the sequence's stored type + leaves (filingTypeForSequence).
 */
router.get('/sequence/:seqId/validate', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const seqId = seqIdOf(req.params.seqId);
  if (!seqId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid sequence id.' } });
  const explicitFilingType = filingTypeParam(req.query.filingType);
  if (explicitFilingType === null) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `filingType must be one of ${FILING_TYPE_VALUES}.` } });
  }
  try {
    const [sequence, leaves] = await Promise.all([getSequence(seqId, ctx), listLeaves(seqId, ctx)]);
    const filingType = explicitFilingType ?? filingTypeForSequence(sequence.type, leaves);
    res.json(validateSequenceLeaves({ filingType, leaves: leaves.map((l) => ({ sectionCode: l.sectionCode })) }));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Dispatch-readiness verdict — the go/no-go for an eCTD sequence: the one
 * verdict, from assessSequenceDispatchReadiness (P-33). `verdict.canDispatch`
 * is the assessment's `gate.cleared`; the full assessment is returned with it.
 * Body (display only — never the verdict): { filingType?, readinessInput?,
 * clockInput?, timelineInput? }. filingType defaults from the sequence's
 * stored type + leaves (filingTypeForSequence).
 */
router.post('/sequence/:seqId/dispatch-gate', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const seqId = seqIdOf(req.params.seqId);
  if (!seqId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid sequence id.' } });
  try {
    const { result } = await computeGateForSequence(seqId, body(req), ctx);
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

/** Evaluate the dispatch gate AND persist it as an auditable snapshot. */
router.post('/sequence/:seqId/dispatch-gate/snapshot', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const seqId = seqIdOf(req.params.seqId);
  if (!seqId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid sequence id.' } });
  try {
    const { sequence, verdict, result } = await computeGateForSequence(seqId, body(req), ctx);
    const snapshot = await createDispatchSnapshot(
      { submissionId: sequence.submissionId, sequenceId: seqId, sequenceNumber: sequence.sequenceNumber, verdict },
      ctx,
    );
    res.status(201).json({ snapshot, ...result, meta: { auditTrail: snapshot.auditTrail } });
  } catch (err) {
    fail(res, err);
  }
});

/** List a sequence's dispatch-readiness snapshots (newest first). */
router.get('/sequence/:seqId/snapshots', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const seqId = seqIdOf(req.params.seqId);
  if (!seqId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid sequence id.' } });
  try {
    res.json(await listDispatchSnapshots(seqId, ctx));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * eCTD sequence diff (amendment review). Query: ?priorId=<sequenceId>.
 * Path: the current sequence id.
 */
router.get('/sequence/:currentId/diff', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const currentId = seqIdOf(req.params.currentId);
  const priorId = seqIdOf(String(req.query.priorId ?? ''));
  if (!currentId || !priorId) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'A valid current sequence id and ?priorId are required.' } });
  }
  try {
    await admitSequences(req, ctx, [currentId, priorId]);
    const [prior, current] = await Promise.all([sequenceForDiff(priorId, ctx), sequenceForDiff(currentId, ctx)]);
    res.json(diffSequences(prior, current));
  } catch (err) {
    refuse(res, err);
  }
});

/** Render the sequence diff to a PDF review sheet. */
router.get('/sequence/:currentId/diff/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const currentId = seqIdOf(req.params.currentId);
  const priorId = seqIdOf(String(req.query.priorId ?? ''));
  if (!currentId || !priorId) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'A valid current sequence id and ?priorId are required.' } });
  }
  try {
    await admitSequences(req, ctx, [currentId, priorId]);
    const [prior, current] = await Promise.all([sequenceForDiff(priorId, ctx), sequenceForDiff(currentId, ctx)]);
    await sendPdf(req, res, 'ind-sequence-diff.pdf', await renderSequenceDiffPdf(diffSequences(prior, current)));
  } catch (err) {
    refuse(res, err);
  }
});

/** Package manifest (QC review): every leaf grouped by module, with checksums. */
router.get('/sequence/:seqId/manifest', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const seqId = seqIdOf(req.params.seqId);
  if (!seqId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid sequence id.' } });
  try {
    await admitSequences(req, ctx, [seqId]);
    res.json(await manifestForSequence(seqId, ctx));
  } catch (err) {
    refuse(res, err);
  }
});

/** Render the package manifest to a PDF QC sheet. */
router.get('/sequence/:seqId/manifest/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const seqId = seqIdOf(req.params.seqId);
  if (!seqId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid sequence id.' } });
  try {
    await admitSequences(req, ctx, [seqId]);
    await sendPdf(req, res, 'ind-package-manifest.pdf', await renderPackageManifestPdf(await manifestForSequence(seqId, ctx)));
  } catch (err) {
    refuse(res, err);
  }
});

export default router;
