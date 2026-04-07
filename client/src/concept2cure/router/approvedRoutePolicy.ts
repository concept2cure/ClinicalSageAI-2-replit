import type { ProjectModuleKey } from './projectModuleRoutePolicy';

export type RouteDisposition = 'allowed' | 'redirected' | 'hidden';

export interface ApprovedRouteDecision {
  disposition: RouteDisposition;
  normalizedPath: string;
  fallbackPath: string;
  reason: string;
  ruleId?: string;
}

export interface RoutePolicyRule {
  id: string;
  pattern: string;
  disposition: RouteDisposition;
  rationale: string;
}

const APPROVED_EXACT_ROUTES = ['/concept2cure', '/concept2cure/projects'] as const;
const APPROVED_PREFIX_ROUTES = ['/concept2cure/vault', '/concept2cure/review', '/concept2cure/setup'] as const;
const APPROVED_PROJECT_MODULES: ReadonlySet<ProjectModuleKey> = new Set(['510k', 'pma', 'cer']);
const HIDDEN_PATTERNS = ['/concept2cure/admin', '/concept2cure/internal', '/concept2cure/labs', '/concept2cure/legacy'] as const;

export const ROUTE_POLICY_TABLE: RoutePolicyRule[] = [
  ...APPROVED_EXACT_ROUTES.map(route => ({
    id: `allow-exact:${route}`,
    pattern: route,
    disposition: 'allowed' as const,
    rationale: 'Core launch-safe entry surface',
  })),
  ...APPROVED_PREFIX_ROUTES.map(route => ({
    id: `allow-prefix:${route}`,
    pattern: `${route}/*`,
    disposition: 'allowed' as const,
    rationale: 'Approved external testing workflow surface',
  })),
  ...HIDDEN_PATTERNS.map(route => ({
    id: `hidden-prefix:${route}`,
    pattern: `${route}/*`,
    disposition: 'hidden' as const,
    rationale: 'Internal-only or unfinished surface',
  })),
  {
    id: 'allow-project-modules',
    pattern: '/concept2cure/project/:projectId/{510k|pma|cer}/:rest*',
    disposition: 'allowed',
    rationale: 'Approved project module routes for external testing',
  },
  {
    id: 'redirect-non-approved-project-modules',
    pattern: '/concept2cure/project/:projectId/:module/:rest*',
    disposition: 'redirected',
    rationale: 'Non-approved project module is redirected to fallback',
  },
  {
    id: 'redirect-default',
    pattern: '*',
    disposition: 'redirected',
    rationale: 'Default deny-by-redirect for out-of-scope routes',
  },
];

export const DEFAULT_EXTERNAL_TESTING_FALLBACK = '/concept2cure';

const normalizePath = (pathname: string): string => pathname.split('?')[0]?.split('#')[0] || '/';

export const evaluateApprovedRoute = (
  pathname: string,
  opts: { externalTestingMode: boolean; projectId?: string | null }
): ApprovedRouteDecision => {
  const normalizedPath = normalizePath(pathname);
  const fallbackPath = opts.projectId ? `/concept2cure/project/${opts.projectId}` : DEFAULT_EXTERNAL_TESTING_FALLBACK;

  if (!opts.externalTestingMode) {
    return {
      disposition: 'allowed',
      normalizedPath,
      fallbackPath,
      reason: 'External testing mode disabled',
      ruleId: 'mode-disabled',
    };
  }

  const hiddenPrefix = HIDDEN_PATTERNS.find(prefix => normalizedPath.startsWith(prefix));
  if (hiddenPrefix) {
    return {
      disposition: 'hidden',
      normalizedPath,
      fallbackPath,
      reason: 'Route is internal-only for launch-safe external testing',
      ruleId: `hidden-prefix:${hiddenPrefix}`,
    };
  }

  const exactAllowed = APPROVED_EXACT_ROUTES.find(route => normalizedPath === route);
  if (exactAllowed) {
    return {
      disposition: 'allowed',
      normalizedPath,
      fallbackPath,
      reason: 'Route is on approved external testing allowlist',
      ruleId: `allow-exact:${exactAllowed}`,
    };
  }

  const prefixAllowed = APPROVED_PREFIX_ROUTES.find(
    prefix => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
  );
  if (prefixAllowed) {
    return {
      disposition: 'allowed',
      normalizedPath,
      fallbackPath,
      reason: 'Route is on approved external testing allowlist',
      ruleId: `allow-prefix:${prefixAllowed}`,
    };
  }

  const projectModuleMatch = normalizedPath.match(/^\/concept2cure\/project\/([^/]+)\/(\w+)/);
  if (projectModuleMatch) {
    const moduleKey = projectModuleMatch[2]?.toLowerCase() as ProjectModuleKey;
    if (APPROVED_PROJECT_MODULES.has(moduleKey)) {
      return {
        disposition: 'allowed',
        normalizedPath,
        fallbackPath,
        reason: `Approved project module (${moduleKey.toUpperCase()})`,
        ruleId: 'allow-project-modules',
      };
    }

    return {
      disposition: 'redirected',
      normalizedPath,
      fallbackPath,
      reason: `Module route ${moduleKey} is not in the approved external test surface`,
      ruleId: 'redirect-non-approved-project-modules',
    };
  }

  return {
    disposition: 'redirected',
    normalizedPath,
    fallbackPath,
    reason: 'Route is outside approved launch-safe surface',
    ruleId: 'redirect-default',
  };
};
