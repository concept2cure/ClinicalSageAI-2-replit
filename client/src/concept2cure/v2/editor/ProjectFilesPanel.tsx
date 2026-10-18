/**
 * Project files — the designated project's vault, beside the page.
 *
 * ── Why it exists ────────────────────────────────────────────────────────────
 * The editor had no vault connection (docs/design/ANA_DOCUMENT_CANVAS.md,
 * "What exists"): Vault → editor was the only direction, and a writer citing
 * the protocol had to leave the section, find the file in the Vault surface,
 * and come back. This rail reads the SAME read model that surface renders —
 * GET /api/c2c/project-vault/:programId for the tree and /search for a find —
 * and offers, on the open section, the three things a regulatory writer does
 * with a source beside the page: read it, cite it, refer to it.
 *
 * ── What each action actually does ───────────────────────────────────────────
 *   Open           The file is fetched through the vault's audited download
 *                  route (every download is recorded). Bytes that are a PDF
 *                  are shown in a viewer pane here; anything else is
 *                  downloaded, and the toast says why.
 *   Cite           Only a vault upload that IS a data-room source — same
 *                  bytes: the source's checksum equals the upload's content
 *                  hash — can be cited, because a citation node claims a
 *                  source the reference list resolves and the change report
 *                  re-reads. The insert goes through the editor's own
 *                  `insertCitation`, the command the toolbar picker runs, so
 *                  the section→source link is recorded exactly as a typed
 *                  citation's is. A file that is not a source says so; it is
 *                  not cited under a guessed identity.
 *   Insert ref.    Plain text — the file's title, type and content hash —
 *                  at the caret, for a file that cannot be cited.
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * No program: the rail says the document is not filed under a program and
 * offers nothing. A failed read is an error state with a retry, never an
 * empty vault. The read model's own `unavailable` branches are listed, as the
 * Vault surface lists them. Nothing here is a fixture.
 *
 * ── How this file is arranged ────────────────────────────────────────────────
 * Each read (fetch, parse, classify) is a plain async function; each piece of
 * state the rail keeps — the tree, the search, the viewer's object URL, the
 * file actions — is one hook; each visible block is one component.
 * `ProjectFilesPanel` is then only the wiring between them.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { EmptyState, ErrorState } from '../dataConnect';
import { downloadBlob, safeFileName } from '../download';
import { pdfViewerBlob } from './pdfBytes';
import type { FireToast } from '../toast';
import { isVaultDoc, vaultStatus, vaultFileIconKey, type VaultDoc, type VaultFolder } from '../fixtures/vault-data';
import type { ProjectSource } from './DocumentWorkbench';
import { SectionActions, SelectedFileActions, VaultSourceImport } from './ProjectFileActions';
import { DataRoomSourcesPanel } from './DataRoomSourcesPanel';
import { IndDocumentLibrary } from './IndDocumentLibrary';
import { useProjectVaultSearch, SEARCH_RESULTS_CHANGED, type SearchHit } from './projectVaultSearch';

/** The read model's envelope, unwrapped — the fields this rail reads. */
interface VaultRead {
  program?: string; tree: VaultFolder[]; documentCount?: number; pendingStore?: boolean;
  unavailable?: Array<{ branch: string; reason: string }>;
  uploadsWindow?: { shown: number; total: number; truncated: boolean };
}

export interface ProjectFilesPanelProps {
  programId: string | null;
  programName: string | null;
  fireToast: FireToast;
  /* Optional below: on the project's page (ProjectHome's Evidence stage, slice
     23) there is no editor. No `onClose`, no rail header; no editor callbacks,
     no cite and no ask for a section that is not there. */
  onClose?: () => void;
  /** An editable section is open — the cite/insert actions need a caret. */
  sectionOpen?: boolean;
  sectionCode?: string | null;
  /** The project's data-room sources (the workbench already reads them for
   *  the citation picker); a vault upload is citable when its hash matches. */
  projectSources?: ProjectSource[];
  /** Insert a citation node through the editor. False when nothing was inserted. */
  onCite?: (sourceId: string) => boolean | Promise<boolean>;
  /** Insert plain reference text through the editor. False when nothing was inserted. */
  onInsertReference?: (text: string) => boolean;
  /** The host guards unsaved work before opening the returned exact document. */
  onOpenDocument?: (docId: string) => void;
  /** External source-library hosts navigate after publishing an assembly target. */
  onNav?: (id: string) => void;
  /** Uses the host's existing conversation for IND preparation and source study. */
  onAsk?: (text: string) => void;
}

