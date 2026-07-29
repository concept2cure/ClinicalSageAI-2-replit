/**
 * eCTD Compile API Routes
 *
 * Provides endpoints for compiling eCTD 4.0 submission packages from
 * the INDWorkspace. Integrates with ectdService for backbone generation,
 * validation, and compilation tracking.
 *
 * Endpoints:
 *   POST /api/ectd-compile/:projectId/compile      — Full eCTD compilation
 *   GET  /api/ectd-compile/:projectId/status        — Compilation readiness
 *   GET  /api/ectd-compile/:projectId/history       — Compilation history
 *   POST /api/ectd-compile/:projectId/validate      — Pre-compile validation
 *
 * @module server/routes/ectd-compile
 * @compliance ICH M8, eCTD 4.0, FDA ESG
 */

import { createHash } from 'node:crypto';

import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

/** SHA-256 of a UTF-8 string, hex. Used for real content hashes in the backbone. */
function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Whether this platform can produce the leaf files an eCTD sequence is made of.
 *
 * It cannot. `generateECTD4Backbone` emits XML over `project_sections.content`;
 * no step here or downstream renders a PDF, writes a leaf, or assembles a
 * directory tree. Stated as a named constant rather than left implicit because
 * three separate places have to agree about it, and because the day rendering
 * lands, this is the one line that changes.
 */
const LEAF_RENDERING_IMPLEMENTED = false;

const LEAF_RENDERING_BLOCKER =
  'No leaf files have been rendered. This platform compiles the eCTD backbone over authored section content; it does not yet produce the PDF leaf files a sequence consists of, so the package cannot be transmitted to an agency gateway.';

