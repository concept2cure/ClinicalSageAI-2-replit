/**
 * assess_nonclinical_program with no studies answers with the requirement list,
 * not a gap analysis (CLAUDE.md Rule 2; Rule 2 audit S3, 2026-10-26).
 *
 * The handler defaulted an absent `present` to [] and compared the ICH M3(R2)
 * battery against it, so {maxClinicalDurationWeeks: 4} came back 'assessed',
 * adequate: false, with every study due before first-in-human listed as a gap:
 * "Missing rodent repeat-dose tox of ≥4 weeks.", "Ames (gene-mutation) assay
 * not present." Nothing had been read; the answer said the program lacked every
 * study. Absence of a record is not absence of the thing.
 */
import { describe, expect, it } from 'vitest';

import { getToolHandler } from '../AnaToolExecutor.js';
import { requiredNonclinicalBattery } from '../../preclinical/nonclinical-program-requirements';

async function call(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const handler = getToolHandler('assess_nonclinical_program');
  if (!handler) throw new Error('no handler registered for assess_nonclinical_program');
  return JSON.parse(await handler(input)) as Record<string, unknown>;
}

describe('assess_nonclinical_program — no studies read is not a program that lacks them', () => {
  it('with no studies, returns the required battery with adequate and gaps null, and says it is not a gap analysis', async () => {
    const out = await call({ maxClinicalDurationWeeks: 4 });
    // On trunk this is the failing line: adequate false, "Ames (gene-mutation) assay not present." and the rest.
    expect(JSON.stringify(out)).not.toMatch(/not present|Missing (?:rodent|non-rodent)/);
    expect(out.adequate).toBeNull();
    expect(out.gaps).toBeNull();
    expect(out.status).toBe('requirements');
    expect(out.required).toEqual(requiredNonclinicalBattery({ maxClinicalDurationWeeks: 4 }));
    expect(String(out.message)).toMatch(/no studies were read/i);
    expect(String(out.message)).toMatch(/not a gap analysis/);
  });

  it('an empty study list is read the same way: nothing was compared', async () => {
    const out = await call({ maxClinicalDurationWeeks: 4, targetPhase: 2, present: [] });
    expect(JSON.stringify(out)).not.toMatch(/not present/);
    expect(out.adequate).toBeNull();
    expect(out.gaps).toBeNull();
    expect(out.status).toBe('requirements');
  });

  it('the requirement list still follows the program context', async () => {
    const out = await call({ maxClinicalDurationWeeks: 4, route: 'intravenous', oncology: true });
    const required = out.required as Array<{ key: string; requirement: string }>;
    expect(required.find((s) => s.key === 'local_tolerance')?.requirement).toBe('required');
    expect(required.find((s) => s.key === 'genotox_ames')?.requirement).toBe('conditional');
  });

  it('still asks for the clinical duration first', async () => {
    expect((await call({})).status).toBe('needs_parameters');
  });

  it('with studies listed, it still compares them against the battery', async () => {
    const out = await call({
      maxClinicalDurationWeeks: 4,
      targetPhase: 2,
      present: [{ studyType: 'genotox', genotoxComponent: 'ames' }],
    });
    expect(out.status).toBe('assessed');
    expect(Array.isArray(out.gaps)).toBe(true);
  });
});
