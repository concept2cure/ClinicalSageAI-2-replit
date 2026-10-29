/** Real leaf PUT → SQL → existing core projection → existing FDA packager. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { eq } from 'drizzle-orm';
import { submissionLeaves } from '@shared/schema/submissions';
import { createIndPgliteDb, type IndPgliteDb } from '../../../db/pglite-harness';

vi.hoisted(() => { process.env.SKIP_DB_STARTUP_TEST = 'true'; });
const holder = vi.hoisted(() => ({ db: null as any, pool: null as any }));
vi.mock('../../../db', () => ({ get db() { return holder.db; }, get pool() { return holder.pool; } }));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) } }));

import submissionsRouter from '../../../routes/submissions';
import { expandRoleClaims } from '../../../middleware/auth';
import { coreLeafFromSubmissionLeaf, mapCoreLeafToEctdLeaf, type SubmissionLeafRow } from '../core-to-packager';
import { packageEctdSubmission } from '../../submission-gateways/regional-packager';
import { ValidationError } from '../../submission-gateways/types';
import { minimalPdf } from './support/signed-pdf-fixture';

let harness: IndPgliteDb;
let sequenceId: number;
let work: string;
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 9, userId: 9, organizationId: 1, role: 'member', roles: expandRoleClaims('member', undefined) };
  next();
});
app.use('/api/submissions', submissionsRouter);

beforeAll(async () => {
  harness = await createIndPgliteDb({ submissionCore: true, leafSources: true, governedSections: true });
  holder.db = harness.db;
  holder.pool = { query: (text: string, params?: unknown[]) => harness.pglite.query(text, params as unknown[]) };
  const [submission] = (await harness.pglite.query<{ id: number }>(
    `INSERT INTO submissions (title,product_name,application_type,client_type,primary_region,organization_id,created_by)
     VALUES ('Synthetic study-tagging qualification','Synthetic product','ind','pharma','fda',1,9) RETURNING id`,
  )).rows;
  const [sequence] = (await harness.pglite.query<{ id: number }>(
    `INSERT INTO ectd_sequences (submission_id,region,sequence_number,status,organization_id,created_by)
     VALUES ($1,'fda','0000','draft',1,9) RETURNING id`, [submission.id],
  )).rows;
  sequenceId = sequence.id;
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'builder-stf-route-'));
  await fs.writeFile(path.join(work, 'report.pdf'), minimalPdf('synthetic qualification only'));
}, 60_000);

afterAll(async () => {
  await harness?.close();
  if (work) await fs.rm(work, { recursive: true, force: true });
});

async function packageStoredLeaf(row: SubmissionLeafRow) {
  const leaf = mapCoreLeafToEctdLeaf(coreLeafFromSubmissionLeaf(row), {
    sourcePath: path.join(work, 'report.pdf'), fileName: 'report.pdf',
  });
  return packageEctdSubmission({
    region: 'fda', applicationId: '123456', sequence: '0000', submissionType: 'original',
    fda: { applicationType: 'ind' }, sponsorId: 'SYNTHETIC', sponsorName: 'Synthetic sponsor',
    productName: 'Synthetic product', environment: 'staging', outputDir: path.join(work, 'out'), leaves: [leaf],
  });
}

describe('Builder study metadata reaches the existing FDA package', () => {
  it('retains the 1789 refusal for an untagged study placed through the real route', async () => {
    const response = await request(app).put(`/api/submissions/sequences/${sequenceId}/leaves`).send({
      sectionCode: '5.3.5.1', title: 'Synthetic untagged clinical report',
      reason: 'Demonstrate that missing study metadata remains refused',
    });
    expect(response.status).toBe(200);
    const failure = await packageStoredLeaf(response.body).catch(error => error);
    expect(failure).toBeInstanceOf(ValidationError);
    expect(failure.findings).toEqual(expect.arrayContaining([expect.objectContaining({ ruleId: 'FDA-TRC-1789' })]));
  }, 30_000);

  it('persists explicit tags through the real route and emits the exact study STF', async () => {
    const response = await request(app).put(`/api/submissions/sequences/${sequenceId}/leaves`).send({
      sectionCode: '5.3.5.1', title: 'Synthetic tagged clinical report', studyId: 'STUDY-101', stfFileTag: 'study-report',
      reason: 'Record the human-selected study and file tag for qualification',
    });
    expect(response.status).toBe(200);
    const [stored] = await harness.db.select().from(submissionLeaves).where(eq(submissionLeaves.id, response.body.id));
    expect(stored).toMatchObject({ studyId: 'STUDY-101', stfFileTag: 'study-report' });
    const bundle = await packageStoredLeaf(stored!);
    expect(bundle.stf).toEqual({ studies: 1, leaves: 1, untagged: 0 });
    const zip = await JSZip.loadAsync(await fs.readFile(bundle.path));
    const studyFiles = Object.keys(zip.files).filter(name => name.endsWith('/stf-study-101.xml'));
    expect(studyFiles).toHaveLength(1);
    expect(studyFiles[0]).toMatch(/^m5\//);
    const xml = await zip.file(studyFiles[0])!.async('string');
    expect(xml).toContain('STUDY-101');
    expect(xml).toContain('name="study-report"');
    expect(xml).toContain('index.xml#');
  }, 30_000);
});
