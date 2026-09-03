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
import { readShellProject, shellProgramName } from '../shellProject';
import { AnaWorkPanel } from '../AnaWorkPanel';
import { useAgentActivity } from '../useAgentActivity';
import { AnaActivity, type AnaActivityProps } from '../AnaActivity';
import { C2CToast, useToast, type FireToast } from '../toast';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import {
  CT_LINKMAP, CT_LINKIC, CT_ARTIC, CT_STATUS_LABEL,
} from '../fixtures/conversation-thread-data';
import type { CtTurn, CtArtifact } from '../fixtures/conversation-thread-data';

/* Where the side column's shown/hidden choice is remembered. Same convention
   as the shell rail's work dock (`WORK_DOCK_KEY` in Shell.tsx): a `c2c-v2-`
   key holding 'shown' | 'hidden', per browser, never per turn. */
const SIDE_DOCK_KEY = 'c2c-v2-ct-side-dock';

/* Adapt one real AnA turn (useAnaChat → /api/ana-ri/stream) into the CtTurn
   shape this surface renders — the model's answer, the record of how she got
   there, and the grounding sources she actually used. Never a fabricated tool
   trace or a Math.random()-"audited" artifact; unpopulated fields are simply
   omitted. */
function toTurn(m: AnaChatMessage): CtTurn {
  if (m.role === 'user') return { role: 'user', text: m.text };
  const grounding = (m.groundingSources || []).map((s) => ({ src: s, ok: true }));
  /* Everything the turn reported about how it was answered — the SAME mapping
     `adaptChatMessage` in V2App.tsx hands the shell rail. It was dropped here:
     `toTurn` carried `thinking` and discarded the phase, the tools, the rounds,
     the lens and the draft, so AnA could run several deterministic engines
     across two rounds and this surface showed three animated dots. The rail
     was fixed; this surface was not. */
  const activity: AnaActivityProps = {
    streaming: m.streaming,
    phase: m.statusPhase,
    lens: m.detectedLens,
    documentType: m.detectedDocumentType,
    toolCalls: m.toolCalls,
    thinking: m.thinking,
    draftTitle: m.generatedDraft?.title,
  };
  return {
    role: 'ana',
    answer: m.text || undefined,
    grounding: grounding.length ? grounding : undefined,
    /* Present while the turn is in flight — the phase line IS the waiting
       state — and, once settled, only when there is real work to show for it.
       A settled turn that ran nothing carries no record rather than an empty
       one: the house rule on this surface. */
    activity: m.streaming || hasReportableWork(activity) ? activity : undefined,
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

/** True when the activity record has something real to show for this turn.
 *  The same three-line condition as `hasReportableWork` in V2App.tsx, on the
 *  mapped shape rather than the message. Not imported from there: V2App is the
 *  shell root and this surface is one of its lazy chunks. */
function hasReportableWork(a: AnaActivityProps): boolean {
  return Boolean(
    (a.toolCalls && a.toolCalls.length > 0) ||
      a.lens ||
      a.documentType ||
      a.thinking ||
      a.draftTitle,
  );
}

/* ---- AnA turn (activity + answer + grounding) ---- */

interface AnaTurnProps {
  turn: CtTurn;
  onRefine: () => void;
  onNav?: (id: string) => void;
}

/** The one state in which <AnaActivity /> renders nothing for an in-flight
 *  turn: no phase and no reportable work yet, with no text either. By the
 *  hook's contract it does not occur — the placeholder carries a phase from the
 *  moment it is appended, and the phase is only cleared once text has landed —
 *  so the dots this gates are a guard against a blank body, not a renderer:
 *  three dots claim nothing about the work. */
function waitingWithNothingToShow(turn: CtTurn): boolean {
  const a = turn.activity;
  if (!a || !a.streaming || a.phase || turn.answer) return false;
  return !hasReportableWork(a);
}

function AnaTurn({ turn, onRefine, onNav }: AnaTurnProps) {
  const a = turn.activity;
  const waiting = waitingWithNothingToShow(turn);
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
        {/* The progress before the words — the same order as the shell rail
            and the component's own docblock. While the turn streams this is
            the phase line and each tool row as it lands; once the answer has
            landed it collapses to its summary and the record stays with the
            turn. `AnaActivity` is the one tool-transparency renderer. Two
            things used to sit here instead: a `.ct-think` "Thought for a
            moment" disclosure, which would now be a second renderer for her
            reasoning beside this one, and a `.ct-tool` row for `turn.tools`,
            which `toTurn` never set and so never rendered once — the dead
            renderer class this file's comments have caught twice before.
            Both deleted rather than kept beside the authority. */}
        {a && <AnaActivity {...a} />}
        {waiting && <div className="ct-typing" aria-hidden="true"><span /><span /><span /></div>}
        {/* ── The proposal block was unreachable, and it advertised a
            workflow this surface does not have ───────────────────────────────
            It rendered a diff with Accept / Refine / Discard, and a chip for a
            "generated artifact". None of it could ever appear: `toTurn` above
            maps an AnaChatMessage to answer / activity / grounding /
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

/** The card id a draft carries until the server reports a stored version for it. */
function unsavedDraftId(messageId: string): string {
  return `unsaved:${messageId}`;
}

/**
 * What a missing artifact id actually establishes — the one place this is said.
 *
 * ── What the copy used to claim, and the state in which it was false ─────────
 * The disabled Route control read "This draft is not in the governed record, so
 * there is nothing to route." That is a verdict on the governed record, drawn
 * from the absence of one SSE event, and the absence does not carry it. The
 * stream emits `artifact_version_saved` only from inside `if (saved.created)`
 * in its post-processing, so it is withheld in three different states that the
 * client cannot tell apart:
 *
 *   · the turn is still running and the write has not been attempted yet;
 *   · the write ran and found the draft's content hash identical to the stored
 *     head — the draft IS in the record, under an id this turn was never told;
 *   · the write failed, and the record state is unknown.
 *
 * Only the third is anywhere near "not in the governed record", and in the
 * second the sentence was simply false. `conversationArtifacts` below already
 * refuses that diagnosis for exactly this reason; the control's reason was the
 * one place it was still being made.
 *
 * `settled` is the positive evidence, and it is deliberately NOT the absence
 * that produced the bug: it is the producing turn having FINISHED, after which
 * no further save report is coming for that draft.
 */
function unstoredDraftReason(settled: boolean): string {
  return settled
    ? 'No stored version was reported for this draft, so there is nothing here for the review workflow to act on.'
    : 'This turn is still running — whether a version was stored has not been reported yet.';
}

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
 * A draft with no `artifactId` is one no stored version was REPORTED for. That
 * is what the note and the disabled workflow control say — not that the server
 * failed to persist it, which is only one of the states that produce it
 * ({@link unstoredDraftReason}) — and the control stays disabled either way,
 * rather than posting a status change against an id this turn does not have.
 */
export function conversationArtifacts(messages: AnaChatMessage[]): CtArtifact[] {
  const out: CtArtifact[] = [];
  for (const m of messages) {
    const d = m.generatedDraft;
    if (!d || !d.title) continue;
    out.push({
      id: d.artifactId || unsavedDraftId(m.id),
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
        : m.streaming
          ? unstoredDraftReason(false)
          : unstoredDraftReason(true)
            + ' AnA files a draft against the open program, and does not re-file one that is '
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
  /**
   * Has the turn that produced this draft finished? Until it has, the absence
   * of a stored version is a report that has not arrived, not a fact about the
   * governed record. See {@link unstoredDraftReason}.
   */
  saveSettled: boolean;
  fireToast: FireToast;
}

function ArtifactCard({ art, expanded, onToggle, onNav, projectId, saveSettled, fireToast }: ArtifactCardProps) {
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
  /* Was: 'This draft is not in the governed record, so there is nothing to
     route.' — a verdict on the record asserted from a missing SSE event, false
     outright whenever the write found an identical content hash and the draft
     was already stored under an id this turn was never told. What is reported
     is now what is said, and the two states the client can actually tell apart
     are told apart. See {@link unstoredDraftReason}. */
  const routeBlockedBecause = !art.artifactId
    ? unstoredDraftReason(saveSettled)
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
  /** Hides the whole side column; the thread header is where it comes back. */
  setCollapsed: (v: boolean) => void;
  projectId: string | number | null;
  /** Card ids whose producing turn has not finished — see {@link unstoredDraftReason}. */
  pendingDraftIds: ReadonlySet<string>;
  fireToast: FireToast;
}

/* The collapsed branch — a 48px `.ct-art-rail` stub reading "Artifacts" with
   a count — is gone. It was the only way back once the column was hidden, so
   hiding the column never gave the conversation the full width, only the
   width minus a stub, and the control that hid it was an unlabelled chevron
   inside this panel's own header. The thread header now owns show/hide with a
   labelled toggle; this panel keeps a close button for convenience. */
function ArtifactPanel({ artifacts, openId, setOpenId, onNav, setCollapsed, projectId, pendingDraftIds, fireToast }: ArtifactPanelProps) {
  return (
    <aside className="ct-artifacts">
      <div className="ct-art-panel-h">
        <span className="ct-art-panel-t">{I.layers} Artifacts <span className="ct-art-panel-n">{artifacts.length}</span></span>
        <button
          type="button"
          className="ct-art-panel-x"
          onClick={() => setCollapsed(true)}
          aria-label="Hide side panel"
          title="Hide side panel"
        >
          {I.chevronRight || I.right}
        </button>
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
            saveSettled={!pendingDraftIds.has(a.id)}
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
  /* Whether the side column — AnA's work dock over the governed outputs — is
     hidden. Read once on mount so the choice survives navigating away and
     back; see SIDE_DOCK_KEY for the convention. */
  const [panelCollapsed, setPanelCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDE_DOCK_KEY) === 'hidden';
    } catch {
      return false;
    }
  });
  const setSideDock = (collapsed: boolean) => {
    setPanelCollapsed(collapsed);
    try {
      localStorage.setItem(SIDE_DOCK_KEY, collapsed ? 'hidden' : 'shown');
    } catch {
      /* session-only */
    }
  };
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  /* The background queue the work dock shows — read only while the side
     column is open, re-read the moment a turn ends. */
  const agentActivity = useAgentActivity(!panelCollapsed, anaChat.isStreaming);

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
  /* Card ids of drafts whose producing turn is STILL RUNNING. `artifact_draft`
     is emitted mid-stream and `artifact_version_saved` only later, from the
     turn's post-processing, so a draft with no id on an unfinished turn is one
     whose save has not been REPORTED yet — a different fact from one whose turn
     finished without a report, and the evidence the card's disabled reason is
     gated on. */
  const pendingDraftIds = new Set(
    anaChat.messages
      .filter((m) => m.streaming && m.generatedDraft?.title)
      .map((m) => unsavedDraftId(m.id)),
  );

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
  /* Follow the work. The effect above fires on turn count and busy only, and
     a run's phase line and tool rows land on the LAST turn — below the fold
     once a few have arrived — so what the activity record makes visible could
     grow out of view. Keyed on the in-flight turn's progress, and only while
     the reader was at the bottom BEFORE the content grew: `atBottomRef` is
     kept by the scroll handler, so it is measured on the reader's own scroll
     rather than after the DOM has already pushed the bottom away. Scrolling up
     to reread an earlier turn is therefore not fought. */
  const atBottomRef = useRef(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  const inflight = anaChat.messages[anaChat.messages.length - 1];
  const inflightKey = inflight?.streaming
    ? `${inflight.toolCalls?.length ?? 0}:${inflight.text.length}:${inflight.statusPhase ?? ''}:${inflight.thinking?.length ?? 0}`
    : '';
  useEffect(() => {
    if (!inflightKey) return;
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [inflightKey]);

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
          {/* The one place the side column is shown and hidden from. It used
              to be a chevron in the artifact panel's own header, with a 48px
              stub left behind when collapsed — a control that had to be hunted
              for, and a collapse that never gave the conversation the full
              width. `.ct-head-open` is this header's existing button style,
              which had no remaining user. */}
          <button
            type="button"
            className="ct-head-open"
            aria-expanded={!panelCollapsed}
            onClick={() => setSideDock(!panelCollapsed)}
          >
            {I.panelRight} {panelCollapsed ? 'Show side panel' : 'Hide side panel'}
          </button>
        </div>
      </div>

      <div className="ct-main">
        <div className="ct-conv">
          <div className="ct-scroll" ref={scrollRef} onScroll={onScroll}>
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
              {/* No trailing "typing" turn. The in-flight message is already
                  the last turn above — `useAnaChat` appends it, streaming and
                  with a phase, in the same render that sets `isStreaming` —
                  and its own <AnaActivity /> is the waiting state. A second
                  block here drew a second avatar with three dots beside the
                  real record, for the whole of every run. */}
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

        {/* The side column: AnA's live work above the governed outputs. The
            dock is the same component the shell rail mounts — progress, queue,
            tools, outputs, context. Hidden, the column is not rendered at all,
            so the conversation takes the full width rather than the width
            minus a stub. `data-artifacts` lets the stylesheet cap the dock's
            height only when there is something below it to make room for. */}
        {!panelCollapsed && (
          <div className="ct-side" data-artifacts={artifacts.length > 0 ? 'true' : 'false'}>
            <div className="ct-side-work">
              <AnaWorkPanel
                messages={anaChat.messages}
                streaming={anaChat.isStreaming}
                runStatus={anaChat.runStatus}
                pendingSteers={anaChat.pendingSteers}
                queue={agentActivity}
                announce
                context={{
                  project: shellProgramName(),
                  surface: 'Conversation',
                }}
              />
            </div>
            <ArtifactPanel artifacts={artifacts} openId={openId} setOpenId={setOpenId} onNav={onNav}
              setCollapsed={setSideDock}
              projectId={shellProjectId} pendingDraftIds={pendingDraftIds} fireToast={fireToast} />
          </div>
        )}
      </div>
      <C2CToast msg={toast} />
    </div>
  );
}
