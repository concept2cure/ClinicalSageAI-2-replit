/**
 * Smoke tests for the get_csr_template ANA tool handler (Module 5 / CSR scaffolds).
 *
 * The underlying template library is pure (no DB, no network), so these exercise
 * the full wiring offline: tool registration, list behaviour, a specific fetch,
 * and the not-found path.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

describe('get_csr_template tool definition', () => {
  it('is registered in ALL_ANA_TOOLS', () => {
    expect(ALL_ANA_TOOLS.some(t => t.name === 'get_csr_template')).toBe(true);
  });
});

describe('get_csr_template handler', () => {
  it('lists templates when no key is given', async () => {
    const handler = getToolHandler('get_csr_template')!;
    const out = JSON.parse(await handler({}));
    expect(out.status).toBe('list');
    expect(out.templates.length).toBeGreaterThanOrEqual(5);
  });

  it('returns the full CSR by granule id', async () => {
    const handler = getToolHandler('get_csr_template')!;
    const out = JSON.parse(await handler({ template: 'm5-3-5-1-csr' }));
    expect(out.status).toBe('template');
    expect(out.sectionCode).toBe('5.3.5.1');
    expect(out.content).toMatch(/12\. SAFETY EVALUATION/);
  });

  it('returns a template by section code', async () => {
    const handler = getToolHandler('get_csr_template')!;
    const out = JSON.parse(await handler({ template: '5.3.5.3' }));
    expect(out.status).toBe('template');
    expect(out.sectionCode).toBe('5.3.5.3');
  });

  it('reports not_found with the available list for an unknown key', async () => {
    const handler = getToolHandler('get_csr_template')!;
    const out = JSON.parse(await handler({ template: 'does-not-exist' }));
    expect(out.status).toBe('not_found');
    expect(Array.isArray(out.available)).toBe(true);
  });
});
