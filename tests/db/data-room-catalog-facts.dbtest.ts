/**
 * The Data Room catalog describes the evidence (D2, Data Room catalog S3,
 * 2026-10-08; docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * Before: no Data Room writer filled product, indication, phase, registry id or
 * document date; nothing said which study a document belonged to; a CSV or a
 * define.xml was flat text. Now, by rule and from the project's own record:
 *   - the project's facts are inherited;
 *   - the registry id, protocol number, document date and data cut-off are
 *     found under their labels, with the offset;
 *   - the capture names the ONE study of its project the document names, and
 *     the database refuses a study of another organization;
 *   - a tabular file is profiled (structure only, no cell value).
 *
 * Real PostgreSQL, the real projects router (adopt and /sources) behind the
 * real request tenant scope.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { databaseUrl } from '../setup.db';

const PROBE = 'dbtest-catfacts';
/* Captures are append-only (VR-16), so each run uses its own projects. */
const RUN = Date.now().toString(36);

let owner: Pool;
let app: express.Express;
let orgId: number;
let orgUuid: string;
let otherOrgId: number;
let userId: number;
let programId: string;
let studyId: number;
const written: string[] = [];

const CSR_TEXT = [
  'CLINICAL STUDY REPORT — interim analysis',
  `Protocol Number: BX-${RUN}-02`,
  'ClinicalTrials.gov Identifier: NCT04567890',
  'Report Date: 14 March 2025',
  'Data cut-off date: 2024-12-31',
  'The primary endpoint, the annual rate of decline in forced vital capacity, was met.',
].join('\n');

async function buildApp(): Promise<express.Express> {
  const router = (await import('../../server/routes/c2c/projects')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const r = req as unknown as Record<string, unknown>;
    r.userId = userId;
    r.tenantId = orgId;
    r.userRole = 'admin';
    r.user = { id: userId, organizationId: orgId, organizationUuid: orgUuid, role: 'admin', email: 'cf@dbtest.local' };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/c2c/projects', router);
  return a;
}

async function conversationFile(name: string, body: string, mime: string): Promise<string> {
  const id = `${PROBE}-${RUN}-${createHash('sha1').update(name).digest('hex').slice(0, 10)}`;
  const bytes = Buffer.from(body, 'utf8');
  const dir = path.resolve(process.cwd(), 'uploads', `org-${orgId}`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, id), bytes);
  written.push(path.join(dir, id));
  await owner.query(
    `INSERT INTO file_uploads (id, user_id, organization_id, original_name, mime_type, file_size, storage_path, checksum_sha256, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uploaded', NOW())`,
    [id, userId, orgId, name, mime, bytes.length, `uploads/org-${orgId}/${id}`, createHash('sha256').update(bytes).digest('hex')],
  );
  return id;
}

async function program(name: string, org: number): Promise<string> {
  const { rows } = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name, indication, phase)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'Bexotinib', 'Idiopathic pulmonary fibrosis', 'Phase 2') RETURNING id`,
    [`${PROBE} ${name} ${RUN}`, `CF-${name}-${RUN}`.toUpperCase(), org],
  );
  return String(rows[0].id);
}

async function study(org: number, program: string, protocolId: string, suffix: string): Promise<number> {
  const { rows } = await owner.query(
    `INSERT INTO cdisc_prm_studies (tenant_id, study_id, program_id, protocol_id, protocol_title, protocol_version)
     VALUES ($1, $2, $3, $4, 'A study', '3.0') RETURNING id`,
    [org, `${PROBE}-${RUN}-${suffix}`, program, protocolId],
  );
  return Number(rows[0].id);
}

const adopt = async (fileId: string) => request(app).post(`/api/c2c/projects/${programId}/adopt`).send({ fileUploadId: fileId });

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE} org`, `${PROBE}-org`],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);
  const other = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE} other`, `${PROBE}-other`],
  );
  otherOrgId = Number(other.rows[0].id);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, 'CF', 'x') ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE}@dbtest.local`],
  );
  userId = Number(user.rows[0].id);
  programId = await program('main', orgId);
  const sibling = await program('sibling', orgId);
  studyId = await study(orgId, programId, `BX-${RUN}-02`, 'main');
  // The same protocol id in another project of the organization: never considered.
  await study(orgId, sibling, `BX-${RUN}-02`, 'sibling');
  app = await buildApp();
}, 60_000);

afterAll(async () => {
  for (const f of written) await fs.rm(f, { force: true });
  await owner?.end();
});

