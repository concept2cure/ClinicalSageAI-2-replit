// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { computeRedirect } from '../../client/src/concept2cure/auth/redirectUtils';
import {
  buildLoginRedirectPath,
  getProjectModuleRoutePolicy,
  parseProjectRoute,
} from '../../client/src/concept2cure/router/projectModuleRoutePolicy';

describe('project module route policy', () => {
  it('routes project 510k exact path into ZenApp shell when embedding is enabled', () => {
    const policy = getProjectModuleRoutePolicy('/concept2cure/project/proj-1/510k', true);
    expect(policy.projectId).toBe('proj-1');
    expect(policy.module).toBe('510k');
    expect(policy.shouldRenderInShell).toBe(true);
    expect(policy.shouldRenderStandalone).toBe(false);
  });

  it('routes project 510k exact and nested paths to standalone when embedding is disabled', () => {
    const exact = getProjectModuleRoutePolicy('/concept2cure/project/proj-1/510k', false);
    const nested = getProjectModuleRoutePolicy('/concept2cure/project/proj-1/510k/section/11', false);

    expect(exact.shouldRenderStandalone).toBe(true);
    expect(exact.shouldRenderInShell).toBe(false);
    expect(nested.shouldRenderStandalone).toBe(true);
    expect(nested.moduleSubPath).toBe('section/11');
  });

  it('routes project PMA exact and nested paths to standalone when embedding is disabled', () => {
    const exact = getProjectModuleRoutePolicy('/concept2cure/project/proj-2/pma', false);
    const nested = getProjectModuleRoutePolicy('/concept2cure/project/proj-2/pma/review/risk', false);

    expect(exact.module).toBe('pma');
    expect(exact.shouldRenderStandalone).toBe(true);
    expect(nested.module).toBe('pma');
    expect(nested.moduleSubPath).toBe('review/risk');
    expect(nested.shouldRenderStandalone).toBe(true);
  });

  it('preserves projectId for deep nested module paths', () => {
    const parsed = parseProjectRoute('/concept2cure/project/deep-project-id-42/510k/foo/bar/baz');
    expect(parsed.projectId).toBe('deep-project-id-42');
    expect(parsed.module).toBe('510k');
    expect(parsed.moduleSubPath).toBe('foo/bar/baz');
  });

  it('builds login redirect with returnTo and preserves route intent contract post-login', () => {
    const loginPath = buildLoginRedirectPath('/concept2cure/project/proj-77/510k/section/12');
    expect(loginPath).toBe(
      '/concept2cure/login?returnTo=%2Fconcept2cure%2Fproject%2Fproj-77%2F510k%2Fsection%2F12'
    );

    const preservedDestination = computeRedirect(
      '?returnTo=%2Fconcept2cure%2Fproject%2Fproj-77%2F510k%2Fsection%2F12'
    );
    expect(preservedDestination).toBe('/concept2cure/project/proj-77/510k/section/12');
  });

  it('extracts ownership preferences API path from project route id', () => {
    const parsed = parseProjectRoute('/concept2cure/project/proj_123');
    expect(parsed.projectId).toBe('proj_123');
    const ownershipPatchPath = `/api/concept2cure/projects/${parsed.projectId}/ownership-preferences`;
    expect(ownershipPatchPath).toBe('/api/concept2cure/projects/proj_123/ownership-preferences');
  });
});

