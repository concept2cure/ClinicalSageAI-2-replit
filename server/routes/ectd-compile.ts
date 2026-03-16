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

import { Router, Request, Response } from 'express';
import { pool } from '../db';

const router = Router();

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
  submissionReady: boolean;
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
  const projectId = parseInt(req.params.projectId, 10);
  if (!projectId) return res.status(400).json({ error: 'Valid project ID required' });

  try {
    const { modules: targetModules, submissionType = 'initial', region = 'FDA' } = req.body;
    const moduleFilter = Array.isArray(targetModules)
      ? new Set(targetModules.map((m: string) => String(m).toLowerCase()))
      : null;

    // 1. Gather all project sections from DB
    const sectionsResult = await pool.query(
      `SELECT section_code, title, status, content, word_count, assigned_to, module,
              required, updated_at
       FROM project_sections
       WHERE project_id = $1
       ORDER BY section_code`,
      [projectId]
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
    try {
      await pool.query(
        `INSERT INTO ectd_compilations (organization_id, compilation_name, compilation_type,
         status, xml_backbone, compiled_at, version)
         VALUES ($1, $2, $3, $4, $5, NOW(), '1.0')`,
        [
          1, // Default org
          `IND Compilation — Project ${projectId}`,
          submissionType,
          hasBlockingErrors ? 'failed' : 'completed',
          xmlBackbone,
        ]
      );
    } catch {
      // Table may not exist yet — non-blocking
      console.warn('[eCTD Compile] ectd_compilations table not available, skipping record');
    }

    const result: CompilationResult = {
      id: compilationId,
      projectId,
      status: hasBlockingErrors ? 'failed' : 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      modules: moduleStatuses,
      xmlBackbone,
      validationResults,
      submissionReady: !hasBlockingErrors,
      errors: validationResults.filter(v => v.severity === 'error').map(v => v.message),
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
  const projectId = parseInt(req.params.projectId, 10);
  if (!projectId) return res.status(400).json({ error: 'Valid project ID required' });

  try {
    // Get project sections
    let sections: any[] = [];
    try {
      const result = await pool.query(
        `SELECT section_code, title, status, module, required,
                word_count, updated_at
         FROM project_sections WHERE project_id = $1
         ORDER BY section_code`,
        [projectId]
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
      submissionReady: overallPct === 100,
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
  const projectId = parseInt(req.params.projectId, 10);
  if (!projectId) return res.status(400).json({ error: 'Valid project ID required' });

  try {
    let compilations: any[] = [];
    try {
      const result = await pool.query(
        `SELECT id, compilation_name, compilation_type, status, version,
                compiled_at, created_at
         FROM ectd_compilations
         WHERE compilation_name LIKE $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [`%Project ${projectId}%`]
      );
      compilations = result.rows;
    } catch {
      // Table may not exist
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
  const projectId = parseInt(req.params.projectId, 10);
  if (!projectId) return res.status(400).json({ error: 'Valid project ID required' });

  try {
    const { region = 'FDA' } = req.body;

    let sections: any[] = [];
    try {
      const result = await pool.query(
        `SELECT section_code, title, status, content, word_count, module, required
         FROM project_sections WHERE project_id = $1`,
        [projectId]
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

  const moduleXml = modules
    .map(m => {
      const docsXml = m.documents
        .filter(d => d.hasContent)
        .map(
          d => `
        <ectd:document>
          <ectd:id>${d.sectionCode.replace(/\./g, '-')}</ectd:id>
          <ectd:title>${escapeXml(d.title)}</ectd:title>
          <ectd:section-code>${d.sectionCode}</ectd:section-code>
          <ectd:status>${d.status}</ectd:status>
          <ectd:file-path>${m.moduleCode}/${d.sectionCode.replace(/\./g, '/')}/${slugify(d.title)}.pdf</ectd:file-path>
          <ectd:checksum algorithm="md5">pending</ectd:checksum>
        </ectd:document>`
        )
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  eCTD 4.0 Submission Backbone
  Generated by Concept2Cure Platform
  ${timestamp}
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
  </ectd:envelope>
  <ectd:modules>${moduleXml}
  </ectd:modules>
  <ectd:file-manifest>
    <ectd:total-files>${sections.filter((s: any) => s.content && s.content.trim().length > 0).length}</ectd:total-files>
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

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default router;
