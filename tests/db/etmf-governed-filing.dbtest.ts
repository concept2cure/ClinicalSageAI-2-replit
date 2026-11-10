/**
 * Filing and removing a TMF artifact are governed acts (eTMF convergence E3;
 * founder decisions P-74 and P-75; docs/design/ETMF_CONVERGENCE_2026-10-30.md).
 *
 * The defect: a filing was written and then its audit row was attempted, after
 * commit, without the document it referenced; a lost audit row left a filing
 * with no record of it. A removal was a DELETE with no reason. The inspection
 * package was handed out with nothing recorded.
 *
 * Here, on PostgreSQL as the runtime role with RLS on, through the mounted
 * /api/etmf router:
 *
 *   - filing and removing each need a reason of at least 8 characters
 *     (400 REASON_REQUIRED), and nothing is written without one;
 *   - the audit row is written by the same transaction as the change (the two
 *     rows carry one transaction id), on the tenant's sequenced chain, with the
 *     reason, the study, the artifact code, the document filed and, on a
 *     re-file, the document it replaced;
 *   - a removal keeps the row, with who removed it, when and why; no reader
 *     serves it; filing the artifact again clears the removal on the same row
 *     and its audit row says which removal it cleared;
 *   - the inspection package is a recorded download: an EXPORT_GENERATED row
 *     with the SHA-256 of the bytes sent, and nothing sent when that row
 *     cannot be written.
 *
 * The rate limiter is replaced by a pass-through: it is not what is under test.
 */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import JSZip from 'jszip';
import { Pool } from 'pg';
import { databaseUrl } from '../setup.db';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent } from './vault-current-access-fixture';
import { nativeCatalogRunId } from './catalog-native-fixture';

vi.mock('../../server/middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const RUN = nativeCatalogRunId();
const PROBE = `dbtest-etmf-governed-${RUN}`;
const FILED_BECAUSE = 'Signed protocol v1.0 received from the sponsor.';
const REFILED_BECAUSE = 'Protocol amendment 1 supersedes v1.0.';
const REMOVED_BECAUSE = 'Filed against the wrong study by mistake.';

type Tenant = { orgId: number; orgUuid: string };
type Study = { id: number; studyId: string };

let owner: Pool;
let mine: Tenant;
let userId: number;
let programId: string;
let study: Study;
let docA: string;
let docA2: string;

async function app(): Promise<express.Express> {
  const etmf = (await import('../../server/routes/etmf.routes')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const { expandRoleClaims } = await import('../../server/middleware/auth');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId, tenantId: mine.orgId, userRole: 'admin',
      user: { id: userId, organizationId: mine.orgId, organizationUuid: mine.orgUuid, role: 'admin', roles: expandRoleClaims('admin', undefined) },
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/etmf', etmf);
  return a;
}
const api = async () => request(await app());
const trial = () => `/api/etmf/trials/${encodeURIComponent(study.studyId)}`;
const file = async (artifactCode: string, documentId: string, reason?: unknown) =>
  (await api()).post(`${trial()}/artifacts`).send({ artifactCode, documentRef: `vault://${documentId}`, ...(reason === undefined ? {} : { reason }) });

async function vaultDocument(): Promise<string> {
  const id = randomUUID();
  await owner.query(
    `INSERT INTO vault.documents (id, program_id, organization_id, document_code, document_title, document_type, version,
       file_name, file_size, mime_type, content_hash, s3_bucket, s3_key, created_by)
     VALUES ($1, $2, $3, $4::text, $4::text, 'PROTOCOL', '1.0', 'synthetic-protocol.pdf', 1, 'application/pdf', $5, 'synthetic-local', 'synthetic-key', $6)`,
    [id, programId, mine.orgId, `TMF-${id}`, createHash('sha256').update(id).digest('hex'), userId],
  );
  return id;
}

const filingRow = async (id: string) =>
  (await owner.query(
    `SELECT id, study_ref, artifact_code, document_ref, created_by, removed_at, removed_by, removal_reason, xmin::text AS tx
       FROM tmf_artifact_filings WHERE id = $1`, [id])).rows[0];
/** The audit rows of one record, in chain order, each with the transaction that wrote it. */
const auditRows = async (table: string, recordId: string) =>
  (await owner.query(
    `SELECT action, user_id, reason, new_values AS details, sha256_chain, chain_seq, xmin::text AS tx
       FROM audit_logs WHERE tenant_id = $1 AND table_name = $2 AND record_id = $3 ORDER BY chain_seq`,
    [mine.orgId, table, recordId])).rows;
const listed = async () => (await (await api()).get(`${trial()}/artifacts`)).body as Array<{ id: string; artifactCode: string }>;

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  const org = await owner.query(
    `INSERT INTO organizations (name, slug, status) VALUES ($1, $1, 'active') RETURNING id, uuid`, [`${PROBE}-org`]);
  mine = { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid) };
  const made = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'TMF Filer', 'not-a-real-hash', 'active') RETURNING id`,
    [`${PROBE}@example.test`]);
  userId = Number(made.rows[0].id);
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Trialium 5mg') RETURNING id`,
    [`${PROBE} program`, PROBE.toUpperCase(), mine.orgId]);
  programId = String(prog.rows[0].id);
  await seedVaultFixtureParent(owner, { ...mine, programId }, { userId, namespace: `${PROBE}-parent` });
  await assertVaultFixtureRuntime({ ...mine, programId });
  const studyId = `${PROBE}-S`;
  const s = await owner.query(
    `INSERT INTO cdisc_prm_studies (tenant_id, study_id, program_id, protocol_id, protocol_title, protocol_version)
     VALUES ($1, $2, $3, 'PROT-GOV', 'Governed filing study', '1.0') RETURNING id`,
    [mine.orgId, studyId, programId]);
  study = { id: Number(s.rows[0].id), studyId };
  docA = await vaultDocument();
  docA2 = await vaultDocument();
}, 90_000);

