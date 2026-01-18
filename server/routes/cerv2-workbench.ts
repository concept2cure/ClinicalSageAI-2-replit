import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db';
import requireTenant from '../middleware/tenant.js';
import { notImplemented } from '../lib/httpErrors';
import {
  cerv2AuditEvents,
  cerv2Claims,
  cerv2Evidence,
  cerv2EvidenceLinks,
  cerv2Outcomes,
  cerv2Standards,
  fda510kProjects,
  fda510kSubmissionPackages,
} from '../../shared/schema';
import {
  deleteEvidenceFile,
  getEvidenceFilePath,
  putEvidenceFile,
  sanitizeFileName,
} from '../services/cerv2EvidenceStorage';
import { evidenceSetFingerprint, sha256Buffer } from '../utils/evidenceFingerprint';
import { emitAudit, listAuditEvents } from '../utils/audit';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 75 * 1024 * 1024 } });

router.use(requireTenant());
router.use((req, res, next) => {
  if (!db) {
    return notImplemented(
      res,
      'CERV2_WORKBENCH_DB',
      'CERV2 workbench requires a configured database connection.'
    );
  }
  return next();
});

const readOrgContext = (req: Request) => {
  const organizationId = Number((req as any).organizationId || 0);
  const actorId = Number((req as any).user?.id || 0) || null;
  return { organizationId, actorId };
};

// Deprecated: Use emitAudit from utils/audit.ts instead
// Keeping for backward compatibility during migration
const logAudit = async (args: {
  organizationId: number;
  programId: string;
  actorId: number | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  diffSummary?: string | null;
  metadata?: Record<string, unknown> | null;
}) => {
  await emitAudit({
    organizationId: args.organizationId,
    programId: args.programId,
    actorUserId: args.actorId,
    type: args.action as any,
    entityType: args.entityType ?? null,
    entityId: args.entityId ?? null,
    diffSummary: args.diffSummary ?? null,
    payload: args.metadata ?? null,
  });
};

const IMPACT_ENTITY_TYPES = new Set(['CLAIM', 'STANDARD_REQUIREMENT', 'OUTCOME']);

const markEntityNeedsReview = async (args: {
  organizationId: number;
  entityType: string;
  entityId: string;
}) => {
  const { organizationId, entityType, entityId } = args;
  if (!IMPACT_ENTITY_TYPES.has(entityType)) return;

  if (entityType === 'CLAIM') {
    await db
      .update(cerv2Claims)
      .set({ needsReview: true, lastImpactedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(cerv2Claims.organizationId, organizationId), eq(cerv2Claims.claimId, entityId)));
    return;
  }

  if (entityType === 'STANDARD_REQUIREMENT') {
    await db
      .update(cerv2Standards)
      .set({ needsReview: true, lastImpactedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(cerv2Standards.organizationId, organizationId), eq(cerv2Standards.standardId, entityId)));
    return;
  }

  if (entityType === 'OUTCOME') {
    await db
      .update(cerv2Outcomes)
      .set({ needsReview: true, lastImpactedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(cerv2Outcomes.organizationId, organizationId), eq(cerv2Outcomes.outcomeId, entityId)));
  }
};

const markImpactForEvidence = async (args: {
  organizationId: number;
  programId: string;
  evidenceId: string;
  actorId: number | null;
  reason: string;
}) => {
  const { organizationId, programId, evidenceId, actorId, reason } = args;
  const links = await db
    .select({ entityType: cerv2EvidenceLinks.entityType, entityId: cerv2EvidenceLinks.entityId })
    .from(cerv2EvidenceLinks)
    .where(
      and(
        eq(cerv2EvidenceLinks.organizationId, organizationId),
        eq(cerv2EvidenceLinks.programId, programId),
        eq(cerv2EvidenceLinks.evidenceId, evidenceId)
      )
    );

  if (!links.length) return;

  for (const link of links) {
    await markEntityNeedsReview({
      organizationId,
      entityType: String(link.entityType),
      entityId: String(link.entityId),
    });
  }

  await logAudit({
    organizationId,
    programId,
    actorId,
    action: 'IMPACT_REVIEW_REQUIRED',
    entityType: 'EVIDENCE',
    entityId: evidenceId,
    diffSummary: reason,
    metadata: { impacted: links },
  });
};

const toBuffer = (data: ArrayBuffer | Buffer) => (Buffer.isBuffer(data) ? data : Buffer.from(data));

const createExportEvidence = async (args: {
  organizationId: number;
  programId: string;
  actorId: number | null;
  name: string;
  buffer: Buffer;
  mimeType: string;
  metadata?: Record<string, unknown>;
}) => {
  const { organizationId, programId, actorId, name, buffer, mimeType, metadata } = args;
  const evidenceId = crypto.randomUUID();
  const fileName = sanitizeFileName(name);
  const stored = await putEvidenceFile({
    orgId: organizationId,
    programId,
    evidenceId,
    fileName,
    buffer,
  });

  // Compute evidenceSetHash using the deterministic fingerprint function
  const evidenceRows = await db
    .select({ hash: cerv2Evidence.hash })
    .from(cerv2Evidence)
    .where(
      and(
        eq(cerv2Evidence.organizationId, organizationId),
        eq(cerv2Evidence.programId, programId),
        sql`${cerv2Evidence.archivedAt} IS NULL`
      )
    );

  const evidenceHashes = evidenceRows.map((r) => String(r.hash || '')).filter(Boolean);
  const evidenceSetHash = evidenceSetFingerprint(evidenceHashes);
  
  // Compute export file SHA256
  const exportSha256 = sha256Buffer(buffer);

  const [created] = await db
    .insert(cerv2Evidence)
    .values({
      organizationId,
      programId,
      evidenceId,
      name,
      evidenceType: 'EXPORT',
      status: 'published',
      filePath: stored.filePath,
      sizeBytes: stored.sizeBytes,
      mimeType,
      metadata: metadata || {},
    })
    .returning();

  await emitAudit({
    organizationId,
    programId,
    actorUserId: actorId,
    type: 'EXPORT_GENERATED',
    entityType: 'EVIDENCE',
    entityId: evidenceId,
    diffSummary: `Export generated: ${name}`,
    payload: {
      sha256: exportSha256,
      sizeBytes: stored.sizeBytes,
      evidenceSetHash,
      filename: fileName,
      type: mimeType,
    },
  });

  return created;
};

