/**
 * IND FDA form generation REST surface — Forms 1571 / 1572 / 3674 / 3454 / 3455 /
 * 356H / 1574.
 *
 * Mounted at /api/ind-forms with authenticateToken applied at mount time
 * (see server/bootstrap/register-ind-lifecycle-routes.ts). Two surfaces:
 *   - PREVIEW (stateless, deterministic): /:formId/build, /:formId/pdf,
 *     /:formId/pdf-from-records, /1572/pdf-all render/return without persisting.
 *     PDF responses carry X-Form-Untracked-Preview: true.
 *   - GOVERNED: /:formId/artifact persists the structured field map as a
 *     concept2cureArtifacts row (org- + project-scoped, content-hashed) so the
 *     platform records that the form exists.
 * Rendering uses an official fillable AcroForm template when one is present in the
 * templates dir, otherwise a labeled fallback PDF.
 *
 * NOTE: official FDA AcroForm PDFs must be dropped into the templates dir (see
 * ind-form-fill-service templatesDir()); until then every form auto-falls back
 * to the deterministic labeled PDF.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import {
  generateIndForm,
  generateAllForm1572,
  buildFormById,
  SUPPORTED_FORM_IDS,
  type SupportedFormId,
  type IndFormPdfResult,
} from '../services/ind-forms/ind-form-fill-service';
import {
  buildForm1571,
  buildForm3674,
  buildForm3454,
  buildForm3455,
  buildForm356h,
  buildForm1574,
  buildAllForm1572,
  FORM_1571,
  FORM_1572,
  FORM_3674,
  FORM_3454,
  FORM_3455,
  FORM_356H,
  FORM_1574,
  type IndProjectMetadata,
} from '../services/ind-forms/ind-form-data-builders';
import { assembleFormMetadata } from '../services/ind-forms/form-context-assembler';
import { runM1FormsQc } from '../services/ind-forms/ind-form-qc';
import {
  getSponsor,
  getRegulatoryAgent,
  getInvestigator,
} from '../services/ind-master-data/ind-master-data-service';
import { createScopedLogger } from '../utils/logger.js';
import { FDAFormsRegistryClass, FDA_FORMS_RELEASE_READINESS } from '../config/FDAFormsRegistry';
import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { projects, concept2cureArtifacts } from '@shared/schema';
import auditService from '../services/auditService';

const logger = createScopedLogger('ind-forms-routes');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';
const formsRegistry = new FDAFormsRegistryClass();

interface Ctx {
  userId: number;
  organizationId: number;
}
function ctxOf(req: Request): Ctx | null {
  const r = req as any;
  const userId = Number(r.user?.id);
  const orgRaw = r.tenantContext?.organizationId ?? r.tenantId ?? r.user?.organizationId;
  const organizationId = Number(orgRaw);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(organizationId) || organizationId <= 0) {
    return null;
  }
  return { userId, organizationId };
}

function isSupported(formId: string): formId is SupportedFormId {
  return (SUPPORTED_FORM_IDS as readonly string[]).includes(formId);
}

function metaOf(req: Request): IndProjectMetadata {
  // The form content is project data the caller supplies; the builders treat
  // every field as optional and report missingRequired, so a partial body is
  // always safe to render.
  return (req.body && typeof req.body === 'object' ? req.body : {}) as IndProjectMetadata;
}

function sendPdf(res: Response, result: IndFormPdfResult): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${result.formId}.pdf"`);
  // This is a stateless PREVIEW render: the platform does not record that it was
  // produced. Use POST /:formId/artifact for a governed, persisted record.
  res.setHeader('X-Form-Untracked-Preview', 'true');
  res.setHeader('X-Form-Used-Official-Template', String(result.usedOfficialTemplate));
  res.setHeader('X-Form-Field-Coverage', result.fieldCoverage.toFixed(3));
  if (result.missingRequired.length > 0) {
    res.setHeader('X-Form-Missing-Required', result.missingRequired.join(','));
  }
  if (result.unmappedFields && result.unmappedFields.length > 0) {
    res.setHeader('X-Form-Unmapped', result.unmappedFields.join(','));
  }
  if (result.unfilledFields && result.unfilledFields.length > 0) {
    res.setHeader('X-Form-Unfilled', result.unfilledFields.join(','));
  }
  res.status(200).send(Buffer.from(result.pdfBytes));
}

function fail(res: Response, err: unknown): void {
  logger.error('ind-forms route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Form generation failed.' } });
}

/** List the supported form ids. */
router.get('/', limiter, requireRole(AUTHOR), (_req, res) => {
  // Return the canonical registry objects rather than maintaining a second,
  // route-local metadata model that can drift from validation and rendering.
  const formDefinitions = SUPPORTED_FORM_IDS.map((formId) => formsRegistry.getForm(formId));
  res.json({ forms: SUPPORTED_FORM_IDS, formDefinitions, releaseReadiness: FDA_FORMS_RELEASE_READINESS });
});

