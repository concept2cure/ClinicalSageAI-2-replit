/**
 * GSPR + Post-Market Routes
 *
 *   GET    /api/gspr/catalog                                   list active catalog (?regulation=MDR|IVDR)
 *   GET    /api/gspr/programs/:programId/mappings              list per-program mappings
 *   POST   /api/gspr/programs/:programId/mappings              upsert a mapping
 *   GET    /api/gspr/programs/:programId/coverage              coverage / gap report
 *
 *   GET    /api/post-market/programs/:programId/documents      list (?type=)
 *   POST   /api/post-market/programs/:programId/documents      create (draft)
 *   GET    /api/post-market/documents/:documentId
 *   PATCH  /api/post-market/documents/:documentId
 *   POST   /api/post-market/documents/:documentId/validate
 *   POST   /api/post-market/documents/:documentId/approve
 *   POST   /api/post-market/documents/:documentId/supersede
 */

import { Router, Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';

import { db } from '../db';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { authenticateToken } from '../middleware/auth';
import {
  computeCoverage,
  listCatalog,
  listProgramMappings,
  upsertMapping,
  type GsprProgramProfile,
} from '../services/gspr-postmarket/gspr.service';
import {
  approveDocument,
  createDocument,
  getDocument,
  listProgramDocuments,
  supersedeDocument,
  updateDocument,
  validateDocument,
} from '../services/gspr-postmarket/post-market.service';
import { generatePmcfPlan } from '../services/gspr-postmarket/pmcf-plan-generator';
import {
  authorPostMarketDocument,
  AUTHORABLE_DOCUMENT_TYPES,
} from '../services/gspr-postmarket/post-market-authoring';
import { getPostMarketDocStatus } from '../services/gspr-postmarket/post-market-readiness';
import {
  isPmcfEnrollmentStoreAbsent,
  listPmcfEnrollmentRecords,
  summariseRecords,
  upsertPmcfEnrollmentRecord,
  STORE_ABSENT,
} from '../services/gspr-postmarket/pmcf-enrollment.service';
import type { PostMarketDocumentType } from '../../shared/schema/gspr-postmarket';
import {
  PMCF_ACTIVITY_KINDS,
  PMCF_ACTIVITY_STATUSES,
  type PmcfActivityKind,
  type PmcfActivityStatus,
} from '../../shared/schema/gspr-postmarket';
import auditService from '../services/auditService';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

function userIdFromReq(req: Request): string | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  return typeof raw === 'string' ? raw : String(raw);
}

const router = Router();

const logger = createScopedLogger('gspr-postmarket');
const postMarketRouter = Router();
router.use(authenticateToken);
postMarketRouter.use(authenticateToken);

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

async function requireProgramAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const orgId = getOrgId(req);
  if (orgId === null) {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  const [row] = await db
    .select({ id: regulatoryPrograms.id })
    .from(regulatoryPrograms)
    .where(
      and(eq(regulatoryPrograms.id, String(req.params.programId)), eq(regulatoryPrograms.organizationId, orgId))
    )
    .limit(1);
  if (!row) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// GSPR
// ─────────────────────────────────────────────────────────────────────────────

router.get('/catalog', async (req: Request, res: Response) => {
  const reg = req.query.regulation as 'MDR' | 'IVDR' | undefined;
  if (reg && reg !== 'MDR' && reg !== 'IVDR') {
    return res.status(422).json({ error: 'regulation must be MDR or IVDR' });
  }
  try {
    const catalog = await listCatalog(reg);
    res.json({ regulation: reg ?? 'ALL', requirements: catalog, count: catalog.length });
  } catch (err: any) {
    return serverError(res, logger, 'loading catalog', err);
  }
});

router.get(
  '/programs/:programId/mappings',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    try {
      const orgId = getOrgId(req)!;
      const rows = await listProgramMappings(orgId, String(req.params.programId));
      res.json({ programId: req.params.programId, mappings: rows, count: rows.length });
    } catch (err: any) {
      return serverError(res, logger, 'loading mappings', err);
    }
  }
);

