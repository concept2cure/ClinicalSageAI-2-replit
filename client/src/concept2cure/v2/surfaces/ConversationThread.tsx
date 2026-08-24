import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { useAnaChat, type AnaChatMessage } from '../../components/ana/useAnaChat';
import { useChatUpload, attachmentReadLabel } from '../../hooks/useChatUpload';
import { DocTypeChip, DocumentContextCard } from './AnaDocContext';
import { SignoffList } from '../SignoffList';
import { apiCall, apiErrorText } from '../apiCall';
import { downloadBlob, safeFileName } from '../download';
import { readShellProject } from '../shellProject';
import { C2CToast, useToast, type FireToast } from '../toast';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import {
  CT_LINKMAP, CT_LINKIC, CT_ARTIC, CT_STATUS_LABEL,
} from '../fixtures/conversation-thread-data';
import type { CtTurn, CtArtifact } from '../fixtures/conversation-thread-data';

/* Adapt one real AnA turn (useAnaChat → /api/ana-ri/stream) into the CtTurn
   shape this surface renders — the model's answer, its extended-thinking, and
   the grounding sources it actually used. Never a fabricated tool trace or a
   Math.random()-"audited" artifact; unpopulated fields are simply omitted. */
function toTurn(m: AnaChatMessage): CtTurn {
  if (m.role === 'user') return { role: 'user', text: m.text };
  const grounding = (m.groundingSources || []).map((s) => ({ src: s, ok: true }));
  return {
    role: 'ana',
    answer: m.text || undefined,
    thinking: m.thinking || undefined,
    grounding: grounding.length ? grounding : undefined,
    /*
     * These two were dropped, and dropping them lost a 21 CFR 11.50 gate.
     *
     * A turn that executes a governed action carries `executedActions`, and one
     * that is BLOCKED awaiting a signature carries `pendingSignoffs`. Mapping
     * only text/thinking/grounding rendered such a turn as an ordinary answer:
     * no signature prompt, and no sign that the mutation was waiting on one.
     *
     * It mattered less when this surface was reached only by the Home composer.
     * `ownsConversation` surfaces now route ⌘K questions here, so this is a
     * destination for asks that can carry governed actions — and the rail, the
     * other place the prompt is drawn, is by definition not on screen.
     */
    executedActions: m.executedActions?.length ? m.executedActions : undefined,
    pendingSignoffs: m.pendingSignoffs?.length ? m.pendingSignoffs : undefined,
  };
}

/* ---- AnA turn (thinking + tools + answer + grounding) ---- */

interface AnaTurnProps {
  turn: CtTurn;
  onRefine: () => void;
  onNav?: (id: string) => void;
}

