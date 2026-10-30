/**
 * DocumentCanvas — an authoring document, inline in the conversation, that
 * converts into the full editor in place.
 *
 * ── What it is ───────────────────────────────────────────────────────────────
 * Mounted by `surfaces/ConversationThread.tsx` beneath any AnA message whose
 * draft carries `authoringDocId` — the `draft_authoring_document` tool wrote
 * the document into the authoring store (`authoring_documents` /
 * `authoring_sections`) and the `artifact_draft` stream event named it. The
 * canvas READS that document (GET /api/authoring/docs/:id and /sections) —
 * never the event's inline content — so what the person sees is the record,
 * and reopening the thread later shows the same document from the same store.
 *
 * Collapsed, it is the card: title, type, project (name and phase),
 * provenance, the first section rendered through the one read-only renderer
 * (`AuthoredHtml`, the same audited sanitiser the editor uses), the section
 * count, and the four actions — Open full editor, File to vault, Assign
 * review, Place into filing.
 *
 * Expanded, it "converts into a full editor": it mounts `DocumentWorkbench`
 * PINNED to this document — the same component the Authoring surface renders,
 * over the same store, with the same rails (comments, history, sources, audit,
 * signatures, exports, project files, tasks) and the same one save path. No
 * navigation, no reload. In the thread (2026-10-01) the editor opens BESIDE the
 * conversation: the thread passes `paneEl`, the expanded region is portalled
 * there, and the card stays in the conversation marked as the open document,
 * so the person edits with AnA's answers and the composer in view, as one
 * builds a document with Claude. Without a pane it expands in place, as
 * before. "Back to conversation" and Escape collapse it; the workbench stays
 * mounted (hidden) so its state — open section, rail, unsaved text — survives
 * collapsing and re-expanding. Every ask from inside the workbench lands in
 * the thread's composer.
 *
 * ── Why the previous five were deleted, and why this is not a sixth ──────────
 * CLAUDE.md, "Deleting a user-facing capability": each earlier canvas or
 * editor was its own component over its own store, unreachable from the
 * thread, and was removed as dead code by a session that did not know the
 * one before it. This one is a thin host around THE editor; the gate
 * `scripts/ci/check-canvas-path.mjs` fails the build if the thread stops
 * mounting it or it stops mounting the workbench.
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * A failed read is an error card with a retry, never an empty document. The
 * project is named only when a program id was recorded for the draft (the
 * event's `programId`) or the document is listed under the open program;
 * otherwise the card says "Not filed under a program". Provenance is what the
 * store returns, plus the one fact this host knows — the draft event arrived
 * in this conversation — and nothing more.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { authService, useAuth } from '@/services/portal/authService';
import { captureDocumentRefreshOwner, readDocumentRecord, type DocRow, type SectionRow } from './documentRecordRead';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import type { FireToast } from '../toast';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { setEditorTarget } from '../editorTarget';
import { AuthoredHtml } from './AuthoredHtml';
import {
  DocumentWorkbench,
  escapeBelongsToInner,
  readDocumentAccess,
  actRefusal,
  UNKNOWN_DOCUMENT_ACCESS,
  type AuthDoc,
  type DocumentAccess,
  type EditorBridge,
} from './DocumentWorkbench';
import { AuthoringPlaceIntoFiling } from '../surfaces/AuthoringPlaceIntoFiling';
import { FileToVaultDialog } from './FileToVaultDialog';
import { SendForReviewDialog } from './SendForReviewDialog';
import { useProgramRead, programHeadline, programLineFor } from './programSummary';
import { describeProvenance, moduleWasAssumed, type DocumentProvenance } from './provenance';
import { OpenedDocumentPending, StatusPill, ToDocumentsButton } from './CanvasDocumentList';
import { useCanvasEscape, useCanvasRegionFocus, useOriginSectionFocus } from './canvasFocus';
import type { AskOrigin } from './askAnaToDraft';
import { originForSavedSection } from './authoringConversationOrigin';
import { sourceMetadataUnavailable } from './savedTemplateContext';
import { captureAuthoringSession, changedSectionCodes, useAuthoringReadSession } from './authoringCurrentRead';

export interface DocumentCanvasProps {
  docId: string;
  /** The program the draft was filed under, when the stream said so. */
  programId: string | null;
  /** This thread's id, for the return route the Authoring surface offers. */
  conversationId: string | null;
  /** The draft event for this document arrived in THIS conversation. */
  fromThisConversation: boolean;
  /** What the message called it, shown until the record is read. */
  draftTitle?: string | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onNav: (id: string) => void;
  /** Put a prompt in the thread's composer (the workbench's asks). */
  onAsk: (text: string, savedOrigin?: AskOrigin) => void;
  fireToast: FireToast;
  liveDrive?: OwnedSurfaceViewProps['liveDrive'];
  /**
   * Where the expanded editor renders. The thread passes a pane BESIDE its
   * conversation column, so the person edits with AnA's answers and the
   * composer in view, as one builds a document with Claude. Without it (the
   * Authoring surface, tests of the card alone) the editor expands in place.
   */
  paneEl?: HTMLElement | null;
  /**
   * A new value re-reads the record quietly. The thread bumps it when AnA's
   * turn ends, so a revision AnA made is on the card without reopening the
   * thread; the sections whose text changed are marked updated.
   */
  refreshKey?: number;
  /**
   * Told which section of this document's editor is open, and given its
   * suggestion door, with whether the editor is on screen (`open`); null once
   * there is no editor. The thread uses it to put AnA's answers into the
   * document being built, and to name it on turns while it is open.
   */
  onEditorBridge?: (docId: string, bridge: EditorBridge | null, open: boolean) => void;
  /**
   * The conversation's Documents list (docs/design/ONE_ANA_ONE_CANVAS.md
   * §4.1, §4.3). Given, the editor's bar carries "← Documents (n)", which
   * closes this document and shows the list in its place. `listCount` is how
   * many the conversation built, when known.
   */
  onShowList?: () => void;
  listCount?: number | null;
  /**
   * No card in the conversation: the document was opened from the Documents
   * list and has no turn of its own on screen (another conversation's, or a
   * turn whose trace lost its id). Only the editor, beside the conversation.
   */
  cardless?: boolean;
  /**
   * Whether closing the editor hands focus back to this card's open control.
   * The host says no when focus belongs elsewhere (the list row that opened it).
   */
  returnFocus?: boolean;
  /** Exact saved section carried by an Authoring conversation handoff. */
  focusSectionId?: string;
  /** The first asynchronous origin expansion keeps focus in the composer. */
  focusOnOpen?: boolean;
}