router.post(
  '/programs/:programId/mappings',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const body = req.body ?? {};
    if (!body.requirementId || !body.applicability) {
      return res.status(422).json({ error: 'requirementId and applicability are required' });
    }
    try {
      const userIdRaw = (req as any).user?.id;
      const decidedBy =
        typeof userIdRaw === 'string'
          ? userIdRaw
          : userIdRaw != null
          ? String(userIdRaw)
          : 'system';
      const row = await upsertMapping({
        ...body,
        organizationId: orgId,
        programId: req.params.programId,
        decidedBy: body.decidedBy ?? decidedBy,
        decidedAt: body.decidedAt ?? new Date(),
      });

      void auditService.logAction({
        tenantId: orgId,
        userId: decidedBy,
        action: 'gspr.mapping.upsert',
        resourceType: 'gspr_program_mapping',
        resourceId: String((row as any)?.id ?? `${req.params.programId}:${body.requirementId}`),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        details: {
          programId: req.params.programId,
          requirementId: body.requirementId,
          applicability: body.applicability,
        },
      });

      res.json(row);
    } catch (err: any) {
      return serverError(res, logger, 'saving mappings', err);
    }
  }
);

router.get(
  '/programs/:programId/coverage',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const profile = req.query as Record<string, string | undefined>;
    if (!profile.regulation || (profile.regulation !== 'MDR' && profile.regulation !== 'IVDR')) {
      return res.status(422).json({ error: 'regulation query param must be MDR or IVDR' });
    }
    const built: GsprProgramProfile = {
      regulation: profile.regulation,
      productType: profile.productType ?? 'device',
      deviceClass: profile.deviceClass ?? null,
      isSoftware: profile.isSoftware === 'true',
      isAiMl: profile.isAiMl === 'true',
      isIvd: profile.isIvd === 'true',
      isSterile: profile.isSterile === 'true',
      isImplantable: profile.isImplantable === 'true',
      hasPatientContact: profile.hasPatientContact === 'true',
    };
    try {
      const report = await computeCoverage(orgId, String(req.params.programId), built);
      res.json(report);
    } catch (err: any) {
      return serverError(res, logger, 'loading coverage', err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Post-market documents
// ─────────────────────────────────────────────────────────────────────────────

const VALID_DOC_TYPES = new Set([
  'pms_plan',
  'pms_report',
  'pmcf_plan',
  'pmcf_evaluation',
  'psur',
  'sscp',
] as const);

postMarketRouter.get(
  '/programs/:programId/documents',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const t = req.query.type as string | undefined;
    if (t && !VALID_DOC_TYPES.has(t as any)) {
      return res.status(422).json({ error: `type must be one of: ${[...VALID_DOC_TYPES].join(', ')}` });
    }
    try {
      const rows = await listProgramDocuments(orgId, String(req.params.programId), t as any);
      res.json({ programId: req.params.programId, documents: rows, count: rows.length });
    } catch (err: any) {
      return serverError(res, logger, 'loading coverage', err);
    }
  }
);

postMarketRouter.post(
  '/programs/:programId/documents',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const body = req.body ?? {};
    if (!body.documentType || !VALID_DOC_TYPES.has(body.documentType)) {
      return res.status(422).json({ error: 'documentType is required and must be valid' });
    }
    if (!body.code || !body.title) {
      return res.status(422).json({ error: 'code and title are required' });
    }
    try {
      const userIdRaw = (req as any).user?.id;
      const createdBy =
        typeof userIdRaw === 'string'
          ? userIdRaw
          : userIdRaw != null
          ? String(userIdRaw)
          : 'system';
      const doc = await createDocument({
        ...body,
        organizationId: orgId,
        programId: req.params.programId,
        createdBy,
        updatedBy: createdBy,
      });

      void auditService.logAction({
        tenantId: orgId,
        userId: createdBy,
        action: 'post_market.document.create',
        resourceType: 'post_market_document',
        resourceId: String((doc as any)?.id ?? body.code),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        details: {
          programId: req.params.programId,
          documentType: body.documentType,
          code: body.code,
          title: body.title,
        },
      });

      res.status(201).json(doc);
    } catch (err: any) {
      return serverError(res, logger, 'loading coverage', err);
    }
  }
);

// Author a DRAFT PMCF plan (MDR Annex XIV Part B §6.2) for the program, derived
// from the supplied device context (or a related CER report). Persists through
// the same createDocument lifecycle in `draft` status and returns the document
// plus its conformance validation — it never approves, locks, or asserts
// sufficiency. The sponsor must specialise and approve it.
postMarketRouter.post(
  '/programs/:programId/documents/pmcf-plan/generate',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const body = req.body ?? {};
    const relatedCerReportId =
      body.relatedCerReportId != null ? Number(body.relatedCerReportId) : undefined;
    if (relatedCerReportId != null && !Number.isInteger(relatedCerReportId)) {
      return res.status(422).json({ error: 'relatedCerReportId must be an integer' });
    }
    if (!body.deviceName && relatedCerReportId == null) {
      return res.status(422).json({ error: 'deviceName or relatedCerReportId is required' });
    }
    if (body.regulation && body.regulation !== 'MDR' && body.regulation !== 'IVDR') {
      return res.status(422).json({ error: 'regulation must be MDR or IVDR' });
    }
    const createdBy = userIdFromReq(req) ?? 'system';
    try {
      const result = await generatePmcfPlan({
        organizationId: orgId,
        programId: String(req.params.programId),
        createdBy,
        deviceName: typeof body.deviceName === 'string' ? body.deviceName : '',
        deviceClass: typeof body.deviceClass === 'string' ? body.deviceClass : null,
        regulation: body.regulation,
        relatedCerReportId,
        title: typeof body.title === 'string' ? body.title : undefined,
      });

      void auditService.logAction({
        tenantId: orgId,
        userId: createdBy,
        action: 'post_market.pmcf_plan.generate',
        resourceType: 'post_market_document',
        resourceId: String(result.document.id),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        details: {
          programId: req.params.programId,
          documentId: result.document.id,
          version: result.document.version,
          relatedCerReportId: relatedCerReportId ?? null,
        },
      });

      res.status(201).json(result);
    } catch (err: any) {
      if (err?.code === 'PMCF_NO_DEVICE') {
        return res.status(422).json({ error: err.message });
      }
      return serverError(res, logger, 'loading coverage', err);
    }
  }
);

