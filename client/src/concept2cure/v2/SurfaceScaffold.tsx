/**
 * SurfaceScaffold — the honest placeholder a registry surface renders until
 * its kit component ports in Phase 3 (GAP RULE: surface the state, never fake
 * a screen). Answer-first: what this surface is, how ready its backend is,
 * and the one next step — all straight from the reconciled registry, no
 * invented data. Reuses the kit's .reg-* table styles (styles/app-v2.css).
 */
import React from 'react';
import type { UiSurface } from '@shared/constants/ui-surface-registry';
import { AnswerLead } from './AnswerLead';
import { READINESS_META } from './registryModel';

const READINESS_HEADLINE: Record<string, string> = {
  'contract-ready':
    'Its backend contract is live and typed — this surface connects to real data the moment its kit component lands.',
  'routes-ready':
    'Its backend routes are mounted and verified — this surface connects to real data the moment its kit component lands.',
  'kit-only':
    'Its design is finished, and the backend binding map is still being assembled — it will ship on fixtures behind a "Sample data" pill first.',
  planned:
    'Its backend routes are not mounted yet — the registry tracks it honestly as planned.',
};

const READINESS_TONE: Record<string, string> = {
  'contract-ready': 'ok',
  'routes-ready': 'ai',
  'kit-only': 'warn',
  planned: 'idle',
};

export function SurfaceScaffold({
  surface,
  onAsk,
}: {
  surface: UiSurface;
  onAsk: (text: string) => void;
}) {
  const readiness = READINESS_META[surface.readiness as keyof typeof READINESS_META];
  return (
    <div>
      <AnswerLead
        eyebrow="Surface migration status"
        headline={
          <>
            <b>{surface.label}</b> is registered and routed — its ui-v2 component ports in the
            surface phase.
          </>
        }
        body={READINESS_HEADLINE[surface.readiness] ?? readiness?.blurb}
        reassure="Nothing here is faked: this placeholder states exactly what exists today."
        action={{
          label: 'Ask AnA about this surface',
          onClick: () =>
            onAsk(`What can I do in ${surface.label} today, and what is still being ported?`),
        }}
        secondary="The detail below is the surface's registry record."
      />
      <div className="reg-card reg-pad">
        <table className="reg-tbl">
          <tbody>
            <tr>
              <td>Registry id</td>
              <td>
                <span className="reg-id">{surface.id}</span>
              </td>
            </tr>
            <tr>
              <td>Nav tier · group</td>
              <td>
                {surface.navTier} · {surface.group}
              </td>
            </tr>
            <tr>
              <td>Install readiness</td>
              <td>
                <span className={`reg-pill ${READINESS_TONE[surface.readiness] ?? 'idle'}`}>
                  {readiness?.label ?? surface.readiness}
                </span>{' '}
                <span className="reg-mkt-a">{readiness?.blurb}</span>
              </td>
            </tr>
            <tr>
              <td>Mounted routes</td>
              <td>
                {surface.apiPrefixes.map((p) => (
                  <span key={p} className="reg-id">
                    {p}{' '}
                  </span>
                ))}
              </td>
            </tr>
            {surface.sharedContract && (
              <tr>
                <td>Typed contract</td>
                <td>
                  <span className="reg-id">{surface.sharedContract}</span>
                </td>
              </tr>
            )}
            {surface.discoveryCatalog && (
              <tr>
                <td>Discovery catalog</td>
                <td>
                  <span className="reg-id">{surface.discoveryCatalog}</span>
                </td>
              </tr>
            )}
            {surface.notes && (
              <tr>
                <td>Notes</td>
                <td>{surface.notes}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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

export default SurfaceScaffold;
