/**
 * IND lifecycle — document/model authoring + rendering routes.
 * Merged under /api/ind-lifecycle (auth applied at mount).
 */

import { Router } from 'express';
import { requireRole } from '../../middleware/auth';
import {
  assembleIndSafetyReport,
  classifyIndSafetyReport,
} from '../../services/ind-lifecycle/ind-safety-report-service';
import { composeE2bR3Icsr } from '../../services/ind-lifecycle/e2b-icsr-composer';
import { assembleIndAnnualReport } from '../../services/ind-lifecycle/ind-annual-report-service';
import { buildSaeLineListing, saeLineListingToCsv } from '../../services/ind-lifecycle/ind-sae-line-listing';
import { planIndAmendment } from '../../services/ind-lifecycle/ind-amendment-service';
import { assembleBriefingBook } from '../../services/ind-lifecycle/ind-briefing-book-service';
import { assembleCoverLetter } from '../../services/ind-lifecycle/ind-cover-letter-service';
import { assembleLetterOfAuthorization, buildLoaLeafIntent } from '../../services/ind-lifecycle/ind-loa-service';
import {
  assembleRightOfReferenceStatement,
  buildRightOfReferenceLeafIntent,
  assembleAuthorizedPersonsList,
  buildAuthorizedPersonsLeafIntent,
  buildCrossReferenceRegister,
} from '../../services/ind-lifecycle/ind-cross-reference-service';
import { assembleCoverLetterContext } from '../../services/ind-lifecycle/cover-letter-context';
import { buildUsRegionalEnvelope } from '../../services/ind-lifecycle/ind-ectd-envelope';
import {
  renderIndSafetyReportPdf,
  renderIndAnnualReportPdf,
  renderBriefingBookPdf,
  renderCoverLetterPdf,
  renderLetterOfAuthorizationPdf,
  renderRightOfReferenceStatementPdf,
  renderAuthorizedPersonsListPdf,
} from '../../services/ind-lifecycle/ind-document-renderer';
import { getSubmission } from '../../services/submission-service/submission-service';
import { getSponsor } from '../../services/ind-master-data/ind-master-data-service';
import { AUTHOR, limiter, ctxOf, body, fail, noAuth, sendPdf, coerceEventDates } from './shared';

const router = Router();

function coverLetterValid(b: any): boolean {
  return Boolean(b?.sponsorName && b?.drugName && b?.submissionType);
}

function briefingValid(b: any): boolean {
  return Boolean(b?.productName && b?.indication && b?.meetingType && Array.isArray(b?.questions));
}

function loaValid(b: any): boolean {
  return Boolean(b?.referencedFileType && b?.referencedFileNumber && b?.holderName && b?.authorizedPartyName);
}

/** 21 CFR 312.32 — classify + build the IND Safety Report + amendment intent. */
router.post('/safety-report', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!b.event) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'event (AdverseEvent) is required.' } });
  }
  try {
    res.json(
      assembleIndSafetyReport(coerceEventDates(b.event), {
        icsr: b.icsr ?? null,
        aggregateContext: b.aggregateContext,
        now: b.now ? new Date(b.now) : undefined,
      }),
    );
  } catch (err) {
    fail(res, err);
  }
});

/** 21 CFR 312.32 — classification only (reporting obligation + deadline). */
router.post('/safety-report/classify', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!b.event) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'event (AdverseEvent) is required.' } });
  }
  try {
    res.json(classifyIndSafetyReport(coerceEventDates(b.event), b.now ? new Date(b.now) : undefined));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Compose the ICH E2B(R3) ICSR data elements for a 312.32 case and return them.
 * Body: { event, icsr?, expedited?, now? }. JSON (model + gaps + completeness)
 * by default; `?format=xml` returns the escaped E2B(R3) XML projection.
 */
router.post('/safety-report/icsr', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!b.event) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'event (AdverseEvent) is required.' } });
  }
  try {
    const result = composeE2bR3Icsr(coerceEventDates(b.event), {
      icsr: b.icsr ?? null,
      expedited: typeof b.expedited === 'boolean' ? b.expedited : undefined,
      nullificationReason: b.nullificationReason,
      mostRecentInfoDate: b.mostRecentInfoDate,
      now: b.now ? new Date(b.now) : undefined,
    });
    if (String(req.query.format).toLowerCase() === 'xml') {
      res.setHeader('Content-Type', 'application/xml');
      return res.status(200).send(result.xml);
    }
    res.json({ icsr: result.icsr, lifecycle: result.lifecycle, gaps: result.gaps, completeness: result.completeness });
  } catch (err) {
    fail(res, err);
  }
});