// Author a DRAFT post-market document of any supported type (pms_plan,
// pms_report, pmcf_plan, pmcf_evaluation, psur, sscp) from device/CER context.
// Persists in `draft` via the same lifecycle and returns the document plus its
// conformance validation. Never approves, locks, or asserts sufficiency.
postMarketRouter.post(
  '/programs/:programId/documents/:documentType/generate',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const documentType = String(req.params.documentType).replace(/-/g, '_') as PostMarketDocumentType;
    if (!AUTHORABLE_DOCUMENT_TYPES.includes(documentType)) {
      return res
        .status(422)
        .json({ error: `documentType must be one of: ${AUTHORABLE_DOCUMENT_TYPES.join(', ')}` });
    }
    const body = req.body ?? {};
    const relatedCerReportId =
      body.relatedCerReportId != null ? Number(body.relatedCerReportId) : undefined;
    if (relatedCerReportId != null && !Number.isInteger(relatedCerReportId)) {
      return res.status(422).json({ error: 'relatedCerReportId must be an integer' });
    }
    if (!body.deviceName && relatedCerReportId == null) {
      return res.status(422).json({ error: 'deviceName or relatedCerReportId is required' });
    }
    if (body.regulation && body.regulation !== 'MDR' && body.regulation !== 'IVDR') {
      return res.status(422).json({ error: 'regulation must be MDR or IVDR' });
    }
    const parseDate = (v: unknown): Date | undefined => {
      if (v == null) return undefined;
      const d = new Date(v as string);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const createdBy = userIdFromReq(req) ?? 'system';
    try {
      const result = await authorPostMarketDocument({
        organizationId: orgId,
        programId: String(req.params.programId),
        createdBy,
        documentType,
        deviceName: typeof body.deviceName === 'string' ? body.deviceName : undefined,
        deviceClass: typeof body.deviceClass === 'string' ? body.deviceClass : null,
        regulation: body.regulation,
        relatedCerReportId,
        title: typeof body.title === 'string' ? body.title : undefined,
        reportingPeriodStart: parseDate(body.reportingPeriodStart),
        reportingPeriodEnd: parseDate(body.reportingPeriodEnd),
      });

      void auditService.logAction({
        tenantId: orgId,
        userId: createdBy,
        action: 'post_market.document.generate',
        resourceType: 'post_market_document',
        resourceId: String(result.document.id),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        details: {
          programId: req.params.programId,
          documentType,
          documentId: result.document.id,
          version: result.document.version,
          relatedCerReportId: relatedCerReportId ?? null,
        },
      });

      res.status(201).json(result);
    } catch (err: any) {
      if (err?.code === 'PM_NO_DEVICE' || err?.code === 'PM_BAD_TYPE') {
        return res.status(422).json({ error: err.message });
      }
      return serverError(res, logger, 'loading coverage', err);
    }
  }
);

