/**
 * eCTD assembly — the §11.10(e) rows it writes, and whether the caller is told.
 *
 * An assembly writes up to two rows: ECTD_PACKAGED_FROM_CORE (package-from-core)
 * and ECTD_ASSEMBLED (assemble-from-core); a refused one writes
 * ECTD_ASSEMBLE_BLOCKED and throws. All three were `await auditService
 * .logAction(…)` with the resolved outcome discarded, so the compile surface
 * (Submission Center → eCTD Compile, a launch app) reported a package whose
 * records were lost exactly as one whose records were written.
 *
 * Now the result carries `auditTrail`: persisted only when BOTH rows were, so a
 * lost row anywhere in the assembly is reported; and a refusal throws an
 * `EctdAssemblyBlockedError` carrying the refusal row's outcome — the refusal
 * IS the record there, so losing it must not be silent either.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

const holder = vi.hoisted(() => ({
  db: null as any,
  lose: new Set<string>(),
  throwOn: new Set<string>(),
  block: false,
}));
vi.mock('../../../db', () => ({ get db() { return holder.db; }, pool: { query: async () => ({ rows: [] }) } }));
vi.mock('../../auditService', () => ({
  default: {
    logAction: vi.fn(async (entry: { action: string }) => {
      if (holder.throwOn.has(entry.action)) throw new Error('bug below the guard');
      return holder.lose.has(entry.action)
        ? { persisted: false, chained: false, tamperProof: false, error: 'audit store unreachable' }
        : { persisted: true, chained: true, tamperProof: true };
    }),
  },
}));
vi.mock('../leaf-path-safety', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../leaf-path-safety')>();
  return {
    ...actual,
    validateLeafPaths: async (...a: Parameters<typeof actual.validateLeafPaths>) =>
      holder.block
        ? { ok: false, violations: [{ fileName: 'm2.5.pdf', code: 'OUTSIDE_ROOT' }] }
        : actual.validateLeafPaths(...a),
  };
});

import { assembleSequence, EctdAssemblyBlockedError } from '../assemble-from-core';

let harness: IndPgliteDb;
let root: string;
const saved = process.env.SUBMISSION_BUNDLE_DIR;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-outcome-'));
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

beforeEach(() => {
  holder.lose.clear();
  holder.throwOn.clear();
  holder.block = false;
});

const assemble = () =>
  assembleSequence({ sequenceId: 1, organizationId: 7, userId: 3, applicationId: 'IND-123456', sponsorId: 'S', sponsorName: 'S' });

describe('assembleSequence carries its audit-row outcome', () => {
  it('both rows written: the result says so', async () => {
    const r = await assemble();
    try {
      expect(r.auditTrail).toEqual({ persisted: true, chained: true });
    } finally {
      await r.cleanup();
    }
  });

  it('the ECTD_ASSEMBLED row lost: the package is still built, and the result says a row is missing', async () => {
    holder.lose.add('ECTD_ASSEMBLED');
    const r = await assemble();
    try {
      expect(r.bundle.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(r.auditTrail).toEqual({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: expect.any(String) });
      expect(JSON.stringify(r.auditTrail)).not.toContain('unreachable');
    } finally {
      await r.cleanup();
    }
  });

  it('the ECTD_PACKAGED_FROM_CORE row lost: reported too, not hidden behind the later row', async () => {
    holder.lose.add('ECTD_PACKAGED_FROM_CORE');
    const r = await assemble();
    try {
      expect(r.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    } finally {
      await r.cleanup();
    }
  });

  it('a refused assembly throws an error that carries whether the refusal was recorded', async () => {
    holder.block = true;
    holder.lose.add('ECTD_ASSEMBLE_BLOCKED');
    const err = await assemble().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(EctdAssemblyBlockedError);
    expect((err as InstanceType<typeof EctdAssemblyBlockedError>).message).toMatch(/eCTD assembly blocked: 1 leaf path-safety violation/);
    expect((err as InstanceType<typeof EctdAssemblyBlockedError>).auditTrail).toMatchObject({ persisted: false });
  });

  it('a writer that throws is a lost row, not a success', async () => {
    holder.throwOn.add('ECTD_ASSEMBLED');
    const r = await assemble();
    try {
      expect(r.auditTrail).toMatchObject({ persisted: false });
    } finally {
      await r.cleanup();
    }
  });
});
