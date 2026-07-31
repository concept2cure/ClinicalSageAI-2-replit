/**
 * eCTD Export Service — ICH eCTD v3.2.2 Submission Package Generator
 *
 * Generates a structurally valid eCTD submission package as a ZIP archive
 * containing:
 *   - index.xml (root backbone with DTD reference)
 *   - m1/ Module 1: Administrative & Regional Information
 *   - m2/ Module 2: CTD Summaries
 *   - m3/ Module 3: Quality (CMC)
 *   - m4/ Module 4: Nonclinical Study Reports
 *   - m5/ Module 5: Clinical Study Reports
 *   - util/dtd/ vendored ICH/regional DTDs (when present) for self-containment
 *
 * Uses database-backed eCTD modules/granules from the shared schema.
 *
 * @module server/services/ectdExportService
 * @compliance ICH eCTD v3.2.2, ICH M4 CTD
 */

import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { db, pool } from '../db';
import {
  ectdModules,
  ectdGranules,
  ectdCompilations,
} from '../../shared/schema';
import { eq, and, asc } from 'drizzle-orm';
import crypto from 'crypto';
import { renderLeafPdf } from './ectd/leaf-pdf-renderer';
import {
  computeEctdCompleteness,
  assertEctdSubmissionComplete,
  EctdCompletenessError,
  type CompletenessReport,
  type IncompleteLeaf,
} from './ectd/completeness';
// Canonical eCTD builders (single source of truth, shared with the regional
// packager) — reused here so /api/ectd/export produces byte-consistent leaf IDs
// and the same index-md5.txt manifest format as the conformant packager path.
import {
  createLeafIdAssigner,
  buildMd5Index,
} from './submission-gateways/regional-packager';
import {
  buildIchModuleTree,
  type RenderedLeaf,
} from './submission-gateways/ectd-packager/ich-headings';
import { buildLeafManifest } from './ectd/sequence-manifest';

// Re-exported so existing importers of the export service keep working.
export { EctdCompletenessError };
export type { CompletenessReport };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GranuleRecord {
  id: number;
  granuleId: string;
  granuleName: string;
  fileName: string | null;
  fileExtension: string | null;
  status: string;
  version: string;
  documentPath: string | null;
  wordCount: number | null;
  moduleId: number;
  ichSection: string | null;
  metadata: any;
}

interface ModuleRecord {
  id: number;
  moduleNumber: string;
  moduleName: string;
  level: number;
  status: string;
  projectId: number | null;
}

