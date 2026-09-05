/**
 * The export family for Concept2Cure — DOCX, PDF and PPTX renders of chat
 * artifacts behind the export review gate, the download of a rendered file,
 * and the eCTD submission-package manifest over a project's artifacts. The
 * fifth domain carved out of routes/concept2cure.ts (ledger L53, slice 7),
 * mounted at the same prefix ahead of it with the same middleware chain; the
 * handlers moved verbatim.
 *
 * This file is the export family's PDF entry point in the PDF runtime
 * canonicality gate (scripts/ci/check-pdf-runtime-canonicality.mjs), taking
 * over the approval routes/concept2cure.ts carried for the same code.
 *
 * @module server/routes/c2c/exports
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import * as crypto from 'crypto';
import { db } from '../../db';
import {
  concept2cureArtifacts,
  concept2cureProvenanceEvents,
  concept2cureSubmissionSnapshots,
  projects,
} from '../../../shared/schema';
import {
  applyExportGovernanceHeaders,
  evaluateExportGovernance,
  type ExportGovernance,
} from '../../services/export/exportReviewGate';
import { createScopedLogger } from '../../utils/logger';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import {
  concept2cureRateLimiter,
  getClientIp,
  getOrganizationId,
  getUserId,
  logAuditEntry,
  logConcept2cureError,
  paramStr,
  sendError,
  sendSuccess,
} from './shared';
import { verifyProjectAccess } from './project-access';

const logger = createScopedLogger('concept2cure-exports');
const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

// ─────────────────────────────────────────────────────────────────────────────
// DOCX EXPORT FOR CHAT ARTIFACTS
// ─────────────────────────────────────────────────────────────────────────────

const EXPORT_REVIEW_NOTICE =
  'DRAFT — NOT AGENCY-VALIDATED. This document may contain AI-generated content and is not an agency submission or agency decision. Qualified human review and approval are required before use in regulated submissions, clinical/safety decisions, or external communications.';

/**
 * Thin adapter over the canonical export review gate
 * (server/services/export/exportReviewGate.ts). All decision logic lives
 * there; this only renders a rejection into this router's `sendError`
 * envelope.
 */
function validateExportGovernance(req: Request, res: Response): ExportGovernance | null {
  const evaluation = evaluateExportGovernance(req.body?.governance);
  if (!evaluation.ok) {
    sendError(res, evaluation.status, evaluation.message, evaluation.details, evaluation.code);
    return null;
  }

  applyExportGovernanceHeaders(res, evaluation.governance);
  return evaluation.governance;
}

/**
 * POST /api/concept2cure/artifacts/export-docx
 * Generate a DOCX file from title + content and return as a download.
 * Used by the Copilot to export AI-generated documents.
 */
