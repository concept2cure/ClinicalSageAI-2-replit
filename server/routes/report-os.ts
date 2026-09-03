import { Router, Request, Response } from 'express';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, getPool } from '../db';
import { authedOrgId } from '../utils/authedOrgId';
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
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import { REPORT_TYPE_SEED } from '../services/report-os/taxonomy';
import { GLOBAL_REPORT_TYPE_SEED } from '../services/report-os/taxonomy-global';
import { PREDICTION_REPORT_TYPES } from '../services/report-os/prediction/report-types';
import { resolveScope } from '../services/report-os/scope-model';
import {
  deriveOrgSegments,
  filterTypesForSegment,
  type SegmentFilterableType,
} from '../services/report-os/segment';
import {
  requireReportEntitlement,
  decideReportEntitlement,
} from '../services/report-os/entitlement-map';
import { fetchPortfolioReport, fetchOrgPortfolioSummary } from '../services/report-os/portfolio/fetch';
import { resolveCapabilities } from '../services/entitlements/resolver';
import type { Tier } from '../services/entitlements/types';
import { computeInitialRun } from '../services/report-os/orchestrator';
import { renderReport, type RenderInput } from '../services/report-os/render/render';
import type { RenderedReport } from '../services/report-os/render/types';
import { buildSealedRecord } from '../services/report-os/sealing/seal';
import {
  evaluateTruthfulness,
  type TruthfulnessRules,
  type ReportRunStatus,
} from '../services/report-os/truthfulness';
import { evaluateReadiness } from '../services/regulatory/readinessEvaluator.js';
import { buildPackageManifest } from '../services/regulatory/submissionPackageBuilder.js';
import { resolveRegistryId } from '../services/regulatory/registry/legacySubmissionTypeMapper.js';
import { authMiddleware } from '../auth';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();

const logger = createScopedLogger('report-os');
router.use(authMiddleware);
const canSeedTaxonomy = () =>
  process.env.NODE_ENV !== 'production' ||
  (process.env.REPORT_OS_ALLOW_SEED === 'true' &&
    !!process.env.REPORT_OS_SEED_KEY &&
    process.env.REPORT_OS_SEED_KEY.length > 8);

