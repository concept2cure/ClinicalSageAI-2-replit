/**
 * End-to-end multi-source assembly test for `assembleTechnicalFileFromCore`
 * (EU MDR/IVDR device technical file).
 *
 * Proves the silent-drop fix for the device assembler: a sequence whose leaves
 * point at coauthor_documents AND unified_documents AND ctd_onboarding_documents
 * materializes the two locally-renderable leaves while surfacing the external
 * (ctd_onboarding) leaf in `unresolvedLeaves`, never silently dropped. Runs
 * against in-process PGlite.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })) } }));

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
    INSERT INTO workflow_document_versions (document_id, version, content, created_by, organization_id)
    VALUES (400, 1, '{"type":"doc","content":[{"type":"text","text":"CER body"}]}'::json, 'tester', ${ORG});

    -- Leaves: coauthor (gspr), unified (cer), ctd_onboarding (external upload).
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, document_type, organization_id, created_by)
    VALUES
      (1, 'gspr.checklist',     'GSPR Checklist',              'new', 'coauthor_documents',       300, 'gspr', ${ORG}, ${USER}),
      (1, 'clinical.evaluation','Clinical Evaluation Report',  'new', 'unified_documents',        400, 'cer',  ${ORG}, ${USER}),
      (1, 'tech.upload',        'Uploaded Test Report',        'new', 'ctd_onboarding_documents', 500, NULL,   ${ORG}, ${USER});
  `);
});

afterAll(async () => {
  await harness.close();
});

describe('assembleTechnicalFileFromCore multi-source resolution', () => {
  it('materializes coauthor + unified leaves and surfaces the ctd_onboarding leaf as unresolved', async () => {
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

    // The ctd_onboarding leaf is reported, not silently dropped. Since c3fb1f2
    // ("materialize uploaded PDF leaves") the resolver looks the row up org-scoped
    // and — as this fixture stages the leaf without seeding the underlying
    // ctd_onboarding_documents row — surfaces it as unresolved with "row not
    // found in this organization". The guarantee under test is that an
    // unmaterializable leaf is surfaced regardless of the specific reason.
    expect(result.unresolvedLeaves).toHaveLength(1);
    expect(result.unresolvedLeaves[0].documentTable).toBe('ctd_onboarding_documents');
    expect(result.unresolvedLeaves[0].documentId).toBe(500);
    expect(result.unresolvedLeaves[0].reason).toMatch(/row not found|not stored locally|not readable/i);

    // A real ZIP bundle was produced.
    expect(result.bundle).toBeDefined();
    expect(result.bundle.fileCount).toBeGreaterThanOrEqual(1);
  });
});
