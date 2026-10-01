/**
 * Library search: every project's Vault at once (plan critique 15, row D2).
 *
 * The Vault searched one project. A reviewer looking for "the 2024 stability
 * report" had to know which project held it; Veeva's library search does not
 * ask. With "All projects" on, the Vault's search box reads
 * GET /api/c2c/project-vault/search, the same query as the project search
 * over every program the organisation holds (vault-search.ts), and lists each
 * hit with the project that holds it. A hit downloads through its own
 * project. A search that failed is said to have failed, never shown as no
 * matches.
 */
import React from 'react';
import { I } from '../icons';
import { useLiveData, type ShapeGuard } from '../dataConnect';

export interface LibraryHit {
  id: string;
  title: string;
  documentType: string | null;
  size: string | null;
  version: string | null;
  current: boolean;
  snippet: string | null;
  program: { id: string; name: string | null };
}

export interface LibraryShape { query: string; total: number; limit: number; results: LibraryHit[] }

const isLibraryShape: ShapeGuard<LibraryShape> = (v): v is LibraryShape =>
  !!v && typeof v === 'object' && Array.isArray((v as LibraryShape).results) && typeof (v as LibraryShape).total === 'number';

export const LIBRARY_PAGE = 50;

/** How many matched, and how many are shown. */
export function libraryHeadline(d: LibraryShape): string {
  const n = d.total === 1 ? '1 document' : `${d.total} documents`;
  const shown = d.total > d.results.length ? ` Showing the ${d.results.length} best matches.` : '';
  return `${n} across all projects match “${d.query}”.${shown}`;
}

export function VaultLibraryResults({
  query, includeEarlier, currentProjectId, onDownload, downloadingId,
}: {
  query: string;
  includeEarlier: boolean;
  currentProjectId: string | null;
  onDownload: (documentId: string, title: string, programId: string) => void;
  downloadingId: string;
}) {
  const q = query.trim();
  const path = q
    ? `/api/c2c/project-vault/search?q=${encodeURIComponent(q)}&limit=${LIBRARY_PAGE}${includeEarlier ? '&includeSuperseded=true' : ''}`
    : null;
  const st = useLiveData<LibraryShape>(path, [path], isLibraryShape);
  if (!path) return null;
  if (st.loading) return <div className="vd-lib" data-testid="vault-library-results"><div className="scaf-note" role="status">Searching every project…</div></div>;
  if (st.error || !st.data) {
    return (
      <div className="vd-lib" data-testid="vault-library-results">
        <div className="vd-dr-err" role="alert">
          {I.alertTriangle} The library could not be searched, so nothing was searched. This is not a result of zero matches.
        </div>
      </div>
    );
  }
  const d = st.data;
  return (
    <div className="vd-lib" data-testid="vault-library-results">
      <div className="vd-dr-meta" role="status">{libraryHeadline(d)}</div>
      {d.results.map((h) => (
        <div key={h.id} className="vd-lib-row">
          <span className="vd-lib-title">
            {h.title}
            {h.version ? ` · v${h.version}` : ''}
            {h.current ? '' : ' · earlier version'}
          </span>
          <span className="vd-lib-proj">
            {h.program.name ?? 'Untitled project'}{h.program.id === currentProjectId ? ' (this project)' : ''}
          </span>
          {h.snippet ? <span className="vd-lib-snip">{h.snippet.replace(/<\/?b>/g, '')}</span> : null}
          <button
            className="sp-ask"
            disabled={downloadingId === h.id}
            onClick={() => onDownload(h.id, h.title, h.program.id)}
            aria-label={`Download ${h.title} from ${h.program.name ?? 'its project'}`}
          >
            {I.download} Download
          </button>
        </div>
      ))}
    </div>
  );
}
