import { Router } from 'express';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { z } from 'zod';
import { stylePacks } from '../export/stylePacks/config';
import { renderPdfBuffersFor510k } from '../export/renderers';
import { authMiddleware } from '../auth';
import { createGovernedExportConsequence } from '../services/export/governedExportConsequence';
import { fillEstarSubmission } from '../services/pathway-engines/estar/estar-fill';
import {
  descriptorFor,
  listVendoredTemplates,
  type EstarTemplateVariant,
} from '../services/pathway-engines/estar/estar-template-registry';
import { listAcroFields } from '../services/forms/fill-official-pdf';

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
      title: meta.title || meta.submissionName || `${meta.id} — 510(k) content package (draft)`,
      contentForArtifact: typeof content === 'string' ? content : JSON.stringify(content),
      sourceType: 'export_estar_zip',
      ctdSection: meta.ctdSection || 'm1.5',
      suggestedPlacement: 'Module 1 / 510(k) content package (draft)',
      backendRoute: 'POST /api/510k/estar/build',
      binaryOutput: zipBuffer,
      mimeType: 'application/zip',
      filename,
      // This route produces a ZIP of rendered section PDFs, NOT the official FDA
      // eSTAR interactive PDF that CDRH ingests. `officialEstarPdf: false` keeps
      // that honest so no downstream surface presents this as a submittable eSTAR.
      metadata: { format: 'zip', attachmentCount: attachments.length, package: 'eSTAR', officialEstarPdf: false },
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

const ESTAR_TYPES = ['510k', 'de_novo'] as const;
const ESTAR_VARIANTS = ['device', 'ivd'] as const;

/** Turn an AcroForm field name into a stable, readable canonical-key placeholder. */
function slugifyAcroFieldName(name: string): string {
  const tail = name.split(/[.\\/[\]]/).filter(Boolean).pop() ?? name;
  const camel = tail
    // Split camelCase / number boundaries so "DeviceName" → "Device Name".
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
  return camel || tail;
}

const scaffoldSchema = z.object({
  type: z.enum(ESTAR_TYPES),
  variant: z.enum(ESTAR_VARIANTS),
  /** Inline the official template bytes (base64) when it isn't vendored yet. */
  templateBase64: z.string().min(1).optional(),
});

/**
 * POST /api/510k/estar/scaffold-field-map
 * body: { type, variant, templateBase64? }
 *
 * Maintainer tool: enumerate the AcroForm fields of the official eSTAR template
 * (from the request body or the vendored drop-point) and emit a field-map
 * skeleton to paste into estar-field-map.ts. This NEVER guesses canonical keys —
 * it slugifies the real AcroField names so a maintainer renames + verifies them.
 */
router.post('/scaffold-field-map', authMiddleware, requireEditorAccess, async (req, res) => {
  const validation = scaffoldSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'Invalid request payload',
      details: validation.error.flatten(),
    });
  }

  const { type, variant, templateBase64 } = validation.data;
  const descriptor = descriptorFor(type, variant as EstarTemplateVariant);
  if (!descriptor) {
    return res.status(400).json({ error: `No eSTAR template descriptor for ${type}/${variant}.` });
  }

  try {
    let templateBytes: Buffer | null = null;
    if (templateBase64) {
      templateBytes = Buffer.from(templateBase64, 'base64');
    } else {
      const vendored = await listVendoredTemplates();
      const hit = vendored.find(
        (t) => t.fileName.toLowerCase() === descriptor.expectedFileName.toLowerCase(),
      );
      templateBytes = hit ? hit.bytes : null;
    }

    if (!templateBytes || templateBytes.length === 0) {
      return res.status(422).json({
        error: 'ESTAR_TEMPLATE_UNAVAILABLE',
        message:
          `No official eSTAR template available to scaffold against. Provide templateBase64, ` +
          `or vendor "${descriptor.expectedFileName}" into assets/estar-templates/ (or ESTAR_TEMPLATE_DIR).`,
        descriptorId: descriptor.id,
        expectedFileName: descriptor.expectedFileName,
      });
    }

    const fields = await listAcroFields(templateBytes);
    const fillableTypes = new Set(['text', 'checkbox', 'dropdown', 'radio']);
    const skeleton: Record<string, { acroField: string; type: string }> = {};
    const nonFillable: { name: string; type: string }[] = [];
    const usedKeys = new Set<string>();
    for (const f of fields) {
      if (!fillableTypes.has(f.type)) {
        nonFillable.push(f);
        continue;
      }
      let key = slugifyAcroFieldName(f.name);
      let suffix = 2;
      while (usedKeys.has(key)) key = `${slugifyAcroFieldName(f.name)}${suffix++}`;
      usedKeys.add(key);
      skeleton[key] = { acroField: f.name, type: f.type };
    }

    return res.status(200).json({
      descriptorId: descriptor.id,
      expectedFileName: descriptor.expectedFileName,
      fieldCount: fields.length,
      fillableCount: Object.keys(skeleton).length,
      // Paste into ESTAR_FIELD_MAPS[descriptorId] after renaming/verifying keys.
      skeleton,
      nonFillable,
      note:
        'Canonical keys are slugified placeholders from the real AcroField names — rename them to ' +
        'your canonical keys and verify each acroField before committing to estar-field-map.ts.',
    });
  } catch (error: any) {
    logger.error('scaffold-field-map failure', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: 'ESTAR_SCAFFOLD_FAILED',
      message: error.message || 'Failed to enumerate eSTAR template fields',
    });
  }
});

