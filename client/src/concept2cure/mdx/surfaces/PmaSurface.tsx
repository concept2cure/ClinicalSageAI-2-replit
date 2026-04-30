/**
 * PMA surface — 10-phase grid · 4 trial KPIs · 6 module cards.
 * Ported from Surfaces.jsx > PMASurface.
 */

import * as React from 'react';
import { I } from '../icons';
import { PMA_MODULES, PMA_PHASES, PMA_TRIAL_METRICS } from '../data/pma';

export interface PmaSurfaceProps {
  onAskAna: (text: string) => void;
}

export function PmaSurface(_props: PmaSurfaceProps) {
  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">PMA pathway · CV-330 Implantable Monitor</div>
          <div className="section-sub">
            Phase 5 of 10 — Pivotal trial enrollment · PMA filing Q3 2026
          </div>
        </div>
        <button className="section-more">Phase report {I.right}</button>
      </div>

      <div className="phases">
        {PMA_PHASES.map((p, i) => (
          <div key={p.id} className={`phase ${p.status}`}>
            <div className="phase-label">
              {i + 1}. {p.label}
            </div>
            <div className="phase-bar">
              <div className="phase-bar-fill" style={{ width: `${p.pct}%` }} />
            </div>
            <div
              className="phase-pct"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>{p.pct}%</span>
              <span className={`status-dot ${p.status}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="health">
        {PMA_TRIAL_METRICS.map((d, i) => (
          <div key={i} className="health-card">
            <div className="health-label">{d.label}</div>
            <div className="health-metric">
              {d.metric}
              {d.unit && <span className="unit">{d.unit}</span>}
            </div>
            {d.bar && (
              <div className="readiness">
                <div
                  className={`readiness-fill ${d.bar.tone || ''}`}
                  style={{ width: `${d.bar.pct}%` }}
                />
              </div>
            )}
            <div className={`health-meta ${d.tone || ''}`}>{d.meta}</div>
          </div>
        ))}
      </div>

      <div className="section-hdr">
        <div>
          <div className="section-title">PMA modules</div>
          <div className="section-sub">Section-by-section assembly · 135 documents total</div>
        </div>
      </div>
      <div className="pma-modules">
        {PMA_MODULES.map(m => (
          <button key={m.id} className="pma-mod">
            <div className="pma-mod-hdr">
              <div className="pma-mod-label">{m.label}</div>
              <span className={`status-pill ${m.status}`}>{m.status}</span>
            </div>
            <div className="pma-mod-desc">{m.desc}</div>
            <div className="pma-mod-foot">
              <span>{m.docs} documents</span>
              <span>{I.chevronRight}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
