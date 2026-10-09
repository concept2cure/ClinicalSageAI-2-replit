/**
 * The ectd-sequence signature binds WHICH document each leaf files.
 *
 * 2026-09-22 (W5/D7). The binding digested each leaf's id, section, operation,
 * document_table, document_id, checksum and title. A vault leaf is keyed by
 * document_uuid (its document_id is NULL), and the content pin
 * (document_content_sha256) records what the source contained when placed.
 * Neither was in the digest, so re-pointing a signed vault leaf at a different
 * PDF left the signature verifying: Gate 1 accepted a freeze/dispatch/transmit
 * signature over a document the signer never saw.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';
import { deriveGovernedTargetBinding } from '../signature-persistence';

let h: IndPgliteDb;
const ORG = 7;
const USER = 3;
const client = () => ({ query: (t: string, p?: unknown[]) => h.pglite.query(t, p) as never });

beforeAll(async () => {
  h = await createIndPgliteDb({ submissionCore: true });
  await h.pglite.exec(`
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
    VALUES (1, 'IND', 'ind', 'biotech', 'fda', ${ORG}, ${USER});
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
    VALUES (1, 1, 'fda', '0000', ${ORG}, ${USER});
    INSERT INTO submission_leaves
      (id, sequence_id, section_code, title, lifecycle_op, document_table, document_id, document_uuid, document_content_sha256, organization_id, created_by)
    VALUES (1, 1, 'm5.3.5.1', 'CSR 201', 'new', 'vault_documents', NULL, '11111111-1111-4111-8111-111111111111', 'aaaa', ${ORG}, ${USER});
  `);
});

afterAll(async () => {
  await h.close();
});

describe('ectd-sequence signature binding', () => {
  it('changes when a vault leaf is re-pointed at a different document', async () => {
    const before = await deriveGovernedTargetBinding(client(), 'ectd-sequence:1', ORG);
    await h.pglite.exec(`UPDATE submission_leaves SET document_uuid = '22222222-2222-4222-8222-222222222222' WHERE id = 1`);
    const after = await deriveGovernedTargetBinding(client(), 'ectd-sequence:1', ORG);
    expect(after.digest).not.toBe(before.digest);
  });

  it('changes when the content pin changes', async () => {
    const before = await deriveGovernedTargetBinding(client(), 'ectd-sequence:1', ORG);
    await h.pglite.exec(`UPDATE submission_leaves SET document_content_sha256 = 'bbbb' WHERE id = 1`);
    const after = await deriveGovernedTargetBinding(client(), 'ectd-sequence:1', ORG);
    expect(after.digest).not.toBe(before.digest);
  });

  it('does not change for workflow columns the signature must survive', async () => {
    const before = await deriveGovernedTargetBinding(client(), 'ectd-sequence:1', ORG);
    await h.pglite.exec(`UPDATE ectd_sequences SET status = 'dispatched', dispatch_status = 'sent' WHERE id = 1`);
    const after = await deriveGovernedTargetBinding(client(), 'ectd-sequence:1', ORG);
    expect(after.digest).toBe(before.digest);
  });
});
