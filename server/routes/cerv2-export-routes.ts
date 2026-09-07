/**
 * Unified CERV2 Export Routes  (Phase 7.4 – Enhanced)
 *
 * POST /api/cerv2/export/pdf   – single combined PDF for any doc type
 * POST /api/cerv2/export/docx  – single combined DOCX for any doc type
 * POST /api/cerv2/export/zip   – full submission pack (per-section PDFs + attachments)
 * POST /api/cerv2/export/ai-to-editor – convert AI section map → TipTap editor JSON
 * GET  /api/cerv2/export/health               – health check
 *
 * Every route that emits a document renders REAL authored content behind
 * authMiddleware + requireEditorAccess. The four GET /sample/:docType* routes
 * that rendered placeholder documents are gone — see the note where they were.
 *
 * Anchor contract (matches 510k-estar-routes.ts): the body carries either the
 * legacy numeric `projectId` (PM spine, governed artifact-registry placement)
 * or `meta.ident` (numeric fda510kProjects id / regulatoryPrograms UUID /
 * program code, resolved org-scoped). UUID/code programs have no PM-spine row
 * yet, so their exports are delivered + audit-logged with a SHA-256 and
 * explicitly reported as registry-unplaced. `useProjectContent: true` assembles
 * the document from the org's authored sections server-side instead of a
 * client-supplied payload.
 */

import { Router, Request, Response } from 'express';
import archiver from 'archiver';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { and, eq } from 'drizzle-orm';
import { stylePacks } from '../export/stylePacks/config';
import {
  renderPdfBuffersFor510k,
  renderPdfBuffersForPma,
  renderPdfBuffersForCer,
  renderCombinedPdf,
  renderCombinedDocx,
} from '../export/renderers';
import { PassThrough } from 'stream';
import { authMiddleware } from '../auth';
import {
  createGovernedExportConsequence,
  createAuditedUnplacedExport,
} from '../services/export/governedExportConsequence';
import {
  applyExportGovernanceHeaders,
  evaluateExportGovernance,
} from '../services/export/exportReviewGate';
import type { ExportSourceType } from '../services/export/governedExportConsequence';
import { requestDb } from '../db/requestDb';
import { fda510kProjects, projects } from '../../shared/schema';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { resolveProgramProjectAnchor } from '../services/c2c/program-project-anchor';
import {
  loadAuthoredDeviceSections,
  sectionsToEditorJson,
} from '../services/pathway-engines/estar/estar-content-leaves';

import { createScopedLogger } from '../utils/logger.js';
import { requireEditorAccess } from '../middleware/orgMembership';

const logger = createScopedLogger('cerv2-export-routes');

const router = Router();

// ── Rate limiting for export endpoints ──────────────────────────────────────
const exportRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10, // 10 exports per minute per user
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many export requests — please wait before trying again.' },
  keyGenerator: (req: any) => {
    const userId = req.userId || req.user?.id || 'anon';
    const orgId = req.tenantId || req.tenantContext?.organizationId || 'unknown';
    return `cerv2-export:${orgId}:${userId}`;
  },
});

router.use(['/pdf', '/docx', '/zip'], exportRateLimiter);

// isSampleExportEnabled() and denySampleExportRoute() were removed with the
// routes they guarded. ENABLE_CERV2_SAMPLE_EXPORTS is now read nowhere and can
// be dropped from any environment that still sets it.

// ── Auth guard ─────────────────────────────────────────────────────────────────

// ── Validation schemas ─────────────────────────────────────────────────────────
const validDocTypes = ['cerv2_510k', 'cerv2_pma', 'cerv2_cer'] as const;

const editorContentSchema = z.object({
  type: z.literal('doc'),
  content: z.array(z.any()).min(1, 'Editor content must have at least one node'),
});

/**
 * The export anchor accepts either the legacy numeric PM-spine projectId or a
 * program identifier (`meta.ident`: numeric fda510kProjects.id,
 * regulatoryPrograms UUID, or program code) — the same 3-way contract as
 * server/routes/510k-estar-routes.ts. At least one is required so every export
 * resolves to a real, org-owned project/program before anything renders.
 * Content may be supplied inline (TipTap doc) or assembled server-side from
 * the org's authored sections via `useProjectContent`.
 */
