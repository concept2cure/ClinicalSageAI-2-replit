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
 * Collapsed, it is a chip (D4-5b, D4.md §D4.I), as Claude shows an artifact
 * under a message: an icon, the title, one line of kind, module, status,
 * progress and project, where it came from, and Open. The work happens in the
 * open document, where File to vault, Send for review and Place into filing
 * are each reached once.
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
import { DocumentWorkbench, escapeBelongsToInner, type AuthDoc, type EditorBridge } from './DocumentWorkbench';
import { useProgramRead, programLineFor } from './programSummary';
import { describeProvenance, moduleWasAssumed, type DocumentProvenance } from './provenance';
import { OpenedDocumentPending, statusWords, ToDocumentsButton } from './CanvasDocumentList';
import { useCanvasEscape, useCanvasRegionFocus, useCloseFocusHandoff, useOriginSectionFocus } from './canvasFocus';
import type { AskOrigin } from './askAnaToDraft';
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
  /** Kept for the thread's call; the card's own acts that toasted moved into the open document (D4-5b). */
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
  const [storedSections, setSections] = useState<SectionRow[]>([]);
  const sections = recordCurrent ? storedSections : [];
  const [savedRefreshKey, setSavedRefreshKey] = useState(0);
  /* Codes whose text changed on the last quiet re-read, and whether that
     re-read failed (the record already on screen stays). */
  const [updatedCodes, setUpdatedCodes] = useState<string[]>([]);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const sectionsRef = useRef<SectionRow[]>([]);
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
  const closeHandoff = useCloseFocusHandoff(keepWorkbench, backBtnRef);
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
        setDoc(null); setSections([]);
      } else if (read.doc) setDoc(read.doc);
      return false;
    }
    setLoadedKey(readKey);
    setUpdatedCodes(quiet ? changedSectionCodes(sectionsRef.current, read.sections) : []);
    setRefreshFailed(false);
    setDoc(read.doc);
    sectionsRef.current = read.sections;
    setSections(read.sections);
    setState('ready');
    if (quiet) setSavedRefreshKey(key => key + 1);
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
  const sectionCount = partialRead ? sections.length : sections.length || Number(doc?.section_count ?? 0) || 0;
  const draftedCount = sections.filter(x => isDrafted(x.content)).length;
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

  /* The section a saved arrival names (Authoring's conversation hand-off). A section not yet drafted is asked for in
     the open document: its empty section's "Draft with AnA" and the ✻ menu (D4-5b; the card's own ask is gone). */
  const [focusSection] = useOriginSectionFocus(focusSectionId);
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
        <div className="dcv-row">
          <span className="dcv-ic" aria-hidden="true">{I.fileText}</span>
          <div className="dcv-head">
            <h3 className="dcv-title" id={titleId} title={title}>{title}</h3>
            <div className="dcv-meta">
              <span>{typeLabel ?? 'Document'}</span>
              {doc?.module && (metadataAvailable && moduleWasAssumed(doc.provenance) ? (
                <span title={`No module was chosen when this document was created, so ${doc.module} was assumed. Check it before filing.`}>
                  {`${doc.module} (assumed)`}
                </span>
              ) : <span>{doc.module}</span>)}
              {doc?.status && <span>{statusWords(doc.status)}</span>}
              {state === 'ready' && (
                <span data-testid="dc-progress">
                  {sectionCount === 0 ? partialRead ? 'No accessible sections in this view' : 'No sections'
                    : `${draftedCount} of ${sectionCount} ${partialRead ? 'accessible ' : ''}section${sectionCount === 1 ? '' : 's'} drafted`}
                </span>
              )}
              {programId ? (
                <span className="dcv-project">{programLineFor(program, programState)}</span>
              ) : (
                <span className="dcv-project dcv-project-none" data-testid="dc-no-program">Not filed under a project</span>
              )}
            </div>
            {provenance && (
              <div className="dcv-prov" data-source={provenance.source} data-testid="dc-provenance">{provenance.line}</div>
            )}
          </div>
          <button
            ref={expandBtnRef}
            type="button"
            className="btn ghost small"
            onClick={() => onExpandedChange(beside ? !expanded : true)}
            disabled={state !== 'ready'}
            aria-expanded={expanded}
            aria-controls={expandedId}
            data-testid="dc-open-editor"
          >
            {expanded && beside ? 'Close' : 'Open'}
          </button>
        </div>
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
        {state === 'loading' && <div role="status" className="dcv-note">Reading the document…</div>}
        {state === 'error' && (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn’t read this document"
            hint={error ?? 'The authoring store did not respond. This is a failed read, not an empty document.'}
            retry={() => void load()}
            testId="dc-error"
          />
        )}
      </div>
      )}

      {/* ── The editor: beside the conversation when the thread gives a pane, else in place ──
          Opened from the list (`cardless`) there is no card to read the record
          on, so the region opens at once and says it is reading, or why it
          could not; the bar is the same element throughout, so focus on it
          survives the editor arriving. */}
      {(keepWorkbench || (cardless && expanded)) && (() => {
        const region = (
        <div ref={expandedRef} className="dcv-expanded" id={expandedId} hidden={!expanded} data-testid="dc-expanded"
          data-beside={beside || undefined} data-placement={beside ? 'pane' : 'inline'}>
          {keepWorkbench ? (
          <div className="dcv-workbench">
            {/* One bar (D4-5, §D4.A): the workbench's. It draws Documents, the title and its state, "Open full
                width" and the close; this region drew a second bar above it. The project is in the title's tooltip. */}
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
              embedded={{
                onBack: () => onExpandedChange(false), collapses: true, closeRef: backBtnRef, onExpand: openInAuthoring,
                onShowList: onShowList ? showList : undefined, listCount, onEditorBridge: setBridge, focusSection, savedRefreshKey,
              }}
              surfaceActionId={null}
              consumeDeepLinks={false}
              onAsk={onAsk}
            />
          </div>
          ) : (<>
            {/* Before the record is read there is no workbench to draw the bar, so the region keeps the way back and
                the list, and focus has its close to land on. */}
            <div className="dcv-bar">
              {onShowList && <ToDocumentsButton count={listCount} onClick={showList} />}
              <span className="dcv-bar-t" title={title}>{title}</span>
              <button ref={backBtnRef} type="button" className="btn ed-ico" onClick={() => onExpandedChange(false)}
                {...closeHandoff}
                aria-label="Back to conversation" aria-keyshortcuts="Escape" title="Back to conversation (Esc)"
                data-host-close="" data-testid="dc-back">
                {I.close}
              </button>
            </div>
            <OpenedDocumentPending failed={state === 'error'} message={error} onRetry={() => void load()} />
          </>)}
        </div>
        );
        return beside && paneEl ? createPortal(region, paneEl) : region;
      })()}

    </section>
  );
}