router.post('/artifacts/export-docx', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(500),
      content: z.string().min(1).max(1000000),
    });
    const { title, content } = schema.parse(req.body);
    const governance = validateExportGovernance(req, res);
    if (!governance) return;
    const exportBody = `${EXPORT_REVIEW_NOTICE}\n\n${content}`;

    // Dynamic import to avoid circular dependency issues
    const { generateDocxBuffer } = await import('../../services/docxGenerator');
    const buffer = await generateDocxBuffer(title, exportBody);

    const safeFilename = title.replace(/[^a-zA-Z0-9_.-]/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.docx"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to export DOCX', { error: error.message });
    return sendError(res, 500, 'Failed to export DOCX');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PDF EXPORT FOR CHAT ARTIFACTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/artifacts/export-pdf
 * Generate a PDF from artifact content
 */
router.post('/artifacts/export-pdf', async (req: Request, res: Response) => {
  // Validate input
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: 'title and content are required' });
  }

  const governance = validateExportGovernance(req, res);
  if (!governance) return;

  try {
    // Use pdf-lib to create a PDF from the content
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

    const pdfDoc = await PDFDocument.create();
    const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    const fontSize = 11;
    const titleFontSize = 18;
    const headingFontSize = 14;
    const margin = 72; // 1 inch
    const pageWidth = 612; // Letter size
    const pageHeight = 792;
    const maxWidth = pageWidth - 2 * margin;

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;

    // Title
    page.drawText(title, {
      x: margin,
      y: y,
      size: titleFontSize,
      font: timesBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= titleFontSize + 20;

    // Date line
    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    page.drawText(dateStr, {
      x: margin,
      y: y,
      size: 9,
      font: timesRoman,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= 30;

    {
      const noticeLines = EXPORT_REVIEW_NOTICE.match(/.{1,110}(\s|$)/g) ?? [EXPORT_REVIEW_NOTICE];
      for (const noticeLine of noticeLines) {
        page.drawText(noticeLine.trim(), {
          x: margin,
          y,
          size: 9,
          font: timesBold,
          color: rgb(0.65, 0.3, 0.2),
        });
        y -= 12;
      }
      y -= 6;
    }

    // Draw a separator line
    page.drawLine({
      start: { x: margin, y: y },
      end: { x: pageWidth - margin, y: y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 20;

    // Content - split by lines, handle headings and paragraphs
    const lines = content.split('\n');
    for (const line of lines) {
      // Check if we need a new page
      if (y < margin + 40) {
        // Add page number to current page
        const pageNum = pdfDoc.getPageCount();
        page.drawText(`Page ${pageNum}`, {
          x: pageWidth / 2 - 20,
          y: margin / 2,
          size: 9,
          font: timesRoman,
          color: rgb(0.5, 0.5, 0.5),
        });
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }

      if (line.startsWith('# ')) {
        y -= 10;
        const text = line.slice(2);
        page.drawText(text, {
          x: margin,
          y,
          size: titleFontSize,
          font: timesBold,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= titleFontSize + 8;
      } else if (line.startsWith('## ')) {
        y -= 8;
        const text = line.slice(3);
        page.drawText(text, {
          x: margin,
          y,
          size: headingFontSize,
          font: timesBold,
          color: rgb(0.15, 0.15, 0.15),
        });
        y -= headingFontSize + 6;
      } else if (line.startsWith('### ')) {
        y -= 6;
        const text = line.slice(4);
        page.drawText(text, { x: margin, y, size: 12, font: timesBold, color: rgb(0.2, 0.2, 0.2) });
        y -= 18;
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        const text = '  \u2022 ' + line.slice(2);
        // Word wrap
        const words = text.split(' ');
        let currentLine = '';
        for (const word of words) {
          const testLine = currentLine ? currentLine + ' ' + word : word;
          const width = timesRoman.widthOfTextAtSize(testLine, fontSize);
          if (width > maxWidth - 20) {
            page.drawText(currentLine, {
              x: margin + 10,
              y,
              size: fontSize,
              font: timesRoman,
              color: rgb(0.2, 0.2, 0.2),
            });
            y -= fontSize + 4;
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          page.drawText(currentLine, {
            x: margin + 10,
            y,
            size: fontSize,
            font: timesRoman,
            color: rgb(0.2, 0.2, 0.2),
          });
          y -= fontSize + 4;
        }
      } else if (line.trim() === '') {
        y -= 8;
      } else {
        // Regular paragraph with word wrap
        const cleanText = line.replace(/\*\*/g, '');
        const words = cleanText.split(' ');
        let currentLine = '';
        for (const word of words) {
          const testLine = currentLine ? currentLine + ' ' + word : word;
          const width = timesRoman.widthOfTextAtSize(testLine, fontSize);
          if (width > maxWidth) {
            if (y < margin + 40) {
              const pageNum = pdfDoc.getPageCount();
              page.drawText(`Page ${pageNum}`, {
                x: pageWidth / 2 - 20,
                y: margin / 2,
                size: 9,
                font: timesRoman,
                color: rgb(0.5, 0.5, 0.5),
              });
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              y = pageHeight - margin;
            }
            page.drawText(currentLine, {
              x: margin,
              y,
              size: fontSize,
              font: timesRoman,
              color: rgb(0.2, 0.2, 0.2),
            });
            y -= fontSize + 4;
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) {
          page.drawText(currentLine, {
            x: margin,
            y,
            size: fontSize,
            font: timesRoman,
            color: rgb(0.2, 0.2, 0.2),
          });
          y -= fontSize + 4;
        }
      }
    }

    // Add page number to last page
    const pageNum = pdfDoc.getPageCount();
    page.drawText(`Page ${pageNum}`, {
      x: pageWidth / 2 - 20,
      y: margin / 2,
      size: 9,
      font: timesRoman,
      color: rgb(0.5, 0.5, 0.5),
    });

    const pdfBytes = await pdfDoc.save();
    const safeTitle = title.replace(/[^a-zA-Z0-9_.-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (error: any) {
    logger.error('Failed to export PDF', { error: error.message });
    return sendError(res, 500, 'Failed to generate PDF');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PPTX EXPORT FOR CHAT ARTIFACTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/concept2cure/artifacts/export-pptx
 * Generate a PowerPoint presentation from title + content and return as a download.
 * Used by AnA to export AI-generated presentations, training decks, and briefings.
 */
router.post('/artifacts/export-pptx', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(500),
      content: z.string().min(1).max(1000000),
      nanoBanana: z.boolean().optional(), // opt-in to Nano Banana cover image
    });
    const { title, content, nanoBanana } = schema.parse(req.body);
    const governance = validateExportGovernance(req, res);
    if (!governance) return;
    const exportBody = `${EXPORT_REVIEW_NOTICE}\n\n${content}`;

    // If Nano Banana is enabled and configured, generate the full presentation with cover
    if (nanoBanana) {
      try {
        const { isConfigured, generatePresentation } = await import(
          '../../services/nanoBananaService'
        );
        if (isConfigured()) {
          const result = await generatePresentation({
            topic: title,
            slideCount: Math.min(exportBody.split(/\n---\n/).length || 6, 12),
            audience: 'scientific',
            generateImages: true,
          });
          const safeFilename = title.replace(/[^a-zA-Z0-9_.-]/g, '_');
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
          );
          res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.pptx"`);
          res.setHeader('Content-Length', result.pptxBuffer.length);
          return res.send(result.pptxBuffer);
        }
      } catch (nbErr: any) {
        // Fall through to standard PPTX generation
        console.warn('[pptx-export] Nano Banana enhancement failed, falling back:', nbErr.message);
      }
    }

    const { generatePptxBuffer } = await import('../../services/pptxGenerator');
    const buffer = await generatePptxBuffer(title, exportBody);

    const safeFilename = title.replace(/[^a-zA-Z0-9_.-]/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.pptx"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, 'Validation failed', error.errors, 'VALIDATION_ERROR');
    }
    logger.error('Failed to export PPTX', { error: error.message });
    return sendError(res, 500, 'Failed to export PPTX');
  }
});

/* ── Download of a rendered file ──────────────────────────────────────────── */

router.get('/documents/download/:filename', async (req: Request, res: Response) => {
  try {
    // ── Export role check ───────────────────────────────────────────
    const exportRole = (req.userRole || 'user').toLowerCase();
    const canExport = ['admin', 'approver', 'reviewer', 'author', 'user'].includes(exportRole);
    if (!canExport) {
      return sendError(res, 403, 'Your role does not permit document exports');
    }

    const filename = paramStr(req.params.filename);
    // Sanitize: only allow alphanumeric, dashes, underscores, dots
    const safe = filename.replace(/[^a-zA-Z0-9_.\-]/g, '');
    if (!safe || safe !== filename || safe.includes('..')) {
      return sendError(res, 400, 'Invalid filename');
    }

    const { resolve, join } = await import('path');
    const { access, stat } = await import('fs/promises');
    const { createReadStream } = await import('fs');

    const docDir = resolve(process.cwd(), 'generated_documents');
    const filePath = join(docDir, safe);

    // Ensure the resolved path is within generated_documents (prevent traversal)
    if (!filePath.startsWith(docDir)) {
      return sendError(res, 400, 'Invalid path');
    }

    await access(filePath);
    const fileStat = await stat(filePath);

    // ── Audit: log every export/download ──────────────────────────────
    const exportHash = crypto
      .createHash('sha256')
      .update(`${safe}:${fileStat.size}:${fileStat.mtimeMs}`)
      .digest('hex');
    await logAuditEntry(req, 'EXPORT', 'artifact', safe, null, {
      filename: safe,
      fileSize: fileStat.size,
      exportHash,
      exportedAt: new Date().toISOString(),
      exportedBy: req.userEmail || 'unknown',
      exportedByRole: req.userRole || 'user',
    });

    // ── Provenance: record export event ───────────────────────────────
    try {
      const organizationId = getOrganizationId(req);
      const userId = getUserId(req);
      const actorName = (req as any).userName || req.userEmail || 'unknown';
      const actorEmail = req.userEmail || 'unknown';
      const actorRole = (req.userRole || 'user').toLowerCase();

      await db.insert(concept2cureProvenanceEvents).values({
        organizationId,
        eventId: `evt_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        eventType: 'export',
        eventAction: 'document_download',
        sourceDescription: `Document "${safe}" downloaded (${fileStat.size} bytes)`,
        actorId: userId,
        actorName,
        actorEmail,
        backendRoute: `/documents/download/${safe}`,
        backendService: 'concept2cure-api',
        ipAddress: getClientIp(req),
        details: { filename: safe, fileSize: fileStat.size, exportHash },
      } as never);

      // ── Snapshot: create export snapshot record ─────────────────────
      // Try to find matching artifact by filename pattern
      const filenameBase = safe.replace(/\.(docx|pdf|json)$/, '');
      const matchingArtifacts = await db
        .select()
        .from(concept2cureArtifacts)
        .where(eq(concept2cureArtifacts.organizationId, organizationId))
        .limit(50);

      const matchedArtifact = matchingArtifacts.find(
        a =>
          a.title?.toLowerCase().replace(/\s+/g, '_').includes(filenameBase.toLowerCase()) ||
          filenameBase.toLowerCase().includes(a.title?.toLowerCase().replace(/\s+/g, '_') || '---')
      );

      const snapshotId = `snap_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      await db.insert(concept2cureSubmissionSnapshots).values({
        snapshotId,
        artifactId: matchedArtifact?.id || 0,
        organizationId,
        versionId: matchedArtifact?.version || 0,
        approvedVersionId: matchedArtifact?.approvedVersionId ?? null,
        publishedVersionId: matchedArtifact?.publishedVersionId ?? null,
        contentHash: exportHash,
        exportHash,
        title: matchedArtifact?.title || safe,
        ctdSection: matchedArtifact?.ctdSection || null,
        templateId: matchedArtifact?.templateId || null,
        filename: safe,
        fileSize: fileStat.size,
        actionType: 'export-docx',
        actorId: userId,
        actorName,
        actorEmail,
        actorRole,
        metadata: {
          filename: safe,
          fileSize: fileStat.size,
          exportHash,
          exportedAt: new Date().toISOString(),
          artifactId: matchedArtifact?.artifactId || null,
        },
      });
    } catch {
      // Don't fail download if provenance/snapshot logging fails
    }

    const isDocx = safe.endsWith('.docx');
    const isJson = safe.endsWith('.json');

    res.setHeader(
      'Content-Type',
      isDocx
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : isJson
        ? 'application/json'
        : 'application/octet-stream'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);

    createReadStream(filePath).pipe(res);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return sendError(res, 404, 'Document not found');
    }
    logger.error('Download failed', { error: error.message });
    return sendError(res, 500, 'Download failed');
  }
});


/* ── Submission package manifest ──────────────────────────────────────────── */

// ── Submission Package Export ─────────────────────────────────────────────────

/**
 * POST /api/concept2cure/projects/:projectId/submission-package
 * Assemble an eCTD submission package manifest from project artifacts.
 * Returns structured manifest with CTD module assignments and readiness status.
 */
router.post('/projects/:projectId/submission-package', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const projectDbId = parseInt(paramStr(req.params.projectId), 10);
    if (isNaN(projectDbId)) return sendError(res, 400, 'Invalid project ID');

    // Fetch the project
    const [project] = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectDbId),
          eq(projects.organizationId, organizationId)
        )
      );

    if (!project) return sendError(res, 404, 'Project not found');

    // Fetch all project artifacts
    const artifacts = await db
      .select()
      .from(concept2cureArtifacts)
      .where(
        and(
          eq(concept2cureArtifacts.projectId, projectDbId),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      );

    // Only include approved or locked artifacts in the package
    const eligibleArtifacts = artifacts.filter(
      a => a.status === 'approved' || a.status === 'locked'
    );
    const ineligibleArtifacts = artifacts.filter(
      a => a.status !== 'approved' && a.status !== 'locked'
    );

    // Organize by CTD module
    const moduleMap: Record<
      string,
      Array<{ id: number; title: string; ctdSection: string; status: string; version: number }>
    > = {};
    for (const a of eligibleArtifacts) {
      const section = a.ctdSection || 'unplaced';
      const moduleKey = section === 'unplaced' ? 'unplaced' : `module-${section.charAt(0)}`;
      if (!moduleMap[moduleKey]) moduleMap[moduleKey] = [];
      moduleMap[moduleKey].push({
        id: a.id,
        title: a.title,
        ctdSection: section,
        status: a.status || 'draft',
        version: a.version || 1,
      });
    }

    // Compute readiness
    const totalArtifacts = artifacts.length;
    const eligibleCount = eligibleArtifacts.length;
    const readinessPercent =
      totalArtifacts > 0 ? Math.round((eligibleCount / totalArtifacts) * 100) : 0;
    const isReady = readinessPercent === 100 && totalArtifacts > 0;

    const manifest = {
      projectId: projectDbId,
      projectName: project.name,
      projectType: project.type || 'IND',
      generatedAt: new Date().toISOString(),
      readiness: {
        percent: readinessPercent,
        ready: isReady,
        eligible: eligibleCount,
        total: totalArtifacts,
        ineligible: ineligibleArtifacts.map(a => ({
          id: a.id,
          title: a.title,
          status: a.status || 'draft',
          reason: `Status is "${a.status || 'draft'}" — must be approved or locked`,
        })),
      },
      modules: moduleMap,
      packageStructure: {
        'module-1': {
          label: 'Module 1 — Administrative Information',
          artifacts: moduleMap['module-1'] || [],
        },
        'module-2': { label: 'Module 2 — CTD Summaries', artifacts: moduleMap['module-2'] || [] },
        'module-3': { label: 'Module 3 — Quality', artifacts: moduleMap['module-3'] || [] },
        'module-4': {
          label: 'Module 4 — Nonclinical Study Reports',
          artifacts: moduleMap['module-4'] || [],
        },
        'module-5': {
          label: 'Module 5 — Clinical Study Reports',
          artifacts: moduleMap['module-5'] || [],
        },
        unplaced: { label: 'Unplaced Artifacts', artifacts: moduleMap['unplaced'] || [] },
      },
    };

    // Audit trail
    await logAuditEntry(req, 'EXPORT', 'submission_package', String(projectDbId), null, {
      readinessPercent,
      eligibleCount,
      totalArtifacts,
    });

    return sendSuccess(res, manifest);
  } catch (error: any) {
    logConcept2cureError('submission package export', error, { projectId: req.params.projectId });
    return sendError(res, 500, 'Failed to generate submission package');
  }
});

export default router;