const exportObjectSchema = z.object({
  docType: z.enum(validDocTypes),
  projectId: z.coerce.number().int().positive().optional(),
  content: editorContentSchema.optional(),
  /** Assemble content from the org's authored cerv2_510k_sections (the table
   *  spans 510(k)/PMA/CER despite its name) instead of a client payload. */
  useProjectContent: z.boolean().optional(),
  /** Narrow useProjectContent to one document's sections when known. */
  documentId: z.coerce.number().int().positive().optional(),
  meta: z
    .object({
      id: z.string().optional(),
      title: z.string().optional(),
      /** Program ident resolved org-scoped server-side (see above). */
      ident: z.string().min(1).optional(),
    })
    .optional(),
});

/** Shared refinement: an anchor and a content source are both required. */
const exportRefinement = (
  b: Pick<z.infer<typeof exportObjectSchema>, 'projectId' | 'meta' | 'content' | 'useProjectContent'>,
  ctx: z.RefinementCtx,
) => {
  if (b.projectId === undefined && b.meta?.ident === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'projectId or meta.ident is required' });
  }
  if (b.content === undefined && b.useProjectContent !== true) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'content or useProjectContent is required' });
  }
};

const exportSchema = exportObjectSchema.superRefine(exportRefinement);

const zipSchema = exportObjectSchema
  .extend({
    attachments: z
      .array(
        z.object({
          filename: z.string().min(1).max(255),
          buffer: z.string().min(1).max(10_485_760), // ~10 MB base64 ≈ 7.5 MB decoded
          mimeType: z.string().max(127).optional(),
        })
      )
      .max(20)
      .optional(),
  })
  .superRefine(exportRefinement);

// ── Project / program anchor resolution (ported from 510k-estar-routes) ───────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProjectAnchor {
  /** Numeric PM-spine project id when one exists — required for artifact-registry placement. */
  anchorProjectId: number | null;
  /** The resolved regulatoryPrograms UUID when the ident named a program. */
  programUuid: string | null;
  title: string | null;
}

/**
 * Resolve the export's anchor, org-scoped: numeric → fda510kProjects.id (GA
 * path, carries the numeric anchor the artifact registry needs), UUID →
 * regulatoryPrograms.id, else → regulatoryPrograms.code. Returns null when
 * nothing in this org matches — the caller must 404, never export against an
 * unresolved project. A UUID/code program resolves its numeric anchor through
 * `projects.regulatory_program_id` (Document Identity Contract slice C1), which
 * the artifact registry needs — `concept2cure_artifacts.project_id` is an
 * integer FK to `projects.id` and predates the program spine. Where no anchor
 * exists the export is still delivered + audit-logged but explicitly not
 * registry-placed (same contract as the estar /build handler).
 */
async function resolveProjectAnchor(
  req: Request,
  orgId: number,
  ident: string,
): Promise<ProjectAnchor | null> {
  // Resolved once, up front, and deliberately OUTSIDE the try blocks below: a
  // missing tenant scope is a wiring fault, not a miss, and must not be caught
  // by the fall-through and reported to the caller as "project not found".
  const rdb = requestDb(req);

  if (/^\d+$/.test(ident)) {
    try {
      const [row] = await rdb
        .select({ id: fda510kProjects.id, deviceName: fda510kProjects.deviceName })
        .from(fda510kProjects)
        .where(and(eq(fda510kProjects.id, Number(ident)), eq(fda510kProjects.organizationId, orgId)))
        .limit(1);
      if (row) return { anchorProjectId: row.id, programUuid: null, title: row.deviceName ?? null };
    } catch {
      /* fall through */
    }
    return null;
  }

  const byUuid = UUID_RE.test(ident);
  try {
    const [row] = await rdb
      .select({ id: regulatoryPrograms.id, name: regulatoryPrograms.name })
      .from(regulatoryPrograms)
      .where(
        and(
          byUuid ? eq(regulatoryPrograms.id, ident) : eq(regulatoryPrograms.code, ident),
          eq(regulatoryPrograms.organizationId, orgId),
        ),
      )
      .limit(1);
    if (row) {
      // Ask for the C1 anchor before degrading. Null is a fact about the data
      // — a program created before C1, an intake that skipped it for one of its
      // stated reasons, or a database without the migration — and keeps the
      // audited-unplaced path exactly as it was.
      const anchorProjectId = await resolveProgramProjectAnchor(rdb, {
        programId: row.id,
        orgId,
        context: 'cerv2-export',
      });
      return { anchorProjectId, programUuid: row.id, title: row.name ?? null };
    }
  } catch {
    /* fall through */
  }
  return null;
}

