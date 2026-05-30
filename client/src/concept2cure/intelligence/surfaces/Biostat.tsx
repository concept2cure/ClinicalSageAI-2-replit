/**
 * BiostatSurface — port of ui_kits/intelligence/surfaces.jsx BiostatSurface.
 * SAP table + TLF queue + interim analyses + sample-size calculator card.
 * Hands off to Authoring (rule pack = mod2:ich for SAP narratives). Read-only.
 *
 * The sample-size card mirrors the kit: uncontrolled inputs over the designed
 * fixture value. A server compute endpoint (audit-only) wires later per
 * PHASE_11_INSTALL.md §3.
 *
 * @module client/src/concept2cure/intelligence/surfaces/Biostat
 */

import * as React from 'react';
import { I } from '../icons';
import { AnaStrip } from '../AnaStrip';
import { useBiostat } from '../hooks';

const COLS = '170px 80px 110px 1fr 140px 110px 100px 110px';

export interface BiostatSurfaceProps {
  onAsk: (q: string) => void;
  onOpenAuthoring?: (rulePack: string) => void;
}

export function BiostatSurface({ onAsk, onOpenAuthoring }: BiostatSurfaceProps) {
  const { saps, sampleSize, tlfQueue, interims } = useBiostat();
  const drafted = saps.filter((s) => s.status === 'drafted').length;
  const review = saps.filter((s) => s.status === 'review').length;

  return (
    <>
      <h1 className="in-h1">Biostatistics</h1>
      <p className="in-sub">Statistical analysis plans, sample size studies, TLF packages and pre-planned interim analyses across active studies.</p>

      <div className="in-kpis">
        <div className="in-kpi"><div className="lbl">Active SAPs</div><div className="val">{saps.length}</div><div className="sub">{review} in review · {drafted} drafted</div></div>
        <div className="in-kpi"><div className="lbl">Power studies open</div><div className="val">3</div><div className="sub">BX204-301 · BX513-201 · BX301-101</div></div>
        <div className="in-kpi"><div className="lbl">TLF builds queued</div><div className="val">{tlfQueue.length}</div><div className="sub">Earliest due in 20 days</div></div>
        <div className="in-kpi"><div className="lbl">Interim analyses</div><div className="val">{interims.length}</div><div className="sub">All DSMB pre-planned</div></div>
      </div>

      <div className="in-sec">
        <div className="in-sec-head">
          <h2>Statistical analysis plans</h2>
          <span className="meta">Active SAPs across active studies</span>
          <span className="spacer" />
          <button className="link" type="button" onClick={() => onOpenAuthoring?.('mod2:ich')}>Open in authoring {I.arrowRight}</button>
        </div>
        <div className="in-table">
          <div className="in-thead" style={{ gridTemplateColumns: COLS }}>
            <span>SAP</span><span>Program</span><span>Study</span><span>Primary endpoint</span><span>Power / size</span><span>Owner</span><span>Status</span><span>Updated</span>
          </div>
          {saps.map((s, i) => (
            <div key={i} className="in-row" style={{ gridTemplateColumns: COLS }}>
              <span className="id">{s.id}</span>
              <span className="prog">{s.program}</span>
              <span className="num">{s.study}</span>
              <span>
                <div className="name">{s.primary}</div>
                <div className="sub">{s.alpha} · {s.power}</div>
              </span>
              <span className="num">{s.size}</span>
              <span className="num">{s.owner}</span>
              <span><span className={`in-status ${s.status}`}><span className="dot" />{s.status}</span></span>
              <span className="num">{s.updated}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="in-split">
        <div className="in-card">
          <h3>TLF queue</h3>
          {tlfQueue.map((t, i) => (
            <div key={i} className="row">
              <div className="k">
                <div>{t.id} · {t.program}</div>
                <div className="sub">{t.what} · due in {t.dueIn}</div>
              </div>
              <div className="v">
                <div>{t.pct}%</div>
                <div style={{ fontSize: 10.5 }}><span className={`in-status ${t.status}`}><span className="dot" />{t.status}</span></div>
              </div>
            </div>
          ))}
          <div style={{ borderTop: '1px dashed #e8e6dc', paddingTop: 10, marginTop: 6 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Interim analyses</h3>
            {interims.map((it, i) => (
              <div key={i} className="row">
                <div className="k">{it.study} · {it.kind}<div className="sub">{it.dsmb}</div></div>
                <div className="v">{it.date}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="in-card">
          <h3>Sample-size calculator</h3>
          <div className="in-calc">
            <div className="grid">
              <div><label>Alpha (1-sided)</label><input defaultValue={sampleSize.alpha} /></div>
              <div><label>Power</label><input defaultValue={sampleSize.power} /></div>
              <div><label>Effect (delta)</label><input defaultValue={sampleSize.delta} /></div>
              <div><label>Std dev</label><input defaultValue={sampleSize.sd} /></div>
            </div>
            <div className="out">
              <span className="lbl">Sample size</span>
              <span className="val">{sampleSize.expected}</span>
              <span className="unit">subjects (240/240)</span>
            </div>
          </div>
        </div>
      </div>

      <AnaStrip activeNav="biostat" onAsk={onAsk} />
    </>
  );
}
