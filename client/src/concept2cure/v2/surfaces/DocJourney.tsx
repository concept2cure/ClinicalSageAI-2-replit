import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import { useLiveRows, EmptyState } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
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
      {/* ── The formatting toolbar is gone ─────────────────────────────────
          It was a paragraph-style select and eight buttons — bold, italic,
          underline, two list kinds, quote, table, and a "Track changes" pill —
          on a preview that has no save path of any kind (its only request is
          GET /api/doc-journey).

          ── Deleted, not disabled properly, and that was the choice ─────────
          The alternative was real: keep the nine, give them a genuine
          `:disabled` treatment, drop the hover highlights, and title each one
          with what it is and where to edit. It was rejected because it had
          already been tried HERE and had already failed. A previous pass DID
          mark all nine `disabled` and DID give each `title="Read-only
          preview"` — attribute-correct, and still a live-looking toolbar,
          because the cascade never followed. No `.dj-tb-*` rule carried a
          `:disabled` state, `.dj-tb-b:hover` still lifted every button, and
          `.dj-tb-tc:hover` still turned the Track-changes pill accent-coloured
          — an armable-looking Part 11 audit-trail toggle on a regulated
          document view.

          That is the case against the disabled treatment in this file: it
          requires the same truth in three places at once — the attribute, the
          tooltip, and a stylesheet 2,700 lines away — and those three drifted
          apart inside one commit. Deletion needs one place. And the tooltip
          only speaks to a mouse: a correctly-disabled row of nine still tells
          every reader who never hovers that this screen formats documents.
          The affordance is the message, so the affordance goes.

          What replaces them is what is true, and the way out. The stage header
          above already carries the real "Open in editor" — this states the
          constraint the toolbar was pantomiming around. The dead `.dj-tb-*`
          rules were deleted with it (app-v2.css, beside `.dj-toolbar`);
          leaving them would have left the resurrection kit behind. Both halves
          are pinned by __tests__/docJourneyPreviewIsHonest.test.tsx, which
          also holds the door open honestly: restore the toolbar and it must be
          really disabled, with a title naming both facts. */}
      {/* One statement, not two. The version beside it is the DOCUMENT's, from
          the record — it used to be the literal 'v1.0' whenever the stage was
          sealed, so a frozen document at v3 was labelled v1.0. */}
      <div className="dj-toolbar">
        <span className="dj-tb-ro">
          {I.lock} Read-only preview{doc?.version ? ' · v' + doc.version : ''} — open this section
          in the editor to change it.
        </span>
      </div>
      {/* contentEditable was removed for the same reason the toolbar was: an
          editable surface that cannot save is a trap, not a feature. */}
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

  /* WHAT ANA SEES HERE. Branches mirror the render; a failed read is a
     failure, not an empty journey. A '—' the screen shows for an unrecorded
     value is published as absent, not as a value; the store carries no
     sponsor, so none is ever synthesized. Read-only surface — the actions must
     not imply editing here. */
  const anaContext = useMemo(() => {
    if (live.loading) {
      return { summary: 'Document journey — loading the document lifecycle; nothing is on screen yet.' };
    }
    if (live.error) {
      return {
        summary:
          'Document journey — the document lifecycle did not load, so no stages are on screen — a failed read, not an empty journey.',
      };
    }
    if (live.empty || total === 0) {
      return { summary: 'Document journey — no document journey recorded yet; nothing authored in this workspace has a lifecycle to show.' };
    }
    const d = stage?.doc;
    const docFacts = {
      ...(d?.title ? { title: d.title } : {}),
      ...(d?.module ? { module: d.module } : {}),
      ...(d?.productCode ? { productCode: d.productCode } : {}),
      ...(d?.version ? { version: d.version } : {}),
    };
    return {
      summary:
        'Document journey — ' + doneCount + ' of ' + total + ' lifecycle stage(s) recorded, current stage ' + currentStage
        + (currentVer !== '—' ? ' at v' + currentVer : '')
        + (stage ? '; viewing ‘' + stage.label + '’' : '')
        + '. Read-only reconstruction of the real audit trail.',
      facts: {
        stagesRecorded: doneCount,
        stagesTotal: total,
        ...(currentVer !== '—' ? { currentVersion: currentVer } : {}),
        currentStage,
        ...(headWhen !== '—' ? { lastUpdate: headWhen } : {}),
        ...(stage
          ? {
              activeStage: {
                id: stage.id,
                label: stage.label,
                ...(stage.ver && stage.ver !== '—' ? { ver: stage.ver } : {}),
                ...(stage.when ? { when: stage.when } : {}),
                // `stage.who` is resolved server-side as actorName(name, email,
                // …) — it can be an individual's EMAIL, which must not be folded
                // into the model prompt. It stays on the rail (where the person
                // reads it); the sibling Orchestration publisher omits person
                // identities from its facts for the same reason.
              },
            }
          : {}),
        ...(Object.keys(docFacts).length ? { document: docFacts } : {}),
      },
      availableActions: [
        'Select a stage on the rail to view its recorded snapshot',
        'This surface is a read-only reconstruction of the audit trail — nothing on it edits the document',
        '‘Open in editor’ exists as navigation to Document Authoring, where changes are made',
      ],
    };
  }, [live.loading, live.error, live.empty, total, doneCount, currentVer, currentStage, headWhen, stage]);
  /* Read-only rail: selecting a stage shows its recorded snapshot. Nothing
     here writes to the audit trail it reconstructs. */
  useSurfaceActionHandlers('doc-journey', {
    'doc-journey.select-stage': (params) => {
      const raw = String(params.stage ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a stage to open.' };
      if (live.loading) return { ok: false, reason: 'The document journey is still loading.', retry: true };
      if (live.error) {
        return { ok: false, reason: 'The document journey could not be read, so no stages are listed.' };
      }
      const needle = raw.toLowerCase();
      const exact = stages.filter((s) => s.id.toLowerCase() === needle || s.label.toLowerCase() === needle);
      const hits = exact.length ? exact : stages.filter((s) => s.label.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No lifecycle stage named "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} stages — name one exactly.` };
      const st = hits[0];
      setActive(st.id);
      return { ok: true, detail: `Opened ${st.label}` + (st.ver ? ` (${st.ver})` : '') };
    },
  });
  React.useEffect(() => {
    if (!live.loading && !live.error) notifySurfaceActionReady('doc-journey');
  }, [live.loading, live.error]);

  usePublishSurfaceContext('doc-journey', anaContext);

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
