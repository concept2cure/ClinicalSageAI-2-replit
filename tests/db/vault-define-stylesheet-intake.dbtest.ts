/**
 * The define.xml stylesheet and a slide deck enter the Vault (MR-08 Stage 3
 * step 3, docs/work-orders/MR-08-vault-upload-safety-and-document-control.md).
 *
 * FDA expects define.xml to travel with the stylesheet that renders it, so a
 * define.xml admitted without its .xsl is half a deliverable. Real PostgreSQL,
 * as app_service under RLS, through the real ingest route:
 *   - a .xsl is admitted under each type a browser or OS sends for it, its text
 *     is read, and it is stored under the type its name binds;
 *   - a .pptx is admitted, held to the archive limit like any ZIP container;
 *   - a binary renamed .xsl is refused by its bytes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { databaseUrl } from '../setup.db';
import { AE, library, member } from '../../server/services/clinical-regulatory-evidence/__tests__/support/xpt-fixture';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent } from './vault-current-access-fixture';

const RUN = randomUUID().slice(0, 12);
const PROBE = `dbtest-vxsl-${RUN} `;
const CODE = `DBTEST-VXSL-${RUN}`;
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const STYLESHEET = '<?xml version="1.0" encoding="UTF-8"?>\n<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">'
  + '<xsl:template match="/"><html><body><h1>Define-XML 2.1</h1></body></html></xsl:template></xsl:stylesheet>\n';

type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let userId: number;
let mine: Tenant;

async function app(): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId, tenantId: mine.orgId, userRole: 'admin',
      user: { id: userId, organizationId: mine.orgId, organizationUuid: mine.orgUuid, role: 'admin' },
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  return a;
}

let n = 0;
async function ingest(bytes: Buffer, filename: string, contentType: string) {
  n += 1;
  return request(await app()).post('/api/vault/ingest')
    .field('programId', mine.programId).field('documentType', 'OTHER').field('documentCode', `${CODE}-${n}`)
    .field('documentTitle', filename)
    .attach('file', bytes, { filename, contentType });
}

const stored = async (id: string) => (await owner.query(
  'SELECT mime_type, file_name, extracted_text FROM vault.documents WHERE id = $1', [id])).rows[0];

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Xena Stylesheet', 'x', 'active') RETURNING id`,
    [`dbtest-vxsl-${RUN}@example.test`],
  );
  userId = Number(user.rows[0].id);
  const org = await owner.query(`INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`${PROBE}org`, `dbtest-vxsl-${RUN}`]);
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Definia 5mg') RETURNING id`,
    [`${PROBE}program`, CODE, org.rows[0].id],
  );
  mine = { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
  await seedVaultFixtureParent(owner, mine, { userId, namespace: `${PROBE}parent` });
  await assertVaultFixtureRuntime(mine);
});

afterAll(async () => {
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

describe('the define.xml stylesheet', () => {
  it.each([
    ['application/xslt+xml'],
    ['text/xsl'],
    ['text/xml'],
    ['application/xml'],
  ])('is admitted declared %s, read as text, and stored as the type its name binds', async (declared) => {
    // Distinct bytes per case: the same bytes twice in one project are one document.
    const res = await ingest(Buffer.from(`${STYLESHEET}<!-- sent as ${declared} -->\n`, 'utf8'), 'define2-1.xsl', declared);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const row = await stored(String(res.body.document.id));
    expect(row).toMatchObject({ file_name: 'define2-1.xsl', mime_type: 'application/xslt+xml' });
    expect(row.extracted_text).toMatch(/xsl:stylesheet/);
  });

  it('travels with its define.xml', async () => {
    const res = await ingest(Buffer.from('<?xml version="1.0"?>\n<?xml-stylesheet type="text/xsl" href="define2-1.xsl"?>\n<ODM/>\n', 'utf8'), 'define.xml', 'application/xml');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('is refused when its bytes are not text', async () => {
    const pe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(512, 0)]);
    const res = await ingest(pe, 'define2-1.xsl', 'application/xslt+xml');
    expect(res.status).toBe(400);
    expect(res.body.error?.code ?? res.body.code).toBe('FILE_SIGNATURE_MISMATCH');
  });
});

describe('a SAS transport file', () => {
  it('a browser sends as octet-stream is stored as the transport type its name binds', async () => {
    const res = await ingest(library(member('AE', 'Adverse Events', AE, 3)), 'ae.xpt', 'application/octet-stream');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await stored(String(res.body.document.id))).mime_type).toBe('application/x-sas-xport');
  });
});

describe('a slide deck', () => {
  it('is admitted as a ZIP container within the archive limit', async () => {
    const z = new JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>', { createFolders: false });
    z.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>', { createFolders: false });
    const res = await ingest(await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), 'investigator-meeting.pptx', PPTX);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect((await stored(String(res.body.document.id))).mime_type).toBe(PPTX);
  });
});
