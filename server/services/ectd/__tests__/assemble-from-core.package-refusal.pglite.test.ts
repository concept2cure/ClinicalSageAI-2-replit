/**
 * Assembling a package says what is wrong instead of a 500 (rehearsal B2, 2026-11-10; lane W2-assembly-refusal).
 *
 * "Assemble a test package" answered "Whether the test package was assembled could not be confirmed — Request
 * failed." on the IND and on the 510(k). The packager had refused for a filing reason it states in full (FDA eCTD
 * validation 1789: a file in a Module 4/5 study section that no Study Tagging File references), as a
 * ValidationError. assembleSequence converted only identity refusals, so POST /api/submissions/sequences/:id/assemble
 * sent the packager's refusal to fail(), which answered 500 "Request failed.".
 *
 * Now:
 *   - a refusal from the packager is a refusal, recorded (ECTD_ASSEMBLE_BLOCKED) and answered 422 in its own words,
 *     naming each document by its title;
 *   - a device filing (510(k)) is not held to the drug Study Tagging File rule, which FDA applies to eCTD
 *     sequences only (a 510(k) is filed as eSTAR).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import express from 'express';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

vi.hoisted(() => {
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'assemble-package-refusal-secret-32-chars';
});

const holder = vi.hoisted(() => ({ db: null as any, rows: [] as Array<{ action: string; details?: Record<string, unknown> }> }));
vi.mock('../../../db', () => ({ get db() { return holder.db; }, pool: { query: async () => ({ rows: [] }) } }));
vi.mock('../../auditService', () => ({
  default: {
    logAction: vi.fn(async (entry: { action: string; details?: Record<string, unknown> }) => {
      holder.rows.push(entry);
      return { persisted: true, chained: true, tamperProof: true };
    }),
  },
}));

import { assembleSequence, EctdAssemblyBlockedError } from '../assemble-from-core';
import { expandRoleClaims } from '../../../middleware/auth';
import submissionsRouter from '../../../routes/submissions';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 3, userId: 3, organizationId: 7, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

let harness: IndPgliteDb;
let root: string;
const saved = process.env.SUBMISSION_BUNDLE_DIR;

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'package-refusal-'));
  process.env.SUBMISSION_BUNDLE_DIR = root;
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true });
  await harness.pglite.exec(`CREATE TABLE IF NOT EXISTS organizations(id integer PRIMARY KEY,settings jsonb NOT NULL DEFAULT '{}'); INSERT INTO organizations(id) VALUES(7);`);
  holder.db = harness.db;
  // Sequence 1: an IND whose 5.3.1.4 report names no study. Sequence 2: a 510(k) carrying the same report.
  await harness.pglite.exec(`
    INSERT INTO submissions (id, title, application_type, client_type, primary_region, organization_id, created_by)
    VALUES (1, 'IND', 'ind', 'biotech', 'fda', 7, 3), (2, '510(k)', '510k', 'device', 'fda', 7, 3);
    INSERT INTO ectd_sequences (id, submission_id, region, sequence_number, organization_id, created_by)
    VALUES (1, 1, 'fda', '0000', 7, 3), (2, 2, 'fda', '0000', 7, 3);
    INSERT INTO coauthor_documents (id, organization_id, title, content, module_number, status)
    VALUES (100, 7, 'Clinical Overview', '<p>body</p>', '2.5', 'approved'),
           (101, 7, 'Bioanalytical method report', '<p>assay</p>', '5.3.1.4', 'approved');
    INSERT INTO submission_leaves (sequence_id, section_code, title, lifecycle_op, document_table, document_id, organization_id, created_by)
    VALUES (1, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 100, 7, 3),
           (1, 'm5.3.1.4', 'Bioanalytical method report', 'new', 'coauthor_documents', 101, 7, 3),
           (2, 'm2.5', 'Clinical Overview', 'new', 'coauthor_documents', 100, 7, 3),
           (2, 'm5.3.1.4', 'Bioanalytical method report', 'new', 'coauthor_documents', 101, 7, 3);
  `);
});

afterAll(async () => {
  await harness.close();
  if (saved === undefined) delete process.env.SUBMISSION_BUNDLE_DIR;
  else process.env.SUBMISSION_BUNDLE_DIR = saved;
  await fs.rm(root, { recursive: true, force: true });
});

describe('a package the packager refuses is a recorded refusal, not an outage', () => {
  it('assembleSequence throws the refusal, records it, and names the document by its title', async () => {
    holder.rows.length = 0;
    const err = await assembleSequence({ sequenceId: 1, organizationId: 7, userId: 3, dryRun: true }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(EctdAssemblyBlockedError);
    const refusal = err as InstanceType<typeof EctdAssemblyBlockedError>;
    expect(refusal.message).toMatch(/1789/);
    expect(refusal.message).toContain('"Bioanalytical method report" (section 5.3.1.4, no study id)');
    expect(refusal.auditTrail).toMatchObject({ persisted: true });
    expect(refusal.findings).toEqual([expect.objectContaining({ ruleId: 'FDA-TRC-1789', severity: 'error' })]);
    const blocked = holder.rows.filter((r) => r.action === 'ECTD_ASSEMBLE_BLOCKED');
    expect(blocked).toHaveLength(1);
    expect(blocked[0].details).toMatchObject({ reason: 'package_validation', findings: 1 });
  }, 60000);

  it('POST /assemble answers 422 in the packager\'s words, never 500 "Request failed."', async () => {
    const res = await request(app).post('/api/submissions/sequences/1/assemble').send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ECTD_ASSEMBLE_BLOCKED');
    expect(res.body.error.message).toMatch(/FDA validation 1789/);
    expect(res.body.error.message).toContain('Bioanalytical method report');
    expect(res.body.auditTrail).toMatchObject({ persisted: true });
  }, 60000);
});

describe('a device filing is not held to the drug Study Tagging File rule', () => {
  // A 510(k) is not an eCTD sequence at FDA (it is filed as eSTAR), so the eCTD backbone refuses it. The refusal says
  // that, as a device rule in plain words; it is not the drug 1789 rule, and it is not a 500.
  it('POST /assemble on a 510(k) sequence names the device rule only, never 1789', async () => {
    const res = await request(app).post('/api/submissions/sequences/2/assemble').send({});
    expect(JSON.stringify(res.body)).not.toMatch(/1789|Study Tagging File/);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ECTD_ASSEMBLE_BLOCKED');
    expect(res.body.error.message).toBe(
      'A 510(k) Premarket Notification is a device filing, not an eCTD sequence, so no eCTD package is assembled for it. ' +
        'FDA receives it as eSTAR. The eCTD Module 1 application-type vocabulary covers drug and biologic applications ' +
        '(NDA, ANDA, BLA, IND) and master files only. Nothing was assembled.',
    );
    expect(res.body.error.message).not.toMatch(/fdaat|fda\.applicationType/);
  }, 60000);
});
