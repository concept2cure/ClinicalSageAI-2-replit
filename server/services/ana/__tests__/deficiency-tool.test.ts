/**
 * Tests for the lookup_submission_deficiencies ANA tool handler.
 *
 * The underlying deficiency taxonomy is pure (no DB, no network), so these
 * exercise the full wiring offline: registration, a real lookup, the
 * critical-only filter, and the invalid-input (structured error) path.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

describe('lookup_submission_deficiencies tool definition', () => {
  it('is registered in ALL_ANA_TOOLS', () => {
    expect(ALL_ANA_TOOLS.some(t => t.name === 'lookup_submission_deficiencies')).toBe(true);
  });
});

describe('lookup_submission_deficiencies handler', () => {
  it('returns deficiencies for a valid submission type with mitigations + references', async () => {
    const handler = getToolHandler('lookup_submission_deficiencies')!;
    const out = JSON.parse(await handler({ submission_type: 'ind' }));
    expect(out.source).toBe('AnA Deficiency Taxonomy');
    expect(out.submission_type).toBe('ind');
    expect(out.count).toBeGreaterThan(0);
    expect(out.deficiencies.length).toBe(out.count);
    for (const d of out.deficiencies) {
      expect(typeof d.title).toBe('string');
      expect(typeof d.severity).toBe('string');
      expect(Array.isArray(d.mitigations)).toBe(true);
      expect(Array.isArray(d.references)).toBe(true);
    }
  });

  it('critical_only returns only critical-severity deficiencies', async () => {
    const handler = getToolHandler('lookup_submission_deficiencies')!;
    const out = JSON.parse(await handler({ submission_type: 'nda', critical_only: true }));
    expect(out.critical_only).toBe(true);
    for (const d of out.deficiencies) {
      expect(d.severity).toBe('critical');
    }
  });

  it('normalizes case and is a subset relationship (critical ⊆ all)', async () => {
    const handler = getToolHandler('lookup_submission_deficiencies')!;
    const all = JSON.parse(await handler({ submission_type: 'NDA' }));
    const crit = JSON.parse(await handler({ submission_type: 'nda', critical_only: true }));
    expect(all.submission_type).toBe('nda'); // lowercased
    expect(crit.count).toBeLessThanOrEqual(all.count);
  });

  it('returns a structured error (not a throw) for an invalid submission type', async () => {
    const handler = getToolHandler('lookup_submission_deficiencies')!;
    const out = JSON.parse(await handler({ submission_type: 'banana' }));
    expect(out.error).toMatch(/submission_type must be one of/);
  });
});
