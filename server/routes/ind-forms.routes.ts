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
import multer from 'multer';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { makeUploadFileFilter } from '../middleware/uploadAllowlist';
import { assertUploadSafe, UploadSafetyError } from '../middleware/uploadSafety';
import {
  generateIndForm,
  generateAllForm1572,
  generateAllForm3455,
  buildFormById,
  blankTemplateDigests,
  describeAllRenderPlans,
  requiredBoxesLeftToSponsor,
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
import { assembleFormMetadata, programToFormMetadata } from '../services/ind-forms/form-context-assembler';
import { resolveSubmissionSpine } from '../services/cmc/submission-spine';
import { module1HeadingForSectionKey } from '../services/ectd/section-to-ctd';
import { storeRenderedLeafFile } from '../services/ectd/rendered-leaf-files';
import { upsertLeaf, SubmissionError, isSequenceLocked } from '../services/submission-service/submission-service';
import { runM1FormsQc } from '../services/ind-forms/ind-form-qc';
import { checkAttachedForm } from '../services/ind-forms/attached-form-check';
import {
  getSponsor,
  getRegulatoryAgent,
  getInvestigator,
} from '../services/ind-master-data/ind-master-data-service';
import { createScopedLogger } from '../utils/logger.js';
import { FDAFormsRegistryClass, FDA_FORMS_RELEASE_READINESS, type SubmissionProgram } from '../config/FDAFormsRegistry';
import crypto from 'node:crypto';
import { and, desc, eq, isNull, like } from 'drizzle-orm';
import { db } from '../db';
import {
  projects,
  concept2cureArtifacts,
  organizations,
  submissionLeaves,
  renderedLeafFiles,
  ectdSequences,
} from '@shared/schema';
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
 * The open program as the Module 1 forms need it: its identity, the facts that
 * belong on the forms, and its organisation's name — the sponsor of record in
 * this data model.
 */
interface ResolvedProgram {
  id: string;
  code: string | null;
  name: string | null;
  productName: string | null;
  indication: string | null;
  applicationNumber: string | null;
  programType: string | null;
  sponsorName: string | null;
  /** regulatory_programs.sponsor_address / ind_type (20261008b): the 1571's
   *  address and IND type, stored on the program (P-20 follow-up). */
  sponsorAddress: string | null;
  indType: string | null;
}

/**
 * Resolve a program-spine ident (regulatory_programs UUID or program code),
 * org-scoped — the same 3-way ident contract as the eSTAR export routes
 * (510k-estar-routes.ts resolveProjectAnchor). Null when nothing in the caller's
 * org matches; a failed lookup is a non-match, never a guessed program.
 *
 * Selects the FORM FACTS as well as the identity: sponsor (the organisation),
 * product, indication and the agency-assigned application number. Those four are
 * held once, on the program record, and every Module 1 form takes them from
 * there — which is what stops a filing's sponsor name depending on who typed it
 * into which panel.
 */
async function resolveProgramIdent(
  ident: string,
  organizationId: number,
): Promise<ResolvedProgram | null> {
  const byUuid = UUID_RE.test(ident);
  try {
    const [row] = await db
      .select({
        id: regulatoryPrograms.id,
        code: regulatoryPrograms.code,
        name: regulatoryPrograms.name,
        productName: regulatoryPrograms.productName,
        indication: regulatoryPrograms.indication,
        applicationNumber: regulatoryPrograms.applicationNumber,
        programType: regulatoryPrograms.programType,
        sponsorName: organizations.name,
        sponsorAddress: regulatoryPrograms.sponsorAddress,
        indType: regulatoryPrograms.indType,
      })
      .from(regulatoryPrograms)
      .leftJoin(organizations, eq(organizations.id, regulatoryPrograms.organizationId))
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

/** The CTD section a completed Module 1 form files at, or null when the FDA
 *  Module 1 table catalogues none for it.
 *
 *  Derived from the ONE placement catalogue the transmit path already uses
 *  (`module1HeadingForSectionKey`), never a second table of form → section that
 *  could disagree with the packager: forms file at 1.1, the financial
 *  certification/disclosure pair at 1.3.4. */
function sectionCodeForForm(formId: string): string | null {
  const heading = module1HeadingForSectionKey(`form-${formId.replace(/^FDA_/, '')}`);
  return heading ? `m${heading}` : null;
}

/** `FDA_1571` → `form_1571` — the leaf document_type the IND checklist reads. */
function documentTypeForForm(formId: string): string {
  return `form_${formId.replace(/^FDA_/, '').toLowerCase()}`;
}

/**
 * The registry's program vocabulary for a program record's type (`ind`, `IND`,
 * `510K`, …), or null for a type no FDA form programme covers (CTA, MAA, …).
 */
function registryProgramOf(programType: string | null): SubmissionProgram | null {
  const t = (programType ?? '').trim().toUpperCase();
  if (t === 'IND' || t === 'NDA' || t === 'ANDA' || t === 'BLA' || t === 'PMA') return t;
  if (t === '510K') return '510k';
  return null;
}

/**
 * Whether a form applies to the open program, by the registry's ONE
 * applicability model (FDAFormsRegistry applicabilityOf). QA 2026-10-08 (j7):
 * the IND panel offered Form 356h — an NDA / ANDA / BLA cover — and a placed
 * 356h is what marked the IND's Module 1.1 approved. A program type the
 * registry has no programme for gets no FDA form, never all of them.
 */
function formAppliesToProgram(formId: string, programType: string | null): boolean {
  const program = registryProgramOf(programType);
  if (program === null) return false;
  return formsRegistry.getApplicability(formId)?.programs.includes(program) ?? false;
}

/** Why a form is not offered for this program, in the reader's words. */
function notApplicableReason(formId: string, programType: string | null): string {
  const programs = formsRegistry.getApplicability(formId)?.programs ?? [];
  const type = (programType ?? 'this').toUpperCase();
  return programs.length > 0
    ? `Form ${formId.replace(/^FDA_/, '')} applies to ${programs.join(' / ')} submissions, not to a ${type} program.`
    : `Form ${formId.replace(/^FDA_/, '')} is not catalogued for a ${type} program.`;
}

/**
 * Metadata for a form request: the open program's recorded facts, with anything
 * the caller actually stated layered on top.
 *
 * A blank input is NOT a value: an empty string is dropped rather than written
 * over a program fact, and never reaches a builder — `missingRequired` is the
 * server's verdict on what a form still needs, and `''` would silently satisfy
 * it. `projectIdent`/`projectId`/`sequenceId` are addressing, not form content,
 * so they are stripped before the merge.
 */
function statedFields(body: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (key === 'projectIdent' || key === 'projectId' || key === 'sequenceId') continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = value;
  }
  return out;
}

/**
 * Resolve the metadata a form request builds from, responding itself and
 * returning null when the named program cannot be resolved.
 *
 * Fail closed on an unresolvable ident: a request that NAMES a program and is
 * then answered from typed fields alone would return a form the caller believes
 * is backed by the record. A 404 says which it is.
 */
async function metaForRequest(
  req: Request,
  res: Response,
  ctx: Ctx | null,
): Promise<{ meta: IndProjectMetadata; program: ResolvedProgram | null } | null> {
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const ident = typeof body.projectIdent === 'string' ? body.projectIdent.trim() : '';
  const stated = statedFields(body) as IndProjectMetadata;
  if (ident === '' || /^\d+$/.test(ident)) {
    // No program named (or a legacy numeric project id, which addresses the
    // artifact registry and carries no program facts).
    return { meta: stated, program: null };
  }
  if (!ctx) {
    res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    return null;
  }
  const program = await resolveProgramIdent(ident, ctx.organizationId);
  if (!program) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found for this organization.' } });
    return null;
  }
  return { meta: { ...programToFormMetadata(program), ...stated }, program };
}

/** The program's canonical submission spine — the one rule, from submission-spine. */
function spineOf(program: ResolvedProgram, organizationId: number) {
  return resolveSubmissionSpine(
    {
      programId: program.id,
      programType: program.programType,
      productName: program.productName,
      title: program.name,
      programCode: program.code,
    },
    organizationId,
  );
}

/**
 * The official Module 1 forms this program has a sponsor-completed document
 * placed for, in EVERY sequence of its submission, each with the sequence it
 * is in.
 *
 * It read only the newest sequence, so once an amendment existed a form filed
 * into the original 0000 was invisible here (QA 2026-10-08, j7). The person
 * now chooses the sequence, so the listing says where each placement is.
 *
 * Read through the retained bytes (`rendered_leaf_files`), org-scoped on that
 * row rather than on the leaf: `submission_leaves.document_table` is a
 * polymorphic reference with no foreign key, so a leaf alone is not evidence
 * that this tenant holds the document it names.
 */
async function listFormPlacements(
  program: ResolvedProgram,
  organizationId: number,
): Promise<Array<Record<string, unknown>>> {
  const spine = await spineOf(program, organizationId);
  if (!spine?.sequence) return [];
  try {
    const rows = await db
      .select({
        leafId: submissionLeaves.id,
        sectionCode: submissionLeaves.sectionCode,
        documentType: submissionLeaves.documentType,
        title: submissionLeaves.title,
        fileName: renderedLeafFiles.fileName,
        sha256: renderedLeafFiles.sha256,
        byteSize: renderedLeafFiles.byteSize,
        // The forms engine's check recorded with the attachment: [] complete,
        // non-empty not complete, null never checked (QA 2026-10-08, j7).
        requiredFieldsMissing: renderedLeafFiles.requiredFieldsMissing,
        placedAt: submissionLeaves.updatedAt,
        sequenceId: ectdSequences.id,
        sequenceNumber: ectdSequences.sequenceNumber,
      })
      .from(submissionLeaves)
      .innerJoin(
        ectdSequences,
        and(
          eq(ectdSequences.id, submissionLeaves.sequenceId),
          eq(ectdSequences.organizationId, organizationId),
          eq(ectdSequences.submissionId, spine.submissionId),
          isNull(ectdSequences.deletedAt),
        ),
      )
      .innerJoin(
        renderedLeafFiles,
        and(
          eq(renderedLeafFiles.id, submissionLeaves.documentId),
          eq(renderedLeafFiles.organizationId, organizationId),
        ),
      )
      .where(
        and(
          eq(submissionLeaves.organizationId, organizationId),
          eq(submissionLeaves.documentTable, 'rendered_leaf_files'),
          like(submissionLeaves.documentType, 'form\\_%'),
          isNull(submissionLeaves.deletedAt),
        ),
      )
      .orderBy(desc(submissionLeaves.updatedAt));
    return rows.map((r) => ({
      ...r,
      formId: `FDA_${String(r.documentType ?? '').replace(/^form_/, '').toUpperCase()}`,
    }));
  } catch {
    // An unprovisioned store means nothing is known to be placed — never a
    // failed listing, and never a claim that something is.
    return [];
  }
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
  // The required boxes that are EMPTY on the bytes below — whether because the
  // project supplied no value or because no reviewed mapping writes them. Set
  // UNCONDITIONALLY, unlike its three neighbours above: an empty value is the
  // assertion "assessed, and none", and omitting the header when the list is
  // empty would make that indistinguishable from a server that never looked.
  // The renderer reports it on every path, so there is no case where this is
  // unknown; an absent header means an older server, not a clean form.
  res.setHeader('X-Form-Required-Blank', result.requiredFieldsLeftBlank.join(','));
  res.status(200).send(Buffer.from(result.pdfBytes));
}

function fail(res: Response, err: unknown): void {
  logger.error('ind-forms route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Form generation failed.' } });
}