const buildClaimsWorkbook = async (organizationId: number, programId: string) => {
  const claims = await db
    .select()
    .from(cerv2Claims)
    .where(and(eq(cerv2Claims.organizationId, organizationId), eq(cerv2Claims.programId, programId)))
    .orderBy(desc(cerv2Claims.updatedAt));

  const links = await db
    .select({ entityId: cerv2EvidenceLinks.entityId, evidenceId: cerv2EvidenceLinks.evidenceId })
    .from(cerv2EvidenceLinks)
    .where(
      and(
        eq(cerv2EvidenceLinks.organizationId, organizationId),
        eq(cerv2EvidenceLinks.programId, programId),
        eq(cerv2EvidenceLinks.entityType, 'CLAIM')
      )
    );

  const evidenceIds = Array.from(new Set(links.map((l) => String(l.evidenceId))));
  const evidenceRows = evidenceIds.length
    ? await db
        .select({ evidenceId: cerv2Evidence.evidenceId, name: cerv2Evidence.name })
        .from(cerv2Evidence)
        .where(and(eq(cerv2Evidence.organizationId, organizationId), eq(cerv2Evidence.programId, programId)))
    : [];

  const evidenceMap = new Map(evidenceRows.map((e) => [String(e.evidenceId), e.name]));
  const linkMap = links.reduce<Record<string, string[]>>((acc, link) => {
    const key = String(link.entityId);
    acc[key] = acc[key] || [];
    acc[key].push(String(link.evidenceId));
    return acc;
  }, {});

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Claims');
  sheet.columns = [
    { header: 'Claim ID', key: 'claimId', width: 36 },
    { header: 'Claim Type', key: 'claimType', width: 18 },
    { header: 'Claim Text', key: 'claimText', width: 60 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Evidence Count', key: 'evidenceCount', width: 16 },
    { header: 'Evidence Names', key: 'evidenceNames', width: 60 },
  ];

  claims.forEach((claim) => {
    const evidenceList = linkMap[String(claim.claimId)] || [];
    const names = evidenceList.map((id) => evidenceMap.get(id) || id).join('; ');
    sheet.addRow({
      claimId: claim.claimId,
      claimType: claim.claimType,
      claimText: claim.claimText,
      status: claim.status,
      evidenceCount: evidenceList.length,
      evidenceNames: names,
    });
  });

  return toBuffer(await workbook.xlsx.writeBuffer());
};

const buildStandardsWorkbook = async (organizationId: number, programId: string) => {
  const requirements = await db
    .select()
    .from(cerv2Standards)
    .where(and(eq(cerv2Standards.organizationId, organizationId), eq(cerv2Standards.programId, programId)))
    .orderBy(desc(cerv2Standards.updatedAt));

  const links = await db
    .select({ entityId: cerv2EvidenceLinks.entityId, evidenceId: cerv2EvidenceLinks.evidenceId })
    .from(cerv2EvidenceLinks)
    .where(
      and(
        eq(cerv2EvidenceLinks.organizationId, organizationId),
        eq(cerv2EvidenceLinks.programId, programId),
        eq(cerv2EvidenceLinks.entityType, 'STANDARD_REQUIREMENT')
      )
    );

  const evidenceIds = Array.from(new Set(links.map((l) => String(l.evidenceId))));
  const evidenceRows = evidenceIds.length
    ? await db
        .select({ evidenceId: cerv2Evidence.evidenceId, name: cerv2Evidence.name })
        .from(cerv2Evidence)
        .where(and(eq(cerv2Evidence.organizationId, organizationId), eq(cerv2Evidence.programId, programId)))
    : [];

  const evidenceMap = new Map(evidenceRows.map((e) => [String(e.evidenceId), e.name]));
  const linkMap = links.reduce<Record<string, string[]>>((acc, link) => {
    const key = String(link.entityId);
    acc[key] = acc[key] || [];
    acc[key].push(String(link.evidenceId));
    return acc;
  }, {});

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Standards');
  sheet.columns = [
    { header: 'Requirement ID', key: 'requirementId', width: 36 },
    { header: 'Standard', key: 'name', width: 26 },
    { header: 'Requirement', key: 'requirement', width: 60 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Evidence Count', key: 'evidenceCount', width: 16 },
    { header: 'Evidence Names', key: 'evidenceNames', width: 60 },
  ];

  requirements.forEach((req) => {
    const evidenceList = linkMap[String(req.standardId)] || [];
    const names = evidenceList.map((id) => evidenceMap.get(id) || id).join('; ');
    sheet.addRow({
      requirementId: req.standardId,
      name: req.name,
      requirement: req.requirement,
      status: req.status,
      evidenceCount: evidenceList.length,
      evidenceNames: names,
    });
  });

  return toBuffer(await workbook.xlsx.writeBuffer());
};

const buildOutcomesWorkbook = async (organizationId: number, programId: string) => {
  const outcomes = await db
    .select()
    .from(cerv2Outcomes)
    .where(and(eq(cerv2Outcomes.organizationId, organizationId), eq(cerv2Outcomes.programId, programId)))
    .orderBy(desc(cerv2Outcomes.updatedAt));

  const links = await db
    .select({ entityId: cerv2EvidenceLinks.entityId, evidenceId: cerv2EvidenceLinks.evidenceId })
    .from(cerv2EvidenceLinks)
    .where(
      and(
        eq(cerv2EvidenceLinks.organizationId, organizationId),
        eq(cerv2EvidenceLinks.programId, programId),
        eq(cerv2EvidenceLinks.entityType, 'OUTCOME')
      )
    );

  const evidenceIds = Array.from(new Set(links.map((l) => String(l.evidenceId))));
  const evidenceRows = evidenceIds.length
    ? await db
        .select({ evidenceId: cerv2Evidence.evidenceId, name: cerv2Evidence.name })
        .from(cerv2Evidence)
        .where(and(eq(cerv2Evidence.organizationId, organizationId), eq(cerv2Evidence.programId, programId)))
    : [];

  const evidenceMap = new Map(evidenceRows.map((e) => [String(e.evidenceId), e.name]));
  const linkMap = links.reduce<Record<string, string[]>>((acc, link) => {
    const key = String(link.entityId);
    acc[key] = acc[key] || [];
    acc[key].push(String(link.evidenceId));
    return acc;
  }, {});

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Outcomes');
  sheet.columns = [
    { header: 'Outcome ID', key: 'outcomeId', width: 36 },
    { header: 'Outcome', key: 'name', width: 40 },
    { header: 'Comparator', key: 'comparator', width: 24 },
    { header: 'Timepoint', key: 'timepoint', width: 16 },
    { header: 'Confidence', key: 'confidence', width: 16 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Evidence Count', key: 'evidenceCount', width: 16 },
    { header: 'Evidence Names', key: 'evidenceNames', width: 60 },
  ];

  outcomes.forEach((outcome) => {
    const evidenceList = linkMap[String(outcome.outcomeId)] || [];
    const names = evidenceList.map((id) => evidenceMap.get(id) || id).join('; ');
    sheet.addRow({
      outcomeId: outcome.outcomeId,
      name: outcome.name,
      comparator: outcome.comparator,
      timepoint: outcome.timepoint,
      confidence: outcome.confidence,
      status: outcome.status,
      evidenceCount: evidenceList.length,
      evidenceNames: names,
    });
  });

  return toBuffer(await workbook.xlsx.writeBuffer());
};

const buildDefenseZip = async (args: {
  organizationId: number;
  programId: string;
}): Promise<Buffer> => {
  const { organizationId, programId } = args;
  const claimsBuffer = await buildClaimsWorkbook(organizationId, programId);
  const standardsBuffer = await buildStandardsWorkbook(organizationId, programId);
  const outcomesBuffer = await buildOutcomesWorkbook(organizationId, programId);

  const evidenceRows = await db
    .select()
    .from(cerv2Evidence)
    .where(
      and(
        eq(cerv2Evidence.organizationId, organizationId),
        eq(cerv2Evidence.programId, programId),
        sql`${cerv2Evidence.archivedAt} IS NULL`
      )
    );

  const archive = archiver('zip', { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

  archive.pipe(stream);
  archive.append(claimsBuffer, { name: 'exports/claims-matrix.xlsx' });
  archive.append(standardsBuffer, { name: 'exports/standards-coverage.xlsx' });
  archive.append(outcomesBuffer, { name: 'exports/outcomes-substantiation.xlsx' });

  for (const evidence of evidenceRows) {
    if (!evidence.filePath) continue;
    const absolutePath = await getEvidenceFilePath(evidence.filePath);
    const safeName = sanitizeFileName(evidence.name || evidence.evidenceId);
    const ext = path.extname(evidence.filePath || '') || '';
    const entryName = `evidence/${evidence.evidenceId}_${safeName}${ext}`;
    archive.file(absolutePath, { name: entryName });
  }

  await archive.finalize();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', (err) => reject(err));
    archive.on('error', (err) => reject(err));
  });

  return Buffer.concat(chunks);
};

router.get('/programs/:programId/readiness', async (req, res) => {
  try {
    const { organizationId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);

    const [evidenceRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cerv2Evidence)
      .where(and(eq(cerv2Evidence.organizationId, organizationId), eq(cerv2Evidence.programId, programId), sql`${cerv2Evidence.archivedAt} IS NULL`));

    const [linksRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cerv2EvidenceLinks)
      .where(and(eq(cerv2EvidenceLinks.organizationId, organizationId), eq(cerv2EvidenceLinks.programId, programId)));

    const evidenceCount = Number(evidenceRow?.count || 0);
    const linksCount = Number(linksRow?.count || 0);

    const evidenceScore = Math.min(40, evidenceCount * 10);
    const linkScore = Math.min(40, linksCount * 5);
    const baseScore = 20;
    const score = Math.min(100, baseScore + evidenceScore + linkScore);

    const blockers: string[] = [];
    if (evidenceCount === 0) blockers.push('No evidence files uploaded yet.');
    if (linksCount === 0) blockers.push('No evidence linked to claims/standards/outcomes yet.');

    res.json({
      ok: true,
      data: {
        programId,
        score,
        signals: { evidenceCount, linksCount },
        blockers,
      },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to compute readiness.' });
  }
});

router.get('/programs/:programId/coverage', async (req, res) => {
  try {
    const { organizationId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);

    const claims = await db
      .select({ claimId: cerv2Claims.claimId, needsReview: cerv2Claims.needsReview })
      .from(cerv2Claims)
      .where(and(eq(cerv2Claims.organizationId, organizationId), eq(cerv2Claims.programId, programId)));

    const standards = await db
      .select({
        standardId: cerv2Standards.standardId,
        status: cerv2Standards.status,
        needsReview: cerv2Standards.needsReview,
      })
      .from(cerv2Standards)
      .where(and(eq(cerv2Standards.organizationId, organizationId), eq(cerv2Standards.programId, programId)));

    const outcomes = await db
      .select({ outcomeId: cerv2Outcomes.outcomeId, needsReview: cerv2Outcomes.needsReview })
      .from(cerv2Outcomes)
      .where(and(eq(cerv2Outcomes.organizationId, organizationId), eq(cerv2Outcomes.programId, programId)));

    const links = await db
      .select({ entityType: cerv2EvidenceLinks.entityType, entityId: cerv2EvidenceLinks.entityId })
      .from(cerv2EvidenceLinks)
      .where(and(eq(cerv2EvidenceLinks.organizationId, organizationId), eq(cerv2EvidenceLinks.programId, programId)));

    const linkedClaimIds = new Set(
      links.filter((l) => String(l.entityType) === 'CLAIM').map((l) => String(l.entityId))
    );
    const linkedOutcomeIds = new Set(
      links.filter((l) => String(l.entityType) === 'OUTCOME').map((l) => String(l.entityId))
    );
    const linkedStandardRequirementIds = new Set(
      links
        .filter((l) => String(l.entityType) === 'STANDARD_REQUIREMENT')
        .map((l) => String(l.entityId))
    );

    const claimsTotal = claims.length;
    const claimsCovered = claims.filter((c) => linkedClaimIds.has(String(c.claimId))).length;
    const claimsNeedsReview = claims.filter((c) => c.needsReview).length;

    const requirementsTotal = standards.filter(
      (s) => String(s.status || '').toLowerCase() !== 'not_applicable'
    ).length;
    const requirementsSatisfied = standards.filter(
      (s) => String(s.status || '').toLowerCase() === 'satisfied'
    ).length;
    const requirementsLinked = standards.filter((s) => linkedStandardRequirementIds.has(String(s.standardId))).length;
    const standardsNeedsReview = standards.filter((s) => s.needsReview).length;

    const outcomesTotal = outcomes.length;
    const outcomesSubstantiated = outcomes.filter((o) => linkedOutcomeIds.has(String(o.outcomeId))).length;
    const outcomesNeedsReview = outcomes.filter((o) => o.needsReview).length;

    const coverage = {
      claims: {
        total: claimsTotal,
        covered: claimsCovered,
        percent: claimsTotal ? Math.round((claimsCovered / claimsTotal) * 100) : 0,
        needsReview: claimsNeedsReview,
      },
      standards: {
        requirementsTotal,
        requirementsSatisfied,
        requirementsLinked,
        percent: requirementsTotal ? Math.round((requirementsSatisfied / requirementsTotal) * 100) : 0,
        needsReview: standardsNeedsReview,
      },
      outcomes: {
        total: outcomesTotal,
        substantiated: outcomesSubstantiated,
        percent: outcomesTotal ? Math.round((outcomesSubstantiated / outcomesTotal) * 100) : 0,
        needsReview: outcomesNeedsReview,
      },
    };

    const blockers: string[] = [];
    if (!claimsTotal) blockers.push('No claims have been defined yet.');
    if (claimsTotal && claimsCovered < claimsTotal) blockers.push('Some claims lack evidence links.');
    if (!requirementsTotal) blockers.push('No standards requirements recorded.');
    if (requirementsTotal && requirementsSatisfied < requirementsTotal) blockers.push('Standards requirements remain unsatisfied.');
    if (!outcomesTotal) blockers.push('No outcomes recorded for substantiation.');
    if (outcomesTotal && outcomesSubstantiated < outcomesTotal) blockers.push('Some outcomes lack substantiation evidence.');
    if (claimsNeedsReview + standardsNeedsReview + outcomesNeedsReview > 0) {
      blockers.push('Items are flagged as Needs Review from recent evidence changes.');
    }

    res.json({ ok: true, data: { coverage, blockers } });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to compute coverage.' });
  }
});

router.get('/programs/:programId/summary', async (req, res) => {
  try {
    const { organizationId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);

    const [evidenceRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cerv2Evidence)
      .where(
        and(
          eq(cerv2Evidence.organizationId, organizationId),
          eq(cerv2Evidence.programId, programId),
          sql`${cerv2Evidence.archivedAt} IS NULL`
        )
      );

    const [linksRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cerv2EvidenceLinks)
      .where(
        and(
          eq(cerv2EvidenceLinks.organizationId, organizationId),
          eq(cerv2EvidenceLinks.programId, programId)
        )
      );

    const [exportsRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cerv2Evidence)
      .where(
        and(
          eq(cerv2Evidence.organizationId, organizationId),
          eq(cerv2Evidence.programId, programId),
          eq(cerv2Evidence.evidenceType, 'EXPORT'),
          sql`${cerv2Evidence.archivedAt} IS NULL`
        )
      );

    res.json({
      ok: true,
      data: {
        evidenceCount: Number(evidenceRow?.count || 0),
        linksCount: Number(linksRow?.count || 0),
        exportsCount: Number(exportsRow?.count || 0),
      },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to load summary.' });
  }
});

router.get('/programs/:programId/claims', async (req, res) => {
  try {
    const { organizationId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const rows = await db
      .select()
      .from(cerv2Claims)
      .where(and(eq(cerv2Claims.organizationId, organizationId), eq(cerv2Claims.programId, programId)))
      .orderBy(desc(cerv2Claims.updatedAt));

    res.json({ ok: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to load claims.' });
  }
});

router.post('/programs/:programId/claims', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const body = z
      .object({
        claimType: z.string().optional(),
        claimText: z.string().min(2),
        rationale: z.string().optional(),
        owner: z.string().optional(),
        tags: z.array(z.string()).optional(),
        status: z.string().optional(),
      })
      .parse(req.body || {});

    const claimId = crypto.randomUUID();
    const [created] = await db
      .insert(cerv2Claims)
      .values({
        organizationId,
        programId,
        claimId,
        claimType: body.claimType || 'other',
        claimText: body.claimText,
        rationale: body.rationale || null,
        owner: body.owner || null,
        tags: body.tags || [],
        status: body.status || 'draft',
      })
      .returning();

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'CLAIM_CREATED',
      entityType: 'CLAIM',
      entityId: created.claimId,
      diffSummary: `Claim created: ${created.claimText.slice(0, 60)}`,
    });

    res.status(201).json({ ok: true, data: created });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to create claim.' });
  }
});

router.patch('/programs/:programId/claims/:claimId', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const claimId = z.string().parse(req.params.claimId);
    const body = z
      .object({
        claimType: z.string().optional(),
        claimText: z.string().optional(),
        rationale: z.string().optional(),
        owner: z.string().optional(),
        tags: z.array(z.string()).optional(),
        status: z.string().optional(),
        needsReview: z.boolean().optional(),
      })
      .parse(req.body || {});

    const [updated] = await db
      .update(cerv2Claims)
      .set({
        claimType: body.claimType,
        claimText: body.claimText,
        rationale: body.rationale,
        owner: body.owner,
        tags: body.tags,
        status: body.status,
        needsReview: body.needsReview,
        updatedAt: sql`now()`,
      })
      .where(and(eq(cerv2Claims.organizationId, organizationId), eq(cerv2Claims.programId, programId), eq(cerv2Claims.claimId, claimId)))
      .returning();

    if (!updated) return res.status(404).json({ ok: false, error: 'Claim not found.' });

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'CLAIM_UPDATED',
      entityType: 'CLAIM',
      entityId: claimId,
      diffSummary: `Claim updated: ${updated.claimText.slice(0, 60)}`,
    });

    res.json({ ok: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to update claim.' });
  }
});

router.delete('/programs/:programId/claims/:claimId', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const claimId = z.string().parse(req.params.claimId);

    const [removed] = await db
      .delete(cerv2Claims)
      .where(and(eq(cerv2Claims.organizationId, organizationId), eq(cerv2Claims.programId, programId), eq(cerv2Claims.claimId, claimId)))
      .returning();

    if (!removed) return res.status(404).json({ ok: false, error: 'Claim not found.' });

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'CLAIM_DELETED',
      entityType: 'CLAIM',
      entityId: claimId,
      diffSummary: `Claim deleted: ${removed.claimText.slice(0, 60)}`,
    });

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to delete claim.' });
  }
});

