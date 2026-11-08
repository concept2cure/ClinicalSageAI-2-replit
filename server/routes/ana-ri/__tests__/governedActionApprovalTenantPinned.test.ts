/**
 * POST /api/ana-ri/governed-action — a decision on a held run is written against
 * the same tenant whose run the lookup proved was waiting.
 *
 * `recordApprovalDecision` updated ana_runs by run id and toolUseId with no
 * organization predicate. Every caller runs the org-scoped `readPendingApproval`
 * first, so it was not reachable cross-tenant — but the safety lived in a
 * different statement, and with RLS_ENFORCE off the statement is the only place
 * a boundary can live (ledger L206). The predicate is now in the UPDATE; this
 * file pins the WIRING that feeds it: which org reaches the lookup and the write,
 * and that they are the same org. A refactor of this handler can break that
 * while every SQL-level test in run-control.pglite stays green.
 */
import express from 'express';
import request from 'supertest';
import { Router } from 'express';
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { runWithTenantScope } from '../../../db/tenantStore';

const policyHarness = vi.hoisted(() => ({ enabled: false, database: null as PGlite | null, readFails: false, driftAfterSignoff: false as false | 'version' | 'revocation', contexts: [] as object[] }));
const audits: Array<{ action: string; details: Record<string, unknown> }> = [];
const ORG = 1;
const USER = 42;
const inOwnerScope = <T>(fn: () => T): T => runWithTenantScope({ tenantId: String(ORG), accountId: USER, source: 'request', caller: 'mandatory-rule-fixture' }, fn);
const ORG_A = 1;
const ORG_B = 2;

const lookups: Array<{ runId: string; orgId: number }> = [];
const writes: Array<{ runId: string; orgId: number; decided: string }> = [];
let pending: unknown = null;

vi.mock('../../../db/requestDb', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  requestPgClient: vi.fn(() => ({ query: async (sql: string, values?: unknown[]) => {
    if (!policyHarness.database) return { rows: [], rowCount: 0 };
    if (policyHarness.readFails && /FROM account_skill_bundles/.test(sql)) throw new Error('Policy store unavailable');
    const result = await policyHarness.database.query<Record<string, unknown>>(sql, values);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  } })),
}));

vi.mock('../../../services/ana/run-control.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // The held approval is claimed before the sign-off and the execution (DT3
  // review, finding 4.3; governedActionRunEnded.test.ts holds its refusals).
  claimApproval: vi.fn(async () => 'claimed'),
  releaseApprovalClaim: vi.fn(async () => undefined),
  readPendingApproval: vi.fn(async (_c: unknown, runId: string, orgId: number) => {
    lookups.push({ runId, orgId });
    return pending;
  }),
  // A refused lookup asks whether the run is held for someone else in the org
  // (403) or not held at all (404); in this file's cases it is never held.
  isRunAwaitingApproval: vi.fn(async () => false),
  recordApprovalDecision: vi.fn(async (_c: unknown, runId: string, orgId: number, d: { decided: string }) => {
    writes.push({ runId, orgId, decided: d.decided });
    return true;
  }),
}));

// Past the sign-off gate, so the request reaches the decision write: a real
// reason-tier command (update_milestone — in the Part 11 governed set, not the
// e-sign set), a persisted audit row, and a command that succeeds. This used to
// mock requiresPart11Signoff/requiresEsignature over a made-up `lock_section`;
// the route now takes the tier from governedTierOf and refuses a command that
// is not propose-only, so the fixture has to be a command that exists.
vi.mock('../../../services/auditService.js', () => ({
  default: { logAction: vi.fn(async (entry: { action: string; details: Record<string, unknown> }) => {
    audits.push({ action: entry.action, details: entry.details });
    if (policyHarness.driftAfterSignoff && entry.action === 'ana.governed_action.confirm') await policyHarness.database?.exec(policyHarness.driftAfterSignoff === 'revocation' ? "UPDATE account_skill_bundles SET status = 'archived'" : 'UPDATE account_skill_bundles SET version = version + 1');
    return { persisted: true, chained: true };
  }) },
}));
vi.mock('../../../services/ana-ri/command-executor.js', () => ({
  executeCommands: vi.fn(async () => [{ success: true }]),
}));

