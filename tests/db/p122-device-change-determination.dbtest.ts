/**
 * P-122 (2026-11-12): the device change determination is reached from a Quality change record
 * (docs/evidence/DESIGN/P-122/reach-map/README.md row 37). Two rule engines have decided, since 2026-07, whether a
 * device change needs a new 510(k) or a letter to file (US) and whether it is a significant change (EU); nothing
 * called them. POST /api/mdx/qms/changes/:id/regulatory-impact runs them and keeps the outcome on the change.
 *
 * Through the production QMS router behind the production auth boundary and the launch-scope gate as production runs
 * it (`LAUNCH_SCOPE_ENFORCE` on, unclaimed paths refused), as app_service with RLS enforcing:
 *   - the verdict is the engine's, computed from the answers, and is kept on the change with the answers, the rules'
 *     version, who ran it and when; the audit trail gets a chained row in the same transaction;
 *   - the register read says, per change, whether the determination applies and what is recorded, and the approval's
 *     content digest covers it;
 *   - an unanswered question is refused and nothing is recorded; a reassessment states why;
 *   - another organisation gets 404; a colleague who is not on a private project, or who reads the project and does
 *     not edit it, gets 403; a drug project's change, an organisation-wide change and an approved change get 409.
 *
 * Evidence: docs/evidence/DESIGN/P-122/device-change-determination/.
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
import { buildPrefixMap, moduleEntitlementGate } from '../../server/middleware/moduleEntitlementGate';
import mdxQmsRoutes from '../../server/routes/mdx-qms';
import { EU_CHANGE_RULES, FDA_CHANGE_RULES } from '../../server/services/regulatory/change-assessment';
import { accessToken, auth } from './two-tenant-fixture';

const TAG = `p122-dcd-${randomUUID().slice(0, 8)}`;
const ACTION = 'mdx.qms.change.regulatory_impact';
let owner: Pool;
let app: express.Express;
const org = { A: 0, B: 0 };
/* ownerA owns every project of organisation A; memberA edits the open device project; readerA can open it and
   edits nothing. None of the three is an organisation manager. */
const user = { ownerA: 0, memberA: 0, readerA: 0, memberB: 0 };
/** Change ids, by where each is filed. */
const change = { device: 0, priv: 0, drug: 0, orgWide: 0, approved: 0, theirs: 0 };

const one = async (sql: string, params: unknown[]) => (await owner.query(sql, params)).rows[0].id;

async function member(organizationId: number, label: string): Promise<number> {
  const id = Number(await one(`INSERT INTO users(email,name,password_hash,default_organization_id,status)
    VALUES($1,$2,'not-a-real-password',$3,'active') RETURNING id`, [`${TAG}-${label}@example.invalid`, `Invented ${label}`, organizationId]));
  await owner.query(`INSERT INTO organization_users(organization_id,user_id,role) VALUES($1,$2,'member')`, [organizationId, id]);
  return id;
}

async function organization(key: 'A' | 'B'): Promise<number> {
  org[key] = Number(await one(`INSERT INTO organizations(name,slug,status) VALUES($1,$1,'active') RETURNING id`, [`${TAG}-${key}`]));
  return Number(await one(`INSERT INTO client_workspaces(organization_id,name,slug,status) VALUES($1,$2,$2,'active') RETURNING id`,
    [org[key], `${TAG}-${key}-workspace`]));
}

interface ProjectSpec { organizationId: number; workspace: number; ownerId: number; productType: string; visibility: string; editor?: number }

