import * as Sentry from '@sentry/react';

import { scrubSentryBreadcrumb, scrubSentryEvent } from './sentryScrub';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // No session replay (ADR-0014 §3, audit DP-26). A replay is a recording
    // of a regulated screen sent to a third party; masking changes what it
    // shows, not that it is sent. Errors and traces are reported, not screens.
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    // Never attach the viewer's IP address, cookies or headers automatically.
    sendDefaultPii: false,
    // Fail-closed scrubbers: credentials, identifiers and health data are
    // removed from every event and breadcrumb, and an event the scrubber
    // cannot process is dropped (see ./sentryScrub.ts).
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: scrubSentryBreadcrumb,
  });
}

export { Sentry };
