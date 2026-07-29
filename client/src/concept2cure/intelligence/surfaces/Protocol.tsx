/**
 * ProtocolSurface — port of ui_kits/intelligence/surfaces.jsx ProtocolSurface.
 * Active protocols + endpoint library + amendments. Hands off to Authoring
 * (rule pack = protocol:ich). Read-only.
 *
 * @module client/src/concept2cure/intelligence/surfaces/Protocol
 */

import * as React from 'react';
import { I } from '../icons';
import { AnaStrip } from '../AnaStrip';
import { useProtocols } from '../hooks';

const COLS = '110px 90px 1fr 130px 110px 110px 110px 36px';

export interface ProtocolSurfaceProps {
  onAsk: (q: string) => void;
  onOpenAuthoring?: (rulePack: string) => void;
}

export function ProtocolSurface({ onAsk, onOpenAuthoring }: ProtocolSurfaceProps) {
  const { protocols, endpoints, amendments } = useProtocols();
  const active = protocols.filter((p) => p.status === 'active').length;
  const blocked = protocols.filter((p) => p.status === 'blocked').length;

  return (
    <>
      <h1 className="in-h1">Protocol and Study Design</h1>
      <p className="in-sub">Active protocols across the portfolio, endpoint library grounded in ICH guidance and agency precedent, amendment workflow tied to authoring.</p>

      <div className="in-kpis">
        <div className="in-kpi"><div className="lbl">Active protocols</div><div className="val">{active}</div><div className="sub">{blocked} blocked · 1 overdue amendment</div></div>
        <div className="in-kpi"><div className="lbl">Templates</div><div className="val">28</div><div className="sub">ICH E6 R3 · adaptive · master protocol</div></div>
        <div className="in-kpi"><div className="lbl">Endpoint library</div><div className="val">{endpoints.length}</div><div className="sub">Indication-mapped to precedent</div></div>
        <div className="in-kpi"><div className="lbl">Amendments in flight</div><div className="val">{amendments.length}</div><div className="sub">1 IRB pending · 1 IRB approved</div></div>
      </div>

      <div className="in-sec">
        <div className="in-sec-head">
          <h2>Active protocols</h2>
          <span className="meta">{protocols.length} studies</span>
          <span className="spacer" />
          <button className="link" type="button" onClick={() => onOpenAuthoring?.('protocol:ich')}>Open in authoring {I.arrowRight}</button>
        </div>
        <div className="in-table">
          <div className="in-thead" style={{ gridTemplateColumns: COLS }}>
            <span>Protocol</span><span>Program</span><span>Indication · phase</span><span>Sites · enrolled</span><span>Lead</span><span>Status</span><span>Updated</span><span />
          </div>
          {protocols.map((p) => (
            <div key={p.id} className="in-row" style={{ gridTemplateColumns: COLS }}>
              <span className="id">{p.id}</span>
              <span className="prog">{p.program}</span>
              <span>
                <div className="name">{p.indication}</div>
                <div className="sub">{p.phase} · {p.amendments} amend</div>
              </span>
              <span className="num">{p.sites} sites<br /><span className="sub">{p.enrolled}</span></span>
              <span className="num">{p.lead}</span>
              <span><span className={`in-status ${p.status}`}><span className="dot" />{p.status}</span></span>
              <span className="num">{p.updated}</span>
              <button className="in-tb-btn" type="button" onClick={(e) => e.stopPropagation()}>{I.more}</button>
            </div>
          ))}
        </div>
      </div>

      <div className="in-split">
        <div className="in-card">
          <h3>Endpoint library</h3>
          {endpoints.map((e, i) => (
            <div key={i} className="in-ep">
              <div>
                <div className="kind">{e.kind}</div>
                <div className="hint">{e.hint}</div>
                <div className="meta">{e.guidance}</div>
              </div>
              <div className="precedent"><span className="lbl">precedent</span>{e.precedent}</div>
            </div>
          ))}
        </div>
        <div className="in-card">
          <h3>Amendments</h3>
          {amendments.map((a, i) => (
            <div key={i} className="row">
              <div className="k">
                <div>{a.id}</div>
                <div className="sub">{a.what}</div>
              </div>
              <div className="v">
                <div>{a.kind}</div>
                <div style={{ fontSize: 10.5 }}>{a.status} · {a.updated}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnaStrip activeNav="protocol" onAsk={onAsk} />
    </>
  );
}
