/**
 * Compliance reports an organisation runs for an auditor or a regulator.
 *
 *   GET /api/audit/reports              the catalog, and whether this session may run it
 *   GET /api/audit/reports/:reportId    one report, sealed, recorded on the chain, then sent
 *
 * Mount with: app.use('/api', createComplianceReportRoutes(pool)); directly
 * after the audit-trail routes.
 *
 * A run, in order — each step refuses before the next one reads anything:
 *   1. the session's organisation, a usable one (usableOrgId: not 0, not
 *      negative, an integer — as report-os.ts requireSessionOrg), and the
 *      audit-reader role (requireAuditReader: owners, admins, managers,
 *      platform administrators) — the same gate as the audit trail itself;
 *   2. the rate limit per organisation and person (429 REPORT_RATE_LIMITED);
 *   3. the report (404 for none; 409 for the full audit trail, whose run is
 *      the signed export), the format and the period (400 BAD_PERIOD);
 *   4. the audit export signing key (503 REPORT_SIGNING_UNAVAILABLE on a
 *      production deployment without it);
 *   5. one run at a time per organisation (429 REPORT_IN_PROGRESS);
 *   6. the report itself: deterministic SQL on one tenant-stamped read-only
 *      snapshot (compliance-reports/generate.ts);
 *   7. the seal (signedAuditExport.ts sealManifestV2, the one signer);
 *   8. one `compliance.report_run` row on the organisation's audit chain,
 *      written BEFORE anything is sent (audited-export.ts sendAuditedExport);
 *      when it cannot be written: 503 REPORT_NOT_RECORDED and nothing leaves.
 *
 * @module server/routes/audit-compliance-reports
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Pool } from 'pg';

import { serverError } from '../lib/api-response.js';
import { canReadAuditTrail, requireAuditReader } from '../services/audit/audit-api-authority.js';
import { resolveExportSigningKey, type ResolvedExportSigningKey } from '../services/audit/auditExportKeyPosture.js';
import { sendAuditedExport, walkTenantChain } from '../services/audit/audited-export.js';
import { FULL_AUDIT_TRAIL_ID, findReport, reportSummaries } from '../services/audit/compliance-reports/catalog.js';
import { runComplianceReport } from '../services/audit/compliance-reports/generate.js';
import { platformIntegrityChecks } from '../services/audit/compliance-reports/integrity-checks.js';
import { parseReportPeriod } from '../services/audit/compliance-reports/period.js';
import {
  createReportRunLimiter,
  OrganisationRunGuard,
  REPORT_IN_PROGRESS_MESSAGE,
} from '../services/audit/compliance-reports/run-limits.js';
import {
  buildSignedReport,
  VERIFY_INSTRUCTION,
  type ReportFormat,
  type SignedReport,
} from '../services/audit/compliance-reports/signed-report.js';
import type { ReportDefinition, ReportPeriod } from '../services/audit/compliance-reports/types.js';
import { authedOrgId, usableOrgId } from '../utils/authedOrgId';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('audit-compliance-reports');

/** Who may run a report, in the words the catalog shows: AUDIT_READER_ROLES plus platform administrators. */
export const AUDIT_REPORT_READERS = 'organisation owners, admins and managers, and platform administrators';

export const REPORT_RUN_ACTION = 'compliance.report_run';
export const REPORT_RESOURCE_TYPE = 'compliance_report';

const NOT_RECORDED_MESSAGE =
  'The export was refused because it could not be recorded in the audit trail. Nothing was exported.';

function refuse(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } });
}

/**
 * The session's organisation when it is a usable one, else null after answering
 * 403. 0, a negative or a fractional id is a resolution failure, not a tenant
 * (utils/authedOrgId.ts usableOrgId; the check report-os.ts requireSessionOrg makes).
 */
function sessionOrg(req: Request, res: Response): number | null {
  const orgId = usableOrgId(authedOrgId(req));
  if (orgId == null) res.status(403).json({ error: 'Tenant context required' });
  return orgId;
}

/** The reader gate as middleware, so the rate limit after it counts only permitted requests. */
function readerGate(req: Request, res: Response, next: NextFunction): void {
  if (sessionOrg(req, res) == null) return;
  if (!requireAuditReader(req, res)) return;
  next();
}

function periodText(p: ReportPeriod): string {
  return p.kind === 'as-of' || !p.from ? `as of ${p.to}` : `${p.from} to ${p.to}`;
}

function readFormat(raw: unknown): ReportFormat | null {
  if (raw === undefined) return 'json';
  return raw === 'json' || raw === 'csv' ? raw : null;
}

/** Who ran the report, as the manifest and the chain row name them: the authenticated principal only. */
function actorOf(req: Request): { userId: number | string | null; generatedBy: string; role: string } {
  const user = (req.user ?? {}) as { id?: unknown; userId?: unknown; name?: unknown; email?: unknown; role?: unknown };
  const raw = (req as { userId?: unknown }).userId ?? user.id ?? user.userId ?? null;
  const userId = raw == null ? null : Number.isFinite(Number(raw)) ? Number(raw) : String(raw);
  const generatedBy = String(user.name || user.email || userId || 'unknown');
  return { userId, generatedBy, role: String(user.role ?? 'unknown') };
}

