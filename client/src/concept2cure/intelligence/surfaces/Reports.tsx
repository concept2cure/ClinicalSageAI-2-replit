/**
 * ReportsSurface — port of ui_kits/intelligence/surfaces.jsx ReportsSurface.
 * Readiness bar chart + precedent-likelihood models + timeline forecast.
 * Read-only — drives decisions, not edits (no hand-off).
 *
 * @module client/src/concept2cure/intelligence/surfaces/Reports
 */

import * as React from 'react';
import { I } from '../icons';
import { AnaStrip } from '../AnaStrip';
import { useReports } from '../hooks';

const FCOLS = '170px 1fr 130px 130px 90px 90px';

export interface ReportsSurfaceProps {
  onAsk: (q: string) => void;
}

export function ReportsSurface({ onAsk }: ReportsSurfaceProps) {
  const { kpis: k, bars, forecast, models } = useReports();

  return (
    <>
      <h1 className="in-h1">Reports</h1>
      <p className="in-sub">Readiness dashboards, timeline forecasting and precedent-likelihood models. Read-only — drives decisions, not edits.</p>

      <div className="in-kpis">
        <div className="in-kpi"><div className="lbl">Programs tracked</div><div className="val">{k.programs}</div><div className="sub">Across MDX + Biopharma</div></div>
        <div className="in-kpi"><div className="lbl">Avg readiness</div><div className="val">{k.ready_avg}<span className="unit">%</span></div><div className="sub"><span className="delta-up">+4</span> vs last week</div></div>
        <div className="in-kpi"><div className="lbl">Forecast confidence</div><div className="val">{(k.forecast_conf * 100).toFixed(0)}<span className="unit">%</span></div><div className="sub">model: ridge + historical reviewer-velocity</div></div>
        <div className="in-kpi"><div className="lbl">Precedent matches</div><div className="val">{k.precedent_hits.toLocaleString()}</div><div className="sub">RIM cross-agency corpus</div></div>
      </div>

      <div className="in-split">
        <div className="in-card">
          <h3>Submission readiness · by program</h3>
          <div className="in-bars" style={{ marginTop: 4 }}>
            {bars.map((b, i) => (
              <div key={i} className="in-bar-row">
                <span className="label">{b.label}</span>
                <span className="track"><span className={`fill ${b.tone === 'ok' ? '' : b.tone}`} style={{ width: b.pct + '%' }} /></span>
                <span className="pct">{b.pct}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="in-card">
          <h3>Precedent-likelihood models</h3>
          {models.map((m, i) => (
            <div key={i} className="row" style={{ gridTemplateColumns: 'minmax(0,1fr) 110px' }}>
              <div className="k">
                <div>{m.name}</div>
                <div className="sub">Applied to {m.programs}</div>
                <div className="sub" style={{ fontSize: 10.5, fontStyle: 'italic' }}>{m.basis}</div>
              </div>
              <div className="v" style={{ fontWeight: 600 }}>{m.output}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="in-sec">
        <div className="in-sec-head">
          <h2>Timeline forecast vs target</h2>
          <span className="meta">Next milestones · {forecast.length} programs</span>
          <span className="spacer" />
          <button className="link" type="button" onClick={() => onAsk('Export the timeline forecast as a PDF')}>Export PDF {I.right}</button>
        </div>
        <div className="in-table">
          <div className="in-thead" style={{ gridTemplateColumns: FCOLS }}>
            <span>Program</span><span>Milestone</span><span>Target</span><span>Forecast</span><span>Δ</span><span>Conf.</span>
          </div>
          {forecast.map((f, i) => (
            <div key={i} className="in-row" style={{ gridTemplateColumns: FCOLS }}>
              <span className="prog">{f.program}</span>
              <span className="name">{f.milestone}</span>
              <span className="num">{f.target}</span>
              <span className="num">{f.forecast}</span>
              <span className="num" style={{ color: f.delta.startsWith('−') ? '#5a6e44' : '#d97706', fontWeight: 600 }}>{f.delta}</span>
              <span className="num">{(f.conf * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      <AnaStrip activeNav="reporting" onAsk={onAsk} />
    </>
  );
}
