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
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
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

/** GET /docs/:id → `document` (the columns this card reads; `created_by` is the author, never offered as its reviewer). */
interface DocRow extends Pick<AuthDoc, 'created_by'> {
  id: string;
  title: string;
  module: string | null;
  product_code: string | null;
  status: string;
  updated_at: string | null;
  section_count: number | string | null;
  provenance?: unknown;
}

interface SectionRow {
  id: string;
  code: string;
  title: string;
  content: string | null;
  order_index: number | null;
}

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
  onAsk: (text: string) => void;
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
}

/** The stored document type (`product_code`), in words: `clinical_overview` → "Clinical overview". */
export function documentTypeLabel(code: string | null | undefined): string | null {
  const c = (code ?? '').trim();
  if (!c) return null;
  const words = c.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** One read of the record: the document row, the caller's access, the sections. */
type RecordRead =
  | { ok: true; doc: DocRow; access: unknown; sections: SectionRow[] }
  | { ok: false; message: string; doc?: DocRow };

/**
 * GET /docs/:id and /sections, together. A failure is the sentence to show,
 * never an empty document: a missing row, a row whose sections did not read,
 * or a store that could not be reached each say which.
 */
async function readDocumentRecord(docId: string): Promise<RecordRead> {
  try {
    const [d, s] = await Promise.all([
      apiRequest('GET', `/api/authoring/docs/${encodeURIComponent(docId)}`),
      apiRequest('GET', `/api/authoring/docs/${encodeURIComponent(docId)}/sections`),
    ]);
    const dj = (await d.json().catch(() => null)) as { document?: DocRow; access?: unknown } | null;
    const sj = (await s.json().catch(() => null)) as { sections?: SectionRow[] } | null;
    if (!d.ok || !dj?.document) {
      return {
        ok: false,
        message: serverMessage(dj) ?? (d.status === 404 ? 'This document is not in your organization’s authoring records.' : `The document did not load (HTTP ${d.status}).`),
      };
    }
    if (!s.ok || !sj) {
      /* The document row is real; its sections did not read. Say that,
         rather than rendering a document with no sections. */
      return { ok: false, doc: dj.document, message: `“${dj.document.title}” exists, but its sections did not load (HTTP ${s.status}).` };
    }
    return { ok: true, doc: dj.document, access: dj.access, sections: Array.isArray(sj.sections) ? sj.sections : [] };
  } catch (e) {
    return { ok: false, message: redactInternals(e instanceof Error ? e.message : '', 'The authoring store could not be reached.') };
  }
}

/** The codes of sections that are new, or whose stored text changed, between two reads. */
export function changedSectionCodes(before: readonly SectionRow[], next: readonly SectionRow[]): string[] {
  const was = new Map(before.map(x => [x.id, x.content ?? '']));
  return next.filter(x => !was.has(x.id) || was.get(x.id) !== (x.content ?? '')).map(x => x.code);
}

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
  onShowList, listCount = null, cardless = false, returnFocus = true,
}: DocumentCanvasProps) {
  /* Beside the conversation the card stays in the thread, marked as the
     document that is open; in place it gives way to the editor. */
  const beside = paneEl !== null;
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocRow | null>(null);
  /* GE-P-3 (2026-09-28): what this caller may do to the document, from the
     same read (`access`). Unknown until read, and unknown stays enabled. */
  const [access, setAccess] = useState<DocumentAccess>(UNKNOWN_DOCUMENT_ACCESS);
  const vaultRefusalId = useId();
  const assignRefusalId = useId();
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  /* The section the outline chose; null shows the first. */
  const [focusId, setFocusId] = useState<string | null>(null);
  /* Codes whose text changed on the last quiet re-read, and whether that
     re-read failed (the record already on screen stays). */
  const [updatedCodes, setUpdatedCodes] = useState<string[]>([]);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const sectionsRef = useRef<SectionRow[]>([]);
  const [fileToVaultOpen, setFileToVaultOpen] = useState(false);
  const [assignReviewOpen, setAssignReviewOpen] = useState(false);
  /* The workbench mounts on the FIRST expand and stays mounted afterwards,
     hidden while collapsed, so its state survives; before that first expand
     a long thread pays nothing for canvases nobody opened. */
  const [workbenchMounted, setWorkbenchMounted] = useState(false);
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

  const load = useCallback(async (quiet = false) => {
    if (!quiet) {
      setState('loading');
      setError(null);
    }
    const read = await readDocumentRecord(docId);
    if (!read.ok) {
      /* A refresh that failed is not an empty document: keep the record on
         screen and say the refresh did not land. */
      if (quiet) {
        setRefreshFailed(true);
        return;
      }
      setState('error');
      setError(read.message);
      if (read.doc) setDoc(read.doc);
      return;
    }
    if (quiet) setUpdatedCodes(changedSectionCodes(sectionsRef.current, read.sections));
    setRefreshFailed(false);
    setDoc(read.doc);
    setAccess(readDocumentAccess(read.access));
    sectionsRef.current = read.sections;
    setSections(read.sections);
    setState('ready');
  }, [docId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* A new refreshKey (AnA's turn ended) re-reads quietly. The first value is
     the mount, which the load above already covers. */
  const firstRefresh = useRef(refreshKey);
  useEffect(() => {
    if (refreshKey === firstRefresh.current) return;
    firstRefresh.current = refreshKey;
    void load(true);
  }, [refreshKey, load]);

  /* Escape collapses, from anywhere the key is not already owned by something
     inside; focus returns to the header control that expands.

     The listener is on the DOCUMENT, not on the canvas element. Bound to the
     element it only ever saw a keydown that bubbled from a descendant, so
     Escape worked while a control inside the editor held focus and did
     nothing the moment focus was on the body — which is where focus sits
     after a click on any non-focusable chrome. The way out of a region that
     fills the conversation was then the mouse alone. Only the expanded canvas
     binds it (`expanded` gates the effect) and the thread expands one at a
     time, so two canvases never both answer the key. */
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (escapeBelongsToInner(e.target)) return;
      /* 2026-09-28 (GA-4): an open workbench rail other than AnA closes on
         this Escape first (DocumentWorkbench's own listener); the canvas
         collapses on the next one. Both listen on the document, so the order
         they run in is not something to rely on — the canvas yields here,
         for the Escapes the workbench takes: from inside it, or from the
         body. One from the canvas's own bar is still the canvas's. */
      const railOpen = (expandedRef.current ?? rootRef.current)?.querySelector('.ed[data-rail]:not([data-rail="ana"])');
      const t = e.target;
      if (railOpen && (t === document.body || (t instanceof Node && railOpen.contains(t)))) return;
      /* An open modal owns Escape wherever focus happens to be — closing the
         canvas underneath it would leave the dialog over a collapsed card. */
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      onExpandedChange(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded, onExpandedChange]);

  useEffect(() => {
    if (expanded && !workbenchMounted) setWorkbenchMounted(true);
  }, [expanded, workbenchMounted]);

  /* Focus follows the region. Opening moves it to the first control of what
     opened — the way back — and closing returns it to the control that
     opened it, so the keyboard never lands on a region that is now hidden.

     On the FIRST expand the bar does not exist yet: the workbench mounts in
     the render after `expanded` flips, so a focus call made on that first
     pass reached a null ref and did nothing at all. The effect therefore
     waits for the control, rather than firing once into an empty ref. */
  /* A canvas opened from the list mounts already expanded, and must still
     move focus into what opened: so it starts as "was closed". */
  const wasExpanded = useRef(cardless ? false : expanded);
  /* "← Documents" closes the editor and the list takes the focus, not this
     card; so does a host that says focus belongs elsewhere (`returnFocus`). */
  const toList = useRef(false);
  useEffect(() => {
    if (expanded) {
      const back = backBtnRef.current;
      if (!back) return;
      if (!wasExpanded.current) back.focus({ preventScroll: true });
      wasExpanded.current = true;
      return;
    }
    if (wasExpanded.current && returnFocus && !toList.current) expandBtnRef.current?.focus({ preventScroll: true });
    toList.current = false;
    wasExpanded.current = false;
  }, [expanded, workbenchMounted, doc, returnFocus]);
  const showList = () => {
    toList.current = true;
    onShowList?.();
  };

  const provenance: DocumentProvenance | null = doc
    ? describeProvenance(doc.provenance, { inThisConversation: fromThisConversation })
      ?? (fromThisConversation
        ? { source: 'ana', line: 'Drafted by AnA in this conversation · model not recorded', model: null, conversationId, turnId: null, authorName: null, note: null }
        : null)
    : null;

  const title = doc?.title ?? draftTitle ?? 'Document';
  const programLine = programHeadline(program);
  const sectionCount = sections.length || Number(doc?.section_count ?? 0) || 0;
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
    ? [{ id: doc.id, title: doc.title, module: doc.module, product_code: doc.product_code, status: doc.status, updated_at: doc.updated_at, section_count: doc.section_count }]
    : [];

  const reloadDoc = useCallback(async () => {
    await load();
  }, [load]);

  const [bridge, setBridge] = useState<EditorBridge | null>(null);

  /* A section not yet drafted is one ask away (2026-10-01). The ask opens
     the editor at that section, so the turn names it and AnA's answer offers
     to go into it, and lands in the composer for the person to send. The
     wording asks for the text in the conversation: the document exists, and
     a second one drafted from this ask would be a duplicate. */
  const [focusSection, setFocusSection] = useState<{ id: string; nonce: number } | null>(null);
  const askToDraft = (sec: SectionRow, title: string) => {
    setFocusSection(prev => ({ id: sec.id, nonce: (prev?.nonce ?? 0) + 1 }));
    onExpandedChange(true);
    onAsk(`Draft the text for section ${sec.code} ${sec.title} of “${title}” here in the conversation, so I can insert it into the document.`);
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
            {doc?.module && (moduleWasAssumed(doc.provenance) ? (
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
              <span className="dcv-project dcv-project-none" data-testid="dc-no-program">{I.folder} Not filed under a program</span>
            )}
            {state === 'ready' && (
              <span data-testid="dc-progress">
                {sectionCount === 0 ? 'No sections' : `${draftedCount} of ${sectionCount} section${sectionCount === 1 ? '' : 's'} drafted`}
              </span>
            )}
          </div>
          {provenance && (
            <div className="dcv-prov" data-source={provenance.source} data-testid="dc-provenance">{provenance.line}</div>
          )}
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
          <p className="dcv-empty">This document has no sections yet. Open the full editor to add one, or ask AnA to draft the sections.</p>
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
                    <button type="button" className="nda-open" onClick={() => askToDraft(sec, title)}>
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
            onClick={() => setFileToVaultOpen(true)}
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
            onClick={() => setAssignReviewOpen(true)}
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
          {doc && (
            <AuthoringPlaceIntoFiling
              docId={doc.id}
              docTitle={doc.title}
              activeSectionCode={first?.code ?? null}
              sectionCodes={sections.map((x) => x.code)} docStatus={doc.status ?? null} dirty={false}
              onNav={onNav}
              fireToast={fireToast}
            />
          )}
          <button type="button" className="nda-open dcv-open-surface" onClick={openInAuthoring} title="Open this document on the Authoring surface" data-testid="dc-edit-in-authoring">
            {I.penLine} Edit in Authoring
          </button>
        </div>
      </div>
      )}

      {/* ── The editor: beside the conversation when the thread gives a pane, else in place ──
          Opened from the list (`cardless`) there is no card to read the record
          on, so the region opens at once and says it is reading, or why it
          could not; the bar is the same element throughout, so focus on it
          survives the editor arriving. */}
      {((workbenchMounted && doc) || (cardless && expanded)) && (() => {
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
          {workbenchMounted && doc ? (
          <div className="dcv-workbench">
            {/* `hostShowsBack`: the bar above already carries "Back to
                conversation" and the Esc hint, so the workbench must not draw
                a second one into its crumb trail — it did, 75px below this
                one and overprinting the crumbs beside it. */}
            <DocumentWorkbench
              onNav={onNav}
              liveDrive={liveDrive}
              docs={docsForWorkbench}
              docsState="ready"
              status="all"
              reloadDocs={reloadDoc}
              programId={programId}
              pinnedDocId={doc.id}
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

      {fileToVaultOpen && doc && (
        <FileToVaultDialog
          docId={doc.id}
          docTitle={doc.title}
          docStatus={doc.status}
          programId={programId}
          programName={program?.name ?? null}
          onClose={() => setFileToVaultOpen(false)}
          onNav={onNav}
          fireToast={fireToast}
        />
      )}
      {assignReviewOpen && doc && (
        <SendForReviewDialog
          docId={doc.id}
          docTitle={doc.title}
          programId={programId}
          sectionCode={first?.code ?? null} authorId={doc.created_by != null ? String(doc.created_by) : null}
          onClose={() => setAssignReviewOpen(false)}
          onOpenBoard={() => { setAssignReviewOpen(false); onNav('review'); }}
          fireToast={fireToast}
        />
      )}
    </section>
  );
}
