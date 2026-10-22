/**
 * IND lifecycle — submission-scoped routes: overview, dashboard, cockpit, and
 * the drift-alert digest.
 * Merged under /api/ind-lifecycle (auth applied at mount).
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { assessSequenceDispatchReadiness } from '../../services/ectd/assess-dispatch-readiness';
import { evaluateRegulatoryClock } from '../../services/ind-lifecycle/ind-regulatory-clock';
import { buildIndTimeline } from '../../services/ind-lifecycle/ind-timeline-service';
import { summarizeSequences } from '../../services/ind-lifecycle/ind-submission-overview';
import { buildIndDashboard } from '../../services/ind-lifecycle/ind-dashboard';
import {
  buildIndCockpit,
  annotateGateWithSnapshot,
  buildDriftDigest,
  indVerdictFromAssessment,
  sequenceGateOf,
  type SequenceGateSummary,
} from '../../services/ind-lifecycle/ind-cockpit';
import { buildIndPortfolio, buildIndPortfolioEntry, isIndSubmission, buildPortfolioDrift, portfolioDriftToCsv } from '../../services/ind-lifecycle/ind-portfolio';
import { getLatestDispatchSnapshot } from '../../services/ind-lifecycle/ind-dispatch-snapshot-service';
import { getSubmission, listSubmissions, listSequences } from '../../services/submission-service/submission-service';
import { getCrossReferenceRegister } from '../../services/ind-lifecycle/ind-cross-reference-persistence';
import { listOverdueSafetyReports } from '../../services/ind-lifecycle/ind-safety-report-persistence';
import { AUTHOR, limiter, ctxOf, body, fail, noAuth, readinessFrom, validationFrom } from './shared';

const router = Router();

type Ctx = { organizationId: number; userId: number };

function submissionIdOf(raw: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The dispatch verdict of every sequence in a submission, each annotated with
 * its last snapshot. Shared by the cockpit, the drift digest and the portfolio
 * drift sweep.
 *
 * One verdict per sequence (decision P-33, 2026-10-15): each is the
 * sequence's own assessSequenceDispatchReadiness — the verdict Submit and the
 * governed steps read — mapped by indVerdictFromAssessment. Nothing in the
 * request body changes it; the IND gate this replaced read a clinical-hold
 * clock and a filing type from the body and blocked every sequence whose
 * caller did not describe them.
 */
async function annotatedGatesForSubmission(
  sequences: Awaited<ReturnType<typeof listSequences>>,
  ctx: Ctx,
): Promise<SequenceGateSummary[]> {
  return Promise.all(
    sequences.map(async (seq) => {
      const verdict = indVerdictFromAssessment(
        await assessSequenceDispatchReadiness({ sequenceId: seq.id, organizationId: ctx.organizationId }),
      );
      return annotateGateWithSnapshot(sequenceGateOf(seq, verdict), await getLatestDispatchSnapshot(seq.id, ctx));
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
 * The portfolio-level compliance feed: each sequence's one verdict (P-33).
 */
/** Compute the org-wide drift sweep across every IND submission. */
async function computePortfolioDrift(ctx: Ctx) {
  const inds = (await listSubmissions(ctx)).filter(isIndSubmission);
  const inputs = await Promise.all(
    inds.map(async (submission) => {
      const sequences = await listSequences(submission.id, ctx);
      const gates = await annotatedGatesForSubmission(sequences, ctx);
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
    const overdueSafetyReports = (await listOverdueSafetyReports(submissionId, ctx)).length;
    res.json(
      buildIndDashboard({
        sequenceSummary: summarizeSequences(sequences),
        readiness: readinessFrom(b.readinessInput, overdueSafetyReports),
        clock: b.clockInput?.receiptDate ? evaluateRegulatoryClock(b.clockInput) : null,
        timeline: b.timelineInput?.receiptDate ? buildIndTimeline(b.timelineInput) : null,
        sequenceValidation: validationFrom(b.sequenceValidationInput),
        overdueSafetyReports,
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
    const sequenceGates = await annotatedGatesForSubmission(sequences, ctx);
    const overdueSafetyReports = (await listOverdueSafetyReports(submissionId, ctx)).length;
    const dashboard = buildIndDashboard({
      sequenceSummary: summarizeSequences(sequences),
      readiness: readinessFrom(b.readinessInput, overdueSafetyReports),
      clock: b.clockInput?.receiptDate ? evaluateRegulatoryClock(b.clockInput) : null,
      timeline: b.timelineInput?.receiptDate ? buildIndTimeline(b.timelineInput) : null,
      sequenceValidation: validationFrom(b.sequenceValidationInput),
      overdueSafetyReports,
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
    const gates = await annotatedGatesForSubmission(sequences, ctx);
    res.json(buildDriftDigest(gates));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
