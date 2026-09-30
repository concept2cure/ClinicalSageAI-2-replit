/**
 * RBM actuator — write + engine-inference unit tests.
 *
 * Uses a scripted mock Exec (records SQL + args, returns canned rows per call)
 * so the inference (risk score/band, KRI/QTL status, secondary limit, plan
 * strategy) and the tenant-scoping invariant (organization_id on every write)
 * are verified without a database.
 */

import { describe, it, expect } from 'vitest';
import {
  addCtqFactor, defineKri, recordKriReading, setQtl, raiseSignal, triageSignal,
  draftPlan, generatePlanFromAssessment, amendAssessment, createAction, updateAction, approveAssessment, approvePlan,
  amendMonitoringPlan, nextPlanVersion, inferSecondaryLimit, type Exec,
} from '../rbm-actuator';

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

describe('rbm-actuator — inference', () => {
  it('addCtqFactor infers risk score and criticality from the band', async () => {
    const { exec, calls } = mockExec([[{ id: 1 }]]);
    const out = await addCtqFactor(exec, ORG, { programId: 'p', ctqFactor: 'Dosing errors', likelihood: 5, impact: 4 });
    expect(out.inferred.riskScore).toBe(20);
    expect(out.inferred.band).toBe('high');
    expect(out.inferred.isCritical).toBe(true);
    // tenant scope: organization_id is the first bound arg on the insert.
    expect(calls[0].args[0]).toBe(ORG);
    // score (20) and is_critical (true) are persisted.
    expect(calls[0].args).toContain(20);
    expect(calls[0].args).toContain(true);
  });

  it('addCtqFactor leaves a low-risk item non-critical', async () => {
    const { exec } = mockExec([[{ id: 2 }]]);
    const out = await addCtqFactor(exec, ORG, { programId: 'p', ctqFactor: 'Minor typo', likelihood: 1, impact: 2 });
    expect(out.inferred.riskScore).toBe(2);
    expect(out.inferred.band).toBe('low');
    expect(out.inferred.isCritical).toBe(false);
  });

  it('addCtqFactor honors an explicit isCritical override', async () => {
    const { exec } = mockExec([[{ id: 3 }]]);
    const out = await addCtqFactor(exec, ORG, { programId: 'p', ctqFactor: 'x', likelihood: 1, impact: 1, isCritical: true });
    expect(out.inferred.isCritical).toBe(true);
  });

  it('defineKri infers amber status from value vs thresholds (higher worse)', async () => {
    const { exec } = mockExec([[{ id: 5 }]]);
    const out = await defineKri(exec, ORG, {
      programId: 'p', name: 'Screen-failure rate', direction: 'higher_worse',
      thresholdAmber: 20, thresholdRed: 50, currentValue: 40,
    });
    expect(out.inferred.status).toBe('amber');
  });

  it('setQtl infers the 75% secondary limit and approaching status', async () => {
    const { exec } = mockExec([[{ id: 7 }]]);
    const out = await setQtl(exec, ORG, { programId: 'p', parameter: 'IPD rate', threshold: 10, currentValue: 8 });
    expect(out.inferred.secondaryLimit).toBe(7.5);
    expect(out.inferred.status).toBe('approaching');
  });

  it('setQtl evaluates a lower-bound limit in its own direction and infers no upper-side secondary', async () => {
    const { exec, calls } = mockExec([[{ id: 8 }]]);
    const out = await setQtl(exec, ORG, { programId: 'p', parameter: 'Endpoint completeness', threshold: 0.9, currentValue: 0.4, direction: 'lower' });
    expect(out.inferred.status).toBe('breached');
    expect(out.inferred.secondaryLimit).toBeNull();
    expect(calls[0].args).toContain('lower');
  });

  it('setQtl refuses a two-sided limit without both bounds', async () => {
    const { exec, calls } = mockExec([[{ id: 9 }]]);
    await expect(setQtl(exec, ORG, { parameter: 'Ratio', threshold: 1.1, direction: 'two_sided' })).rejects.toThrow(/both bounds/);
    expect(calls).toHaveLength(0);
  });

  it('inferSecondaryLimit is null without a threshold', () => {
    expect(inferSecondaryLimit(null)).toBeNull();
    expect(inferSecondaryLimit(100)).toBe(75);
  });

  it('recordKriReading resolves by id, computes status, and writes value + KRI update', async () => {
    const { exec, calls } = mockExec([
      [{ id: 9, direction: 'higher_worse', threshold_amber: 20, threshold_red: 50 }], // SELECT kri
      [{ id: 900, value: 55, status: 'red' }], // INSERT value
      [], // UPDATE kri
    ]);
    const out = await recordKriReading(exec, ORG, { kriId: 9, value: 55 });
    expect(out.resolved).toBe(true);
    if (out.resolved) {
      expect(out.inferred.status).toBe('red');
      expect(out.kriId).toBe(9);
    }
    expect(calls).toHaveLength(3);
    expect(calls[0].args).toContain(ORG); // SELECT scoped to tenant
  });

  it('recordKriReading returns unresolved when the KRI is not found', async () => {
    const { exec } = mockExec([[]]);
    const out = await recordKriReading(exec, ORG, { kriId: 999, value: 1 });
    expect(out.resolved).toBe(false);
  });

  it('draftPlan infers strategy from the assessment overall risk', async () => {
    const { exec } = mockExec([
      [{ overall_risk: 'high' }], // SELECT assessment
      [],                         // no open draft
      [{ v: 1 }],                 // max version on file
      [{ id: 11, strategy: 'hybrid' }], // INSERT plan
    ]);
    const out = await draftPlan(exec, ORG, { programId: 'p' });
    // defaultPlanStrategy('high') → 'hybrid'
    expect(out.inferred.strategy).toBe('hybrid');
    expect(out.inferred.fromOverallRisk).toBe('high');
    expect(out.plan).toMatchObject({ id: 11 });
  });

  it('draftPlan falls back to risk_based when no assessment exists, and takes the next version', async () => {
    const { exec, calls } = mockExec([[], [], [{ v: 0 }], [{ id: 12 }]]);
    const out = await draftPlan(exec, ORG, { programId: 'p' });
    expect(out.inferred.strategy).toBe('risk_based');
    expect(out.plan).toMatchObject({ id: 12 });
    expect(calls[3].args).toContain(1);
  });

  it('draftPlan reports an open draft rather than opening a second one', async () => {
    const { exec, calls } = mockExec([[], [{ id: 4, version: 2 }]]);
    const out = await draftPlan(exec, ORG, { programId: 'p' });
    expect(out.plan).toBeNull();
    expect(out).toMatchObject({ refused: 'draft_already_open' });
    expect(calls.some(c => c.sql.includes('INSERT'))).toBe(false);
  });

  it('raiseSignal defaults source=manual, severity=medium and scopes to tenant', async () => {
    const { exec, calls } = mockExec([[{ id: 13 }]]);
    await raiseSignal(exec, ORG, { programId: 'p', title: 'Odd lab pattern' });
    expect(calls[0].args[0]).toBe(ORG);
    expect(calls[0].args).toContain('manual');
    expect(calls[0].args).toContain('medium');
  });

  it('triageSignal reports no_fields when nothing changes', async () => {
    const { exec } = mockExec([]);
    const out = await triageSignal(exec, ORG, { signalId: 1 });
    expect(out.updated).toBe(false);
  });

  it('createAction refuses when the plan is not in-tenant', async () => {
    const { exec } = mockExec([[]]); // ownership SELECT returns nothing
    const out = await createAction(exec, ORG, { planId: 1, description: 'do it' });
    expect(out.created).toBe(false);
  });

  it('updateAction with no fields is a no-op', async () => {
    const { exec } = mockExec([]);
    const out = await updateAction(exec, ORG, { actionId: 1 });
    expect(out.updated).toBe(false);
  });

  it('approveAssessment writes reason + approver and scopes to tenant', async () => {
    const { exec, calls } = mockExec([[{ id: 1, status: 'active' }]]);
    const row = await approveAssessment(exec, ORG, 7, 1, 'Risk review complete');
    expect(row).toEqual({ id: 1, status: 'active' });
    // The approval now also stamps whether the two-person rule could be applied
    // (see the attestation cases below); default is enforced.
    expect(calls[0].args).toEqual([7, 'Risk review complete', 1, ORG, 'enforced']);
  });

  it('approveAssessment returns null when not found in tenant', async () => {
    const { exec } = mockExec([[]]);
    const row = await approveAssessment(exec, ORG, 7, 999, 'reason');
    expect(row).toBeNull();
  });

  /* Both writers of rbm_risk_assessments reach this function, and it used to
     take `userId: number | null` and write `approved_by = NULL` — an activated
     governing risk basis with nobody named as its approver, which 21 CFR
     11.10(e) and 11.50 exist to make impossible.

     The HTTP route never sent null (it 401s on an unauthenticated signer). The
     AnA tool path did: it had no signature check at all and passed
     `ctx?.userId ?? null` straight through, so the one route with no password
     and no MFA was also the one that could leave the approver blank.

     The type is `number` now, so a caller that cannot name the approver does
     not compile. These two cases cover the callers TypeScript does not see. */
  /* The supersede lived only in the HTTP route, which kept its own copy of the
     approval UPDATE. The AnA tool path came through the actuator instead and
     archived nothing, so approving a v2 through AnA left v1 active beside it —
     two rows claiming to be the same program's governing risk basis. Readers
     resolve that with ORDER BY (status='active') DESC, updated_at DESC LIMIT 1,
     which does not error on two; it silently picks one. */
  it('archives the version it supersedes, so a program has one governing basis', async () => {
    const { exec, calls } = mockExec([[{ id: 2, status: 'active', program_id: 'prog-uuid' }], []]);
    const row = await approveAssessment(exec, ORG, 7, 2, 'v2 approved');
    expect(row).toMatchObject({ id: 2 });
    expect(calls).toHaveLength(2);
    // Scoped to the tenant and the program, and never archives the row it just
    // activated.
    expect(calls[1].sql).toMatch(/status = 'archived'/);
    expect(calls[1].args).toEqual([ORG, 'prog-uuid', 2]);
  });

  it('does not archive anything when the assessment has no program', async () => {
    const { exec, calls } = mockExec([[{ id: 3, status: 'active', program_id: null }]]);
    await approveAssessment(exec, ORG, 7, 3, 'standalone');
    expect(calls).toHaveLength(1);
  });

  /* The signed record has to say whether the two-person rule was actually
     applied. A row written before created_by existed has no author to compare
     against, and those approvals are allowed rather than stranded — so without
     this an inspector could not tell an approval that WAS checked against its
     author from one where no author was ever recorded. */
  it('records that the two-person rule was enforced', async () => {
    const { exec, calls } = mockExec([[{ id: 4, status: 'active', program_id: null }]]);
    await approveAssessment(exec, ORG, 7, 4, 'reviewed', { authorKnown: true });
    expect(calls[0].args[4]).toBe('enforced');
  });

  it('records when there was no author to check against', async () => {
    const { exec, calls } = mockExec([[{ id: 5, status: 'active', program_id: null }]]);
    await approveAssessment(exec, ORG, 7, 5, 'legacy row', { authorKnown: false });
    expect(calls[0].args[4]).toBe('not_applicable_no_author_recorded');
    // It must not claim the rule was enforced when it could not be.
    expect(calls[0].args[4]).not.toBe('enforced');
  });

  it('refuses to approve an assessment it cannot attribute', async () => {
    const { exec, calls } = mockExec([[{ id: 1, status: 'active' }]]);
    await expect(
      approveAssessment(exec, ORG, null as unknown as number, 1, 'reason'),
    ).rejects.toThrow(/identified approver/i);
    // Nothing was written: the refusal is before the UPDATE, not after it.
    expect(calls).toHaveLength(0);
  });

  it('refuses to approve a monitoring plan it cannot attribute', async () => {
    const { exec, calls } = mockExec([[{ id: 2, status: 'active' }]]);
    await expect(
      approvePlan(exec, ORG, null as unknown as number, 2, 'reason'),
    ).rejects.toThrow(/identified approver/i);
    expect(calls).toHaveLength(0);
  });
});

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
});