/**
 * What stands between this project and a transmissible submission.
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
function submissionBlockers(contentErrors: string[]): string[] {
  const blockers: string[] = [];
  if (contentErrors.length > 0) {
    blockers.push(
      `${contentErrors.length} blocking content ${contentErrors.length === 1 ? 'issue' : 'issues'} must be resolved.`,
    );
  }
  if (!LEAF_RENDERING_IMPLEMENTED) blockers.push(LEAF_RENDERING_BLOCKER);
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
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface CompilationResult {
  id: string;
  projectId: number;
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
  /** Leaf files actually written. Omitted once rendering exists and reports itself. */
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
// ICH eCTD 4.0 MODULE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const ECTD_MODULE_DEFS: Record<string, { name: string; requiredSections: string[] }> = {
  m1: {
    name: 'Administrative Information',
    requiredSections: ['1.1', '1.2', '1.3.1', '1.3.3', '1.3.4', '1.14.4.2', '1.20'],
  },
  m2: {
    name: 'CTD Summaries',
    requiredSections: ['2.2', '2.3', '2.4', '2.5', '2.6.2', '2.6.4', '2.6.6', '2.7.1'],
  },
  m3: {
    name: 'Quality (CMC)',
    requiredSections: ['3.2.S', '3.2.P', '3.2.R'],
  },
  m4: {
    name: 'Nonclinical Study Reports',
    requiredSections: ['4.2.1', '4.2.2', '4.2.3'],
  },
  m5: {
    name: 'Clinical Study Reports',
    requiredSections: ['5.2', '5.3.5.1'],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:projectId/compile — Full eCTD compilation
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/:projectId/compile', async (req: Request, res: Response) => {
  const projectId = parseInt(String(req.params.projectId), 10);
  if (!projectId) return res.status(400).json({ error: 'Valid project ID required' });

  try {
    const { modules: targetModules, submissionType = 'initial', region = 'FDA' } = req.body;
    const moduleFilter = Array.isArray(targetModules)
      ? new Set(targetModules.map((m: string) => String(m).toLowerCase()))
      : null;

    // Derive org from auth context
    const orgId = resolveOrgId(req);
    if (!orgId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    // 1. Gather all project sections from DB.
    //
    // TENANCY: filtered by organization_id as well as project_id. The org
    // filter was described in this comment but absent from the SQL, so any
    // authenticated organization could compile a submission from another
    // organization's sections just by guessing a numeric project id.
    // `project_sections.organization_id` is NOT NULL (see
    // db/migrations/20260220_ind_section_tracking.sql), so this cannot
    // legitimately exclude rows that belong to the caller.
    const sectionsResult = await pool.query(
      `SELECT section_code, title, status, content, word_count, assigned_to, module,
              required, updated_at
       FROM project_sections
       WHERE project_id = $1 AND organization_id = $2
       ORDER BY section_code`,
      [projectId, Number(orgId)]
    );
    const sections = sectionsResult.rows;

    // 2. Run pre-compile validation
    const validationResults = runPreCompileValidation(sections, region);
    const hasBlockingErrors = validationResults.some(v => v.severity === 'error');

    // 3. Build module compilation status
    const moduleStatuses: ModuleCompilationStatus[] = Object.entries(ECTD_MODULE_DEFS)
      .filter(([code]) => !moduleFilter || moduleFilter.has(code))
      .map(([code, def]) => {
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

    // 4. Generate eCTD 4.0 XML backbone
    const xmlBackbone = generateECTD4Backbone({
      projectId,
      submissionType,
      region,
      modules: moduleStatuses,
      sections,
    });

    // 5. Record compilation
    const compilationId = `comp_${Date.now()}_${projectId}`;
    // This insert previously bound SIX values to FIVE placeholders with a
    // duplicated orgId in second position, so every remaining value landed one
    // column to the left: the org id was written as compilation_name, the name
    // as compilation_type, the submission type as status, the status as
    // xml_backbone — and the actual XML backbone was dropped. It could never
    // execute anyway: module_id and compiled_by were NOT NULL and unsupplied.
    // The catch below blamed a missing table, so the failure was invisible and
    // GET /:projectId/history was permanently empty. See ledger C-16.
    const compilationName = `IND Compilation — Project ${projectId}`;
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
        `[eCTD Compile] could not record compilation for project ${projectId}: ${err?.message}`
      );
    }

    const errors = validationResults.filter(v => v.severity === 'error').map(v => v.message);
    const blockers = submissionBlockers(errors);

    const result: CompilationResult = {
      id: compilationId,
      projectId,
      // The BACKBONE compiled — that part did succeed, and the caller can
      // download it. Whether the package can be submitted is a separate
      // question, answered by submissionReady/submissionBlockers below.
      status: hasBlockingErrors ? 'failed' : 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      modules: moduleStatuses,
      xmlBackbone,
      validationResults,
      contentValidationPassed: !hasBlockingErrors,
      submissionReady: blockers.length === 0,
      submissionBlockers: blockers,
      leafFilesRendered: LEAF_RENDERING_IMPLEMENTED ? undefined : 0,
      errors,
      warnings: validationResults.filter(v => v.severity === 'warning').map(v => v.message),
    };

    console.log(
      `[eCTD Compile] Project ${projectId}: ${result.status} | ` +
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
// GET /:projectId/status — Compilation readiness dashboard
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:projectId/status', async (req: Request, res: Response) => {
  const projectId = parseInt(String(req.params.projectId), 10);
  if (!projectId) return res.status(400).json({ error: 'Valid project ID required' });

  const orgId = resolveOrgId(req);
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }

  try {
    // Get project sections (tenant-scoped — readiness is tenant data)
    let sections: any[] = [];
    try {
      const result = await pool.query(
        `SELECT section_code, title, status, module, required,
                word_count, updated_at
         FROM project_sections WHERE project_id = $1 AND organization_id = $2
         ORDER BY section_code`,
        [projectId, orgId]
      );
      sections = result.rows;
    } catch {
      // Table may not exist — return empty readiness
    }

    // Module-level readiness
    const moduleReadiness = Object.entries(ECTD_MODULE_DEFS).map(([code, def]) => {
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

    res.json({
      projectId,
      overallReadiness: overallPct,
      // Content completeness — every required section approved/locked/final.
      // This is what `submissionReady` used to report, and it is a real signal;
      // it just is not readiness to submit.
      contentComplete: overallPct === 100,
      // Readiness to TRANSMIT. Complete section text over a package with no leaf
      // files is not a submission, and the surface renders this field as the
      // words "submission-ready" beside a download button.
      submissionReady: overallPct === 100 && submissionBlockers([]).length === 0,
      submissionBlockers: overallPct === 100
        ? submissionBlockers([])
        : ['Required sections are not all complete.', ...submissionBlockers([])],
      modules: moduleReadiness,
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
// GET /:projectId/history — Compilation history
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/:projectId/history', async (req: Request, res: Response) => {
  const projectId = parseInt(String(req.params.projectId), 10);
  if (!projectId) return res.status(400).json({ error: 'Valid project ID required' });

  // Compilation history is tenant data. The name-LIKE filter alone matched every
  // organization's compilations for the same project number, so one tenant could
  // read another's submission history. See ledger C-16.
  const orgId = resolveOrgId(req);
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }

  try {
    let compilations: any[] = [];
    try {
      const result = await pool.query(
        `SELECT id, compilation_name, compilation_type, status, version,
                compiled_at, created_at
         FROM ectd_compilations
         WHERE organization_id = $1 AND compilation_name LIKE $2
         ORDER BY created_at DESC
         LIMIT 20`,
        [orgId, `%Project ${projectId}%`]
      );
      compilations = result.rows;
    } catch (err: any) {
      console.warn(`[eCTD History] query failed for project ${projectId}: ${err?.message}`);
    }

    res.json({ projectId, compilations });
  } catch (error: any) {
    console.error('[eCTD History] Error:', error);
    res.status(500).json({ error: 'Failed to get compilation history', message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /:projectId/validate — Pre-compile validation only
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/:projectId/validate', async (req: Request, res: Response) => {
  const projectId = parseInt(String(req.params.projectId), 10);
  if (!projectId) return res.status(400).json({ error: 'Valid project ID required' });

  const orgId = resolveOrgId(req);
  if (!orgId) {
    return res.status(401).json({ error: 'Organization context required' });
  }

  try {
    const { region = 'FDA' } = req.body;

    let sections: any[] = [];
    try {
      const result = await pool.query(
        `SELECT section_code, title, status, content, word_count, module, required
         FROM project_sections WHERE project_id = $1 AND organization_id = $2`,
        [projectId, orgId]
      );
      sections = result.rows;
    } catch {
      // Table may not exist
    }

    const results = runPreCompileValidation(sections, region);
    const passCount = results.filter(r => r.severity === 'info').length;
    const warnCount = results.filter(r => r.severity === 'warning').length;
    const errorCount = results.filter(r => r.severity === 'error').length;

    res.json({
      projectId,
      valid: errorCount === 0,
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

function runPreCompileValidation(sections: any[], region: string): ValidationResult[] {
  const results: ValidationResult[] = [];

  // 1. Check for required sections
  const allRequired = Object.values(ECTD_MODULE_DEFS).flatMap(m => m.requiredSections);
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
        message: 'FDA Forms (1571, 1572, 3674) are required for IND submission',
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
 * When leaf rendering is implemented, the leaf element gains its path and a
 * checksum computed over the rendered bytes, and `package-state` becomes
 * `sequence`. Until then the document says so.
 */
function generateECTD4Backbone(opts: {
  projectId: number;
  submissionType: string;
  region: string;
  modules: ModuleCompilationStatus[];
  sections: any[];
}): string {
  const { projectId, submissionType, region, modules, sections } = opts;
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
    <ectd:application-number>IND-${projectId}</ectd:application-number>
    <ectd:sequence-number>${sequenceNumber}</ectd:sequence-number>
    <ectd:submission-type>${submissionType}</ectd:submission-type>
    <ectd:region>${region}</ectd:region>
    <ectd:generated-at>${timestamp}</ectd:generated-at>
    <ectd:generator>Concept2Cure v1.0</ectd:generator>
    <!-- draft-backbone until leaf rendering exists; then: sequence -->
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
