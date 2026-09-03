import { Router, type Request } from 'express';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import { z } from 'zod';
import { stylePacks } from '../export/stylePacks/config';
import {
  renderPdfBuffersFor510k,
  renderPdfBuffersPerSection,
  renderCombinedPdf,
  renderCombinedDocx,
} from '../export/renderers';
import { authMiddleware } from '../auth';
import {
  createGovernedExportConsequence,
  createAuditedUnplacedExport,
} from '../services/export/governedExportConsequence';
import { fillEstarSubmission } from '../services/pathway-engines/estar/estar-fill';
import { assembleDeviceSubmission } from '../services/pathway-engines/device-assembly/assemble-device-submission';
import {
  descriptorFor,
  listVendoredTemplates,
  type EstarTemplateVariant,
} from '../services/pathway-engines/estar/estar-template-registry';
import { listAcroFields, listXfaFields, isDynamicXfaPdf } from '../services/forms/fill-official-pdf';
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
  loadDeviceContentLeaves,
  loadAuthoredDeviceSections,
  resolveDeviceContentScope,
  sectionsToEditorJson,
  type AuthoredDeviceSection,
} from '../services/pathway-engines/estar/estar-content-leaves';
import { PMA_SUBMISSION_TYPES } from '../services/pathway-engines/pma/pma-mapper';
import { and, eq } from 'drizzle-orm';
import { requestDb } from '../db/requestDb';
import { fda510kProjects } from '../../shared/schema';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { resolveProgramProjectAnchor } from '../services/c2c/program-project-anchor';
import {
  getEstarRegistration,
  upsertEstarRegistration,
  toClientRegistration,
  resolveClientRegistration,
  type EstarRegistrationWrite,
} from '../services/pathway-engines/estar/estar-registration-service';
import {
  createEstarSubmission,
  listEstarSubmissions,
  getEstarSubmission,
  advanceEstarSubmission,
  EstarSubmissionError,
} from '../services/pathway-engines/estar/estar-submission-service';
import {
  ESTAR_SUBMISSION_STATUSES,
  type EstarSubmissionStatus,
} from '../../shared/schema/estar-submission';

import { createScopedLogger } from '../utils/logger.js';
import { requireEntitlement } from '../services/entitlements/require-entitlement';
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

/**
 * Export meta accepts either the legacy numeric PM-spine project id or a
 * program identifier (`ident`: numeric fda510kProjects.id, regulatoryPrograms
 * UUID, or program code — the same 3-way contract as the document-preview
 * route). At least one is required so every export resolves to a real,
 * org-owned project/program before anything renders.
 */
const exportMetaSchema = z
  .object({
    id: z.string().min(1),
    submissionName: z.string().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    ident: z.string().min(1).optional(),
    title: z.string().optional(),
    ctdSection: z.string().optional(),
  })
  .refine((m) => m.projectId !== undefined || m.ident !== undefined, {
    message: 'meta.projectId or meta.ident is required',
  });

