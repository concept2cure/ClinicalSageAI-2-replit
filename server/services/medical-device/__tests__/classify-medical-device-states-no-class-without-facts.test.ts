/**
 * classify_medical_device states a device class only from the facts that
 * decide it (2026-10-15).
 *
 * Until today the AnA tool ran classifyDevice (medical-device-knowledge.ts), an
 * older second classification engine beside the fail-closed one in
 * market-specs/device-classification.ts. Given no device facts at all it
 * answered US Class I — "general controls ... are sufficient" — and EU MDR
 * Class I — "self-certification ... (no notified body)": each branch fell
 * through to the lowest class. classifyDevice is deleted. The tool is now
 * classify_device under a second name: the canonical definition and the
 * canonical handler, so the engine that answers it is
 * server/services/market-specs/device-classification.ts (classifyMdr,
 * classifyIvdr, recommendFdaPathway).
 */
import { describe, expect, it } from 'vitest';
// Importing the executor registers every handler as an import side effect.
import { getToolHandler } from '../../ana/AnaToolExecutor';
import { MEDICAL_DEVICE_TOOLS } from '../../ana/medicalDeviceTools';
import { CLASSIFY_DEVICE as CANONICAL_CLASSIFY_DEVICE } from '../../ana/submission-center-tool-defs';
import { classifyIvdr, classifyMdr, MDR_MISSING_INVASIVE } from '../../market-specs/device-classification';
import * as knowledge from '../medical-device-knowledge';

/** What the tool answers: the canonical envelope, or (before 2026-10-15) a classifyDevice result. */
interface ToolReply {
  ok?: boolean;
  error?: string;
  framework?: string;
  class?: string | null;
  ruleApplied?: string;
  missingFacts?: string[];
  result?: { usClass?: string; euMdrClass?: string };
}

async function classifyMedicalDevice(input: Record<string, unknown>): Promise<ToolReply> {
  const handler = getToolHandler('classify_medical_device');
  expect(handler, 'classify_medical_device has a handler').toBeTypeOf('function');
  return JSON.parse(await handler!(input, { organizationId: 1, userId: 1 } as never)) as ToolReply;
}

describe('classify_medical_device', () => {
  it('states no class when it is given no device facts', async () => {
    const out = await classifyMedicalDevice({});
    expect(out.result?.usClass, 'a US class stated from no device facts').toBeUndefined();
    expect(out.result?.euMdrClass, 'an EU MDR class stated from no device facts').toBeUndefined();
    expect(out.error).toMatch(/framework must be one of: mdr, ivdr, fda/);
  });

  it('answers an empty MDR fact set with class null and the fact that decides it', async () => {
    const out = await classifyMedicalDevice({ framework: 'mdr', facts: {} });
    expect(out).toMatchObject({ ok: true, framework: 'mdr', class: null, ruleApplied: 'not determined' });
    expect(out.missingFacts).toContain(MDR_MISSING_INVASIVE);
  });

  it('answers exactly what the canonical engine answers', async () => {
    const mdrFacts = { invasive: false, injuredSkinOrMucosaContact: 'mechanical_barrier' } as const;
    expect(await classifyMedicalDevice({ framework: 'mdr', facts: mdrFacts })).toEqual({
      ok: true, framework: 'mdr', ...JSON.parse(JSON.stringify(classifyMdr(mdrFacts))),
    });
    const ivdrFacts = { companionDiagnostic: true } as const;
    expect(await classifyMedicalDevice({ framework: 'ivdr', facts: ivdrFacts })).toEqual({
      ok: true, framework: 'ivdr', ...JSON.parse(JSON.stringify(classifyIvdr(ivdrFacts))),
    });
  });

  it('refuses the old free-form inputs instead of reading a class out of a risk level', async () => {
    const out = await classifyMedicalDevice({ intendedUse: 'wound dressing', riskLevel: 'low' });
    expect(out.error).toMatch(/framework must be one of/);
    expect(out).not.toHaveProperty('class');
    expect(out).not.toHaveProperty('result');
  });

  it('is offered to the model with the canonical definition', () => {
    const def = MEDICAL_DEVICE_TOOLS.find((t) => t.name === 'classify_medical_device');
    expect(def?.input_schema).toEqual(CANONICAL_CLASSIFY_DEVICE.input_schema);
    expect(def?.description).toBe(CANONICAL_CLASSIFY_DEVICE.description);
  });

  it('has no second classification engine behind it', () => {
    expect(Object.keys(knowledge)).not.toContain('classifyDevice');
  });
});
