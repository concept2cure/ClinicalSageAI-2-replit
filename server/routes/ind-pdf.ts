/**
 * IND PDF Generation Service
 *
 * Puppeteer-powered PDF generation for IND submissions.
 * Uses the existing puppeteer-cluster from server/export/renderers.ts
 * with a fallback to PDFKit when Puppeteer is unavailable.
 *
 * Endpoints:
 *   POST /api/ind-pdf/:projectId/generate     — Generate full IND PDF
 *   POST /api/ind-pdf/:projectId/section       — Generate single section PDF
 *   GET  /api/ind-pdf/:projectId/download/:id  — Download generated PDF
 *
 * @module server/routes/ind-pdf
 * @compliance FDA 21 CFR Part 11, ICH M4
 */

import { Router, Request, Response } from 'express';
import { Cluster } from 'puppeteer-cluster';
import PDFDocument from 'pdfkit';
import { pool } from '../db';
import { registerExportGovernanceQuick } from '../services/compute/exportGovernance';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { extractPdfWithPython } from '../services/unifiedDocumentIngestion.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// PUPPETEER CLUSTER (shared singleton with graceful fallback)
// ═══════════════════════════════════════════════════════════════════════════════

let clusterPromise: Promise<Cluster | null> | null = null;

async function getCluster(): Promise<Cluster | null> {
  if (!clusterPromise) {
    clusterPromise = Cluster.launch({
      concurrency: Cluster.CONCURRENCY_CONTEXT,
      maxConcurrency: 2,
      puppeteerOptions: {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      },
    }).catch(err => {
      console.warn(
        '[IND-PDF] Puppeteer cluster unavailable — using PDFKit fallback:',
        err?.message
      );
      return null;
    });
  }
  return clusterPromise;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HTML TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════════

function buildINDHtml(opts: {
  projectName: string;
  projectId: number;
  sections: Array<{ code: string; title: string; content: string; module: string; status: string }>;
  submissionType: string;
  generatedAt: string;
}): string {
  const { projectName, projectId, sections, submissionType, generatedAt } = opts;

  const tocHtml = sections
    .map(
      (s, i) =>
        `<li><a href="#section-${i}">${escapeHtml(s.code)} — ${escapeHtml(s.title)}</a><span class="toc-status ${s.status}">${s.status}</span></li>`
    )
    .join('\n');

  const sectionsHtml = sections
    .map(
      (s, i) => `
    <div class="section" id="section-${i}">
      <div class="section-header">
        <h2>${escapeHtml(s.code)} — ${escapeHtml(s.title)}</h2>
        <span class="module-tag">${escapeHtml(s.module)}</span>
      </div>
      <div class="section-content">
        ${s.content && s.content.trim().length > 0 ? s.content : '<p class="placeholder">Content pending — section not yet drafted.</p>'}
      </div>
    </div>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>IND Application — ${escapeHtml(projectName)}</title>
  <style>
    @page {
      margin: 72pt 72pt 72pt 72pt;
      size: letter;
      @bottom-center { content: "Page " counter(page) " of " counter(pages); font-size: 9pt; color: #666; }
      @top-right { content: "CONFIDENTIAL"; font-size: 8pt; color: #999; }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Times New Roman', Georgia, serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 7.5in;
      margin: 0 auto;
    }

    /* Cover page */
    .cover {
      text-align: center;
      padding: 120pt 0 60pt;
      page-break-after: always;
    }
    .cover h1 {
      font-size: 24pt;
      font-weight: bold;
      margin-bottom: 12pt;
      color: #111;
    }
    .cover .subtitle {
      font-size: 14pt;
      color: #444;
      margin-bottom: 8pt;
    }
    .cover .meta {
      font-size: 10pt;
      color: #666;
      margin-top: 40pt;
      line-height: 2;
    }
    .cover .watermark {
      font-size: 9pt;
      color: #999;
      margin-top: 60pt;
      border-top: 1px solid #ddd;
      padding-top: 12pt;
    }

    /* Table of Contents */
    .toc {
      page-break-after: always;
      padding: 24pt 0;
    }
    .toc h2 { font-size: 18pt; margin-bottom: 16pt; border-bottom: 2px solid #333; padding-bottom: 8pt; }
    .toc ol { list-style: none; counter-reset: toc-counter; }
    .toc li {
      counter-increment: toc-counter;
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      padding: 4pt 0;
      border-bottom: 1px dotted #ccc;
      font-size: 10pt;
    }
    .toc li a { text-decoration: none; color: #111; flex: 1; }
    .toc-status {
      font-size: 8pt;
      padding: 2pt 6pt;
      border-radius: 3pt;
      text-transform: uppercase;
      font-weight: bold;
    }
    .toc-status.approved, .toc-status.locked, .toc-status.final { background: #d4edda; color: #155724; }
    .toc-status.drafting, .toc-status.review, .toc-status.internal_review { background: #fff3cd; color: #856404; }
    .toc-status.not_started { background: #f8d7da; color: #721c24; }

    /* Sections */
    .section {
      page-break-before: always;
      padding: 24pt 0;
    }
    .section-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      border-bottom: 2px solid #333;
      padding-bottom: 8pt;
      margin-bottom: 16pt;
    }
    .section-header h2 { font-size: 16pt; color: #111; }
    .module-tag {
      font-size: 8pt;
      padding: 2pt 8pt;
      background: #e8e8e8;
      border-radius: 3pt;
      color: #555;
      text-transform: uppercase;
    }
    .section-content { font-size: 11pt; line-height: 1.7; }
    .section-content p { margin: 8pt 0; text-align: justify; }
    .section-content h3 { font-size: 13pt; margin: 16pt 0 8pt; font-weight: bold; }
    .section-content h4 { font-size: 12pt; margin: 12pt 0 6pt; font-weight: bold; }
    .section-content table { width: 100%; border-collapse: collapse; margin: 12pt 0; font-size: 10pt; }
    .section-content th, .section-content td { border: 1px solid #ccc; padding: 6pt 8pt; text-align: left; }
    .section-content th { background: #f5f5f5; font-weight: bold; }
    .section-content ul, .section-content ol { margin: 8pt 0 8pt 24pt; }
    .section-content li { margin: 4pt 0; }

    .placeholder {
      color: #999;
      font-style: italic;
      padding: 24pt;
      background: #fafafa;
      border: 1px dashed #ddd;
      border-radius: 6pt;
      text-align: center;
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="cover">
    <h1>Investigational New Drug Application</h1>
    <div class="subtitle">${escapeHtml(projectName)}</div>
    <div class="subtitle" style="font-size: 12pt; color: #666;">eCTD 4.0 — ${escapeHtml(submissionType)} Submission</div>
    <div class="meta">
      IND Application Number: IND-${projectId}<br>
      Submission Type: ${escapeHtml(submissionType)}<br>
      Generated: ${generatedAt}<br>
      Total Sections: ${sections.length}<br>
      Platform: Concept2Cure v1.0
    </div>
    <div class="watermark">
      CONFIDENTIAL — For regulatory submission purposes only.<br>
      Generated by Concept2Cure AI-assisted regulatory platform.<br>
      This document requires regulatory review before submission.
    </div>
  </div>

  <!-- Table of Contents -->
  <div class="toc">
    <h2>Table of Contents</h2>
    <ol>${tocHtml}</ol>
  </div>

  <!-- Document Sections -->
  ${sectionsHtml}
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF RENDERING
// ═══════════════════════════════════════════════════════════════════════════════

async function renderWithPuppeteer(html: string): Promise<Buffer> {
  const cluster = await getCluster();
  if (cluster) {
    return cluster.execute(async ({ page }) => {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      const pdf = await page.pdf({
        format: 'Letter',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="width: 100%; text-align: center; font-size: 9px; color: #666; padding: 8px 0;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span> — CONFIDENTIAL
          </div>`,
        margin: { top: '72px', bottom: '72px', left: '72px', right: '72px' },
      });
      return Buffer.from(pdf);
    });
  }

  // Fallback to PDFKit
  return renderFallbackPdf(html);
}

