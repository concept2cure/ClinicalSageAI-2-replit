/**
 * IND lifecycle — analysis routes (readiness, clock, timeline, action items,
 * sequence validation, submission overview/dashboard).
 * Merged under /api/ind-lifecycle (auth applied at mount).
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { evaluateIndReadiness } from '../../services/ind-lifecycle/ind-readiness-service';
import { evaluateRegulatoryClock } from '../../services/ind-lifecycle/ind-regulatory-clock';
import { buildIndTimeline } from '../../services/ind-lifecycle/ind-timeline-service';
import { validateSequenceLeaves } from '../../services/ind-lifecycle/ind-sequence-validation';
import { deriveIndActionItems } from '../../services/ind-lifecycle/ind-action-items';
import { summarizeSequences } from '../../services/ind-lifecycle/ind-submission-overview';
import { buildIndDashboard } from '../../services/ind-lifecycle/ind-dashboard';
import { buildPackageManifest } from '../../services/ind-lifecycle/ind-package-manifest';
import { evaluateDispatchGate } from '../../services/ind-lifecycle/ind-dispatch-gate';
import { buildIndCockpit, type SequenceGateSummary } from '../../services/ind-lifecycle/ind-cockpit';
import { renderPackageManifestPdf } from '../../services/ind-lifecycle/ind-document-renderer';
import { getSubmission, listSequences, listLeaves, getSequence } from '../../services/submission-service/submission-service';
import { AUTHOR, limiter, ctxOf, body, fail, noAuth, sendPdf } from './shared';

const router = Router();

/** Build a readiness report from a readinessInput body fragment, or null. */
function readinessFrom(input: any) {
  if (!input || (input.filingType !== 'initial' && input.filingType !== 'amendment')) return null;
  return evaluateIndReadiness({
    filingType: input.filingType,
    sectionStatus: input.sectionStatus ?? {},
    completedForms: input.completedForms,
    overdueSafetyReports: input.overdueSafetyReports,
  });
}

/** Validate a sequenceValidationInput body fragment, or null. */
function validationFrom(input: any) {
  if (!input || (input.filingType !== 'initial' && input.filingType !== 'amendment') || !Array.isArray(input.leaves)) {
    return null;
  }
  return validateSequenceLeaves({ filingType: input.filingType, leaves: input.leaves });
}

/**
 * IND filing readiness — deterministic verdict over the 108-section blueprint +
 * Module 1 forms + safety clock. Body is IndReadinessInput.
 */
