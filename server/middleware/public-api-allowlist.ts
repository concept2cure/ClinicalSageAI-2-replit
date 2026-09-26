/**
 * The /api paths served without a session — the one list.
 *
 * Moved out of authBoundary.ts (unchanged) on 2026-09-25 so that a module
 * with no I/O can read it: the launch-scope verdict
 * (services/entitlements/launch-scope-api.ts) treats every path here as
 * infrastructure. A path the boundary lets through unauthenticated is called by
 * something no screen's code shows (a browser's CSP report, a Prometheus
 * scrape, a legacy sign-in redirect), so launch scope must never refuse it.
 * authBoundary.ts re-exports both names.
 *
 * PURE. No imports.
 */

export interface AllowlistEntry {
  /** Full path as the client sends it (starts with /api). */
  path: string;
  /** 'exact' matches only the path itself; 'prefix' also matches path + '/...'. */
  match: 'exact' | 'prefix';
}

/**
 * Intentionally-public /api endpoints. Every entry needs a reason and (where
 * applicable) the alternative auth control that covers it. Derived from the
 * pre-existing gate allowlist in register-platform-routes.ts (openPrefixes)
 * plus the requireMetricsAuth-guarded observability surface. When in doubt a
 * path stays OFF this list — default deny.
 */
export const PUBLIC_API_ALLOWLIST: readonly AllowlistEntry[] = [
  // ── Auth & session management (must work unauthenticated by definition) ──
  // /api/auth covers login, signup, refresh, forgot/reset-password, MFA,
  // enterprise auth (/api/auth/enterprise) and SSO/SAML flows (/api/auth/sso).
  { path: '/api/auth', match: 'prefix' },
  // Legacy 307 redirects to /api/auth/* (register-platform-routes.ts).
  { path: '/api/login', match: 'exact' },
  { path: '/api/logout', match: 'exact' },
  { path: '/api/register', match: 'exact' },
  // First-run install setup — self-closing once any user exists (routes/setup.ts).
  { path: '/api/setup', match: 'prefix' },

  // ── Health & observability ──
  // Liveness probe (no tenant data). Sub-paths such as /api/health/full are
  // additionally guarded by requireMetricsAuth (JWT or METRICS_TOKEN) at the
  // handler (startup/inline-endpoints.ts) — a plain JWT gate here would break
  // the Prometheus shared-secret scrape path.
  { path: '/api/health', match: 'prefix' },
  { path: '/api/metrics', match: 'exact' }, // requireMetricsAuth at handler
  { path: '/api/cortex/health', match: 'exact' },
  { path: '/api/claude/health', match: 'exact' },
  { path: '/api/ai-gateway/health', match: 'exact' },
  { path: '/api/claude/models', match: 'exact' }, // static model catalog, no tenant data

  // ── Alternative-auth surfaces (NOT session-authenticated by design) ──
  // Public API v1 — X-API-Key auth + scope enforcement inside
  // routes/public-api.ts (validateApiKey / requireScope).
  { path: '/api/v1', match: 'prefix' },
  // Stripe billing webhooks — Stripe signature verification at the route.
  { path: '/api/billing/webhooks', match: 'prefix' },
  // Firecrawl webhooks — signature-verified; also mounted before the JSON
  // body parser (raw-body), ahead of this boundary. Listed for documentation
  // and defense against mount reordering.
  { path: '/api/firecrawl-webhooks', match: 'prefix' },
  // CSP violation reports — browsers POST these cross-origin with no
  // credentials (per spec); rate-limited at the route (routes/csp-report.ts).
  { path: '/api/csp-report', match: 'prefix' },

  // ── Public-by-design content ──
  // DTC pricing — read by the public marketing page. No tenant data.
  { path: '/api/billing/dtc-pricing', match: 'exact' },
  // Server-authoritative timestamp + static liveness HTML page. No tenant
  // or user data (register-platform-routes.ts kept these public on purpose).
  { path: '/api/time', match: 'exact' },
  { path: '/api/diag', match: 'exact' },
];

/**
 * True when the full request path (baseUrl + path) matches the public
 * allowlist. Exact entries match only themselves; prefix entries match the
 * path itself or any sub-path (`p === path || path.startsWith(p + '/')`) so
 * /api/healthxyz never rides on /api/health.
 */
export function isPublicApiPath(fullPath: string): boolean {
  return PUBLIC_API_ALLOWLIST.some(entry =>
    entry.match === 'exact'
      ? fullPath === entry.path
      : fullPath === entry.path || fullPath.startsWith(entry.path + '/')
  );
}
