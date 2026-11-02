/**
 * Red probe for F1 2026-11-01 rbm-handlers. Not a suite: it lives in the
 * evidence folder and runs only through the config next to it in the README's
 * "Reproduce" section. Each `it` states the CANONICAL behaviour (the route and
 * the actuator), so a red result is the defect. The fix step copies these into
 * server/services/ana/__tests__/ and turns them green.
 *
 * The DB is a recording double routed by SQL text, the same approach as
 * server/services/ana/__tests__/rbm-launch-admission.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [] as Array<{ sql: string; params: unknown[] }>,
  assessments: [] as Array<{ id: number; status: string; overall_risk: string | null; version: number }>,
  items: [] as Array<Record<string, unknown>>,
}));
const PROGRAM = '11111111-1111-4111-8111-111111111111';

/** A transaction statement or an insert: answered here, so `query` stays one reader of the selects. */
function writeAnswer(s: string, params: unknown[]): { rows: unknown[] } | null {
  if (/^(BEGIN|COMMIT|ROLLBACK)/.test(s)) return { rows: [] };
  if (s.startsWith('INSERT INTO rbm_risk_assessments')) {
    const row = { id: 1, status: 'draft', overall_risk: params[4] as string, version: 1, program_id: PROGRAM };
    h.assessments.push(row);
    return { rows: [row] };
  }
  if (s.startsWith('INSERT INTO rbm_risk_items')) return { rows: [{ id: 99, assessment_id: params[1] ?? null }] };
  return null;
}

async function query(sql: string, params: unknown[] = []) {
  h.calls.push({ sql, params });
  const s = sql.replace(/\s+/g, ' ').trim();
  const written = writeAnswer(s, params);
  if (written) return written;
  // recordProgram (rbm-access.ts:26) and requireDraftAssessment (rbm-actuator.ts:70)
  if (s.includes('FROM rbm_risk_assessments WHERE organization_id=$1 AND id=$2')) {
    const a = h.assessments.find(x => x.id === Number(params[1]));
    return { rows: a ? [{ program_id: PROGRAM }] : [] };
  }
  if (s.includes('FROM rbm_risk_assessments WHERE id=$1 AND organization_id=$2')) {
    const a = h.assessments.find(x => x.id === Number(params[0]));
    return { rows: a ? [{ ...a, program_id: PROGRAM }] : [] };
  }
  if (s.includes('FROM rbm_risk_assessments')) {
    let rows = [...h.assessments];
    if (/status ?= ?'draft'/.test(s) && !s.includes('DESC')) rows = rows.filter(r => r.status === 'draft');
    if (s.includes("(status = 'active') DESC")) rows.sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));
    return { rows: s.includes('LIMIT 1') ? rows.slice(0, 1) : rows };
  }
  if (s.includes('FROM rbm_risk_items')) return { rows: h.items };
  return { rows: [] };
}

vi.mock('../../../../../server/db', async original => ({
  ...(await original<Record<string, unknown>>()),
  getPool: () => ({ query, connect: async () => ({ query, release: () => {} }) }),
}));
vi.mock('../../../../../server/services/c2c/program-access', async original => ({ ...(await original<Record<string, unknown>>()), programInOrganization: async () => true }));
vi.mock('../../../../../server/services/c2c/current-program-access', async original => ({ ...(await original<Record<string, unknown>>()), requireCurrentProgramAccess: async () => ({ programId: PROGRAM, projectId: 9, actor: { userId: 3, role: 'admin' } }) }));
vi.mock('../../../../../server/services/part11/editor-role', async original => ({ ...(await original<Record<string, unknown>>()), editorRoleDecision: async () => ({ allowed: true, role: 'admin' }) }));
vi.mock('../../../../../server/services/entitlements/enforcement-mode', () => ({ currentEnforcementMode: async () => ({ mode: 'off' }) }));
vi.mock('../../../../../server/services/c2c/governed-program-write', () => ({ requireGovernedProgramWriteTx: async () => {} }));

import { getToolHandler } from '../../../../../server/services/ana/AnaToolExecutor';
import { DEFAULT_CTQ_FACTORS } from '../../../../../server/services/rbm/rbm-engine';

