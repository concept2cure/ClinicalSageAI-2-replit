/**
 * IVD lifecycle tools report an engine fault as an error, not as a request for
 * parameters (Rule 2 audit S3, 2026-10-26).
 *
 * ivdError (AnaToolExecutor.ts) answered every throw from an IVD engine with
 * `status: 'needs_parameters'`, on the comment that "the throw-based engines
 * phrase their message as the parameter problem". A TypeError, a failed import
 * or any other fault in the tool therefore reached the model as "more details
 * are needed", the loop (tool-outcome.ts) read it as input to ask the person
 * for, and telemetry (tool-telemetry.ts classifyResult) counted it a success.
 * Now only a message isStatsParamError reads as a parameter problem asks the
 * user; anything else is the tool's `{ error }`, as in runStatsTool.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authoring = vi.hoisted(() => ({ buildEmdr: vi.fn() }));
vi.mock('../../postmarket/report-authoring.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  buildEmdr: (...a: unknown[]) => authoring.buildEmdr(...a),
}));

// Importing the executor registers every handler as an import side effect.
import { getToolHandler, type ToolContext } from '../AnaToolExecutor';

async function run(tool: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const handler = getToolHandler(tool);
  expect(handler, `${tool} has a handler`).toBeTypeOf('function');
  return JSON.parse(await handler!(input, { organizationId: 1, userId: 1 } as ToolContext)) as Record<string, unknown>;
}

const EMDR = { reportType: 'emdr', fields: { manufacturerName: 'Acme Diagnostics' } };

describe('build_postmarket_report: a fault in the engine', () => {
  beforeEach(() => {
    authoring.buildEmdr.mockReset();
  });

  it('is reported as the tool failing, not as "more details are needed"', async () => {
    authoring.buildEmdr.mockImplementation(() => {
      throw new TypeError("Cannot read properties of undefined (reading 'trim')");
    });
    const out = await run('build_postmarket_report', EMDR);
    expect(authoring.buildEmdr).toHaveBeenCalledTimes(1);
    expect(out.status, 'a TypeError inside the engine was read as a parameter problem').not.toBe('needs_parameters');
    expect(out.error).toBe("build_postmarket_report failed: Cannot read properties of undefined (reading 'trim')");
  });

  it('still asks for parameters when the engine names the parameter problem', async () => {
    authoring.buildEmdr.mockImplementation(() => {
      throw new Error('becameAwareDate must be an ISO date');
    });
    const out = await run('build_postmarket_report', EMDR);
    expect(out).toEqual({
      status: 'needs_parameters',
      tool: 'build_postmarket_report',
      message: 'becameAwareDate must be an ISO date',
    });
  });
});

describe('a real engine refusal through ivdError', () => {
  it.each([
    ['determine_assay_cutoff', {}, ['observations']],
    ['determine_assay_cutoff', { observations: null }, ['observations']],
    ['assess_scientific_validity', { analyte: 'HER2', clinicalCondition: 'cancer', intendedPurpose: 'diagnosis' }, ['evidence']],
    ['assess_shelf_life_stability', { maxPercentChange: 10 }, ['points']],
    ['assess_accelerated_stability', { storageTemperatureC: 5, degradationThreshold: 0.1 }, ['points']],
  ])('%s asks for missing schema inputs even when its engine throws a TypeError', async (tool, input, missing) => {
    const out = await run(tool as string, input as Record<string, unknown>);
    expect(out.status).toBe('needs_parameters');
    expect(out.error).toBeUndefined();
    for (const field of missing as string[]) expect(String(out.message)).toContain(field);
  });

  it('a TypeError with all schema inputs stated remains an engine fault', async () => {
    const out = await run('determine_assay_cutoff', { observations: [null] });
    expect(out.status).not.toBe('needs_parameters');
    expect(out.error).toMatch(/determine_assay_cutoff failed:/);
  });

  it('determine_assay_cutoff with one class of case still asks for both', async () => {
    const out = await run('determine_assay_cutoff', {
      observations: [
        { score: 8, positive: true },
        { score: 9, positive: true },
      ],
    });
    expect(out).toEqual({
      status: 'needs_parameters',
      tool: 'determine_assay_cutoff',
      message: 'Cut-off determination requires both positive and negative cases.',
    });
  });
});
