/**
 * CanvasDocumentList — the documents AnA built, in the canvas beside the
 * conversation.
 *
 * docs/design/ONE_ANA_ONE_CANVAS.md §4.3 (slice 12, and the client half of
 * slice 11). The canvas has three states: closed, a list of documents, and one
 * document open in the editor. This is the list. It has two scopes:
 *
 *   · This conversation — `GET /api/authoring/docs?conversationId=<thread>`,
 *     the documents whose provenance names this conversation;
 *   · This project — `GET /api/authoring/docs?programId=<uuid>&source=ana`,
 *     the documents AnA built in the open project.
 *
 * Both read the authoring store (server half: docs/evidence/D2-ONE-ANA/
 * 2026-10-08/ana-11-documents-built/), so the list survives a reload. Until
 * now a reopened conversation found its documents by parsing a capped copy of
 * a tool result in the step trace, and that copy had cut the id off.
 *
 * Each row: title, status in words, sections, updated time, Open (the one
 * editor, beside the conversation, through the host's existing open path — no
 * second editor) and "Download working copy" (editor/DownloadMenu.tsx).
 *
 * Honest states: reading; a failed read is an error with a retry, never an
 * empty list; empty is said in words. A refresh that fails keeps the list read
 * earlier on screen and says so.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { ErrorState } from '../dataConnect';
import { DownloadMenu } from './DownloadMenu';

/** One row of `GET /api/authoring/docs`, as the list shows it. */
export interface BuiltDocument {
  id: string;
  title: string;
  module: string | null;
  status: string | null;
  sectionCount: number | null;
  updatedAt: string | null;
  /** `provenance.source` — 'ana' when AnA built it. */
  source: string | null;
  conversationId: string | null;
  programId: string | null;
}

export type ListScope = 'conversation' | 'project';

/** The list route for a scope, or null when there is nothing to list by. */
export function documentListUrl(scope: ListScope, id: string | null | undefined): string | null {
  const v = String(id ?? '').trim();
  if (!v) return null;
  return scope === 'conversation'
    ? `/api/authoring/docs?conversationId=${encodeURIComponent(v)}`
    : `/api/authoring/docs?programId=${encodeURIComponent(v)}&source=ana`;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

function toBuiltDocument(raw: unknown): BuiltDocument | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = typeof r.id === 'string' || typeof r.id === 'number' ? String(r.id) : '';
  if (!id) return null;
  const sections = r.section_count == null ? NaN : Number(r.section_count);
  return {
    id,
    title: text(r.title) ?? 'Untitled document',
    module: text(r.module),
    status: text(r.status),
    sectionCount: Number.isFinite(sections) ? sections : null,
    updatedAt: text(r.updated_at),
    source: text(r.provenance_source),
    conversationId: text(r.conversation_id),
    programId: text(r.program_id),
  };
}

type ListAnswer = { ok: true; rows: BuiltDocument[] } | { ok: false; message: string };

/** One read of the list. A failure is the sentence to show, never an empty list. */
export async function readDocumentList(url: string): Promise<ListAnswer> {
  try {
    const res = await apiRequest('GET', url);
    const body = (await res.json().catch(() => null)) as { documents?: unknown } | null;
    if (!res.ok) {
      return { ok: false, message: res.status === 401 ? 'Your session isn’t authenticated. Sign in and try again.' : serverMessage(body) ?? `The list did not load (HTTP ${res.status}).` };
    }
    if (!body || !Array.isArray(body.documents)) {
      return { ok: false, message: 'The answer did not include a list of documents.' };
    }
    return { ok: true, rows: body.documents.map(toBuiltDocument).filter((d): d is BuiltDocument => d !== null) };
  } catch (e) {
    return { ok: false, message: redactInternals(e instanceof Error ? e.message : '', 'The authoring store could not be reached.') };
  }
}

export type ListRead =
  | { state: 'idle' }
  | { state: 'loading'; rows: BuiltDocument[] | null }
  | { state: 'ready'; rows: BuiltDocument[] }
  | { state: 'error'; message: string; rows: BuiltDocument[] | null };

/** The rows on screen for a read: the last good list, or null when there is none. */
export function rowsOf(read: ListRead): BuiltDocument[] | null {
  return read.state === 'idle' ? null : read.rows;
}

/**
 * Reads the list at `url`, again whenever `refreshKey` changes (the host bumps
 * it when an AnA turn ends) and on `reload`. A re-read of the same list keeps
 * the rows on screen while it runs and after it fails.
 */
