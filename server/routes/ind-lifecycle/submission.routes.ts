/**
 * IND lifecycle — submission-scoped routes: overview, dashboard, cockpit, and
 * the drift-alert digest.
 * Merged under /api/ind-lifecycle (auth applied at mount).
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { validateSequenceLeaves, filingTypeForSequence } from '../../services/ind-lifecycle/ind-sequence-validation';
import { buildPackageManifest } from '../../services/ind-lifecycle/ind-package-manifest';
import { evaluateDispatchGate } from '../../services/ind-lifecycle/ind-dispatch-gate';
import { deriveIndActionItems } from '../../services/ind-lifecycle/ind-action-items';
import { evaluateRegulatoryClock } from '../../services/ind-lifecycle/ind-regulatory-clock';
import { buildIndTimeline } from '../../services/ind-lifecycle/ind-timeline-service';
import { summarizeSequences } from '../../services/ind-lifecycle/ind-submission-overview';
import { buildIndDashboard } from '../../services/ind-lifecycle/ind-dashboard';
import { buildIndCockpit, annotateGateWithSnapshot, buildDriftDigest, type SequenceGateSummary } from '../../services/ind-lifecycle/ind-cockpit';
import { buildIndPortfolio, buildIndPortfolioEntry, isIndSubmission, buildPortfolioDrift, portfolioDriftToCsv } from '../../services/ind-lifecycle/ind-portfolio';
import { getLatestDispatchSnapshot } from '../../services/ind-lifecycle/ind-dispatch-snapshot-service';
import { getSubmission, listSubmissions, listSequences, listLeaves } from '../../services/submission-service/submission-service';
import { getCrossReferenceRegister } from '../../services/ind-lifecycle/ind-cross-reference-persistence';
import { AUTHOR, limiter, ctxOf, body, fail, noAuth, readinessFrom, validationFrom, filingTypeParam, FILING_TYPE_VALUES } from './shared';

const router = Router();

type Ctx = { organizationId: number; userId: number };

function submissionIdOf(raw: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Build a snapshot-annotated dispatch gate for every sequence in a submission.
 * Shared by the cockpit and drift routes. Each sequence is validated as the
 * filing type its stored type + leaves imply (filingTypeForSequence) unless the
 * body pins one for all of them.
 */
async function annotatedGatesForSubmission(
  sequences: Awaited<ReturnType<typeof listSequences>>,
  b: any,
  ctx: Ctx,
): Promise<SequenceGateSummary[]> {
  const explicitFilingType = filingTypeParam(b.filingType);
  if (explicitFilingType === null) throw new Error(`VALIDATION: filingType must be one of ${FILING_TYPE_VALUES}.`);
  const readiness = readinessFrom(b.readinessInput);
  const clock = b.clockInput?.receiptDate ? evaluateRegulatoryClock(b.clockInput) : null;
  const timeline = b.timelineInput?.receiptDate ? buildIndTimeline(b.timelineInput) : null;

  // Unauthorized external dependencies hard-block dispatch for the whole
  // submission; compute once from the cross-reference register.
  const submissionId = (sequences[0] as { submissionId?: number } | undefined)?.submissionId;
  const unauthorizedCrossReferences = submissionId
    ? (await getCrossReferenceRegister(submissionId, ctx)).counts.missingLoa
    : 0;

  return Promise.all(
    sequences.map(async (seq) => {
      const leaves = await listLeaves(seq.id, ctx);
      const filingType = explicitFilingType ?? filingTypeForSequence(seq.type, leaves);
      const sequenceValidation = validateSequenceLeaves({ filingType, leaves: leaves.map((l) => ({ sectionCode: l.sectionCode })) });
      const manifest = buildPackageManifest({
        sequenceNumber: seq.sequenceNumber,
        submissionType: seq.type,
        leaves: leaves.map((l) => ({ sectionCode: l.sectionCode, title: l.title, lifecycleOp: l.lifecycleOp, checksum: l.checksum })),
      });
      const actions = deriveIndActionItems({ readiness, clock, timeline, sequenceValidation, overdueSafetyReports: b.overdueSafetyReports });
      const verdict = evaluateDispatchGate({
        sequenceValidation,
        manifest,
        criticalActions: actions.criticalCount,
        sequenceStatus: seq.status,
        unauthorizedCrossReferences,
      });
      const latest = await getLatestDispatchSnapshot(seq.id, ctx);
      return annotateGateWithSnapshot(
        {
          sequenceId: seq.id,
          sequenceNumber: seq.sequenceNumber,
          type: seq.type,
          status: seq.status,
          canDispatch: verdict.canDispatch,
          blockerCount: verdict.blockers.length,
          warningCount: verdict.warnings.length,
          blockerCodes: verdict.blockers.map((x) => x.code),
        },
        latest,
      );
    }),
  );
}

