import { evaluateFirecrawlPolicy } from './policy';
import type { FirecrawlErrorCode } from './errors';

/**
 * The subset of a tenant's `external_tool_settings` row that governs Firecrawl.
 * All fields are optional/nullable because the row may not exist for a tenant
 * that has never been configured — which must fail closed, not open.
 */
export interface FirecrawlTenantSettings {
  firecrawl_enabled?: boolean | null;
  firecrawl_domain_allowlist_json?: unknown;
  firecrawl_role_policy_json?: unknown;
  firecrawl_category_policy_json?: unknown;
}

/**
 * Fail closed: Firecrawl is active for a tenant ONLY when explicitly enabled
 * (`firecrawl_enabled === true`). A null/undefined column — a tenant that never
 * configured the tool, or a missing settings row — is treated as DISABLED, so
 * outbound scraping can never be on by default. Previously the routes used
 * `?? true` / `!== false`, which turned an unconfigured tenant into an enabled
 * one; this is the canonical, fail-closed replacement.
 */
export function isFirecrawlEnabled(
  settings: FirecrawlTenantSettings | undefined | null,
): boolean {
  return settings?.firecrawl_enabled === true;
}

/** The tenant domain allowlist as a string[], tolerating a non-array column. */
export function firecrawlAllowlist(
  settings: FirecrawlTenantSettings | undefined | null,
): string[] {
  const raw = settings?.firecrawl_domain_allowlist_json;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

export type ScrapeGuardResult =
  | { ok: true }
  | { ok: false; status: number; code: FirecrawlErrorCode; reason: string };

/**
 * Combined pre-scrape authorization, evaluated in fail-closed order:
 *   1. tenant enabled (explicit `true` only),
 *   2. URL / domain policy (blocks non-http, suspicious paths, blocked domains,
 *      and — the hardened default — any request when no allowlist is set),
 *   3. role policy (if the tenant restricts Firecrawl to specific roles).
 *
 * Pure and unit-tested; the route just sends the decision. The error `code` is
 * kept as the stable `policy_blocked` enum for every denial, while `reason`
 * carries the specific cause for logging and admin-facing messaging.
 */
export function evaluateScrapeGuards(input: {
  settings: FirecrawlTenantSettings;
  requestedUrl: string;
  requestRole: string;
}): ScrapeGuardResult {
  const { settings, requestedUrl, requestRole } = input;

  if (!isFirecrawlEnabled(settings)) {
    return { ok: false, status: 403, code: 'policy_blocked', reason: 'admin_disabled' };
  }

  const policy = evaluateFirecrawlPolicy({
    enabled: true,
    requestedUrl,
    domainAllowlist: firecrawlAllowlist(settings),
    categoryPolicy: (settings.firecrawl_category_policy_json as Record<string, unknown>) || {},
  });
  if (!policy.allowed) {
    return {
      ok: false,
      status: 403,
      code: 'policy_blocked',
      reason: policy.reason || 'policy_blocked',
    };
  }

  const rolePolicy = (settings.firecrawl_role_policy_json as { allowedRoles?: unknown }) || {};
  const restrictedRoles = Array.isArray(rolePolicy.allowedRoles)
    ? (rolePolicy.allowedRoles as string[])
    : null;
  if (restrictedRoles && restrictedRoles.length > 0 && !restrictedRoles.includes(requestRole)) {
    return { ok: false, status: 403, code: 'policy_blocked', reason: 'role_blocked' };
  }

  return { ok: true };
}
