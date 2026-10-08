import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { AnaActionChips } from '../AnaActionChips';
import { LiveDriveSwitch } from '../LiveDriveSwitch';
import { RunPolicySwitch } from '../RunPolicySwitch';
import { useAnaChat, type AnaChatMessage } from '../../components/ana/useAnaChat';
import { ANA_SUGGESTION_AUTHOR_ID, anaInsertRefusal } from '../editor/anaInsertGate';
import { useChatUpload, readyAttachmentLabel, composeTurn, type SentAttachment } from '../../hooks/useChatUpload';
import { DocTypeChip, DocumentContextCard } from './AnaDocContext';
import { SignoffList } from '../SignoffList';
import { apiCall, apiErrorText } from '../apiCall';
import { downloadBlob, safeFileName } from '../download';
import { readShellProject, shellProgramName } from '../shellProject';
import { AnaProgressChip, AnaWorkPanel } from '../AnaWorkPanel';
import { RunControlStrip, steerHelpFor } from '../AnaWorkSections';
import { useAgentActivity } from '../useAgentActivity';
import { AnaActivity, activityPropsFor, hasReportableWork, type AnaActivityProps } from '../AnaActivity';
import { CONTINUE_PROMPT, continueTurnIndex } from '../anaWorkModel';
import { useProgressDock } from '../workDock';
import { C2CToast, useToast, type FireToast } from '../toast';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import { AppMentionMenu, useAppMentions } from '../appMentions';
import { AnaMarkdown } from '../AnaMarkdown';
import { AnaMessageWarnings } from '../AnaMessageWarnings';
import { AnaGrounding } from '../AnaGrounding';
import { DocumentCanvas } from '../editor/DocumentCanvas';
import type { EditorBridge } from '../editor/DocumentWorkbench';
import { isProgramId, openDraftAsDocument } from '../editor/draftToDocument';
import {
  CT_LINKMAP, CT_LINKIC, CT_ARTIC, CT_STATUS_LABEL,
} from '../fixtures/conversation-thread-data';
import type { CtTurn, CtArtifact } from '../fixtures/conversation-thread-data';


/* The starters a new conversation opens on. They are the product speaking
   before the person has said anything, and they are shown to every
   organisation, so they presuppose nothing about its programs, documents or
   dossier. They used to be demo copy — "File a 510(k) for our glucose
   monitoring patch", "Is the section 2.5.4 efficacy claim defensible?", "What
   blocks the Module 3 freeze?" — read aloud to a new Biotech & Pharma
   workspace with no projects: a device claimed as "ours", and a 2.5.4 claim
   and a Module 3 freeze that existed nowhere (2026-09-23, launch row D2).
   Each of these is answerable from whatever the workspace really holds,
   including nothing. Pinned by conversationThreadStarters.test.tsx. */
const STARTER_ASKS = [
  'What can you help me with in this workspace?',
  'What does this workspace hold so far?',
  'How does a regulatory submission come together here?',
] as const;

/* Adapt one real AnA turn (useAnaChat → /api/ana-ri/stream) into the CtTurn
   shape this surface renders — the model's answer, the record of how she got
   there, what was checked about it, and the context layers she was given.
   Never a fabricated tool trace or a Math.random()-"audited" artifact;
   unpopulated fields are simply omitted. */
/** A list a turn carries, or undefined when it is empty (the turn shows nothing for it). */
const nonEmpty = <T,>(list: T[] | undefined): T[] | undefined => (list?.length ? list : undefined);

function toTurn(m: AnaChatMessage): CtTurn {
  if (m.role === 'user') return { role: 'user', text: m.text };
  const contextUsed = m.groundingSources || [];
  const authoringDoc = authoringDocOf(m);
  /* Everything the turn reported about how it was answered, through the one
     mapping every host uses (AnaActivity.activityPropsFor). A second copy of
     it here once carried `thinking` and dropped the phase, the tools, the
     rounds, the lens and the draft. */
  const activity: AnaActivityProps = activityPropsFor(m);
  return {
    role: 'ana',
    answer: m.text || undefined,
    settled: !m.streaming,
    sourceRecord: m.turnRecord?.status === 'recorded' ? m.turnRecord.id : undefined,
    turnRecord: m.turnRecord,
    contextUsed: contextUsed.length ? contextUsed : undefined,
    evidence: m.evidence,
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
    warnings: nonEmpty(m.warnings),
    executedActions: nonEmpty(m.executedActions),
    pendingSignoffs: nonEmpty(m.pendingSignoffs),
    /* The authoring document this turn drafted, when it drafted one — the
       canvas beneath the turn is rendered from THIS, not from the draft's
       inline content (docs/design/ANA_DOCUMENT_CANVAS.md). */
    authoringDoc: authoringDoc ?? undefined,
  };
}

/**
 * The authoring document a turn produced, by id, or null.
 *
 * The live stream says it directly: `artifact_draft` carries `authoringDocId`
 * (+ `programId`) when the `draft_authoring_document` tool persisted the
 * draft, and useAnaChat records both on `generatedDraft`. A rehydrated thread
 * carries no draft record (loadThread restores messages and the tool trace,
 * not drafts), so the tool trace is the second place to look: the tool's
 * result, when the stream kept it, is the JSON the tool returned, and its
 * `authoringDocId` is the same id. Nothing is parsed out of prose.
 */
export function authoringDocOf(
  m: AnaChatMessage,
): { docId: string; programId: string | null; title: string | null } | null {
  const d = m.generatedDraft;
  if (d?.authoringDocId) {
    return { docId: d.authoringDocId, programId: d.programId ?? null, title: d.title || null };
  }
  return authoringDocFromTrace(m.toolCalls);
}

function authoringDocFromTrace(
  calls: AnaChatMessage['toolCalls'],
): { docId: string; programId: string | null; title: string | null } | null {
  for (const call of calls ?? []) {
    if (call.name !== 'draft_authoring_document' || typeof call.result !== 'string') continue;
    const found = authoringDocFromToolResult(call.result);
    if (found) return found;
  }
  return null;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DOC_ID_RE = new RegExp(`"authoringDocId"\\s*:\\s*"(${UUID})"`, 'i');
const PROGRAM_ID_RE = new RegExp(`"programId"\\s*:\\s*"(${UUID})"`, 'i');
const TITLE_RE = /"title"\s*:\s*"((?:[^"\\]|\\.){1,300})"/;

