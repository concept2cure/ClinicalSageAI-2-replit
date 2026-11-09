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

async function view(t: Tenant) {
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
  return request(app).get(`/api/ectd-compile/${t.programId}/filed-state`);
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