const NO_SOURCES: ProjectSource[] = [];

type ReadState = 'idle' | 'loading' | 'ready' | 'error';

/** The open PDF: the row it came from, its object URL, and the served hash. */
interface ViewerState { doc: VaultDoc; url: string; hash: string | null }

/* ── Pure helpers ─────────────────────────────────────────────────────────── */

/** A search hit in the tree's row shape, so one row renderer serves both. */
function hitToDoc(h: SearchHit): VaultDoc {
  return {
    id: h.id, num: h.ctdSection || '', title: h.title, type: h.documentType || '',
    status: h.placementStatus || 'unfiled', pct: null, owner: '', updated: '',
    preview: (h.snippet || '').replace(/<\/?b>/g, ''), src: 'upload', docId: h.id, sizeLabel: h.size || undefined,
    originalFileAvailable: h.originalFileAvailable, disposition: h.disposition,
    earlierVersion: h.current === false, ver: h.version ? `v${h.version}` : '',
  };
}

/** The reference line inserted for a file that is not a citable source. */
export function referenceTextFor(doc: VaultDoc): string {
  const parts = [`“${doc.title}”`];
  if (doc.type) parts.push(doc.type);
  if (doc.num) parts.push(`§${doc.num}`);
  if (doc.hash) parts.push(`SHA-256 ${doc.hash.slice(0, 12)}`);
  return `[Ref: ${parts.join(' · ')}]`;
}

/** One response header, tolerant of a response that carries no `headers` at
 *  all, so every caller reads them the same way. */
function responseHeader(res: Response, name: string): string | null {
  return res.headers?.get?.(name) ?? null;
}

/** The stored file behind a row, or null for an authored section — which has
 *  no bytes in the vault, so there is nothing for Open to fetch. */
function storedFileIdFor(doc: VaultDoc): string | null {
  return doc.docId ?? (doc.src === 'upload' ? doc.id : null);
}

/** Whether the row says it is a PDF. What is framed is decided by the bytes
 *  (pdfBytes.ts, SEC-A-3); this only words why a claimed PDF was downloaded. */
function claimsToBePdf(mime: string, title: string): boolean {
  return /pdf/i.test(mime) || /\.pdf$/i.test(title);
}

/** The toast's reason when a file says it is a PDF and its bytes are not. */
const CLAIMED_PDF_NOT_SHOWN = 'it is named or typed as a PDF, but its contents are not a PDF, so it is not shown here';

/** The vault's own filename for a download, falling back to a safe name made
 *  from the title when the route sends no Content-Disposition. */
