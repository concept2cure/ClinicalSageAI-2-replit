/**
 * Tests for the project-scoped stability reader and the "cannot evaluate"
 * contract that depends on it.
 *
 * The defect these lock down: Module 3 read stability studies from
 * `public.stability_studies` filtered on `project_id`, a column that table
 * does not have (it is org-scoped, and it also lacks `study_name`,
 * `storage_condition` and `results`). The query always threw, the throw was
 * swallowed into `[]`, and the ICH / QbD / control-strategy rules then read
 * that `[]` as "this project has no stability studies" and reported it as
 * fact. A compliance check that could not run must never render as one that
 * ran and found nothing.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  loadProjectStabilityStudies,
  normalizeStabilityPayload,
  STABILITY_SOURCE_TYPE,
} from '../stability-source';
import {
  checkQ1A, checkQ2, checkQ3AandQ3B, checkQ3D,
  checkQ6AandQ6B, checkQ8, checkQ9, checkQ10,
  blockedInputs, notEvaluatedFinding,
  type ProjectInputs,
} from '../ich-compliance-rules';

// ─── Test doubles ────────────────────────────────────────────────────────────

/** A pg-pool stand-in that returns rows, or throws the given error. */
function fakePool(impl: (sql: string, params: unknown[]) => unknown) {
  return {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      const out = impl(sql, params);
      if (out instanceof Error) throw out;
      return { rows: out as unknown[] };
    }),
  } as never;
}

function emptyInputs(): ProjectInputs {
  return {
    specs: [], methods: [], stability: [], drugSubs: [],
    processes: [], sourceObjects: [], sections: [],
  };
}

// ─── Reader ──────────────────────────────────────────────────────────────────

describe('loadProjectStabilityStudies', () => {
  it('reads from cmc_source_objects, scoped by org, project and source_type', async () => {
    const pool = fakePool(() => [
      {
        sourceKey: 'stability:1',
        sourcePayload: {
          studyName: 'LT-1', studyType: 'long-term',
          storageCondition: '25°C / 60% RH', status: 'in_progress',
        },
      },
    ]);

    const result = await loadProjectStabilityStudies(pool, 7, 'proj-uuid');

    expect(result.available).toBe(true);
    expect(result.studies).toHaveLength(1);
    expect(result.studies[0].studyName).toBe('LT-1');

    const [sql, params] = (pool as unknown as { query: { mock: { calls: unknown[][] } } })
      .query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/cmc_source_objects/);
    // Must NOT read the org-scoped legacy table — it has no project linkage.
    expect(sql).not.toMatch(/FROM stability_studies/);
    expect(params).toEqual([7, 'proj-uuid', STABILITY_SOURCE_TYPE]);
  });

  it('reports unavailable (never empty) when the read throws', async () => {
    const pool = fakePool(() => new Error('relation "cmc_source_objects" does not exist'));

    const result = await loadProjectStabilityStudies(pool, 7, 'proj-uuid');

    expect(result.available).toBe(false);
    expect(result.studies).toEqual([]);
    // The reason must survive — it is what makes the failure honest downstream.
    expect(result.reason).toMatch(/does not exist/);
  });

  it('distinguishes a genuine zero-row project from a failed read', async () => {
    const ok = await loadProjectStabilityStudies(fakePool(() => []), 7, 'proj-uuid');
    expect(ok.available).toBe(true);
    expect(ok.studies).toEqual([]);

    const bad = await loadProjectStabilityStudies(fakePool(() => new Error('boom')), 7, 'p');
    expect(bad.available).toBe(false);
    expect(bad.studies).toEqual([]);

    // Same empty studies array, different meaning. That distinction is the fix.
    expect(ok.available).not.toBe(bad.available);
  });

  it('refuses an unscoped read rather than returning cross-tenant data', async () => {
    const pool = fakePool(() => [{ sourceKey: 'k', sourcePayload: {} }]);

    const noOrg = await loadProjectStabilityStudies(pool, 0, 'proj');
    expect(noOrg.available).toBe(false);
    expect(noOrg.reason).toMatch(/positive integer/);

    const noProject = await loadProjectStabilityStudies(pool, 7, '');
    expect(noProject.available).toBe(false);
    expect(noProject.reason).toMatch(/projectId is required/);

    expect((pool as unknown as { query: { mock: { calls: unknown[] } } }).query.mock.calls)
      .toHaveLength(0);
  });

  it('keeps only the freshest row per source_key', async () => {
    const pool = fakePool(() => [
      { sourceKey: 'stability:1', sourcePayload: { studyName: 'newer' } },
      { sourceKey: 'stability:1', sourcePayload: { studyName: 'older' } },
      { sourceKey: 'stability:2', sourcePayload: { studyName: 'other' } },
    ]);

    const result = await loadProjectStabilityStudies(pool, 7, 'proj');

    expect(result.studies.map(s => s.studyName)).toEqual(['newer', 'other']);
  });
});

