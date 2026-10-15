/**
 * AnA's device tools leave a device fact nobody stated undetermined
 * (2026-10-15).
 *
 * classify_device and classify_medical_device with framework 'fda' and no facts
 * answered PMA with "No predicate available" (recommendFdaPathway's fall-through).
 * build_device_blueprint read an omitted equivalence_claimed as false
 * (`input.equivalence_claimed === true`), so a CER without its Equivalence
 * section came back ready, and read omitted software harm facts as IEC 62304
 * Class A, so its scorecard scored software ready.
 */
import { describe, it, expect } from 'vitest';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler, type ToolContext } from '../AnaToolExecutor';
import { CER_SECTIONS } from '../../market-specs/cer-structure';
import { SOFTWARE_DELIVERABLES } from '../../market-specs/software-lifecycle';

const CTX = { humanConfirmed: true } as ToolContext;
const ALWAYS_REQUIRED_CER = CER_SECTIONS.filter((s) => s.required && !s.equivalenceOnly).map((s) => s.id);
const CLASS_A_IDS = SOFTWARE_DELIVERABLES.filter((d) => d.classes.includes('A')).map((d) => d.id);

async function run(tool: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const handler = getToolHandler(tool);
  expect(handler, `${tool} has a handler`).toBeTypeOf('function');
  return JSON.parse(await handler!(input, CTX)) as Record<string, unknown>;
}

interface BlueprintReply {
  evidenceModules: Array<{ id: string; detail?: Record<string, unknown> }>;
  scorecard: { dimensions: Array<{ id: string; status: string }>; topGaps: string[] };
}

describe('classify_device / classify_medical_device, FDA', () => {
  it('states no pathway and no predicate finding from no facts', async () => {
    const out = await run('classify_device', { framework: 'fda', facts: {} });
    expect(out).toMatchObject({ ok: true, framework: 'fda', pathway: 'undetermined' });
    expect((out.missingFacts as string[]).map((f) => f.split(' ')[0])).toEqual(['predicateAvailable', 'novelLowModerateRisk']);
    expect(JSON.stringify(out)).not.toMatch(/No predicate available|conservative default/);
    expect(await run('classify_medical_device', { framework: 'fda', facts: {} })).toEqual(out);
  });

  it('refuses a predicate answer it cannot read', async () => {
    const out = await run('classify_device', { framework: 'fda', facts: { predicateAvailable: 'no' } });
    expect(out.error).toMatch(/predicateAvailable/);
    expect(out).not.toHaveProperty('pathway');
  });
});

describe('build_device_blueprint', () => {
  it('does not read an omitted equivalence_claimed as "not claimed"', async () => {
    const out = (await run('build_device_blueprint', {
      submission_type: 'mdr_td',
      present: { cerSectionIds: ALWAYS_REQUIRED_CER },
    })) as unknown as BlueprintReply;
    const cer = out.evidenceModules.find((m) => m.id === 'clinical_evaluation')!.detail!;
    expect(cer).toMatchObject({ ready: false, equivalenceAddressed: null });
    expect(out.scorecard.dimensions.find((d) => d.id === 'evidence:clinical_evaluation')?.status).not.toBe('ready');
  });

  it('relays a stated equivalence answer', async () => {
    const out = (await run('build_device_blueprint', {
      submission_type: 'mdr_td',
      present: { cerSectionIds: ALWAYS_REQUIRED_CER },
      equivalence_claimed: false,
    })) as unknown as BlueprintReply;
    expect(out.evidenceModules.find((m) => m.id === 'clinical_evaluation')!.detail).toMatchObject({ ready: true, equivalenceAddressed: true });
  });

  it('does not score software ready when no harm fact was stated', async () => {
    const out = (await run('build_device_blueprint', {
      submission_type: '510k',
      software: { applicable: true, presentDeliverableIds: CLASS_A_IDS },
    })) as unknown as BlueprintReply;
    const sw = out.evidenceModules.find((m) => m.id === 'software')!.detail!;
    expect(sw.classification).toMatchObject({ class: 'undetermined' });
    expect(out.scorecard.dimensions.find((d) => d.id === 'evidence:software')?.status).toBe('not_assessed');
  });
});
