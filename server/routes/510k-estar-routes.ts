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
import {
  ESTAR_VERSIONS,
  ESTAR_FAMILY_LABELS,
  versionLifecycleAsOf,
} from '../services/pathway-engines/estar/estar-versions';
import {
  ESTAR_CATALOG,
  getCatalogEntry,
  type EstarCatalogKey,
} from '../services/pathway-engines/estar/estar-catalog';
import { assessClientEstarEligibility } from '../services/pathway-engines/estar/estar-registration';
import {
  assessEstarFilingReadiness,
  type FilingLeaf,
} from '../services/pathway-engines/estar/estar-filing-readiness';
import {
  getEstarRegistration,
  upsertEstarRegistration,
  toClientRegistration,
  resolveClientRegistration,
  type EstarRegistrationWrite,
} from '../services/pathway-engines/estar/estar-registration-service';

import { createScopedLogger } from '../utils/logger.js';
import { getMarketSpec } from '../services/market-specs/market-submission-specs';
import { validateLeavesAgainstMarketSpec, type LeafFileDescriptor } from '../services/market-specs/market-formatting-validator';

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

/** Soft org resolver for read paths — returns null instead of throwing. */
function resolveOrgId(req: any): number | null {
  const n = Number(
    req.resolvedOrganizationId ?? req.tenantContext?.organizationId ?? req.user?.organizationId ?? req.tenantId,
  );
  return Number.isInteger(n) && n > 0 ? n : null;
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

    // E1 — ADVISORY market-formatting check. The FDA eSTAR spec (us-estar) already
    // encodes CDRH's file-naming / format / size / no-encryption rules; run the
    // built package's files against it so the author sees formatting problems that
    // would trip acceptance BEFORE submitting. Advisory + non-blocking: it never
    // changes the produced ZIP or the 200 path — a real gate would be a separate,
    // deliberate flag-gated step. Any validator failure is swallowed so it can
    // never break a working build.
    let formattingReport: unknown;
    try {
      const spec = getMarketSpec('us-estar');
      if (spec) {
        const leaves: LeafFileDescriptor[] = [
          { fileName: '01_CoverLetter.pdf', fileFormat: 'PDF', fileSizeBytes: pdf.coverLetter.length },
          { fileName: '02_510kSummary.pdf', fileFormat: 'PDF', fileSizeBytes: pdf.summary.length },
          { fileName: '03_DeviceDescription.pdf', fileFormat: 'PDF', fileSizeBytes: pdf.deviceDescription.length },
          { fileName: '04_SE_Discussion.pdf', fileFormat: 'PDF', fileSizeBytes: pdf.seDiscussion.length },
          { fileName: '05_PerformanceTesting.pdf', fileFormat: 'PDF', fileSizeBytes: pdf.performanceTesting.length },
          { fileName: '06_Labeling.pdf', fileFormat: 'PDF', fileSizeBytes: pdf.labeling.length },
          ...attachments.map((a) => ({
            fileName: sanitizeFilename(a.filename),
            fileSizeBytes: Buffer.from(a.buffer, 'base64').length,
          })),
        ];
        formattingReport = validateLeavesAgainstMarketSpec(spec, leaves);
      }
    } catch (validationErr) {
      logger.warn('eSTAR advisory formatting validation failed (non-fatal)', {
        err: validationErr instanceof Error ? validationErr.message : String(validationErr),
      });
    }

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
      metadata: {
        format: 'zip',
        attachmentCount: attachments.length,
        package: 'eSTAR',
        officialEstarPdf: false,
        formattingErrors: (formattingReport as { errors?: number } | undefined)?.errors ?? 0,
        formattingWarnings: (formattingReport as { warnings?: number } | undefined)?.warnings ?? 0,
      },
    });

    // The advisory formatting report rides alongside the governed consequence so
    // the UI can surface "N formatting issues to fix before submitting" without
    // blocking the draft export.
    return res.status(200).json({ ...consequence, formattingReport: formattingReport ?? null });
  } catch (error: any) {
    logger.error('governed export failure', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({
      error: 'GOVERNED_EXPORT_FAILED',
      message: error.message || 'Governed eSTAR export failed before consequence persistence',
    });
  }
});

