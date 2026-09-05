/**
 * eCTD Compile API Routes
 *
 * Provides endpoints for compiling eCTD submission packages from the
 * INDWorkspace / program surfaces.
 *
 * Endpoints:
 *   POST /api/ectd-compile/:projectIdent/compile    — Full eCTD compilation
 *   GET  /api/ectd-compile/:projectIdent/status     — Compilation readiness
 *   GET  /api/ectd-compile/:projectIdent/history    — Compilation history
 *   POST /api/ectd-compile/:projectIdent/validate   — Pre-compile validation
 *
 * `:projectIdent` accepts the legacy numeric projects.id (the key of the
 * project_sections store) OR a program identifier — a regulatory_programs UUID
 * or program code — resolved org-scoped, mirroring the eSTAR meta.ident contract
 * (see server/routes/510k-estar-routes.ts resolveProjectAnchor).
 *
 * TWO COMPILE PATHS, one honest answer:
 *   • SPINE-BACKED (canonical): a program ident whose program resolves to a
 *     canonical `submissions` row (the same product/name/code identity
 *     convention the ind-checklist-view-assembler and the C2C intake use) with
 *     an eCTD sequence carrying placed `submission_leaves` compiles through the
 *     REAL generator — `ectd/assemble-from-core` driving the regional packager
 *     (ICH v3.2.2 backbone, MD5 manifest, genuine rendered PDF leaves). The
 *     response's xmlBackbone is the package's real index.xml and
 *     leafFilesRendered counts leaves actually materialized to disk.
 *   • DRAFT BACKBONE (legacy store): a numeric ident (project_sections) or a
 *     program with no linked spine compiles the honest draft backbone over
 *     authored section text — every <ectd:leaf> carries rendered="false", and
 *     submissionBlockers says exactly why no leaf file exists and where leaf
 *     rendering actually runs.
 *
 * @module server/routes/ectd-compile
 * @compliance ICH M8, ICH eCTD v3.2.2, FDA ESG
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';

import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { resolveSubmissionSpine, type SubmissionSpine } from '../services/cmc/submission-spine';
import { buildLeafManifest } from '../services/ectd/sequence-manifest';
import {
  resolveRequiredSections,
  type RequiredSectionSet,
  type RequiredSectionProvenance,
} from '../services/ectd/required-sections';

const router = Router();

/** SHA-256 of a UTF-8 string, hex. Used for real content hashes in the backbone. */
function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Why a compile has no leaf files, stated from the ACTUAL state of the
 * submission spine — not from a hardcoded capability flag. Leaf rendering IS
 * implemented (ectd/assemble-from-core renders real PDF leaves from placed
 * submission_leaves); what varies is whether THIS project is connected to it.
 * Every message keeps the words "leaf files" so the surface's blocker panel and
 * the pinned tests read consistently.
 */
const NO_SPINE_LEAF_BLOCKER =
  'No leaf files have been rendered for this compile: it is not linked to a canonical submission ' +
  '(submissions → eCTD sequence) with placed documents, so this backbone describes authored ' +
  'section content only and cannot be transmitted to an agency gateway. Leaf rendering runs from ' +
  'the submission spine — create the program\'s submission and place approved documents into its ' +
  'eCTD sequence.';

const NO_SEQUENCE_LEAF_BLOCKER =
  'No leaf files have been rendered: the linked submission has no eCTD sequence yet, so there are ' +
  'no placed documents to render and the package cannot be transmitted. Create a sequence and ' +
  'place approved documents into it.';

const NO_PLACED_LEAVES_BLOCKER =
  'No leaf files have been rendered: the submission\'s eCTD sequence has no placed documents, so ' +
  'the package cannot be transmitted. Place approved documents into the sequence to render real ' +
  'PDF leaf files.';

/**
 * What stands between this project and a transmissible submission (draft-path
 * and status-endpoint variant — the spine-backed compile computes its blockers
 * from the actual assembly result instead).
 *
 * `submissionReady` previously meant "content validation raised no blocking
 * errors", and the surface rendered that as the words "Submission-ready" next to
 * a download button. Content completeness is a real and useful signal, but it is
 * not submission readiness: a package with no leaf files cannot be submitted no
 * matter how complete its section text. Telling a regulatory user otherwise is
 * the most consequential thing this route could get wrong.
 *
 * Blockers are returned as text so the surface can say WHY rather than showing a
 * bare negative.
 */
function submissionBlockers(
  contentErrors: string[],
  anchor?: CompileAnchor,
  spine?: SubmissionSpine | null,
): string[] {
  const blockers: string[] = [];
  const leavesPlaced = (spine?.sequence?.leafCount ?? 0) > 0;
  if (anchor && anchor.numericProjectId === null && !leavesPlaced) {
    blockers.push(PROGRAM_SECTION_STORE_BLOCKER);
  }
  if (contentErrors.length > 0) {
    blockers.push(
      `${contentErrors.length} blocking content ${contentErrors.length === 1 ? 'issue' : 'issues'} must be resolved.`,
    );
  }
  // The leaf-rendering answer, from the spine's real state.
  if (!spine) {
    blockers.push(NO_SPINE_LEAF_BLOCKER);
  } else if (!spine.sequence) {
    blockers.push(NO_SEQUENCE_LEAF_BLOCKER);
  } else if (spine.sequence.leafCount === 0) {
    blockers.push(NO_PLACED_LEAVES_BLOCKER);
  } else {
    // Documents are placed; rendering + verification happen at compile time.
    blockers.push(
      `${spine.sequence.leafCount} document(s) are placed in the submission's eCTD sequence. ` +
        'Run Compile to render the leaf files and verify the package before it can be considered submission-ready.',
    );
  }
  return blockers;
}

/**
 * Organization id for the caller, taken only from authenticated request
 * context — never from params, query or body.
 *
 * Every route here reads `project_sections`, which is tenant data. Routes that
 * omitted this filter let one organization compile, validate or inspect the
 * readiness of another organization's submission by guessing a numeric project
 * id, so a null return must be treated as 401 rather than "no scope".
 */
