/**
 * Security-alert routing (decision register #727, item 9).
 *
 * `[SECURITY]`-class events were logged to console only; this forwards them
 * to a monitoring/alerting integration when one is configured via
 * SECURITY_ALERT_WEBHOOK_URL (any JSON-accepting receiver: Slack incoming
 * webhook, PagerDuty Events API proxy, SIEM collector).
 *
 * Fire-and-forget by design: alerting must never change request semantics
 * or crash a job, so delivery failures are swallowed after one console
 * line. The console log remains the source of truth; the webhook is a
 * surface, not a ledger.
 */

const WEBHOOK_URL = process.env.SECURITY_ALERT_WEBHOOK_URL;
const DELIVERY_TIMEOUT_MS = 5_000;

export interface SecurityAlert {
  /** Stable machine kind, e.g. 'tenant_impersonation_blocked'. */
  kind: string;
  /** Human-readable one-liner. */
  message: string;
  /** Structured context — never include credentials or raw tokens. */
  detail?: Record<string, unknown>;
}

/**
 * Log a security event and, when a webhook is configured, forward it.
 * Synchronous from the caller's perspective; delivery happens in the
 * background.
 */
export function reportSecurityAlert(alert: SecurityAlert): void {
  console.warn(`[SECURITY] ${alert.message}`, alert.detail ?? '');

  if (!WEBHOOK_URL) return;

  const payload = {
    source: 'concept2cure',
    severity: 'warning',
    kind: alert.kind,
    message: alert.message,
    detail: alert.detail ?? {},
    at: new Date().toISOString(),
  };

  void (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
      try {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      console.error(
        '[SECURITY] alert webhook delivery failed:',
        err instanceof Error ? err.message : err
      );
    }
  })();
}