const officialSchema = z.object({
  meta: z.object({
    id: z.string().min(1),
    submissionName: z.string().optional(),
    projectId: z.coerce.number().int().positive(),
    title: z.string().optional(),
    ctdSection: z.string().optional(),
  }),
  type: z.enum(ESTAR_TYPES),
  variant: z.enum(ESTAR_VARIANTS),
  /** Canonical field values to write into the official eSTAR AcroForm. */
  data: z.record(z.unknown()).default({}),
  flatten: z.boolean().optional(),
});

/**
 * POST /api/510k/estar/official
 * body: { meta, type, variant, data, flatten? }
 *
 * Produce the OFFICIAL FDA eSTAR interactive PDF (the artifact CDRH ingests),
 * not the draft section-PDF ZIP. Honest fail-closed: when the official template
 * isn't vendored or its field map isn't populated, `fillEstarSubmission` returns
 * `filled:false` with blockers and this responds 422 — never a fabricated PDF.
 * The `officialEstarPdf` flag is wired to `result.filled`, so it flips true on
 * its own the moment the template + verified field map land (no code change).
 */
router.post('/official', authMiddleware, requireEditorAccess, async (req, res) => {
  const validation = officialSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'Invalid request payload',
      details: validation.error.flatten(),
    });
  }

  const { meta, type, variant, data, flatten } = validation.data;

  try {
    const result = await fillEstarSubmission({
      type,
      variant: variant as EstarTemplateVariant,
      data,
      flatten,
    });

    if (!result.filled || !result.pdfBytes) {
      // Honest fail-closed: we cannot produce a submittable eSTAR yet.
      return res.status(422).json({
        error: 'ESTAR_NOT_PRODUCIBLE',
        officialEstarPdf: false,
        descriptorId: result.descriptorId,
        templateAvailable: result.templateAvailable,
        fieldMapPopulated: result.fieldMapPopulated,
        blockers: result.blockers,
      });
    }

    const filename = `${sanitizeFilename(meta.id)}_eSTAR.pdf`;
    const consequence = await createGovernedExportConsequence({
      organizationId: getOrganizationId(req),
      projectId: meta.projectId,
      userId: getUserId(req),
      title: meta.title || meta.submissionName || `${meta.id} — official FDA eSTAR`,
      contentForArtifact: JSON.stringify({ type, variant, descriptorId: result.descriptorId, data }),
      sourceType: 'export_estar_pdf',
      ctdSection: meta.ctdSection || 'm1.5',
      suggestedPlacement: 'Module 1 / official FDA eSTAR (submittable)',
      backendRoute: 'POST /api/510k/estar/official',
      binaryOutput: Buffer.from(result.pdfBytes),
      mimeType: 'application/pdf',
      filename,
      // The real submittable artifact was produced — assert it truthfully.
      metadata: {
        format: 'pdf',
        package: 'eSTAR',
        officialEstarPdf: true,
        descriptorId: result.descriptorId,
        filledFields: result.filledFields,
        skippedFields: result.skippedFields,
      },
    });

    return res.status(200).json(consequence);
  } catch (error: any) {
    logger.error('official eSTAR export failure', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: 'GOVERNED_EXPORT_FAILED',
      message: error.message || 'Official eSTAR export failed before consequence persistence',
    });
  }
});

export default router;
