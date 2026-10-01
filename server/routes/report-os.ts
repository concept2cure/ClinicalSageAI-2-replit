import { Router, Request, Response } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, getPool } from '../db';
import { authedOrgId, usableOrgId } from '../utils/authedOrgId';
import {
  reportProgramGroups,
  reportProgramGroupProjects,
  reportProgramGroupSnapshots,
  reportRuns,
  reportSnapshots,
  reportRunDependencies,
  reportTypeRegistry,
  reportScopeEnum,
  type ReportScope,
} from '@shared/schema/report-os';
import { projectIntelligenceProfiles, projectMemoryEntries, projects } from '@shared/schema';
import * as schema from '@shared/schema';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import { resolveScope } from '../services/report-os/scope-model';
import {
  deriveOrgSegments,
  filterTypesForSegment,
  type SegmentFilterableType,
} from '../services/report-os/segment';
import {
  requireReportEntitlement,
  decideReportEntitlement,
  type ReportEntitlementDecision,
} from '../services/report-os/entitlement-map';
import { fetchPortfolioReport, fetchOrgPortfolioSummary } from '../services/report-os/portfolio/fetch';
import { resolveCapabilities } from '../services/entitlements/resolver';
import type { Tier } from '../services/entitlements/types';
import { computeInitialRun } from '../services/report-os/orchestrator';
import { renderReport, gapsWereEvaluated, type RenderInput } from '../services/report-os/render/render';
import type { RenderedReport } from '../services/report-os/render/types';
import { buildSealedRecord } from '../services/report-os/sealing/seal';
import { readRunSeal, readSealForExport, readVerifiedSealedDocument } from '../services/report-os/sealing/run-seal';
import { buildRunPdf } from '../services/report-os/pdf/run-pdf';
import { buildBundlePdf } from '../services/report-os/pdf/bundle-pdf';
import type { SealedRecord } from '../services/report-os/sealing/types';
import { decideDelivery } from '../services/report-os/scheduling/delivery';
import {
  evaluateTruthfulness,
  type TruthfulnessRules,
  type ReportRunStatus,
} from '../services/report-os/truthfulness';
import { authMiddleware } from '../auth';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';
import { writeChainedAuditRow } from '../services/auditService';
import type { PoolClient } from 'pg';
import { requireRole } from '../middleware/auth';
import { requireEditorAccessForWrites } from '../middleware/orgMembership';
import { signingAttemptLimiter } from '../middleware/signing-attempt-limiter';
import {
  GovernedSignatureRefusal,
  signGovernedAct,
  signerIpAddress,
  type CeremonySignMeaning,
} from '../services/part11/governed-signature-ceremony';
import { requireGovernedReason } from './governed-reason';
import { projectsInOrg, submissionInProject, workspaceIsOrganisations, WORKSPACE_NOT_IN_ORGANIZATION } from '../services/report-os/ownership';
import { PREDICTION_NOT_A_RUN, isPredictionFamily } from '../services/report-os/prediction/report-types';
import { REPORT_FINALIZE_ROLES } from '@shared/constants/permissions';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';

const router = Router();

const logger = createScopedLogger('report-os');
router.use(authMiddleware);
/* Reporting review 2026-10-01: only finalize asked for a role, so a read-only
   'viewer' could create runs, program groups, snapshots, bundles and
   deliveries. Every write now needs a writing role; finalize keeps its
   narrower requireRole. Reads stay open to a viewer. */
router.use(requireEditorAccessForWrites);

/*
 * Request schemas carry no organization and no actor. Both come from the
 * verified session (requireSessionOrg, getUserId): seven of these schemas used
 * to accept an `organizationId`, and every handler behind them used it, which
 * let any signed-in user list, compute and write another tenant's reports; the
 * `createdBy` / `requestedBy` beside them let the same user sign as anyone
 * (ledger L184). Zod strips unknown keys, so a client that still sends either
 * field is ignored rather than refused.
 */
const createProgramGroupSchema = z.object({
  clientWorkspaceId: z.number().int().positive().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  projectIds: z.array(z.number().int().positive()).min(1),
  metadata: z.record(z.unknown()).optional(),
});

const createProgramSnapshotSchema = z.object({
  snapshotLabel: z.string().optional(),
  snapshotReason: z.string().optional(),
});

const createRunSchema = z.object({
  clientWorkspaceId: z.number().int().positive().optional(),
  scopeType: z.enum(reportScopeEnum),
  scopeId: z.string().min(1),
  reportTypeId: z.string().min(1),
  registryId: z.string().max(80).optional(),
  submissionType: z.string().max(80).optional(),
});

const listRunsSchema = z.object({
  scopeType: z.string().optional(),
  scopeId: z.string().optional(),
  status: z.string().optional(),
  reportTypeId: z.string().optional(),
  search: z.string().optional(),
  sortBy: z
    .enum(['createdAt', 'completedAt', 'confidence', 'status', 'reportType', 'scopeType'])
    .optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const createBundleSchema = z.object({
  name: z.string().min(2).max(180),
  description: z.string().max(1000).optional(),
  runIds: z.array(z.number().int().positive()).min(1),
});

const createDeliverySchema = z
  .object({
    projectId: z.number().int().positive().optional(),
    runId: z.number().int().positive().optional(),
    bundleId: z.string().uuid().optional(),
    submissionId: z.string().optional(),
    channel: z.enum(['platform_send', 'external_pdf_export']),
    correspondenceType: z.string().max(80).optional(),
    recipients: z.array(z.string().max(200)).default([]),
    subject: z.string().min(2).max(240),
    message: z.string().max(20000).optional(),
    urgency: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    captureForLearning: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (!value.runId && !value.bundleId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either runId or bundleId is required',
        path: ['runId'],
      });
    }
    if (value.channel === 'platform_send' && !value.submissionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'submissionId is required for platform_send',
        path: ['submissionId'],
      });
    }
  });

type ReportBundleItem = {
  runId: number;
  runUuid: string;
  reportTypeId: string;
  reportTypeLabel: string;
  scopeType: string;
  scopeId: string;
  status: string;
  confidence: number | null;
  blockers: string[];
  createdAt: string;
};

type ReportBundleRecord = {
  bundleId: string;
  organizationId: number;
  name: string;
  description?: string;
  createdAt: string;
  createdBy?: number;
  projectIds?: number[];
  runIds: number[];
  items: ReportBundleItem[];
};

type DeliveryRecord = {
  deliveryId: string;
  organizationId: number;
  projectId?: number;
  runId?: number;
  bundleId?: string;
  submissionId?: string;
  channel: 'platform_send' | 'external_pdf_export';
  correspondenceType?: string;
  recipients: string[];
  subject: string;
  message?: string;
  status: 'sent' | 'exported' | 'queued' | 'failed';
  requestedBy?: number;
  createdAt: string;
  correspondenceId?: string;
};

const REPORT_OS_RECORD_SOURCE = 'report_os_state';
const REPORT_OS_BUNDLE_SUBCATEGORY = 'report_bundle_record';
const REPORT_OS_DELIVERY_SUBCATEGORY = 'report_delivery_record';

const reportBundleRecordSchema = z.object({
  bundleId: z.string().uuid(),
  organizationId: z.number().int().positive(),
  name: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
  createdBy: z.number().int().positive().optional(),
  projectIds: z.array(z.number().int().positive()).optional(),
  runIds: z.array(z.number().int().positive()),
  items: z.array(
    z.object({
      runId: z.number().int().positive(),
      runUuid: z.string(),
      reportTypeId: z.string(),
      reportTypeLabel: z.string(),
      scopeType: z.string(),
      scopeId: z.string(),
      status: z.string(),
      confidence: z.number().nullable(),
      blockers: z.array(z.string()),
      createdAt: z.string(),
    })
  ),
});

const reportDeliveryRecordSchema = z.object({
  deliveryId: z.string().uuid(),
  organizationId: z.number().int().positive(),
  projectId: z.number().int().positive().optional(),
  runId: z.number().int().positive().optional(),
  bundleId: z.string().uuid().optional(),
  submissionId: z.string().optional(),
  channel: z.enum(['platform_send', 'external_pdf_export']),
  correspondenceType: z.string().optional(),
  recipients: z.array(z.string()),
  subject: z.string(),
  message: z.string().optional(),
  status: z.enum(['sent', 'exported', 'queued', 'failed']),
  requestedBy: z.number().int().positive().optional(),
  createdAt: z.string(),
  correspondenceId: z.string().uuid().optional(),
});

function parseKeywordIssues(text: string) {
  const normalized = text.toLowerCase();
  const matches: Array<{ category: string; severity: string; blocker: boolean }> = [];

  if (/(refuse to file|rtf|rejection|reject)/i.test(normalized)) {
    matches.push({ category: 'filing_acceptance_issue', severity: 'critical', blocker: true });
  }
  if (/(deficiency|missing information|clarification)/i.test(normalized)) {
    matches.push({
      category: 'missing_information_clarification',
      severity: 'high',
      blocker: true,
    });
  }
  if (/(safety|adverse event|signal)/i.test(normalized)) {
    matches.push({ category: 'clinical_safety_issue', severity: 'high', blocker: true });
  }
  if (/(efficacy|endpoint|benefit-risk)/i.test(normalized)) {
    matches.push({ category: 'clinical_efficacy_issue', severity: 'medium', blocker: false });
  }
  if (/(cmc|stability|specification|quality)/i.test(normalized)) {
    matches.push({ category: 'cmc_quality_issue', severity: 'high', blocker: true });
  }
  if (/(format|ectd|technical)/i.test(normalized)) {
    matches.push({ category: 'ectd_technical_formatting', severity: 'medium', blocker: false });
  }
  if (matches.length === 0) {
    matches.push({ category: 'other_unclassified', severity: 'low', blocker: false });
  }
  return matches;
}

function safeIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function toBlockerArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').slice(0, 20);
}

function getUserId(req: Request): number | undefined {
  const candidate = Number((req as any)?.userId ?? (req as any)?.user?.id);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : undefined;
}

/**
 * The caller's organization, from the verified session — never from the
 * request. Sends the 403 and returns null when the session carries none.
 * `usableOrgId` rather than a bare finite check: an org of 0 is a resolution
 * failure, not a tenant (see server/utils/authedOrgId.ts).
 */
function requireSessionOrg(req: Request, res: Response): number | null {
  const orgId = usableOrgId(authedOrgId(req));
  if (orgId == null) {
    res.status(403).json({ error: 'Tenant context required' });
    return null;
  }
  return orgId;
}

/*
 * A report run, its finalization (the seal) and the PDF export of a run or a
 * bundle are events on the record (21 CFR Part 11 §11.10(e)). Until 2026-09-30
 * none of them wrote an audit row. Each is now one chained audit_logs row on
 * the organization's chain, written on a transaction stamped with the
 * organization (setTenantContextTx), so it is written under row-level security.
 * A delivery joined them on 2026-10-01 (P1-44): its row is written on the same
 * transaction as the letter and the delivery record (recordDelivery).
 */
type ReportAuditAction =
  | 'report_os.run_created'
  | 'report_os.run_finalized'
  | 'report_os.run_exported'
  | 'report_os.bundle_exported'
  | 'report_os.delivery_sent'
  | 'report_os.delivery_exported';

interface ReportAuditEvent {
  organizationId: number;
  action: ReportAuditAction;
  resourceType: 'report_run' | 'report_bundle' | 'report_delivery';
  resourceId: string;
  details: Record<string, unknown>;
}

