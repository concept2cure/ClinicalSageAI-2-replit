// Risk overview — AnA-first composer + live summary tiles + a needs-attention
// queue derived from the live risk items. Summary comes from
// GET /api/mdx/risk-summary/:programId; items from GET /api/mdx/risk-items.

import * as React from 'react';
import { useRiskItems, useRiskSummary } from '../../hooks/useRisk';
import { riskBand, RISK_SUGGESTIONS } from '../data/nav';
import { RiskIcon } from '../icons';
import { Loading, ErrorState, Empty, NoProject, BandPill, ScoreChip } from './state';

interface OverviewProps {
  projectId: string | null;
  onAskAna: (t: string) => void;
}

export function RiskOverview({ projectId, onAskAna }: OverviewProps) {
  const itemsQuery = useRiskItems(projectId ? { programId: projectId } : {});
  const summaryQuery = useRiskSummary(projectId);
  const items = itemsQuery.data ?? [];
  const summary = summaryQuery.data;

  // Residual band of each item — residual score where present, otherwise the
  // initial severity × probability.
  const residualBand = (it: (typeof items)[number]) => {
    const sev = it.residual_severity ?? it.severity;
    const prob = it.residual_probability ?? it.probability;
    return riskBand(sev, prob);
  };

  const unacceptable = items.filter(it => residualBand(it) === 'unacceptable').length;
  const alarp = items.filter(it => residualBand(it) === 'alarp').length;

  // Needs-attention: unacceptable or ALARP residual risks, highest score first.
  const attention = [...items]
    .filter(it => residualBand(it) !== 'acceptable')
    .sort((a, b) => (b.residual_risk ?? b.initial_risk ?? 0) - (a.residual_risk ?? a.initial_risk ?? 0))
    .slice(0, 5);

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
          <div className="bp-kicker">Risk management · ISO 14971:2019</div>
          <h1 className="bp-title">Risk overview</h1>
          <div className="bp-meta">
            {projectId
              ? `${summary?.total ?? items.length} hazards analyzed · ${unacceptable} unacceptable · ${alarp} ALARP after controls`
              : 'Select a project to scope the risk file'}
          </div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Draft the ISO 14971 risk-benefit conclusion from the current risk file')}>
            Draft risk-benefit with AnA
          </button>
        </div>
      </div>

      {/* AnA composer */}
      <form className="risk-composer" onSubmit={e => { e.preventDefault(); send(composer); }}>
        <label htmlFor="risk-composer-input" className="risk-sr-only">Ask AnA about a hazard or control</label>
        <input id="risk-composer-input" type="text"
               placeholder="Ask AnA about a hazard, score a risk, or capture a new one…"
               value={composer} onChange={e => setComposer(e.target.value)} />
        <button className="bp-btn-primary" type="submit" disabled={!composer.trim()} aria-label="Send">
          <RiskIcon name="arrowRight" />
        </button>
      </form>

      <div className="risk-starters">
        {RISK_SUGGESTIONS.overview.map((s, i) => (
          <button key={i} className="risk-starter" type="button" onClick={() => onAskAna(s)}>
            <span className="risk-starter-ico"><RiskIcon name="sparkles" /></span>
            <span>{s}</span>
          </button>
        ))}
      </div>

      {/* Live summary tiles */}
      {projectId && (
        <div className="risk-tiles">
          <div className="risk-tile">
            <div className="risk-tile-num">{summary?.total ?? items.length}</div>
            <div className="risk-tile-lbl">Hazards analyzed</div>
          </div>
          <div className="risk-tile">
            <div className="risk-tile-num">{summary?.open ?? items.filter(it => it.status === 'open' || it.status === 'mitigating').length}</div>
            <div className="risk-tile-lbl">Open or mitigating</div>
          </div>
          <div className="risk-tile">
            <div className="risk-tile-num">{summary?.highResidual ?? unacceptable}</div>
            <div className="risk-tile-lbl">High residual risk (score ≥ 15)</div>
          </div>
          <div className="risk-tile">
            <div className="risk-tile-num">{summary?.accepted ?? items.filter(it => it.status === 'accepted').length}</div>
            <div className="risk-tile-lbl">Risk accepted</div>
          </div>
        </div>
      )}

      {/* Needs-attention queue from live items */}
      <div className="bp-card">
        <div className="bp-card-head">
          <span>Needs attention here</span>
          <span className="bp-meta">{attention.length} items</span>
        </div>
        {!projectId ? (
          <NoProject />
        ) : itemsQuery.isLoading ? (
          <Loading label="Loading risk items…" />
        ) : itemsQuery.isError ? (
          <ErrorState message="Could not load risk items." />
        ) : attention.length === 0 ? (
          <Empty>No risks above the acceptable band. Every residual risk is acceptable.</Empty>
        ) : (
          <div className="risk-queue">
            {attention.map(it => {
              const sev = it.residual_severity ?? it.severity;
              const prob = it.residual_probability ?? it.probability;
              const band = riskBand(sev, prob);
              return (
                <button key={it.id} className="risk-q-item" type="button"
                        onClick={() => onAskAna(`Open risk ${it.ref_code ?? it.id} (${it.hazard}) — show its controls, residual risk, and verification status`)}>
                  <span className="risk-q-ico"><RiskIcon name={band === 'unacceptable' ? 'warning' : 'alertCircle'} /></span>
                  <div className="risk-q-body">
                    <div className="risk-q-title">{it.ref_code ? `${it.ref_code} · ` : ''}{it.hazard}</div>
                    <div className="risk-q-sub">{it.harm}</div>
                  </div>
                  <ScoreChip severity={sev} probability={prob} band={band} />
                  <BandPill band={band} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
