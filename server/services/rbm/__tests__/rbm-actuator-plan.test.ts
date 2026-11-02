/**
 * RBM actuator — the plan's derivation from the governing RACT.
 *
 * Split out of rbm-actuator.test.ts (2026-11-02, which had reached the
 * 500-line limit). generatePlanFromAssessment writes the plan;
 * derivePlanFromAssessment is its read half, which AnA's generate_rbm_plan
 * proposes from. Same scripted mock Exec as the parent file.
 */

import { describe, it, expect } from 'vitest';
import { generatePlanFromAssessment, derivePlanFromAssessment, RBM_PLAN_REFUSAL, type Exec } from '../rbm-actuator';

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
    const out = await generatePlanFromAssessment(exec, ORG, { programId: 'p' });
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
    await generatePlanFromAssessment(exec, ORG, { programId: 'p' });
    const factorQuery = calls[1];
    expect(factorQuery.sql).toContain('assessment_id = $3');
    expect(factorQuery.args).toEqual([ORG, 'p', 7]);
  });

  it('generates nothing when the study has no risk assessment to derive from', async () => {
    const { exec, calls } = mockExec([[]]);
    const out = await generatePlanFromAssessment(exec, ORG, { programId: 'p' });
    expect(out.generated).toBe(false);
    expect(out.reason).toBe('no_assessment');
    // No plan and no actions were written.
    expect(calls).toHaveLength(1);
  });

  it('refuses to derive a plan from an unapproved RACT', async () => {
    // The plan-approval endpoint would otherwise activate a monitoring
    // commitment whose risk basis nobody ever signed for. Fail closed.
    const { exec, calls } = mockExec([[{ id: 7, title: 'RACT', overall_risk: 'high', status: 'draft' }]]);
    const out = await generatePlanFromAssessment(exec, ORG, { programId: 'p' });
    expect(out.generated).toBe(false);
    expect(out.reason).toBe('assessment_not_approved');
    expect(calls).toHaveLength(1);
  });

  it('refuses an approved RACT that records no overall risk, and writes nothing', async () => {
    // It used to be given 'medium', so the saved plan's strategy rested on a
    // risk basis nobody recorded or signed for.
    const { exec, calls } = mockExec([
      [{ id: 7, title: 'RACT', overall_risk: null, status: 'active', version: 1 }],
      [{ id: 21, ctq_factor: 'SAE reporting', risk_score: 20 }],
      [],
      [], [{ v: 0 }], [{ id: 3 }], [{ id: 41 }],   // what a write would have read back
    ]);
    const out = await generatePlanFromAssessment(exec, ORG, { programId: 'p' });
    expect(out.generated).toBe(false);
    expect(out.reason).toBe('overall_risk_unrecorded');
    expect(calls.some(c => /^\s*(INSERT|UPDATE|DELETE)/.test(c.sql))).toBe(false);
  });

  it('has its own sentence for every reason it refuses with', () => {
    const reasons: Array<NonNullable<Awaited<ReturnType<typeof generatePlanFromAssessment>>['reason']>> =
      ['no_assessment', 'assessment_not_approved', 'overall_risk_unrecorded', 'draft_already_open'];
    const sentences = reasons.map(r => RBM_PLAN_REFUSAL[r]);
    for (const s of sentences) expect(s).toMatch(/\S/);
    expect(new Set(sentences).size).toBe(reasons.length);
    expect(RBM_PLAN_REFUSAL.overall_risk_unrecorded).toMatch(/records no overall risk/);
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
    const generated = await generatePlanFromAssessment(write.exec, ORG, { programId: 'p' });
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