/**
 * List the supported forms, what the engine will produce for each, and — when
 * `?projectIdent` names an open program — the program facts every form will be
 * filled from and the sponsor-completed forms already placed in its sequence.
 *
 * The render plans travel with the listing because the statement a user needs
 * ("this returns the genuine FDA form; these boxes are left for you to complete
 * and sign in Acrobat") has to be on screen BEFORE the click, not inferred from
 * the headers of a download that already happened.
 */
router.get('/', limiter, requireRole(AUTHOR), async (req, res) => {
  // Return the canonical registry objects rather than maintaining a second,
  // route-local metadata model that can drift from validation and rendering.
  const formDefinitions = SUPPORTED_FORM_IDS.map((formId) => formsRegistry.getForm(formId));
  const ident = String((req.query?.projectIdent ?? '') as string).trim();
  try {
    const renderPlans = await describeAllRenderPlans();
    if (ident === '' || /^\d+$/.test(ident)) {
      return res.json({
        forms: SUPPORTED_FORM_IDS,
        formDefinitions,
        releaseReadiness: FDA_FORMS_RELEASE_READINESS,
        renderPlans,
        program: null,
        placements: [],
      });
    }
    const ctx = ctxOf(req);
    if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    const program = await resolveProgramIdent(ident, ctx.organizationId);
    if (!program) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found for this organization.' } });
    }
    // Only the forms that apply to this program are offered; the rest are
    // named with the reason, never silently dropped.
    const applicable = SUPPORTED_FORM_IDS.filter((f) => formAppliesToProgram(f, program.programType));
    const formsNotApplicable = SUPPORTED_FORM_IDS
      .filter((f) => !applicable.includes(f))
      .map((formId) => ({ formId, reason: notApplicableReason(formId, program.programType) }));
    return res.json({
      forms: applicable,
      formsNotApplicable,
      formDefinitions,
      releaseReadiness: FDA_FORMS_RELEASE_READINESS,
      renderPlans,
      program: {
        id: program.id,
        code: program.code,
        name: program.name,
        programType: program.programType,
        sponsorName: program.sponsorName,
        productName: program.productName,
        indication: program.indication,
        applicationNumber: program.applicationNumber,
        sponsorAddress: program.sponsorAddress,
        indType: program.indType,
        // Exactly what the builders will receive from the record, so the panel
        // shows the values the forms are filled from rather than a paraphrase.
        formMetadata: programToFormMetadata(program),
      },
      placements: await listFormPlacements(program, ctx.organizationId),
    });
  } catch (err) {
    fail(res, err);
  }
});

