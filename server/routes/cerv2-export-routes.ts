/**
 * Unified CERV2 Export Routes  (Phase 7.4 – Enhanced)
 *
 * POST /api/cerv2/export/pdf   – single combined PDF for any doc type
 * POST /api/cerv2/export/docx  – single combined DOCX for any doc type
 * POST /api/cerv2/export/zip   – full submission pack (per-section PDFs + attachments)
 * POST /api/cerv2/export/ai-to-editor – convert AI section map → TipTap editor JSON
 * GET  /api/cerv2/export/mock/:docType        – mock PDF export (dev only)
 * GET  /api/cerv2/export/mock/:docType/docx   – mock DOCX export (dev only)
 * GET  /api/cerv2/export/mock/:docType/zip    – mock ZIP export (dev only)
 * GET  /api/cerv2/export/mock/:docType/json   – mock editor JSON (dev only)
 * GET  /api/cerv2/export/health               – health check
 */

import { Router, Request, Response } from 'express';
import archiver from 'archiver';
import { z } from 'zod';
import { stylePacks } from '../export/stylePacks/config';
import {
  renderPdfBuffersFor510k,
  renderPdfBuffersForPma,
  renderPdfBuffersForCer,
  renderCombinedPdf,
  renderCombinedDocx,
} from '../export/renderers';
import { mockVault } from '../services/mockVault';
import { authMiddleware } from '../auth';

const router = Router();

// ── Auth guard ─────────────────────────────────────────────────────────────────
const allowedRoles = new Set(['admin', 'owner', 'editor', 'super_admin']);
const requireEditorAccess = (req: any, res: any, next: () => void) => {
  const role = String(req.userRole || req.user?.role || '').toLowerCase();
  if (!role || !allowedRoles.has(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  // Verify organization context exists (prevents cross-org access)
  const headerOrg = req.header('x-organization-id') || req.header('x-org-id');
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const orgId = headerOrg || tenantOrg || userOrg;
  if (!orgId) {
    return res.status(400).json({ error: 'Organization context required' });
  }
  req.resolvedOrganizationId = Number(orgId);
  return next();
};

// ── Validation schemas ─────────────────────────────────────────────────────────
const validDocTypes = ['cerv2_510k', 'cerv2_pma', 'cerv2_cer'] as const;

const exportSchema = z.object({
  docType: z.enum(validDocTypes),
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

// ── POST /pdf ──────────────────────────────────────────────────────────────────
router.post('/pdf', authMiddleware, requireEditorAccess, async (req: Request, res: Response) => {
  try {
    const validation = exportSchema.safeParse(req.body);
    if (!validation.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request', details: validation.error.flatten() });
    }

    const { docType, content, meta } = validation.data;

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
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('[CERV2 Export] PDF error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'PDF generation failed', message: err.message });
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

    const { docType, content, meta } = validation.data;

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
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(docxBuffer);
  } catch (err: any) {
    console.error('[CERV2 Export] DOCX error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'DOCX generation failed', message: err.message });
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

    const { docType, content, meta, attachments = [] } = validation.data;
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

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${title}_export.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => {
      console.error('[CERV2 Export] ZIP archive error:', err);
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);

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
    } else if (docType === 'cerv2_cer') {
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

    await archive.finalize();
  } catch (err: any) {
    console.error('[CERV2 Export] ZIP error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'ZIP generation failed', message: err.message });
    }
  }
});

// ── GET /mock/:docType ─────────────────────────────────────────────────────────
// Export simulation using mock data – useful for dev/demo without a live DB
// Gated: no auth required but blocked in production
router.get('/mock/:docType', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Mock routes are disabled in production' });
  }
  try {
    const docType = req.params.docType;
    if (!validDocTypes.includes(docType as any)) {
      return res.status(400).json({
        error: `Invalid docType. Valid: ${validDocTypes.join(', ')}`,
      });
    }

    const mockContent = mockVault.getMockEditorJson(docType);
    const pdfBuffer = await renderCombinedPdf(docType, mockContent);

    const filename = sanitizeFilename(`${docType}_mock_export`) + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('[CERV2 Export] Mock export error:', err);
    res.status(500).json({ error: 'Mock export failed', message: err.message });
  }
});

// ── GET /mock/:docType/zip ─────────────────────────────────────────────────────
router.get('/mock/:docType/zip', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Mock routes are disabled in production' });
  }
  try {
    const docType = req.params.docType;
    if (!validDocTypes.includes(docType as any)) {
      return res.status(400).json({
        error: `Invalid docType. Valid: ${validDocTypes.join(', ')}`,
      });
    }

    const mockContent = mockVault.getMockEditorJson(docType);
    const title = sanitizeFilename(`${docType}_mock`);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${title}_export.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => {
      console.error('[CERV2 Export] Mock ZIP error:', err);
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
            generator: 'ClinicalSageAI CERV2 Mock Export',
          },
          null,
          2
        ),
        { name: 'metadata.json' }
      );
    }

    await archive.finalize();
  } catch (err: any) {
    console.error('[CERV2 Export] Mock ZIP error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Mock ZIP failed', message: err.message });
    }
  }
});

// ── GET /mock/:docType/docx ────────────────────────────────────────────────────
// Phase 7.4: Mock DOCX export using mock vault data
router.get('/mock/:docType/docx', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Mock routes are disabled in production' });
  }
  try {
    const docType = req.params.docType;
    if (!validDocTypes.includes(docType as any)) {
      return res.status(400).json({
        error: `Invalid docType. Valid: ${validDocTypes.join(', ')}`,
      });
    }

    const mockContent = mockVault.getMockEditorJson(docType);
    const docxBuffer = await renderCombinedDocx(docType, mockContent);

    const filename = sanitizeFilename(`${docType}_mock_export`) + '.docx';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(docxBuffer);
  } catch (err: any) {
    console.error('[CERV2 Export] Mock DOCX error:', err);
    res.status(500).json({ error: 'Mock DOCX export failed', message: err.message });
  }
});

// ── GET /mock/:docType/json ────────────────────────────────────────────────────
// Phase 7.4: Return raw mock editor JSON for client-side inspection or re-export
router.get('/mock/:docType/json', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Mock routes are disabled in production' });
  }
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
    console.error('[CERV2 Export] Mock JSON error:', err);
    res.status(500).json({ error: 'Mock JSON retrieval failed', message: err.message });
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
      'POST /ai-to-editor',
      'GET  /mock/:docType',
      'GET  /mock/:docType/docx',
      'GET  /mock/:docType/zip',
      'GET  /mock/:docType/json',
      'GET  /health',
    ],
    supportedDocTypes: [...validDocTypes],
    timestamp: new Date().toISOString(),
  });
});

export default router;
