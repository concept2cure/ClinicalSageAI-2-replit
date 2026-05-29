// Submission center overview — AnA-first composer + live summary tiles + a
// needs-attention queue derived from live transmittals + the transmittals table
// + a collapsible gateway-connections panel. Every value binds to live hooks
// (useGateways, useTransmittals). No kit / demo arrays.

import * as React from 'react';
import { useGateways, useTransmittals } from '../../hooks/useSubmission';
import { SUBMISSION_SUGGESTIONS, gatewayLabel, regionLabel, isInFlight, isRejected } from '../data/nav';
import type { Environment, RegionFilter } from '../shell/TopBar';
import { SubmissionIcon } from '../icons';
import { Loading, ErrorState, Empty } from './state';
import { TransmittalTable } from './Transmittals';

interface OverviewProps {
  environment: Environment;
  region: RegionFilter;
  onAskAna: (t: string) => void;
}

export function SubmissionOverview({ environment, region, onAskAna }: OverviewProps) {
  const txFilter = React.useMemo(
    () => (region === 'all' ? {} : { region }),
    [region],
  );
  const txQuery = useTransmittals(txFilter);
  const gwQuery = useGateways(environment);

  const transmittals = txQuery.data ?? [];
  const gateways = gwQuery.data ?? [];

  const inFlight = transmittals.filter(t => isInFlight(String(t.status)));
  const rejected = transmittals.filter(t => isRejected(String(t.status)));
  const connected = gateways.filter(g => g.configured);

  // Needs-attention: rejected first, then in-flight. The transmittals carry the
  // full status; this queue surfaces only those that need an action.
  const attention = [...rejected, ...inFlight].slice(0, 6);

  const [dashboardOpen, setDashboardOpen] = React.useState(false);
  const [composer, setComposer] = React.useState('');
  const send = (t: string) => {
    const v = t.trim();
    if (v) onAskAna(v);
    setComposer('');
  };

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Submission gateway · agency transmittals</div>
          <h1 className="bp-title">Submission center</h1>
          <div className="bp-meta">
            {inFlight.length} in flight · {rejected.length} rejected · {connected.length} of {gateways.length} gateways configured
          </div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna(SUBMISSION_SUGGESTIONS.overview[0])}>
            Triage with AnA
          </button>
        </div>
      </div>

      {/* AnA composer */}
      <form className="sub-composer" onSubmit={e => { e.preventDefault(); send(composer); }}>
        <label htmlFor="sub-composer-input" className="sub-sr-only">Ask AnA about a transmittal, validation, or gateway</label>
        <input id="sub-composer-input" type="text"
               placeholder="Ask AnA about a transmittal, a validation finding, or a gateway…"
               value={composer} onChange={e => setComposer(e.target.value)} />
        <button className="bp-btn-primary" type="submit" disabled={!composer.trim()} aria-label="Send">
          <SubmissionIcon name="arrowRight" />
        </button>
      </form>

      <div className="sub-starters">
        {SUBMISSION_SUGGESTIONS.overview.map((s, i) => (
          <button key={i} className="sub-starter" type="button" onClick={() => onAskAna(s)}>
            <span className="sub-starter-ico"><SubmissionIcon name="sparkles" /></span>
            <span>{s}</span>
          </button>
        ))}
      </div>

      {/* Live summary tiles */}
      <div className="sub-tiles">
        <div className="sub-tile">
          <div className="sub-tile-num">{transmittals.length}</div>
          <div className="sub-tile-lbl">Transmittals</div>
        </div>
        <div className="sub-tile">
          <div className="sub-tile-num">{inFlight.length}</div>
          <div className="sub-tile-lbl">In flight</div>
        </div>
        <div className="sub-tile">
          <div className="sub-tile-num">{rejected.length}</div>
          <div className="sub-tile-lbl">Rejected</div>
        </div>
        <div className="sub-tile">
          <div className="sub-tile-num">{connected.length}</div>
          <div className="sub-tile-lbl">Gateways configured</div>
        </div>
      </div>

      {/* Transmittals table — the primary working data for this surface */}
      <div className="bp-card">
        <div className="bp-card-head">
          <span>Transmittals</span>
          <span className="bp-meta">{transmittals.length} total · {inFlight.length} in flight</span>
        </div>
        {txQuery.isLoading ? (
          <Loading label="Loading transmittals…" />
        ) : txQuery.isError ? (
          <ErrorState message="Could not load transmittals." />
        ) : transmittals.length === 0 ? (
          <Empty>No transmittals yet. Transmit a package to send it to an agency.</Empty>
        ) : (
          <TransmittalTable
            transmittals={attention.length > 0 ? attention : transmittals.slice(0, 8)}
            onAskAna={onAskAna}
          />
        )}
      </div>

      {/* Gateway connections — collapsed reference */}
      <section className="bp-card sub-collapse">
        <button className="sub-collapse-head" type="button"
                aria-expanded={dashboardOpen}
                onClick={() => setDashboardOpen(o => !o)}>
          <span className="sub-chev" data-open={dashboardOpen || undefined}>
            <SubmissionIcon name="chevronRight" />
          </span>
          <span>Gateway connections</span>
          <span className="bp-meta">{dashboardOpen ? 'collapse' : `${connected.length} of ${gateways.length} configured`}</span>
        </button>
        {dashboardOpen && (
          <div className="sub-collapse-body">
            {gwQuery.isLoading ? (
              <Loading label="Loading gateways…" />
            ) : gwQuery.isError ? (
              <ErrorState message="Could not load gateways." />
            ) : gateways.length === 0 ? (
              <Empty>No gateways available.</Empty>
            ) : (
              <div className="sub-conn-list">
                {gateways.map(g => (
                  <div key={`${g.region}:${g.gateway}`} className="sub-conn-row">
                    <span className={`sub-conn sub-conn-${g.configured ? 'on' : 'off'}`} aria-hidden="true" />
                    <div className="sub-conn-body">
                      <div className="sub-conn-title">{gatewayLabel(g.gateway)} · {regionLabel(g.region)}</div>
                      <div className="sub-conn-sub">{g.transport.toUpperCase()} · {g.environment}</div>
                    </div>
                    <span className={`sub-pill sub-pill-${g.configured ? 'ok' : 'warn'}`}>
                      <SubmissionIcon name={g.configured ? 'checkCircle' : 'alertCircle'} size={12} />
                      {g.configured ? 'Configured' : 'Not configured'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
