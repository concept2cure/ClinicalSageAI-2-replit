/**
 * AnA's get_electrical_standards and get_sterilization_requirements leave a
 * device fact nobody stated undetermined (2026-10-15).
 *
 * What the code used to do: both handlers read every fact with `=== true`, so an
 * omitted electricallyPowered came back applicable:false ("Not electrically
 * powered — IEC 60601 does not apply.") and an omitted `sterile` came back "not
 * supplied sterile — sterilization validation does not apply"; a value that was
 * not true or false ("yes") was read as false the same way.
 */
import { describe, it, expect } from 'vitest';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler, type ToolContext } from '../AnaToolExecutor';
import { applicableElectricalStandards } from '../../market-specs/electrical-safety';
import { sterilizationRequirements } from '../../market-specs/sterilization';

const CTX = { humanConfirmed: true } as ToolContext;

async function run(tool: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const handler = getToolHandler(tool);
  expect(handler, `${tool} has a handler`).toBeTypeOf('function');
  return JSON.parse(await handler!(input, CTX)) as Record<string, unknown>;
}

describe('get_electrical_standards', () => {
  it('answers undetermined, not "does not apply", when electricallyPowered is left out', async () => {
    const out = await run('get_electrical_standards', {});
    expect(out.applicable, 'an omitted electricallyPowered read as false').toBeNull();
    expect(JSON.stringify(out.notes)).not.toMatch(/does not apply/);
  });

  it('names a collateral whose fact is left out as undetermined', async () => {
    const out = await run('get_electrical_standards', { electricallyPowered: true });
    const undetermined = out.undeterminedStandards as Array<{ code: string; applicability: string }>;
    expect(undetermined.find((s) => s.code === 'IEC 60601-1-8')?.applicability).toBe('undetermined — hasAlarms not stated');
  });

  it('answers what the engine answers for the stated facts', async () => {
    const facts = { electricallyPowered: true, hasAlarms: true, homeUse: false };
    expect(await run('get_electrical_standards', facts)).toEqual({ ok: true, ...applicableElectricalStandards(facts) });
  });

  it('refuses a fact that is not true or false, naming it', async () => {
    const out = await run('get_electrical_standards', { electricallyPowered: 'yes' });
    expect(out.error).toMatch(/electricallyPowered/);
    expect(out).not.toHaveProperty('applicable');
  });
});

describe('get_sterilization_requirements', () => {
  it('answers undetermined, not "does not apply", when sterile is left out', async () => {
    const out = await run('get_sterilization_requirements', { method: 'eo' });
    expect(out.applicable, 'an omitted sterile read as "not supplied sterile"').toBeNull();
    expect(JSON.stringify(out.notes)).not.toMatch(/does not apply/);
  });

  it('answers what the engine answers for a stated sterile device', async () => {
    expect(await run('get_sterilization_requirements', { sterile: true, method: 'eo' }))
      .toEqual({ ok: true, ...JSON.parse(JSON.stringify(sterilizationRequirements({ sterile: true, method: 'eo' }))) });
  });

  it('refuses a sterile value that is not true or false, and a method it does not know', async () => {
    expect((await run('get_sterilization_requirements', { sterile: 'yes' })).error).toMatch(/sterile/);
    const out = await run('get_sterilization_requirements', { sterile: true, method: 'gamma' });
    expect(out.error).toMatch(/gamma/);
    expect(out).not.toHaveProperty('applicable');
  });
});
