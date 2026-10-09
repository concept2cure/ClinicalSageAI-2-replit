import * as Sentry from '@sentry/react';

import { scrubSentryBreadcrumb, scrubSentryEvent } from './sentryScrub';

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    integrations: [
      Sentry.browserTracingIntegration(),
      // A replay is a recording of the DOM. Every text node and input is
      // masked and every image, video and canvas is blocked before a frame
      // leaves the browser. These are the library's defaults today; a default
      // is not a control, so they are stated (audit DP-26).
      Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
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
