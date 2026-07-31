export type FirecrawlPolicyResult = { allowed: boolean; reason?: string };

export interface FirecrawlPolicyInput {
  enabled: boolean;
  requestedUrl?: string;
  domainAllowlist?: string[];
  categoryPolicy?: Record<string, unknown>;
}

export function evaluateFirecrawlPolicy(input: FirecrawlPolicyInput): FirecrawlPolicyResult {
  if (!input.enabled) return { allowed: false, reason: 'policy_blocked' };
  if (!input.requestedUrl) return { allowed: true };

  let domain = '';
  try {
    domain = new URL(input.requestedUrl).hostname.toLowerCase();
    const parsed = new URL(input.requestedUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { allowed: false, reason: 'policy_blocked' };
    }
    const suspiciousPath = `${parsed.pathname}${parsed.search}`.toLowerCase();
    if (/(signin|login|auth|account|checkout|cart|private|admin)/.test(suspiciousPath)) {
      return { allowed: false, reason: 'policy_blocked' };
    }
  } catch {
    return { allowed: false, reason: 'policy_blocked' };
  }

  const blockedDomains = (input.categoryPolicy?.blockedDomains as string[]) || [];
  if (blockedDomains.some(d => domain === d || domain.endsWith(`.${d}`))) {
    return { allowed: false, reason: 'policy_blocked' };
  }

  // Fail closed: an enabled tenant with no domain allowlist must NOT be able to
  // scrape arbitrary public URLs through governed infrastructure. Requiring an
  // explicit, non-empty allowlist removes an SSRF / data-exfiltration default-
  // allow. The distinct reason ('allowlist_required') is surfaced to admins
  // (external-evidence returns the policy object) so the fix is self-describing:
  // configure firecrawl_domain_allowlist_json for the tenant.
  if (!input.domainAllowlist?.length) {
    return { allowed: false, reason: 'allowlist_required' };
  }
  const allowed = input.domainAllowlist.some(d => domain === d || domain.endsWith(`.${d}`));
  return allowed ? { allowed: true } : { allowed: false, reason: 'policy_blocked' };
}
