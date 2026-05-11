/**
 * Unified CERV2 Export Routes  (Phase 7.4 – Enhanced)
 *
 * POST /api/cerv2/export/pdf   – single combined PDF for any doc type
 * POST /api/cerv2/export/docx  – single combined DOCX for any doc type
 * POST /api/cerv2/export/zip   – full submission pack (per-section PDFs + attachments)
 * POST /api/cerv2/export/ai-to-editor – convert AI section map → TipTap editor JSON
 * GET  /api/cerv2/export/sample/:docType        – sample PDF export (dev only, opt-in)
 * GET  /api/cerv2/export/sample/:docType/docx   – sample DOCX export (dev only, opt-in)
 * GET  /api/cerv2/export/sample/:docType/zip    – sample ZIP export (dev only, opt-in)
 * GET  /api/cerv2/export/sample/:docType/json   – sample editor JSON (dev only, opt-in)
 * GET  /api/cerv2/export/health               – health check
 */

import { Router, Request, Response } from 'express';
import archiver from 'archiver';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { stylePacks } from '../export/stylePacks/config';
import {
  renderPdfBuffersFor510k,
  renderPdfBuffersForPma,
  renderPdfBuffersForCer,
  renderCombinedPdf,
  renderCombinedDocx,
} from '../export/renderers';
import { PassThrough } from 'stream';
import { mockVault } from '../services/mockVault';
import { authMiddleware } from '../auth';
import { createGovernedExportConsequence } from '../services/export/governedExportConsequence';

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

function isSampleExportEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_CERV2_SAMPLE_EXPORTS === 'true';
}

function denySampleExportRoute(res: Response): Response {
  return res.status(404).json({
    error: 'Sample export routes are disabled',
    code: 'CERV2_SAMPLE_EXPORT_DISABLED',
  });
}

