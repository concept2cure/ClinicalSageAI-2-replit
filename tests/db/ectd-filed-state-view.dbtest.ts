/**
 * What the agency holds now, as one view (gap 6.1;
 * docs/design/ECTD_FILED_STATE_VIEW_2026-10-22.md; rows D2 and D7).
 *
 * The fold of a submission's filed sequences (prior-sequence-loader.ts) runs on
 * every compile and transmit, as of the sequence being built. No route
 * returned it, so nothing showed the application as the agency holds it. Here,
 * on PostgreSQL as the runtime role with RLS on, through the real route:
 *   - 0000 (acknowledged) filed two leaves; 0001 (sent) replaced one; 0002 was
 *     compiled as a preview and never sent; 0003 was sent but its only compile
 *     is a rehearsal;
 *   - the view holds the untouched leaf from 0000 and the replacement from
 *     0001, and nothing from 0002 or 0003, and lists those two as not folded;
 *   - another organisation's identical application is never read;
 *   - a program with no submission answers empty, not an error.
 *
 * 2026-11-01 (F1, rows D7 and D2): what the agency holds is what was sent. The
 * transmit guard records, on the transmittal row it writes before the wire, the
 * leaf manifest of the package it sent and the dispatch binding; the fold reads
 * each filed sequence from the transmittal its transmit attempt binds, and from
 * its compiles, labelled 'compiles', only for a sequence sent before that. Here,
 * as the runtime role under RLS:
 *   - a leaf only an earlier preview compile of the sent 0000 carried is not on
 *     file (the phantom leaf);
 *   - 0001, sent with no compile on record, is filed and its leaf is on file;
 *   - the sequences above, sent before the record was kept, say 'compiles'.
 * And (F1 review): another agency's row naming 0000's attempt, sequence and
 * signature, as a caller's metadata stored verbatim before the guard could, is
 * not read as what 0000 sent.
 */
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseUrl } from '../setup.db';

const RUN = randomUUID().slice(0, 8);
const TAG = `dbtest-filed-${RUN}`;
type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let userId: number;
let mine: Tenant;
let theirs: Tenant;
let empty: Tenant;
let sent: Tenant;
let submissionId: number;
let sentSubmissionId: number;

const leaf = (ctdSection: string, fileName: string, md5: string, operation = 'new', extra: Record<string, unknown> = {}) => ({
  ctdSection, fileName, md5, operation, title: `${fileName} (invented)`, href: `m3/${fileName}`,
  leafId: `leaf-${fileName.replace(/\W/g, '-')}`, backbone: 'index.xml', ...extra,
});

async function tenant(slug: string, programType = 'ind'): Promise<Tenant> {
  const org = (await owner.query(`INSERT INTO organizations (name, slug, status) VALUES ($1, $1, 'active') RETURNING id, uuid`, [`${TAG}-${slug}`])).rows[0];
  const prog = (await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, $4, 'drug', 'FDA', 'Invented product') RETURNING id`,
    [`${TAG} ${slug} program`, `${TAG}-${slug}`.toUpperCase(), org.id, programType])).rows[0];
  await owner.query('INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, $3)', [org.id, userId, 'admin']);
  return { orgId: Number(org.id), orgUuid: String(org.uuid), programId: String(prog.id) };
}

async function submission(t: Tenant): Promise<number> {
  return Number((await owner.query(
    `INSERT INTO submissions (title, application_type, client_type, primary_region, organization_id, created_by, program_id)
     VALUES ($1, 'ind', 'pharma', 'fda', $2, $3, $4) RETURNING id`, [`${TAG} IND 123456`, t.orgId, userId, t.programId])).rows[0].id);
}

async function filed(t: Tenant, sub: number, number: string, dispatch: string | null, compile: { type?: string; manifest: unknown[] } | null) {
  await owner.query(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by, dispatch_status)
     VALUES ($1, 'fda', $2, $3, $4, $5)`, [sub, number, t.orgId, userId, dispatch]);
  if (!compile) return;
  await owner.query(
    `INSERT INTO ectd_compilations (organization_id, compilation_name, compilation_type, status, application_number, sequence_number, leaf_manifest, submission_id, compiled_at)
     VALUES ($1, $2, $3, 'completed', 'IND 123456', $4, $5::json, $6, now())`,
    [t.orgId, `${TAG} ${number}`, compile.type ?? 'module', number, JSON.stringify(compile.manifest), sub]);
}