/** A project of the given product type; `editor` is given edit on it. Returns its program id. */
async function project(label: string, spec: ProjectSpec): Promise<string> {
  const programId = randomUUID();
  const device = spec.productType !== 'drug' && spec.productType !== 'biologic';
  await owner.query(`INSERT INTO regulatory_programs(id,organization_id,name,code,program_type,product_type,primary_agency,product_name,lead_user_id,status)
    VALUES($1,$2,$3,$4,$5,$6,'FDA','Invented QA product',$7,'active')`,
  [programId, spec.organizationId, `${TAG}-${label}`, `RG-${programId.slice(0, 8)}`, device ? '510k' : 'IND', spec.productType, spec.ownerId]);
  const projectId = Number(await one(`INSERT INTO projects(organization_id,client_workspace_id,name,type,status,owner_id,created_by_id,regulatory_program_id)
    VALUES($1,$2,$3,'regulatory','active',$4,$4,$5) RETURNING id`, [spec.organizationId, spec.workspace, `${TAG}-${label}`, spec.ownerId, programId]));
  await owner.query(`INSERT INTO project_visibility_settings(organization_id,project_id,visibility) VALUES($1,$2,$3)`, [spec.organizationId, projectId, spec.visibility]);
  const members: Array<[number, string]> = [];
  if (spec.visibility === 'private') members.push([spec.ownerId, 'owner']);
  if (spec.editor) members.push([spec.editor, 'edit']);
  for (const [userId, role] of members) {
    await owner.query(`INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES($1,$2,$3,$4,'active')`,
      [spec.organizationId, projectId, userId, role]);
  }
  return programId;
}

type Who = keyof typeof user;
const as = (who: Who) => auth(accessToken(user[who], who === 'memberB' ? org.B : org.A, 'member'));
const get = (who: Who, path: string) => request(app).get(`/api/mdx/qms${path}`).set(as(who));
const post = (who: Who, path: string, body: object) => request(app).post(`/api/mdx/qms${path}`).set(as(who)).send(body);
const show = (res: request.Response) => JSON.stringify(res.body).slice(0, 400);
const assess = (who: Who, id: number, body: object) => post(who, `/changes/${id}/regulatory-impact`, body);

/** Raise a change through the product's own route, as its proposer. */
async function raise(who: Who, label: string, programId?: string): Promise<number> {
  const res = await post(who, '/changes', { changeNumber: `${TAG}-${label}`, title: `Invented change ${label}`, reason: 'An invented reason for the change.',
    ...(programId ? { programId } : {}) });
  expect(res.status, show(res)).toBe(201);
  return Number(res.body.data.id);
}

const kept = async (id: number) => (await owner.query(`SELECT metadata, status, classification FROM qms_change_controls WHERE id=$1`, [id])).rows[0];
const auditRows = async (id: number) => (await owner.query(
  `SELECT user_id, reason, new_values, sha256_chain, table_name FROM audit_logs
    WHERE tenant_id=$1 AND action=$2 AND record_id=$3 ORDER BY occurred_at, id`, [org.A, ACTION, String(id)])).rows;

