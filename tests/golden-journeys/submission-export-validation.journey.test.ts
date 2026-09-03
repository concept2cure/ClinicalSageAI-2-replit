/**
 * Golden Journey — eCTD export → reopen → external-validator qualification.
 *
 * This journey closes the highest, weakest tiers of the proof hierarchy
 * (docs/architecture/PROOF_HIERARCHY.md, tiers 6-7) while exercising tiers 3-4
 * (real-DB integration + tenant isolation) along the way. Every other eCTD test in
 * the tree either (a) drives an INTERNAL validator over a HAND-AUTHORED fixture
 * directory (`{ 'index.xml': '<ectd/>' }`), or (b) asserts on assemble counts
 * (`materialized`, `unresolvedLeaves`) WITHOUT reopening the emitted bytes. Both
 * leave the platform's own backbone XML "handcrafted, checked only by our own
 * eyes." That is the exact gap this journey exists to close.
 *
 * It runs the REAL assembler over the REAL canonical core on in-process
 * Postgres (PGlite): `assembleSequence` reads tenant-scoped `submission_leaves`,
 * renders each leaf to a genuine PDF via pure `pdf-lib`, and drives the live
 * `packageEctdSubmission` publisher — producing a real eCTD tree on disk
 * (backbone `index.xml`, regional `m1/us/us-regional.xml`, the MD5 integrity
 * index `util/index-md5.txt`, and PDF leaves). Nothing about the packaging is
 * stubbed; only `db` (redirected to PGlite) and `auditService` are mocked.
 *
 * What it proves, in the order an auditor would ask:
 *   assemble (real publisher, real DB)
 *     → TENANT ISOLATION: a leaf pointing at another org's document is denied at
 *       the DB boundary (surfaced as unresolved) and never enters the package
 *     → REOPEN: the emitted tree parses as XML, every backbone leaf href resolves
 *       to a file on disk, every PDF leaf carries the %PDF magic
 *     → INTEGRITY: every entry in util/index-md5.txt matches the on-disk bytes it
 *       claims (the eCTD checksum contract), re-derived from the reopened files
 *     → EXTERNAL QUALIFICATION: the emitted backbone XML is validated by REAL
 *       libxml2 (xmllint — the parser class agency tooling uses), and the
 *       license-free FDA-criteria eValidator subset passes the whole package with
 *       zero error findings
 *     → NON-VACUOUS: a tampered reopen (0-byte leaf; deleted regional backbone;
 *       malformed backbone XML) is CAUGHT — by the checksum re-verification, by
 *       libxml2, AND by the external validator.
 *
 * HONEST SCOPE (recorded in the manifest limitations): the FDA-criteria subset
 * is NOT the licensed LORENZ agency validator. Passing it raises the validation
 * floor and proves our export survives an EXTERNAL reopen-and-check, but it is
 * not agency acceptance. Swapping in LORENZ behind the same seam
 * (EVALIDATOR_BINARY) upgrades this journey to full agency-grade qualification
 * with no test rewrite.
 *
 * Output: tests/golden-journeys/__reports__/submission-export-validation.{manifest.json,report.md}
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { parseStringPromise } from 'xml2js';
import { checkWellFormed, isXmllintAvailable } from '../../server/services/ectd/xml-validator';
import { JourneyRecorder, assertNoSchemaGaps, assertNoDegradedTenantEnrichment } from './harness';

const T = 180_000;

// The assembler + publisher chain reads `db` from server/db; redirect it to an
// in-process PGlite instance. vi.mock is hoisted, so the holder must be too.
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
// Audit writes are not the subject under test; silence them (the assembler still
// calls logAction, proving the audited path executes end-to-end).
vi.mock('../../server/services/auditService', () => ({
  default: { logAction: vi.fn(async () => {}) },
}));

import { createIndPgliteDb, type IndPgliteDb } from '../../server/db/pglite-harness';
import { assembleSequence } from '../../server/services/ectd/assemble-from-core';
import {
  resolveExternalValidator,
  validateFdaCriteria,
} from '../../server/services/ectd/external-validator';

const ORG = 42;
const OTHER_ORG = 43;
const USER = 7;

const R = new JourneyRecorder(
  'Golden Journey — eCTD export → reopen → external-validator qualification',
  'Assemble a real eCTD package from the canonical core, reopen the emitted ' +
    'bytes from disk, re-verify the MD5 integrity manifest, and qualify the ' +
    'package with an external (FDA-criteria) eValidator. Proves the platform ' +
    'backbone XML survives an external reopen-and-check — not just our own eyes.',
  // Honest provenance: this journey provisions its DB from the IND PGlite
  // harness DDL constants, NOT the governance-boundary migration files.
  [
    'server/db/pglite-harness.ts#SUBMISSION_CORE_PGLITE_DDL',
    'server/db/pglite-harness.ts#LEAF_SOURCE_PGLITE_DDL',
  ],
);

let harness: IndPgliteDb;
let packageDir = '';
let cleanup: (() => Promise<void>) | null = null;
const tempDirs: string[] = [];

/** Env the external-validator resolver reads; saved/restored around the run. */
const savedEnv: Record<string, string | undefined> = {};
function stashEnv(...keys: string[]) {
  for (const k of keys) savedEnv[k] = process.env[k];
}

