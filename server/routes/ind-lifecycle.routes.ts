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
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('ind-lifecycle-routes');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

function body(req: Request): any {
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function fail(res: Response, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  // The lifecycle services throw `CODE: message` strings for caller errors
  // (e.g. IND_AMENDMENT_NO_DOCUMENTS); treat those as 400, everything else 500.
  if (/^[A-Z_]+:/.test(msg)) {
    const [code] = msg.split(':', 1);
    return void res.status(400).json({ error: { code, message: msg } });
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

export default router;