describe('normalizeStabilityPayload', () => {
  it('accepts the legacy scalar payload dialect', () => {
    const r = normalizeStabilityPayload({
      studyName: 'LT-1', studyType: 'long-term',
      storageCondition: '25°C / 60% RH', testParameters: 'Assay, Related Substances',
    });
    expect(r.studyName).toBe('LT-1');
    expect(r.storageCondition).toBe('25°C / 60% RH');
    expect(r.testParameters).toBe('Assay, Related Substances');
  });

  it('accepts the drizzle dialect, where these are study_title and text[] columns', () => {
    const r = normalizeStabilityPayload({
      studyTitle: 'Registration stability',
      storageConditions: ['25°C / 60% RH', '40°C / 75% RH'],
      testParameters: ['Assay', 'Dissolution'],
      stabilityData: { t0: {} },
    });
    expect(r.studyName).toBe('Registration stability');
    expect(r.storageCondition).toBe('25°C / 60% RH, 40°C / 75% RH');
    expect(r.testParameters).toBe('Assay, Dissolution');
    expect(r.results).toEqual({ t0: {} });
  });

  it('never yields undefined for the string fields the rules stringify', () => {
    const r = normalizeStabilityPayload({});
    expect(r.studyName).toBe('');
    expect(r.studyType).toBe('');
    expect(r.storageCondition).toBe('');
    expect(r.results).toBeNull();
  });
});

// ─── The honesty contract in the rules ───────────────────────────────────────

describe('ICH rules: unavailable input is reported, never asserted as absence', () => {
  it('Q1A reports not_evaluated instead of "no stability studies recorded"', () => {
    const inp = emptyInputs();
    inp.unavailable = { stability: 'stability source read failed: connection refused' };

    const f = checkQ1A(inp);

    expect(f).toHaveLength(1);
    expect(f[0].status).toBe('not_evaluated');
    expect(f[0].ruleId).toBe('Q1A_NOT_EVALUATED');
    expect(f[0].message).toMatch(/^Cannot evaluate Q1A\(R2\)/);
    expect(f[0].message).toMatch(/connection refused/);
    // The old fabricated evidence claimed a row count that was never obtained.
    expect(f[0].evidence.join(' ')).not.toMatch(/row count: 0/);
    // And it must not read as a clean result.
    expect(f.some(x => x.status === 'pass')).toBe(false);
  });

  it('Q1A still asserts absence when the read genuinely succeeded and returned nothing', () => {
    const f = checkQ1A(emptyInputs());
    expect(f).toHaveLength(1);
    expect(f[0].status).toBe('fail');
    expect(f[0].ruleId).toBe('Q1A_NO_STABILITY');
  });

  it.each([
    ['Q2 (methods)',         checkQ2,        'methods',       'Q2_NOT_EVALUATED'],
    ['Q3A (drugSubs)',       checkQ3AandQ3B, 'drugSubs',      'Q3A_NOT_EVALUATED'],
    ['Q6A (specs)',          checkQ6AandQ6B, 'specs',         'Q6A_NOT_EVALUATED'],
    ['Q3D (specs)',          checkQ3D,       'specs',         'Q3D_NOT_EVALUATED'],
    ['Q8 (processes)',       checkQ8,        'processes',     'Q8_NOT_EVALUATED'],
    ['Q9 (sourceObjects)',   checkQ9,        'sourceObjects', 'Q9_NOT_EVALUATED'],
    ['Q10 (sections)',       checkQ10,       'sections',      'Q10_NOT_EVALUATED'],
  ] as const)(
    '%s reports not_evaluated when its input is unavailable',
    (_label, rule, key, ruleId) => {
      const inp = emptyInputs();
      inp.unavailable = { [key]: 'relation does not exist' } as ProjectInputs['unavailable'];

      const f = rule(inp);

      expect(f.some(x => x.ruleId === ruleId && x.status === 'not_evaluated')).toBe(true);
      expect(f.every(x => x.status !== 'pass')).toBe(true);
    },
  );

  it('positive evidence still passes despite an unrelated input outage', () => {
    // Q8 finds CPPs on a process; a sourceObjects outage does not undermine
    // evidence we actually observed, so "pass" stays sound.
    const inp = emptyInputs();
    inp.processes = [{ processName: 'P-1', criticalProcessParameters: [{ name: 'temp' }] }];
    inp.unavailable = { sourceObjects: 'timeout' };

    const f = checkQ8(inp);

    expect(f[0].status).toBe('pass');
  });

});

