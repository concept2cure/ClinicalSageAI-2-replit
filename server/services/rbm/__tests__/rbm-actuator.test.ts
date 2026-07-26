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
  draftPlan, generatePlanFromAssessment, amendAssessment, createAction, updateAction, approveAssessment,
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
      [{ id: 11, strategy: 'hybrid' }], // INSERT plan
    ]);
    const out = await draftPlan(exec, ORG, { programId: 'p' });
    // defaultPlanStrategy('high') → 'hybrid'
    expect(out.inferred.strategy).toBe('hybrid');
    expect(out.inferred.fromOverallRisk).toBe('high');
  });

  it('draftPlan falls back to risk_based when no assessment exists', async () => {
    const { exec } = mockExec([[], [{ id: 12 }]]);
    const out = await draftPlan(exec, ORG, { programId: 'p' });
    expect(out.inferred.strategy).toBe('risk_based');
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
    expect(calls[0].args).toEqual([7, 'Risk review complete', 1, ORG]);
  });

  it('approveAssessment returns null when not found in tenant', async () => {
    const { exec } = mockExec([[]]);
    const row = await approveAssessment(exec, ORG, 7, 999, 'reason');
    expect(row).toBeNull();
  });
});

describe('generatePlanFromAssessment — derives the plan from the RACT', () => {
  it('derives strategy from the overall risk and seeds actions from the critical CtQs and enhanced sites', async () => {
    const { exec, calls } = mockExec([
      [{ id: 7, title: 'RACT', overall_risk: 'high', status: 'active' }],   // governing assessment
      [{ id: 21, ctq_factor: 'SAE reporting', risk_score: 20 },         // open critical factors
       { id: 22, ctq_factor: 'Consent', risk_score: 9 }],
      [{ site_number: '5', site_name: 'Mercy' }],                       // enhanced-tier sites
      [],                                                               // no open draft version
      [{ v: 0 }],                                                       // max version — first plan
      [{ id: 3, strategy: 'hybrid' }],                                  // plan insert
      [{ id: 41 }], [{ id: 42 }], [{ id: 43 }],                         // action inserts
    ]);
    const out = await generatePlanFromAssessment(exec, ORG, { programId: 'p' });
    expect(out.generated).toBe(true);
    expect(out.derivedFrom).toMatchObject({ assessmentId: 7, overallRisk: 'high', criticalFactors: 2, enhancedSites: 1 });
    // High overall risk → hybrid strategy, per defaultPlanStrategy.
    expect(calls[5].args).toContain('hybrid');
    // The plan is a DRAFT until it is signed for, and lands as v1.
    expect(calls[5].sql).toContain("'draft'");
    expect(calls[5].args).toContain(1);
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
      [],           // critical factors
      [],           // enhanced sites
      [],           // no open draft version
      [{ v: 0 }],   // max version
      [{ id: 3 }],  // plan insert
    ]);
    const out = await generatePlanFromAssessment(exec, ORG, { programId: 'p' });
    expect(out.generated).toBe(true);
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

describe('amendMonitoringPlan — versioned revision of an approved plan', () => {
  const active = {
    id: 3, program_id: 'p', assessment_id: 7, title: 'Monitoring plan',
    strategy: 'hybrid', status: 'active', version: 2,
  };

  it('opens the next version as a draft, carrying unfinished actions forward', async () => {
    const { exec, calls } = mockExec([
      [active],                                   // load the plan
      [],                                         // no open draft
      [{ v: 2 }],                                 // max version
      [{ id: 11, version: 3, status: 'draft' }],  // insert draft
      [{ id: 201 }, { id: 202 }],                 // copied actions
    ]);
    const out = await amendMonitoringPlan(exec, ORG, { planId: 3, reason: 'Two sites moved to enhanced', openedBy: 4 });
    expect(out.amended).toBe(true);
    expect(out.supersedes).toBe(2);
    expect(out.actions).toHaveLength(2);

    const insert = calls[3];
    // Draft, next version, and NO approval fields — copying the previous
    // signer forward would be forging a signature.
    expect(insert.sql).toContain("'draft'");
    expect(insert.args).toContain(3);
    expect(insert.sql).not.toContain('approved_by');
    expect(String(insert.args[insert.args.length - 1])).toContain('Two sites moved to enhanced');

    // Actions are copied to the NEW plan id, read from the old one.
    const copy = calls[4];
    expect(copy.args).toEqual([11, ORG, 3]);
    expect(copy.sql).toContain('INSERT INTO rbm_monitoring_actions');
    // Completed work stays with the version it was completed under, and every
    // copy reopens: crediting progress to a plan version that did not exist when
    // the work was done would misstate the record.
    expect(copy.sql).toContain("status <> 'done'");
    expect(copy.sql).toContain("'open'");
    for (const c of calls) expect(c.args).toContain(ORG);
  });

  it('refuses to amend a draft plan — a draft is already editable', async () => {
    const { exec, calls } = mockExec([[{ ...active, status: 'draft' }]]);
    const out = await amendMonitoringPlan(exec, ORG, { planId: 3, reason: 'x' });
    expect(out.amended).toBe(false);
    expect(out.reason).toBe('not_approved');
    expect(calls).toHaveLength(1);
  });

  it('refuses a second concurrent plan amendment', async () => {
    const { exec } = mockExec([[active], [{ id: 12, version: 3 }]]);
    const out = await amendMonitoringPlan(exec, ORG, { planId: 3, reason: 'x' });
    expect(out.amended).toBe(false);
    expect(out.reason).toBe('amendment_already_open');
  });

  it('reports not_found for a plan outside the tenant', async () => {
    const { exec } = mockExec([[]]);
    const out = await amendMonitoringPlan(exec, ORG, { planId: 999, reason: 'x' });
    expect(out.amended).toBe(false);
    expect(out.reason).toBe('not_found');
  });
});

describe('nextPlanVersion', () => {
  it('numbers past every version on file, including archived ones', async () => {
    // Reusing a version number would make two different signed documents
    // indistinguishable in the audit trail.
    const { exec, calls } = mockExec([[{ v: 4 }]]);
    expect(await nextPlanVersion(exec, ORG, 'p')).toBe(5);
    expect(calls[0].sql).not.toContain('status');
    expect(calls[0].args).toEqual([ORG, 'p']);
  });

  it('starts a study with no plans at version 1', async () => {
    const { exec } = mockExec([[{ v: 0 }]]);
    expect(await nextPlanVersion(exec, ORG, 'p')).toBe(1);
  });
});

describe('generatePlanFromAssessment — versioning', () => {
  it('refuses to generate alongside an open draft version', async () => {
    // Two drafts off one study have no defined merge, and generating a third
    // plan silently would discard whichever the operator was not looking at.
    const { exec } = mockExec([
      [{ id: 7, title: 'RACT', overall_risk: 'high', status: 'active' }], // assessment
      [],                        // critical items
      [],                        // enhanced sites
      [{ id: 12, version: 3 }],  // an open draft plan already exists
    ]);
    const out = await generatePlanFromAssessment(exec, ORG, { programId: 'p' });
    expect(out.generated).toBe(false);
    expect(out.reason).toBe('draft_already_open');
  });

  it('lands the generated plan as the next version, not always v1', async () => {
    const { exec, calls } = mockExec([
      [{ id: 7, title: 'RACT', overall_risk: 'medium', status: 'active' }],
      [],                                         // no critical items
      [],                                         // no enhanced sites
      [],                                         // no open draft
      [{ v: 2 }],                                 // max version
      [{ id: 13, version: 3, status: 'draft' }],  // insert
    ]);
    const out = await generatePlanFromAssessment(exec, ORG, { programId: 'p' });
    expect(out.generated).toBe(true);
    const insert = calls[5];
    expect(insert.sql).toContain('INSERT INTO rbm_monitoring_plans');
    expect(insert.args).toContain(3);
  });
});
