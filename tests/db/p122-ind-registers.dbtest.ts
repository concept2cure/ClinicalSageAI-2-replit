/**
 * P-122 (2026-11-10): the IND screen in Submission Center shows the registers the IND lifecycle routes keep
 * (`server/routes/ind-lifecycle/registers.routes.ts`), which were built and had no screen, and production refused
 * them as unattributed.
 *
 * Through the production IND lifecycle router behind the production auth boundary and the launch-scope gate as
 * production runs it (`LAUNCH_SCOPE_ENFORCE` on, unclaimed paths refused), as app_service with RLS enforcing:
 *   - a member of the organisation works a register on a project they can open (200 / 201 / 204);
 *   - another organisation is refused (404), and so is a colleague not on a private project (403
 *     PROJECT_PERMISSION_DENIED, the refusal every Submission Center submission read gives): the persistence services
 *     answer by organisation and submission id, so the routes now admit the submission's project first;
 *   - every route under /api/ind-lifecycle that nothing claims is still refused (403 LAUNCH_SCOPE), the IND
 *     safety-report and ICSR registers among them (P-32), enumerated from the routers themselves.
 *
 * Evidence: docs/evidence/DESIGN/P-122/ind-registers/.
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
import { NEVER_GATED } from '../../server/services/entitlements/api-prefix-map';
import { launchScopeApiVerdict } from '../../server/services/entitlements/launch-scope-api';
import indLifecycleRoutes from '../../server/routes/ind-lifecycle.routes';
import { indLifecycleRoutes as listIndLifecycleRoutes } from '../../server/routes/ind-lifecycle/openapi';
import { accessToken, auth } from './two-tenant-fixture';

const TAG = `p122-reg-${randomUUID().slice(0, 8)}`;
let owner: Pool;
let app: express.Express;
const org = { A: 0, B: 0 };
/* memberA edits the organisation-wide project; readerA can open it and edits nothing. */
const user = { ownerA: 0, memberA: 0, readerA: 0, memberB: 0 };
const ind = { open: 0, priv: 0, theirs: 0 };

const one = async (sql: string, params: unknown[]) => (await owner.query(sql, params)).rows[0].id;

async function member(organizationId: number, label: string): Promise<number> {
  const id = Number(await one(`INSERT INTO users(email,name,password_hash,default_organization_id,status)
    VALUES($1,$2,'not-a-real-password',$3,'active') RETURNING id`, [`${TAG}-${label}@example.invalid`, `P122 ${label}`, organizationId]));
  await owner.query(`INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')`, [organizationId, id]);
  return id;
}

async function organization(key: 'A' | 'B'): Promise<number> {
  org[key] = Number(await one(`INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id`, [`${TAG}-${key}`]));
  return Number(await one(`INSERT INTO client_workspaces(organization_id,name,slug,status) VALUES($1,$2,$2,'active') RETURNING id`,
    [org[key], `${TAG}-${key}-workspace`]));
}