router.get('/programs/:programId/standards', async (req, res) => {
  try {
    const { organizationId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const rows = await db
      .select()
      .from(cerv2Standards)
      .where(and(eq(cerv2Standards.organizationId, organizationId), eq(cerv2Standards.programId, programId)))
      .orderBy(desc(cerv2Standards.updatedAt));

    const grouped = rows.reduce<Record<string, any>>((acc, row) => {
      const key = row.standardId;
      if (!acc[key]) {
        acc[key] = {
          standardId: row.standardId,
          name: row.name,
          owner: row.owner,
          tags: row.tags || [],
          requirements: [],
        };
      }
      acc[key].requirements.push(row);
      return acc;
    }, {});

    res.json({ ok: true, data: Object.values(grouped) });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to load standards.' });
  }
});

router.post('/programs/:programId/standards', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const body = z
      .object({
        standardId: z.string().optional(),
        name: z.string().min(2),
        requirement: z.string().min(2),
        status: z.string().optional(),
        owner: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
      .parse(req.body || {});

    const standardId = body.standardId || crypto.randomUUID();
    const [created] = await db
      .insert(cerv2Standards)
      .values({
        organizationId,
        programId,
        standardId,
        name: body.name,
        requirement: body.requirement,
        status: body.status || 'missing',
        owner: body.owner || null,
        tags: body.tags || [],
      })
      .returning();

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'STANDARD_CREATED',
      entityType: 'STANDARD_REQUIREMENT',
      entityId: created.standardId,
      diffSummary: `Requirement added to ${created.name}`,
    });

    res.status(201).json({ ok: true, data: created });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to create standard requirement.' });
  }
});

