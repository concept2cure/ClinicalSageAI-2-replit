import { Router } from 'express';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { z } from 'zod';
import { stylePacks } from '../export/stylePacks/config';
import { renderPdfBuffersFor510k } from '../export/renderers';
import { authMiddleware } from '../auth';
import { createGovernedExportConsequence } from '../services/export/governedExportConsequence';

import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('510k-estar-routes');

const router = Router();

const allowedRoles = new Set(['admin', 'owner', 'editor', 'super_admin']);
const requireEditorAccess = (req: any, res: any, next: () => void) => {
  const role = String(req.userRole || req.user?.role || '').toLowerCase();
  if (!role || !allowedRoles.has(role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const orgId = tenantOrg || userOrg;
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

const attachmentSchema = z.object({
  filename: z.string().min(1),
  buffer: z.string().min(1),
  mimeType: z.string().optional(),
});

const requestSchema = z.object({
  meta: z.object({
    id: z.string().min(1),
    submissionName: z.string().optional(),
    projectId: z.coerce.number().int().positive(),
    title: z.string().optional(),
    ctdSection: z.string().optional(),
  }),
  content: z.any(),
  attachments: z.array(attachmentSchema).optional(),
});

const MAX_ATTACHMENTS = 50;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

const sanitizeFilename = (value: string) => {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned.replace(/_+/g, '_');
};

function getUserId(req: any): number {
  const raw = req.userId ?? req.user?.id;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Valid numeric userId is required for governed eSTAR export');
  }
  return parsed;
}

function getOrganizationId(req: any): number {
  const parsed = Number(req.resolvedOrganizationId ?? req.user?.organizationId ?? req.tenantId);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Valid numeric organizationId is required for governed eSTAR export');
  }
  return parsed;
}

async function buildZipBuffer(
  pdf: Awaited<ReturnType<typeof renderPdfBuffersFor510k>>,
  attachments: Array<{ filename: string; buffer: string }>
) {
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
  archive.append(pdf.coverLetter, { name: '01_CoverLetter.pdf' });
  archive.append(pdf.summary, { name: '02_510kSummary.pdf' });
  archive.append(pdf.deviceDescription, { name: '03_DeviceDescription.pdf' });
  archive.append(pdf.seDiscussion, { name: '04_SE_Discussion.pdf' });
  archive.append(pdf.performanceTesting, { name: '05_PerformanceTesting.pdf' });
  archive.append(pdf.labeling, { name: '06_Labeling.pdf' });

  for (const attachment of attachments) {
    const buffer = Buffer.from(attachment.buffer, 'base64');
    const safeName = sanitizeFilename(attachment.filename);
    archive.append(buffer, { name: `attachments/${safeName}` });
  }

  // Register the end/error listener BEFORE finalize() so the promise
  // captures the 'end' event regardless of how quickly the archive
  // flushes. Same race fix as buildZipBuffer in cerv2-export-routes.ts
  // (PR #488). Earlier ordering hung the route under fast stream
  // completion (and consistently under vitest mocks).
  const finalized = new Promise<void>((resolve, reject) => {
    pass.on('end', () => resolve());
    pass.on('error', reject);
  });
  await archive.finalize();
  await finalized;
  if (archiveError) throw archiveError;
  return Buffer.concat(chunks);
}

/**
 * POST /api/510k/estar/build
 * body: { meta, content, attachments[] }
 * returns: zip file stream with FDA-named PDFs + attachments/
 */
router.post('/build', authMiddleware, requireEditorAccess, async (req, res) => {
  const validation = requestSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'Invalid request payload',
      details: validation.error.flatten(),
    });
  }

  const { meta, content, attachments = [] } = validation.data;

  if (attachments.length > MAX_ATTACHMENTS) {
    return res.status(400).json({
      error: `Attachment limit exceeded (${MAX_ATTACHMENTS})`,
    });
  }

  let totalBytes = 0;
  for (const attachment of attachments) {
    const buffer = Buffer.from(attachment.buffer, 'base64');
    totalBytes += buffer.length;
    if (buffer.length > MAX_ATTACHMENT_BYTES) {
      return res.status(400).json({
        error: `Attachment ${attachment.filename} exceeds ${MAX_ATTACHMENT_BYTES} bytes`,
      });
    }
  }

  if (totalBytes > MAX_TOTAL_BYTES) {
    return res.status(400).json({
      error: `Total attachment payload exceeds ${MAX_TOTAL_BYTES} bytes`,
    });
  }

  try {
    const pdf = await renderPdfBuffersFor510k(content, stylePacks['510k_v1']);
    const zipBuffer = await buildZipBuffer(pdf, attachments);
    const filename = `${sanitizeFilename(meta.id)}_eSTAR.zip`;
    const consequence = await createGovernedExportConsequence({
      organizationId: getOrganizationId(req),
      projectId: meta.projectId,
      userId: getUserId(req),
      title: meta.title || meta.submissionName || `${meta.id} eSTAR Export`,
      contentForArtifact: typeof content === 'string' ? content : JSON.stringify(content),
      sourceType: 'export_estar_zip',
      ctdSection: meta.ctdSection || 'm1.5',
      suggestedPlacement: 'Module 1 / 510(k) eSTAR package',
      backendRoute: 'POST /api/510k/estar/build',
      binaryOutput: zipBuffer,
      mimeType: 'application/zip',
      filename,
      metadata: { format: 'zip', attachmentCount: attachments.length, package: 'eSTAR' },
    });

    return res.status(200).json(consequence);
  } catch (error: any) {
    logger.error('governed export failure', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({
      error: 'GOVERNED_EXPORT_FAILED',
      message: error.message || 'Governed eSTAR export failed before consequence persistence',
    });
  }
});

export default router;