/** The registry's IND types for Form FDA 1571 — the one list, never a copy. */
function registryIndTypes(): string[] {
  const field = formsRegistry.getForm('FDA_1571')?.fields?.find((f: { id?: string }) => f?.id === 'ind_type') as
    | { options?: unknown }
    | undefined;
  return Array.isArray(field?.options) ? field!.options.map(String) : [];
}

/** A clearable text from a request body: undefined = not sent (unchanged);
 *  null or blank = cleared; otherwise the trimmed text. */
function clearableText(v: unknown): string | null | undefined | false {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string') return false;
  const t = v.trim();
  return t === '' ? null : t;
}

const SPONSOR_ADDRESS_MAX = 1000;

/**
 * Record the sponsor's address and the IND type ON THE PROGRAM (P-20 follow-up,
 * docs/LAUNCH_DEFINITION_OF_DONE.md, 2026-10-08). Form FDA 1571 requires both
 * and no program column held either, so the forms panel sent them with every
 * build and the program record never knew them. They are stored in
 * regulatory_programs.sponsor_address / ind_type
 * (migrations/20261008b_regulatory_programs_sponsor_address_ind_type.sql), and
 * every build reads them from there (programToFormMetadata).
 *
 * Body: { projectIdent: program UUID or code, sponsorAddress?, indType? }. An
 * absent field is left as recorded; null or a blank clears it. The IND type
 * must be one of the registry's FDA_1571 ind_type options, and only an IND
 * program has one. Org-scoped (404 for another organisation's program) and
 * audited with the names of the fields it wrote.
 */
