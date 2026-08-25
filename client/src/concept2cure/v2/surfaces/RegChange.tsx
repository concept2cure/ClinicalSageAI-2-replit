import React, { useState, useEffect, useMemo } from 'react';

import { usePublishSurfaceContext } from '../surfaceContext';
import { I } from '../icons';
import { EmptyState, useLiveRows } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import { shellProgramName } from '../shellProject';

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
  /* The open programme, named as a person would say it — never a hardcoded
     product. `null` when no programme is open, and every caller below phrases
     its request without one rather than substituting a placeholder: an
     assistant that has to ask which programme beats one confidently answering
     about the wrong one. */
  const program = shellProgramName();

  /* Fixture-free (real-data standard): the worklist reads the org's REAL
     regulatory-change store (reg_change_items, written via POST /api/reg-change).
     Real rows, an honest empty, or an honest error — never a fixture. `rows` is
     a fresh [] while loading/on error, so the KPI derivations are null-safe. */
  const live = useLiveRows<RciChange>('/api/reg-change');
  /* Gated on error as well as loading. `useLiveRows`/`useLiveData` return
     `data: null` on a FAILED read, so each count below derives from an empty
     list and resolves to 0 — and with `loading` already false the strip renders
     a SETTLED zero rather than a placeholder. Rows are empty in three
     situations and only the third may say "nothing is on file"; the pattern is
     MarketAccess.tsx:62. */
  const kv = (n: number | string) => (live.loading || live.error ? '—' : String(n));
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

  /* What AnA can see of this screen.
     She knew the user was on "reg-change" and nothing else — not how many
     changes are tracked, which ones touch this portfolio, or which change is
     open — so "does this affect us?" could only be answered by the user
     retyping their own worklist.

     A failed read publishes the failure. `live.rows` is [] both when the
     horizon scan is genuinely clear and when the read threw, and "0 changes
     tracked" over an outage would tell a regulatory lead that nothing is
     coming when in fact nothing is known. */
  const anaContext = useMemo(() => {
    if (live.loading) {
      return { summary: 'The regulatory-change worklist is still loading; nothing on screen is final yet.' };
    }
    if (live.error) {
      return {
        summary:
          'The regulatory-change worklist could not be read, so this screen shows no changes because of a failure, not because none are tracked.',
        availableActions: ['Retry the regulatory-change read'],
      };
    }
    const sel = changes.find((c) => c.id === open) ?? null;
    return {
      summary:
        `Regulatory change intelligence: ${changes.length} change(s) tracked, ${affecting} affecting this portfolio, ` +
        `${actionReq} requiring action, ${inForce} in force or imminent` +
        (sel ? `; "${sel.title}" open` : ''),
      facts: {
        tracked: changes.length,
        affectingPortfolio: affecting,
        actionRequired: actionReq,
        inForceOrImminent: inForce,
        selected: sel
          ? {
              id: sel.id, title: sel.title, source: sel.src, kind: sel.kind,
              severity: sel.sev, inForce: sel.live, effective: sel.when,
              owner: sel.owner, due: sel.due, action: sel.action,
              affectsCount: (sel.affects ?? []).length,
            }
          : null,
      },
      availableActions: [
        'Open a change to see its impact assessment and the action it resolves to',
        'Assess a change against the portfolio',
        'Draft the impact assessment for a tracked change',
      ],
    };
  }, [live.loading, live.error, changes, open, affecting, actionReq, inForce]);
  usePublishSurfaceContext('reg-change', anaContext);

  return (
    <div className="reg-wrap">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Platform {I.dot} intelligence</div>
          <h1 className="reg-title">Regulatory change intelligence</h1>
          <p className="reg-sub">Horizon scan of FDA guidance, ISO/IEC standard revisions, and EU MDR/IVDR &amp; AI-Act changes &mdash; each assessed for impact against your portfolio and resolved to an action document. Not a feed: a worklist.</p>
        </div>
        {/* ── The scan asked about a product the customer does not own ───────
            `'…affecting the BX-204 portfolio'` was a string literal. BX-204 is
            a demo fixture programme, so every real tenant pressing this got a
            regulatory-change scan scoped to someone else's imaginary product.

            The open programme now names itself. When none is open the request
            is phrased without one — an assistant that has to ask which
            portfolio is better than one confidently answering about the
            wrong one. */}
        {ask && <button className="reg-cta" onClick={() => ask(
          program
            ? `Scan regulatory changes affecting the ${program} portfolio and draft the impact assessments`
            : 'Scan regulatory changes affecting my portfolio and draft the impact assessments'
        )}>{I.sparkles} Scan with AnA</button>}
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">{kv(changes.length)}</div><div className="reg-kpi-l">Changes tracked</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{kv(affecting)}</div><div className="reg-kpi-l">Affect your portfolio</div></div>
        <div className="reg-kpi" data-tone="err"><div className="reg-kpi-v">{kv(actionReq)}</div><div className="reg-kpi-l">Action required</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{kv(inForce)}</div><div className="reg-kpi-l">In force / imminent</div></div>
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
                      {ask && <button className="rci-act pri" onClick={() => ask(
                        program
                          ? `Draft the ${c.doc} for ${c.title} — assess impact on the ${program} portfolio`
                          : `Draft the ${c.doc} for ${c.title} — assess the impact on my portfolio`
                      )}>{I.sparkles} Assess &amp; draft</button>}
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