// The nIVD/IVD eSTAR (v7.0) carries 510(k), De Novo, and PMA on device/ivd
// variants. PreSTAR request types (Q-Sub/IDE/513(g)) are modeled in the engine
// and exposed via GET /catalog; the official-fill/scaffold endpoints here cover
// the nIVD/IVD marketing family.
const ESTAR_TYPES = ['510k', 'de_novo', 'pma'] as const;
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

const readinessSchema = z.object({
  type: z.enum(ESTAR_TYPES).default('510k'),
  variant: z.enum(ESTAR_VARIANTS).default('device'),
});

/**
 * GET /api/510k/estar/readiness?type=510k&variant=device
 *
 * Read-only honesty probe for the UI: can the OFFICIAL FDA eSTAR PDF be produced
 * for this descriptor yet? Drives the "Generate official eSTAR" button's
 * disabled-with-reason state on the 510(k) surface. This produces and persists
 * NOTHING — `ready` is true only when the official template is vendored AND its
 * field map is populated, the same gate POST /official enforces before it will
 * emit a submittable PDF. When not ready, `blockers` explains exactly why so the
 * surface can show the reason instead of hiding the capability.
 */
router.get('/readiness', authMiddleware, async (req, res) => {
  const validation = readinessSchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid query', details: validation.error.flatten() });
  }
  const { type, variant } = validation.data;
  try {
    // Dry assessment via the single source of truth. With empty data and the
    // default skip policy this is side-effect-free (no persistence); we read
    // only the readiness booleans + blockers and ignore any produced bytes.
    const result = await fillEstarSubmission({
      type,
      variant: variant as EstarTemplateVariant,
      data: {},
    });
    const ready = result.templateAvailable && result.fieldMapPopulated;
    return res.status(200).json({
      descriptorId: result.descriptorId,
      type,
      variant,
      ready,
      officialEstarPdf: ready,
      templateAvailable: result.templateAvailable,
      fieldMapPopulated: result.fieldMapPopulated,
      blockers: ready ? [] : result.blockers,
    });
  } catch (error: any) {
    logger.error('estar readiness probe failure', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: 'ESTAR_READINESS_FAILED',
      message: error.message || 'Failed to assess eSTAR readiness',
    });
  }
});

/**
 * GET /api/510k/estar/catalog
 *
 * Read-only. Returns the whole eSTAR program surface a client can file into:
 * the FDA version table (with each version's lifecycle computed as of today) and
 * the full submission catalog (510(k), De Novo, PMA + supplements, Q-Sub sub-types,
 * IDE, 513(g)). Drives the "start a submission" picker and the version-currency
 * banner. Produces/persists nothing.
 */
router.get('/catalog', authMiddleware, async (_req, res) => {
  try {
    const asOf = new Date().toISOString().slice(0, 10);
    const versions = ESTAR_VERSIONS.map((v) => ({
      ...v,
      familyLabel: ESTAR_FAMILY_LABELS[v.family],
      lifecycle: versionLifecycleAsOf(v, asOf),
    }));
    return res.status(200).json({ asOf, versions, catalog: ESTAR_CATALOG });
  } catch (error: any) {
    logger.error('estar catalog failure', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: 'ESTAR_CATALOG_FAILED',
      message: error.message || 'Failed to build the eSTAR catalog',
    });
  }
});

const REQUIREMENT_ENUM = z.enum([
  'fda_esg_account',
  'cdrh_portal_account',
  'organization_identity',
  'mdufa_fee_account',
]);

