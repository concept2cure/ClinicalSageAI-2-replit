/**
 * Golden journey — eCTD export: from a canonical submission to a submittable package.
 *
 * PORTED to the canonical generator in the slice-5b consolidation: the legacy
 * `ectdExportService` (ectd_modules/ectd_granules/project_sections, placeholder
 * "PENDING" leaves, its own index.xml/md5) was deleted, and the export routes
 * now run `assembleSubmissionEctd` — submissions → ectd_sequences →
 * submission_leaves assembled by `assemble-from-core` through the real
 * regional packager. This journey drives that REAL path against the REAL
 * canonical DDL on in-process Postgres (PGlite) and re-checks the emitted
 * bytes with the ZIP structural validator the /validate route uses.
 *
 * What it pins (the canonical ports of the legacy journey's claims):
 *   1. A submission with placed, renderable leaves exports to a structurally
 *      valid eCTD ZIP (index.xml, m1 regional backbone, PDF leaves, and a
 *      util/index-md5.txt whose every line re-verifies against shipped bytes).
 *   2. The submission-grade gate (requireComplete) PASSES for a fully
 *      materializable dossier and REFUSES (EctdCompletenessError) a package
 *      whose placed leaves cannot all be materialized — the Refuse-to-File
 *      guard, now backed by real materialization instead of placeholder text.
 *   3. TENANT ISOLATION twice over: an org-B caller exporting org-A's
 *      submission id is refused at the submission lookup, and a leaf pointing
 *      at another org's document is denied at the DB boundary (unresolved →
 *      incomplete → refusal), never silently packaged.
 *   4. Region honesty: a requested region contradicting the sequence's
 *      recorded region is refused — never silently honored or ignored.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../server/db', () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock('../../server/db.js', () => ({
  get db() {
    return holder.db;
  },
}));
// Audit writes are not the subject under test; silence them (the assembler
// still calls logAction, proving the audited path executes end-to-end).
vi.mock('../../server/services/auditService', () => ({
  default: { logAction: vi.fn(async () => {}) },
}));

import { createIndPgliteDb, type IndPgliteDb } from '../../server/db/pglite-harness';
import { assembleSubmissionEctd } from '../../server/services/ectd/assemble-from-core';
import { validateEctdPackage } from '../../server/services/submission-gateways/ectd-structural-validator';
import { EctdCompletenessError } from '../../server/services/ectd/completeness';
import { JourneyRecorder, assertNoSchemaGaps, assertNoDegradedTenantEnrichment } from './harness';

const T = 180_000;

const ORG_A = 1;
const ORG_B = 2;
const USER = 1;

let harness: IndPgliteDb;

const R = new JourneyRecorder(
  'eCTD Export — canonical submission to submittable package',
  'Drives the canonical export generator (assembleSubmissionEctd over the ' +
    'submission spine) against real canonical DDL: valid package with ' +
    're-verifiable checksums, materialization-backed completeness gate, ' +
    'tenant isolation, and region honesty.',
  [
    'server/db/pglite-harness.ts#SUBMISSION_CORE_PGLITE_DDL',
    'server/db/pglite-harness.ts#LEAF_SOURCE_PGLITE_DDL',
  ],
);

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;

  await harness.pglite.exec(`
    -- Org A, submission 1: a fully materializable IND dossier (M2 + M3).
    INSERT INTO submissions (id, title, product_name, application_type, client_type, primary_region, organization_id, created_by)
    VALUES (1, 'A: complete IND', 'Examplinib', 'ind', 'biotech', 'fda', ${ORG_A}, ${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
    VALUES (1, 1, 'fda', '0000', ${ORG_A}, ${USER});

    -- 'approved', not the default draft: this fixture is the COMPLETE dossier,
    -- and completeness now counts a materialized-but-draft leaf as unfinished
    -- (an all-draft package is not submission-complete). A fixture that claims
    -- completeness has to carry approved source documents to earn it.
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status)
    VALUES (100, ${ORG_A}, 'Clinical Overview', '<h1>Clinical Overview</h1><p>Benefit-risk narrative.</p>', '2.5', 'approved');
    INSERT INTO unified_documents (id, title, document_type, created_by, organization_id, latest_version, status)
    VALUES (200, 'Drug Substance', 'summary', 'tester', ${ORG_A}, 1, 'approved');
    INSERT INTO workflow_document_versions (document_id, version, content, created_by, organization_id)
    VALUES (200, 1, '{"type":"doc","content":[{"type":"text","text":"Drug substance specification."}]}'::json, 'tester', ${ORG_A});

    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by)
    VALUES
      (1, '2.5',   'Clinical Overview', 'new', 'coauthor_documents', 100, ${ORG_A}, ${USER}),
      (1, '3.2.s', 'Drug Substance',    'new', 'unified_documents',  200, ${ORG_A}, ${USER});

    -- Org A, submission 3: an INCOMPLETE dossier — one renderable leaf plus a
    -- leaf pointing at a document that belongs to ORG B (cross-tenant attack
    -- shape). The resolver must deny it at the DB boundary → unresolved →
    -- completeness gate refusal.
    INSERT INTO submissions (id, title, product_name, application_type, client_type, primary_region, organization_id, created_by)
    VALUES (3, 'A: incomplete IND', 'Examplinib-2', 'ind', 'biotech', 'fda', ${ORG_A}, ${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
    VALUES (3, 3, 'fda', '0000', ${ORG_A}, ${USER});
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
    VALUES (300, ${ORG_B}, 'Other-Tenant Secret', '<p>must never appear</p>', '2.5');
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by)
    VALUES
      (3, '2.5',   'Clinical Overview', 'new', 'coauthor_documents', 100, ${ORG_A}, ${USER}),
      (3, '5.3.5', 'Cross-Tenant Study Report', 'new', 'coauthor_documents', 300, ${ORG_A}, ${USER});
  `);
}, T);

afterAll(async () => {
  // A journey that ran against a database missing a table its subject writes
  // to proves less than it claims (ledger L145/L147). `createIndPgliteDb`
  // records the gaps at the PGlite seam, where Drizzle's statements land too.
  // Ordered BEFORE the schema-gap check on purpose: a degraded membership is
  // usually CAUSED by a missing column, and the gap check would otherwise
  // throw first and report the symptom while hiding which claims were
  // proven without an org context (ledger L148).
  await assertNoDegradedTenantEnrichment();
  assertNoSchemaGaps(harness);
  try {
    R.write('submission-export-package');
  } finally {
    if (harness) await harness.close();
  }
});

describe('golden journey — eCTD export to submittable package (canonical)', () => {
  R.limitations.push(
    'Leaf PDFs are deterministic pure-pdf-lib TEXT renderings, not PDF/A-1b; ' +
      'PDF/A conformance is a separate gate (ectd/pdfa-readiness.ts). ' +
      'Transmission to FDA (ESG/AS2) is not exercised — it needs a live gateway.',
  );

  it(
    'produces a structurally valid, tenant-isolated, completeness-gated eCTD package',
    async () => {
      // 1. Export the complete dossier through the canonical generator.
      const exported = await R.step('export org A submission 1 (complete dossier)', async () => {
        const pkg = await assembleSubmissionEctd({
          submissionId: 1,
          organizationId: ORG_A,
          userId: USER,
        });
        return pkg;
      });
      expect(exported.buffer.length).toBeGreaterThan(0);
      expect(exported.materialized).toBe(2);
      expect(exported.unresolvedLeaves).toEqual([]);
      expect(exported.sequenceNumber).toBe('0000');
      expect(exported.region).toBe('fda');
      expect(exported.stats.completeness.complete).toBe(true);

      // 2. The produced package is a structurally valid eCTD carrying the
      //    rendered leaves, and the /validate route's ZIP validator agrees.
      await R.step('the package validates and carries rendered PDF leaves', async () => {
        const validation = await validateEctdPackage(exported.buffer);
        const zip = await JSZip.loadAsync(exported.buffer);
        const names = Object.keys(zip.files).filter((f) => !zip.files[f].dir);
        expect(names).toContain('index.xml');
        expect(names).toContain('m1/us/us-regional.xml');
        expect(names).toContain('util/index-md5.txt');
        const pdfLeaves = names.filter((f) => f.endsWith('.pdf'));
        expect(pdfLeaves.length).toBe(2);
        for (const leaf of pdfLeaves) {
          const bytes = await zip.file(leaf)!.async('nodebuffer');
          expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
        }
        // No dangling references, no checksum mismatches.
        expect(validation.errors).toEqual([]);
        return { files: names.length, pdfLeaves: pdfLeaves.length, zipErrors: validation.errors.length };
      });

      // 2b. The MD5 integrity manifest re-verifies against the shipped bytes,
      //     and backbone leaf IDs are unique (the granuleId-collision guard).
      await R.step('index.xml is conformant and index-md5.txt re-verifies', async () => {
        const zip = await JSZip.loadAsync(exported.buffer);
        const indexXml = await zip.file('index.xml')!.async('string');
        expect(indexXml).toContain('dtd-version="3.2"');
        const ids = [...indexXml.matchAll(/\bID="([^"]+)"/g)].map((m) => m[1]);
        expect(ids.length).toBeGreaterThan(0);
        expect(new Set(ids).size).toBe(ids.length);

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
        expect(lines.some((l) => l.endsWith('  index.xml'))).toBe(true);
        return { leafIds: ids.length, filesInManifest: lines.length, verified };
      });

      // 3. requireComplete passes for the fully materializable dossier.
      await R.step('submission-grade build succeeds for a complete dossier', async () => {
        const pkg = await assembleSubmissionEctd({
          submissionId: 1,
          organizationId: ORG_A,
          userId: USER,
          requireComplete: true,
        });
        return { filename: pkg.filename, complete: pkg.stats.completeness.complete };
      });

      // 4a. The incomplete dossier still BUILDS a draft — the unmaterializable
      //     leaf is surfaced (unresolved + skipped), never silently dropped and
      //     never fabricated into a placeholder.
      const incompleteDraft = await R.step(
        'an incomplete dossier builds a draft with the gap surfaced',
        async () => {
          const pkg = await assembleSubmissionEctd({
            submissionId: 3,
            organizationId: ORG_A,
            userId: USER,
          });
          return {
            materialized: pkg.materialized,
            unresolved: pkg.unresolvedLeaves,
            complete: pkg.stats.completeness.complete,
            bufferBytes: pkg.buffer.length,
          };
        },
      );
      expect(incompleteDraft.materialized).toBe(1);
      expect(incompleteDraft.unresolved).toHaveLength(1);
      expect(incompleteDraft.unresolved[0].documentId).toBe(300); // the ORG_B doc, denied
      expect(incompleteDraft.unresolved[0].reason).toMatch(/not found in this organization/i);
      expect(incompleteDraft.complete).toBe(false);

      // 4b. The completeness gate BLOCKS the incomplete dossier under
      //     requireComplete — the Refuse-to-File guard.
      await R.expectBlocked(
        'submission-grade build is refused for an incomplete dossier (RTF guard)',
        async () => {
          try {
            await assembleSubmissionEctd({
              submissionId: 3,
              organizationId: ORG_A,
              userId: USER,
              requireComplete: true,
            });
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

      // 5. TENANT ISOLATION at the submission boundary: org B cannot export
      //    org A's submission id at all.
      await R.expectBlocked("org B cannot export org A's submission", async () => {
        try {
          await assembleSubmissionEctd({ submissionId: 1, organizationId: ORG_B, userId: USER });
          return { blocked: false };
        } catch (err) {
          return {
            blocked: /not found/i.test(err instanceof Error ? err.message : ''),
            message: err instanceof Error ? err.message : String(err),
          };
        }
      });

      // 6. REGION HONESTY: a requested region contradicting the sequence's
      //    recorded region is refused, never silently honored or ignored.
      await R.expectBlocked('a contradicting requested region is refused', async () => {
        try {
          await assembleSubmissionEctd({
            submissionId: 1,
            organizationId: ORG_A,
            userId: USER,
            region: 'EMA',
          });
          return { blocked: false };
        } catch (err) {
          return {
            blocked: /does not match the sequence's recorded region/.test(
              err instanceof Error ? err.message : '',
            ),
            message: err instanceof Error ? err.message : String(err),
          };
        }
      });

      // 7. An explicit sequence number that does not exist is an error, never a
      //    silent fallback to another sequence.
      await R.expectBlocked('an unknown explicit sequence number is refused', async () => {
        try {
          await assembleSubmissionEctd({
            submissionId: 1,
            organizationId: ORG_A,
            userId: USER,
            sequenceNumber: '0007',
          });
          return { blocked: false };
        } catch (err) {
          return {
            blocked: /sequence 0007 not found/i.test(err instanceof Error ? err.message : ''),
          };
        }
      });

      R.observations.push(
        'Slice-5b consolidation: the legacy ectdExportService (parallel index.xml/regional/md5 ' +
          'generator over ectd_modules/ectd_granules/project_sections, with synthesized ' +
          '"Content Status: PENDING" placeholder leaves) was deleted; this journey now proves the ' +
          'same guarantees on the ONE canonical generator. The completeness gate is now backed by ' +
          'real materialization (a leaf either renders from its source document or is explicitly ' +
          'unresolved) — placeholder fabrication no longer exists to gate.',
      );

      const m = R.manifest();
      expect(m.summary.failed).toBe(0);
    },
    T,
  );
});