const requestSchema = z
  .object({
    meta: exportMetaSchema,
    /** TipTap editor JSON. Optional when useProjectContent loads it server-side. */
    content: z.any().optional(),
    /** Assemble content from the org's authored cerv2_510k_sections (same
     *  source filing-readiness uses) instead of a client-supplied payload. */
    useProjectContent: z.boolean().optional(),
    /** Narrow useProjectContent to one document's sections when known. */
    documentId: z.coerce.number().int().positive().optional(),
    attachments: z.array(attachmentSchema).optional(),
  })
  .refine((b) => b.content !== undefined || b.useProjectContent === true, {
    message: 'content or useProjectContent is required',
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProjectAnchor {
  /** Numeric PM-spine project id when one exists — required for artifact-registry placement. */
  anchorProjectId: number | null;
  /** The resolved regulatoryPrograms UUID when the ident named a program. */
  programUuid: string | null;
  title: string | null;
}

/**
 * Resolve the export's project anchor, org-scoped, mirroring the
 * document-preview ident contract: numeric → fda510kProjects.id (GA path,
 * carries the numeric anchor the artifact registry needs), UUID → programs.id,
 * else → programs.code. Returns null when nothing in this org matches — the
 * caller must 404, never export against an unresolved project.
 *
 * A UUID/code program resolves its numeric anchor through
 * `projects.regulatory_program_id` (Document Identity Contract slice C1), which
 * intake writes in the same transaction that creates the program. That mapping
 * is what the artifact registry needs — `concept2cure_artifacts.project_id` is
 * an integer FK to `projects.id` and predates the program spine.
 *
 * When no anchor exists — a program created before C1, an intake that skipped
 * it for one of the stated reasons, or a database without the migration — the
 * export is still delivered and audit-logged but explicitly not registry-placed,
 * exactly as before. See the /build handler.
 */
async function resolveProjectAnchor(
  req: Request,
  orgId: number,
  meta: z.infer<typeof exportMetaSchema>,
): Promise<ProjectAnchor | null> {
  // requestDb(req), not the shared `db`: the request-scoped client carries
  // app.current_tenant_id, so these lookups are filtered by RLS as well as by
  // the explicit organizationId predicates below (kept as belt-and-braces, and
  // as documentation of intent). ci:requestdb-coverage enforces this for
  // tenant-facing routes and was failing on this file — it reads
  // fda510k_projects and regulatory_programs, both tenant-keyed.
  const db = requestDb(req);
  const ident = meta.ident ?? (meta.projectId !== undefined ? String(meta.projectId) : '');
  if (!ident) return null;

  if (/^\d+$/.test(ident)) {
    try {
      const [row] = await requestDb(req)
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
    const [row] = await requestDb(req)
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
      // The program spine DOES have a numeric anchor now, when intake created
      // one: Document Identity Contract slice C1 added
      // `projects.regulatory_program_id` and the resolver below. Ask for it
      // before falling back to the audited-unplaced path, so an export for a
      // uuid program lands in the governed registry like any other.
      //
      // A null answer is a fact about the data, not a failure to try — the
      // program predates the anchor, intake skipped it for a stated reason, or
      // the migration is not applied here. The unplaced path stays exactly as
      // it was for that case; this only stops it being taken when a real
      // anchor exists.
      const anchorProjectId = await resolveProgramProjectAnchor(requestDb(req), {
        programId: row.id,
        orgId,
        context: '510k-estar.export',
      });
      return { anchorProjectId, programUuid: row.id, title: row.name ?? null };
    }
  } catch {
    /* fall through */
  }
  return null;
}

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

/** One file in the draft package ZIP. */
interface DraftPackageEntry {
  name: string;
  buffer: Buffer;
}

/**
 * The draft-package families /build can produce, derived from the class of the
 * governed document that answered the content load (PMA_ASSEMBLY):
 *   - '510k' — the six fixed 510(k) section PDFs (also what the legacy store
 *              and a client-supplied payload get, exactly as before);
 *   - 'pma'  — one PDF per authored 21 CFR 814.20 section in outline order plus
 *              the combined PDF/DOCX. A governed PMA used to be forced through
 *              the 510(k) renderer: most of its sections dropped, the
 *              510(k)-only slots stamped "content not found", the ZIP labelled
 *              and ledgered as a 510(k) package.
 * Neither is an eSTAR; the labels below say so.
 */
type DraftPackageFamily = '510k' | 'pma';

const DRAFT_PACKAGE_LABELS: Record<
  DraftPackageFamily,
  { filenameSuffix: string; package: string; title: string; ctdSection: string; suggestedPlacement: string }
> = {
  '510k': {
    filenameSuffix: 'content-package-draft',
    package: 'content package draft (not an eSTAR)',
    title: '510(k) content package (draft)',
    ctdSection: 'm1.5',
    suggestedPlacement: 'Module 1 / 510(k) content package (draft)',
  },
  pma: {
    filenameSuffix: 'pma-content-package-draft',
    package: 'PMA content package draft (not an eSTAR)',
    title: 'PMA content package (draft)',
    ctdSection: 'm2.5',
    suggestedPlacement: 'Module 2 / PMA content package (draft)',
  },
};

function draftPackageFamilyFor(source: string, docType: string | undefined): DraftPackageFamily {
  return source === 'governed_program' && docType === 'pma' ? 'pma' : '510k';
}

/**
 * Render the package's files for its family. The 510(k) family keeps its six
 * fixed slots; the PMA family is every authored section (the editor JSON holds
 * one H1 per authored governed section, in path_order) named by its rule-pack
 * key, plus the combined document through the generic cerv2_pma renderers.
 */
async function renderDraftPackageEntries(
  family: DraftPackageFamily,
  content: unknown,
  packageId: string,
  sections: ReadonlyArray<AuthoredDeviceSection>,
): Promise<DraftPackageEntry[]> {
  if (family === 'pma') {
    const [perSection, combinedPdf, combinedDocx] = await Promise.all([
      renderPdfBuffersPerSection(content, stylePacks['pma_v1']),
      renderCombinedPdf('cerv2_pma', content),
      renderCombinedDocx('cerv2_pma', content),
    ]);
    // The per-section PDFs come back in document order, which is the loader's
    // outline order; the rule-pack key rides along only when the two line up.
    const aligned = perSection.length === sections.length;
    const entries: DraftPackageEntry[] = perSection.map((s, i) => {
      const code = aligned ? sections[i]?.sectionCode : undefined;
      const stem = sanitizeFilename(`${code ?? ''} ${s.title}`.trim()).replace(/^_+|_+$/g, '').slice(0, 80);
      return { name: `${String(i + 1).padStart(2, '0')}_${stem}.pdf`, buffer: s.buffer };
    });
    const id = sanitizeFilename(packageId);
    entries.push({ name: `${id}_Combined.pdf`, buffer: combinedPdf });
    entries.push({ name: `${id}_Combined.docx`, buffer: combinedDocx });
    return entries;
  }
  const pdf = await renderPdfBuffersFor510k(content, stylePacks['510k_v1']);
  return [
    { name: '01_CoverLetter.pdf', buffer: pdf.coverLetter },
    { name: '02_510kSummary.pdf', buffer: pdf.summary },
    { name: '03_DeviceDescription.pdf', buffer: pdf.deviceDescription },
    { name: '04_SE_Discussion.pdf', buffer: pdf.seDiscussion },
    { name: '05_PerformanceTesting.pdf', buffer: pdf.performanceTesting },
    { name: '06_Labeling.pdf', buffer: pdf.labeling },
  ];
}

/** The ONE zip builder for every draft-package family. */
async function buildZipBuffer(
  entries: ReadonlyArray<DraftPackageEntry>,
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
  for (const entry of entries) {
    archive.append(entry.buffer, { name: entry.name });
  }

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
// The three producing/assembling actions of the device_assembly_readiness
// capability are entitlement-gated (ENTITLEMENTS_ENFORCE: off|warn|on — see
// services/entitlements/require-entitlement). Read paths below stay open.
const requireAssemblyEntitlement = requireEntitlement('device_assembly_readiness');

router.post('/build', authMiddleware, requireEditorAccess, requireAssemblyEntitlement, async (req, res) => {
  const validation = requestSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'Invalid request payload',
      details: validation.error.flatten(),
    });
  }

  const { meta, useProjectContent, documentId, attachments = [] } = validation.data;
  let { content } = validation.data;

  const anchor = await resolveProjectAnchor(req, getOrganizationId(req), meta);
  if (!anchor) {
    return res.status(404).json({ error: 'Project not found in your organization' });
  }

  // The package family follows the governed document's class; a client-supplied
  // payload and the legacy store are 510(k)-shaped exactly as before.
  let family: DraftPackageFamily = '510k';
  let authoredSections: AuthoredDeviceSection[] = [];

  if (content === undefined && useProjectContent) {
    // A program anchor reads ITS governed document (the rows the editor saves
    // into) when that document holds authored content; otherwise the legacy
    // store answers as before, and the response says which (ESTAR-01/02).
    const orgId = getOrganizationId(req);
    const { scope, source, docType } = await resolveDeviceContentScope(orgId, {
      programId: documentId === undefined ? (anchor.programUuid ?? undefined) : undefined,
      documentId,
    });
    const sections = await loadAuthoredDeviceSections(orgId, scope);
    if (sections.length === 0) {
      return res.status(422).json({
        error: 'NO_AUTHORED_CONTENT',
        deviceContentSource: source,
        message:
          'No authored device sections found for this organization' +
          (documentId ? ` (document ${documentId})` : '') +
          ' — author section content before exporting a draft package.',
      });
    }
    family = draftPackageFamilyFor(source, docType);
    authoredSections = sections;
    content = sectionsToEditorJson(sections);
  }

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
    const labels = DRAFT_PACKAGE_LABELS[family];
    const entries = await renderDraftPackageEntries(family, content, meta.id, authoredSections);
    const zipBuffer = await buildZipBuffer(entries, attachments);
    const filename = `${sanitizeFilename(meta.id)}_${labels.filenameSuffix}.zip`;

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
          ...entries.map((e) => ({
            fileName: e.name,
            fileFormat: e.name.toLowerCase().endsWith('.docx') ? 'DOCX' : 'PDF',
            fileSizeBytes: e.buffer.length,
          })),
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

    // This route produces a ZIP of rendered section PDFs, NOT the official FDA
    // eSTAR interactive PDF that CDRH ingests. `officialEstarPdf: false` keeps
    // that honest so no downstream surface presents this as a submittable eSTAR,
    // and the package label and file name say what it is rather than borrowing
    // the name of the FDA-issued dynamic PDF this is not (ESTAR-06).
    const exportMetadata = {
      format: 'zip',
      attachmentCount: attachments.length,
      package: labels.package,
      packageFamily: family,
      officialEstarPdf: false,
      programId: anchor.programUuid ?? undefined,
      formattingErrors: (formattingReport as { errors?: number } | undefined)?.errors ?? 0,
      formattingWarnings: (formattingReport as { warnings?: number } | undefined)?.warnings ?? 0,
    };

    if (anchor.anchorProjectId !== null) {
      const consequence = await createGovernedExportConsequence({
        organizationId: getOrganizationId(req),
        projectId: anchor.anchorProjectId,
        userId: getUserId(req),
        title: meta.title || meta.submissionName || `${meta.id} — ${labels.title}`,
        contentForArtifact: typeof content === 'string' ? content : JSON.stringify(content),
        sourceType: 'export_estar_zip',
        ctdSection: meta.ctdSection || labels.ctdSection,
        suggestedPlacement: labels.suggestedPlacement,
        backendRoute: 'POST /api/510k/estar/build',
        binaryOutput: zipBuffer,
        mimeType: 'application/zip',
        filename,
        metadata: exportMetadata,
      });

      // The advisory formatting report rides alongside the governed consequence so
      // the UI can surface "N formatting issues to fix before submitting" without
      // blocking the draft export.
      return res.status(200).json({ ...consequence, formattingReport: formattingReport ?? null });
    }

    // Program-spine (UUID) project: the artifact registry cannot place this
    // export yet (concept2cure_artifacts.project_id FK → projects.id predates
    // the program spine; the document-identity contract — RECONCILE.md §6 —
    // owns the mapping). Deliver the ZIP and audit-log the export with its
    // SHA-256 so provenance is preserved; say plainly that registry placement
    // is pending rather than pretending it happened. ONE implementation:
    // createAuditedUnplacedExport (shared with cerv2 + technical-file routes).
    const unplaced = await createAuditedUnplacedExport({
      organizationId: getOrganizationId(req),
      userId: getUserId(req),
      sourceType: 'export_estar_zip',
      backendRoute: 'POST /api/510k/estar/build',
      resourceType: 'estar_content_package',
      resourceId: anchor.programUuid ?? meta.id,
      programUuid: anchor.programUuid,
      filename,
      mimeType: 'application/zip',
      buffer: zipBuffer,
      metadata: exportMetadata,
    });

    return res.status(200).json({ ...unplaced, formattingReport: formattingReport ?? null });
  } catch (error: any) {
    logger.error('governed export failure', { err: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({
      error: 'GOVERNED_EXPORT_FAILED',
      message: 'Governed content package draft (not an eSTAR) export failed before consequence persistence. The problem has been logged.',
    });
  }
});

// The nIVD/IVD eSTAR (v7.0) carries 510(k), De Novo, and PMA on device/ivd
// variants. PreSTAR request types (Q-Sub/IDE/513(g)) are modeled in the engine
// and exposed via GET /catalog; the official-fill/scaffold endpoints here cover
// the nIVD/IVD marketing family.
const ESTAR_TYPES = ['510k', 'de_novo', 'pma', 'q_sub', 'ide', '513g'] as const;
const ESTAR_VARIANTS = ['device', 'ivd'] as const;

// PreSTAR (Q-Sub/IDE/513(g)) share one template family regardless of device/ivd;
// marketing pathways (510(k)/De Novo/PMA) use the device/ivd template variant.
// The caller always states the device/ivd nature; template selection resolves it.
function templateVariantFor(
  type: (typeof ESTAR_TYPES)[number],
  variant: (typeof ESTAR_VARIANTS)[number],
): EstarTemplateVariant {
  return type === 'q_sub' || type === 'ide' || type === '513g' ? 'prestar' : variant;
}

/** Turn an AcroForm field name into a stable, readable canonical-key placeholder. */
function slugifyAcroFieldName(name: string): string {
  const segments = name.split(/[.\\/[\]]/).filter(Boolean);
  // Adobe-authored (XFA/LiveCycle) field names carry a trailing occurrence index —
  // `form1[0].#subform[0].DeviceTradeName[0]` — so the LAST segment is usually the
  // number `0`, not the field name. Taking it collapsed every such field to the
  // key "0" (then 02, 03 … on collision), which made the scaffold unusable against
  // any real FDA form. Take the last segment that is not a bare index.
  const tail =
    [...segments].reverse().find((s) => !/^\d+$/.test(s)) ?? segments[segments.length - 1] ?? name;
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
  const descriptor = descriptorFor(type, templateVariantFor(type, variant));
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

    // The official FDA eSTAR templates are Adobe LiveCycle DYNAMIC XFA forms: their
    // AcroForm `/Fields` array is empty, so listAcroFields returns nothing and a
    // skeleton built from it would be silently blank. Enumerate whichever layer the
    // template actually carries.
    const dynamicXfa = isDynamicXfaPdf(templateBytes);
    const fillableTypes = new Set(['text', 'checkbox', 'dropdown', 'radio']);
    const skeleton: Record<string, { acroField?: string; xfaSomPath?: string; type: string; caption?: string }> = {};
    const nonFillable: { name: string; type: string }[] = [];
    const usedKeys = new Set<string>();
    let fieldCount = 0;
    const takeKey = (raw: string) => {
      let key = slugifyAcroFieldName(raw);
      let suffix = 2;
      while (usedKeys.has(key)) key = `${slugifyAcroFieldName(raw)}${suffix++}`;
      usedKeys.add(key);
      return key;
    };

    if (dynamicXfa) {
      const fields = await listXfaFields(templateBytes);
      fieldCount = fields.length;
      for (const f of fields) {
        // Only a path present in the datasets skeleton can actually be filled.
        if (!fillableTypes.has(f.type) || !f.inDatasets) {
          nonFillable.push({ name: f.somPath, type: f.inDatasets ? f.type : `${f.type} (not in datasets)` });
          continue;
        }
        skeleton[takeKey(f.somPath)] = { xfaSomPath: f.somPath, type: f.type, caption: f.caption };
      }
    } else {
      const fields = await listAcroFields(templateBytes);
      fieldCount = fields.length;
      for (const f of fields) {
        if (!fillableTypes.has(f.type)) {
          nonFillable.push(f);
          continue;
        }
        skeleton[takeKey(f.name)] = { acroField: f.name, type: f.type };
      }
    }

    return res.status(200).json({
      descriptorId: descriptor.id,
      expectedFileName: descriptor.expectedFileName,
      templateKind: dynamicXfa ? 'dynamic-xfa' : 'acroform',
      fieldCount,
      fillableCount: Object.keys(skeleton).length,
      // Paste into ESTAR_FIELD_MAPS[descriptorId] after renaming/verifying keys.
      skeleton,
      nonFillable: nonFillable.slice(0, 500),
      nonFillableCount: nonFillable.length,
      note: dynamicXfa
        ? 'Dynamic XFA template: fields are addressed by xfaSomPath, not by AcroForm name, and only ' +
          'paths present in the datasets skeleton are fillable. Canonical keys are slugified ' +
          'placeholders — rename them and confirm each against the caption before committing to ' +
          'estar-field-map.ts.'
        : 'Canonical keys are slugified placeholders from the real AcroField names — rename them to ' +
          'your canonical keys and verify each acroField before committing to estar-field-map.ts.',
    });
  } catch (error: any) {
    logger.error('scaffold-field-map failure', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: 'ESTAR_SCAFFOLD_FAILED',
      message: 'Failed to enumerate eSTAR template fields. The problem has been logged.',
    });
  }
});

