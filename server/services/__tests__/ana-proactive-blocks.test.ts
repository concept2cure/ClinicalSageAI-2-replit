/**
 * Verifies the orchestrator injects the pre-fetched proactive blocks
 * (deadline radar + session briefing) into the assembled system prompt, and
 * that empty/absent blocks are a no-op. DB-free — the blocks are passed in.
 */

import { describe, it, expect } from 'vitest';
import { orchestrate } from '../ana-ri/orchestrator.js';

describe('orchestrator proactive block injection', () => {
  it('injects the deadline radar block when provided', () => {
    const block = '<regulatory_deadlines>OVERDUE (1):\n- [FDA] PMR (3d overdue)</regulatory_deadlines>';
    const result = orchestrate({ message: 'hi', _deadlineRadarBlock: block });
    expect(result.systemPrompt).toContain('<regulatory_deadlines>');
    expect(result.systemPrompt).toContain('[FDA] PMR');
  });

  it('injects the session briefing block when provided', () => {
    const block = '<session_briefing>Deadlines: 1 overdue.\nRecent decisions (1):\n- [approved] X</session_briefing>';
    const result = orchestrate({ message: 'hi', _sessionBriefingBlock: block });
    expect(result.systemPrompt).toContain('<session_briefing>');
    expect(result.systemPrompt).toContain('Recent decisions (1):');
  });

  it('is a no-op when the blocks are empty', () => {
    const without = orchestrate({ message: 'hi' });
    const withEmpty = orchestrate({ message: 'hi', _deadlineRadarBlock: '', _sessionBriefingBlock: '' });
    expect(withEmpty.systemPrompt).toBe(without.systemPrompt);
    expect(withEmpty.systemPrompt).not.toContain('<regulatory_deadlines>');
    expect(withEmpty.systemPrompt).not.toContain('<session_briefing>');
  });
});