// Honest post-market documentation status for a program: per-type presence,
// lifecycle status and validation-gate result, with required-vs-optional driven
// by device class. Not a fabricated readiness score.
postMarketRouter.get(
  '/programs/:programId/documentation-status',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const deviceClass = typeof req.query.deviceClass === 'string' ? req.query.deviceClass : null;
    const regulation = req.query.regulation === 'IVDR' ? 'IVDR' : 'MDR';
    try {
      const report = await getPostMarketDocStatus(
        orgId,
        String(req.params.programId),
        deviceClass,
        regulation
      );
      res.json(report);
    } catch (err: any) {
      return serverError(res, logger, 'loading coverage', err);
    }
  }
);

async function loadDocOrFail(
  req: Request,
  res: Response
): Promise<{ orgId: number; doc: NonNullable<Awaited<ReturnType<typeof getDocument>>> } | null> {
  const orgId = getOrgId(req);
  if (orgId === null) {
    res.status(403).json({ error: 'Organization context required' });
    return null;
  }
  const doc = await getDocument(orgId, String(req.params.documentId));
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return null;
  }
  return { orgId, doc };
}

postMarketRouter.get('/documents/:documentId', async (req: Request, res: Response) => {
  const ctx = await loadDocOrFail(req, res);
  if (!ctx) return;
  res.json(ctx.doc);
});

postMarketRouter.patch('/documents/:documentId', async (req: Request, res: Response) => {
  const ctx = await loadDocOrFail(req, res);
  if (!ctx) return;
  try {
    const userIdRaw = (req as any).user?.id;
    const updatedBy =
      typeof userIdRaw === 'string' ? userIdRaw : userIdRaw != null ? String(userIdRaw) : 'system';
    const updated = await updateDocument(ctx.orgId, String(req.params.documentId), {
      ...req.body,
      updatedBy,
    });
    if (!updated) return res.status(404).json({ error: 'Document not found' });

    void auditService.logAction({
      tenantId: ctx.orgId,
      userId: updatedBy,
      action: 'post_market.document.update',
      resourceType: 'post_market_document',
      resourceId: String(req.params.documentId),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: {
        fieldsChanged: Object.keys(req.body ?? {}),
      },
    });

    res.json(updated);
  } catch (err: any) {
    if (err?.code === 'PM_LOCKED') return res.status(409).json({ error: 'Document is locked' });
    return serverError(res, logger, 'loading coverage', err);
  }
});

postMarketRouter.post('/documents/:documentId/validate', async (req: Request, res: Response) => {
  const ctx = await loadDocOrFail(req, res);
  if (!ctx) return;
  const result = validateDocument(ctx.doc);

  void auditService.logAction({
    tenantId: ctx.orgId,
    userId: userIdFromReq(req) ?? undefined,
    action: 'post_market.document.validate',
    resourceType: 'post_market_document',
    resourceId: String(req.params.documentId),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] as string | undefined,
    details: {
      passed: (result as any)?.valid ?? null,
      findings: Array.isArray((result as any)?.findings) ? (result as any).findings.length : null,
    },
  });

  res.json(result);
});

