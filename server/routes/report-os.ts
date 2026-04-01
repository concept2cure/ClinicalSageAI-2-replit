import { Router, Request, Response } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
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
import { immutableReportRecords, projects } from '@shared/schema';
import { createHash } from 'crypto';
import { z } from 'zod';
import { REPORT_BUNDLE_SEED, REPORT_TYPE_SEED } from '../services/report-os/taxonomy';
import { resolveScope } from '../services/report-os/scope-model';
import { computeInitialRun } from '../services/report-os/orchestrator';
import { authMiddleware } from '../auth';
import { intelligentReportEngine } from '../services/intelligent-report-engine';
import { sendReportDeliveryEmail } from '../services/emailService';
import { getSecureOrgId } from '../utils/tenantContext';
import { persistOutboundCorrespondenceRecord } from './regulatory-correspondence';
import PDFDocument from 'pdfkit';

const router = Router();
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
  requestedBy: z.number().int().positive().optional(),
});

const deliverySchema = z.object({
  organizationId: z.number().int().positive().optional(),
  projectId: z.number().int().positive().optional(),
  submissionId: z.string().min(1).optional(),
  reportId: z.number().int().positive().optional(),
  reportRunId: z.number().int().positive().optional(),
  correspondenceId: z.string().min(1).optional(),
  deliveryMode: z.enum(['platform_email', 'save_pdf']).default('save_pdf'),
  recipients: z.array(z.string().email()).default([]),
  subject: z.string().min(3).max(240),
  message: z.string().max(8000).optional(),
  regulatoryBody: z.string().max(64).optional(),
  communicationType: z.string().max(80).default('cover_letter'),
});

const bundleRunSchema = z.object({
  organizationId: z.number().int().positive(),
  clientWorkspaceId: z.number().int().positive().optional(),
  projectId: z.number().int().positive().optional(),
  scopeType: z.enum(reportScopeEnum),
  scopeId: z.string().min(1),
  bundleId: z.string().min(1),
  requestedBy: z.number().int().positive().optional(),
  targetRegulatory: z.string().max(64).optional(),
  deliveryMode: z.enum(['platform_email', 'save_pdf']).optional(),
  recipients: z.array(z.string().email()).optional(),
  subject: z.string().max(240).optional(),
  message: z.string().max(8000).optional(),
});

function inferDomainFromTypeId(typeId: string):
  | 'regulatory_submission'
  | 'clinical_study'
  | 'cmc_manufacturing'
  | 'pharmacovigilance'
  | 'quality_management'
  | 'compliance_attestation'
  | 'strategic_intelligence'
  | 'provenance_audit'
  | 'device_regulatory'
  | 'biostatistics'
  | 'environmental_safety'
  | 'cross_functional' {
  if (typeId.startsWith('provenance.')) return 'provenance_audit';
  if (typeId.startsWith('compliance.')) return 'compliance_attestation';
  if (typeId.startsWith('cmc.')) return 'cmc_manufacturing';
  if (typeId.startsWith('investor.')) return 'strategic_intelligence';
  if (typeId.startsWith('agency.') || typeId.startsWith('submission.') || typeId.startsWith('readiness.')) {
    return 'regulatory_submission';
  }
  if (typeId.startsWith('writing.')) return 'cross_functional';
  if (typeId.startsWith('correspondence.')) return 'strategic_intelligence';
  return 'cross_functional';
}

