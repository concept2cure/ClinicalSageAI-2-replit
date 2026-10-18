/**
 * compute_lifecycle_operations: a named prior sequence that was not loaded is an
 * error, not a first sequence.
 *
 * Until 2026-10-15 the handler auto-loaded the prior only when BOTH
 * prior_sequence_number and application_number were given, and the loader
 * returned [] for a named prior with nothing on file. Either way the tool
 * answered ok:true with autoLoadedPrior:0 and every desired leaf `new` — which
 * tells the agency those documents were never filed. A prior that was named and
 * not read now fails the call, naming why.
 */
import { describe, it, expect, vi } from 'vitest';

const { resolveSignerOrgRole } = vi.hoisted(() => ({
  resolveSignerOrgRole: vi.fn(async (): Promise<string | null> => 'member'),
}));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

import { getToolHandler, type ToolContext } from '../AnaToolExecutor.js';

const ctx = { organizationId: 7, userId: 3 } as ToolContext;
const desired = [{ ctd_section: '3.2.S.1', file_name: 'general.pdf', md5: 'b'.repeat(32) }];

describe('compute_lifecycle_operations with a named prior sequence', () => {
  it('fails when the prior sequence is named without its application number', async () => {
    const handler = getToolHandler('compute_lifecycle_operations')!;
    const out = JSON.parse(await handler({ prior_sequence_number: '0000', desired_leaves: desired }, ctx));
    expect(out.ok).toBeUndefined();
    expect(out.error).toMatch(/application number/i);
  });

  it('fails with PRIOR_SEQUENCE_NOT_FOUND when nothing is on file for the named sequence', async () => {
    // tests/setup.ts mocks pg: every query answers no rows.
    const handler = getToolHandler('compute_lifecycle_operations')!;
    const out = JSON.parse(
      await handler({ application_number: 'IND-123456', prior_sequence_number: '0000', desired_leaves: desired }, ctx),
    );
    expect(out.ok).toBeUndefined();
    expect(out.error).toMatch(/PRIOR_SEQUENCE_NOT_FOUND/);
  });
});
