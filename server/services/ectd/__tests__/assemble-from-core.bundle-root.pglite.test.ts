/**
 * The package transmit sends is staged inside the submission-bundle root.
 *
 * 2026-09-23 (W5/D7), found by the round-2 review. assembleSequence staged the
 * ZIP under os.tmpdir(), and outside a declared development/test environment
 * every gateway refuses a bundle outside the bundle root (bundle-namespace.ts).
 * Every canonical sequence transmit — FDA's test environment included — was
 * refused "outside the permitted submission-bundle storage namespace".
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; }, pool: { query: async () => ({ rows: [] }) } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));

import { assembleSequence } from '../assemble-from-core';
import { isPathWithinBundleRoot, submissionBundleRoot } from '../../submission-gateways/bundle-namespace';

let harness: IndPgliteDb;
let root: string;
const saved = process.env.SUBMISSION_BUNDLE_DIR;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'bundle-root-'));
  process.env.SUBMISSION_BUNDLE_DIR = root;
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  holder.db = harness.db;
  await harness.pglite.exec(`
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
    VALUES (1, 'IND', 'ind', 'biotech', 'fda', 7, 3);
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
    VALUES (1, 1, 'fda', '0000', 7, 3);
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status)
    VALUES (100, 7, 'Clinical Overview', '<p>body</p>', '2.5', 'approved');
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by)
    VALUES (1, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 100, 7, 3);
  `);
});

afterAll(async () => {
  await harness.close();
  if (saved === undefined) delete process.env.SUBMISSION_BUNDLE_DIR;
  else process.env.SUBMISSION_BUNDLE_DIR = saved;
  await fs.rm(root, { recursive: true, force: true });
});

describe('assembleSequence staging', () => {
  it('writes the bundle inside the submission-bundle root, where the gateways accept it', async () => {
    const r = await assembleSequence({ sequenceId: 1, organizationId: 7, userId: 3, applicationId: 'IND-123456', sponsorId: 'S', sponsorName: 'S' });
    try {
      expect(submissionBundleRoot()).toBe(path.resolve(root));
      expect(isPathWithinBundleRoot(r.bundle.path)).toBe(true);
    } finally {
      await r.cleanup();
    }
  });
});