/** A stated program-facts request, or why it is refused (400). Pure. */
type ProgramFactsPatch = { sponsorAddress?: string | null; indType?: string | null };
function parseProgramFacts(
  body: Record<string, unknown>,
  indTypes: string[],
): { ident: string; patch: ProgramFactsPatch } | { refusal: string } {
  const ident = typeof body.projectIdent === 'string' ? body.projectIdent.trim() : '';
  if (ident === '' || /^\d+$/.test(ident)) {
    return { refusal: 'projectIdent (the program UUID or code) is required: these facts are recorded on a program.' };
  }
  const sponsorAddress = clearableText(body.sponsorAddress);
  const indType = clearableText(body.indType);
  if (sponsorAddress === false || indType === false) return { refusal: 'sponsorAddress and indType are text, or null to clear.' };
  if (sponsorAddress === undefined && indType === undefined) return { refusal: 'State the sponsor address, the IND type, or both.' };
  if (typeof sponsorAddress === 'string' && sponsorAddress.length > SPONSOR_ADDRESS_MAX) {
    return { refusal: `The sponsor address is longer than ${SPONSOR_ADDRESS_MAX} characters.` };
  }
  if (typeof indType === 'string' && !indTypes.includes(indType)) return { refusal: `IND type must be one of ${indTypes.join(', ')}.` };
  const patch: ProgramFactsPatch = {};
  if (sponsorAddress !== undefined) patch.sponsorAddress = sponsorAddress;
  if (indType !== undefined) patch.indType = indType;
  return { ident, patch };
}

router.put('/program-facts', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const parsed = parseProgramFacts((req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>, registryIndTypes());
  if ('refusal' in parsed) return res.status(400).json({ error: { code: 'VALIDATION', message: parsed.refusal } });
  const { ident, patch } = parsed;
  try {
    const program = await resolveProgramIdent(ident, ctx.organizationId);
    if (!program) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found for this organization.' } });
    }
    if (typeof patch.indType === 'string' && (program.programType ?? '').trim().toUpperCase() !== 'IND') {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: `An IND type is recorded only on an IND program; this program is ${program.programType ?? 'of no recorded type'}.` },
      });
    }
    await db
      .update(regulatoryPrograms)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(regulatoryPrograms.id, program.id), eq(regulatoryPrograms.organizationId, ctx.organizationId)));

    // Part 11 §11.10(e): who set the facts printed on the filed form, and which.
    const audit = await auditService.logAction({
      action: 'ind_form.program_facts.update',
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      resourceType: 'regulatory_program',
      resourceId: program.id,
      metadata: { fields: Object.keys(patch), programCode: program.code },
    });
    if (!audit?.persisted) {
      logger.warn('ind-form program facts audit row was not persisted', { err: audit?.error ?? 'no durable store accepted the row' });
    }
    const next = { ...program, ...patch };
    return res.status(200).json({ programId: program.id, sponsorAddress: next.sponsorAddress, indType: next.indType });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * Build the field map for a form WITHOUT rendering a PDF — useful for previews
 * and completeness checks (returns { formId, fields, missingRequired }).
 */
