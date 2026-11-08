/**
 * AnA's three RBM handlers do what the route and the actuator do
 * (docs/evidence/F1/2026-11-01-rbm-handlers/README.md):
 *
 *   (a) add_ctq_factor joins the factor to the study's open draft assessment,
 *       in one transaction, under the route's draft rule and input checks.
 *   (b) generate_rbm_plan proposes exactly what POST
 *       /rbm-monitoring-plans/generate would save, from the approved
 *       assessment only, and never invents an overall risk.
 *   (c) run_rbm_assessment summarizes one version: the highest, with its own
 *       factors. Its seed stays the canonical template start.
 *
 * The DB is a recording double routed by SQL text, as in
 * rbm-launch-admission.test.ts. Admission runs for real except for the same
 * mocks that suite uses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Assessment = { id: number; status: string; overall_risk: string | null; version: number; title?: string };
type Item = { id: number; assessment_id: number | null; ctq_factor: string; risk_score: number; is_critical: boolean; status: string; mitigation?: string | null };

const h = vi.hoisted(() => {
  const state = {
    calls: [] as Array<{ sql: string; params: unknown[] }>,
    poolSql: [] as string[],
    assessments: [] as Assessment[],
    items: [] as Item[],
    sites: [] as Array<{ site_number: string; site_name: string | null }>,
    draftPlans: [] as Array<{ id: number; version: number }>,
    write: vi.fn(),
    release: vi.fn(),
    connect: vi.fn(),
    pool: null as unknown as { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; connect: () => Promise<unknown> },
  };
  // One canonical pool object, as getPool() returns in production.
  state.pool = {
    query: (sql: string, params?: unknown[]) => { state.poolSql.push(sql.trim()); return query(sql, params); },
    connect: () => state.connect(),
  };
  return state;
});
const PROGRAM = '11111111-1111-4111-8111-111111111111';

type Rows = { rows: any[] };

function assessmentRows(s: string, params: unknown[]): Rows {
  // recordProgram (rbm-access.ts) — the admission's record-to-project check.
  if (s.includes('FROM rbm_risk_assessments WHERE organization_id=$1 AND id=$2')) {
    const a = h.assessments.find(x => x.id === Number(params[1]));
    return { rows: a ? [{ program_id: PROGRAM }] : [] };
  }
  // requireDraftAssessment (rbm-actuator.ts) — the draft rule, under a lock.
  if (s.includes('FROM rbm_risk_assessments WHERE id=$1 AND organization_id=$2')) {
    const a = h.assessments.find(x => x.id === Number(params[0]));
    return { rows: a ? [{ ...a, program_id: PROGRAM }] : [] };
  }
  // Newest version first (updated_at stands in as the version here); the
  // actuator's governing choice puts the approved version ahead of that.
  const rows = [...h.assessments].sort((a, b) => b.version - a.version);
  if (s.includes("(status = 'active') DESC")) rows.sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));
  return { rows: s.includes('LIMIT 1') ? rows.slice(0, 1) : rows };
}

function itemRows(s: string, params: unknown[]): Rows {
  let rows = [...h.items];
  const scoped = s.match(/assessment_id = \$(\d)/);
  if (scoped) rows = rows.filter(r => r.assessment_id === params[Number(scoped[1]) - 1]);
  if (s.includes('is_critical = true')) rows = rows.filter(r => r.is_critical);
  if (s.includes("status IN ('open','mitigating')")) rows = rows.filter(r => r.status === 'open' || r.status === 'mitigating');
  return { rows: rows.sort((a, b) => b.risk_score - a.risk_score) };
}

function insertRows(s: string, params: unknown[]): Rows {
  if (s.startsWith('INSERT INTO rbm_risk_assessments')) {
    const row = { id: 1, status: 'draft', overall_risk: params[4] as string, version: 1 };
    h.assessments.push(row);
    return { rows: [row] };
  }
  if (s.startsWith('INSERT INTO rbm_risk_items')) return { rows: [{ id: 99, assessment_id: params[1] ?? null }] };
  return { rows: [{ id: 500 }] };
}

async function query(sql: string, params: unknown[] = []): Promise<Rows> {
  h.calls.push({ sql, params });
  const s = sql.replace(/\s+/g, ' ').trim();
  if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(s)) return { rows: [] };
  if (s.startsWith('INSERT')) return insertRows(s, params);
  if (s.includes('FROM rbm_risk_assessments')) return assessmentRows(s, params);
  if (s.includes('FROM rbm_risk_items')) return itemRows(s, params);
  if (s.includes('FROM rbm_site_risk_scores')) return { rows: h.sites };
  if (s.includes('FROM rbm_monitoring_plans') && s.includes("status = 'draft'")) return { rows: h.draftPlans.slice(0, 1) };
  return { rows: [] };
}

vi.mock('../../../db', async original => ({ ...(await original<Record<string, unknown>>()), getPool: () => h.pool }));
vi.mock('../../c2c/program-access', async original => ({ ...(await original<Record<string, unknown>>()), programInOrganization: async () => true }));
vi.mock('../../c2c/current-program-access', async original => ({ ...(await original<Record<string, unknown>>()), requireCurrentProgramAccess: async () => ({ programId: PROGRAM, projectId: 9, actor: { userId: 3, role: 'admin' } }) }));
vi.mock('../../part11/editor-role', async original => ({ ...(await original<Record<string, unknown>>()), editorRoleDecision: async () => ({ allowed: true, role: 'admin' }) }));
vi.mock('../../entitlements/enforcement-mode', () => ({ currentEnforcementMode: async () => ({ mode: 'off' }) }));
// The registry's mandatory-skill check (governed-tool-gate.ts, P-104) reads the
// organisation's rules from the database; these cases are about RBM, so the
// organisation has none, as in nonclinical-drafts-refuse-model-figures.test.ts.
vi.mock('../governed-tool-gate.js', async orig => ({
  ...await orig<typeof import('../governed-tool-gate.js')>(),
  loadToolSkillGates: async (scope?: { organizationId?: number; userId?: number; projectId?: number }) => scope?.organizationId
    ? { organizationId: scope.organizationId, userId: scope.userId ?? null, projectId: scope.projectId ?? null,
      rules: [], ruleHash: 'e'.repeat(64) } : null,
}));
vi.mock('../../c2c/governed-program-write', () => ({
  // Recorded into the SQL log so a test can see where the write recheck ran.
  requireGovernedProgramWriteTx: (...args: unknown[]) => { h.calls.push({ sql: '-- write recheck', params: [] }); return h.write(...args); },
}));

import { getToolHandler } from '../AnaToolExecutor';
import { DEFAULT_CTQ_FACTORS } from '../../rbm/rbm-engine';

const ctx = { organizationId: 7, userId: 3, humanConfirmed: true };
const run = async (tool: string, input: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  JSON.parse(await getToolHandler(tool)!(input, { ...ctx, ...extra } as never));
const sqlIs = (s: string) => h.calls.findIndex(c => c.sql.trim() === s);
const itemInserts = () => h.calls.filter(c => c.sql.includes('INSERT INTO rbm_risk_items'));
const itemReads = () => h.calls.filter(c => /FROM rbm_risk_items/.test(c.sql) && !c.sql.includes('INSERT'));
const writes = () => h.calls.filter(c => /^\s*(INSERT|UPDATE|DELETE|BEGIN)\b/.test(c.sql));
const factor = { programId: PROGRAM, ctqFactor: 'Late SAE entry at site 104', likelihood: 4, impact: 4 };
const READ_ONLY = 'This assessment and its factors are read-only. Open an amendment to edit a new draft version; the signed version stays on file.';

beforeEach(() => {
  vi.stubEnv('LAUNCH_SCOPE_ENFORCE', 'off');
  h.calls.length = 0; h.poolSql.length = 0; h.assessments.length = 0; h.items.length = 0; h.sites.length = 0; h.draftPlans.length = 0;
  h.write = vi.fn(async () => {});
  h.release.mockReset();
  h.connect.mockReset().mockImplementation(async () => ({ query, release: h.release }));
});
afterEach(() => vi.unstubAllEnvs());

describe('(a) add_ctq_factor joins the study\'s open draft assessment, as POST /rbm-risk-items does', () => {
  it('a1: attaches the factor to the study\'s one open draft, inside one transaction', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    const out = await run('add_ctq_factor', factor);
    expect(out.error).toBeUndefined();
    expect(itemInserts()).toHaveLength(1);
    expect(itemInserts()[0].params[1]).toBe(12); // assessment_id
    const begin = sqlIs('BEGIN'), insert = h.calls.indexOf(itemInserts()[0]), commit = sqlIs('COMMIT');
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(begin).toBeLessThan(insert);
    expect(commit).toBeGreaterThan(insert);
  });

  it('a1b: with a signed v1 and an open amendment v2, the factor joins the draft v2', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1 });
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    await run('add_ctq_factor', factor);
    expect(itemInserts()).toHaveLength(1);
    expect(itemInserts()[0].params[1]).toBe(12);
  });

  it('a2: refuses with the actuator\'s read-only reason, and writes nothing, when the only version is signed', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1 });
    const out = await run('add_ctq_factor', factor);
    expect(out.error).toBe(READ_ONLY);
    expect(out.code).toBe('RBM_ASSESSMENT_IMMUTABLE');
    expect(itemInserts()).toHaveLength(0);
    expect(sqlIs('ROLLBACK')).toBeGreaterThanOrEqual(0);
    expect(sqlIs('COMMIT')).toBe(-1);
  });

  it('a3: refuses a named signed assessment, as the route does (requireDraftAssessment)', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1 });
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    const out = await run('add_ctq_factor', { ...factor, assessmentId: 10 });
    expect(out.error).toBe(READ_ONLY);
    expect(itemInserts()).toHaveLength(0);
  });

  it('a3b: a named draft is used even when the study has two drafts', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    h.assessments.push({ id: 13, status: 'draft', overall_risk: 'high', version: 3 });
    await run('add_ctq_factor', { ...factor, assessmentId: 12 });
    expect(itemInserts()).toHaveLength(1);
    expect(itemInserts()[0].params[1]).toBe(12);
  });

  it('a3c: the snake_case assessment_id the admission checks is the one the factor joins', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    h.assessments.push({ id: 13, status: 'draft', overall_risk: 'high', version: 3 });
    await run('add_ctq_factor', { ...factor, assessment_id: 13 });
    expect(itemInserts()).toHaveLength(1);
    expect(itemInserts()[0].params[1]).toBe(13);
  });

});

describe('(a) add_ctq_factor refuses what the route refuses, and writes as the route does', () => {
  it('a4: refuses likelihood 7, which the route refuses with 422 (SCALE_1_5), and writes nothing', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    const out = await run('add_ctq_factor', { ...factor, likelihood: 7, impact: 5 });
    expect(out.error).toMatch(/likelihood/i);
    expect(out.code).toBe('RBM_INVALID_FACTOR');
    expect(itemInserts()).toHaveLength(0);
  });

  it('a4b: refuses a category the route does not accept', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    const out = await run('add_ctq_factor', { ...factor, category: 'quality' });
    expect(out.error).toMatch(/category/i);
    expect(itemInserts()).toHaveLength(0);
  });

  it('a4c: refuses an unreadable optional input instead of saving the default in its place', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    for (const bad of [{ detectability: 'high' }, { detectability: 0 }, { category: 5 }, { isCritical: 'yes' }]) {
      const out = await run('add_ctq_factor', { ...factor, ...bad });
      expect(out.error).toMatch(/Nothing was saved/);
    }
    expect(itemInserts()).toHaveLength(0);
  });

  it('a5: refuses when the study has no assessment, pointing to the seed, and writes nothing', async () => {
    const out = await run('add_ctq_factor', factor);
    expect(out.error).toMatch(/no risk assessment/i);
    expect(out.error).toMatch(/run_rbm_assessment/);
    expect(out.error).toMatch(/Nothing was saved/);
    expect(itemInserts()).toHaveLength(0);
  });

  it('a6: refuses when the study has more than one draft, naming each', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    h.assessments.push({ id: 13, status: 'draft', overall_risk: 'high', version: 3 });
    const out = await run('add_ctq_factor', factor);
    expect(out.error).toMatch(/#12 \(version 2\)/);
    expect(out.error).toMatch(/#13 \(version 3\)/);
    expect(out.code).toBe('RBM_ASSESSMENT_AMBIGUOUS');
    expect(itemInserts()).toHaveLength(0);
  });

  it('a7: rechecks write authority on the transaction before the insert, and a revoked one writes nothing', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    await run('add_ctq_factor', factor);
    const begin = sqlIs('BEGIN');
    expect(begin).toBeGreaterThanOrEqual(0);
    const recheck = h.calls.findIndex((c, i) => i > begin && c.sql === '-- write recheck');
    expect(recheck).toBeGreaterThan(begin);
    expect(recheck).toBeLessThan(h.calls.indexOf(itemInserts()[0]));

    h.calls.length = 0;
    // Admission's own check passes; the recheck on the transaction does not.
    h.write = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(Object.assign(new Error('revoked'), { status: 403, code: 'PROJECT_PERMISSION_DENIED' }));
    const out = await run('add_ctq_factor', factor);
    expect(out.error).toBeTruthy();
    expect(itemInserts()).toHaveLength(0);
    expect(sqlIs('ROLLBACK')).toBeGreaterThanOrEqual(0);
  });

  it('a8: leases the canonical pool for the transaction instead of transacting through pool.query', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    await run('add_ctq_factor', factor, { sqlClient: h.pool });
    expect(itemInserts()).toHaveLength(1);
    expect(h.connect).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.poolSql.some(s => /^(BEGIN|COMMIT|ROLLBACK|INSERT)\b/.test(s))).toBe(false);
  });

  it('a9: transacts on a pinned request client as supplied', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    const pinned = { query, connect: vi.fn(async () => { throw new Error('Client has already been connected'); }) };
    await run('add_ctq_factor', factor, { sqlClient: pinned });
    expect(itemInserts()).toHaveLength(1);
    expect(pinned.connect).not.toHaveBeenCalled();
    expect(h.connect).not.toHaveBeenCalled();
    expect(sqlIs('COMMIT')).toBeGreaterThanOrEqual(0);
  });
});

describe('(b) generate_rbm_plan proposes what POST /rbm-monitoring-plans/generate would save', () => {
  it('b1: refuses with the route\'s reason when the study has no risk assessment, instead of answering "medium"', async () => {
    const out = await run('generate_rbm_plan', { programId: PROGRAM });
    expect(out.overallRisk).toBeUndefined();
    expect(out.error).toBe('No risk assessment exists for this study — run the risk assessment (RACT) before generating a monitoring plan');
  });

  it('b2: refuses with the route\'s reason when the only assessment is an unsigned draft', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 1 });
    const out = await run('generate_rbm_plan', { programId: PROGRAM });
    expect(out.overallRisk).toBeUndefined();
    expect(out.error).toBe('This study\'s risk assessment has not been approved. A monitoring plan must derive from a signed RACT — approve the assessment first.');
  });

  it('b3: derives from the approved version and its factors only, not a newer draft amendment', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1 });
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'low', version: 2 });
    h.items.push({ id: 21, assessment_id: 10, ctq_factor: 'SAE reporting', risk_score: 20, is_critical: true, status: 'open' });
    h.items.push({ id: 31, assessment_id: 12, ctq_factor: 'SAE reporting', risk_score: 20, is_critical: true, status: 'open' });
    const out = await run('generate_rbm_plan', { programId: PROGRAM });
    expect(out.derivedFrom).toMatchObject({ assessmentId: 10, overallRisk: 'high' });
    expect(out.proposedActions.map((a: { riskItemId: number }) => a.riskItemId)).toEqual([21]);
    expect(itemReads().length).toBeGreaterThan(0);
    for (const c of itemReads()) expect(c.sql).toMatch(/assessment_id\s*=\s*\$\d/);
  });

  it('b4: refuses an approved assessment that records no overall risk, instead of "medium"', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: null, version: 1 });
    const out = await run('generate_rbm_plan', { programId: PROGRAM });
    expect(out.overallRisk).toBeUndefined();
    expect(out.error).toMatch(/records no overall risk/);
  });

  it('b5: the proposal is the route\'s derivation — an issue per open critical factor, a visit per enhanced site — and nothing is written', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1, title: 'RACT' });
    h.items.push({ id: 21, assessment_id: 10, ctq_factor: 'SAE reporting', risk_score: 20, is_critical: true, status: 'open' });
    h.items.push({ id: 22, assessment_id: 10, ctq_factor: 'Consent', risk_score: 9, is_critical: true, status: 'mitigating' });
    h.items.push({ id: 23, assessment_id: 10, ctq_factor: 'Typo', risk_score: 4, is_critical: false, status: 'open' });
    h.items.push({ id: 24, assessment_id: 10, ctq_factor: 'Closed one', risk_score: 16, is_critical: true, status: 'closed' });
    h.sites.push({ site_number: '5', site_name: 'Mercy' });
    const out = await run('generate_rbm_plan', { programId: PROGRAM });
    expect(out.recommendedStrategy).toBe('hybrid');
    expect(out.proposedActions).toEqual([
      { actionType: 'issue', riskItemId: 21, priority: 'high', description: 'Confirm the monitoring control for: SAE reporting', dueInDays: 14 },
      { actionType: 'issue', riskItemId: 22, priority: 'medium', description: 'Confirm the monitoring control for: Consent', dueInDays: 14 },
      { actionType: 'site_visit', riskItemId: null, priority: 'high', description: 'Enhanced-tier oversight visit — site 5 (Mercy)', dueInDays: 30 },
    ]);
    expect(writes()).toHaveLength(0);
  });

  it('b6: says when a draft plan is already open, since generating would then be refused', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'low', version: 1 });
    h.draftPlans.push({ id: 4, version: 3 });
    const out = await run('generate_rbm_plan', { programId: PROGRAM });
    expect(out.recommendedStrategy).toBe('centralized');
    expect(out.openDraftPlan).toEqual({ id: 4, version: 3 });
    expect(writes()).toHaveLength(0);
  });
});

describe('(c) run_rbm_assessment summarizes one version; its seed is the canonical template start', () => {
  it('c1 (guard): seed:true writes the canonical library as one unsigned draft, in one transaction', async () => {
    const out = await run('run_rbm_assessment', { programId: PROGRAM, seed: true });
    expect(out.assessment?.status).toBe('draft');
    expect(out.seeded).toBe(true);
    expect(itemInserts()).toHaveLength(DEFAULT_CTQ_FACTORS.length);
    expect(sqlIs('COMMIT')).toBeGreaterThanOrEqual(0);
  });

  it('c2 (guard): seed:true does not write when the study already has an assessment, and says so', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1 });
    const out = await run('run_rbm_assessment', { programId: PROGRAM, seed: true });
    expect(h.calls.some(c => c.sql.includes('INSERT'))).toBe(false);
    expect(out.seeded).toBe(false);
    expect(out.note).toMatch(/^Nothing was seeded: the study already has a risk assessment \(version 1, active\)/);
  });

  it('c2b: a draft summary says the draft governs nothing; an approved one carries no such note', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1 });
    expect((await run('run_rbm_assessment', { programId: PROGRAM })).note).toBeUndefined();
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'low', version: 2 });
    expect((await run('run_rbm_assessment', { programId: PROGRAM })).note).toMatch(/unsigned draft/);
  });

  it('c3: the summary reads the factors of the assessment it returns, not every version', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1 });
    await run('run_rbm_assessment', { programId: PROGRAM });
    expect(itemReads().length).toBeGreaterThan(0);
    for (const c of itemReads()) expect(c.sql).toMatch(/assessment_id\s*=\s*\$\d/);
  });

  it('c4: after an amendment it returns the draft v2 as a draft, with each factor once', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1 });
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    h.items.push({ id: 21, assessment_id: 10, ctq_factor: 'SAE reporting', risk_score: 20, is_critical: true, status: 'open' });
    h.items.push({ id: 31, assessment_id: 12, ctq_factor: 'SAE reporting', risk_score: 20, is_critical: true, status: 'open' });
    const out = await run('run_rbm_assessment', { programId: PROGRAM });
    expect(out.assessment).toMatchObject({ id: 12, status: 'draft', version: 2 });
    expect(out.criticalFactors).toEqual(['SAE reporting']);
    expect(out.items).toHaveLength(1);
  });

  it('c5: the "No RACT yet" hint appears only when the study has no assessment', async () => {
    const none = await run('run_rbm_assessment', { programId: PROGRAM });
    expect(none.assessment).toBeNull();
    expect(none.hint).toMatch(/No RACT yet/);

    h.assessments.push({ id: 12, status: 'draft', overall_risk: null, version: 1 });
    const empty = await run('run_rbm_assessment', { programId: PROGRAM });
    expect(empty.assessment).toMatchObject({ id: 12 });
    expect(empty.items).toEqual([]);
    expect(empty.hint).toBeUndefined();
  });
});