export function useDocumentList(url: string | null, refreshKey = 0): { read: ListRead; reload: () => void } {
  const [read, setRead] = useState<ListRead>({ state: 'idle' });
  const [nonce, setNonce] = useState(0);
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    const same = urlRef.current === url;
    urlRef.current = url;
    if (!url) {
      setRead({ state: 'idle' });
      return undefined;
    }
    let live = true;
    const kept = (prev: ListRead) => (same ? rowsOf(prev) : null);
    setRead(prev => ({ state: 'loading', rows: kept(prev) }));
    void readDocumentList(url).then(answer => {
      if (!live) return;
      setRead(prev => (answer.ok ? { state: 'ready', rows: answer.rows } : { state: 'error', message: answer.message, rows: kept(prev) }));
    });
    return () => { live = false; };
  }, [url, refreshKey, nonce]);
  const reload = useCallback(() => setNonce(n => n + 1), []);
  return { read, reload };
}

/** True at 1100px and narrower, where the canvas takes the screen (authoring-v2.css). */
const NARROW = '(max-width: 1100px)';
export function useNarrowCanvas(): boolean {
  const matches = () => typeof window !== 'undefined' && !!window.matchMedia?.(NARROW)?.matches;
  const [narrow, setNarrow] = useState(matches);
  useEffect(() => {
    const mql = typeof window !== 'undefined' ? window.matchMedia?.(NARROW) : undefined;
    if (!mql?.addEventListener) return undefined;
    const on = () => setNarrow(mql.matches);
    mql.addEventListener('change', on);
    return () => mql.removeEventListener('change', on);
  }, []);
  return narrow;
}

const STATUS_WORDS: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  REVIEW: 'In review',
  APPROVED: 'Approved',
  FROZEN: 'Frozen',
};

/** The stored status as a key: `in_review`, `IN REVIEW` → `IN_REVIEW`. */
export function statusKey(status: string | null): string {
  return String(status ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

/** The document's status in words — the pill never shows a raw code. */
export function statusWords(status: string | null): string {
  const key = statusKey(status);
  if (!key) return 'Status not recorded';
  if (STATUS_WORDS[key]) return STATUS_WORDS[key];
  const words = key.replace(/_+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The status in words, as a pill: on a list row, and in an open document's bar. */
export function StatusPill({ status, testId }: { status: string | null; testId?: string }) {
  return (
    <span className="cdl-pill" data-status={statusKey(status) || undefined} data-testid={testId}>
      {statusWords(status)}
    </span>
  );
}

function sectionWords(n: number | null): string {
  if (n == null) return 'Sections not counted';
  if (n === 0) return 'No sections';
  return n === 1 ? '1 section' : `${n} sections`;
}

function moduleWords(module: string | null): string | null {
  const m = /^M(\d)$/i.exec(String(module ?? '').trim());
  return m ? `Module ${m[1]}` : module;
}

/** "10:42" today, "7 Oct" this year, "7 Oct 2025" before; "Not recorded" without a time. */
export function updatedWords(iso: string | null, now: Date = new Date()): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return 'Not recorded';
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const year = d.getFullYear() === now.getFullYear() ? undefined : 'numeric';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year });
}

/** "← Documents (n)" in an open document's bar: the list, in the editor's place. */
export function ToDocumentsButton({ count, onClick }: { count: number | null; onClick: () => void }) {
  return (
    <button type="button" className="ed-back" onClick={onClick} data-testid="dc-documents">
      {I.left} Documents{count ? ` (${count})` : ''}
    </button>
  );
}

/**
 * The editor's region for a document the list opened, before its record is
 * read: reading, or why the read failed, with a retry. A failed read is never
 * shown as an empty document.
 */
export function OpenedDocumentPending({ failed, message, onRetry }: { failed: boolean; message: string | null; onRetry: () => void }) {
  if (!failed) return <div role="status" className="scaf-note cdl-reading">Reading the document…</div>;
  return (
    <ErrorState
      title="Couldn’t read this document"
      message={message ?? 'The authoring store did not respond. This is a failed read, not an empty document.'}
      retry={onRetry}
      testId="dc-error"
    />
  );
}

export type ListFocus = { kind: 'heading' } | { kind: 'row'; docId: string };

interface RowProps {
  doc: BuiltDocument;
  onOpen: (doc: BuiltDocument) => void;
  fireToast: (m: string, tone?: 'ok' | 'error') => void;
  /** Focus this row's Open once (the person came back from this document). */
  focusOpen: boolean;
  onFocused: () => void;
}

function DocumentRow({ doc, onOpen, fireToast, focusOpen, onFocused }: RowProps) {
  const openRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusOpen) return;
    openRef.current?.focus({ preventScroll: true });
    onFocused();
  }, [focusOpen, onFocused]);
  const module = moduleWords(doc.module);
  return (
    <li className="cdl-row" data-doc-id={doc.id} data-testid="cdl-row">
      <div className="cdl-row-main">
        <span className="cdl-row-t">{doc.title}</span>
        <span className="cdl-row-meta">
          <StatusPill status={doc.status} testId="cdl-status" />
          {module && <span>{module}</span>}
          <span>{sectionWords(doc.sectionCount)}</span>
          <span>
            Updated <time dateTime={doc.updatedAt ?? undefined}>{updatedWords(doc.updatedAt)}</time>
          </span>
          {doc.source === 'ana' && <span>Built by AnA</span>}
        </span>
      </div>
      <div className="cdl-row-actions">
        <button
          ref={openRef}
          type="button"
          className="btn primary"
          onClick={() => onOpen(doc)}
          aria-label={`Open ${doc.title}`}
          data-testid="cdl-open"
        >
          {I.penLine} Open
        </button>
        <DownloadMenu
          docId={doc.id}
          docTitle={doc.title}
          fireToast={fireToast}
          label="Download working copy"
          ariaLabel={`Download working copy of ${doc.title}`}
          testId="cdl-download"
        />
      </div>
    </li>
  );
}