router.post('/:formId/build', limiter, requireRole(AUTHOR), async (req, res) => {
  const formId = String(req.params.formId);
  const resolved = await metaForRequest(req, res, ctxOf(req));
  if (!resolved) return;
  const meta = resolved.meta;
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
        // 1572 is per-investigator; build one per investigator. With none
        // recorded this answered [] — and the panel read an empty answer as
        // "required fields present" while the PDF of the same form reported
        // three required boxes blank (QA 2026-10-08, j7). The empty-investigator
        // build is the one the PDF renders (buildFormById), so both say the same.
        const perInvestigator = buildAllForm1572(meta);
        return res.json(perInvestigator.length > 0 ? perInvestigator : [buildFormById(FORM_1572, meta)]);
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
  const resolved = await metaForRequest(req, res, ctxOf(req));
  if (!resolved) return;
  try {
    sendPdf(res, await generateIndForm(formId, resolved.meta));
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
 * A program ident is placed against the program's project record (the C1
 * anchor, `projects.regulatory_program_id`; P-19 gives every program one). A
 * program with no project record has no dossier, so the save is refused 409
 * PROGRAM_NOT_ANCHORED and nothing is written (P-20 follow-up, 2026-10-08). It
 * used to answer 200 { governed:false, audited:true } — an "audited-unplaced"
 * success status over a save that placed nothing.
 *
 * Body: IndProjectMetadata + ({ projectId: number } | { projectIdent: string }).
 * For 1572 this persists the FIRST investigator's form (per-investigator
 * persistence mirrors /1572/pdf-all and is a follow-on).
 * Returns 201 { artifactId, formId, projectId, ready, missingRequired,
 * sponsorMustComplete, contentHash }; 409 PROGRAM_NOT_ANCHORED for a program
 * with no project record. `ready` is about the DATA (`missingRequired` is empty);
 * `sponsorMustComplete` is about the FORM — the required boxes the official
 * render leaves blank for the sponsor however complete the data is.
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
  // filled from the C1 anchor below; a program without one is refused 409.
  let effectiveProjectId = projectId;
  // Resolved once, below, and reused: the governed path used to re-resolve the
  // same ident a second time to fill the form from the record — a duplicate
  // query for a row already in hand.
  let resolvedProgram: ResolvedProgram | null = null;

  try {
    /*
     * The required boxes the official render leaves for the sponsor whatever
     * the data (FDA 1571: ind_type, phase_of_study). A DIFFERENT fact from
     * `ready`, which answers "is the project data complete" — this artifact
     * stores a field map, so that remains the right meaning for `ready`, and
     * folding these ids into it would repeat the conflation this change is
     * undoing one level down. Both facts travel in the response instead.
     *
     * Computed BEFORE anything is persisted and deliberately not caught here:
     * `requiredBoxesLeftToSponsor` throws rather than answering `[]` for a form
     * it cannot plan, and the handler's catch turns that into a 500. A governed
     * row that recorded "nothing left for the sponsor" because a template read
     * hiccuped is precisely the fabricated clean result to avoid.
     */
    const sponsorMustComplete = await requiredBoxesLeftToSponsor(formId);

    if (isProgramIdent) {
      // Program-spine path: resolve org-scoped, then anchor; a program with no
      // anchor has no dossier and is refused.
      const program = await resolveProgramIdent(rawIdent, ctx.organizationId);
      if (!program) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found for this organization.' } });
      }
      resolvedProgram = program;

      // Document Identity Contract slice C1 gave the program spine the numeric
      // anchor this registry needs (`projects.regulatory_program_id`, written by
      // intake in the same transaction that creates the program). The v2
      // wizard hands out program idents, so this is the id space real users'
      // Module-1 forms actually arrive with.
      //
      // Strict: a lookup that could not complete is a failure (500), never
      // read as "this program has no project record" — the 409 below states
      // that as a fact, so it may only follow a lookup that answered.
      const anchoredProjectId = await resolveProgramProjectAnchor(db, {
        programId: program.id,
        orgId: ctx.organizationId,
        context: 'ind-forms.artifact',
        strict: true,
      });
      if (anchoredProjectId === null) {
        /* P-20 follow-up (docs/LAUNCH_DEFINITION_OF_DONE.md): a program with
           no project record has no dossier, so nothing can be saved to it,
           and the answer is a refusal. It was a 200 "audited-unplaced" answer
           ({ governed: false }): a success status over a save that placed
           nothing. Every program a client can open has its record (P-19), so
           this is a gap to close, not a result. Nothing is written. */
        return res.status(409).json({
          error: {
            code: 'PROGRAM_NOT_ANCHORED',
            message:
              'This program has no project record, so it has no dossier to save the form into. Nothing was saved. ' +
              'An administrator can give the program its project record.',
          },
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

    // The program's recorded facts under anything the caller stated — the same
    // merge /build and /pdf use, so a governed artifact records the fields the
    // rendered form actually carries rather than only what was typed here.
    const built = buildFormById(formId, {
      ...(resolvedProgram ? programToFormMetadata(resolvedProgram) : {}),
      ...statedFields(body),
    });
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
        // Stored beside `ready`, not folded into it. `ready` travels alone into
        // dashboards and audit queries, and on its own "ready: true" for a 1571
        // reads as a form that can be signed — while its IND-type and phase
        // boxes are blank on every render of it. Both facts, or neither.
        sponsorMustComplete,
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
      metadata: { formId, projectId: effectiveProjectId, ready, sponsorMustComplete, contentHash },
    });
    if (!artifactAudit.persisted) {
      logger.warn('ind-form artifact audit row was not persisted', { err: artifactAudit.error ?? 'no durable store accepted the row' });
    }

    res.status(201).json({
      artifactId,
      formId,
      projectId: effectiveProjectId,
      ready,
      missingRequired: built.missingRequired,
      sponsorMustComplete,
      contentHash,
    });
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
 * Returns 201 { formId, projectId, sponsorMustComplete, artifacts: [{ artifactId,
 *   investigatorName, ready, missingRequired, contentHash }] }.
 * `sponsorMustComplete` is data-independent (a property of the form and its
 * reviewed mapping), so it is one value for the batch.
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

    // Data-independent, so it is one value for the batch rather than a copy on
    // every investigator's row. Same contract as /:formId/artifact: it throws
    // rather than reporting "none" for a form it cannot plan, and the handler's
    // catch turns that into a 500 before anything is persisted.
    const sponsorMustComplete = await requiredBoxesLeftToSponsor(formId);

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
              // See /:formId/artifact: `ready` is the data, this is the form.
              sponsorMustComplete,
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
        metadata: { formId, projectId, ready: r.ready, sponsorMustComplete, contentHash: r.contentHash, investigatorIndex: r.idx },
      });
      if (!batchArtifactAudit.persisted) {
        logger.warn('ind-form artifact audit row was not persisted (batch)', { err: batchArtifactAudit.error ?? 'no durable store accepted the row' });
      }
    }

    res.status(201).json({
      formId,
      projectId,
      sponsorMustComplete,
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
  const resolved = await metaForRequest(req, res, ctxOf(req));
  if (!resolved) return;
  try {
    const results = await generateAllForm1572(resolved.meta);
    res.json({
      formId: FORM_1572,
      documents: results.map((r) => ({
        usedOfficialTemplate: r.usedOfficialTemplate,
        reconstructed: r.reconstructed === true,
        fieldCoverage: r.fieldCoverage,
        missingRequired: r.missingRequired,
        // Per document: each investigator's form leaves its own boxes blank.
        // Always an array — see IndFormPdfResult.requiredFieldsLeftBlank.
        requiredFieldsLeftBlank: r.requiredFieldsLeftBlank,
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
  const resolved = await metaForRequest(req, res, ctxOf(req));
  if (!resolved) return;
  try {
    const results = await generateAllForm3455(resolved.meta);
    res.json({
      formId: FORM_3455,
      documents: results.map((r) => ({
        usedOfficialTemplate: r.usedOfficialTemplate,
        reconstructed: r.reconstructed === true,
        fieldCoverage: r.fieldCoverage,
        missingRequired: r.missingRequired,
        // Per document: each investigator's form leaves its own boxes blank.
        // Always an array — see IndFormPdfResult.requiredFieldsLeftBlank.
        requiredFieldsLeftBlank: r.requiredFieldsLeftBlank,
        pdfBase64: Buffer.from(r.pdfBytes).toString('base64'),
      })),
    });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * A sponsor's completed, signed official FDA form, attached and placed as a
 * Module 1 leaf.
 *
 * ── Why this endpoint exists ─────────────────────────────────────────────────
 * Everything else here RENDERS a form. Three of the five Module 1 forms end in a
 * signature — 1571, 1572, 3674 — and no server can produce one. The platform's
 * output is the genuine FDA file with the program's data already in it; the
 * sponsor opens it in Adobe Acrobat, completes the boxes the render plan named,
 * signs it, and the filing needs THAT file. Without this path the signed form
 * lived in somebody's downloads folder and the sequence carried a leaf with
 * nothing behind it.
 *
 * ── What it refuses, and why each refusal is fail-closed ─────────────────────
 *  - not a PDF (by its BYTES, not its declared type) — an eCTD leaf is a PDF;
 *  - byte-identical to the blank vendored template — attaching the blank form is
 *    attaching nothing, and it would file as though it were signed;
 *  - a program with no submission spine, or whose spine has no sequence yet —
 *    the eCTD sequence a document is filed into is a regulatory decision, so it
 *    is never created as a side effect of an upload;
 *  - a form the FDA Module 1 table catalogues no section for — the placement
 *    section is taken from the same catalogue the packager builds the backbone
 *    from, never guessed.
 *
 * Re-attaching REPLACES this form's leaf in the sequence rather than adding a
 * second one: two leaves for one form is a filing defect, and a sponsor
 * correcting a signature is the normal case.
 *
 * Multipart body: `file` (the completed PDF) + `projectIdent` (program UUID or
 * code) + `sequenceId` (the sequence the person chose — required, never picked:
 * it must belong to the program's submission and be neither frozen nor
 * dispatched). A form the registry does not apply to the program's application
 * type is refused (FORM_NOT_APPLICABLE). Returns 201 { formId, sectionCode,
 * leafId, sequenceId, sequenceNumber, sha256, requiredFieldsMissing, complete,
 * … }: the form is filed either way, and `complete` is the forms engine's
 * verdict on it (services/ind-forms/attached-form-check.ts) — an attachment
 * with a required field missing is filed, and is not a completed form.
 */
const officialFormUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: makeUploadFileFilter({ extensions: ['pdf'], mimeTypes: ['application/pdf'], allowMimePrefixes: [] }),
}).single('file');

/** Map a submission-service refusal onto its HTTP status, in its own words. */
function submissionRefusal(res: Response, err: SubmissionError): void {
  const status =
    err.code === 'FORBIDDEN' ? 403
      : err.code === 'NOT_FOUND' ? 404
        : err.code === 'INVALID_STATE' ? 409
          : 400;
  res.status(status).json({ error: { code: err.code, message: err.message } });
}

router.post('/:formId/official-upload', limiter, requireRole(AUTHOR), (req, res) => {
  officialFormUpload(req, res, (uploadErr: unknown) => {
    void (async () => {
      if (uploadErr) {
        // multer's own refusals (type, size) are the user's to fix, not a 500.
        const message = uploadErr instanceof Error ? uploadErr.message : 'The file could not be read.';
        return res.status(400).json({ error: { code: 'UPLOAD_REJECTED', message } });
      }
      const ctx = ctxOf(req);
      if (!ctx) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });

      const formId = String(req.params.formId);
      if (!isSupported(formId)) {
        return res.status(400).json({ error: { code: 'VALIDATION', message: `Unsupported form id: ${formId}` } });
      }
      const file = (req as Request & { file?: { buffer?: Buffer; originalname?: string } }).file;
      const bytes = file?.buffer;
      if (!bytes || bytes.length === 0) {
        return res.status(400).json({ error: { code: 'VALIDATION', message: 'Attach the completed form as `file`.' } });
      }
      // The declared content type is the client's claim; the bytes are the fact.
      if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
        return res.status(400).json({ error: { code: 'VALIDATION', message: 'The attached file is not a PDF.' } });
      }
      // …and scanned before it is stored (the platform guard; fail-closed in
      // production when no scan could run) — audit IAM-14, P1-5.
      try {
        await assertUploadSafe(bytes, 'application/pdf', file?.originalname ?? 'form.pdf');
      } catch (err) {
        if (err instanceof UploadSafetyError) {
          return res.status(err.status).json({ error: { code: err.body.code, message: err.body.error } });
        }
        throw err;
      }

      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const ident = typeof body.projectIdent === 'string' ? body.projectIdent.trim() : '';
      if (ident === '') {
        return res.status(400).json({
          error: { code: 'VALIDATION', message: 'projectIdent (the open program) is required to file a completed form.' },
        });
      }

      const program = await resolveProgramIdent(ident, ctx.organizationId);
      if (!program) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found for this organization.' } });
      }
      if (!formAppliesToProgram(formId, program.programType)) {
        return res.status(409).json({
          error: { code: 'FORM_NOT_APPLICABLE', message: `${notApplicableReason(formId, program.programType)} It was not filed.` },
        });
      }

      const sectionCode = sectionCodeForForm(formId);
      if (!sectionCode) {
        return res.status(409).json({
          error: {
            code: 'NO_CATALOGUED_SECTION',
            message: `The FDA Module 1 table catalogues no section for form ${formId.replace(/^FDA_/, '')}, so it cannot be placed. File it through the section it belongs to instead.`,
          },
        });
      }

      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      if ((await blankTemplateDigests(formId)).includes(sha256)) {
        return res.status(409).json({
          error: {
            code: 'BLANK_TEMPLATE',
            message: 'This is the blank official form, byte for byte. Complete and sign it in Adobe Acrobat, then attach the signed file.',
          },
        });
      }

      const spine = await spineOf(program, ctx.organizationId);
      if (!spine) {
        return res.status(409).json({
          error: {
            code: 'NO_SUBMISSION_SPINE',
            message: 'This program has no submission record yet, so there is nothing to file the form into.',
          },
        });
      }
      if (!spine.sequence) {
        return res.status(409).json({
          error: {
            code: 'NO_SEQUENCE',
            message: 'This submission has no eCTD sequence yet. Which sequence a document is filed into is a regulatory decision, so create the sequence first.',
          },
        });
      }

      /* The sequence is the person's choice, named on the upload. This filed
         into spine.sequence — the NEWEST sequence — so once an amendment
         existed every completed initial-IND form landed in the draft 0001
         while the original 0000 still reported "Required section 1.1 has no
         leaf" (QA 2026-10-08, j7). Every refusal below happens before any
         bytes are stored. */
      const sequenceId = Number(body.sequenceId);
      if (!Number.isInteger(sequenceId) || sequenceId <= 0) {
        return res.status(400).json({
          error: {
            code: 'SEQUENCE_REQUIRED',
            message: 'Choose the eCTD sequence to file this form into. Which sequence a document is filed into is a regulatory decision, so it is never picked for you.',
          },
        });
      }
      const [target] = await db
        .select({
          id: ectdSequences.id,
          sequenceNumber: ectdSequences.sequenceNumber,
          status: ectdSequences.status,
          submissionId: ectdSequences.submissionId,
        })
        .from(ectdSequences)
        .where(
          and(
            eq(ectdSequences.id, sequenceId),
            eq(ectdSequences.organizationId, ctx.organizationId),
            isNull(ectdSequences.deletedAt),
          ),
        )
        .limit(1);
      if (!target || Number(target.submissionId) !== spine.submissionId) {
        return res.status(409).json({
          error: {
            code: 'SEQUENCE_NOT_IN_PROGRAM',
            message: 'That sequence is not part of this program’s submission, so the form was not filed into it.',
          },
        });
      }
      if (isSequenceLocked(String(target.status))) {
        return res.status(409).json({
          error: {
            code: 'SEQUENCE_LOCKED',
            message: `Sequence ${target.sequenceNumber} is ${target.status}; its leaves are immutable, so the form was not filed into it.`,
          },
        });
      }
      const chosen = { id: Number(target.id), sequenceNumber: String(target.sequenceNumber) };

      /* An attached PDF is an attachment, not a completion (QA 2026-10-08,
         second walk, j7: the product's own unedited 1571 and 1572 were counted
         COMPLETE). The forms engine checks it — the build over the program's
         record and what the person stated with it, the same metadata Build &
         check uses, plus the boxes the platform's own render leaves blank when
         these bytes ARE that render — and the check is recorded with the file.
         The IND checklist counts the form only when nothing is missing. */
      const formCheck = await checkAttachedForm(
        formId,
        { ...programToFormMetadata(program), ...(statedFields(body) as IndProjectMetadata) },
        sha256,
      );

      const documentType = documentTypeForForm(formId);
      const shortId = formId.replace(/^FDA_/, '').toLowerCase();
      try {
        // One leaf per form: a re-attached signature corrects the placement it
        // already has rather than filing the same form twice.
        const [existing] = await db
          .select({ id: submissionLeaves.id })
          .from(submissionLeaves)
          .where(
            and(
              eq(submissionLeaves.sequenceId, chosen.id),
              eq(submissionLeaves.organizationId, ctx.organizationId),
              eq(submissionLeaves.documentType, documentType),
              isNull(submissionLeaves.deletedAt),
            ),
          )
          .limit(1);

        const stored = await storeRenderedLeafFile({
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          bytes,
          mime: 'application/pdf',
          fileName: `form-fda-${shortId}.pdf`,
          renderedFrom: 'ind_form_sponsor_upload',
          sectionCode,
          ...(formCheck.requiredFieldsMissing ? { requiredFieldsMissing: formCheck.requiredFieldsMissing } : {}),
        });

        const leaf = await upsertLeaf(
          {
            sequenceId: chosen.id,
            ...(existing ? { leafId: existing.id } : {}),
            sectionCode,
            title: `Form FDA ${formId.replace(/^FDA_/, '')} (sponsor-completed)`,
            granularity: 'leaf',
            lifecycleOp: 'new',
            documentTable: 'rendered_leaf_files',
            documentId: stored.id,
            documentType,
            checksum: stored.md5,
          },
          ctx,
        );

        // Part 11 record of a SIGNED regulatory form entering the filing. The
        // leaf write is itself audited by submission-service; this row records
        // the digest of the bytes the sponsor approved, which is the fact that
        // ties the filed leaf to the file they signed. Best-effort, like the
        // governed-artifact path: the leaf and the retained bytes are the
        // persisted trace, and an audit hiccup must not undo a filed placement.
        const uploadAudit = await auditService.logAction({
          action: 'ind_form.official_upload',
          userId: ctx.userId,
          organizationId: ctx.organizationId,
          resourceType: 'submission_leaf',
          resourceId: leaf.id,
          metadata: {
            formId,
            programId: program.id,
            sectionCode,
            sequenceId: chosen.id,
            sequenceNumber: chosen.sequenceNumber,
            sha256,
            md5: stored.md5,
            byteSize: bytes.length,
            originalFileName: typeof file?.originalname === 'string' ? file.originalname : null,
            replaced: Boolean(existing),
            requiredFieldsMissing: formCheck.requiredFieldsMissing,
            uneditedPlatformRender: formCheck.unedited,
          },
        });
        if (!uploadAudit?.persisted) {
          logger.warn('ind-form official upload audit row was not persisted', {
            err: uploadAudit?.error ?? 'no durable store accepted the row',
          });
        }

        return res.status(201).json({
          formId,
          programId: program.id,
          submissionId: spine.submissionId,
          sequenceId: chosen.id,
          sequenceNumber: chosen.sequenceNumber,
          leafId: leaf.id,
          sectionCode,
          documentType,
          fileName: `form-fda-${shortId}.pdf`,
          originalFileName: typeof file?.originalname === 'string' ? file.originalname : null,
          sha256,
          md5: stored.md5,
          byteSize: bytes.length,
          replaced: Boolean(existing),
          // The forms engine's check: complete only when nothing required is
          // missing; null when no check could be made (never complete).
          requiredFieldsMissing: formCheck.requiredFieldsMissing,
          complete: formCheck.requiredFieldsMissing !== null && formCheck.requiredFieldsMissing.length === 0,
          uneditedPlatformRender: formCheck.unedited,
        });
      } catch (err) {
        if (err instanceof SubmissionError) return submissionRefusal(res, err);
        throw err;
      }
    })().catch((err) => fail(res, err));
  });
});

export default router;