/* Split from the block above so neither callback exceeds the 100-line
   max-lines-per-function limit the ESLint ratchet holds (the three Q2 cases
   were appended to it and took it to 109). Same assertions, grouped by the
   rule they exercise. */
describe('ICH Q2: a method\'s recorded validation status', () => {
  /**
   * ICH Q2 and a method with NO recorded validation status.
   *
   * Until the analytical-method read moved onto the canonical source-object
   * store this case was unreachable — the read raised 42703 and Q2 never ran
   * on any deployed database. Reachable now, and it is the one that must not
   * fabricate: an absent validation status is not a failed validation. Saying
   * so would put an ICH Q2(R1) finding on a project for a fact nobody entered.
   */
  it('reports a method with NO recorded validation status as not evaluated, not as unvalidated', () => {
    const inp = emptyInputs();
    inp.methods = [{ methodName: 'HPLC assay', purpose: 'identity' }];

    const f = checkQ2(inp);

    expect(f.some(x => x.ruleId === 'Q2_UNVALIDATED_METHODS')).toBe(false);
    const notRecorded = f.find(x => x.ruleId === 'Q2_VALIDATION_STATUS_NOT_RECORDED');
    expect(notRecorded?.status).toBe('not_evaluated');
    expect(notRecorded?.evidence?.[0]).toMatch(/no validation status recorded/);
  });

  it('still fails a method whose RECORDED status is not a validated one', () => {
    // The distinction has to cut both ways, or it is an amnesty.
    const inp = emptyInputs();
    inp.methods = [{ methodName: 'HPLC assay', purpose: 'identity', validationStatus: 'draft' }];

    const f = checkQ2(inp);

    const unvalidated = f.find(x => x.ruleId === 'Q2_UNVALIDATED_METHODS');
    expect(unvalidated?.status).toBe('fail');
    expect(f.some(x => x.ruleId === 'Q2_VALIDATION_STATUS_NOT_RECORDED')).toBe(false);
  });

  it('separates the two when a project holds one of each', () => {
    const inp = emptyInputs();
    inp.methods = [
      { methodName: 'Validated HPLC', purpose: 'identity', validationStatus: 'validated' },
      { methodName: 'Draft HPLC', purpose: 'identity', validationStatus: 'draft' },
      { methodName: 'Unrecorded HPLC', purpose: 'identity' },
    ];

    const f = checkQ2(inp);

    expect(f.find(x => x.ruleId === 'Q2_UNVALIDATED_METHODS')?.message).toMatch(/^1 method/);
    expect(f.find(x => x.ruleId === 'Q2_VALIDATION_STATUS_NOT_RECORDED')?.message).toMatch(/^1 method/);
  });

  /**
   * ICH Q3A and the impurity register.
   *
   * `impurities` on the drug-substance record is ONE place a project carries
   * impurity data; `source_type = 'impurity_profile'` is the other, and it is
   * the one the impurity-profile surface writes. Concluding absence from the
   * first alone puts a FAILED Q3A(R2) finding on a dossier that carries a
   * complete impurity register — measured on the reference database, where a
   * project held four impurity_profile source objects while the drug
   * substance's own field was null.
   *
   * Unreachable until the drug-substance read was moved onto the canonical
   * store, because Q3A never ran at all.
   */
  it('does NOT fail Q3A when the impurity register carries the data', () => {
    const inp = emptyInputs();
    inp.drugSubs = [{ substanceName: 'BX-701', impurities: null }];
    inp.sourceObjects = [
      { sourceType: 'impurity_profile', sourceKey: 'impurity:1', sourcePayload: {} },
      { sourceType: 'impurity_profile', sourceKey: 'impurity:2', sourcePayload: {} },
    ];

    const f = checkQ3AandQ3B(inp);

    expect(f.some(x => x.ruleId === 'Q3A_NO_IMPURITY_PROFILE')).toBe(false);
  });

  it('still fails Q3A when NEITHER store carries impurity data', () => {
    // The corroboration must not become an amnesty: a dossier with a drug
    // substance and no impurity data anywhere is genuinely deficient.
    const inp = emptyInputs();
    inp.drugSubs = [{ substanceName: 'BX-701', impurities: null }];
    inp.sourceObjects = [{ sourceType: 'specification', sourceKey: 'spec:1', sourcePayload: {} }];

    const f = checkQ3AandQ3B(inp);

    const noProfile = f.find(x => x.ruleId === 'Q3A_NO_IMPURITY_PROFILE');
    expect(noProfile?.status).toBe('fail');
    expect(noProfile?.message).toMatch(/impurity register/);
  });

  it('reports not-evaluated rather than failing when the source-object read is blocked', () => {
    // Absence across two stores cannot be concluded when one of them could not
    // be read — the same standard Q3D already holds itself to.
    const inp = emptyInputs();
    inp.drugSubs = [{ substanceName: 'BX-701', impurities: null }];
    inp.unavailable = { sourceObjects: 'timeout' };

    const f = checkQ3AandQ3B(inp);

    expect(f.some(x => x.ruleId === 'Q3A_NO_IMPURITY_PROFILE')).toBe(false);
    expect(f.some(x => x.ruleId === 'Q3A_NOT_EVALUATED' && x.status === 'not_evaluated')).toBe(true);
  });

  it('leaves every rule untouched when no input is unavailable', () => {
    // Guards must be inert on the normal path.
    const inp = emptyInputs();
    expect(checkQ2(inp)[0].ruleId).toBe('Q2_NO_METHODS');
    expect(checkQ6AandQ6B(inp)[0].ruleId).toBe('Q6A_NO_SPECS');
    expect(checkQ3D(inp)[0].ruleId).toBe('Q3D_NO_ASSESSMENT');
    expect(checkQ8(inp)[0].ruleId).toBe('Q8_NO_QBD_EVIDENCE');
    expect(checkQ9(inp)[0].ruleId).toBe('Q9_NO_RISK_ASSESSMENT');
    expect(checkQ10(inp)[0].ruleId).toBe('Q10_LIFECYCLE_THIN');
  });
});

describe('not-evaluated helpers', () => {
  it('blockedInputs collects only the keys that are actually unavailable', () => {
    const inp = emptyInputs();
    inp.unavailable = { stability: 'r1', specs: 'r2' };

    expect(blockedInputs(inp, ['stability'])).toEqual([{ key: 'stability', reason: 'r1' }]);
    expect(blockedInputs(inp, ['methods'])).toEqual([]);
    expect(blockedInputs(inp, ['stability', 'specs'])).toHaveLength(2);
  });

  it('the finding states it is neither a pass nor a finding of non-compliance', () => {
    const f = notEvaluatedFinding(
      'Q1A(R2)', 'Q1A_NOT_EVALUATED',
      [{ key: 'stability', reason: 'boom' }],
      'ICH Q1A(R2) §1.',
    );
    expect(f.status).toBe('not_evaluated');
    expect(f.message).toMatch(/not a pass/);
    expect(f.message).toMatch(/did not run/);
    expect(f.evidence[0]).toMatch(/unavailable: boom/);
  });
});
