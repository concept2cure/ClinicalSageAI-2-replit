/**
 * classify_device tells AnA what the engine can return (2026-10-05).
 *
 * The MDR/IVDR engine (963c2167) fails closed: unknown keys, unreadable values
 * and contradictory facts throw, and a class that a missing fact decides comes
 * back as `class: null` with `missingFacts`. A tool description that still
 * promises "→ Class I/IIa/IIb/III" invites AnA to report "Class null" or to
 * guess. These pins keep the contract and the fact vocabulary in step with the
 * engine.
 */
import { describe, expect, it } from 'vitest';
import { CLASSIFY_DEVICE } from '../submission-center-tool-defs';
import { MDR_FACT_KEYS, IVDR_FACT_KEYS } from '../../market-specs/device-classification';

// The provider trims tool descriptions here (server/services/ai-gateway/gateway.ts, not exported).
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

const factsDescription = (CLASSIFY_DEVICE.input_schema as unknown as { properties: { facts: { description: string } } }).properties.facts.description;

describe('classify_device describes a class the engine could not determine', () => {
  it('says class may be null with missingFacts, and that no class is then stated', () => {
    expect(CLASSIFY_DEVICE.description).toMatch(/class is null/i);
    expect(CLASSIFY_DEVICE.description).toMatch(/missingFacts/);
    expect(CLASSIFY_DEVICE.description).toMatch(/never state a class/i);
  });

  it('says unknown keys, unreadable values and contradictions are refused', () => {
    expect(CLASSIFY_DEVICE.description).toMatch(/unknown fact keys/i);
    expect(CLASSIFY_DEVICE.description).toMatch(/contradict/i);
  });

  it('lists every fact key the MDR and IVDR engines read', () => {
    for (const k of MDR_FACT_KEYS) expect(factsDescription, `MDR key ${k}`).toContain(k);
    for (const k of IVDR_FACT_KEYS) expect(factsDescription, `IVDR key ${k}`).toContain(k);
  });

  it('fits under the provider description trim', () => {
    expect(CLASSIFY_DEVICE.description.length).toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
  });
});
