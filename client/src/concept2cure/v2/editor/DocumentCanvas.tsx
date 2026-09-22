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
 * Expanded, it "converts into a full editor": the card grows to the
 * conversation's full width and mounts `DocumentWorkbench` PINNED to this
 * document — the same component the Authoring surface renders, over the same
 * store, with the same rails (comments, history, sources, audit, signatures,
 * exports, project files, tasks) and the same one save path. No navigation,
 * no reload. "Back to conversation" and Escape collapse it; the workbench
 * stays mounted underneath (hidden) so its state — open section, rail,
 * unsaved text — survives collapsing and re-expanding. The thread's composer
 * stays below, so the person keeps talking to AnA about the document she is
 * looking at; every ask from inside the workbench lands in that composer.
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
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import type { FireToast } from '../toast';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { setEditorTarget } from '../editorTarget';
import { AuthoredHtml } from './AuthoredHtml';
import { DocumentWorkbench, type AuthDoc } from './DocumentWorkbench';
import { AuthoringPlaceIntoFiling } from '../surfaces/AuthoringPlaceIntoFiling';
import { FileToVaultDialog } from './FileToVaultDialog';
import { AssignReviewDialog } from './AssignReviewDialog';
import { useProgramSummary, programHeadline } from './programSummary';
import { describeProvenance, type DocumentProvenance } from './provenance';

/** GET /docs/:id → `document` (the columns this card reads). */
interface DocRow {
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
}

/** True when the keydown should NOT collapse the canvas: inside a dialog, the
 *  editor's own document, or a text control — each of those owns Escape. */