function scopeProjectId(scopeType: ReportScope, scopeId: string, fallbackProjectId?: number): number | undefined {
  if (fallbackProjectId && Number.isFinite(fallbackProjectId)) return fallbackProjectId;
  if (scopeType === 'project' || scopeType === 'submission' || scopeType === 'document' || scopeType === 'study') {
    const parsed = Number(scopeId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

async function ensureTaxonomySeeded() {
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reportTypeRegistry);

  if ((countRow?.count ?? 0) > 0) return;

  for (const row of REPORT_TYPE_SEED) {
    await db.insert(reportTypeRegistry).values(row);
  }
}

async function createPdfExport(reportId: number) {
  const report = await intelligentReportEngine.getReport(reportId);
  if (!report) throw new Error('Report not found');

  const provenance = await intelligentReportEngine.getReportProvenance(reportId);
  const compliance = await intelligentReportEngine.runComplianceValidation(reportId, report.targetRegulatory as any);

  const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
  const chunks: Buffer[] = [];
  doc.on('data', chunk => chunks.push(chunk));

  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fontSize(18).text(report.reportTitle || 'Report export', { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#666666').text(
    `${report.reportCode}  •  ${report.reportDomain}  •  ${report.sealStatus}  •  ${report.targetRegulatory || 'Multi-agency'}`
  );
  doc.moveDown();

  doc.fillColor('#111111').fontSize(12).text('Executive summary');
  doc.moveDown(0.4);
  doc.fontSize(10).text(report.executiveSummary || 'No executive summary recorded.');
  doc.moveDown();

  const sections = Array.isArray(report.sections) ? report.sections : [];
  doc.fontSize(12).text('Sections');
  doc.moveDown(0.3);
  sections.slice(0, 8).forEach((section: any, index: number) => {
    doc.fontSize(10).fillColor('#111111').text(`${index + 1}. ${section.title || section.sectionId}`);
    const text = JSON.stringify(section.content ?? {}, null, 2).slice(0, 500);
    doc.fillColor('#555555').fontSize(9).text(text);
    doc.moveDown(0.5);
  });

  doc.addPage();
  doc.fillColor('#111111').fontSize(12).text('Integrity and compliance');
  doc.moveDown(0.4);
  doc.fontSize(10).text(`Compliance score: ${report.complianceScore ?? 0}`);
  doc.text(`Provenance atoms: ${provenance.length}`);
  doc.text(`Validation checks passed: ${compliance.checks.filter(c => c.passed).length}/${compliance.checks.length}`);
  doc.text(`Content hash: ${report.contentHash || 'n/a'}`);
  doc.text(`Merkle root: ${report.merkleRoot || 'n/a'}`);

  doc.moveDown();
  doc.fontSize(12).text('Risk disclosures');
  doc.moveDown(0.3);
  const risks = Array.isArray(report.riskDisclosures) ? report.riskDisclosures : [];
  risks.slice(0, 8).forEach((risk: any) => {
    doc.fontSize(10).fillColor('#111111').text(`${risk.category || 'risk'}: ${risk.description || 'No description'}`);
    if (risk.mitigation) {
      doc.fillColor('#555555').fontSize(9).text(`Mitigation: ${risk.mitigation}`);
    }
    doc.moveDown(0.4);
  });

  doc.end();

  return {
    buffer: await completed,
    filename: `${report.reportCode || `report_${reportId}`}.pdf`,
    contentType: 'application/pdf',
  };
}

async function dispatchDelivery(payload: z.infer<typeof deliverySchema>) {
  const orgId = payload.organizationId;
  if (!orgId) throw new Error('organizationId is required');

  let resolvedProjectId = payload.projectId;
  let reportTitle = 'Concept2Cure report';
  let reportCode = '';
  let reportSummary = '';

  if (payload.reportId) {
    const report = await intelligentReportEngine.getReport(payload.reportId);
    if (!report) throw new Error('Report not found');
    reportTitle = report.reportTitle;
    reportCode = report.reportCode;
    reportSummary = report.executiveSummary || '';
    if (!resolvedProjectId && report.projectId) resolvedProjectId = report.projectId;
  } else if (payload.reportRunId) {
    const [run] = await db
      .select()
      .from(reportRuns)
      .where(
        and(eq(reportRuns.id, payload.reportRunId), eq(reportRuns.organizationId, orgId))
      )
      .limit(1);
    if (!run) throw new Error('Report run not found');
    reportTitle = `Report run ${run.reportTypeId}`;
    reportCode = run.runUuid;
    if (!resolvedProjectId) {
      const scopedProjectId = scopeProjectId(run.scopeType as ReportScope, run.scopeId);
      if (scopedProjectId) resolvedProjectId = scopedProjectId;
    }
  }

  if (!resolvedProjectId || !Number.isFinite(resolvedProjectId) || resolvedProjectId <= 0) {
    throw new Error('projectId is required for report delivery');
  }

  if (payload.deliveryMode === 'platform_email' && payload.recipients.length === 0) {
    throw new Error('At least one recipient email is required for platform delivery');
  }

  const emailResult =
    payload.deliveryMode === 'platform_email'
      ? await sendReportDeliveryEmail({
          recipients: payload.recipients,
          subject: payload.subject,
          reportTitle,
          message: payload.message,
          deliveryMode: payload.deliveryMode,
        })
      : { delivered: false, transport: 'log' as const, recipientCount: payload.recipients.length };

  const correspondenceRecord = await persistOutboundCorrespondenceRecord({
    orgId,
    projectId: resolvedProjectId,
    submissionId: payload.submissionId || String(resolvedProjectId),
    subject: payload.subject,
    recipients: payload.recipients,
    sender: 'noreply@concept2cure.pro',
    communicationType: payload.communicationType,
    parsedText:
      `${payload.message || ''}\n\nReport title: ${reportTitle}\nReport code: ${reportCode}\nDelivery mode: ${payload.deliveryMode}`.trim(),
    summary:
      `${payload.subject} — ${reportTitle}${payload.regulatoryBody ? ` (${payload.regulatoryBody})` : ''}`.slice(0, 220),
    urgency: 'medium',
    sourceChannel: 'api_import',
  });

  return {
    emailResult,
    correspondenceRecord,
    resolvedProjectId,
    reportTitle,
    reportCode,
  };
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
    for (const row of REPORT_TYPE_SEED) {
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
    return res.json({ success: true, seeded: REPORT_TYPE_SEED.length });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/taxonomy', async (_req: Request, res: Response) => {
  try {
    await ensureTaxonomySeeded();
    const rows = await db
      .select()
      .from(reportTypeRegistry)
      .where(eq(reportTypeRegistry.enabled, true));
    return res.json({ data: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/bundles', async (_req: Request, res: Response) => {
  try {
    await ensureTaxonomySeeded();
    return res.json({ data: REPORT_BUNDLE_SEED });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/program-groups', async (req: Request, res: Response) => {
  try {
    const organizationId = Number(req.query.organizationId);
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
    return res.status(500).json({ error: error.message });
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
    return res.status(500).json({ error: error.message });
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
    return res.status(500).json({ error: error.message });
  }
});

router.get('/program-groups/:id/snapshots', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const organizationId = Number(req.query.organizationId);
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
    return res.status(500).json({ error: error.message });
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
    return res.status(500).json({ error: error.message });
  }
});

router.post('/runs', async (req: Request, res: Response) => {
  try {
    await ensureTaxonomySeeded();
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
    });

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
    return res.status(500).json({ error: error.message });
  }
});

router.post('/bundle-runs', async (req: Request, res: Response) => {
  try {
    await ensureTaxonomySeeded();
    const parsed = bundleRunSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const {
      organizationId,
      clientWorkspaceId,
      projectId,
      scopeType,
      scopeId,
      bundleId,
      requestedBy,
      targetRegulatory,
      deliveryMode,
      recipients,
      subject,
      message,
    } = parsed.data;

    const bundle = REPORT_BUNDLE_SEED.find(item => item.bundleId === bundleId);
    if (!bundle) {
      return res.status(404).json({ error: `Unknown bundleId: ${bundleId}` });
    }

    if (!bundle.allowedScopes.includes(scopeType)) {
      return res.status(400).json({
        error: `Bundle ${bundleId} does not allow scope ${scopeType}`,
        allowedScopes: bundle.allowedScopes,
      });
    }

    const bundleRuns: Array<Record<string, unknown>> = [];
    const immutableReports: Array<Record<string, unknown>> = [];
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
            eq(reportProgramGroups.organizationId, organizationId)
          )
        );
      programProjectIds = memberships.map(m => m.projectId);
    }

    const scopedProjectId =
      scopeProjectId(scopeType, scopeId, projectId) || programProjectIds?.[0];

    for (const reportTypeId of bundle.reportTypeIds) {
      const typeRows = await db
        .select()
        .from(reportTypeRegistry)
        .where(eq(reportTypeRegistry.typeId, reportTypeId))
        .limit(1);

      const type = typeRows[0];
      if (!type) continue;

      const scope = resolveScope({ scopeType, scopeId, organizationId });
      const computed = await computeInitialRun(organizationId, scopeType, scopeId, {
        programProjectIds,
      });

      const [run] = await db
        .insert(reportRuns)
        .values({
          organizationId,
          clientWorkspaceId,
          scopeType,
          scopeId,
          reportTypeId,
          requestedBy,
          status: computed.blockers.length > 0 ? 'partial' : 'completed',
          dependencySummary: {
            providers: computed.providers,
            scopeLineage: scope.lineage,
            bundleId,
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
          organizationId,
          scopeType,
          scopeId,
          snapshotVersion: 1,
          isLatest: true,
          snapshotMetadata: {
            reportTypeId,
            providers: computed.providers,
            summary: computed.summary,
            confidence: computed.confidence,
            bundleId,
          },
          createdBy: requestedBy,
        })
        .returning();

      if (computed.providers.length > 0) {
        await db.insert(reportRunDependencies).values(
          computed.providers.map(provider => ({
            runId: run.id,
            organizationId,
            provider: provider.provider,
            status: provider.status,
            blocker: provider.blocker,
            observedAt: new Date(provider.observedAt),
            payload: { scopeType, scopeId, bundleId },
          }))
        );
      }

      bundleRuns.push({ run, snapshot, reportType: type });

      const generated = await intelligentReportEngine.generateReport({
        organizationId,
        clientWorkspaceId,
        projectId: scopedProjectId,
        domain: inferDomainFromTypeId(reportTypeId),
        subtype: type.label,
        title: `${bundle.label} — ${type.label}`,
        targetRegulatory: targetRegulatory as any,
        complianceFrameworks: Array.isArray(type.dataDependencies)
          ? (type.dataDependencies as string[])
          : [],
        parameters: {
          bundleId,
          scopeType,
          scopeId,
          reportTypeId,
          allowedPersonas: type.allowedPersonas,
        },
        persona: Array.isArray(type.allowedPersonas) ? type.allowedPersonas[0] : 'ra_lead',
        userId: requestedBy || Number((req as any).user?.id || 0) || 1,
        userName: (req as any).user?.email || 'system',
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
      });

      immutableReports.push({
        reportId: generated.record.id,
        reportCode: generated.record.reportCode,
        reportTitle: generated.record.reportTitle,
        domain: generated.record.reportDomain,
        complianceScore: generated.record.complianceScore,
        sealStatus: generated.record.sealStatus,
      });

      await db
        .update(reportSnapshots)
        .set({
          artifactRecordId: generated.record.id,
          snapshotMetadata: {
            reportTypeId,
            providers: computed.providers,
            summary: computed.summary,
            confidence: computed.confidence,
            bundleId,
            immutableReportId: generated.record.id,
            immutableReportCode: generated.record.reportCode,
          },
        })
        .where(eq(reportSnapshots.id, snapshot.id));
    }

    const resolvedDeliveryMode = deliveryMode || bundle.defaultDeliveryMode;
    let deliveryResult: Record<string, unknown> | null = null;

    if (recipients && recipients.length > 0 && immutableReports.length > 0) {
      const primaryReport = immutableReports[0] as { reportId: number; reportTitle: string; reportCode: string };
      const dispatched = await dispatchDelivery({
        organizationId,
        projectId: scopedProjectId,
        submissionId: scopeType === 'submission' ? scopeId : undefined,
        reportId: primaryReport.reportId,
        deliveryMode: resolvedDeliveryMode,
        recipients,
        subject: subject || `${bundle.label} delivery`,
        message,
        regulatoryBody: targetRegulatory,
        communicationType: 'response_letter',
      });
      deliveryResult = dispatched;
    }

    return res.status(201).json({
      data: {
        bundle,
        runs: bundleRuns,
        immutableReports,
        delivery: deliveryResult,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/runs/:id/dependencies', async (req: Request, res: Response) => {
  try {
    const runId = Number(req.params.id);
    const organizationId = Number(req.query.organizationId);
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
    return res.status(500).json({ error: error.message });
  }
});

router.get('/runs', async (req: Request, res: Response) => {
  try {
    await ensureTaxonomySeeded();
    const organizationId = Number(req.query.organizationId);
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId query parameter is required' });
    }
    const scopeType = req.query.scopeType as string | undefined;
    const scopeId = req.query.scopeId as string | undefined;

    const rows = await db
      .select()
      .from(reportRuns)
      .where(
        scopeType && scopeId
          ? and(
              eq(reportRuns.organizationId, organizationId),
              eq(reportRuns.scopeType, scopeType),
              eq(reportRuns.scopeId, scopeId)
            )
          : eq(reportRuns.organizationId, organizationId)
      )
      .orderBy(desc(reportRuns.createdAt))
      .limit(100);

    return res.json({ data: rows });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/workspace', async (req: Request, res: Response) => {
  try {
    await ensureTaxonomySeeded();
    const organizationId = Number(req.query.organizationId);
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ error: 'organizationId query parameter is required' });
    }

    const scopeType = (req.query.scopeType as ReportScope | undefined) || 'project';
    const scopeId = (req.query.scopeId as string | undefined) || '';

    const [[runCountRow], [reportCountRow], [memoryCountRow]] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(reportRuns)
        .where(
          scopeId
            ? and(
                eq(reportRuns.organizationId, organizationId),
                eq(reportRuns.scopeType, scopeType),
                eq(reportRuns.scopeId, scopeId)
              )
            : eq(reportRuns.organizationId, organizationId)
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(immutableReportRecords)
        .where(eq(immutableReportRecords.organizationId, organizationId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(projectMemoryEntries)
        .where(eq(projectMemoryEntries.organizationId, organizationId)),
    ]);

    const runs = await db
      .select()
      .from(reportRuns)
      .where(
        scopeId
          ? and(
              eq(reportRuns.organizationId, organizationId),
              eq(reportRuns.scopeType, scopeType),
              eq(reportRuns.scopeId, scopeId)
            )
          : eq(reportRuns.organizationId, organizationId)
      )
      .orderBy(desc(reportRuns.createdAt))
      .limit(20);

    const latestReports = await db
      .select({
        id: immutableReportRecords.id,
        reportCode: immutableReportRecords.reportCode,
        reportTitle: immutableReportRecords.reportTitle,
        reportDomain: immutableReportRecords.reportDomain,
        sealStatus: immutableReportRecords.sealStatus,
        complianceScore: immutableReportRecords.complianceScore,
        createdAt: immutableReportRecords.createdAt,
        projectId: immutableReportRecords.projectId,
      })
      .from(immutableReportRecords)
      .where(eq(immutableReportRecords.organizationId, organizationId))
      .orderBy(desc(immutableReportRecords.createdAt))
      .limit(12);

    return res.json({
      data: {
        scope: { scopeType, scopeId: scopeId || null },
        bundles: REPORT_BUNDLE_SEED,
        taxonomy: REPORT_TYPE_SEED,
        summary: {
          runCount: runCountRow?.count ?? 0,
          immutableReportCount: reportCountRow?.count ?? 0,
          learningEventCount: memoryCountRow?.count ?? 0,
          partialRuns: runs.filter(run => run.status === 'partial').length,
          completedRuns: runs.filter(run => run.status === 'completed').length,
        },
        recentRuns: runs,
        recentReports: latestReports,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/exports/:reportId/pdf', async (req: Request, res: Response) => {
  try {
    const reportId = Number(req.params.reportId);
    if (!Number.isFinite(reportId) || reportId <= 0) {
      return res.status(400).json({ error: 'reportId must be a positive integer' });
    }
    const pdf = await createPdfExport(reportId);
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    res.setHeader('Content-Type', pdf.contentType);
    return res.send(pdf.buffer);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/deliveries', async (req: Request, res: Response) => {
  try {
    const secureOrgId = getSecureOrgId(req as any);
    const parsed = deliverySchema.safeParse({
      ...req.body,
      organizationId: req.body.organizationId || (secureOrgId ? Number(secureOrgId) : undefined),
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const result = await dispatchDelivery(parsed.data);
    return res.status(201).json({ data: result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
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
    return res.json({
      data: {
        groups: groupCount?.count ?? 0,
        taxonomyTypes: typeCount?.count ?? 0,
        runs: runCount?.count ?? 0,
        snapshots: snapshotCount?.count ?? 0,
        dependencies: dependencyCount?.count ?? 0,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
