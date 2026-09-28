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
 *   Open           A PDF is fetched through the vault's audited download route
 *                  (every download is recorded) and shown in a viewer pane
 *                  here. Anything else is downloaded.
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
import { EmptyState } from '../dataConnect';
import { downloadBlob, safeFileName } from '../download';
import type { FireToast } from '../toast';
import { isVaultDoc, vaultStatus, vaultFileIconKey, type VaultDoc, type VaultFolder } from '../fixtures/vault-data';
import type { ProjectSource } from './DocumentWorkbench';

/** The read model's envelope, unwrapped — the fields this rail reads. */
interface VaultRead {
  program?: string; tree: VaultFolder[]; documentCount?: number; pendingStore?: boolean;
  unavailable?: Array<{ branch: string; reason: string }>;
  uploadsWindow?: { shown: number; total: number; truncated: boolean };
}

interface SearchHit {
  id: string; title: string; fileName: string | null; documentType: string | null; size: string | null;
  folderId: string | null; ctdSection: string | null; placementStatus: string | null; snippet: string | null;
}

export interface ProjectFilesPanelProps {
  programId: string | null;
  programName: string | null;
  onClose: () => void;
  fireToast: FireToast;
  /** An editable section is open — the cite/insert actions need a caret. */
  sectionOpen: boolean;
  sectionCode: string | null;
  /** The project's data-room sources (the workbench already reads them for
   *  the citation picker); a vault upload is citable when its hash matches. */
  projectSources: ProjectSource[];
  /** Insert a citation node through the editor. False when nothing was inserted. */
  onCite: (sourceId: string) => boolean;
  /** Insert plain reference text through the editor. False when nothing was inserted. */
  onInsertReference: (text: string) => boolean;
}

type ReadState = 'idle' | 'loading' | 'ready' | 'error';

/** The open PDF: the row it came from, its object URL, and the served hash. */
interface ViewerState { doc: VaultDoc; url: string; hash: string | null }

/* ── Pure helpers ─────────────────────────────────────────────────────────── */