/** A US IND project and its submission; `editor` is given edit on the project. */
async function indSubmission(organizationId: number, workspace: number, ownerId: number, label: string,
  project: { visibility: string; editor?: number }): Promise<number> {
  const { visibility, editor } = project;
  const programId = randomUUID();
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status)
    VALUES($1,$2,$3,$4,'IND','drug','FDA','Invented QA product',$5,'active')`, [programId, organizationId, `${TAG}-${label}`, `RG-${programId.slice(0, 8)}`, ownerId]);
  const projectId = Number(await one(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id)
    VALUES($1,$2,$3,'regulatory','active',$4,$4,$5) RETURNING id`, [organizationId, workspace, `${TAG}-${label}`, ownerId, programId]));
  await owner.query(`INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,$3)`, [organizationId, projectId, visibility]);
  if (visibility === 'private') {
    await owner.query(`INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'owner','active')`,
      [organizationId, projectId, ownerId]);
  }
  if (editor) {
    await owner.query(`INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,'edit','active')`,
      [organizationId, projectId, editor]);
  }
  return Number(await one(`INSERT INTO submissions(title,application_type,client_type,primary_region,organization_id,created_by,program_id)
    VALUES($1,'IND','biotech','fda',$2,$3,$4) RETURNING id`, [`${TAG}-${label} IND`, organizationId, ownerId, programId]));
}

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('Restricted APP_DATABASE_URL is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const workspaceA = await organization('A');
  const workspaceB = await organization('B');
  const posture = await runWithTenantScope({ tenantId: String(org.A), role: 'member', source: 'test', caller: 'p122-ind-registers' },
    () => getPool().query(`SELECT current_user AS role, r.rolbypassrls, current_setting('app.rls_enforce', true) AS enforcement
      FROM pg_roles r WHERE r.rolname = current_user`));
  expect(posture.rows).toEqual([{ role: 'app_service', rolbypassrls: false, enforcement: 'on' }]);

  user.ownerA = await member(org.A, 'owner-a');
  user.memberA = await member(org.A, 'member-a');
  user.readerA = await member(org.A, 'reader-a');
  user.memberB = await member(org.B, 'member-b');
  ind.open = await indSubmission(org.A, workspaceA, user.ownerA, 'open', { visibility: 'org_public', editor: user.memberA });
  ind.priv = await indSubmission(org.A, workspaceA, user.ownerA, 'private', { visibility: 'private' });
  ind.theirs = await indSubmission(org.B, workspaceB, user.memberB, 'theirs', { visibility: 'org_public' });

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

type Who = keyof typeof user;
const as = (who: Who) => auth(accessToken(user[who], who === 'memberB' ? org.B : org.A, 'member'));
const get = (who: Who, path: string) => request(app).get(path).set(as(who));
const post = (who: Who, path: string, body: object) => request(app).post(path).set(as(who)).send(body);
const patch = (who: Who, path: string, body: object) => request(app).patch(path).set(as(who)).send(body);
const del = (who: Who, path: string) => request(app).delete(path).set(as(who));
const sub = (id: number) => `/api/ind-lifecycle/submission/${id}`;
const show = (res: request.Response) => JSON.stringify(res.body).slice(0, 300);

/** The cross-references each test records, by filing. */
const xref = { open: '', priv: '' };
const DMF = { referencedFileType: 'DMF', referencedFileNumber: '12345', subjectName: 'Invented drug substance', authorizedSections: ['3.2.S'] };

describe('the cross-reference and letter of authorization register, for a member of the organisation', () => {
  it('records a cross-reference, and reads the list and the LOA-coverage QC', async () => {
    const created = await post('memberA', `${sub(ind.open)}/cross-references`, DMF);
    expect(created.status, show(created)).toBe(201);
    xref.open = created.body.id;
    const list = await get('memberA', `${sub(ind.open)}/cross-references`);
    expect(list.status, show(list)).toBe(200);
    expect(list.body.map((r: { id: string }) => r.id)).toEqual([xref.open]);
    const register = await get('memberA', `${sub(ind.open)}/cross-reference-register`);
    expect(register.status, show(register)).toBe(200);
    expect(register.body).toMatchObject({ ready: false, counts: { total: 1, withLoa: 0, missingLoa: 1 } });
    expect(register.body.findings[0]).toMatchObject({ fileLabel: 'DMF 12345', code: 'MISSING_LOA', severity: 'error' });
  });

  it('marks the letter on file, and the QC is ready', async () => {
    const marked = await patch('memberA', `/api/ind-lifecycle/cross-references/${xref.open}`, { loaOnFile: true });
    expect(marked.status, show(marked)).toBe(200);
    expect(marked.body).toMatchObject({ loaOnFile: true });
    const register = await get('memberA', `${sub(ind.open)}/cross-reference-register`);
    expect(register.body).toMatchObject({ ready: true, counts: { total: 1, withLoa: 1, missingLoa: 0 } });
  });

  it('files the letter as the m1.4.1 leaf of a new sequence', async () => {
    const second = await post('memberA', `${sub(ind.open)}/cross-references`, { ...DMF, referencedFileNumber: '67890' });
    expect(second.status, show(second)).toBe(201);
    const filed = await post('memberA', `${sub(ind.open)}/cross-references/${second.body.id}/file-loa`,
      { sequenceNumber: '0001', holderName: 'Invented DMF holder', authorizedPartyName: 'Invented sponsor', signatoryName: 'A. Signatory' });
    expect(filed.status, show(filed)).toBe(201);
    expect(filed.body.sequence).toMatchObject({ sequenceNumber: '0001', type: 'amendment' });
    const leaf = filed.body.leaves.find((l: { sectionCode: string }) => l.sectionCode === 'm1.4.1');
    expect(typeof leaf?.checksum).toBe('string');
    expect(filed.body.crossReference).toMatchObject({ loaOnFile: true, loaLeafSection: 'm1.4.1' });
  });

  it('an id that is not one of this IND\'s cross-references is not found', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    const filing = { sequenceNumber: '0002', holderName: 'H', authorizedPartyName: 'P', signatoryName: 'S' };
    expect((await post('memberA', `${sub(ind.open)}/cross-references/${unknown}/file-loa`, filing)).status).toBe(404);
    expect((await patch('memberA', `/api/ind-lifecycle/cross-references/${unknown}`, { loaOnFile: true })).status).toBe(404);
    expect((await patch('memberA', '/api/ind-lifecycle/cross-references/not-an-id', { loaOnFile: true })).status).toBe(404);
  });

  it('removes one', async () => {
    const removed = await del('memberA', `/api/ind-lifecycle/cross-references/${xref.open}`);
    expect(removed.status, show(removed)).toBe(204);
    const list = await get('memberA', `${sub(ind.open)}/cross-references`);
    expect(list.body.map((r: { id: string }) => r.id)).not.toContain(xref.open);
  });
});