router.patch('/programs/:programId/standards/:standardId/requirements/:requirementId', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const requirementId = z.string().parse(req.params.requirementId);
    const body = z
      .object({
        name: z.string().optional(),
        requirement: z.string().optional(),
        status: z.string().optional(),
        owner: z.string().optional(),
        tags: z.array(z.string()).optional(),
        needsReview: z.boolean().optional(),
      })
      .parse(req.body || {});

    const [updated] = await db
      .update(cerv2Standards)
      .set({
        name: body.name,
        requirement: body.requirement,
        status: body.status,
        owner: body.owner,
        tags: body.tags,
        needsReview: body.needsReview,
        updatedAt: sql`now()`,
      })
      .where(and(eq(cerv2Standards.organizationId, organizationId), eq(cerv2Standards.programId, programId), eq(cerv2Standards.standardId, requirementId)))
      .returning();

    if (!updated) return res.status(404).json({ ok: false, error: 'Requirement not found.' });

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'STANDARD_UPDATED',
      entityType: 'STANDARD_REQUIREMENT',
      entityId: updated.standardId,
      diffSummary: `Requirement updated for ${updated.name}`,
    });

    res.json({ ok: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to update requirement.' });
  }
});

router.delete('/programs/:programId/standards/:standardId/requirements/:requirementId', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const requirementId = z.string().parse(req.params.requirementId);

    const [removed] = await db
      .delete(cerv2Standards)
      .where(and(eq(cerv2Standards.organizationId, organizationId), eq(cerv2Standards.programId, programId), eq(cerv2Standards.standardId, requirementId)))
      .returning();

    if (!removed) return res.status(404).json({ ok: false, error: 'Requirement not found.' });

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'STANDARD_DELETED',
      entityType: 'STANDARD_REQUIREMENT',
      entityId: removed.standardId,
      diffSummary: `Requirement deleted from ${removed.name}`,
    });

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to delete requirement.' });
  }
});