/**
 * Build the field map for a form WITHOUT rendering a PDF — useful for previews
 * and completeness checks (returns { formId, fields, missingRequired }).
 */
router.post('/:formId/build', limiter, requireRole(AUTHOR), (req, res) => {
  const formId = String(req.params.formId);
  const meta = metaOf(req);
  try {
    switch (formId) {
      case FORM_1571:
        return res.json(buildForm1571(meta));
      case FORM_3674:
        return res.json(buildForm3674(meta));
      case FORM_3454:
        return res.json(buildForm3454(meta));
      case FORM_3455:
        return res.json(buildForm3455(meta));
      case FORM_356H:
        return res.json(buildForm356h(meta));
      case FORM_1574:
        return res.json(buildForm1574(meta));
      case FORM_1572: {
        // 1572 is per-investigator; build one per investigator.
        return res.json(buildAllForm1572(meta));
      }
      default:
        return res.status(400).json({ error: { code: 'VALIDATION', message: `Unsupported form id: ${formId}` } });
    }
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Cross-form Module 1 QC over a set of built forms (eCTD Module 1).
 * Body: { forms: BuiltForm[], requiredForms? }. Returns the verdict + findings
 * (presence, completeness, sponsor/drug identity consistency, structure).
 */
router.post('/qc', limiter, requireRole(AUTHOR), (req, res) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!Array.isArray(b.forms)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'forms[] (built FDA forms) is required.' } });
  }
  try {
    res.json(runM1FormsQc({ forms: b.forms, requiredForms: b.requiredForms }));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Render a single form to PDF. For 1572 this uses the first investigator; use
 * /1572/pdf-all to render one PDF per investigator.
 */
router.post('/:formId/pdf', limiter, requireRole(AUTHOR), async (req, res) => {
  const formId = String(req.params.formId);
  if (!isSupported(formId)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `Unsupported form id: ${formId}` } });
  }
  try {
    sendPdf(res, await generateIndForm(formId, metaOf(req)));
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Render a form to PDF auto-populated from the master-data registries.
 * Body: { sponsorId?, agentId?, investigatorIds?: string[], overrides?: IndProjectMetadata }.
 * Records are loaded tenant-scoped; `overrides` layer project fields on top.
 */
router.post('/:formId/pdf-from-records', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const formId = String(req.params.formId);
  if (!isSupported(formId)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `Unsupported form id: ${formId}` } });
  }
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  try {
    const [sponsor, agent, investigators] = await Promise.all([
      b.sponsorId ? getSponsor(String(b.sponsorId), ctx) : Promise.resolve(null),
      b.agentId ? getRegulatoryAgent(String(b.agentId), ctx) : Promise.resolve(null),
      Array.isArray(b.investigatorIds)
        ? Promise.all(b.investigatorIds.map((id: unknown) => getInvestigator(String(id), ctx)))
        : Promise.resolve([]),
    ]);
    const meta = assembleFormMetadata({ sponsor, agent, investigators, overrides: b.overrides });
    sendPdf(res, await generateIndForm(formId, meta));
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'NOT_FOUND') {
      return res.status(404).json({ error: { code, message: 'A referenced master-data record was not found.' } });
    }
    fail(res, err);
  }
});

