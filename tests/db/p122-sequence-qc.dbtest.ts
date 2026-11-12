/**
 * P-122 (2026-11-10): Submission Center's eCTD view shows a sequence's QC: what changed against the previous
 * sequence (`GET /api/ind-lifecycle/sequence/:id/diff`) and the package manifest (`/manifest`), each with its PDF.
 * Both were built and never called (CLAUDE.md Rule 3), and production refused them as unattributed.
 *
 * Through the production IND lifecycle router behind the production auth boundary and the launch-scope gate as
 * production runs it (`LAUNCH_SCOPE_ENFORCE` on, unclaimed paths refused), as app_service with RLS enforcing:
 *   - a member of the organisation reads both for a project they can open (200), with the real leaves and checksums;
 *   - another organisation is refused (404), and so is a colleague not on a private project (403
 *     PROJECT_PERMISSION_DENIED, the refusal every Submission Center sequence read gives): getSequence answers for any
 *     sequence of the organisation, so the routes now admit the sequence's project first;
 *   - a diff compares two sequences of one submission;
 *   - what was not admitted under /sequence is still refused (403 LAUNCH_SCOPE): validate, the dispatch gate and its
 *     snapshots.
 *
 * Evidence: docs/evidence/DESIGN/P-122/vault-authoring-submission/4-sequence-qc/.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';
import { getPool } from '../../server/db/runtime';
import { runWithTenantScope } from '../../server/db/tenantStore';
import { createAuthBoundary } from '../../server/middleware/authBoundary';
import { authenticateToken } from '../../server/middleware/auth';
import { buildPrefixMap, moduleEntitlementGate } from '../../server/middleware/moduleEntitlementGate';
import indLifecycleRoutes from '../../server/routes/ind-lifecycle.routes';
import { accessToken, auth } from './two-tenant-fixture';

const TAG = `p122-qc-${randomUUID().slice(0, 8)}`;
let owner: Pool;
let app: express.Express;
const org = { A: 0, B: 0 };
const user = { ownerA: 0, memberA: 0, memberB: 0 };
type Filing = { submission: number; seq0: number; seq1: number };
const filing: Record<'open' | 'priv' | 'theirs', Filing> = {
  open: { submission: 0, seq0: 0, seq1: 0 }, priv: { submission: 0, seq0: 0, seq1: 0 }, theirs: { submission: 0, seq0: 0, seq1: 0 },
};

const one = async (sql: string, params: unknown[]) => Number((await owner.query(sql, params)).rows[0].id);

async function member(organizationId: number, label: string): Promise<number> {
  const id = await one(`INSERT INTO users(email,name,password_hash,default_organization_id,status)
    VALUES($1,$2,'not-a-real-password',$3,'active') RETURNING id`, [`${TAG}-${label}@example.invalid`, `P122 ${label}`, organizationId]);
  await owner.query(`INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')`, [organizationId, id]);
  return id;
}

async function organization(key: 'A' | 'B'): Promise<number> {
  org[key] = await one(`INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id`, [`${TAG}-${key}`]);
  return one(`INSERT INTO client_workspaces(organization_id,name,slug,status) VALUES($1,$2,$2,'active') RETURNING id`,
    [org[key], `${TAG}-${key}-workspace`]);
}

/** A US IND project with two sequences: 0000 (two leaves) and 0001 (one replaced, one new). */
async function indFiling(organizationId: number, workspace: number, ownerId: number, label: string, visibility: string): Promise<Filing> {
  const programId = randomUUID();
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status)
    VALUES($1,$2,$3,$4,'IND','drug','FDA','Invented QA product',$5,'active')`, [programId, organizationId, `${TAG}-${label}`, `QC-${programId.slice(0, 8)}`, ownerId]);
  const projectId = await one(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id)
    VALUES($1,$2,$3,'regulatory','active',$4,$4,$5) RETURNING id`, [organizationId, workspace, `${TAG}-${label}`, ownerId, programId]);
  await owner.query(`INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,$3)`, [organizationId, projectId, visibility]);
  if (visibility === 'private') {
    await owner.query(`INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'owner','active')`,
      [organizationId, projectId, ownerId]);
  }
  const submission = await one(`INSERT INTO submissions(title,application_type,client_type,primary_region,organization_id,created_by,program_id)
    VALUES($1,'IND','biotech','fda',$2,$3,$4) RETURNING id`, [`${TAG}-${label} IND`, organizationId, ownerId, programId]);
  const seq = (n: string, type: string) => one(`INSERT INTO ectd_sequences(submission_id,region,sequence_number,type,organization_id,created_by)
    VALUES($1,'fda',$2,$3,$4,$5) RETURNING id`, [submission, n, type, organizationId, ownerId]);
  const seq0 = await seq('0000', 'original');
  const seq1 = await seq('0001', 'amendment');
  const leaf = (sequenceId: number, code: string, title: string, op: string, checksum: string) => owner.query(
    `INSERT INTO submission_leaves(sequence_id,section_code,title,lifecycle_op,checksum,organization_id,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7)`, [sequenceId, code, title, op, checksum, organizationId, ownerId]);
  await leaf(seq0, 'm1.2', 'Cover letter', 'new', 'a'.repeat(64));
  await leaf(seq0, 'm2.5', 'Clinical overview', 'new', 'b'.repeat(64));
  await leaf(seq1, 'm2.5', 'Clinical overview', 'replace', 'c'.repeat(64));
  await leaf(seq1, 'm3.2.p', 'Drug product', 'new', 'd'.repeat(64));
  return { submission, seq0, seq1 };
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('Restricted APP_DATABASE_URL is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const workspaceA = await organization('A');
  const workspaceB = await organization('B');
  const posture = await runWithTenantScope({ tenantId: String(org.A), role: 'member', source: 'test', caller: 'p122-sequence-qc' },
    () => getPool().query(`SELECT current_user AS role, r.rolbypassrls, current_setting('app.rls_enforce', true) AS enforcement
      FROM pg_roles r WHERE r.rolname = current_user`));
  expect(posture.rows).toEqual([{ role: 'app_service', rolbypassrls: false, enforcement: 'on' }]);

  user.ownerA = await member(org.A, 'owner-a');
  user.memberA = await member(org.A, 'member-a');
  user.memberB = await member(org.B, 'member-b');
  filing.open = await indFiling(org.A, workspaceA, user.ownerA, 'open', 'org_public');
  filing.priv = await indFiling(org.A, workspaceA, user.ownerA, 'private', 'private');
  filing.theirs = await indFiling(org.B, workspaceB, user.memberB, 'theirs', 'org_public');

  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  /* As production builds it: launch scope on, a path nothing claims refused. */
  app.use(moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on', unattributed: 'enforce' }));
  app.use('/api/ind-lifecycle', authenticateToken, indLifecycleRoutes);
}, 120_000);

