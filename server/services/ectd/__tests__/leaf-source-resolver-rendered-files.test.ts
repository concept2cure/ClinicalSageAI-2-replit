/**
 * `materializeLeafSources` must be able to materialize a leaf that points at
 * bytes this server RENDERED for a filing (`rendered_leaf_files`).
 *
 * ── The defect (LIFE-01) ─────────────────────────────────────────────────────
 * The IND lifecycle routes rendered the 312.32 safety report and the 312.33
 * annual report, kept an md5, and threw the bytes away; the leaf carried no
 * document reference at all, so it was skipped before resolution. Every filed
 * lifecycle sequence assembled with ZERO leaf files and the dispatch gate
 * flagged each leaf UNRESOLVED_DOCUMENT — a permanent block. Run against the
 * tree before this branch existed, the first case here fails with
 * "unsupported document_table \"rendered_leaf_files\"".
 *
 * The bytes live behind the storage provider, which is the only tenant boundary
 * for object bytes (object storage sits outside RLS), so the provider is mocked
 * here and its orgId argument is asserted. Runs on PGlite.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createHash } from 'crypto';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));

/** In-memory storage provider: records every get() so the tenant arg is testable. */
const store = vi.hoisted(() => ({
  objects: new Map<string, { bytes: Buffer; orgId: number }>(),
  gets: [] as Array<{ vaultVersionId: string; orgId: number }>,
}));
vi.mock('../../storage', () => ({
  getStorageProvider: () => ({
    name: 'test',
    async get(vaultVersionId: string, orgId: number) {
      store.gets.push({ vaultVersionId, orgId });
      const hit = store.objects.get(vaultVersionId);
      // The provider's own contract: a foreign org reads as absent, never throws.
      if (!hit || hit.orgId !== orgId) return null;
      return { bytes: hit.bytes, sizeBytes: hit.bytes.length, sha256: '', mime: 'application/pdf', filename: 'f.pdf' };
    },
  }),
}));

import { materializeLeafSources, leafSourceKey } from '../leaf-source-resolver';

let harness: IndPgliteDb;
const ORG = 11;
const OTHER_ORG = 12;
let stageDir = '';

const PDF = Buffer.from('%PDF-1.4\n% filed safety report\ntrailer<< /Root 1 0 R >>\n%%EOF\n', 'utf8');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');

/** Insert a rendered_leaf_files row and register its bytes with the fake store. */
async function seedRendered(opts: {
  org: number;
  vaultVersionId: string;
  bytes: Buffer;
  mime?: string;
  /** Override the recorded digest to simulate bytes that changed after filing. */
  sha256?: string;
  /** Withhold the bytes from the store (a rotated/lost object). */
  withholdBytes?: boolean;
}): Promise<number> {
  const bytes = opts.bytes;
  if (!opts.withholdBytes) store.objects.set(opts.vaultVersionId, { bytes, orgId: opts.org });
  const res = await harness.pglite.query<{ id: number | string }>(
    `INSERT INTO rendered_leaf_files
       (organization_id, vault_version_id, sha256, md5, mime, byte_size, file_name, rendered_from, section_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      opts.org,
      opts.vaultVersionId,
      opts.sha256 ?? sha(bytes),
      md5(bytes),
      opts.mime ?? 'application/pdf',
      bytes.length,
      'ind-safety-report.pdf',
      'ind_safety_report',
      'm1.12.4',
    ],
  );
  return Number(res.rows[0].id);
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  stageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'leaf-src-rendered-'));
});

afterAll(async () => {
  await harness?.close?.();
  if (stageDir) await fs.rm(stageDir, { recursive: true, force: true });
});

beforeEach(() => {
  store.gets.length = 0;
});

const run = (leaves: Array<{ documentTable: string; documentId: number }>) =>
  materializeLeafSources({ leaves, organizationId: ORG, stageDir });

describe('materializeLeafSources — rendered_leaf_files', () => {
  it('materializes the filed bytes and carries the md5 recorded at render time', async () => {
    const id = await seedRendered({ org: ORG, vaultVersionId: 'vv-ok', bytes: PDF });
    const out = await run([{ documentTable: 'rendered_leaf_files', documentId: id }]);

    expect(out.unresolved).toEqual([]);
    const file = out.byKey.get(leafSourceKey('rendered_leaf_files', id));
    expect(file, 'the leaf was not materialized').toBeTruthy();
    // The md5 must be the one recorded when the document was filed — that is
    // what the eCTD index carries — not a value recomputed from a later fetch.
    expect(file!.md5).toBe(md5(PDF));
    expect(await fs.readFile(file!.sourcePath)).toEqual(PDF);
    // The bytes were fetched through the provider's tenant boundary.
    expect(store.gets).toEqual([{ vaultVersionId: 'vv-ok', orgId: ORG }]);
  });

  it("refuses another organization's rendered file — it reads as absent, not as content", async () => {
    const id = await seedRendered({ org: OTHER_ORG, vaultVersionId: 'vv-foreign', bytes: PDF });
    const out = await run([{ documentTable: 'rendered_leaf_files', documentId: id }]);

    expect(out.byKey.size).toBe(0);
    expect(out.unresolved[0].reason).toMatch(/not found in this organization/);
    // Refused on the row read, so no byte fetch was even attempted.
    expect(store.gets).toEqual([]);
  });

  it('refuses bytes that no longer match the digest recorded at render time', async () => {
    const id = await seedRendered({
      org: ORG,
      vaultVersionId: 'vv-altered',
      bytes: PDF,
      sha256: sha(Buffer.from('%PDF-1.4\n% a different document\n%%EOF\n', 'utf8')),
    });
    const out = await run([{ documentTable: 'rendered_leaf_files', documentId: id }]);

    expect(out.byKey.size).toBe(0);
    expect(out.unresolved[0].reason).toMatch(/do not match the sha256 recorded at render time/);
  });

  it('refuses a non-PDF render — the ICSR XML is transmitted, never shipped as a leaf', async () => {
    const xml = Buffer.from('<?xml version="1.0"?><ichicsr/>', 'utf8');
    const id = await seedRendered({ org: ORG, vaultVersionId: 'vv-xml', bytes: xml, mime: 'application/xml' });
    const out = await run([{ documentTable: 'rendered_leaf_files', documentId: id }]);

    expect(out.byKey.size).toBe(0);
    expect(out.unresolved[0].reason).toMatch(/is not application\/pdf/);
  });

  it('refuses when the object is gone — an unretrievable file is a gap, never an empty leaf', async () => {
    const id = await seedRendered({ org: ORG, vaultVersionId: 'vv-lost', bytes: PDF, withholdBytes: true });
    const out = await run([{ documentTable: 'rendered_leaf_files', documentId: id }]);

    expect(out.byKey.size).toBe(0);
    expect(out.unresolved[0].reason).toMatch(/not retrievable from storage/);
  });

  it('refuses bytes whose digest matches but which are not a PDF', async () => {
    const notPdf = Buffer.from('this is not a pdf at all', 'utf8');
    const id = await seedRendered({ org: ORG, vaultVersionId: 'vv-notpdf', bytes: notPdf });
    const out = await run([{ documentTable: 'rendered_leaf_files', documentId: id }]);

    expect(out.byKey.size).toBe(0);
    expect(out.unresolved[0].reason).toMatch(/not a valid PDF/);
  });
});