function AnaTurn({ turn, onRefine, onNav }: AnaTurnProps) {
  const [openThink, setOpenThink] = useState(false);
  return (
    <div className="ct-turn ct-ana">
      <div className="ct-ana-av">{'✻'}</div>
      <div className="ct-ana-body">
        {turn.doc && (
          <div style={{ marginBottom: 6 }}><DocTypeChip doc={turn.doc} /></div>
        )}
        {turn.doc && (turn.doc.confidence || 1) < 0.4 && (
          <DocumentContextCard doc={turn.doc} defaultOpen={false} />
        )}
        {turn.thinking && (
          <button className={'ct-think' + (openThink ? ' on' : '')} onClick={() => setOpenThink(o => !o)}>
            <span className="ct-think-h">{I.sparkles} Thought for a moment {I.chevDown}</span>
            {openThink && <span className="ct-think-b">{turn.thinking}</span>}
          </button>
        )}
        {(turn.tools || []).map((tl, i) => (
          <div key={i} className="ct-tool">
            <span className="ct-tool-ic">{I.tool || I.sliders}</span>
            <span className="ct-tool-n">{tl.name}</span>
            <span className="ct-tool-a">{tl.arg}</span>
            <span className="ct-tool-r">{I.check} {tl.result}</span>
          </div>
        ))}
        {/* ── The proposal block was unreachable, and it advertised a
            workflow this surface does not have ───────────────────────────────
            It rendered a diff with Accept / Refine / Discard, and a chip for a
            "generated artifact". None of it could ever appear: `toTurn` above
            maps an AnaChatMessage to answer / thinking / grounding /
            executedActions / pendingSignoffs and NEVER sets `proposal` or
            `artifactRef`, so both guards were permanently false.

            Two of those buttons were dead in a second way even if they had
            rendered — `onApply` and `onViewArtifact` are both passed
            `() => undefined` at the call site, and Discard had no handler at
            all. So the code described an accept/discard governance ceremony
            that nothing produced, nothing wired, and no user could reach.

            Deleted rather than wired. Wiring it would mean inventing a
            proposal pipeline on the client, which is precisely the fabricated
            governance the house rule forbids; the REAL governed path on this
            surface is `pendingSignoffs`, rendered by EctdSignoffs below from
            what the server actually sent. If a proposal workflow is built
            later it starts from a server-issued proposal, not from this. */}
        {turn.answer && <div className="ct-ana-text">{turn.answer}</div>}
        {turn.links && (
          <div className="ct-refs">
            {turn.links.map((l, i) => (
              <button key={i} className="ct-ref" data-kind={l.kind} onClick={() => onNav && onNav(CT_LINKMAP[l.kind] || 'document-authoring')} title={'Open in ' + (CT_LINKMAP[l.kind] || 'editor')}>
                <span className="ct-ref-ic">{(I as any)[CT_LINKIC[l.kind]] || I.fileText}</span>
                <span className="ct-ref-l">{l.label}</span>
                <span className="ct-ref-go">{I.arrowUpRight || I.externalLink}</span>
              </button>
            ))}
          </div>
        )}
        {turn.grounding && (
          <div className="ct-ground">
            <span className="ct-ground-l">Grounded in</span>
            {turn.grounding.map((g, i) => (<span key={i} className="ct-ground-chip" data-ok={g.ok}>{g.ok ? I.check : I.alertTriangle} {g.src}</span>))}
          </div>
        )}
        {turn.executedActions && (
          <div className="ana-msg-executed">
            {turn.executedActions.map((a, i) => (
              <span
                key={i}
                className={`ana-exec-chip${a.executed ? ' is-done' : ''}${a.error ? ' is-err' : ''}`}
                title={a.error || a.label}
              >
                {a.error ? I.alertTriangle : a.executed ? I.check : I.zap} {a.label}
              </span>
            ))}
          </div>
        )}
        {/* The §11.50 prompt. Rendered here for the same reason RbmSurfaces
            renders it in its own dock: a surface that owns the conversation
            owns the signature gate too, because the shell's rail — the other
            place this is drawn — is not on screen. */}
        {turn.pendingSignoffs && turn.pendingSignoffs.length > 0 && (
          <SignoffList
            signoffs={turn.pendingSignoffs}
            className="ana-msg-signoffs"
            doneClassName="ana-signoff-done"
          />
        )}
      </div>
    </div>
  );
}

/* ---- Artifact card ---- */

/**
 * The conversation's governed drafts, from the only real source there is.
 *
 * `useAnaChat` records the draft a turn produced on that turn
 * (`generatedDraft`, from the server's `artifact_draft` SSE event) and then
 * upgrades it with `artifactId` + `version` when the server writes it to
 * `concept2cure_artifacts` and emits `artifact_version_saved`
 * (server/routes/ana-ri/post-processing.ts). Everything below is read from
 * that record and nothing is invented: `prov.model` and `prov.inputs` are left
 * unset because the stream does not report them, and `prov.audit` is left unset
 * because no audit id is issued for a draft write.
 *
 * A draft with no `artifactId` is one the server did NOT persist — it says so,
 * and its workflow control is disabled with the reason, rather than posting a
 * status change for an artifact that has no row.
 */
