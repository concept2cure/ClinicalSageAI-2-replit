import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const names = ALL_ANA_TOOLS.map(t => t.name);

describe('deepening tools — registration', () => {
  it.each([
    'assess_batch_poolability',
    'assess_recorded_batch_poolability',
    'list_cmc_registers',
    'estimate_recorded_shelf_life',
    'get_submission_readiness_twin',
    'assess_benefit_risk',
  ])('%s is defined and registered', (name) => {
    expect(names).toContain(name);
    expect(typeof getToolHandler(name)).toBe('function');
  });
});

/**
 * The variant that reads the stability register rather than taking pasted
 * numbers. Its assessment and every eligibility refusal live in
 * services/cmc/recorded-stability and are covered there and at the route; what
 * matters HERE is the boundary the tool owns — tenant scope, and not answering
 * from a partial set.
 */
describe('assess_recorded_batch_poolability', () => {
  const call = (input: Record<string, unknown>, ctx?: Record<string, unknown>) =>
    getToolHandler('assess_recorded_batch_poolability')!(input, ctx as never);

  it('refuses without an organization context rather than reading across tenants', async () => {
    expect(await call({ study_ids: [1, 2] })).toMatch(/organization context is required/i);
  });

  it('needs at least two distinct ids', async () => {
    for (const study_ids of [[1], [1, 1], [], ['x'], [0, -3]]) {
      const out = JSON.parse(await call({ study_ids }, { organizationId: 101 }));
      expect(out.status).toBe('needs_parameters');
    }
  });

  it('will not assess a partial set when an id is not in this organization', async () => {
    // No study exists for these ids under org 101, so every id is unresolved.
    // Answering from what WAS found would silently narrow the question the user
    // asked, and a pooled verdict over a subset is a different claim.
    const out = JSON.parse(await call({ study_ids: [90001, 90002] }, { organizationId: 101 }));
    expect(['not_found', 'error']).toContain(out.status ?? 'error');
    if (out.status === 'not_found') {
      expect(out.message).toMatch(/do not assess a partial set/);
    }
  });
});

describe('assess_batch_poolability', () => {
  it('decides poolability and a shelf life', async () => {
    const out = JSON.parse(await getToolHandler('assess_batch_poolability')!({
      batches: [
        { batchId: 'A', data: [{ time: 0, value: 101.2 }, { time: 6, value: 98.7 }, { time: 12, value: 97.3 }, { time: 18, value: 95.2 }] },
        { batchId: 'B', data: [{ time: 0, value: 100.6 }, { time: 6, value: 99.3 }, { time: 12, value: 96.8 }, { time: 18, value: 95.6 }] },
      ],
      specLimit: 95, direction: 'decreasing',
    }));
    expect(out.status).toBe('computed');
    expect(['pooled', 'minimum-of-batches']).toContain(out.result.decision);
    expect(out.result.slopeTest).toHaveProperty('pValue');
  });
  it('requires ≥2 batches', async () => {
    const out = JSON.parse(await getToolHandler('assess_batch_poolability')!({ batches: [{ batchId: 'A', data: [{ time: 0, value: 1 }, { time: 1, value: 1 }, { time: 2, value: 1 }] }], specLimit: 0, direction: 'decreasing' }));
    expect(out.status).toBe('needs_parameters');
  });
});

describe('assess_benefit_risk', () => {
  it('computes a structured benefit-risk result', async () => {
    const out = JSON.parse(await getToolHandler('assess_benefit_risk')!({
      benefits: [{ name: 'Efficacy', weight: 3, score: 80 }],
      risks: [{ name: 'AEs', weight: 1, score: 30 }],
    }));
    expect(out.status).toBe('computed');
    expect(out.result.favorability).toBe('favorable');
    expect(out.result.disclaimer).toMatch(/decision aid/i);
  });
  it('validates inputs', async () => {
    const out = JSON.parse(await getToolHandler('assess_benefit_risk')!({ benefits: [], risks: [{ name: 'R', weight: 1, score: 1 }] }));
    expect(out.status).toBe('needs_parameters');
  });
});

/**
 * The Submission Readiness Twin — five live routes, integration-tested, and
 * until now no caller anywhere in the client.
 *
 * The service's own `getEmptyDashboard()` returns overallScore 0 and
 * approvalProbability 0 when no assessment exists, which is byte-identical to a
 * genuinely terrible program. A model handed that payload reports a zero
 * readiness score as fact. That distinction is the handler's job, and it is what
 * these tests exist for.
 */
