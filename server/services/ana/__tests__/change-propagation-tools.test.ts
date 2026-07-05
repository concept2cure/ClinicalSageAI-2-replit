/**
 * Change-propagation AnA tool definitions — contract lock.
 * Asserts the tool set is well-formed and that the governed mutation requires a
 * reason, so the conversational surface can't be widened by accident.
 */

import { describe, it, expect } from 'vitest';

import {
  CHANGE_PROPAGATION_TOOLS,
  APPLY_FACT_CHANGE,
  PREVIEW_FACT_IMPACT,
  LIST_GOVERNED_FACTS,
  TRACE_FACT_TO_SOURCE,
  EXPLAIN_RESOLUTION_PLAN,
} from '../changePropagationTools';

describe('CHANGE_PROPAGATION_TOOLS', () => {
  it('exposes exactly the five governed change-propagation tools', () => {
    expect(CHANGE_PROPAGATION_TOOLS.map(t => t.name).sort()).toEqual([
      'apply_fact_change',
      'explain_resolution_plan',
      'list_governed_facts',
      'preview_fact_impact',
      'trace_fact_to_source',
    ]);
  });

  it('every tool has a description and an object input schema', () => {
    for (const tool of CHANGE_PROPAGATION_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(40);
      expect(tool.input_schema.type).toBe('object');
      expect(tool.input_schema.properties).toBeTruthy();
    }
  });

  it('the governed mutation requires factId AND a reason; the previews do not mutate', () => {
    expect(APPLY_FACT_CHANGE.input_schema.required).toEqual(['factId', 'reason']);
    // Read-only tools never require a reason.
    expect(PREVIEW_FACT_IMPACT.input_schema.required).toEqual(['factId']);
    expect(TRACE_FACT_TO_SOURCE.input_schema.required).toEqual(['factId']);
    expect(EXPLAIN_RESOLUTION_PLAN.input_schema.required).toEqual(['planId']);
    expect(LIST_GOVERNED_FACTS.input_schema.required).toEqual(['programId']);
  });

  it('preview and apply accept both a numeric and a text proposed value', () => {
    for (const tool of [PREVIEW_FACT_IMPACT, APPLY_FACT_CHANGE]) {
      const props = tool.input_schema.properties as Record<string, unknown>;
      expect(props.valueNum).toBeTruthy();
      expect(props.valueText).toBeTruthy();
    }
  });
});
