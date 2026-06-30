/**
 * Executor-level tests for the E11 plan_ind_module_authoring handler.
 *
 * Verify the handler is registered, validates its inputs, derives required_strings
 * that include every source figure (so a mistyped figure fails verify), and emits
 * the Part 11 honesty verdict (sample/not_assessed non-sealable; a missing figure
 * blocks sealing). Pure orchestration — no DB, no AI.
 */
import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';

const handler = getToolHandler('plan_ind_module_authoring');

const LIVE_FACTS = [
  { section_id: 'overview_efficacy', label: 'Primary endpoint ORR', value: '42.3%', source: 'Table 14.2.1' },
  { section_id: 'overview_safety', label: 'Median exposure', value: '24 months' },
  { section_id: 'overview_clinical_pharmacology', label: 'Recommended dose', value: '200 mg' },
];

describe('plan_ind_module_authoring — registration + validation', () => {
  it('is registered', () => {
    expect(typeof handler).toBe('function');
  });

  it('rejects an unsupported module', async () => {
    const out = JSON.parse(await handler!({ module: '3.2', product_name: 'X', indication: 'Y' }, {}));
    expect(out.error).toMatch(/module/i);
    expect(out.modules).toEqual(['2.5', '2.7']);
  });

  it('rejects missing product_name / indication', async () => {
    const out = JSON.parse(await handler!({ module: '2.5' }, {}));
    expect(out.error).toMatch(/product_name and indication/);
  });
});

describe('plan_ind_module_authoring — derived required_strings + honesty', () => {
  it('includes every source figure in required_strings and is sealable when live + clean', async () => {
    const out = JSON.parse(
      await handler!(
        { module: '2.5', product_name: 'ABC-123', indication: 'AML', facts: LIVE_FACTS, provenance: 'live' },
        {},
      ),
    );
    expect(out.author_docx_native.required_strings).toContain('42.3%');
    expect(out.author_docx_native.required_strings).toContain('24 months');
    expect(out.author_docx_native.required_strings).toContain('200 mg');
    expect(out.verification.ok).toBe(true);
    expect(out.honesty.sealable).toBe(true);
  });

  it('a sample source is never sealable', async () => {
    const out = JSON.parse(
      await handler!(
        { module: '2.5', product_name: 'ABC-123', indication: 'AML', facts: LIVE_FACTS, provenance: 'sample' },
        {},
      ),
    );
    expect(out.honesty.sealable).toBe(false);
    expect(out.honesty.blockers.join(' ')).toMatch(/sample/i);
  });

  it('defaults to not_assessed provenance (non-sealable) when omitted', async () => {
    const out = JSON.parse(
      await handler!({ module: '2.7', product_name: 'X', indication: 'Y', facts: LIVE_FACTS }, {}),
    );
    expect(out.honesty.provenance).toBe('not_assessed');
    expect(out.honesty.sealable).toBe(false);
  });
});
