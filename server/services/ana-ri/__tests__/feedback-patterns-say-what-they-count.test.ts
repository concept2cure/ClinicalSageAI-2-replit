/**
 * The USER FEEDBACK PATTERNS block says what its per-type figure counts.
 *
 * For each repeatedly dismissed recommendation type it printed "(acceptance
 * rate: N%)", with N = (all feedback actions - this type's dismissals) / all
 * feedback actions: the share of every action, on every recommendation type,
 * that was not a dismissal of this one. That is no acceptance rate. Ten actions
 * with three evidence_gap dismissals and nothing accepted anywhere read
 * "acceptance rate: 70%". The block now states the counts it has.
 */
import { describe, expect, it } from 'vitest';

import { orchestrate } from '../orchestrator.js';

describe('USER FEEDBACK PATTERNS', () => {
  it('states each dismissed type as a count of the feedback actions read, not as an acceptance rate', () => {
    const prompt = orchestrate({
      message: 'What should I fix next?',
      _feedbackContext: {
        totalFeedback: 10,
        acceptanceRate: 0, // nothing accepted or resolved
        topDismissedTypes: [
          { type: 'evidence_gap', count: 3 },
          { type: 'risk_mitigation', count: 2 },
        ],
      },
    }).systemPrompt;

    expect(prompt).toContain('## USER FEEDBACK PATTERNS');
    expect(prompt).not.toMatch(/acceptance rate/i);
    expect(prompt).not.toContain('70%');
    expect(prompt).toContain('- evidence_gap: dismissed 3 of the last 10 recommendation feedback actions recorded for this project');
    expect(prompt).toContain('- risk_mitigation: dismissed 2 of the last 10 recommendation feedback actions recorded for this project');
  });
});