const ctx = { organizationId: 7, userId: 3, humanConfirmed: true };
const run = async (tool: string, input: Record<string, unknown>) => JSON.parse(await getToolHandler(tool)!(input, ctx as never));
const itemInserts = () => h.calls.filter(c => c.sql.includes('INSERT INTO rbm_risk_items'));
const itemReads = () => h.calls.filter(c => /FROM rbm_risk_items/.test(c.sql) && !c.sql.includes('INSERT'));
const factor = { programId: PROGRAM, ctqFactor: 'Late SAE entry at site 104', likelihood: 4, impact: 4 };

beforeEach(() => {
  vi.stubEnv('LAUNCH_SCOPE_ENFORCE', 'off');
  h.calls.length = 0; h.assessments.length = 0; h.items.length = 0;
});

describe('(a) add_ctq_factor', () => {
  it('a1: attaches the factor to the study\'s one open draft assessment', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    await run('add_ctq_factor', factor);
    expect(itemInserts()).toHaveLength(1);
    expect(itemInserts()[0].params[1]).toBe(12); // assessment_id
  });

  it('a2: refuses, and writes nothing, when the study has no draft (only a signed version)', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1 });
    const out = await run('add_ctq_factor', factor);
    expect(out.error).toBeTruthy();
    expect(itemInserts()).toHaveLength(0);
  });

  it('a3: refuses a named signed assessment, as POST /rbm-risk-items does (mdx-rbm.ts:361)', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1 });
    const out = await run('add_ctq_factor', { ...factor, assessmentId: 10 });
    expect(out.error).toBeTruthy();
    expect(itemInserts()).toHaveLength(0);
  });

  it('a4: refuses likelihood 7, which the route refuses with 422 (SCALE_1_5, mdx-rbm.ts:115)', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 2 });
    const out = await run('add_ctq_factor', { ...factor, likelihood: 7, impact: 5 });
    expect(out.error).toBeTruthy();
    expect(itemInserts()).toHaveLength(0);
  });
});

describe('(b) generate_rbm_plan', () => {
  it('b1: refuses when the study has no risk assessment, instead of answering "medium"', async () => {
    const out = await run('generate_rbm_plan', { programId: PROGRAM });
    expect(out.overallRisk).toBeUndefined();
    expect(out.error).toBeTruthy();
  });

  it('b2: refuses when the only assessment is an unsigned draft (rbm-actuator.ts:497)', async () => {
    h.assessments.push({ id: 12, status: 'draft', overall_risk: 'high', version: 1 });
    const out = await run('generate_rbm_plan', { programId: PROGRAM });
    expect(out.error).toBeTruthy();
  });

  it('b3: takes critical factors from the approved assessment only (rbm-actuator.ts:504-511)', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1 });
    await run('generate_rbm_plan', { programId: PROGRAM });
    expect(itemReads().length).toBeGreaterThan(0);
    for (const c of itemReads()) expect(c.sql).toMatch(/assessment_id\s*=\s*\$\d/);
  });

  it('b4: refuses an approved assessment that records no overall risk, instead of "medium"', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: null, version: 1 });
    const out = await run('generate_rbm_plan', { programId: PROGRAM });
    expect(out.overallRisk).not.toBe('medium');
    expect(out.error).toBeTruthy();
  });
});

describe('(c) run_rbm_assessment', () => {
  it('c1 (holds today): seed:true writes the canonical library as one unsigned draft', async () => {
    const out = await run('run_rbm_assessment', { programId: PROGRAM, seed: true });
    expect(out.assessment?.status).toBe('draft');
    expect(itemInserts()).toHaveLength(DEFAULT_CTQ_FACTORS.length);
    expect(h.calls.some(c => c.sql.trim() === 'COMMIT')).toBe(true);
  });

  it('c2 (holds today): seed:true does not write when the study already has an assessment', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1 });
    await run('run_rbm_assessment', { programId: PROGRAM, seed: true });
    expect(h.calls.some(c => c.sql.includes('INSERT'))).toBe(false);
  });

  it('c3: the summary reads the factors of the assessment it returns, not every version', async () => {
    h.assessments.push({ id: 10, status: 'active', overall_risk: 'high', version: 1 });
    await run('run_rbm_assessment', { programId: PROGRAM });
    expect(itemReads().length).toBeGreaterThan(0);
    for (const c of itemReads()) expect(c.sql).toMatch(/assessment_id\s*=\s*\$\d/);
  });
});
