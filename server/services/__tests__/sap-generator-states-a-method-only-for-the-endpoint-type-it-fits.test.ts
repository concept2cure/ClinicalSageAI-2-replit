/**
 * The generated SAP states a primary analysis method only for the endpoint type
 * that method fits, and says the method is not determined otherwise.
 *
 * Until 2026-10-15 the per-phase methods template printed its primary analysis
 * as the plan whatever the primary endpoint was — "will be analyzed using mixed
 * model for repeated measures (MMRM)" for overall survival, ANCOVA for a
 * response rate — with the missing-data handling and sensitivity analyses that
 * go with it, and "appropriate statistical methods" for a phase it had no
 * template for. The request had no way to say what type the endpoint is.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

vi.mock('../../db', () => {
  const chain = { select: () => chain, from: () => chain, where: () => chain, limit: async () => [] };
  return { db: chain, pool: { query: async () => ({ rows: [], rowCount: 0 }) } };
});

import SapGenerator from '../sap-generator-service';

const REQUIRED = { indication: 'NSCLC', phase: 'Phase 3', sample_size: 400, primary_endpoint: 'Overall survival' };
type Request = Parameters<typeof SapGenerator.generateSAP>[0];
const sap = async (extra: Record<string, unknown>) =>
  (await SapGenerator.generateSAP({ ...REQUIRED, ...extra } as unknown as Request)).sapContent;

beforeEach(() => {
  // A SAP filed under a protocol id was written under data/sap; not from a test.
  vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
});

describe('the primary analysis', () => {
  it('is not planned as MMRM for a time-to-event endpoint', async () => {
    const content = await sap({ primary_endpoint_type: 'time_to_event' });
    expect(content, 'MMRM was stated as the plan for overall survival').not.toMatch(/primary endpoint will be analyzed using mixed model/);
    expect(content).toContain(
      'Primary analysis: method not determined for a time-to-event endpoint — the Phase 3 template\'s ' +
      'mixed model for repeated measures (MMRM) applies to continuous endpoints. To be set by the study statistician.');
    expect(content).toContain('Primary approach: not determined (the primary analysis method is not determined)');
    expect(content).not.toMatch(/Pattern mixture models|Multiple imputation/);
  });

  it('is not planned at all when the endpoint type was not stated', async () => {
    const content = await sap({});
    expect(content, 'MMRM was stated as the plan for an endpoint of unstated type').not.toMatch(/analyzed using mixed model/);
    expect(content).toContain(
      "Primary analysis: method not determined — the primary endpoint's type (continuous, binary or time-to-event) " +
      'was not stated. To be set by the study statistician.');
  });

  it('is stated as the template has it for an endpoint type the method fits', async () => {
    const content = await sap({ primary_endpoint: 'HbA1c change from baseline at week 24', primary_endpoint_type: 'continuous' });
    expect(content).toContain('The primary endpoint will be analyzed using mixed model for repeated measures (MMRM).');
    expect(content).toContain('Missing data will be handled using multiple imputation.');
    expect(content).toContain('Primary approach: Multiple imputation');
  });

  it('is stated for any endpoint type where the template method fits them all (Phase 1 descriptive statistics)', async () => {
    const content = await sap({ phase: 'Phase 1', primary_endpoint: 'Incidence of DLTs', primary_endpoint_type: 'binary' });
    expect(content).toContain('The primary endpoint will be analyzed using descriptive statistics.');
    // A method that fits every type fits whatever the type is, stated or not.
    const unstated = await sap({ phase: 'Phase 1', primary_endpoint: 'Incidence of DLTs' });
    expect(unstated).toContain('The primary endpoint will be analyzed using descriptive statistics.');
  });

  it('is not determined for a phase there is no methods template for', async () => {
    const content = await sap({ phase: 'Phase 2/3', primary_endpoint_type: 'continuous' });
    expect(content, '"appropriate statistical methods" was stated as the plan')
      .not.toMatch(/methods based on endpoint type|appropriate categorical analysis|survival analysis methods as appropriate/);
    expect(content).toContain(
      'Primary analysis: method not determined for a continuous endpoint — there is no methods template for "Phase 2/3". ' +
      'To be set by the study statistician.');
    expect(content).toContain('- Binary outcomes: method not determined — there is no methods template for "Phase 2/3"');
  });

  it('refuses an endpoint type it does not know, naming it', async () => {
    const err = await sap({ primary_endpoint_type: 'survival' }).then(() => null, (e: unknown) => e);
    expect(err, 'an unknown endpoint type was accepted').not.toBeNull();
    expect((err as { fields?: string[] }).fields).toEqual(['primary_endpoint_type']);
  });
});