router.post('/readiness', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (b.filingType !== 'initial' && b.filingType !== 'amendment') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: "filingType must be 'initial' or 'amendment'." } });
  }
  try {
    res.json(
      evaluateIndReadiness({
        filingType: b.filingType,
        sectionStatus: b.sectionStatus ?? {},
        completedForms: b.completedForms,
        overdueSafetyReports: b.overdueSafetyReports,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Project the IND regulatory timeline — 30-day safe-to-proceed + annual-report
 * due-date milestones (21 CFR 312.40 / 312.33). Body: { receiptDate, ... }.
 */
router.post('/timeline', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!b.receiptDate) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'receiptDate (ISO) is required.' } });
  }
  try {
    res.json(buildIndTimeline(b));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Evaluate the IND regulatory clock — 30-day safe-to-proceed + clinical-hold
 * state (21 CFR 312.40 / 312.42). Body: { receiptDate, events?, asOf? }.
 */
router.post('/clock', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!b.receiptDate) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'receiptDate (ISO) is required.' } });
  }
  try {
    res.json(evaluateRegulatoryClock({ receiptDate: b.receiptDate, events: b.events, asOf: b.asOf }));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Prioritized next-actions for an IND, computed from the supplied analysis
 * inputs. Body: { readinessInput?, clockInput?, timelineInput?,
 * sequenceValidationInput?, overdueSafetyReports? }.
 */
router.post('/action-items', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  try {
    const clock = b.clockInput?.receiptDate ? evaluateRegulatoryClock(b.clockInput) : null;
    const timeline = b.timelineInput?.receiptDate ? buildIndTimeline(b.timelineInput) : null;
    res.json(
      deriveIndActionItems({
        readiness: readinessFrom(b.readinessInput),
        clock,
        timeline,
        sequenceValidation: validationFrom(b.sequenceValidationInput),
        overdueSafetyReports: b.overdueSafetyReports,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Validate a set of leaves against the required IND section map (pure).
 * Body: { filingType: 'initial'|'amendment', leaves: [{ sectionCode }] }.
 */
router.post('/sequence/validate', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if ((b.filingType !== 'initial' && b.filingType !== 'amendment') || !Array.isArray(b.leaves)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: "filingType ('initial'|'amendment') and leaves[] are required." } });
  }
  try {
    res.json(validateSequenceLeaves({ filingType: b.filingType, leaves: b.leaves }));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Validate an existing sequence's leaves against the required section map.
 * Loads the sequence's leaves tenant-scoped. Query: ?filingType=initial|amendment.
 */
router.get('/sequence/:seqId/validate', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const seqId = Number(req.params.seqId);
  if (!Number.isInteger(seqId) || seqId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid sequence id.' } });
  }
  const filingType = req.query.filingType === 'amendment' ? 'amendment' : 'initial';
  try {
    const leaves = await listLeaves(seqId, ctx);
    res.json(validateSequenceLeaves({ filingType, leaves: leaves.map((l) => ({ sectionCode: l.sectionCode })) }));
  } catch (err) {
    fail(res, err);
  }
});

/** Internal: load a sequence + its leaves and build the package manifest. */
async function manifestForSequence(seqId: number, ctx: { organizationId: number; userId: number }) {
  const [sequence, leaves] = await Promise.all([getSequence(seqId, ctx), listLeaves(seqId, ctx)]);
  return buildPackageManifest({
    sequenceNumber: sequence.sequenceNumber,
    submissionType: sequence.type,
    leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, lifecycleOp: l.lifecycleOp, checksum: l.checksum })),
  });
}

/**
 * Dispatch-readiness gate — the go/no-go for an eCTD sequence. Loads the
 * sequence + leaves, validates structure, builds the manifest (checksum
 * completeness), folds in unresolved critical actions from the optional
 * analysis inputs, and returns the verdict + supporting detail.
 * Body: { filingType?, readinessInput?, clockInput?, timelineInput?, overdueSafetyReports? }.
 */
router.post('/sequence/:seqId/dispatch-gate', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const seqId = Number(req.params.seqId);
  if (!Number.isInteger(seqId) || seqId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid sequence id.' } });
  }
  const b = body(req);
  const filingType = b.filingType === 'amendment' ? 'amendment' : 'initial';
  try {
    const [sequence, leaves] = await Promise.all([getSequence(seqId, ctx), listLeaves(seqId, ctx)]);
    const sequenceValidation = validateSequenceLeaves({
      filingType,
      leaves: leaves.map((l) => ({ sectionCode: l.sectionCode })),
    });
    const manifest = buildPackageManifest({
      sequenceNumber: sequence.sequenceNumber,
      submissionType: sequence.type,
      leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, lifecycleOp: l.lifecycleOp, checksum: l.checksum })),
    });
    const clock = b.clockInput?.receiptDate ? evaluateRegulatoryClock(b.clockInput) : null;
    const timeline = b.timelineInput?.receiptDate ? buildIndTimeline(b.timelineInput) : null;
    const actionItems = deriveIndActionItems({
      readiness: readinessFrom(b.readinessInput),
      clock,
      timeline,
      sequenceValidation,
      overdueSafetyReports: b.overdueSafetyReports,
    });
    const verdict = evaluateDispatchGate({
      sequenceValidation,
      manifest,
      criticalActions: actionItems.criticalCount,
      sequenceStatus: sequence.status,
    });
    res.json({ verdict, sequenceValidation, manifest, actionItems });
  } catch (err) {
    fail(res, err);
  }
});

/** Package manifest (QC review): every leaf grouped by module, with checksums. */
router.get('/sequence/:seqId/manifest', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const seqId = Number(req.params.seqId);
  if (!Number.isInteger(seqId) || seqId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid sequence id.' } });
  }
  try {
    res.json(await manifestForSequence(seqId, ctx));
  } catch (err) {
    fail(res, err);
  }
});