interface ResolvedExport {
  anchorProjectId: number | null;
  programUuid: string | null;
  content: z.infer<typeof editorContentSchema>;
}

/**
 * Shared front half of the three export handlers: resolve the anchor (legacy
 * numeric projectId passes through untouched; meta.ident resolves org-scoped
 * or 404s) and materialize content (inline payload, or server-side assembly
 * from the org's authored sections). Sends the error response and returns
 * null when the export must not proceed.
 */
async function resolveExportRequest(
  req: Request,
  res: Response,
  data: z.infer<typeof exportObjectSchema>,
): Promise<ResolvedExport | null> {
  const orgId = (req as any).resolvedOrganizationId as number;

  let anchorProjectId: number | null = data.projectId ?? null;
  let programUuid: string | null = null;

  // A caller-supplied numeric projectId must be proved to belong to the caller's
  // org before it can anchor a placement.
  //
  // It previously went straight through: `meta.ident` was resolved org-scoped
  // (404 outside the org) but `data.projectId` was not checked at all, so a
  // caller could file their own export into ANOTHER TENANT'S project lineage.
  // That was dormant only because the registry writeback named a column no
  // schema defines and therefore 500'd before reaching the insert — the same
  // defect this change fixes. Reconciling the column list without this check
  // would have turned a dead bug into a live cross-tenant write.
  //
  // `projects` is the right table to check: concept2cure_artifacts.project_id
  // carries a FOREIGN KEY to projects.id, so this is simultaneously the tenant
  // guard and the guarantee that placement cannot fail at the constraint.
  if (anchorProjectId !== null) {
    const [owned] = await requestDb(req)
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, anchorProjectId), eq(projects.organizationId, orgId)))
      .limit(1);
    if (!owned) {
      // Same shape as the ident miss: it must not distinguish "not yours" from
      // "does not exist".
      res.status(404).json({ error: 'Project not found in your organization' });
      return null;
    }
  }

  if (data.meta?.ident) {
    const anchor = await resolveProjectAnchor(req, orgId, data.meta.ident);
    if (!anchor) {
      res.status(404).json({ error: 'Project not found in your organization' });
      return null;
    }
    if (anchor.anchorProjectId !== null) anchorProjectId = anchor.anchorProjectId;
    programUuid = anchor.programUuid;
  }

  let content = data.content;
  if (content === undefined && data.useProjectContent) {
    const sections = await loadAuthoredDeviceSections(
      orgId,
      data.documentId !== undefined ? { documentId: data.documentId } : {}
    );
    if (sections.length === 0) {
      res.status(422).json({
        error: 'NO_AUTHORED_CONTENT',
        message:
          'No authored sections found for this organization' +
          (data.documentId !== undefined ? ` (document ${data.documentId})` : '') +
          ' — author section content before exporting.',
      });
      return null;
    }
    content = sectionsToEditorJson(sections) as z.infer<typeof editorContentSchema>;
  }
  if (content === undefined) {
    // Unreachable behind the schema refinement; keep the route fail-closed anyway.
    res.status(400).json({ error: 'Document has no content to export' });
    return null;
  }

  // Validate content has substantive nodes (not just empty paragraphs)
  const substantiveNodes = content.content.filter(
    (n: any) => n.type !== 'paragraph' || (n.content && n.content.length > 0)
  );
  if (substantiveNodes.length === 0) {
    res.status(400).json({ error: 'Document has no content to export' });
    return null;
  }

  return { anchorProjectId, programUuid, content };
}

/**
 * Delivery path for program-spine (UUID) anchors with no PM-spine project row:
 * the artifact registry cannot place the export yet, so deliver the file and
 * audit-log it with its SHA-256 (provenance preserved), saying plainly that
 * registry placement is pending rather than pretending it happened. The ONE
 * implementation is `createAuditedUnplacedExport` (shared with the eSTAR and
 * technical-file routes); this is only the res.json adapter.
 */