interface BodyProps {
  read: ListRead;
  scope: ListScope;
  onRetry: () => void;
  onOpen: (doc: BuiltDocument) => void;
  fireToast: RowProps['fireToast'];
  focusRowId: string | null;
  onFocused: () => void;
}

function ListBody({ read, scope, onRetry, onOpen, fireToast, focusRowId, onFocused }: BodyProps) {
  const rows = rowsOf(read);
  if (read.state === 'error' && !rows) {
    return (
      <ErrorState
        title="Couldn’t list the documents"
        message={`${read.message} This is a failed read, not an empty list.`}
        retry={onRetry}
        testId="cdl-error"
      />
    );
  }
  if (read.state === 'loading' && !rows) {
    return <div role="status" className="cdl-note" data-testid="cdl-loading">Reading the documents…</div>;
  }
  if (!rows || rows.length === 0) {
    return (
      <p className="cdl-empty" data-testid="cdl-empty">
        {scope === 'conversation' ? 'No documents built in this conversation yet.' : 'AnA has not built a document in this project yet.'}
      </p>
    );
  }
  return (
    <>
      {read.state === 'error' && (
        <div className="cdl-note" role="status" data-tone="err" data-testid="cdl-refresh-failed">
          Couldn’t refresh the list. This is the list read earlier.{' '}
          <button type="button" className="nda-open" onClick={onRetry}>Retry</button>
        </div>
      )}
      <ul className="cdl-list" aria-label="Documents">
        {rows.map(doc => (
          <DocumentRow key={doc.id} doc={doc} onOpen={onOpen} fireToast={fireToast} focusOpen={focusRowId === doc.id} onFocused={onFocused} />
        ))}
      </ul>
    </>
  );
}

function ScopeSwitch({ scope, onScope }: { scope: ListScope; onScope: (s: ListScope) => void }) {
  const option = (value: ListScope, label: string) => (
    <button type="button" className="cdl-scope-btn" aria-pressed={scope === value} onClick={() => onScope(value)} data-testid={`cdl-scope-${value}`}>
      {label}
    </button>
  );
  return (
    <div className="cdl-scope" role="group" aria-label="Show documents built in">
      {option('conversation', 'This conversation')}
      {option('project', 'This project')}
    </div>
  );
}

export interface CanvasDocumentListProps {
  scope: ListScope;
  onScope: (s: ListScope) => void;
  /** The open project's name, when one is open. Without one, "This project" is not offered. */
  projectName: string | null;
  projectAvailable: boolean;
  read: ListRead;
  onRetry: () => void;
  onOpen: (doc: BuiltDocument) => void;
  onClose: () => void;
  fireToast: RowProps['fireToast'];
  /** Where focus goes when the list appears after an act; null moves nothing. */
  focus: ListFocus | null;
  onFocused: () => void;
}

export function CanvasDocumentList({
  scope, onScope, projectName, projectAvailable, read, onRetry, onOpen, onClose, fireToast, focus, onFocused,
}: CanvasDocumentListProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus?.kind !== 'heading') return;
    headingRef.current?.focus({ preventScroll: true });
    onFocused();
  }, [focus, onFocused]);
  const project = projectAvailable && scope === 'project';
  return (
    <section className="cdl" aria-labelledby={headingId} data-testid="ct-documents" data-scope={scope}>
      <div className="cdl-head">
        <h2 className="cdl-title" id={headingId} ref={headingRef} tabIndex={-1}>
          {I.layers} Documents
        </h2>
        {projectAvailable && <ScopeSwitch scope={scope} onScope={onScope} />}
        <button type="button" className="cdl-close" aria-label="Close the documents list" onClick={onClose} data-testid="cdl-close">
          {I.close}
        </button>
      </div>
      <p className="cdl-sub">
        {project ? `Built by AnA in ${projectName || 'this project'}` : 'Built in this conversation'}
      </p>
      <ListBody
        read={read}
        scope={project ? 'project' : 'conversation'}
        onRetry={onRetry}
        onOpen={onOpen}
        fireToast={fireToast}
        focusRowId={focus?.kind === 'row' ? focus.docId : null}
        onFocused={onFocused}
      />
    </section>
  );
}
