/**
 * CmcSurface — port of ui_kits/intelligence/surfaces.jsx CmcSurface.
 * Portfolio-level CMC packages + stability programs + spec library.
 * Hands off to Authoring (rule pack = mod3:ich). Read-only.
 *
 * NOTE: a richer, multi-surface standalone CMC module also exists at
 * client/src/concept2cure/cmc/. This is the lighter Intelligence-cluster
 * tab from the Phase 11 kit; the home-rail `cmc` item still points at the
 * standalone module pending a designer call on which owns the rail entry
 * (see HANDOFF.md open question).
 *
 * @module client/src/concept2cure/intelligence/surfaces/Cmc
 */

import * as React from 'react';
import { I } from '../icons';
import { AnaStrip } from '../AnaStrip';
import { useCmc } from '../hooks';

const COLS = '90px 120px 130px 130px 120px 90px 90px 1fr 90px';

export interface CmcSurfaceProps {
  onAsk: (q: string) => void;
  onOpenAuthoring?: (rulePack: string) => void;
}

export function CmcSurface({ onAsk, onOpenAuthoring }: CmcSurfaceProps) {
  const { packages, stability } = useCmc();
  const active = packages.filter((c) => c.status !== 'commercial').length;
  const open = packages.reduce((a, c) => a + c.open, 0);
  const avgStability = Math.round(stability.reduce((a, s) => a + s.pct, 0) / stability.length);
  const totalBatches = packages.reduce((a, c) => a + c.batches, 0);

  return (
    <>
      <h1 className="in-h1">CMC Module</h1>
      <p className="in-sub">Drug substance and drug product packages, stability programs, batch records and open deviations across the portfolio.</p>

      <div className="in-kpis">
        <div className="in-kpi"><div className="lbl">Active CMC packages</div><div className="val">{active}</div><div className="sub">2 commercial (lifecycle)</div></div>
        <div className="in-kpi"><div className="lbl">Stability programs</div><div className="val">{stability.length}</div><div className="sub">Avg {avgStability}% complete</div></div>
        <div className="in-kpi"><div className="lbl">Batches on file</div><div className="val">{totalBatches}</div><div className="sub">73 GMP · 12 PPQ</div></div>
        <div className="in-kpi"><div className="lbl">Open deviations</div><div className="val">{open}</div><div className="sub"><span className="delta-warn">2 critical</span> · 4 minor</div></div>
      </div>

      <div className="in-sec">
        <div className="in-sec-head">
          <h2>CMC packages</h2>
          <span className="meta">Drug substance + drug product</span>
          <span className="spacer" />
          <button className="link" type="button" onClick={() => onOpenAuthoring?.('mod3:ich')}>Module 3 in authoring {I.arrowRight}</button>
        </div>
        <div className="in-table">
          <div className="in-thead" style={{ gridTemplateColumns: COLS }}>
            <span>Program</span><span>Kind</span><span>DS site</span><span>DP site</span><span>Shelf life</span><span>Batches</span><span>Stability</span><span>Open finding</span><span>Status</span>
          </div>
          {packages.map((c, i) => (
            <div key={i} className="in-row" style={{ gridTemplateColumns: COLS }}>
              <span className="prog">{c.program}</span>
              <span className="name">{c.kind}</span>
              <span className="num">{c.ds_site}</span>
              <span className="num">{c.dp_site}</span>
              <span className="num">{c.shelf}</span>
              <span className="num">{c.batches}</span>
              <span className="num">{c.stability_pct}%</span>
              <span className="sub" style={{ color: c.blocker ? 'var(--text-200)' : '#5a6e44', fontSize: 11.5 }}>
                {c.blocker || 'No open findings'}
              </span>
              <span><span className={`in-status ${c.status}`}><span className="dot" />{c.status}</span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="in-split">
        <div className="in-card">
          <h3>Stability programs</h3>
          {stability.map((s, i) => (
            <div key={i} className="row">
              <div className="k">
                <div>{s.program} · {s.kind}</div>
                <div className="sub">Target {s.timepoint} · completed {s.completed}</div>
              </div>
              <div className="v">{s.pct}%</div>
            </div>
          ))}
        </div>
        <div className="in-card">
          <h3>Specification library</h3>
          <div className="row"><div className="k">Drug substance (mAb · IgG1κ)<div className="sub">ICH Q6B aligned · 23 CQAs</div></div><div className="v">v4.1</div></div>
          <div className="row"><div className="k">Drug substance (ADC)<div className="sub">DAR + free payload spec under negotiation</div></div><div className="v">v2.3</div></div>
          <div className="row"><div className="k">Drug substance (small molecule)<div className="sub">ICH Q6A aligned · ICH Q3D elementals</div></div><div className="v">v5.0</div></div>
          <div className="row"><div className="k">Drug product (5 / 10 mg/mL)<div className="sub">USP &lt;1207&gt; CCI methods</div></div><div className="v">v3.2</div></div>
        </div>
      </div>

      <AnaStrip activeNav="cmc" onAsk={onAsk} />
    </>
  );
}