function renderFallbackPdf(html: string): Promise<Buffer> {
  return new Promise(resolve => {
    const doc = new PDFDocument({ margin: 72, size: 'LETTER' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // Strip HTML tags for plain-text fallback
    const text = html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    // Header
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .text('IND Application', { align: 'center' })
      .moveDown(0.5);

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#666')
      .text('Generated by Concept2Cure Concept2Cure — CONFIDENTIAL', { align: 'center' })
      .moveDown(2);

    // Body
    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor('#1a1a1a')
      .text(text.slice(0, 100000), { align: 'left', lineGap: 4 });

    doc.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /:projectId/generate — Generate full IND PDF
 */
router.post('/:projectId/generate', async (req: Request, res: Response) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (!projectId) return res.status(400).json({ error: 'Valid project ID required' });

  try {
    const {
      submissionType = 'initial',
      projectName = 'IND Application',
      format = 'pdf',
    } = req.body;

    console.log(`[IND-PDF] Generating ${format.toUpperCase()} for project ${projectId}...`);

    // Fetch all project sections with content
    let sections: any[] = [];
    try {
      const result = await pool.query(
        `SELECT section_code, title, content, module, status, word_count
         FROM project_sections
         WHERE project_id = $1
         ORDER BY section_code`,
        [projectId]
      );
      sections = result.rows;
    } catch {
      // Table may not exist — generate with empty sections
      console.warn('[IND-PDF] project_sections table not available');
    }

    // If no sections from DB, return a template PDF
    if (sections.length === 0) {
      sections = [
        {
          section_code: '1.1',
          title: 'FDA Forms (1571, 1572, 3674)',
          content: '',
          module: 'M1',
          status: 'not_started',
        },
        {
          section_code: '1.2',
          title: 'Cover Letter',
          content: '',
          module: 'M1',
          status: 'not_started',
        },
        {
          section_code: '2.5',
          title: 'Clinical Overview',
          content: '',
          module: 'M2',
          status: 'not_started',
        },
        {
          section_code: '2.7.1',
          title: 'Summary of Current Studies',
          content: '',
          module: 'M2',
          status: 'not_started',
        },
        {
          section_code: '3.2.S',
          title: 'Drug Substance',
          content: '',
          module: 'M3',
          status: 'not_started',
        },
        {
          section_code: '3.2.P',
          title: 'Drug Product',
          content: '',
          module: 'M3',
          status: 'not_started',
        },
        {
          section_code: '4.2.1',
          title: 'Pharmacology',
          content: '',
          module: 'M4',
          status: 'not_started',
        },
        {
          section_code: '5.3.5.1',
          title: 'Clinical Study Reports',
          content: '',
          module: 'M5',
          status: 'not_started',
        },
      ];
    }

    const mappedSections = sections.map(s => ({
      code: s.section_code || 'Unknown',
      title: s.title || 'Untitled',
      content: s.content || '',
      module: s.module || 'Unknown',
      status: s.status || 'not_started',
    }));

    const html = buildINDHtml({
      projectName,
      projectId,
      sections: mappedSections,
      submissionType,
      generatedAt: new Date().toISOString(),
    });

    // Generate PDF
    const pdfBuffer = await renderWithPuppeteer(html);

    // Save to disk
    const outputDir = path.join(process.cwd(), 'exports', 'pdf');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const filename = `ind-${projectId}-${Date.now()}.pdf`;
    const filepath = path.join(outputDir, filename);
    fs.writeFileSync(filepath, pdfBuffer);

    console.log(`[IND-PDF] Generated ${pdfBuffer.length} bytes → ${filepath}`);

    // Register governed export (fail-closed for regulated outputs).
    // SECURITY: JWT-bound. The previous `|| 1` / `|| 0` fallback
    // attributed exports to org 1 / user 0 when JWT was missing.
    const user = (req as any).user;
    const govOrgId = user?.organizationId ?? (req as any).tenantContext?.organizationId;
    if (govOrgId == null || user?.id == null) {
      return res.status(403).json({ error: 'Tenant context required for governed export' });
    }
    await registerExportGovernanceQuick({
      organizationId: Number(govOrgId),
      projectId: Number(projectId) || 0,
      userId: Number(user.id),
      userName: user?.name || user?.email || 'unknown',
      title: `IND PDF: Project ${projectId}`,
      exportFormat: 'pdf',
      exportFilename: filename,
      exportFileSize: pdfBuffer.length,
      docType: 'ind_pdf',
      backendRoute: `/api/ind-pdf/${projectId}/generate`,
      ipAddress: req.ip,
    });

    // Return PDF directly or download URL
    if (req.query.download === 'true') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(pdfBuffer.length));
      return res.send(pdfBuffer);
    }

    res.json({
      success: true,
      filename,
      size: pdfBuffer.length,
      sections: mappedSections.length,
      downloadUrl: `/api/ind-pdf/${projectId}/download/${filename}`,
      generatedAt: new Date().toISOString(),
      usedPuppeteer: !!(await getCluster()),
    });
  } catch (error: any) {
    console.error('[IND-PDF] Generation failed:', error);
    res.status(500).json({
      error: 'PDF generation failed',
      message: 'An unexpected error occurred',
    });
  }
});

/**
 * POST /:projectId/section — Generate PDF for a single section
 */
router.post('/:projectId/section', async (req: Request, res: Response) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (!projectId) return res.status(400).json({ error: 'Valid project ID required' });

  try {
    const { sectionCode, projectName = 'IND Application' } = req.body;
    if (!sectionCode) return res.status(400).json({ error: 'sectionCode required' });

    let section: any = null;
    try {
      const result = await pool.query(
        `SELECT section_code, title, content, module, status
         FROM project_sections
         WHERE project_id = $1 AND section_code = $2`,
        [projectId, sectionCode]
      );
      section = result.rows[0];
    } catch {
      // Table may not exist
    }

    if (!section) {
      section = {
        section_code: sectionCode,
        title: sectionCode,
        content: '',
        module: 'Unknown',
        status: 'not_started',
      };
    }

    const html = buildINDHtml({
      projectName,
      projectId,
      sections: [
        {
          code: section.section_code,
          title: section.title,
          content: section.content || '',
          module: section.module,
          status: section.status,
        },
      ],
      submissionType: 'section-export',
      generatedAt: new Date().toISOString(),
    });

    const pdfBuffer = await renderWithPuppeteer(html);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="section-${sectionCode}-${projectId}.pdf"`
    );
    res.setHeader('Content-Length', String(pdfBuffer.length));

    // Register governed export (fail-closed for regulated outputs).
    // SECURITY: JWT-bound — see the export above.
    const secUser = (req as any).user;
    const secOrgId = secUser?.organizationId ?? (req as any).tenantContext?.organizationId;
    if (secOrgId == null || secUser?.id == null) {
      return res.status(403).json({ error: 'Tenant context required for governed export' });
    }
    await registerExportGovernanceQuick({
      organizationId: Number(secOrgId),
      projectId: Number(projectId) || 0,
      userId: Number(secUser.id),
      userName: secUser?.name || secUser?.email || 'unknown',
      title: `IND Section PDF: ${sectionCode}`,
      exportFormat: 'pdf',
      exportFilename: `section-${sectionCode}-${projectId}.pdf`,
      exportFileSize: pdfBuffer.length,
      docType: 'ind_section_pdf',
      backendRoute: `/api/ind-pdf/${projectId}/section`,
      ctdSection: sectionCode,
      ipAddress: req.ip,
    });

    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('[IND-PDF] Section export failed:', error);
    res.status(500).json({ error: 'Section PDF generation failed', message: 'An unexpected error occurred' });
  }
});

/**
 * GET /:projectId/download/:filename — Download a previously generated PDF
 */
router.get('/:projectId/download/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;

    // Sanitize filename to prevent path traversal
    const safeName = path.basename(filename);
    const filepath = path.join(process.cwd(), 'exports', 'pdf', safeName);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'PDF not found. It may have been cleaned up.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    fs.createReadStream(filepath).pipe(res);
  } catch (error: any) {
    console.error('[IND-PDF] Download failed:', error);
    res.status(500).json({ error: 'Download failed', message: 'An unexpected error occurred' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXTRACTION (Python multi-strategy bridge)
// ─────────────────────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    cb(null, file.mimetype === 'application/pdf');
  },
});

/**
 * POST /:projectId/extract
 *
 * Upload a PDF and extract its full text using the Python multi-strategy
 * pipeline (pymupdf → pypdf2 → pdfminer → OCR → enhanced OCR).
 *
 * Body: multipart/form-data, field "file" (PDF)
 */
router.post('/:projectId/extract', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided. Use field name "file".' });
    }

    const result = await (extractPdfWithPython as any)(req.file.buffer, { filename: req.file.originalname });

    if (!result.success) {
      return res.status(422).json({ error: 'PDF extraction failed', detail: result.error });
    }

    const wordCount = result.text ? (result.text as string).split(/\s+/).filter(Boolean).length : 0;

    res.json({
      success:     true,
      projectId,
      text:        result.text,
      strategy:    result.strategy,
      pageCount:   result.pageCount ?? null,
      wordCount,
      filename:    req.file.originalname,
      extractedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[IND-PDF] Extraction failed:', error);
    res.status(500).json({ error: 'PDF extraction failed', message: 'An unexpected error occurred' });
  }
});

/**
 * POST /:projectId/import-content
 *
 * Upload a source PDF, extract its text, then store it as AI generation
 * context for the specified IND section (sectionCode in body).
 *
 * Body: multipart/form-data with fields:
 *   file         — PDF file
 *   sectionCode  — CTD section code (e.g. "2.7")
 */
router.post('/:projectId/import-content', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const sectionCode = (req.body?.sectionCode as string) || '2';

    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file provided. Use field name "file".' });
    }

    const extraction = await (extractPdfWithPython as any)(req.file.buffer, { filename: req.file.originalname });

    if (!extraction.success || !(extraction.text as string)?.trim()) {
      return res.status(422).json({ error: 'Could not extract usable text from the PDF' });
    }

    if (pool) {
      await pool.query(
        `INSERT INTO ind_source_documents
           (project_id, section_code, filename, extracted_text, strategy, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (project_id, section_code, filename) DO UPDATE
           SET extracted_text = EXCLUDED.extracted_text,
               strategy       = EXCLUDED.strategy,
               created_at     = NOW()`,
        [projectId, sectionCode, req.file.originalname, extraction.text, extraction.strategy]
      ).catch(() => { /* table may not exist yet; non-fatal */ });
    }

    res.json({
      success:    true,
      projectId,
      sectionCode,
      filename:   req.file.originalname,
      strategy:   extraction.strategy,
      wordCount:  (extraction.text as string).split(/\s+/).filter(Boolean).length,
      importedAt: new Date().toISOString(),
      message:    'PDF imported and stored as source context for AI generation.',
    });
  } catch (error: any) {
    console.error('[IND-PDF] Import-content failed:', error);
    res.status(500).json({ error: 'Import failed', message: 'An unexpected error occurred' });
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// DOCX-TO-PDF CONVERSION (LibreOffice headless)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /conversion/health — Check if DOCX-to-PDF conversion is available
 */
router.get('/conversion/health', async (_req: Request, res: Response) => {
  try {
    const { isPdfConversionAvailable } = await import('../services/pdfConversionService.js');
    const available = await isPdfConversionAvailable();
    res.json({
      service: 'docx-to-pdf',
      available,
      engine: available ? 'libreoffice-headless' : null,
      message: available
        ? 'LibreOffice headless is ready for DOCX-to-PDF conversion.'
        : 'LibreOffice not installed. Install with: apt-get install -y libreoffice-common libreoffice-writer',
    });
  } catch (error: any) {
    res.status(500).json({
      service: 'docx-to-pdf',
      available: false,
      error: error.message,
    });
  }
});

/**
 * POST /convert/docx-to-pdf — Convert an uploaded DOCX file to PDF
 *
 * Body: multipart/form-data, field "file" (DOCX)
 */
const docxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream',
    ];
    cb(null, allowed.includes(file.mimetype) || file.originalname.endsWith('.docx'));
  },
});

router.post('/convert/docx-to-pdf', docxUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No DOCX file provided. Use field name "file".' });
    }

    const { convertDocxToPdf } = await import('../services/pdfConversionService.js');
    const pdfBuffer = await convertDocxToPdf(req.file.buffer);

    const baseName = path.basename(req.file.originalname, '.docx');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.pdf"`);
    res.setHeader('Content-Length', String(pdfBuffer.length));
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('[IND-PDF] DOCX-to-PDF conversion failed:', error);
    res.status(500).json({
      error: 'DOCX-to-PDF conversion failed',
      message: 'An unexpected error occurred',
    });
  }
});

// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default router;