/**
 * The tool's JSON result, read for its ids. A regex over the two id fields
 * rather than JSON.parse, because the persisted trace keeps a CAPPED copy of
 * the result (server/services/ana/tool-trace.ts summarizeToolResult, 180
 * characters) that is not always whole JSON — and the ids are at its head.
 * Only a well-formed UUID counts; nothing is read out of prose.
 */
export function authoringDocFromToolResult(
  result: string,
): { docId: string; programId: string | null; title: string | null } | null {
  const doc = DOC_ID_RE.exec(result)?.[1];
  if (!doc) return null;
  const program = PROGRAM_ID_RE.exec(result)?.[1] ?? null;
  const rawTitle = TITLE_RE.exec(result)?.[1];
  let title: string | null = null;
  if (rawTitle) {
    try {
      title = String(JSON.parse(`"${rawTitle}"`)).trim() || null;
    } catch {
      title = null;
    }
  }
  return { docId: doc.toLowerCase(), programId: program ? program.toLowerCase() : null, title };
}

/* ---- AnA turn (activity + answer + grounding) ---- */

/** The section of the document's editor, and how to tell the person what happened. */
interface InsertTarget {
  bridge: EditorBridge;
  /** The editor is on screen. When it is not, the insert reopens it first. */
  open: boolean;
  reopen: () => void;
  fireToast: FireToast;
}

/**
 * Puts a settled AnA answer into the section open beside the conversation, as
 * tracked suggestions attributed to AnA and to the turn record that wrote it
 * (2026-10-01). It goes through the editor's one suggestion door
 * (`insertSuggestion`), so nothing is saved until the person reviews each
 * edit in the editor and saves — the same path as the editor's own AnA rail.
 * Not offered on the turn that drafted the open document: its answer narrates
 * a draft that is already there.
 */
function InsertIntoOpenSection({ turn, target }: { turn: CtTurn; target?: InsertTarget }) {
  if (!target?.bridge.editable || !turn.settled || !turn.answer?.trim()) return null;
  if (turn.authoringDoc?.docId === target.bridge.docId) return null;
  const { bridge, open, reopen, fireToast } = target;
  /* The governed-write rule (anaInsertGate.ts, round 11): an answer a model it
     does not admit wrote is not offered as an insert. The offer stays, disabled,
     with the reason beside it (GE-P-3); the bridge checks again. */
  const refusal = anaInsertRefusal(turn.turnRecord);
  const refusalId = `ct-insert-refusal-${turn.turnRecord?.status === 'recorded' ? turn.turnRecord.id : 'turn'}`;
  const insert = () => {
    if (refusal) return;
    /* A suggestion lands only where the person can see it: a closed editor is
       reopened first. Below 1100px the conversation is hidden while the editor
       is open, so this is the only way the offer and its target meet. */
    if (!open) reopen();
    const ok = bridge.insert(
      turn.answer ?? '',
      { id: ANA_SUGGESTION_AUTHOR_ID, name: 'AnA (AI draft)', ...(turn.sourceRecord ? { sourceRecord: turn.sourceRecord } : {}) },
      turn.turnRecord,
    );
    fireToast(ok
      ? `Inserted into ${bridge.sectionCode} as tracked suggestions — review each edit in the editor, then save.`
      : 'Couldn\u2019t insert — the editor is not editable right now (source view, or the document is locked).', ok ? 'ok' : 'error');
  };
  return (
    <div className="ct-refs">
      <button
        type="button"
        className="ct-ref"
        onClick={insert}
        disabled={!!refusal}
        aria-describedby={refusal ? refusalId : undefined}
        title={refusal ? undefined : `Adds this answer to ${bridge.sectionCode} ${bridge.sectionTitle} as suggestions you accept or reject`}
      >
        <span className="ct-ref-ic">{I.penLine}</span>
        <span className="ct-ref-l">
          {open
            ? `Insert into ${bridge.sectionCode} as tracked suggestion`
            : `Open ${bridge.sectionCode} and insert as tracked suggestion`}
        </span>
      </button>
      {refusal && (
        <span id={refusalId} style={{ flexBasis: '100%', fontSize: 11.5, color: 'var(--text-400)' }}>
          {refusal}
        </span>
      )}
    </div>
  );
}

interface AnaTurnProps {
  turn: CtTurn;
  onRefine: () => void;
  onNav: (id: string) => void;
  /** Starts a demonstration from a "Start demonstration" chip — on every turn,
   *  not only the ones that drafted a document (which is all `canvas` covers). */
  onStartDemo?: (demoId: string, title: string) => void;
  /** Continue, offered on the latest settled turn only (anaWorkModel.continueTurnIndex). */
  onContinue?: () => void;
  /** The document canvas beneath this turn, when the turn drafted a document. */
  canvas?: {
    conversationId: string | null;
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    onAsk: (text: string) => void;
    fireToast: FireToast;
    liveDrive?: OwnedSurfaceViewProps['liveDrive'];
    /** The pane beside the conversation the expanded editor renders into. */
    paneEl?: HTMLElement | null;
    /** Bumped when an AnA turn ends, so the canvas re-reads the record. */
    refreshKey?: number;
    /** Told the open section of this document's editor, and whether it is on screen. */
    onEditorBridge?: (docId: string, bridge: EditorBridge | null, open: boolean) => void;
  };
  /** The open section this answer can be inserted into, while a document is open. */
  insertTarget?: InsertTarget;
}