router.get('/programs/:programId/outcomes', async (req, res) => {
  try {
    const { organizationId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const rows = await db
      .select()
      .from(cerv2Outcomes)
      .where(and(eq(cerv2Outcomes.organizationId, organizationId), eq(cerv2Outcomes.programId, programId)))
      .orderBy(desc(cerv2Outcomes.updatedAt));

    res.json({ ok: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to load outcomes.' });
  }
});

router.post('/programs/:programId/outcomes', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const body = z
      .object({
        name: z.string().min(2),
        timepoint: z.string().optional(),
        comparator: z.string().optional(),
        confidence: z.string().optional(),
        status: z.string().optional(),
        owner: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
      .parse(req.body || {});

    const outcomeId = crypto.randomUUID();
    const [created] = await db
      .insert(cerv2Outcomes)
      .values({
        organizationId,
        programId,
        outcomeId,
        name: body.name,
        timepoint: body.timepoint || null,
        comparator: body.comparator || null,
        confidence: body.confidence || 'low',
        status: body.status || 'missing',
        owner: body.owner || null,
        tags: body.tags || [],
      })
      .returning();

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'OUTCOME_CREATED',
      entityType: 'OUTCOME',
      entityId: created.outcomeId,
      diffSummary: `Outcome created: ${created.name}`,
    });

    res.status(201).json({ ok: true, data: created });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to create outcome.' });
  }
});

router.patch('/programs/:programId/outcomes/:outcomeId', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const outcomeId = z.string().parse(req.params.outcomeId);
    const body = z
      .object({
        name: z.string().optional(),
        timepoint: z.string().optional(),
        comparator: z.string().optional(),
        confidence: z.string().optional(),
        status: z.string().optional(),
        owner: z.string().optional(),
        tags: z.array(z.string()).optional(),
        needsReview: z.boolean().optional(),
      })
      .parse(req.body || {});

    const [updated] = await db
      .update(cerv2Outcomes)
      .set({
        name: body.name,
        timepoint: body.timepoint,
        comparator: body.comparator,
        confidence: body.confidence,
        status: body.status,
        owner: body.owner,
        tags: body.tags,
        needsReview: body.needsReview,
        updatedAt: sql`now()`,
      })
      .where(and(eq(cerv2Outcomes.organizationId, organizationId), eq(cerv2Outcomes.programId, programId), eq(cerv2Outcomes.outcomeId, outcomeId)))
      .returning();

    if (!updated) return res.status(404).json({ ok: false, error: 'Outcome not found.' });

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'OUTCOME_UPDATED',
      entityType: 'OUTCOME',
      entityId: outcomeId,
      diffSummary: `Outcome updated: ${updated.name}`,
    });

    res.json({ ok: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to update outcome.' });
  }
});

router.delete('/programs/:programId/outcomes/:outcomeId', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const outcomeId = z.string().parse(req.params.outcomeId);

    const [removed] = await db
      .delete(cerv2Outcomes)
      .where(and(eq(cerv2Outcomes.organizationId, organizationId), eq(cerv2Outcomes.programId, programId), eq(cerv2Outcomes.outcomeId, outcomeId)))
      .returning();

    if (!removed) return res.status(404).json({ ok: false, error: 'Outcome not found.' });

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'OUTCOME_DELETED',
      entityType: 'OUTCOME',
      entityId: outcomeId,
      diffSummary: `Outcome deleted: ${removed.name}`,
    });

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to delete outcome.' });
  }
});

router.post('/programs/:programId/evidence-links', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const body = z
      .object({
        evidenceId: z.string().min(1),
        entityType: z.string().min(1),
        entityId: z.string().min(1),
      })
      .parse(req.body || {});

    const [evidence] = await db
      .select()
      .from(cerv2Evidence)
      .where(
        and(
          eq(cerv2Evidence.organizationId, organizationId),
          eq(cerv2Evidence.programId, programId),
          eq(cerv2Evidence.evidenceId, body.evidenceId),
          sql`${cerv2Evidence.archivedAt} IS NULL`
        )
      )
      .limit(1);

    if (!evidence) {
      return res.status(404).json({ ok: false, error: 'Evidence not found.' });
    }

    await db
      .insert(cerv2EvidenceLinks)
      .values({
        organizationId,
        programId,
        evidenceId: body.evidenceId,
        entityType: body.entityType,
        entityId: body.entityId,
      })
      .onConflictDoNothing();

    await markEntityNeedsReview({
      organizationId,
      entityType: body.entityType,
      entityId: body.entityId,
    });

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'EVIDENCE_LINKED',
      entityType: body.entityType,
      entityId: body.entityId,
      diffSummary: `Linked evidence ${body.evidenceId} to ${body.entityType}`,
      metadata: { evidenceId: body.evidenceId },
    });

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'IMPACT_REVIEW_REQUIRED',
      entityType: body.entityType,
      entityId: body.entityId,
      diffSummary: 'Evidence link updated; review required.',
      metadata: { evidenceId: body.evidenceId },
    });

    res.status(201).json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to link evidence.' });
  }
});

router.post('/programs/:programId/evidence-links/bulk', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const body = z
      .object({
        evidenceIds: z.array(z.string().min(1)).min(1),
        entityType: z.string().min(1),
        entityId: z.string().min(1),
      })
      .parse(req.body || {});

    // Create all links in one transaction
    const values = body.evidenceIds.map((evidenceId) => ({
      organizationId,
      programId,
      evidenceId,
      entityType: body.entityType,
      entityId: body.entityId,
    }));

    await db.insert(cerv2EvidenceLinks).values(values).onConflictDoNothing();

    // Mark entity for review
    await markEntityNeedsReview({
      organizationId,
      entityType: body.entityType,
      entityId: body.entityId,
    });

    // Log bulk audit event
    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'EVIDENCE_LINKED_BULK',
      entityType: body.entityType,
      entityId: body.entityId,
      diffSummary: `Bulk linked ${body.evidenceIds.length} evidence items to ${body.entityType}`,
      metadata: {
        evidenceIds: body.evidenceIds,
        count: body.evidenceIds.length,
      },
    });

    res.status(201).json({ ok: true, count: body.evidenceIds.length });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to bulk link evidence.' });
  }
});

router.get('/programs/:programId/evidence-links', async (req, res) => {
  try {
    const { organizationId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const query = z
      .object({
        entityType: z.string().min(1),
        entityId: z.string().min(1),
      })
      .parse(req.query);

    const rows = await db
      .select({ evidenceId: cerv2EvidenceLinks.evidenceId })
      .from(cerv2EvidenceLinks)
      .where(
        and(
          eq(cerv2EvidenceLinks.organizationId, organizationId),
          eq(cerv2EvidenceLinks.programId, programId),
          eq(cerv2EvidenceLinks.entityType, query.entityType),
          eq(cerv2EvidenceLinks.entityId, query.entityId)
        )
      );

    res.json({ ok: true, data: rows.map((row) => row.evidenceId) });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to load evidence links.' });
  }
});

router.delete('/programs/:programId/evidence-links', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const body = z
      .object({
        evidenceId: z.string().min(1),
        entityType: z.string().min(1),
        entityId: z.string().min(1),
      })
      .parse(req.body || {});

    const [removed] = await db
      .delete(cerv2EvidenceLinks)
      .where(
        and(
          eq(cerv2EvidenceLinks.organizationId, organizationId),
          eq(cerv2EvidenceLinks.programId, programId),
          eq(cerv2EvidenceLinks.evidenceId, body.evidenceId),
          eq(cerv2EvidenceLinks.entityType, body.entityType),
          eq(cerv2EvidenceLinks.entityId, body.entityId)
        )
      )
      .returning();

    if (!removed) return res.status(404).json({ ok: false, error: 'Link not found.' });

    await markEntityNeedsReview({
      organizationId,
      entityType: body.entityType,
      entityId: body.entityId,
    });

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'EVIDENCE_UNLINKED',
      entityType: body.entityType,
      entityId: body.entityId,
      diffSummary: `Unlinked evidence ${body.evidenceId} from ${body.entityType}`,
      metadata: { evidenceId: body.evidenceId },
    });

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'IMPACT_REVIEW_REQUIRED',
      entityType: body.entityType,
      entityId: body.entityId,
      diffSummary: 'Evidence link removed; review required.',
      metadata: { evidenceId: body.evidenceId },
    });

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to unlink evidence.' });
  }
});

