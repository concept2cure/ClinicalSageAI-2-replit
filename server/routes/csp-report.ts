/**
 * CSP violation report endpoint.
 *
 * Browsers POST to this URL whenever a Content-Security-Policy directive is
 * violated — including the report-only header we use in development. The
 * handler logs each report so we can see what would break before flipping
 * a directive from report-only to enforce.
 *
 * Two report formats land here:
 *   - `application/csp-report` — legacy `report-uri`, body `{ "csp-report": {...} }`
 *   - `application/reports+json` — newer `report-to`, body `[{ type, body, ... }]`
 *
 * The handler accepts both, normalizes the shape, and logs. Returns 204
 * regardless so a flood of violations can't tie up clients.
 */

import { Router, type Request, type Response } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('csp-report');

/**
 * Generous-but-bounded rate limit. A correctly-behaving browser sends a
 * handful of reports per page load at most; the cap blunts the impact of
 * a misbehaving extension or an attacker firing fake reports to flood our
 * logs. Keyed by IP because the endpoint is unauthenticated by design
 * (browsers send reports with no Authorization header).
 */
const reportRateLimit = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: false,
  legacyHeaders: false,
  validate: false,
  // Always respond 204 even when limited — a 429 would just have the
  // browser drop the report. The log noise is what we're optimizing for.
  handler: (_req: Request, res: Response) => {
    res.status(204).end();
  },
  keyGenerator: (req: Request) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0] || req.ip;
    return ip || 'unknown';
  },
});

interface NormalizedReport {
  documentUri?: string;
  violatedDirective?: string;
  effectiveDirective?: string;
  blockedUri?: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  disposition?: string;
}

function normalizeLegacy(body: unknown): NormalizedReport | null {
  if (!body || typeof body !== 'object') return null;
  const r = (body as { 'csp-report'?: Record<string, unknown> })['csp-report'];
  if (!r || typeof r !== 'object') return null;
  return {
    documentUri: typeof r['document-uri'] === 'string' ? r['document-uri'] : undefined,
    violatedDirective:
      typeof r['violated-directive'] === 'string' ? r['violated-directive'] : undefined,
    effectiveDirective:
      typeof r['effective-directive'] === 'string' ? r['effective-directive'] : undefined,
    blockedUri: typeof r['blocked-uri'] === 'string' ? r['blocked-uri'] : undefined,
    sourceFile: typeof r['source-file'] === 'string' ? r['source-file'] : undefined,
    lineNumber: typeof r['line-number'] === 'number' ? r['line-number'] : undefined,
    columnNumber: typeof r['column-number'] === 'number' ? r['column-number'] : undefined,
    disposition: typeof r['disposition'] === 'string' ? r['disposition'] : undefined,
  };
}

function normalizeReportingApi(body: unknown): NormalizedReport[] {
  if (!Array.isArray(body)) return [];
  const out: NormalizedReport[] = [];
  for (const entry of body) {
    if (!entry || typeof entry !== 'object') continue;
    if ((entry as { type?: string }).type !== 'csp-violation') continue;
    const r = (entry as { body?: Record<string, unknown> }).body;
    if (!r) continue;
    out.push({
      documentUri: typeof r.documentURL === 'string' ? r.documentURL : undefined,
      effectiveDirective:
        typeof r.effectiveDirective === 'string' ? r.effectiveDirective : undefined,
      blockedUri: typeof r.blockedURL === 'string' ? r.blockedURL : undefined,
      sourceFile: typeof r.sourceFile === 'string' ? r.sourceFile : undefined,
      lineNumber: typeof r.lineNumber === 'number' ? r.lineNumber : undefined,
      columnNumber: typeof r.columnNumber === 'number' ? r.columnNumber : undefined,
      disposition: typeof r.disposition === 'string' ? r.disposition : undefined,
    });
  }
  return out;
}

const router = Router();

// Browsers send CSP reports with content-type `application/csp-report` or
// `application/reports+json`. The global JSON parser only handles
// `application/json`, so install a dedicated parser here that accepts all
// three. Rate limit fires before the parser so a flood of huge bodies
// doesn't pin memory.
router.use(reportRateLimit);
router.use(
  express.json({
    type: ['application/csp-report', 'application/reports+json', 'application/json'],
    limit: '64kb',
  }),
);

router.post('/', (req: Request, res: Response) => {
  const reports: NormalizedReport[] = [];
  const single = normalizeLegacy(req.body);
  if (single) reports.push(single);
  reports.push(...normalizeReportingApi(req.body));

  if (reports.length === 0) {
    // Unknown shape — log raw for triage but don't error.
    logger.warn('CSP report with unrecognized body shape', {
      contentType: req.headers['content-type'],
      bodyKeys:
        req.body && typeof req.body === 'object' ? Object.keys(req.body as object) : 'non-object',
    });
  } else {
    for (const r of reports) {
      logger.info('CSP violation', { ...r, ua: req.headers['user-agent'] });
    }
  }

  res.status(204).end();
});

export default router;
