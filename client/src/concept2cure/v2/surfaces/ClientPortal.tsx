import React, { useMemo, useState } from 'react';
import { I } from '../icons';
import { SampleTag, useLive } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/auth-entry.css';

interface CpProgram { id: string; title: string; pathway: string; readiness: number; status: string; next: string; blocker: string | null }
interface CpDeliverable { name: string; prog: string; status: string; when: string; sig: boolean }
interface CpUpdate { who: string; what: string; when: string }
interface CpData {
  client: string; cro: string; user: string; mode?: 'client' | 'preview';
  programs: CpProgram[]; deliverables: CpDeliverable[]; updates: CpUpdate[];
}

/* Fixture — the fail-closed shape shown with the Sample pill when the live
   /api/client-portal/overview is unreachable (offline, or the caller is not
   scoped to a client workspace). Never presented as live. */
const CP: CpData = {
  client: 'Meridian Therapeutics',
  cro: 'Vertex CRO',
  user: 'Dr. Elena Ruiz',
  programs: [
    { id: 'mer1', title: 'MER-204 — IND enabling', pathway: 'IND', readiness: 72, status: 'active', next: 'IND filing · 38 days', blocker: null },
    { id: 'mer2', title: 'MER-118 — 510(k)', pathway: '510(k)', readiness: 48, status: 'active', next: 'Predicate analysis in review', blocker: 'Awaiting your device spec sign-off' },
    { id: 'mer3', title: 'MER-090 — CER refresh', pathway: 'EU MDR', readiness: 91, status: 'active', next: 'Notified body submission · Q1', blocker: null },
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

const CP_T: Record<string, string> = { shared: 'ai', review: 'warn', approved: 'ok', active: 'ai', final: 'ok', released: 'ok', signed: 'ok' };

/** Relative "2 d ago" from an ISO timestamp; passthrough for the fixture's
    already-humanized strings. */
function ago(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v; // fixture literal
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days < 14) return `${days} d ago`;
  return `${Math.round(days / 7)} wk ago`;
}

/** Adopt the live overview only when it structurally matches the display
    contract; otherwise keep the fixture (fail-closed). */
function mapLive(payload: unknown): CpData | null {
  if (!payload || typeof payload !== 'object') return null;
  const d = (payload as { data?: unknown }).data;
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  if (typeof o.client !== 'string' || !Array.isArray(o.programs)) return null;
  return {
    client: o.client,
    cro: typeof o.cro === 'string' ? o.cro : '',
    user: typeof o.user === 'string' ? o.user : 'You',
    mode: o.mode === 'preview' ? 'preview' : 'client',
    programs: o.programs as CpProgram[],
    deliverables: Array.isArray(o.deliverables) ? (o.deliverables as CpDeliverable[]) : [],
    updates: Array.isArray(o.updates) ? (o.updates as CpUpdate[]) : [],
  };
}

export function ClientPortal({ onAsk, onNav }: SurfaceViewProps) {
  const [ctxOpen, setCtxOpen] = useState(true);
  // Forward ?clientWorkspaceId= so CRO staff can preview a specific client, and
  // a multi-workspace client can pick one. The backend still authorizes it
  // (staff → own-org ownership; client → a matching client_access row); this
  // only carries the intent. Numeric-only, so nothing arbitrary hits the query.
  const wsId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('clientWorkspaceId')
      : null;
  const path =
    wsId && /^\d+$/.test(wsId)
      ? `/api/client-portal/overview?clientWorkspaceId=${wsId}`
      : '/api/client-portal/overview';
  const raw = useLive<unknown>(path, null);
  const live = useMemo(() => (raw.sample ? null : mapLive(raw.data)), [raw.sample, raw.data]);
  const isLive = live !== null;
  const cp: CpData = live ?? CP;
  return (
    <div className="cp">
      {/* Preview banner only for CRO staff previewing a client (mode!=='client');
          the client themselves has no "your workspace" to return to. */}
      {ctxOpen && cp.mode !== 'client' && (
        <div className="cp-ctx">
          <span className="cp-ctx-ic">{I.eye || I.info}</span>
          <span className="cp-ctx-t"><b>External client view.</b> This is the read-only portal your client ({cp.client}) sees — program status and shared deliverables only, no internal tools.</span>
          <button className="cp-ctx-back" onClick={() => onNav('project-home')}>Back to your workspace {I.arrowRight}</button>
          <button className="cp-ctx-x" onClick={() => setCtxOpen(false)} title="Dismiss" aria-label="Dismiss">{I.close || '×'}</button>
        </div>
      )}

      <header className="cp-top">
        <div className="cp-brand"><b>Concept2Cure<span>.RI</span></b><span className="cp-tag">Client workspace</span></div>
        <div className="cp-top-r">
          <span className="cp-org">{cp.cro ? <>{cp.cro} {'→'} </> : null}{cp.client}</span>
          <span className="avatar" style={{ width: 28, height: 28 }}>
            {cp.user.split(' ').map(x => x[0]).join('').slice(0, 2)}
          </span>
        </div>
      </header>

      <div className="cp-body">
        <div className="cp-hero">
          <div>
            <div className="ph-eyebrow">Welcome{cp.user ? `, ${cp.user.split(' ').slice(-1)[0]}` : ''}</div>
            <h1 className="ph-title" style={{ fontSize: 26 }}>
              Your programs{cp.cro ? ` with ${cp.cro}` : ''} <SampleTag sample={!isLive} />
            </h1>
            <div className="ph-sub">A read-only view of everything your regulatory partner is building for you — status, shared deliverables, and what needs your input.</div>
          </div>
          <button className="btn primary" onClick={() => onAsk('Ask a question')}>{I.sparkles} Ask a question</button>
        </div>

        {cp.programs.length === 0 && (
          <div className="scaf-note" style={{ maxWidth: 560 }}>
            No active programs yet. Your regulatory partner will share programs and deliverables
            here as work begins.
          </div>
        )}
        <div className="cp-grid">
          {cp.programs.map(p => (
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
            <div className="sec-hdr"><div className="sec-title">Shared deliverables</div><div className="sec-sub">{cp.deliverables.length} document{cp.deliverables.length === 1 ? '' : 's'}</div></div>
            {cp.deliverables.length === 0 ? (
              <div className="scaf-note">No deliverables have been shared with you yet.</div>
            ) : (
              <div className="ctable">
                <div className="ct-head" style={{ gridTemplateColumns: '1fr 90px 100px 90px' }}><div>Document</div><div>Program</div><div>Status</div><div>Shared</div></div>
                {cp.deliverables.map((d, i) => (
                  <button key={i} className="ct-row" style={{ gridTemplateColumns: '1fr 90px 100px 90px' }}>
                    <div className="vn"><span className="ct-strong">{d.name}</span>{d.sig && <span className="esig">{I.shieldCheck}</span>}</div>
                    <div className="mono" style={{ fontSize: 11 }}>{d.prog}</div>
                    <div><span className={`rd-chip tone-${CP_T[d.status] || 'ai'}`}>{d.status}</span></div>
                    <div style={{ color: 'var(--text-400)' }}>{ago(d.when)}</div>
                  </button>
                ))}
              </div>
            )}
          </section>
          <aside>
            <div className="sec-hdr"><div className="sec-title">Updates</div></div>
            <div className="ph-card">
              {cp.updates.length === 0 ? (
                <div className="scaf-note" style={{ margin: 0 }}>No recent updates.</div>
              ) : (
                cp.updates.map((u, i) => (
                  <div key={i} className="ph-act">
                    <span className="ph-act-w">{u.who === 'AnA' ? '✻' : (u.who || '·').split(' ')[0]}</span>
                    <span className="ph-act-t">{u.what}</span>
                    <span className="ph-act-n">{ago(u.when)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="cp-note">Need to share a file or request a change? Your CRO is notified instantly. All exchanges are logged under 21 CFR Part 11.</div>
          </aside>
        </div>
      </div>
    </div>
  );
}
