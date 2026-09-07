import { describe, it, expect } from 'vitest';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const tool = (name: string) => ALL_ANA_TOOLS.find((t) => t.name === name);
const props = (name: string) =>
  (tool(name)!.input_schema as { properties?: Record<string, unknown> }).properties ?? {};
const required = (name: string) => (tool(name)!.input_schema as { required?: string[] }).required ?? [];

/**
 * Regression guard for the answer_intelligence_question schema/handler mismatch:
 * the stateless engine resumes from the full `flow_state` object, but the tool
 * schema used to advertise `flow_id`, so the model supplied an id the handler
 * ignored and every flow past the first question failed with
 * "flow_state and node_id are required".
 *
 * The interview is now persisted (services/cmc/interview-sessions): the handler
 * reads `session_id` first and falls back to `flow_state` only when no session
 * exists. The schema must declare both, require neither (one of the two is
 * enough), and still never advertise `flow_id`.
 */
describe('answer_intelligence_question schema matches its handler', () => {
  it('is defined', () => {
    expect(tool('answer_intelligence_question')).toBeTruthy();
  });

  it('declares session_id and flow_state (the handler reads both) and not flow_id', () => {
    const p = props('answer_intelligence_question');
    expect(p).toHaveProperty('session_id');
    expect(p).toHaveProperty('flow_state');
    expect(p).not.toHaveProperty('flow_id');
  });

  it('requires node_id and answers; neither session_id nor flow_state alone is required', () => {
    const r = required('answer_intelligence_question');
    expect(r).toContain('node_id');
    expect(r).toContain('answers');
    expect(r).not.toContain('flow_state');
    expect(r).not.toContain('session_id');
    expect(r).not.toContain('flow_id');
  });
});

describe('the persisted-session tools match their handlers', () => {
  it('start_intelligence_flow accepts an optional project_id to bind the session', () => {
    expect(props('start_intelligence_flow')).toHaveProperty('project_id');
    expect(required('start_intelligence_flow')).toEqual(['document_type']);
  });

  it('resume_intelligence_flow requires only the session_id', () => {
    expect(tool('resume_intelligence_flow')).toBeTruthy();
    expect(required('resume_intelligence_flow')).toEqual(['session_id']);
  });

  it('commit_intelligence_flow requires the session_id and offers project_id + dry_run', () => {
    expect(tool('commit_intelligence_flow')).toBeTruthy();
    expect(required('commit_intelligence_flow')).toEqual(['session_id']);
    const p = props('commit_intelligence_flow');
    expect(p).toHaveProperty('project_id');
    expect(p).toHaveProperty('dry_run');
  });
});