interface EctdPackageResult {
  buffer: Buffer;
  filename: string;
  stats: {
    totalModules: number;
    totalGranules: number;
    totalFiles: number;
    generatedAt: string;
    completeness: CompletenessReport;
  };
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// ICH M8 v4.0 Module Definitions
// ---------------------------------------------------------------------------

const MODULE_DEFS: Record<string, {
  name: string;
  folder: string;
  requiredFiles: string[];
  subfolders: string[];
}> = {
  '1': {
    name: 'Administrative Information and Prescribing Information',
    folder: 'm1',
    requiredFiles: ['us-regional.xml'],
    subfolders: ['us', 'eu', 'jp'],
  },
  '2': {
    name: 'Common Technical Document Summaries',
    folder: 'm2',
    requiredFiles: [],
    subfolders: ['22-intro', '23-qos', '24-nonclin-overview', '25-clin-overview', '26-nonclin-summary', '27-clin-summary'],
  },
  '3': {
    name: 'Quality',
    folder: 'm3',
    requiredFiles: [],
    subfolders: ['32-body-data', '32-p', '32-s', '32-a', '32-r'],
  },
  '4': {
    name: 'Nonclinical Study Reports',
    folder: 'm4',
    requiredFiles: [],
    subfolders: ['42-study-reports', '42-pharm', '42-pk', '42-tox'],
  },
  '5': {
    name: 'Clinical Study Reports',
    folder: 'm5',
    requiredFiles: [],
    subfolders: ['52-tabular', '53-study-reports', '53-csr', '54-literature'],
  },
};

// Map granule IDs to their proper eCTD folder paths
function granuleToPath(granuleId: string, _moduleName: string): string {
  const parts = granuleId.split('.');
  const moduleNum = parts[0];
  const folder = MODULE_DEFS[moduleNum]?.folder || `m${moduleNum}`;

  // Build a nested path from the section code, e.g. 3.2.P.1 -> m3/32-p/32-p-1
  if (parts.length <= 1) return folder;

  const subParts = parts.slice(1);
  const subPath = subParts
    .map(p => p.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .join('-');

  return `${folder}/${moduleNum}${subPath}`;
}

// ---------------------------------------------------------------------------
// XML Generation
// ---------------------------------------------------------------------------

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function md5(content: string | Buffer): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

function generateIndexXml(opts: {
  applicationNumber: string;
  sequenceNumber: string;
  submissionType: string;
  region: string;
  modules: Array<{
    moduleNumber: string;
    moduleName: string;
    granules: Array<{
      granuleId: string;
      granuleName: string;
      filePath: string;
      checksum: string;
      operation: string;
      modifiedFile?: string;
    }>;
  }>;
  generatedAt: string;
}): string {
  // One leaf-ID assigner per index.xml document. eCTD leaf IDs are XML ID-typed
  // and must be unique within the backbone; the CTD section alone is NOT unique
  // (a section commonly holds several leaves), so the previous
  // `granuleId.replace('.','-')` scheme collided. Reuse the canonical assigner —
  // the same one the regional packager uses — so both export paths emit
  // identical, collision-free IDs (section + filename slug, numeric suffix on
  // any remaining tie).
  const assignLeafId = createLeafIdAssigner();

  // ICH backbone heading tree. index.xml covers Modules 2–5 ONLY (Module 1 is
  // regional and is referenced from the regional backbone, not here), and its
  // content is the authoritative ICH v3.2.2 nested heading hierarchy — flat
  // <m2>..<m5> blocks are not valid ectd:ectd children. Each leaf is rendered
  // with the full ICH attribute set (operation, inline checksum matching the
  // shipped bytes, root-relative xlink:href, unique ID) and nested under the
  // deepest matching heading via the shared ich-headings module — the same tree
  // the regional packager emits, so both export paths produce one convention.
  const rendered: RenderedLeaf[] = opts.modules
    .filter(m => m.moduleNumber !== '1')
    .flatMap(m => m.granules)
    .map(g => {
      const id = assignLeafId({
        ctdSection: g.granuleId,
        fileName: path.posix.basename(g.filePath),
      });
      // For a lifecycle op (replace/append/delete) emit modified-file pointing at
      // the superseded leaf. A delete carries no new bytes — its filePath already
      // IS that prior pointer (set by applyLifecycleDelta), so xlink:href resolves
      // to the withdrawn file.
      const modAttr = g.modifiedFile ? ` modified-file="${escapeXml(g.modifiedFile)}"` : '';
      return {
        leaf: { ctdSection: g.granuleId },
        xml: `<leaf operation="${escapeXml(g.operation)}"${modAttr} checksum="${g.checksum}" checksum-type="md5" xlink:href="${escapeXml(g.filePath)}" xlink:type="simple" ID="${escapeXml(id)}">
  <title>${escapeXml(g.granuleName)}</title>
</leaf>`,
      };
    });
  const moduleBlocks = buildIchModuleTree(rendered, 2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">
<!--
  eCTD Submission Backbone (ICH eCTD v3.2.2)
  Application: ${escapeXml(opts.applicationNumber)}
  Sequence: ${opts.sequenceNumber}
  Submission type: ${escapeXml(opts.submissionType)}
  Region: ${escapeXml(opts.region)}
  Generated: ${opts.generatedAt}
  Generator: Concept2Cure.RI eCTD Export Service
-->
<ectd:ectd xmlns:ectd="http://www.ich.org/ectd"
           xmlns:xlink="http://www.w3.org/1999/xlink"
           dtd-version="3.2"
           xml:lang="en">
${moduleBlocks}
</ectd:ectd>`;
}

// Regions this generator can produce a correct regional backbone for.
// Adding a region requires a verified regional XML structure + DTD — do NOT
// silently fall back to another region's backbone (that previously shipped a
// PMDA/jp file for Health Canada and any other non-FDA/EMA input).
// See HI_8_ECTD_SCOPING_BRIEF.md (regions in scope: FDA, EMA, PMDA, HC).
const ECTD_REGIONS: Record<string, { code: string; agency: string }> = {
  FDA: { code: 'us', agency: 'U.S. Food and Drug Administration' },
  EMA: { code: 'eu', agency: 'European Medicines Agency' },
  PMDA: { code: 'jp', agency: 'Pharmaceuticals and Medical Devices Agency' },
};

function resolveEctdRegion(region: string): { code: string; agency: string } {
  const resolved = ECTD_REGIONS[region];
  if (!resolved) {
    // Fail closed rather than mislabel a regulatory submission. Health Canada
    // (ca-regional) is a documented pending region — see the scoping brief.
    throw new Error(
      `eCTD export does not support region "${region}" yet. Supported: ${Object.keys(ECTD_REGIONS).join(', ')}.`
    );
  }
  return resolved;
}

function generateRegionalXml(
  region: string,
  applicationNumber: string,
  m1Granules: Array<{
    granuleId: string;
    granuleName: string;
    filePath: string;
    checksum: string;
    operation: string;
  }> = [],
): string {
  const { code: regionCode, agency: agencyName } = resolveEctdRegion(region);

  // Module 1 leaves belong in the REGIONAL backbone, not index.xml (the ICH
  // backbone covers Modules 2–5 only). Render them under an m1-{code} wrapper —
  // the same shape the canonical regional packager uses for its EU/JP/CA
  // backbones — with hrefs RELATIVE to this file (which lives at
  // m1/{code}-regional.xml) and document-unique leaf IDs.
  const assignLeafId = createLeafIdAssigner();
  const m1Block = m1Granules.length
    ? '\n  <m1-' + regionCode + '>\n' + m1Granules
        .map(g => {
          const id = assignLeafId({
            ctdSection: g.granuleId,
            fileName: path.posix.basename(g.filePath),
          });
          const href = g.filePath.startsWith('m1/') ? g.filePath.slice(3) : `../${g.filePath}`;
          return `    <leaf operation="${escapeXml(g.operation)}" checksum="${g.checksum}" checksum-type="md5" xlink:href="${escapeXml(href)}" xlink:type="simple" ID="${escapeXml(id)}">
      <title>${escapeXml(g.granuleName)}</title>
    </leaf>`;
        })
        .join('\n') + '\n  </m1-' + regionCode + '>'
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<${regionCode}-regional xmlns:xlink="http://www.w3.org/1999/xlink">
  <admin>
    <applicant>
      <name>Sponsor Organization</name>
      <agency>${escapeXml(agencyName)}</agency>
    </applicant>
    <application-number>${escapeXml(applicationNumber)}</application-number>
    <submission-type>initial</submission-type>
  </admin>${m1Block}
</${regionCode}-regional>`;
}

/**
 * Bundle vendored eCTD DTD files (when present) into util/dtd/ so the package is
 * self-contained and DTD-validatable. DTDs are vendored agency artifacts per
 * assets/ectd-dtd/README.md ("Vendoring policy") — place them in assets/ectd-dtd/
 * (or set ECTD_DTD_DIR) and they are bundled automatically; absence is surfaced
 * as a "not submission-ready" warning by validateEctdPackage.
 * See assets/ectd-dtd/README.md and HI_8_ECTD_SCOPING_BRIEF.md G1.
 */
function bundleVendoredDtds(zip: JSZip): Array<{ relPath: string; md5: string }> {
  const recorded: Array<{ relPath: string; md5: string }> = [];
  try {
    const dir = process.env.ECTD_DTD_DIR || path.resolve(process.cwd(), 'assets/ectd-dtd');
    if (!fs.existsSync(dir)) return recorded;
    const dtdFiles = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.dtd'));
    for (const file of dtdFiles) {
      const bytes = fs.readFileSync(path.join(dir, file));
      const relPath = `util/dtd/${file}`;
      zip.file(relPath, bytes);
      // DTDs are package files, so they are checksummed into index-md5.txt
      // alongside the backbone + leaves.
      recorded.push({ relPath, md5: md5(bytes) });
    }
  } catch {
    // non-fatal — absence is reported by validateEctdPackage
  }
  return recorded;
}

function generateModulePlaceholderXml(moduleNumber: string, moduleName: string, granules: GranuleRecord[]): string {
  const granuleElements = granules
    .map(g => `  <section id="${escapeXml(g.granuleId)}" title="${escapeXml(g.granuleName)}">
    <status>${escapeXml(g.status)}</status>
    <version>${escapeXml(g.version)}</version>${g.fileName ? `\n    <file>${escapeXml(g.fileName)}</file>` : ''}${g.wordCount ? `\n    <word-count>${g.wordCount}</word-count>` : ''}
  </section>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Module ${moduleNumber}: ${moduleName}
  eCTD Module Manifest
-->
<module number="${moduleNumber}" name="${escapeXml(moduleName)}"
        xmlns:xlink="http://www.w3.org/1999/xlink">
${granuleElements}
</module>`;
}

// ---------------------------------------------------------------------------
// Structured Document Generation (replaces generic placeholders)
// ---------------------------------------------------------------------------

function generateStructuredDocument(opts: {
  sectionCode: string;
  title: string;
  status: string;
  version: string;
  moduleName: string;
  wordCount: number | null;
  generatedAt: string;
}): string {
  const moduleNum = opts.sectionCode.split('.')[0];
  const moduleDef = MODULE_DEFS[moduleNum];
  const moduleLabel = moduleDef ? `Module ${moduleNum}: ${moduleDef.name}` : `Module ${moduleNum}`;

  return [
    `${'='.repeat(72)}`,
    `  ${opts.title}`,
    `${'='.repeat(72)}`,
    ``,
    `  Document Metadata`,
    `  ${'-'.repeat(40)}`,
    `  Section Code:    ${opts.sectionCode}`,
    `  Module:          ${moduleLabel}`,
    `  Version:         ${opts.version}`,
    `  Status:          ${opts.status}`,
    `  Generated:       ${opts.generatedAt}`,
    opts.wordCount ? `  Word Count:      ${opts.wordCount.toLocaleString()}` : null,
    ``,
    `  ${'-'.repeat(40)}`,
    `  Content Status: PENDING`,
    ``,
    `  This document is part of the eCTD submission package for`,
    `  ${moduleLabel}.`,
    ``,
    `  The document content has not yet been finalized in the document`,
    `  management system. When the authoring workflow for this section`,
    `  is complete, the content will be automatically included in`,
    `  subsequent export builds.`,
    ``,
    `  Section: ${opts.sectionCode} — ${opts.title}`,
    ``,
    `  Required Actions:`,
    `    1. Complete document authoring for section ${opts.sectionCode}`,
    `    2. Submit document through the review/approval workflow`,
    `    3. Re-export the eCTD package to include final content`,
    ``,
    `${'='.repeat(72)}`,
    `  Concept2Cure.RI eCTD Export Service — ICH M8 v4.0`,
    `${'='.repeat(72)}`,
    ``,
  ].filter(line => line !== null).join('\n');
}

// ---------------------------------------------------------------------------
// Core Export Logic
// ---------------------------------------------------------------------------

/**
 * Generate a full eCTD submission package as a ZIP buffer.
 *
 * Pulls module/granule data from the database for the given organization,
 * then assembles the ICH M8 v4.0 folder structure with XML backbone files.
 */
export async function generateEctdPackage(
  submissionId: number,
  organizationId: number,
  options: {
    region?: string;
    submissionType?: string;
    sequenceNumber?: string;
    applicationNumber?: string;
    /**
     * Submission-grade gate. When true, the export throws EctdCompletenessError
     * instead of assembling a package that contains placeholder ("PENDING")
     * leaves or no content — so a substantively-empty dossier can never be
     * produced for an actual filing. Defaults to false (draft exports still
     * build, with the completeness report attached to stats).
     */
    requireComplete?: boolean;
    /**
     * Produce a sequence DELTA against the prior sequence instead of a full
     * snapshot: changed leaves become replace/append with a modified-file
     * pointer, unchanged leaves are omitted (they stay referenced from the prior
     * sequence), and dropped leaves become backbone-only delete leaves. Off by
     * default — a first sequence (0000) or a snapshot export is unaffected, and
     * with no prior sequence on record this is a no-op. See
     * server/services/ectd/export-lifecycle.ts.
     */
    lifecycleAgainstPrior?: boolean;
  } = {}
): Promise<EctdPackageResult> {
  const region = options.region || 'FDA';
  const submissionType = options.submissionType || 'initial';
  const sequenceNumber = options.sequenceNumber || '0000';
  const applicationNumber = options.applicationNumber || `IND-${submissionId}`;
  const generatedAt = new Date().toISOString();

  // 1. Fetch eCTD modules for this organization/project
  let modules: ModuleRecord[] = [];
  let granules: GranuleRecord[] = [];

  try {
    modules = await db
      .select()
      .from(ectdModules)
      .where(
        and(
          eq(ectdModules.organizationId, organizationId),
          eq(ectdModules.projectId, submissionId)
        )
      )
      .orderBy(asc(ectdModules.sortOrder)) as unknown as ModuleRecord[];
  } catch {
    // If project-specific modules not found, try org-level modules
    try {
      modules = await db
        .select()
        .from(ectdModules)
        .where(eq(ectdModules.organizationId, organizationId))
        .orderBy(asc(ectdModules.sortOrder)) as unknown as ModuleRecord[];
    } catch {
      // No modules in DB — use defaults
    }
  }

  // Also try to pull sections from project_sections table (used by ectd-compile)
  let projectSections: any[] = [];
  try {
    // SECURITY (tenant isolation): scope by organization_id, not project_id
    // alone. Every other content query in this service is org-scoped (lines
    // below: document_versions on d.organization_id, both concept2cure_artifacts
    // lookups on organization_id); project_sections was the lone exception. Since
    // the export route resolves submissionId from the URL and does not verify the
    // project belongs to the caller's org, a project_id-only filter let an
    // authenticated org-B user export org-A's authored section content into their
    // own eCTD package — a cross-tenant leak of regulated dossier text. The
    // organization_id column is NOT NULL on project_sections, so this cannot
    // exclude legitimate rows. Surfaced by the submission-export golden journey.
    const result = await pool.query(
      `SELECT section_code, title, status, content, word_count, module
       FROM project_sections
       WHERE project_id = $1 AND organization_id = $2
       ORDER BY section_code`,
      [submissionId, organizationId]
    );
    projectSections = result.rows;
  } catch {
    // Table may not exist
  }

  // Fetch granules for the modules we found
  if (modules.length > 0) {
    const moduleIds = modules.map(m => m.id);
    try {
      granules = await db
        .select()
        .from(ectdGranules)
        .where(eq(ectdGranules.organizationId, organizationId))
        .orderBy(asc(ectdGranules.sortOrder)) as unknown as GranuleRecord[];

      // Filter to only granules belonging to our modules
      granules = granules.filter(g => moduleIds.includes(g.moduleId));
    } catch {
      // No granules
    }
  }

  // 2. Build the ZIP archive
  const zip = new JSZip();
  // Running MD5 manifest of every package file (one `md5  relPath` line per
  // file), written last as util/index-md5.txt. This is the eCTD integrity
  // contract — the same format the conformant regional packager emits and the
  // qualification harness re-verifies after reopening the ZIP.
  const packageChecksums: Array<{ relPath: string; md5: string }> = [];

  // Create the standard eCTD directory structure
  for (const [_moduleNum, def] of Object.entries(MODULE_DEFS)) {
    const moduleFolder = zip.folder(def.folder);
    for (const sub of def.subfolders) {
      moduleFolder?.folder(sub);
    }
  }

  // 3. Organize granules by module number
  const moduleGranuleMap = new Map<string, {
    moduleNumber: string;
    moduleName: string;
    granules: Array<{
      granuleId: string;
      granuleName: string;
      filePath: string;
      checksum: string;
      operation: string;
      modifiedFile?: string;
    }>;
  }>();

  // Initialize from MODULE_DEFS so we always have all 5 modules
  for (const [num, def] of Object.entries(MODULE_DEFS)) {
    moduleGranuleMap.set(num, {
      moduleNumber: num,
      moduleName: def.name,
      granules: [],
    });
  }

  // Populate from database granules
  let totalFiles = 0;
  let placeholderLeaves = 0;
  let unfinalizedLeaves = 0;
  const incompleteSections: IncompleteLeaf[] = [];
  /** Artifact statuses that count as finalized (submission-ready) content. */
  const FINALIZED_STATUSES = new Set(['locked', 'approved', 'final', 'effective', 'signed']);
  for (const granule of granules) {
    const moduleNum = granule.granuleId.split('.')[0];
    const entry = moduleGranuleMap.get(moduleNum);
    if (!entry) continue;

    const fileName = granule.fileName || `${granule.granuleName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
    const filePath = `${granuleToPath(granule.granuleId, entry.moduleName)}/${fileName}`;

    // Attempt to retrieve actual document content from the database
    let documentContent: string | null = null;
    // Editorial status of the artifact the content is sourced from, when known.
    // Vault document_versions / metadata content have no draft/review concept and
    // are treated as finalized; a concept2cure_artifacts source carries its status.
    let contentStatus: string | null = null;
    if (granule.documentPath) {
      try {
        const docResult = await pool.query(
          `SELECT dv.content, dv.file_content, d.title, d.description
           FROM document_versions dv
           JOIN documents d ON d.id = dv.document_id
           WHERE (d.id = $1 OR dv.id = $1) AND d.organization_id = $2
           ORDER BY dv.created_at DESC
           LIMIT 1`,
          [granule.id, organizationId]
        );
        if (docResult.rows.length > 0 && (docResult.rows[0].content || docResult.rows[0].file_content)) {
          documentContent = docResult.rows[0].content || docResult.rows[0].file_content;
        }
      } catch (docErr: any) {
        console.warn(`[eCTD Export] Document retrieval failed for granule ${granule.granuleId}: ${docErr.message}`);
      }
    }

    // If no content from vault, try concept2cure artifacts (editor-authored documents)
    if (!documentContent) {
      try {
        const artifactResult = await pool.query(
          `SELECT content, title, status FROM concept2cure_artifacts
           WHERE organization_id = $1
             AND (ctd_section = $2 OR ctd_section = $3 OR ctd_section = $4)
             AND status IN ('approved', 'locked', 'review', 'draft')
           ORDER BY
             CASE status WHEN 'locked' THEN 1 WHEN 'approved' THEN 2 WHEN 'review' THEN 3 ELSE 4 END,
             updated_at DESC
           LIMIT 1`,
          [organizationId, granule.granuleId, `csr-${granule.granuleId}`, `m${moduleNum}-${granule.granuleId}`]
        );
        if (artifactResult.rows.length > 0 && artifactResult.rows[0].content) {
          documentContent = artifactResult.rows[0].content;
          contentStatus = artifactResult.rows[0].status ?? null;
        }
      } catch (artErr: any) {
        console.warn(`[eCTD Export] Artifact lookup failed for ${granule.granuleId}: ${artErr.message}`);
      }
    }

    // If no content from vault or artifacts, check metadata for any stored content
    if (!documentContent && granule.metadata?.content) {
      documentContent = granule.metadata.content;
    }

    // Leaves are rendered to real PDF below (renderLeafPdf); when no authored
    // content exists, a structured placeholder document is rendered instead —
    // tracked here so the completeness gate can see unfinished leaves.
    const isPlaceholder = !documentContent;
    const fileContent = documentContent || generateStructuredDocument({
      sectionCode: granule.granuleId,
      title: granule.granuleName,
      status: granule.status,
      version: granule.version,
      moduleName: entry.moduleName,
      wordCount: granule.wordCount,
      generatedAt,
    });

    // Render to a real PDF when the leaf is a .pdf (the eCTD norm); otherwise
    // write the raw bytes. Checksums are computed on the bytes actually written.
    const leafBytes: string | Buffer = filePath.toLowerCase().endsWith('.pdf')
      ? await renderLeafPdf(fileContent, {
          title: granule.granuleName,
          sectionCode: granule.granuleId,
        })
      : fileContent;
    zip.file(filePath, leafBytes);
    totalFiles++;
    // One MD5 per leaf, reused for both the inline backbone checksum and the
    // index-md5.txt manifest line so they can never disagree.
    const leafMd5 = md5(leafBytes);
    packageChecksums.push({ relPath: filePath, md5: leafMd5 });

    entry.granules.push({
      granuleId: granule.granuleId,
      granuleName: granule.granuleName,
      filePath,
      checksum: leafMd5,
      operation: 'new',
    });

    // A leaf backed only by a draft/review artifact carries real text but is not
    // finalized — not submission-ready even though it isn't an empty placeholder.
    const isUnfinalized =
      !isPlaceholder && contentStatus != null && !FINALIZED_STATUSES.has(contentStatus.toLowerCase());

    if (isPlaceholder) {
      placeholderLeaves++;
      incompleteSections.push({
        granuleId: granule.granuleId,
        granuleName: granule.granuleName,
        status: granule.status,
      });
    } else if (isUnfinalized) {
      unfinalizedLeaves++;
      incompleteSections.push({
        granuleId: granule.granuleId,
        granuleName: granule.granuleName,
        status: contentStatus ?? granule.status,
      });
    }
  }

  // Also add project_sections as documents if they have content
  for (const section of projectSections) {
    let docContent = section.content?.trim() || '';

    // If project_sections has no content, try concept2cure artifacts
    if (!docContent) {
      try {
        const artResult = await pool.query(
          `SELECT content FROM concept2cure_artifacts
           WHERE organization_id = $1
             AND (ctd_section = $2 OR ctd_section = $3)
             AND content IS NOT NULL AND LENGTH(content) > 10
           ORDER BY
             CASE status WHEN 'locked' THEN 1 WHEN 'approved' THEN 2 WHEN 'review' THEN 3 ELSE 4 END,
             updated_at DESC
           LIMIT 1`,
          [organizationId, section.section_code, `csr-${section.section_code}`]
        );
        if (artResult.rows.length > 0) {
          docContent = artResult.rows[0].content;
        }
      } catch {
        // Artifact lookup failed — skip
      }
    }

    if (!docContent) continue;

    const moduleNum = section.section_code?.split('.')[0];
    if (!moduleNum || !MODULE_DEFS[moduleNum]) continue;

    const entry = moduleGranuleMap.get(moduleNum);
    if (!entry) continue;

    const sectionSlug = (section.title || section.section_code)
      .replace(/[^a-z0-9]+/gi, '-')
      .toLowerCase();
    const folder = MODULE_DEFS[moduleNum].folder;
    const filePath = `${folder}/${section.section_code?.replace(/\./g, '/')}/${sectionSlug}.pdf`;

    const sectionPdf = await renderLeafPdf(docContent, {
      title: section.title || section.section_code,
      sectionCode: section.section_code,
    });
    zip.file(filePath, sectionPdf);
    totalFiles++;
    const sectionMd5 = md5(sectionPdf);
    packageChecksums.push({ relPath: filePath, md5: sectionMd5 });

    entry.granules.push({
      granuleId: section.section_code,
      granuleName: section.title || section.section_code,
      filePath,
      checksum: sectionMd5,
      operation: 'new',
    });
  }

  // 3b-lifecycle. Optional sequence DELTA. When asked (and a prior sequence
  // exists for this org+application), diff the full current dossier against what
  // the prior sequence published: set replace/append/delete + modified-file,
  // omit unchanged leaves, and drop their bytes from the ZIP + checksum manifest.
  // Off by default — a first sequence or snapshot export is unchanged. The diff
  // runs on the shared lifecycle operator (one implementation) against the
  // immutable prior leaf_manifest.
  if (options.lifecycleAgainstPrior) {
    const { loadLatestPriorManifest } = await import('./ectd/prior-sequence-loader');
    const { applyLifecycleDelta } = await import('./ectd/export-lifecycle');
    const { computeSequencePrefix } = await import('./ectd/sequence-manifest');
    const priorSeq = await loadLatestPriorManifest(pool, {
      organizationId,
      applicationNumber,
      currentSequence: sequenceNumber,
    });
    if (priorSeq.leaves.length > 0) {
      const delta = applyLifecycleDelta(
        moduleGranuleMap,
        priorSeq.leaves,
        computeSequencePrefix(priorSeq.priorSequenceNumber),
      );
      // Unchanged leaves are not re-shipped: pull their bytes + checksum lines.
      const removed = new Set(delta.removedFiles);
      for (const rel of removed) zip.remove(rel);
      for (let i = packageChecksums.length - 1; i >= 0; i--) {
        if (removed.has(packageChecksums[i].relPath)) packageChecksums.splice(i, 1);
      }
      totalFiles -= removed.size;
    }
  }

  // 3c. Submission-completeness gate. A submission-grade export must never ship
  // placeholder ("Content Status: PENDING") leaves or an empty dossier — that is
  // a Refuse-to-File / eCTD technical-rejection risk (FDA eCTD Technical
  // Conformance Guide; ICH M8). Measured always; enforced (throws) only when the
  // caller requests a submission-grade build via { requireComplete: true }.
  const completeness = computeEctdCompleteness(totalFiles, placeholderLeaves, incompleteSections, unfinalizedLeaves);
  if (options.requireComplete) assertEctdSubmissionComplete(completeness);

  // 4. Generate index.xml (the root eCTD backbone)
  const indexXml = generateIndexXml({
    applicationNumber,
    sequenceNumber,
    submissionType,
    region,
    modules: Array.from(moduleGranuleMap.values()),
    generatedAt,
  });
  zip.file('index.xml', indexXml);
  packageChecksums.push({ relPath: 'index.xml', md5: md5(indexXml) });

  // 5. Generate regional XML (Module 1 regional info + Module 1 leaves —
  // index.xml is ICH Modules 2–5 only, so m1 content is referenced from here).
  const m1Granules = moduleGranuleMap.get('1')?.granules ?? [];
  const regionalXml = generateRegionalXml(region, applicationNumber, m1Granules);
  const regionCode = resolveEctdRegion(region).code;
  const regionalPath = `m1/${regionCode}-regional.xml`;
  zip.file(regionalPath, regionalXml);
  packageChecksums.push({ relPath: regionalPath, md5: md5(regionalXml) });

  // 6. Generate per-module manifest XMLs
  for (const [moduleNum, def] of Object.entries(MODULE_DEFS)) {
    const moduleGranules = granules.filter(
      g => g.granuleId.startsWith(`${moduleNum}.`)
    );

    const moduleManifestXml = generateModulePlaceholderXml(
      moduleNum,
      def.name,
      moduleGranules
    );
    const manifestPath = `${def.folder}/module-${moduleNum}-manifest.xml`;
    zip.file(manifestPath, moduleManifestXml);
    packageChecksums.push({ relPath: manifestPath, md5: md5(moduleManifestXml) });
  }

  // 7. Generate STF (Submission Tracking File) for the envelope
  const stfXml = `<?xml version="1.0" encoding="UTF-8"?>
<submission-tracking
    xmlns:xlink="http://www.w3.org/1999/xlink"
    dtd-version="4.0">
  <submission>
    <application-number>${escapeXml(applicationNumber)}</application-number>
    <sequence-number>${sequenceNumber}</sequence-number>
    <submission-type>${escapeXml(submissionType)}</submission-type>
    <submission-status>pending</submission-status>
    <created>${generatedAt}</created>
    <file-count>${totalFiles}</file-count>
    <region>${escapeXml(region)}</region>
  </submission>
</submission-tracking>`;
  zip.file('util/stf.xml', stfXml);
  packageChecksums.push({ relPath: 'util/stf.xml', md5: md5(stfXml) });

  // 7b. Bundle vendored ICH/regional DTDs into util/dtd/ when available, so the
  // package is self-contained. No-op (with a validator warning) until the team
  // vendors the licensed DTD files. See HI_8_ECTD_SCOPING_BRIEF.md G1.
  packageChecksums.push(...bundleVendoredDtds(zip));

  // 7c. Write the MD5 integrity manifest LAST, once every other file's bytes are
  // final. util/index-md5.txt lists one `md5  relPath` line per package file
  // (sorted, byte-stable) — the eCTD integrity contract. Emitted via the same
  // canonical builder as the conformant regional packager, so both export paths
  // produce an identical manifest format that the FDA criteria adapter accepts
  // and the qualification harness re-verifies after reopening the ZIP.
  zip.file('util/index-md5.txt', buildMd5Index(packageChecksums));

  // 8. Record the compilation in the database, capturing the immutable
  // per-sequence leaf manifest (every published leaf's precise section, href,
  // and MD5) so a LATER sequence can diff against exactly what shipped and emit
  // correct lifecycle operators + modified-file pointers. application_number and
  // sequence_number are set here too so this path's compilations feed the
  // sequence-continuity gate (they were previously left null — C-31).
  const leafManifest = buildLeafManifest(
    Array.from(moduleGranuleMap.values()).flatMap(m =>
      m.granules.map(g => ({
        ctdSection: g.granuleId,
        href: g.filePath,
        md5: g.checksum,
        operation: g.operation,
        title: g.granuleName,
      })),
    ),
  );
  try {
    if (modules.length > 0) {
      await db
        .insert(ectdCompilations)
        .values({
          organizationId,
          moduleId: modules[0].id,
          compilationName: `eCTD Export — ${applicationNumber} seq ${sequenceNumber}`,
          compilationType: submissionType,
          status: 'completed',
          compiledBy: 1,
          compiledAt: new Date(),
          xmlBackbone: indexXml,
          applicationNumber,
          sequenceNumber,
          leafManifest,
          version: '1.0',
        });
    }
  } catch {
    // Non-blocking — table may not be migrated yet
    console.warn('[eCTD Export] Could not record compilation in database');
  }

  // 9. Generate the ZIP buffer
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const filename = `ectd_${applicationNumber.replace(/[^a-z0-9]/gi, '_')}_seq${sequenceNumber}_${Date.now()}.zip`;

  return {
    buffer,
    filename,
    stats: {
      totalModules: moduleGranuleMap.size,
      totalGranules: granules.length + projectSections.filter(s => s.content?.trim().length > 0).length,
      totalFiles,
      generatedAt,
      completeness,
    },
  };
}

// ---------------------------------------------------------------------------
// Package Validation
// ---------------------------------------------------------------------------

/**
 * Validate an eCTD package ZIP buffer for structural correctness.
 *
 * Checks:
 *  - Required index.xml exists
 *  - XML well-formedness (basic tag matching)
 *  - Module folder structure present
 *  - File references in index.xml resolve to actual files in the ZIP
 */
export async function validateEctdPackage(
  zipBuffer: Buffer
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch (e: any) {
    return { valid: false, errors: [`Invalid ZIP archive: ${e.message}`], warnings: [] };
  }

  const fileNames = Object.keys(zip.files);

  // 1. Check index.xml exists
  if (!fileNames.includes('index.xml')) {
    errors.push('Missing required file: index.xml (eCTD backbone)');
  } else {
    // 2. Validate XML well-formedness of index.xml
    const indexContent = await zip.file('index.xml')!.async('string');
    const xmlErrors = validateXmlWellFormedness(indexContent);
    if (xmlErrors.length > 0) {
      errors.push(...xmlErrors.map(e => `index.xml: ${e}`));
    }

    // 3. Check that file references in the XML resolve to actual ZIP entries
    const hrefMatches = indexContent.match(/xlink:href="([^"]+)"/g) || [];
    for (const match of hrefMatches) {
      const href = match.replace('xlink:href="', '').replace('"', '');
      if (!fileNames.includes(href)) {
        errors.push(`index.xml references file "${href}" which is not present in the package`);
      }
    }
  }

  // 3b. Regional-backbone href resolution. Module 1 leaves are referenced from
  // m1/{code}-regional.xml with hrefs RELATIVE to that file — resolve each one
  // against the file's own directory and require a real ZIP entry, so a broken
  // m1 reference is caught with the same rigor as a broken index.xml reference.
  for (const regionalFile of fileNames.filter(f => /^m1\/[a-z]{2}-regional\.xml$/.test(f))) {
    const regionalContent = await zip.file(regionalFile)!.async('string');
    const baseDir = path.posix.dirname(regionalFile);
    for (const match of regionalContent.match(/xlink:href="([^"]+)"/g) || []) {
      const href = match.replace('xlink:href="', '').replace('"', '');
      const resolved = path.posix.normalize(path.posix.join(baseDir, href));
      if (!fileNames.includes(resolved)) {
        errors.push(
          `${regionalFile} references file "${href}" (resolves to "${resolved}") which is not present in the package`,
        );
      }
    }
  }

  // 4. Check module folder structure
  const requiredFolders = ['m1', 'm2', 'm3', 'm4', 'm5'];
  for (const folder of requiredFolders) {
    const hasFolder = fileNames.some(f => f.startsWith(`${folder}/`));
    if (!hasFolder) {
      warnings.push(`Module folder "${folder}/" is empty or missing`);
    }
  }

  // 5. Check regional XML exists in m1
  const hasRegionalXml = fileNames.some(
    f => f.startsWith('m1/') && f.endsWith('-regional.xml')
  );
  if (!hasRegionalXml) {
    warnings.push('No regional XML file found in m1/ (expected us-regional.xml, eu-regional.xml, or jp-regional.xml)');
  }

  // 6. Validate all XML files in the package
  const xmlFiles = fileNames.filter(f => f.endsWith('.xml') && !zip.files[f].dir);
  for (const xmlFile of xmlFiles) {
    if (xmlFile === 'index.xml') continue; // Already validated above
    try {
      const content = await zip.file(xmlFile)!.async('string');
      const xmlErrs = validateXmlWellFormedness(content);
      if (xmlErrs.length > 0) {
        errors.push(...xmlErrs.map(e => `${xmlFile}: ${e}`));
      }
    } catch (e: any) {
      errors.push(`${xmlFile}: Could not read file — ${e.message}`);
    }
  }

  // 7. Check STF (Submission Tracking File)
  if (!fileNames.includes('util/stf.xml')) {
    warnings.push('Missing util/stf.xml (Submission Tracking File)');
  }

  // 8. DTD self-containment: index.xml declares a DTD via DOCTYPE, but a
  // submission-ready package must bundle that DTD under util/dtd/. Surface this
  // explicitly instead of silently shipping a backbone with a dangling DTD
  // reference. See HI_8_ECTD_SCOPING_BRIEF.md G1.
  try {
    const idxFile = zip.file('index.xml');
    const idxContent = idxFile ? await idxFile.async('string') : '';
    const referencesDtd = /<!DOCTYPE[^>]*\.dtd"/i.test(idxContent);
    const hasBundledDtd = fileNames.some(
      f => f.startsWith('util/dtd/') && f.endsWith('.dtd')
    );
    if (referencesDtd && !hasBundledDtd) {
      warnings.push(
        'index.xml references a DTD via DOCTYPE but no DTD is bundled under util/dtd/ — ' +
          'the package is not self-contained and is not submission-ready until the ICH/regional ' +
          'DTDs are vendored into util/dtd/.'
      );
    }
  } catch {
    /* non-fatal — DTD bundling check is advisory */
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Basic XML well-formedness check without a full parser.
 * Verifies XML declaration, balanced tags, and basic structure.
 */
function validateXmlWellFormedness(xml: string): string[] {
  const errors: string[] = [];

  // Must start with XML declaration
  if (!xml.trimStart().startsWith('<?xml')) {
    errors.push('Missing XML declaration (<?xml version="1.0" ...?>)');
  }

  // Check for balanced angle brackets
  const openCount = (xml.match(/</g) || []).length;
  const closeCount = (xml.match(/>/g) || []).length;
  if (openCount !== closeCount) {
    errors.push(`Unbalanced angle brackets: ${openCount} opening vs ${closeCount} closing`);
  }

  // Check for basic tag balance (simplified — not a full parser)
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9:_-]*)[^>]*\/?>/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(xml)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1];

    // Skip processing instructions, comments, self-closing tags
    if (fullMatch.startsWith('<?') || fullMatch.startsWith('<!') || fullMatch.endsWith('/>')) {
      continue;
    }

    if (fullMatch.startsWith('</')) {
      // Closing tag
      if (stack.length === 0) {
        errors.push(`Unexpected closing tag </${tagName}> with no matching open tag`);
        break;
      }
      const expected = stack.pop();
      if (expected !== tagName) {
        errors.push(`Mismatched tags: expected </${expected}>, found </${tagName}>`);
        break;
      }
    } else {
      // Opening tag
      stack.push(tagName);
    }
  }

  if (stack.length > 0 && errors.length === 0) {
    errors.push(`Unclosed tags: ${stack.join(', ')}`);
  }

  return errors;
}