/** A sequence sent with the record the transmit guard keeps: its transmittal row, bound to its attempt
 *  and to the signature its transmit claim recorded. */
async function sentWithRecord(t: Tenant, sub: number, number: string, attemptId: string, manifest: unknown[]): Promise<number> {
  const signatureActionId = `${TAG}-sig-${number}`;
  const sequenceId = Number((await owner.query(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by, dispatch_status, transmit_attempt_id, transmit_signature_action_id)
     VALUES ($1, 'fda', $2, $3, $4, 'sent', $5, $6) RETURNING id`, [sub, number, t.orgId, userId, attemptId, signatureActionId])).rows[0].id);
  await transmittalRow(t, { region: 'fda', gateway: 'esg', transport: 'as2' }, { attemptId, sequenceId, signatureActionId }, number, manifest);
  return sequenceId;
}

/** A transmittal row of one gateway, carrying a binding and a leaf manifest in its metadata. */
async function transmittalRow(
  t: Tenant, route: { region: string; gateway: string; transport: string },
  binding: { attemptId: string; sequenceId: number; signatureActionId: string }, number: string, manifest: unknown[],
): Promise<void> {
  const { buildLeafManifest } = await import('../../server/services/ectd/sequence-manifest');
  const metadata = {
    applicationId: 'IND123456', sequence: number,
    dispatchBinding: { ...binding, organizationId: t.orgId, bundleSha256: 'a'.repeat(64) },
    leafManifest: buildLeafManifest(manifest as Parameters<typeof buildLeafManifest>[0]),
  };
  await owner.query(
    `INSERT INTO submission_transmittals (organization_id, region, gateway, format, transport, bundle_sha256, status, submitted_by, metadata)
     VALUES ($1, $2, $3, 'ectd', $4, $5, 'received', $6, $7::jsonb)`,
    [t.orgId, route.region, route.gateway, route.transport, 'a'.repeat(64), userId, JSON.stringify(metadata)]);
}

/** The real compile routes, as this tenant's admin, under the request's tenant scope. */
async function compileApp(t: Tenant) {
  const ectdCompileRoutes = (await import('../../server/routes/ectd-compile')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { userId, tenantId: t.orgId, userRole: 'admin',
      user: { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role: 'admin' } });
    next();
  });
  app.use(establishRequestTenantScope);
  app.use('/api/ectd-compile', ectdCompileRoutes);
  return app;
}

async function view(t: Tenant) {
  return request(await compileApp(t)).get(`/api/ectd-compile/${t.programId}/filed-state`);
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('APP_DATABASE_URL must use the provisioned non-owner runtime role.');
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  userId = Number((await owner.query(`INSERT INTO users (email, name, password_hash) VALUES ($1, 'Fil Ed', 'not-a-real-hash') RETURNING id`,
    [`${TAG}@example.invalid`])).rows[0].id);
  mine = await tenant('mine');
  theirs = await tenant('theirs');
  empty = await tenant('empty');
  sent = await tenant('sent');
  submissionId = await submission(mine);
  await filed(mine, submissionId, '0000', 'acknowledged', { manifest: [
    leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32)),
    leaf('5.3.5.1', 'csr.pdf', 'b'.repeat(32)),
  ] });
  await filed(mine, submissionId, '0001', 'sent', { manifest: [
    leaf('3.2.S.1', 'general-v2.pdf', 'c'.repeat(32), 'replace', { modifiedFile: '../0000/index.xml#leaf-general-pdf' }),
  ] });
  await filed(mine, submissionId, '0002', null, { manifest: [leaf('5.3.1', 'protocol.pdf', 'd'.repeat(32))] });
  await filed(mine, submissionId, '0003', 'sent', { type: 'rehearsal', manifest: [leaf('5.3.1', 'rehearsed.pdf', 'e'.repeat(32))] });
  const theirSub = await submission(theirs);
  await filed(theirs, theirSub, '0000', 'sent', { manifest: [leaf('2.5', 'foreign.pdf', 'f'.repeat(32))] });
  // 0000: a preview compile carried a draft leaf; what was sent did not.
  sentSubmissionId = await submission(sent);
  const attempt0000 = randomUUID();
  const sent0000 = await sentWithRecord(sent, sentSubmissionId, '0000', attempt0000, [leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32))]);
  // A CESP row naming the FDA 0000's attempt, sequence and signature, as one written before the guard
  // stamped those keys could (the EMA gateways stored a caller's metadata verbatim): not its send.
  await transmittalRow(sent, { region: 'ema', gateway: 'cesp', transport: 'rest' },
    { attemptId: attempt0000, sequenceId: sent0000, signatureActionId: `${TAG}-sig-0000` }, '0000', [leaf('3.2.S.1', 'invented.pdf', 'f'.repeat(32))]);
  await owner.query(
    `INSERT INTO ectd_compilations (organization_id, compilation_name, compilation_type, status, application_number, sequence_number, leaf_manifest, submission_id, compiled_at)
     VALUES ($1, $2, 'module', 'completed', 'IND 123456', '0000', $3::json, $4, now() - interval '1 day')`,
    [sent.orgId, `${TAG} sent 0000 preview`, JSON.stringify([leaf('3.2.S.1', 'general.pdf', 'a'.repeat(32)), leaf('3.2.S.2', 'draft-only.pdf', 'b'.repeat(32))]), sentSubmissionId]);
  // 0001: sent with no compile on record.
  await sentWithRecord(sent, sentSubmissionId, '0001', randomUUID(), [leaf('5.3.5.1', 'csr.pdf', 'c'.repeat(32))]);
}, 120_000);

afterAll(async () => {
  if (owner) await owner.query(`UPDATE organizations SET status = 'inactive' WHERE id = ANY($1::int[])`, [[mine?.orgId, theirs?.orgId, empty?.orgId, sent?.orgId].filter(Boolean)]);
  const { getPool } = await import('../../server/db/runtime');
  await getPool().end(); await owner?.end();
});

describe('the current view of what the agency holds', () => {
  it('folds every filed sequence: the untouched leaf from 0000, the replacement from 0001, nothing never sent', async () => {
    const res = await view(mine);
    expect(res.status, JSON.stringify(res.body).slice(0, 400)).toBe(200);
    expect(res.body).toMatchObject({ submissionId, throughSequence: '0001' });
    expect(res.body.leaves).toEqual([
      { ctdSection: '3.2.S.1', fileName: 'general-v2.pdf', title: 'general-v2.pdf (invented)', href: 'm3/general-v2.pdf', sequenceNumber: '0001', operation: 'replace', md5: 'c'.repeat(32),
        // The replacement under a new name carries the leaf it took off file (gap 6.2).
        history: [{ sequenceNumber: '0000', operation: 'new', fileName: 'general.pdf' }, { sequenceNumber: '0001', operation: 'replace', fileName: 'general-v2.pdf' }] },
      { ctdSection: '5.3.5.1', fileName: 'csr.pdf', title: 'csr.pdf (invented)', href: 'm3/csr.pdf', sequenceNumber: '0000', operation: 'new', md5: 'b'.repeat(32),
        history: [{ sequenceNumber: '0000', operation: 'new', fileName: 'csr.pdf' }] },
    ]);
  });

  it('lists every sequence and says which it did not fold', async () => {
    const res = await view(mine);
    expect(res.body.sequences).toEqual([
      // Sent before the transmit guard kept what each send carried: read from their compiles, and labelled so.
      { sequenceNumber: '0000', dispatchStatus: 'acknowledged', filed: true, basis: 'compiles' },
      { sequenceNumber: '0001', dispatchStatus: 'sent', filed: true, basis: 'compiles' },
      { sequenceNumber: '0002', dispatchStatus: null, filed: false, basis: null },
      { sequenceNumber: '0003', dispatchStatus: 'sent', filed: false, basis: null },
    ]);
  });

  it('never reads another organisation’s filings, and answers empty for a program with no submission', async () => {
    const theirsView = await view(theirs);
    expect(theirsView.status).toBe(200);
    expect(theirsView.body.leaves.map((l: { fileName: string }) => l.fileName)).toEqual(['foreign.pdf']);
    const none = await view(empty);
    expect(none.status, JSON.stringify(none.body)).toBe(200);
    expect(none.body).toEqual({ projectIdent: empty.programId, submissionId: null, throughSequence: null, sequences: [], leaves: [] });
  });
});

describe('what the agency holds is what was sent (F1)', () => {
  it('a leaf only an earlier preview of the sent sequence carried is not on file', async () => {
    const res = await view(sent);
    expect(res.status, JSON.stringify(res.body).slice(0, 400)).toBe(200);
    expect(res.body.leaves.map((l: { fileName: string; sequenceNumber: string }) => [l.fileName, l.sequenceNumber]))
      .toEqual([['general.pdf', '0000'], ['csr.pdf', '0001']]);
  });

  it('a sequence sent with no compile on record is filed, read from what its transmit recorded', async () => {
    const res = await view(sent);
    expect(res.body).toMatchObject({ submissionId: sentSubmissionId, throughSequence: '0001' });
    expect(res.body.sequences).toEqual([
      { sequenceNumber: '0000', dispatchStatus: 'sent', filed: true, basis: 'transmit' },
      { sequenceNumber: '0001', dispatchStatus: 'sent', filed: true, basis: 'transmit' },
    ]);
  });
});

/* P-99 C1 (F1): a compile of a sequence already sent is not recorded as what it sent. Before C1 such a compile
   wrote a row the fold then read as what was sent ('compiles'), restoring the sequence silently. The route test
   (tests/routes/ectd-compile-sent-sequence.test.ts) mocks pg; this is the design's case on PostgreSQL as the runtime
   role under RLS, owed by docs/evidence/D7-ECTD-FILED-STATE-VIEW/2026-11-09-no-silent-restore/. */
describe('a compile of a sequence already on file is refused and not recorded (P-99 C1)', () => {
  it('a sent sequence with a placed leaf and no compile: 409, no compilation row, and the view unchanged', async () => {
    const t = await tenant('on-file');
    const sub = await submission(t);
    const sequenceId = Number((await owner.query(
      `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by, dispatch_status)
       VALUES ($1, 'fda', '0000', $2, $3, 'sent') RETURNING id`, [sub, t.orgId, userId])).rows[0].id);
    await owner.query(
      `INSERT INTO submission_leaves (sequence_id, section_code, title, organization_id, created_by)
       VALUES ($1, '3.2.S.1', 'General information (invented)', $2, $3)`, [sequenceId, t.orgId, userId]);
    const before = await view(t);
    expect(before.status, JSON.stringify(before.body).slice(0, 400)).toBe(200);
    expect(before.body.sequences).toEqual([{ sequenceNumber: '0000', dispatchStatus: 'sent', filed: false, basis: null }]);
    const res = await request(await compileApp(t)).post(`/api/ectd-compile/${t.programId}/compile`).send({ sequenceId });
    expect(res.status, JSON.stringify(res.body).slice(0, 400)).toBe(409);
    expect(res.body.error).toEqual({ code: 'ECTD_SEQUENCE_ON_FILE',
      message: expect.stringMatching(/^Sequence 0000 is on file at the agency, so a compile of it now is not recorded: it would not be what it sent\./) });
    expect((await owner.query(`SELECT count(*)::int AS n FROM ectd_compilations WHERE organization_id = $1`, [t.orgId])).rows[0].n).toBe(0);
    expect((await view(t)).body).toEqual(before.body);
  });
});

/* T11 (design §5, C2): the act itself, through its real routes, as the runtime role under RLS. It finds the send's
   row and the bytes the platform kept, records what the package carried and nothing else, and the view reads it. */
async function anchored(slug: string): Promise<Tenant> {
  const t = await tenant(slug);
  const ws = (await owner.query(`INSERT INTO client_workspaces (organization_id, name, slug, status, created_by_id)
    VALUES ($1, $2, $2, 'active', $3) RETURNING id`, [t.orgId, `${TAG}-${slug}-ws`, userId])).rows[0].id;
  await owner.query(`INSERT INTO projects (organization_id, client_workspace_id, name, type, status, regulatory_program_id, created_by_id)
    VALUES ($1, $2, $3, 'regulatory', 'active', $4, $5)`, [t.orgId, ws, `${TAG}-${slug}-project`, t.programId, userId]);
  return t;
}
async function keptSend(t: Tenant, sub: number): Promise<{ seqId: number; leaves: string[] }> {
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const nodePath = await import('node:path');
  const { createHash } = await import('node:crypto');
  const { packageEctdSubmission } = await import('../../server/services/submission-gateways/regional-packager');
  const { plainPdfFixture } = await import('../../server/services/ectd/__tests__/support/signed-pdf-fixture');
  const { getStorageProvider } = await import('../../server/services/storage');
  const work = await fs.mkdtemp(nodePath.join(os.tmpdir(), 'p99-t11-'));
  const src = nodePath.join(work, 'overview.pdf');
  await fs.writeFile(src, await plainPdfFixture('Clinical overview (invented)'));
  const bundle = await packageEctdSubmission({ region: 'fda', applicationId: '123456', sequence: '0000', submissionType: 'original',
    fda: { applicationType: 'ind' }, sponsorId: 'D', sponsorName: 'Invented sponsor', productName: 'Invented product',
    outputDir: nodePath.join(work, 'out'), environment: 'staging',
    leaves: [{ ctdSection: '2.5', fileName: 'clinical-overview.pdf', title: 'Clinical overview', operation: 'new', sourcePath: src }],
  } as Parameters<typeof packageEctdSubmission>[0]);
  const bytes = await fs.readFile(bundle.path);
  await fs.rm(work, { recursive: true, force: true });
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const kept = await getStorageProvider().put({ orgId: t.orgId, projectId: 'sent-packages', filename: `fda-esg-${sha256}.zip`, bytes,
    mime: 'application/zip', metadata: { kind: 'sent-package', region: 'fda', gateway: 'esg', environment: 'production', sha256 } });
  const attemptId = randomUUID();
  const signatureActionId = `${TAG}-t11-sig`;
  const seqId = Number((await owner.query(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by, dispatch_status, transmit_attempt_id, transmit_signature_action_id)
     VALUES ($1, 'fda', '0000', $2, $3, 'sent', $4, $5) RETURNING id`, [sub, t.orgId, userId, attemptId, signatureActionId])).rows[0].id);
  const metadata = { sequence: '0000', environment: 'production',
    dispatchBinding: { organizationId: t.orgId, sequenceId: seqId, signatureActionId, attemptId, bundleSha256: sha256 },
    sentPackage: { storageVersionId: kept.vaultVersionId, provider: kept.provider, sha256, sizeBytes: bytes.length, filename: `fda-esg-${sha256}.zip` } };
  await owner.query(`INSERT INTO submission_transmittals (organization_id, program_id, region, gateway, format, transport, bundle_sha256, status, submitted_by, metadata)
     VALUES ($1, $2, 'fda', 'esg', 'ectd', 'as2', $3, 'received', $4, $5::jsonb)`, [t.orgId, t.programId, sha256, userId, JSON.stringify(metadata)]);
  return { seqId, leaves: ['clinical-overview.pdf'] };
}
async function submissionsApp(t: Tenant) {
  const submissionsRoutes = (await import('../../server/routes/submissions')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { userId, tenantId: t.orgId, userRole: 'admin',
      user: { id: userId, organizationId: t.orgId, organizationUuid: t.orgUuid, role: 'admin' } });
    next();
  });
  app.use(establishRequestTenantScope);
  app.use('/api/submissions', submissionsRoutes);
  return app;
}

