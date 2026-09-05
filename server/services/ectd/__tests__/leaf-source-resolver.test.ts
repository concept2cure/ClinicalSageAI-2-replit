/**
 * Multi-source leaf materialization tests.
 *
 * Proves the silent-drop fix: a leaf backed by `unified_documents` now gets
 * materialized to a real PDF, a leaf backed by an external/binary table
 * (`vault_documents`, `ctd_onboarding_documents`) is reported as UNRESOLVED
 * rather than silently dropped, and the existing `coauthor_documents` path is
 * unchanged. Runs against in-process PGlite (no Neon/docker).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import os from 'os';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));

import { materializeLeafSources, leafSourceKey } from '../leaf-source-resolver';

let harness: IndPgliteDb;
const ORG = 1;
const tmpDirs: string[] = [];
/** Absolute paths of staged upload files (ctd_onboarding_documents.storage_path). */
const uploadPaths: { pdf: string; nonPdf: string; mislabeled: string; missing: string } = {
  pdf: '', nonPdf: '', mislabeled: '', missing: '',
};

async function stage(): Promise<string> {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'leaf-src-'));
  tmpDirs.push(d);
  return d;
}

/** Read the rendered PDF for a leaf source and assert it is a real PDF. */
async function readPdf(stageDir: string, fileName: string): Promise<Buffer> {
  const buf = await fs.readFile(path.join(stageDir, fileName));
  expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  return buf;
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;

  // A coauthor doc (inline HTML content) — the existing, unchanged path.
  await harness.pglite.exec(`
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
    VALUES (1, ${ORG}, 'Coauthor Leaf', '<p>Coauthor body content</p>', '2.5');

    -- A unified doc with body content in a workflow version — the NEW path.
    INSERT INTO unified_documents (id, title, document_type, created_by, organization_id, latest_version)
    VALUES (10, 'Unified Leaf', 'protocol', 'tester', ${ORG}, 2);
    INSERT INTO workflow_document_versions (document_id, version, content, created_by, organization_id)
    VALUES
      (10, 1, '{"type":"doc","content":[{"type":"text","text":"old body"}]}'::json, 'tester', ${ORG}),
      (10, 2, '{"type":"doc","content":[{"type":"text","text":"Unified body v2"}]}'::json, 'tester', ${ORG});

    -- A unified doc with NO version rows — should still render (title fallback).
    INSERT INTO unified_documents (id, title, document_type, created_by, organization_id, latest_version)
    VALUES (11, 'Unified No-Version Leaf', 'summary', 'tester', ${ORG}, 1);
  `);

  // Stage real upload files on disk for the ctd_onboarding_documents leaves.
  const upDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leaf-uploads-'));
  tmpDirs.push(upDir);
  uploadPaths.pdf = path.join(upDir, 'real.pdf');
  uploadPaths.nonPdf = path.join(upDir, 'sheet.doc');
  uploadPaths.mislabeled = path.join(upDir, 'mislabeled.pdf');
  uploadPaths.missing = path.join(upDir, 'gone.pdf'); // deliberately not written
  await fs.writeFile(uploadPaths.pdf, Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'));
  await fs.writeFile(uploadPaths.nonPdf, Buffer.from('PK not a pdf'));
  await fs.writeFile(uploadPaths.mislabeled, Buffer.from('this is plain text, not a pdf'));

  await harness.pglite.exec(`
    -- 50: a genuine PDF upload → materializes AS the leaf.
    INSERT INTO ctd_onboarding_documents (id, organization_id, file_name, mime_type, storage_path)
    VALUES (50, ${ORG}, 'Signed Form 1571.pdf', 'application/pdf', '${uploadPaths.pdf.replace(/'/g, "''")}');
    -- 51: a non-PDF upload (docx) → unresolved (no conversion).
    INSERT INTO ctd_onboarding_documents (id, organization_id, file_name, mime_type, storage_path)
    VALUES (51, ${ORG}, 'notes.doc', 'application/msword', '${uploadPaths.nonPdf.replace(/'/g, "''")}');
    -- 52: mime says PDF but the bytes are not a PDF → unresolved (magic-byte guard).
    INSERT INTO ctd_onboarding_documents (id, organization_id, file_name, mime_type, storage_path)
    VALUES (52, ${ORG}, 'mislabeled.pdf', 'application/pdf', '${uploadPaths.mislabeled.replace(/'/g, "''")}');
    -- 53: mime PDF but the file is missing on disk → unresolved (fail closed).
    INSERT INTO ctd_onboarding_documents (id, organization_id, file_name, mime_type, storage_path)
    VALUES (53, ${ORG}, 'gone.pdf', 'application/pdf', '${uploadPaths.missing.replace(/'/g, "''")}');
  `);
  // PGlite bootstrap can exceed the global 10s hookTimeout when the full
  // suite runs under load; give it explicit headroom.
}, 60_000);