afterAll(async () => {
  // Keep this invocation's records and append-only history.
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

describe('filing needs a reason, and is recorded with the change', () => {
  it('refuses a filing with no reason, or one under 8 characters, and writes nothing', async () => {
    for (const reason of [undefined, '', '   ', 'too few', '  1234567  ', 42]) {
      const res = await file('protocol', docA, reason);
      expect(res.status, `${JSON.stringify(reason)}: ${JSON.stringify(res.body)}`).toBe(400);
      expect(res.body).toMatchObject({ success: false, error: 'REASON_REQUIRED' });
      expect(typeof res.body.message).toBe('string');
    }
    expect(await listed()).toEqual([]);
    expect((await owner.query("SELECT 1 FROM audit_logs WHERE tenant_id = $1 AND table_name = 'tmf_artifact'", [mine.orgId])).rows).toEqual([]);
  });

  it('writes the filing and its audit row in one transaction, on the sequenced chain, naming the study and the document', async () => {
    const res = await file('protocol', docA, `  ${FILED_BECAUSE}  `);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.meta).toEqual({ auditTrail: { persisted: true, chained: true } });
    const row = await filingRow(res.body.id);
    const audit = await auditRows('tmf_artifact', res.body.id);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'TMF_ARTIFACT_FILED', user_id: userId, reason: FILED_BECAUSE });
    expect(audit[0].details).toMatchObject({
      study: { id: study.id, studyId: study.studyId, protocolId: 'PROT-GOV', title: 'Governed filing study' },
      programId, artifactCode: 'protocol', zone: 2, documentRef: `vault://${docA}`, outcome: 'filed', reason: FILED_BECAUSE,
    });
    expect(audit[0].details).not.toHaveProperty('replacedDocumentRef');
    expect(audit[0].sha256_chain).toMatch(/^[a-f0-9]{64}$/);
    // On the tenant's sequenced chain, not a legacy row written outside it.
    expect(audit[0].chain_seq).not.toBeNull();
    // One transaction wrote both rows: neither can exist without the other.
    expect(audit[0].tx).toBe(row.tx);
  });

  it('names the document a re-file replaced', async () => {
    const [before] = (await listed()).filter((f) => f.artifactCode === 'protocol');
    const res = await file('protocol', docA2, REFILED_BECAUSE);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.id).toBe(before.id);
    const row = await filingRow(before.id);
    const audit = await auditRows('tmf_artifact', before.id);
    expect(audit).toHaveLength(2);
    expect(audit[1]).toMatchObject({ action: 'TMF_ARTIFACT_FILED', reason: REFILED_BECAUSE });
    expect(audit[1].details).toMatchObject({ outcome: 'refiled', documentRef: `vault://${docA2}`, replacedDocumentRef: `vault://${docA}`,
      study: { id: study.id, studyId: study.studyId }, artifactCode: 'protocol' });
    expect(audit[1].tx).toBe(row.tx);
    expect(Number(audit[1].chain_seq)).toBeGreaterThan(Number(audit[0].chain_seq));
  });

  it('files a batch under one stated reason, each item with its own audit row', async () => {
    const refused = await (await api()).post(`${trial()}/artifacts/bulk`).send({ artifacts: [{ artifactCode: 'sample_crf', documentRef: `vault://${docA}` }] });
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ success: false, error: 'REASON_REQUIRED' });
    const res = await (await api()).post(`${trial()}/artifacts/bulk`).send({ reason: FILED_BECAUSE, artifacts: [
      { artifactCode: 'sample_crf', documentRef: `vault://${docA}` }, { artifactCode: 'investigators_brochure', documentRef: `vault://${docA2}` }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ filed: 2, total: 2, meta: { auditTrail: { persisted: true, chained: true } } });
    for (const filing of (await listed()).filter((f) => f.artifactCode !== 'protocol')) {
      const audit = await auditRows('tmf_artifact', filing.id);
      expect(audit).toMatchObject([{ action: 'TMF_ARTIFACT_FILED', reason: FILED_BECAUSE }]);
      expect(audit[0].tx).toBe((await filingRow(filing.id)).tx);
    }
  });
});