/**
 * Run `fn` in one transaction on one connection, stamped with the
 * organization. Commits when `fn` resolves; rolls back and rethrows otherwise.
 */
async function inTenantTransaction<T>(organizationId: number, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, organizationId);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** The chained audit row for `event`, on `client`'s open transaction. */
function writeReportEvent(client: PoolClient, req: Request, event: ReportAuditEvent): Promise<void> {
  return writeChainedAuditRow(client, {
    tenantId: event.organizationId,
    userId: getUserId(req),
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    details: event.details,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
  });
}

/**
 * Write one chained row in its own tenant-stamped transaction. True when it
 * committed. False when it did not: the reason goes to the log, never into a
 * response. The same two steps as sendAuditedExport
 * (services/audit/audited-export.ts), which sends JSON only and so cannot carry
 * a PDF.
 */
async function recordReportEvent(req: Request, event: ReportAuditEvent): Promise<boolean> {
  try {
    await inTenantTransaction(event.organizationId, (client) => writeReportEvent(client, req, event));
    return true;
  } catch (error) {
    logger.error('report event not recorded on the audit chain', {
      action: event.action,
      resourceId: event.resourceId,
      error: (error as Error)?.message,
    });
    return false;
  }
}

/** 503: the act was not recorded on the audit chain. Says what does and does not exist. */
function refuseUnrecorded(res: Response, code: string, message: string, data?: Record<string, unknown>) {
  return res.status(503).json({ success: false, error: { code, message }, ...(data ? { data } : {}) });
}

/** POST /runs' chain row: the run exists, as computed. */
function runCreatedEvent(run: typeof reportRuns.$inferSelect, computed: { confidence: number; blockers: string[] }): ReportAuditEvent {
  return {
    organizationId: run.organizationId,
    action: 'report_os.run_created',
    resourceType: 'report_run',
    resourceId: String(run.id),
    details: {
      runUuid: run.runUuid,
      reportTypeId: run.reportTypeId,
      scopeType: run.scopeType,
      scopeId: run.scopeId,
      status: run.status,
      confidence: computed.confidence,
      blockerCount: computed.blockers.length,
    },
  };
}

type NewRun = typeof reportRuns.$inferInsert;
type NewSnapshot = Omit<typeof reportSnapshots.$inferInsert, 'runId'>;
type NewDependency = Omit<typeof reportRunDependencies.$inferInsert, 'runId'>;

/**
 * The run, its first snapshot, its dependencies and its report_os.run_created
 * chain row, in one tenant-stamped transaction: all land or none (reporting
 * review 2026-10-01, SECURITY-10). The run's writes used to commit first and
 * the row after them, so a refused row left a listed, bundlable, finalizable
 * run that was never recorded, and a retry made a second. 'not-recorded' when
 * the chain row was refused (everything rolled back); any earlier failure
 * throws.
 */
async function createRunOnChain(
  req: Request,
  rows: { run: NewRun; snapshot: NewSnapshot; dependencies: NewDependency[] },
  computed: { confidence: number; blockers: string[] },
): Promise<{ run: typeof reportRuns.$inferSelect; snapshot: typeof reportSnapshots.$inferSelect } | 'not-recorded'> {
  let recording = false;
  try {
    return await inTenantTransaction(rows.run.organizationId, async (client) => {
      const tx = onTransaction(client);
      const [run] = await tx.insert(reportRuns).values(rows.run).returning();
      const [snapshot] = await tx.insert(reportSnapshots).values({ ...rows.snapshot, runId: run.id }).returning();
      if (rows.dependencies.length > 0) {
        await tx.insert(reportRunDependencies).values(rows.dependencies.map((d) => ({ ...d, runId: run.id })));
      }
      recording = true;
      await writeReportEvent(client, req, runCreatedEvent(run, computed));
      return { run, snapshot };
    });
  } catch (error) {
    if (!recording) throw error;
    logger.error('report run not recorded on the audit chain; rolled back', { error: (error as Error)?.message });
    return 'not-recorded';
  }
}

/**
 * Record the export, then send the PDF: the row carries the SHA-256 and length
 * of the exact bytes and is written BEFORE anything is sent. When it cannot be
 * written the answer is 503 and nothing leaves (§11.10(e)).
 */