vi.mock('../../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'approver' }));

let app: express.Express;
let callerOrgId: number = ORG_A;

beforeAll(async () => {
  const { mountUtilityRoutes } = await import('../utility');
  const router = Router();
  mountUtilityRoutes(router);
  app = express();
  app.use(express.json());
  // Stands in for authenticateToken: an authenticated caller of one org.
  app.use((req, _res, next) => {
    (req as any).tenantId = callerOrgId;
    (req as any).userId = 42;
    runWithTenantScope({ tenantId: String(callerOrgId), accountId: USER, source: 'request', caller: 'held-approval-fixture' }, next);
  });
  app.use('/api/ana-ri', router);
});

beforeEach(() => {
  policyHarness.enabled = false;
  policyHarness.database = null;
  policyHarness.readFails = false;
  policyHarness.driftAfterSignoff = false;
  policyHarness.contexts.length = 0;
  audits.length = 0;
  callerOrgId = ORG_A;
  lookups.length = 0;
  writes.length = 0;
  pending = { toolUseId: 'tu-1', command: 'update_milestone', params: {} };
});

const REASON = 'Locking the CMC section before the filing';
const decide = (body: Record<string, unknown>) =>
  request(app).post('/api/ana-ri/governed-action').send({ reasonForChange: REASON, ...body });

describe('a decision on a held run is bound to the tenant that proved it', () => {
  it('writes the decision against the SAME org the lookup used', async () => {
    const res = await decide({ runId: 'run-1', toolUseId: 'tu-1' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(lookups).toEqual([{ runId: 'run-1', orgId: ORG_A }]);
    expect(writes).toEqual([{ runId: 'run-1', orgId: ORG_A, decided: 'approved' }]);
  });

  it('ignores an organization named in the body, for the lookup and the write', async () => {
    await decide({ runId: 'run-1', toolUseId: 'tu-1', organizationId: ORG_B, orgId: ORG_B });
    expect(lookups[0].orgId).toBe(ORG_A);
    expect(writes[0].orgId).toBe(ORG_A);
  });

  it('follows the caller — a caller of another org binds to that org', async () => {
    callerOrgId = ORG_B;
    await decide({ runId: 'run-1', toolUseId: 'tu-1' });
    expect(lookups[0].orgId).toBe(ORG_B);
    expect(writes[0].orgId).toBe(ORG_B);
  });

  it('refuses a run the caller org does not hold, and writes nothing', async () => {
    pending = null; // the org-scoped lookup found nothing for this org
    const res = await decide({ runId: 'someone-elses-run', toolUseId: 'tu-1' });
    expect(res.status).toBe(404);
    expect(writes).toHaveLength(0);
  });
});

const post = (body: Record<string, unknown>) => request(app).post('/api/ana-ri/governed-action').send(body);

async function createMandatorySkillFixture(pg: PGlite, source: string) {
  await pg.exec(`
      CREATE TABLE organizations (id INTEGER PRIMARY KEY, status TEXT);
      CREATE TABLE users (id INTEGER PRIMARY KEY, status TEXT);
      CREATE TABLE organization_users (organization_id INTEGER, user_id INTEGER, role TEXT);
      CREATE TABLE projects (id INTEGER PRIMARY KEY, organization_id INTEGER, regulatory_program_id UUID, owner_id INTEGER, created_by_id INTEGER, settings JSONB);
      CREATE TABLE project_members (project_id INTEGER, organization_id INTEGER, user_id INTEGER, role TEXT, status TEXT);
      CREATE TABLE project_visibility_settings (project_id INTEGER, organization_id INTEGER, visibility TEXT);
      CREATE TABLE concept2cure_artifacts (id INTEGER, organization_id INTEGER, project_id INTEGER);
      CREATE TABLE concept2cure_review_assignments (artifact_id INTEGER, reviewer_id INTEGER, organization_id INTEGER, status TEXT);
      CREATE TABLE account_skill_bundles (id SERIAL PRIMARY KEY, bundle_id TEXT, organization_id INTEGER, project_id INTEGER, version INTEGER, status TEXT, policy_bindings JSON, metadata JSON);
      CREATE TABLE audit_logs (id UUID PRIMARY KEY, tenant_id INTEGER, table_name TEXT, record_id TEXT, action TEXT, user_id INTEGER, new_values JSON, occurred_at timestamptz DEFAULT now());
      CREATE TABLE user_intelligence_profiles(id SERIAL PRIMARY KEY,user_id INTEGER,organization_id INTEGER,workflow_preferences JSONB NOT NULL DEFAULT '{}',UNIQUE(user_id,organization_id));
      INSERT INTO organizations VALUES (1, 'active'), (2, 'active');
      INSERT INTO users VALUES (42, 'active');
      INSERT INTO organization_users VALUES (1, 42, 'member');
      INSERT INTO projects VALUES (5, 1, NULL, 42, 42, '{}'), (6, 1, NULL, 42, 42, '{}'), (9, 2, NULL, 42, 42, '{}');
      INSERT INTO audit_logs(id,tenant_id,table_name,record_id,action,user_id,new_values) VALUES ('${source}', 1, 'organization_skill_settings', 'labeling', 'ana_skill.library_disabled', 42, '{}');`);
}

let pg: PGlite;
const SOURCE = '11111111-1111-4111-8111-111111111111';
const actualCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
const gate = (toolName: string) => ({ policyType: 'requires_approval', enforcement: 'mandatory', toolName, description: 'Always ask before this action after the recorded correction.' });
const requestClient = () => ({ query: async (sql: string, values?: unknown[]) => {
  if (policyHarness.readFails && /FROM account_skill_bundles/.test(sql)) throw new Error('Policy store unavailable');
  const result = await pg.query<Record<string, unknown>>(sql, values);
  return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
} });
async function addRule(tool: string, projectId: number | null = null, organizationId = 1) {
  await pg.query('INSERT INTO account_skill_bundles (bundle_id, organization_id, project_id, version, status, policy_bindings, metadata) VALUES ($1,$2,$3,1,$4,$5,$6)',
    [`rule-${tool}-${projectId}`, organizationId, projectId, 'active', JSON.stringify([gate(tool)]), JSON.stringify({ standingRule: { sourceAuditEventId: SOURCE } })]);
}
async function hold(tool = 'search_document', params: Record<string, unknown> = { query: 'recorded protocol' }, project: number | null = null) {
  const { loadToolSkillGates, skillPolicyApprovalFor } = await import('../../../services/ana/governed-tool-gate.js');
  const scope = { organizationId: ORG, userId: USER, projectId: project, projectRef: project === null ? null : String(project), sqlClient: requestClient() };
  const snapshot = await inOwnerScope(() => loadToolSkillGates(scope, { name: tool, input: params }));
  pending = { toolUseId: 'tu-policy', command: tool, params, tier: 'confirm', requestedAt: new Date().toISOString(),
    toolContext: { projectId: project, projectRef: scope.projectRef, servingModel: null }, skillPolicyApproval: skillPolicyApprovalFor({ name: tool, input: params }, snapshot!) };
}
const approve = (extra: Record<string, unknown> = {}) => post({ runId: 'run-policy', toolUseId: 'tu-policy', confirm: true, ...extra });

async function initializeMandatoryGateFixture() {
  pg = new PGlite();
  await createMandatorySkillFixture(pg, SOURCE);
  const { registerToolHandler } = await import('../../../services/ana/AnaToolExecutor.js');
  for (const name of ['search_document', 'convene_drafting_council', 'check_dossier_consistency', 'seed_tmf']) {
    registerToolHandler(name, async (input, context) => {
      actualCalls.push({ name, input });
      policyHarness.contexts.push(context!);
      return JSON.stringify({ success: true, actual: name });
    });
  }
}

describe('mandatory skill rules reach the real held approval and tool dispatcher', () => {
  beforeAll(initializeMandatoryGateFixture);
  afterAll(async () => { await pg?.close(); });
  beforeEach(async () => {
    policyHarness.enabled = true;
    policyHarness.database = pg;
    actualCalls.length = 0;
    await pg.exec('TRUNCATE account_skill_bundles RESTART IDENTITY');
    await pg.query("SELECT set_config('app.current_tenant_id',$1,false),set_config('app.current_account_id',$2,false)", [String(ORG), String(USER)]);
    await addRule('search_document');
  });
  it('a correction-backed read pauses, executes only its exact held arguments, and retains both policy hashes in audit', async () => {
    await hold();
    const res = await approve({ params: { query: 'body tampering' }, humanConfirmed: true, skillPolicyApproval: { actionHash: 'forged', rulesHash: 'forged' } });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(actualCalls).toEqual([{ name: 'search_document', input: { query: 'recorded protocol' } }]);
    expect(audits[0].details).toMatchObject({ skillPolicyApproval: (pending as any).skillPolicyApproval, executedSkillPolicyApproval: (pending as any).skillPolicyApproval });
  });
  it('the actual current-policy classifier turns an ordinary read into the held approval contract', async () => {
    const { classifyToolCall, loadToolSkillGates } = await import('../../../services/ana/governed-tool-gate.js');
    const call = { name: 'search_document', input: { query: 'recorded protocol' } };
    const gates = await inOwnerScope(() => loadToolSkillGates({ organizationId: ORG, userId: USER, sqlClient: requestClient() }, call));
    expect(classifyToolCall(call, gates)).toMatchObject({ kind: 'NEEDS_APPROVAL', tier: 'confirm', command: call.name,
      params: call.input, skillPolicyApproval: { actionHash: expect.stringMatching(/^[a-f0-9]{64}$/), rulesHash: gates?.ruleHash } });
  });
  it('a newly governed self tool uses the existing approval route', async () => {
    await addRule('convene_drafting_council');
    await hold('convene_drafting_council', { section_path: '2.5' });
    expect((await approve()).status).toBe(200);
    expect(actualCalls.map(c => c.name)).toEqual(['convene_drafting_council']);
  });
  it('a mandatory rule preserves the stronger reason tier and records the person’s final exact action hash', async () => {
    await addRule('seed_tmf');
    await hold('seed_tmf', { reason: 'A proposed model reason' });
    expect((await approve()).status).toBe(400);
    const res = await approve({ reasonForChange: 'The person corrected the seeding reason' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(actualCalls).toEqual([{ name: 'seed_tmf', input: { reason: 'The person corrected the seeding reason' } }]);
    expect(audits[0].details).toMatchObject({ tier: 'reason', proposedReason: 'A proposed model reason', reasonAsProposed: false });
    expect((audits[0].details.executedSkillPolicyApproval as any).actionHash).not.toBe((audits[0].details.skillPolicyApproval as any).actionHash);
  });
  it.each(['version', 'arguments', 'revocation'])('a changed %s invalidates an old held approval', async change => {
    await hold();
    if (change === 'version') await pg.exec('UPDATE account_skill_bundles SET version = version + 1');
    if (change === 'revocation') await pg.exec("UPDATE account_skill_bundles SET status = 'archived'");
    if (change === 'arguments') (pending as any).params.query = 'altered after the hold';
    const res = await approve();
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).toContain('SKILL_POLICY_CHANGED');
    expect(actualCalls).toEqual([]);
    expect(audits).toEqual([]);
  });
  it('serialized confirmation flags and policy hashes cannot authorize direct execution, including a child read', async () => {
    await hold();
    const { getToolHandler } = await import('../../../services/ana/AnaToolExecutor.js');
    const context = { organizationId: ORG, userId: USER, sqlClient: requestClient(), humanConfirmed: true, skillPolicyApproval: (pending as any).skillPolicyApproval };
    const parent = JSON.parse(await inOwnerScope(() => getToolHandler('search_document')!((pending as any).params, context)));
    const child = JSON.parse(await inOwnerScope(() => getToolHandler('search_document')!((pending as any).params, { ...context, agentDepth: 1 })));
    expect(parent.error).toBe('SKILL_POLICY_APPROVAL_REQUIRED');
    expect(child.error).toBe('SUB_AGENT_READ_ONLY');
    expect(actualCalls).toEqual([]);
  });
  it('the process-local grant is consumed; the same approved context cannot execute twice', async () => {
    await hold();
    expect((await approve()).status).toBe(200);
    const { getToolHandler } = await import('../../../services/ana/AnaToolExecutor.js');
    const replay = JSON.parse(await inOwnerScope(() => getToolHandler('search_document')!((pending as any).params, policyHarness.contexts[0] as any)));
    expect(replay.error).toBe('SKILL_POLICY_APPROVAL_REQUIRED');
    expect(actualCalls).toHaveLength(1);
  });
  it.each(['version', 'revocation'] as const)('a policy %s change after sign-off is refused at dispatch and audited as refused', async change => {
    await hold();
    policyHarness.driftAfterSignoff = change;
    expect((await approve()).status).toBe(200);
    expect(actualCalls).toEqual([]);
    expect(audits.find(a => a.action === 'ana.governed_action.executed')?.details.outcome).toBe('refused');
  });
  it('unreadable policies block both the approval route and a direct handler', async () => {
    await hold();
    policyHarness.readFails = true;
    expect((await approve()).status).toBe(503);
    const { getToolHandler } = await import('../../../services/ana/AnaToolExecutor.js');
    const result = JSON.parse(await inOwnerScope(() => getToolHandler('search_document')!({}, { organizationId: ORG, userId: USER, sqlClient: requestClient() })));
    expect(result.error).toBe('SKILL_POLICY_UNAVAILABLE');
    expect(actualCalls).toEqual([]);
  });
  it('a project rule applies from an org-wide turn and a mismatched open project cannot bypass it', async () => {
    await addRule('check_dossier_consistency', 5);
    await hold('check_dossier_consistency', { project_id: 5, draft_content: 'The recorded draft.' });
    expect((await approve()).status).toBe(200);
    const { loadToolSkillGates } = await import('../../../services/ana/governed-tool-gate.js');
    await expect(inOwnerScope(() => loadToolSkillGates({ organizationId: ORG, userId: USER, projectId: 6, sqlClient: requestClient() }, { name: 'check_dossier_consistency', input: { project_id: 5 } }))).rejects.toThrow();
    await expect(inOwnerScope(() => loadToolSkillGates({ organizationId: ORG, userId: USER, sqlClient: requestClient() }, { name: 'check_dossier_consistency', input: { project_id: 9 } }))).rejects.toThrow();
  });
});
