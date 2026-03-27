export type ProjectModuleKey = '510k' | 'pma' | 'cer' | 'ind' | 'ectd' | 'cmc';

const PROJECT_ROUTE_PREFIX = '/concept2cure/project/';
const SUPPORTED_PROJECT_MODULES: ProjectModuleKey[] = ['510k', 'pma', 'cer', 'ind', 'ectd', 'cmc'];

export interface ParsedProjectRoute {
  pathname: string;
  isProjectRoute: boolean;
  projectId: string | null;
  module: ProjectModuleKey | null;
  moduleSubPath: string | null;
}

export interface ProjectModuleRoutePolicy extends ParsedProjectRoute {
  embedModulesInShell: boolean;
  isSupportedModuleRoute: boolean;
  shouldRenderInShell: boolean;
  shouldRenderStandalone: boolean;
}

export const STANDALONE_MODULE_ROUTE_PATTERNS: ReadonlyArray<string> = [
  '/concept2cure/project/:projectId/510k',
  '/concept2cure/project/:projectId/510k/:rest*',
  '/concept2cure/project/:projectId/pma',
  '/concept2cure/project/:projectId/pma/:rest*',
  '/concept2cure/project/:projectId/cer',
  '/concept2cure/project/:projectId/cer/:rest*',
  '/concept2cure/project/:projectId/ind',
  '/concept2cure/project/:projectId/ind/:rest*',
  '/concept2cure/project/:projectId/ectd',
  '/concept2cure/project/:projectId/ectd/:rest*',
  '/concept2cure/project/:projectId/cmc',
  '/concept2cure/project/:projectId/cmc/:rest*',
] as const;

const normalizePathname = (rawPathname: string): string => {
  const withoutQuery = rawPathname.split('?')[0]?.split('#')[0] ?? '';
  return withoutQuery || '/';
};

export const parseProjectRoute = (rawPathname: string): ParsedProjectRoute => {
  const pathname = normalizePathname(rawPathname);

  if (!pathname.startsWith(PROJECT_ROUTE_PREFIX)) {
    return {
      pathname,
      isProjectRoute: false,
      projectId: null,
      module: null,
      moduleSubPath: null,
    };
  }

  const afterPrefix = pathname.slice(PROJECT_ROUTE_PREFIX.length);
  const [projectId, ...restParts] = afterPrefix.split('/').filter(Boolean);

  if (!projectId) {
    return {
      pathname,
      isProjectRoute: false,
      projectId: null,
      module: null,
      moduleSubPath: null,
    };
  }

  const moduleCandidate = restParts[0] ?? null;
  const module = SUPPORTED_PROJECT_MODULES.includes(moduleCandidate as ProjectModuleKey)
    ? (moduleCandidate as ProjectModuleKey)
    : null;

  return {
    pathname,
    isProjectRoute: true,
    projectId,
    module,
    moduleSubPath: module ? restParts.slice(1).join('/') || null : null,
  };
};

export const getProjectModuleRoutePolicy = (
  rawPathname: string,
  embedModulesInShell: boolean
): ProjectModuleRoutePolicy => {
  const parsed = parseProjectRoute(rawPathname);
  const isSupportedModuleRoute = parsed.module !== null;

  return {
    ...parsed,
    embedModulesInShell,
    isSupportedModuleRoute,
    shouldRenderInShell: isSupportedModuleRoute && embedModulesInShell,
    shouldRenderStandalone: isSupportedModuleRoute && !embedModulesInShell,
  };
};

export const buildLoginRedirectPath = (currentPath: string): string => {
  const returnTo = encodeURIComponent(normalizePathname(currentPath));
  return `/concept2cure/login?returnTo=${returnTo}`;
};