/** Recursively list files under a dir as package-relative POSIX paths. */
async function walkRel(root: string, rel = ''): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
  for (const e of entries) {
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkRel(root, childRel)));
    else out.push(childRel);
  }
  return out;
}

async function md5OfFile(abs: string): Promise<string> {
  return createHash('md5').update(await fs.readFile(abs)).digest('hex');
}

/** Parse util/index-md5.txt → [{ md5, rel }]. Lines are `${md5}  ${relPath}`. */
function parseMd5Index(text: string): Array<{ md5: string; rel: string }> {
  return text
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const sep = line.indexOf('  ');
      return { md5: line.slice(0, sep), rel: line.slice(sep + 2) };
    });
}

/** Copy the clean package to a fresh temp dir so negative tampering is isolated. */
async function copyPackage(): Promise<string> {
  const dst = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-tamper-'));
  tempDirs.push(dst);
  await fs.cp(packageDir, dst, { recursive: true });
  return dst;
}

beforeAll(async () => {
  stashEnv('EVALIDATOR_USE_FDA_CRITERIA_FALLBACK', 'EVALIDATOR_BINARY', 'EVALIDATOR_ENDPOINT');
  // Deterministic resolver: no LORENZ binary/endpoint, FDA-criteria subset on.
  delete process.env.EVALIDATOR_BINARY;
  delete process.env.EVALIDATOR_ENDPOINT;
  process.env.EVALIDATOR_USE_FDA_CRITERIA_FALLBACK = 'true';

  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;

  // Seed a real FDA IND sequence with two locally-renderable leaves (M2 + M3)
  // and one cross-tenant leaf that MUST NOT be assembled into this org's package.
  await harness.pglite.exec(`
    INSERT INTO submissions (id, title, product_name, application_type, client_type, primary_region, organization_id, created_by)
    VALUES (1, 'C2C Export Journey', 'Examplinib', 'ind', 'biotech', 'fda', ${ORG}, ${USER});

    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
    VALUES (1, 1, 'fda', '0000', ${ORG}, ${USER});

    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
    VALUES (100, ${ORG}, 'Clinical Overview', '<h1>Clinical Overview</h1><p>Benefit-risk narrative.</p>', '2.5');

    INSERT INTO unified_documents (id, title, document_type, created_by, organization_id, latest_version)
    VALUES (200, 'Drug Substance', 'summary', 'tester', ${ORG}, 1);
    INSERT INTO workflow_document_versions (document_id, version, content, created_by, organization_id)
    VALUES (200, 1, '{"type":"doc","content":[{"type":"text","text":"Drug substance specification."}]}'::json, 'tester', ${ORG});

    -- A same-id document in a DIFFERENT org: proves tenant scoping on assemble.
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
    VALUES (300, ${OTHER_ORG}, 'Other-Tenant Secret', '<p>must never appear</p>', '2.5');

    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by)
    VALUES
      (1, '2.5',   'Clinical Overview', 'new', 'coauthor_documents', 100, ${ORG}, ${USER}),
      (1, '3.2.s', 'Drug Substance',    'new', 'unified_documents',  200, ${ORG}, ${USER}),
      -- Attack shape: a leaf in THIS org's sequence pointing at document id 300,
      -- which belongs to OTHER_ORG. The resolver must deny it at the DB boundary.
      (1, '5.3.5', 'Cross-Tenant Study Report', 'new', 'coauthor_documents', 300, ${ORG}, ${USER});
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
    R.write('submission-export-validation');
  } finally {
    for (const k of Object.keys(savedEnv)) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    if (cleanup) await cleanup().catch(() => {});
    for (const d of tempDirs) await fs.rm(d, { recursive: true, force: true }).catch(() => {});
    if (harness) await harness.close();
  }
});

describe('eCTD export → reopen → external-validator qualification', () => {
  R.limitations.push(
    'External qualification uses the license-free FDA-criteria eValidator SUBSET, ' +
      'not the commercial LORENZ agency validator. Passing it proves the export ' +
      'survives an external reopen-and-check; it is NOT agency acceptance. ' +
      'LORENZ drops in behind the same seam (EVALIDATOR_BINARY) with no test change.',
  );
  R.limitations.push(
    'Leaf PDFs are pure pdf-lib TEXT renderings (deterministic → stable md5), ' +
      'not high-fidelity PDF/A-1b. PDF/A conformance is a separate gate ' +
      '(ectd/pdfa-readiness.ts) exercised elsewhere.',
  );

  it(
    'assembles a real package, reopens it, re-verifies checksums, and qualifies it externally',
    async () => {
      // ── Tier: DB integration + assemble (real publisher over real core) ──────
      const assembled = await R.step('assemble-sequence-from-canonical-core', async () => {
        const result = await assembleSequence({
          sequenceId: 1,
          organizationId: ORG,
          userId: USER,
          applicationId: 'ind-000000',
          sponsorId: 'spon-1',
          sponsorName: 'Acme Bio',
          emitUnzipped: true,
        });
        cleanup = result.cleanup;
        // The unzipped tree sits alongside the zip: <zip path> minus ".zip".
        packageDir = result.bundle.path.replace(/\.zip$/, '');
        return {
          materialized: result.materialized,
          unresolved: result.unresolvedLeaves.length,
          unresolvedDetail: result.unresolvedLeaves as Array<{
            documentTable: string;
            documentId: number;
            reason: string;
          }>,
          skipped: result.skipped.length,
          zipPath: path.basename(result.bundle.path),
          sha256: result.bundle.sha256.slice(0, 16),
        };
      });
      expect(assembled.materialized).toBe(2); // the two same-org leaves
      expect(assembled.unresolved).toBe(1); // the cross-tenant leaf, denied
      expect(packageDir).not.toBe('');

      // ── Tier: tenant isolation — the cross-org leaf is denied at the DB boundary ─
      await R.step('tenant-isolation-cross-tenant-leaf-denied', async () => {
        const denied = assembled.unresolvedDetail;
        expect(denied).toHaveLength(1);
        expect(denied[0].documentId).toBe(300); // the OTHER_ORG document
        expect(denied[0].documentTable).toBe('coauthor_documents');
        // Denied because the org-scoped lookup found no such row in THIS org —
        // not because of an app-layer check that a bug could bypass.
        expect(denied[0].reason).toMatch(/not found in this organization/i);
        // And it never leaked into the emitted package (no leaf carries id 300).
        const files = await walkRel(packageDir);
        expect(files.some((f) => f.includes('300'))).toBe(false);
        return { deniedDocumentId: 300, reason: denied[0].reason, leakedToPackage: false };
      });

      // ── Tier: export reopen — the emitted tree exists and has the eCTD spine ─
      const tree = await R.step('reopen-emitted-package-tree', async () => {
        const stat = await fs.stat(packageDir);
        expect(stat.isDirectory()).toBe(true);
        const files = await walkRel(packageDir);
        const has = (p: string) => files.includes(p);
        expect(has('index.xml')).toBe(true); // ICH M2-M5 backbone
        expect(has('util/index-md5.txt')).toBe(true); // integrity manifest
        expect(has('m1/us/us-regional.xml')).toBe(true); // FDA regional backbone
        const leafPdfs = files.filter((f) => f.endsWith('.pdf'));
        expect(leafPdfs.length).toBe(2);
        return { fileCount: files.length, files, leafPdfs };
      });

      // ── Tier: export reopen — the backbone XML PARSES and its hrefs resolve ──
      await R.step('reopen-parse-backbone-xml-and-resolve-hrefs', async () => {
        const indexRaw = await fs.readFile(path.join(packageDir, 'index.xml'), 'utf8');
        const regionalRaw = await fs.readFile(path.join(packageDir, 'm1/us/us-regional.xml'), 'utf8');
        // parseStringPromise REJECTS on malformed XML — a real reopen-parse, not a regex.
        const indexDoc = await parseStringPromise(indexRaw);
        await parseStringPromise(regionalRaw);
        expect(indexDoc['ectd:ectd']).toBeTruthy();
        expect(indexDoc['ectd:ectd'].$['dtd-version']).toBe('3.2');

        // Every leaf href in the backbone must resolve to a real file on disk —
        // the backbone-to-bytes correspondence a validator relies on.
        const hrefs = Array.from(indexRaw.matchAll(/xlink:href="([^"]+)"/g)).map((m) => m[1]);
        expect(hrefs.length).toBe(2);
        for (const href of hrefs) {
          const abs = path.join(packageDir, href);
          await fs.access(abs); // throws → step fails
        }
        return { dtdVersion: '3.2', leafHrefs: hrefs };
      });

      // ── Tier: external validator qualification — REAL libxml2 (xmllint) ──────
      // The sharpest answer to "handcrafted XML, checked only by our own eyes":
      // the emitted backbone is validated by libxml2 — the parser class agency
      // eCTD tooling uses — not our JS parser. Uses the platform's own seam
      // (server/services/ectd/xml-validator.ts), fail-open by capability.
      await R.step('external-xml-validator-qualifies-backbone', async () => {
        const xmllintPresent = await isXmllintAvailable();
        const idx = await checkWellFormed(path.join(packageDir, 'index.xml'), true);
        const reg = await checkWellFormed(path.join(packageDir, 'm1/us/us-regional.xml'), true);
        if (xmllintPresent) {
          expect(idx.ran).toBe(true);
          expect(idx.valid, `index.xml not well-formed per libxml2: ${idx.errors[0] ?? ''}`).toBe(true);
          expect(reg.ran).toBe(true);
          expect(reg.valid, `us-regional.xml not well-formed per libxml2: ${reg.errors[0] ?? ''}`).toBe(true);
        } else {
          // Honest: fail-open by capability — recorded, never silently passed.
          R.limitations.push(
            'xmllint absent in this run — libxml2 XML validation reported ran:false ' +
              '(fail-open by capability, per the xml-validator seam).',
          );
        }
        return {
          validator: 'xmllint/libxml2',
          xmllintPresent,
          indexValid: idx.valid,
          regionalValid: reg.valid,
        };
      });

      // ── Non-vacuous: libxml2 catches a malformed backbone (gate isn't empty) ─
      await R.expectBlocked('malformed-backbone-is-caught-by-libxml2', async () => {
        if (!(await isXmllintAvailable())) return { blocked: true, skipped: 'xmllint absent' };
        const badDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ectd-badxml-'));
        tempDirs.push(badDir);
        const badPath = path.join(badDir, 'index.xml');
        // Mismatched tags: <leaf> opened, </m3> closes its parent → not well-formed.
        await fs.writeFile(
          badPath,
          '<?xml version="1.0"?>\n<ectd:ectd xmlns:ectd="http://www.ich.org/ectd"><m3><leaf></m3></ectd:ectd>',
        );
        const r = await checkWellFormed(badPath, true);
        return { blocked: r.ran && !r.valid, ran: r.ran, valid: r.valid, error: r.errors[0] };
      });

      // ── Tier: export reopen — every PDF leaf is a genuine PDF (magic bytes) ──
      await R.step('reopen-verify-pdf-leaf-magic', async () => {
        const verified: Record<string, string> = {};
        for (const rel of tree.leafPdfs as string[]) {
          const buf = await fs.readFile(path.join(packageDir, rel));
          expect(buf.length).toBeGreaterThan(0); // no empty leaf
          expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
          verified[rel] = `${buf.length}B`;
        }
        return { leaves: verified };
      });

      // ── Tier: export reopen — MD5 integrity manifest matches on-disk bytes ───
      const integrity = await R.step('reopen-reverify-md5-integrity-manifest', async () => {
        const idxRaw = await fs.readFile(path.join(packageDir, 'util/index-md5.txt'), 'utf8');
        const entries = parseMd5Index(idxRaw);
        expect(entries.length).toBeGreaterThanOrEqual(3); // index.xml + regional + 2 leaves
        const covered = new Set(entries.map((e) => e.rel));
        expect(covered.has('index.xml')).toBe(true);
        expect(covered.has('m1/us/us-regional.xml')).toBe(true);
        // Re-derive each recorded md5 from the reopened bytes — the eCTD contract.
        for (const { md5, rel } of entries) {
          const actual = await md5OfFile(path.join(packageDir, rel));
          expect(actual).toBe(md5);
        }
        return { manifestEntries: entries.length, allMatch: true };
      });
      expect(integrity.allMatch).toBe(true);

      // ── Tier: external validator qualification — our REAL export passes ──────
      const qualified = await R.step('external-validator-qualifies-real-export', async () => {
        const validator = await resolveExternalValidator();
        // Deterministic resolution: no LORENZ configured → FDA-criteria subset.
        expect(validator.name).toBe('fda-criteria-subset');
        const report = await validator.validate({ packageDir, region: 'fda' });
        expect(report.ran).toBe(true);
        expect(report.errorCount).toBe(0);
        expect(report.passed).toBe(true);
        // Honest scoping is always present and never blocks.
        const ids = report.findings.map((f) => f.ruleId);
        expect(ids).toContain('C2C-SUBSET-NOTICE');
        return {
          validator: report.validator,
          profile: report.profile,
          errorCount: report.errorCount,
          warningCount: report.warningCount,
          passed: report.passed,
        };
      });
      expect(qualified.passed).toBe(true);

      // ── Non-vacuous #1: a 0-byte leaf is CAUGHT (checksum + external) ────────
      await R.expectBlocked('tampered-empty-leaf-is-caught', async () => {
        const dir = await copyPackage();
        const leafRel = (tree.leafPdfs as string[])[0];
        await fs.writeFile(path.join(dir, leafRel), ''); // truncate a leaf to 0 bytes

        // (a) the reopened checksum manifest no longer matches the bytes.
        const entries = parseMd5Index(await fs.readFile(path.join(dir, 'util/index-md5.txt'), 'utf8'));
        const recorded = entries.find((e) => e.rel === leafRel)!;
        const nowMd5 = await md5OfFile(path.join(dir, leafRel));
        const checksumBroke = nowMd5 !== recorded.md5;

        // (b) the external validator reports it as an error → package fails.
        const report = await validateFdaCriteria({ packageDir: dir, region: 'fda' });
        const emptyFinding = report.findings.find((f) => f.ruleId === 'FDA-EMPTY-FILE');
        return {
          blocked: checksumBroke && !report.passed && !!emptyFinding,
          checksumBroke,
          externalPassed: report.passed,
          finding: emptyFinding?.ruleId,
          leaf: emptyFinding?.leafHref,
        };
      });

      // ── Non-vacuous #2: a missing regional backbone is CAUGHT externally ─────
      await R.expectBlocked('missing-regional-backbone-is-caught', async () => {
        const dir = await copyPackage();
        await fs.rm(path.join(dir, 'm1/us/us-regional.xml'));
        const report = await validateFdaCriteria({ packageDir: dir, region: 'fda' });
        const finding = report.findings.find((f) => f.ruleId === 'FDA-REGIONAL-BACKBONE-MISSING');
        return { blocked: !report.passed && !!finding, externalPassed: report.passed, finding: finding?.ruleId };
      });

      R.observations.push(
        `Real FDA IND export: ${tree.fileCount} files, ${integrity.manifestEntries} checksummed, ` +
          `external validator "${qualified.validator}" passed with ${qualified.errorCount} errors.`,
      );
    },
    T,
  );
});
