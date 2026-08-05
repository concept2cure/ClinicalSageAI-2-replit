import React, { useState } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import type { SurfaceViewProps, OwnedSurfaceViewProps } from '../surfaceViews';
import '../styles/auth-entry.css';

/* ════ ClientPortal — the read-only view a CRO's client sees ════

   Fixture-free by construction. Every rendered value is real org-scoped data
   from GET /api/client-portal/overview (server/routes/client-portal.ts), which
   resolves the caller's single client workspace server-side from the verified
   JWT and returns ONLY that workspace's programs, shared deliverables and
   recent updates. There is no fabricated stand-in: a caller with no portal, or
   a backend that can't be reached, gets an honest error state; a client whose
   partner has not shared anything yet gets an honest empty state. */

interface CpProgram { id: string; title: string; pathway: string; readiness: number; status: string; next: string; blocker: string | null }
interface CpDeliverable { name: string; prog: string; status: string; when: string; sig: boolean }
interface CpUpdate { who: string; what: string; when: string }
/** The render contract of GET /api/client-portal/overview (its `data` payload). */
interface CpData {
  client: string; cro: string; user: string; mode?: 'client' | 'preview';
  programs: CpProgram[]; deliverables: CpDeliverable[]; updates: CpUpdate[];
}

const CP_T: Record<string, string> = { shared: 'ai', review: 'warn', approved: 'ok', active: 'ai', final: 'ok', released: 'ok', signed: 'ok' };

/** Relative "2 d ago" from the ISO timestamps the overview returns; a blank or
    unparseable value passes through unchanged. */
function ago(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days < 14) return `${days} d ago`;
  return `${Math.round(days / 7)} wk ago`;
}

export function ClientPortal({ onNav }: OwnedSurfaceViewProps) {
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
  const { data: cp, loading, error } = useLiveData<CpData>(path);

  // Loading / unavailable — render the branded shell with an honest state, never
  // a fabricated workspace. A 401/403 means this portal isn't shared with the
  // caller's account; anything else is a genuine load failure.
  if (loading || !cp) {
    const notShared = !!error && /\b40[13]\b/.test(error);
    return (
      <div className="cp">
        <div className="cp-body">
          {loading ? (
            <EmptyState
              title="Loading your workspace…"
              hint="Fetching your programs and shared deliverables."
              icon={I.clock}
            />
          ) : notShared ? (
            <EmptyState
              tone="error"
              title="This workspace isn't shared with your account"
              hint="Ask your regulatory partner to grant your account access to their client portal, then reload."
              icon={I.lock}
            />
          ) : (
            <EmptyState
              tone="error"
              title="We couldn't load your workspace"
              hint="The client portal is temporarily unavailable. Please reload in a moment."
              icon={I.alertTriangle}
            />
          )}
        </div>
      </div>
    );
  }

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

      {/* No `cp-top` header.

          It drew a sticky 54px bar with the product wordmark, a "Client
          workspace" tag, the CRO→client pair and an avatar — beneath the
          shell's own 48px TopBar, which already carries a breadcrumb, an org
          switcher and the same person's avatar. `hideAna: true` zeroes the AnA
          column only; `V2App.tsx:244,253` render the Rail and TopBar
          unconditionally. So this surface showed two top bars, two avatars for
          one user and the wordmark twice, on a screen whose own copy calls
          itself "the read-only portal your client sees — no internal tools".

          The one thing `cp-top` carried that nothing else did is `cp.client`.
          It moves to the hero eyebrow below. */}
      <div className="cp-body">
        <div className="cp-hero">
          <div>
            <div className="ph-eyebrow">
              Welcome{cp.user ? `, ${cp.user.split(' ').slice(-1)[0]}` : ''}
              {cp.client ? ` · ${cp.client}` : ''}
            </div>
            <h1 className="ph-title" style={{ fontSize: 26 }}>
              Your programs{cp.cro ? ` with ${cp.cro}` : ''}
            </h1>
            <div className="ph-sub">A read-only view of everything your regulatory partner is building for you — status, shared deliverables, and what needs your input.</div>
          </div>
          {/* No "Ask a question" button. It passed its own LABEL as the
              question — `onAsk('Ask a question')` — into a rail this surface
              does not draw, so the literal string "Ask a question" was sent to
              the assistant and the answer appeared later on some other screen.
              A client portal has no assistant by design (surfaceViews.ts:140). */}
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
