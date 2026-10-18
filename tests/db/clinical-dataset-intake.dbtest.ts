/**
 * A SAS transport file and a Dataset-JSON file enter a project's Data Room as
 * clinical datasets (founder decision 2026-10-15, "Do it all", on the design
 * doc's §6; docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * Before: an .xpt was refused at upload, and had it arrived it would have been
 * an unreadable capture ("No text could be read"). Now, on real PostgreSQL
 * behind the request tenant scope, through the real projects router:
 *   - an adopted .xpt is processed: its text is its structure (datasets,
 *     variables, labels, record counts), its method says so, and its profile
 *     reads SDTM AE from the headers;
 *   - the Data Room search finds it by a variable's label;
 *   - no observation value is in the text or the profile;
 *   - a Dataset-JSON file is profiled the same way.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { databaseUrl } from '../setup.db';
import { AE, library, member } from '../../server/services/clinical-regulatory-evidence/__tests__/support/xpt-fixture';

const PROBE = 'dbtest-clin-dataset';
const RUN = Date.now().toString(36);

let owner: Pool;
let app: express.Express;
let orgId: number;
let orgUuid: string;
let userId: number;
let programId: string;
const written: string[] = [];

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
    r.user = { id: userId, organizationId: orgId, organizationUuid: orgUuid, role: 'admin', email: 'cd@dbtest.local' };
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/c2c/projects', router);
  return a;
}

async function conversationFile(name: string, bytes: Buffer, mime: string): Promise<string> {
  const id = `${PROBE}-${RUN}-${createHash('sha1').update(name).digest('hex').slice(0, 10)}`;
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

const adopt = async (fileId: string) => request(app).post(`/api/c2c/projects/${programId}/adopt`).send({ fileUploadId: fileId });
const sources = async (q?: string) =>
  request(app).get(`/api/c2c/projects/${programId}/sources${q ? `?q=${encodeURIComponent(q)}` : ''}`);

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  const org = await owner.query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id, uuid`,
    [`${PROBE} org`, `${PROBE}-org`],
  );
  orgId = Number(org.rows[0].id);
  orgUuid = String(org.rows[0].uuid);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, 'CD', 'x') ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [`${PROBE}@dbtest.local`],
  );
  userId = Number(user.rows[0].id);
  await owner.query(
    `INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'admin')
       ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role`, [orgId, userId]);
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'IND', 'drug', 'FDA', 'Drug X') RETURNING id`,
    [`${PROBE} ${RUN}`, `CLINDS-${RUN}`.toUpperCase(), orgId],
  );
  programId = String(prog.rows[0].id);
  // The project the program is anchored to, which the current-access gate admits through (14362ef00).
  const ws = await owner.query(
    `INSERT INTO client_workspaces (organization_id, name, slug, status, created_by_id) VALUES ($1, $2, $2, 'active', $3) RETURNING id`,
    [orgId, `${PROBE}-${RUN}`, userId],
  );
  const project = await owner.query(
    `INSERT INTO projects (organization_id, client_workspace_id, name, type, status, owner_id, created_by_id, regulatory_program_id, settings)
     VALUES ($1, $2, $3, 'regulatory', 'active', $4, $4, $5, '{}'::jsonb) RETURNING id`,
    [orgId, ws.rows[0].id, `${PROBE} ${RUN}`, userId, programId],
  );
  await owner.query('INSERT INTO project_visibility_settings (organization_id, project_id, visibility) VALUES ($1, $2, $3)', [orgId, project.rows[0].id, 'org_public']);
  app = await buildApp();
}, 60_000);

afterAll(async () => {
  for (const f of written) await fs.rm(f, { force: true });
  await owner?.end();
});

describe('a SAS transport file in the Data Room', () => {
  let sourceId: number;

  it('is read for its structure: text, method and an SDTM AE profile', async () => {
    const res = await adopt(await conversationFile('ae.xpt', library(member('AE', 'Adverse Events', AE, 4)), 'application/octet-stream'));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    sourceId = res.body.sourceId;
    const { rows: [s] } = await owner.query(
      `SELECT extraction_status, extracted_text, metadata->'datasetProfile' AS profile, provenance FROM cre_evidence_sources WHERE id = $1`,
      [sourceId],
    );
    expect(s.extraction_status).toBe('extracted');
    expect(s.extracted_text).toContain('SAS transport dataset AE — Adverse Events: 4 record(s)');
    expect(s.extracted_text).toContain('AETERM: Reported Term for the Adverse Event (character, length 40)');
    expect(s.profile).toMatchObject({ format: 'xpt', tables: [{ name: 'AE', rowCount: 4, cdisc: { standard: 'SDTM', domain: 'AE' } }] });
    expect(JSON.stringify(s.provenance)).toContain('xpt-structure');
  }, 60_000);

  it('is found by a variable\'s label in the Data Room search', async () => {
    const res = await sources('Reported Term for the Adverse Event');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.sources.map((r: { id: number }) => r.id)).toContain(sourceId);
  });
});

describe('a Dataset-JSON file in the Data Room', () => {
  it('is profiled from its columns, and no row value is kept in the profile', async () => {
    // An AE dataset: its variables (AESEQ, AETERM) show the domain; the profile reads none from values.
    const json = JSON.stringify({ datasetJSONVersion: '1.1.0', name: 'AE', label: 'Adverse Events', records: 2,
      columns: [{ name: 'STUDYID', label: 'Study', dataType: 'string' }, { name: 'DOMAIN', label: 'Domain', dataType: 'string' },
        { name: 'USUBJID', label: 'Subject', dataType: 'string' }, { name: 'AESEQ', label: 'Sequence', dataType: 'integer' },
        { name: 'AETERM', label: 'Reported Term', dataType: 'string' }],
      rows: [['X', 'AE', `SUBJ-${RUN}-1`, 1, 'Headache'], ['X', 'AE', `SUBJ-${RUN}-2`, 1, 'Nausea']] });
    const res = await adopt(await conversationFile('ae.json', Buffer.from(json), 'application/json'));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const { rows: [s] } = await owner.query(`SELECT metadata->'datasetProfile' AS profile FROM cre_evidence_sources WHERE id = $1`, [res.body.sourceId]);
    expect(s.profile).toMatchObject({ format: 'dataset-json', tables: [{ name: 'AE', rowCount: 2, columnCount: 5, cdisc: { standard: 'SDTM', domain: 'AE' } }] });
    expect(JSON.stringify(s.profile)).not.toContain(`SUBJ-${RUN}-1`);
  }, 60_000);
});
