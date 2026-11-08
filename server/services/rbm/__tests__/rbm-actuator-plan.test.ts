/**
 * RBM actuator — the plan's derivation from the governing RACT.
 *
 * Split out of rbm-actuator.test.ts (2026-11-02, which had reached the
 * 500-line limit). generatePlanFromAssessment writes the plan;
 * derivePlanFromAssessment is its read half, which AnA's generate_rbm_plan
 * proposes from. Same scripted mock Exec as the parent file.
 */

import { describe, it, expect } from 'vitest';
import { generatePlanFromAssessment, derivePlanFromAssessment, draftPlan, RBM_PLAN_REFUSAL, type Exec } from '../rbm-actuator';

function mockExec(script: any[][]) {
  const calls: { sql: string; args: unknown[] }[] = [];
  let i = 0;
  const exec: Exec = {
    async query(sql: string, args: unknown[]) {
      calls.push({ sql, args });
      const rows = script[i] ?? [];
      i += 1;
      return { rows };
    },
  };
  return { exec, calls };
}

const ORG = 42;

describe('generatePlanFromAssessment — derives the plan from the RACT', () => {
  it('derives strategy from the overall risk and seeds actions from the critical CtQs and enhanced sites', async () => {
    const { exec, calls } = mockExec([
      [{ id: 7, title: 'RACT', overall_risk: 'high', status: 'active' }],   // governing assessment
      [{ id: 21, ctq_factor: 'SAE reporting', risk_score: 20 },         // open critical factors
       { id: 22, ctq_factor: 'Consent', risk_score: 9 }],
      [{ site_number: '5', site_name: 'Mercy' }],                       // enhanced-tier sites
      [],                                                               // no open draft plan
      [{ v: 1 }],                                                       // max version on file
      [{ id: 3, strategy: 'hybrid' }],                                  // plan insert
      [{ id: 41 }], [{ id: 42 }], [{ id: 43 }],                         // action inserts
    ]);
    const out = await generatePlanFromAssessment(exec, ORG, { programId: 'p', createdBy: 27 });
    expect(out.generated).toBe(true);
    expect(out.derivedFrom).toMatchObject({ assessmentId: 7, overallRisk: 'high', criticalFactors: 2, enhancedSites: 1 });
    // High overall risk → hybrid strategy, per defaultPlanStrategy.
    expect(calls[5].args).toContain('hybrid');
    // The plan is a DRAFT until it is signed for, and takes the next version.
    expect(calls[5].sql).toContain("'draft'");
    expect(calls[5].args).toContain(2);
    // One action per critical factor (priority banded off its own score) plus
    // one visit per enhanced-tier site.
    expect(out.actions).toHaveLength(3);
    expect(calls[6].args).toContain('high');    // score 20 → high band
    expect(calls[7].args).toContain('medium');  // score 9  → medium band
    expect(calls[8].sql).toContain('site_visit');
    // Tenant scope on every write.
    for (const c of calls) expect(c.args[0]).toBe(ORG);
  });

  it('scopes the seeded actions to the governing assessment, not the program', async () => {
    // A program can hold several assessment versions; seeding program-wide
    // would let the plan claim derivation from one RACT while its actions came
    // from a superseded or draft one.
    const { exec, calls } = mockExec([
      [{ id: 7, title: 'RACT v2', overall_risk: 'medium', status: 'active' }],
      [], [], [], [{ v: 0 }], [{ id: 3 }],
    ]);
    await generatePlanFromAssessment(exec, ORG, { programId: 'p', createdBy: 27 });
    const factorQuery = calls[1];
    expect(factorQuery.sql).toContain('assessment_id = $3');
    expect(factorQuery.args).toEqual([ORG, 'p', 7]);
  });

  it('generates nothing when the study has no risk assessment to derive from', async () => {
    const { exec, calls } = mockExec([[]]);
    const out = await generatePlanFromAssessment(exec, ORG, { programId: 'p', createdBy: 27 });
    expect(out.generated).toBe(false);
    expect(out.reason).toBe('no_assessment');
    // No plan and no actions were written.
    expect(calls).toHaveLength(1);
  });

  it('refuses to derive a plan from an unapproved RACT', async () => {
    // The plan-approval endpoint would otherwise activate a monitoring
    // commitment whose risk basis nobody ever signed for. Fail closed.
    const { exec, calls } = mockExec([[{ id: 7, title: 'RACT', overall_risk: 'high', status: 'draft' }]]);
    const out = await generatePlanFromAssessment(exec, ORG, { programId: 'p', createdBy: 27 });
    expect(out.generated).toBe(false);
    expect(out.reason).toBe('assessment_not_approved');
    expect(calls).toHaveLength(1);
  });

  it('has its own sentence for every reason it refuses with', () => {
    const reasons: Array<NonNullable<Awaited<ReturnType<typeof generatePlanFromAssessment>>['reason']>> =
      ['no_assessment', 'assessment_not_approved', 'overall_risk_not_recorded', 'draft_already_open', 'actor_required'];
    const sentences = reasons.map(r => RBM_PLAN_REFUSAL[r]);
    for (const s of sentences) expect(s).toMatch(/\S/);
    expect(new Set(sentences).size).toBe(reasons.length);
    expect(RBM_PLAN_REFUSAL.overall_risk_not_recorded).toMatch(/records no overall risk/);
  });
});