/** The export key, resolved before anything is read; null after answering 503. */
function signingKeyOr503(res: Response): ResolvedExportSigningKey | null {
  try {
    return resolveExportSigningKey();
  } catch (err) {
    log.error('compliance report refused: the audit export signing key is not available', {
      err: err instanceof Error ? err.message : String(err),
    });
    refuse(
      res,
      503,
      'REPORT_SIGNING_UNAVAILABLE',
      'Reports cannot be produced on this deployment because its export signing key is not available. Nothing was read or exported.',
    );
    return null;
  }
}

/** The report a request names, or null after answering 409 / 404. */
function reportOr4xx(res: Response, reportId: string): ReportDefinition | null {
  if (reportId === FULL_AUDIT_TRAIL_ID) {
    refuse(res, 409, 'USE_SIGNED_EXPORT', 'The full audit trail is produced by the signed audit trail export, for the same period.');
    return null;
  }
  const def = findReport(reportId);
  if (!def?.run) {
    refuse(res, 404, 'UNKNOWN_REPORT', 'There is no report with that name.');
    return null;
  }
  return def;
}

interface CompletedRun {
  orgId: number;
  def: ReportDefinition;
  signed: SignedReport;
}

/** Record the run on the chain, then send; refuse with nothing sent when the row cannot be written. */
async function recordAndSend(pool: Pool, req: Request, res: Response, { orgId, def, signed }: CompletedRun) {
  const { manifest } = signed;
  const actor = actorOf(req);
  try {
    await sendAuditedExport(pool, res, {
      tenantId: orgId,
      userId: actor.userId,
      action: REPORT_RUN_ACTION,
      resourceType: REPORT_RESOURCE_TYPE,
      resourceId: def.id,
      details: {
        exportId: manifest.exportId,
        reportId: def.id,
        period: manifest.period,
        format: manifest.format,
        dataHash: manifest.dataHash,
        sections: manifest.sections,
        signingKeyId: manifest.signingKeyId,
        // The sentence the audit ledger shows for this row (it reads `description` first).
        description: `Ran ${def.title} (${periodText(manifest.period)}, ${manifest.format}), export ${manifest.exportId}`,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
      filename: `${signed.filename.replace(/\.(json|csv)$/, '')}_signed.json`,
      headers: { 'X-Report-Export-Id': manifest.exportId, 'X-Report-Data-Hash': manifest.dataHash },
      refusalCode: 'REPORT_NOT_RECORDED',
      body: {
        success: true,
        export: {
          data: signed.data,
          manifest,
          signature: signed.signature,
          filename: signed.filename,
          contentType: signed.contentType,
          verification: { algorithm: 'HMAC-SHA256', signingKeyId: manifest.signingKeyId, instruction: VERIFY_INSTRUCTION },
        },
      },
    });
  } catch (err) {
    // The recording connection could not be opened: nothing was recorded, so nothing is sent.
    log.error('compliance report not recorded', { reportId: def.id, err: err instanceof Error ? err.message : String(err) });
    if (!res.headersSent) refuse(res, 503, 'REPORT_NOT_RECORDED', NOT_RECORDED_MESSAGE);
  }
}

/** Run the report and seal it; null after answering 500 (detail logged, never sent). */
async function produce(
  pool: Pool,
  req: Request,
  res: Response,
  run: { orgId: number; def: ReportDefinition; format: ReportFormat; window: Parameters<typeof runComplianceReport>[3]; signingKey: ResolvedExportSigningKey },
): Promise<SignedReport | null> {
  try {
    const { data, chain } = await runComplianceReport(pool, run.def, run.orgId, run.window, {
      walkChain: walkTenantChain,
      checks: platformIntegrityChecks,
    });
    const actor = actorOf(req);
    return buildSignedReport(data, {
      format: run.format,
      generatedBy: actor.generatedBy,
      generatedByRole: actor.role,
      basis: run.def.basis,
      chain,
      signingKey: run.signingKey,
    });
  } catch (err) {
    serverError(res, log, 'running the compliance report', err, { reportId: run.def.id });
    return null;
  }
}

export function createComplianceReportRoutes(pool: Pool): Router {
  const router = Router();
  const runLimiter = createReportRunLimiter();
  const inProgress = new OrganisationRunGuard();

  router.get('/audit/reports', (req: Request, res: Response) => {
    if (sessionOrg(req, res) == null) return;
    res.json({ success: true, canRun: canReadAuditTrail(req), readers: AUDIT_REPORT_READERS, reports: reportSummaries() });
  });

  router.get('/audit/reports/:reportId', readerGate, runLimiter, async (req: Request, res: Response) => {
    const orgId = sessionOrg(req, res);
    if (orgId == null) return;
    const def = reportOr4xx(res, String(req.params.reportId));
    if (!def) return;
    const format = readFormat(req.query.format);
    if (!format) return refuse(res, 400, 'BAD_FORMAT', 'The format must be json or csv.');
    const window = parseReportPeriod(req.query, def.period);
    if (!window.ok) return refuse(res, 400, 'BAD_PERIOD', window.message);
    const signingKey = signingKeyOr503(res);
    if (!signingKey) return;
    if (!inProgress.tryAcquire(orgId)) return refuse(res, 429, 'REPORT_IN_PROGRESS', REPORT_IN_PROGRESS_MESSAGE);
    try {
      const signed = await produce(pool, req, res, { orgId, def, format, window, signingKey });
      if (signed) await recordAndSend(pool, req, res, { orgId, def, signed });
    } finally {
      inProgress.release(orgId);
    }
  });

  return router;
}
