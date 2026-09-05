/**
 * IND lifecycle — persisted-register routes: the durable, tenant-scoped, audited
 * per-submission records that track regulatory documents through draft → filed.
 * Merged under /api/ind-lifecycle (auth applied at mount).
 *
 *  - Cross-references (eCTD m1.4): external file dependencies + LOA coverage,
 *    including filing the LOA as an m1.4.1 leaf.
 *  - IND Safety Reports (21 CFR 312.32): tracked drafts + overdue feed.
 *  - IND Annual Reports (21 CFR 312.33): tracked drafts + overdue feed.
 *
 * Extracted from submission.routes.ts to keep each router cohesive; paths are
 * unchanged.
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
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
import { storeRenderedLeafFile, leafSourceFor } from '../../services/ectd/rendered-leaf-files';
import {
  createSafetyReportDraft,
  listSafetyReports,
  getSafetyReport,
  listOverdueSafetyReports,
  SafetyReportError,
} from '../../services/ind-lifecycle/ind-safety-report-persistence';
import {
  createAnnualReportDraft,
  listAnnualReports,
  getAnnualReport,
  listOverdueAnnualReports,
  AnnualReportError,
} from '../../services/ind-lifecycle/ind-annual-report-persistence';
import {
  createAmendmentDraft,
  listAmendments,
  getAmendment,
  AmendmentError,
} from '../../services/ind-lifecycle/ind-amendment-persistence';
import {
  prepareIcsrTransmission,
  listIcsrTransmissions,
  transmitIcsrTransmission,
  recordIcsrAcknowledgment,
  IcsrTransmissionError,
  type IcsrTransmissionErrorCode,
} from '../../services/ind-lifecycle/ind-icsr-transmission-persistence';
import type { IcsrGateway } from '../../services/ind-lifecycle/e2b-icsr-message';
import { AUTHOR, limiter, ctxOf, body, fail, noAuth, coerceEventDates } from './shared';

const router = Router();

function submissionIdOf(raw: string | string[] | undefined): number | null {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

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
    // Retain the rendered LOA so the m1.4.1 leaf points at the filed document.
    // Keeping only its md5 left the leaf unresolvable and the sequence
    // permanently dispatch-blocked (LIFE-01).
    const pdf = await renderLetterOfAuthorizationPdf(model);
    const stored = await storeRenderedLeafFile({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      bytes: pdf,
      mime: 'application/pdf',
      fileName: 'letter-of-authorization.pdf',
      renderedFrom: 'ind_letter_of_authorization',
      sectionCode: 'm1.4.1',
    });
    const filed = await persistCrossReferenceFiling(
      submissionId,
      [buildLoaLeafIntent(model)],
      String(b.sequenceNumber),
      ctx,
      { 'm1.4.1': leafSourceFor(stored) },
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

// ── Persisted IND safety reports (21 CFR 312.32) ──────────────────────────────

/**
 * Draft a 312.32 IND Safety Report for a submission: classify the event, build
 * the document model, and persist it as a tracked draft. Body: { event, icsr?,
 * aggregateContext?, now? }. 422 when the event is not expedited-reportable.
 */
router.post('/submission/:id/safety-reports', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  const b = body(req);
  if (!b.event) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'event (AdverseEvent) is required.' } });
  }
  try {
    const row = await createSafetyReportDraft(
      {
        submissionId,
        event: coerceEventDates(b.event),
        icsr: b.icsr ?? null,
        aggregateContext: b.aggregateContext,
        now: b.now ? new Date(b.now) : undefined,
      },
      ctx,
    );
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof SafetyReportError && err.code === 'NOT_REPORTABLE') {
      return res.status(422).json({ error: { code: err.code, message: err.message } });
    }
    fail(res, err);
  }
});

/** List a submission's safety reports. */
router.get('/submission/:id/safety-reports', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  try {
    res.json(await listSafetyReports(submissionId, ctx));
  } catch (err) {
    fail(res, err);
  }
});