/** No trigger, verification shown: the FDA engine's letter to file. */
const US_NO_TRIGGER = {
  affectsIndicationsForUse: false, changesControlMechanismOrOperatingPrinciple: false, changesPatientContactingMaterials: false,
  softwareChangeAffectsRisk: false, riskAssessmentShowsNewOrModifiedRisk: false, couldSignificantlyAffectSafetyOrEffectiveness: false,
  verificationDemonstratesEquivalence: true,
};
/** The risk assessment found a new risk and verification does not show equivalence: the FDA engine's new 510(k). */
const US_NEW_RISK = { ...US_NO_TRIGGER, riskAssessmentShowsNewOrModifiedRisk: true, verificationDemonstratesEquivalence: false };
const EU_NO_CRITERION = {
  changesIntendedPurpose: false, changesDesignOrPerformanceOutsideSpec: false, changesSterilisationOrMaterials: false,
  significantSoftwareChange: false, newOperatingPrinciple: false,
};
const EU_SOFTWARE = { ...EU_NO_CRITERION, significantSoftwareChange: true };

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('Restricted APP_DATABASE_URL is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  const workspaceA = await organization('A');
  const workspaceB = await organization('B');
  const posture = await runWithTenantScope({ tenantId: String(org.A), role: 'member', source: 'test', caller: 'p122-device-change-determination' },
    () => getPool().query(`SELECT current_user AS role, r.rolbypassrls, current_setting('app.rls_enforce', true) AS enforcement
      FROM pg_roles r WHERE r.rolname = current_user`));
  expect(posture.rows).toEqual([{ role: 'app_service', rolbypassrls: false, enforcement: 'on' }]);

  user.ownerA = await member(org.A, 'owner-a');
  user.memberA = await member(org.A, 'member-a');
  user.readerA = await member(org.A, 'reader-a');
  user.memberB = await member(org.B, 'member-b');
  const a = { organizationId: org.A, workspace: workspaceA, ownerId: user.ownerA };
  const device = await project('device', { ...a, productType: 'ivd', visibility: 'org_public', editor: user.memberA });
  const priv = await project('private-device', { ...a, productType: 'device', visibility: 'private' });
  const drug = await project('drug', { ...a, productType: 'drug', visibility: 'org_public', editor: user.memberA });
  /* Organisation B has no device project. */
  const theirs = await project('theirs', { organizationId: org.B, workspace: workspaceB, ownerId: user.memberB, productType: 'biologic', visibility: 'org_public' });

  app = express();
  app.use(express.json());
  app.use('/api', createAuthBoundary());
  /* As production builds it: launch scope on, a path nothing claims refused. */
  app.use(moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on', unattributed: 'enforce' }));
  app.use('/api/mdx', mdxQmsRoutes);

  change.device = await raise('ownerA', 'device', device);
  change.priv = await raise('ownerA', 'private', priv);
  change.drug = await raise('ownerA', 'drug', drug);
  change.orgWide = await raise('ownerA', 'org-wide');
  change.approved = await raise('ownerA', 'approved', device);
  await owner.query(`UPDATE qms_change_controls SET status='approved' WHERE id=$1`, [change.approved]);
  change.theirs = await raise('memberB', 'theirs', theirs);
}, 120_000);

afterAll(async () => {
  await getPool().end().catch(() => {});
  await owner?.end().catch(() => {});
});

describe('a member who edits a device project assesses a change of it', () => {
  let digestBefore = '';

  it('before any assessment, the register says the determination applies and none is recorded', async () => {
    const list = await get('memberA', '/changes');
    expect(list.status, show(list)).toBe(200);
    const row = list.body.data.find((c: { id: number }) => c.id === change.device);
    expect(row.regulatory_impact).toEqual({ applies: 'device', productType: 'ivd', organisationHasDevices: true, assessable: true, us: null, eu: null });
    digestBefore = row.content_digest;
  });

  it('the US verdict is the engine\'s, and is kept on the change with the answers, the rules\' version, who and when', async () => {
    const res = await assess('memberA', change.device, { market: 'us', answers: US_NEW_RISK });
    expect(res.status, show(res)).toBe(200);
    expect(res.body.meta.auditTrail).toEqual({ persisted: true, chained: true });
    const us = res.body.data.regulatory_impact.us;
    expect(us).toMatchObject({ engine: 'fda-510k-change', ruleVersion: FDA_CHANGE_RULES, inputs: US_NEW_RISK,
      result: { decision: 'new_510k', triggers: ['Risk assessment shows new or significantly modified risks.'] },
      by: { id: user.memberA, name: 'Invented member-a' } });
    expect(us.result.rationale).toMatch(/a new 510\(k\) is indicated/);
    const stored = (await kept(change.device)).metadata.regulatoryImpact;
    expect(stored.us).toEqual(us);
    expect(stored.eu).toBeUndefined();
    expect(Math.abs(Date.now() - Date.parse(us.at))).toBeLessThan(120_000);
  });

  it('the audit trail has a chained row for it, with the answers and the outcome', async () => {
    const rows = await auditRows(change.device);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: user.memberA, table_name: 'qms_change_control', reason: null });
    expect(rows[0].sha256_chain).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[0].new_values).toMatchObject({ changeNumber: `${TAG}-device`, market: 'us', engine: 'fda-510k-change', ruleVersion: FDA_CHANGE_RULES,
      inputs: US_NEW_RISK, result: { decision: 'new_510k' }, previous: null });
  });

  it('a verdict sent by the caller is not kept: the engine decides from the answers', async () => {
    const res = await assess('memberA', change.device, { market: 'eu', answers: EU_SOFTWARE,
      result: { significant: false, rationale: 'Sent by the browser.', triggers: [] }, significant: false, ruleVersion: 'made-up' });
    expect(res.status, show(res)).toBe(200);
    const stored = (await kept(change.device)).metadata.regulatoryImpact;
    expect(stored.eu).toMatchObject({ engine: 'eu-significant-change', ruleVersion: EU_CHANGE_RULES, inputs: EU_SOFTWARE,
      result: { significant: true, triggers: ['Significant software change affecting diagnosis/therapy.'] } });
    expect(stored.us.result.decision).toBe('new_510k');
  });

  it('the engine does not classify the change: its classification and state are as they were', async () => {
    expect(await kept(change.device)).toMatchObject({ status: 'proposed', classification: 'minor' });
  });

  it('the register carries both determinations, and the content an approval signs has changed with them', async () => {
    const list = await get('memberA', '/changes');
    const row = list.body.data.find((c: { id: number }) => c.id === change.device);
    expect(row.regulatory_impact).toMatchObject({ applies: 'device', assessable: true,
      us: { result: { decision: 'new_510k' } }, eu: { result: { significant: true } } });
    expect(row.content_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(row.content_digest).not.toBe(digestBefore);
  });
});

