/**
 * Golden journey — eCTD export: from a compiled dossier to a submittable package.
 *
 * This is the last mile of the biotech submission path and had NO journey
 * coverage: authoring and eCTD compile are proven elsewhere, but the step that
 * actually produces the file you send to FDA — a structurally valid ICH M8 v4
 * eCTD ZIP — was unproven end-to-end. This journey drives the REAL
 * generateEctdPackage / validateEctdPackage against the REAL canonical DDL on an
 * in-process Postgres.
 *
 * It provisions project_sections from the exact C-23 migrations
 * (20260220_ind_section_tracking + 20260725_project_sections_content_columns)
 * that were deploy-dead until this change — the export reads that table, so the
 * journey both depends on and proves the reachability fix.
 *
 * What it pins:
 *   1. A complete dossier exports to a structurally valid eCTD package (index.xml,
 *      m1 regional XML, module folders, and every xlink:href resolving to a real
 *      file in the ZIP).
 *   2. The authored section content actually lands in the package (m3 leaf PDF).
 *   3. The submission-completeness gate BLOCKS a substantively-empty dossier
 *      (placeholder leaves) when requireComplete is set — the Refuse-to-File guard.
 *   4. TENANT ISOLATION: an org-B caller exporting an org-A project id gets NONE
 *      of org-A's authored section content. This is the cross-tenant leak the
 *      journey surfaced and this change fixes (project_sections was queried by
 *      project_id alone; now org-scoped).
 *   5. A successful export records an attributed compilation row.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../server/db', () => ({
  get db() {
    return h.db;
  },
  get pool() {
    return h.pool;
  },
}));

import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { generateEctdPackage, validateEctdPackage } from '../../server/services/ectdExportService';
import { EctdCompletenessError } from '../../server/services/ectd/completeness';
import { createJourneyDb, JourneyRecorder, type JourneyDb } from './harness';

const DB_TIMEOUT_MS = 120_000;

// FK prerequisites: two tenants, three projects. project 1 (org 1) is a complete
// Module 3 dossier; project 3 (org 1) is an incomplete one; project 2 (org 2) is
// the other tenant used for the isolation assertion.
const PREREQ = `
  CREATE TABLE organizations (id SERIAL PRIMARY KEY, name TEXT);
  CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);
  CREATE TABLE projects (id SERIAL PRIMARY KEY, organization_id INTEGER, name TEXT);
  INSERT INTO organizations (id, name) VALUES (1, 'sponsor-a'), (2, 'sponsor-b');
  INSERT INTO users (id, email) VALUES (1, 'ra@sponsor-a.example'), (2, 'ra@sponsor-b.example');
  INSERT INTO projects (id, organization_id, name) VALUES
    (1, 1, 'A: complete IND'),
    (3, 1, 'A: incomplete IND'),
    (2, 2, 'B: other IND');
`;

// The eCTD drizzle-push tables (defined in shared/schema.ts, not in any
// migration, so extractTableDdl cannot reach them). Full column sets so the
// service's select-all drizzle reads succeed; module_id / compiled_by on
// ectd_compilations are nullable per ledger C-16 (project-level compile).
const ECTD_DDL = `
  CREATE TABLE ectd_modules (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    project_id INTEGER,
    module_number TEXT NOT NULL,
    module_name TEXT NOT NULL,
    parent_module_id INTEGER,
    level INTEGER NOT NULL,
    is_leaf BOOLEAN DEFAULT false,
    sort_order INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    ich_guidance TEXT,
    is_required BOOLEAN DEFAULT false,
    allow_custom_granules BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE ectd_granules (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    module_id INTEGER NOT NULL,
    granule_id TEXT NOT NULL,
    granule_name TEXT NOT NULL,
    file_name TEXT,
    file_extension TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    version TEXT NOT NULL DEFAULT '1.0',
    last_edited_by INTEGER,
    last_edited_at TIMESTAMPTZ,
    document_path TEXT,
    sharepoint_url TEXT,
    sharepoint_doc_id TEXT,
    is_locked BOOLEAN DEFAULT false,
    compiled_into INTEGER,
    template_id INTEGER,
    custom_granule BOOLEAN DEFAULT false,
    ich_section TEXT,
    word_count INTEGER DEFAULT 0,
    metadata JSON,
    tags TEXT[],
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE ectd_compilations (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER NOT NULL,
    module_id INTEGER,
    compilation_name TEXT NOT NULL,
    compilation_type TEXT NOT NULL,
    included_granules JSON,
    compiled_file_path TEXT,
    sharepoint_url TEXT,
    xml_backbone TEXT,
    cross_references JSON,
    status TEXT NOT NULL DEFAULT 'pending',
    compiled_by INTEGER,
    compiled_at TIMESTAMPTZ,
    version TEXT DEFAULT '1.0',
    change_log JSON,
    validation_results JSON,
    lock_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  -- Minimal artifact table (service reads it via raw SQL naming only these cols).
  CREATE TABLE concept2cure_artifacts (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER,
    ctd_section TEXT,
    title TEXT,
    content TEXT,
    status TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

// A distinctive phrase that only appears in org-A's authored section, so the
// isolation assertion can prove it is absent from an org-B export.
const ORG_A_SECRET = 'CONFIDENTIAL-SPONSOR-A-DRUG-PRODUCT-SPEC-9F3A';

let jdb: JourneyDb;
const R = new JourneyRecorder(
  'eCTD Export — compiled dossier to submittable package',
  'Drives the real eCTD export/validate services against canonical DDL: valid package, completeness gate, and cross-tenant isolation of authored content.',
);

beforeAll(async () => {
  jdb = await createJourneyDb({
    prereqSql: PREREQ,
    migrations: [
      'db/migrations/20260220_ind_section_tracking.sql',
      'db/migrations/20260725_project_sections_content_columns.sql',
    ],
    testOnlySql: ECTD_DDL,
  });
  h.db = jdb.db;
  h.pool = jdb.pool;

  // org 1 / project 1 — a COMPLETE Module 3 dossier: one eCTD module and one
  // authored, approved project section carrying real content. No placeholder
  // granules, so the completeness gate is satisfied.
  await jdb.pool.query(
    `INSERT INTO ectd_modules (organization_id, project_id, module_number, module_name, level, sort_order, status)
     VALUES (1, 1, '3', 'Quality', 1, 1, 'active')`,
  );
  await jdb.pool.query(
    `INSERT INTO project_sections (organization_id, project_id, section_code, title, status, content, word_count, module)
     VALUES (1, 1, '3.2.P.1', 'Drug Product Description and Composition', 'approved', $1, 42, 'm3')`,
    // Real CMC prose carries glyphs the WinAnsi PDF font cannot encode: box
    // drawing, Greek letters, arrows, math operators. Before the renderer fix
    // any one of these 500'd the whole export. They must now flow through.
    [
      `${ORG_A_SECRET}\n\nThe drug product is a lyophilized powder.\n` +
        `Assay: 50 µg/mL ± 5%. Storage 2–8°C. Release ≥ 98%.\n` +
        `Kinetics: t½ where μmax → plateau.  ────────────────`,
    ],
  );

  // org 1 / project 3 — an INCOMPLETE dossier: a module with a content-less
  // granule (no document_path, no matching artifact) → the exporter synthesizes a
  // PENDING placeholder leaf, which the submission-grade gate must reject.
  await jdb.pool.query(
    `INSERT INTO ectd_modules (organization_id, project_id, module_number, module_name, level, sort_order, status)
     VALUES (1, 3, '3', 'Quality', 1, 1, 'active')`,
  );
  const incompleteModule = (await jdb.pool.query(
    `SELECT id FROM ectd_modules WHERE organization_id = 1 AND project_id = 3`,
  )) as { rows: Array<{ id: number }> };
  await jdb.pool.query(
    `INSERT INTO ectd_granules (organization_id, module_id, granule_id, granule_name, status, sort_order)
     VALUES (1, $1, '3.2.S.1', 'Drug Substance — General Information', 'draft', 1)`,
    [incompleteModule.rows[0].id],
  );

  // org 2 / project 2 — the other tenant, with its own module (so a same-shape
  // export exists to contrast against).
  await jdb.pool.query(
    `INSERT INTO ectd_modules (organization_id, project_id, module_number, module_name, level, sort_order, status)
     VALUES (2, 2, '3', 'Quality', 1, 1, 'active')`,
  );
}, DB_TIMEOUT_MS);

afterAll(async () => {
  R.write('submission-export-package');
  await jdb?.close();
});

describe('golden journey — eCTD export to submittable package', () => {
  it(
    'produces a structurally valid, tenant-isolated, completeness-gated eCTD package',
    async () => {
      // 1. Export the complete dossier (draft mode — always builds).
      const draft = await R.step('export org A project 1 (complete dossier)', async () => {
        const pkg = await generateEctdPackage(1, 1, { region: 'FDA', requireComplete: false });
        return {
          filename: pkg.filename,
          totalFiles: pkg.stats.totalFiles,
          completenessPct: pkg.stats.completeness?.completenessPct,
          complete: pkg.stats.completeness?.complete,
          bufferBytes: pkg.buffer.length,
        };
      });
      expect(draft.bufferBytes).toBeGreaterThan(0);
      // Only authored (finalized) section content, no placeholder granules → complete.
      expect(draft.complete).toBe(true);
      expect(draft.totalFiles).toBeGreaterThan(0);

      // 2. The produced package is a structurally valid eCTD, and the authored
      //    section content is actually in it.
      await R.step('the package validates and carries the authored content', async () => {
        const pkg = await generateEctdPackage(1, 1, { region: 'FDA' });
        const validation = await validateEctdPackage(pkg.buffer);
        const zip = await JSZip.loadAsync(pkg.buffer);
        const names = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
        const hasIndex = names.includes('index.xml');
        const hasRegional = names.some((f) => f.startsWith('m1/') && f.endsWith('-regional.xml'));
        const m3Leaves = names.filter((f) => f.startsWith('m3/') && f.endsWith('.pdf'));
        expect(hasIndex).toBe(true);
        expect(hasRegional).toBe(true);
        // The authored section became a leaf PDF under m3.
        expect(m3Leaves.length).toBeGreaterThan(0);
        // No dangling references: every xlink:href resolves to a real ZIP entry.
        expect(validation.errors).toEqual([]);
        return {
          valid: validation.valid,
          zipErrors: validation.errors.length,
          hasIndex,
          hasRegional,
          m3LeafCount: m3Leaves.length,
        };
      });

      // 2b. CONFORMANCE (path-1 consolidation, audit gap G2): the backbone is the
      //     conformant ICH structure — the non-spec <ectd:submission> metadata
      //     block, the <ectd:m1-administrative> wrapper that wrongly enclosed every
      //     module, and the custom <m{n}-slug> elements are gone; leaves carry
      //     unique XML IDs; and util/index-md5.txt is a re-verifiable integrity
      //     manifest whose every line matches the shipped bytes.
      await R.step('index.xml is conformant and index-md5.txt re-verifies', async () => {
        const pkg = await generateEctdPackage(1, 1, { region: 'FDA' });
        const zip = await JSZip.loadAsync(pkg.buffer);
        const indexXml = await zip.file('index.xml')!.async('string');

        // The non-spec structures the consolidation removed must be gone…
        expect(indexXml).not.toContain('<ectd:submission>');
        expect(indexXml).not.toContain('ectd:m1-administrative');
        // …and the legacy flat module block convention must be gone too…
        expect(indexXml).not.toMatch(/<m3>/);
        // …replaced by the authoritative ICH v3.2.2 heading hierarchy carrying
        // the authored m3.2.P leaf nested at its correct depth.
        expect(indexXml).toMatch(
          /<m3-quality>[\s\S]*<m3-2-body-of-data>[\s\S]*<m3-2-p-drug-product>[\s\S]*<leaf /,
        );
        expect(indexXml).toContain('dtd-version="3.2"');

        // Leaf IDs are XML ID-typed and must be unique within the backbone — the
        // regression guard for the granuleId-only collision the old scheme had.
        const ids = [...indexXml.matchAll(/\bID="([^"]+)"/g)].map((m) => m[1]);
        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);

        // util/index-md5.txt is present and every line resolves to a real ZIP
        // entry whose bytes hash to the recorded MD5 (reopen-and-verify).
        const manifest = await zip.file('util/index-md5.txt')!.async('string');
        const lines = manifest.split('\n').map((l) => l.trim()).filter(Boolean);
        expect(lines.length).toBeGreaterThan(0);
        let verified = 0;
        for (const line of lines) {
          const sep = line.indexOf('  ');
          const expectedMd5 = line.slice(0, sep).trim();
          const relPath = line.slice(sep + 2).trim();
          const entry = zip.file(relPath);
          expect(entry, `index-md5.txt references missing file ${relPath}`).toBeTruthy();
          const actual = createHash('md5')
            .update(await entry!.async('nodebuffer'))
            .digest('hex');
          expect(actual, `checksum mismatch for ${relPath}`).toBe(expectedMd5);
          verified += 1;
        }
        // The backbone itself is covered by the manifest.
        expect(lines.some((l) => l.endsWith('  index.xml'))).toBe(true);
        return { leafIds: ids.length, filesInManifest: lines.length, verified };
      });

      // 3. requireComplete passes for the complete dossier (no throw).
      await R.step('submission-grade build succeeds for a complete dossier', async () => {
        const pkg = await generateEctdPackage(1, 1, { region: 'FDA', requireComplete: true });
        return { filename: pkg.filename, complete: pkg.stats.completeness?.complete };
      });

      // 4a. An incomplete dossier still BUILDS a draft — its content-less granule
      //     renders as a PENDING placeholder leaf. This is the regression guard for
      //     the WinAnsi crash this journey surfaced: the placeholder document
      //     contained box-drawing glyphs the PDF font could not encode, so the
      //     export threw before it could even reach the completeness gate.
      const incompleteDraft = await R.step(
        'an incomplete dossier builds a draft (placeholder leaf renders, no crash)',
        async () => {
          const pkg = await generateEctdPackage(3, 1, { region: 'FDA', requireComplete: false });
          return {
            placeholderLeaves: pkg.stats.completeness?.placeholderLeaves,
            complete: pkg.stats.completeness?.complete,
            bufferBytes: pkg.buffer.length,
          };
        },
      );
      expect(incompleteDraft.placeholderLeaves).toBeGreaterThan(0);
      expect(incompleteDraft.complete).toBe(false);

      // 4b. The completeness gate BLOCKS the incomplete dossier under requireComplete.
      await R.expectBlocked(
        'submission-grade build is refused for an incomplete dossier (RTF guard)',
        async () => {
          try {
            // (submissionId=3, organizationId=1) — org A's incomplete project 3.
            await generateEctdPackage(3, 1, { region: 'FDA', requireComplete: true });
            return { blocked: false };
          } catch (err) {
            const isGate = err instanceof EctdCompletenessError;
            return {
              blocked: isGate,
              code: (err as EctdCompletenessError)?.code,
              placeholderLeaves: (err as EctdCompletenessError)?.completeness?.placeholderLeaves,
            };
          }
        },
      );

      // 5. TENANT ISOLATION: org B exporting org A's project id must not receive
      //    org A's authored section content. (project_sections is now org-scoped.)
      await R.expectBlocked(
        "org B cannot export org A's authored section content",
        async () => {
          // org A's section title slugifies into the leaf's file path. If org B's
          // export of org A's project id contains a leaf named from it, org A's
          // authored content leaked into org B's package. (Detecting via the ZIP
          // file list, not PDF bytes: renderLeafPdf encodes text into content
          // streams, so the plaintext is not a substring of the PDF.)
          const ORG_A_SECTION_SLUG = 'drug-product-description-and-composition';
          const pkg = await generateEctdPackage(1, 2, { region: 'FDA' });
          const zip = await JSZip.loadAsync(pkg.buffer);
          const leafNames = Object.keys(zip.files).filter(
            (n) => !zip.files[n].dir && n.endsWith('.pdf'),
          );
          const leakedFiles = leafNames.filter((n) => n.includes(ORG_A_SECTION_SLUG));
          // Also assert org B gets no content leaves at all from org A's project.
          const leaked = leakedFiles.length > 0 || (pkg.stats.totalFiles ?? 0) > 0;
          return { blocked: !leaked, leaked, orgBLeafFiles: leafNames.length, leakedFiles };
        },
      );

      // 6. A successful export records an attributed compilation row for org A.
      await R.step('the export records an org-scoped compilation row', async () => {
        const rows = (await jdb.pool.query(
          `SELECT organization_id, compilation_name, status FROM ectd_compilations WHERE organization_id = 1`,
        )) as { rows: Array<{ organization_id: number; compilation_name: string; status: string }> };
        expect(rows.rows.length).toBeGreaterThan(0);
        return { compilationRows: rows.rows.length, firstName: rows.rows[0]?.compilation_name };
      });

      R.observations.push(
        'Fixed while building this journey: generateEctdPackage queried project_sections by project_id ALONE, with no organization filter (every other content query in the service is org-scoped). Because the export route resolves submissionId from the URL and never verifies the project belongs to the caller, an authenticated org-B user could export org-A\'s authored section content into their own eCTD package — a cross-tenant leak of regulated dossier text. Now scoped by organization_id.',
        'Fixed while building this journey: the leaf PDF renderer embeds a WinAnsi standard font, and page.drawText throws on any glyph Windows-1252 cannot encode. The PENDING-placeholder generator emitted box-drawing characters, so EVERY incomplete-dossier export threw a "WinAnsi cannot encode" 500 before it could reach the completeness gate — and any authored content with Greek letters, arrows, or math operators (ubiquitous in CMC/clinical text) would have crashed the same way. Added a deterministic toWinAnsiSafe pass so the renderer is total over arbitrary Unicode.',
      );
      R.limitations.push(
        'This journey ends at a produced, validated, submission-complete eCTD ZIP. The actual transmission to FDA (ESG / AS2 gateway) is not exercised — it requires a live gateway and credentials and cannot run in-process. What is proven here is that the package the platform would transmit is structurally valid, tenant-isolated, and completeness-gated.',
        'ectd_modules / ectd_granules / ectd_compilations are drizzle-push tables with no migration DDL, so their shapes are mirrored inline here from shared/schema.ts rather than via extractTableDdl. project_sections uses the real C-23 migrations.',
      );

      const m = R.manifest();
      expect(m.summary.failed).toBe(0);
    },
    DB_TIMEOUT_MS,
  );
});