router.delete('/programs/:programId/evidence-links/bulk', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const body = z
      .object({
        evidenceIds: z.array(z.string().min(1)).min(1),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
      })
      .parse(req.body || {});

    // Build delete conditions
    const conditions: any[] = [
      eq(cerv2EvidenceLinks.organizationId, organizationId),
      eq(cerv2EvidenceLinks.programId, programId),
      sql`${cerv2EvidenceLinks.evidenceId} = ANY(${body.evidenceIds})`,
    ];

    if (body.entityType) {
      conditions.push(eq(cerv2EvidenceLinks.entityType, body.entityType));
    }
    if (body.entityId) {
      conditions.push(eq(cerv2EvidenceLinks.entityId, body.entityId));
    }

    const removed = await db
      .delete(cerv2EvidenceLinks)
      .where(and(...conditions))
      .returning();

    // Mark affected entities for review
    const affectedEntities = new Map<string, Set<string>>();
    for (const link of removed) {
      const key = String(link.entityType);
      if (!affectedEntities.has(key)) {
        affectedEntities.set(key, new Set());
      }
      affectedEntities.get(key)!.add(String(link.entityId));
    }

    for (const [entityType, entityIds] of affectedEntities.entries()) {
      for (const entityId of entityIds) {
        await markEntityNeedsReview({ organizationId, entityType, entityId });
      }
    }

    // Log bulk audit event
    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'EVIDENCE_UNLINKED_BULK',
      entityType: body.entityType || null,
      entityId: body.entityId || null,
      diffSummary: `Bulk unlinked ${removed.length} evidence links`,
      metadata: {
        evidenceIds: body.evidenceIds,
        removedCount: removed.length,
        affectedEntities: Array.from(affectedEntities.entries()).map(([type, ids]) => ({
          entityType: type,
          entityIds: Array.from(ids),
        })),
      },
    });

    res.json({ ok: true, removedCount: removed.length });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to bulk unlink evidence.' });
  }
});