async function sendRecordedPdf(
  req: Request,
  res: Response,
  event: ReportAuditEvent,
  pdf: { filename: string; buffer: Buffer }
) {
  const recorded = await recordReportEvent(req, {
    ...event,
    details: {
      ...event.details,
      format: 'pdf',
      filename: pdf.filename,
      byteLength: pdf.buffer.length,
      sha256: createHash('sha256').update(pdf.buffer).digest('hex'),
    },
  });
  if (!recorded) {
    return refuseUnrecorded(
      res,
      'REPORT_EXPORT_NOT_RECORDED',
      'The export was refused because it could not be recorded in the audit trail. Nothing was exported.'
    );
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
  return res.send(pdf.buffer);
}

/** The printed name of a user as this organisation may see it (public.actor_name), or null. */
async function actorName(client: PoolClient, userId: number | null): Promise<string | null> {
  if (userId == null) return null;
  const { rows } = await client.query('SELECT name FROM public.actor_name($1)', [userId]);
  const name = (rows[0] as { name?: unknown } | undefined)?.name;
  return typeof name === 'string' && name.trim() ? name : null;
}

/** 409: the stored record does not verify against the audit chain, so it is neither shown nor exported. */
function refuseSealMismatch(res: Response, runId: number, verb: 'shown' | 'exported') {
  return res.status(409).json({
    success: false,
    error: {
      code: 'SEALED_DOCUMENT_MISMATCH',
      message: `This report's stored record does not verify against the audit chain, so it is not ${verb}. GET /runs/:id/seal states which check failed.`,
    },
    data: { runId },
  });
}

/** 409: a final report keeps its seal; it is never sealed a second time. */
function refuseAlreadyFinal(res: Response, runId: number) {
  return res.status(409).json({
    success: false,
    error: { code: 'RUN_ALREADY_FINAL', message: 'This report is already final. Its seal stands and is not replaced.' },
    data: { runId },
  });
}

type FinalizeOutcome = 'already-final' | 'not-found' | 'no-snapshot' | 'not-recorded';

/** Ends the finalize transaction without a write; rolled back, never committed. */
class FinalizeStopped extends Error {
  constructor(readonly outcome: 'already-final' | 'not-found' | 'no-snapshot') {
    super(outcome);
  }
}

/**
 * The run's status, and the seal on its latest snapshot with the exact document
 * it was computed over: the two writes of a finalize, on `client`. The document
 * is what makes the seal re-verifiable (GET /runs/:id/seal, reporting review
 * 2026-10-01). A run with no snapshot has nowhere to hold its seal, and was
 * finalized with the seal stored nowhere; it is now refused.
 */
async function writeFinalize(
  client: PoolClient,
  run: typeof reportRuns.$inferSelect,
  seal: SealedRecord,
  sealedDocument: RenderedReport
) {
  const at = new Date().toISOString();
  await client.query(
    `UPDATE report_runs SET status = 'final', completed_at = $3, updated_at = $3
      WHERE id = $1 AND organization_id = $2`,
    [run.id, run.organizationId, at]
  );
  const snapshot = await client.query(
    `SELECT id, snapshot_metadata FROM report_snapshots
      WHERE run_id = $1 AND organization_id = $2 AND is_latest = true
      ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    [run.id, run.organizationId]
  );
  const latest = snapshot.rows[0] as { id: number; snapshot_metadata: Record<string, unknown> | null } | undefined;
  if (!latest) throw new FinalizeStopped('no-snapshot');
  const merged = { ...(latest.snapshot_metadata ?? {}), seal, sealedDocument, finalizedAt: at };
  await client.query('UPDATE report_snapshots SET snapshot_metadata = $2::json WHERE id = $1', [
    latest.id,
    JSON.stringify(merged),
  ]);
}

/** The meanings a report finalize can carry: its requester issues it as author; anyone else approves it or takes responsibility. */
const REPORT_FINALIZE_MEANINGS: readonly CeremonySignMeaning[] = ['authorship', 'approval', 'responsibility'];

/** A signer cannot guess the password behind a seal without limit (11.300(d)). */
const finalizeSigningAttempts = signingAttemptLimiter('report-finalize', {
  success: false,
  error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many signing attempts. Wait a few minutes and try again. Nothing was finalized.' },
});

/**
 * Finalize a run as an electronic signature (reporting review 2026-10-01).
 * Finalizing declares the report final under the signer's name, so it runs the
 * platform's signature ceremony (signGovernedAct): the declared meaning,
 * re-authentication, separation of duties against the run's requester, then
 * this write, the ledger pair and the electronic_signatures row on one
 * transaction. Inside it the run is re-read under a row lock, so a finalize
 * that committed first is refused rather than overwritten (DP-47); the status,
 * the seal and the chained row carry the reason, the meaning and the status the
 * run held before. A chained row or signature that cannot be written is
 * 'not-recorded', with nothing changed.
 */
async function finalizeOnChain(
  req: Request,
  run: typeof reportRuns.$inferSelect,
  sealed: { seal: SealedRecord; document: RenderedReport },
  signing: { userId: number; reason: string; meaning: unknown; reauth: unknown }
): Promise<FinalizeOutcome | { signed: Record<string, unknown> }> {
  let recording = false;
  try {
    const signed = await signGovernedAct({
      orgId: run.organizationId,
      userId: signing.userId,
      target: `report-run:${run.id}`,
      domain: 'report_os',
      surface: 'insights-canvas',
      subject: 'report',
      reason: signing.reason,
      meaning: signing.meaning,
      allowedMeanings: REPORT_FINALIZE_MEANINGS,
      reauth: signing.reauth,
      ipAddress: signerIpAddress(req),
      role: String((req as any).userRole ?? (req as any).user?.role ?? ''),
      write: async (client, meaning) => {
        const locked = await client.query(
          'SELECT status FROM report_runs WHERE id = $1 AND organization_id = $2 FOR UPDATE',
          [run.id, run.organizationId]
        );
        const priorStatus = (locked.rows[0] as { status?: string } | undefined)?.status;
        if (priorStatus == null) throw new FinalizeStopped('not-found');
        if (priorStatus === 'final') throw new FinalizeStopped('already-final');
        await writeFinalize(client, run, sealed.seal, sealed.document);
        recording = true;
        const facts = {
          runUuid: run.runUuid,
          reportTypeId: run.reportTypeId,
          priorStatus,
          sealHash: sealed.seal.contentHash,
          algorithm: sealed.seal.algorithm,
          canonVersion: sealed.seal.canonVersion,
          atomCount: sealed.seal.atomCount,
          sealedAt: sealed.seal.sealedAt,
          // The sealed document is stored beside the seal: a later read that
          // finds it missing reads a removal, not a legacy record (run-seal.ts).
          documentStored: true,
        };
        await writeReportEvent(client, req, {
          organizationId: run.organizationId,
          action: 'report_os.run_finalized',
          resourceType: 'report_run',
          resourceId: String(run.id),
          details: { ...facts, reason: signing.reason, meaning },
        });
        return { act: { finalized: true, ...facts }, body: {} };
      },
    });
    return { signed };
  } catch (error) {
    if (error instanceof FinalizeStopped) return error.outcome;
    if (error instanceof GovernedSignatureRefusal || !recording) throw error;
    logger.error('report finalize not recorded on the audit chain; rolled back', {
      runId: run.id,
      error: (error as Error)?.message,
    });
    return 'not-recorded';
  }
}

/**
 * The run export's entitlement gate (review round 1, DP-50), over every report
 * a bundle carries: the decision for the first report type the organization's
 * plan does not cover, or null. The tier is resolved once, through the same
 * gate; each type is then decided with its registry family, as the run export
 * decides one.
 */
async function bundleExportRefusal(
  organizationId: number,
  bundle: ReportBundleRecord
): Promise<ReportEntitlementDecision | null> {
  const typeIds = [...new Set(bundle.items.map(item => item.reportTypeId))];
  if (typeIds.length === 0) return null;
  const rows = await db
    .select({ typeId: reportTypeRegistry.typeId, family: reportTypeRegistry.family })
    .from(reportTypeRegistry)
    .where(inArray(reportTypeRegistry.typeId, typeIds));
  const families = new Map(rows.map(row => [row.typeId, row.family]));
  const { tier } = await requireReportEntitlement(organizationId, typeIds[0], families.get(typeIds[0]));
  for (const typeId of typeIds) {
    const decision = decideReportEntitlement(typeId, families.get(typeId), tier);
    if (!decision.entitled) return decision;
  }
  return null;
}

function resolveProjectIdForRun(run: {
  scopeType: string;
  scopeId: string;
  dependencySummary: unknown;
}): number | undefined {
  if (run.scopeType === 'project') {
    const projectId = Number(run.scopeId);
    return Number.isFinite(projectId) && projectId > 0 ? projectId : undefined;
  }
  const deps = run.dependencySummary as any;
  const lineage = deps?.scopeLineage;
  const projectLineage = Array.isArray(lineage)
    ? lineage.find((entry: any) => entry?.type === 'project')
    : undefined;
  const projectId = Number(projectLineage?.id);
  return Number.isFinite(projectId) && projectId > 0 ? projectId : undefined;
}

/**
 * The two writes the memory-entry helpers below need. The pool-bound `db` by
 * default; a delivery or a capture passes drizzle bound to its transaction's
 * connection, so its entries commit or roll back with the rest of it (P1-44).
 */
type ReportDb = Pick<NodePgDatabase<typeof schema>, 'select' | 'insert'>;

/** Drizzle on `client`, so a helper's writes join the open transaction. */
function onTransaction(client: PoolClient): ReportDb {
  return drizzle(client, { schema });
}

async function ensureProjectProfileId(
  organizationId: number,
  projectId: number,
  userId?: number,
  executor: ReportDb = db
): Promise<number> {
  const existing = await executor
    .select({ id: projectIntelligenceProfiles.id })
    .from(projectIntelligenceProfiles)
    .where(
      and(
        eq(projectIntelligenceProfiles.organizationId, organizationId),
        eq(projectIntelligenceProfiles.projectId, projectId)
      )
    )
    .limit(1);

  if (existing[0]?.id) return existing[0].id;

  const inserted = await executor
    .insert(projectIntelligenceProfiles)
    .values({
      organizationId,
      projectId,
      createdBy: userId,
      lastEnrichedBy: userId,
      profileStatus: 'active',
    })
    .returning({ id: projectIntelligenceProfiles.id });

  return inserted[0].id;
}

async function captureLearningMemory(
  params: {
    organizationId: number;
    projectId: number;
    userId?: number;
    title: string;
    content: string;
    subcategory: string;
    confidenceScore?: number;
  },
  executor: ReportDb
) {
  const profileId = await ensureProjectProfileId(params.organizationId, params.projectId, params.userId, executor);
  await executor.insert(projectMemoryEntries).values({
    projectProfileId: profileId,
    projectId: params.projectId,
    organizationId: params.organizationId,
    category: 'regulatory',
    subcategory: params.subcategory,
    title: params.title,
    content: params.content.slice(0, 20000),
    sourceDocumentType: 'report_os_correspondence',
    confidenceScore: params.confidenceScore ?? 0.8,
    importanceLevel: 'high',
    extractedBy: 'report_os_delivery',
  });
}

async function getReportTypeLabelMap(typeIds: string[]) {
  const unique = [...new Set(typeIds)];
  if (!unique.length) return new Map<string, string>();
  const rows = await db
    .select({ typeId: reportTypeRegistry.typeId, label: reportTypeRegistry.label })
    .from(reportTypeRegistry)
    .where(inArray(reportTypeRegistry.typeId, unique));
  const map = new Map<string, string>();
  for (const row of rows) map.set(row.typeId, row.label);
  return map;
}

function decodeRecordPayload<T>(input: string, key: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = JSON.parse(input) as { [k: string]: unknown };
    const payload = parsed?.[key];
    const validated = schema.safeParse(payload);
    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

function dedupeByLatest<T extends { id: string; createdAt: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (!map.has(row.id)) map.set(row.id, row);
  }
  return [...map.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function resolveProjectsForBundleRuns(runs: Array<{ scopeType: string; scopeId: string; dependencySummary: unknown }>) {
  const ids = new Set<number>();
  for (const run of runs) {
    const projectId = resolveProjectIdForRun(run);
    if (projectId) ids.add(projectId);
  }
  return [...ids];
}

async function persistBundleRecord(bundle: ReportBundleRecord) {
  const projectIds = bundle.projectIds ?? [];
  for (const projectId of projectIds) {
    const profileId = await ensureProjectProfileId(bundle.organizationId, projectId, bundle.createdBy);
    await db.insert(projectMemoryEntries).values({
      projectProfileId: profileId,
      projectId,
      organizationId: bundle.organizationId,
      category: 'regulatory',
      subcategory: REPORT_OS_BUNDLE_SUBCATEGORY,
      title: `bundle:${bundle.bundleId}`,
      content: JSON.stringify({ bundleRecord: bundle }).slice(0, 20000),
      sourceDocumentType: REPORT_OS_RECORD_SOURCE,
      confidenceScore: 0.93,
      importanceLevel: 'high',
      extractedBy: 'report_os_bundle',
    });
  }
}

async function loadBundlesForOrg(organizationId: number): Promise<ReportBundleRecord[]> {
  const rows = await db
    .select({
      title: projectMemoryEntries.title,
      content: projectMemoryEntries.content,
      createdAt: projectMemoryEntries.createdAt,
    })
    .from(projectMemoryEntries)
    .where(
      and(
        eq(projectMemoryEntries.organizationId, organizationId),
        eq(projectMemoryEntries.category, 'regulatory'),
        eq(projectMemoryEntries.subcategory, REPORT_OS_BUNDLE_SUBCATEGORY),
        eq(projectMemoryEntries.sourceDocumentType, REPORT_OS_RECORD_SOURCE)
      )
    )
    .orderBy(desc(projectMemoryEntries.createdAt))
    .limit(1000);

  const normalized = rows
    .map(row => {
      const parsed = decodeRecordPayload(row.content, 'bundleRecord', reportBundleRecordSchema);
      if (!parsed) return null;
      return { id: parsed.bundleId, ...parsed };
    })
    .filter((row): row is ReportBundleRecord & { id: string } => !!row);

  const deduped = dedupeByLatest(normalized).map(({ id: _id, ...rest }) => rest);
  return deduped;
}

async function loadBundleById(
  organizationId: number,
  bundleId: string
): Promise<ReportBundleRecord | undefined> {
  const bundles = await loadBundlesForOrg(organizationId);
  return bundles.find(bundle => bundle.bundleId === bundleId);
}

/**
 * The delivery record, through `executor` (the delivery's transaction). Stored
 * whole: it was cut at 20,000 characters, which a 20,000-character message
 * (the schema's own limit) passes, leaving JSON that loadDeliveriesForOrg could
 * not parse — the delivery was answered and then never listed (P1-44).
 */
async function persistDeliveryRecord(delivery: DeliveryRecord & { projectId: number }, executor: ReportDb) {
  const profileId = await ensureProjectProfileId(delivery.organizationId, delivery.projectId, delivery.requestedBy, executor);
  await executor.insert(projectMemoryEntries).values({
    projectProfileId: profileId,
    projectId: delivery.projectId,
    organizationId: delivery.organizationId,
    category: 'regulatory',
    subcategory: REPORT_OS_DELIVERY_SUBCATEGORY,
    title: `delivery:${delivery.deliveryId}`,
    content: JSON.stringify({ deliveryRecord: delivery }),
    sourceDocumentType: REPORT_OS_RECORD_SOURCE,
    confidenceScore: 0.92,
    importanceLevel: 'high',
    extractedBy: 'report_os_delivery',
  });
}

async function loadDeliveriesForOrg(organizationId: number): Promise<DeliveryRecord[]> {
  const rows = await db
    .select({
      content: projectMemoryEntries.content,
      createdAt: projectMemoryEntries.createdAt,
    })
    .from(projectMemoryEntries)
    .where(
      and(
        eq(projectMemoryEntries.organizationId, organizationId),
        eq(projectMemoryEntries.category, 'regulatory'),
        eq(projectMemoryEntries.subcategory, REPORT_OS_DELIVERY_SUBCATEGORY),
        eq(projectMemoryEntries.sourceDocumentType, REPORT_OS_RECORD_SOURCE)
      )
    )
    .orderBy(desc(projectMemoryEntries.createdAt))
    .limit(1000);

  const normalized = rows
    .map(row => {
      const parsed = decodeRecordPayload(row.content, 'deliveryRecord', reportDeliveryRecordSchema);
      if (!parsed) return null;
      return { id: parsed.deliveryId, ...parsed };
    })
    .filter((row): row is DeliveryRecord & { id: string } => !!row);

  const deduped = dedupeByLatest(normalized).map(({ id: _id, ...rest }) => rest);
  return deduped;
}

type CorrespondenceInput = {
  organizationId: number;
  projectId: number;
  submissionId: string;
  direction: 'inbound' | 'outbound' | 'internal';
  sourceChannel: 'manual_upload' | 'mailbox_sync' | 'api_import';
  communicationType: string;
  subject: string;
  body: string;
  recipients: string[];
  sender?: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  responseRequired: boolean;
  userId?: number;
};

/**
 * A letter and the issues its text raises, on `client`'s open transaction;
 * returns the letter's id. Throws when either insert is refused, so the
 * caller's transaction rolls back and nothing is claimed.
 *
 * Replaces persistCorrespondenceToPlatform (P1-44, 2026-10-01), which caught
 * its own error and returned `persisted: false`: POST /deliveries then answered
 * 'sent' for a letter that did not exist, and POST /correspondence/capture
 * (since removed) answered 201 for one. Its table-readiness probe went with it — a missing
 * table is a refused insert like any other.
 */
async function writeCorrespondence(
  client: PoolClient,
  input: CorrespondenceInput,
  issues: ReturnType<typeof parseKeywordIssues>
): Promise<string> {
  const correspondenceId = randomUUID();
  await client.query(
    `INSERT INTO c2c_correspondence
      (id, organization_id, project_id, submission_id, direction, source_channel, communication_type,
       subject, sender, recipients, received_at, urgency, response_required, status,
       parser_metadata, attachment_refs, parsed_text, summary)
     VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17)`,
    [
      correspondenceId,
      input.organizationId,
      input.projectId,
      input.submissionId,
      input.direction,
      input.sourceChannel,
      input.communicationType,
      input.subject,
      input.sender || null,
      JSON.stringify(input.recipients || []),
      input.urgency,
      input.responseRequired,
      input.direction === 'outbound' ? 'responded' : 'new',
      JSON.stringify({
        parserVersion: 'report-os-v1',
        extractionVersion: '2026-04-01',
        importedByUserId: input.userId || null,
      }),
      JSON.stringify([]),
      input.body,
      input.body.slice(0, 200),
    ]
  );
  for (const issue of issues) {
    await client.query(
      `INSERT INTO c2c_correspondence_issues
        (id, correspondence_id, category, severity, blocker, response_required, source_excerpt,
         confidence, human_review_status, mapped_ctd_sections, mapped_artifact_ids, resolution_status)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12)`,
      [
        randomUUID(),
        correspondenceId,
        issue.category,
        issue.severity,
        issue.blocker,
        true,
        input.body.slice(0, 280),
        0.72,
        'pending',
        JSON.stringify([]),
        JSON.stringify([]),
        'open',
      ]
    );
  }
  return correspondenceId;
}

router.get('/scopes', (_req: Request, res: Response) => {
  res.json({ data: reportScopeEnum });
});

/*
 * POST /taxonomy/seed was removed on 2026-09-30 (review round 1, zero
 * duplication). The registry has one writer: the generated migration
 * migrations/20260930_report_type_registry_seed.sql, produced by
 * scripts/db/generate-report-type-registry-seed.ts from the in-code report
 * types and applied on every deploy (C2C_MIGRATION_FILES). Its drift test
 * (server/services/report-os/__tests__/report-type-registry-seed.test.ts) and
 * dbtest (tests/db/report-os-registry-seed.dbtest.ts) prove it reaches a
 * provisioned database. The route, its REPORT_OS_ALLOW_SEED / REPORT_OS_SEED_KEY
 * guard and its x-report-os-seed-key header went with it.
 */

router.get('/taxonomy', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(reportTypeRegistry)
      .where(eq(reportTypeRegistry.enabled, true));

    // Anchor the catalog to what this client segment actually needs: filter
    // to report types whose `allowedClientSegments` intersects the org's
    // derived segment(s). Universal types (empty allowedClientSegments) are
    // always shown. Optional ?persona= intersects on allowedPersonas.
    // When there's no tenant context we return the full enabled set (the
    // route is auth-gated at the mount, so this is the defensive path only).
    const organizationId = authedOrgId(req);
    const persona = typeof req.query.persona === 'string' ? req.query.persona : null;
    if (organizationId == null || !Number.isFinite(organizationId)) {
      return res.json({ data: rows });
    }
    const segments = await deriveOrgSegments(organizationId);
    const filtered = filterTypesForSegment(rows as SegmentFilterableType[], segments, persona);

    // Annotate each row with its entitlement verdict for the org's tier so the
    // client can render an honest Locked state without a second round trip.
    let tier: Tier = 'standard';
    try {
      tier = (await resolveCapabilities(organizationId)).tier;
    } catch { /* default standard — never unlocks paid features */ }
    const annotated = filtered.map((row) => {
      const r = row as SegmentFilterableType & { typeId: string; family?: string };
      const d = decideReportEntitlement(r.typeId, r.family, tier);
      return { ...row, entitled: d.entitled, requiredTier: d.requiredTier };
    });
    return res.json({ data: annotated, meta: { segments, tier } });
  } catch (error: any) {
    return serverError(res, logger, 'loading taxonomy', error);
  }
});

// GET /portfolio/org — the enterprise rollup over ALL top-level programs in the
// org (not a single program group). Returns the RAW flat OrgPortfolioSummary
// (program list + aggregates), not a rendered board pack, so the Command Center
// can bind the program array directly. Same entitlement gate + same orchestrator
// as /portfolio; every metric traces to computeInitialRun.
router.get('/portfolio/org', async (req: Request, res: Response) => {
  try {
    const organizationId = authedOrgId(req) ?? NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    const gate = await requireReportEntitlement(organizationId, 'portfolio.board_pack', 'portfolio');
    if (!gate.entitled) {
      return res.status(403).json({
        error: `Portfolio rollup requires the ${gate.requiredTier} plan.`,
        feature: gate.feature,
        requiredTier: gate.requiredTier,
        tier: gate.tier,
      });
    }
    const summary = await fetchOrgPortfolioSummary(organizationId);
    /* An entitled organisation with no top-level programs is a real, empty
       answer, not a missing resource. This was a 404 with no machine code, and
       AnA Command rendered it as "the rollup didn't respond … sign in and
       retry, or check your plan" to a signed-in, entitled admin whose org is
       simply new (launch sweep findings 42, 6, 7). `data: null` — never an
       aggregate over no rows, which would compute a 0% "average readiness" —
       as /insights-canvas already folds the same null summary. The only other
       path to null is none: a database error throws to the 500 below. */
    return res.json({ data: summary ?? null });
  } catch (error: any) {
    return serverError(res, logger, 'loading org', error);
  }
});

// GET /portfolio?programGroupId= — the enterprise board-pack rollup over a
// program group. Gated on portfolio_rollup (enterprise); every metric traces
// to the same orchestrator the /runs path uses.
router.get('/portfolio', async (req: Request, res: Response) => {
  try {
    const organizationId = authedOrgId(req) ?? NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    const gate = await requireReportEntitlement(organizationId, 'portfolio.board_pack', 'portfolio');
    if (!gate.entitled) {
      return res.status(403).json({
        error: `Portfolio rollup requires the ${gate.requiredTier} plan.`,
        feature: gate.feature,
        requiredTier: gate.requiredTier,
        tier: gate.tier,
      });
    }
    const programGroupId = Number(req.query.programGroupId);
    if (!Number.isFinite(programGroupId) || programGroupId <= 0) {
      return res.status(400).json({ error: 'programGroupId query parameter is required' });
    }
    const report = await fetchPortfolioReport(organizationId, programGroupId, {
      reportTypeId: 'portfolio.board_pack',
      reportTypeLabel: 'Portfolio board pack',
    });
    if (!report) {
      return res.status(404).json({ error: 'Program group not found or has no members in this organization' });
    }
    return res.json({ data: report });
  } catch (error: any) {
    return serverError(res, logger, 'loading portfolio', error);
  }
});

router.get('/program-groups', async (req: Request, res: Response) => {
  try {
    // SECURITY: JWT-bound; the legacy ?organizationId= query param is
    // ignored to prevent cross-tenant report enumeration.
    const organizationId = authedOrgId(req) ?? NaN;
    if (!Number.isFinite(organizationId)) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId query parameter is required' });
    }
    const includeArchived = req.query.includeArchived === 'true';
    const groups = await db
      .select()
      .from(reportProgramGroups)
      .where(
        includeArchived
          ? eq(reportProgramGroups.organizationId, organizationId)
          : and(
              eq(reportProgramGroups.organizationId, organizationId),
              eq(reportProgramGroups.status, 'active')
            )
      )
      .orderBy(desc(reportProgramGroups.updatedAt));

    const groupIds = groups.map(g => g.id);
    const members =
      groupIds.length > 0
        ? await db
            .select({
              groupId: reportProgramGroupProjects.programGroupId,
              projectId: reportProgramGroupProjects.projectId,
              projectName: projects.name,
              projectType: projects.type,
            })
            .from(reportProgramGroupProjects)
            // The org on the JOIN, not only on the groups: a membership naming
            // another tenant's project (written before memberships were checked)
            // must not bring that project's name and type back with it.
            .innerJoin(
              projects,
              and(
                eq(projects.id, reportProgramGroupProjects.projectId),
                eq(projects.organizationId, organizationId)
              )
            )
            .where(inArray(reportProgramGroupProjects.programGroupId, groupIds))
        : [];

    const byGroup = new Map<number, any[]>();
    for (const m of members) {
      byGroup.set(m.groupId, [...(byGroup.get(m.groupId) || []), m]);
    }

    return res.json({
      data: groups.map(g => ({
        ...g,
        projects: byGroup.get(g.id) || [],
      })),
    });
  } catch (error: any) {
    return serverError(res, logger, 'loading program groups', error);
  }
});

router.post('/program-groups', async (req: Request, res: Response) => {
  try {
    const orgId = requireSessionOrg(req, res);
    if (orgId == null) return;
    const parsed = createProgramGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { clientWorkspaceId, name, description, projectIds, metadata } = parsed.data;
    const createdBy = getUserId(req);
    if (!(await workspaceIsOrganisations(orgId, clientWorkspaceId))) return res.status(403).json(WORKSPACE_NOT_IN_ORGANIZATION);

    const uniqueProjectIds = [...new Set(projectIds)];
    const owned = await projectsInOrg(orgId, uniqueProjectIds);
    if (owned.size !== uniqueProjectIds.length) {
      return res.status(400).json({ error: 'One or more projectIds were not found for this organization' });
    }

    const [group] = await db
      .insert(reportProgramGroups)
      .values({
        organizationId: orgId,
        clientWorkspaceId,
        name,
        description,
        createdBy,
        updatedBy: createdBy,
        metadata,
      })
      .returning();

    if (uniqueProjectIds.length > 0) {
      await db.insert(reportProgramGroupProjects).values(
        uniqueProjectIds.map(projectId => ({
          programGroupId: group.id,
          projectId,
          addedBy: createdBy,
        }))
      );
    }

    return res.status(201).json({ data: group });
  } catch (error: any) {
    return serverError(res, logger, 'saving program groups', error);
  }
});

router.patch('/program-groups/:id', async (req: Request, res: Response) => {
  try {
    const orgId = requireSessionOrg(req, res);
    if (orgId == null) return;
    const id = Number(req.params.id);
    const { name, description, status, projectIds, metadata } = req.body;
    const updatedBy = getUserId(req);

    let uniqueProjectIds: number[] | undefined;
    if (Array.isArray(projectIds)) {
      uniqueProjectIds = [
        ...new Set(projectIds.map((v: any) => Number(v)).filter(Number.isFinite)),
      ];
      const owned = await projectsInOrg(orgId, uniqueProjectIds);
      if (owned.size !== uniqueProjectIds.length) {
        return res
          .status(400)
          .json({ error: 'One or more projectIds were not found for this organization' });
      }
    }

    // Scoped to the caller's org: another tenant's group id matches nothing and
    // answers 404 below, before its membership is touched.
    const [updated] = await db
      .update(reportProgramGroups)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
        ...(status === 'archived' ? { archivedAt: new Date() } : {}),
        updatedBy,
        updatedAt: new Date(),
      })
      .where(and(eq(reportProgramGroups.id, id), eq(reportProgramGroups.organizationId, orgId)))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Program group not found' });

    if (uniqueProjectIds) {
      await db
        .delete(reportProgramGroupProjects)
        .where(eq(reportProgramGroupProjects.programGroupId, id));
      if (uniqueProjectIds.length > 0) {
        await db.insert(reportProgramGroupProjects).values(
          uniqueProjectIds.map(projectId => ({
            programGroupId: id,
            projectId,
            addedBy: updatedBy,
          }))
        );
      }
    }

    return res.json({ data: updated });
  } catch (error: any) {
    return serverError(res, logger, 'updating program groups', error);
  }
});

router.get('/program-groups/:id/snapshots', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    // SECURITY: JWT-bound; the legacy ?organizationId= query param is
    // ignored to prevent cross-tenant report enumeration.
    const organizationId = authedOrgId(req) ?? NaN;
    if (!Number.isFinite(organizationId)) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId query parameter is required' });
    }
    const rows = await db
      .select()
      .from(reportProgramGroupSnapshots)
      .where(
        and(
          eq(reportProgramGroupSnapshots.programGroupId, id),
          eq(reportProgramGroupSnapshots.organizationId, organizationId)
        )
      )
      .orderBy(desc(reportProgramGroupSnapshots.asOf));

    return res.json({ data: rows });
  } catch (error: any) {
    return serverError(res, logger, 'loading snapshots', error);
  }
});

router.post('/program-groups/:id/snapshots', async (req: Request, res: Response) => {
  try {
    const orgId = requireSessionOrg(req, res);
    if (orgId == null) return;
    const id = Number(req.params.id);
    const parsed = createProgramSnapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { snapshotLabel, snapshotReason } = parsed.data;
    const createdBy = getUserId(req);

    // A snapshot of a group this org does not own is not an empty snapshot.
    const [group] = await db
      .select({ id: reportProgramGroups.id })
      .from(reportProgramGroups)
      .where(and(eq(reportProgramGroups.id, id), eq(reportProgramGroups.organizationId, orgId)))
      .limit(1);
    if (!group) return res.status(404).json({ error: 'Program group not found' });

    const memberships = await db
      .select({ projectId: reportProgramGroupProjects.projectId })
      .from(reportProgramGroupProjects)
      .innerJoin(
        reportProgramGroups,
        eq(reportProgramGroups.id, reportProgramGroupProjects.programGroupId)
      )
      .where(
        and(
          eq(reportProgramGroupProjects.programGroupId, id),
          eq(reportProgramGroups.organizationId, orgId)
        )
      );

    const projectIds = memberships.map(m => m.projectId).sort((a, b) => a - b);
    const projectSetHash = createHash('sha256').update(JSON.stringify(projectIds)).digest('hex');

    const [snapshot] = await db
      .insert(reportProgramGroupSnapshots)
      .values({
        programGroupId: id,
        organizationId: orgId,
        snapshotLabel,
        snapshotReason,
        projectIds,
        projectSetHash,
        createdBy,
      })
      .returning();

    return res.status(201).json({ data: snapshot });
  } catch (error: any) {
    return serverError(res, logger, 'saving snapshots', error);
  }
});

router.post('/runs', async (req: Request, res: Response) => {
  try {
    const orgId = requireSessionOrg(req, res);
    if (orgId == null) return;
    const parsed = createRunSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { clientWorkspaceId, scopeType, scopeId, reportTypeId, registryId, submissionType } =
      parsed.data;
    const requestedBy = getUserId(req);
    if (!(await workspaceIsOrganisations(orgId, clientWorkspaceId))) return res.status(403).json(WORKSPACE_NOT_IN_ORGANIZATION);

    const type = await db
      .select()
      .from(reportTypeRegistry)
      .where(eq(reportTypeRegistry.typeId, reportTypeId))
      .limit(1);
    if (!type[0]) {
      return res.status(404).json({ error: `Unknown reportTypeId: ${reportTypeId}` });
    }

    if (!(type[0].allowedScopes as ReportScope[]).includes(scopeType)) {
      return res.status(400).json({
        error: `Report type ${reportTypeId} does not allow scope ${scopeType}`,
        allowedScopes: type[0].allowedScopes,
      });
    }

    // A project this org does not own is not found — not an empty report about
    // it, and not a run whose scope points across the boundary for a later
    // bundle or delivery to follow. (Program scope is a report program group:
    // its membership query below requires the group to be this org's. The
    // canvas sent a project id under it until L189 was closed on 2026-10-01;
    // it now sends project scope.)
    if (scopeType === 'project') {
      const projectId = Number(scopeId);
      const owned = Number.isSafeInteger(projectId)
        ? await projectsInOrg(orgId, [projectId])
        : new Set<number>();
      if (owned.size === 0) return res.status(404).json({ error: 'Project not found' });
    }

    // A prediction is never computed by the generic run: it would be the
    // readiness run under a prediction title (reporting review 2026-10-01).
    if (isPredictionFamily(type[0].family)) {
      return res.status(422).json({ error: PREDICTION_NOT_A_RUN, code: 'PREDICTION_NOT_A_RUN' });
    }

    // Entitlement gate: refuse to generate a report above the org's tier —
    // the same org the report is computed for.
    const gate = await requireReportEntitlement(orgId, type[0].typeId, type[0].family);
    if (!gate.entitled) {
      return res.status(403).json({
        error: `This report requires the ${gate.requiredTier} plan.`,
        feature: gate.feature,
        requiredTier: gate.requiredTier,
        tier: gate.tier,
      });
    }

    const scope = resolveScope({ scopeType, scopeId, organizationId: orgId });
    let programProjectIds: number[] | undefined;
    if (scopeType === 'program') {
      const memberships = await db
        .select({ projectId: reportProgramGroupProjects.projectId })
        .from(reportProgramGroupProjects)
        .innerJoin(
          reportProgramGroups,
          eq(reportProgramGroups.id, reportProgramGroupProjects.programGroupId)
        )
        .where(
          and(
            eq(reportProgramGroupProjects.programGroupId, Number(scopeId)),
            eq(reportProgramGroups.organizationId, orgId)
          )
        );
      programProjectIds = memberships.map(m => m.projectId);
    }

    const computed = await computeInitialRun(orgId, scopeType, scopeId, {
      programProjectIds,
      explicitRegistryId: registryId,
      explicitSubmissionType: submissionType,
    });

    // Research-compliance / sponsored-programs domain providers: compute the real
    // report summary from the domain tables and merge it into the run.
    try {
      const { computeDomainReport } = await import('../services/report-os/research-compliance-report-providers.js');
      const domain = await computeDomainReport(reportTypeId, orgId);
      if (domain) {
        Object.assign(computed.summary, { domain: domain.summary });
        computed.providers.push(domain.provider);
        if (domain.provider.status === 'missing' && domain.provider.blocker) computed.blockers.push(domain.provider.blocker);
      }
    } catch {
      // Domain provider is best-effort; the generic report run stands on its own.
    }

    // Document-scoped evidence-trace: source the report body from the EXISTING
    // per-document lineage dossier (versions/decisions/provenance/reasoning/
    // data-lineage) mapped into RenderedReport blocks with provenance atoms, and
    // derive confidence from lineage completeness. Reuses the whole run/seal/
    // render/finalize pipeline unchanged; the generic project-scope providers do
    // not apply to a single artifact, so their (spurious) blockers are dropped
    // for this type. Best-effort — falls back to the generic run if unavailable.
    let lineageRendered: RenderedReport | undefined;
    if (reportTypeId === 'provenance.evidence_trace_report' && scopeType === 'document') {
      try {
        const [{ buildDocumentLineageDossier }, { dossierToRenderedReport, computeLineageConfidence }] =
          await Promise.all([
            import('../services/ana/lineage-dossier.js'),
            import('../services/report-os/lineage-trace-report.js'),
          ]);
        const dossier = await buildDocumentLineageDossier(scopeId, orgId);
        if (dossier) {
          computed.confidence = computeLineageConfidence(dossier);
          computed.blockers = [];
          computed.criticalBlockers = [];
          computed.summary.lineageDocument = dossier.ledger.artifact.artifactId;
          lineageRendered = dossierToRenderedReport(dossier, {
            reportTypeId,
            reportTypeLabel: type[0].label ?? reportTypeId,
            status: 'partial',
          });
        }
      } catch {
        // Dossier unavailable → generic run stands.
      }
    }

    const created = await createRunOnChain(
      req,
      {
        run: {
          organizationId: orgId,
          clientWorkspaceId,
          scopeType,
          scopeId,
          reportTypeId,
          requestedBy,
          status: computed.blockers.length > 0 ? 'partial' : 'completed',
          dependencySummary: {
            providers: computed.providers,
            scopeLineage: scope.lineage,
            summary: computed.summary,
            criticalBlockers: computed.criticalBlockers,
            ...(lineageRendered ? { lineageRendered } : {}),
          },
          blockers: computed.blockers,
          confidence: computed.confidence,
          freshness: {
            generatedAt: new Date().toISOString(),
            freshnessBudgetMs: scope.freshnessBudgetMs,
          },
          completedAt: new Date(),
        },
        snapshot: {
          organizationId: orgId,
          scopeType,
          scopeId,
          snapshotVersion: 1,
          isLatest: true,
          snapshotMetadata: {
            reportTypeId,
            providers: computed.providers,
            summary: computed.summary,
            confidence: computed.confidence,
          },
          createdBy: requestedBy,
        },
        dependencies: computed.providers.map(p => ({
          organizationId: orgId,
          provider: p.provider,
          status: p.status,
          blocker: p.blocker,
          observedAt: new Date(p.observedAt),
          payload: { scopeType, scopeId },
        })),
      },
      computed,
    );
    if (created === 'not-recorded') {
      return refuseUnrecorded(
        res,
        'REPORT_RUN_NOT_RECORDED',
        'The report run was not created: it could not be recorded in the audit trail, so nothing was saved. ' +
          'Run the report again once the audit trail is available.',
      );
    }
    const { run, snapshot } = created;

    return res.status(201).json({
      data: {
        run,
        snapshot,
        blockers: computed.blockers,
        confidence: computed.confidence,
      },
    });
  } catch (error: any) {
    return serverError(res, logger, 'saving runs', error);
  }
});

router.get('/runs/:id/dependencies', async (req: Request, res: Response) => {
  try {
    const runId = Number(req.params.id);
    // SECURITY: JWT-bound; the legacy ?organizationId= query param is
    // ignored to prevent cross-tenant report enumeration.
    const organizationId = authedOrgId(req) ?? NaN;
    if (!Number.isFinite(organizationId)) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId query parameter is required' });
    }
    const rows = await db
      .select()
      .from(reportRunDependencies)
      .where(
        and(
          eq(reportRunDependencies.runId, runId),
          eq(reportRunDependencies.organizationId, organizationId)
        )
      )
      .orderBy(desc(reportRunDependencies.observedAt));

    return res.json({ data: rows });
  } catch (error: any) {
    return serverError(res, logger, 'loading dependencies', error);
  }
});

/**
 * The run's governed PDF (services/report-os/pdf/run-pdf.ts), recorded before
 * it is sent. The body is the report itself: for a final run, the sealed
 * document, and only when it verifies; a record that contradicts the audit
 * chain is not exported. The seal read and the requester's name come from one
 * tenant-stamped transaction (run-seal.ts reads the status again there). The
 * export's id and time are printed on every page and recorded on the chain.
 */
async function sendRunPdf(
  req: Request,
  res: Response,
  run: typeof reportRuns.$inferSelect,
  reportType: { label: string | null; truthfulnessRules: unknown } | undefined,
) {
  const { view, document, runBy } = await inTenantTransaction(run.organizationId, async (client) => ({
    ...(await readSealForExport(client, run)),
    runBy: await actorName(client, run.requestedBy),
  }));
  if (view.verification.verdict === 'mismatch') return refuseSealMismatch(res, run.id, 'exported');
  const status = view.sealed ? 'final' : run.status;
  const exportId = randomUUID();
  const exportedAt = new Date().toISOString();
  const pdf = await buildRunPdf({
    run: { ...run, status },
    typeLabel: reportType?.label || run.reportTypeId,
    report: document ?? buildRenderedFromRun(run, reportType).rendered,
    seal: view.sealed ? view : null,
    runBy,
    exportId,
    exportedAt,
  });
  return sendRecordedPdf(
    req,
    res,
    {
      organizationId: run.organizationId,
      action: 'report_os.run_exported',
      resourceType: 'report_run',
      resourceId: String(run.id),
      details: {
        runUuid: run.runUuid, reportTypeId: run.reportTypeId, status, exportId, exportedAt,
        pages: pdf.pages, sealVerdict: view.sealed ? view.verification.verdict : null,
      },
    },
    { filename: `report-run-${run.id}.pdf`, buffer: pdf.bytes }
  );
}

router.get('/runs/:id/export.pdf', async (req: Request, res: Response) => {
  try {
    const runId = Number(req.params.id);
    // SECURITY: JWT-bound; the legacy ?organizationId= query param is
    // ignored to prevent cross-tenant report enumeration.
    const organizationId = authedOrgId(req) ?? NaN;
    if (!Number.isFinite(organizationId)) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    if (!Number.isFinite(runId) || runId <= 0) return res.status(400).json({ error: 'Invalid run id' });
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId query parameter is required' });
    }

    const [run] = await db
      .select()
      .from(reportRuns)
      .where(and(eq(reportRuns.id, runId), eq(reportRuns.organizationId, organizationId)))
      .limit(1);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const [reportType] = await db
      .select({ label: reportTypeRegistry.label, family: reportTypeRegistry.family, truthfulnessRules: reportTypeRegistry.truthfulnessRules })
      .from(reportTypeRegistry)
      .where(eq(reportTypeRegistry.typeId, run.reportTypeId))
      .limit(1);

    // Entitlement gate: exporting is a paid action too — a downgraded org
    // cannot export a report family above its tier.
    const exportGate = await requireReportEntitlement(
      organizationId, run.reportTypeId, reportType?.family,
    );
    if (!exportGate.entitled) {
      return res.status(403).json({
        error: `Exporting this report requires the ${exportGate.requiredTier} plan.`,
        feature: exportGate.feature,
        requiredTier: exportGate.requiredTier,
        tier: exportGate.tier,
      });
    }

    return await sendRunPdf(req, res, run, reportType);
  } catch (error: any) {
    return serverError(res, logger, 'loading export.pdf', error);
  }
});

/**
 * Build the rendered report document + truthfulness evaluation for a stored run.
 * Pure given the run + report-type rows (shared by the rendered and finalize
 * endpoints so they never disagree). `forceRequestStatus` lets the finalize path
 * test eligibility for `final` regardless of the stored run status. Critical
 * blockers are read from the severity-tagged value persisted at run creation,
 * falling back (for older runs) to treating every blocker as critical when the
 * type forbids final on missing critical evidence.
 */
function buildRenderedFromRun(
  run: typeof reportRuns.$inferSelect,
  reportType: { label: string | null; truthfulnessRules: unknown } | undefined,
  forceRequestStatus?: ReportRunStatus
): {
  rendered: ReturnType<typeof renderReport>;
  truthfulness: ReturnType<typeof evaluateTruthfulness>;
} {
  const dependencySummary = (run.dependencySummary ?? {}) as Record<string, unknown>;
  const providers = Array.isArray(dependencySummary.providers)
    ? (dependencySummary.providers as RenderInput['providers'])
    : [];
  const summary = (dependencySummary.summary ?? {}) as Record<string, unknown>;
  const blockers = toBlockerArray(run.blockers);
  const rules = (reportType?.truthfulnessRules ?? {}) as TruthfulnessRules;
  const storedCritical = Array.isArray(dependencySummary.criticalBlockers)
    ? (dependencySummary.criticalBlockers as string[])
    : null;
  const criticalBlockers =
    storedCritical ?? (rules.forbidFinalIfMissingCritical ? blockers : []);
  /* A final run renders as final: it read back as 'partial' (or 'draft')
     after its seal (reporting review 2026-10-01). */
  const requestedStatus: ReportRunStatus =
    forceRequestStatus ?? (run.status === 'completed' || run.status === 'final' ? 'final' : 'partial');
  const truthfulness = evaluateTruthfulness(
    {
      requestedStatus,
      confidence: run.confidence ?? 0,
      blockers,
      criticalBlockers,
      gapsSection: gapsWereEvaluated(summary),
      // The generic renderer and the stored lineage report emit no disclosure block.
      disclosure: false,
    },
    rules
  );
  // Document-scoped evidence-trace runs store a fully-mapped RenderedReport
  // (lineage dossier → blocks + provenance atoms) at creation. Reuse it verbatim
  // and only re-stamp the live truthfulness status, so `buildSealedRecord` seals
  // the dossier's real provenance atoms instead of the generic renderer's empty
  // set. All other types fall through to the generic renderer unchanged.
  const storedLineage = (dependencySummary as { lineageRendered?: RenderedReport })
    .lineageRendered;
  const rendered: RenderedReport = storedLineage
    ? { ...storedLineage, status: truthfulness.allowedStatus, truthfulness }
    : renderReport({
        reportTypeId: run.reportTypeId,
        reportTypeLabel: reportType?.label || run.reportTypeId,
        scopeType: run.scopeType,
        scopeId: run.scopeId,
        providers,
        confidence: run.confidence ?? 0,
        blockers,
        summary,
        status: truthfulness.allowedStatus,
        truthfulness,
        // The run's computation time, not the moment of rendering: "No gaps
        // detected as of" sealed the sealing time over data computed earlier,
        // and no two renders of one run were the same document.
        generatedAt: run.createdAt ? new Date(run.createdAt).toISOString() : undefined,
      });
  return { rendered, truthfulness };
}

/**
 * GET /runs/:id/rendered
 *
 * Render a stored run into the provenance-linked report document model and apply
 * the truthfulness gate. Read-only and org-scoped (JWT-bound; cross-tenant ids
 * 404). The gate is evaluated so the UI can show whether the report is eligible
 * to be finalized/sealed and, if not, why.
 */
router.get('/runs/:id/rendered', async (req: Request, res: Response) => {
  try {
    const runId = Number(req.params.id);
    const organizationId = authedOrgId(req) ?? NaN;
    if (!Number.isFinite(organizationId)) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    if (!Number.isFinite(runId) || runId <= 0) {
      return res.status(400).json({ error: 'Invalid run id' });
    }

    const [run] = await db
      .select()
      .from(reportRuns)
      .where(and(eq(reportRuns.id, runId), eq(reportRuns.organizationId, organizationId)))
      .limit(1);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const [reportType] = await db
      .select({ label: reportTypeRegistry.label, truthfulnessRules: reportTypeRegistry.truthfulnessRules })
      .from(reportTypeRegistry)
      .where(eq(reportTypeRegistry.typeId, run.reportTypeId))
      .limit(1);

    // A final run is shown as what was sealed, not re-rendered, and only when
    // the stored copy still verifies. A copy that no longer matches its seal is
    // refused, never shown as the sealed record; so is a run the audit chain
    // records as finalized whose status no longer says so. The status is read
    // again inside that transaction, after the chain (run-seal.ts).
    const stored = await inTenantTransaction(run.organizationId, (client) => readVerifiedSealedDocument(client, run));
    if (stored.verdict === 'intact' && stored.document) return res.json({ data: stored.document, sealed: true });
    if (stored.verdict === 'mismatch') return refuseSealMismatch(res, runId, 'shown');

    const { rendered } = buildRenderedFromRun(run, reportType);
    return res.json({ data: rendered });
  } catch (error: any) {
    return serverError(res, logger, 'loading rendered', error);
  }
});

/**
 * GET /runs/:id/seal
 *
 * A finalized run's seal, read back and re-verified (reporting review
 * 2026-10-01, Part 11): the stored sealed document is re-hashed and checked
 * against the stored seal and the audit chain's record of the act, with the
 * signer's printed name, time and meaning, the reason and the prior status.
 * A run that is not final answers `sealed: false`. A read that fails is an
 * error, never a verdict.
 */
router.get('/runs/:id/seal', async (req: Request, res: Response) => {
  try {
    const organizationId = requireSessionOrg(req, res);
    if (organizationId == null) return;
    const runId = Number(req.params.id);
    if (!Number.isSafeInteger(runId) || runId <= 0) {
      return res.status(400).json({ error: 'Invalid run id' });
    }
    const [run] = await db
      .select({ id: reportRuns.id, organizationId: reportRuns.organizationId, status: reportRuns.status })
      .from(reportRuns)
      .where(and(eq(reportRuns.id, runId), eq(reportRuns.organizationId, organizationId)))
      .limit(1);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const view = await inTenantTransaction(organizationId, (client) => readRunSeal(client, run));
    return res.json({ data: view });
  } catch (error: any) {
    return serverError(res, logger, 'reading seal', error);
  }
});

/**
 * POST /runs/:id/finalize
 *
 * Finalize and seal a run. Org-scoped (JWT-bound; cross-tenant ids 404). The
 * truthfulness gate is evaluated against a `final` request: if the type's rules
 * do not allow final (e.g. an unmet critical blocker), the endpoint refuses with
 * 409 and the reasons — a final report can never be issued over blocking gaps.
 * On success the rendered report is sealed (sha256 content hash + provenance
 * atoms), the run is marked final, and the seal is persisted onto the latest
 * snapshot's metadata.
 *
 * Review round 1 (DP-47): sealing is a governed act, so only organization
 * owners, admins and managers may do it, refused before anything is read. A
 * run already final is refused (409 RUN_ALREADY_FINAL): a seal is never
 * overwritten. The status, the seal and the chained audit row are written in
 * one tenant-stamped transaction (finalizeOnChain), so all land or none do.
 *
 * Reporting review 2026-10-01: finalizing is an electronic signature. It was a
 * side effect of the canvas's Export button, with no reason, no meaning and no
 * re-authentication. The body now carries `reason` (at least 8 characters,
 * requireGovernedReason), `meaning` and `reauth` ({ password, totp? }); the
 * ceremony in finalizeOnChain verifies them before anything is written.
 */
/** A finalize's tenant, run, signer and reason, or null having sent the refusal. Nothing is read before these hold. */
function finalizeRequest(
  req: Request,
  res: Response
): { runId: number; organizationId: number; userId: number; reason: string } | null {
  const runId = Number(req.params.id);
  const organizationId = authedOrgId(req) ?? NaN;
  const userId = getUserId(req);
  const reason = requireGovernedReason(req.body?.reason);
  if (!Number.isFinite(organizationId)) {
    res.status(403).json({ error: 'Tenant context required' });
  } else if (!Number.isFinite(runId) || runId <= 0) {
    res.status(400).json({ error: 'Invalid run id' });
  } else if (userId == null) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in to finalize a report.' } });
  } else if (!reason.ok) {
    res.status(400).json({ success: false, error: { code: 'REASON_REQUIRED', message: reason.error }, field: 'reason' });
  } else {
    return { runId, organizationId, userId, reason: reason.reason };
  }
  return null;
}

/** The answer for a finalize that reached the ceremony. */
function sendFinalizeOutcome(
  res: Response,
  runId: number,
  seal: SealedRecord,
  outcome: Awaited<ReturnType<typeof finalizeOnChain>>
) {
  if (outcome === 'not-found') return res.status(404).json({ error: 'Run not found' });
  if (outcome === 'already-final') return refuseAlreadyFinal(res, runId);
  if (outcome === 'no-snapshot') {
    return res.status(409).json({
      success: false,
      error: {
        code: 'RUN_HAS_NO_SNAPSHOT',
        message: 'This run has no snapshot to hold its seal, so it cannot be finalized. Run the report again. Nothing was changed.',
      },
      data: { runId },
    });
  }
  if (outcome === 'not-recorded') {
    return refuseUnrecorded(
      res,
      'REPORT_FINALIZE_NOT_RECORDED',
      'The report was not finalized because the finalization could not be recorded in the audit trail. ' +
        'Nothing was changed.',
      { runId }
    );
  }
  const { signed } = outcome;
  return res.json({
    data: {
      runId,
      status: 'final',
      seal,
      signature: { signatureId: signed.signatureId, signedAt: signed.signedAt, meaning: signed.meaning },
    },
  });
}

router.post('/runs/:id/finalize', requireRole(...REPORT_FINALIZE_ROLES), finalizeSigningAttempts, async (req: Request, res: Response) => {
  try {
    const asked = finalizeRequest(req, res);
    if (!asked) return;
    const { runId, organizationId, userId } = asked;

    const [run] = await db
      .select()
      .from(reportRuns)
      .where(and(eq(reportRuns.id, runId), eq(reportRuns.organizationId, organizationId)))
      .limit(1);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status === 'final') return refuseAlreadyFinal(res, runId);

    const [reportType] = await db
      .select({ label: reportTypeRegistry.label, truthfulnessRules: reportTypeRegistry.truthfulnessRules })
      .from(reportTypeRegistry)
      .where(eq(reportTypeRegistry.typeId, run.reportTypeId))
      .limit(1);

    const { rendered, truthfulness } = buildRenderedFromRun(run, reportType, 'final');
    if (truthfulness.allowedStatus !== 'final') {
      return res.status(409).json({
        error: 'Report is not eligible to be finalized',
        downgradedTo: truthfulness.allowedStatus,
        reasons: truthfulness.reasons,
      });
    }

    const seal = buildSealedRecord(rendered);
    let outcome: Awaited<ReturnType<typeof finalizeOnChain>>;
    try {
      outcome = await finalizeOnChain(req, run, { seal, document: rendered }, {
        userId,
        reason: asked.reason,
        meaning: req.body?.meaning,
        reauth: req.body?.reauth,
      });
    } catch (error) {
      if (!(error instanceof GovernedSignatureRefusal)) throw error;
      return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
    }
    return sendFinalizeOutcome(res, runId, seal, outcome);
  } catch (error: any) {
    return serverError(res, logger, 'saving finalize', error);
  }
});

router.get('/runs', async (req: Request, res: Response) => {
  try {
    const organizationId = requireSessionOrg(req, res);
    if (organizationId == null) return;
    const parsed = listRunsSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const {
      scopeType,
      scopeId,
      status,
      reportTypeId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit = 100,
    } = parsed.data;

    const filters = [eq(reportRuns.organizationId, organizationId)];
    if (scopeType) filters.push(eq(reportRuns.scopeType, scopeType));
    if (scopeId) filters.push(eq(reportRuns.scopeId, scopeId));
    if (status) filters.push(eq(reportRuns.status, status));
    if (reportTypeId) filters.push(eq(reportRuns.reportTypeId, reportTypeId));

    const rows = await db
      .select()
      .from(reportRuns)
      .where(and(...filters))
      .orderBy(desc(reportRuns.createdAt))
      .limit(limit);

    const typeMap = await getReportTypeLabelMap(rows.map(row => row.reportTypeId));
    let enriched = rows.map(row => {
      const summary = (row.dependencySummary as any)?.summary as
        | {
            regulatory?: {
              regionCode?: string;
              registryId?: string;
              agency?: string;
            };
          }
        | undefined;
      const regionCode = summary?.regulatory?.regionCode;
      const registryId = summary?.regulatory?.registryId;
      const agency = summary?.regulatory?.agency;
      return {
        ...row,
        reportTypeLabel: typeMap.get(row.reportTypeId) || row.reportTypeId,
        regionCode,
        registryId,
        agency,
      };
    });

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      enriched = enriched.filter(row =>
        [
          row.runUuid,
          row.scopeType,
          row.scopeId,
          row.status,
          row.reportTypeId,
          row.reportTypeLabel,
          row.regionCode,
          row.registryId,
          row.agency,
        ]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(q))
      );
    }

    const direction = sortOrder === 'asc' ? 1 : -1;
    enriched.sort((a, b) => {
      let compare = 0;
      if (sortBy === 'confidence') compare = (a.confidence ?? -1) - (b.confidence ?? -1);
      else if (sortBy === 'completedAt')
        compare = new Date(a.completedAt || 0).getTime() - new Date(b.completedAt || 0).getTime();
      else if (sortBy === 'status') compare = String(a.status).localeCompare(String(b.status));
      else if (sortBy === 'reportType')
        compare = String(a.reportTypeLabel).localeCompare(String(b.reportTypeLabel));
      else if (sortBy === 'scopeType') compare = String(a.scopeType).localeCompare(String(b.scopeType));
      else compare = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return compare * direction;
    });

    return res.json({ data: enriched });
  } catch (error: any) {
    return serverError(res, logger, 'loading runs', error);
  }
});

router.post('/bundles', async (req: Request, res: Response) => {
  try {
    const organizationId = requireSessionOrg(req, res);
    if (organizationId == null) return;
    const parsed = createBundleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { name, description, runIds } = parsed.data;
    const createdBy = getUserId(req);

    // Bundling is a paid packaging action — gate on the base report_families
    // capability (standard+). The member runs were already gated at generation.
    const bundleGate = await requireReportEntitlement(organizationId, 'readiness.executive_digest');
    if (!bundleGate.entitled) {
      return res.status(403).json({
        error: `Bundling reports requires the ${bundleGate.requiredTier} plan.`,
        feature: bundleGate.feature,
        requiredTier: bundleGate.requiredTier,
        tier: bundleGate.tier,
      });
    }

    const uniqueRunIds = [...new Set(runIds)];
    const runs = await db
      .select()
      .from(reportRuns)
      .where(
        and(eq(reportRuns.organizationId, organizationId), inArray(reportRuns.id, uniqueRunIds))
      );
    if (runs.length !== uniqueRunIds.length) {
      return res.status(400).json({ error: 'One or more runIds were not found for this organization' });
    }
    const typeMap = await getReportTypeLabelMap(runs.map(run => run.reportTypeId));
    const items: ReportBundleItem[] = runs.map(run => ({
      runId: run.id,
      runUuid: run.runUuid,
      reportTypeId: run.reportTypeId,
      reportTypeLabel: typeMap.get(run.reportTypeId) || run.reportTypeId,
      scopeType: run.scopeType,
      scopeId: run.scopeId,
      status: run.status,
      confidence: run.confidence ?? null,
      blockers: toBlockerArray(run.blockers),
      createdAt: safeIso(run.createdAt),
    }));
    // A bundle is stored as a memory entry on each project its runs cover.
    // This list was never filled in, so persistBundleRecord wrote nothing and
    // every bundle answered 201 and was never seen again. With no project to
    // store it under, say so instead of reporting a bundle that does not exist.
    const projectIds = [
      ...(await projectsInOrg(organizationId, resolveProjectsForBundleRuns(runs))),
    ];
    if (projectIds.length === 0) {
      return res.status(422).json({
        error: 'None of these runs belongs to a project, so the bundle has nowhere to be stored.',
      });
    }
    const bundle: ReportBundleRecord = {
      bundleId: randomUUID(),
      organizationId,
      name,
      description,
      createdAt: new Date().toISOString(),
      createdBy,
      projectIds,
      runIds: uniqueRunIds,
      items,
    };
    await persistBundleRecord(bundle);
    return res.status(201).json({ data: bundle });
  } catch (error: any) {
    return serverError(res, logger, 'saving bundles', error);
  }
});

router.get('/bundles', async (req: Request, res: Response) => {
  try {
    // SECURITY: JWT-bound; the legacy ?organizationId= query param is
    // ignored to prevent cross-tenant report enumeration.
    const organizationId = authedOrgId(req) ?? NaN;
    if (!Number.isFinite(organizationId)) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId query parameter is required' });
    }
    const rows = await loadBundlesForOrg(organizationId);
    return res.json({ data: rows });
  } catch (error: any) {
    return serverError(res, logger, 'loading bundles', error);
  }
});

/**
 * The bundle's governed PDF (services/report-os/pdf/bundle-pdf.ts), recorded
 * before it is sent. Each report's status is read at export, beside the status
 * it was bundled at; the bundler's name and the statuses come from one
 * tenant-stamped read. The export id and time are printed on every page and
 * recorded on the chain row with how many reports were final.
 */
async function sendBundlePdf(req: Request, res: Response, bundle: ReportBundleRecord) {
  const { now, bundledBy } = await inTenantTransaction(bundle.organizationId, async (client) => {
    const { rows } = await client.query('SELECT id, status FROM report_runs WHERE organization_id = $1 AND id = ANY($2::int[])', [
      bundle.organizationId,
      bundle.runIds,
    ]);
    const statuses = new Map((rows as Array<{ id: unknown; status: unknown }>).map((r) => [Number(r.id), String(r.status)]));
    return { now: statuses, bundledBy: await actorName(client, bundle.createdBy ?? null) };
  });
  const items = bundle.items.map((i) => ({
    runId: i.runId, label: i.reportTypeLabel, scopeType: i.scopeType, scopeId: i.scopeId,
    bundledStatus: i.status, currentStatus: now.get(i.runId) ?? null, confidence: i.confidence,
  }));
  const exportId = randomUUID();
  const exportedAt = new Date().toISOString();
  const pdf = await buildBundlePdf({ bundle, bundledBy, items, exportId, exportedAt });
  return sendRecordedPdf(
    req,
    res,
    {
      organizationId: bundle.organizationId,
      action: 'report_os.bundle_exported',
      resourceType: 'report_bundle',
      resourceId: bundle.bundleId,
      details: {
        bundleId: bundle.bundleId, runIds: bundle.runIds, reportTypeIds: [...new Set(bundle.items.map((i) => i.reportTypeId))],
        exportId, exportedAt, pages: pdf.pages, finalAtExport: items.filter((i) => i.currentStatus === 'final').length,
      },
    },
    { filename: `report-bundle-${bundle.bundleId.slice(0, 8)}.pdf`, buffer: pdf.bytes }
  );
}

router.get('/bundles/:bundleId/export.pdf', async (req: Request, res: Response) => {
  try {
    // SECURITY: JWT-bound; the legacy ?organizationId= query param is
    // ignored to prevent cross-tenant report enumeration.
    const organizationId = authedOrgId(req) ?? NaN;
    if (!Number.isFinite(organizationId)) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId query parameter is required' });
    }
    const bundleId = Array.isArray(req.params.bundleId) ? req.params.bundleId[0] : req.params.bundleId;
    if (!bundleId) return res.status(400).json({ error: 'bundleId route parameter is required' });
    const bundle = await loadBundleById(organizationId, bundleId);
    if (!bundle || bundle.organizationId !== organizationId) {
      return res.status(404).json({ error: 'Bundle not found' });
    }
    // The run export's entitlement gate, over every report in the bundle, and
    // the same record-before-send step (review round 1, DP-50).
    const refusal = await bundleExportRefusal(organizationId, bundle);
    if (refusal) {
      return res.status(403).json({
        error: `Exporting this bundle requires the ${refusal.requiredTier} plan.`,
        feature: refusal.feature,
        requiredTier: refusal.requiredTier,
        tier: refusal.tier,
      });
    }
    return await sendBundlePdf(req, res, bundle);
  } catch (error: any) {
    return serverError(res, logger, 'loading export.pdf', error);
  }
});

router.get('/deliveries', async (req: Request, res: Response) => {
  try {
    // SECURITY: JWT-bound; the legacy ?organizationId= query param is
    // ignored to prevent cross-tenant report enumeration.
    const organizationId = authedOrgId(req) ?? NaN;
    if (!Number.isFinite(organizationId)) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId query parameter is required' });
    }
    const rows = await loadDeliveriesForOrg(organizationId);
    return res.json({ data: rows });
  } catch (error: any) {
    return serverError(res, logger, 'loading deliveries', error);
  }
});

/*
 * POST /deliveries (P1-44, DP-50 second half). A delivery used to write its
 * letter through a helper that swallowed its own error, then answered 'sent'
 * whether or not the letter existed, with no chain row; a delivery whose
 * project could not be resolved was answered and stored nowhere. Now the
 * target is resolved and checked first, then the letter (platform_send), the
 * delivery record, the learning memory and the chained row are ONE
 * tenant-stamped transaction, and 'sent' is answered only after it commits.
 */
type DeliveryPayload = z.infer<typeof createDeliverySchema>;
type DeliveryRefusal = { refusal: { status: number; body: Record<string, unknown> } };
type DeliveryReports = { projectId?: number; statuses: string[] };

function refuseDelivery(status: number, body: Record<string, unknown>): DeliveryRefusal {
  return { refusal: { status, body } };
}

/**
 * The reports a delivery carries — the run, the bundle's runs as they stand
 * NOW (a run finalized after it was bundled counts as final) — their statuses,
 * and the project the first of them is scoped to.
 */
async function loadDeliveryReports(
  organizationId: number,
  payload: DeliveryPayload
): Promise<DeliveryReports | DeliveryRefusal> {
  const found: DeliveryReports = { statuses: [] };
  if (payload.runId) {
    const [run] = await db
      .select()
      .from(reportRuns)
      .where(and(eq(reportRuns.id, payload.runId), eq(reportRuns.organizationId, organizationId)))
      .limit(1);
    if (!run) return refuseDelivery(404, { error: 'Run not found' });
    found.projectId = resolveProjectIdForRun(run);
    found.statuses.push(run.status);
  }
  if (payload.bundleId) {
    const bundle = await loadBundleById(organizationId, payload.bundleId);
    if (!bundle || bundle.organizationId !== organizationId) return refuseDelivery(404, { error: 'Bundle not found' });
    const runs = bundle.runIds.length
      ? await db
          .select()
          .from(reportRuns)
          .where(and(eq(reportRuns.organizationId, organizationId), inArray(reportRuns.id, bundle.runIds)))
      : [];
    const first = runs.find(run => run.id === bundle.items[0]?.runId);
    if (!found.projectId && first) found.projectId = resolveProjectIdForRun(first);
    found.statuses.push(...runs.map(run => run.status));
  }
  return found;
}

/**
 * The e-signature rule of services/report-os/scheduling/delivery.ts, over every
 * report the delivery carries: a final report delivered on the external
 * channel needs one. A report run has no signing ceremony yet, so the
 * requirement cannot be met and the delivery is refused — fail closed, rather
 * than recorded as sent unsigned.
 */
function signatureRefusal(payload: DeliveryPayload, statuses: string[]): DeliveryRefusal | null {
  const channel = payload.channel === 'external_pdf_export' ? 'external' : 'platform';
  const unsigned = statuses.some(
    status => decideDelivery({ status: status as ReportRunStatus }, channel).requiresESignature
  );
  if (!unsigned) return null;
  return refuseDelivery(409, {
    success: false,
    error: {
      code: 'E_SIGNATURE_REQUIRED',
      message:
        'A final report delivered outside the platform requires an e-signature, and report runs ' +
        'cannot be e-signed yet. The delivery was refused. Nothing was recorded.',
    },
  });
}

/** Where the delivery is recorded, checked against the session's organization, or the refusal. */
async function resolveDeliveryTarget(
  organizationId: number,
  payload: DeliveryPayload
): Promise<{ projectId: number } | DeliveryRefusal> {
  const reports = await loadDeliveryReports(organizationId, payload);
  if ('refusal' in reports) return reports;
  // Whether it came from the body or from a run's scope, the project the
  // delivery is recorded under must be this org's.
  const projectId = payload.projectId ?? reports.projectId;
  if (!projectId) {
    return refuseDelivery(422, {
      error: 'This delivery belongs to no project, so it has nowhere to be recorded. Name the project it belongs to.',
    });
  }
  if (!(await projectsInOrg(organizationId, [projectId])).has(projectId)) {
    return refuseDelivery(404, { error: 'Project not found' });
  }
  if (
    payload.channel === 'platform_send' &&
    payload.submissionId &&
    !(await submissionInProject(organizationId, projectId, payload.submissionId))
  ) {
    return refuseDelivery(404, { error: 'Submission not found' });
  }
  return signatureRefusal(payload, reports.statuses) ?? { projectId };
}

function newDeliveryRecord(
  organizationId: number,
  projectId: number,
  payload: DeliveryPayload,
  requestedBy: number | undefined
): DeliveryRecord & { projectId: number } {
  return {
    deliveryId: randomUUID(),
    organizationId,
    projectId,
    runId: payload.runId,
    bundleId: payload.bundleId,
    submissionId: payload.submissionId,
    channel: payload.channel,
    correspondenceType: payload.correspondenceType,
    recipients: payload.recipients,
    subject: payload.subject,
    message: payload.message,
    status: payload.channel === 'platform_send' ? 'sent' : 'exported',
    requestedBy,
    createdAt: new Date().toISOString(),
  };
}

function deliveryLearningMemory(delivery: DeliveryRecord & { projectId: number }) {
  const sourceRef = delivery.runId ? `run:${delivery.runId}` : delivery.bundleId ? `bundle:${delivery.bundleId}` : 'unspecified';
  return {
    organizationId: delivery.organizationId,
    projectId: delivery.projectId,
    userId: delivery.requestedBy,
    title: `Outbound correspondence — ${delivery.subject}`,
    subcategory: 'outbound_regulatory_correspondence',
    content: [
      `channel=${delivery.channel}`,
      `source=${sourceRef}`,
      `subject=${delivery.subject}`,
      `correspondenceType=${delivery.correspondenceType || 'unspecified'}`,
      `recipients=${delivery.recipients.join(', ') || 'none'}`,
      `message=${(delivery.message || '').slice(0, 4000)}`,
    ].join('\n'),
  };
}

/** The delivery's chained row. Recipients are counted, not copied: the record holds them. */
function deliveryEvent(delivery: DeliveryRecord): ReportAuditEvent {
  return {
    organizationId: delivery.organizationId,
    action: delivery.channel === 'platform_send' ? 'report_os.delivery_sent' : 'report_os.delivery_exported',
    resourceType: 'report_delivery',
    resourceId: delivery.deliveryId,
    details: {
      channel: delivery.channel,
      status: delivery.status,
      runId: delivery.runId,
      bundleId: delivery.bundleId,
      projectId: delivery.projectId,
      submissionId: delivery.submissionId,
      correspondenceId: delivery.correspondenceId,
      correspondenceType: delivery.correspondenceType,
      subject: delivery.subject,
      recipientCount: delivery.recipients.length,
    },
  };
}

/**
 * Every write of a delivery on ONE tenant-stamped transaction: the letter and
 * its issues (platform_send), the delivery record, the learning memory when
 * asked for, then the chained row. Returns the delivery once all of it
 * committed; null when any write was refused — all of it rolled back, the
 * reason logged and never sent to the client.
 */
async function recordDelivery(
  req: Request,
  payload: DeliveryPayload,
  delivery: DeliveryRecord & { projectId: number }
): Promise<DeliveryRecord | null> {
  try {
    return await inTenantTransaction(delivery.organizationId, async (client) => {
      const executor = onTransaction(client);
      const recorded = { ...delivery };
      if (payload.channel === 'platform_send' && payload.submissionId) {
        const letter: CorrespondenceInput = {
          organizationId: delivery.organizationId,
          projectId: delivery.projectId,
          submissionId: payload.submissionId,
          direction: 'outbound',
          sourceChannel: 'api_import',
          communicationType: payload.correspondenceType || 'transmittal',
          subject: payload.subject,
          body: payload.message || payload.subject,
          recipients: payload.recipients,
          urgency: payload.urgency || 'medium',
          responseRequired: false,
          userId: delivery.requestedBy,
        };
        recorded.correspondenceId = await writeCorrespondence(client, letter, parseKeywordIssues(letter.body));
      }
      await persistDeliveryRecord(recorded, executor);
      if (payload.captureForLearning) await captureLearningMemory(deliveryLearningMemory(recorded), executor);
      await writeReportEvent(client, req, deliveryEvent(recorded));
      return recorded;
    });
  } catch (error) {
    logger.error('report delivery not recorded; rolled back', {
      deliveryId: delivery.deliveryId,
      channel: delivery.channel,
      error: (error as Error)?.message,
    });
    return null;
  }
}

// DP-61 (2026-10-01): a delivery writes an outbound regulatory letter or
// records an external export, so it carries finalize's tier, not membership.
router.post('/deliveries', requireRole('owner', 'admin', 'manager'), async (req: Request, res: Response) => {
  try {
    const organizationId = requireSessionOrg(req, res);
    if (organizationId == null) return;
    const parsed = createDeliverySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const payload = parsed.data;
    const target = await resolveDeliveryTarget(organizationId, payload);
    if ('refusal' in target) return res.status(target.refusal.status).json(target.refusal.body);
    const recorded = await recordDelivery(
      req,
      payload,
      newDeliveryRecord(organizationId, target.projectId, payload, getUserId(req))
    );
    if (!recorded) {
      return refuseUnrecorded(
        res,
        'REPORT_DELIVERY_NOT_RECORDED',
        'The delivery could not be recorded with its audit trail, so it was not sent. Nothing was recorded.'
      );
    }
    return res.status(201).json({ data: recorded });
  } catch (error: any) {
    return serverError(res, logger, 'saving deliveries', error);
  }
});

/* POST /correspondence/capture was removed 2026-10-01 (reporting review). It
   wrote the regulatory correspondence register, its issues and a project
   memory entry with no audit row, no role gate, a client-chosen source channel
   and a second keyword parser at a constant 0.72 confidence. No client called
   it. The canonical intake is POST /api/regulatory-correspondence/correspondence/intake
   (routes/regulatory-correspondence.ts): the governed parser, one transaction
   with its timeline event, and the central audit trail. */

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const [groupCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportProgramGroups);
    const [typeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportTypeRegistry);
    const [runCount] = await db.select({ count: sql<number>`count(*)::int` }).from(reportRuns);
    const [snapshotCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportSnapshots);
    const [dependencyCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reportRunDependencies);
    const [bundleRecords, deliveryRecords] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(projectMemoryEntries)
        .where(
          and(
            eq(projectMemoryEntries.category, 'regulatory'),
            eq(projectMemoryEntries.subcategory, REPORT_OS_BUNDLE_SUBCATEGORY),
            eq(projectMemoryEntries.sourceDocumentType, REPORT_OS_RECORD_SOURCE)
          )
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(projectMemoryEntries)
        .where(
          and(
            eq(projectMemoryEntries.category, 'regulatory'),
            eq(projectMemoryEntries.subcategory, REPORT_OS_DELIVERY_SUBCATEGORY),
            eq(projectMemoryEntries.sourceDocumentType, REPORT_OS_RECORD_SOURCE)
          )
        ),
    ]);

    return res.json({
      data: {
        groups: groupCount?.count ?? 0,
        taxonomyTypes: typeCount?.count ?? 0,
        runs: runCount?.count ?? 0,
        snapshots: snapshotCount?.count ?? 0,
        dependencies: dependencyCount?.count ?? 0,
        bundles: bundleRecords[0]?.count ?? 0,
        deliveries: deliveryRecords[0]?.count ?? 0,
      },
    });
  } catch (error: any) {
    return serverError(res, logger, 'loading health', error);
  }
});

export default router;
