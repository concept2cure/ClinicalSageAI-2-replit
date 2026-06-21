/**
 * Tests the read-only license-status tool: it is registered + reachable, and it
 * refuses to act without an organization context (no DB needed for that path).
 */
import { describe, it, expect } from 'vitest';

import { getToolHandler } from '../AnaToolExecutor';
import { LICENSE_STATUS_TOOLS } from '../licenseStatusTools';

describe('license-status tool', () => {
  it('is registered and reachable', () => {
    for (const t of LICENSE_STATUS_TOOLS) {
      expect(getToolHandler(t.name), t.name).toBeTruthy();
    }
    expect(LICENSE_STATUS_TOOLS).toHaveLength(1);
  });

  it('takes no model input (org comes from context only)', () => {
    expect(LICENSE_STATUS_TOOLS[0].input_schema.properties).toEqual({});
  });

  it('refuses without an organization context', async () => {
    const handler = getToolHandler('get_usage_and_license_status');
    const out = (await handler!({}, {} as any)) as string;
    expect(out).toMatch(/organization context is required/i);
  });
});
