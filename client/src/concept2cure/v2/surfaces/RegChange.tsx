import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveRows } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Render contract (GET /api/reg-change → { data: RciChange[] }) ── */

interface RciAffect {
  dev: string;
  what: string;
  sub: string;
}

interface RciChange {
  id: string;
  src: string;
  kind: string;
  when: string;
  sev: string;
  live: boolean;
  title: string;
  summary: string;
  affects: RciAffect[];
  action: string;
  doc: string;
  owner: string;
  due: string;
}

const _RCI_SEV: Record<string, string> = { high: 'err', med: 'warn', low: 'ok' };
const _RCI_SEVL: Record<string, string> = { high: 'Action required', med: 'Review', low: 'Monitor' };

/* ════ RegChange -- regulatory change intelligence surface ════ */

export function RegChange({ onAsk }: SurfaceViewProps) {
  /* Fixture-free (real-data standard): the worklist reads the org's REAL
     regulatory-change store (reg_change_items, written via POST /api/reg-change).
     Real rows, an honest empty, or an honest error — never a fixture. `rows` is
     a fresh [] while loading/on error, so the KPI derivations are null-safe. */
  const live = useLiveRows<RciChange>('/api/reg-change');
  const changes = live.rows;
  const [open, setOpen] = useState<string | null>(null);

  /* Open the first (highest-severity) change once the worklist arrives. */
  const firstId = changes[0]?.id;
  useEffect(() => {
    if (firstId) setOpen((o) => o ?? firstId);
  }, [firstId]);

  /* `affects` is a nullable impact list — a change recorded before its portfolio
     assessment ran has no row at all, so the KPI counts it as affecting nothing
     rather than throwing on the whole worklist. */
  const affecting = changes.filter(c => (c.affects ?? []).length).length;
  const actionReq = changes.filter(c => c.sev === 'high').length;
  const inForce = changes.filter(c => c.live).length;
  const ask = onAsk;

  return (
    <div className="reg-wrap">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Platform {I.dot} intelligence</div>
          <h1 className="reg-title">Regulatory change intelligence</h1>
          <p className="reg-sub">Horizon scan of FDA guidance, ISO/IEC standard revisions, and EU MDR/IVDR &amp; AI-Act changes &mdash; each assessed for impact against your portfolio and resolved to an action document. Not a feed: a worklist.</p>
        </div>
        {ask && <button className="reg-cta" onClick={() => ask('Scan regulatory changes affecting the BX-204 portfolio and draft the impact assessments')}>{I.sparkles} Scan with AnA</button>}
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">{changes.length}</div><div className="reg-kpi-l">Changes tracked</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{affecting}</div><div className="reg-kpi-l">Affect your portfolio</div></div>
        <div className="reg-kpi" data-tone="err"><div className="reg-kpi-v">{actionReq}</div><div className="reg-kpi-l">Action required</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{inForce}</div><div className="reg-kpi-l">In force / imminent</div></div>
      </div>

      <div className="rci-feed">
        {live.loading ? (
          <EmptyState title="Loading regulatory changes…" />
        ) : live.error ? (
          <EmptyState tone="error" title="Couldn’t load regulatory changes" hint="Sign in and retry, or check the service." />
        ) : changes.length === 0 ? (
          <EmptyState
            title="No regulatory changes tracked yet"
            hint="Record a tracked change — or ask AnA to scan the horizon — and its portfolio impact appears here as a worklist."
          />
        ) : changes.map(c => {
          const isOpen = open === c.id;
          return (
            <div key={c.id} className="rci-card" data-open={isOpen || undefined}>
              <button className="rci-top" onClick={() => setOpen(isOpen ? null : c.id)}>
                <span className={`rci-kind ${c.kind}`}>{c.kind}</span>
                <span className="rci-mid">
                  <span className="rci-title">{c.title}</span>
                  <span className="rci-meta">{c.src} {I.dot} {c.when}</span>
                </span>
                <span className={`reg-pill ${_RCI_SEV[c.sev]}`}>{_RCI_SEVL[c.sev]}</span>
                <span className="rci-chev">{isOpen ? I.chevDown : (I.chevRight || I.right)}</span>
              </button>
              {isOpen && (
                <div className="rci-body">
                  <p className="rci-summary">{c.summary}</p>
                  <div className="rci-impact-h">{I.network} Portfolio impact</div>
                  {/* Same absent impact list as the KPI above: an unassessed
                      change renders the heading and no impact rows. */}
                  {(c.affects ?? []).map((a, i) => (
                    <div key={i} className="rci-impact">
                      <div className="rci-imp-dev">{a.dev}<span className="rci-imp-sub">{a.sub}</span></div>
                      <div className="rci-imp-what">{a.what}</div>
                    </div>
                  ))}
                  <div className="rci-foot">
                    <div className="rci-doc">{I.fileText} Generates <b>{c.doc}</b> {I.dot} {c.owner} {I.dot} {c.due}</div>
                    <div className="rci-acts">
                      {ask && <button className="rci-act pri" onClick={() => ask(`Draft the ${c.doc} for ${c.title} — assess impact on the BX-204 portfolio`)}>{I.sparkles} Assess &amp; draft</button>}
                      {ask && <button className="rci-act" onClick={() => ask(`Show the full text and citations for ${c.title}`)}>Open source</button>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
