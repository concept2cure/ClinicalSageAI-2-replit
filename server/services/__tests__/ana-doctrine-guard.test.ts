/**
 * Doctrine guard for AnA's behavioral charter.
 *
 * AnA's reliability in a regulated setting rests on a set of NON-NEGOTIABLE
 * behaviors baked into her core persona. A refactor that silently drops one of
 * these would erode trust without any test failing — so this is a static-text
 * regression guard (the same pattern as audit-chain-wiring.test.ts) asserting
 * each doctrine is present in the core prompt and survives into the assembled
 * system prompt. If you intentionally reword a doctrine, update its assertion
 * here rather than deleting it.
 */

import { describe, it, expect } from 'vitest';
import { getCorePrompt, buildAnaRISystemPrompt } from '../ana-ri/persona.js';

const CORE_DOCTRINES: Array<[string, RegExp]> = [
  ['evidence labels', /\[KNOWN\][\s\S]*\[INFERRED\][\s\S]*\[MISSING\]/],
  ['no fabrication', /never fabricate/i],
  ['constructive dissent', /Constructive Dissent/],
  ['context clarity (no hallucinated context)', /Context Clarity Protocol/],
  ['document consequence', /DOCUMENT CONSEQUENCE/],
  ['proactive foresight', /Proactive Foresight/],
  ['know your limits / hand off', /Know your limits and hand off/],
  ['response grounding mode', /Response Grounding Mode/],
];

describe('AnA core persona — doctrine guard', () => {
  const core = getCorePrompt();

  it.each(CORE_DOCTRINES)('core prompt retains the "%s" doctrine', (_label, pattern) => {
    expect(pattern.test(core)).toBe(true);
  });

  it('keeps the serious-room floor (no exclamation marks, no emoji where it counts)', () => {
    // The floor is stated once, in ANA_PERSONALITY_CORE, which every assembled
    // prompt composes (WJ 2026-09-21: one tone section). Since 2026-10-01 she
    // may be playful in a light moment; the floor holds in the serious rooms —
    // the record, safety, bad news, a person under strain. Assert on the
    // assembled prompt.
    const assembled = buildAnaRISystemPrompt();
    expect(assembled).toMatch(/no cheerleading/i);
    expect(assembled).toMatch(/play goes: no jokes, no whimsy, no exclamation marks, no emoji/i);
  });

  it('every core doctrine survives into the assembled system prompt', () => {
    const prompt = buildAnaRISystemPrompt({ userRole: 'ra_lead' });
    for (const [, pattern] of CORE_DOCTRINES) {
      expect(pattern.test(prompt)).toBe(true);
    }
  });
});
