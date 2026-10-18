/**
 * classify_device says an FDA pathway can be undetermined (2026-10-15).
 *
 * Since 142a52bb4 recommendFdaPathway answers `pathway: 'undetermined'` with
 * missingFacts when the facts that decide the pathway are unstated. The tool
 * description still said only that `framework: 'fda'` "recommends a pathway
 * (exempt/510k/de_novo/pma)", and its one undetermined clause spoke of "class is
 * null" — which an FDA answer never carries — so nothing told AnA that an FDA
 * answer may state no pathway at all.
 */
import { describe, expect, it } from 'vitest';
import { CLASSIFY_DEVICE } from '../submission-center-tool-defs';

// The provider trims tool descriptions here (server/services/ai-gateway/gateway.ts, not exported).
const OPENAI_MAX_TOOL_DESCRIPTION_CHARS = 1024;

describe('classify_device describes an FDA pathway the engine could not determine', () => {
  it("says the fda pathway is 'undetermined' with missingFacts, and that no pathway is then stated", () => {
    expect(CLASSIFY_DEVICE.description).toMatch(/`framework: 'fda'`[^`]*pathway is 'undetermined' with missingFacts/);
    expect(CLASSIFY_DEVICE.description).toMatch(/never state a pathway/i);
  });

  it('still fits under the provider description trim', () => {
    expect(CLASSIFY_DEVICE.description.length).toBeLessThanOrEqual(OPENAI_MAX_TOOL_DESCRIPTION_CHARS);
  });
});
