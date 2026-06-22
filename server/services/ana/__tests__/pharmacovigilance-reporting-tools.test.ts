/**
 * Pharmacovigilance reporting tools — registration + tenant/param guards.
 * The guard paths return before any DB access, so they run offline.
 */

import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

const names = ALL_ANA_TOOLS.map(t => t.name);

describe('pharmacovigilance reporting tools — registration', () => {
  it.each(['build_sae_line_listing', 'compose_e2b_icsr'])('%s is defined and has a handler', (name) => {
    expect(names).toContain(name);
    expect(typeof getToolHandler(name)).toBe('function');
  });
});

describe('tenant + input guards (fail closed, no DB access)', () => {
  it('build_sae_line_listing refuses without organization context', async () => {
    const out = JSON.parse(await getToolHandler('build_sae_line_listing')!({ from_date: '2025-01-01', to_date: '2025-12-31' }));
    expect(out.status).toBe('needs_context');
  });

  it('build_sae_line_listing requires from_date/to_date', async () => {
    const out = JSON.parse(await getToolHandler('build_sae_line_listing')!({}, { organizationId: 1, userId: 1 }));
    expect(out.status).toBe('needs_parameters');
  });

  it('build_sae_line_listing rejects invalid dates', async () => {
    const out = JSON.parse(await getToolHandler('build_sae_line_listing')!({ from_date: 'nope', to_date: 'nope' }, { organizationId: 1, userId: 1 }));
    expect(out.status).toBe('needs_parameters');
  });

  it('compose_e2b_icsr refuses without organization context', async () => {
    const out = JSON.parse(await getToolHandler('compose_e2b_icsr')!({ adverse_event_id: 'ae-1' }));
    expect(out.status).toBe('needs_context');
  });

  it('compose_e2b_icsr requires an adverse_event_id', async () => {
    const out = JSON.parse(await getToolHandler('compose_e2b_icsr')!({}, { organizationId: 1, userId: 1 }));
    expect(out.status).toBe('needs_parameters');
  });
});