describe('a removal keeps the record', () => {
  let filingId: string;

  it('refuses a removal with no reason, and leaves the filing', async () => {
    filingId = (await listed()).find((f) => f.artifactCode === 'sample_crf')!.id;
    for (const body of [undefined, {}, { reason: 'short' }]) {
      const res = body === undefined
        ? await (await api()).delete(`/api/etmf/artifacts/${filingId}`)
        : await (await api()).delete(`/api/etmf/artifacts/${filingId}`).send(body);
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body).toMatchObject({ success: false, error: 'REASON_REQUIRED' });
    }
    expect((await listed()).map((f) => f.id)).toContain(filingId);
    expect(await filingRow(filingId)).toMatchObject({ removed_at: null, removed_by: null, removal_reason: null });
  });

  it('marks the row removed with who, when and why, in the audit row\'s own transaction', async () => {
    const res = await (await api()).delete(`/api/etmf/artifacts/${filingId}`).send({ reason: REMOVED_BECAUSE });
    expect(res.status, JSON.stringify(res.body)).toBe(204);
    expect(res.headers['x-audit-row-persisted']).toBe('true');
    const row = await filingRow(filingId);
    expect(row).toMatchObject({ id: filingId, study_ref: study.id, document_ref: `vault://${docA}`, removed_by: userId, removal_reason: REMOVED_BECAUSE });
    expect(row.removed_at).toBeInstanceOf(Date);
    const audit = await auditRows('tmf_artifact', filingId);
    expect(audit.map((a) => a.action)).toEqual(['TMF_ARTIFACT_FILED', 'TMF_ARTIFACT_REMOVED']);
    expect(audit[1]).toMatchObject({ user_id: userId, reason: REMOVED_BECAUSE });
    expect(audit[1].details).toMatchObject({ study: { id: study.id, studyId: study.studyId }, programId, artifactCode: 'sample_crf',
      documentRef: `vault://${docA}`, reason: REMOVED_BECAUSE });
    expect(audit[1].tx).toBe(row.tx);
    expect(audit[1].chain_seq).not.toBeNull();
  });

  it('is served by no reader once removed, and cannot be removed twice', async () => {
    expect((await listed()).map((f) => f.id)).not.toContain(filingId);
    const assessed = (await (await api()).get(`${trial()}/completeness`)).body;
    const zone2 = assessed.zones.find((z: { number: number }) => z.number === 2);
    expect(zone2.missing).toContain('sample_crf');
    expect(zone2.unverified.map((u: { code: string }) => u.code)).not.toContain('sample_crf');
    expect(assessed.documentEvidence.sample_crf).toBeUndefined();
    const pkg = await (await api()).get(`${trial()}/inspection-package`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pkg.status).toBe(200);
    const index = await (await JSZip.loadAsync(pkg.body as Buffer)).file('inspection-index.csv')!.async('string');
    expect(index).toMatch(/,protocol,/);
    expect(index).not.toMatch(/,sample_crf,/);
    const again = await (await api()).delete(`/api/etmf/artifacts/${filingId}`).send({ reason: REMOVED_BECAUSE });
    expect(again.status).toBe(404);
    expect(again.body).toMatchObject({ success: false, error: 'NOT_FOUND' });
    expect(await auditRows('tmf_artifact', filingId)).toHaveLength(2);
  });

  it('files the artifact again on the same row, and its audit row says which removal it cleared', async () => {
    const res = await file('sample_crf', docA2, REFILED_BECAUSE);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.id).toBe(filingId);
    const row = await filingRow(filingId);
    expect(row).toMatchObject({ document_ref: `vault://${docA2}`, removed_at: null, removed_by: null, removal_reason: null, study_ref: study.id });
    expect((await listed()).map((f) => f.id)).toContain(filingId);
    const audit = await auditRows('tmf_artifact', filingId);
    expect(audit.map((a) => a.action)).toEqual(['TMF_ARTIFACT_FILED', 'TMF_ARTIFACT_REMOVED', 'TMF_ARTIFACT_FILED']);
    expect(audit[2].details).toMatchObject({ outcome: 'filed_after_removal', documentRef: `vault://${docA2}`,
      clearedRemoval: { removedBy: userId, reason: REMOVED_BECAUSE, documentRef: `vault://${docA}` } });
    // A filing that follows a removal replaced no live document.
    expect(audit[2].details).not.toHaveProperty('replacedDocumentRef');
    expect(audit[2].tx).toBe(row.tx);
  });

  it('has the database refuse a removal that carries no reason', async () => {
    await expect(owner.query('UPDATE tmf_artifact_filings SET removed_at = now() WHERE id = $1', [filingId]))
      .rejects.toMatchObject({ code: '23514', constraint: 'tmf_artifact_filings_removal_recorded_chk' });
    await expect(owner.query("UPDATE tmf_artifact_filings SET removal_reason = 'a reason with no removal' WHERE id = $1", [filingId]))
      .rejects.toMatchObject({ code: '23514' });
  });
});