describe('amendAssessment — versioned revision of a signed RACT', () => {
  const approved = { id: 7, program_id: 'p', title: 'RACT', framework: 'ich_e6r3', overall_risk: 'high', status: 'active', version: 2 };

  it('opens the next version as a draft, copying the register forward', async () => {
    const { exec, calls } = mockExec([
      [approved],            // load the assessment
      [],                    // no open draft
      [{ v: 2 }],            // max version
      [{ id: 9, version: 3, status: 'draft' }],  // insert draft
      [{ id: 101 }, { id: 102 }],                 // copied items
    ]);
    const out = await amendAssessment(exec, ORG, { assessmentId: 7, reason: 'New safety signal', openedBy: 4 });
    expect(out.amended).toBe(true);
    expect(out.supersedes).toBe(2);
    expect(out.items).toHaveLength(2);

    const insert = calls[3];
    // Draft, next version, and NO approval fields — copying the previous
    // signer forward would be forging a signature.
    expect(insert.sql).toContain("'draft'");
    expect(insert.args).toContain(3);
    expect(insert.sql).not.toContain('approved_by');
    expect(String(insert.args[insert.args.length - 1])).toContain('New safety signal');

    // The register is copied to the NEW assessment id, read from the old one.
    const copy = calls[4];
    expect(copy.args).toEqual([9, ORG, 7]);
    expect(copy.sql).toContain('INSERT INTO rbm_risk_items');
    for (const c of calls) expect(c.args).toContain(ORG);
  });

  it('refuses to amend a draft — a draft is already editable', async () => {
    const { exec, calls } = mockExec([[{ ...approved, status: 'draft' }]]);
    const out = await amendAssessment(exec, ORG, { assessmentId: 7, reason: 'x' });
    expect(out.amended).toBe(false);
    expect(out.reason).toBe('not_approved');
    expect(calls).toHaveLength(1);
  });

  it('refuses a second concurrent amendment', async () => {
    // Two drafts off one approved version have no defined merge, and silently
    // picking one would discard the other's work.
    const { exec } = mockExec([[approved], [{ id: 8 }]]);
    const out = await amendAssessment(exec, ORG, { assessmentId: 7, reason: 'x' });
    expect(out.amended).toBe(false);
    expect(out.reason).toBe('amendment_already_open');
  });

  it('reports not_found for an assessment outside the tenant', async () => {
    const { exec } = mockExec([[]]);
    const out = await amendAssessment(exec, ORG, { assessmentId: 999, reason: 'x' });
    expect(out.amended).toBe(false);
    expect(out.reason).toBe('not_found');
  });
});

