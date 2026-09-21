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
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { downloadBlob, safeFileName } from '../download';
import type { FireToast } from '../toast';
import {
  isVaultDoc,
  vaultStatus,
  vaultFileIconKey,
  type VaultDoc,
  type VaultFolder,
} from '../fixtures/vault-data';
import type { ProjectSource } from './DocumentWorkbench';

/** The read model's envelope, unwrapped — the fields this rail reads. */
interface VaultRead {
  program?: string;
  tree: VaultFolder[];
  documentCount?: number;
  pendingStore?: boolean;
  unavailable?: Array<{ branch: string; reason: string }>;
  uploadsWindow?: { shown: number; total: number; truncated: boolean };
}

interface SearchHit {
  id: string;
  title: string;
  fileName: string | null;
  documentType: string | null;
  size: string | null;
  folderId: string | null;
  ctdSection: string | null;
  placementStatus: string | null;
  snippet: string | null;
}

export interface ProjectFilesPanelProps {
  programId: string | null;
  programName: string | null;
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
  onClose: () => void;
  fireToast: FireToast;
}

type ReadState = 'idle' | 'loading' | 'ready' | 'error';

/** A search hit in the tree's row shape, so one row renderer serves both. */
function hitToDoc(h: SearchHit): VaultDoc {
  return {
    id: h.id,
    num: h.ctdSection || '',
    title: h.title,
    type: h.documentType || '',
    status: h.placementStatus || 'unfiled',
    pct: 0,
    owner: '',
    ver: '',
    updated: '',
    preview: (h.snippet || '').replace(/<\/?b>/g, ''),
    src: 'upload',
    docId: h.id,
    sizeLabel: h.size || undefined,
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

export function ProjectFilesPanel({
  programId,
  programName,
  sectionOpen,
  sectionCode,
  projectSources,
  onCite,
  onInsertReference,
  onClose,
  fireToast,
}: ProjectFilesPanelProps) {
  const [state, setState] = useState<ReadState>('idle');
  const [vault, setVault] = useState<VaultRead | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<ReadState>('idle');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [hitsTotal, setHitsTotal] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [viewer, setViewer] = useState<{ doc: VaultDoc; url: string; hash: string | null } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const viewerUrlRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!programId) return;
    setState('loading');
    setReadError(null);
    try {
      const res = await apiRequest('GET', `/api/c2c/project-vault/${encodeURIComponent(programId)}`);
      const json = (await res.json().catch(() => null)) as { success?: boolean; data?: VaultRead } | null;
      if (!res.ok || !json?.data) {
        setState('error');
        setReadError(serverMessage(json) ?? `The vault did not respond (HTTP ${res.status}).`);
        return;
      }
      setVault({ ...json.data, tree: Array.isArray(json.data.tree) ? json.data.tree : [] });
      setState('ready');
    } catch (e) {
      setState('error');
      setReadError(redactInternals(e instanceof Error ? e.message : '', 'The vault could not be reached.'));
    }
  }, [programId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Search: debounced, and an empty box is the browse view (the server says
     so itself — EMPTY_QUERY — rather than "everything matched"). */
  useEffect(() => {
    const q = query.trim();
    if (!programId || !q) {
      setSearchState('idle');
      setHits([]);
      setHitsTotal(0);
      setSearchError(null);
      return;
    }
    let alive = true;
    setSearchState('loading');
    const t = setTimeout(async () => {
      try {
        const res = await apiRequest(
          'GET',
          `/api/c2c/project-vault/${encodeURIComponent(programId)}/search?q=${encodeURIComponent(q)}&limit=25`,
        );
        const json = (await res.json().catch(() => null)) as
          | { success?: boolean; data?: { results?: SearchHit[]; total?: number }; message?: string }
          | null;
        if (!alive) return;
        if (!res.ok || !json?.data) {
          setSearchState('error');
          setSearchError(serverMessage(json) ?? `The vault could not be searched (HTTP ${res.status}).`);
          return;
        }
        setHits(Array.isArray(json.data.results) ? json.data.results : []);
        setHitsTotal(typeof json.data.total === 'number' ? json.data.total : 0);
        setSearchState('ready');
      } catch (e) {
        if (!alive) return;
        setSearchState('error');
        setSearchError(redactInternals(e instanceof Error ? e.message : '', 'The vault could not be searched.'));
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, programId]);

  /* The viewer holds an object URL; release it when the file changes or the
     rail unmounts, so a long session does not accumulate PDFs in memory. */
  useEffect(() => {
    return () => {
      if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
    };
  }, []);

  const sourceFor = useCallback(
    (doc: VaultDoc): ProjectSource | null => {
      if (doc.src !== 'upload' || !doc.hash) return null;
      return projectSources.find(s => s.checksum && s.checksum === doc.hash) ?? null;
    },
    [projectSources],
  );

  const allDocs = useMemo(() => {
    const out: VaultDoc[] = [];
    const walk = (nodes: Array<VaultDoc | VaultFolder>) => {
      for (const n of nodes) {
        if (isVaultDoc(n)) out.push(n);
        else walk(n.children);
      }
    };
    walk(vault?.tree ?? []);
    return out;
  }, [vault]);

  const selected =
    (selectedId && allDocs.find(d => d.id === selectedId)) ||
    (selectedId && hits.map(hitToDoc).find(d => d.id === selectedId)) ||
    null;

  const openDoc = async (doc: VaultDoc) => {
    if (!programId || opening) return;
    const docId = doc.docId ?? (doc.src === 'upload' ? doc.id : null);
    if (!docId) {
      fireToast('This row is an authored section, not a stored file — there is nothing to open here.', 'error');
      return;
    }
    setOpening(doc.id);
    try {
      const res = await apiRequest(
        'GET',
        `/api/c2c/project-vault/${encodeURIComponent(programId)}/documents/${encodeURIComponent(docId)}/download`,
      );
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        fireToast(
          `${doc.title} was not opened — ` + (serverMessage(j) ?? `the vault refused it (HTTP ${res.status})`) + '.',
          'error',
        );
        return;
      }
      const blob = await res.blob();
      const mime = res.headers?.get?.('Content-Type') ?? blob.type ?? '';
      const hash = res.headers?.get?.('X-Content-SHA256') ?? doc.hash ?? null;
      if (/pdf/i.test(mime) || /\.pdf$/i.test(doc.title)) {
        if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
        const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: 'application/pdf' }));
        viewerUrlRef.current = url;
        setViewer({ doc, url, hash });
        return;
      }
      const name =
        res.headers?.get?.('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] ??
        safeFileName(doc.title, 'document');
      const ok = downloadBlob(name, blob);
      fireToast(
        ok
          ? `Downloaded ${doc.title} — the viewer here shows PDFs only.`
          : `${doc.title} was fetched but the browser refused the download.`,
        ok ? 'ok' : 'error',
      );
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
      ok
        ? `Cited “${src.title ?? doc.title}” in ${sectionCode ?? 'the open section'} — the citation numbers from its position and the section now records this source.`
        : 'Couldn’t insert the citation — the canvas is not editable right now (source mode, a frozen document, or no caret).',
      ok ? 'ok' : 'error',
    );
  };

  const insertRef = (doc: VaultDoc) => {
    const ok = onInsertReference(referenceTextFor(doc));
    fireToast(
      ok
        ? `Reference to “${doc.title}” inserted at the caret as text. It is not a citation: this file is not a data-room source.`
        : 'Couldn’t insert the reference — the canvas is not editable right now.',
      ok ? 'ok' : 'error',
    );
  };

  /* ── The one row renderer, for tree rows and search hits alike ── */
  const Row = ({ doc, depth }: { doc: VaultDoc; depth: number }) => {
    const st = vaultStatus(doc.status);
    const iconKey = vaultFileIconKey(doc);
    return (
      <button
        type="button"
        className="pf-row"
        data-active={selectedId === doc.id || undefined}
        style={{ paddingLeft: 10 + depth * 12 }}
        onClick={() => setSelectedId(selectedId === doc.id ? null : doc.id)}
        aria-pressed={selectedId === doc.id}
        title={doc.preview || doc.title}
      >
        <span className="pf-row-ic" aria-hidden="true">{(I as Record<string, React.ReactNode>)[iconKey] || I.fileText}</span>
        <span className="pf-row-b">
          <span className="pf-row-t">{doc.title}</span>
          <span className="pf-row-m">
            {[doc.num && doc.num !== '—' ? doc.num : null, doc.type || null, doc.sizeLabel ?? null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span className={`rd-chip tone-${st.tone}`}>{st.label}</span>
      </button>
    );
  };

  const renderNodes = (nodes: Array<VaultDoc | VaultFolder>, depth: number): React.ReactNode =>
    nodes.map(n => {
      if (isVaultDoc(n)) return <Row key={n.id} doc={n} depth={depth} />;
      const isOpen = open[n.id] ?? depth === 0;
      const count = n.children.length;
      return (
        <div key={n.id} className="pf-folder">
          <button
            type="button"
            className="pf-folder-h"
            style={{ paddingLeft: 10 + depth * 12 }}
            aria-expanded={isOpen}
            onClick={() => setOpen(o => ({ ...o, [n.id]: !isOpen }))}
          >
            <span className="pf-folder-chev" data-open={isOpen || undefined} aria-hidden="true">{I.chevRight}</span>
            {I.folder}
            <span className="pf-folder-l">{n.label}</span>
            <span className="pf-folder-n">{count}</span>
          </button>
          {isOpen && (count > 0 ? renderNodes(n.children, depth + 1) : (
            <div className="pf-folder-empty" style={{ paddingLeft: 22 + depth * 12 }}>Nothing filed here yet.</div>
          ))}
        </div>
      );
    });

  const header = (
    <div className="ed-comments-h ed-comments-h-row">
      <span>Project files{programName ? ` · ${programName}` : ''}</span>
      <button type="button" className="ed-comments-close" aria-label="Close project files" title="Close project files" onClick={onClose}>
        {I.close}
      </button>
    </div>
  );

  if (!programId) {
    return (
      <>
        {header}
        <EmptyState
          icon={I.vault}
          title="Not filed under a program"
          hint="This document is not filed under a program, and the vault is program-scoped, so there are no project files to show. Open the document from its project, or create documents from a project so they are filed under it."
          testId="pf-no-program"
        />
      </>
    );
  }

  if (viewer) {
    return (
      <>
        {header}
        <div className="pf-viewer">
          <div className="pf-viewer-h">
            <button
              type="button"
              className="nda-open"
              onClick={() => {
                if (viewerUrlRef.current) URL.revokeObjectURL(viewerUrlRef.current);
                viewerUrlRef.current = null;
                setViewer(null);
              }}
            >
              {I.left} Back to files
            </button>
            <span className="pf-viewer-t" title={viewer.doc.title}>{viewer.doc.title}</span>
          </div>
          {viewer.hash && (
            <div className="pf-viewer-hash" title={`SHA-256 ${viewer.hash}`}>
              SHA-256 {viewer.hash.slice(0, 16)}… — verified against the vault record before it was served
            </div>
          )}
          <iframe className="pf-viewer-frame" src={viewer.url} title={`${viewer.doc.title} — PDF viewer`} />
          <div className="pf-actions">
            {sectionOpen && sourceFor(viewer.doc) && (
              <button type="button" className="btn ghost" style={{ height: 28, fontSize: 12 }} onClick={() => cite(viewer.doc)}>
                {I.quote} Cite in {sectionCode ? `§${sectionCode}` : 'this section'}
              </button>
            )}
            {sectionOpen && !sourceFor(viewer.doc) && (
              <button type="button" className="btn ghost" style={{ height: 28, fontSize: 12 }} onClick={() => insertRef(viewer.doc)}>
                {I.link} Insert reference
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="pf-search">
        <label className="sr-only" htmlFor="pf-search-input">Search the project vault</label>
        <input
          id="pf-search-input"
          className="c2c-input"
          type="search"
          placeholder="Search titles and text…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ height: 30, width: '100%' }}
        />
      </div>

      {query.trim() ? (
        <div className="pf-list" role="region" aria-label="Search results">
          {searchState === 'loading' && hits.length === 0 ? (
            <div role="status" className="scaf-note" style={{ padding: 12 }}>Searching the vault…</div>
          ) : searchState === 'error' ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="The vault could not be searched"
              hint={searchError ?? 'Nothing was searched — this is not an empty result.'}
              retry={() => setQuery(q => q + '')}
            />
          ) : hits.length === 0 ? (
            <EmptyState icon={I.search} title="No matches" hint={`Nothing in ${programName ?? 'this program'}’s vault matches “${query.trim()}”.`} />
          ) : (
            <>
              <div className="pf-count">{hits.length} of {hitsTotal} match{hitsTotal === 1 ? '' : 'es'}</div>
              {hits.map(h => <Row key={h.id} doc={hitToDoc(h)} depth={0} />)}
            </>
          )}
        </div>
      ) : state === 'loading' && !vault ? (
        <div role="status" className="scaf-note" style={{ padding: 12 }}>Reading the project vault…</div>
      ) : state === 'error' ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn’t read the project vault"
          hint={readError ?? 'The vault did not respond. This is a failed read, not an empty vault.'}
          retry={() => void load()}
          testId="pf-error"
        />
      ) : vault && vault.tree.length === 0 ? (
        <EmptyState
          icon={I.vault}
          title="Nothing in the vault yet"
          hint={
            vault.pendingStore
              ? 'The document store is not provisioned in this environment.'
              : `${programName ?? 'This program'} has no vault documents yet. Upload files in the Vault surface, or file this document to the vault.`
          }
        />
      ) : (
        <div className="pf-list" role="tree" aria-label="Project vault">
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
          {renderNodes(vault?.tree ?? [], 0)}
        </div>
      )}

      {selected && (
        <div className="pf-sel" data-testid="pf-selected">
          <div className="pf-sel-t">{selected.title}</div>
          {selected.hash && <div className="pf-sel-m" title={`SHA-256 ${selected.hash}`}>SHA-256 {selected.hash.slice(0, 12)}…</div>}
          {selected.filing?.folderLabel && <div className="pf-sel-m">{selected.filing.folderLabel}</div>}
          <div className="pf-actions">
            {(selected.src === 'upload' || selected.docId) && (
              <button
                type="button"
                className="btn ghost"
                style={{ height: 28, fontSize: 12 }}
                disabled={opening === selected.id}
                onClick={() => void openDoc(selected)}
              >
                {I.eye} {opening === selected.id ? 'Opening…' : 'Open'}
              </button>
            )}
            {sectionOpen ? (
              sourceFor(selected) ? (
                <button
                  type="button"
                  className="btn ghost"
                  style={{ height: 28, fontSize: 12 }}
                  onClick={() => cite(selected)}
                  data-testid="pf-cite"
                >
                  {I.quote} Cite in {sectionCode ? `§${sectionCode}` : 'this section'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn ghost"
                  style={{ height: 28, fontSize: 12 }}
                  onClick={() => insertRef(selected)}
                  data-testid="pf-insert-reference"
                >
                  {I.link} Insert reference
                </button>
              )
            ) : (
              <span className="pf-sel-m">Open an editable section to cite or refer to this file.</span>
            )}
          </div>
          {sectionOpen && !sourceFor(selected) && (
            <div className="pf-sel-m" data-testid="pf-not-citable">
              Not a data-room source, so it cannot be cited — a citation claims a source the reference list resolves. Add the file to the project’s data room to cite it; a reference inserts as text.
            </div>
          )}
        </div>
      )}
    </>
  );
}