/**
 * Persist a form as a GOVERNED ARTIFACT so the platform records that it exists
 * (closes the "download a form the platform doesn't know about" gap). Stores the
 * deterministic structured field map (the registry's declared storage.format),
 * NOT the PDF bytes — the PDF is a reproducible derivative of the field map, with
 * a content hash for integrity. A projectId is REQUIRED and validated against the
 * caller's org, so an artifact is never created under another tenant's project.
 *
 * Body: IndProjectMetadata + { projectId: number }.
 * For 1572 this persists the FIRST investigator's form (per-investigator
 * persistence mirrors /1572/pdf-all and is a follow-on).
 * Returns 201 { artifactId, formId, projectId, ready, missingRequired, contentHash }.
 */
router.post('/:formId/artifact', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const formId = String(req.params.formId);
  if (!isSupported(formId)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `Unsupported form id: ${formId}` } });
  }
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as IndProjectMetadata & { projectId?: unknown };
  const projectId = Number(body.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'projectId is required to persist a governed form artifact.' } });
  }
  try {
    // Tenant scope: the project must belong to the caller's org.
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, ctx.organizationId)))
      .limit(1);
    if (!project) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found for this organization.' } });
    }

    const built = buildFormById(formId, body);
    const content = JSON.stringify({ formId: built.formId, fields: built.fields, missingRequired: built.missingRequired });
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const artifactId = `artifact_indform_${formId.replace(/^FDA_/, '').toLowerCase()}_${crypto.randomUUID()}`;
    const ready = built.missingRequired.length === 0;

    await db.insert(concept2cureArtifacts).values({
      artifactId,
      projectId,
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      title: `FDA Form ${formId.replace(/^FDA_/, '')}`,
      type: 'form',
      category: 'document',
      content,
      contentHash,
      status: 'draft',
      version: 1,
      metadata: {
        formId,
        source: 'ind-forms',
        storageFormat: 'structured-field-map',
        ready,
        missingRequired: built.missingRequired,
      },
    });

    // Part 11 audit event for the governed creation. Best-effort: the artifact
    // row already carries provenance (createdById, contentHash, timestamps), so a
    // transient audit-log hiccup must not fail an otherwise-successful creation.
    // (Making the two atomic is the writeMutation transaction-boundary follow-on.)
    try {
      await auditService.logAction({
        action: 'ind_form.artifact.create',
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        resourceType: 'concept2cure_artifact',
        resourceId: artifactId,
        metadata: { formId, projectId, ready, contentHash },
      });
    } catch (auditErr) {
      logger.warn('audit log failed for ind-form artifact', { err: auditErr instanceof Error ? auditErr.message : String(auditErr) });
    }

    res.status(201).json({ artifactId, formId, projectId, ready, missingRequired: built.missingRequired, contentHash });
  } catch (err) {
    fail(res, err);
  }
});

/** Render one 1572 PDF per investigator; returns base64-encoded PDFs as JSON. */
router.post('/1572/pdf-all', limiter, requireRole(AUTHOR), async (req, res) => {
  try {
    const results = await generateAllForm1572(metaOf(req));
    res.json({
      formId: FORM_1572,
      documents: results.map((r) => ({
        usedOfficialTemplate: r.usedOfficialTemplate,
        fieldCoverage: r.fieldCoverage,
        missingRequired: r.missingRequired,
        pdfBase64: Buffer.from(r.pdfBytes).toString('base64'),
      })),
    });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