// Assess accepts an EXPLICIT registration (what-if) OR, when `satisfied` is
// omitted, falls back to the org's persisted registration record.
const registrationAssessSchema = z.object({
  clientId: z.string().min(1).optional(),
  satisfied: z.array(REQUIREMENT_ENUM).optional(),
  variants: z.array(z.enum(['device', 'ivd'])).optional(),
});

// Upsert payload for the org's stored registration. Tenant/actor/identity are
// resolved server-side; the body only carries the registration facts.
const registrationWriteSchema = z.object({
  fdaEsgAccount: z.boolean().optional(),
  cdrhPortalAccount: z.boolean().optional(),
  organizationIdentity: z.boolean().optional(),
  mdufaFeeAccount: z.boolean().optional(),
  esgAccountId: z.string().max(128).nullish(),
  cdrhPortalEmail: z.string().max(256).nullish(),
  duns: z.string().max(16).nullish(),
  fei: z.string().max(16).nullish(),
  mdufaOrgId: z.string().max(64).nullish(),
  mdufaFeeTier: z.enum(['standard', 'small_business']).nullish(),
  variants: z.array(z.enum(['device', 'ivd'])).optional(),
  notes: z.string().max(2000).nullish(),
});

/**
 * GET /api/510k/estar/registration
 * Returns THIS org's persisted eSTAR registration (source of truth for "clients
 * must register"), plus the bridged eligibility-model shape. `registered:false`
 * with an empty registration when the client has never registered.
 */
router.get('/registration', authMiddleware, async (req, res) => {
  const organizationId = resolveOrgId(req);
  if (!organizationId) return res.status(400).json({ error: 'Organization context required' });
  try {
    const row = await getEstarRegistration({ organizationId });
    return res.status(200).json({
      registered: !!row,
      registration: row,
      clientRegistration: row
        ? toClientRegistration(row)
        : { clientId: String(organizationId), satisfied: [] },
    });
  } catch (error: any) {
    logger.error('estar registration read failure', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: 'ESTAR_REGISTRATION_READ_FAILED',
      message: error.message || 'Failed to read eSTAR registration',
    });
  }
});

/**
 * PUT /api/510k/estar/registration
 * Create/update THIS org's eSTAR registration record (upsert; one per org). This
 * is the actual "register for eSTAR" write — editor+ only. Tenant/actor are set
 * from the session, never the body.
 */
router.put('/registration', authMiddleware, requireEditorAccess, async (req, res) => {
  const validation = registrationWriteSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid request payload', details: validation.error.flatten() });
  }
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const row = await upsertEstarRegistration(validation.data as EstarRegistrationWrite, { organizationId, userId });
    return res.status(200).json({
      registered: true,
      registration: row,
      clientRegistration: toClientRegistration(row),
    });
  } catch (error: any) {
    logger.error('estar registration write failure', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: 'ESTAR_REGISTRATION_WRITE_FAILED',
      message: error.message || 'Failed to save eSTAR registration',
    });
  }
});

/**
 * POST /api/510k/estar/registration/assess
 * body: { satisfied[]?, clientId?, variants? }  (all optional)
 *
 * Report which eSTAR submissions this client can file today and what is still
 * blocking the rest. When `satisfied` is supplied it's a what-if against that
 * explicit state; otherwise it assesses the org's PERSISTED registration record
 * (the "clients must register" source of truth). Nothing is persisted here.
 */
router.post('/registration/assess', authMiddleware, async (req, res) => {
  const validation = registrationAssessSchema.safeParse(req.body ?? {});
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid request payload', details: validation.error.flatten() });
  }
  try {
    let registration;
    if (validation.data.satisfied) {
      // Explicit what-if registration state.
      registration = {
        clientId: validation.data.clientId ?? 'what-if',
        satisfied: validation.data.satisfied,
        variants: validation.data.variants,
      };
    } else {
      // Source of truth: the org's persisted registration.
      const organizationId = resolveOrgId(req);
      if (!organizationId) return res.status(400).json({ error: 'Organization context required' });
      registration = await resolveClientRegistration({ organizationId });
    }
    const report = assessClientEstarEligibility(registration);
    return res.status(200).json(report);
  } catch (error: any) {
    logger.error('estar registration assessment failure', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: 'ESTAR_REGISTRATION_FAILED',
      message: error.message || 'Failed to assess eSTAR registration eligibility',
    });
  }
});