describe('nothing is recorded by default', () => {
  it('an unanswered question is refused, by name, and nothing is kept or audited', async () => {
    const partial = Object.fromEntries(Object.entries(US_NO_TRIGGER).filter(([key]) => key !== 'softwareChangeAffectsRisk'));
    for (const answers of [partial, {}, { ...US_NO_TRIGGER, softwareChangeAffectsRisk: 'no' }]) {
      const res = await assess('ownerA', change.priv, { market: 'us', answers });
      expect(res.status, show(res)).toBe(422);
      expect(res.body.details.code).toBe('QMS_CHANGE_QUESTIONS_UNANSWERED');
      expect(res.body.error).toContain('softwareChangeAffectsRisk');
    }
    expect((await kept(change.priv)).metadata.regulatoryImpact).toBeUndefined();
    expect(await auditRows(change.priv)).toHaveLength(0);
  });

  it('a market that is not one of the two is refused', async () => {
    const res = await assess('ownerA', change.priv, { market: 'jp', answers: US_NO_TRIGGER });
    expect(res.status, show(res)).toBe(422);
  });

  it('assessing again states why, and the audit row keeps the determination it replaced', async () => {
    const silent = await assess('memberA', change.device, { market: 'us', answers: US_NO_TRIGGER });
    expect(silent.status, show(silent)).toBe(422);
    expect(silent.body.details.code).toBe('QMS_CHANGE_REASSESSMENT_REASON');
    expect((await kept(change.device)).metadata.regulatoryImpact.us.result.decision).toBe('new_510k');

    const again = await assess('memberA', change.device, { market: 'us', answers: US_NO_TRIGGER, reason: 'Verification report VR-12 now shows equivalence.' });
    expect(again.status, show(again)).toBe(200);
    expect(again.body.data.regulatory_impact.us.result).toMatchObject({ decision: 'letter_to_file', triggers: [] });
    const rows = await auditRows(change.device);
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ reason: 'Verification report VR-12 now shows equivalence.' });
    expect(rows[2].new_values).toMatchObject({ market: 'us', result: { decision: 'letter_to_file' }, previous: { result: { decision: 'new_510k' } } });
  });
});

