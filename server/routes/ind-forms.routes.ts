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
  generateAllForm3455,
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
  buildAllForm3455,
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
import { regulatoryPrograms } from '../../shared/schema/programs';
import { resolveProgramProjectAnchor } from '../services/c2c/program-project-anchor';
import auditService from '../services/auditService';
import { recordArtifactProvenanceDrizzle } from '../services/provenance/artifact-provenance';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve a program-spine ident (regulatory_programs UUID or program code),
 * org-scoped — the same 3-way ident contract as the eSTAR export routes
 * (510k-estar-routes.ts resolveProjectAnchor). Null when nothing in the caller's
 * org matches; a failed lookup is a non-match, never a guessed program.
 */
async function resolveProgramIdent(
  ident: string,
  organizationId: number,
): Promise<{ id: string; code: string | null; name: string | null } | null> {
  const byUuid = UUID_RE.test(ident);
  try {
    const [row] = await db
      .select({ id: regulatoryPrograms.id, code: regulatoryPrograms.code, name: regulatoryPrograms.name })
      .from(regulatoryPrograms)
      .where(
        and(
          byUuid ? eq(regulatoryPrograms.id, ident) : eq(regulatoryPrograms.code, ident),
          eq(regulatoryPrograms.organizationId, organizationId),
        ),
      )
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
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
  // Honestly signal a faithful reconstruction (pure dynamic XFA forms 1571/3674)
  // so a consumer never mistakes it for the official Adobe-rendered PDF.
  res.setHeader('X-Form-Reconstructed', String(result.reconstructed === true));
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
 * a content hash for integrity.
 *
 * Project identity: `projectId` (legacy numeric projects.id) OR `projectIdent`
 * (regulatory_programs UUID or program code — the id space window.C2C_PROJECT
 * actually carries), both validated against the caller's org so an artifact is
 * never created under another tenant's project.
 *
 * Program-spine idents have NO legacy numeric project row, and the artifact
 * registry (concept2cure_artifacts.project_id → projects.id FK) predates the
 * program spine — so those saves use the audited-unplaced degradation contract
 * from the eSTAR /build handler: the built field map is content-hashed and
 * audit-logged (that audit row is the only persisted trace, so it is REQUIRED —
 * an audit failure fails the request rather than claiming `audited: true`), and
 * the response says plainly that registry placement is pending. No artifact row
 * is fabricated.
 *
 * Body: IndProjectMetadata + ({ projectId: number } | { projectIdent: string }).
 * For 1572 this persists the FIRST investigator's form (per-investigator
 * persistence mirrors /1572/pdf-all and is a follow-on).
 * Returns 201 { artifactId, formId, projectId, ready, missingRequired, contentHash }
 * for the governed path; 200 { governed:false, audited:true, artifactId:null, … }
 * for the audited-unplaced program path.
 */
router.post('/:formId/artifact', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const formId = String(req.params.formId);
  if (!isSupported(formId)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: `Unsupported form id: ${formId}` } });
  }
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as IndProjectMetadata & {
    projectId?: unknown;
    projectIdent?: unknown;
  };
  const rawIdent = typeof body.projectIdent === 'string' ? body.projectIdent.trim() : '';
  const projectId = Number(body.projectId ?? (/^\d+$/.test(rawIdent) ? rawIdent : NaN));
  const isProgramIdent = rawIdent !== '' && !/^\d+$/.test(rawIdent) && body.projectId === undefined;
  if (!isProgramIdent && (!Number.isInteger(projectId) || projectId <= 0)) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION',
        message: 'projectId (numeric) or projectIdent (program UUID/code) is required to persist a governed form artifact.',
      },
    });
  }
  // The project this artifact is registered against. For a program ident it is
  // filled from the C1 anchor below when one exists; the audited-unplaced
  // degradation is taken only when it does not.
  let effectiveProjectId = projectId;

  try {
    if (isProgramIdent) {
      // Program-spine path: resolve org-scoped, then anchor, then — only if
      // there is no anchor — the audited-unplaced degradation.
      const program = await resolveProgramIdent(rawIdent, ctx.organizationId);
      if (!program) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found for this organization.' } });
      }

      // Document Identity Contract slice C1 gave the program spine the numeric
      // anchor this registry needs (`projects.regulatory_program_id`, written by
      // intake in the same transaction that creates the program). Ask for it
      // before degrading: the v2 wizard hands out program idents, so this is the
      // id space real users' Module-1 forms actually arrive with — every one of
      // them was landing unregistered.
      //
      // The resolver is fail-soft by contract: null when the program predates
      // C1, when intake skipped the anchor for one of its stated reasons, or
      // when the migration is not applied here. Null keeps the existing
      // behaviour exactly; a real anchor takes the governed path below.
      const anchoredProjectId = await resolveProgramProjectAnchor(db, {
        programId: program.id,
        orgId: ctx.organizationId,
        context: 'ind-forms.artifact',
      });
      if (anchoredProjectId === null) {
        const builtForProgram = buildFormById(formId, body);
        const programContent = JSON.stringify({
          formId: builtForProgram.formId,
          fields: builtForProgram.fields,
          missingRequired: builtForProgram.missingRequired,
        });
        const programContentHash = crypto.createHash('sha256').update(programContent).digest('hex');
        const ready = builtForProgram.missingRequired.length === 0;
        // The audit row is the ONLY persisted trace on this path — it is required,
        // not best-effort. logAction resolves an outcome instead of throwing on
        // a persistence failure, so the outcome must be checked: without it the
        // response claims `audited: true` over nothing.
        const unplacedAudit = await auditService.logAction({
          action: 'ind_form.artifact.unplaced',
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          resourceType: 'ind_form',
          resourceId: `${formId}:${program.id}`,
          metadata: {
            formId,
            programId: program.id,
            programCode: program.code,
            ready,
            contentHash: programContentHash,
            // Stable audit enum, deliberately unchanged: existing Part 11 rows
            // carry this value and queries match on it. What changed is WHICH
            // requests reach here — only genuinely unanchored programs now do.
            artifactRegistry: 'unplaced_pending_document_identity_contract',
          },
        });
        if (!unplacedAudit?.persisted) {
          return res.status(500).json({
            error: 'AUDIT_WRITE_FAILED',
            message:
              'the unplaced-artifact audit row is the only persisted trace on this path and it was not persisted',
          });
        }
        return res.status(200).json({
          governed: false,
          audited: true,
          artifactId: null,
          formId,
          projectId: null,
          programId: program.id,
          ready,
          missingRequired: builtForProgram.missingRequired,
          contentHash: programContentHash,
          artifact_registry:
            'unplaced — this program has no anchored project row, and the governed artifact ' +
            'registry (concept2cure_artifacts) requires one; the built field map is ' +
            'audit-logged with its content hash',
        });
      }
      effectiveProjectId = anchoredProjectId;
    }

    // Tenant scope: the project must belong to the caller's org. This re-checks
    // the anchored id too. The anchor resolver already filters on org, so this
    // is belt-and-braces — and it keeps ONE place deciding a project is in-org
    // rather than two that could drift apart.
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, effectiveProjectId), eq(projects.organizationId, ctx.organizationId)))
      .limit(1);
    if (!project) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found for this organization.' } });
    }

    const built = buildFormById(formId, body);
    const content = JSON.stringify({ formId: built.formId, fields: built.fields, missingRequired: built.missingRequired });
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    const artifactId = `artifact_indform_${formId.replace(/^FDA_/, '').toLowerCase()}_${crypto.randomUUID()}`;
    const ready = built.missingRequired.length === 0;

    const formIns = await db.insert(concept2cureArtifacts).values({
      artifactId,
      projectId: effectiveProjectId,
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
    }).returning({ id: concept2cureArtifacts.id });

    // Uniform provenance: a generated FDA form artifact is a 'generation' event.
    // Best-effort: the insert above is not in a transaction.
    try {
      if (typeof formIns[0]?.id === 'number') {
        await recordArtifactProvenanceDrizzle(db, {
          artifactId: formIns[0].id,
          organizationId: ctx.organizationId,
          eventType: 'generation',
          eventAction: 'form_build',
          actorId: ctx.userId,
          details: { formId, ready },
          backendService: 'routes/ind-forms',
        });
      }
    } catch (provErr) {
      logger.warn('ind-form provenance event failed', { err: provErr instanceof Error ? provErr.message : String(provErr) });
    }

    // Part 11 audit event for the governed creation. Best-effort: the artifact
    // row already carries provenance (createdById, contentHash, timestamps), so a
    // transient audit-log hiccup must not fail an otherwise-successful creation.
    // (Making the two atomic is the writeMutation transaction-boundary follow-on.)
    const artifactAudit = await auditService.logAction({
      action: 'ind_form.artifact.create',
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      resourceType: 'concept2cure_artifact',
      resourceId: artifactId,
      metadata: { formId, projectId: effectiveProjectId, ready, contentHash },
    });
    if (!artifactAudit.persisted) {
      logger.warn('ind-form artifact audit row was not persisted', { err: artifactAudit.error ?? 'no durable store accepted the row' });
    }

    res.status(201).json({ artifactId, formId, projectId: effectiveProjectId, ready, missingRequired: built.missingRequired, contentHash });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Persist ONE governed artifact per investigator for the PER-INVESTIGATOR forms
 * (1572 Statement of Investigator; 3455 financial disclosure). Closes the
 * per-investigator governed-persistence gap that /:formId/artifact left as a
 * follow-on — each investigator's form becomes its own content-hashed artifact
 * the platform records, not just the first.
 *
 * All-or-nothing: every investigator form is inserted in a single DB transaction,
 * so a mid-batch failure persists none of them (no partial governed state).
 *
 * Only 1572 and 3455 have a batch; any other form id → 400 (use /:formId/artifact).
 * An empty `artifacts` array is legitimate for 3455 when no investigator has a
 * disclosable interest (the sponsor certifies "none" on 3454 instead).
 *
 * Body: IndProjectMetadata + { projectId: number }.
 * Returns 201 { formId, projectId, artifacts: [{ artifactId, investigatorName,
 *   ready, missingRequired, contentHash }] }.
 */
