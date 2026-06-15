import { describe, it, expect } from 'vitest';
import {
  REPORT_TOOL_SPECS,
  ANA_REPORTING_GUARDRAIL,
  getToolSpec,
  validateToolArgs,
  routeIntent,
  type ReportToolName,
  type ToolSpec,
} from '../report-tools';

const EXPECTED_TOOL_NAMES: ReportToolName[] = [
  'list_report_types',
  'generate_report',
  'explain_blockers',
  'portfolio_readiness',
  'regional_gap_analysis',
  'compare_regions',
  'get_prediction',
];

/** Minimal valid argument set per tool. */
const VALID_ARGS: Record<ReportToolName, unknown> = {
  list_report_types: { scope: 'program', persona: 'regulatory-lead' },
  generate_report: {
    scope: 'submission',
    scopeId: 'sub-123',
    reportTypeId: 'submission_readiness',
    asOf: '2026-06-15T00:00:00Z',
  },
  explain_blockers: { runId: 42 },
  portfolio_readiness: { programGroupId: 7, asOf: '2026-06-15T00:00:00Z' },
  regional_gap_analysis: { scopeId: 'prj-9', market: 'FDA' },
  compare_regions: { scopeId: 'prj-9', markets: ['FDA', 'EMA'] },
  get_prediction: { scope: 'study', scopeId: 'std-5', model: 'deficiency_risk' },
};

/** Invalid/missing argument set per tool. */
const INVALID_ARGS: Record<ReportToolName, unknown> = {
  list_report_types: { scope: 'not-a-scope' },
  generate_report: { scope: 'submission', scopeId: '', reportTypeId: 'x' },
  explain_blockers: { runId: -3 },
  portfolio_readiness: { programGroupId: 'seven' },
  regional_gap_analysis: { scopeId: 'prj-9' },
  compare_regions: { scopeId: 'prj-9', markets: ['FDA'] },
  get_prediction: { scope: 'study', scopeId: 'std-5', model: 'crystal_ball' },
};

describe('REPORT_TOOL_SPECS', () => {
  it('defines exactly the seven reporting tools', () => {
    expect(REPORT_TOOL_SPECS).toHaveLength(7);
    expect(REPORT_TOOL_SPECS.map(s => s.name).sort()).toEqual(
      [...EXPECTED_TOOL_NAMES].sort(),
    );
  });

  it('has unique tool names', () => {
    const names = REPORT_TOOL_SPECS.map(s => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every spec has a non-empty name, reviewer-grade description, and a zod schema', () => {
    for (const spec of REPORT_TOOL_SPECS) {
      expect(spec.name).toBeTruthy();
      expect(typeof spec.name).toBe('string');
      expect(spec.description.length).toBeGreaterThanOrEqual(40);
      expect(spec.schema).toBeDefined();
      expect(typeof (spec.schema as { safeParse?: unknown }).safeParse).toBe('function');
    }
  });

  it('references the no-fabrication guardrail in generate_report and get_prediction', () => {
    const guarded: ToolSpec[] = REPORT_TOOL_SPECS.filter(s =>
      ['generate_report', 'get_prediction'].includes(s.name),
    );
    expect(guarded).toHaveLength(2);
    for (const spec of guarded) {
      expect(spec.description).toContain(ANA_REPORTING_GUARDRAIL);
    }
  });
});

describe('getToolSpec', () => {
  it('returns the spec for a known tool name', () => {
    const spec = getToolSpec('generate_report');
    expect(spec).toBeDefined();
    expect(spec?.name).toBe('generate_report');
  });

  it('returns undefined for an unknown tool name', () => {
    expect(getToolSpec('definitely_not_a_tool')).toBeUndefined();
  });
});

describe('validateToolArgs', () => {
  it.each(EXPECTED_TOOL_NAMES)('accepts valid args for %s', name => {
    const result = validateToolArgs(name, VALID_ARGS[name]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeTypeOf('object');
    }
  });

  it.each(EXPECTED_TOOL_NAMES)('rejects invalid/missing args for %s', name => {
    const result = validateToolArgs(name, INVALID_ARGS[name]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('rejects a missing required object entirely', () => {
    const result = validateToolArgs('generate_report', undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('returns ok:false with an error for an unknown tool name', () => {
    const result = validateToolArgs('mystery_tool' as ReportToolName, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('Unknown reporting tool');
    }
  });
});

describe('routeIntent', () => {
  it('routes a clear utterance to the matching tool', () => {
    const result = routeIntent('Can you explain why this run is blocked from final?');
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.name).toBe('explain_blockers');
      expect(result.spec.name).toBe('explain_blockers');
    }
  });

  it('returns candidates (no match) for an ambiguous or empty utterance', () => {
    const result = routeIntent('');
    expect(result.matched).toBe(false);
    if (!result.matched) {
      expect(Array.isArray(result.candidates)).toBe(true);
    }
  });
});
