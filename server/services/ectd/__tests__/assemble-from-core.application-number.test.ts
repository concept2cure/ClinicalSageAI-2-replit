/**
 * Application-number honesty at the submission-assembly boundary (eCTD).
 *
 * The application number stamped into a transmissible eCTD backbone is the
 * submission's RECORDED `application_number`, never a caller-supplied value. A
 * caller that passes an `applicationNumber` contradicting the record is refused
 * outright — silently honoring it would misattribute a real package to the
 * wrong IND/NDA/BLA; silently ignoring it would mislead the caller. This mirrors
 * the existing `region` honesty guard. Runs against in-process PGlite.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true })) } }));

import { assembleSubmissionEctd } from '../assemble-from-core';

let harness: IndPgliteDb;
const ORG = 11;
const USER = 4;
const RECORDED = 'IND-778899';

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;

  await harness.pglite.exec(`
    INSERT INTO submissions (id, title, application_number, application_type, client_type, primary_region, organization_id, created_by)
    VALUES (1, 'C2C App-Number Honesty', '${RECORDED}', 'ind', 'biotech', 'fda', ${ORG}, ${USER});

    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
    VALUES (1, 1, 'fda', '0000', ${ORG}, ${USER});

    -- One locally-renderable leaf so the accepted-match path can complete assembly.
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number)
    VALUES (100, ${ORG}, 'Clinical Overview', '<p>Overview body</p>', '2.5');

    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by, checksum)
    VALUES (1, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 100, ${ORG}, ${USER}, NULL);
  `);
});

afterAll(async () => {
  await harness.close();
});

describe('assembleSubmissionEctd application-number honesty', () => {
  it('refuses a caller applicationNumber that contradicts the recorded value', async () => {
    await expect(
      assembleSubmissionEctd({
        submissionId: 1,
        organizationId: ORG,
        userId: USER,
        applicationNumber: 'IND-000000', // does not match the recorded IND-778899
      }),
    ).rejects.toThrow(/does not match the submission's recorded application number/i);
  });

  it('accepts a caller applicationNumber that matches the recorded value', async () => {
    // The guard is scoped to contradictions: a matching value passes through and
    // assembly proceeds (does not throw the app-number mismatch error).
    const result = await assembleSubmissionEctd({
      submissionId: 1,
      organizationId: ORG,
      userId: USER,
      applicationNumber: RECORDED,
    });
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  });

  it('packages as recorded when no applicationNumber is supplied', async () => {
    const result = await assembleSubmissionEctd({
      submissionId: 1,
      organizationId: ORG,
      userId: USER,
    });
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
  });
});