// ── Auth guard ─────────────────────────────────────────────────────────────────
const allowedRoles = new Set(['admin', 'owner', 'editor', 'super_admin']);
const requireEditorAccess = (req: any, res: any, next: () => void) => {
  const role = String(req.userRole || req.user?.role || '').toLowerCase();
  if (!role || !allowedRoles.has(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  // Verify organization context exists (prevents cross-org access).
  // Trust only middleware-derived sources — never client-supplied headers.
  const orgId = req.tenantId || req.tenantContext?.organizationId;
  if (!orgId) {
    return res.status(400).json({ error: 'Organization context required' });
  }
  const numericOrgId = Number(orgId);
  if (!Number.isFinite(numericOrgId) || numericOrgId <= 0) {
    return res.status(400).json({ error: 'Valid numeric organization context required' });
  }
  req.resolvedOrganizationId = numericOrgId;
  return next();
};

// ── Validation schemas ─────────────────────────────────────────────────────────
const validDocTypes = ['cerv2_510k', 'cerv2_pma', 'cerv2_cer'] as const;

const exportSchema = z.object({
  docType: z.enum(validDocTypes),
  projectId: z.coerce.number().int().positive(),
  content: z.object({
    type: z.literal('doc'),
    content: z.array(z.any()).min(1, 'Editor content must have at least one node'),
  }),
  meta: z
    .object({
      id: z.string().optional(),
      title: z.string().optional(),
    })
    .optional(),
});

const zipSchema = exportSchema.extend({
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
});

const sanitizeFilename = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');

const exportGovernanceSchema = z.object({
  aiGenerated: z.boolean().default(true),
  humanReviewApproved: z.boolean().default(false),
  reviewerName: z.string().trim().min(1).max(200).optional(),
  reviewerRole: z.string().trim().min(1).max(200).optional(),
  reviewTimestamp: z.string().datetime().optional(),
});

function shouldEnforceExportReviewGate(): boolean {
  if (process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW === 'true') return true;
  if (process.env.CONCEPT2CURE_REQUIRE_EXPORT_HUMAN_REVIEW === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

function applyGovernanceHeaders(res: Response, governance: z.infer<typeof exportGovernanceSchema>) {
  res.setHeader('X-Concept2Cure-AI-Generated', String(governance.aiGenerated));
  res.setHeader('X-Concept2Cure-Human-Review-Approved', String(governance.humanReviewApproved));
  res.setHeader('X-Concept2Cure-Review-Required', 'true');
  res.setHeader('X-Concept2Cure-Review-Notice', 'Human review required for regulated use');
  res.setHeader('X-Concept2Cure-Governance-Persistence', 'governed');
  if (governance.reviewerName) {
    res.setHeader('X-Concept2Cure-Reviewer', encodeURIComponent(governance.reviewerName));
  }
  if (governance.reviewTimestamp) {
    res.setHeader('X-Concept2Cure-Review-Timestamp', governance.reviewTimestamp);
  }
}

function validateExportGovernance(req: Request, res: Response) {
  const parsed = exportGovernanceSchema.safeParse(req.body?.governance ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid governance payload', details: parsed.error.flatten() });
    return null;
  }

  const governance = parsed.data;
  if (shouldEnforceExportReviewGate() && !governance.humanReviewApproved) {
    res.status(403).json({
      error: 'HUMAN_REVIEW_REQUIRED',
      message: 'Human review approval is required before export in this environment',
    });
    return null;
  }

  applyGovernanceHeaders(res, governance);
  return governance;
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
  content: z.infer<typeof exportSchema>['content'],
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

    const { docType, content, meta, projectId } = validation.data;
    if (!validateExportGovernance(req, res)) return;

    // Validate content has substantive nodes (not just empty paragraphs)
    const substantiveNodes = content.content.filter(
      (n: any) => n.type !== 'paragraph' || (n.content && n.content.length > 0)
    );
    if (substantiveNodes.length === 0) {
      return res.status(400).json({ error: 'Document has no content to export' });
    }

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await renderCombinedPdf(docType, content);
    } catch (renderErr: any) {
      console.error('[CERV2 Export] PDF render failed:', renderErr);
      return res.status(500).json({
        error: 'PDF rendering failed',
        message: renderErr.message || 'The document could not be converted to PDF',
      });
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      return res.status(500).json({ error: 'PDF rendering produced empty output' });
    }

    const filename = sanitizeFilename(meta?.title || `${docType}_export`) + '.pdf';
    const placement = resolveCtdPlacement(docType);
    const consequence = await createGovernedExportConsequence({
      organizationId: (req as any).resolvedOrganizationId,
      projectId,
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
      metadata: { docType, format: 'pdf' },
    });

    return res.status(200).json(consequence);
  } catch (err: any) {
    console.error('[CERV2 Export] PDF error:', err);
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

    const { docType, content, meta, projectId } = validation.data;
    if (!validateExportGovernance(req, res)) return;

    // Validate content has substantive nodes
    const substantiveNodes = content.content.filter(
      (n: any) => n.type !== 'paragraph' || (n.content && n.content.length > 0)
    );
    if (substantiveNodes.length === 0) {
      return res.status(400).json({ error: 'Document has no content to export' });
    }

    let docxBuffer: Buffer;
    try {
      docxBuffer = await renderCombinedDocx(docType, content);
    } catch (renderErr: any) {
      console.error('[CERV2 Export] DOCX render failed:', renderErr);
      return res.status(500).json({
        error: 'DOCX rendering failed',
        message: renderErr.message || 'The document could not be converted to DOCX',
      });
    }

    if (!docxBuffer || docxBuffer.length === 0) {
      return res.status(500).json({ error: 'DOCX rendering produced empty output' });
    }

    const filename = sanitizeFilename(meta?.title || `${docType}_export`) + '.docx';
    const placement = resolveCtdPlacement(docType);
    const consequence = await createGovernedExportConsequence({
      organizationId: (req as any).resolvedOrganizationId,
      projectId,
      userId: getUserId(req),
      title: meta?.title || `${docType} DOCX Export`,
      contentForArtifact: JSON.stringify(content),
      sourceType: 'export_docx',
      ctdSection: placement.ctdSection,
      suggestedPlacement: placement.suggestedPlacement,
      backendRoute: 'POST /api/cerv2/export/docx',
      binaryOutput: docxBuffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      filename,
      metadata: { docType, format: 'docx' },
    });

    return res.status(200).json(consequence);
  } catch (err: any) {
    console.error('[CERV2 Export] DOCX error:', err);
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

    const { docType, content, meta, attachments = [], projectId } = validation.data;
    if (!validateExportGovernance(req, res)) return;
    const title = sanitizeFilename(meta?.title || meta?.id || docType);

    // Validate content has substantive nodes before starting ZIP stream
    const substantiveNodes = content.content.filter(
      (n: any) => n.type !== 'paragraph' || (n.content && n.content.length > 0)
    );
    if (substantiveNodes.length === 0) {
      return res.status(400).json({ error: 'Document has no content to export' });
    }

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
    const consequence = await createGovernedExportConsequence({
      organizationId: (req as any).resolvedOrganizationId,
      projectId,
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
      metadata: { docType, format: 'zip', attachmentCount: attachments.length },
    });

    return res.status(200).json(consequence);
  } catch (err: any) {
    console.error('[CERV2 Export] ZIP error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'GOVERNED_EXPORT_FAILED',
        message: err.message || 'Governed ZIP export failed before consequence persistence',
      });
    }
  }
});