router.get('/programs/:programId/exports/preflight', async (req, res) => {
  try {
    const { organizationId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);

    const blockers: string[] = [];
    const warnings: string[] = [];

    // Check evidence count
    const [evidenceRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cerv2Evidence)
      .where(
        and(
          eq(cerv2Evidence.organizationId, organizationId),
          eq(cerv2Evidence.programId, programId),
          sql`${cerv2Evidence.archivedAt} IS NULL`
        )
      );
    const evidenceCount = Number(evidenceRow?.count || 0);
    if (evidenceCount === 0) {
      blockers.push('No evidence files uploaded yet');
    }

    // Check claims coverage
    const claims = await db
      .select({ claimId: cerv2Claims.claimId })
      .from(cerv2Claims)
      .where(
        and(
          eq(cerv2Claims.organizationId, organizationId),
          eq(cerv2Claims.programId, programId)
        )
      );

    const claimsWithEvidence = await db
      .select({ entityId: cerv2EvidenceLinks.entityId })
      .from(cerv2EvidenceLinks)
      .where(
        and(
          eq(cerv2EvidenceLinks.organizationId, organizationId),
          eq(cerv2EvidenceLinks.programId, programId),
          eq(cerv2EvidenceLinks.entityType, 'CLAIM')
        )
      );

    const claimCoveragePercent =
      claims.length > 0
        ? Math.round((new Set(claimsWithEvidence.map((l) => l.entityId)).size / claims.length) * 100)
        : 0;

    if (claimCoveragePercent < 70) {
      blockers.push(`Claims coverage below 70% (currently ${claimCoveragePercent}%)`);
    } else if (claimCoveragePercent < 90) {
      warnings.push(`Claims coverage is ${claimCoveragePercent}% (target: 90%+)`);
    }

    // Check standards coverage
    const standards = await db
      .select({ standardId: cerv2Standards.standardId })
      .from(cerv2Standards)
      .where(
        and(
          eq(cerv2Standards.organizationId, organizationId),
          eq(cerv2Standards.programId, programId)
        )
      );

    const standardsWithEvidence = await db
      .select({ entityId: cerv2EvidenceLinks.entityId })
      .from(cerv2EvidenceLinks)
      .where(
        and(
          eq(cerv2EvidenceLinks.organizationId, organizationId),
          eq(cerv2EvidenceLinks.programId, programId),
          eq(cerv2EvidenceLinks.entityType, 'STANDARD_REQUIREMENT')
        )
      );

    const standardCoveragePercent =
      standards.length > 0
        ? Math.round(
            (new Set(standardsWithEvidence.map((l) => l.entityId)).size / standards.length) * 100
          )
        : 0;

    if (standardCoveragePercent < 70) {
      blockers.push(`Standards coverage below 70% (currently ${standardCoveragePercent}%)`);
    } else if (standardCoveragePercent < 90) {
      warnings.push(`Standards coverage is ${standardCoveragePercent}% (target: 90%+)`);
    }

    // Check for items needing review
    const [needsReviewRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cerv2Claims)
      .where(
        and(
          eq(cerv2Claims.organizationId, organizationId),
          eq(cerv2Claims.programId, programId),
          eq(cerv2Claims.needsReview, true)
        )
      );
    const reviewCount = Number(needsReviewRow?.count || 0);
    if (reviewCount > 0) {
      warnings.push(`${reviewCount} claim(s) marked as needing review`);
    }

    const canExport = blockers.length === 0;

    res.json({
      ok: true,
      data: {
        canExport,
        blockers,
        warnings,
        metrics: {
          evidenceCount,
          claimCoverage: claimCoveragePercent,
          standardCoverage: standardCoveragePercent,
          needsReview: reviewCount,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to check export preflight.' });
  }
});

router.post('/programs/:programId/exports/claims-matrix', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const buffer = await buildClaimsWorkbook(organizationId, programId);
    const name = `Claims_Matrix_${programId}.xlsx`;
    const evidence = await createExportEvidence({
      organizationId,
      programId,
      actorId,
      name,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    res.json({ ok: true, data: evidence });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to generate claims matrix.' });
  }
});

router.post('/programs/:programId/exports/standards-coverage', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const buffer = await buildStandardsWorkbook(organizationId, programId);
    const name = `Standards_Coverage_${programId}.xlsx`;
    const evidence = await createExportEvidence({
      organizationId,
      programId,
      actorId,
      name,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    res.json({ ok: true, data: evidence });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to generate standards coverage.' });
  }
});

router.post('/programs/:programId/exports/outcomes-substantiation', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const buffer = await buildOutcomesWorkbook(organizationId, programId);
    const name = `Outcomes_Substantiation_${programId}.xlsx`;
    const evidence = await createExportEvidence({
      organizationId,
      programId,
      actorId,
      name,
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    res.json({ ok: true, data: evidence });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to generate outcomes substantiation.' });
  }
});

router.post('/programs/:programId/exports/defense-pack', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const buffer = await buildDefenseZip({ organizationId, programId });
    const name = `Defense_Pack_${programId}.zip`;
    const evidence = await createExportEvidence({
      organizationId,
      programId,
      actorId,
      name,
      buffer,
      mimeType: 'application/zip',
    });
    res.json({ ok: true, data: evidence });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to generate defense pack.' });
  }
});

router.get('/programs/:programId/packages', async (req, res) => {
  try {
    const { organizationId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const numericProjectId = Number.parseInt(programId, 10);

    if (!Number.isFinite(numericProjectId)) {
      return res.status(400).json({ ok: false, error: 'programId must be numeric.' });
    }

    const [fdaProject] = await db
      .select({ id: fda510kProjects.id })
      .from(fda510kProjects)
      .where(and(eq(fda510kProjects.organizationId, organizationId), eq(fda510kProjects.projectId, numericProjectId)))
      .limit(1);

    if (!fdaProject) {
      return res.json({ ok: true, data: [] });
    }

    const rows = await db
      .select({
        id: fda510kSubmissionPackages.id,
        packageId: fda510kSubmissionPackages.packageId,
        packageName: fda510kSubmissionPackages.packageName,
        status: fda510kSubmissionPackages.status,
        attachments: fda510kSubmissionPackages.attachments,
        createdAt: fda510kSubmissionPackages.createdAt,
        updatedAt: fda510kSubmissionPackages.updatedAt,
      })
      .from(fda510kSubmissionPackages)
      .where(and(eq(fda510kSubmissionPackages.organizationId, organizationId), eq(fda510kSubmissionPackages.projectId, fdaProject.id)))
      .orderBy(desc(fda510kSubmissionPackages.createdAt));

    return res.json({ ok: true, data: rows });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error?.message || 'Failed to load packages.' });
  }
});

router.get('/programs/:programId/evidence', async (req, res) => {
  try {
    const { organizationId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);

    const query = z
      .object({
        search: z.string().optional(),
        folderPath: z.string().optional(),
        status: z.string().optional(),
      })
      .parse(req.query);

    const clauses: any[] = [
      eq(cerv2Evidence.organizationId, organizationId),
      eq(cerv2Evidence.programId, programId),
      sql`${cerv2Evidence.archivedAt} IS NULL`,
    ];

    if (query.status) {
      clauses.push(eq(cerv2Evidence.status, query.status));
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      clauses.push(
        sql`(${cerv2Evidence.name} ILIKE ${term} OR ${cerv2Evidence.metadata}->>'folderPath' ILIKE ${term})`
      );
    }

    if (query.folderPath) {
      clauses.push(sql`${cerv2Evidence.metadata}->>'folderPath' ILIKE ${query.folderPath + '%'}`);
    }

    const rows = await db
      .select({
        id: cerv2Evidence.id,
        evidenceId: cerv2Evidence.evidenceId,
        name: cerv2Evidence.name,
        evidenceType: cerv2Evidence.evidenceType,
        status: cerv2Evidence.status,
        hash: cerv2Evidence.hash,
        tags: cerv2Evidence.tags,
        filePath: cerv2Evidence.filePath,
        mimeType: cerv2Evidence.mimeType,
        sizeBytes: cerv2Evidence.sizeBytes,
        uploadedAt: cerv2Evidence.uploadedAt,
        metadata: cerv2Evidence.metadata,
      })
      .from(cerv2Evidence)
      .where(and(...clauses))
      .orderBy(desc(cerv2Evidence.uploadedAt));

    const data = rows.map((row) => ({
      ...row,
      folderPath: (row.metadata as any)?.folderPath || 'evidence',
    }));

    res.json({ ok: true, data });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to load evidence.' });
  }
});

router.post('/programs/:programId/evidence', upload.single('file'), async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);

    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Missing file.' });
    }

    const meta = z
      .object({
        evidenceType: z.string().default('EVIDENCE'),
        folderPath: z.string().default('evidence'),
        tags: z.string().optional(),
      })
      .parse(req.body || {});

    const evidenceId = crypto.randomUUID();
    const safeName = sanitizeFileName(req.file.originalname);
    const hash = sha256Buffer(req.file.buffer);

    const stored = await putEvidenceFile({
      orgId: organizationId,
      programId,
      evidenceId,
      fileName: safeName,
      buffer: req.file.buffer,
    });

    const tags = (meta.tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const [created] = await db
      .insert(cerv2Evidence)
      .values({
        organizationId,
        programId,
        evidenceId,
        name: safeName,
        evidenceType: meta.evidenceType,
        status: 'inbox',
        hash,
        owner: actorId ? String(actorId) : null,
        tags,
        filePath: stored.filePath,
        mimeType: req.file.mimetype,
        sizeBytes: stored.sizeBytes,
        metadata: { folderPath: meta.folderPath, originalName: req.file.originalname },
      })
      .returning();

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'EVIDENCE_UPLOADED',
      entityType: 'EVIDENCE',
      entityId: created.evidenceId,
      diffSummary: `Uploaded ${meta.folderPath}/${safeName}`,
      metadata: { sizeBytes: stored.sizeBytes, hash },
    });

    res.status(201).json({ ok: true, data: { ...created, folderPath: meta.folderPath } });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to upload evidence.' });
  }
});

router.patch('/programs/:programId/evidence/:evidenceId', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const evidenceId = z.string().parse(req.params.evidenceId);

    const body = z
      .object({
        name: z.string().min(1).optional(),
        folderPath: z.string().min(1).optional(),
        tags: z.array(z.string()).optional(),
        status: z.string().optional(),
        metadata: z.record(z.any()).optional(),
      })
      .parse(req.body || {});

    const [row] = await db
      .select()
      .from(cerv2Evidence)
      .where(
        and(
          eq(cerv2Evidence.organizationId, organizationId),
          eq(cerv2Evidence.programId, programId),
          eq(cerv2Evidence.evidenceId, evidenceId),
          sql`${cerv2Evidence.archivedAt} IS NULL`
        )
      )
      .limit(1);

    if (!row) return res.status(404).json({ ok: false, error: 'Evidence not found.' });

    const nextName = body.name ? sanitizeFileName(body.name) : row.name;
    const nextMetadata = { ...(row.metadata as any), ...(body.metadata || {}) };
    if (body.folderPath) {
      nextMetadata.folderPath = body.folderPath;
    }

    const [updated] = await db
      .update(cerv2Evidence)
      .set({
        name: nextName,
        tags: body.tags ?? row.tags,
        status: body.status ?? row.status,
        metadata: nextMetadata,
        updatedAt: sql`now()`,
      })
      .where(eq(cerv2Evidence.id, row.id))
      .returning();

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'EVIDENCE_UPDATED',
      entityType: 'EVIDENCE',
      entityId: row.evidenceId,
      diffSummary: `Updated ${row.name}`,
      metadata: {
        from: { name: row.name, folderPath: (row.metadata as any)?.folderPath || null },
        to: { name: updated.name, folderPath: (updated.metadata as any)?.folderPath || null },
      },
    });

    await markImpactForEvidence({
      organizationId,
      programId,
      evidenceId: row.evidenceId,
      actorId,
      reason: 'Evidence metadata updated; linked entities require review.',
    });

    res.json({
      ok: true,
      data: { ...updated, folderPath: (updated.metadata as any)?.folderPath || 'evidence' },
    });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to update evidence.' });
  }
});

