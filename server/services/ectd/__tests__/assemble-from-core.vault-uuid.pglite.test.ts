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
import { promises as fs } from 'fs';
import JSZip from 'jszip';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; }, pool: { query: async () => ({ rows: [] }) } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));
const PDF = Buffer.from('%PDF-1.4\n% clinical study report\ntrailer<< /Root 1 0 R >>\n%%EOF\n');
vi.mock('../../storage', () => ({
  getStorageProvider: () => ({
    name: 'test',
    async get() {
      return { bytes: PDF, sizeBytes: PDF.length, sha256: '', mime: 'application/pdf', filename: 'csr.pdf' };
    },
  }),
}));

import { assembleSequence, assembledTransmitBlockers } from '../assemble-from-core';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const VAULT_DOC = '33333333-3333-4333-8333-333333333333';

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  await harness.pglite.exec(`
    CREATE SCHEMA IF NOT EXISTS vault;
    CREATE TABLE IF NOT EXISTS regulatory_programs (id UUID PRIMARY KEY, organization_id INTEGER, deleted_at TIMESTAMPTZ);
    CREATE TABLE IF NOT EXISTS vault.documents (
      id UUID PRIMARY KEY, program_id UUID NOT NULL, storage_version_id TEXT,
      content_hash TEXT, file_name TEXT, deleted_at TIMESTAMPTZ
    );
    INSERT INTO regulatory_programs VALUES ('${PROGRAM}', ${ORG}, NULL);
    INSERT INTO vault.documents VALUES
      ('${VAULT_DOC}', '${PROGRAM}', 'ver-1', '${createHash('sha256').update(PDF).digest('hex')}', 'csr.pdf', NULL);

    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
    VALUES (1, 'IND', 'ind', 'biotech', 'fda', ${ORG}, ${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
    VALUES (1, 1, 'fda', '0000', ${ORG}, ${USER});

    -- The coauthor document is left at its default status: a draft.
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
    VALUES (100, ${ORG}, 'Clinical Overview', '<p>body</p>', '2.5');

    INSERT INTO submission_leaves
      (sequence_id, section_code, title, lifecycle_op, document_table, document_id, document_uuid, organization_id, created_by)
    VALUES
      (1, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 100, NULL, ${ORG}, ${USER}),
      (1, 'm5.3.5.1', 'CSR 201', 'new', 'vault_documents', NULL, '${VAULT_DOC}', ${ORG}, ${USER});
  `);
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
