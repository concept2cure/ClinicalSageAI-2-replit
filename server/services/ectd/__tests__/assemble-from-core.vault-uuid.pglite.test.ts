/**
 * A vault-backed leaf reaches the package; what assembly leaves out, or ships
 * unapproved, is a transmit blocker.
 *
 * 2026-09-22 (W5/D7). Assembly resolved vault leaves by documentUuid, but
 * package-from-core built its leaf list without that field. The staged vault
 * file resolved to nothing, the leaf landed in `skipped` — AFTER being staged,
 * so it was never `unresolved` either — and transmit, which read only
 * `unresolvedLeaves`, sent the sequence without the document and recorded
 * ECTD_TRANSMITTED. A draft coauthor leaf was counted in `unfinalized`, and
 * that count was also read by no one on the transmit path.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync, promises as fs } from 'fs';
import JSZip from 'jszip';
import { plainPdfFixture } from './support/signed-pdf-fixture';
import { syncCompanyLegalRegistry } from '../../company-documents/legal-registry';
import type { CompanyLegalDocument } from '../../../../shared/company-documents';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; }, pool: { query: async () => ({ rows: [] }) } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));
let PDF: Buffer;
vi.mock('../pdfa-pipeline', () => ({ finalizePdfA: vi.fn(async (bytes: Uint8Array) => ({
  pdfBytes: Buffer.concat([Buffer.from(bytes), Buffer.from('\n% toolchain converted')]), converted: true, pdfaPart: '1', warnings: [],
})) }));
vi.mock('../../storage', () => ({
  ...(() => {
    const testProvider = {
      name: 'test',
      async get() {
        return { bytes: PDF, sizeBytes: PDF.length, sha256: '', mime: 'application/pdf', filename: 'csr.pdf' };
      },
    };
    return {
      getStorageProvider: () => testProvider,
      // The byte reader asks for the store a document was saved in (7fd5d6af).
      getStorageProviderFor: () => testProvider,
    };
  })(),
}));

import { assembleSequence, assembledTransmitBlockers } from '../assemble-from-core';
import { finalizePdfA } from '../pdfa-pipeline';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const VAULT_DOC = '33333333-3333-4333-8333-333333333333';

beforeAll(async () => {
  PDF = await plainPdfFixture('Clinical study report');
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  await harness.pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE IF NOT EXISTS organizations (id INTEGER PRIMARY KEY, name TEXT NOT NULL DEFAULT 'Sponsor organization', settings JSONB NOT NULL DEFAULT '{}'::jsonb);
    CREATE TABLE IF NOT EXISTS regulatory_programs (id UUID PRIMARY KEY, organization_id INTEGER, deleted_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS vault.documents (
      id UUID PRIMARY KEY, program_id UUID NOT NULL, storage_version_id TEXT,
      content_hash TEXT, file_name TEXT, deleted_at TIMESTAMPTZ,
      -- NULL asks getStorageProviderFor for the default store.
      storage_provider TEXT,
      -- VR-14: the tenant and version family the transmit rule reads.
      organization_id INTEGER, supersedes_id UUID, document_code TEXT
    );
    INSERT INTO organizations (id) VALUES (${ORG});
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}', ${ORG}, NULL);
    INSERT INTO vault.documents (id, program_id, storage_version_id, content_hash, file_name, organization_id) VALUES
      ('${VAULT_DOC}', '${PROGRAM}', 'ver-1', '${createHash('sha256').update(PDF).digest('hex')}', 'csr.pdf', ${ORG});
    -- VR-14: a vault leaf is transmitted only when its version is approved on
    -- its VR-13 lifecycle record, for these bytes.
    INSERT INTO canonical_documents (canonical_id, organization_id, project_id, title, document_type, stage, has_content, content_hash, source_refs)
    VALUES ('cd-vault', ${ORG}, '${PROGRAM}', 'csr.pdf', 'CSR', 'approved', true,
            '${createHash('sha256').update(PDF).digest('hex')}',
            '{"vault_documents":{"nativeId":"${VAULT_DOC}","role":"artifact"}}'::jsonb);

    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by, program_id)
    VALUES (1, 'IND', 'ind', 'biotech', 'fda', ${ORG}, ${USER}, '${PROGRAM}');
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
    VALUES (1, 1, 'fda', '0000', ${ORG}, ${USER});

    -- The coauthor document is left at its default status: a draft.
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
    VALUES (100, ${ORG}, 'Clinical Overview', '<p>body</p>', '2.5');

    -- The 5.3.5.1 leaf carries its study and STF file-tag: a file in a Module 4/5 study section
    -- must be referenced by a Study Tagging File or FDA rejects the sequence (validation 1789),
    -- and the packager refuses to build one it would reject. 2.5 is not a study section.
    INSERT INTO submission_leaves
      (sequence_id, section_code, title, lifecycle_op, document_table, document_id, document_uuid, study_id, stf_file_tag, organization_id, created_by)
    VALUES
      (1, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 100, NULL, NULL, NULL, ${ORG}, ${USER}),
      (1, 'm5.3.5.1', 'CSR 201', 'new', 'vault_documents', NULL, '${VAULT_DOC}', 'STUDY-201', 'study-report-body', ${ORG}, ${USER});
  `);
  // The real binary-availability predicate requires the existing disposition
  // ledger; apply its canonical constraints and guards to exercise that read.
  await harness.pglite.exec(`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
    CREATE TABLE IF NOT EXISTS vault.legal_holds (organization_id INTEGER, lifted_at TIMESTAMPTZ);`);
  await harness.pglite.exec(readFileSync(new URL('../../../../migrations/20261018_company_legal_registry.sql', import.meta.url), 'utf8'));
  await harness.pglite.exec(readFileSync(new URL('../../../../migrations/20261006_document_data_dispositions.sql', import.meta.url), 'utf8'));
});

afterAll(async () => {
  await harness.close();
});

describe('assembleSequence — vault leaf by uuid, and what transmit must refuse', () => {
  it('ships the vault-backed leaf in the package instead of skipping it', async () => {
    const r = await assembleSequence({
      sequenceId: 1, organizationId: ORG, userId: USER, applicationId: 'IND-123456', sponsorId: 'S', sponsorName: 'S',
    });
    try {
      expect(r.unresolvedLeaves).toEqual([]);
      expect(r.skipped).toEqual([]);
      const zip = await JSZip.loadAsync(await fs.readFile(r.bundle.path));
      const pdfs = Object.keys(zip.files).filter((f) => !zip.files[f].dir && f.endsWith('.pdf'));
      expect(pdfs.some((f) => f.startsWith('m5/'))).toBe(true);
      expect(pdfs.some((f) => f.startsWith('m2/'))).toBe(true);
    } finally {
      await r.cleanup();
    }
  });

  it('reports the draft leaf as a transmit blocker', async () => {
    const r = await assembleSequence({
      sequenceId: 1, organizationId: ORG, userId: USER, applicationId: 'IND-123456', sponsorId: 'S', sponsorName: 'S',
    });
    try {
      expect(r.unfinalized).toBe(1);
      const blockers = assembledTransmitBlockers(r);
      expect(blockers).toHaveLength(1);
      expect(blockers[0]).toMatch(/1 leaf document\(s\) are not approved \(2\.5: draft\)/);
    } finally {
      await r.cleanup();
    }
  });

  it('derives registered legal identity from the canonical tenant registry and preserves its exact source in the final ZIP and governance proof', async () => {
    const hash = createHash('sha256').update(PDF).digest('hex');
    const document: CompanyLegalDocument = { id: 'legal-source', title: 'Sponsor authorization', kind: 'authorization',
      vaultDocumentId: VAULT_DOC, programId: PROGRAM, contentHash: hash, version: '1', active: true,
      agencies: ['FDA'], countries: ['US'], submissionTypes: ['ind'], language: 'en', effectiveOn: null, expiresOn: null,
      registeredAt: '2026-10-01T00:00:00Z', registeredBy: String(USER) };
    await syncCompanyLegalRegistry(harness.pglite, ORG, [], [document]);
    vi.mocked(finalizePdfA).mockClear();
    const result = await assembleSequence({ sequenceId: 1, organizationId: ORG, userId: USER,
      applicationId: 'IND-123456', sponsorId: 'S', sponsorName: 'S' });
    try {
      const entry = result.bundle.leafManifest!.find(leaf => leaf.originalPdfProof);
      expect(entry?.originalPdfProof).toMatchObject({ sourceSha256: hash, shippedSha256: hash, reasons: ['registered-legal'],
        registeredLegalOriginals: [{ registryId: 'legal-source', programId: PROGRAM, version: '1', contentHash: hash }] });
      const zip = await JSZip.loadAsync(await fs.readFile(result.bundle.path));
      expect(await zip.file(entry!.href)!.async('nodebuffer')).toEqual(PDF);
      expect(vi.mocked(finalizePdfA).mock.calls.some(([bytes]) =>
        Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).equals(PDF))).toBe(false);
      const governance = JSON.parse(await fs.readFile(result.governanceManifestPath, 'utf8'));
      expect(governance.leaves.find((leaf: { href: string }) => leaf.href === entry!.href).originalPdfProof).toEqual(entry!.originalPdfProof);
    } finally {
      await result.cleanup();
      await harness.pglite.exec("TRUNCATE company_legal_registry");
    }
  });
});

describe('assembledTransmitBlockers', () => {
  it('is empty only when nothing was left out and nothing is unapproved', () => {
    expect(assembledTransmitBlockers({ skipped: [], unfinalized: 0, unfinalizedSections: [] })).toEqual([]);
  });

  it('names every leaf left out of the package', () => {
    const b = assembledTransmitBlockers({
      skipped: [{ sectionCode: 'm3.2.s.2', reason: 'no prior sequence manifest to withdraw from' }],
      unfinalized: 0,
      unfinalizedSections: [],
    });
    expect(b).toEqual(['1 placed leaf/leaves could not be packaged (m3.2.s.2: no prior sequence manifest to withdraw from)']);
  });

  it('never reads an un-itemised unapproved count as nothing', () => {
    const b = assembledTransmitBlockers({ skipped: [], unfinalized: 2, unfinalizedSections: [] });
    expect(b).toEqual(['2 leaf document(s) are not approved (not itemised)']);
  });
});