/** The stored document type (`product_code`), in words: `clinical_overview` → "Clinical overview". */
export function documentTypeLabel(code: string | null | undefined): string | null {
  const c = (code ?? '').trim();
  if (!c) return null;
  const words = c.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

export { changedSectionCodes };

/** A section counts as drafted when its stored text has any visible content. */
function isDrafted(content: string | null): boolean {
  return (content ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
}

/* `escapeBelongsToInner` — true when the keydown should NOT collapse the
   canvas (inside a dialog, the editor's own document, or a text control) —
   moved to DocumentWorkbench.tsx on 2026-09-28 (GA-4) so the workbench's rails
   ask the same question; re-exported here for existing importers. */
export { escapeBelongsToInner };

export function DocumentCanvas({
  docId,
  programId,
  conversationId,
  fromThisConversation,
  draftTitle = null,
  expanded,
  onExpandedChange,
  onNav,
  onAsk,
  fireToast,
  liveDrive,
  paneEl = null,
  refreshKey = 0,
  onEditorBridge,
  onShowList, listCount = null, cardless = false, returnFocus = true, focusSectionId, focusOnOpen = true,
}: DocumentCanvasProps) {
  /* Beside the conversation the card stays in the thread, marked as the
     document that is open; in place it gives way to the editor. */
  const beside = paneEl !== null;
  const { user } = useAuth();
  const readSession = useAuthoringReadSession(user);
  const [draftOwner] = useState(() => ({ session: captureAuthoringSession(), programId, docId }));
  const readKey = JSON.stringify([readSession.actor, readSession.key, programId, docId]);
  const currentReadKey = useRef(readKey);
  currentReadKey.current = readKey;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const recordCurrent = loadedKey === readKey && readSession.sameRevision();
  const [storedState, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const state = recordCurrent ? storedState : 'loading';
  const [error, setError] = useState<string | null>(null);
  const [storedDoc, setDoc] = useState<DocRow | null>(null);
  const doc = recordCurrent ? storedDoc : null;
  const partialRead = doc?.readScope === 'sections';
  /* GE-P-3 (2026-09-28): what this caller may do to the document, from the
     same read (`access`). Unknown until read, and unknown stays enabled. */
  const [storedAccess, setAccess] = useState<DocumentAccess>(UNKNOWN_DOCUMENT_ACCESS);
  const access = recordCurrent ? readDocumentAccess(storedAccess, partialRead ? 'sections' : undefined) : UNKNOWN_DOCUMENT_ACCESS;
  const vaultRefusalId = useId();
  const assignRefusalId = useId();
  const [storedSections, setSections] = useState<SectionRow[]>([]);
  const sections = recordCurrent ? storedSections : [];
  const [showAll, setShowAll] = useState(false);
  /* The section the outline chose; null shows the first. */
  const [focusId, setFocusId] = useState<string | null>(null);
  /* Codes whose text changed on the last quiet re-read, and whether that
     re-read failed (the record already on screen stays). */
  const [updatedCodes, setUpdatedCodes] = useState<string[]>([]);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const sectionsRef = useRef<SectionRow[]>([]);
  const [fileToVaultOpen, setFileToVaultOpen] = useState<string | null>(null);
  const [assignReviewOpen, setAssignReviewOpen] = useState<string | null>(null);
  useEffect(() => {
    setFileToVaultOpen(null);
    setAssignReviewOpen(null);
  }, [readKey]);
  /* The workbench mounts on the FIRST expand and stays mounted afterwards,
     hidden while collapsed, so its state survives; before that first expand
     a long thread pays nothing for canvases nobody opened. */
  const [workbenchMounted, setWorkbenchMounted] = useState(false);
  const [workbenchKey, setWorkbenchKey] = useState<string | null>(null);
  useEffect(() => {
    if (workbenchMounted && doc) setWorkbenchKey(readKey);
  }, [workbenchMounted, doc, readKey]);
  const keepWorkbench = workbenchMounted && recordCurrent && (!!doc || workbenchKey === readKey);
  const { program, state: programState } = useProgramRead(programId);
  const rootRef = useRef<HTMLElement>(null);
  /* The expanded region. Beside the conversation it is portalled into the
     pane, outside rootRef, so anything that asks about the open editor asks
     this element rather than the card. */
  const expandedRef = useRef<HTMLDivElement>(null);
  const expandBtnRef = useRef<HTMLButtonElement>(null);
  const backBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  /* The expanded region's id, so the control that opens it can say what it
     controls (`aria-controls`) rather than only that it is expanded. */
  const expandedId = useId();

  const loadScopeKey = readKey;
  const loadScope = useRef({ key: loadScopeKey });
  if (loadScope.current.key !== loadScopeKey) loadScope.current = { key: loadScopeKey };
  const loadSequence = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async (quiet = false, recovery = false) => {
    const scope = loadScope.current;
    if (scope.key !== readKey) return false;
    const owner = captureDocumentRefreshOwner(recovery);
    if (!owner) return false;
    const sequence = ++loadSequence.current;
    const revision = authService.captureSessionReadGuard().sameRevision;
    const currentRead = () => alive.current && loadScope.current === scope && loadSequence.current === sequence
      && currentReadKey.current === readKey && readSession.sameRevision() && revision() && owner.current();
    if (!quiet) {
      setLoadedKey(readKey);
      setState('loading');
      setError(null);
      setDoc(null);
      setSections([]);
      setAccess(UNKNOWN_DOCUMENT_ACCESS);
    }
    const read = await readDocumentRecord(docId, recovery, programId, { headers: owner.headers, current: currentRead });
    if (!read || !currentRead()) return false;
    if (!read.ok) {
      /* A refresh that failed is not an empty document: keep the record on
         screen and say the refresh did not land. */
      if (quiet && !read.refused) {
        setRefreshFailed(true);
        return false;
      }
      setState('error');
      setError(read.message);
      if (read.refused) {
        setDoc(null); setSections([]); setAccess(UNKNOWN_DOCUMENT_ACCESS);
      } else if (read.doc) setDoc(read.doc);
      return false;
    }
    setLoadedKey(readKey);
    setUpdatedCodes(quiet ? changedSectionCodes(sectionsRef.current, read.sections) : []);
    setRefreshFailed(false);
    setDoc(read.doc);
    setAccess(readDocumentAccess(read.access));
    sectionsRef.current = read.sections;
    setSections(read.sections);
    setState('ready');
    return true;
  }, [docId, programId, readKey, readSession]);

  useEffect(() => {
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  /* A new refreshKey (AnA's turn ended) re-reads quietly. The first value is
     the mount, which the load above already covers. */
  const firstRefresh = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === firstRefresh.current) return;
    firstRefresh.current = refreshKey;
    void load(true);
  }, [refreshKey, load]);

  useCanvasEscape({ expanded, expandedRef, rootRef, onExpandedChange });

  useEffect(() => {
    if (expanded && !workbenchMounted) setWorkbenchMounted(true);
  }, [expanded, workbenchMounted]);

  const toList = useCanvasRegionFocus({
    expanded, cardless, returnFocus, focusOnOpen, mounted: workbenchMounted,
    recordReady: doc !== null, back: backBtnRef, card: expandBtnRef,
  });
  const showList = () => {
    toList.current = true;
    onShowList?.();
  };

  const metadataAvailable = doc && !sourceMetadataUnavailable(doc);
  const provenance: DocumentProvenance | null = metadataAvailable
    ? describeProvenance(doc.provenance, { inThisConversation: fromThisConversation })
      ?? (fromThisConversation
        ? { source: 'ana', line: 'Drafted by AnA in this conversation · model not recorded', model: null, conversationId, turnId: null, authorName: null, note: null }
        : null)
    : null;

  const title = doc?.title ?? (state !== 'error' && draftOwner.programId === programId && draftOwner.docId === docId &&
    draftOwner.session.sameRevision() ? draftTitle : null) ?? 'Document';
  const programLine = programHeadline(program);
  const sectionCount = partialRead ? sections.length : sections.length || Number(doc?.section_count ?? 0) || 0;
  const draftedCount = sections.filter(x => isDrafted(x.content)).length;
  const first = sections[0] ?? null;
  const focused = (focusId && sections.find(x => x.id === focusId)) || first;
  const shown = showAll ? sections : focused ? [focused] : [];
  const typeLabel = documentTypeLabel(doc?.product_code);

  const openInAuthoring = () => {
    /* The thread's Edit carries the document identity on the one editor
       channel — the same defect fixed for Vault (vaultOpenInEditorCarriesDoc). */
    setEditorTarget({
      docType: null,
      docId,
      programId,
      programTitle: program?.name ?? null,
      returnTo: conversationId ? { surface: 'conversation-thread', conversationId } : null,
    });
    onNav('document-authoring');
  };

  const docsForWorkbench: AuthDoc[] = doc
    ? [{ id: doc.id, title: doc.title, module: doc.module, product_code: doc.product_code, status: doc.status, updated_at: doc.updated_at, section_count: doc.section_count, c2c_document_id: doc.c2c_document_id, readScope: doc.readScope }]
    : [];

  const reloadDoc = useCallback(async () => {
    await load();
  }, [load]);
  const refreshCreationContext = useCallback(() => load(true, true), [load]);

  const [bridge, setBridge] = useState<EditorBridge | null>(null);

  /* A section not yet drafted is one ask away (2026-10-01). The ask opens
     the editor at that section, so the turn names it and AnA's answer offers
     to go into it, and lands in the composer for the person to send. The
     wording asks for the text in the conversation: the document exists, and
     a second one drafted from this ask would be a duplicate. */
  const [focusSection, setFocusSection] = useOriginSectionFocus(focusSectionId);
  const askToDraft = (sec: SectionRow) => {
    if (!doc) return;
    setFocusSection(prev => ({ id: sec.id, nonce: (prev?.nonce ?? 0) + 1 }));
    onExpandedChange(true);
    onAsk('Draft the text for the saved section attached to this question here in the conversation, so I can insert it into the existing document.', originForSavedSection(doc, sec, programId));
  };
  /* The workbench reports its open section whether or not this canvas is
     expanded (it stays mounted, hidden), and so does this, saying which. An
     insert lands only where the person can see it, so the thread reopens a
     closed editor before inserting; and only an open one is named on turns. */
  useEffect(() => {
    if (!onEditorBridge) return undefined;
    onEditorBridge(docId, bridge, expanded);
    return () => onEditorBridge(docId, null, false);
  }, [onEditorBridge, docId, expanded, bridge]);

  return (
    <section
      ref={rootRef}
      className="dcv"
      data-expanded={expanded || undefined}
      aria-labelledby={cardless ? undefined : titleId}
      aria-label={cardless ? title : undefined}
      data-testid="document-canvas"
      data-doc-id={docId}
    >
      {/* ── The card ── (none when the document was opened from the list) */}
      {!cardless && (
      <div className="dcv-card" hidden={expanded && !beside} data-open-beside={(expanded && beside) || undefined}>
        <div className="dcv-head">
          <div className="dcv-kind">
            {I.fileText} Document{typeLabel ? ` · ${typeLabel}` : ''}
            {doc?.module && (metadataAvailable && moduleWasAssumed(doc.provenance) ? (
              <span title={`No module was chosen when this document was created, so ${doc.module} was assumed. Check it before filing.`}>
                {` · ${doc.module} (assumed)`}
              </span>
            ) : ` · ${doc.module}`)}
            {doc?.status ? ` · ${String(doc.status).replace(/_/g, ' ').toLowerCase()}` : ''}
          </div>
          <h3 className="dcv-title" id={titleId}>{title}</h3>
          <div className="dcv-meta">
            {programId ? (
              <span className="dcv-project">{I.folder} {programLineFor(program, programState)}</span>
            ) : (
              <span className="dcv-project dcv-project-none" data-testid="dc-no-program">{I.folder} Not filed under a project</span>
            )}
            {state === 'ready' && (
              <span data-testid="dc-progress">
                {sectionCount === 0 ? partialRead ? 'No accessible sections in this view' : 'No sections'
                  : `${draftedCount} of ${sectionCount} ${partialRead ? 'accessible ' : ''}section${sectionCount === 1 ? '' : 's'} drafted`}
              </span>
            )}
          </div>
          {provenance && (
            <div className="dcv-prov" data-source={provenance.source} data-testid="dc-provenance">{provenance.line}</div>
          )}
          {partialRead && <div className="scaf-note" role="status" data-testid="dc-read-scope">
            Showing only sections available with your current access. The full document and source metadata are not available in this view.
          </div>}
          {updatedCodes.length > 0 && (
            <div className="dcv-updated" role="status" data-testid="dc-updated">
              Updated after AnA’s last turn: {updatedCodes.join(', ')}
            </div>
          )}
          {refreshFailed && (
            <div className="dcv-updated" role="status" data-tone="err" data-testid="dc-refresh-failed">
              Couldn’t refresh after AnA’s last turn — this is the version read earlier.{' '}
              <button type="button" className="nda-open" onClick={() => void load(true)}>Retry</button>
            </div>
          )}
        </div>

        {state === 'loading' ? (
          <div role="status" className="scaf-note" style={{ padding: '12px 0' }}>Reading the document…</div>
        ) : state === 'error' ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn’t read this document"
            hint={error ?? 'The authoring store did not respond. This is a failed read, not an empty document.'}
            retry={() => void load()}
            testId="dc-error"
          />
        ) : sections.length === 0 ? (
          <p className="dcv-empty">{partialRead ? 'No accessible sections were returned in this view.' : 'This document has no sections yet. Open the full editor to add one, or ask AnA to draft the sections.'}</p>
        ) : (
          /* Collapsed to the card's head while the document is open beside the
             conversation: the outline and the section are in the editor next to
             it, and the editor's own "Draft with AnA" takes the ask. */
          <div className="dcv-body" hidden={expanded && beside}>
            {sections.length > 1 && (
              <ol className="dcv-outline" aria-label="Sections">
                {sections.map(sec => {
                  const drafted = isDrafted(sec.content);
                  const updated = updatedCodes.includes(sec.code);
                  const current = !showAll && focused?.id === sec.id;
                  return (
                    <li key={sec.id} data-drafted={drafted ? 'true' : 'false'} data-updated={updated || undefined}>
                      <button
                        type="button"
                        className="dcv-outline-item"
                        aria-current={current || undefined}
                        onClick={() => { setFocusId(sec.id); setShowAll(false); }}
                      >
                        <span className="dcv-outline-code">{sec.code}</span>
                        <span className="dcv-outline-t">{sec.title}</span>
                      </button>
                      <span className="dcv-outline-state">
                        {updated ? 'Updated' : drafted ? 'Drafted' : 'Not drafted'}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {shown.map(sec => (
              <article key={sec.id} className="dcv-sec" aria-label={`${sec.code} ${sec.title}`}>
                <div className="dcv-sec-h">
                  <span className="dcv-sec-num">{sec.code}</span>
                  <span className="dcv-sec-t">{sec.title}</span>
                </div>
                {(sec.content ?? '').trim() ? (
                  <AuthoredHtml className="dcv-sec-body ed-full-sec-body" html={sec.content ?? ''} />
                ) : (
                  <p className="dcv-sec-empty">
                    Not drafted yet.
                    <button type="button" className="nda-open" onClick={() => askToDraft(sec)}>
                      {`Ask AnA to draft ${sec.code}`}
                    </button>
                  </p>
                )}
              </article>
            ))}
            {sections.length > 1 && (
              <button type="button" className="nda-open dcv-showall" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}>
                {showAll ? `Show the first section only` : `Show all ${sections.length} sections`}
              </button>
            )}
          </div>
        )}

        <div className="dcv-actions">
          {/* No inline heights on these four. `height: 30` beat every
              stylesheet rule, including the 44px minimum a phone needs, and a
              declaration a stylesheet cannot reach is a declaration no
              breakpoint can correct. The size is `.dcv-actions .btn` in
              authoring-v2.css, which raises it at phone width. */}
          <button
            ref={expandBtnRef}
            type="button"
            className="btn primary"
            onClick={() => onExpandedChange(beside ? !expanded : true)}
            disabled={state !== 'ready'}
            aria-expanded={expanded}
            aria-controls={expandedId}
            data-testid="dc-open-editor"
          >
            {expanded && beside ? <>{I.close} Close the editor</> : <>{I.maximize} Open full editor</>}
          </button>
          {expanded && beside && (
            <span className="dcv-open-note" role="status">Open in the editor beside this conversation</span>
          )}
          {/* GE-P-3: a refused act is disabled with the server's reason beside it. */}
          <button
            type="button"
            className="btn ghost"
            onClick={() => setFileToVaultOpen(readKey)}
            disabled={state !== 'ready' || !!actRefusal(access.fileToVault)}
            aria-describedby={actRefusal(access.fileToVault) ? vaultRefusalId : undefined}
            data-testid="dc-file-to-vault"
          >
            {I.vault} File to vault
          </button>
          {actRefusal(access.fileToVault) && (
            <span id={vaultRefusalId} style={{ fontSize: 11.5, color: 'var(--text-400)' }}>
              {actRefusal(access.fileToVault)}
            </span>
          )}
          <button
            type="button"
            className="btn ghost"
            onClick={() => setAssignReviewOpen(readKey)}
            disabled={state !== 'ready' || !!actRefusal(access.assignReview)}
            aria-describedby={actRefusal(access.assignReview) ? assignRefusalId : undefined}
            data-testid="dc-assign-review"
          >
            {I.send} Send for review
          </button>
          {actRefusal(access.assignReview) && (
            <span id={assignRefusalId} style={{ fontSize: 11.5, color: 'var(--text-400)' }}>
              {actRefusal(access.assignReview)}
            </span>
          )}
          {recordCurrent && (
            <AuthoringPlaceIntoFiling
              docId={docId}
              docTitle={doc?.title ?? 'Authoring document'}
              activeSectionCode={first?.code ?? null}
              sectionCodes={state === 'ready' ? sections.map((x) => x.code) : undefined} docStatus={doc?.status ?? null}
              refusal={state !== 'ready' ? 'The current document read is unavailable. Re-open it before another whole-document action.' : actRefusal(access.placeIntoFiling)} dirty={false}
              onNav={onNav}
              fireToast={fireToast}
            />
          )}
          <button type="button" className="nda-open dcv-open-surface" onClick={openInAuthoring} title="Open this document in the editor" data-testid="dc-edit-in-authoring">
            {I.penLine} Edit in the editor
          </button>
        </div>
      </div>
      )}

      {/* ── The editor: beside the conversation when the thread gives a pane, else in place ──
          Opened from the list (`cardless`) there is no card to read the record
          on, so the region opens at once and says it is reading, or why it
          could not; the bar is the same element throughout, so focus on it
          survives the editor arriving. */}
      {(keepWorkbench || (cardless && expanded)) && (() => {
        const region = (
        <div ref={expandedRef} className="dcv-expanded" id={expandedId} hidden={!expanded} data-testid="dc-expanded" data-beside={beside || undefined}>
          <div className="dcv-bar">
            {onShowList && <ToDocumentsButton count={listCount} onClick={showList} />}
            <button ref={backBtnRef} type="button" className="ed-back" onClick={() => onExpandedChange(false)} data-testid="dc-back">
              {onShowList ? I.close : I.left} Back to conversation
            </button>
            <span className="dcv-bar-t" title={title}>{title}</span>
            {/* Always in view while the document is open (§4.1, §4.8): with no
                card, or with the card hidden at narrow widths, nothing else says it is a draft. */}
            {doc && <StatusPill status={doc.status} testId="dc-status" />}
            {programLine && <span className="dcv-bar-p">{programLine}</span>}
            <span className="dcv-bar-hint" aria-hidden="true">Esc</span>
          </div>
          {keepWorkbench ? (
          <div className="dcv-workbench">
            {/* `hostShowsBack`: the bar above already carries "Back to
                conversation" and the Esc hint, so the workbench must not draw
                a second one into its crumb trail — it did, 75px below this
                one and overprinting the crumbs beside it. */}
            <DocumentWorkbench
              onNav={onNav}
              liveDrive={liveDrive}
              docs={docsForWorkbench}
              docsState={state === 'ready' ? 'ready' : state === 'error' ? 'error' : 'loading'}
              readRefusal={state === 'error' ? error ?? 'The current document read is unavailable.' : null}
              status="all"
              reloadDocs={reloadDoc}
              refreshCreationContext={refreshCreationContext}
              programId={programId}
              pinnedDocId={docId}
              embedded={{ onBack: () => onExpandedChange(false), hostShowsBack: true, onEditorBridge: setBridge, focusSection }}
              surfaceActionId={null}
              consumeDeepLinks={false}
              onAsk={onAsk}
            />
          </div>
          ) : <OpenedDocumentPending failed={state === 'error'} message={error} onRetry={() => void load()} />}
        </div>
        );
        return beside && paneEl ? createPortal(region, paneEl) : region;
      })()}

      {readSession.sameRevision() && (
        <FileToVaultDialog
          key={readKey}
          open={fileToVaultOpen === readKey}
          docId={docId}
          docTitle={doc?.title ?? 'Authoring document'}
          docStatus={doc?.status ?? null}
          refusal={state === 'error' ? 'The current document read is unavailable. Re-open it before another whole-document action.' : actRefusal(access.fileToVault)}
          programId={programId}
          programName={doc ? program?.name ?? null : null}
          onClose={() => setFileToVaultOpen(null)}
          onNav={onNav}
          fireToast={(message, tone) => { if (currentReadKey.current === readKey && readSession.sameRevision()) fireToast(message, tone); }}
        />
      )}
      {assignReviewOpen === readKey && readSession.sameRevision() && (
        <SendForReviewDialog
          docId={docId}
          docTitle={doc?.title ?? 'Authoring document'}
          programId={programId}
          refusal={state === 'error' ? 'The current document read is unavailable. Re-open it before another whole-document action.' : actRefusal(access.assignReview)}
          sectionCode={first?.code ?? null} authorId={doc?.created_by != null ? String(doc.created_by) : null}
          onClose={() => setAssignReviewOpen(null)}
          onOpenBoard={() => { setAssignReviewOpen(null); onNav('review'); }}
          fireToast={(message, tone) => { if (currentReadKey.current === readKey && readSession.sameRevision()) fireToast(message, tone); }}
        />
      )}
    </section>
  );
}