/** Fetch one tracked safety report by id (org-scoped; the id `create` returned). */
router.get('/safety-reports/:reportId', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const id = String(Array.isArray(req.params.reportId) ? req.params.reportId[0] : req.params.reportId);
  try {
    res.json(await getSafetyReport(id, ctx));
  } catch (err) {
    if (err instanceof SafetyReportError) {
      return res.status(404).json({ error: { code: err.code, message: err.message } });
    }
    fail(res, err);
  }
});

/** The submission's overdue (unfiled, past-deadline) safety reports. */
router.get('/submission/:id/safety-reports/overdue', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  try {
    const asOf = typeof req.query.asOf === 'string' ? new Date(req.query.asOf) : undefined;
    res.json(await listOverdueSafetyReports(submissionId, ctx, asOf));
  } catch (err) {
    fail(res, err);
  }
});

// ── Persisted IND annual reports (21 CFR 312.33) ──────────────────────────────

/**
 * Draft a 312.33 IND Annual Report / DSUR for a submission: assemble the section
 * model and persist it as a tracked draft. Body: { report: IndAnnualReportInput,
 * indEffectiveDate? }. The optional indEffectiveDate drives the 60-day due date.
 */
router.post('/submission/:id/annual-reports', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  const b = body(req);
  const report = b.report ?? b;
  if (!report?.indNumber || !report?.productName) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'report.indNumber and report.productName are required.' } });
  }
  try {
    const row = await createAnnualReportDraft({ submissionId, report, indEffectiveDate: b.indEffectiveDate }, ctx);
    res.status(201).json(row);
  } catch (err) {
    fail(res, err);
  }
});

/** List a submission's annual reports. */
router.get('/submission/:id/annual-reports', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  try {
    res.json(await listAnnualReports(submissionId, ctx));
  } catch (err) {
    fail(res, err);
  }
});

/** Fetch one tracked annual report by id (org-scoped; the id `create` returned). */
router.get('/annual-reports/:reportId', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const id = String(Array.isArray(req.params.reportId) ? req.params.reportId[0] : req.params.reportId);
  try {
    res.json(await getAnnualReport(id, ctx));
  } catch (err) {
    if (err instanceof AnnualReportError) {
      return res.status(404).json({ error: { code: err.code, message: err.message } });
    }
    fail(res, err);
  }
});

/** The submission's overdue (unfiled, past 60-day-deadline) annual reports. */
router.get('/submission/:id/annual-reports/overdue', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  try {
    const asOf = typeof req.query.asOf === 'string' ? new Date(req.query.asOf) : undefined;
    res.json(await listOverdueAnnualReports(submissionId, ctx, asOf));
  } catch (err) {
    fail(res, err);
  }
});

// ── Persisted IND amendments (21 CFR 312.30 / 312.31) ─────────────────────────

/**
 * Draft a 312.30/.31 amendment for a submission: plan it from the changed
 * documents and persist it as a tracked draft. Body: { indNumber, projectId?,
 * changedDocuments: ChangedDocument[] }.
 */
router.post('/submission/:id/amendments', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  const b = body(req);
  if (!b.indNumber || !Array.isArray(b.changedDocuments)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'indNumber and changedDocuments[] are required.' } });
  }
  try {
    const row = await createAmendmentDraft(
      { submissionId, amendment: { indNumber: String(b.indNumber), projectId: String(b.projectId ?? ''), changedDocuments: b.changedDocuments } },
      ctx,
    );
    res.status(201).json(row);
  } catch (err) {
    fail(res, err);
  }
});

/** List a submission's amendments. */
router.get('/submission/:id/amendments', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  try {
    res.json(await listAmendments(submissionId, ctx));
  } catch (err) {
    fail(res, err);
  }
});

/** Fetch one tracked amendment by id (org-scoped; the id `create` returned). */
router.get('/amendments/:amendmentId', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const id = String(Array.isArray(req.params.amendmentId) ? req.params.amendmentId[0] : req.params.amendmentId);
  try {
    res.json(await getAmendment(id, ctx));
  } catch (err) {
    if (err instanceof AmendmentError) {
      return res.status(404).json({ error: { code: err.code, message: err.message } });
    }
    fail(res, err);
  }
});