afterAll(async () => {
  await getPool().end().catch(() => {});
  await owner?.end().catch(() => {});
});

const as = (who: keyof typeof user) => auth(accessToken(user[who], who === 'memberB' ? org.B : org.A, 'member'));
const get = (who: keyof typeof user, path: string) => request(app).get(path).set(as(who));
const diffOf = (f: Filing) => `/api/ind-lifecycle/sequence/${f.seq1}/diff?priorId=${f.seq0}`;
const manifestOf = (f: Filing) => `/api/ind-lifecycle/sequence/${f.seq1}/manifest`;

describe('the sequence QC is served for a member of the organisation', () => {
  it('what changed against the previous sequence, leaf by leaf', async () => {
    const res = await get('memberA', diffOf(filing.open));
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    expect(res.body).toMatchObject({ priorSequenceNumber: '0000', currentSequenceNumber: '0001' });
    const bySection = Object.fromEntries((res.body.entries as Array<{ sectionCode: string; change: string }>).map((c) => [c.sectionCode, c.change]));
    expect(bySection).toEqual({ 'm1.2': 'deleted', 'm2.5': 'replaced', 'm3.2.p': 'added' });
    expect(res.body.summary).toMatchObject({ added: 1, replaced: 1, deleted: 1, total: 3 });
  });

  it('the package manifest, every leaf by module with its checksum', async () => {
    const res = await get('memberA', manifestOf(filing.open));
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    expect(res.body).toMatchObject({ sequenceNumber: '0001', totalLeaves: 2, missingChecksums: 0 });
    expect(JSON.stringify(res.body)).toContain('d'.repeat(64));
    expect(JSON.stringify(res.body)).not.toContain('a'.repeat(64));
  });

  it('the PDF of each', async () => {
    const diff = await get('memberA', diffOf(filing.open).replace('/diff?', '/diff/pdf?'));
    expect([200, 503], JSON.stringify(diff.body).slice(0, 200)).toContain(diff.status);
    const manifest = await get('memberA', `${manifestOf(filing.open)}/pdf`);
    expect([200, 503], JSON.stringify(manifest.body).slice(0, 200)).toContain(manifest.status);
    if (diff.status === 200) expect(diff.headers['content-type']).toContain('application/pdf');
  });
});

describe('and refused to anyone who cannot open the project', () => {
  it('another organisation', async () => {
    expect((await get('memberB', diffOf(filing.open))).status).toBe(404);
    expect((await get('memberB', manifestOf(filing.open))).status).toBe(404);
    expect((await get('memberB', `${manifestOf(filing.open)}/pdf`)).status).toBe(404);
  });

  /* The refusal every Submission Center sequence read gives (readSubmissionSequenceForRequest): the project is the
     organisation's, and this person may not open it. */
  it('a colleague who is not on a private project', async () => {
    for (const path of [diffOf(filing.priv), manifestOf(filing.priv), `${manifestOf(filing.priv)}/pdf`]) {
      const refused = await get('memberA', path);
      expect(refused.status, path).toBe(403);
      expect(refused.body.error?.code).toBe('PROJECT_PERMISSION_DENIED');
    }
    expect((await get('ownerA', manifestOf(filing.priv))).status).toBe(200);
  });

  it('a diff across two submissions', async () => {
    const res = await get('ownerA', `/api/ind-lifecycle/sequence/${filing.open.seq1}/diff?priorId=${filing.priv.seq0}`);
    expect(res.status).toBe(400);
  });
});

describe('what was not admitted under /sequence is still refused in production', () => {
  it.each([
    ['validation', 'get', 'validate'],
    ['the dispatch gate', 'post', 'dispatch-gate'],
    ['a persisted readiness snapshot', 'post', 'dispatch-gate/snapshot'],
    ['the snapshot list', 'get', 'snapshots'],
  ])('%s', async (_name, method, tail) => {
    const path = `/api/ind-lifecycle/sequence/${filing.open.seq1}/${tail}`;
    const res = method === 'get' ? await get('memberA', path) : await request(app).post(path).set(as('memberA')).send({});
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('LAUNCH_SCOPE');
  });
});
