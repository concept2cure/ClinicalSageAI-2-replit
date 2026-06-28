import { describe, it, expect } from 'vitest';
import { getToolHandler } from '../AnaToolExecutor.js';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';

// Network path is not exercised in unit tests (external API); only the offline
// guard (registration + input validation) is asserted.
describe('lookup_published_label tool', () => {
  it('is defined and registered', () => {
    expect(ALL_ANA_TOOLS.map(t => t.name)).toContain('lookup_published_label');
    expect(typeof getToolHandler('lookup_published_label')).toBe('function');
  });

  it('requires a drug_name (offline guard)', async () => {
    const out = JSON.parse(await getToolHandler('lookup_published_label')!({}));
    expect(out.status).toBe('needs_parameters');
  });
});