describe('a filing that takes the place of a row with no study says so', () => {
  it('records what the unlinked row held', async () => {
    await owner.query(
      `INSERT INTO tmf_artifact_filings (organization_id, trial_id, artifact_code, zone_number, document_ref, created_by)
       VALUES ($1, $2, 'sample_icf', 2, 'typed-by-hand-reference', $3)`,
      [mine.orgId, study.studyId, userId]);
    const res = await file('sample_icf', docA, FILED_BECAUSE);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const audit = await auditRows('tmf_artifact', res.body.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ outcome: 'filed_over_unlinked', documentRef: `vault://${docA}`,
      replacedUnlinkedFiling: { trialId: study.studyId, documentRef: 'typed-by-hand-reference' } });
    expect(audit[0].details).not.toHaveProperty('replacedDocumentRef');
  });
});

describe('the inspection package is a recorded download', () => {
  const download = async () => (await api()).get(`${trial()}/inspection-package?scope=essential`).buffer(true).parse((r, cb) => {
    const chunks: Buffer[] = [];
    r.on('data', (c: Buffer) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  });

  it('records EXPORT_GENERATED with the SHA-256 of the bytes it sent', async () => {
    const before = (await auditRows('tmf_inspection_package', String(study.id))).length;
    const res = await download();
    expect(res.status).toBe(200);
    const sha256 = createHash('sha256').update(res.body as Buffer).digest('hex');
    expect(res.headers['x-export-sha256']).toBe(sha256);
    expect(res.headers['x-tmf-sha256']).toBe(sha256);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="tmf-inspection-${study.studyId}.zip"`);
    const audit = await auditRows('tmf_inspection_package', String(study.id));
    expect(audit).toHaveLength(before + 1);
    const row = audit[audit.length - 1];
    expect(row).toMatchObject({ action: 'EXPORT_GENERATED', user_id: userId });
    expect(row.details).toMatchObject({ sha256, sourceType: 'export_zip', filename: `tmf-inspection-${study.studyId}.zip`,
      backendRoute: '/api/etmf/trials/:trialId/inspection-package', studyRef: study.id, studyId: study.studyId, scope: 'essential' });
  });

  it('sends nothing when the download cannot be recorded', async () => {
    const auditService = (await import('../../server/services/auditService')).default;
    const before = (await auditRows('tmf_inspection_package', String(study.id))).length;
    const spy = vi.spyOn(auditService, 'logAction').mockResolvedValueOnce({ persisted: false, chained: false, tamperProof: false, error: 'synthetic audit outage' } as never);
    try {
      const res = await (await api()).get(`${trial()}/inspection-package?scope=essential`);
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ success: false, error: 'UNAUDITED_EXPORT_REFUSED' });
      expect(JSON.stringify(res.body)).not.toContain('synthetic audit outage');
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['content-disposition']).toBeUndefined();
      expect(res.headers['x-tmf-sha256']).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
    expect(await auditRows('tmf_inspection_package', String(study.id))).toHaveLength(before);
  });
});

describe('the audit trail these acts wrote is one intact chain', () => {
  it('verifies the organization\'s chain after filings, a removal, a re-filing and a download', async () => {
    const q = await owner.connect();
    try {
      const { verifyAuditChain } = await import('../../server/services/audit/chain');
      const verified = await verifyAuditChain(q, { tenantId: mine.orgId });
      expect(verified).toMatchObject({ ok: true, tenants: 1 });
      // Every row these acts wrote is on the sequenced chain; none is a legacy row outside it.
      expect(verified.legacyRows).toBe(0);
      expect(verified.sequencedRows).toBeGreaterThanOrEqual(8);
    } finally { q.release(); }
  });
});