const filingLeafSchema = z.object({
  sectionCode: z.string(),
  title: z.string(),
  documentType: z.string().optional(),
});

const filingReadinessSchema = z.object({
  catalogKey: z.string().min(1),
  variant: z.enum(['device', 'ivd']).default('device'),
  // Optional explicit registration (what-if); omit to use the org's persisted record.
  registration: z
    .object({
      clientId: z.string().min(1),
      satisfied: z.array(REQUIREMENT_ENUM).default([]),
      variants: z.array(z.enum(['device', 'ivd'])).optional(),
    })
    .optional(),
  leaves: z.array(filingLeafSchema).default([]),
  qSubType: z
    .enum([
      'pre_submission',
      'submission_issue_request',
      'informational_meeting',
      'study_risk_determination',
      'pma_day_100_meeting',
      'accessory_classification_request',
    ])
    .optional(),
});

/**
 * POST /api/510k/estar/filing-readiness
 * body: { catalogKey, variant, registration, leaves, qSubType? }
 *
 * The single "can this client file X, and what's left?" answer. Combines
 * registration eligibility + template/version resolution + content readiness (via
 * the right mapper) + official-template producibility into one honest verdict.
 * Producibility is resolved server-side from the fill orchestration, so the caller
 * gets a complete picture. Produces/persists nothing.
 */
router.post('/filing-readiness', authMiddleware, async (req, res) => {
  const validation = filingReadinessSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid request payload', details: validation.error.flatten() });
  }
  const { catalogKey, variant, leaves, qSubType } = validation.data;

  const entry = getCatalogEntry(catalogKey as EstarCatalogKey);
  if (!entry) {
    return res.status(400).json({ error: 'UNKNOWN_CATALOG_KEY', message: `No eSTAR submission catalog entry for "${catalogKey}".` });
  }

  try {
    // Registration: an explicit what-if payload if supplied, else the org's
    // persisted registration record (the "clients must register" source of truth).
    let registration = validation.data.registration;
    if (!registration) {
      const organizationId = resolveOrgId(req);
      if (!organizationId) return res.status(400).json({ error: 'Organization context required' });
      registration = await resolveClientRegistration({ organizationId });
    }

    // Resolve official-template producibility from the single source of truth. The
    // PreSTAR family shares one template across variants; marketing pathways use
    // the device/ivd variant. Empty data ⇒ side-effect-free readiness probe.
    const isPreStar =
      entry.programType === 'q_sub' || entry.programType === 'ide' || entry.programType === '513g';
    const templateVariant: EstarTemplateVariant = isPreStar ? 'prestar' : variant;
    const fill = await fillEstarSubmission({ type: entry.programType, variant: templateVariant, data: {} });

    const result = assessEstarFilingReadiness({
      catalogKey: catalogKey as EstarCatalogKey,
      variant,
      registration,
      leaves: leaves as FilingLeaf[],
      qSubType,
      templateAvailable: fill.templateAvailable,
      fieldMapPopulated: fill.fieldMapPopulated,
    });

    if (!result) {
      return res.status(400).json({ error: 'UNKNOWN_CATALOG_KEY', message: `No eSTAR submission catalog entry for "${catalogKey}".` });
    }
    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('estar filing-readiness failure', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: 'ESTAR_FILING_READINESS_FAILED',
      message: error.message || 'Failed to assess eSTAR filing readiness',
    });
  }
});

export default router;