describe('monitoring plan versioning — a signed plan stops being editable', () => {
  const active = { id: 11, program_id: 'p', assessment_id: 7, title: 'Plan', strategy: 'hybrid', status: 'active', version: 2 };

  it('nextPlanVersion counts past every version on file, including deleted ones', async () => {
    const { exec, calls } = mockExec([[{ v: 3 }]]);
    expect(await nextPlanVersion(exec, ORG, 'p')).toBe(4);
    // A version number is never reused: a soft-deleted v3 still owns "3".
    expect(calls[0].sql).not.toContain('deleted_at');
    expect(calls[0].args).toEqual([ORG, 'p']);
  });

  it('generatePlanFromAssessment refuses while a draft version is already open', async () => {
    const { exec, calls } = mockExec([
      [{ id: 7, title: 'RACT', overall_risk: 'high', status: 'active' }],
      [], [],
      [{ id: 12, version: 3 }],                   // an open draft
    ]);
    const out = await generatePlanFromAssessment(exec, ORG, { programId: 'p' });
    expect(out.generated).toBe(false);
    expect(out.reason).toBe('draft_already_open');
    expect(calls.some(c => c.sql.includes('INSERT INTO rbm_monitoring_plans'))).toBe(false);
  });

  it('amend opens the next version as an unsigned draft and carries unfinished actions forward at open', async () => {
    const { exec, calls } = mockExec([
      [active],                 // load
      [],                       // no open draft
      [{ v: 2 }],               // max version
      [{ id: 12, version: 3, status: 'draft' }], // insert
      [{ id: 90 }, { id: 91 }], // copied actions
    ]);
    const out = await amendMonitoringPlan(exec, ORG, { planId: 11, reason: 'Add a central-monitoring review', openedBy: 5 });
    expect(out.amended).toBe(true);
    expect(out.supersedes).toBe(2);
    const insert = calls[3];
    expect(insert.sql).toContain("'draft'");
    expect(insert.sql).not.toContain('approved_by');
    expect(insert.args).toContain(3);
    expect(insert.args).toContain(5);           // created_by — the amendment's author
    const copy = calls[4];
    expect(copy.sql).toContain("status <> 'done'");
    expect(copy.sql).toContain("'open'");
    expect(copy.args).toEqual([12, ORG, 11]);
    for (const c of calls) expect(c.args).toContain(ORG);
  });

  it('amend refuses a draft plan, and a second concurrent amendment', async () => {
    const draft = mockExec([[{ ...active, status: 'draft' }]]);
    expect(await amendMonitoringPlan(draft.exec, ORG, { planId: 11, reason: 'x y z' }))
      .toMatchObject({ amended: false, reason: 'not_approved' });

    const open = mockExec([[active], [{ id: 12, version: 3 }]]);
    expect(await amendMonitoringPlan(open.exec, ORG, { planId: 11, reason: 'x y z' }))
      .toMatchObject({ amended: false, reason: 'amendment_already_open' });

    const missing = mockExec([[]]);
    expect(await amendMonitoringPlan(missing.exec, ORG, { planId: 99, reason: 'x y z' }))
      .toMatchObject({ amended: false, reason: 'not_found' });
  });

  it('approvePlan archives the version it supersedes in the same executor', async () => {
    const { exec, calls } = mockExec([[{ id: 12, status: 'active', program_id: 'p', version: 3 }], [{ version: 2 }]]);
    const row = await approvePlan(exec, ORG, 7, 12, 'v3 approved');
    expect(row).toMatchObject({ id: 12 });
    expect(calls).toHaveLength(2);
    expect(calls[1].sql).toMatch(/status = 'archived'/);
    expect(calls[1].sql).toContain("status = 'active'");
    expect(calls[1].args).toEqual([ORG, 'p', 12]);
  });

  it('createAction refuses a plan that is not a draft — its actions are signed', async () => {
    const { exec, calls } = mockExec([[{ status: 'active' }]]);
    const out = await createAction(exec, ORG, { planId: 11, description: 'late addition' });
    expect(out).toMatchObject({ created: false, reason: 'plan_not_draft' });
    expect(calls).toHaveLength(1);
  });
});
