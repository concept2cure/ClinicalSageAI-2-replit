/** S5-0: calculator answers identify their input basis without claiming record evidence. */
import { describe, expect, it, vi } from 'vitest';

const fault = vi.hoisted(() => ({ buildEmdr: vi.fn() }));
vi.mock('../../postmarket/report-authoring.js', async original => ({
  ...await original<object>(), buildEmdr: (...args: unknown[]) => fault.buildEmdr(...args),
}));

import { getToolHandler } from '../AnaToolExecutor.js';

const CASES: Array<{ tool: string; input: Record<string, unknown>; status?: string }> = [
  { tool: 'compute_fih_dose', input: { speciesNoaels: [{ species: 'dog', noaelMgPerKg: 30 }] } },
  { tool: 'classify_tox_findings', status: 'classified', input: { findings: [{ organ: 'liver', finding: 'hepatocellular hypertrophy' }] } },
  { tool: 'estimate_shelf_life', input: {
    data: [{ time: 0, value: 101 }, { time: 6, value: 99 }, { time: 12, value: 97 }, { time: 18, value: 95.6 }],
    specLimit: 95, direction: 'decreasing',
  } },
  { tool: 'assess_analytical_method_validation', input: {
    linearity: [{ nominal: 0, response: 0 }, { nominal: 50, response: 100 }, { nominal: 100, response: 200 }], precision: [100, 101, 99],
  } },
  { tool: 'assess_mdr_reportability', input: {
    patientHarm: 'death', isMalfunction: false, eventLocationCountry: 'US', anticipatesCorrection: false, trendThresholdCrossed: false,
  } },
  { tool: 'characterize_pk', input: { accumulation: { halfLifeHours: 18, dosingIntervalHours: 24 } } },
  { tool: 'assess_concentration_qtc', input: { slope: 0.02, slopeSE: 0.005, intercept: 0.5, targetConcentration: 300, therapeuticCmax: 150 } },
  { tool: 'assess_ddi_risk', input: { imaxUnbound: 0.5, ki: 10 } },
  { tool: 'select_exposure_response_dose', input: {
    dosesMg: [100, 200], exposuresByDose: [{ doseMg: 100, exposure: 50 }, { doseMg: 200, exposure: 400 }],
    efficacy: { ec50: 60 }, safety: { thresholdExposure: 300 }, targetEfficacyFraction: 0.5,
  } },
  { tool: 'compute_sample_size', input: {
    clientTrack: 'biotech_pharma', studyType: 'superiority', objectiveType: 'efficacy', endpointType: 'binary',
    controlRate: 0.3, treatmentRate: 0.45, alpha: 0.05, powerTarget: 0.9,
  } },
  { tool: 'compute_assurance', input: { priorMean: 0.4, priorSd: 0.15, nPerArm: 120 } },
  { tool: 'determine_assay_cutoff', input: { observations: [
    { score: 1, positive: false }, { score: 2, positive: false }, { score: 8, positive: true }, { score: 9, positive: true },
  ] } },
];

async function run(tool: string, input: Record<string, unknown>) {
  const handler = getToolHandler(tool);
  expect(handler, tool).toBeTypeOf('function');
  return JSON.parse(await handler!(input, { organizationId: 101, userId: 7, humanConfirmed: true } as never));
}

describe('the shared wrappers and inline calculator envelopes', () => {
  it.each(CASES)('$tool reports a stated worksheet basis', async ({ tool, input, status }) => {
    const out = await run(tool, input);
    expect(out.status).toBe(status ?? 'computed');
    expect(out.basis).toBe('stated');
    expect(out.appliesTo).toBe('the inputs stated in this conversation');
    expect(out.instruction).toMatch(/stated/i);
    expect(out.instruction).toMatch(/(?:no|none|not).*record/i);
    expect(out.instruction).toMatch(/program.*product.*verdict/i);
  });

  it('discloses that arithmetic defaults are defaults, not inputs the person stated', async () => {
    const out = await run('compute_fih_dose', { speciesNoaels: [{ species: 'dog', noaelMgPerKg: 30 }] });
    expect(out.mrsd.safetyFactor).toBe(10);
    expect(out.instruction).toMatch(/default|assum(?:ed|ption)/i);
    expect(out.instruction).not.toMatch(/every input was stated/i);
  });

  it('does not add calculator metadata to an exact IVD parameter refusal', async () => {
    expect(await run('determine_assay_cutoff', { observations: [{ score: 8, positive: true }] })).toEqual({
      status: 'needs_parameters', tool: 'determine_assay_cutoff',
      message: 'Cut-off determination requires both positive and negative cases.',
    });
  });

  it('keeps a shared stats-wrapper parameter refusal exact', async () => {
    expect(await run('compute_assurance', { priorMean: 0.4, priorSd: 0.15, nPerArm: 0 })).toEqual({
      status: 'needs_parameters', message: 'nPerArm must be positive',
    });
  });

  it('does not add calculator metadata to a real engine fault', async () => {
    fault.buildEmdr.mockImplementation(() => { throw new Error('synthetic report engine fault'); });
    expect(await run('build_postmarket_report', { reportType: 'emdr', fields: {} })).toEqual({
      error: 'build_postmarket_report failed: synthetic report engine fault',
    });
  });
});
