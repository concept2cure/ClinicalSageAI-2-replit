/**
 * build_device_blueprint's input schema tells the model about the electrical and
 * sterilization facts its handler relays.
 *
 * Until 2026-10-15 input_schema.properties named neither `electrical` nor
 * `sterilization`, although the handler (blueprintDeviceFacts in
 * AnaToolExecutor.ts) relays both to the engine. The model was never told it
 * could state them, so a powered or sterile device asked about through AnA still
 * came back with its IEC 60601 and sterilization modules "not applicable".
 */
import { describe, it, expect } from 'vitest';
import { BUILD_DEVICE_BLUEPRINT } from '../submission-center-tool-defs';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler, type ToolContext } from '../AnaToolExecutor';
import { STERILIZATION_METHODS } from '../../market-specs/sterilization';

const CTX = { humanConfirmed: true } as ToolContext;
const props = BUILD_DEVICE_BLUEPRINT.input_schema.properties as Record<string, { type?: string; description?: string }>;
/** The fields of ElectricalDeviceFacts (market-specs/electrical-safety.ts). */
const ELECTRICAL_FACTS = ['electricallyPowered', 'hasAlarms', 'closedLoopControl', 'homeUse', 'emsUse', 'hasParticularStandard'];

interface Reply {
  error?: string;
  evidenceModules?: Array<{ id: string; applicable: boolean }>;
}
async function run(input: Record<string, unknown>): Promise<Reply> {
  return JSON.parse(await getToolHandler('build_device_blueprint')!(input, CTX)) as Reply;
}
const applicable = (out: Reply, id: string) => out.evidenceModules?.find((m) => m.id === id)?.applicable;

describe('build_device_blueprint input schema', () => {
  it('names each electrical fact, and the handler accepts every one of them as true/false', async () => {
    expect(props.electrical?.type, 'no electrical property').toBe('object');
    for (const fact of ELECTRICAL_FACTS) expect(props.electrical?.description).toContain(fact);
    const out = await run({ submission_type: '510k', electrical: Object.fromEntries(ELECTRICAL_FACTS.map((f) => [f, true])) });
    expect(out.error).toBeUndefined();
    expect(applicable(out, 'electrical_safety')).toBe(true);
  });

  it('lists exactly the sterilization methods the handler accepts', async () => {
    expect(props.sterilization?.type, 'no sterilization property').toBe('object');
    const listed = /method ∈ ([\w|]+)/.exec(props.sterilization?.description ?? '')?.[1].split('|');
    expect(listed).toEqual([...STERILIZATION_METHODS.map((m) => m.id), 'unknown']);
    for (const method of listed ?? []) {
      const out = await run({ submission_type: '510k', sterilization: { sterile: true, method } });
      expect(out.error, method).toBeUndefined();
      expect(applicable(out, 'sterilization'), method).toBe(true);
    }
  });
});
