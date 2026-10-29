/**
 * The pivotal declarations are served at launch; the CSR workflow board is
 * not (D5, 2026-10-29).
 *
 * The declaration route was built under /api/csr-workflow, which only the
 * regulatory workspace claims, and that surface left the launch catalog on
 * 2026-10-08. So in production (launch scope enforced) every read and write of
 * a declaration was refused, and the panel sat on the CSR workflow board, which
 * is not a launch surface either. The panel is now on the Submission Center's
 * CSR card, and eCTD Compile claims exactly this endpoint. The board stays where
 * it was: out of scope, and its reach is the CSR end-to-end lane's.
 */
import { describe, expect, it } from 'vitest';
import { buildPrefixMap, NEVER_GATED } from '../api-prefix-map';
import { launchScopeApiVerdict } from '../launch-scope-api';

const prefixMap = buildPrefixMap();
const verdict = (p: string) => launchScopeApiVerdict(p, prefixMap, NEVER_GATED);

describe('launch scope for the CSR workflow paths', () => {
  it('serves the pivotal declarations at launch, read and write', () => {
    expect(verdict('/api/csr-workflow/pivotal')).toBe('launch');
    expect(verdict('/api/csr-workflow/pivotal?programId=11111111-2222-4333-8444-000000000011')).toBe('launch');
  });

  it('does not widen to the rest of /api/csr-workflow', () => {
    expect(verdict('/api/csr-workflow/board')).toBe('out-of-scope');
    expect(verdict('/api/csr-workflow')).toBe('out-of-scope');
    expect(verdict('/api/csr-workflow/pivotalx')).toBe('out-of-scope');
  });
});
