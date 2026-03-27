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

  if (!input.domainAllowlist?.length) return { allowed: true };
  const allowed = input.domainAllowlist.some(d => domain === d || domain.endsWith(`.${d}`));
  return allowed ? { allowed: true } : { allowed: false, reason: 'policy_blocked' };
}
