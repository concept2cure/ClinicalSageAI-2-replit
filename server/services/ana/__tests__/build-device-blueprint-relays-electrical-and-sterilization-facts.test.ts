/**
 * AnA build_device_blueprint relays the electrical and sterilization facts that
 * POST /device/blueprint relays (2026-10-15).
 *
 * The handler passed submission_type, classification, contact, software, present
 * and equivalence_claimed to buildDeviceBlueprint and dropped `electrical` and
 * `sterilization`, which the route passes. A mains-powered or sterile device asked
 * about through AnA came back with its IEC 60601 and sterilization modules "not
 * applicable", and neither appeared among the modules nobody assessed.
 */
import { describe, it, expect } from 'vitest';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler, type ToolContext } from '../AnaToolExecutor';
import { buildDeviceBlueprint } from '../../market-specs/device-blueprint';

const CTX = { humanConfirmed: true } as ToolContext;

interface BlueprintReply {
  error?: string;
  evidenceModules: Array<{ id: string; applicable: boolean; detail?: Record<string, unknown> }>;
  evidenceNotAssessed: Array<{ id: string }>;
}

async function run(input: Record<string, unknown>): Promise<BlueprintReply> {
  const handler = getToolHandler('build_device_blueprint');
  expect(handler, 'build_device_blueprint has a handler').toBeTypeOf('function');
  return JSON.parse(await handler!(input, CTX)) as BlueprintReply;
}

const moduleOf = (out: BlueprintReply, id: string) => out.evidenceModules.find((m) => m.id === id)!;

describe('build_device_blueprint', () => {
  it('relays stated electrical facts: a powered device gets the IEC 60601 module', async () => {
    const out = await run({ submission_type: '510k', electrical: { electricallyPowered: true, hasAlarms: true } });
    expect(moduleOf(out, 'electrical_safety').applicable, 'the electrical facts were dropped').toBe(true);
    expect(out.evidenceNotAssessed.map((n) => n.id)).toContain('electrical_safety');
  });

  it('relays stated sterilization facts: a sterile device gets the sterilization module', async () => {
    const out = await run({ submission_type: '510k', sterilization: { sterile: true, method: 'eo' } });
    const m = moduleOf(out, 'sterilization');
    expect(m.applicable, 'the sterilization facts were dropped').toBe(true);
    expect(m.detail).toMatchObject({ method: { id: 'eo' } });
  });

  it('answers what the engine answers for the facts the route passes', async () => {
    const facts = {
      electrical: { electricallyPowered: true, homeUse: true },
      sterilization: { sterile: true, method: 'steam' as const },
    };
    const out = await run({ submission_type: 'pma', ...facts });
    const direct = buildDeviceBlueprint({ submissionType: 'pma', ...facts });
    expect(out.evidenceModules).toEqual(JSON.parse(JSON.stringify(direct.evidenceModules)));
  });

  it('refuses an electrical fact that is not true or false, naming it', async () => {
    const out = await run({ submission_type: '510k', electrical: { electricallyPowered: 'yes' } });
    expect(out.error).toMatch(/electricallyPowered/);
    expect(out).not.toHaveProperty('evidenceModules');
  });

  it('refuses a sterilization method it does not know, naming it', async () => {
    const out = await run({ submission_type: '510k', sterilization: { sterile: true, method: 'gamma' } });
    expect(out.error).toMatch(/gamma/);
    expect(out).not.toHaveProperty('evidenceModules');
  });
});