describe('and refused to anyone who cannot open the project', () => {
  beforeAll(async () => {
    const created = await post('ownerA', `${sub(ind.priv)}/cross-references`, DMF);
    expect(created.status, show(created)).toBe(201);
    xref.priv = created.body.id;
  });

  it('another organisation, whichever route it asks', async () => {
    const theirs = await post('memberB', `${sub(ind.theirs)}/cross-references`, DMF);
    expect(theirs.status, show(theirs)).toBe(201);
    for (const res of [
      await get('memberB', `${sub(ind.priv)}/cross-references`),
      await get('memberB', `${sub(ind.priv)}/cross-reference-register`),
      await post('memberB', `${sub(ind.priv)}/cross-references`, DMF),
      await post('memberB', `${sub(ind.priv)}/cross-references/${xref.priv}/file-loa`,
        { sequenceNumber: '0009', holderName: 'H', authorizedPartyName: 'P', signatoryName: 'S' }),
      await patch('memberB', `/api/ind-lifecycle/cross-references/${xref.priv}`, { loaOnFile: true }),
      await del('memberB', `/api/ind-lifecycle/cross-references/${xref.priv}`),
    ]) expect(res.status, show(res)).toBe(404);
    /* And the organisation's own reads never carry the other's row. */
    const mine = await get('memberA', `${sub(ind.open)}/cross-references`);
    expect(JSON.stringify(mine.body)).not.toContain(theirs.body.id);
  });

  /* A change is made by someone who may change the project (requireProjectAdmission, as a meeting on a submission):
     a colleague who can open an organisation-wide project reads its register and changes nothing. */
  it('a colleague who can read the project but does not edit it', async () => {
    const read = await get('readerA', `${sub(ind.open)}/cross-reference-register`);
    expect(read.status, show(read)).toBe(200);
    const listed = await get('readerA', `${sub(ind.open)}/cross-references`);
    const anyRow = listed.body[0]?.id as string;
    expect(anyRow).toBeTruthy();
    for (const res of [
      await post('readerA', `${sub(ind.open)}/cross-references`, DMF),
      await patch('readerA', `/api/ind-lifecycle/cross-references/${anyRow}`, { loaOnFile: false }),
      await del('readerA', `/api/ind-lifecycle/cross-references/${anyRow}`),
    ]) {
      expect(res.status, show(res)).toBe(403);
      expect(res.body.error?.code).toBe('PROJECT_PERMISSION_DENIED');
    }
  });

  /* The refusal every Submission Center submission read gives: the project is the organisation's, and this person
     may not open it. */
  it('a colleague who is not on a private project', async () => {
    for (const res of [
      await get('memberA', `${sub(ind.priv)}/cross-references`),
      await get('memberA', `${sub(ind.priv)}/cross-reference-register`),
      await post('memberA', `${sub(ind.priv)}/cross-references`, DMF),
      await post('memberA', `${sub(ind.priv)}/cross-references/${xref.priv}/file-loa`,
        { sequenceNumber: '0009', holderName: 'H', authorizedPartyName: 'P', signatoryName: 'S' }),
      await patch('memberA', `/api/ind-lifecycle/cross-references/${xref.priv}`, { loaOnFile: true }),
      await del('memberA', `/api/ind-lifecycle/cross-references/${xref.priv}`),
    ]) {
      expect(res.status, show(res)).toBe(403);
      expect(res.body.error?.code).toBe('PROJECT_PERMISSION_DENIED');
    }
    const stillThere = await get('ownerA', `${sub(ind.priv)}/cross-references`);
    expect(stillThere.status, show(stillThere)).toBe(200);
    expect(stillThere.body).toEqual([expect.objectContaining({ id: xref.priv, loaOnFile: false })]);
  });
});

