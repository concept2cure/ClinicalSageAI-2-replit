/**
 * A later Vault version acts on the leaf its predecessor was filed as.
 *
 * WO-9 §20 (W5/D7) left one decision open: how a revised document reaches a
 * follow-up sequence as a `replace` of what was filed. A declared replace bound
 * by section plus staged file name, and a Vault version's file name carries its
 * own uuid, so version 2 of a filed document never matched version 1's leaf:
 *
 *  1. declared `replace`, it was left out ("no filed leaf named … to supersede");
 *  2. placed as `new` (the placement dialogs' default), it shipped beside the
 *     filed version, and the agency held both as current;
 *  3. a withdrawal naming the current version found no filed leaf "that is this
 *     document" when an earlier version was the one on file;
 *  4. a replace filed under a new name left the version it superseded in the
 *     folded prior state, so the next sequence still held it on file.
 *
 * The Vault records each version's predecessor (VR-08), and the database admits
 * that link only within one document: same program, code and organization, one
 * successor. That recorded lineage is the binding. A link the rules refuse is
 * not lineage, and two filed leaves both carrying earlier versions is ambiguous;
 * neither is guessed.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync, promises as fs } from 'fs';
import JSZip from 'jszip';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
vi.mock('../../../db', () => ({
  get db() { return holder.db; },
  pool: { query: (sql: string, params?: unknown[]) => holder.pglite.query(sql, params) },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));
const pdf = (label: string) => Buffer.from(`%PDF-1.4\n% analytical procedures ${label}\ntrailer<< /Root 1 0 R >>\n%%EOF\n`);
const BYTES: Record<string, Buffer> = { 'ver-1': pdf('v1'), 'ver-2': pdf('v2'), 'ver-3': pdf('v3'), 'ver-x': pdf('x') };
vi.mock('../../storage', () => {
  const provider = {
    name: 'test',
    async get(versionId: string) {
      const bytes = BYTES[versionId];
      return bytes ? { bytes, sizeBytes: bytes.length, sha256: '', mime: 'application/pdf', filename: 'ap.pdf' } : null;
    },
  };
  return { getStorageProvider: () => provider, getStorageProviderFor: () => provider };
});

import { assembleSequence, assembledTransmitBlockers } from '../assemble-from-core';
import { buildLeafManifest } from '../sequence-manifest';
import { loadLatestPriorManifestBySubmission } from '../prior-sequence-loader';
import { leafFileName, leafSourceKey } from '../leaf-source-resolver';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const V1 = 'a1111111-1111-4111-8111-111111111111';
const V2 = 'a2222222-2222-4222-8222-222222222222';
const V3 = 'a3333333-3333-4333-8333-333333333333';
// Names V1 as its predecessor, under another document code: the database guard
// refuses that link, so the family reader does not follow it.
const VX = 'a4444444-4444-4444-8444-444444444444';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const nameOf = (uuid: string) => leafFileName('ap.pdf', leafSourceKey('vault_documents', null, uuid));
const idOf = (uuid: string) => `leaf-3-2-S-4-2-${nameOf(uuid).replace(/\.pdf$/, '')}`;
/** A filed 3.2.S.4.2 leaf, as the packager records it in a sequence's manifest. */
const filed = (uuid: string, extra: Record<string, unknown> = {}) => ({
  ctdSection: 'm3.2.s.4.2', fileName: nameOf(uuid), href: `m3/3-2-s-4-2/${nameOf(uuid)}`,
  md5: 'f'.repeat(32), operation: 'new', leafId: idOf(uuid), backbone: 'index.xml', ...extra,
});

async function indexXmlOf(bundlePath: string): Promise<string> {
  const zip = await JSZip.loadAsync(await fs.readFile(bundlePath));
  return (await zip.file('index.xml')?.async('string')) ?? '';
}

