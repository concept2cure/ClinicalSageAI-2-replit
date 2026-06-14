/**
 * IND lifecycle — submission-scoped routes: overview, dashboard, cockpit, and
 * the drift-alert digest.
 * Merged under /api/ind-lifecycle (auth applied at mount).
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import { validateSequenceLeaves } from '../../services/ind-lifecycle/ind-sequence-validation';
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
import {
  createCrossReference,
  listCrossReferences,
  updateCrossReference,
  deleteCrossReference,
  getCrossReferenceRegister,
  CrossReferenceError,
} from '../../services/ind-lifecycle/ind-cross-reference-persistence';
import { assembleLetterOfAuthorization, buildLoaLeafIntent } from '../../services/ind-lifecycle/ind-loa-service';
import { renderLetterOfAuthorizationPdf } from '../../services/ind-lifecycle/ind-document-renderer';
import { persistCrossReferenceFiling } from '../../services/ind-lifecycle/ind-lifecycle-persistence';
import { createHash } from 'crypto';
import { AUTHOR, limiter, ctxOf, body, fail, noAuth, readinessFrom, validationFrom } from './shared';

const router = Router();

type Ctx = { organizationId: number; userId: number };

function submissionIdOf(raw: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Build a snapshot-annotated dispatch gate for every sequence in a submission.
 * Shared by the cockpit and drift routes.
 */
async function annotatedGatesForSubmission(
  sequences: Awaited<ReturnType<typeof listSequences>>,
  b: any,
  ctx: Ctx,
): Promise<SequenceGateSummary[]> {
  const filingType = b.filingType === 'amendment' ? 'amendment' : 'initial';
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

// ── Persisted cross-references (eCTD Module 1.4) ──────────────────────────────

const VALID_FILE_TYPES = ['DMF', 'IND', 'NDA', 'BLA'];

/** Record an external dependency (DMF/IND/NDA/BLA) for a submission. */
router.post('/submission/:id/cross-references', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  const b = body(req);
  if (!VALID_FILE_TYPES.includes(b.referencedFileType) || !b.referencedFileNumber || !b.subjectName) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'referencedFileType (DMF|IND|NDA|BLA), referencedFileNumber and subjectName are required.' } });
  }
  try {
    const row = await createCrossReference(
      {
        submissionId,
        referencedFileType: b.referencedFileType,
        referencedFileNumber: String(b.referencedFileNumber),
        subjectName: String(b.subjectName),
        authorizedSections: Array.isArray(b.authorizedSections) ? b.authorizedSections.map(String) : undefined,
        loaOnFile: typeof b.loaOnFile === 'boolean' ? b.loaOnFile : undefined,
        loaLeafSection: b.loaLeafSection ?? undefined,
      },
      ctx,
    );
    res.status(201).json(row);
  } catch (err) {
    fail(res, err);
  }
});

/** List a submission's cross-references. */
router.get('/submission/:id/cross-references', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  try {
    res.json(await listCrossReferences(submissionId, ctx));
  } catch (err) {
    fail(res, err);
  }
});

/** The live cross-reference register (LOA-coverage QC) computed from stored rows. */
router.get('/submission/:id/cross-reference-register', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  try {
    res.json(await getCrossReferenceRegister(submissionId, ctx));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * File the Letter of Authorization for a tracked cross-reference: render the LOA
 * from the stored dependency + the supplied holder/signatory particulars, create
 * an amendment sequence with the checksummed m1.4.1 leaf, and flip the
 * cross-reference's loaOnFile (so the register becomes ready). Body:
 * { sequenceNumber, holderName, authorizedPartyName, signatoryName, ... }.
 */
router.post('/submission/:id/cross-references/:crossRefId/file-loa', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  const crossRefId = String(Array.isArray(req.params.crossRefId) ? req.params.crossRefId[0] : req.params.crossRefId);
  const b = body(req);
  if (!/^\d{4}$/.test(String(b.sequenceNumber ?? '')) || !b.holderName || !b.authorizedPartyName || !b.signatoryName) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: '4-digit sequenceNumber, holderName, authorizedPartyName and signatoryName are required.' } });
  }
  try {
    const refs = await listCrossReferences(submissionId, ctx);
    const ref = refs.find((r) => r.id === crossRefId);
    if (!ref) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Cross-reference not found.' } });

    const model = assembleLetterOfAuthorization({
      referencedFileType: ref.referencedFileType as any,
      referencedFileNumber: ref.referencedFileNumber,
      subjectName: ref.subjectName,
      authorizedSections: (ref.authorizedSections as string[]) ?? undefined,
      holderName: String(b.holderName),
      holderAddress: b.holderAddress,
      authorizedPartyName: String(b.authorizedPartyName),
      supportingIndNumber: b.supportingIndNumber,
      signatoryName: String(b.signatoryName),
      signatoryTitle: b.signatoryTitle,
      signatureDate: b.signatureDate,
    });
    const pdf = await renderLetterOfAuthorizationPdf(model);
    const md5 = createHash('md5').update(pdf).digest('hex');
    const filed = await persistCrossReferenceFiling(
      submissionId,
      [buildLoaLeafIntent(model)],
      String(b.sequenceNumber),
      ctx,
      { 'm1.4.1': md5 },
    );
    const crossReference = await updateCrossReference(crossRefId, { loaOnFile: true, loaLeafSection: 'm1.4.1' }, ctx);
    res.status(201).json({ sequence: filed.sequence, leaves: filed.leaves, crossReference });
  } catch (err) {
    if (err instanceof CrossReferenceError) {
      return res.status(404).json({ error: { code: err.code, message: err.message } });
    }
    fail(res, err);
  }
});

/** Patch a cross-reference (e.g. mark the LOA on file). */
router.patch('/cross-references/:crossRefId', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const id = Array.isArray(req.params.crossRefId) ? req.params.crossRefId[0] : req.params.crossRefId;
  const b = body(req);
  try {
    const row = await updateCrossReference(
      String(id),
      {
        subjectName: b.subjectName,
        authorizedSections: Array.isArray(b.authorizedSections) ? b.authorizedSections.map(String) : undefined,
        loaOnFile: typeof b.loaOnFile === 'boolean' ? b.loaOnFile : undefined,
        loaLeafSection: b.loaLeafSection,
      },
      ctx,
    );
    res.json(row);
  } catch (err) {
    if (err instanceof CrossReferenceError) {
      return res.status(404).json({ error: { code: err.code, message: err.message } });
    }
    fail(res, err);
  }
});

/** Delete a cross-reference. */
router.delete('/cross-references/:crossRefId', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const id = Array.isArray(req.params.crossRefId) ? req.params.crossRefId[0] : req.params.crossRefId;
  try {
    await deleteCrossReference(String(id), ctx);
    res.status(204).end();
  } catch (err) {
    if (err instanceof CrossReferenceError) {
      return res.status(404).json({ error: { code: err.code, message: err.message } });
    }
    fail(res, err);
  }
});

export default router;