function AnaTurn({ turn, onRefine, onNav, onStartDemo, onContinue, canvas, insertTarget }: AnaTurnProps) {
  const a = turn.activity;
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
        {/* The progress before the words, as the component's own docblock
            puts it and WO-11 A2 asks. While the turn streams this is the
            phase line and each tool row as it lands; once the answer has
            landed it collapses to its summary and the record stays with the
            turn. `AnaActivity` is the one tool-transparency renderer. Two
            things used to sit here instead: a `.ct-think` "Thought for a
            moment" disclosure, which would now be a second renderer for her
            reasoning beside this one, and a `.ct-tool` row for `turn.tools`,
            which `toTurn` never set and so never rendered once — the dead
            renderer class this file's comments have caught twice before.
            Both deleted rather than kept beside the authority.

            There is no dots fallback either. The in-flight message carries a
            phase from the moment `useAnaChat` appends it, and the phase is
            only cleared by a text or thinking chunk (which makes the turn
            reportable) or together with `streaming: false` — so the state
            "streaming with nothing to show" cannot occur, and a renderer for
            it would be the fifth dead one on this surface. */}
        {a && <AnaActivity {...a} onContinue={onContinue} />}
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
        {/* The answer as prose. This was `<div className="ct-ana-text">{turn.answer}</div>`
            — plain text, so every heading, emphasis and list the model wrote
            reached the reader as `##`, `**` and `-`. AnaMarkdown is the ONE
            markdown renderer (marked → DOMPurify → React elements, no
            innerHTML); the person's own turn above stays as typed. */}
        {turn.answer && <AnaMarkdown text={turn.answer} className="ct-ana-text ana-md" />}
        {/* What went wrong around the answer (a failed save, a timeout), as
            the rail shows it: this screen showed none (row 74, ADR-0015 §9). */}
        <AnaMessageWarnings warnings={turn.warnings} />
        {/* What was checked about the answer, directly under it: the engine's
            check of its specific claims against this turn's sources, then
            AnA's labels, the same strip as the rail and the editor. Never under
            the document canvas, whose drafted figures it does not check. */}
        {turn.settled && <AnaGrounding evidence={turn.evidence} />}
        <InsertIntoOpenSection turn={turn} target={insertTarget} />
        {/* The document canvas: the authoring document this turn drafted,
            read from the store and expandable into THE editor in place. */}
        {turn.authoringDoc && canvas && (
          <DocumentCanvas
            docId={turn.authoringDoc.docId}
            programId={turn.authoringDoc.programId}
            conversationId={canvas.conversationId}
            fromThisConversation
            draftTitle={turn.authoringDoc.title}
            expanded={canvas.expanded}
            onExpandedChange={canvas.onExpandedChange}
            onNav={onNav}
            onAsk={canvas.onAsk}
            fireToast={canvas.fireToast}
            liveDrive={canvas.liveDrive}
            paneEl={canvas.paneEl}
            refreshKey={canvas.refreshKey}
            onEditorBridge={canvas.onEditorBridge}
          />
        )}
        {turn.links && (
          <div className="ct-refs">
            {turn.links.map((l, i) => (
              <button key={i} className="ct-ref" data-kind={l.kind} onClick={() => onNav && onNav(CT_LINKMAP[l.kind] || 'document-authoring')} title={'Open in ' + (CT_LINKMAP[l.kind] || 'editor')}>
                <span className="ct-ref-ic">{(I as any)[CT_LINKIC[l.kind]] || I.fileText}</span>
                <span className="ct-ref-l">{l.label}</span>
                <span className="ct-ref-go">{I.externalLink}</span>
              </button>
            ))}
          </div>
        )}
        {/* The context layers the platform gave her, by name. Context, not
            evidence, so no check mark: until 2026-10-04 these read "Grounded
            in ✓" on every turn, a verification nothing performed. */}
        {turn.contextUsed && (
          <div className="ct-ground">
            <span className="ct-ground-l">Context used</span>
            {turn.contextUsed.map((src, i) => (<span key={i} className="ct-ground-chip">{src}</span>))}
          </div>
        )}
        {turn.executedActions && (
          <div className="ana-msg-executed">
            <AnaActionChips
              actions={turn.executedActions}
              onNav={onNav}
              onStartDemo={onStartDemo}
            />
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
    /* A draft persisted as an AUTHORING DOCUMENT is the document canvas
       beneath its turn, not a side-panel card — one place per document, and
       the card's own draft→review transition is for the artifact store this
       document is not in. The panel keeps the non-document canvases. */
    if (d.authoringDocId) continue;
    out.push({
      id: d.artifactId || unsavedDraftId(m.id),
      kind: 'document',
      type: d.documentType || 'Document draft',
      title: d.title,
      status: d.artifactId ? 'draft' : 'unsaved',
      artifactId: d.artifactId,
      version: d.version,
      content: d.content,
      messageId: m.id,
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
  /** Opens this draft as an authoring document beside the conversation. */
  onOpenAsDocument?: () => Promise<void>;
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

function ArtifactCard({ art, expanded, onToggle, onOpenAsDocument, projectId, saveSettled, fireToast }: ArtifactCardProps) {
  /* Seeded from the artifact and then owned here, because a successful
     transition is a fact the server confirmed and the message that produced
     the draft will never carry. The card is keyed on the artifact id, so the
     moment a draft acquires a durable id this state is correctly discarded. */
  const [status, setStatus] = useState(art.status);
  const [busy, setBusy] = useState<null | 'docx' | 'review' | 'open'>(null);

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

  /* The draft becomes a document in the editor's store and opens beside the
     conversation (draftToDocument.ts). This was "Edit", which went to the
     authoring workspace with no document, so the draft never reached it. */
  const openAsDocument = async () => {
    if (busy || !onOpenAsDocument) return;
    setBusy('open');
    try {
      await onOpenAsDocument();
    } finally {
      setBusy(null);
    }
  };
  const openBlockedBecause = !art.content
    ? 'There is no draft text to open.'
    : isProgramId(projectId)
      ? null
      : 'Open a project first — a document is filed in one.';

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
              aria-label={'Open ' + art.title + ' as a document in the editor'}
              onClick={openAsDocument}
              disabled={busy !== null || !onOpenAsDocument || openBlockedBecause !== null}
              title={openBlockedBecause ?? undefined}
            >
              {I.penLine} {busy === 'open' ? 'Opening…' : 'Open as document'}
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
  /** Opens a card's draft as an authoring document beside the conversation. */
  onOpenAsDocument: (art: CtArtifact) => Promise<void>;
  projectId: string | number | null;
  /** Card ids whose producing turn has not finished — see {@link unstoredDraftReason}. */
  pendingDraftIds: ReadonlySet<string>;
  fireToast: FireToast;
}

/* The collapsed branch — a 48px `.ct-art-rail` stub reading "Artifacts" with
   a count — is gone. It was the only way back once the column was hidden, so
   hiding the column never gave the conversation the full width, only the
   width minus a stub, and the control that hid it was an unlabelled chevron
   inside this panel's own header. The thread header now owns show/hide with
   the progress chip, and the column's one close control is the progress
   panel's, at its top — this panel had a second one a few hundred pixels
   below it, for the same column. */
function ArtifactPanel({ artifacts, openId, setOpenId, onOpenAsDocument, projectId, pendingDraftIds, fireToast }: ArtifactPanelProps) {
  return (
    <aside className="ct-artifacts">
      <div className="ct-art-panel-h">
        <span className="ct-art-panel-t">{I.layers} Artifacts <span className="ct-art-panel-n">{artifacts.length}</span></span>
      </div>
      {/* Was "AnA builds, you approve and e-sign". Approving and e-signing do
          not happen here — the panel drafts, exports and routes for review, and
          the signature ceremony belongs to the sign-off prompt on the turn. */}
      <div className="ct-art-panel-sub">Governed outputs — AnA drafts, you export and route for review</div>
      <div className="ct-art-list">
        {/* Mounted only with at least one artifact (see the thread's side
            column), so there is no empty state to word. The list covers this
            session only: reloading a thread rehydrates its messages, not the
            drafts they carried. */}
        {artifacts.map(a => (
          <ArtifactCard
            key={a.id}
            art={a}
            expanded={openId === a.id}
            onToggle={() => setOpenId(openId === a.id ? null : a.id)}
            onOpenAsDocument={() => onOpenAsDocument(a)}
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

export function ConversationThread({ onNav, liveDrive, shellChat }: OwnedSurfaceViewProps) {
  // A real thread id is placed on window.C2C_CONVO by whatever opens an existing
  // conversation, and `{ id: 'new', seed }` by whatever asks a question here.
  // `current` means "the conversation already in progress" — what this screen
  // shows when the person comes back to it after AnA took them elsewhere
  // mid-answer, and (with the shell's chat) whenever there is nothing to ask.
  const asked = ((window as any).C2C_CONVO || { id: 'new' }) as {
    id: string;
    seed?: string | null;
    /** Files the seeding composer attached, by upload id. */
    seedFiles?: SentAttachment[];
  };
  /* With the shell's chat, a "new" that carries nothing to ask is the
     conversation in progress. It used to be read as "start over": the mount
     reset the shell's chat, and the shell's chat is the ONE conversation — the
     rail's, and the one AnA may be driving from. Every way of arriving here
     with nothing to ask landed on that reset: a first visit (no C2C_CONVO at
     all), "Open full thread" with an empty box, and AnA's own navigation to
     this screen, which wiped the very turn that made it. Starting over is a
     person's decision, taken with the New conversation control below. */
  const sel =
    shellChat && asked.id === 'new' && !(typeof asked.seed === 'string' && asked.seed.trim())
      ? { id: 'current', seed: null, seedFiles: undefined }
      : asked;
  const isCurrent = sel.id === 'current';
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

  /* The conversation runs on the SHELL's chat when the shell provides it —
     the one instance that outlives this screen. A private instance here was
     unmounted by the first navigation AnA made from it, which aborted the
     turn: the screen moved once and the answer stopped mid-sentence. The
     private instance remains only for a host that provides no shell chat
     (tests, an embed), and then it holds no thread of its own. */
  const ownChat = useAnaChat({
    initialThreadId: shellChat || isNew || isCurrent ? null : sel.id,
    screenName: 'conversation-thread',
    projectId: shellProjectId,
    liveDrive: liveDrive?.on,
    onDriveEvent: liveDrive?.onDriveEvent,
    onArtifactSaved: liveDrive?.onWorkSaved,
  });
  const anaChat = shellChat ?? ownChat;
  const [toast, fireToast] = useToast();
  const [loadErr, setLoadErr] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  /* The one document canvas expanded into the editor, by document id. One
     at a time: the expanded canvas takes the conversation's full width. */
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  /* The pane beside the conversation that an expanded canvas renders its
     editor into (2026-10-01). Always mounted, hidden while no canvas is open,
     so a workbench portalled into it keeps its state across close and reopen. */
  const [canvasPaneEl, setCanvasPaneEl] = useState<HTMLDivElement | null>(null);
  /* Counts AnA turns as they settle. Every canvas re-reads its document on a
     new value, so a section AnA revised in that turn is on the card. */
  const [turnsSettled, setTurnsSettled] = useState(0);
  /* The section open in a document's editor, on screen or closed and still
     mounted, reported by its canvas, so each settled answer can offer to go
     into it. A canvas clearing its report clears only its own: closing one
     document never drops another's. */
  const [editor, setEditor] = useState<{ bridge: EditorBridge; open: boolean } | null>(null);
  const onEditorBridge = useCallback((docId: string, bridge: EditorBridge | null, open: boolean) => {
    setEditor(prev => (bridge ? { bridge, open } : prev?.bridge.docId === docId ? null : prev));
  }, []);
  /* Only an editor on screen is named on turns (step 5). */
  const editorBridge = editor?.open ? editor.bridge : null;
  const insertTarget = editor
    ? { bridge: editor.bridge, open: editor.open, reopen: () => setExpandedDocId(editor.bridge.docId), fireToast }
    : undefined;
  /* While a document is open beside the conversation, every turn sent from
     here names it: the document, the section and its module, through the
     same authoring context the editor's own chat sends (2026-10-01). The
     shell's chat this thread runs on was created without one. */
  const turnOpts = editorBridge?.authoringContext ? { authoringContext: editorBridge.authoringContext } : undefined;
  /* With nothing open a turn is sent exactly as before; the third argument
     only when there is a document to name. */
  const sendTurn = (text: string, files?: Parameters<typeof anaChat.send>[1]) => {
    if (turnOpts) return anaChat.send(text, files, turnOpts);
    return files === undefined ? anaChat.send(text) : anaChat.send(text, files);
  };
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (wasStreamingRef.current && !anaChat.isStreaming) setTurnsSettled(n => n + 1);
    wasStreamingRef.current = anaChat.isStreaming;
  }, [anaChat.isStreaming]);
  /* The side column — AnA's progress over the governed outputs — is the
     progress dock on this page: one shared show/hide memory with every other
     host (workDock.ts), toggled by the chip in the header, closed from inside
     with focus handed back to the chip. */
  const dock = useProgressDock();
  const panelCollapsed = !dock.open;
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
  /* `@app` in the thread composer — the same hook the rail uses (appMentions.tsx). */
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const mentions = useAppMentions(draft, setDraft, draftRef);
  /* An ask from inside a document canvas lands HERE — in this composer, with
     focus — so the person keeps talking to AnA about the document she is
     looking at. Not auto-sent: it is her message to send. */
  const prefillComposer = (text: string) => {
    setDraft(text);
    draftRef.current?.focus();
  };
  /* Beside the conversation, an ask from the editor lands in the composer in
     view. Too narrow for two columns the conversation is hidden while the
     editor is open (authoring-v2.css), so the ask closes the editor first:
     the prefilled message is then on screen, never typed behind the document. */
  const canvasAsk = (text: string) => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1100px)').matches) {
      setExpandedDocId(null);
    }
    prefillComposer(text);
  };
  /* Scoped to the open project so extracted text lands in THAT project's
     memory, exactly as the shell composer and ProjectHome do. Null when no
     project is open, which the hook accepts — the file is still read, it just
     is not filed against a programme. */
  const { attachments, addFiles, removeAttachment, clear: clearAttachments, statusMessage } =
    useChatUpload({ projectId: shellProjectId });
  const readyAttachments = attachments.filter((a) => a.status === 'ready');
  const uploadingAttachments = attachments.filter((a) => a.status === 'uploading');

  /* Drafts opened as documents in this session (draftToDocument.ts), by the
     message that drafted them. Each becomes the document canvas under its
     turn, like a draft_authoring_document draft, and leaves the side panel. */
  const [openedDrafts, setOpenedDrafts] = useState<Record<string, { docId: string; programId: string; title: string }>>({});
  const turns: CtTurn[] = anaChat.messages.map((m) => {
    const t = toTurn(m);
    const opened = openedDrafts[m.id];
    return opened && !t.authoringDoc ? { ...t, authoringDoc: opened } : t;
  });
  const busy = anaChat.isStreaming;

  /* ── The document opens on the right while AnA builds it ───────────────────
     docs/design/ONE_ANA_ONE_CANVAS.md, slice 1 (founder, 2026-10-07: "I want to
     have a canvas on the right-hand side, and I want to see the documents being
     built"). The moment a turn being written names an authoring document, the
     editor opens beside the conversation in the existing pane; nothing waits
     for "Open full editor". Only a turn streamed while this screen is open
     does this: a conversation reopened from history opens nothing by itself.
     Each document opens by itself once; after the person closes it, it stays
     closed. It never takes the pane from a document the person has open, and
     never hides the conversation at 1100px or narrower (the editor would take
     the whole screen there): in both cases a notice offers it instead. */
  const streamedIdsRef = useRef<Set<string>>(new Set());
  const autoOpenedRef = useRef<Set<string>>(new Set());
  const [readyDoc, setReadyDoc] = useState<{ docId: string; title: string } | null>(null);
  const lastMsg = anaChat.messages[anaChat.messages.length - 1];
  if (busy && lastMsg && lastMsg.role !== 'user') streamedIdsRef.current.add(lastMsg.id);
  const liveDoc = (() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const m = anaChat.messages[i];
      const doc = turns[i].authoringDoc;
      if (m && doc && streamedIdsRef.current.has(m.id) && !autoOpenedRef.current.has(doc.docId)) return doc;
    }
    return null;
  })();
  useEffect(() => {
    if (!liveDoc) return;
    autoOpenedRef.current.add(liveDoc.docId);
    const narrow = typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 1100px)').matches;
    if (narrow || (expandedDocId !== null && expandedDocId !== liveDoc.docId)) {
      setReadyDoc({ docId: liveDoc.docId, title: liveDoc.title || 'The document' });
      return;
    }
    setReadyDoc(null);
    setExpandedDocId(liveDoc.docId);
  }, [liveDoc, expandedDocId]);
  const openReadyDoc = () => {
    if (!readyDoc) return;
    setExpandedDocId(readyDoc.docId);
    setReadyDoc(null);
  };
  const historyFailed = loadErr || !!anaChat.threadLoadError;
  const historyUnavailable = anaChat.isLoadingThread || historyFailed;
  /* The one turn Continue may be offered on: the latest, settled, with nothing
     in flight. It sends a new turn on this conversation; the stopped run is
     over, so there is nothing to resume. */
  const continueAt = continueTurnIndex(anaChat.messages, busy);
  /* This was `const artifacts: CtArtifact[] = []` — a literal, so the panel
     below it, the whole `ArtifactCard` component and every control on it were
     unreachable code that nonetheless looked finished. The drafts were already
     on the messages; nothing read them. */
  const artifacts: CtArtifact[] = conversationArtifacts(anaChat.messages)
    .filter((a) => !(a.messageId && openedDrafts[a.messageId]));
  /* A card's draft, opened as a document in the open project: the one already
     made from this turn's draft, or a new one through from-draft. It opens
     beside the conversation. Refusals are said, never shown as success. */
  const openArtifactAsDocument = async (art: CtArtifact) => {
    const m = anaChat.messages.find((x) => x.id === art.messageId);
    const d = m?.generatedDraft;
    if (!m || !d?.content) {
      fireToast('There is no draft text to open for ' + art.title + '.', 'error');
      return;
    }
    if (!isProgramId(shellProjectId)) {
      fireToast('Open a project first — a document is filed in one.', 'error');
      return;
    }
    const out = await openDraftAsDocument(
      { title: d.title, content: d.content, documentType: d.documentType },
      {
        programId: shellProjectId,
        conversationId: anaChat.threadId ?? null,
        turnId: m.turnRecord?.status === 'recorded' ? m.turnRecord.id : null,
      },
    );
    if (!out.ok) {
      fireToast(out.message, 'error');
      return;
    }
    setOpenedDrafts((prev) => ({ ...prev, [m.id]: { docId: out.docId, programId: out.programId, title: d.title } }));
    setExpandedDocId(out.docId);
    fireToast(out.reused
      ? d.title + ' is already a document in this project. It is open beside the conversation.'
      : d.title + ' is now a document in this project, open beside the conversation.');
  };
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
      ? // The first line: the composer appends "Attached: …" after a blank line.
        firstUser.text.split('\n')[0].slice(0, 60)
      : anaChat.isLoadingThread
        ? 'Loading…'
        // The conversation in progress, before anyone has said anything in it.
        : isCurrent
          ? 'New conversation'
          : 'Conversation';

  /* The latest shell chat, for the deferred seed below: by the time its
     timeout fires, the value this mount captured is a render old. */
  const shellChatRef = useRef(shellChat);
  shellChatRef.current = shellChat;

  const loadConversation = (threadId: string) => {
    setLoadErr(false);
    void anaChat.loadThread(threadId)
      .then(() => {
        const convo = window as unknown as { C2C_CONVO?: { id: string; seed?: string | null } };
        // Only the requested conversation may become current. Another screen
        // may have selected a different conversation while its history loaded.
        if (shellChat && convo.C2C_CONVO?.id === threadId) {
          convo.C2C_CONVO = { id: 'current', seed: null };
        }
      })
      .catch(() => setLoadErr(true));
  };

  /* The rule every branch below keeps: arriving on this screen never wipes a
     turn that is still running in the shell's chat. `reset` and `loadThread`
     both abort the in-flight stream, and the stream may be AnA driving — the
     move that brought the person here among its steps. The conversation starts
     over only when that was asked for — a question sent here, or the New
     conversation control — and never mid-turn. */
  useEffect(() => {
    const convo = window as unknown as { C2C_CONVO?: { id: string; seed?: string | null } };
    if (isCurrent) {
      // The conversation in progress — already in the shell chat. Nothing to
      // load, nothing to reset. Recorded as such when it was an unseeded
      // "new" (see `sel`), so every later visit reads the same.
      if (shellChat) convo.C2C_CONVO = { id: 'current', seed: null };
      return;
    }
    if (!isNew) {
      // Returning to the conversation the shell chat already holds must not
      // reload it: a reload aborts the turn that may still be running.
      if (shellChat && shellChat.threadId === sel.id) {
        convo.C2C_CONVO = { id: 'current', seed: null };
        return;
      }
      // Another conversation, asked for while AnA is still answering in this
      // one. Loading it would abort her; the person is told instead, and opens
      // it again once she has finished.
      if (shellChat?.isStreaming) {
        convo.C2C_CONVO = { id: 'current', seed: null };
        fireToast(
          'AnA is still answering in the current conversation, so it stays open. Open the other conversation again once she has finished.',
          'error',
        );
        return;
      }
      loadConversation(sel.id);
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
      const seedFiles = sel.seedFiles;
      let cancelled = false;
      const t = setTimeout(() => {
        if (cancelled) return;
        /* A question asked from elsewhere while AnA is still answering here.
           Starting its new conversation now would abort her — and a send
           without the reset is refused while she streams, which would drop
           the question without a word. Neither: the running turn stays, the
           question waits in the composer, and the person sends it when she
           has finished (into this conversation, which they can see). */
        const live = shellChatRef.current;
        if (live?.isStreaming) {
          prefillComposer(seed);
          fireToast(
            'AnA is still answering, so your question has not been sent. It is in the composer: steer her with it now, or send it once she has finished.',
            'error',
          );
          return;
        }
        // A new conversation starts clean in the shared chat.
        if (live) live.reset();
        void anaChat.send(seed, seedFiles);
      }, 0);
      // From here on this screen shows the conversation in progress.
      convo.C2C_CONVO = shellChat ? { id: 'current', seed: null } : { ...sel, seed: null };
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    // With no shell chat, an unseeded "new" is this screen's own fresh chat:
    // nothing to load and nothing to clear.
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

  /* ── One box during a run (docs/design/ONE_ANA_ONE_CANVAS.md, slice 4) ──────
     While a run that can take a steer is in flight, this composer steers it:
     the run strip's own "Steer this run…" box is not drawn here, and the drive
     strip draws none on this screen. Same rules the strip's box kept: under a
     Manual hold the steer replaces the step shown ("Do this instead"); the
     text is cleared only once the server accepted it; a refusal says so and
     keeps the text. A steer is words only: attachments wait for the next turn. */
  const steering = busy && !!anaChat.runStatus;
  const manualHold = anaChat.runStatus === 'paused' && anaChat.runHold?.reason === 'manual';
  const steerHelp = steering && anaChat.runStatus ? steerHelpFor(manualHold, anaChat.turnRunPolicy, anaChat.runStatus) : null;
  const [steerBusy, setSteerBusy] = useState(false);
  const [steerRefused, setSteerRefused] = useState(false);
  const steer = () => {
    const v = draft.trim();
    if (!v || steerBusy) return;
    setSteerBusy(true);
    setSteerRefused(false);
    void Promise.resolve(anaChat.interject(v))
      .then((accepted) => {
        if (accepted === false) {
          setSteerRefused(true);
          return;
        }
        setDraft('');
      })
      .catch(() => setSteerRefused(true))
      .finally(() => setSteerBusy(false));
  };

  const send = () => {
    if (steering) {
      steer();
      return;
    }
    const t = draft.trim();
    // Never send mid-upload: AnA would answer about a document the server has
    // not finished reading. Same rule as the shell composer.
    if (busy || historyUnavailable || uploadingAttachments.length > 0) return;
    if (!t && readyAttachments.length === 0) return;

    // Only files the server CONFIRMED it read are named. A failed upload must
    // never be described as attached — its chip stays visible with the error
    // and the message says nothing about it.
    const { body, files } = composeTurn(t, readyAttachments);

    setDraft('');
    clearAttachments();
    void sendTurn(body, files);
  };

  /* The person asking to start over — the one path on this screen that clears
     the conversation (the rail's "New thread" is the same `reset`, on screens
     that draw the rail). Nothing is deleted: every turn of the previous
     conversation is already in the governed conversation store.

     Reset cancels a pending history read too, so even a stalled load can be
     explicitly replaced with a new conversation without restoring old turns. */
  const cannotStartOver = busy;
  const startNewConversation = () => {
    if (cannotStartOver) return;
    anaChat.reset();
    setLoadErr(false);
    setOpenId(null);
    setExpandedDocId(null);
    (window as any).C2C_CONVO = shellChat ? { id: 'current', seed: null } : { id: 'new', seed: null };
    draftRef.current?.focus();
  };

  const loadingHistory = !isNew && anaChat.isLoadingThread && turns.length === 0;

  return (
    <div className="ct-wrap" data-canvas-expanded={expandedDocId ? 'true' : undefined}>
      {/* `ct-thread-head`, not `ct-head`: that name is the grid header row of
          every `.ct-table` (surfaces-v2.css), and this header's flex rule for
          it, loaded later, collapsed the audit trail's and six other tables'
          column headers into the first 270px (launch sweep finding 47). */}
      <div className="ct-thread-head">
        <button className="ct-back" onClick={() => onNav && onNav('project-home')}>{I.left} Project</button>
        <div className="ct-head-mid">
          <div className="ct-head-t">{title}</div>
          <div className="ct-head-m">{I.messageSquare} Conversation</div>
        </div>
        <div className="ct-head-r">
          <span className="ct-head-model">{I.zap} AnA</span>
          {/* Starting over is asked for, never inferred from how the person
              arrived (see `sel`). Unavailable while AnA is answering: a reset
              aborts her mid-turn, and when she is driving, mid-move. */}
          <button
            type="button"
            className="ct-head-open"
            onClick={startNewConversation}
            disabled={cannotStartOver}
            title={
              busy
                ? 'AnA is still answering. A new conversation can start once she has finished.'
                : undefined
            }
          >
            {I.plus} New conversation
          </button>
          {/* The one place the side column is shown and hidden from. It used
              to be a chevron in the artifact panel's own header, with a 48px
              stub left behind when collapsed — a control that had to be hunted
              for, and a collapse that never gave the conversation the full
              width. `.ct-head-open` is this header's existing button style,
              which had no remaining user. */}
          <AnaProgressChip
            ref={dock.chipRef}
            messages={anaChat.messages}
            streaming={anaChat.isStreaming}
            runStatus={anaChat.runStatus}
            runHold={anaChat.runHold}
            open={dock.open}
            onToggle={dock.toggle}
            controls={dock.panelId}
          />
        </div>
      </div>

      <div className="ct-main" data-canvas-open={expandedDocId ? 'true' : undefined}>
        <div className="ct-conv">
          <div className="ct-scroll" ref={scrollRef} onScroll={onScroll}>
            <div className="ct-col">
              {loadingHistory && (
                <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>Loading conversation…</div>
              )}
              {historyFailed && (
                <div role="alert">
                  <EmptyState
                    tone="error"
                    icon={I.alertTriangle}
                    title="Couldn't load this conversation"
                    hint={anaChat.threadLoadError?.message ?? 'Retry loading this conversation, or choose New conversation. Your question has not been sent.'}
                  />
                  {(anaChat.threadLoadError?.threadId || (!isNew && !isCurrent)) && (
                    <button type="button" className="ct-head-open" disabled={anaChat.isLoadingThread}
                      onClick={() => loadConversation(anaChat.threadLoadError?.threadId ?? sel.id)}>
                      Retry loading conversation
                    </button>
                  )}
                </div>
              )}
              {turns.length === 0 && !loadingHistory && !historyFailed && (
                <div className="ct-empty">
                  <div className="ct-empty-mk">{'✻'}</div>
                  <h2>Talk to AnA</h2>
                  <p>Ask a question, or ask AnA to do the work. AnA thinks, pulls from the evidence, and streams a grounded answer — every turn is saved to your governed conversation store.</p>
                  <div className="ct-empty-chips">
                    {STARTER_ASKS.map((q, i) => (
                      <button key={i} className="ct-empty-chip" onClick={() => { void anaChat.send(q); }}>{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {turns.map((t, i) => t.role === 'user'
                ? (<div key={i} className="ct-turn ct-user"><div className="ct-user-b">{t.text}</div></div>)
                : (
                  <AnaTurn
                    key={i}
                    turn={t}
                    onRefine={() => { void sendTurn('Refine that — keep it tighter and more declarative.'); }}
                    onNav={onNav}
                    onStartDemo={liveDrive?.onStartDemo}
                    onContinue={i === continueAt ? () => { void sendTurn(CONTINUE_PROMPT); } : undefined}
                    insertTarget={insertTarget}
                    canvas={t.authoringDoc ? {
                      conversationId: anaChat.threadId ?? (isNew || isCurrent ? null : sel.id),
                      expanded: expandedDocId === t.authoringDoc.docId,
                      onExpandedChange: (open) => setExpandedDocId(open ? t.authoringDoc!.docId : null),
                      onAsk: canvasAsk,
                      fireToast,
                      liveDrive,
                      paneEl: canvasPaneEl,
                      refreshKey: turnsSettled,
                      onEditorBridge,
                    } : undefined}
                  />
                )
              )}
              {/* No trailing "typing" turn. The in-flight message is already
                  the last turn above — `useAnaChat` appends it, streaming and
                  with a phase, in the same render that sets `isStreaming` —
                  and its own <AnaActivity /> is the waiting state. A second
                  block here drew a second avatar with three dots beside the
                  real record, for the whole of every run. */}
            </div>
          </div>

          {/* Mid-run control, where the person types: this screen has no rail,
              so a Manual hold is answered here (Run this step / Do this
              instead / Stop). Pause, resume and steer only once the run is
              controllable, as the shell gates the rail's; Stop always. */}
          <RunControlStrip
            streaming={anaChat.isStreaming}
            runStatus={anaChat.runStatus}
            runHold={anaChat.runHold}
            runPolicy={anaChat.turnRunPolicy}
            onPause={anaChat.runStatus ? () => void anaChat.pause() : undefined}
            onResume={anaChat.runStatus ? () => void anaChat.resume() : undefined}
            onStop={() => void anaChat.stop()}
            /* No steer box in the strip here: this screen's composer steers. */
          />
          {/* Announced, never focus-stealing: the person may be typing. */}
          <div className="ct-ready-doc" role="status" aria-live="polite">
            {readyDoc && (
              <>
                <span className="ct-ready-doc-t">
                  AnA built <b>{readyDoc.title}</b>
                </span>
                <button type="button" className="btn ghost" data-testid="ct-ready-doc-open" onClick={openReadyDoc}>
                  Open
                </button>
                <button type="button" className="ct-ready-doc-x" aria-label="Dismiss" onClick={() => setReadyDoc(null)}>
                  {'×'}
                </button>
              </>
            )}
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
              <textarea ref={draftRef} rows={1}
                aria-label={steering ? (manualHold ? 'Tell AnA what to do instead' : 'Steer this run') : 'Reply to AnA'}
                placeholder={steering ? (manualHold ? 'Or tell AnA what to do instead' : 'Steer this run — AnA takes it at her next step') : 'Reply to AnA — ask, request a draft, or type @ to name an app...'}
                aria-invalid={(steering && steerRefused) || undefined}
                aria-describedby={steering ? [steerRefused ? 'ct-steer-err' : '', steerHelp ? 'ct-steer-help' : ''].filter(Boolean).join(' ') || undefined : undefined}
                value={draft}
                aria-autocomplete="list" aria-controls={mentions.open ? 'ct-mentions' : undefined} aria-expanded={mentions.open}
                onChange={e => { setDraft(e.target.value); mentions.sync(e.currentTarget); if (steerRefused) setSteerRefused(false); }}
                onSelect={e => mentions.sync(e.currentTarget)}
                onBlur={() => mentions.close()}
                onKeyDown={e => { if (mentions.onKeyDown(e)) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <AppMentionMenu api={mentions} id="ct-mentions" />
              {steering ? (
                <button
                  className="ct-comp-send ct-comp-steer"
                  data-testid="ct-steer-send"
                  disabled={!draft.trim() || steerBusy}
                  onClick={send}
                >
                  {steerBusy ? 'Sending…' : manualHold ? 'Do this instead' : 'Steer'}
                </button>
              ) : (
                <button
                  className="ct-comp-send"
                  aria-label="Send message to AnA"
                  /* Attachments alone are a valid message, and an in-flight
                     upload blocks send — the old condition looked only at the
                     textarea, which is why attaching could never have worked
                     even if the paperclip had opened a picker. */
                  disabled={busy || historyUnavailable || uploadingAttachments.length > 0 || (!draft.trim() && readyAttachments.length === 0)}
                  onClick={send}
                >
                  {I.arrowUp}
                </button>
              )}
            </div>
            {steering && steerHelp && (
              <span id="ct-steer-help" className="ana-runctl-help">{steerHelp}</span>
            )}
            {steering && steerRefused && (
              <span id="ct-steer-err" className="ana-runctl-err" role="status">
                Not sent — AnA did not accept this steer. The text is still here.
              </span>
            )}

            {/* What was actually attached, and how the server read it. A failed
                upload stays visible with its reason rather than disappearing
                and leaving the user to assume it worked. */}
            {attachments.length > 0 && (
              <div className="ct-comp-atts">
                {attachments.map((a) => (
                  <span key={a.id} className="ct-att-chip" data-status={a.status}>
                    {I.paperclip} {a.name}
                    {a.status === 'uploading' && <em> · reading…</em>}
                    {a.status === 'ready' && <em> · {readyAttachmentLabel(a.extractionMethod, a.extractionWords)}</em>}
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
            <div className="ct-comp-foot"><LiveDriveSwitch /><RunPolicySwitch variant="foot" /></div>
            <div className="ct-comp-foot">{I.lock} Governed — AnA proposes; you accept. Accepted changes are captured as immutable, 21 CFR Part 11-audited versions when persisted.</div>
          </div>
        </div>

        {/* The document being built, beside the conversation (2026-10-01). An
            expanded canvas portals the one editor in here, so the person edits
            with AnA's answers and the composer still in view. Empty and hidden
            until a canvas opens; each canvas's region keeps its own label. */}
        <div className="ct-canvas-pane" ref={setCanvasPaneEl} hidden={!expandedDocId} data-testid="ct-canvas-pane" />

        {/* The side column: AnA's live work above the governed outputs. The
            dock is the same component the shell rail mounts — progress, queue,
            tools, outputs, context. Hidden, the column is not rendered at all,
            so the conversation takes the full width rather than the width
            minus a stub. `data-artifacts` lets the stylesheet cap the dock's
            height only when there is something below it to make room for. */}
        {/* Not drawn while a document canvas is expanded: the editor's pane
            takes that room beside the conversation, and its own rails are on
            screen. */}
        {!panelCollapsed && !expandedDocId && (
          <div className="ct-side" id={dock.panelId} data-artifacts={artifacts.length > 0 ? 'true' : 'false'}>
            <div className="ct-side-work">
              <AnaWorkPanel
                messages={anaChat.messages}
                streaming={anaChat.isStreaming}
                runStatus={anaChat.runStatus}
                runHold={anaChat.runHold}
                pendingSteers={anaChat.pendingSteers}
                queue={agentActivity}
                onClose={dock.close}
                /* Not `announce`. This surface passed it because it mounted no
                   other announcer; every AnA turn above now carries its own
                   <AnaActivity />, whose polite region speaks the phase, so a
                   second region here would say the same thing twice, back to
                   back, for every status event — the case AnaWorkPanel's own
                   docblock warns against and the rail already avoids. */
                context={{
                  project: shellProgramName(),
                  surface: 'Conversation',
                }}
              />
            </div>
            {/* Only when there is an artifact to list. Empty, it was a count of
                zero and a paragraph promising "documents AnA drafts appear
                here" — beside a drafted document, which is the canvas under
                its turn and never listed here (conversationArtifacts). */}
            {artifacts.length > 0 && (
              <ArtifactPanel artifacts={artifacts} openId={openId} setOpenId={setOpenId} onOpenAsDocument={openArtifactAsDocument}
                projectId={shellProjectId} pendingDraftIds={pendingDraftIds} fireToast={fireToast} />
            )}
          </div>
        )}
      </div>
      <C2CToast msg={toast} />
    </div>
  );
}