describe('and refused to anyone who may not change the change\'s project', () => {
  it('another organisation gets 404, and learns nothing', async () => {
    for (const id of [change.device, change.priv]) {
      const res = await assess('memberB', id, { market: 'us', answers: US_NEW_RISK });
      expect(res.status, show(res)).toBe(404);
    }
    const list = await get('memberB', '/changes');
    expect(list.body.data.map((c: { id: number }) => c.id)).toEqual([change.theirs]);
    expect((await kept(change.priv)).metadata.regulatoryImpact).toBeUndefined();
  });

  it('a colleague who is not on a private project gets 403', async () => {
    const res = await assess('memberA', change.priv, { market: 'us', answers: US_NEW_RISK });
    expect(res.status, show(res)).toBe(403);
    expect(res.body.details.code).toBe('PROJECT_PERMISSION_DENIED');
    expect((await kept(change.priv)).metadata.regulatoryImpact).toBeUndefined();
    expect(await auditRows(change.priv)).toHaveLength(0);
  });

  it('a colleague who can open the project and does not edit it gets 403', async () => {
    const res = await assess('readerA', change.priv, { market: 'us', answers: US_NEW_RISK });
    expect(res.status, show(res)).toBe(403);
    const open = await assess('readerA', change.approved, { market: 'us', answers: US_NEW_RISK });
    expect(open.status, show(open)).toBe(403);
    expect(open.body.details.code).toBe('PROJECT_PERMISSION_DENIED');
  });

  it('the private project\'s owner assesses it', async () => {
    const res = await assess('ownerA', change.priv, { market: 'eu', answers: EU_NO_CRITERION });
    expect(res.status, show(res)).toBe(200);
    expect(res.body.data.regulatory_impact.eu.result).toMatchObject({ significant: false, triggers: [] });
    expect(await auditRows(change.priv)).toHaveLength(1);
  });
});

describe('and offered only where it applies', () => {
  it('a drug project\'s change is refused, and the register says it is not a device\'s', async () => {
    const res = await assess('memberA', change.drug, { market: 'us', answers: US_NEW_RISK });
    expect(res.status, show(res)).toBe(409);
    expect(res.body.details.code).toBe('QMS_CHANGE_NOT_A_DEVICE');
    const list = await get('memberA', '/changes');
    const row = list.body.data.find((c: { id: number }) => c.id === change.drug);
    expect(row.regulatory_impact).toEqual({ applies: 'not_device', productType: 'drug', organisationHasDevices: true, assessable: false, us: null, eu: null });
  });

  it('an organisation-wide change is refused: there is no device to assess', async () => {
    const res = await assess('ownerA', change.orgWide, { market: 'eu', answers: EU_SOFTWARE });
    expect(res.status, show(res)).toBe(409);
    expect(res.body.details.code).toBe('QMS_CHANGE_NOT_A_DEVICE');
    const list = await get('ownerA', '/changes');
    const row = list.body.data.find((c: { id: number }) => c.id === change.orgWide);
    expect(row.regulatory_impact).toMatchObject({ applies: 'no_project', productType: null, assessable: false });
  });

  it('an approved change\'s content is fixed: nothing is recorded on it', async () => {
    const res = await assess('ownerA', change.approved, { market: 'us', answers: US_NEW_RISK });
    expect(res.status, show(res)).toBe(409);
    expect(res.body.details.code).toBe('QMS_CHANGE_CONTENT_FIXED');
    expect((await kept(change.approved)).metadata.regulatoryImpact).toBeUndefined();
    const list = await get('ownerA', '/changes');
    const row = list.body.data.find((c: { id: number }) => c.id === change.approved);
    expect(row.regulatory_impact).toMatchObject({ applies: 'device', assessable: false, us: null, eu: null });
  });

  it('an organisation with no device project is told so on its rows', async () => {
    const list = await get('memberB', '/changes');
    expect(list.body.data[0].regulatory_impact).toEqual({ applies: 'not_device', productType: 'biologic', organisationHasDevices: false, assessable: false, us: null, eu: null });
  });

  it('what is kept and cannot be read is said to be unreadable, never shown as a verdict or as none', async () => {
    await owner.query(`UPDATE qms_change_controls SET metadata = metadata || '{"regulatoryImpact":{"us":{"result":{"decision":"harmless"}}}}'::jsonb WHERE id=$1`, [change.approved]);
    const list = await get('ownerA', '/changes');
    const row = list.body.data.find((c: { id: number }) => c.id === change.approved);
    expect(row.regulatory_impact).toMatchObject({ us: { unreadable: true }, eu: null });
  });
});