/** A 312.33 report for a period that ended on 31 December 2025: with the IND effective on 15 January 2025, the server
 *  dates it due 60 days after the anniversary, which has passed. Without an effective date, its due date is not known. */
const annualReport = (label: string, effective = true) => ({
  report: { indNumber: '999001', productName: `${TAG}-${label}`, reportingPeriodStart: '2025-01-01', reportingPeriodEnd: '2025-12-31' },
  ...(effective ? { indEffectiveDate: '2025-01-15' } : {}),
});
const annual = { open: '', unknown: '', priv: '' };
type Overdue = { id: string; overdueState: string };

describe('the annual-report tracker, for a member of the organisation', () => {
  it('tracks a report, with the due date and the open sections the server computes', async () => {
    const created = await post('memberA', `${sub(ind.open)}/annual-reports`, annualReport('annual-open'));
    expect(created.status, show(created)).toBe(201);
    expect(created.body).toMatchObject({ status: 'draft', indNumber: '999001', submissionId: ind.open });
    expect(new Date(created.body.dueDate).getTime()).toBeLessThan(Date.now());
    expect(created.body.gapCount).toBeGreaterThan(0);
    annual.open = created.body.id;
    const list = await get('memberA', `${sub(ind.open)}/annual-reports`);
    expect(list.status, show(list)).toBe(200);
    expect(list.body.map((r: { id: string }) => r.id)).toEqual([annual.open]);
  });

  it('a report with no reporting period is refused as 400 VALIDATION, and nothing is tracked', async () => {
    const { report } = annualReport('annual-no-period');
    const res = await post('memberA', `${sub(ind.open)}/annual-reports`, { report: { ...report, reportingPeriodStart: undefined } });
    expect(res.status, show(res)).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION', message: expect.stringMatching(/reportingPeriodStart/) });
    expect((await get('memberA', `${sub(ind.open)}/annual-reports`)).body).toHaveLength(1);
  });

  it('the overdue feed names it overdue, and one with no IND effective date as not known', async () => {
    const unknown = await post('memberA', `${sub(ind.open)}/annual-reports`, annualReport('annual-unknown', false));
    expect(unknown.status, show(unknown)).toBe(201);
    annual.unknown = unknown.body.id;
    const overdue = await get('memberA', `${sub(ind.open)}/annual-reports/overdue`);
    expect(overdue.status, show(overdue)).toBe(200);
    expect(Object.fromEntries((overdue.body as Overdue[]).map((r) => [r.id, r.overdueState])))
      .toEqual({ [annual.open]: 'overdue', [annual.unknown]: 'deadline_unknown' });
  });

  it('a tracked report filed through the IND forms filing is filed in the register, and leaves the overdue feed', async () => {
    const filed = await post('memberA', '/api/ind-lifecycle/annual-report/file',
      { submissionId: ind.open, sequenceNumber: '0005', draftId: annual.open, acknowledgeGaps: true });
    expect(filed.status, show(filed)).toBe(201);
    const list = await get('memberA', `${sub(ind.open)}/annual-reports`);
    expect(list.body.find((r: { id: string }) => r.id === annual.open)).toMatchObject({ status: 'filed', sequenceId: filed.body.sequence.id });
    const overdue = await get('memberA', `${sub(ind.open)}/annual-reports/overdue`);
    expect((overdue.body as Overdue[]).map((r) => r.id)).toEqual([annual.unknown]);
  });
});