const assemble = (sequenceId: number) =>
  assembleSequence({ sequenceId, organizationId: ORG, userId: USER, applicationId: 'IND-123456', sponsorId: 'S', sponsorName: 'S' });

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  holder.pglite = harness.pglite;
  await harness.pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE IF NOT EXISTS organizations (id INTEGER PRIMARY KEY, settings JSONB NOT NULL DEFAULT '{}'::jsonb);
    CREATE TABLE IF NOT EXISTS regulatory_programs (id UUID PRIMARY KEY, organization_id INTEGER, deleted_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS vault.documents (
      id UUID PRIMARY KEY, program_id UUID NOT NULL, storage_version_id TEXT, storage_provider TEXT,
      content_hash TEXT, file_name TEXT, deleted_at TIMESTAMPTZ,
      organization_id INTEGER, supersedes_id UUID, document_code TEXT
    );
    CREATE TABLE IF NOT EXISTS ectd_compilations (
      id SERIAL PRIMARY KEY, organization_id INTEGER, submission_id INTEGER, compilation_type TEXT,
      sequence_number TEXT, leaf_manifest JSONB, compiled_at TIMESTAMP DEFAULT NOW()
    );
    INSERT INTO organizations (id) VALUES (${ORG});
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}', ${ORG}, NULL);
    INSERT INTO vault.documents (id, program_id, storage_version_id, content_hash, file_name, organization_id, supersedes_id, document_code) VALUES
      ('${V1}', '${PROGRAM}', 'ver-1', '${sha(BYTES['ver-1'])}', 'ap.pdf', ${ORG}, NULL,     'AP-001'),
      ('${V2}', '${PROGRAM}', 'ver-2', '${sha(BYTES['ver-2'])}', 'ap.pdf', ${ORG}, '${V1}', 'AP-001'),
      ('${V3}', '${PROGRAM}', 'ver-3', '${sha(BYTES['ver-3'])}', 'ap.pdf', ${ORG}, '${V2}', 'AP-001'),
      ('${VX}', '${PROGRAM}', 'ver-x', '${sha(BYTES['ver-x'])}', 'ap.pdf', ${ORG}, '${V1}', 'OTHER-002');

    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id) VALUES
      (1, 'declared replace', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}'),
      (2, 'placed as new',    'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}'),
      (3, 'two on file',      'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}'),
      (4, 'withdraw',         'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}'),
      (5, 'refused link',     'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}'),
      (6, 'two versions',     'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}'),
      (7, 'delete and new',   'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}'),
      (8, 'beside its own',   'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}'),
      (9, 'new and delete',   'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}'),
      (10, 'declared append', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}');
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by, dispatch_status) VALUES
      (1, 1, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (2, 1, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (3, 2, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (4, 2, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (5, 3, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (6, 3, 'fda', '0001', ${ORG}, ${USER}, 'sent'),
      (7, 3, 'fda', '0002', ${ORG}, ${USER}, NULL),
      (8, 4, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (9, 4, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (10, 5, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (11, 5, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (12, 6, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (13, 6, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (14, 7, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (15, 7, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (16, 8, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (17, 8, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (18, 9, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (19, 9, 'fda', '0001', ${ORG}, ${USER}, NULL),
      (20, 10, 'fda', '0000', ${ORG}, ${USER}, 'sent'), (21, 10, 'fda', '0001', ${ORG}, ${USER}, NULL);
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_uuid, organization_id, created_by) VALUES
      (2,  'm3.2.s.4.2', 'Analytical procedures', 'replace', 'vault_documents', '${V2}', ${ORG}, ${USER}),
      (4,  'm3.2.s.4.2', 'Analytical procedures', 'new',     'vault_documents', '${V2}', ${ORG}, ${USER}),
      (7,  'm3.2.s.4.2', 'Analytical procedures', 'replace', 'vault_documents', '${V3}', ${ORG}, ${USER}),
      (9,  'm3.2.s.4.2', 'Analytical procedures', 'delete',  'vault_documents', '${V2}', ${ORG}, ${USER}),
      (11, 'm3.2.s.4.2', 'Analytical procedures', 'replace', 'vault_documents', '${VX}', ${ORG}, ${USER}),
      (13, 'm3.2.s.4.2', 'Analytical procedures', 'replace', 'vault_documents', '${V2}', ${ORG}, ${USER}),
      (13, 'm3.2.s.4.2', 'Analytical procedures', 'replace', 'vault_documents', '${V3}', ${ORG}, ${USER}),
      (15, 'm3.2.s.4.2', 'Analytical procedures', 'delete',  'vault_documents', '${V1}', ${ORG}, ${USER}),
      (15, 'm3.2.s.4.2', 'Analytical procedures', 'new',     'vault_documents', '${V2}', ${ORG}, ${USER}),
      (17, 'm3.2.s.4.2', 'Analytical procedures', 'append',  'vault_documents', '${V1}', ${ORG}, ${USER}),
      (17, 'm3.2.s.4.2', 'Analytical procedures', 'replace', 'vault_documents', '${V2}', ${ORG}, ${USER}),
      (19, 'm3.2.s.4.2', 'Analytical procedures', 'new',     'vault_documents', '${V2}', ${ORG}, ${USER}),
      (19, 'm3.2.s.4.2', 'Analytical procedures', 'delete',  'vault_documents', '${V1}', ${ORG}, ${USER}),
      (21, 'm3.2.s.4.2', 'Analytical procedures', 'append',  'vault_documents', '${V2}', ${ORG}, ${USER});
  `);
  // Every submission filed version 1 in 0000. Submission 3 then filed version 2
  // beside it as `new` in 0001, as the product did before this binding existed,
  // so two filed leaves carry earlier versions of version 3.
  await harness.pglite.query(
    `INSERT INTO ectd_compilations (organization_id, submission_id, sequence_number, leaf_manifest) VALUES
       ($1, 1, '0000', $2), ($1, 2, '0000', $2), ($1, 3, '0000', $2), ($1, 3, '0001', $3), ($1, 4, '0000', $2), ($1, 5, '0000', $2),
       ($1, 6, '0000', $2), ($1, 7, '0000', $2), ($1, 8, '0000', $2), ($1, 9, '0000', $2), ($1, 10, '0000', $2)`,
    [ORG, JSON.stringify([filed(V1)]), JSON.stringify([filed(V2)])],
  );
  await harness.pglite.exec(readFileSync(new URL('../../../../migrations/20261006_document_data_dispositions.sql', import.meta.url), 'utf8'));
});

afterAll(async () => {
  await harness.close();
});

describe('a later Vault version, on a filed one: what it binds to', () => {
  it('files a declared replace against the leaf its predecessor was filed as', async () => {
    const r = await assemble(2);
    try {
      expect(r.skipped).toEqual([]);
      const xml = await indexXmlOf(r.bundle.path);
      expect(xml).toMatch(/operation="replace"/);
      expect(xml).toContain(`modified-file="../0000/index.xml#${idOf(V1)}"`);
      // The new version ships under its own name; what was filed stays as filed.
      expect(xml).toContain(`xlink:href="m3/3-2-s-4-2/${nameOf(V2)}"`);
      expect(assembledTransmitBlockers(r).filter((b) => /could not be packaged/.test(b))).toEqual([]);
    } finally {
      await r.cleanup();
    }
  });

  it('files a declared append against the leaf its predecessor was filed as', async () => {
    const r = await assemble(21);
    try {
      expect(r.skipped).toEqual([]);
      const xml = await indexXmlOf(r.bundle.path);
      expect(xml).toMatch(new RegExp(`<leaf operation="append" modified-file="\\.\\./0000/index\\.xml#${idOf(V1)}"`));
      expect(xml).toContain(`xlink:href="m3/3-2-s-4-2/${nameOf(V2)}"`);
    } finally {
      await r.cleanup();
    }
  });

  it('never files it beside the filed version: placed as new, it is the replace of its predecessor', async () => {
    const r = await assemble(4);
    try {
      expect(r.skipped).toEqual([]);
      const xml = await indexXmlOf(r.bundle.path);
      expect(xml).not.toMatch(/operation="new"[^>]*3-2-s-4-2/);
      expect(xml).toContain(`modified-file="../0000/index.xml#${idOf(V1)}"`);
    } finally {
      await r.cleanup();
    }
  });

  it('binds a withdrawal naming the current version to the filed earlier version', async () => {
    const r = await assemble(9);
    try {
      expect(r.skipped).toEqual([]);
      const xml = await indexXmlOf(r.bundle.path);
      expect(xml).toMatch(/operation="delete"/);
      expect(xml).toContain(`modified-file="../0000/index.xml#${idOf(V1)}"`);
    } finally {
      await r.cleanup();
    }
  });

  // The leaves are read in the order they were placed; either may come first.
  it.each([
    ['the withdrawal placed first', 15],
    ['the new version placed first', 19],
  ])('files the delete-and-new the author declared, %s: a version whose predecessor this sequence withdraws binds nothing', async (_order, sequenceId) => {
    const r = await assemble(sequenceId);
    try {
      expect(r.skipped).toEqual([]);
      const xml = await indexXmlOf(r.bundle.path);
      expect(xml).toMatch(new RegExp(`<leaf operation="delete" modified-file="\\.\\./0000/index\\.xml#${idOf(V1)}"`));
      expect(xml).toMatch(new RegExp(`<leaf operation="new" [^>]*xlink:href="m3/3-2-s-4-2/${nameOf(V2).replace(/\./g, '\\.')}"`));
      expect(xml).not.toMatch(/operation="replace"/);
    } finally {
      await r.cleanup();
    }
  });

  it('leaves only the new version on file once the replace is filed', async () => {
    const r = await assemble(2);
    let manifest: ReturnType<typeof buildLeafManifest>;
    try {
      manifest = buildLeafManifest(r.bundle.leafManifest ?? []);
    } finally {
      await r.cleanup();
    }
    expect(manifest).toEqual([
      expect.objectContaining({ fileName: nameOf(V2), operation: 'replace', modifiedFile: `../0000/index.xml#${idOf(V1)}` }),
    ]);
    await harness.pglite.query(
      `INSERT INTO ectd_compilations (organization_id, submission_id, sequence_number, leaf_manifest) VALUES ($1, 1, '0001', $2)`,
      [ORG, JSON.stringify(manifest)],
    );
    await harness.pglite.query(`UPDATE ectd_sequences SET dispatch_status = 'sent' WHERE id = 2`);
    const prior = await loadLatestPriorManifestBySubmission(
      { query: (sql, params) => harness.pglite.query(sql, params) as any },
      { organizationId: ORG, submissionId: 1, currentSequence: '0002' },
    );
    expect(prior.priorSequenceNumber).toBe('0001');
    expect(prior.leaves.map((l) => l.fileName)).toEqual([nameOf(V2)]);
    expect(prior.leaves[0]).toMatchObject({ sequenceNumber: '0001' });
  });
});

describe('a later Vault version, on a filed one: what is never guessed', () => {
  it('refuses to choose when two filed leaves carry earlier versions of it', async () => {
    const r = await assemble(7);
    try {
      expect(await indexXmlOf(r.bundle.path)).not.toContain(nameOf(V3));
      expect(r.skipped).toEqual([
        expect.objectContaining({ sectionCode: 'm3.2.s.4.2', reason: expect.stringMatching(/2 filed leaves in m3\.2\.s\.4\.2 carry earlier versions/) }),
      ]);
    } finally {
      await r.cleanup();
    }
  });

  it('refuses both when two versions of one document in a sequence supersede the same filed leaf, never picking one', async () => {
    const r = await assemble(13);
    try {
      const xml = await indexXmlOf(r.bundle.path);
      expect(xml).not.toContain(nameOf(V2));
      expect(xml).not.toContain(nameOf(V3));
      expect(r.skipped).toEqual([
        expect.objectContaining({ sectionCode: 'm3.2.s.4.2', reason: expect.stringMatching(/2 versions of this document in this sequence supersede /) }),
        expect.objectContaining({ sectionCode: 'm3.2.s.4.2', reason: expect.stringMatching(/2 versions of this document in this sequence supersede /) }),
      ]);
    } finally {
      await r.cleanup();
    }
  });

  it('refuses a version placed beside an act on its own filed predecessor', async () => {
    const r = await assemble(17);
    try {
      expect(await indexXmlOf(r.bundle.path)).not.toContain(nameOf(V2));
      expect(r.skipped).toEqual(expect.arrayContaining([
        expect.objectContaining({ sectionCode: 'm3.2.s.4.2', reason: expect.stringMatching(/^declared replace: this sequence also acts on .*, the filed earlier version of this document/) }),
      ]));
    } finally {
      await r.cleanup();
    }
  });

  it('does not follow a link the database rules refuse', async () => {
    const r = await assemble(11);
    try {
      expect(await indexXmlOf(r.bundle.path)).not.toMatch(/operation="replace"/);
      expect(r.skipped).toEqual([
        expect.objectContaining({ sectionCode: 'm3.2.s.4.2', reason: expect.stringMatching(/^declared replace: no filed leaf named /) }),
      ]);
    } finally {
      await r.cleanup();
    }
  });
});