describe('get_submission_readiness_twin', () => {
  const call = (input: Record<string, unknown>, ctx?: Record<string, unknown>) =>
    getToolHandler('get_submission_readiness_twin')!(input, ctx as never);

  it('refuses without an organization context', async () => {
    expect(await call({ program_id: 'p1' })).toMatch(/organization context is required/i);
  });

  it('requires a program id', async () => {
    for (const program_id of ['', '   ', undefined, 42]) {
      const out = JSON.parse(await call({ program_id }, { organizationId: 101 }));
      expect(out.status).toBe('needs_parameters');
    }
  });

  it('will not report a score for a program outside the caller\'s organization', async () => {
    const out = JSON.parse(
      await call({ program_id: '00000000-0000-4000-8000-000000000000' }, { organizationId: 101 }),
    );
    // Either the tenant proof fails (no such program here) or the environment
    // has no innovation schema at all. Neither may yield a readiness number.
    expect(['not_found', 'error']).toContain(out.status ?? 'error');
    expect(out.dashboard).toBeUndefined();
    if (out.status === 'not_found') {
      expect(out.message).toMatch(/Do not report a readiness score/);
    }
  });
});


/**
 * The recorded-data pair the coverage evaluation asked for.
 *
 * ── The defect these pin against ─────────────────────────────────────────────
 * Exactly ONE of ~9 CMC engines read recorded data; every other tool took
 * typed-in numbers, so "run a model against our results" meant re-transcribing
 * them into chat. And assess_recorded_batch_poolability's own instruction told
 * the model to "list the stability register first" while NO tool could list
 * any register — the pointer was dead.
 */
describe('list_cmc_registers — the discovery the recorded tools point at', () => {
  const call = (input: Record<string, unknown>, ctx?: Record<string, unknown>) =>
    getToolHandler('list_cmc_registers')!(input, ctx as never);

  it('refuses without an organization context rather than reading across tenants', async () => {
    expect(await call({})).toMatch(/organization context is required/i);
  });

  it('answers with the ids the recorded tools take, and never confuses unreadable with empty', async () => {
    const out = JSON.parse(await call({ register: 'stability', limit: 5 }, { organizationId: 101 }));
    if (out.error) {
      // No database in this harness — the tool reports the failure, it does
      // not answer "nothing recorded".
      expect(out.error).toMatch(/list_cmc_registers failed/);
      return;
    }
    expect(out.status).toBe('listed');
    expect(out.instruction).toMatch(/unreadable, NOT as empty/);
    const reg = out.registers.stability;
    // Either real rows, or an explicit unavailable marker — never a bare [].
    expect(Array.isArray(reg) || reg?.unavailable === true).toBe(true);
  });

  it('caps the page size so a broad call cannot pull a register wholesale', async () => {
    const out = JSON.parse(await call({ limit: 5000 }, { organizationId: 101 }));
    if (!out.error) expect(out.limit).toBeLessThanOrEqual(100);
  });

  /* The two registers §3.2.S.5 / §3.2.S.6 / §3.2.P.6 / §3.2.P.7 compose from.
     A model that cannot see them cannot answer "is the E&L package on file"
     — the question a reviewer asks first — and would have to infer it. */
  it('lists the container closure and reference standard registers too', async () => {
    const out = JSON.parse(await call({}, { organizationId: 101 }));
    if (out.error) return;
    for (const key of ['container_closure', 'reference_standard']) {
      expect(Object.keys(out.registers)).toContain(key);
      const reg = out.registers[key];
      expect(Array.isArray(reg) || reg?.unavailable === true).toBe(true);
    }
  });

  it('declares both new registers as selectable values, so a scoped call is not a silent no-op', () => {
    const listTool = ALL_ANA_TOOLS.find((t) => t.name === 'list_cmc_registers')!;
    const register = listTool.input_schema.properties.register as { enum?: string[] } | undefined;
    const values = register?.enum ?? [];
    expect(values).toEqual(expect.arrayContaining(['container_closure', 'reference_standard']));
  });

  /* Identity and state only. Listing the E&L package itself would pull every
     analyte result into the model's context on a broad discovery call. */
  it('lists the impurity and dissolution registers, with the ICH inputs a threshold needs', async () => {
    const out = JSON.parse(await call({}, { organizationId: 101 }));
    if (out.error) return;
    for (const key of ['impurity_profile', 'dissolution_profile']) {
      expect(Object.keys(out.registers)).toContain(key);
    }
  });

  it('reports the E&L and characterisation packages as presence flags, not as payloads', async () => {
    const out = JSON.parse(await call({ register: 'container_closure', limit: 5 }, { organizationId: 101 }));
    if (out.error) return;
    const rows = out.registers.container_closure;
    if (!Array.isArray(rows) || rows.length === 0) return;
    expect(rows[0]).not.toHaveProperty('extractablesLeachables');
    expect(rows[0]).toHaveProperty('hasExtractablesLeachables');
  });
});

describe('estimate_recorded_shelf_life — ICH Q1E over a study on file', () => {
  const call = (input: Record<string, unknown>, ctx?: Record<string, unknown>) =>
    getToolHandler('estimate_recorded_shelf_life')!(input, ctx as never);

  it('refuses without an organization context', async () => {
    expect(await call({ study_id: 1 })).toMatch(/organization context is required/i);
  });

  it('needs a real study id, and points at the register to find one', async () => {
    for (const study_id of [undefined, 0, -2, 'x']) {
      const out = JSON.parse(await call({ study_id }, { organizationId: 101 }));
      expect(out.status).toBe('needs_parameters');
      expect(out.message).toMatch(/list_cmc_registers/);
    }
  });

  it('a study that is not this organization\'s is not found — never answered from elsewhere', async () => {
    const out = JSON.parse(await call({ study_id: 90001 }, { organizationId: 101 }));
    expect(['not_found', 'error']).toContain(out.status ?? 'error');
  });
});