/**
 * IND portfolio — every IND submission for the org at a glance, each with its
 * eCTD sequence summary, plus portfolio totals. One call for a CRO / program
 * manager.
 */
router.get('/portfolio', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  try {
    const all = await listSubmissions(ctx);
    const inds = all.filter(isIndSubmission);
    const entries = await Promise.all(
      inds.map(async (s) => {
        const [sequences, register] = await Promise.all([listSequences(s.id, ctx), getCrossReferenceRegister(s.id, ctx)]);
        return buildIndPortfolioEntry(s, sequences, {
          total: register.counts.total,
          missingLoa: register.counts.missingLoa,
          ready: register.ready,
        });
      }),
    );
    res.json(buildIndPortfolio(entries));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Org-wide drift sweep — across every IND submission, the sequences whose live
 * dispatch verdict has drifted from their last snapshot, or were never verified.
 * The portfolio-level compliance feed. (Computes the structural live verdict; no
 * per-submission analysis inputs.)
 */
/** Compute the org-wide drift sweep across every IND submission. */
async function computePortfolioDrift(ctx: Ctx) {
  const inds = (await listSubmissions(ctx)).filter(isIndSubmission);
  const inputs = await Promise.all(
    inds.map(async (submission) => {
      const sequences = await listSequences(submission.id, ctx);
      const gates = await annotatedGatesForSubmission(sequences, {}, ctx);
      return { submission, drift: buildDriftDigest(gates) };
    }),
  );
  return buildPortfolioDrift(inputs);
}

router.get('/portfolio/drift', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  try {
    res.json(await computePortfolioDrift(ctx));
  } catch (err) {
    fail(res, err);
  }
});

/** The org-wide drift sweep as a CSV — an attachable QA / inspection artifact. */
router.get('/portfolio/drift/csv', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  try {
    const csv = portfolioDriftToCsv(await computePortfolioDrift(ctx));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ind-portfolio-drift.csv"');
    res.status(200).send(csv);
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
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  try {
    const [submission, sequences] = await Promise.all([getSubmission(submissionId, ctx), listSequences(submissionId, ctx)]);
    res.json({ submission, sequences, summary: summarizeSequences(sequences) });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Unified IND dashboard — sequence summary + (optional) readiness + clock +
 * timeline + sequence validation + prioritized action items.
 */
router.post('/submission/:id/dashboard', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  const b = body(req);
  try {
    const sequences = await listSequences(submissionId, ctx);
    res.json(
      buildIndDashboard({
        sequenceSummary: summarizeSequences(sequences),
        readiness: readinessFrom(b.readinessInput),
        clock: b.clockInput?.receiptDate ? evaluateRegulatoryClock(b.clockInput) : null,
        timeline: b.timelineInput?.receiptDate ? buildIndTimeline(b.timelineInput) : null,
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
 * EVERY sequence in the submission, in one call.
 */
router.post('/submission/:id/cockpit', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  const b = body(req);
  try {
    const sequences = await listSequences(submissionId, ctx);
    const sequenceGates = await annotatedGatesForSubmission(sequences, b, ctx);
    const dashboard = buildIndDashboard({
      sequenceSummary: summarizeSequences(sequences),
      readiness: readinessFrom(b.readinessInput),
      clock: b.clockInput?.receiptDate ? evaluateRegulatoryClock(b.clockInput) : null,
      timeline: b.timelineInput?.receiptDate ? buildIndTimeline(b.timelineInput) : null,
      sequenceValidation: validationFrom(b.sequenceValidationInput),
      overdueSafetyReports: b.overdueSafetyReports,
    });
    const register = await getCrossReferenceRegister(submissionId, ctx);
    res.json(
      buildIndCockpit({
        dashboard,
        sequenceGates,
        crossReferences: {
          total: register.counts.total,
          withLoa: register.counts.withLoa,
          missingLoa: register.counts.missingLoa,
          ready: register.ready,
        },
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Drift-alert digest — the sequences in a submission whose live dispatch verdict
 * has drifted from their last recorded snapshot, or that were never verified.
 */
router.post('/submission/:id/drift', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  try {
    const sequences = await listSequences(submissionId, ctx);
    const gates = await annotatedGatesForSubmission(sequences, body(req), ctx);
    res.json(buildDriftDigest(gates));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
