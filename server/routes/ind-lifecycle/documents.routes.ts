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
import { planIndAmendment } from '../../services/ind-lifecycle/ind-amendment-service';
import { assembleBriefingBook } from '../../services/ind-lifecycle/ind-briefing-book-service';
import { assembleCoverLetter } from '../../services/ind-lifecycle/ind-cover-letter-service';
import { assembleCoverLetterContext } from '../../services/ind-lifecycle/cover-letter-context';
import { buildUsRegionalEnvelope } from '../../services/ind-lifecycle/ind-ectd-envelope';
import {
  renderIndSafetyReportPdf,
  renderIndAnnualReportPdf,
  renderBriefingBookPdf,
  renderCoverLetterPdf,
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
      now: b.now ? new Date(b.now) : undefined,
    });
    if (String(req.query.format).toLowerCase() === 'xml') {
      res.setHeader('Content-Type', 'application/xml');
      return res.status(200).send(result.xml);
    }
    res.json({ icsr: result.icsr, gaps: result.gaps, completeness: result.completeness });
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