async function respondAuditedUnplaced(
  req: Request,
  res: Response,
  opts: {
    sourceType: ExportSourceType;
    backendRoute: string;
    programUuid: string | null;
    fallbackResourceId: string;
    filename: string;
    mimeType: string;
    buffer: Buffer;
    metadata: Record<string, unknown>;
  }
) {
  const body = await createAuditedUnplacedExport({
    organizationId: (req as any).resolvedOrganizationId,
    userId: getUserId(req),
    sourceType: opts.sourceType,
    backendRoute: opts.backendRoute,
    resourceType: 'cerv2_export',
    resourceId: opts.programUuid ?? opts.fallbackResourceId,
    programUuid: opts.programUuid,
    filename: opts.filename,
    mimeType: opts.mimeType,
    buffer: opts.buffer,
    metadata: opts.metadata,
  });
  return res.status(200).json(body);
}

const sanitizeFilename = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');

/**
 * Thin adapter over the canonical export review gate
 * (server/services/export/exportReviewGate.ts). All decision logic — schema,
 * reviewer-attribution rule (INCOMPLETE_HUMAN_REVIEW), and the strict
 * environment gate (HUMAN_REVIEW_REQUIRED) — lives there; this only renders a
 * rejection into this router's flat `{ error, message?, details? }` bodies and
 * adds the CERV2-specific governance headers.
 */
function validateExportGovernance(req: Request, res: Response) {
  const evaluation = evaluateExportGovernance(req.body?.governance);
  if (!evaluation.ok) {
    if (evaluation.code === 'VALIDATION_ERROR') {
      res.status(400).json({ error: 'Invalid governance payload', details: evaluation.details });
    } else {
      res.status(evaluation.status).json({
        error: evaluation.code,
        message: evaluation.message,
        details: evaluation.details,
      });
    }
    return null;
  }

  applyExportGovernanceHeaders(res, evaluation.governance, {
    'X-Concept2Cure-Review-Notice': 'Human review required for regulated use',
    'X-Concept2Cure-Governance-Persistence': 'governed',
  });
  return evaluation.governance;
}

function resolveCtdPlacement(docType: (typeof validDocTypes)[number]) {
  if (docType === 'cerv2_510k') return { ctdSection: 'm1.5', suggestedPlacement: 'Module 1 / 510(k) dossier package' };
  if (docType === 'cerv2_pma') return { ctdSection: 'm2.5', suggestedPlacement: 'Module 2 / PMA summaries' };
  return { ctdSection: 'm5.0', suggestedPlacement: 'Module 5 / Clinical Evaluation Report' };
}

function getUserId(req: Request): number {
  const raw = (req as any).userId ?? (req as any).user?.id;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Valid numeric userId is required for governed export');
  }
  return parsed;
}