export function conversationArtifacts(messages: AnaChatMessage[]): CtArtifact[] {
  const out: CtArtifact[] = [];
  for (const m of messages) {
    const d = m.generatedDraft;
    if (!d || !d.title) continue;
    out.push({
      id: d.artifactId || `unsaved:${m.id}`,
      kind: 'document',
      type: d.documentType || 'Document draft',
      title: d.title,
      status: d.artifactId ? 'draft' : 'unsaved',
      artifactId: d.artifactId,
      version: d.version,
      content: d.content,
      prov: { by: 'AnA', evidence: m.groundingSources || [] },
      /* Stated as what is KNOWN, not as a diagnosis. The server withholds
         `artifact_version_saved` for two different reasons — no project to file
         under, and a draft whose content hash already matches the stored head —
         and the client cannot tell them apart. Naming only the first would be
         wrong every time it was the second. */
      note: d.artifactId
        ? undefined
        : 'No stored version was reported for this draft, so there is nothing to route. '
          + 'AnA files a draft against the open program, and does not re-file one that is '
          + 'identical to the version already stored.',
    });
  }
  return out;
}

interface ArtifactCardProps {
  art: CtArtifact;
  expanded: boolean;
  onToggle: () => void;
  onNav?: (id: string) => void;
  /** The open program. Null when none is open — the status route is scoped by it. */
  projectId: string | number | null;
  fireToast: FireToast;
}