function downloadNameFor(res: Response, doc: VaultDoc): string {
  const fromHeader = responseHeader(res, 'Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1];
  return fromHeader ?? safeFileName(doc.title, 'document');
}

/** Every document in the tree, flattened — a selected row is resolved by id
 *  and the tree is folders all the way down. */
function flattenVaultDocs(nodes: Array<VaultDoc | VaultFolder>): VaultDoc[] {
  return nodes.flatMap(n => (isVaultDoc(n) ? [n] : flattenVaultDocs(n.children)));
}

/** The row the actions act on. It can be a tree row or a search hit, because
 *  a selection survives the search box being typed into. */
function findSelectedDoc(selectedId: string | null, treeDocs: VaultDoc[], hits: SearchHit[]): VaultDoc | null {
  if (!selectedId) return null;
  const treeDoc = treeDocs.find(doc => doc.id === selectedId);
  const hit = hits.find(row => row.id === selectedId);
  if (!hit) return treeDoc ?? null;
  // Search is a newer read than the browse tree. Keep its recorded availability
  // authoritative while retaining the same file's checksum and filing metadata.
  return { ...treeDoc, ...hitToDoc(hit), hash: treeDoc?.hash, filing: treeDoc?.filing };
}

/** The data-room source a vault upload IS — same bytes, checksum to content
 *  hash. Null means the file cannot be cited, only referred to. */
function matchingProjectSource(doc: VaultDoc, projectSources: ProjectSource[]): ProjectSource | null {
  if (doc.src !== 'upload' || !doc.hash) return null;
  return projectSources.find(s => s.checksum && s.checksum === doc.hash) ?? null;
}

/* ── The reads ────────────────────────────────────────────────────────────── */

type VaultReadResult = { ok: true; vault: VaultRead } | { ok: false; message: string };

/** The tree read, with every failure turned into a message the rail shows —
 *  a failed read is an error state, never an empty vault. */
async function readProjectVault(programId: string): Promise<VaultReadResult> {
  try {
    const res = await apiRequest('GET', `/api/c2c/project-vault/${encodeURIComponent(programId)}`);
    const json = (await res.json().catch(() => null)) as { success?: boolean; data?: VaultRead } | null;
    if (!res.ok || !json?.data) {
      return { ok: false, message: serverMessage(json) ?? `The vault did not respond (HTTP ${res.status}).` };
    }
    return { ok: true, vault: { ...json.data, tree: Array.isArray(json.data.tree) ? json.data.tree : [] } };
  } catch (e) {
    return { ok: false, message: redactInternals(e instanceof Error ? e.message : '', 'The vault could not be reached.') };
  }
}

/** What one audited download turned out to be: a PDF for the viewer, bytes
 *  for the browser with the reason they were not shown, or the vault's refusal. */
type OpenedFile =
  | { kind: 'pdf'; blob: Blob; hash: string | null }
  | { kind: 'download'; blob: Blob; name: string; why: string }
  | { kind: 'refused'; message: string };

/** One download through the vault's audited route, classified — so the caller
 *  decides what to do with a file without re-reading headers and MIME types. */
async function downloadVaultFile(programId: string, docId: string, doc: VaultDoc): Promise<OpenedFile> {
  const path = `/api/c2c/project-vault/${encodeURIComponent(programId)}/documents/${encodeURIComponent(docId)}/download`;
  const res = await apiRequest('GET', path);
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    return { kind: 'refused', message: serverMessage(j) ?? `the vault refused it (HTTP ${res.status})` };
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const pdf = pdfViewerBlob(bytes);
  if (pdf) return { kind: 'pdf', blob: pdf, hash: responseHeader(res, 'X-Content-SHA256') ?? doc.hash ?? null };
  const mime = responseHeader(res, 'Content-Type') ?? '';
  const why = claimsToBePdf(mime, doc.title) ? CLAIMED_PDF_NOT_SHOWN : 'the viewer here shows PDFs only';
  return { kind: 'download', blob: new Blob([bytes], { type: mime }), name: downloadNameFor(res, doc), why };
}

/** The other half of Open — show it, hand it over, or say why it did not
 *  open. Apart from the fetch so each outcome's toast is decided in one place. */
function presentOpenedFile(opts: {
  file: OpenedFile; doc: VaultDoc; fireToast: FireToast;
  showPdf: (doc: VaultDoc, blob: Blob, hash: string | null) => void;
}): void {
  const { file, doc, fireToast, showPdf } = opts;
  if (file.kind === 'refused') return fireToast(`${doc.title} was not opened — ` + file.message + '.', 'error');
  if (file.kind === 'pdf') return showPdf(doc, file.blob, file.hash);
  const ok = downloadBlob(file.name, file.blob);
  fireToast(
    ok ? `Downloaded ${doc.title} — ${file.why}.`
      : `${doc.title} was fetched but the browser refused the download.`,
    ok ? 'ok' : 'error',
  );
}

/* ── The state the rail keeps ─────────────────────────────────────────────── */

/** The tree read and its retry, so the panel only renders what they hold. */
function useProjectVaultRead(programId: string | null) {
  const [state, setState] = useState<ReadState>('idle');
  const [vault, setVault] = useState<VaultRead | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const alive = useRef(true);
  const readSequence = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; readSequence.current += 1; }; }, []);

  const load = useCallback(async () => {
    if (!programId) return;
    const sequence = ++readSequence.current;
    setState('loading');
    setReadError(null);
    const result = await readProjectVault(programId);
    if (!alive.current || sequence !== readSequence.current) return;
    if (!result.ok) { setState('error'); setReadError(result.message); return; }
    setVault(result.vault);
    setState('ready');
  }, [programId]);

  useEffect(() => { void load(); }, [load]);
  return { state, vault, readError, load };
}

/** The viewer's object URL, owned in one place: released when the file
 *  changes, when the pane closes and when the rail unmounts, so a long
 *  session does not accumulate PDFs in memory. */
