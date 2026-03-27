export type FirecrawlErrorCode =
  | 'policy_blocked'
  | 'quota_exhausted'
  | 'provider_error'
  | 'webhook_verification_failed'
  | 'normalization_failed';

export function firecrawlError(code: FirecrawlErrorCode, message?: string, details?: unknown) {
  return {
    success: false,
    error: {
      code,
      message:
        message ||
        {
          policy_blocked: 'Firecrawl request blocked by workspace policy.',
          quota_exhausted: 'Workspace daily Firecrawl allowance is exhausted.',
          provider_error: 'Firecrawl provider returned an error.',
          webhook_verification_failed: 'Webhook signature verification failed.',
          normalization_failed: 'External evidence normalization failed.',
        }[code],
      details,
    },
  };
}