postMarketRouter.post('/documents/:documentId/approve', async (req: Request, res: Response) => {
  const ctx = await loadDocOrFail(req, res);
  if (!ctx) return;
  const userIdRaw = (req as any).user?.id;
  const approvedBy =
    typeof userIdRaw === 'string' ? userIdRaw : userIdRaw != null ? String(userIdRaw) : 'system';
  const signatureId = typeof req.body?.signatureId === 'string' ? req.body.signatureId : undefined;
  try {
    const result = await approveDocument({
      organizationId: ctx.orgId,
      documentId: ctx.doc.id,
      approvedBy,
      signatureId,
    });
    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return res.status(404).json({ error: 'Document not found' });
      if (result.error === 'ALREADY_LOCKED') return res.status(409).json({ error: 'Already locked' });
      if (result.error === 'GATE_BLOCKED') {
        // A blocked approval is itself a Part 11 event — record it.
        void auditService.logAction({
          tenantId: ctx.orgId,
          userId: approvedBy,
          action: 'post_market.document.approve.blocked',
          resourceType: 'post_market_document',
          resourceId: ctx.doc.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] as string | undefined,
          details: { reason: 'GATE_BLOCKED', signatureId: signatureId ?? null },
        });
        return res.status(409).json({
          error: 'Validation gate blocked approval',
          validation: result.validation,
        });
      }
    } else {
      void auditService.logAction({
        tenantId: ctx.orgId,
        userId: approvedBy,
        action: 'post_market.document.approve',
        resourceType: 'post_market_document',
        resourceId: ctx.doc.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        details: {
          signatureId: signatureId ?? null,
        },
      });
    }
    res.json(result);
  } catch (err: any) {
    return serverError(res, logger, 'loading coverage', err);
  }
});