function ArtifactCard({ art, expanded, onToggle, onNav, projectId, fireToast }: ArtifactCardProps) {
  /* Seeded from the artifact and then owned here, because a successful
     transition is a fact the server confirmed and the message that produced
     the draft will never carry. The card is keyed on the artifact id, so the
     moment a draft acquires a durable id this state is correctly discarded. */
  const [status, setStatus] = useState(art.status);
  const [busy, setBusy] = useState<null | 'docx' | 'review'>(null);

  /* The '.docx' button used to be wired to an `onAdvance` the one mount passed
     as `() => undefined`, so it downloaded nothing. The endpoint it needed had
     been there the whole time: POST /api/concept2cure/artifacts/export-docx
     takes { title, content } and returns the rendered file. The anchor dance is
     `download.ts`'s, not a seventeenth local copy of it. */
  const exportDocx = async () => {
    if (busy) return;
    if (!art.content) {
      fireToast('There is no draft text to export for ' + art.title + '.', 'error');
      return;
    }
    setBusy('docx');
    try {
      const res = await apiRequest('POST', '/api/concept2cure/artifacts/export-docx', {
        title: art.title,
        content: art.content,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        fireToast(
          'The Word file was not produced — '
            + ((body as { error?: { message?: string } } | null)?.error?.message
              ?? `the server refused it (HTTP ${res.status})`) + '.',
          'error',
        );
        return;
      }
      const ok = downloadBlob(safeFileName(art.title, 'draft') + '.docx', await res.blob());
      fireToast(
        ok
          ? 'Downloaded ' + art.title + '.docx.'
          : 'The Word file was produced but the browser refused the download.',
        ok ? 'ok' : 'error',
      );
    } catch (e) {
      fireToast(
        'The Word file was not produced — ' + (e instanceof Error ? e.message : String(e)) + '.',
        'error',
      );
    } finally {
      setBusy(null);
    }
  };

  /* draft → review, through the governed transition route. The server owns the
     rules — VALID_TRANSITIONS and the per-role permission map — so a refusal is
     reported verbatim and the status on screen is left where it was. */
  const routeToReview = async () => {
    if (busy || !art.artifactId || projectId == null) return;
    setBusy('review');
    try {
      const r = await apiCall(
        'PUT',
        `/api/concept2cure/projects/${encodeURIComponent(String(projectId))}`
          + `/artifacts/${encodeURIComponent(art.artifactId)}/status`,
        { status: 'review' },
      );
      if (!r.ok) {
        fireToast(
          apiErrorText(r, 'The review request was refused.')
            + ' The status is unchanged.',
          'error',
        );
        return;
      }
      setStatus('review');
      fireToast(art.title + ' is now in review.');
    } finally {
      setBusy(null);
    }
  };

  /* `unsaved` is included so the control is SHOWN and disabled with its reason
     rather than hidden: a draft that exists on screen and nowhere else is
     exactly the case a person needs told about, and a control that silently
     does not appear tells them nothing. */
  const routable = status === 'draft' || status === 'unsaved';
  const canRoute = Boolean(art.artifactId) && projectId != null && status === 'draft';
  const routeBlockedBecause = !art.artifactId
    ? 'This draft is not in the governed record, so there is nothing to route.'
    : projectId == null
      ? 'Open a program first — the review workflow is scoped to one.'
      : null;

  return (
    <div className="ct-art" data-status={status} data-open={expanded || undefined}>
      <button className="ct-art-head" onClick={onToggle}>
        <span className="ct-art-ic">{(I as any)[CT_ARTIC[art.kind]] || I.fileText}</span>
        <span className="ct-art-head-b">
          <span className="ct-art-type">{art.type}</span>
          <span className="ct-art-title">{art.title}</span>
        </span>
        <span className={`ct-art-status ${status}`}>{CT_STATUS_LABEL[status] || status}</span>
        <span className="ct-art-chev">{I.chevDown}</span>
      </button>
      {expanded && (
        <div className="ct-art-body">
          {art.rows && (
            <div className="ct-art-rows">
              {art.rows.map((r, i) => (
                <div key={i} className="ct-art-row">
                  <span className="ct-art-row-k">{r.k}</span>
                  <span className="ct-art-row-v">{r.v}</span>
                  {typeof r.conf === 'number' && <span className="ct-art-conf" title="Confidence">{Math.round(r.conf * 100)}%</span>}
                </div>
              ))}
            </div>
          )}
          {art.preds && (
            <div className="ct-art-preds">
              {art.preds.map((p, i) => (
                <div key={i} className="ct-art-pred">
                  <span className="ct-art-pred-k">{p.k}</span>
                  <span className="ct-art-pred-n">{p.name}{p.role && <span className={`ct-pred-role ${p.role}`}>{p.role}</span>}</span>
                  {p.safety !== 'clean' && <span className="ct-pred-flag">{I.alertTriangle} {p.safety}</span>}
                  <span className="ct-art-pred-m">{p.match}%</span>
                </div>
              ))}
            </div>
          )}
          {art.outline && (
            <div className="ct-outline">
              {art.outline.map((s, i) => (
                <div key={i} className={'ct-outline-row' + (s.required ? '' : ' optional')} data-st={s.st}>
                  <span className="ct-outline-dot" />
                  {s.code && <span className="ct-outline-code">{s.code}</span>}
                  <span className="ct-outline-h">{s.code ? s.heading.replace(new RegExp('^' + s.code.replace(/[.]/g, '\\.') + '\\s*'), '') : s.heading}</span>
                  {s.targetWords && <span className="ct-outline-w">~{s.targetWords[0]}-{s.targetWords[1]}w</span>}
                  {!s.required && <span className="ct-outline-opt">optional</span>}
                  <span className="ct-outline-st">{s.st}</span>
                </div>
              ))}
            </div>
          )}
          {art.sections && (
            <div className="ct-art-secs">
              {art.sections.map((s, i) => (
                <div key={i} className="ct-art-sec">
                  <span className="ct-art-sec-n">section {s.n}</span>
                  <span className="ct-art-sec-l">{s.label}</span>
                  <span className={`ct-art-secst ${s.st}`}>{s.st}</span>
                </div>
              ))}
            </div>
          )}
          {art.note && <div className="ct-art-note">{art.note}</div>}
          <div className="ct-art-prov">
            <div className="ct-art-prov-l">Provenance</div>
            <div className="ct-art-prov-g">
              {/* Each line is rendered only when there is something to put in
                  it. They used to render unconditionally, so an artifact with
                  no recorded model read "Generated by AnA / undefined" and one
                  with no evidence read "Evidence:" followed by nothing — a
                  provenance block that states less than it appears to. */}
              <span>Generated by <b>{art.prov.by}</b>{art.prov.model ? ' / ' + art.prov.model : ''}</span>
              {art.prov.inputs && <span>From: {art.prov.inputs}</span>}
              {art.prov.evidence.length > 0 && <span>Evidence: {art.prov.evidence.join(' / ')}</span>}
              {art.version != null && <span>Version {art.version}</span>}
              {/* Rendered only when a real, server-issued audit id exists. It
                  used to render unconditionally against a client-fabricated
                  string, putting a padlock next to an identifier that traced to
                  nothing. */}
              {art.prov.audit
                ? <span className="ct-art-audit">{I.lock} Audit {art.prov.audit}</span>
                : <span className="ct-art-audit">Not yet written to the governed record</span>}
            </div>
          </div>
          {/* ── The two controls that were wired to `onAdvance` ──────────────
              `.docx` and `Route to review` were both `onAdvance(...)`, and the
              one mount of this panel passed `onAdvance={() => undefined}`. The
              file never downloaded and the workflow never advanced. Both
              endpoints existed the whole time with no caller:

                POST /api/concept2cure/artifacts/export-docx
                PUT  /api/concept2cure/projects/:projectId
                       /artifacts/:artifactId/status   { status: 'review' }

              `Approve` is deliberately NOT here. It is not a control this
              surface can honour: the status route's VALID_TRANSITIONS rejects
              draft → approved outright, and review → approved additionally
              requires an `attestation { meaning, attestationText }` — a §11.50
              e-signature. The canonical place that ceremony happens is
              `GovernedActionSignoff` (rendered above by `SignoffList`), driven
              by the server's own PART11_SIGNATURE_REQUIRED refusal. Inventing a
              second, client-initiated signature flow in a side panel is exactly
              the fabricated governance the house rule forbids, and a button
              that 400s is the dead control we are here to remove. */}
          <div className="ct-art-actions">
            <button
              className="ct-art-edit"
              aria-label={'Edit ' + art.title + ' in the authoring workspace'}
              onClick={() => onNav && onNav('document-authoring')}
            >
              {I.penLine} Edit
            </button>
            {/* The visible label is '.docx' because that is what the button
                means in a row of short actions; the accessible name says the
                whole thing, since "dot d o c x" on its own names nothing. */}
            <button
              className="ct-art-edit"
              aria-label={'Download ' + art.title + ' as a Word file'}
              onClick={exportDocx}
              disabled={busy !== null || !art.content}
            >
              {I.download} {busy === 'docx' ? 'Building…' : '.docx'}
            </button>
            {routable && (
              <button
                /* `ct-art-adv` is the accent/right-aligned style this row was
                   written with; it had no user since the advance button was
                   removed. */
                className="ct-art-edit ct-art-adv"
                aria-label={'Route ' + art.title + ' for review'}
                onClick={routeToReview}
                disabled={busy !== null || !canRoute}
                title={routeBlockedBecause ?? undefined}
              >
                {I.route || I.arrowRight} {busy === 'review' ? 'Routing…' : 'Route to review'}
              </button>
            )}
          </div>
          {/* Not repeated when the artifact's own note already says it — an
              unsaved draft carries the longer explanation, including what to do
              about it, a few lines above. */}
          {routable && routeBlockedBecause && !art.note && (
            <div className="ct-art-note">{routeBlockedBecause}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Artifact panel ---- */

interface ArtifactPanelProps {
  artifacts: CtArtifact[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onNav?: (id: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  projectId: string | number | null;
  fireToast: FireToast;
}

function ArtifactPanel({ artifacts, openId, setOpenId, onNav, collapsed, setCollapsed, projectId, fireToast }: ArtifactPanelProps) {
  if (collapsed) {
    return (
      <button className="ct-art-rail" onClick={() => setCollapsed(false)} title="Show artifacts">
        <span className="ct-art-rail-ic">{I.layers}</span>
        <span className="ct-art-rail-n">{artifacts.length}</span>
        <span className="ct-art-rail-l">Artifacts</span>
      </button>
    );
  }
  return (
    <aside className="ct-artifacts">
      <div className="ct-art-panel-h">
        <span className="ct-art-panel-t">{I.layers} Artifacts <span className="ct-art-panel-n">{artifacts.length}</span></span>
        <button className="ct-art-panel-x" onClick={() => setCollapsed(true)} title="Collapse">{I.chevronRight || I.right}</button>
      </div>
      {/* Was "AnA builds, you approve and e-sign". Approving and e-signing do
          not happen here — the panel drafts, exports and routes for review, and
          the signature ceremony belongs to the sign-off prompt on the turn. */}
      <div className="ct-art-panel-sub">Governed outputs — AnA drafts, you export and route for review</div>
      <div className="ct-art-list">
        {/* The honest empty state. It used to promise "classification reports,
            predicate analyses, eSTAR sections", which named the three fixture
            builders rather than anything the conversation can produce, and it
            did not say that the list covers this session only — reloading a
            thread rehydrates its messages, not the drafts they carried. */}
        {artifacts.length === 0 && <div className="ct-art-empty">Documents AnA drafts in this conversation appear here, each one exportable and routable for review. The list covers this session — reopening the thread restores the messages, not the drafts.</div>}
        {artifacts.map(a => (
          <ArtifactCard
            key={a.id}
            art={a}
            expanded={openId === a.id}
            onToggle={() => setOpenId(openId === a.id ? null : a.id)}
            onNav={onNav}
            projectId={projectId}
            fireToast={fireToast}
          />
        ))}
      </div>
    </aside>
  );
}

/* ---- Conversation thread (main export) ---- */

export function ConversationThread({ onNav, liveDrive }: OwnedSurfaceViewProps) {
  // A real thread id is placed on window.C2C_CONVO by whatever opens an existing
  // conversation; the default is a fresh conversation.
  const sel = ((window as any).C2C_CONVO || { id: 'new' }) as { id: string; seed?: string | null };
  const isNew = sel.id === 'new';

  // The conversation runs on the REAL streaming assistant (POST /api/ana-ri/stream
  // via useAnaChat): an existing thread hydrates its real persisted history, new
  // messages stream token-by-token, and every turn is DB-persisted. Nothing is
  // simulated — the previous canned run510k/ctRespond composer and its
  // Math.random()-"audited" fabricated artifacts are gone.
  // Live Drive rides the shell's bridge (SurfaceViewProps.liveDrive): this
  // surface owns its own chat instance, so its turns carry the same opt-in and
  // feed the same shell-level apply/take-over machine as the rail's turns.
  /* The open program, read through the canonical reader rather than a local
     re-read of `window.C2C_PROJECT` (this file had its own copy of that try/catch
     for uploads; there is one reader now, and both callers use it).

     Passing it to `useAnaChat` is what makes a draft from THIS surface durable.
     The stream forwards `project_id` to `persistCollectedDrafts`, which is a
     no-op without one — `project_id` is NOT NULL on `concept2cure_artifacts` —
     so every draft asked for here was written nowhere and the server said as
     much in a `warning` the user had to read to find out. The shell rail has
     passed its project id since it was added; this surface never did. */
  const shellProjectId = (() => {
    const p = readShellProject();
    return p ? p.id : null;
  })();

  const anaChat = useAnaChat({
    initialThreadId: isNew ? null : sel.id,
    screenName: 'conversation-thread',
    projectId: shellProjectId,
    liveDrive: liveDrive?.on,
    onDriveEvent: liveDrive?.onDriveEvent,
    onArtifactSaved: liveDrive?.onWorkSaved,
  });
  const [toast, fireToast] = useToast();
  const [loadErr, setLoadErr] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  /* ── The attach button was decoration ─────────────────────────────────────
     It rendered a paperclip with `title="Attach a document for AnA to use"` and
     NO onClick — not a no-op handler, no handler at all. Clicking it did
     nothing, on the one surface whose entire purpose is a conversation with an
     assistant about documents.

     Wired to the same `useChatUpload` the shell composer uses, which POSTs to
     /api/chat/upload, OCRs the file and writes its text into project memory so
     AnA can actually retrieve it. Not a new upload path — the existing one,
     which this surface simply never called. */
  const fileRef = useRef<HTMLInputElement>(null);
  /* Scoped to the open project so extracted text lands in THAT project's
     memory, exactly as the shell composer and ProjectHome do. Null when no
     project is open, which the hook accepts — the file is still read, it just
     is not filed against a programme. */
  const { attachments, addFiles, removeAttachment, clear: clearAttachments, statusMessage } =
    useChatUpload({ projectId: shellProjectId });
  const readyAttachments = attachments.filter((a) => a.status === 'ready');
  const uploadingAttachments = attachments.filter((a) => a.status === 'uploading');

  const turns: CtTurn[] = anaChat.messages.map(toTurn);
  const busy = anaChat.isStreaming;
  /* This was `const artifacts: CtArtifact[] = []` — a literal, so the panel
     below it, the whole `ArtifactCard` component and every control on it were
     unreachable code that nonetheless looked finished. The drafts were already
     on the messages; nothing read them. */
  const artifacts: CtArtifact[] = conversationArtifacts(anaChat.messages);

  const firstUser = turns.find((t) => t.role === 'user');
  const title = isNew
    ? 'New conversation'
    : firstUser?.text
      ? firstUser.text.slice(0, 60)
      : anaChat.isLoadingThread
        ? 'Loading…'
        : 'Conversation';

  useEffect(() => {
    if (!isNew) {
      setLoadErr(false);
      Promise.resolve(anaChat.loadThread(sel.id)).catch(() => setLoadErr(true));
    } else if (sel.seed) {
      // Deferred by one task ON PURPOSE. Sending synchronously here opened a
      // fetch during StrictMode's first mount pass; the cleanup at the top of
      // useAnaChat aborted it, and the second pass was swallowed by the
      // isStreaming guard because the abort's finally had not run yet. The
      // result was exactly one aborted turn — the question visible, the answer
      // a permanently blank bubble. This is the front door: Home's composer
      // lands here. A timeout lets pass 1's cleanup cancel before any fetch
      // exists, so only pass 2 actually sends.
      const seed = sel.seed;
      let cancelled = false;
      const t = setTimeout(() => {
        if (!cancelled) void anaChat.send(seed);
      }, 0);
      (window as any).C2C_CONVO = { ...sel, seed: null };
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [turns.length, busy]);

  const send = () => {
    const t = draft.trim();
    // Never send mid-upload: AnA would answer about a document the server has
    // not finished reading. Same rule as the shell composer.
    if (busy || uploadingAttachments.length > 0) return;
    if (!t && readyAttachments.length === 0) return;

    // Only files the server CONFIRMED it read are named. A failed upload must
    // never be described as attached — its chip stays visible with the error
    // and the message says nothing about it.
    const names = readyAttachments.map((a) => a.name);
    const line = names.length ? `Attached: ${names.join(', ')}` : '';
    const body = t && line ? `${t}\n\n${line}` : t || line;

    setDraft('');
    clearAttachments();
    void anaChat.send(body);
  };

  const loadingHistory = !isNew && anaChat.isLoadingThread && turns.length === 0;

  return (
    <div className="ct-wrap">
      <div className="ct-head">
        <button className="ct-back" onClick={() => onNav && onNav('project-home')}>{I.left} Project</button>
        <div className="ct-head-mid">
          <div className="ct-head-t">{title}</div>
          <div className="ct-head-m">{I.messageSquare} Conversation</div>
        </div>
        <div className="ct-head-r">
          <span className="ct-head-model">{I.zap} AnA</span>
        </div>
      </div>

      <div className="ct-main">
        <div className="ct-conv">
          <div className="ct-scroll" ref={scrollRef}>
            <div className="ct-col">
              {loadingHistory && (
                <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading conversation…</div>
              )}
              {loadErr && turns.length === 0 && (
                <EmptyState
                  tone="error"
                  icon={I.alertTriangle}
                  title="Couldn't load this conversation"
                  hint="This conversation didn't load. It's read from your organization's governed chat store — sign in and retry, or start a new one below."
                />
              )}
              {turns.length === 0 && !loadingHistory && !loadErr && (
                <div className="ct-empty">
                  <div className="ct-empty-mk">{'✻'}</div>
                  <h2>Talk to AnA</h2>
                  <p>Ask a question, or ask AnA to do the work. AnA thinks, pulls from the evidence, and streams a grounded answer — every turn is saved to your governed conversation store.</p>
                  <div className="ct-empty-chips">
                    {['File a 510(k) for our glucose monitoring patch', 'Is the section 2.5.4 efficacy claim defensible?', 'What blocks the Module 3 freeze?'].map((q, i) => (
                      <button key={i} className="ct-empty-chip" onClick={() => { void anaChat.send(q); }}>{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {turns.map((t, i) => t.role === 'user'
                ? (<div key={i} className="ct-turn ct-user"><div className="ct-user-b">{t.text}</div></div>)
                : (<AnaTurn key={i} turn={t} onRefine={() => { void anaChat.send('Refine that — keep it tighter and more declarative.'); }} onNav={onNav} />)
              )}
              {busy && (
                <div className="ct-turn ct-ana"><div className="ct-ana-av">{'✻'}</div><div className="ct-ana-body"><div className="ct-typing"><span /><span /><span /></div></div></div>
              )}
            </div>
          </div>

          <div className="ct-composer-wrap">
            <div className="ct-composer">
              <input
                ref={fileRef}
                type="file"
                multiple
                className="ana-hidden-input"
                aria-label="Attach a document for AnA to read"
                onChange={(e) => { addFiles(e.target.files); if (fileRef.current) fileRef.current.value = ''; }}
                data-testid="ct-attach-input"
              />
              <button
                type="button"
                className="ct-comp-attach"
                title="Attach a document for AnA to use"
                aria-label="Attach a document for AnA to use"
                onClick={() => fileRef.current?.click()}
                data-testid="ct-attach-button"
              >
                {I.paperclip}
              </button>
              <textarea rows={1} aria-label="Reply to AnA" placeholder="Reply to AnA — ask, or request a draft..." value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <button
                className="ct-comp-send"
                aria-label="Send message to AnA"
                /* Attachments alone are a valid message, and an in-flight
                   upload blocks send — the old condition looked only at the
                   textarea, which is why attaching could never have worked
                   even if the paperclip had opened a picker. */
                disabled={busy || uploadingAttachments.length > 0 || (!draft.trim() && readyAttachments.length === 0)}
                onClick={send}
              >
                {I.arrowUp}
              </button>
            </div>

            {/* What was actually attached, and how the server read it. A failed
                upload stays visible with its reason rather than disappearing
                and leaving the user to assume it worked. */}
            {attachments.length > 0 && (
              <div className="ct-comp-atts">
                {attachments.map((a) => (
                  <span key={a.id} className="ct-att-chip" data-status={a.status}>
                    {I.paperclip} {a.name}
                    {a.status === 'uploading' && <em> · reading…</em>}
                    {a.status === 'ready' && <em> · {attachmentReadLabel(a.extractionMethod, a.extractionWords) ?? 'read'}</em>}
                    {a.status === 'error' && <em> · {a.error ?? 'failed'}</em>}
                    <button
                      type="button"
                      className="ct-att-x"
                      aria-label={`Remove ${a.name}`}
                      onClick={() => removeAttachment(a.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <span className="sr-only" aria-live="polite">{statusMessage}</span>
            <div className="ct-comp-foot">{I.lock} Governed — AnA proposes; you accept. Accepted changes are captured as immutable, 21 CFR Part 11-audited versions when persisted.</div>
          </div>
        </div>

        <ArtifactPanel artifacts={artifacts} openId={openId} setOpenId={setOpenId} onNav={onNav}
          collapsed={panelCollapsed} setCollapsed={setPanelCollapsed}
          projectId={shellProjectId} fireToast={fireToast} />
      </div>
      <C2CToast msg={toast} />
    </div>
  );
}