/** Render the package manifest to a PDF QC sheet. */
router.get('/sequence/:seqId/manifest/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const seqId = Number(req.params.seqId);
  if (!Number.isInteger(seqId) || seqId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid sequence id.' } });
  }
  try {
    sendPdf(res, 'ind-package-manifest.pdf', await renderPackageManifestPdf(await manifestForSequence(seqId, ctx)));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * IND submission overview — the submission, its eCTD sequences, and a summary
 * (counts by type/status, latest sequence number, dispatch/validation roll-ups).
 */
router.get('/submission/:id/overview', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = Number(req.params.id);
  if (!Number.isInteger(submissionId) || submissionId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  }
  try {
    const [submission, sequences] = await Promise.all([
      getSubmission(submissionId, ctx),
      listSequences(submissionId, ctx),
    ]);
    res.json({ submission, sequences, summary: summarizeSequences(sequences) });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Unified IND dashboard — sequence summary + (optional) readiness + clock +
 * timeline + sequence validation + prioritized action items. Body:
 * { readinessInput?, clockInput?, timelineInput?, sequenceValidationInput?, overdueSafetyReports? }.
 */
router.post('/submission/:id/dashboard', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = Number(req.params.id);
  if (!Number.isInteger(submissionId) || submissionId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  }
  const b = body(req);
  try {
    const sequences = await listSequences(submissionId, ctx);
    const clock = b.clockInput?.receiptDate
      ? evaluateRegulatoryClock({ receiptDate: b.clockInput.receiptDate, events: b.clockInput.events, asOf: b.clockInput.asOf })
      : null;
    const timeline = b.timelineInput?.receiptDate ? buildIndTimeline(b.timelineInput) : null;
    res.json(
      buildIndDashboard({
        sequenceSummary: summarizeSequences(sequences),
        readiness: readinessFrom(b.readinessInput),
        clock,
        timeline,
        sequenceValidation: validationFrom(b.sequenceValidationInput),
        overdueSafetyReports: b.overdueSafetyReports,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Submission cockpit — the program dashboard PLUS a dispatch-gate verdict for
 * EVERY sequence in the submission, in one call. Body (all optional):
 * { filingType?, readinessInput?, clockInput?, timelineInput?, sequenceValidationInput?, overdueSafetyReports? }.
 */
router.post('/submission/:id/cockpit', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = Number(req.params.id);
  if (!Number.isInteger(submissionId) || submissionId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  }
  const b = body(req);
  const filingType = b.filingType === 'amendment' ? 'amendment' : 'initial';
  try {
    const sequences = await listSequences(submissionId, ctx);
    const readiness = readinessFrom(b.readinessInput);
    const clock = b.clockInput?.receiptDate ? evaluateRegulatoryClock(b.clockInput) : null;
    const timeline = b.timelineInput?.receiptDate ? buildIndTimeline(b.timelineInput) : null;

    // Evaluate a dispatch gate for each sequence (loads that sequence's leaves).
    const sequenceGates: SequenceGateSummary[] = await Promise.all(
      sequences.map(async (seq) => {
        const leaves = await listLeaves(seq.id, ctx);
        const sequenceValidation = validateSequenceLeaves({
          filingType,
          leaves: leaves.map((l) => ({ sectionCode: l.sectionCode })),
        });
        const manifest = buildPackageManifest({
          sequenceNumber: seq.sequenceNumber,
          submissionType: seq.type,
          leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, lifecycleOp: l.lifecycleOp, checksum: l.checksum })),
        });
        const actions = deriveIndActionItems({
          readiness,
          clock,
          timeline,
          sequenceValidation,
          overdueSafetyReports: b.overdueSafetyReports,
        });
        const verdict = evaluateDispatchGate({
          sequenceValidation,
          manifest,
          criticalActions: actions.criticalCount,
          sequenceStatus: seq.status,
        });
        return {
          sequenceId: seq.id,
          sequenceNumber: seq.sequenceNumber,
          type: seq.type,
          status: seq.status,
          canDispatch: verdict.canDispatch,
          blockerCount: verdict.blockers.length,
          warningCount: verdict.warnings.length,
          blockerCodes: verdict.blockers.map((x) => x.code),
        };
      }),
    );

    const dashboard = buildIndDashboard({
      sequenceSummary: summarizeSequences(sequences),
      readiness,
      clock,
      timeline,
      sequenceValidation: validationFrom(b.sequenceValidationInput),
      overdueSafetyReports: b.overdueSafetyReports,
    });

    res.json(buildIndCockpit({ dashboard, sequenceGates }));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