/* P-99 C2 (F1): a send put on record after it was sent, read back from the package it sent. The record is on the send's
   own transmittal row (leafManifest with leafManifestDerivation), bound by dispatchBinding or, where the gateway wrote
   none, by the restoredBinding the act wrote from the send's chained record. Here, as the runtime role under RLS. */
describe('a send put on record after it was sent (P-99 C2)', () => {
  const readBack = (on: string) => ({ method: 'sent-package-read', version: 1, manifestSha256: 'a'.repeat(64), leafCount: 1, derivedAt: on });
  async function legacySent(t: Tenant, sub: number, number: string): Promise<number> {
    return Number((await owner.query(
      `INSERT INTO ectd_sequences (submission_id, region, sequence_number, organization_id, created_by, dispatch_status)
       VALUES ($1, 'fda', $2, $3, $4, 'sent') RETURNING id`, [sub, number, t.orgId, userId])).rows[0].id);
  }
  async function restoredRow(t: Tenant, sequenceId: number, number: string, fileName: string) {
    const { buildLeafManifest } = await import('../../server/services/ectd/sequence-manifest');
    const metadata = { sequence: number, environment: 'production',
      restoredBinding: { sequenceId, attemptId: null, signatureActionId: null, source: 'ECTD_TRANSMITTED', transmittalId: 0 },
      leafManifest: buildLeafManifest([leaf('2.5', fileName, 'd'.repeat(32))] as Parameters<typeof buildLeafManifest>[0]),
      leafManifestDerivation: readBack('2026-11-04T09:00:00.000Z') };
    await owner.query(`INSERT INTO submission_transmittals (organization_id, region, gateway, format, transport, bundle_sha256, status, submitted_by, metadata)
       VALUES ($1, 'fda', 'esg', 'ectd', 'as2', $2, 'received', $3, $4::jsonb)`, [t.orgId, 'a'.repeat(64), userId, JSON.stringify(metadata)]);
  }

  it('a send whose gateway wrote no binding, read back and bound from its chained record, is read as sent, and says when', async () => {
    const t = await tenant('read-back');
    const sub = await submission(t);
    const seqId = await legacySent(t, sub, '0000');
    await restoredRow(t, seqId, '0000', 'overview.pdf');
    const res = await view(t);
    expect(res.status, JSON.stringify(res.body).slice(0, 400)).toBe(200);
    expect(res.body.sequences).toEqual([{ sequenceNumber: '0000', dispatchStatus: 'sent', filed: true, basis: 'transmit', restored: { how: 'read-back', on: '2026-11-04T09:00:00.000Z' } }]);
    expect(res.body.leaves.map((l: { fileName: string }) => l.fileName)).toEqual(['overview.pdf']);
  });

  it('T11 the act, through its routes as the runtime role under RLS, finds the send and its bytes and records what it carried', async () => {
    const t = await anchored('read-back-act');
    const sub = await submission(t);
    const { seqId, leaves } = await keptSend(t, sub);
    const app = await submissionsApp(t);
    const pre = await request(app).post(`/api/submissions/sequences/${seqId}/governed-precheck`).send({ step: 'sent-record' });
    expect(pre.status, JSON.stringify(pre.body).slice(0, 600)).toBe(200);
    expect(pre.body).toMatchObject({ step: 'sent-record', cleared: true, refusal: null, sentRecord: { basis: 'none', path: 'read-back' } });
    const rb = pre.body.sentRecord.readBack;
    expect(rb.leaves.map((l: { fileName: string }) => l.fileName)).toEqual(leaves);
    const done = await request(app).post(`/api/submissions/sequences/${seqId}/sent-record/rederive`).send({ reason: 'T11: read it back', manifestSha256: rb.manifestSha256 });
    expect(done.status, JSON.stringify(done.body).slice(0, 600)).toBe(200);
    expect(done.body).toMatchObject({ recorded: true, sequenceId: seqId, leafCount: 1, manifestSha256: rb.manifestSha256 });
    const row = (await owner.query(`SELECT metadata FROM submission_transmittals WHERE organization_id = $1`, [t.orgId])).rows[0].metadata;
    expect(row.leafManifest.map((l: { fileName: string }) => l.fileName)).toEqual(leaves);
    expect(row.leafManifestDerivation).toMatchObject({ method: 'sent-package-read', version: 1, manifestSha256: rb.manifestSha256, derivedBy: userId, reason: 'T11: read it back' });
    expect((await owner.query(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'ECTD_SENT_RECORD_REDERIVED' AND record_id = $1 AND tenant_id = $2`,
      [String(seqId), t.orgId])).rows[0].n).toBe(1);
    const res = await view(t);
    expect(res.body.sequences).toEqual([expect.objectContaining({ sequenceNumber: '0000', filed: true, basis: 'transmit', restored: { how: 'read-back', on: expect.any(String) } })]);
  }, 120_000);

  it('a restored binding in another organisation naming the same sequence id is never read', async () => {
    const mineT = await tenant('read-back-mine');
    const sub = await submission(mineT);
    const seqId = await legacySent(mineT, sub, '0000');
    const other = await tenant('read-back-theirs');
    await restoredRow(other, seqId, '0000', 'foreign.pdf');
    const res = await view(mineT);
    expect(res.body.sequences).toEqual([{ sequenceNumber: '0000', dispatchStatus: 'sent', filed: false, basis: null }]);
    expect(res.body.leaves).toEqual([]);
  });
});

/* 3b slice 3 (c), under founder decision P-97 (2026-11-02, "Keep filed state
   regardless"): a project that is not an application is refused the filed state
   only when it has no dispatched sequence. One that does (an IND anchored to a
   CSR project before 5ab138ed3 refused it) keeps what is on file, read from the
   submission that holds that sequence, though its type resolves no spine. */
describe('a project that is not an application keeps its filed state once it has filed (P-97)', () => {
  it('a clinical study report project that filed shows what is on file', async () => {
    const csr = await tenant('csr-filed', 'csr');
    const sub = await submission(csr);
    await sentWithRecord(csr, sub, '0000', randomUUID(), [leaf('3.2.S.1.1', 'nomenclature.pdf', 'c'.repeat(32))]);
    const res = await view(csr);
    expect(res.status).toBe(200);
    expect(res.body.submissionId).toBe(sub);
    expect(res.body.sequences).toEqual([expect.objectContaining({ sequenceNumber: '0000', dispatchStatus: 'sent', filed: true, basis: 'transmit' })]);
    expect(res.body.leaves.map((l: { fileName: string }) => l.fileName)).toEqual(['nomenclature.pdf']);
  });

  it('a clinical study report project that never filed is refused, by name', async () => {
    const csr = await tenant('csr-unfiled', 'csr');
    const res = await view(csr);
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({ code: 'ECTD_NOT_APPLICABLE', message: expect.stringMatching(/^This project is a clinical study report, authored here and not compiled as an eCTD sequence\./) });
  });
});