/** 21 CFR 312.33 / ICH E2F — assemble the IND Annual Report / DSUR section model. */
router.post('/annual-report', limiter, requireRole(AUTHOR), (req, res) => {
  try {
    res.json(assembleIndAnnualReport(body(req)));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * 21 CFR 312.33(b) / ICH E2F — aggregate serious-AE line listing + summary
 * tabulation over the supplied events for a reporting period.
 * Body: { events: AdverseEvent[], periodStart, periodEnd }. JSON by default;
 * `?format=csv` returns the line listing as an attachable CSV appendix.
 */
router.post('/annual-report/line-listing', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!Array.isArray(b.events) || !b.periodStart || !b.periodEnd) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'events[], periodStart and periodEnd are required.' } });
  }
  try {
    const listing = buildSaeLineListing({ events: b.events, periodStart: b.periodStart, periodEnd: b.periodEnd });
    if (String(req.query.format).toLowerCase() === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="ind-sae-line-listing.csv"');
      return res.status(200).send(saeLineListingToCsv(listing));
    }
    res.json(listing);
  } catch (err) {
    fail(res, err);
  }
});

/** Render the 312.32 IND Safety Report to a navigable, submission-ready PDF leaf. */
router.post('/safety-report/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  const b = body(req);
  if (!b.event) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'event (AdverseEvent) is required.' } });
  }
  try {
    const { document } = assembleIndSafetyReport(coerceEventDates(b.event), {
      icsr: b.icsr ?? null,
      aggregateContext: b.aggregateContext,
      now: b.now ? new Date(b.now) : undefined,
    });
    sendPdf(res, 'ind-safety-report.pdf', await renderIndSafetyReportPdf(document));
  } catch (err) {
    fail(res, err);
  }
});

/** Render the 312.33 IND Annual Report / DSUR to a navigable PDF leaf. */
router.post('/annual-report/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  try {
    const model = assembleIndAnnualReport(body(req));
    sendPdf(res, 'ind-annual-report.pdf', await renderIndAnnualReportPdf(model));
  } catch (err) {
    fail(res, err);
  }
});

/** 21 CFR 312.30 / 312.31 — plan a protocol / information amendment. */
router.post('/amendment-plan', limiter, requireRole(AUTHOR), (req, res) => {
  try {
    res.json(planIndAmendment(body(req)));
  } catch (err) {
    fail(res, err);
  }
});

/** Assemble the IND cover letter (eCTD Module 1.2). */
router.post('/cover-letter', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!coverLetterValid(b)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'sponsorName, drugName and submissionType are required.' } });
  }
  try {
    res.json(assembleCoverLetter(b));
  } catch (err) {
    fail(res, err);
  }
});

/** Render the IND cover letter to a PDF leaf. */
router.post('/cover-letter/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  const b = body(req);
  if (!coverLetterValid(b)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'sponsorName, drugName and submissionType are required.' } });
  }
  try {
    sendPdf(res, 'ind-cover-letter.pdf', await renderCoverLetterPdf(assembleCoverLetter(b)));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Render the IND cover letter from stored records.
 * Body: { sponsorId?, submissionId?, overrides? }. Loads the sponsor + submission
 * tenant-scoped, assembles the letter, and returns the PDF.
 */
router.post('/cover-letter/pdf-from-records', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const b = body(req);
  try {
    const [sponsor, submission] = await Promise.all([
      b.sponsorId ? getSponsor(String(b.sponsorId), ctx) : Promise.resolve(null),
      b.submissionId ? getSubmission(Number(b.submissionId), ctx) : Promise.resolve(null),
    ]);
    const input = assembleCoverLetterContext({ sponsor, submission, overrides: b.overrides });
    sendPdf(res, 'ind-cover-letter.pdf', await renderCoverLetterPdf(assembleCoverLetter(input)));
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'NOT_FOUND') {
      return res.status(404).json({ error: { code, message: 'A referenced sponsor or submission was not found.' } });
    }
    fail(res, err);
  }
});