describe('the annual-report tracker is refused to anyone who cannot open the project', () => {
  beforeAll(async () => {
    const created = await post('ownerA', `${sub(ind.priv)}/annual-reports`, annualReport('annual-private'));
    expect(created.status, show(created)).toBe(201);
    annual.priv = created.body.id;
  });

  it('another organisation', async () => {
    for (const res of [
      await get('memberB', `${sub(ind.priv)}/annual-reports`),
      await get('memberB', `${sub(ind.priv)}/annual-reports/overdue`),
      await post('memberB', `${sub(ind.priv)}/annual-reports`, annualReport('annual-theirs')),
    ]) expect(res.status, show(res)).toBe(404);
  });

  it('a colleague who can read the project but does not edit it tracks nothing', async () => {
    expect((await get('readerA', `${sub(ind.open)}/annual-reports`)).status).toBe(200);
    const res = await post('readerA', `${sub(ind.open)}/annual-reports`, annualReport('annual-reader'));
    expect(res.status, show(res)).toBe(403);
    expect(res.body.error?.code).toBe('PROJECT_PERMISSION_DENIED');
  });

  it('a colleague who is not on a private project', async () => {
    for (const res of [
      await get('memberA', `${sub(ind.priv)}/annual-reports`),
      await get('memberA', `${sub(ind.priv)}/annual-reports/overdue`),
      await post('memberA', `${sub(ind.priv)}/annual-reports`, annualReport('annual-colleague')),
    ]) {
      expect(res.status, show(res)).toBe(403);
      expect(res.body.error?.code).toBe('PROJECT_PERMISSION_DENIED');
    }
    const owners = await get('ownerA', `${sub(ind.priv)}/annual-reports`);
    expect(owners.body.map((r: { id: string }) => r.id)).toEqual([annual.priv]);
  });
});

/** A 312.30(b) protocol change: one revised protocol, replacing its earlier leaf. */
const amendmentOf = (label: string) => ({
  indNumber: '999001',
  changedDocuments: [{ documentId: `${TAG}-${label}`, title: 'Protocol, version 2', category: 'protocol', changeKind: 'revised', replacesLeafGuid: 'leaf-guid-1' }],
});
const amend = { open: '', priv: '' };

