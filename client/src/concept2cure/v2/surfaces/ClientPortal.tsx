import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag, connected } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/auth-entry.css';

const CP = {
  client: 'Meridian Therapeutics',
  cro: 'Vertex CRO',
  user: 'Dr. Elena Ruiz',
  programs: [
    { id: 'mer1', title: 'MER-204 — IND enabling', pathway: 'IND', readiness: 72, status: 'active', next: 'IND filing · 38 days', blocker: null as string | null },
    { id: 'mer2', title: 'MER-118 — 510(k)', pathway: '510(k)', readiness: 48, status: 'active', next: 'Predicate analysis in review', blocker: 'Awaiting your device spec sign-off' },
    { id: 'mer3', title: 'MER-090 — CER refresh', pathway: 'EU MDR', readiness: 91, status: 'active', next: 'Notified body submission · Q1', blocker: null as string | null },
  ],
  deliverables: [
    { name: 'IND draft — Module 2.5 Clinical Overview', prog: 'MER-204', status: 'shared', when: '2 d ago', sig: false },
    { name: 'Predicate comparison report', prog: 'MER-118', status: 'review', when: '5 h ago', sig: false },
    { name: 'CER v3.1 — final', prog: 'MER-090', status: 'approved', when: '1 wk ago', sig: true },
    { name: 'Gap assessment summary', prog: 'MER-118', status: 'shared', when: '3 d ago', sig: false },
  ],
  updates: [
    { who: 'Vertex CRO', what: 'shared the IND Module 2.5 draft for your review', when: '2 d ago' },
    { who: 'AnA', what: 'flagged 2 open items on MER-118 needing your input', when: '3 d ago' },
    { who: 'Vertex CRO', what: 'CER v3.1 approved and sealed', when: '1 wk ago' },
  ],
};

const CP_T: Record<string, string> = { shared: 'ai', review: 'warn', approved: 'ok', active: 'ai' };

export function ClientPortal({ onAsk, onNav }: SurfaceViewProps) {
  const [ctxOpen, setCtxOpen] = useState(true);
  return (
    <div className="cp">
      {ctxOpen && (
        <div className="cp-ctx">
          <span className="cp-ctx-ic">{I.eye || I.info}</span>
          <span className="cp-ctx-t"><b>External client view.</b> This is the read-only portal your client ({CP.client}) sees — program status and shared deliverables only, no internal tools.</span>
          <button className="cp-ctx-back" onClick={() => onNav('project-home')}>Back to your workspace {I.arrowRight}</button>
          <button className="cp-ctx-x" onClick={() => setCtxOpen(false)} title="Dismiss" aria-label="Dismiss">{I.close || '×'}</button>
        </div>
      )}

      <header className="cp-top">
        <div className="cp-brand"><b>Concept2Cure<span>.RI</span></b><span className="cp-tag">Client workspace</span></div>
        <div className="cp-top-r">
          <span className="cp-org">{CP.cro} {'→'} {CP.client}</span>
          <span className="avatar" style={{ width: 28, height: 28 }}>
            {CP.user.split(' ').map(x => x[0]).join('').slice(0, 2)}
          </span>
        </div>
      </header>

      <div className="cp-body">
        <div className="cp-hero">
          <div>
            <div className="ph-eyebrow">Welcome, {CP.user.split(' ')[1]}</div>
            <h1 className="ph-title" style={{ fontSize: 26 }}>
              Your programs with {CP.cro} <SampleTag sample={!connected()} />
            </h1>
            <div className="ph-sub">A read-only view of everything your regulatory partner is building for you — status, shared deliverables, and what needs your input.</div>
          </div>
          <button className="btn primary" onClick={() => onAsk('Ask a question')}>{I.sparkles} Ask a question</button>
        </div>

        <div className="cp-grid">
          {CP.programs.map(p => (
            <div key={p.id} className="cp-card">
              <div className="cp-card-top">
                <span className="rd-chip tone-ai">{p.pathway}</span>
                <span className={`rd-chip tone-${CP_T[p.status]}`}>{p.status}</span>
              </div>
              <div className="cp-card-t">{p.title}</div>
              <div className="ph-bar-track" style={{ margin: '12px 0 6px' }}>
                <div className="ph-bar-fill" data-tone={p.blocker ? 'warn' : 'ok'} style={{ width: p.readiness + '%' }} />
              </div>
              <div className="cp-card-meta"><span>{p.readiness}% ready</span><span>{p.next}</span></div>
              {p.blocker && <div className="ed-flag" data-sev="warn" style={{ marginTop: 10 }}><span className="ico">{I.alertTriangle}</span><span>{p.blocker}</span></div>}
            </div>
          ))}
        </div>

        <div className="cp-cols">
          <section>
            <div className="sec-hdr"><div className="sec-title">Shared deliverables</div><div className="sec-sub">{CP.deliverables.length} documents</div></div>
            <div className="ctable">
              <div className="ct-head" style={{ gridTemplateColumns: '1fr 90px 100px 90px' }}><div>Document</div><div>Program</div><div>Status</div><div>Shared</div></div>
              {CP.deliverables.map((d, i) => (
                <button key={i} className="ct-row" style={{ gridTemplateColumns: '1fr 90px 100px 90px' }}>
                  <div className="vn"><span className="ct-strong">{d.name}</span>{d.sig && <span className="esig">{I.shieldCheck}</span>}</div>
                  <div className="mono" style={{ fontSize: 11 }}>{d.prog}</div>
                  <div><span className={`rd-chip tone-${CP_T[d.status]}`}>{d.status}</span></div>
                  <div style={{ color: 'var(--text-400)' }}>{d.when}</div>
                </button>
              ))}
            </div>
          </section>
          <aside>
            <div className="sec-hdr"><div className="sec-title">Updates</div></div>
            <div className="ph-card">
              {CP.updates.map((u, i) => (
                <div key={i} className="ph-act">
                  <span className="ph-act-w">{u.who === 'AnA' ? '✻' : u.who.split(' ')[0]}</span>
                  <span className="ph-act-t">{u.what}</span>
                  <span className="ph-act-n">{u.when}</span>
                </div>
              ))}
            </div>
            <div className="cp-note">Need to share a file or request a change? Your CRO is notified instantly. All exchanges are logged under 21 CFR Part 11.</div>
          </aside>
        </div>
      </div>
    </div>
  );
}