function useVaultPdfViewer() {
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const viewerUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
  }, []);

  /* `blob` is pdfViewerBlob's: bytes that begin %PDF, typed application/pdf. */
  const showPdf = useCallback((doc: VaultDoc, blob: Blob, hash: string | null) => {
    if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
    const url = URL.createObjectURL(blob);
    viewerUrlRef.current = url;
    setViewer({ doc, url, hash });
  }, []);

  const closeViewer = useCallback(() => {
    if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
    viewerUrlRef.current = null;
    setViewer(null);
  }, []);

  return { viewer, showPdf, closeViewer };
}

/** The three things the rail does with a file, together because each one ends
 *  in a toast that states exactly what happened — and Open needs the busy row. */
function useVaultFileActions(opts: {
  programId: string | null; sectionCode: string | null; fireToast: FireToast;
  sourceFor: (doc: VaultDoc) => ProjectSource | null;
  onCite: (sourceId: string) => boolean | Promise<boolean>; onInsertReference: (text: string) => boolean;
  showPdf: (doc: VaultDoc, blob: Blob, hash: string | null) => void;
}) {
  const { programId, sectionCode, fireToast, sourceFor, onCite, onInsertReference, showPdf } = opts;
  const [opening, setOpening] = useState<string | null>(null);
  const citing = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const openDoc = async (doc: VaultDoc) => {
    if (!programId || opening) return;
    const docId = storedFileIdFor(doc);
    const nothingToOpen = 'This row is an authored section, not a stored file — there is nothing to open here.';
    if (!docId) return fireToast(nothingToOpen, 'error');
    setOpening(doc.id);
    try {
      const file = await downloadVaultFile(programId, docId, doc);
      if (alive.current) presentOpenedFile({ file, doc, fireToast, showPdf });
    } catch (e) {
      if (alive.current) fireToast(redactInternals(e instanceof Error ? e.message : '', `${doc.title} was not opened.`), 'error');
    } finally {
      if (alive.current) setOpening(null);
    }
  };

  const cite = async (doc: VaultDoc) => {
    if (citing.current) return;
    const src = sourceFor(doc);
    if (!src) return;
    citing.current = true;
    try {
      const ok = await onCite(String(src.id));
      if (alive.current) fireToast(
        ok ? `Cited “${src.title ?? doc.title}” in ${sectionCode ?? 'the open section'} — the citation numbers from its position and the section now records this source.`
          : 'Couldn’t insert the citation — the source or editable section could not be confirmed. Try again in the current section.',
        ok ? 'ok' : 'error',
      );
    } catch {
      if (alive.current) fireToast('Couldn’t insert the citation — source registration could not be confirmed. Try again.', 'error');
    } finally {
      citing.current = false;
    }
  };

  const insertRef = (doc: VaultDoc) => {
    const ok = onInsertReference(referenceTextFor(doc));
    fireToast(
      ok ? `Reference to “${doc.title}” inserted at the caret as text. It is not a citation: this file is not a data-room source.`
        : 'Couldn’t insert the reference — the canvas is not editable right now.',
      ok ? 'ok' : 'error',
    );
  };

  return { opening, openDoc, cite, insertRef };
}

/* ── The blocks the rail is made of ───────────────────────────────────────── */

/** The rail's title bar, on every branch including the empty ones. */
function ProjectFilesHeader({ programName, onClose }: { programName: string | null; onClose: () => void }) {
  return (
    <div className="ed-comments-h ed-comments-h-row">
      <span>Project files{programName ? ` · ${programName}` : ''}</span>
      <button type="button" className="ed-comments-close" aria-label="Close project files" title="Close project files" onClick={onClose}>{I.close}</button>
    </div>
  );
}