describe('the amendment tracker, for a member of the organisation', () => {
  it('tracks an amendment, planned by the server from the changed document', async () => {
    const created = await post('memberA', `${sub(ind.open)}/amendments`, amendmentOf('amend-open'));
    expect(created.status, show(created)).toBe(201);
    expect(created.body).toMatchObject({ status: 'draft', indNumber: '999001', submissionId: ind.open, amendmentClasses: ['protocol'] });
    expect(created.body.leafCount).toBeGreaterThanOrEqual(1);
    amend.open = created.body.id;
    const list = await get('memberA', `${sub(ind.open)}/amendments`);
    expect(list.status, show(list)).toBe(200);
    expect(list.body.map((r: { id: string }) => r.id)).toEqual([amend.open]);
  });

  it('a tracked amendment filed through the IND forms filing is filed in the register', async () => {
    const filed = await post('memberA', '/api/ind-lifecycle/amendment/file',
      { submissionId: ind.open, sequenceNumber: '0006', draftId: amend.open, ...amendmentOf('amend-open') });
    expect(filed.status, show(filed)).toBe(201);
    const list = await get('memberA', `${sub(ind.open)}/amendments`);
    expect(list.body[0]).toMatchObject({ id: amend.open, status: 'filed', sequenceId: filed.body.sequence.id });
  });
});

describe('the amendment tracker is refused to anyone who cannot open the project', () => {
  beforeAll(async () => {
    const created = await post('ownerA', `${sub(ind.priv)}/amendments`, amendmentOf('amend-private'));
    expect(created.status, show(created)).toBe(201);
    amend.priv = created.body.id;
  });

  it('another organisation', async () => {
    expect((await get('memberB', `${sub(ind.priv)}/amendments`)).status).toBe(404);
    expect((await post('memberB', `${sub(ind.priv)}/amendments`, amendmentOf('amend-theirs'))).status).toBe(404);
  });

  it('a colleague who can read the project but does not edit it tracks nothing', async () => {
    expect((await get('readerA', `${sub(ind.open)}/amendments`)).status).toBe(200);
    const res = await post('readerA', `${sub(ind.open)}/amendments`, amendmentOf('amend-reader'));
    expect(res.status, show(res)).toBe(403);
    expect(res.body.error?.code).toBe('PROJECT_PERMISSION_DENIED');
  });

  it('a colleague who is not on a private project', async () => {
    for (const res of [
      await get('memberA', `${sub(ind.priv)}/amendments`),
      await post('memberA', `${sub(ind.priv)}/amendments`, amendmentOf('amend-colleague')),
    ]) {
      expect(res.status, show(res)).toBe(403);
      expect(res.body.error?.code).toBe('PROJECT_PERMISSION_DENIED');
    }
    const owners = await get('ownerA', `${sub(ind.priv)}/amendments`);
    expect(owners.body.map((r: { id: string }) => r.id)).toEqual([amend.priv]);
  });
});

/** Every route the IND lifecycle routers mount, as a request carries it. */
const ROUTES = listIndLifecycleRoutes().map((r) => ({ method: r.method.toLowerCase(), path: r.path.replace(/\{[^}]+\}/g, '7') }));
const UNCLAIMED = ROUTES.filter((r) => launchScopeApiVerdict(r.path, buildPrefixMap(), NEVER_GATED) !== 'launch');

describe('every route under /api/ind-lifecycle that nothing claims is still refused in production', () => {
  it('enumerated from the routers, the safety registers among them (P-32)', () => {
    expect(UNCLAIMED.length).toBeGreaterThan(20);
    expect(UNCLAIMED.map((r) => r.path)).toEqual(expect.arrayContaining([
      '/api/ind-lifecycle/submission/7/safety-reports', '/api/ind-lifecycle/submission/7/icsr-transmissions',
      '/api/ind-lifecycle/safety-reports/7', '/api/ind-lifecycle/portfolio/drift',
    ]));
  });

  it.each(UNCLAIMED.map((r) => [`${r.method.toUpperCase()} ${r.path}`, r.method, r.path]))('%s', async (_name, method, path) => {
    const call = request(app)[method as 'get' | 'post' | 'patch' | 'delete'](path).set(as('memberA'));
    const res = method === 'get' || method === 'delete' ? await call : await call.send({});
    expect(res.status, show(res)).toBe(403);
    expect(res.body.error?.code).toBe('LAUNCH_SCOPE');
  });
});
