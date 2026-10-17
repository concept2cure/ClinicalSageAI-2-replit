/** The package screen may disclose CSR source readiness without admitting standalone builders. */
import { describe, expect, it } from 'vitest';
import { buildPrefixMap, modulesForPath, NEVER_GATED } from '../api-prefix-map';
import { launchScopeApiVerdict } from '../launch-scope-api';

const prefixMap = buildPrefixMap();

describe('CSR readiness launch attribution', () => {
  it('authorizes the package screen readiness read through its own module', () => {
    const path = '/api/submission-orchestrator/csr/readiness';
    expect(modulesForPath(path, prefixMap)).toEqual(new Set(['ectd-compile']));
    expect(launchScopeApiVerdict(path, prefixMap, NEVER_GATED)).toBe('launch');
  });

  it.each([
    '/api/submission-orchestrator/csr/tabulate',
    '/api/submission-orchestrator/csr/draft-narrative',
    '/api/submission-orchestrator/m2/clinical',
    '/api/submission-orchestrator/m2/nonclinical',
    '/api/submission-orchestrator/validate/hardened',
    '/api/submission-orchestrator/csr/readiness-unrelated',
  ])('continues refusing the unrelated builder path %s', (path) => {
    expect(launchScopeApiVerdict(path, prefixMap, NEVER_GATED)).not.toBe('launch');
  });
});