/** A search hit in the tree's row shape, so one row renderer serves both. */
function hitToDoc(h: SearchHit): VaultDoc {
  return {
    id: h.id, num: h.ctdSection || '', title: h.title, type: h.documentType || '',
    status: h.placementStatus || 'unfiled', pct: null, owner: '', ver: '', updated: '',
    preview: (h.snippet || '').replace(/<\/?b>/g, ''), src: 'upload', docId: h.id, sizeLabel: h.size || undefined,
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

/** Whether the fetched bytes belong in the rail's viewer; everything else is
 *  handed to the browser, because the viewer here shows PDFs only. */
function servesAsPdf(mime: string, title: string): boolean {
  return /pdf/i.test(mime) || /\.pdf$/i.test(title);
}

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
  return treeDocs.find(d => d.id === selectedId) ?? hits.map(hitToDoc).find(d => d.id === selectedId) ?? null;
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

type VaultSearchResult = { ok: true; hits: SearchHit[]; total: number } | { ok: false; message: string };

/** The search read — same contract as the tree read: results, or a reason. */
async function searchProjectVault(programId: string, q: string): Promise<VaultSearchResult> {
  try {
    const url = `/api/c2c/project-vault/${encodeURIComponent(programId)}/search?q=${encodeURIComponent(q)}&limit=25`;
    const res = await apiRequest('GET', url);
    const json = (await res.json().catch(() => null)) as
      | { success?: boolean; data?: { results?: SearchHit[]; total?: number }; message?: string } | null;
    if (!res.ok || !json?.data) {
      return { ok: false, message: serverMessage(json) ?? `The vault could not be searched (HTTP ${res.status}).` };
    }
    const hits = Array.isArray(json.data.results) ? json.data.results : [];
    return { ok: true, hits, total: typeof json.data.total === 'number' ? json.data.total : 0 };
  } catch (e) {
    return { ok: false, message: redactInternals(e instanceof Error ? e.message : '', 'The vault could not be searched.') };
  }
}

/** What one audited download turned out to be: a PDF for the viewer, bytes
 *  for the browser, or the vault's refusal. */
type OpenedFile =
  | { kind: 'pdf'; blob: Blob; hash: string | null }
  | { kind: 'download'; blob: Blob; name: string }
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
  const blob = await res.blob();
  const mime = responseHeader(res, 'Content-Type') ?? blob.type ?? '';
  if (servesAsPdf(mime, doc.title)) {
    return { kind: 'pdf', blob, hash: responseHeader(res, 'X-Content-SHA256') ?? doc.hash ?? null };
  }
  return { kind: 'download', blob, name: downloadNameFor(res, doc) };
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
    ok ? `Downloaded ${doc.title} — the viewer here shows PDFs only.`
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

  const load = useCallback(async () => {
    if (!programId) return;
    setState('loading');
    setReadError(null);
    const result = await readProjectVault(programId);
    if (!result.ok) { setState('error'); setReadError(result.message); return; }
    setVault(result.vault);
    setState('ready');
  }, [programId]);

  useEffect(() => { void load(); }, [load]);
  return { state, vault, readError, load };
}

/** The debounced search. An empty box is the browse view (the server says so
 *  itself — EMPTY_QUERY — rather than "everything matched"). */
function useProjectVaultSearch(programId: string | null, query: string) {
  const [searchState, setSearchState] = useState<ReadState>('idle');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hitsTotal, setHitsTotal] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!programId || !q) {
      setSearchState('idle'); setHits([]); setHitsTotal(0); setSearchError(null);
      return;
    }
    let alive = true;
    setSearchState('loading');
    const t = setTimeout(async () => {
      const result = await searchProjectVault(programId, q);
      if (!alive) return;
      if (!result.ok) { setSearchState('error'); setSearchError(result.message); return; }
      setHits(result.hits);
      setHitsTotal(result.total);
      setSearchState('ready');
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [query, programId]);

  return { searchState, hits, hitsTotal, searchError };
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

  const showPdf = useCallback((doc: VaultDoc, blob: Blob, hash: string | null) => {
    if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
    const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'application/pdf' }));
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
  onCite: (sourceId: string) => boolean; onInsertReference: (text: string) => boolean;
  showPdf: (doc: VaultDoc, blob: Blob, hash: string | null) => void;
}) {
  const { programId, sectionCode, fireToast, sourceFor, onCite, onInsertReference, showPdf } = opts;
  const [opening, setOpening] = useState<string | null>(null);

  const openDoc = async (doc: VaultDoc) => {
    if (!programId || opening) return;
    const docId = storedFileIdFor(doc);
    const nothingToOpen = 'This row is an authored section, not a stored file — there is nothing to open here.';
    if (!docId) return fireToast(nothingToOpen, 'error');
    setOpening(doc.id);
    try {
      presentOpenedFile({ file: await downloadVaultFile(programId, docId, doc), doc, fireToast, showPdf });
    } catch (e) {
      fireToast(redactInternals(e instanceof Error ? e.message : '', `${doc.title} was not opened.`), 'error');
    } finally {
      setOpening(null);
    }
  };

  const cite = (doc: VaultDoc) => {
    const src = sourceFor(doc);
    if (!src) return;
    const ok = onCite(String(src.id));
    fireToast(
      ok ? `Cited “${src.title ?? doc.title}” in ${sectionCode ?? 'the open section'} — the citation numbers from its position and the section now records this source.`
        : 'Couldn’t insert the citation — the canvas is not editable right now (source mode, a frozen document, or no caret).',
      ok ? 'ok' : 'error',
    );
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
      <button type="button" className="ed-comments-close" aria-label="Close project files" title="Close project files" onClick={onClose}>
        {I.close}
      </button>
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
}) {
  const { query, programName, searchState, hits, hitsTotal, searchError, selectedId, onSelectDoc, onRetry } = props;
  return (
    <div className="pf-list" role="region" aria-label="Search results">
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
  programName: string | null; onRetry: () => void;
}) {
  const { state, vault, readError, programName, onRetry, ...rows } = props;
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
          : `${programName ?? 'This program'} has no vault documents yet. Upload files in the Vault surface, or file this document to the vault.`}
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

/** The two section actions — cite a source, refer to anything else — which
 *  the viewer pane and the selected row both offer, on the same rule. */
function SectionActions(props: {
  sectionOpen: boolean; sectionCode: string | null; source: ProjectSource | null;
  onCite: () => void; onInsertRef: () => void; citeTestId?: string; refTestId?: string;
}) {
  const { sectionOpen, sectionCode, source, onCite, onInsertRef, citeTestId, refTestId } = props;
  if (!sectionOpen) return null;
  return source ? (
    <button type="button" className="btn ghost" style={{ height: 28, fontSize: 12 }} onClick={onCite} data-testid={citeTestId}>
      {I.quote} Cite in {sectionCode ? `§${sectionCode}` : 'this section'}
    </button>
  ) : (
    <button type="button" className="btn ghost" style={{ height: 28, fontSize: 12 }} onClick={onInsertRef} data-testid={refTestId}>
      {I.link} Insert reference
    </button>
  );
}