describe('generated plans retain an actor and a recorded risk basis', () => {
  it.each([null, undefined, '', 'unknown'])('refuses unrecorded overall risk %s before persisting a plan or actions', async overallRisk => {
    const { exec, calls } = mockExec([
      [{ id: 7, title: 'RACT', overall_risk: overallRisk, status: 'active' }],
      [], [], [], [{ v: 0 }], [{ id: 3 }],
    ]);
    expect(await generatePlanFromAssessment(exec, ORG, { programId: 'p', createdBy: 27 }))
      .toEqual({ generated: false, reason: 'overall_risk_not_recorded' });
    expect(calls.some(c => /^\s*(INSERT|UPDATE|DELETE)/.test(c.sql))).toBe(false);
  });

  it.each([undefined, null, 0, -1, 1.5, NaN])('refuses an unverified generating actor %s before reading or writing', async createdBy => {
    const { exec, calls } = mockExec([[]]);
    expect(await generatePlanFromAssessment(exec, ORG, { programId: 'p', createdBy: createdBy as number }))
      .toEqual({ generated: false, reason: 'actor_required' });
    expect(calls).toHaveLength(0);
  });
});

describe('derivePlanFromAssessment — the read-only half, shared with AnA', () => {
  const script = () => [
    [{ id: 7, title: 'RACT', overall_risk: 'high', status: 'active', version: 2 }],
    [{ id: 21, ctq_factor: 'SAE reporting', risk_score: 20 }, { id: 22, ctq_factor: 'Consent', risk_score: 9 }],
    [{ site_number: '5', site_name: 'Mercy' }],
  ];

  it('proposes exactly the actions generatePlanFromAssessment inserts, and writes nothing', async () => {
    const read = mockExec(script());
    const derived = await derivePlanFromAssessment(read.exec, ORG, 'p');
    expect(read.calls).toHaveLength(3);
    expect(read.calls.some(c => /^\s*(INSERT|UPDATE|DELETE)/.test(c.sql))).toBe(false);

    const write = mockExec([...script(), [], [{ v: 0 }], [{ id: 3 }], [{ id: 41 }], [{ id: 42 }], [{ id: 43 }]]);
    const generated = await generatePlanFromAssessment(write.exec, ORG, { programId: 'p', createdBy: 27 });
    expect(derived.derived).toBe(true);
    if (!derived.derived) return;
    expect(derived.strategy).toBe('hybrid');
    expect(write.calls[5].args).toContain(derived.strategy);
    const inserted = write.calls.slice(6).map(c => ({ sql: c.sql, args: c.args }));
    expect(inserted).toHaveLength(derived.actions.length);
    derived.actions.forEach((a, i) => {
      expect(inserted[i].sql).toContain(a.actionType === 'issue' ? "'issue'" : "'site_visit'");
      expect(inserted[i].sql).toContain(`INTERVAL '${a.dueInDays} days'`);
      expect(inserted[i].args).toContain(a.description);
      if (a.actionType === 'issue') {
        expect(inserted[i].args).toContain(a.riskItemId);
        expect(inserted[i].args).toContain(a.priority);
      } else expect(inserted[i].sql).toContain(`'${a.priority}'`);
    });
    expect(generated.derivedFrom).toMatchObject({ assessmentId: 7, overallRisk: 'high', criticalFactors: 2, enhancedSites: 1 });
  });

  it('reports an approved assessment that records no overall risk as unrecorded, not "medium"', async () => {
    const { exec } = mockExec([[{ id: 7, title: 'RACT', overall_risk: null, status: 'active', version: 1 }], [], []]);
    const derived = await derivePlanFromAssessment(exec, ORG, 'p');
    expect(derived).toMatchObject({ derived: true, recordedOverallRisk: null, strategy: null });
  });

  it('refuses with the actuator\'s reasons: no assessment, and an unapproved one', async () => {
    expect(await derivePlanFromAssessment(mockExec([[]]).exec, ORG, 'p')).toEqual({ derived: false, reason: 'no_assessment' });
    expect(await derivePlanFromAssessment(mockExec([[{ id: 7, status: 'draft', overall_risk: 'high' }]]).exec, ORG, 'p'))
      .toEqual({ derived: false, reason: 'assessment_not_approved' });
  });
});