export function escapeBelongsToInner(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest('[role="dialog"], [role="alertdialog"], .ProseMirror, input, textarea, select, [contenteditable="true"]'),
  );
}

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
}: DocumentCanvasProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocRow | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [fileToVaultOpen, setFileToVaultOpen] = useState(false);
  const [assignReviewOpen, setAssignReviewOpen] = useState(false);
  /* The workbench mounts on the FIRST expand and stays mounted afterwards,
     hidden while collapsed, so its state survives; before that first expand
     a long thread pays nothing for canvases nobody opened. */
  const [workbenchMounted, setWorkbenchMounted] = useState(false);
  const program = useProgramSummary(programId);
  const rootRef = useRef<HTMLElement>(null);
  const expandBtnRef = useRef<HTMLButtonElement>(null);
  const backBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  /* The expanded region's id, so the control that opens it can say what it
     controls (`aria-controls`) rather than only that it is expanded. */
  const expandedId = useId();

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const [d, s] = await Promise.all([
        apiRequest('GET', `/api/authoring/docs/${encodeURIComponent(docId)}`),
        apiRequest('GET', `/api/authoring/docs/${encodeURIComponent(docId)}/sections`),
      ]);
      const dj = (await d.json().catch(() => null)) as { document?: DocRow } | null;
      const sj = (await s.json().catch(() => null)) as { sections?: SectionRow[] } | null;
      if (!d.ok || !dj?.document) {
        setState('error');
        setError(serverMessage(dj) ?? (d.status === 404 ? 'This document is not in your organization’s authoring records.' : `The document did not load (HTTP ${d.status}).`));
        return;
      }
      setDoc(dj.document);
      if (!s.ok || !sj) {
        /* The document row is real; its sections did not read. Say that,
           rather than rendering a document with no sections. */
        setState('error');
        setError(`“${dj.document.title}” exists, but its sections did not load (HTTP ${s.status}).`);
        return;
      }
      setSections(Array.isArray(sj.sections) ? sj.sections : []);
      setState('ready');
    } catch (e) {
      setState('error');
      setError(redactInternals(e instanceof Error ? e.message : '', 'The authoring store could not be reached.'));
    }
  }, [docId]);

  useEffect(() => {
    void load();
  }, [load]);

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
  const wasExpanded = useRef(expanded);
  useEffect(() => {
    if (expanded) {
      const back = backBtnRef.current;
      if (!back) return;
      if (!wasExpanded.current) back.focus({ preventScroll: true });
      wasExpanded.current = true;
      return;
    }
    if (wasExpanded.current) expandBtnRef.current?.focus({ preventScroll: true });
    wasExpanded.current = false;
  }, [expanded, workbenchMounted, doc]);

  const provenance: DocumentProvenance | null = doc
    ? describeProvenance(doc.provenance, { inThisConversation: fromThisConversation })
      ?? (fromThisConversation
        ? { source: 'ana', line: 'Drafted by AnA in this conversation · model not recorded', model: null, conversationId, turnId: null, authorName: null, note: null }
        : null)
    : null;

  const title = doc?.title ?? draftTitle ?? 'Document';
  const programLine = programHeadline(program);
  const sectionCount = sections.length || Number(doc?.section_count ?? 0) || 0;
  const first = sections[0] ?? null;
  const shown = showAll ? sections : first ? [first] : [];

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

  return (
    <section
      ref={rootRef}
      className="dcv"
      data-expanded={expanded || undefined}
      aria-labelledby={titleId}
      data-testid="document-canvas"
      data-doc-id={docId}
    >
      {/* ── The card ── */}
      <div className="dcv-card" hidden={expanded}>
        <div className="dcv-head">
          <div className="dcv-kind">
            {I.fileText} Document{doc?.module ? ` · ${doc.module}` : ''}{doc?.status ? ` · ${String(doc.status).replace(/_/g, ' ').toLowerCase()}` : ''}
          </div>
          <h3 className="dcv-title" id={titleId}>{title}</h3>
          <div className="dcv-meta">
            {programId ? (
              <span className="dcv-project">{I.folder} {programLine ?? 'Reading the program…'}</span>
            ) : (
              <span className="dcv-project dcv-project-none" data-testid="dc-no-program">{I.folder} Not filed under a program</span>
            )}
            {state === 'ready' && (
              <span>{sectionCount} section{sectionCount === 1 ? '' : 's'}</span>
            )}
          </div>
          {provenance && (
            <div className="dcv-prov" data-source={provenance.source} data-testid="dc-provenance">{provenance.line}</div>
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
          <div className="dcv-body">
            {shown.map(sec => (
              <article key={sec.id} className="dcv-sec" aria-label={`${sec.code} ${sec.title}`}>
                <div className="dcv-sec-h">
                  <span className="dcv-sec-num">{sec.code}</span>
                  <span className="dcv-sec-t">{sec.title}</span>
                </div>
                {(sec.content ?? '').trim() ? (
                  <AuthoredHtml className="dcv-sec-body ed-full-sec-body" html={sec.content ?? ''} />
                ) : (
                  <p className="dcv-sec-empty">Not drafted yet.</p>
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
            onClick={() => onExpandedChange(true)}
            disabled={state !== 'ready'}
            aria-expanded={expanded}
            aria-controls={expandedId}
            data-testid="dc-open-editor"
          >
            {I.maximize} Open full editor
          </button>
          <button type="button" className="btn ghost" onClick={() => setFileToVaultOpen(true)} disabled={state !== 'ready'} data-testid="dc-file-to-vault">
            {I.vault} File to vault
          </button>
          <button type="button" className="btn ghost" onClick={() => setAssignReviewOpen(true)} disabled={state !== 'ready'} data-testid="dc-assign-review">
            {I.user} Assign review
          </button>
          {doc && (
            <AuthoringPlaceIntoFiling
              docId={doc.id}
              docTitle={doc.title}
              activeSectionCode={first?.code ?? null}
              dirty={false}
              onNav={onNav}
              fireToast={fireToast}
            />
          )}
          <button type="button" className="nda-open dcv-open-surface" onClick={openInAuthoring} title="Open this document on the Authoring surface" data-testid="dc-edit-in-authoring">
            {I.penLine} Edit in Authoring
          </button>
        </div>
      </div>

      {/* ── The editor, in place ── */}
      {workbenchMounted && doc && (
        <div className="dcv-expanded" id={expandedId} hidden={!expanded} data-testid="dc-expanded">
          <div className="dcv-bar">
            <button ref={backBtnRef} type="button" className="ed-back" onClick={() => onExpandedChange(false)} data-testid="dc-back">
              {I.left} Back to conversation
            </button>
            <span className="dcv-bar-t" title={doc.title}>{doc.title}</span>
            {programLine && <span className="dcv-bar-p">{programLine}</span>}
            <span className="dcv-bar-hint" aria-hidden="true">Esc</span>
          </div>
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
              embedded={{ onBack: () => onExpandedChange(false), hostShowsBack: true }}
              surfaceActionId={null}
              consumeDeepLinks={false}
              onAsk={onAsk}
            />
          </div>
        </div>
      )}

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
        <AssignReviewDialog
          docId={doc.id}
          docTitle={doc.title}
          programId={programId}
          sectionCode={first?.code ?? null}
          onClose={() => setAssignReviewOpen(false)}
          onCreated={() => undefined}
          fireToast={fireToast}
        />
      )}
    </section>
  );
}
