/**
 * The one place a client-side crash is reported.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * Before this module, `Sentry.captureException` was called exactly zero times in
 * the client. `@sentry/react` was installed, `utils/sentry.ts` initialised it
 * from `VITE_SENTRY_DSN`, and every React error boundary in the app — the global
 * one, the two in `components/ui/error-boundary.jsx`, and `SurfaceBoundary`,
 * which is the one an authenticated user actually hits — either logged to the
 * console or did nothing at all. `SurfaceBoundary` had no `componentDidCatch`
 * whatsoever: a render crash inside a surface was caught, swallowed, and
 * presented to the user as "a module script dropped on the way in — usually a
 * transient network hiccup". The crash never left the browser. Nobody could
 * count them, nobody could see the stack, and the one user-visible signal
 * misattributed a code defect to the network.
 *
 * ── Transport ─────────────────────────────────────────────────────────────────
 * Sentry, via the client the repo already ships (`utils/sentry.ts`). No new
 * dependency, and no second convention. `Sentry.init()` only runs when
 * `VITE_SENTRY_DSN` is configured; `captureException` on an uninitialised client
 * is a documented no-op, so calling it unconditionally is safe in dev, in tests
 * and in a deployment with no DSN. When there is no DSN the console.error below
 * is still the local signal, exactly as before.
 *
 * Every path here is defensive. A reporter that throws inside
 * `componentDidCatch` converts a contained, recoverable surface crash into a
 * whole-app crash — the failure mode it exists to prevent.
 */
import { Sentry } from './sentry';

/** Where the error was caught, so reports can be grouped by boundary. */
export interface ClientErrorContext {
  /** The boundary that caught it, e.g. 'SurfaceBoundary' or 'ErrorBoundary'. */
  boundary: string;
  /** React's component stack from `componentDidCatch`'s second argument. */
  componentStack?: string | null;
  /** Anything else worth attaching — the surface id, the route, a resetKey. */
  extra?: Record<string, unknown>;
}

/**
 * Report a caught client error to the monitoring backend and the console.
 *
 * Returns nothing and never throws: callers are error handlers, and an error
 * handler that can itself fail is not one.
 */
export function reportClientError(error: unknown, context: ClientErrorContext): void {
  // The console line stays unconditional. It is the only signal in local dev
  // and in any deployment without a DSN, and it is what a developer looks for
  // first — removing it in favour of a remote-only report would make the app
  // quieter to debug, not safer.
  try {
    // The first console argument is a FORMAT string in every browser console
    // (%s/%d substitution), so it must be a constant — interpolating
    // context.boundary into it would let a %-token in that value forge the log
    // line (Semgrep unsafe-formatstring). The boundary rides as its own
    // argument instead.
    // eslint-disable-next-line no-console
    console.error('[client-error] uncaught in boundary:', context.boundary, error, context.componentStack ?? '');
  } catch {
    /* A console that throws is not worth a second attempt. */
  }

  try {
    if (!Sentry || typeof Sentry.captureException !== 'function') return;
    Sentry.captureException(error, {
      // `contexts.react.componentStack` is the shape @sentry/react's own
      // ErrorBoundary sends, so these reports group and render in the Sentry UI
      // the same way as ones captured by that component.
      contexts: { react: { componentStack: context.componentStack ?? undefined } },
      tags: { boundary: context.boundary },
      extra: context.extra,
    });
  } catch {
    /* Reporting is best-effort. A transport failure must not escalate the
       original error, which the boundary has already contained. */
  }
}