const officialSchema = z.object({
  meta: exportMetaSchema,
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
router.post('/official', authMiddleware, requireEditorAccess, requireAssemblyEntitlement, async (req, res) => {
  const validation = officialSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({
      error: 'Invalid request payload',
      details: validation.error.flatten(),
    });
  }

  const { meta, type, variant, data, flatten } = validation.data;

  try {
    const anchor = await resolveProjectAnchor(req, getOrganizationId(req), meta);
    if (!anchor) {
      return res.status(404).json({ error: 'Project not found in your organization' });
    }

    const result = await fillEstarSubmission({
      type,
      variant: templateVariantFor(type, variant),
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
    const pdfBuffer = Buffer.from(result.pdfBytes);
    // The real submittable artifact was produced — assert it truthfully.
    const officialMetadata = {
      format: 'pdf',
      package: 'eSTAR',
      officialEstarPdf: true,
      descriptorId: result.descriptorId,
      filledFields: result.filledFields,
      skippedFields: result.skippedFields,
      programId: anchor.programUuid ?? undefined,
    };

    if (anchor.anchorProjectId !== null) {
      const consequence = await createGovernedExportConsequence({
        organizationId: getOrganizationId(req),
        projectId: anchor.anchorProjectId,
        userId: getUserId(req),
        title: meta.title || meta.submissionName || `${meta.id} — official FDA eSTAR`,
        contentForArtifact: JSON.stringify({ type, variant, descriptorId: result.descriptorId, data }),
        sourceType: 'export_estar_pdf',
        ctdSection: meta.ctdSection || 'm1.5',
        suggestedPlacement: 'Module 1 / official FDA eSTAR (submittable)',
        backendRoute: 'POST /api/510k/estar/official',
        binaryOutput: pdfBuffer,
        mimeType: 'application/pdf',
        filename,
        metadata: officialMetadata,
      });

      return res.status(200).json(consequence);
    }

    // Program-spine project without a registry anchor — same audited-delivery
    // contract as /build (see that handler's comment; RECONCILE.md §6), through
    // the ONE shared implementation.
    const unplaced = await createAuditedUnplacedExport({
      organizationId: getOrganizationId(req),
      userId: getUserId(req),
      sourceType: 'export_estar_pdf',
      backendRoute: 'POST /api/510k/estar/official',
      resourceType: 'estar_official_pdf',
      resourceId: anchor.programUuid ?? meta.id,
      programUuid: anchor.programUuid,
      filename,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
      metadata: officialMetadata,
    });

    return res.status(200).json(unplaced);
  } catch (error: any) {
    logger.error('official eSTAR export failure', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: 'GOVERNED_EXPORT_FAILED',
      message: 'Official eSTAR export failed before consequence persistence. The problem has been logged.',
    });
  }
});

const PMA_SUBMISSION_TYPE_VALUES = PMA_SUBMISSION_TYPES.map((t) => t.value) as [string, ...string[]];

const assembleSchema = z.object({
  pathway: z.enum(['510k', 'de_novo', 'pma']).default('510k'),
  /** PMA only: original vs a 21 CFR 814.39 supplement/notice (scopes the modules owed). */
  pmaSubmissionType: z.enum(PMA_SUBMISSION_TYPE_VALUES).optional(),
  variant: z.enum(ESTAR_VARIANTS).default('device'),
  /** Narrow the authored-content load to one LEGACY document's sections. */
  documentId: z.coerce.number().int().positive().optional(),
  /** Read the GOVERNED device document of this regulatory program instead. */
  programId: z.string().uuid().optional(),
  /** Target market for the readiness overlay (optional). */
  market: z.string().min(1).optional(),
});

/**
 * POST /api/510k/estar/assemble
 * body: { pathway?, pmaSubmissionType?, variant?, documentId?, programId?, market? }
 *
 * The device-assembly contract (spec B5) over HTTP: computes what can honestly
 * be produced for the caller org's REAL authored content (the program's
 * governed document, else cerv2_510k_sections → readiness leaves) against the
 * REAL vendored template drop-point. Pathway 'pma' scores the content against
 * the 21 CFR 814 modules (pma-mapper), never the 510(k) eSTAR slots — the same
 * deterministic engine the assemble_device_submission AnA tool uses, with the
 * inputs loaded server-side instead of caller-supplied. Returns the assembly
 * result plus a validationReport whose errors are the blockers that prevent a
 * submittable official eSTAR. Read-only: renders and persists nothing.
 */
router.post('/assemble', authMiddleware, requireEditorAccess, requireAssemblyEntitlement, async (req, res) => {
  const validation = assembleSchema.safeParse(req.body ?? {});
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid request payload', details: validation.error.flatten() });
  }
  const { pathway, pmaSubmissionType, variant, documentId, programId, market } = validation.data;

  try {
    const orgId = getOrganizationId(req);
    const { scope, source } = await resolveDeviceContentScope(orgId, { programId, documentId });
    const [leaves, vendored] = await Promise.all([
      loadDeviceContentLeaves(orgId, scope),
      listVendoredTemplates(),
    ]);

    const result = assembleDeviceSubmission({
      pathway,
      pmaSubmissionType: pmaSubmissionType as (typeof PMA_SUBMISSION_TYPES)[number]['value'] | undefined,
      variant,
      leaves,
      presentTemplates: vendored.map((t) => t.fileName),
      market: market as never,
      environment: process.env.NODE_ENV === 'production' ? 'production' : 'staging',
    });

    return res.status(200).json({
      ...result,
      deviceContentSource: source,
      validationReport: {
        // Every blocker prevents a submittable official eSTAR — errors, not advice.
        errors: result.blockers,
        sectionSummary: result.estar.summary,
      },
    });
  } catch (error: any) {
    logger.error('device assembly contract failure', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: 'DEVICE_ASSEMBLY_FAILED',
      message: 'Failed to compute device assembly state. The problem has been logged.',
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
      variant: templateVariantFor(type, variant),
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
      message: 'Failed to assess eSTAR readiness. The problem has been logged.',
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
      message: 'Failed to build the eSTAR catalog. The problem has been logged.',
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
      message: 'Failed to read eSTAR registration. The problem has been logged.',
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
      message: 'Failed to save eSTAR registration. The problem has been logged.',
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
      message: 'Failed to assess eSTAR registration eligibility. The problem has been logged.',
    });
  }
});

