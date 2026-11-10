/**
 * P-122 (2026-11-10): Quality's figure line reads GET /api/mdx/qms/readiness, the server's quality-system counts.
 * The route had no caller from 4aa204390 until then, and the launch scope refused it as dead (LAUNCH_EXCLUDED_API).
 * Quality, a launch surface, now calls it, so production serves it under Quality's claim on /api/mdx/qms, behind the
 * same checks as every other Quality read (the request's RLS executor, organization_id = the caller's). The other
 * reads the line makes were already served; this holds all four to it.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../module-grants.js', () => ({ writeModuleGrant: vi.fn() }));
vi.mock('../../license-manager.js', () => ({ getLicenseInfo: vi.fn(), getModuleCatalog: vi.fn() }));
vi.mock('../../../db', () => ({ query: vi.fn() }));
vi.mock('../../../utils/logger.js', () => ({ createScopedLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }) }));

import { buildPrefixMap, modulesForPath, NEVER_GATED } from '../api-prefix-map';
import { LAUNCH_EXCLUDED_API, launchScopeApiVerdict } from '../launch-scope-api';

const prefixMap = buildPrefixMap();
const verdict = (path: string) => launchScopeApiVerdict(path, prefixMap, NEVER_GATED);

describe("Quality's figure line is served in production", () => {
  it('serves the QMS readiness read under Quality, no longer excluded as dead', () => {
    expect(Object.keys(LAUNCH_EXCLUDED_API)).not.toContain('/api/mdx/qms/readiness');
    expect(verdict('/api/mdx/qms/readiness')).toBe('launch');
    expect(modulesForPath('/api/mdx/qms/readiness', prefixMap)?.has('quality')).toBe(true);
  });

  it.each([
    '/api/mdx/qms/documents/review-due',
    '/api/mdx/qms/changes/summary',
    '/api/capa-mdr/triage',
  ])('serves %s, which the line also reads', (path) => {
    expect(verdict(path)).toBe('launch');
  });
});