router.delete('/programs/:programId/evidence/:evidenceId', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const evidenceId = z.string().parse(req.params.evidenceId);

    const [row] = await db
      .select()
      .from(cerv2Evidence)
      .where(
        and(
          eq(cerv2Evidence.organizationId, organizationId),
          eq(cerv2Evidence.programId, programId),
          eq(cerv2Evidence.evidenceId, evidenceId),
          sql`${cerv2Evidence.archivedAt} IS NULL`
        )
      )
      .limit(1);

    if (!row) return res.status(404).json({ ok: false, error: 'Evidence not found.' });

    if (row.filePath) {
      await deleteEvidenceFile(row.filePath);
    }

    await db
      .update(cerv2Evidence)
      .set({ archivedAt: sql`now()`, status: 'archived', updatedAt: sql`now()` })
      .where(eq(cerv2Evidence.id, row.id));

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'EVIDENCE_DELETED',
      entityType: 'EVIDENCE',
      entityId: row.evidenceId,
      diffSummary: `Archived ${row.name}`,
    });

    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to delete evidence.' });
  }
});

router.get('/programs/:programId/evidence/:evidenceId/download', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const evidenceId = z.string().parse(req.params.evidenceId);

    const [row] = await db
      .select()
      .from(cerv2Evidence)
      .where(
        and(
          eq(cerv2Evidence.organizationId, organizationId),
          eq(cerv2Evidence.programId, programId),
          eq(cerv2Evidence.evidenceId, evidenceId),
          sql`${cerv2Evidence.archivedAt} IS NULL`
        )
      )
      .limit(1);

    if (!row) return res.status(404).json({ ok: false, error: 'Evidence not found.' });
    if (!row.filePath) return res.status(404).json({ ok: false, error: 'File missing.' });

    await logAudit({
      organizationId,
      programId,
      actorId,
      action: 'EVIDENCE_DOWNLOADED',
      entityType: 'EVIDENCE',
      entityId: row.evidenceId,
      diffSummary: `Downloaded ${row.name}`,
    });

    const absolutePath = await getEvidenceFilePath(row.filePath);
    res.setHeader('Content-Type', row.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${row.name}"`);
    res.sendFile(absolutePath);
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to download evidence.' });
  }
});

/**
 * GET /programs/:programId/audit
 * 
 * List audit events with pagination.
 * Query params:
 * - limit: max results (default 50, max 200)
 * - cursor: audit event ID to paginate from
 * - type: filter by audit event type
 * - entityType: filter by entity type
 */
router.get('/programs/:programId/audit', async (req, res) => {
  try {
    const { organizationId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    
    const params = z
      .object({
        limit: z.coerce.number().min(1).max(200).optional(),
        cursor: z.coerce.number().optional(),
        type: z.string().optional(),
        entityType: z.string().optional(),
      })
      .parse(req.query || {});

    const rows = await listAuditEvents(programId, organizationId, params);

    res.json({ ok: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to load audit events.' });
  }
});

// ============================================================================
// STATUS PATCH ENDPOINTS - Real UI Status Changes
// ============================================================================

/**
 * PATCH /programs/:programId/claims/:claimId/status
 * 
 * Update claim status with audit trail.
 * No UI hacks - this is the real endpoint.
 */
router.patch('/programs/:programId/claims/:claimId/status', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const claimId = z.string().parse(req.params.claimId);

    const body = z
      .object({
        status: z.string(),
        notes: z.string().optional(),
      })
      .parse(req.body || {});

    const [existing] = await db
      .select()
      .from(cerv2Claims)
      .where(
        and(
          eq(cerv2Claims.organizationId, organizationId),
          eq(cerv2Claims.programId, programId),
          eq(cerv2Claims.claimId, claimId)
        )
      )
      .limit(1);

    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Claim not found.' });
    }

    const [updated] = await db
      .update(cerv2Claims)
      .set({
        status: body.status,
        updatedAt: sql`now()`,
      })
      .where(eq(cerv2Claims.id, existing.id))
      .returning();

    await emitAudit({
      organizationId,
      programId,
      actorUserId: actorId,
      type: 'STATUS_UPDATED',
      entityType: 'CLAIM',
      entityId: claimId,
      diffSummary: `Status changed from ${existing.status} to ${body.status}`,
      payload: {
        oldStatus: existing.status,
        newStatus: body.status,
        notes: body.notes || null,
      },
    });

    res.json({ ok: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to update claim status.' });
  }
});

/**
 * PATCH /programs/:programId/standards/:standardId/status
 */
router.patch('/programs/:programId/standards/:standardId/status', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const standardId = z.string().parse(req.params.standardId);

    const body = z
      .object({
        status: z.string(),
        notes: z.string().optional(),
      })
      .parse(req.body || {});

    const [existing] = await db
      .select()
      .from(cerv2Standards)
      .where(
        and(
          eq(cerv2Standards.organizationId, organizationId),
          eq(cerv2Standards.programId, programId),
          eq(cerv2Standards.standardId, standardId)
        )
      )
      .limit(1);

    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Standard requirement not found.' });
    }

    const [updated] = await db
      .update(cerv2Standards)
      .set({
        status: body.status,
        updatedAt: sql`now()`,
      })
      .where(eq(cerv2Standards.id, existing.id))
      .returning();

    await emitAudit({
      organizationId,
      programId,
      actorUserId: actorId,
      type: 'STATUS_UPDATED',
      entityType: 'STANDARD_REQUIREMENT',
      entityId: standardId,
      diffSummary: `Status changed from ${existing.status} to ${body.status}`,
      payload: {
        oldStatus: existing.status,
        newStatus: body.status,
        notes: body.notes || null,
      },
    });

    res.json({ ok: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to update standard status.' });
  }
});

/**
 * PATCH /programs/:programId/outcomes/:outcomeId/status
 */
router.patch('/programs/:programId/outcomes/:outcomeId/status', async (req, res) => {
  try {
    const { organizationId, actorId } = readOrgContext(req);
    const programId = z.string().parse(req.params.programId);
    const outcomeId = z.string().parse(req.params.outcomeId);

    const body = z
      .object({
        status: z.string(),
        notes: z.string().optional(),
      })
      .parse(req.body || {});

    const [existing] = await db
      .select()
      .from(cerv2Outcomes)
      .where(
        and(
          eq(cerv2Outcomes.organizationId, organizationId),
          eq(cerv2Outcomes.programId, programId),
          eq(cerv2Outcomes.outcomeId, outcomeId)
        )
      )
      .limit(1);

    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Outcome not found.' });
    }

    const [updated] = await db
      .update(cerv2Outcomes)
      .set({
        status: body.status,
        updatedAt: sql`now()`,
      })
      .where(eq(cerv2Outcomes.id, existing.id))
      .returning();

    await emitAudit({
      organizationId,
      programId,
      actorUserId: actorId,
      type: 'STATUS_UPDATED',
      entityType: 'OUTCOME',
      entityId: outcomeId,
      diffSummary: `Status changed from ${existing.status} to ${body.status}`,
      payload: {
        oldStatus: existing.status,
        newStatus: body.status,
        notes: body.notes || null,
      },
    });

    res.json({ ok: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Failed to update outcome status.' });
  }
});

export default router;