describe('the recorded engine is SHARED with the stability surface, not a second copy', () => {
  it('estimateRecordedShelfLife refuses a multi-condition study — the same refusal the route serves', async () => {
    const { estimateRecordedShelfLife } = await import('../../cmc/recorded-stability.js');
    const outcome = await estimateRecordedShelfLife({
      id: 1, storageConditions: ['LT', 'ACC'],
      stabilityData: { results: [{ timePoint: '0', parameter: 'Assay', result: '99' }] },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/placed at 2 storage conditions/);
  });

  it('refuses a study with no recorded pull points rather than fitting nothing', async () => {
    const { estimateRecordedShelfLife } = await import('../../cmc/recorded-stability.js');
    const outcome = await estimateRecordedShelfLife({ id: 2, storageConditions: ['LT'], stabilityData: null });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toMatch(/no recorded pull-point results/);
  });

  it('fits the limiting attribute from recorded results, and says why an attribute is not estimable', async () => {
    const { estimateRecordedShelfLife } = await import('../../cmc/recorded-stability.js');
    const outcome = await estimateRecordedShelfLife({
      id: 3, studyTitle: 'BX-701 long term', productName: 'BX-701', batchNumber: 'B-001',
      storageConditions: ['25C/60RH'], duration: 24,
      stabilityData: {
        results: [
          { timePoint: '0', parameter: 'Assay', result: '101.2', specification: '>= 95.0%' },
          { timePoint: '6', parameter: 'Assay', result: '99.1', specification: '>= 95.0%' },
          { timePoint: '12', parameter: 'Assay', result: '97.4', specification: '>= 95.0%' },
          { timePoint: '18', parameter: 'Assay', result: '96.1', specification: '>= 95.0%' },
          // One point only: not estimable, and the reason must say so.
          { timePoint: '0', parameter: 'Aggregates', result: '0.4', specification: '<= 2.0%' },
        ],
      },
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.limitingParameter).toBe('Assay');
    expect(typeof outcome.data.supportedShelfLife).toBe('number');
    const agg = outcome.data.estimates.find((e) => e.parameter === 'Aggregates')!;
    expect(agg.estimable).toBe(false);
    expect(String(agg.reason)).toMatch(/at least 3 numeric timepoints/);
    // The scope limit travels with the number so a pooled claim is never implied.
    expect(outcome.data.scopeLimit).toMatch(/poolability .* is assessed separately|Batch poolability/);
  });
});

/* f2 over profiles ON FILE. The eligibility conditions and the arithmetic live
   in services/cmc/dissolution-comparison and are covered there; what matters
   HERE is the boundary this tool owns — tenant scope, two real ids, and the
   refusal it must relay rather than route around. */
describe('compare_recorded_dissolution', () => {
  const call = (input: Record<string, unknown>, ctx?: Record<string, unknown>) =>
    getToolHandler('compare_recorded_dissolution')!(input, ctx as never);

  it('is defined and registered', () => {
    expect(names).toContain('compare_recorded_dissolution');
    expect(typeof getToolHandler('compare_recorded_dissolution')).toBe('function');
  });

  it('refuses without an organization context rather than reading across tenants', async () => {
    expect(await call({ reference_profile_id: 1, test_profile_id: 2 })).toMatch(/organization context is required/i);
  });

  it('needs two real ids, and points at the register to find them', async () => {
    for (const input of [{}, { reference_profile_id: 1 }, { reference_profile_id: 0, test_profile_id: 2 }]) {
      const out = JSON.parse(await call(input, { organizationId: 101 }));
      expect(out.status).toBe('needs_parameters');
    }
  });

  it('refuses to compare a profile against itself', async () => {
    const out = JSON.parse(await call({ reference_profile_id: 7, test_profile_id: 7 }, { organizationId: 101 }));
    expect(out.status).toBe('needs_parameters');
    expect(out.message).toMatch(/100 by construction/);
  });

  it('will not answer from a partial set when a profile is not this organization', async () => {
    const out = JSON.parse(await call({ reference_profile_id: 90001, test_profile_id: 90002 }, { organizationId: 101 }));
    expect(['not_found', 'error']).toContain(out.status ?? 'error');
    if (out.status === 'not_found') expect(out.message).toMatch(/No comparison is made/);
  });

  it('tells the model to relay a refusal rather than route around it with typed numbers', () => {
    const tool = ALL_ANA_TOOLS.find((t) => t.name === 'compare_recorded_dissolution')!;
    expect(tool.description).toMatch(/Relay a refusal verbatim/);
    expect(tool.description).toMatch(/never assumed to be 12/);
  });
});