// ── GET /sample/:docType ───────────────────────────────────────────────────────
// Export simulation using sample data for local development verification.
router.get('/sample/:docType', async (req: Request, res: Response) => {
  if (!isSampleExportEnabled()) return denySampleExportRoute(res);
  try {
    const docType = req.params.docType;
    if (!validDocTypes.includes(docType as any)) {
      return res.status(400).json({
        error: `Invalid docType. Valid: ${validDocTypes.join(', ')}`,
      });
    }

    const mockContent = mockVault.getMockEditorJson(docType);
    const pdfBuffer = await renderCombinedPdf(docType, mockContent);

    const filename = sanitizeFilename(`${docType}_sample_export`) + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('[CERV2 Export] Sample export error:', err);
    res.status(500).json({ error: 'Sample export failed', message: err.message });
  }
});

// ── GET /sample/:docType/zip ───────────────────────────────────────────────────
router.get('/sample/:docType/zip', async (req: Request, res: Response) => {
  if (!isSampleExportEnabled()) return denySampleExportRoute(res);
  try {
    const docType = req.params.docType;
    if (!validDocTypes.includes(docType as any)) {
      return res.status(400).json({
        error: `Invalid docType. Valid: ${validDocTypes.join(', ')}`,
      });
    }

    const mockContent = mockVault.getMockEditorJson(docType);
    const title = sanitizeFilename(`${docType}_sample`);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${title}_export.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => {
      console.error('[CERV2 Export] Sample ZIP error:', err);
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);

    // Combined outputs
    const [combinedPdf, combinedDocx] = await Promise.all([
      renderCombinedPdf(docType, mockContent),
      renderCombinedDocx(docType, mockContent),
    ]);
    archive.append(combinedPdf, { name: `${title}_Combined.pdf` });
    archive.append(combinedDocx, { name: `${title}_Combined.docx` });

    // Metadata JSON
    const mockDoc = mockVault.list(docType)[0];
    if (mockDoc) {
      archive.append(
        JSON.stringify(
          {
            id: mockDoc.id,
            documentType: mockDoc.documentType,
            title: mockDoc.title,
            version: mockDoc.version,
            exportedAt: new Date().toISOString(),
            generator: 'Concept2Cure CERV2 Sample Export',
          },
          null,
          2
        ),
        { name: 'metadata.json' }
      );
    }

    await archive.finalize();
  } catch (err: any) {
    console.error('[CERV2 Export] Sample ZIP error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Sample ZIP failed', message: err.message });
    }
  }
});

// ── GET /sample/:docType/docx ──────────────────────────────────────────────────
// Phase 7.4: sample DOCX export using sample vault data
router.get('/sample/:docType/docx', async (req: Request, res: Response) => {
  if (!isSampleExportEnabled()) return denySampleExportRoute(res);
  try {
    const docType = req.params.docType;
    if (!validDocTypes.includes(docType as any)) {
      return res.status(400).json({
        error: `Invalid docType. Valid: ${validDocTypes.join(', ')}`,
      });
    }

    const mockContent = mockVault.getMockEditorJson(docType);
    const docxBuffer = await renderCombinedDocx(docType, mockContent);

    const filename = sanitizeFilename(`${docType}_sample_export`) + '.docx';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(docxBuffer);
  } catch (err: any) {
    console.error('[CERV2 Export] Sample DOCX error:', err);
    res.status(500).json({ error: 'Sample DOCX export failed', message: err.message });
  }
});

// ── GET /sample/:docType/json ──────────────────────────────────────────────────
// Phase 7.4: Return raw sample editor JSON for client-side inspection or re-export.
router.get('/sample/:docType/json', async (req: Request, res: Response) => {
  if (!isSampleExportEnabled()) return denySampleExportRoute(res);
  try {
    const docType = req.params.docType;
    if (!validDocTypes.includes(docType as any)) {
      return res.status(400).json({
        error: `Invalid docType. Valid: ${validDocTypes.join(', ')}`,
      });
    }

    const mockContent = mockVault.getMockEditorJson(docType);
    const mockDoc = mockVault.list(docType)[0];

    return res.json({
      docType,
      editorJson: mockContent,
      meta: mockDoc
        ? {
            id: mockDoc.id,
            title: mockDoc.title,
            version: mockDoc.version,
          }
        : null,
    });
  } catch (err: any) {
    console.error('[CERV2 Export] Sample JSON error:', err);
    res.status(500).json({ error: 'Sample JSON retrieval failed', message: err.message });
  }
});

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
      console.error('[CERV2 Export] AI-to-editor error:', err);
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
      console.error('[CERV2 Export] eCTD assembly error:', err);
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
      'GET  /sample/:docType',
      'GET  /sample/:docType/docx',
      'GET  /sample/:docType/zip',
      'GET  /sample/:docType/json',
      'GET  /health',
    ],
    supportedDocTypes: [...validDocTypes],
    timestamp: new Date().toISOString(),
  });
});

export default router;