// Moved from rbm-actuator.test.ts (2026-11-02), which is at its 500-line limit.
// Each scripts an approved assessment since draftPlan infers only from one; the
// old "falls back to risk_based with no assessment" case is now the refusal below.
describe('draftPlan — the plan shell', () => {
  it('draftPlan infers strategy from the approved assessment\'s overall risk, and takes the next version', async () => {
    const { exec, calls } = mockExec([
      [{ id: 7, title: 'RACT', overall_risk: 'high', status: 'active', version: 1 }], // governing assessment
      [],                         // no open draft
      [{ v: 1 }],                 // max version on file
      [{ id: 11, strategy: 'hybrid' }], // INSERT plan
    ]);
    const out = await draftPlan(exec, ORG, { programId: 'p' });
    // defaultPlanStrategy('high') → 'hybrid'
    expect(out.inferred).toEqual({ strategy: 'hybrid', fromOverallRisk: 'high', fromAssessment: { id: 7, version: 1 } });
    expect(out.plan).toMatchObject({ id: 11 });
    expect(calls[3].args[5]).toBe(2);
  });

  it('draftPlan reports an open draft rather than opening a second one', async () => {
    const { exec, calls } = mockExec([[{ id: 7, title: 'RACT', overall_risk: 'low', status: 'active', version: 1 }], [{ id: 4, version: 2 }]]);
    const out = await draftPlan(exec, ORG, { programId: 'p' });
    expect(out.plan).toBeNull();
    expect(out).toMatchObject({ refused: 'draft_already_open' });
    expect(calls.some(c => c.sql.includes('INSERT'))).toBe(false);
  });
});

// draftPlan chooses its basis as generatePlanFromAssessment does: the approved
// (active) RACT, or nothing (docs/evidence/F1/2026-11-02-rbm-outside-items/README.md).
describe('draftPlan — infers the strategy only from the approved RACT', () => {
  const inserts = (calls: { sql: string; args: unknown[] }[]) => calls.filter(c => c.sql.includes('INSERT'));

  it('refuses to infer from an unsigned draft RACT, and writes nothing', async () => {
    const { exec, calls } = mockExec([[{ id: 7, title: 'RACT', overall_risk: 'high', status: 'draft', version: 1 }], [], [{ v: 0 }], [{ id: 99, strategy: 'hybrid' }]]);
    const out = await draftPlan(exec, ORG, { programId: 'p' });
    expect(out.plan).toBeNull();
    expect(out).toMatchObject({ refused: 'assessment_not_approved', message: RBM_PLAN_REFUSAL.assessment_not_approved });
    expect(inserts(calls)).toHaveLength(0);
  });

  it('reads the governing (active-first) version and binds the plan to it', async () => {
    const { exec, calls } = mockExec([[{ id: 1, title: 'RACT', overall_risk: 'high', status: 'active', version: 2 }], [], [{ v: 0 }], [{ id: 11 }]]);
    const out = await draftPlan(exec, ORG, { programId: 'p' });
    expect(calls[0].sql).toMatch(/\(status = 'active'\) DESC/);
    expect(out.inferred).toMatchObject({ strategy: 'hybrid', fromOverallRisk: 'high' });
    expect(inserts(calls)[0].args[2]).toBe(1);
  });

  it('refuses when the study has no assessment, and writes nothing', async () => {
    const { exec, calls } = mockExec([[], [], [{ v: 0 }], [{ id: 12 }]]);
    const out = await draftPlan(exec, ORG, { programId: 'p' });
    expect(out).toMatchObject({ plan: null, refused: 'no_assessment', message: RBM_PLAN_REFUSAL.no_assessment });
    expect(inserts(calls)).toHaveLength(0);
  });

  it('refuses an approved RACT that records no overall risk, and writes nothing', async () => {
    const { exec, calls } = mockExec([[{ id: 1, title: 'RACT', overall_risk: null, status: 'active', version: 1 }], [], [{ v: 0 }], [{ id: 12 }]]);
    const out = await draftPlan(exec, ORG, { programId: 'p' });
    expect(out).toMatchObject({ plan: null, refused: 'overall_risk_not_recorded' });
    expect(inserts(calls)).toHaveLength(0);
  });

  it('refuses to bind the plan to an assessment other than the one its strategy came from', async () => {
    const { exec, calls } = mockExec([[{ id: 1, title: 'RACT', overall_risk: 'high', status: 'active', version: 1 }], [], [{ v: 0 }], [{ id: 12 }]]);
    const out = await draftPlan(exec, ORG, { programId: 'p', assessmentId: 2 });
    expect(out).toMatchObject({ plan: null, refused: 'assessment_not_governing', message: expect.stringMatching(/version 1 \(id 1\)/) });
    expect(inserts(calls)).toHaveLength(0);
  });

  it('(guard) with a strategy given, reads no assessment and drafts the shell', async () => {
    const { exec, calls } = mockExec([[], [{ v: 0 }], [{ id: 5 }]]);
    const out = await draftPlan(exec, ORG, { programId: 'p', strategy: 'on_site' });
    expect(calls.some(c => c.sql.includes('rbm_risk_assessments'))).toBe(false);
    expect(out.plan).toMatchObject({ id: 5 });
    expect(inserts(calls)[0].args).toContain('on_site');
  });
});