const filingLeafSchema = z.object({
  sectionCode: z.string(),
  title: z.string(),
  documentType: z.string().optional(),
  // Fails closed: a hand-fed leaf is treated as a draft/placeholder (not
  // substantive) unless the caller explicitly asserts it carries real,
  // finalized content — a title match alone must never count as "present".
  substantive: z.boolean().default(false),
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
  // When true, the org's authored device content (cerv2_510k_sections) is loaded
  // as leaves and assessed — so readiness reflects real content, not a hand-fed
  // list. `documentId` narrows to one document's sections; omit for org-wide.
  useProjectContent: z.boolean().optional(),
  documentId: z.coerce.number().int().positive().optional(),
  /** With useProjectContent: read the GOVERNED device document of this program. */
  programId: z.string().uuid().optional(),
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
  const { catalogKey, variant, leaves, qSubType, useProjectContent, documentId, programId } = validation.data;

  const entry = getCatalogEntry(catalogKey as EstarCatalogKey);
  if (!entry) {
    return res.status(400).json({ error: 'UNKNOWN_CATALOG_KEY', message: `No eSTAR submission catalog entry for "${catalogKey}".` });
  }

  try {
    // Org is needed to read the persisted registration and/or the org's authored
    // content; resolve it once when either path requires it.
    const needsOrg = !validation.data.registration || useProjectContent;
    const organizationId = needsOrg ? resolveOrgId(req) : null;
    if (needsOrg && !organizationId) {
      return res.status(400).json({ error: 'Organization context required' });
    }

    // Registration: an explicit what-if payload if supplied, else the org's
    // persisted registration record (the "clients must register" source of truth).
    const registration =
      validation.data.registration ?? (await resolveClientRegistration({ organizationId: organizationId! }));

    // Content: explicit body leaves, plus the org's REAL authored device content
    // when requested — so readiness reflects what's actually written, not a
    // hand-fed list. Content-bearing sections only (a gap is never invented).
    const content =
      useProjectContent && organizationId
        ? await resolveDeviceContentScope(organizationId, { programId, documentId })
        : null;
    const contentLeaves = content ? await loadDeviceContentLeaves(organizationId!, content.scope) : [];
    const effectiveLeaves = [...(leaves as FilingLeaf[]), ...contentLeaves];

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
      leaves: effectiveLeaves,
      qSubType,
      templateAvailable: fill.templateAvailable,
      fieldMapPopulated: fill.fieldMapPopulated,
    });

    if (!result) {
      return res.status(400).json({ error: 'UNKNOWN_CATALOG_KEY', message: `No eSTAR submission catalog entry for "${catalogKey}".` });
    }
    return res.status(200).json({
      ...result,
      ...(content ? { deviceContentSource: content.source } : {}),
    });
  } catch (error: any) {
    logger.error('estar filing-readiness failure', {
      err: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({
      error: 'ESTAR_FILING_READINESS_FAILED',
      message: 'Failed to assess eSTAR filing readiness. The problem has been logged.',
    });
  }
});

