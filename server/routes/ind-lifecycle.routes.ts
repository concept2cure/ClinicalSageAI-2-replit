/**
 * IND lifecycle REST surface — RA workflows that the audit flagged as missing.
 *
 * Mounted at /api/ind-lifecycle with authenticateToken applied at mount time
 * (see server/bootstrap/register-ind-lifecycle-routes.ts).
 *
 *  - POST /safety-report           21 CFR 312.32 IND Safety Report (classify +
 *                                  narrative + eCTD amendment intent)
 *  - POST /safety-report/classify  classification only (7-day / 15-day / none)
 *  - POST /annual-report           21 CFR 312.33 / ICH E2F DSUR section model
 *  - POST /amendment-plan          312.30 / 312.31 amendment plan
 *
 * These entrypoints are pure/deterministic compute over the supplied case /
 * program data; persistence of the produced intents (creating ectd_sequences +
 * submission_leaves) is a separate, tenant-scoped step via submission-service.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import {
  assembleIndSafetyReport,
  classifyIndSafetyReport,
} from '../services/ind-lifecycle/ind-safety-report-service';
import { assembleIndAnnualReport } from '../services/ind-lifecycle/ind-annual-report-service';
import { planIndAmendment } from '../services/ind-lifecycle/ind-amendment-service';
import { evaluateIndReadiness } from '../services/ind-lifecycle/ind-readiness-service';
import { assembleBriefingBook } from '../services/ind-lifecycle/ind-briefing-book-service';
import {
  renderIndSafetyReportPdf,
  renderIndAnnualReportPdf,
  renderBriefingBookPdf,
} from '../services/ind-lifecycle/ind-document-renderer';
import {
  persistSafetyReportIntent,
  persistAmendmentPlan,
} from '../services/ind-lifecycle/ind-lifecycle-persistence';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('ind-lifecycle-routes');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

interface Ctx {
  userId: number;
  organizationId: number;
}
function ctxOf(req: Request): Ctx | null {
  const r = req as any;
  const userId = Number(r.user?.id);
  const orgRaw = r.tenantContext?.organizationId ?? r.tenantId ?? r.user?.organizationId;
  const organizationId = Number(orgRaw);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(organizationId) || organizationId <= 0) {
    return null;
  }
  return { userId, organizationId };
}

function body(req: Request): any {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

// submission-service error codes → HTTP status (for the /file persistence routes).
const SUBMISSION_CODE_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  FORBIDDEN: 403,
  VALIDATION: 400,
};

function fail(res: Response, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code && SUBMISSION_CODE_STATUS[code]) {
    return void res.status(SUBMISSION_CODE_STATUS[code]).json({
      error: { code, message: err instanceof Error ? err.message : 'Request failed.' },
    });
  }
  const msg = err instanceof Error ? err.message : String(err);
  // The lifecycle services throw `CODE: message` strings for caller errors
  // (e.g. IND_AMENDMENT_NO_DOCUMENTS); treat those as 400, everything else 500.
  if (/^[A-Z_]+:/.test(msg)) {
    const [c] = msg.split(':', 1);
    return void res.status(400).json({ error: { code: c, message: msg } });
  }
  logger.error('ind-lifecycle route error', { err: msg });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Request failed.' } });
}

/** 21 CFR 312.32 — classify + build the IND Safety Report + amendment intent. */
router.post('/safety-report', limiter, requireRole(AUTHOR), (req, res) => {
  const b = body(req);
  if (!b.event) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'event (AdverseEvent) is required.' } });
  }
  try {
    res.json(
      assembleIndSafetyReport(b.event, {
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
    res.json(classifyIndSafetyReport(b.event, b.now ? new Date(b.now) : undefined));
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

function sendPdf(res: Response, filename: string, buf: Buffer): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.status(200).send(buf);
}

/** Render the 312.32 IND Safety Report to a navigable, submission-ready PDF leaf. */
router.post('/safety-report/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  const b = body(req);
  if (!b.event) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'event (AdverseEvent) is required.' } });
  }
  try {
    const { document } = assembleIndSafetyReport(b.event, {
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

function briefingValid(b: any): boolean {
  return Boolean(b?.productName && b?.indication && b?.meetingType && Array.isArray(b?.questions));
}

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

function noAuth(res: Response) {
  return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
}

/**
 * File a 312.32 IND Safety Report as an eCTD amendment sequence + leaves.
 * Body: { submissionId, sequenceNumber, event, icsr?, aggregateContext?, now? }.
 */
router.post('/safety-report/file', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const b = body(req);
  const submissionId = Number(b.submissionId);
  if (!Number.isInteger(submissionId) || submissionId <= 0 || !/^\d{4}$/.test(String(b.sequenceNumber ?? ''))) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'submissionId (int) and 4-digit sequenceNumber are required.' } });
  }
  if (!b.event) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'event (AdverseEvent) is required.' } });
  }
  try {
    const { amendmentIntent } = assembleIndSafetyReport(b.event, {
      icsr: b.icsr ?? null,
      aggregateContext: b.aggregateContext,
      now: b.now ? new Date(b.now) : undefined,
    });
    if (!amendmentIntent) {
      return res.status(422).json({ error: { code: 'NOT_REPORTABLE', message: 'Event is not an expedited IND safety report; nothing to file.' } });
    }
    res.status(201).json(await persistSafetyReportIntent(submissionId, amendmentIntent, String(b.sequenceNumber), ctx));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * File a 312.30 / 312.31 amendment as an eCTD amendment sequence + leaves.
 * Body: { submissionId, sequenceNumber, projectId, indNumber, changedDocuments }.
 */
router.post('/amendment/file', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const b = body(req);
  const submissionId = Number(b.submissionId);
  if (!Number.isInteger(submissionId) || submissionId <= 0 || !/^\d{4}$/.test(String(b.sequenceNumber ?? ''))) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'submissionId (int) and 4-digit sequenceNumber are required.' } });
  }
  try {
    const plan = planIndAmendment(b);
    res.status(201).json(await persistAmendmentPlan(submissionId, plan, String(b.sequenceNumber), ctx));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