const createProgramGroupSchema = z.object({
  organizationId: z.number().int().positive(),
  clientWorkspaceId: z.number().int().positive().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  projectIds: z.array(z.number().int().positive()).min(1),
  createdBy: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createProgramSnapshotSchema = z.object({
  organizationId: z.number().int().positive(),
  snapshotLabel: z.string().optional(),
  snapshotReason: z.string().optional(),
  createdBy: z.number().int().positive().optional(),
});

const createRunSchema = z.object({
  organizationId: z.number().int().positive(),
  clientWorkspaceId: z.number().int().positive().optional(),
  scopeType: z.enum(reportScopeEnum),
  scopeId: z.string().min(1),
  reportTypeId: z.string().min(1),
  registryId: z.string().max(80).optional(),
  submissionType: z.string().max(80).optional(),
  requestedBy: z.number().int().positive().optional(),
});

const listRunsSchema = z.object({
  organizationId: z.coerce.number().int().positive(),
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
  organizationId: z.number().int().positive(),
  name: z.string().min(2).max(180),
  description: z.string().max(1000).optional(),
  runIds: z.array(z.number().int().positive()).min(1),
  createdBy: z.number().int().positive().optional(),
});

const createDeliverySchema = z
  .object({
    organizationId: z.number().int().positive(),
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
    requestedBy: z.number().int().positive().optional(),
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

const captureCorrespondenceSchema = z.object({
  organizationId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  submissionId: z.string().optional(),
  direction: z.enum(['inbound', 'outbound', 'internal']).default('inbound'),
  sourceChannel: z.enum(['manual_upload', 'mailbox_sync', 'api_import']).default('manual_upload'),
  communicationType: z.string().min(3).max(80).default('deficiency_letter'),
  subject: z.string().min(2).max(240),
  body: z.string().min(1).max(120000),
  recipients: z.array(z.string().max(200)).default([]),
  sender: z.string().max(200).optional(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  responseRequired: z.boolean().default(true),
  captureForLearning: z.boolean().default(true),
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

const REPORT_OS_RECORD_CATEGORY = 'regulatory';
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

function sanitizePdfText(text: string): string {
  return text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ').slice(0, 1000);
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

async function ensureProjectProfileId(
  organizationId: number,
  projectId: number,
  userId?: number
): Promise<number> {
  const existing = await db
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

  const inserted = await db
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

async function captureLearningMemory(params: {
  organizationId: number;
  projectId: number;
  userId?: number;
  title: string;
  content: string;
  subcategory: string;
  confidenceScore?: number;
}) {
  const profileId = await ensureProjectProfileId(params.organizationId, params.projectId, params.userId);
  await db.insert(projectMemoryEntries).values({
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

async function isTableReady(tableName: string): Promise<boolean> {
  try {
    const pool = getPool();
    const result = await pool.query(`SELECT to_regclass($1) AS table_name`, [`public.${tableName}`]);
    return !!result.rows[0]?.table_name;
  } catch {
    return false;
  }
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

async function createRunPdf(params: {
  run: any;
  typeLabel: string;
  blockers: string[];
  providers: Array<{ provider: string; status: string; blocker?: string | null }>;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const left = 50;
  let y = 750;

  page.drawText('Concept2Cure Regulatory Report', { x: left, y, size: 18, font: bold });
  y -= 24;
  page.drawText(`Run #${params.run.id} (${sanitizePdfText(params.run.runUuid)})`, {
    x: left,
    y,
    size: 10,
    font: regular,
    color: rgb(0.35, 0.35, 0.35),
  });
  y -= 24;

  const lines = [
    `Report Type: ${sanitizePdfText(params.typeLabel)} (${sanitizePdfText(params.run.reportTypeId)})`,
    `Scope: ${sanitizePdfText(params.run.scopeType)}:${sanitizePdfText(params.run.scopeId)}`,
    `Status: ${sanitizePdfText(params.run.status)}`,
    `Confidence: ${params.run.confidence ?? 'N/A'}`,
    `Generated: ${safeIso(params.run.createdAt)}`,
  ];
  for (const line of lines) {
    page.drawText(line, { x: left, y, size: 10, font: regular });
    y -= 16;
  }

  y -= 6;
  page.drawText('Dependency Providers', { x: left, y, size: 11, font: bold });
  y -= 16;
  for (const provider of params.providers) {
    const text = `${provider.provider} — ${provider.status}${provider.blocker ? ` (${provider.blocker})` : ''}`;
    page.drawText(sanitizePdfText(text), { x: left + 8, y, size: 9, font: regular });
    y -= 14;
    if (y < 80) break;
  }

  if (params.blockers.length > 0 && y > 120) {
    y -= 4;
    page.drawText('Known Blockers', { x: left, y, size: 11, font: bold });
    y -= 16;
    for (const blocker of params.blockers) {
      page.drawText(`- ${sanitizePdfText(blocker)}`, { x: left + 8, y, size: 9, font: regular });
      y -= 13;
      if (y < 80) break;
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

async function createBundlePdf(bundle: ReportBundleRecord): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const left = 50;
  let y = 750;

  page.drawText('Concept2Cure Report Bundle', { x: left, y, size: 18, font: bold });
  y -= 22;
  page.drawText(sanitizePdfText(bundle.name), { x: left, y, size: 12, font: regular });
  y -= 18;
  page.drawText(`Bundle ID: ${bundle.bundleId}`, {
    x: left,
    y,
    size: 9,
    font: regular,
    color: rgb(0.35, 0.35, 0.35),
  });
  y -= 16;
  page.drawText(`Generated: ${bundle.createdAt}`, {
    x: left,
    y,
    size: 9,
    font: regular,
    color: rgb(0.35, 0.35, 0.35),
  });
  y -= 20;

  if (bundle.description) {
    page.drawText(sanitizePdfText(bundle.description), { x: left, y, size: 10, font: regular });
    y -= 20;
  }

  page.drawText('Included Reports', { x: left, y, size: 11, font: bold });
  y -= 16;
  for (const item of bundle.items) {
    const line = `#${item.runId} ${item.reportTypeLabel} — ${item.scopeType}:${item.scopeId} — ${item.status} (confidence ${item.confidence ?? 'N/A'})`;
    page.drawText(sanitizePdfText(line), { x: left + 6, y, size: 9, font: regular });
    y -= 13;
    if (y < 70) break;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
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

async function persistDeliveryRecord(delivery: DeliveryRecord) {
  if (!delivery.projectId) return;
  const profileId = await ensureProjectProfileId(delivery.organizationId, delivery.projectId, delivery.requestedBy);
  await db.insert(projectMemoryEntries).values({
    projectProfileId: profileId,
    projectId: delivery.projectId,
    organizationId: delivery.organizationId,
    category: 'regulatory',
    subcategory: REPORT_OS_DELIVERY_SUBCATEGORY,
    title: `delivery:${delivery.deliveryId}`,
    content: JSON.stringify({ deliveryRecord: delivery }).slice(0, 20000),
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

async function persistCorrespondenceToPlatform(params: {
  organizationId: number;
  projectId: number;
  submissionId?: string;
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
}): Promise<{ correspondenceId?: string; issues: ReturnType<typeof parseKeywordIssues>; persisted: boolean }> {
  const issues = parseKeywordIssues(params.body);
  if (!params.submissionId) return { issues, persisted: false };
  const correspondenceReady = await isTableReady('c2c_correspondence');
  const issuesReady = await isTableReady('c2c_correspondence_issues');
  if (!correspondenceReady || !issuesReady) return { issues, persisted: false };

  try {
    const pool = getPool();
    const correspondenceId = randomUUID();
    await pool.query(
      `INSERT INTO c2c_correspondence
        (id, organization_id, project_id, submission_id, direction, source_channel, communication_type,
         subject, sender, recipients, received_at, urgency, response_required, status,
         parser_metadata, attachment_refs, parsed_text, summary)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17)`,
      [
        correspondenceId,
        params.organizationId,
        params.projectId,
        params.submissionId,
        params.direction,
        params.sourceChannel,
        params.communicationType,
        params.subject,
        params.sender || null,
        JSON.stringify(params.recipients || []),
        params.urgency,
        params.responseRequired,
        params.direction === 'outbound' ? 'responded' : 'new',
        JSON.stringify({
          parserVersion: 'report-os-v1',
          extractionVersion: '2026-04-01',
          importedByUserId: params.userId || null,
        }),
        JSON.stringify([]),
        params.body,
        params.body.slice(0, 200),
      ]
    );

    for (const issue of issues) {
      await pool.query(
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
          params.body.slice(0, 280),
          0.72,
          'pending',
          JSON.stringify([]),
          JSON.stringify([]),
          'open',
        ]
      );
    }
    return { correspondenceId, issues, persisted: true };
  } catch {
    return { issues, persisted: false };
  }
}

router.get('/scopes', (_req: Request, res: Response) => {
  res.json({ data: reportScopeEnum });
});

router.post('/taxonomy/seed', async (_req: Request, res: Response) => {
  if (!canSeedTaxonomy()) {
    return res.status(403).json({ error: 'taxonomy seeding is disabled in this environment' });
  }
  if (process.env.REPORT_OS_SEED_KEY) {
    const providedKey = _req.headers['x-report-os-seed-key'];
    if (!providedKey || providedKey !== process.env.REPORT_OS_SEED_KEY) {
      return res.status(403).json({ error: 'Invalid seed key' });
    }
  }
  try {
    // The base seed plus the global-markets seed (FDA/EMA/PMDA/HC/MHRA/TGA/NMPA/
    // MFDS/Swissmedic/ANVISA + EU MDR/IVDR + PV) register together so every market
    // is available; typeIds are unique across both sets.
    const allSeed = [...REPORT_TYPE_SEED, ...GLOBAL_REPORT_TYPE_SEED, ...PREDICTION_REPORT_TYPES];
    for (const row of allSeed) {
      await db
        .insert(reportTypeRegistry)
        .values(row)
        .onConflictDoUpdate({
          target: reportTypeRegistry.typeId,
          set: {
            label: row.label,
            family: row.family,
            allowedScopes: row.allowedScopes,
            allowedPersonas: row.allowedPersonas,
            allowedClientSegments: row.allowedClientSegments,
            dataDependencies: row.dataDependencies,
            artifactDependencies: row.artifactDependencies,
            workflowDependencies: row.workflowDependencies,
            anaModules: row.anaModules,
            exportTemplate: row.exportTemplate,
            governanceRequirements: row.governanceRequirements,
            truthfulnessRules: row.truthfulnessRules,
            updatedAt: new Date(),
          },
        });
    }
    return res.json({ success: true, seeded: allSeed.length });
  } catch (error: any) {
    return serverError(res, logger, 'seeding taxonomy', error);
  }
});

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
    if (!summary) {
      return res.status(404).json({ error: 'No programs found for this organization' });
    }
    return res.json({ data: summary });
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
            .innerJoin(projects, eq(projects.id, reportProgramGroupProjects.projectId))
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
    const parsed = createProgramGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const {
      organizationId,
      clientWorkspaceId,
      name,
      description,
      projectIds,
      createdBy,
      metadata,
    } = parsed.data;
    const orgId = organizationId;

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

    const uniqueProjectIds = [
      ...new Set(projectIds.map((id: any) => Number(id)).filter(Number.isFinite)),
    ];
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
    const id = Number(req.params.id);
    const { name, description, status, projectIds, updatedBy, metadata } = req.body;

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
      .where(eq(reportProgramGroups.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Program group not found' });

    if (Array.isArray(projectIds)) {
      await db
        .delete(reportProgramGroupProjects)
        .where(eq(reportProgramGroupProjects.programGroupId, id));
      const uniqueProjectIds = [
        ...new Set(projectIds.map((v: any) => Number(v)).filter(Number.isFinite)),
      ];
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
    const id = Number(req.params.id);
    const parsed = createProgramSnapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { organizationId: orgId, snapshotLabel, snapshotReason, createdBy } = parsed.data;

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
    const parsed = createRunSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const {
      organizationId: orgId,
      clientWorkspaceId,
      scopeType,
      scopeId,
      reportTypeId,
      registryId,
      submissionType,
      requestedBy,
    } = parsed.data;

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

    // Entitlement gate: refuse to generate a report above the org's tier.
    // Gated on the authed org (never the body) so a downgraded tier cannot
    // be bypassed by a crafted organizationId.
    const gateOrgId = authedOrgId(req) ?? orgId;
    const gate = await requireReportEntitlement(gateOrgId, type[0].typeId, type[0].family);
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

    const [run] = await db
      .insert(reportRuns)
      .values({
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
      })
      .returning();

    const [snapshot] = await db
      .insert(reportSnapshots)
      .values({
        runId: run.id,
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
      })
      .returning();

    if (computed.providers.length > 0) {
      await db.insert(reportRunDependencies).values(
        computed.providers.map(p => ({
          runId: run.id,
          organizationId: orgId,
          provider: p.provider,
          status: p.status,
          blocker: p.blocker,
          observedAt: new Date(p.observedAt),
          payload: {
            scopeType,
            scopeId,
          },
        }))
      );
    }

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
      .select({ label: reportTypeRegistry.label, family: reportTypeRegistry.family })
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
    const providers = await db
      .select({
        provider: reportRunDependencies.provider,
        status: reportRunDependencies.status,
        blocker: reportRunDependencies.blocker,
      })
      .from(reportRunDependencies)
      .where(
        and(eq(reportRunDependencies.runId, runId), eq(reportRunDependencies.organizationId, organizationId))
      )
      .orderBy(asc(reportRunDependencies.provider));
    const buffer = await createRunPdf({
      run,
      typeLabel: reportType?.label || run.reportTypeId,
      blockers: toBlockerArray(run.blockers),
      providers,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-run-${runId}.pdf"`);
    return res.send(buffer);
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
  const requestedStatus: ReportRunStatus =
    forceRequestStatus ?? (run.status === 'completed' ? 'final' : 'partial');
  const truthfulness = evaluateTruthfulness(
    {
      requestedStatus,
      confidence: run.confidence ?? 0,
      blockers,
      criticalBlockers,
      gapsSection: true,
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

    const { rendered } = buildRenderedFromRun(run, reportType);
    return res.json({ data: rendered });
  } catch (error: any) {
    return serverError(res, logger, 'loading rendered', error);
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
 */
router.post('/runs/:id/finalize', async (req: Request, res: Response) => {
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

    const { rendered, truthfulness } = buildRenderedFromRun(run, reportType, 'final');
    if (truthfulness.allowedStatus !== 'final') {
      return res.status(409).json({
        error: 'Report is not eligible to be finalized',
        downgradedTo: truthfulness.allowedStatus,
        reasons: truthfulness.reasons,
      });
    }

    const seal = buildSealedRecord(rendered);

    await db
      .update(reportRuns)
      .set({ status: 'final', completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(reportRuns.id, runId), eq(reportRuns.organizationId, organizationId)));

    const [snapshot] = await db
      .select()
      .from(reportSnapshots)
      .where(
        and(
          eq(reportSnapshots.runId, runId),
          eq(reportSnapshots.organizationId, organizationId),
          eq(reportSnapshots.isLatest, true)
        )
      )
      .limit(1);
    if (snapshot) {
      const mergedMetadata = {
        ...((snapshot.snapshotMetadata ?? {}) as Record<string, unknown>),
        seal,
        finalizedAt: new Date().toISOString(),
      };
      await db
        .update(reportSnapshots)
        .set({ snapshotMetadata: mergedMetadata })
        .where(eq(reportSnapshots.id, snapshot.id));
    }

    return res.json({ data: { runId, status: 'final', seal } });
  } catch (error: any) {
    return serverError(res, logger, 'saving finalize', error);
  }
});

router.get('/runs', async (req: Request, res: Response) => {
  try {
    const parsed = listRunsSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const {
      organizationId,
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
    const parsed = createBundleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { organizationId, name, description, runIds, createdBy } = parsed.data;

    // Bundling is a paid packaging action — gate on the base report_families
    // capability (standard+). The member runs were already gated at generation.
    const bundleGate = await requireReportEntitlement(
      authedOrgId(req) ?? organizationId, 'readiness.executive_digest',
    );
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
    const bundle: ReportBundleRecord = {
      bundleId: randomUUID(),
      organizationId,
      name,
      description,
      createdAt: new Date().toISOString(),
      createdBy,
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
    const buffer = await createBundlePdf(bundle);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report-bundle-${bundle.bundleId.slice(0, 8)}.pdf"`
    );
    return res.send(buffer);
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

router.post('/deliveries', async (req: Request, res: Response) => {
  try {
    const parsed = createDeliverySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const payload = parsed.data;
    const userId = payload.requestedBy || getUserId(req);
    let projectId = payload.projectId;
    let runRecord: any | undefined;
    let bundleRecord: ReportBundleRecord | undefined;

    if (payload.runId) {
      [runRecord] = await db
        .select()
        .from(reportRuns)
        .where(and(eq(reportRuns.id, payload.runId), eq(reportRuns.organizationId, payload.organizationId)))
        .limit(1);
      if (!runRecord) return res.status(404).json({ error: 'Run not found' });
      if (!projectId) projectId = resolveProjectIdForRun(runRecord);
    }
    if (payload.bundleId) {
      bundleRecord = await loadBundleById(payload.organizationId, payload.bundleId);
      if (!bundleRecord || bundleRecord.organizationId !== payload.organizationId) {
        return res.status(404).json({ error: 'Bundle not found' });
      }
      if (!projectId && bundleRecord.items.length > 0) {
        const firstRun = await db
          .select()
          .from(reportRuns)
          .where(
            and(
              eq(reportRuns.id, bundleRecord.items[0].runId),
              eq(reportRuns.organizationId, payload.organizationId)
            )
          )
          .limit(1);
        if (firstRun[0]) projectId = resolveProjectIdForRun(firstRun[0]);
      }
    }

    let correspondenceId: string | undefined;
    if (payload.channel === 'platform_send' && projectId) {
      const persisted = await persistCorrespondenceToPlatform({
        organizationId: payload.organizationId,
        projectId,
        submissionId: payload.submissionId,
        direction: 'outbound',
        sourceChannel: 'api_import',
        communicationType: payload.correspondenceType || 'transmittal',
        subject: payload.subject,
        body: payload.message || payload.subject,
        recipients: payload.recipients,
        urgency: payload.urgency || 'medium',
        responseRequired: false,
        userId,
      });
      correspondenceId = persisted.correspondenceId;
    }

    const delivery: DeliveryRecord = {
      deliveryId: randomUUID(),
      organizationId: payload.organizationId,
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
      requestedBy: userId,
      createdAt: new Date().toISOString(),
      correspondenceId,
    };
    await persistDeliveryRecord(delivery);

    if (payload.captureForLearning && projectId) {
      const sourceRef = payload.runId
        ? `run:${payload.runId}`
        : payload.bundleId
          ? `bundle:${payload.bundleId}`
          : 'unspecified';
      await captureLearningMemory({
        organizationId: payload.organizationId,
        projectId,
        userId,
        title: `Outbound correspondence — ${payload.subject}`,
        subcategory: 'outbound_regulatory_correspondence',
        content: [
          `channel=${payload.channel}`,
          `source=${sourceRef}`,
          `subject=${payload.subject}`,
          `correspondenceType=${payload.correspondenceType || 'unspecified'}`,
          `recipients=${payload.recipients.join(', ') || 'none'}`,
          `message=${(payload.message || '').slice(0, 4000)}`,
        ].join('\n'),
      });
    }

    return res.status(201).json({ data: delivery });
  } catch (error: any) {
    return serverError(res, logger, 'saving deliveries', error);
  }
});

router.post('/correspondence/capture', async (req: Request, res: Response) => {
  try {
    const parsed = captureCorrespondenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const payload = parsed.data;
    const userId = getUserId(req);
    const persisted = await persistCorrespondenceToPlatform({
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      submissionId: payload.submissionId,
      direction: payload.direction,
      sourceChannel: payload.sourceChannel,
      communicationType: payload.communicationType,
      subject: payload.subject,
      body: payload.body,
      recipients: payload.recipients,
      sender: payload.sender,
      urgency: payload.urgency,
      responseRequired: payload.responseRequired,
      userId,
    });

    if (payload.captureForLearning) {
      await captureLearningMemory({
        organizationId: payload.organizationId,
        projectId: payload.projectId,
        userId,
        title: `Regulatory correspondence — ${payload.subject}`,
        subcategory:
          payload.communicationType.toLowerCase().includes('reject') ||
          payload.communicationType.toLowerCase().includes('deficiency')
            ? 'rejection_or_deficiency_signal'
            : 'regulatory_correspondence_signal',
        confidenceScore: 0.86,
        content: [
          `direction=${payload.direction}`,
          `sourceChannel=${payload.sourceChannel}`,
          `communicationType=${payload.communicationType}`,
          `subject=${payload.subject}`,
          `issues=${persisted.issues.map(issue => `${issue.category}:${issue.severity}`).join(',')}`,
          `body=${payload.body.slice(0, 5000)}`,
        ].join('\n'),
      });
    }

    return res.status(201).json({
      data: {
        correspondenceId: persisted.correspondenceId,
        persistedToPlatform: persisted.persisted,
        issues: persisted.issues,
      },
    });
  } catch (error: any) {
    return serverError(res, logger, 'saving capture', error);
  }
});

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