// ── Submission lifecycle tracking (the filing → tracking bridge) ─────────────

function submissionFail(res: any, error: any) {
  if (error instanceof EstarSubmissionError) {
    return res.status(error.code === 'NOT_FOUND' ? 404 : 400).json({ error: error.code, message: error.message });
  }
  logger.error('estar submission route error', { err: error instanceof Error ? error.message : String(error) });
  return res.status(500).json({ error: 'ESTAR_SUBMISSION_FAILED', message: 'eSTAR submission tracking failed. The problem has been logged.' });
}

const createSubmissionSchema = z.object({
  catalogKey: z.string().min(1),
  variant: z.enum(['device', 'ivd']).optional(),
  title: z.string().max(500).nullish(),
  qSubmissionId: z.string().uuid().nullish(),
  notes: z.string().max(2000).nullish(),
  /** Attach the filing to a project so tracking joins the PM spine. */
  projectId: z.coerce.number().int().positive().nullish(),
});

const advanceSubmissionSchema = z.object({
  status: z.enum(ESTAR_SUBMISSION_STATUSES),
  filedAt: z.coerce.date().optional(),
  fdaTrackingNumber: z.string().max(64).nullish(),
  decision: z.string().max(40).nullish(),
});

/**
 * POST /api/510k/estar/submissions
 * Start tracking a filing from a catalog key — the bridge from filing-readiness
 * to lifecycle tracking. Program type + review clock are pulled from the catalog;
 * starts in `draft`. Editor+ only.
 */
