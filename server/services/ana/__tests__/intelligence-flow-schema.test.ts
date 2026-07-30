import { describe, it, expect } from 'vitest';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

/**
 * Regression guard for the answer_intelligence_question schema/handler mismatch:
 * the stateless engine resumes from the full `flow_state` object, but the tool
 * schema used to advertise `flow_id`, so the model supplied an id the handler
 * ignored and every flow past the first question failed with
 * "flow_state and node_id are required". The schema must expose `flow_state`.
 */
describe('answer_intelligence_question schema matches its handler', () => {
  const tool = ALL_ANA_TOOLS.find((t) => t.name === 'answer_intelligence_question');

  it('is defined', () => {
    expect(tool).toBeTruthy();
  });

  it('declares flow_state (the handler reads input.flow_state) and not flow_id', () => {
    const props = (tool!.input_schema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(props).toHaveProperty('flow_state');
    expect(props).not.toHaveProperty('flow_id');
  });

  it('requires flow_state, node_id and answers', () => {
    const required = (tool!.input_schema as { required?: string[] }).required ?? [];
    expect(required).toContain('flow_state');
    expect(required).toContain('node_id');
    expect(required).toContain('answers');
    expect(required).not.toContain('flow_id');
  });
});
