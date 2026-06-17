/**
 * Tests for describeToolPlan — the human-readable narration labels surfaced
 * in the stream's tool_use / tool_result events (and the tool trace). Pure.
 */

import { describe, it, expect } from 'vitest';
import { describeToolPlan } from '../agentic-loop.js';

describe('describeToolPlan', () => {
  it('gives friendly, calm labels to the proactive / evidence tools', () => {
    const plan = describeToolPlan([
      { id: '1', name: 'regulatory_deadline_radar', input: {} },
      { id: '2', name: 'scan_project_risks', input: {} },
      { id: '3', name: 'detect_evidence_contradictions', input: {} },
      { id: '4', name: 'get_session_briefing', input: {} },
    ]);
    expect(plan.map(p => p.label)).toEqual([
      'Scanning regulatory deadlines',
      'Scanning open project risks',
      'Checking the evidence for contradictions',
      'Reconciling where your program stands',
    ]);
    // Each step echoes its tool name so the client can correlate with events.
    expect(plan.map(p => p.tool)).toEqual([
      'regulatory_deadline_radar',
      'scan_project_risks',
      'detect_evidence_contradictions',
      'get_session_briefing',
    ]);
  });

  it('interpolates input into parameterized labels', () => {
    const [d] = describeToolPlan([
      { id: '1', name: 'lookup_submission_deficiencies', input: { submission_type: 'nda' } },
    ]);
    expect(d.label).toBe('Looking up likely submission deficiencies for Nda');
  });

  it('falls back to a humanized name for unlabeled tools (never raw snake_case)', () => {
    const [d] = describeToolPlan([{ id: '1', name: 'some_unmapped_tool', input: {} }]);
    expect(d.label).toBe('Some unmapped tool');
  });
});