async function buildZipBuffer(
  docType: (typeof validDocTypes)[number],
  content: z.infer<typeof editorContentSchema>,
  title: string,
  attachments: Array<{ filename: string; buffer: string }>
): Promise<Buffer> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const pass = new PassThrough();
  const chunks: Buffer[] = [];
  let archiveError: Error | null = null;

  pass.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  archive.on('error', err => {
    archiveError = err as Error;
    pass.destroy(err);
  });

  archive.pipe(pass);

  // Generate per-section PDFs based on doc type
  if (docType === 'cerv2_510k') {
    const pack = stylePacks['510k_v1'];
    const pdfs = await renderPdfBuffersFor510k(content, pack);
    archive.append(pdfs.coverLetter, { name: '01_CoverLetter.pdf' });
    archive.append(pdfs.summary, { name: '02_510kSummary.pdf' });
    archive.append(pdfs.deviceDescription, { name: '03_DeviceDescription.pdf' });
    archive.append(pdfs.seDiscussion, { name: '04_SE_Discussion.pdf' });
    archive.append(pdfs.performanceTesting, { name: '05_PerformanceTesting.pdf' });
    archive.append(pdfs.labeling, { name: '06_Labeling.pdf' });
  } else if (docType === 'cerv2_pma') {
    const pack = stylePacks['pma_v1'];
    const pdfs = await renderPdfBuffersForPma(content, pack);
    archive.append(pdfs.summaryInfo, { name: '01_SummaryAndGeneralInfo.pdf' });
    archive.append(pdfs.nonclinical, { name: '02_NonclinicalStudies.pdf' });
    archive.append(pdfs.clinical, { name: '03_ClinicalInvestigations.pdf' });
    archive.append(pdfs.manufacturing, { name: '04_ManufacturingQA.pdf' });
    archive.append(pdfs.labeling, { name: '05_Labeling.pdf' });
    archive.append(pdfs.riskBenefit, { name: '06_RiskBenefitDetermination.pdf' });
    archive.append(pdfs.postApproval, { name: '07_PostApprovalPMS.pdf' });
  } else {
    const pack = stylePacks['cer_mdr_v1'];
    const pdfs = await renderPdfBuffersForCer(content, pack);
    archive.append(pdfs.stateOfArt, { name: '01_StateOfTheArt.pdf' });
    archive.append(pdfs.devicePurpose, { name: '02_DeviceIntendedPurpose.pdf' });
    archive.append(pdfs.clinicalDataSet, { name: '03_ClinicalDataSet.pdf' });
    archive.append(pdfs.appraisal, { name: '04_CriticalAppraisal.pdf' });
    archive.append(pdfs.benefitRisk, { name: '05_BenefitRiskDetermination.pdf' });
    archive.append(pdfs.gsprMapping, { name: '06_GSPRMapping.pdf' });
    archive.append(pdfs.pmsPlan, { name: '07_PMSPlanPMCF.pdf' });
    archive.append(pdfs.conclusions, { name: '08_ConclusionsRecommendations.pdf' });
  }

  // Combined full-document PDF and DOCX
  const [combinedPdf, combinedDocx] = await Promise.all([
    renderCombinedPdf(docType, content),
    renderCombinedDocx(docType, content),
  ]);
  archive.append(combinedPdf, { name: `${title}_Combined.pdf` });
  archive.append(combinedDocx, { name: `${title}_Combined.docx` });

  // Attachments
  for (const att of attachments) {
    const buf = Buffer.from(att.buffer, 'base64');
    archive.append(buf, { name: `attachments/${sanitizeFilename(att.filename)}` });
  }

  // Register the end/error listener BEFORE finalize() so the promise
  // captures the 'end' event regardless of how quickly the archive
  // flushes. Earlier ordering (finalize then await new Promise) had a
  // race: under fast stream completion (and consistently under vitest
  // mocks) 'end' fired before the listener was attached, leaving the
  // promise pending forever — surfaced as the cerv2-export ZIP test
  // timing out at 10s.
  const finalized = new Promise<void>((resolve, reject) => {
    pass.on('end', () => resolve());
    pass.on('error', reject);
  });
  await archive.finalize();
  await finalized;

  if (archiveError) throw archiveError;
  return Buffer.concat(chunks);
}

// ── POST /pdf ──────────────────────────────────────────────────────────────────
router.post('/pdf', authMiddleware, requireEditorAccess, async (req: Request, res: Response) => {
  try {
    const validation = exportSchema.safeParse(req.body);
    if (!validation.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request', details: validation.error.flatten() });
    }

    const { docType, meta } = validation.data;
    if (!validateExportGovernance(req, res)) return;

    const resolved = await resolveExportRequest(req, res, validation.data);
    if (!resolved) return;
    const { content } = resolved;

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderCombinedPdf(docType, content);
    } catch (renderErr: any) {
      logger.error('PDF render failed', { err: renderErr instanceof Error ? renderErr.message : String(renderErr) });
      // renderErr.message is the renderer's own text — font paths, temp-file
      // locations, spawn errors. The stable code stays; the detail goes to the log.
      logger.error('PDF rendering failed', {
        err: renderErr instanceof Error ? renderErr.message : String(renderErr),
      });
      return res.status(500).json({
        error: 'PDF rendering failed',
        message: 'The document could not be converted to PDF. The problem has been logged.',
      });
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      return res.status(500).json({ error: 'PDF rendering produced empty output' });
    }

    const filename = sanitizeFilename(meta?.title || `${docType}_export`) + '.pdf';
    const placement = resolveCtdPlacement(docType);
    const exportMetadata = {
      docType,
      format: 'pdf',
      programId: resolved.programUuid ?? undefined,
    };

    if (resolved.anchorProjectId === null) {
      return respondAuditedUnplaced(req, res, {
        sourceType: 'export_pdf',
        backendRoute: 'POST /api/cerv2/export/pdf',
        programUuid: resolved.programUuid,
        fallbackResourceId: meta?.ident ?? meta?.id ?? docType,
        filename,
        mimeType: 'application/pdf',
        buffer: pdfBuffer,
        metadata: exportMetadata,
      });
    }

    const consequence = await createGovernedExportConsequence({
      organizationId: (req as any).resolvedOrganizationId,
      projectId: resolved.anchorProjectId,
      userId: getUserId(req),
      title: meta?.title || `${docType} PDF Export`,
      contentForArtifact: JSON.stringify(content),
      sourceType: 'export_pdf',
      ctdSection: placement.ctdSection,
      suggestedPlacement: placement.suggestedPlacement,
      backendRoute: 'POST /api/cerv2/export/pdf',
      binaryOutput: pdfBuffer,
      mimeType: 'application/pdf',
      filename,
      metadata: exportMetadata,
    });

    return res.status(200).json(consequence);
  } catch (err: any) {
    logger.error('PDF error', { err: err instanceof Error ? err.message : String(err) });
    if (!res.headersSent) {
      res.status(500).json({
        error: 'GOVERNED_EXPORT_FAILED',
        message: err.message || 'Governed PDF export failed before consequence persistence',
      });
    }
  }
});

