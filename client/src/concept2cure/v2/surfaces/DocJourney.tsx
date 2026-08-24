import React, { useState } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Render-contract types (the shape GET /api/doc-journey returns) ── */

interface DjStage {
  id: string;
  label: string;
  ic: string;
  when: string;
  who: string;
  ver: string;
  done: boolean;
  active?: boolean;
  sub: string;
  kind: string;
}

interface DjBriefLine {
  mode: 'brief';
  title: string;
  lines: [string, string][];
}

interface DjOutlineSnap {
  mode: 'outline';
  title: string;
  items: string[];
  note: string;
}

interface DjQcCheck {
  mode: 'qc';
  heading: string;
  checks: [string, string, string][];
}

interface DjAssembleSnap {
  mode: 'assemble' | 'submit';
  heading: string;
  lines: [string, string][];
  note: string;
}

interface DjRedlineSpan {
  t: string;
  k: 'add' | 'keep';
}

interface DjComment {
  by: string;
  body: string;
  status: string;
}

interface DjDocSnap {
  mode: 'doc' | 'redline';
  heading: string;
  wm?: string;
  seal?: string;
  body?: (string | { sub: string })[];
  redline?: DjRedlineSpan[];
  comment?: DjComment;
  refs?: string[];
  prov?: string;
}

type DjSnap = DjBriefLine | DjOutlineSnap | DjQcCheck | DjAssembleSnap | DjDocSnap;

/* ── Sub-component: snapshot renderer ── */