const PER_INVESTIGATOR_FORMS = new Set<string>([FORM_1572, FORM_3455]);

router.post('/:formId/artifact-all', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const formId = String(req.params.formId);
  if (!PER_INVESTIGATOR_FORMS.has(formId)) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION',
        message: `Form ${formId} is not per-investigator; use POST /:formId/artifact for a single governed artifact.`,
      },
    });
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

    const builts = formId === FORM_1572 ? buildAllForm1572(body) : buildAllForm3455(body);
    const shortId = formId.replace(/^FDA_/, '').toLowerCase();
    // Prepare all rows deterministically before touching the DB.
    const rows = builts.map((built, idx) => {
      const investigatorName = String(built.fields['investigator_name'] ?? '').trim() || `Investigator ${idx + 1}`;
      const content = JSON.stringify({
        formId: built.formId,
        fields: built.fields,
        missingRequired: built.missingRequired,
        investigatorIndex: idx,
      });
      const contentHash = crypto.createHash('sha256').update(content).digest('hex');
      const artifactId = `artifact_indform_${shortId}_${crypto.randomUUID()}`;
      return {
        idx,
        investigatorName,
        content,
        contentHash,
        artifactId,
        ready: built.missingRequired.length === 0,
        missingRequired: built.missingRequired,
      };
    });

    // All-or-nothing: persist every investigator form, or none. Provenance is
    // emitted AFTER this commits (see below), never inside the tx — a failed
    // provenance write poisons a Postgres/Drizzle transaction, so recording it
    // in-tx would make an audit-row hiccup roll back the forms themselves.
    const persistedForProvenance: Array<{ id: number; investigatorName: string; ready: boolean }> = [];
    if (rows.length > 0) {
      await db.transaction(async (tx) => {
        for (const r of rows) {
          const formTxIns = await tx.insert(concept2cureArtifacts).values({
            artifactId: r.artifactId,
            projectId,
            organizationId: ctx.organizationId,
            createdById: ctx.userId,
            title: `FDA Form ${formId.replace(/^FDA_/, '')} — ${r.investigatorName}`,
            type: 'form',
            category: 'document',
            content: r.content,
            contentHash: r.contentHash,
            status: 'draft',
            version: 1,
            metadata: {
              formId,
              source: 'ind-forms',
              storageFormat: 'structured-field-map',
              ready: r.ready,
              missingRequired: r.missingRequired,
              investigatorIndex: r.idx,
              investigatorName: r.investigatorName,
            },
          }).returning({ id: concept2cureArtifacts.id });
          if (typeof formTxIns[0]?.id === 'number') {
            persistedForProvenance.push({ id: formTxIns[0].id, investigatorName: r.investigatorName, ready: r.ready });
          }
        }
      });
    }

    // Uniform provenance: a generated FDA form artifact is a 'generation' event.
    // Best-effort, on db (own implicit tx per write) after the forms are committed,
    // so a provenance failure can neither poison the artifact transaction nor fail
    // the creation the user requested.
    for (const p of persistedForProvenance) {
      try {
        await recordArtifactProvenanceDrizzle(db, {
          artifactId: p.id,
          organizationId: ctx.organizationId,
          eventType: 'generation',
          eventAction: 'form_build',
          actorId: ctx.userId,
          details: { formId, investigatorName: p.investigatorName, ready: p.ready },
          backendService: 'routes/ind-forms',
        });
      } catch (provErr) {
        logger.warn('ind-form (investigator) provenance event failed', { err: provErr instanceof Error ? provErr.message : String(provErr) });
      }
    }

    // Part 11 audit event per governed artifact. Best-effort (see /:formId/artifact):
    // the rows already carry provenance; a transient audit hiccup must not undo a
    // committed creation.
    for (const r of rows) {
      const batchArtifactAudit = await auditService.logAction({
        action: 'ind_form.artifact.create',
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        resourceType: 'concept2cure_artifact',
        resourceId: r.artifactId,
        metadata: { formId, projectId, ready: r.ready, contentHash: r.contentHash, investigatorIndex: r.idx },
      });
      if (!batchArtifactAudit.persisted) {
        logger.warn('ind-form artifact audit row was not persisted (batch)', { err: batchArtifactAudit.error ?? 'no durable store accepted the row' });
      }
    }

    res.status(201).json({
      formId,
      projectId,
      artifacts: rows.map((r) => ({
        artifactId: r.artifactId,
        investigatorName: r.investigatorName,
        ready: r.ready,
        missingRequired: r.missingRequired,
        contentHash: r.contentHash,
      })),
    });
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
        reconstructed: r.reconstructed === true,
        fieldCoverage: r.fieldCoverage,
        missingRequired: r.missingRequired,
        pdfBase64: Buffer.from(r.pdfBytes).toString('base64'),
      })),
    });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Render one 3455 disclosure PDF per DISCLOSING investigator (the 3455 is a
 * per-investigator form). Returns base64-encoded PDFs as JSON. An empty
 * `documents` array means no investigator has a disclosable interest — the
 * sponsor certifies "none" on Form 3454 instead (see POST /FDA_3454/pdf).
 */
router.post('/3455/pdf-all', limiter, requireRole(AUTHOR), async (req, res) => {
  try {
    const results = await generateAllForm3455(metaOf(req));
    res.json({
      formId: FORM_3455,
      documents: results.map((r) => ({
        usedOfficialTemplate: r.usedOfficialTemplate,
        reconstructed: r.reconstructed === true,
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