// ── Persisted ICSR transmissions (ICH E2B(R3) → FAERS / EudraVigilance) ────────

const VALID_GATEWAYS = ['FDA_FAERS', 'EMA_EUDRAVIGILANCE'];

/** ICSR transmission service codes → HTTP status. 503/502 mean NOT transmitted; the row stays 'prepared'. */
const ICSR_TX_CODE_STATUS: Record<IcsrTransmissionErrorCode, number> = {
  NOT_FOUND: 404,
  NOT_READY: 422,
  GATEWAY_NOT_CONFIGURED: 503,
  GATEWAY_TRANSMIT_FAILED: 502,
  // An acknowledgement that cannot be read, names another message, or arrives
  // for a report never transmitted is refused; the row is unchanged.
  ACK_UNREADABLE: 422,
  ACK_MISMATCH: 422,
  INVALID_STATE: 409,
};

/**
 * Prepare + persist an E2B(R3) ICSR transmission for a submission: compose the
 * ICSR, build the transmittable message, and store it as 'prepared'. Body:
 * { event, icsr?, gateway, senderId, messageNumber, receiverId?, now? }.
 */
router.post('/submission/:id/icsr-transmissions', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  const b = body(req);
  if (!b.event || !VALID_GATEWAYS.includes(b.gateway) || !b.senderId || !b.messageNumber) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'event, gateway (FDA_FAERS|EMA_EUDRAVIGILANCE), senderId and messageNumber are required.' } });
  }
  try {
    const row = await prepareIcsrTransmission(
      {
        submissionId,
        event: coerceEventDates(b.event),
        icsr: b.icsr ?? null,
        gateway: b.gateway as IcsrGateway,
        senderId: String(b.senderId),
        messageNumber: String(b.messageNumber),
        receiverId: b.receiverId,
        now: b.now ? new Date(b.now) : undefined,
      },
      ctx,
    );
    res.status(201).json(row);
  } catch (err) {
    fail(res, err);
  }
});

/** List a submission's ICSR transmissions. */
router.get('/submission/:id/icsr-transmissions', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const submissionId = submissionIdOf(req.params.id);
  if (!submissionId) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid submission id.' } });
  try {
    res.json(await listIcsrTransmissions(submissionId, ctx));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Transmit a prepared ICSR to its agency gateway. Only a real gateway receipt
 * marks it transmitted: 422 not-ready (gaps returned), 503 gateway not
 * configured (or a simulated receipt), 502 transport failure — in each case
 * nothing was sent and the row stays 'prepared'.
 */
router.post('/icsr-transmissions/:txId/transmit', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const id = String(Array.isArray(req.params.txId) ? req.params.txId[0] : req.params.txId);
  try {
    res.json(await transmitIcsrTransmission(id, ctx));
  } catch (err) {
    if (err instanceof IcsrTransmissionError) {
      return res.status(ICSR_TX_CODE_STATUS[err.code]).json({ error: { code: err.code, message: err.message, ...err.details } });
    }
    fail(res, err);
  }
});

/** Record an agency acknowledgment (ACK) against a transmission. Body: { ackXml }. */
router.post('/icsr-transmissions/:txId/acknowledge', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const id = String(Array.isArray(req.params.txId) ? req.params.txId[0] : req.params.txId);
  const b = body(req);
  if (typeof b.ackXml !== 'string' || b.ackXml.length === 0) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'ackXml (string) is required.' } });
  }
  try {
    res.json(await recordIcsrAcknowledgment(id, b.ackXml, ctx));
  } catch (err) {
    if (err instanceof IcsrTransmissionError) {
      // Every service refusal used to surface as 404 here, so a refused
      // acknowledgement (unreadable, wrong message, never transmitted) read
      // as "no such transmission" to the caller.
      return res.status(ICSR_TX_CODE_STATUS[err.code]).json({ error: { code: err.code, message: err.message, ...err.details } });
    }
    fail(res, err);
  }
});

export default router;