function DJSnapshot({ snap, doc }: { snap: DjSnap; doc?: DjDocIdentity | null }) {
  const m = snap.mode;

  if (m === 'brief') {
    const s = snap as DjBriefLine;
    return (
      <div className="dj-card">
        <div className="dj-card-h">{s.title}</div>
        <table className="dj-brief">
          <tbody>
            {s.lines.map((r, i) => (
              <tr key={i}><td>{r[0]}</td><td>{r[1]}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (m === 'outline') {
    const s = snap as DjOutlineSnap;
    return (
      <div className="dj-card">
        <div className="dj-card-h">{s.title}</div>
        <div className="dj-outline">
          {s.items.map((t, i) => (
            <div key={i} className="dj-ol-row"><span>{I.fileText}</span>{t}</div>
          ))}
        </div>
        <div className="dj-note">{I.sparkles} {s.note}</div>
      </div>
    );
  }

  if (m === 'qc') {
    const s = snap as DjQcCheck;
    return (
      <div className="dj-card">
        <div className="dj-card-h">{s.heading}</div>
        <div className="dj-qc">
          {s.checks.map((c, i) => (
            <div key={i} className="dj-qc-row" data-st={c[1]}>
              <span className="dj-qc-ic">{c[1] === 'ok' ? I.check : I.alertTriangle}</span>
              <span className="dj-qc-l">{c[0]}</span>
              <span className="dj-qc-d">{c[2]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (m === 'assemble' || m === 'submit') {
    const s = snap as DjAssembleSnap;
    return (
      <div className="dj-card">
        <div className="dj-card-h">{s.heading}</div>
        <table className="dj-brief">
          <tbody>
            {s.lines.map((r, i) => (
              <tr key={i}><td>{r[0]}</td><td>{r[1]}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="dj-note">{m === 'submit' ? I.rocket : I.layers} {s.note}</div>
      </div>
    );
  }

  /* document page modes: draft / doc / redline */
  const s = snap as DjDocSnap;
  return (
    <>
      {/* The toolbar is the visual language of a document preview and stays —
          but its buttons are DISABLED, not wired to anything. They used to
          fire document.execCommand against a non-editable region: inert by
          accident. A control that cannot act renders as one that cannot act.
          (That also removed the last execCommand calls in the client — the
          canonical editor is v2/editor/RichSectionEditor.) */}
      <div className="dj-toolbar">
        <select className="dj-tb-sel" defaultValue="h" title="Read-only preview" disabled>
          <option value="t">Title</option>
          <option value="h">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="b">Body text</option>
        </select>
        <span className="dj-tb-sep" />
        <button className="dj-tb-b" title="Read-only preview" disabled><b>B</b></button>
        <button className="dj-tb-b" title="Read-only preview" disabled><i>I</i></button>
        <button className="dj-tb-b" title="Read-only preview" disabled><span style={{ textDecoration: 'underline' }}>U</span></button>
        <span className="dj-tb-sep" />
        <button className="dj-tb-b" title="Read-only preview" disabled>{I.list}</button>
        <button className="dj-tb-b" title="Read-only preview" disabled>1.</button>
        <span className="dj-tb-sep" />
        <button className="dj-tb-b" title="Read-only preview" disabled>{I.quote}</button>
        <button className="dj-tb-b" title="Read-only preview" disabled>{I.grid}</button>
        <span className="dj-tb-sep" />
        <button className="dj-tb-tc" title="Read-only preview" disabled><span className="dj-tb-dot" />Track changes</button>
        {/* Was: a green-check "Autosaved · v1.0" pill. This surface has no save
            path of any kind — its only request is GET /api/doc-journey. The
            page below carried `contentEditable` with no onInput, no state and
            no write, so anything typed was lost on reload AND on any re-render
            (selecting another stage re-renders s.body straight over the DOM).
            The pill asserted the opposite of what happened. */}
        <span className="dj-tb-save" title="This preview does not save. Author in Document Authoring.">
          Read-only preview · {s.seal ? 'v1.0' : s.wm ? s.wm.replace('DRAFT ', '') : 'v0.x'}
        </span>
      </div>
      {/* contentEditable removed with the same justification: an editable
          surface that cannot save is a trap, not a feature. The formatting
          toolbar above is left in place because it is the visual language of
          this preview, and execCommand on a non-editable region is inert. */}
      <div className={'dj-page' + (s.wm ? ' has-wm' : '')} spellCheck={false}>
        {s.wm && <div className="dj-wm" contentEditable={false}>{s.wm}</div>}
        {/* ── The masthead was three string literals ──────────────────────────
            "Concept2Cure Biosciences, Inc." / "2.5 Clinical Overview" /
            "BX-204 (rezatinib) · BLA 761xyz". Every tenant opening any stage of
            their OWN document read an invented sponsor, product and application
            number as its header — with real content printed underneath, which
            is what made it credible.

            The identity now comes from the document record (title, module,
            product code, version). The SPONSOR line is gone rather than
            replaced: authoring_documents carries no sponsor, and naming the
            wrong company on a regulatory document header is the single worst
            thing this masthead could do. What is absent stays absent. */}
        <div className="dj-doc-mast">
          <div className="dj-doc-title">{doc?.title || s.heading || 'Untitled document'}</div>
          <div className="dj-doc-meta">
            {[
              doc?.productCode,
              doc?.module ? 'CTD ' + doc.module : null,
              doc?.version ? 'v' + doc.version : null,
              s.seal ? 'Final' : s.wm || 'Draft',
            ].filter(Boolean).join(' · ')}
          </div>
        </div>
        {s.seal && <div className="dj-seal">{I.checkCircle} {s.seal}</div>}
        <div className="dj-page-h">{s.heading}</div>
        {s.mode === 'redline' && s.redline
          ? <p className="dj-page-p">{s.redline.map((r, i) => <span key={i} className={r.k === 'add' ? 'dj-ins' : ''}>{r.t}</span>)}</p>
          : (s.body || []).map((p, i) => {
            if (p && typeof p === 'object' && 'sub' in p) return <div key={i} className="dj-page-sh">{p.sub}</div>;
            const txt = typeof p === 'string' ? p : '';
            return <p key={i} className="dj-page-p">{txt}</p>;
          })}
        {s.refs && (
          <div className="dj-page-refs">
            <div className="dj-page-sh">References</div>
            {s.refs.map((r, i) => <div key={i} className="dj-ref">{(i + 1) + '. ' + r}</div>)}
          </div>
        )}
        {s.comment && (
          <div className="dj-cmt" data-resolved={s.comment.status === 'resolved' || undefined}>
            <span className="dj-cmt-by">{s.comment.by}</span>
            <span className="dj-cmt-b">{s.comment.body}</span>
            {s.comment.status === 'resolved' && <span className="dj-cmt-st">{I.check} resolved</span>}
          </div>
        )}
        {s.prov && <div className="dj-prov">{I.shieldCheck} {s.prov}</div>}
      </div>
    </>
  );
}

/* ════ DocJourney — one document's real lifecycle, creation → freeze ════ */

/* Live journey row = the stage rail fields plus its content snapshot, exactly
   as GET /api/doc-journey returns them (server doc-journey.routes.ts →
   doc-journey-view-assembler). Each stage is reconstructed from the real
   authoring store (authoring_documents + doc_revisions + authoring_comments +
   frozen_documents); every when/who/ver is a real column value, never
   fabricated, and a milestone the store never recorded yields no stage. */
/** The document's own identity, sent on every stage row by the assembler. */
interface DjDocIdentity {
  title: string | null;
  module: string | null;
  productCode: string | null;
  version: string | null;
}

type DjJourneyRow = DjStage & { snap?: DjSnap | null; doc?: DjDocIdentity | null };

export function DocJourney({ onAsk, onNav }: SurfaceViewProps) {
  const openEditor = () =>
    onNav ? onNav('document-authoring') : onAsk && onAsk('Open this document in the editor');

  /* Real, org-scoped document journey — no fixture fallback. The surface renders
     the live stages, an honest empty state (the org has authored nothing yet), or
     an honest error state (the read failed) — never a fabricated stand-in. */
  const live = useLiveRows<DjJourneyRow>('/api/doc-journey');
  const stages = live.rows;

  const [active, setActive] = useState('');
  // Effective selection: the clicked stage if it still exists, else the current
  // in-progress (active) stage, else the journey head.
  const activeId =
    stages.find((s) => s.id === active)?.id ??
    stages.find((s) => s.active)?.id ??
    stages[stages.length - 1]?.id ??
    '';
  const stage = stages.find((s) => s.id === activeId) || stages[0];
  const snap = stage?.snap ?? null;

  // KPIs derived entirely from the real stages — no hardcoded program claims.
  const total = stages.length;
  const doneCount = stages.filter((s) => s.done).length;
  const currentVer = [...stages].reverse().find((s) => s.ver && s.ver !== '—')?.ver ?? '—';
  const inProgress = stages.find((s) => s.active);
  const currentStage = inProgress?.label ?? (total > 0 ? 'Complete' : '—');
  const headWhen = (inProgress ?? stages[stages.length - 1])?.when || '—';

  return (
    <div className="reg-wrap dj">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Workspace · authoring</div>
          <h1 className="reg-title">Document journey</h1>
          <p className="reg-sub">
            One document’s lifecycle — creation, authoring, review, approval and freeze — reconstructed from its real audit trail, with the document itself in view.
          </p>
        </div>
        <button className="reg-cta" onClick={() => onAsk && onAsk('Advance this document to the next stage')}>
          {I.sparkles} Continue with AnA
        </button>
      </div>

      {live.loading ? (
        <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading the document journey…</div>
      ) : live.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn’t load the document journey"
          hint="The document lifecycle didn’t respond. This is your organization’s real authoring history — sign in and retry, or check the service is reachable."
        />
      ) : live.empty || total === 0 ? (
        <EmptyState
          icon={I.fileText}
          title="No document journey yet"
          hint={<>Create and author a document to see its lifecycle here — creation, revisions, review comments, approval and freeze are reconstructed from the real audit trail. Start in <span className="mono">Document Authoring</span>.</>}
        />
      ) : (
        <>
          <div className="reg-kpis">
            <div className="reg-kpi">
              <div className="reg-kpi-v">{doneCount}/{total}</div>
              <div className="reg-kpi-l">Stages recorded</div>
            </div>
            <div className="reg-kpi">
              <div className="reg-kpi-v">{currentVer}</div>
              <div className="reg-kpi-l">Current version</div>
            </div>
            <div className="reg-kpi" data-tone={inProgress ? 'warn' : 'ok'}>
              <div className="reg-kpi-v">{currentStage}</div>
              <div className="reg-kpi-l">Current stage</div>
            </div>
            <div className="reg-kpi">
              <div className="reg-kpi-v">{headWhen}</div>
              <div className="reg-kpi-l">Last update</div>
            </div>
          </div>

          <div className="dj-split">
            <aside className="dj-rail">
              {stages.map((s, i) => (
                <button
                  key={s.id}
                  className={'dj-step' + (s.id === activeId ? ' on' : '')}
                  data-state={s.done ? 'done' : s.active ? 'active' : 'pending'}
                  onClick={() => setActive(s.id)}
                >
                  <span className="dj-step-rail">
                    <span className="dj-step-dot">{s.done ? I.check : (I[s.ic] || String(i + 1))}</span>
                    {i < stages.length - 1 && <span className="dj-step-line" />}
                  </span>
                  <span className="dj-step-b">
                    <span className="dj-step-top">
                      <span className="dj-step-l">{s.label}</span>
                      <span className="dj-step-v">{s.ver}</span>
                    </span>
                    <span className="dj-step-sub">{s.sub}</span>
                    <span className="dj-step-meta">{s.when}{s.when && s.who ? ' · ' : ''}{s.who}</span>
                  </span>
                </button>
              ))}
            </aside>

            <div className="dj-stagepane">
              {stage && (
                <div className="dj-stage-h">
                  <div>
                    <span className="dj-stage-ic">{I[stage.ic] || I.fileText}</span>
                    <span className="dj-stage-t">{stage.label}</span>
                    <span className="dj-stage-v">{stage.ver}</span>
                  </div>
                  <div className="dj-stage-acts">
                    <button className="reg-mini" onClick={openEditor}>{I.penLine} Open in editor</button>
                  </div>
                </div>
              )}
              {snap && <DJSnapshot snap={snap} doc={stage?.doc ?? null} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
