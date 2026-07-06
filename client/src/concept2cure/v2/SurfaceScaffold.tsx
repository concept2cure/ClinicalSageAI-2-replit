/**
 * Surface resilience pieces (kit app/App.jsx): a per-surface error boundary
 * and the degraded state shown when a surface chunk fails to load. The honest
 * "ready to install" placeholder for unported surfaces is the kit's own
 * scaffold — KitSurfaceScaffold in ./surfaces/Surfaces.tsx.
 */
import React from 'react';

/** Kit App.jsx degraded state — a surface chunk failed to load. */
export function SurfaceDegraded() {
  return (
    <div className="surface-degraded">
      <div className="sd-mark">✻</div>
      <h2>This surface didn’t finish loading</h2>
      <p>
        A module script dropped on the way in — usually a transient network hiccup, not your work.
        Reload to try again, or pick another surface from the rail.
      </p>
      <button type="button" className="btn primary" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
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

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.err) {
      this.setState({ err: null });
    }
  }

  render() {
    if (this.state.err) return <SurfaceDegraded />;
    return this.props.children;
  }
}
