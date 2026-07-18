/**
 * End-to-end multi-source assembly test for `assembleTechnicalFileFromCore`
 * (EU MDR/IVDR device technical file).
 *
 * Proves the silent-drop fix for the device assembler: a sequence whose leaves
 * point at coauthor_documents AND unified_documents AND vault_documents
 * materializes the two locally-renderable leaves while surfacing the external
 * (vault) leaf in `unresolvedLeaves`, never silently dropped. Runs against
 * in-process PGlite.
 *
 * vault_documents is the canonical always-external table (UUID-keyed,
 * program-scoped — not addressable from an integer leaf id); the resolver's own
 * unit test (leaf-source-resolver.test.ts) covers the renderable
 * ctd_onboarding_documents upload paths in isolation.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => {}) } }));

import { assembleTechnicalFileFromCore } from '../mdr-ivdr/assemble-technical-file-from-core';

let harness: IndPgliteDb;
const ORG = 8;
const USER = 4;

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;

  await harness.pglite.exec(`
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
    VALUES (1, 'AcmeScope MDR', 'mdr', 'mdx', 'eu', ${ORG}, ${USER});

    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
    VALUES (1, 1, 'eu', '0000', ${ORG}, ${USER});

    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
    VALUES (300, ${ORG}, 'GSPR Checklist', '<p>GSPR content</p>', 'gspr');

    INSERT INTO unified_documents (id, title, document_type, created_by, organization_id, latest_version)
    VALUES (400, 'Clinical Evaluation Report', 'cer', 'tester', ${ORG}, 1);
    INSERT INTO workflow_document_versions (document_id, version, content, created_by)
    VALUES (400, 1, '{"type":"doc","content":[{"type":"text","text":"CER body"}]}'::json, 'tester');

    -- Leaves: coauthor (gspr), unified (cer), vault (external binary).
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, document_type, organization_id, created_by)
    VALUES
      (1, 'gspr.checklist',     'GSPR Checklist',              'new', 'coauthor_documents', 300, 'gspr', ${ORG}, ${USER}),
      (1, 'clinical.evaluation','Clinical Evaluation Report',  'new', 'unified_documents',  400, 'cer',  ${ORG}, ${USER}),
      (1, 'tech.upload',        'Vault Cover Letter',          'new', 'vault_documents',    900, NULL,   ${ORG}, ${USER});
  `);
});

afterAll(async () => {
  await harness.close();
});

describe('assembleTechnicalFileFromCore multi-source resolution', () => {
  it('materializes coauthor + unified leaves and surfaces the vault leaf as unresolved', async () => {
    const result = await assembleTechnicalFileFromCore({
      sequenceId: 1,
      organizationId: ORG,
      userId: USER,
      regulation: 'mdr',
      applicationId: 'DEV-9000',
      productName: 'AcmeScope',
    });

    // Two locally-renderable sources rendered to PDF leaves.
    expect(result.materialized).toBe(2);

    // The external (vault) leaf is reported, not silently dropped.
    expect(result.unresolvedLeaves).toHaveLength(1);
    expect(result.unresolvedLeaves[0].documentTable).toBe('vault_documents');
    expect(result.unresolvedLeaves[0].documentId).toBe(900);
    expect(result.unresolvedLeaves[0].reason).toMatch(/external|S3|not stored locally/i);

    // A real ZIP bundle was produced.
    expect(result.bundle).toBeDefined();
    expect(result.bundle.fileCount).toBeGreaterThanOrEqual(1);
  });
});
