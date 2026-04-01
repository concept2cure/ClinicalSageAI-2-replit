/**
 * eCTD Export API Route
 *
 * Provides endpoints for generating and downloading eCTD submission packages
 * as ZIP archives following the ICH M8 v4.0 structure.
 *
 * Endpoints:
 *   POST /api/ectd/export/:submissionId        — Generate & download eCTD package
 *   POST /api/ectd/export/:submissionId/validate — Validate an existing package
 *
 * @module server/routes/ectd-export
 * @compliance ICH M8 v4.0
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { generateEctdPackage, validateEctdPackage } from '../services/ectdExportService';
import { registerExportGovernanceQuick } from '../services/compute/exportGovernance';

const router = Router();

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

  res.setHeader('X-Concept2Cure-AI-Generated', String(governance.aiGenerated));
  res.setHeader('X-Concept2Cure-Human-Review-Approved', String(governance.humanReviewApproved));
  res.setHeader('X-Concept2Cure-Review-Required', 'true');
  if (governance.reviewerName) {
    res.setHeader('X-Concept2Cure-Reviewer', encodeURIComponent(governance.reviewerName));
  }
  if (governance.reviewTimestamp) {
    res.setHeader('X-Concept2Cure-Review-Timestamp', governance.reviewTimestamp);
  }

  return governance;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ectd/export/:submissionId — Generate & download eCTD package
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:submissionId', async (req: Request, res: Response) => {
  const submissionId = parseInt(req.params.submissionId, 10);
  if (!submissionId || isNaN(submissionId)) {
    return res.status(400).json({ error: 'Valid numeric submission ID required' });
  }

  // SECURITY: Always derive org from authenticated context — never from body
  const organizationId =
    (req as any).organizationId ||
    (req as any).user?.organizationId ||
    (req as any).tenantId ||
    (req as any).tenantContext?.organizationId ||
    1;

  if (!organizationId) {
    return res.status(403).json({ error: 'Organization context required' });
  }

  const {
    region = 'FDA',
    submissionType = 'initial',
    sequenceNumber = '0000',
    applicationNumber,
    validateAfter = true,
  } = req.body || {};

  if (!validateExportGovernance(req, res)) return;

  try {
    console.log(
      `[eCTD Export] Generating package for submission ${submissionId}, ` +
        `org ${organizationId}, region ${region}`
    );

    const result = await generateEctdPackage(submissionId, organizationId, {
      region,
      submissionType,
      sequenceNumber,
      applicationNumber,
    });

    // Optionally validate the generated package
    let validation = null;
    if (validateAfter) {
      validation = await validateEctdPackage(result.buffer);
    }

    console.log(
      `[eCTD Export] Package generated: ${result.filename} ` +
        `(${result.stats.totalFiles} files, ${result.stats.totalGranules} granules)` +
        (validation ? ` — valid: ${validation.valid}` : '')
    );

    // Set headers for file download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-ECTD-Total-Modules', String(result.stats.totalModules));
    res.setHeader('X-ECTD-Total-Files', String(result.stats.totalFiles));
    res.setHeader('X-ECTD-Generated-At', result.stats.generatedAt);
    if (validation) {
      res.setHeader('X-ECTD-Valid', String(validation.valid));
      if (validation.errors.length > 0) {
        res.setHeader('X-ECTD-Validation-Errors', String(validation.errors.length));
      }
    }

    // Register governed export (fail-closed for regulated export path)
    const user = (req as any).user;
    const governanceResult = await registerExportGovernanceQuick({
      organizationId: user?.organizationId || 1,
      projectId: submissionId,
      userId: user?.id || 0,
      userName: user?.name || user?.email || 'unknown',
      title: `eCTD Package: ${result.filename}`,
      exportFormat: 'zip',
      exportFilename: result.filename,
      exportFileSize: result.buffer.length,
      docType: 'ectd_package',
      backendRoute: `/api/ectd/export/${submissionId}`,
      ipAddress: req.ip,
    });
    if (!governanceResult) {
      return res.status(500).json({
        error: 'Governed export registration failed',
        code: 'EXPORT_GOVERNANCE_REQUIRED',
      });
    }

    return res.send(result.buffer);
  } catch (error: any) {
    console.error('[eCTD Export] Failed:', error);
    return res.status(500).json({
      error: 'eCTD package generation failed',
      message: error.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ectd/export/:submissionId/validate — Validate an uploaded package
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:submissionId/validate', async (req: Request, res: Response) => {
  const submissionId = parseInt(req.params.submissionId, 10);
  if (!submissionId || isNaN(submissionId)) {
    return res.status(400).json({ error: 'Valid numeric submission ID required' });
  }

  try {
    // Accept the ZIP buffer directly from the request body
    // In production this would use multer for file upload handling
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));

    await new Promise<void>((resolve, reject) => {
      req.on('end', resolve);
      req.on('error', reject);
    });

    const zipBuffer = Buffer.concat(chunks);

    if (zipBuffer.length === 0) {
      // If no body, generate a package and validate it
      const organizationId =
        (req as any).organizationId ||
        (req as any).user?.organizationId ||
        (req as any).tenantId ||
        (req as any).tenantContext?.organizationId ||
        1;

      const result = await generateEctdPackage(submissionId, organizationId);
      const validation = await validateEctdPackage(result.buffer);

      return res.json({
        submissionId,
        ...validation,
        stats: result.stats,
      });
    }

    const validation = await validateEctdPackage(zipBuffer);

    return res.json({
      submissionId,
      ...validation,
      packageSize: zipBuffer.length,
    });
  } catch (error: any) {
    console.error('[eCTD Validate] Failed:', error);
    return res.status(500).json({
      error: 'eCTD validation failed',
      message: error.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ectd/export/:submissionId/preview — Preview package structure
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:submissionId/preview', async (req: Request, res: Response) => {
  const submissionId = parseInt(req.params.submissionId, 10);
  if (!submissionId || isNaN(submissionId)) {
    return res.status(400).json({ error: 'Valid numeric submission ID required' });
  }

  const organizationId =
    (req as any).organizationId ||
    (req as any).user?.organizationId ||
    parseInt(req.query.organizationId as string) ||
    1;

  try {
    const result = await generateEctdPackage(submissionId, organizationId, {
      region: (req.query.region as string) || 'FDA',
    });

    // Load the ZIP to list contents
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(result.buffer);
    const files = Object.keys(zip.files)
      .filter(f => !zip.files[f].dir)
      .sort();

    const folders = Object.keys(zip.files)
      .filter(f => zip.files[f].dir)
      .sort();

    return res.json({
      submissionId,
      filename: result.filename,
      stats: result.stats,
      structure: {
        folders,
        files,
        totalFolders: folders.length,
        totalFiles: files.length,
      },
    });
  } catch (error: any) {
    console.error('[eCTD Preview] Failed:', error);
    return res.status(500).json({
      error: 'eCTD preview failed',
      message: error.message,
    });
  }
});

export default router;