afterAll(async () => {
  await harness.close();
  await Promise.all(tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe('materializeLeafSources', () => {
  it('renders a coauthor_documents leaf to a real PDF (unchanged path)', async () => {
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [{ documentTable: 'coauthor_documents', documentId: 1 }],
      organizationId: ORG,
      stageDir,
    });
    expect(res.materialized).toBe(1);
    expect(res.unresolved).toHaveLength(0);
    const resolved = res.byKey.get(leafSourceKey('coauthor_documents', 1))!;
    expect(resolved).toBeDefined();
    expect(resolved.md5).toMatch(/^[0-9a-f]{32}$/);
    await readPdf(stageDir, resolved.fileName);
  });

  it('counts a materialized-but-draft source as unfinalized (approved is not counted)', async () => {
    await harness.pglite.exec(`
      INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status)
      VALUES
        (200, ${ORG}, 'Approved Leaf', '<p>final</p>', '2.6', 'approved'),
        (201, ${ORG}, 'Draft Leaf',    '<p>wip</p>',   '2.7', 'draft');
    `);
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [
        { documentTable: 'coauthor_documents', documentId: 200 },
        { documentTable: 'coauthor_documents', documentId: 201 },
      ],
      organizationId: ORG,
      stageDir,
    });
    // Both render to PDF; only the draft is unfinalized. Before the fix this was
    // untracked (the completeness call hardcoded unfinalized = 0).
    expect(res.materialized).toBe(2);
    expect(res.unfinalized).toBe(1);
    expect(res.unfinalizedSections.map((s) => s.sectionCode)).toContain('2.7');
    expect(res.unfinalizedSections.every((s) => s.status !== 'approved')).toBe(true);
  });

  it('renders a unified_documents leaf (latest version content) to a real PDF', async () => {
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [{ documentTable: 'unified_documents', documentId: 10 }],
      organizationId: ORG,
      stageDir,
    });
    expect(res.materialized).toBe(1);
    expect(res.unresolved).toHaveLength(0);
    const resolved = res.byKey.get(leafSourceKey('unified_documents', 10))!;
    expect(resolved).toBeDefined();
    // It is a genuine PDF (not silently dropped).
    await readPdf(stageDir, resolved.fileName);
  });

  it('reports a coauthor_documents leaf with no content as UNRESOLVED, not a title-only leaf', async () => {
    // The body fell back to the title here too, so an empty coauthor row
    // rendered its own heading as the whole leaf and still counted complete.
    await harness.pglite.exec(`
      INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status)
      VALUES (300, ${ORG}, 'Empty Coauthor Leaf', NULL, '2.8', 'approved');
    `);
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [{ documentTable: 'coauthor_documents', documentId: 300 }],
      organizationId: ORG,
      stageDir,
    });
    expect(res.materialized).toBe(0);
    expect(res.unresolved).toHaveLength(1);
    expect(res.unresolved[0].reason).toMatch(/no authored content/);
    expect(res.byKey.get(leafSourceKey('coauthor_documents', 300))).toBeUndefined();
  });

  it('reports a unified_documents leaf with no version rows as UNRESOLVED, not a title-only leaf', async () => {
    // This pinned the opposite: the body fell back to `doc.title`, so a
    // document with no version content rendered a PDF whose entire text was its
    // own heading. It counted in `materialized`, appeared in neither
    // `unresolved` nor `skipped`, and with an approved status was not
    // `unfinalized` either — so computeEctdCompleteness returned 100% and a
    // "submission-complete" package shipped a module leaf of one title line.
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [{ documentTable: 'unified_documents', documentId: 11 }],
      organizationId: ORG,
      stageDir,
    });
    expect(res.materialized).toBe(0);
    expect(res.unresolved).toHaveLength(1);
    expect(res.unresolved[0].reason).toMatch(/no version content/);
    expect(res.byKey.get(leafSourceKey('unified_documents', 11))).toBeUndefined();
  });

  it('reports an external vault_documents leaf as UNRESOLVED, never silently dropped', async () => {
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [{ documentTable: 'vault_documents', documentId: 99 }],
      organizationId: ORG,
      stageDir,
    });
    expect(res.materialized).toBe(0);
    expect(res.byKey.size).toBe(0);
    expect(res.unresolved).toHaveLength(1);
    expect(res.unresolved[0].documentTable).toBe('vault_documents');
    expect(res.unresolved[0].documentId).toBe(99);
    expect(res.unresolved[0].reason).toMatch(/external|S3|not stored locally/i);
  });

  it('materializes a PDF ctd_onboarding_documents upload AS the leaf (real bytes, real md5)', async () => {
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [{ documentTable: 'ctd_onboarding_documents', documentId: 50 }],
      organizationId: ORG,
      stageDir,
    });
    expect(res.materialized).toBe(1);
    expect(res.unresolved).toHaveLength(0);
    const resolved = res.byKey.get(leafSourceKey('ctd_onboarding_documents', 50))!;
    expect(resolved).toBeDefined();
    expect(resolved.fileName.endsWith('.pdf')).toBe(true);
    // The staged bytes are the ORIGINAL uploaded PDF (not re-rendered), and md5
    // is over those real bytes.
    const staged = await readPdf(stageDir, resolved.fileName);
    const original = await fs.readFile(uploadPaths.pdf);
    expect(staged.equals(original)).toBe(true);
    expect(resolved.md5).toBe(createHash('md5').update(original).digest('hex'));
  });

  it('leaves a NON-PDF upload unresolved (no binary→PDF conversion)', async () => {
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [{ documentTable: 'ctd_onboarding_documents', documentId: 51 }],
      organizationId: ORG,
      stageDir,
    });
    expect(res.materialized).toBe(0);
    expect(res.unresolved).toHaveLength(1);
    expect(res.unresolved[0].reason).toMatch(/not application\/pdf/i);
  });

  it('leaves a PDF-mime-but-not-PDF-bytes upload unresolved (magic-byte guard)', async () => {
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [{ documentTable: 'ctd_onboarding_documents', documentId: 52 }],
      organizationId: ORG,
      stageDir,
    });
    expect(res.materialized).toBe(0);
    expect(res.unresolved).toHaveLength(1);
    expect(res.unresolved[0].reason).toMatch(/%PDF-|not a valid PDF/i);
  });

  it('leaves a PDF upload whose file is missing unresolved (fail closed)', async () => {
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [{ documentTable: 'ctd_onboarding_documents', documentId: 53 }],
      organizationId: ORG,
      stageDir,
    });
    expect(res.materialized).toBe(0);
    expect(res.unresolved).toHaveLength(1);
    expect(res.unresolved[0].reason).toMatch(/not readable|missing/i);
  });

  it('leaves a cross-tenant ctd_onboarding upload unresolved (org-scoped lookup)', async () => {
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [{ documentTable: 'ctd_onboarding_documents', documentId: 50 }],
      organizationId: 999, // wrong org
      stageDir,
    });
    expect(res.materialized).toBe(0);
    expect(res.unresolved).toHaveLength(1);
    expect(res.unresolved[0].reason).toMatch(/not found in this organization/i);
  });

  it('reports a cross-tenant unified_documents leaf as UNRESOLVED (not dropped)', async () => {
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [{ documentTable: 'unified_documents', documentId: 10 }],
      organizationId: 999, // wrong org
      stageDir,
    });
    expect(res.materialized).toBe(0);
    expect(res.unresolved).toHaveLength(1);
    expect(res.unresolved[0].reason).toMatch(/not found in this organization/i);
  });

  it('resolves a MIXED set: coauthor + unified rendered, vault unresolved', async () => {
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [
        { documentTable: 'coauthor_documents', documentId: 1 },
        { documentTable: 'unified_documents', documentId: 10 },
        { documentTable: 'vault_documents', documentId: 7 },
      ],
      organizationId: ORG,
      stageDir,
    });
    expect(res.materialized).toBe(2);
    expect(res.byKey.size).toBe(2);
    expect(res.unresolved).toHaveLength(1);
    expect(res.unresolved[0].documentTable).toBe('vault_documents');
  });

  it('deduplicates repeated table:id references (renders once)', async () => {
    const stageDir = await stage();
    const res = await materializeLeafSources({
      leaves: [
        { documentTable: 'unified_documents', documentId: 10 },
        { documentTable: 'unified_documents', documentId: 10 },
      ],
      organizationId: ORG,
      stageDir,
    });
    expect(res.materialized).toBe(1);
    expect(res.byKey.size).toBe(1);
  });
});
