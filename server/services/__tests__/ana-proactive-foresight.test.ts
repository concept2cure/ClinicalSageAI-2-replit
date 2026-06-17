/**
 * Guards the "Proactive Foresight" behavioral instruction in AnA's core prompt:
 * she should proactively surface regulatory deadlines and likely deficiencies
 * (via her tools), with restraint and no fabrication. A static-text guard so a
 * refactor can't silently drop the directive.
 */

import { describe, it, expect } from 'vitest';
import { getCorePrompt, buildAnaRISystemPrompt } from '../ana-ri/persona.js';

describe('AnA proactive foresight directive', () => {
  it('core prompt contains the Proactive Foresight section', () => {
    const prompt = getCorePrompt();
    expect(prompt).toContain('## Proactive Foresight');
  });

  it('directs proactive deadline + deficiency surfacing with no fabrication', () => {
    const prompt = getCorePrompt();
    expect(prompt).toMatch(/deadline radar/i);
    expect(prompt).toMatch(/deficiency taxonomy/i);
    // Restraint + honesty guardrails must travel with the directive.
    expect(prompt).toMatch(/never invent a date/i);
    expect(prompt).toMatch(/never fabricated/i);
  });

  it('the directive flows into the assembled system prompt', () => {
    const systemPrompt = buildAnaRISystemPrompt();
    expect(systemPrompt).toContain('Proactive Foresight');
  });
});
