/**
 * End-to-end multi-source assembly test for `assembleSequence` (eCTD).
 *
 * Proves the silent-drop fix at the assembler boundary: a sequence whose leaves
 * point at coauthor_documents AND unified_documents AND vault_documents
 * assembles a package in which the two locally-renderable leaves are
 * materialized, while the external (vault) leaf is surfaced in
 * `unresolvedLeaves` — never silently dropped. Runs against in-process PGlite.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => {}) } }));

import { assembleSequence } from '../assemble-from-core';

let harness: IndPgliteDb;
const ORG = 7;
const USER = 3;

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;

  await harness.pglite.exec(`
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
    VALUES (1, 'C2C Multi-source', 'ind', 'biotech', 'fda', ${ORG}, ${USER});

    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
    VALUES (1, 1, 'fda', '0000', ${ORG}, ${USER});

    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
    VALUES (100, ${ORG}, 'Clinical Overview', '<p>Overview body</p>', '2.5');

    INSERT INTO unified_documents (id, title, document_type, created_by, organization_id, latest_version)
    VALUES (200, 'Quality Summary', 'summary', 'tester', ${ORG}, 1);
    INSERT INTO workflow_document_versions (document_id, version, content, created_by, organization_id)
    VALUES (200, 1, '{"type":"doc","content":[{"type":"text","text":"Quality body"}]}'::json, 'tester', ${ORG});

    -- Leaves: one coauthor (m2.5), one unified (m3.2), one vault (external).
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by, checksum)
    VALUES
      (1, 'm2.5',   'Clinical Overview', 'new', 'coauthor_documents', 100, ${ORG}, ${USER}, NULL),
      (1, 'm3.2.p', 'Quality Summary',   'new', 'unified_documents',   200, ${ORG}, ${USER}, NULL),
      (1, 'm1.usa', 'Vault Cover Letter','new', 'vault_documents',     900, ${ORG}, ${USER}, NULL);
  `);
});

afterAll(async () => {
  await harness.close();
});

describe('assembleSequence multi-source resolution', () => {
  it('materializes coauthor + unified leaves and surfaces the vault leaf as unresolved', async () => {
    const result = await assembleSequence({
      sequenceId: 1,
      organizationId: ORG,
      userId: USER,
      applicationId: 'IND-12345',
      sponsorId: 'SPON-1',
      sponsorName: 'Acme Bio',
    });

    // Two locally-renderable sources rendered to PDF leaves.
    expect(result.materialized).toBe(2);

    // The external vault leaf is reported, not silently dropped.
    expect(result.unresolvedLeaves).toHaveLength(1);
    expect(result.unresolvedLeaves[0].documentTable).toBe('vault_documents');
    expect(result.unresolvedLeaves[0].documentId).toBe(900);
    expect(result.unresolvedLeaves[0].reason).toMatch(/external|S3|not stored locally/i);

    // A real bundle was produced.
    expect(result.bundle).toBeDefined();
  });
});
