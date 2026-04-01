import {
  STANDALONE_MODULE_ROUTE_PATTERNS,
  buildProjectModulePath,
  buildLoginRedirectPath,
  parseProjectRoute,
} from '../projectModuleRoutePolicy';

describe('projectModuleRoutePolicy smoke', () => {
  it('parses base project route', () => {
    const parsed = parseProjectRoute('/concept2cure/project/acbd-123');
    expect(parsed.isProjectRoute).toBe(true);
    expect(parsed.projectId).toBe('acbd-123');
    expect(parsed.module).toBeNull();
    expect(parsed.moduleSubPath).toBeNull();
  });

  it('parses supported module route and nested subpath', () => {
    const parsed = parseProjectRoute('/concept2cure/project/acbd-123/cer/section/foo');
    expect(parsed.isProjectRoute).toBe(true);
    expect(parsed.projectId).toBe('acbd-123');
    expect(parsed.module).toBe('cer');
    expect(parsed.moduleSubPath).toBe('section/foo');
  });

  it('returns non-project for unrelated paths', () => {
    const parsed = parseProjectRoute('/client-portal/analytics');
    expect(parsed.isProjectRoute).toBe(false);
    expect(parsed.projectId).toBeNull();
    expect(parsed.module).toBeNull();
    expect(parsed.moduleSubPath).toBeNull();
  });

  it('builds login return path with normalized pathname', () => {
    const redirect = buildLoginRedirectPath('/concept2cure/project/p1/510k?tab=predicates#foo');
    expect(redirect).toBe(
      '/concept2cure/login?returnTo=%2Fconcept2cure%2Fproject%2Fp1%2F510k'
    );
  });

  it('keeps standalone route pattern set stable and valid', () => {
    expect(STANDALONE_MODULE_ROUTE_PATTERNS.length).toBe(12);
    for (const pattern of STANDALONE_MODULE_ROUTE_PATTERNS) {
      expect(pattern.startsWith('/concept2cure/project/')).toBe(true);
      expect(pattern.includes(':projectId')).toBe(true);
    }
  });

  it('builds project module navigation paths for supported modules', () => {
    expect(buildProjectModulePath('p-88', 'cer')).toBe('/concept2cure/project/p-88/cer');
    expect(buildProjectModulePath(14, 'cmc')).toBe('/concept2cure/project/14/cmc');
    expect(buildProjectModulePath('p-88', 'vault')).toBeNull();
  });
});