// ── POST /docx ─────────────────────────────────────────────────────────────────
router.post('/docx', authMiddleware, requireEditorAccess, async (req: Request, res: Response) => {
  try {
    const validation = exportSchema.safeParse(req.body);
    if (!validation.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request', details: validation.error.flatten() });
    }

    const { docType, meta } = validation.data;
    if (!validateExportGovernance(req, res)) return;

    const resolved = await resolveExportRequest(req, res, validation.data);
    if (!resolved) return;
    const { content } = resolved;

    let docxBuffer: Buffer;
    try {
      docxBuffer = await renderCombinedDocx(docType, content);
    } catch (renderErr: any) {
      logger.error('DOCX render failed', { err: renderErr instanceof Error ? renderErr.message : String(renderErr) });
      logger.error('DOCX rendering failed', {
        err: renderErr instanceof Error ? renderErr.message : String(renderErr),
      });
      return res.status(500).json({
        error: 'DOCX rendering failed',
        message: 'The document could not be converted to DOCX. The problem has been logged.',
      });
    }

    if (!docxBuffer || docxBuffer.length === 0) {
      return res.status(500).json({ error: 'DOCX rendering produced empty output' });
    }

    const filename = sanitizeFilename(meta?.title || `${docType}_export`) + '.docx';
    const placement = resolveCtdPlacement(docType);
    const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const exportMetadata = {
      docType,
      format: 'docx',
      programId: resolved.programUuid ?? undefined,
    };

    if (resolved.anchorProjectId === null) {
      return respondAuditedUnplaced(req, res, {
        sourceType: 'export_docx',
        backendRoute: 'POST /api/cerv2/export/docx',
        programUuid: resolved.programUuid,
        fallbackResourceId: meta?.ident ?? meta?.id ?? docType,
        filename,
        mimeType: docxMime,
        buffer: docxBuffer,
        metadata: exportMetadata,
      });
    }

    const consequence = await createGovernedExportConsequence({
      organizationId: (req as any).resolvedOrganizationId,
      projectId: resolved.anchorProjectId,
      userId: getUserId(req),
      title: meta?.title || `${docType} DOCX Export`,
      contentForArtifact: JSON.stringify(content),
      sourceType: 'export_docx',
      ctdSection: placement.ctdSection,
      suggestedPlacement: placement.suggestedPlacement,
      backendRoute: 'POST /api/cerv2/export/docx',
      binaryOutput: docxBuffer,
      mimeType: docxMime,
      filename,
      metadata: exportMetadata,
    });

    return res.status(200).json(consequence);
  } catch (err: any) {
    logger.error('DOCX error', { err: err instanceof Error ? err.message : String(err) });
    if (!res.headersSent) {
      res.status(500).json({
        error: 'GOVERNED_EXPORT_FAILED',
        message: err.message || 'Governed DOCX export failed before consequence persistence',
      });
    }
  }
});