/** The PDF pane: the served hash it was verified against, the document, and
 *  the same two section actions a row offers. */
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

/** The selected row's footer: what the file is, what can be done with it, and
 *  why a file that is not a data-room source cannot be cited. */
function SelectedFileActions(props: {
  doc: VaultDoc; sectionOpen: boolean; sectionCode: string | null; source: ProjectSource | null;
  busy: boolean; onOpen: () => void; onCite: () => void; onInsertRef: () => void;
}) {
  const { doc, busy, onOpen, ...actions } = props;
  const { sectionOpen, source } = props;
  return (
    <div className="pf-sel" data-testid="pf-selected">
      <div className="pf-sel-t">{doc.title}</div>
      {doc.hash && <div className="pf-sel-m" title={`SHA-256 ${doc.hash}`}>SHA-256 {doc.hash.slice(0, 12)}…</div>}
      {doc.filing?.folderLabel && <div className="pf-sel-m">{doc.filing.folderLabel}</div>}
      <div className="pf-actions">
        {(doc.src === 'upload' || doc.docId) && (
          <button type="button" className="btn ghost" style={{ height: 28, fontSize: 12 }} disabled={busy} onClick={onOpen}>
            {I.eye} {busy ? 'Opening…' : 'Open'}
          </button>
        )}
        <SectionActions {...actions} citeTestId="pf-cite" refTestId="pf-insert-reference" />
        {!sectionOpen && <span className="pf-sel-m">Open an editable section to cite or refer to this file.</span>}
      </div>
      {sectionOpen && !source && (
        <div className="pf-sel-m" data-testid="pf-not-citable">
          Not a data-room source, so it cannot be cited — a citation claims a source the reference list resolves. Add the file to the project’s data room to cite it; a reference inserts as text.
        </div>
      )}
    </div>
  );
}

export function ProjectFilesPanel({
  programId, programName, sectionOpen, sectionCode, projectSources,
  onCite, onInsertReference, onClose, fireToast,
}: ProjectFilesPanelProps) {
  const { state, vault, readError, load } = useProjectVaultRead(programId);
  const [query, setQuery] = useState('');
  const search = useProjectVaultSearch(programId, query);
  const { viewer, showPdf, closeViewer } = useVaultPdfViewer();
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sourceFor = useCallback((doc: VaultDoc) => matchingProjectSource(doc, projectSources), [projectSources]);
  const allDocs = useMemo(() => flattenVaultDocs(vault?.tree ?? []), [vault]);
  const selected = findSelectedDoc(selectedId, allDocs, search.hits);
  const { opening, openDoc, cite, insertRef } = useVaultFileActions({
    programId, sectionCode, fireToast, sourceFor, onCite, onInsertReference, showPdf,
  });

  const onToggleFolder = useCallback((id: string, isOpen: boolean) => setOpenFolders(o => ({ ...o, [id]: isOpen })), []);
  const onSelectDoc = useCallback((id: string) => setSelectedId(cur => (cur === id ? null : id)), []);
  const rows = { openFolders, onToggleFolder, selectedId, onSelectDoc };
  const header = <ProjectFilesHeader programName={programName} onClose={onClose} />;

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
        <label className="sr-only" htmlFor="pf-search-input">Search the project vault</label>
        <input
          id="pf-search-input" className="c2c-input" type="search" placeholder="Search titles and text…"
          value={query} onChange={e => setQuery(e.target.value)} style={{ height: 30, width: '100%' }}
        />
      </div>
      {query.trim() ? (
        <VaultSearchResults {...rows} {...search} query={query} programName={programName} onRetry={() => setQuery(q => q + '')} />
      ) : (
        <VaultBrowseBody {...rows} state={state} vault={vault} readError={readError}
          programName={programName} onRetry={() => void load()} />
      )}
      {selected && (
        <SelectedFileActions doc={selected} sectionOpen={sectionOpen} sectionCode={sectionCode} source={sourceFor(selected)}
          busy={opening === selected.id} onOpen={() => void openDoc(selected)}
          onCite={() => cite(selected)} onInsertRef={() => insertRef(selected)} />
      )}
    </>
  );
}
