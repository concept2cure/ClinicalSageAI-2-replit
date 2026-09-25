/**
 * A vault-backed leaf reaches the device technical file, and a technical file
 * that left a leaf out is not `ready`.
 *
 * 2026-09-23 (W5/D7, round-2 review). The sequence assembler staged a vault
 * leaf by its document_uuid, then built its CoreLeaf list without that field —
 * the same omission 6fed3840b fixed in package-from-core. The staged file
 * resolved to nothing, the plan skipped the leaf ("no resolvable source file"),
 * and the MDR/IVDR ZIP was delivered without the CER. `ready` was the
 * manifest's slot presence, computed before the plan, so the same response
 * could say ready: true about a ZIP that did not hold the document.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import JSZip from 'jszip';
import { createIndPgliteDb, type IndPgliteDb } from '../../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../../db', () => ({ get db() { return holder.db; }, pool: { query: async () => ({ rows: [] }) } }));
vi.mock('../../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));
const PDF = Buffer.from('%PDF-1.4\n% clinical evaluation report\ntrailer<< /Root 1 0 R >>\n%%EOF\n');
vi.mock('../../../storage', () => ({
  ...(() => {
    const testProvider = {
      name: 'test',
      async get() {
        return { bytes: PDF, sizeBytes: PDF.length, sha256: '', mime: 'application/pdf', filename: 'cer.pdf' };
      },
    };
    return {
      getStorageProvider: () => testProvider,
      // The byte reader asks for the store a document was saved in (7fd5d6af).
      getStorageProviderFor: () => testProvider,
    };
  })(),
}));

import { assembleTechnicalFileFromCore } from '../assemble-technical-file-from-core';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const VAULT_DOC = '33333333-3333-4333-8333-333333333333';
/** A uuid no vault row carries: the leaf is placed, its source is not there. */
const MISSING_VAULT_DOC = '44444444-4444-4444-8444-444444444444';

/** Every other required MDR Annex II/III slot, each backed by a coauthor document. */
const OTHER_SLOTS: Array<[string, string]> = [
  ['II.1', 'Section II.1'],
  ['II.2', 'Section II.2'],
  ['II.3', 'Section II.3'],
  ['II.4', 'Section II.4'],
  ['II.5', 'Section II.5'],
  ['II.6.1.a', 'Section II.6.1.a'],
  ['III.1', 'Section III.1'],
];

function leafRows(sequenceId: number, vaultUuid: string): string {
  const others = OTHER_SLOTS.map(
    ([code, title], i) =>
      `(${sequenceId}, '${code}', '${title}', 'new', 'coauthor_documents', ${300 + i}, NULL, ${ORG}, ${USER})`,
  );
  const cer = `(${sequenceId}, 'II.6.1.g', 'Section II.6.1.g', 'new', 'vault_documents', NULL, '${vaultUuid}', ${ORG}, ${USER})`;
  return [...others, cer].join(',\n      ');
}

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  await harness.pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE IF NOT EXISTS regulatory_programs (id UUID PRIMARY KEY, organization_id INTEGER, deleted_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS vault.documents (
      id UUID PRIMARY KEY, program_id UUID NOT NULL, storage_version_id TEXT,
      content_hash TEXT, file_name TEXT, deleted_at TIMESTAMPTZ,
      -- Last, so the positional INSERT below is unchanged. NULL: the reader
      -- (7fd5d6af) then asks getStorageProviderFor for the default store.
      storage_provider TEXT
    );
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}', ${ORG}, NULL);
    INSERT INTO vault.documents VALUES
      ('${VAULT_DOC}', '${PROGRAM}', 'ver-1', '${createHash('sha256').update(PDF).digest('hex')}', 'cer.pdf', NULL);

    INSERT INTO coauthor_documents (id, organization_id, title, content, status, module_number) VALUES
      ${OTHER_SLOTS.map(([code, title], i) => `(${300 + i}, ${ORG}, '${title}', '<p>${code} body</p>', 'approved', '${code}')`).join(',\n      ')};

    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
    VALUES (1, 'MDR TF', 'mdr', 'medtech', 'eu', ${ORG}, ${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by) VALUES
      (1, 1, 'eu', '0000', ${ORG}, ${USER}),
      (2, 1, 'eu', '0001', ${ORG}, ${USER});

    INSERT INTO submission_leaves
      (sequence_id, section_code, title, lifecycle_op, document_table, document_id, document_uuid, organization_id, created_by)
    VALUES
      ${leafRows(1, VAULT_DOC)},
      ${leafRows(2, MISSING_VAULT_DOC)};
  `);
});

afterAll(async () => {
  await harness.close();
});

describe('assembleTechnicalFileFromCore — a vault leaf by document_uuid', () => {
  it('puts the vault CER in the technical-file ZIP instead of skipping it', async () => {
    const r = await assembleTechnicalFileFromCore({
      sequenceId: 1, organizationId: ORG, userId: USER, regulation: 'mdr', applicationId: 'TF-1',
    });
    try {
      expect(r.unresolvedLeaves).toEqual([]);
      expect(r.skipped).toEqual([]);
      const zip = await JSZip.loadAsync(await fs.readFile(r.bundle.path));
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
      const cerEntry = manifest.entries.find((e: any) => e.id === 'clinical-evaluation');
      const cerFiles = Object.keys(zip.files).filter(
        (f) => !zip.files[f].dir && f.startsWith(`${cerEntry.path}/`) && f.endsWith('.pdf'),
      );
      expect(cerFiles).toHaveLength(1);
      expect((await zip.file(cerFiles[0])!.async('nodebuffer')).equals(PDF)).toBe(true);
      // Every required slot is present AND every leaf is in the ZIP.
      expect(r.ready).toBe(true);
    } finally {
      await r.cleanup();
    }
  }, 60_000);

  it('is not ready when a leaf that fills a required slot was left out of the ZIP', async () => {
    const r = await assembleTechnicalFileFromCore({
      sequenceId: 2, organizationId: ORG, userId: USER, regulation: 'mdr', applicationId: 'TF-2',
    });
    try {
      // 2026-09-23 (W5/D7, round-2 skeptic): this asserted manifest.ready ===
      // true — it pinned the defect: the ZIP's own manifest.json said ready
      // and listed the CER 'present' while the ZIP did not hold it. The ZIP's
      // manifest is now reconciled with the plan, so it agrees with r.ready.
      const zip = await JSZip.loadAsync(await fs.readFile(r.bundle.path));
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
      expect(manifest.ready).toBe(false);
      expect(manifest.entries.find((e: any) => e.id === 'clinical-evaluation')).toMatchObject({
        status: 'missing',
        sources: [],
        unresolvedSources: ['II.6.1.g'],
      });
      // The leaf's source is not there, so the ZIP does not hold it.
      expect(r.unresolvedLeaves.map((u) => u.documentUuid)).toEqual([MISSING_VAULT_DOC]);
      expect(r.skipped).toEqual([
        { sectionId: 'clinical-evaluation', source: 'II.6.1.g', reason: 'no resolvable source file for the leaf document' },
      ]);
      expect(r.ready).toBe(false);
    } finally {
      await r.cleanup();
    }
  }, 60_000);
});