function resolveOrgId(req: Request): number | null {
  const raw =
    (req as any).tenantId ||
    (req as any).tenantContext?.organizationId ||
    (req as any).organizationId ||
    (req as any).user?.organizationId;
  const numeric = raw != null ? Number(raw) : NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT-IDENT RESOLUTION (numeric legacy id | program UUID | program code)
// ═══════════════════════════════════════════════════════════════════════════════

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Why a program-spine project compiles against an empty section set. Stated once
 * and returned verbatim as a blocker / validation finding so the caller is told,
 * in so many words, why readiness is 0% — never left to infer it from silence.
 */
// Client-reaching copy: names the condition and the consequence, but no schema
// object — table names must never reach a response body (BP-W0-5).
const PROGRAM_SECTION_STORE_BLOCKER =
  'This program has no linked section-tracking store: section tracking is keyed by the ' +
  'legacy numeric project id and no numeric project row exists for this program, so no ' +
  'authored sections are visible to the compiler (pending the document-identity contract).';

interface CompileAnchor {
  /** Legacy numeric projects.id when the ident was numeric — keys project_sections. */
  numericProjectId: number | null;
  /** Resolved regulatory_programs UUID when the ident named a program. */
  programId: string | null;
  programCode: string | null;
  title: string | null;
  /** Program product_name — one of the spine identity keys. */
  productName: string | null;
  /** Program type (ind/cta/nda/…) — maps to submissions.application_type. */
  programType: string | null;
  /** Program primary agency ('FDA', 'EMA', …) — selects the rule pack. */
  primaryAgency: string | null;
  /** Stable human label used in compilation names + the history filter. */
  label: string;
}

/**
 * Resolve the route's `:projectIdent`, org-scoped, mirroring the eSTAR ident
 * contract: numeric → the legacy project id (pass-through — every section query
 * is already org-scoped), UUID → regulatory_programs.id, else →
 * regulatory_programs.code. Returns null when nothing in this org matches — the
 * caller must 404, never compile against an unresolved project.
 */
async function resolveCompileAnchor(ident: string, orgId: number): Promise<CompileAnchor | null> {
  if (/^\d+$/.test(ident)) {
    const numeric = parseInt(ident, 10);
    if (!Number.isInteger(numeric) || numeric <= 0) return null;
    return {
      numericProjectId: numeric,
      programId: null,
      programCode: null,
      title: null,
      productName: null,
      programType: null,
      primaryAgency: null,
      label: `Project ${numeric}`,
    };
  }
  const byUuid = UUID_RE.test(ident);
  try {
    const result = await pool.query(
      `SELECT id, code, name, product_name, program_type, primary_agency FROM regulatory_programs
        WHERE ${byUuid ? 'id = $1' : 'code = $1'} AND organization_id = $2 AND deleted_at IS NULL
        LIMIT 1`,
      [ident, orgId],
    );
    const row = result.rows[0];
    if (row) {
      return {
        numericProjectId: null,
        programId: String(row.id),
        programCode: row.code != null ? String(row.code) : null,
        title: row.name != null ? String(row.name) : null,
        productName: row.product_name != null ? String(row.product_name) : null,
        programType: row.program_type != null ? String(row.program_type) : null,
        primaryAgency: row.primary_agency != null ? String(row.primary_agency) : null,
        label: `Program ${row.code ?? row.id}`,
      };
    }
  } catch {
    // A failed lookup is a non-match — never a guessed anchor.
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMISSION SPINE RESOLUTION (program → canonical submissions → sequence)
// ═══════════════════════════════════════════════════════════════════════════════

/* The program ↔ submission identity convention (DRUG_APPLICATION_TYPES,
   SubmissionSpine, resolveSubmissionSpine) moved to
   services/cmc/submission-spine.ts — the Module 3 OS compose dispatches
   regional composition (3.2.R) on the SAME spine this compile runs against,
   and an identity convention gets exactly one owner. */

/**
 * Shared route prologue: org from auth context (401), then the ident resolved
 * org-scoped (404). Responds itself and returns null on failure so handlers
 * fail closed with one line.
 */
async function anchorFromRequest(
  req: Request,
  res: Response,
): Promise<{ orgId: number; anchor: CompileAnchor; ident: string } | null> {
  const ident = String(req.params.projectIdent ?? '').trim();
  if (!ident) {
    res.status(400).json({ error: 'Valid project identifier required' });
    return null;
  }
  const orgId = resolveOrgId(req);
  if (!orgId) {
    res.status(401).json({ error: 'Organization context required' });
    return null;
  }
  const anchor = await resolveCompileAnchor(ident, orgId);
  if (!anchor) {
    res.status(404).json({ error: 'Project not found in your organization' });
    return null;
  }
  return { orgId, anchor, ident };
}

/**
 * Load the anchor's tracked sections. A program-spine anchor has NO
 * project_sections store (integer FK — see PROGRAM_SECTION_STORE_BLOCKER), so it
 * loads an honestly-empty set rather than someone else's rows or a fabricated
 * one. `swallow` preserves each route's existing table-missing behavior.
 */
async function loadAnchorSections(
  anchor: CompileAnchor,
  orgId: number,
  columns: string,
  opts: { orderBy?: string; swallow?: boolean } = {},
): Promise<any[]> {
  if (anchor.numericProjectId === null) return [];
  try {
    const result = await pool.query(
      `SELECT ${columns}
       FROM project_sections
       WHERE project_id = $1 AND organization_id = $2${opts.orderBy ? ` ORDER BY ${opts.orderBy}` : ''}`,
      [anchor.numericProjectId, orgId],
    );
    return result.rows;
  } catch (err) {
    if (opts.swallow) return []; // table may not exist — honest empty
    throw err;
  }
}

/**
 * Prepend the unlinked-section-store finding for program-spine anchors so the
 * validation report itself names the real reason every required section reads
 * as missing.
 */
function withAnchorFindings(results: ValidationResult[], anchor: CompileAnchor): ValidationResult[] {
  if (anchor.numericProjectId !== null) return results;
  return [
    {
      rule: 'SECTION_STORE_UNLINKED',
      severity: 'error',
      message: PROGRAM_SECTION_STORE_BLOCKER,
      fix: 'Author sections under a legacy sectioned project, or wait for the program → section-store mapping (document-identity contract).',
    },
    ...results,
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface CompilationResult {
  id: string;
  /** Legacy numeric project id, or null when the ident named a program. */
  projectId: number | null;
  /** The ident the caller addressed (numeric id, program UUID, or code). */
  projectIdent: string;
  /** Resolved regulatory_programs UUID for program-spine idents. */
  programId: string | null;
  status: 'pending' | 'compiling' | 'validating' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  modules: ModuleCompilationStatus[];
  xmlBackbone?: string;
  validationResults?: ValidationResult[];
  /** Content validation raised no blocking errors. NOT the same as submittable. */
  contentValidationPassed: boolean;
  /** True only when nothing stands between this package and transmission. */
  submissionReady: boolean;
  /** Why not, in the caller's words. Empty exactly when submissionReady. */
  submissionBlockers: string[];
  /** Where the required-section set came from: the program's live rule pack,
   *  or the labelled ICH baseline when no pack applies (with the reason). */
  requiredSectionSource: RequiredSectionProvenance;
  /** The governed submission this spine-backed compile ran against — the
   *  handle POST /api/ectd/export/:submissionId needs to hand the caller the
   *  actual package bytes. Absent on draft-backbone compiles, which assemble
   *  no package to download. */
  submissionId?: number;
  /** The sequence identity recorded for this compile (e.g. "0001"). */
  sequenceNumber?: string;
  /** Leaf files actually rendered to disk: the materialized count on the
   *  spine-backed compile, 0 on the draft-backbone path. */
  leafFilesRendered?: number;
  errors: string[];
  warnings: string[];
}

interface ModuleCompilationStatus {
  moduleCode: string;
  moduleName: string;
  totalSections: number;
  completedSections: number;
  requiredSections: number;
  requiredCompleted: number;
  status: 'complete' | 'partial' | 'missing';
  documents: DocumentStatus[];
}

interface DocumentStatus {
  sectionCode: string;
  title: string;
  status: string;
  hasContent: boolean;
  required: boolean;
  wordCount?: number;
}

interface ValidationResult {
  rule: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  sectionCode?: string;
  fix?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REQUIRED SECTIONS — resolved per program from its live rule pack
// (services/ectd/required-sections); the labelled ICH baseline when none applies.
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:projectIdent/compile — Full eCTD compilation
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/:projectIdent/compile', async (req: Request, res: Response) => {
  // Org from auth context, then the ident resolved org-scoped (404 on a miss) —
  // never compile against an unresolved project.
  const resolved = await anchorFromRequest(req, res);
  if (!resolved) return;
  const { orgId, anchor, ident } = resolved;

  try {
    const { modules: targetModules, submissionType = 'initial', region = 'FDA' } = req.body;
    const required = await resolveRequiredSections(pool, {
      programType: anchor.programType,
      primaryAgency: anchor.primaryAgency,
    });
    const moduleFilter = Array.isArray(targetModules)
      ? new Set(targetModules.map((m: string) => String(m).toLowerCase()))
      : null;

    // 0. CANONICAL PATH: a program whose submission spine carries placed leaves
    //    compiles through the real generator (assemble-from-core → regional
    //    packager) — genuine rendered PDF leaves, real index.xml, real MD5s.
    const spine = await resolveSubmissionSpine(anchor, orgId);
    if (spine?.sequence && spine.sequence.leafCount > 0) {
      return await compileFromSpine(req, res, {
        orgId,
        anchor,
        ident,
        spine,
        submissionType: String(submissionType),
        moduleFilter,
        required,
      });
    }

    // DRAFT-BACKBONE PATH (legacy section store, or a spine with nothing
    // placed): compiles the honest draft backbone; the blockers name the real
    // reason no leaf file exists.

    // 1. Gather all project sections from DB.
    //
    // TENANCY: filtered by organization_id as well as project_id. The org
    // filter was described in this comment but absent from the SQL, so any
    // authenticated organization could compile a submission from another
    // organization's sections just by guessing a numeric project id.
    // `project_sections.organization_id` is NOT NULL (see
    // db/migrations/20260220_ind_section_tracking.sql), so this cannot
    // legitimately exclude rows that belong to the caller. A program-spine
    // ident loads an honestly-empty set (no linked section store).
    const sections = await loadAnchorSections(
      anchor,
      orgId,
      `section_code, title, status, content, word_count, assigned_to, module,
              required, updated_at`,
      { orderBy: 'section_code' },
    );

    // 2. Run pre-compile validation
    const validationResults = withAnchorFindings(runPreCompileValidation(sections, region, required), anchor);
    const hasBlockingErrors = validationResults.some(v => v.severity === 'error');

    // 3. Build module compilation status
    const moduleStatuses: ModuleCompilationStatus[] = required.modules
      .filter((def) => !moduleFilter || moduleFilter.has(def.code))
      .map((def) => {
        const code = def.code;
        const moduleSections = sections.filter(
          s => s.section_code?.startsWith(code.replace('m', '')) || s.module?.toLowerCase() === code
        );
        const requiredSections = def.requiredSections;
        const completedRequired = requiredSections.filter(rs =>
          moduleSections.some(
            ms =>
              ms.section_code?.startsWith(rs) && ['approved', 'locked', 'final'].includes(ms.status)
          )
        );

        return {
          moduleCode: code,
          moduleName: def.name,
          totalSections: moduleSections.length,
          completedSections: moduleSections.filter(s =>
            ['approved', 'locked', 'final', 'review'].includes(s.status)
          ).length,
          requiredSections: requiredSections.length,
          requiredCompleted: completedRequired.length,
          status:
            completedRequired.length === requiredSections.length
              ? 'complete'
              : completedRequired.length > 0
                ? 'partial'
                : 'missing',
          documents: moduleSections.map(s => ({
            sectionCode: s.section_code,
            title: s.title,
            status: s.status,
            hasContent: !!(s.content && s.content.trim().length > 0),
            required: !!s.required,
            wordCount: s.word_count || 0,
          })),
        };
      });

    // 4. Generate eCTD 4.0 XML backbone. The application reference is the
    //    recorded identity we actually hold: the legacy numeric id (unchanged),
    //    or the program's real recorded code — never an invented number.
    const xmlBackbone = generateECTD4Backbone({
      applicationRef:
        anchor.numericProjectId !== null
          ? `IND-${anchor.numericProjectId}`
          : anchor.programCode ?? anchor.programId ?? ident,
      submissionType,
      region,
      modules: moduleStatuses,
      sections,
    });

    // 5. Record compilation
    const compilationId = `comp_${Date.now()}_${anchor.numericProjectId ?? anchor.programId}`;
    // This insert previously bound SIX values to FIVE placeholders with a
    // duplicated orgId in second position, so every remaining value landed one
    // column to the left: the org id was written as compilation_name, the name
    // as compilation_type, the submission type as status, the status as
    // xml_backbone — and the actual XML backbone was dropped. It could never
    // execute anyway: module_id and compiled_by were NOT NULL and unsupplied.
    // The catch below blamed a missing table, so the failure was invisible and
    // GET /:projectId/history was permanently empty. See ledger C-16.
    const compilationName = `IND Compilation — ${anchor.label}`;
    try {
      await pool.query(
        `INSERT INTO ectd_compilations
           (organization_id, compilation_name, compilation_type, status,
            xml_backbone, validation_results, compiled_at, version)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), '1.0')`,
        [
          orgId,
          compilationName,
          submissionType,
          hasBlockingErrors ? 'failed' : 'completed',
          xmlBackbone,
          JSON.stringify(validationResults),
        ]
      );
    } catch (err: any) {
      // Still non-blocking — a compilation the caller can download is worth more
      // than a failed request — but say what actually went wrong instead of
      // assuming the table is missing.
      console.warn(
        `[eCTD Compile] could not record compilation for ${anchor.label}: ${err?.message}`
      );
    }

    const errors = validationResults.filter(v => v.severity === 'error').map(v => v.message);
    const blockers = submissionBlockers(errors, anchor, spine);

    const result: CompilationResult = {
      id: compilationId,
      projectId: anchor.numericProjectId,
      projectIdent: ident,
      programId: anchor.programId,
      // The BACKBONE compiled — that part did succeed, and the caller can
      // download it. Whether the package can be submitted is a separate
      // question, answered by submissionReady/submissionBlockers below.
      status: hasBlockingErrors ? 'failed' : 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      modules: moduleStatuses,
      xmlBackbone,
      validationResults,
      contentValidationPassed: errors.length === 0,
      submissionReady: blockers.length === 0,
      submissionBlockers: blockers,
      requiredSectionSource: required.provenance,
      // The draft path renders nothing to disk — 0 is the honest count. The
      // spine-backed path reports the leaves it actually materialized.
      leafFilesRendered: 0,
      errors,
      warnings: validationResults.filter(v => v.severity === 'warning').map(v => v.message),
    };

    console.log(
      `[eCTD Compile] ${anchor.label}: ${result.status} | ` +
        `${moduleStatuses.filter(m => m.status === 'complete').length}/5 modules complete | ` +
        `${validationResults.filter(v => v.severity === 'error').length} errors, ` +
        `${validationResults.filter(v => v.severity === 'warning').length} warnings`
    );

    res.json(result);
  } catch (error: any) {
    console.error('[eCTD Compile] Compilation failed:', error);
    res.status(500).json({
      error: 'Compilation failed',
      message: error.message,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SPINE-BACKED COMPILE (canonical assemble-from-core path)
// ═══════════════════════════════════════════════════════════════════════════════

/** Acting user id for audit attribution on the canonical assembler. */
function resolveUserId(req: Request): number {
  const user = (req as any).user;
  const n = Number(user?.id ?? user?.userId);
  return Number.isFinite(n) ? n : 0;
}

/** Case-insensitive CTD-section prefix match (leaf '3.2.s' covers '3.2.S').
 *  A leading module prefix is normalized away first: the Module 3 placement
 *  writes leaf codes as 'm3.2.S.1' (toLeafSectionCode = 'm' + key), and the
 *  raw startsWith made every one of those invisible to this gate — a fully
 *  placed Module 3 was reported REQUIRED_SECTION_UNPLACED on 3.2.S/3.2.P/3.2.R
 *  while the sections sat in the sequence. */
function sectionMatches(sectionCode: unknown, requiredCode: string): boolean {
  const code = String(sectionCode ?? '')
    .trim()
    .toLowerCase()
    .replace(/^m(?=\d)/, '');
  return code.startsWith(requiredCode.toLowerCase().replace(/^m(?=\d)/, ''));
}

interface SpineLeafRow {
  section_code: string | null;
  title: string | null;
  lifecycle_op: string | null;
  document_table: string | null;
  document_id: number | null;
}

/**
 * Validation findings over the PLACED leaves of a sequence. `isMaterialized`
 * is provided by the compile path (which knows what actually rendered); the
 * validate endpoint omits it and speaks only about placement — it never claims
 * a leaf rendered without having rendered it.
 *
 * A required section with no placed document is a blocking error for an
 * INITIAL sequence (0000) and advisory for later sequences — lifecycle
 * sequences legitimately carry only what changed.
 */
function leafPlacementFindings(
  leaves: SpineLeafRow[],
  opts: { initialSequence: boolean; required: RequiredSectionSet; isMaterialized?: (l: SpineLeafRow) => boolean },
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const missingSeverity: ValidationResult['severity'] = opts.initialSequence ? 'error' : 'warning';
  const allRequired = opts.required.modules.flatMap((m) => m.requiredSections);

  for (const reqCode of allRequired) {
    const found = leaves.find((l) => sectionMatches(l.section_code, reqCode));
    if (!found) {
      results.push({
        rule: 'REQUIRED_SECTION_UNPLACED',
        severity: missingSeverity,
        message: `No document is placed at required section ${reqCode}${opts.initialSequence ? '' : ' (advisory: lifecycle sequences may carry only changed sections)'}`,
        sectionCode: reqCode,
        fix: `Place an approved document at section ${reqCode} in the submission's eCTD sequence`,
      });
    } else if (opts.isMaterialized && !opts.isMaterialized(found)) {
      results.push({
        rule: 'LEAF_SOURCE_UNRESOLVED',
        severity: 'error',
        message: `Section ${reqCode} (${found.title ?? found.section_code}) is placed but its source document could not be materialized into a leaf file`,
        sectionCode: reqCode,
        fix: 'Re-point the leaf at a renderable document (coauthor/unified) or upload the final PDF',
      });
    } else {
      results.push({
        rule: 'REQUIRED_SECTION_OK',
        severity: 'info',
        message: opts.isMaterialized
          ? `Section ${reqCode} (${found.title ?? found.section_code}) is placed and rendered`
          : `Section ${reqCode} (${found.title ?? found.section_code}) is placed`,
        sectionCode: reqCode,
      });
    }
  }

  // Unrenderable placed leaves at non-required sections are still errors —
  // an incomplete package must be visible, never silently dropped.
  if (opts.isMaterialized) {
    for (const l of leaves) {
      if (
        !opts.isMaterialized(l) &&
        !allRequired.some((rc) => sectionMatches(l.section_code, rc))
      ) {
        results.push({
          rule: 'LEAF_SOURCE_UNRESOLVED',
          severity: 'error',
          message: `Placed leaf ${l.section_code ?? '?'} (${l.title ?? 'untitled'}) could not be materialized into a leaf file`,
          sectionCode: l.section_code ?? undefined,
          fix: 'Re-point the leaf at a renderable document (coauthor/unified) or upload the final PDF',
        });
      }
    }
  }

  return results;
}

/** Module roll-up computed from the sequence's placed leaves. */
function moduleStatusesFromLeaves(
  leaves: SpineLeafRow[],
  isMaterialized: (l: SpineLeafRow) => boolean,
  moduleFilter: Set<string> | null,
  required: RequiredSectionSet,
): ModuleCompilationStatus[] {
  return required.modules
    .filter((def) => !moduleFilter || moduleFilter.has(def.code))
    .map((def) => {
      const code = def.code;
      const digit = code.replace('m', '');
      const moduleLeaves = leaves.filter((l) => sectionMatches(l.section_code, digit));
      const completedRequired = def.requiredSections.filter((rs) =>
        moduleLeaves.some((l) => sectionMatches(l.section_code, rs) && isMaterialized(l)),
      );
      return {
        moduleCode: code,
        moduleName: def.name,
        totalSections: moduleLeaves.length,
        completedSections: moduleLeaves.filter(isMaterialized).length,
        requiredSections: def.requiredSections.length,
        requiredCompleted: completedRequired.length,
        status:
          completedRequired.length === def.requiredSections.length
            ? ('complete' as const)
            : completedRequired.length > 0
              ? ('partial' as const)
              : ('missing' as const),
        documents: moduleLeaves.map((l) => ({
          sectionCode: String(l.section_code ?? ''),
          title: String(l.title ?? l.section_code ?? ''),
          status: isMaterialized(l) ? 'rendered' : 'unresolved-source',
          hasContent: isMaterialized(l),
          required: def.requiredSections.some((rs) => sectionMatches(l.section_code, rs)),
        })),
      };
    });
}

/**
 * Compile through the canonical generator: assemble the sequence's placed
 * leaves into a REAL eCTD package (rendered PDF leaves, ICH v3.2.2 backbone,
 * MD5 manifest), then answer with the same CompilationResult shape the surface
 * already renders — xmlBackbone is the package's actual index.xml and
 * leafFilesRendered the materialized count. An assembly refusal (path safety,
 * packager validation) is surfaced as a structured `failed` compilation with
 * the refusal text, never papered over and never a bare 500.
 */
async function compileFromSpine(
  req: Request,
  res: Response,
  args: {
    orgId: number;
    anchor: CompileAnchor;
    ident: string;
    spine: SubmissionSpine;
    submissionType: string;
    moduleFilter: Set<string> | null;
    required: RequiredSectionSet;
  },
): Promise<void> {
  const { orgId, anchor, ident, spine, submissionType, moduleFilter, required } = args;
  const seq = spine.sequence!;
  const startedAt = new Date().toISOString();

  const leafRes = await pool.query(
    `SELECT section_code, title, lifecycle_op, document_table, document_id
       FROM submission_leaves
      WHERE sequence_id = $1 AND organization_id = $2 AND deleted_at IS NULL
      ORDER BY section_code`,
    [seq.id, orgId],
  );
  const leaves = leafRes.rows as SpineLeafRow[];

  // Canonical assembler (dynamic import keeps the draft-only path light and
  // lets route tests that stub the pool avoid loading the drizzle stack).
  const { assembleSequence } = await import('../services/ectd/assemble-from-core');

  let xmlBackbone = '';
  let materialized = 0;
  let unresolvedKeys = new Set<string>();
  let unresolvedCount = 0;
  let dtdSelfContained: boolean | null = null;
  let packageSha256: string | null = null;
  let assembleFailure: string | null = null;
  // Per-sequence leaf manifest → persisted so the NEXT sequence can load it and
  // compute real replace/append/delete lifecycle ops (loadPriorSequenceManifest).
  // Without this write-half, prior-sequence load always returned [] and every
  // leaf stayed `new` — no amendments/supplements were producible.
  let leafManifestJson: string | null = null;

  try {
    const assembled = await assembleSequence({
      sequenceId: seq.id,
      organizationId: orgId,
      userId: resolveUserId(req),
      // Recorded identity only: the program's real code, else a handle that
      // says it is unassigned — never an invented agency number, and never an
      // applicant name the agency would read as real. The comment here already
      // claimed "neutral", but `Organization 7` in <name> does not read as a
      // gap; these follow regulatory-identifiers.ts' stated wording instead.
      applicationId: anchor.programCode ?? `UNASSIGNED-SEQ-${seq.id}`,
      sponsorId: `UNASSIGNED-ORG-${orgId}`,
      sponsorName: `UNASSIGNED (organization ${orgId})`,
    });
    try {
      const buffer = await fs.readFile(assembled.bundle.path);
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(buffer);
      xmlBackbone = (await zip.file('index.xml')?.async('string')) ?? '';
      materialized = assembled.materialized;
      unresolvedCount = assembled.unresolvedLeaves.length;
      unresolvedKeys = new Set(
        assembled.unresolvedLeaves.map((u) => `${u.documentTable ?? ''}:${u.documentId ?? ''}`),
      );
      dtdSelfContained = assembled.bundle.dtdStatus?.selfContained ?? null;
      packageSha256 = assembled.bundle.sha256;
      // Snapshot this sequence's shipped leaves as its immutable manifest.
      const manifest = buildLeafManifest(assembled.bundle.leafManifest ?? []);
      leafManifestJson = manifest.length > 0 ? JSON.stringify(manifest) : null;
    } finally {
      await assembled.cleanup();
    }
  } catch (err) {
    assembleFailure = err instanceof Error ? err.message : String(err);
  }

  // A leaf with no document at all was reported materialized: the resolver
  // skips a NULL document_table/document_id before it can become "unresolved",
  // so its key ':' was never in unresolvedKeys and a required section read as
  // satisfied by a leaf that has nothing behind it. Nothing renders without a
  // document — a declared delete included, which withdraws rather than places.
  const isMaterialized = (l: SpineLeafRow) =>
    assembleFailure == null &&
    !!l.document_table &&
    !!l.document_id &&
    !unresolvedKeys.has(`${l.document_table}:${l.document_id}`);

  const initialSequence = seq.sequenceNumber === '0000';
  const validationResults = leafPlacementFindings(leaves, { initialSequence, required, isMaterialized });
  if (assembleFailure != null) {
    validationResults.unshift({
      rule: 'ASSEMBLY_REFUSED',
      severity: 'error',
      message: `eCTD assembly refused: ${assembleFailure}`,
      fix: 'Resolve the refusal (leaf sources, path safety, packager gates) and compile again.',
    });
  }
  const errors = validationResults.filter((v) => v.severity === 'error').map((v) => v.message);
  // The compile STATUS reports whether the package assembled — the same
  // separation the draft path pins ("the backbone DID compile"): findings and
  // blockers answer submittability, `failed` means the assembly itself refused.
  const compileStatus: CompilationResult['status'] = assembleFailure != null ? 'failed' : 'completed';
  const moduleStatuses = moduleStatusesFromLeaves(leaves, isMaterialized, moduleFilter, required);

  // Blockers computed from the REAL assembly outcome.
  const blockers: string[] = [];
  if (assembleFailure != null) {
    blockers.push(`eCTD assembly refused: ${assembleFailure}`);
  } else {
    if (unresolvedCount > 0) {
      blockers.push(
        `${unresolvedCount} placed document(s) could not be materialized into leaf files — the package is incomplete until their sources are renderable.`,
      );
    }
    const missingRequired = validationResults.filter(
      (v) => v.rule === 'REQUIRED_SECTION_UNPLACED' && v.severity === 'error',
    ).length;
    if (missingRequired > 0) {
      blockers.push(
        `${missingRequired} required section(s) have no placed document for this initial sequence.`,
      );
    }
    if (dtdSelfContained === false) {
      blockers.push(
        'The package references eCTD DTDs that are not bundled under util/dtd/ — it is not self-contained. Vendor the ICH/regional DTDs before transmission.',
      );
    }
  }

  // Record the compilation (real backbone + recorded sequence identity, so this
  // path feeds the sequence-continuity gate). Non-blocking, same as the draft
  // path — a compilation the caller can download is worth more than a failed
  // request.
  const compilationName = `IND Compilation — ${anchor.label}`;
  try {
    await pool.query(
      `INSERT INTO ectd_compilations
         (organization_id, compilation_name, compilation_type, status,
          xml_backbone, validation_results, compiled_at, version,
          application_number, sequence_number, leaf_manifest, submission_id)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), '1.0', $7, $8, $9, $10)`,
      [
        orgId,
        compilationName,
        submissionType,
        compileStatus,
        xmlBackbone,
        JSON.stringify(validationResults),
        anchor.programCode ?? `SEQ-${seq.id}`,
        seq.sequenceNumber,
        leafManifestJson,
        // Stable per-submission key: lets the NEXT sequence locate this manifest
        // via loadLatestPriorManifestBySubmission regardless of application_number.
        spine.submissionId,
      ],
    );
  } catch (err: any) {
    console.warn(
      `[eCTD Compile] could not record spine compilation for ${anchor.label}: ${err?.message}`,
    );
  }

  const result: CompilationResult = {
    id: `comp_${Date.now()}_${anchor.programId ?? anchor.numericProjectId}`,
    projectId: anchor.numericProjectId,
    projectIdent: ident,
    programId: anchor.programId,
    status: compileStatus,
    startedAt,
    completedAt: new Date().toISOString(),
    modules: moduleStatuses,
    xmlBackbone: xmlBackbone || undefined,
    validationResults,
    contentValidationPassed: errors.length === 0,
    submissionReady: blockers.length === 0,
    submissionBlockers: blockers,
    requiredSectionSource: required.provenance,
    leafFilesRendered: materialized,
    submissionId: spine.submissionId,
    sequenceNumber: seq.sequenceNumber,
    errors,
    warnings: validationResults.filter((v) => v.severity === 'warning').map((v) => v.message),
  };

  console.log(
    `[eCTD Compile] ${anchor.label}: spine-backed ${result.status} | sequence ${seq.sequenceNumber} | ` +
      `${materialized} leaf file(s) rendered, ${unresolvedCount} unresolved` +
      (packageSha256 ? ` | sha256 ${packageSha256.slice(0, 12)}…` : ''),
  );

  res.json(result);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /:projectIdent/status — Compilation readiness dashboard
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:projectIdent/status', async (req: Request, res: Response) => {
  const resolved = await anchorFromRequest(req, res);
  if (!resolved) return;
  const { orgId, anchor, ident } = resolved;

  try {
    // Get project sections (tenant-scoped — readiness is tenant data). A missing
    // table returns empty readiness; a program-spine ident loads an honestly-
    // empty set (no linked section store — see PROGRAM_SECTION_STORE_BLOCKER).
    const sections = await loadAnchorSections(
      anchor,
      orgId,
      `section_code, title, status, module, required,
                word_count, updated_at`,
      { orderBy: 'section_code', swallow: true },
    );

    // Module-level readiness, against the program's own required set.
    const required = await resolveRequiredSections(pool, {
      programType: anchor.programType,
      primaryAgency: anchor.primaryAgency,
    });
    const moduleReadiness = required.modules.map((def) => {
      const code = def.code;
      const moduleSections = sections.filter(
        s => s.section_code?.startsWith(code.replace('m', '')) || s.module?.toLowerCase() === code
      );
      const totalRequired = def.requiredSections.length;
      const completedRequired = def.requiredSections.filter(rs =>
        moduleSections.some(
          ms =>
            ms.section_code?.startsWith(rs) && ['approved', 'locked', 'final'].includes(ms.status)
        )
      ).length;

      return {
        moduleCode: code,
        moduleName: def.name,
        totalSections: moduleSections.length,
        requiredSections: totalRequired,
        completedRequired,
        completionPct:
          totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0,
        ready: completedRequired === totalRequired,
      };
    });

    const totalRequired = moduleReadiness.reduce((a, m) => a + m.requiredSections, 0);
    const totalCompleted = moduleReadiness.reduce((a, m) => a + m.completedRequired, 0);
    const overallPct = totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;

    // The leaf-rendering half of readiness comes from the submission spine's
    // REAL state (documents placed into the sequence), not a capability flag.
    const spine = await resolveSubmissionSpine(anchor, orgId);

    res.json({
      projectId: anchor.numericProjectId,
      projectIdent: ident,
      programId: anchor.programId,
      overallReadiness: overallPct,
      // Content completeness — every required section approved/locked/final.
      // This is what `submissionReady` used to report, and it is a real signal;
      // it just is not readiness to submit.
      contentComplete: overallPct === 100,
      // Readiness to TRANSMIT. Complete section text over a package with no leaf
      // files is not a submission, and the surface renders this field as the
      // words "submission-ready" beside a download button. Verification of leaf
      // rendering happens at compile time, so status never claims it.
      submissionReady: overallPct === 100 && submissionBlockers([], anchor, spine).length === 0,
      submissionBlockers: overallPct === 100
        ? submissionBlockers([], anchor, spine)
        : ['Required sections are not all complete.', ...submissionBlockers([], anchor, spine)],
      modules: moduleReadiness,
      requiredSectionSource: required.provenance,
      totalSections: sections.length,
      totalRequired,
      totalCompleted,
      lastUpdated:
        sections.length > 0
          ? sections
              .reduce((latest, s) => {
                const d = new Date(s.updated_at || 0);
                return d > latest ? d : latest;
              }, new Date(0))
              .toISOString()
          : null,
    });
  } catch (error: any) {
    console.error('[eCTD Status] Error:', error);
    res.status(500).json({ error: 'Failed to get compilation status', message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /:projectIdent/history — Compilation history
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:projectIdent/history', async (req: Request, res: Response) => {
  // Compilation history is tenant data. The name-LIKE filter alone matched every
  // organization's compilations for the same project number, so one tenant could
  // read another's submission history. See ledger C-16.
  const resolved = await anchorFromRequest(req, res);
  if (!resolved) return;
  const { orgId, anchor, ident } = resolved;

  try {
    let compilations: any[] = [];
    try {
      // Match the anchor label as a WHOLE token, not a bare substring. A
      // `LIKE '%Project 5%'` matched "Project 50", "Project 500", etc., so
      // GET /:projectId/history returned OTHER same-org projects' compilations
      // as if they were this project's. Require a non-alphanumeric boundary (or
      // string edge) on each side of the label so "Project 5" no longer matches
      // inside "Project 50", while still finding the label anywhere in a longer
      // compilation name. (ectd_compilations has no project/program id column to
      // filter on exactly; that would be the stronger fix via a migration.)
      const escapedLabel = anchor.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const labelTokenPattern = `(^|[^A-Za-z0-9])${escapedLabel}($|[^A-Za-z0-9])`;
      const result = await pool.query(
        `SELECT id, compilation_name, compilation_type, status, version,
                compiled_at, created_at
         FROM ectd_compilations
         WHERE organization_id = $1 AND compilation_name ~ $2
         ORDER BY created_at DESC
         LIMIT 20`,
        [orgId, labelTokenPattern]
      );
      compilations = result.rows;
    } catch (err: any) {
      console.warn(`[eCTD History] query failed for ${anchor.label}: ${err?.message}`);
    }

    res.json({ projectId: anchor.numericProjectId, projectIdent: ident, programId: anchor.programId, compilations });
  } catch (error: any) {
    console.error('[eCTD History] Error:', error);
    res.status(500).json({ error: 'Failed to get compilation history', message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:projectIdent/validate — Pre-compile validation only
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/:projectIdent/validate', async (req: Request, res: Response) => {
  const resolved = await anchorFromRequest(req, res);
  if (!resolved) return;
  const { orgId, anchor, ident } = resolved;

  try {
    const { region = 'FDA' } = req.body;
    const required = await resolveRequiredSections(pool, {
      programType: anchor.programType,
      primaryAgency: anchor.primaryAgency,
    });

    // Spine-backed programs validate against their PLACED LEAVES — the store
    // the canonical compile actually assembles — not the (empty) legacy section
    // store. Placement-only findings here: rendering is only claimed by the
    // compile, which performs it.
    const spine = await resolveSubmissionSpine(anchor, orgId);
    let results: ValidationResult[];
    if (spine?.sequence && spine.sequence.leafCount > 0) {
      const leafRes = await pool.query(
        `SELECT section_code, title, lifecycle_op, document_table, document_id
           FROM submission_leaves
          WHERE sequence_id = $1 AND organization_id = $2 AND deleted_at IS NULL
          ORDER BY section_code`,
        [spine.sequence.id, orgId],
      );
      results = [
        {
          rule: 'SUBMISSION_SPINE_LINKED',
          severity: 'info',
          message:
            `Validating the ${spine.sequence.leafCount} document(s) placed in the linked submission's ` +
            `eCTD sequence ${spine.sequence.sequenceNumber}; compile assembles and renders them into real leaf files.`,
        },
        ...leafPlacementFindings(leafRes.rows as SpineLeafRow[], {
          initialSequence: spine.sequence.sequenceNumber === '0000',
          required,
        }),
      ];
    } else {
      const sections = await loadAnchorSections(
        anchor,
        orgId,
        `section_code, title, status, content, word_count, module, required`,
        { swallow: true },
      );
      results = withAnchorFindings(runPreCompileValidation(sections, region, required), anchor);
    }
    const passCount = results.filter(r => r.severity === 'info').length;
    const warnCount = results.filter(r => r.severity === 'warning').length;
    const errorCount = results.filter(r => r.severity === 'error').length;

    res.json({
      projectId: anchor.numericProjectId,
      projectIdent: ident,
      programId: anchor.programId,
      valid: errorCount === 0,
      requiredSectionSource: required.provenance,
      results,
      summary: { pass: passCount, warnings: warnCount, errors: errorCount },
    });
  } catch (error: any) {
    console.error('[eCTD Validate] Error:', error);
    res.status(500).json({ error: 'Validation failed', message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function runPreCompileValidation(
  sections: any[],
  region: string,
  required: RequiredSectionSet,
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // 1. Check for required sections
  const allRequired = required.modules.flatMap((m) => m.requiredSections);
  for (const reqCode of allRequired) {
    const found = sections.find(s => s.section_code?.startsWith(reqCode));
    if (!found) {
      results.push({
        rule: 'REQUIRED_SECTION_MISSING',
        severity: 'error',
        message: `Required section ${reqCode} is missing`,
        sectionCode: reqCode,
        fix: `Create and draft section ${reqCode}`,
      });
    } else if (!['approved', 'locked', 'final'].includes(found.status)) {
      results.push({
        rule: 'REQUIRED_SECTION_INCOMPLETE',
        severity: 'warning',
        message: `Required section ${reqCode} (${found.title}) is not yet approved — status: ${found.status}`,
        sectionCode: reqCode,
        fix: `Complete review and approve section ${reqCode}`,
      });
    } else {
      results.push({
        rule: 'REQUIRED_SECTION_OK',
        severity: 'info',
        message: `Section ${reqCode} (${found.title}) is ${found.status}`,
        sectionCode: reqCode,
      });
    }
  }

  // 2. Check for empty content in locked sections
  for (const s of sections) {
    if (
      ['approved', 'locked', 'final'].includes(s.status) &&
      (!s.content || s.content.trim().length < 50)
    ) {
      results.push({
        rule: 'EMPTY_LOCKED_SECTION',
        severity: 'error',
        message: `Section ${s.section_code} (${s.title}) is ${s.status} but has insufficient content`,
        sectionCode: s.section_code,
        fix: 'Add content before compiling',
      });
    }
  }

  // 3. FDA-specific checks
  if (region === 'FDA') {
    const hasForms = sections.some(s => s.section_code?.startsWith('1.1'));
    if (!hasForms) {
      results.push({
        rule: 'FDA_FORMS_MISSING',
        severity: 'error',
        message: 'FDA forms (1571/1572 for an IND, 356h for a marketing application, 3674) are required under Module 1.1',
        sectionCode: '1.1',
        fix: 'Upload completed FDA forms to Module 1.1',
      });
    }
    const hasCoverLetter = sections.some(s => s.section_code?.startsWith('1.2'));
    if (!hasCoverLetter) {
      results.push({
        rule: 'FDA_COVER_LETTER_MISSING',
        severity: 'warning',
        message: 'FDA Cover Letter (Section 1.2) is strongly recommended',
        sectionCode: '1.2',
        fix: 'Draft cover letter using AI or manually',
      });
    }
  }

  // 4. Word count check for key sections
  const minWordCounts: Record<string, number> = {
    '2.5': 2000, // Clinical Overview
    '2.3': 1500, // Quality Overall Summary
    '2.7.1': 1000, // Summary of current studies
  };
  for (const [code, minWords] of Object.entries(minWordCounts)) {
    const section = sections.find(s => s.section_code?.startsWith(code));
    if (section && section.word_count && section.word_count < minWords) {
      results.push({
        rule: 'INSUFFICIENT_CONTENT',
        severity: 'warning',
        message: `Section ${code} (${section.title}) has ${section.word_count} words — minimum ${minWords} recommended`,
        sectionCode: code,
        fix: `Expand section content to at least ${minWords} words`,
      });
    }
  }

  return results;
}

/**
 * The eCTD backbone over the section content this platform actually holds.
 *
 * WHAT CHANGED AND WHY
 * Each document previously declared:
 *
 *   <ectd:file-path>m3/3/2/p/drug-product.pdf</ectd:file-path>
 *   <ectd:checksum algorithm="md5">pending</ectd:checksum>
 *
 * Neither was true. Nothing in this route — or anywhere it calls — renders a
 * PDF, so the declared leaf file does not exist; and `pending` is not a
 * checksum, it is the absence of one wearing the element that regulators read as
 * the leaf's integrity anchor. A reviewer parsing that backbone would look for a
 * file that was never written and verify it against a hash that was never
 * computed.
 *
 * The fix is not to compute an MD5 of the section text and put it under the .pdf
 * path — that would be worse: a plausible checksum that cannot match the file it
 * claims to describe. The backbone now states what is true:
 *
 *   • a REAL sha256 over the exact section content the platform stores, named
 *     `content-sha256` so it cannot be mistaken for a leaf-file checksum;
 *   • `<ectd:leaf rendered="false"/>` — no path, no checksum, because no leaf
 *     file exists yet;
 *   • an envelope `package-state` of `draft-backbone`, so a consumer knows this
 *     is not a transmissible sequence before it reads a single module.
 *
 * Real leaf rendering exists — on the SPINE-BACKED compile path, which
 * assembles placed submission_leaves into a genuine package whose index.xml
 * (returned as xmlBackbone there) carries real paths and checksums. THIS
 * builder serves only the legacy section store, which renders nothing, and the
 * document keeps saying exactly that.
 */
function generateECTD4Backbone(opts: {
  /** Recorded application identity: `IND-<numeric id>` (legacy) or the program's
   *  real recorded code — never an invented number. */
  applicationRef: string;
  submissionType: string;
  region: string;
  modules: ModuleCompilationStatus[];
  sections: any[];
}): string {
  const { applicationRef, submissionType, region, modules, sections } = opts;
  const timestamp = new Date().toISOString();
  const sequenceNumber = '0000';

  // Content hashes are of the section text as stored, keyed by section code.
  const contentHashByCode = new Map<string, string>();
  for (const s of sections) {
    if (s.section_code && typeof s.content === 'string' && s.content.length > 0) {
      contentHashByCode.set(s.section_code, sha256(s.content));
    }
  }

  const moduleXml = modules
    .map(m => {
      const docsXml = m.documents
        .filter(d => d.hasContent)
        .map(d => {
          const contentHash = contentHashByCode.get(d.sectionCode);
          return `
        <ectd:document>
          <ectd:id>${d.sectionCode.replace(/\./g, '-')}</ectd:id>
          <ectd:title>${escapeXml(d.title)}</ectd:title>
          <ectd:section-code>${d.sectionCode}</ectd:section-code>
          <ectd:status>${d.status}</ectd:status>
          <!-- Hash of the authored section content held by the platform. NOT a
               leaf-file checksum: no leaf file has been rendered. -->
          ${contentHash ? `<ectd:content-sha256>${contentHash}</ectd:content-sha256>` : '<!-- no stored content to hash -->'}
          <ectd:leaf rendered="false">
            <!-- No file-path and no checksum are emitted for an unrendered leaf.
                 Declaring either would name a file that does not exist. -->
          </ectd:leaf>
        </ectd:document>`;
        })
        .join('');

      return `
    <ectd:module code="${m.moduleCode}" name="${escapeXml(m.moduleName)}">
      <ectd:status>${m.status}</ectd:status>
      <ectd:sections total="${m.totalSections}" completed="${m.completedSections}" />
      <ectd:documents>${docsXml}
      </ectd:documents>
    </ectd:module>`;
    })
    .join('');

  const withContent = sections.filter(
    (s: any) => s.content && s.content.trim().length > 0,
  ).length;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  eCTD 4.0 DRAFT BACKBONE — NOT A TRANSMISSIBLE SEQUENCE
  Generated by Concept2Cure Platform
  ${timestamp}

  This document describes the authored section content held by the platform. No
  leaf files have been rendered, so every <ectd:leaf> carries rendered="false"
  and no file-path or checksum. Do not submit this to an agency gateway.
-->
<ectd:ectd xmlns:ectd="http://www.ich.org/ectd"
           xmlns:xlink="http://www.w3.org/1999/xlink"
           version="4.0">
  <ectd:envelope>
    <ectd:application-number>${escapeXml(applicationRef)}</ectd:application-number>
    <ectd:sequence-number>${sequenceNumber}</ectd:sequence-number>
    <ectd:submission-type>${submissionType}</ectd:submission-type>
    <ectd:region>${region}</ectd:region>
    <ectd:generated-at>${timestamp}</ectd:generated-at>
    <ectd:generator>Concept2Cure v1.0</ectd:generator>
    <!-- draft-backbone: this compile ran over the legacy section store. A real
         sequence is produced by the spine-backed compile (placed leaves). -->
    <ectd:package-state>draft-backbone</ectd:package-state>
  </ectd:envelope>
  <ectd:modules>${moduleXml}
  </ectd:modules>
  <ectd:file-manifest>
    <!-- Sections carrying authored content. This is NOT a count of files on
         disk: no leaf file has been written. -->
    <ectd:sections-with-content>${withContent}</ectd:sections-with-content>
    <ectd:rendered-leaf-files>0</ectd:rendered-leaf-files>
  </ectd:file-manifest>
</ectd:ectd>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// `slugify` lived here only to build the `.pdf` leaf path the backbone no longer
// declares. Removed with it: a helper whose sole caller was the fabrication is
// not something to leave behind for the next person to wire back up.

export default router;