/**
 * Assemble a Letter of Authorization / Right of Reference model (eCTD m1.4.1,
 * 21 CFR 314.420) with its gap list + placement intent.
 */
router.post('/loa', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!loaValid(b)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'referencedFileType, referencedFileNumber, holderName and authorizedPartyName are required.' } });
  }
  try {
    const model = assembleLetterOfAuthorization(b);
    res.json({ model, leafIntent: buildLoaLeafIntent(model) });
  } catch (err) {
    fail(res, err);
  }
});

/** Render a Letter of Authorization to a PDF leaf (eCTD m1.4.1). */
router.post('/loa/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  const b = body(req);
  if (!loaValid(b)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'referencedFileType, referencedFileNumber, holderName and authorizedPartyName are required.' } });
  }
  try {
    sendPdf(res, 'ind-letter-of-authorization.pdf', await renderLetterOfAuthorizationPdf(assembleLetterOfAuthorization(b)));
  } catch (err) {
    fail(res, err);
  }
});

/** Assemble the m1.4.2 Statement of Right of Reference model + gaps + intent. */
router.post('/right-of-reference', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!b?.sponsorName || !b?.referencedFileType || !b?.referencedFileNumber) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'sponsorName, referencedFileType and referencedFileNumber are required.' } });
  }
  try {
    const model = assembleRightOfReferenceStatement(b);
    res.json({ model, leafIntent: buildRightOfReferenceLeafIntent(model) });
  } catch (err) {
    fail(res, err);
  }
});

/** Render the Statement of Right of Reference to a PDF leaf (m1.4.2). */
router.post('/right-of-reference/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  const b = body(req);
  if (!b?.sponsorName || !b?.referencedFileType || !b?.referencedFileNumber) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'sponsorName, referencedFileType and referencedFileNumber are required.' } });
  }
  try {
    sendPdf(res, 'ind-right-of-reference.pdf', await renderRightOfReferenceStatementPdf(assembleRightOfReferenceStatement(b)));
  } catch (err) {
    fail(res, err);
  }
});

/** Assemble the m1.4.3 List of Authorized Persons model + gaps + intent. */
router.post('/authorized-persons', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!Array.isArray(b?.persons)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'persons[] is required.' } });
  }
  try {
    res.json({ model: assembleAuthorizedPersonsList(b), leafIntent: buildAuthorizedPersonsLeafIntent() });
  } catch (err) {
    fail(res, err);
  }
});

/** Render the List of Authorized Persons to a PDF leaf (m1.4.3). */
router.post('/authorized-persons/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  const b = body(req);
  if (!Array.isArray(b?.persons)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'persons[] is required.' } });
  }
  try {
    sendPdf(res, 'ind-authorized-persons.pdf', await renderAuthorizedPersonsListPdf(assembleAuthorizedPersonsList(b)));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Cross-reference register — every external file the IND depends on, with LOA
 * coverage. Body: { references: CrossReferenceEntry[] }. A reference without an
 * LOA on file is a blocking error.
 */
router.post('/cross-reference-register', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!Array.isArray(b?.references)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'references[] is required.' } });
  }
  try {
    res.json(buildCrossReferenceRegister(b.references));
  } catch (err) {
    fail(res, err);
  }
});

/** Assemble an FDA meeting briefing-book model (Pre-IND / Type A/B/C). */
router.post('/briefing-book', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!briefingValid(b)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'productName, indication, meetingType and questions[] are required.' } });
  }
  try {
    res.json(assembleBriefingBook(b));
  } catch (err) {
    fail(res, err);
  }
});

/** Render an FDA meeting briefing book to a navigable PDF. */
router.post('/briefing-book/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  const b = body(req);
  if (!briefingValid(b)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'productName, indication, meetingType and questions[] are required.' } });
  }
  try {
    sendPdf(res, 'fda-briefing-book.pdf', await renderBriefingBookPdf(assembleBriefingBook(b)));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Build the FDA eCTD us-regional administrative envelope for a sequence.
 * Body: EctdEnvelopeInput. Returns application/xml.
 */
router.post('/envelope', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  try {
    const xml = buildUsRegionalEnvelope(b);
    res.setHeader('Content-Type', 'application/xml');
    res.status(200).send(xml);
  } catch (err) {
    fail(res, err);
  }
});

export default router;