postMarketRouter.post(
  '/documents/:documentId/supersede',
  async (req: Request, res: Response) => {
    const ctx = await loadDocOrFail(req, res);
    if (!ctx) return;
    const userIdRaw = (req as any).user?.id;
    const createdBy =
      typeof userIdRaw === 'string' ? userIdRaw : userIdRaw != null ? String(userIdRaw) : 'system';
    try {
      const newDoc = await supersedeDocument(ctx.orgId, ctx.doc.id, {
        newTitle: typeof req.body?.newTitle === 'string' ? req.body.newTitle : undefined,
        createdBy,
      });
      if (!newDoc) return res.status(404).json({ error: 'Document not found' });

      void auditService.logAction({
        tenantId: ctx.orgId,
        userId: createdBy,
        action: 'post_market.document.supersede',
        resourceType: 'post_market_document',
        resourceId: ctx.doc.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        details: {
          newDocumentId: (newDoc as any)?.id ?? null,
          newTitle: req.body?.newTitle ?? null,
        },
      });

      res.status(201).json(newDoc);
    } catch (err: any) {
      return serverError(res, logger, 'loading coverage', err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PMCF enrolment (MDR Annex XIV Part B) — the feed behind the PMS/PMCF tab
// ─────────────────────────────────────────────────────────────────────────────
//
// The PMCF plan generator and the documentation-status view were already live;
// what had no backend at all was the actual follow-up activity — how many
// subjects are enrolled, against what target, as of when. That is the evidence
// a notified body reads the post-market section of a CER against, so without it
// the tab could describe a plan but never its execution.
//
// The service refuses rather than guesses in three places, and these routes
// carry those refusals through instead of smoothing them: an undated enrolment
// count, a programme outside the caller's organization, and a database without
// the migration applied. The last one answers 503 with the reason — an empty
// list would read as "no PMCF activity", which is a claim about the programme
// rather than about the database.

/** Parse an optional ISO date field, distinguishing absent from unparseable. */
function optionalDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new Error(`${field} is not a valid date`);
  return d;
}

postMarketRouter.get(
  '/programs/:programId/pmcf-enrollment',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const programId = String(req.params.programId);
    try {
      const records = await listPmcfEnrollmentRecords(orgId, programId);
      // Summarised from the SAME array that is returned, so the table and the
      // totals cannot disagree — a summary computed by a second query can.
      res.json({ programId, records, count: records.length, summary: summariseRecords(programId, records) });
    } catch (err: any) {
      if (isPmcfEnrollmentStoreAbsent(err) || err?.message === STORE_ABSENT) {
        return res.status(503).json({ error: 'PMCF enrolment unavailable', detail: STORE_ABSENT });
      }
      return serverError(res, logger, 'loading coverage', err);
    }
  }
);

postMarketRouter.post(
  '/programs/:programId/pmcf-enrollment',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const programId = String(req.params.programId);
    const body = req.body ?? {};

    // An unattributed post-market record is refused, not recorded as 'system':
    // the activity is regulatory evidence and it needs an author.
    const actorId = userIdFromReq(req);
    if (!actorId) {
      return res.status(403).json({ error: 'An identified user is required to record PMCF activity' });
    }
    if (!body.activityCode || !body.title) {
      return res.status(422).json({ error: 'activityCode and title are required' });
    }
    if (!PMCF_ACTIVITY_KINDS.includes(body.activityKind)) {
      return res.status(422).json({ error: `activityKind must be one of: ${PMCF_ACTIVITY_KINDS.join(', ')}` });
    }
    if (body.status !== undefined && !PMCF_ACTIVITY_STATUSES.includes(body.status)) {
      return res.status(422).json({ error: `status must be one of: ${PMCF_ACTIVITY_STATUSES.join(', ')}` });
    }

    try {
      const result = await upsertPmcfEnrollmentRecord({
        organizationId: orgId,
        programId,
        actorId,
        activityCode: String(body.activityCode),
        activityKind: body.activityKind as PmcfActivityKind,
        title: String(body.title),
        status: body.status as PmcfActivityStatus | undefined,
        pmcfPlanDocumentId: body.pmcfPlanDocumentId ?? undefined,
        primaryEndpoint: body.primaryEndpoint ?? undefined,
        sitesCount: body.sitesCount ?? undefined,
        targetEnrollment: body.targetEnrollment ?? undefined,
        enrolledCount: body.enrolledCount ?? undefined,
        enrollmentAsOf: optionalDate(body.enrollmentAsOf, 'enrollmentAsOf'),
        dataCollectionThrough: optionalDate(body.dataCollectionThrough, 'dataCollectionThrough'),
        notes: body.notes ?? undefined,
      });

      // The service deliberately writes no audit row itself; it returns the
      // superseded row so the before/after lands in the chained entry here.
      void auditService.logAction({
        tenantId: orgId,
        userId: actorId,
        action: 'post_market.pmcf_enrollment.upsert',
        resourceType: 'pmcf_enrollment_record',
        resourceId: String(result.record.id),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string | undefined,
        details: {
          programId,
          activityCode: result.record.activityCode,
          created: result.superseded === null,
          before: result.superseded
            ? {
                status: result.superseded.status,
                enrolledCount: result.superseded.enrolledCount,
                targetEnrollment: result.superseded.targetEnrollment,
              }
            : null,
          after: {
            status: result.record.status,
            enrolledCount: result.record.enrolledCount,
            targetEnrollment: result.record.targetEnrollment,
          },
        },
      });

      res.status(result.superseded === null ? 201 : 200).json(result);
    } catch (err: any) {
      if (isPmcfEnrollmentStoreAbsent(err) || err?.message === STORE_ABSENT) {
        return res.status(503).json({ error: 'PMCF enrolment unavailable', detail: STORE_ABSENT });
      }
      // The service's own validation refusals (undated count, zero target,
      // programme outside the org) are the caller's fault, not the server's.
      res.status(422).json({ error: 'Record rejected', detail: err?.message });
    }
  }
);

export { postMarketRouter };
export default router;