/** The one row renderer, for tree rows and search hits alike. */
function VaultDocRow({ doc, depth, active, onToggle }: { doc: VaultDoc; depth: number; active: boolean; onToggle: () => void }) {
  const st = vaultStatus(doc.status);
  const iconKey = vaultFileIconKey(doc);
  return (
    <button type="button" className="pf-row" data-active={active || undefined} aria-pressed={active}
      style={{ paddingLeft: 10 + depth * 12 }} onClick={onToggle} title={doc.preview || doc.title}>
      <span className="pf-row-ic" aria-hidden="true">{(I as Record<string, React.ReactNode>)[iconKey] || I.fileText}</span>
      <span className="pf-row-b">
        <span className="pf-row-t">{doc.title}</span>
        <span className="pf-row-m">
          {[doc.num && doc.num !== '—' ? doc.num : null, doc.type || null, doc.sizeLabel ?? null].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className={`rd-chip tone-${st.tone}`}>{st.label}</span>
    </button>
  );
}

/** What the tree and the search results both need to draw a row and report a
 *  click back to the rail. */
interface TreeProps {
  nodes: Array<VaultDoc | VaultFolder>; depth: number;
  openFolders: Record<string, boolean>; onToggleFolder: (id: string, open: boolean) => void;
  selectedId: string | null; onSelectDoc: (id: string) => void;
}

/** The tree: documents are rows, folders recurse, and an open folder with
 *  nothing in it says so rather than rendering nothing at all. */
function VaultTreeNodes({ nodes, depth, ...rest }: TreeProps) {
  const { openFolders, onToggleFolder, selectedId, onSelectDoc } = rest;
  return (
    <>
      {nodes.map(n => {
        if (isVaultDoc(n)) {
          return <VaultDocRow key={n.id} doc={n} depth={depth} active={selectedId === n.id} onToggle={() => onSelectDoc(n.id)} />;
        }
        const isOpen = openFolders[n.id] ?? depth === 0;
        const count = n.children.length;
        return (
          <div key={n.id} className="pf-folder">
            <button
              type="button" className="pf-folder-h" aria-expanded={isOpen}
              style={{ paddingLeft: 10 + depth * 12 }} onClick={() => onToggleFolder(n.id, !isOpen)}
            >
              <span className="pf-folder-chev" data-open={isOpen || undefined} aria-hidden="true">{I.chevRight}</span>
              {I.folder}
              <span className="pf-folder-l">{n.label}</span>
              <span className="pf-folder-n">{count}</span>
            </button>
            {isOpen && (count > 0 ? <VaultTreeNodes {...rest} nodes={n.children} depth={depth + 1} /> : (
              <div className="pf-folder-empty" style={{ paddingLeft: 22 + depth * 12 }}>Nothing filed here yet.</div>
            ))}
          </div>
        );
      })}
    </>
  );
}

type RowsProps = Omit<TreeProps, 'nodes' | 'depth'>;

/** The search view: searching, the failure with its retry, no matches, or the
 *  hits under their true total. */
function VaultSearchResults(props: RowsProps & {
  query: string; programName: string | null; searchState: ReadState;
  hits: SearchHit[]; hitsTotal: number; searchError: string | null; onRetry: () => void;
  hasMore: boolean; pageBusy: boolean; pageError: string | null; loadMore: () => Promise<void>;
}) {
  const { query, programName, searchState, hits, hitsTotal, searchError, selectedId, onSelectDoc, onRetry,
    hasMore, pageBusy, pageError, loadMore } = props;
  return (
    <div className="pf-list" role="region" aria-label="Search results" aria-busy={searchState === 'loading' || pageBusy}>
      {searchState === 'loading' && hits.length === 0 ? (
        <div role="status" className="scaf-note" style={{ padding: 12 }}>Searching the vault…</div>
      ) : searchState === 'error' ? (
        <EmptyState
          tone="error" icon={I.alertTriangle} title="The vault could not be searched"
          hint={searchError ?? 'Nothing was searched — this is not an empty result.'} retry={onRetry}
        />
      ) : hits.length === 0 ? (
        <EmptyState icon={I.search} title="No matches" hint={`Nothing in ${programName ?? 'this program'}’s vault matches “${query.trim()}”.`} />
      ) : (
        <>
          <div className="pf-count">{hits.length} of {hitsTotal} match{hitsTotal === 1 ? '' : 'es'}</div>
          {hits.map(h => (
            <VaultDocRow key={h.id} doc={hitToDoc(h)} depth={0} active={selectedId === h.id} onToggle={() => onSelectDoc(h.id)} />
          ))}
          {pageError && <ErrorState icon={I.alertTriangle} title="More results could not be loaded"
            message={pageError} retry={pageError === SEARCH_RESULTS_CHANGED ? onRetry : () => void loadMore()}
            retryLabel={pageError === SEARCH_RESULTS_CHANGED ? 'Refresh search' : 'Try again'} busy={pageBusy} />}
          {hasMore && !pageError && <div className="pf-search pf-actions">
            <button type="button" className="btn ghost" onClick={() => void loadMore()} disabled={pageBusy}>
              {pageBusy ? 'Loading more results…' : 'More results'}
            </button>
          </div>}
        </>
      )}
    </div>
  );
}

/** The read model's own caveats, above the tree they qualify: the branches it
 *  could not read, and the uploads window when it is truncated. */
function VaultReadCaveats({ vault }: { vault: VaultRead | null }) {
  return (
    <>
      {vault?.unavailable?.map(u => (
        <div key={u.branch} className="scaf-note" role="status" style={{ margin: '8px 12px', fontSize: 11.5 }}>
          {u.branch}: {u.reason}
        </div>
      ))}
      {vault?.uploadsWindow?.truncated && (
        <div className="scaf-note" role="status" style={{ margin: '8px 12px', fontSize: 11.5 }}>
          Showing {vault.uploadsWindow.shown} of {vault.uploadsWindow.total} uploaded files — search to find the rest.
        </div>
      )}
    </>
  );
}

/** The browse view's four states, kept apart from the tree that only one of
 *  them renders: reading, failed, genuinely empty, or the vault itself. */
function VaultBrowseBody(props: RowsProps & {
  state: ReadState; vault: VaultRead | null; readError: string | null;
  programName: string | null; onRetry: () => void; editorAttached: boolean;
}) {
  const { state, vault, readError, programName, onRetry, editorAttached, ...rows } = props;
  if (state === 'loading' && !vault) {
    return <div role="status" className="scaf-note" style={{ padding: 12 }}>Reading the project vault…</div>;
  }
  if (state === 'error') {
    return (
      <EmptyState
        tone="error" icon={I.alertTriangle} title="Couldn’t read the project vault" testId="pf-error"
        hint={readError ?? 'The vault did not respond. This is a failed read, not an empty vault.'} retry={onRetry}
      />
    );
  }
  if (vault && vault.tree.length === 0) {
    return (
      <EmptyState
        icon={I.vault} title="Nothing in the vault yet"
        hint={vault.pendingStore
          ? 'The document store is not provisioned in this environment.'
          : `${programName ?? 'This program'} has no vault documents yet. Upload files in the Vault surface${editorAttached ? ', or file this document to the vault' : ''}.`}
      />
    );
  }
  return (
    <div className="pf-list" role="tree" aria-label="Project vault">
      <VaultReadCaveats vault={vault} />
      <VaultTreeNodes {...rows} nodes={vault?.tree ?? []} depth={0} />
    </div>
  );
}

/** The PDF pane: the served hash it was verified against, the document, and
 *  the same two section actions a row offers.
 *
 *  The frame has no `sandbox`, on purpose. Chromium will not show a PDF in a
 *  sandboxed frame at all: every value, including "allow-scripts
 *  allow-same-origin" and every other allow-* token, gives its error page
 *  instead of the viewer, and the `csp` attribute stops the viewer's own
 *  script (Chromium 141, checked 2026-09-28). What makes the frame safe is its
 *  input: only bytes that begin %PDF, always typed application/pdf
 *  (pdfBytes.ts), which the browser hands to its PDF viewer and never to the
 *  HTML parser. */
function PdfViewerPane(props: {
  viewer: ViewerState; sectionOpen: boolean; sectionCode: string | null; source: ProjectSource | null;
  onBack: () => void; onCite: () => void; onInsertRef: () => void;
}) {
  const { viewer, onBack, ...actions } = props;
  return (
    <div className="pf-viewer">
      <div className="pf-viewer-h">
        <button type="button" className="nda-open" onClick={onBack}>{I.left} Back to files</button>
        <span className="pf-viewer-t" title={viewer.doc.title}>{viewer.doc.title}</span>
      </div>
      {viewer.hash && (
        <div className="pf-viewer-hash" title={`SHA-256 ${viewer.hash}`}>
          SHA-256 {viewer.hash.slice(0, 16)}… — verified against the vault record before it was served
        </div>
      )}
      <iframe className="pf-viewer-frame" src={viewer.url} title={`${viewer.doc.title} — PDF viewer`} />
      <div className="pf-actions"><SectionActions {...actions} /></div>
    </div>
  );
}

/** Reset only the files rail on a scope switch; the editor keeps its leave guard. */
export function ProjectFilesPanel(props: ProjectFilesPanelProps) {
  return <ProjectFilesForProgram key={props.programId ?? 'no-program'} {...props} />;
}

function ProjectFilesForProgram({
  programId, programName, sectionOpen = false, sectionCode = null, projectSources = NO_SOURCES,
  onCite, onInsertReference, onOpenDocument, onAsk, onClose, fireToast, onNav,
}: ProjectFilesPanelProps) {
  const editorAttached = Boolean(onCite && onInsertReference);
  const { state, vault, readError, load } = useProjectVaultRead(programId);
  const [query, setQuery] = useState('');
  const search = useProjectVaultSearch(programId, query);
  const { viewer, showPdf, closeViewer } = useVaultPdfViewer();
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lane, setLane] = useState<'vault' | 'data-room' | 'ind'>('vault');
  const [pullDoc, setPullDoc] = useState<VaultDoc | null>(null);

  const sourceFor = useCallback((doc: VaultDoc) => matchingProjectSource(doc, projectSources), [projectSources]);
  const allDocs = useMemo(() => flattenVaultDocs(vault?.tree ?? []), [vault]);
  const selected = findSelectedDoc(selectedId, allDocs, search.hits);
  const { opening, openDoc, cite, insertRef } = useVaultFileActions({
    programId, sectionCode, fireToast, sourceFor, showPdf, onCite: onCite ?? (() => false), onInsertReference: onInsertReference ?? (() => false),
  });

  const onToggleFolder = useCallback((id: string, isOpen: boolean) => setOpenFolders(o => ({ ...o, [id]: isOpen })), []);
  const onSelectDoc = useCallback((id: string) => setSelectedId(cur => (cur === id ? null : id)), []);
  const rows = { openFolders, onToggleFolder, selectedId, onSelectDoc };
  const header = onClose ? <ProjectFilesHeader programName={programName} onClose={onClose} /> : null;

  if (!programId) {
    return (
      <>
        {header}
        <EmptyState icon={I.vault} title="Not filed under a program" testId="pf-no-program"
          hint="This document is not filed under a program, and the vault is program-scoped, so there are no project files to show. Open the document from its project, or create documents from a project so they are filed under it." />
      </>
    );
  }

  if (viewer) {
    return (
      <>
        {header}
        <PdfViewerPane viewer={viewer} sectionOpen={sectionOpen} sectionCode={sectionCode} source={sourceFor(viewer.doc)}
          onBack={closeViewer} onCite={() => cite(viewer.doc)} onInsertRef={() => insertRef(viewer.doc)} />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="pf-search">
      <div className="cdl-scope" role="group" aria-label="Document sources">
        <button type="button" className="cdl-scope-btn" aria-pressed={lane === 'vault'} onClick={() => setLane('vault')}>Vault</button>
        <button type="button" className="cdl-scope-btn" aria-pressed={lane === 'data-room'} onClick={() => setLane('data-room')}>Data room</button>
        <button type="button" className="cdl-scope-btn" aria-pressed={lane === 'ind'} onClick={() => setLane('ind')}>IND documents</button>
      </div>
      </div>
      {lane === 'data-room' && <DataRoomSourcesPanel key={programId} programId={programId} onOpenDocument={onOpenDocument} onAsk={onAsk} onNav={onNav} />}
      {lane === 'ind' && <IndDocumentLibrary key={programId} programId={programId} onAsk={onAsk} onOpenDocument={onOpenDocument}
        onFindSources={text => { setQuery(text); setLane('vault'); }} />}
      {lane === 'vault' && <>
      <div className="pf-search">
        <label className="sr-only" htmlFor="pf-search-input">Search the project vault</label>
        <input
          id="pf-search-input" className="c2c-input" type="search" placeholder="Search titles and text…"
          value={query} onChange={e => setQuery(e.target.value)} style={{ height: 30, width: '100%' }}
        />
      </div>
      {query.trim() ? (
        <VaultSearchResults {...rows} {...search} query={query} programName={programName} onRetry={search.retrySearch} />
      ) : (
        <VaultBrowseBody {...rows} state={state} vault={vault} readError={readError}
          programName={programName} onRetry={() => void load()} editorAttached={editorAttached} />
      )}
      {selected && (
        <SelectedFileActions doc={selected} sectionOpen={sectionOpen} sectionCode={sectionCode} source={sourceFor(selected)}
          busy={opening === selected.id} onOpen={() => void openDoc(selected)} editorAttached={editorAttached}
          onPull={() => setPullDoc(selected)}
          onCite={() => cite(selected)} onInsertRef={() => insertRef(selected)} />
      )}
      </>}
      <VaultSourceImport doc={pullDoc} programId={programId} onClose={() => setPullDoc(null)} onOpenDocument={onOpenDocument} />
    </>
  );
}