router.post('/submissions', authMiddleware, requireEditorAccess, async (req, res) => {
  const validation = createSubmissionSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid request payload', details: validation.error.flatten() });
  }
  try {
    const row = await createEstarSubmission(validation.data, {
      organizationId: getOrganizationId(req),
      userId: getUserId(req),
    });
    return res.status(201).json(row);
  } catch (error: any) {
    return submissionFail(res, error);
  }
});

/** GET /api/510k/estar/submissions — this org's tracked filings (optional ?status). */
router.get('/submissions', authMiddleware, async (req, res) => {
  const organizationId = resolveOrgId(req);
  if (!organizationId) return res.status(400).json({ error: 'Organization context required' });
  const raw = typeof req.query.status === 'string' ? req.query.status : undefined;
  const status = raw && (ESTAR_SUBMISSION_STATUSES as readonly string[]).includes(raw)
    ? (raw as EstarSubmissionStatus)
    : undefined;
  // ?projectId= scopes to one project's filings (the PM-spine view). Ignored
  // when not a positive integer, so a malformed filter never widens the result.
  const projectIdRaw = Number(req.query.projectId);
  const projectId = Number.isInteger(projectIdRaw) && projectIdRaw > 0 ? projectIdRaw : undefined;
  try {
    const rows = await listEstarSubmissions(
      { organizationId },
      { ...(status ? { status } : {}), ...(projectId !== undefined ? { projectId } : {}) },
    );
    return res.status(200).json({ submissions: rows });
  } catch (error: any) {
    return submissionFail(res, error);
  }
});

/** GET /api/510k/estar/submissions/:id — one tracked filing. */
router.get('/submissions/:id', authMiddleware, async (req, res) => {
  const organizationId = resolveOrgId(req);
  if (!organizationId) return res.status(400).json({ error: 'Organization context required' });
  try {
    const row = await getEstarSubmission(String(req.params.id), { organizationId });
    return res.status(200).json(row);
  } catch (error: any) {
    return submissionFail(res, error);
  }
});

/**
 * PATCH /api/510k/estar/submissions/:id
 * Advance the lifecycle (validated transition). Moving to `filed` stamps the
 * review clock (filedAt + decisionDueAt). Editor+ only.
 */
router.patch('/submissions/:id', authMiddleware, requireEditorAccess, async (req, res) => {
  const validation = advanceSubmissionSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: 'Invalid request payload', details: validation.error.flatten() });
  }
  try {
    const { status, ...rest } = validation.data;
    const row = await advanceEstarSubmission(
      String(req.params.id),
      { toStatus: status, ...rest },
      { organizationId: getOrganizationId(req), userId: getUserId(req) },
    );
    return res.status(200).json(row);
  } catch (error: any) {
    return submissionFail(res, error);
  }
});

export default router;
