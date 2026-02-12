/**
 * Unified CERV2 Export Routes
 *
 * POST /api/cerv2/export/pdf   – single combined PDF for any doc type
 * POST /api/cerv2/export/docx  – single combined DOCX for any doc type
 * POST /api/cerv2/export/zip   – full submission pack (per-section PDFs + attachments)
 * GET  /api/cerv2/export/mock/:docType – export simulation with mock data (dev only)
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
        filename: z.string().min(1),
        buffer: z.string().min(1),
        mimeType: z.string().optional(),
      })
    )
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
    const pdfBuffer = await renderCombinedPdf(docType, content);

    const filename = sanitizeFilename(meta?.title || `${docType}_export`) + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error('[CERV2 Export] PDF error:', err);
    res.status(500).json({ error: 'PDF generation failed', message: err.message });
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
    const docxBuffer = await renderCombinedDocx(docType, content);

    const filename = sanitizeFilename(meta?.title || `${docType}_export`) + '.docx';
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(docxBuffer);
  } catch (err: any) {
    console.error('[CERV2 Export] DOCX error:', err);
    res.status(500).json({ error: 'DOCX generation failed', message: err.message });
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

export default router;