describe('an adopted CSR is described by rule and by its project', () => {
  let sourceId: number;

  it('inherits the project facts, finds the labelled facts, and names its study', async () => {
    const res = await adopt(await conversationFile('CSR interim.txt', CSR_TEXT, 'text/plain'));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    sourceId = res.body.sourceId;
    const { rows: [s] } = await owner.query(
      `SELECT product, indication, phase, application_type, agency, trial_registry_identifier,
              to_char(document_date, 'YYYY-MM-DD') AS document_date, study_ref,
              metadata->>'dataCutDate' AS data_cut, metadata->'catalogEvidence' AS evidence
         FROM cre_evidence_sources WHERE id = $1`,
      [sourceId],
    );
    expect(s).toMatchObject({
      product: 'Bexotinib', indication: 'Idiopathic pulmonary fibrosis', phase: 'Phase 2', application_type: 'IND',
      agency: 'FDA', trial_registry_identifier: 'NCT04567890', document_date: '2025-03-14',
      study_ref: studyId, data_cut: '2024-12-31',
    });
    expect(s.evidence.protocolNumber).toMatchObject({ value: `BX-${RUN}-02`, rule: 'labelled protocol number' });
    expect(CSR_TEXT.slice(s.evidence.dataCutDate.offset)).toMatch(/^Data cut-off/);
  }, 60_000);

  it('the Data Room read carries what the catalog found', async () => {
    const res = await request(app).get(`/api/c2c/projects/${programId}/sources`);
    const row = res.body.sources.find((r: { id: number }) => r.id === sourceId);
    expect(row.catalog).toMatchObject({
      studyRef: studyId, trialRegistryIdentifier: 'NCT04567890', protocolNumber: `BX-${RUN}-02`,
      dataCutDate: '2024-12-31', product: 'Bexotinib',
    });
  });
});

describe('a study is named only when it is the one study of this project', () => {
  it('two studies of the project with the same protocol id: neither is chosen, both are named', async () => {
    await study(orgId, programId, `AMB-${RUN}`, 'amb-1');
    await study(orgId, programId, `AMB-${RUN}`, 'amb-2');
    const res = await adopt(await conversationFile('Amendment.txt', `Protocol Number: AMB-${RUN}\nAmendment 2.`, 'text/plain'));
    const { rows: [s] } = await owner.query(`SELECT study_ref, metadata->'catalogEvidence'->'study' AS study FROM cre_evidence_sources WHERE id = $1`, [res.body.sourceId]);
    expect(s.study_ref).toBeNull();
    expect(s.study.candidates).toHaveLength(2);
  }, 60_000);

  it("the database refuses a capture naming another organization's study", async () => {
    const foreignProgram = await program('foreign', otherOrgId);
    const foreign = await study(otherOrgId, foreignProgram, `F-${RUN}`, 'foreign');
    const err = await owner.query(
      `INSERT INTO cre_evidence_sources (organization_id, visibility_class, source_type, title, checksum, client_program_id, study_ref)
       VALUES ($1, 'project_private', 'client_document', $2, $3, $4, $5)`,
      [orgId, `${PROBE} forged`, `forged-${RUN}`, programId, foreign],
    ).then(() => 'ok', (e: { code?: string }) => e.code);
    expect(err).toBe('23503');
  });

  it('deleting the study design detaches its sources and keeps the capture', async () => {
    const own = await study(orgId, programId, `DEL-${RUN}`, 'del');
    const res = await adopt(await conversationFile('Report DEL.txt', `Protocol Number: DEL-${RUN}\nA report.`, 'text/plain'));
    const before = await owner.query('SELECT study_ref FROM cre_evidence_sources WHERE id = $1', [res.body.sourceId]);
    expect(before.rows[0].study_ref).toBe(own);
    await owner.query('DELETE FROM cdisc_prm_studies WHERE id = $1', [own]);
    const after = await owner.query('SELECT study_ref, checksum FROM cre_evidence_sources WHERE id = $1', [res.body.sourceId]);
    expect(after.rows[0].study_ref).toBeNull();
    expect(after.rows[0].checksum).toBeTruthy();
  }, 60_000);
});

describe('a tabular capture is profiled, structure only', () => {
  it('an SDTM AE CSV reads as SDTM AE with its columns and rows, and no subject value is kept', async () => {
    const csv = 'STUDYID,DOMAIN,USUBJID,AESEQ,AETERM,AESTDTC\nX,AE,X-0012,1,Headache,2024-05-02\nX,AE,X-0031,1,Nausea,2024-05-09\n';
    const res = await adopt(await conversationFile('ae.csv', csv, 'text/csv'));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const page = await request(app).get(`/api/c2c/projects/${programId}/sources`);
    const row = page.body.sources.find((r: { id: number }) => r.id === res.body.sourceId);
    expect(row.catalog.dataset).toMatchObject({ format: 'csv', tableCount: 1 });
    expect(row.catalog.dataset.tables[0]).toMatchObject({ standard: 'SDTM', domain: 'AE', rowCount: 2, columnCount: 6 });
    const { rows: [m] } = await owner.query(`SELECT metadata->'datasetProfile' AS p FROM cre_evidence_sources WHERE id = $1`, [res.body.sourceId]);
    expect(JSON.stringify(m.p)).not.toContain('X-0031');
  }, 60_000);
});