// ── POST /zip ──────────────────────────────────────────────────────────────────
router.post('/zip', authMiddleware, requireEditorAccess, async (req: Request, res: Response) => {
  try {
    const validation = zipSchema.safeParse(req.body);
    if (!validation.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request', details: validation.error.flatten() });
    }

    const { docType, meta, attachments = [] } = validation.data;
    if (!validateExportGovernance(req, res)) return;
    const title = sanitizeFilename(meta?.title || meta?.id || docType);

    const resolved = await resolveExportRequest(req, res, validation.data);
    if (!resolved) return;
    const { content } = resolved;

    // Validate attachment filenames for path traversal
    for (const att of attachments) {
      if (att.filename.includes('..') || att.filename.includes('~') || att.filename.startsWith('/')) {
        return res.status(400).json({ error: `Invalid attachment filename: ${att.filename}` });
      }
    }

    const zipBuffer = await buildZipBuffer(docType, content, title, attachments);
    if (!zipBuffer || zipBuffer.length === 0) {
      return res.status(500).json({ error: 'ZIP generation produced empty output' });
    }

    const placement = resolveCtdPlacement(docType);
    const filename = `${title}_export.zip`;
    const exportMetadata = {
      docType,
      format: 'zip',
      attachmentCount: attachments.length,
      programId: resolved.programUuid ?? undefined,
    };

    if (resolved.anchorProjectId === null) {
      return respondAuditedUnplaced(req, res, {
        sourceType: 'export_zip',
        backendRoute: 'POST /api/cerv2/export/zip',
        programUuid: resolved.programUuid,
        fallbackResourceId: meta?.ident ?? meta?.id ?? docType,
        filename,
        mimeType: 'application/zip',
        buffer: zipBuffer,
        metadata: exportMetadata,
      });
    }

    const consequence = await createGovernedExportConsequence({
      organizationId: (req as any).resolvedOrganizationId,
      projectId: resolved.anchorProjectId,
      userId: getUserId(req),
      title: meta?.title || `${docType} ZIP Export`,
      contentForArtifact: JSON.stringify(content),
      sourceType: 'export_zip',
      ctdSection: placement.ctdSection,
      suggestedPlacement: placement.suggestedPlacement,
      backendRoute: 'POST /api/cerv2/export/zip',
      binaryOutput: zipBuffer,
      mimeType: 'application/zip',
      filename,
      metadata: exportMetadata,
    });

    return res.status(200).json(consequence);
  } catch (err: any) {
    logger.error('ZIP error', { err: err instanceof Error ? err.message : String(err) });
    if (!res.headersSent) {
      res.status(500).json({
        error: 'GOVERNED_EXPORT_FAILED',
        message: err.message || 'Governed ZIP export failed before consequence persistence',
      });
    }
  }
});

// The four GET /sample/:docType* routes were REMOVED, along with the
// mockVault service they were the only consumer of.
//
// They rendered PDF, DOCX, ZIP and editor-JSON exports from an in-memory
// placeholder store — documents titled "510(k) Submission – Content Pending"
// whose body was a single "[Content not available]" paragraph. The store held
// no fabricated regulatory text and the routes were already fail-closed twice
// over (NODE_ENV !== 'production' AND ENABLE_CERV2_SAMPLE_EXPORTS === 'true',
// with mockVault itself throwing outside development/test), so nothing false
// was ever served.
//
// They are gone anyway. A regulated product should not carry a code path whose
// purpose is to emit a document that looks like a submission and is not one,
// however well guarded — the guard is one environment variable away from being
// wrong, and an exported file outlives the process that made it. The governed
// exports above (POST /pdf, /docx, /zip, /ectd) render real authored content
// behind authMiddleware + requireEditorAccess, and are the only way to get a
// document out of this service.

// ── POST /ai-to-editor ────────────────────────────────────────────────────────
// Phase 7.4: Convert AI-populated section map into TipTap editor JSON for export.
// Input: { docType, sections: { [sectionId]: { title: string, content: string } } }
// Output: { editorJson: { type: 'doc', content: [...] } }
const aiToEditorSchema = z.object({
  docType: z.enum(validDocTypes),
  sections: z.record(
    z.string(),
    z.object({
      title: z.string().min(1),
      content: z.string(),
    })
  ),
  meta: z
    .object({
      id: z.string().optional(),
      title: z.string().optional(),
    })
    .optional(),
});

function buildTipTapNode(title: string, content: string) {
  const nodes: any[] = [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: title }],
    },
  ];

  // Parse markdown-like content into paragraphs, headings, and bullet lists
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // H2 heading
    if (line.startsWith('## ')) {
      nodes.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: line.replace(/^## /, '') }],
      });
    }
    // H3 heading
    else if (line.startsWith('### ')) {
      nodes.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: line.replace(/^### /, '') }],
      });
    }
    // Bullet list item
    else if (line.startsWith('- ')) {
      const listItems: any[] = [];
      while (i < lines.length && lines[i].startsWith('- ')) {
        listItems.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: lines[i].replace(/^- /, '') }],
            },
          ],
        });
        i++;
      }
      nodes.push({ type: 'bulletList', content: listItems });
      continue; // already advanced i
    }
    // Table row (markdown) — convert to paragraph for TipTap compatibility
    else if (line.startsWith('|') && line.endsWith('|')) {
      // Skip table separator lines
      if (!/^\|[-| ]+\|$/.test(line)) {
        const text = line.replace(/^\|/, '').replace(/\|$/, '').trim();
        if (text) {
          nodes.push({
            type: 'paragraph',
            content: [{ type: 'text', text }],
          });
        }
      }
    }
    // Regular paragraph
    else if (line.trim()) {
      nodes.push({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      });
    }

    i++;
  }

  return nodes;
}

