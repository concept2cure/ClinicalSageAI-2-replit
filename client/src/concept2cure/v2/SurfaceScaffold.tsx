/**
 * Surface resilience pieces (kit app/App.jsx): a per-surface error boundary
 * and the degraded state shown when a surface fails. The honest
 * "ready to install" placeholder for unported surfaces is the kit's own
 * scaffold — KitSurfaceScaffold in ./surfaces/Surfaces.tsx.
 */
import React from 'react';
import { reportClientError } from '@/utils/reportClientError';

/**
 * The degraded state.
 *
 * `SurfaceBoundary` catches two genuinely different failures and used to tell
 * the user the same thing about both: a lazy chunk that never arrived (a real
 * network event) and a component that threw while rendering (a defect in our
 * code, usually a payload the surface did not expect — see the shape-guard note
 * in dataConnect.tsx). Describing a crash as "a module script dropped on the way
 * in — usually a transient network hiccup, not your work" told the user to blame
 * their connection for our bug, and told whoever read the support ticket to go
 * looking at the CDN.
 *
 * `kind` splits the copy. Chunk-load failures are still named as such and still
 * suggest a reload, because a reload genuinely fixes them. A render crash says
 * it was a fault on our side and that it has been reported — which, as of the
 * `componentDidCatch` below, is now true.
 */
export function SurfaceDegraded({ kind = 'load' }: { kind?: 'load' | 'crash' }) {
  const crashed = kind === 'crash';
  return (
    <div className="surface-degraded">
      <div className="sd-mark">✻</div>
      <h2>{crashed ? 'This surface stopped unexpectedly' : 'This surface didn’t finish loading'}</h2>
      <p>
        {crashed ? (
          <>
            Something in this screen failed while it was drawing. That is a fault on our side, not
            your work — nothing you had open was changed, and the error has been reported. Reload to
            try again, or pick another surface from the rail.
          </>
        ) : (
          <>
            A module script dropped on the way in — usually a transient network hiccup, not your
            work. Reload to try again, or pick another surface from the rail.
          </>
        )}
      </p>
      <button type="button" className="btn primary" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}

/**
 * Was this a chunk that never arrived, or code that threw?
 *
 * Both reach this boundary through React's render phase — a rejected
 * `React.lazy` import rethrows there — so the class has to be read off the
 * message. These are the strings the three bundlers/browsers in play produce for
 * a failed dynamic import; anything else is our own code throwing.
 *
 * Deliberately conservative: an unrecognised message is treated as a CRASH, so
 * a new failure mode gets reported and honestly described rather than quietly
 * filed under "network hiccup" — which is the exact mistake this replaces.
 */
export function isChunkLoadFailure(message: string): boolean {
  return /failed to fetch dynamically imported module|error loading dynamically imported module|loading chunk \S+ failed|importing a module script failed|dynamically imported module/i.test(
    message,
  );
}

export class SurfaceBoundary extends React.Component<
  { resetKey: string; children: React.ReactNode },
  { err: string | null }
> {
  constructor(props: { resetKey: string; children: React.ReactNode }) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err: unknown) {
    return { err: String((err as Error)?.message ?? err) };
  }

  /**
   * Report the crash.
   *
   * This boundary wraps every ui-v2 surface body (V2App.tsx), so it is the
   * boundary an authenticated user actually reaches — and it had no
   * `componentDidCatch` at all. React called `getDerivedStateFromError`, the
   * subtree was replaced with `SurfaceDegraded`, and the error object was
   * discarded inside the render pass. Every customer-visible surface crash since
   * the port has therefore been invisible: no console line, no report, and a
   * fallback that blamed the network.
   *
   * `resetKey` is attached so a report says WHICH surface died — the key is the
   * surface identity V2App re-mounts on, and without it every report from this
   * boundary would group as one anonymous "a surface crashed".
   */
  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    const message = String((error as Error)?.message ?? error);
    reportClientError(error, {
      boundary: 'SurfaceBoundary',
      componentStack: info?.componentStack,
      // A failed chunk fetch is reported too — it is a real production symptom
      // (a stale deploy, a CDN miss) that nobody could see either — but tagged
      // so it does not sit in the same bucket as a code defect.
      extra: { resetKey: this.props.resetKey, kind: isChunkLoadFailure(message) ? 'chunk-load' : 'render-crash' },
    });
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.err) {
      this.setState({ err: null });
    }
  }

  render() {
    if (this.state.err) {
      return <SurfaceDegraded kind={isChunkLoadFailure(this.state.err) ? 'load' : 'crash'} />;
    }
    return this.props.children;
  }
}
