import * as Sentry from '@sentry/node';

import { redactSecretsAndPiiObject } from '../services/observability/redaction';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Never attach client IP / cookies / headers automatically.
    sendDefaultPii: false,
    // Fail-closed PII/PHI/secret scrubber. Error payloads from a regulated,
    // PHI-adjacent platform must not carry identifiers or credentials to a
    // third-party telemetry sink. We strip the obvious carriers explicitly,
    // then backstop by scrubbing the entire serialized event.
    beforeSend(event) {
      try {
        const headers = event.request?.headers;
        if (headers) {
          for (const key of Object.keys(headers)) {
            if (/^(authorization|cookie|set-cookie|x-api-key|x-org-id)$/i.test(key)) {
              headers[key] = '[REDACTED]';
            }
          }
        }
        if (event.request) delete event.request.cookies;
        if (event.user) {
          delete event.user.ip_address;
          if (event.user.email) event.user.email = '[REDACTED]';
          if (event.user.username) event.user.username = '[REDACTED]';
        }
        return redactSecretsAndPiiObject(event);
      } catch {
        // If scrubbing fails, drop the event rather than risk leaking PII.
        return null;
      }
    },
  });
}

export { Sentry };