router.post(
  '/ai-to-editor',
  authMiddleware,
  requireEditorAccess,
  async (req: Request, res: Response) => {
    try {
      const validation = aiToEditorSchema.safeParse(req.body);
      if (!validation.success) {
        return res
          .status(400)
          .json({ error: 'Invalid request', details: validation.error.flatten() });
      }

      const { docType, sections, meta } = validation.data;
      const contentNodes: any[] = [];

      for (const [, section] of Object.entries(sections)) {
        const sectionNodes = buildTipTapNode(section.title, section.content);
        contentNodes.push(...sectionNodes);
      }

      const editorJson = {
        type: 'doc' as const,
        content: contentNodes,
      };

      return res.json({
        editorJson,
        docType,
        meta,
        sectionCount: Object.keys(sections).length,
        nodeCount: contentNodes.length,
      });
    } catch (err: any) {
      logger.error('AI-to-editor error', { err: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: 'AI-to-editor conversion failed', message: err.message });
    }
  }
);

// ── POST /ectd ─────────────────────────────────────────────────────────────────
// Phase 7.5: eCTD submission package assembly (PDF + XML backbone)
router.post(
  '/ectd',
  authMiddleware,
  requireEditorAccess,
  exportRateLimiter,
  async (req: Request, res: Response) => {
    try {
      const { generatePDF, assembleECTDPackage } = await import(
        '../services/documentExportService'
      );

      const projectId = Number(req.body.projectId);
      const organizationId = Number(
        (req as any).tenantId || (req as any).tenantContext?.organizationId || '0'
      );
      const userId = Number((req as any).userId || (req as any).user?.id || 0);

      if (!Number.isFinite(projectId) || !projectId) {
        return res.status(400).json({ error: 'projectId is required' });
      }

      const submissionType = req.body.submissionType || '510K';
      const sequenceNumber = req.body.sequenceNumber || '0000';
      const region = req.body.region || 'us';

      // First generate the PDF
      const pdfResult = await generatePDF({
        projectId,
        organizationId,
        userId,
        includeBookmarks: true,
        includeTOC: true,
        includeMetadata: true,
        includeWatermark: req.body.watermark,
        pageSize: req.body.pageSize || 'letter',
      });

      // Then assemble the eCTD package
      const ectdResult = await assembleECTDPackage({
        projectId,
        organizationId,
        userId,
        sequenceNumber,
        submissionType,
        lifecycleOperation: req.body.lifecycleOperation || 'new',
        region,
      });

      return res.json({
        success: pdfResult.success && ectdResult.success,
        pdf: {
          filename: pdfResult.filename,
          pageCount: pdfResult.pageCount,
          fileSize: pdfResult.fileSize,
          checksums: pdfResult.checksums,
          validationReport: pdfResult.validationReport,
        },
        ectd: {
          packageId: ectdResult.packageId,
          fileCount: ectdResult.files.length,
          files: ectdResult.files.map(f => ({ path: f.path, title: f.title, size: f.size })),
          totalSize: ectdResult.totalSize,
          validationReport: ectdResult.validationReport,
          indexXmlPreview: ectdResult.indexXml.slice(0, 500) + '...',
        },
      });
    } catch (err: any) {
      logger.error('eCTD assembly error', { err: err instanceof Error ? err.message : String(err) });
      res.status(500).json({ error: 'eCTD package assembly failed', message: err.message });
    }
  }
);

// ── GET /health ────────────────────────────────────────────────────────────────
// Phase 7.4: Health check for export service
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'cerv2-export',
    phase: '7.4',
    endpoints: [
      'POST /pdf',
      'POST /docx',
      'POST /zip',
      'POST /ectd',
      'POST /ai-to-editor',
      'GET  /health',
    ],
    supportedDocTypes: [...validDocTypes],
    timestamp: new Date().toISOString(),
  });
});

export default router;
