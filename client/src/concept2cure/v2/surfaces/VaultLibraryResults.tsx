/**
 * Library search: the Vaults the viewer can access (plan critique 15, row D2).
 *
 * The Vault searched one project. A reviewer looking for "the 2024 stability
 * report" had to know which project held it; Veeva's library search does not
 * ask. With "Accessible projects" on, the Vault's search box reads
 * GET /api/c2c/project-vault/search, the same query as the project search
 * over the programs the viewer can currently access (vault-search.ts), and lists each
 * hit with the project that holds it. A hit downloads through its own
 * project. A search that failed is said to have failed, never shown as no
 * matches.
 */
import React from 'react';
import { I } from '../icons';
import { useLiveData, type ShapeGuard } from '../dataConnect';
import type { VaultDoc } from '../fixtures/vault-data';
import { vaultIngestTypeLabel } from '@shared/constants/domain/vault-taxonomy';
import '../styles/vault-picker.css';

export interface LibraryHit {
  id: string;
  title: string;
  documentType: string | null;
  size: string | null;
  version: string | null;
  current: boolean;
  snippet: string | null;
  program: { id: string; name: string | null };
  /** The version's recorded sha256, as vault.documents holds it. */
  contentHash?: string | null;
}

export interface LibraryShape {
  scope: 'verified-accessible-programs'; query: string; total: number; limit: number; results: LibraryHit[];
  /** 'browse' when filters were asked with no text (VR-18). */
  mode?: 'search' | 'browse';
  /** Set by the reader, not the server: whether the find view's filters were sent. */
  filtered?: boolean;
}

const nullableText = (v: unknown): v is string | null => v === null || typeof v === 'string';
function isLibraryHit(v: unknown): v is LibraryHit {
  if (!v || typeof v !== 'object') return false;
  const h = v as LibraryHit;
  return typeof h.id === 'string' && h.id.length > 0 && typeof h.title === 'string' &&
    nullableText(h.version) && typeof h.current === 'boolean' && nullableText(h.snippet) &&
    !!h.program && typeof h.program.id === 'string' && h.program.id.length > 0 && nullableText(h.program.name);
}
export const isLibraryShape: ShapeGuard<LibraryShape> = (v): v is LibraryShape => {
  if (!v || typeof v !== 'object') return false;
  const d = v as LibraryShape;
  return d.scope === 'verified-accessible-programs' && typeof d.query === 'string' && Number.isSafeInteger(d.total) && d.total >= 0 &&
    Array.isArray(d.results) && d.results.every(isLibraryHit) && d.total >= d.results.length;
};

export const LIBRARY_PAGE = 50;

/**
 * The find view's metadata filters (VR-18), keyed by the search routes' own
 * parameter names. Each is a list; the server ORs the values of one and ANDs
 * the dimensions. Values are checked there, and a refused one is an error.
 */
export interface VaultFindFilters {
  documentType?: string[];
  placementStatus?: string[];
  classification?: string[];
  evidenceKind?: string[];
  lifecycleStage?: string[];
  ctdSection?: string[];
}

/** The filters as query-string parameters ('&k=v…'), '' when none is set. */
export function vaultFilterParams(f: VaultFindFilters): string {
  return (Object.keys(f) as Array<keyof VaultFindFilters>).sort()
    .flatMap((k) => (f[k] ?? []).map((v) => `&${k}=${encodeURIComponent(v)}`))
    .join('');
}

/** How many matched, and how many are shown. */
export function libraryHeadline(d: LibraryShape): string {
  const n = d.total === 1 ? '1 document' : `${d.total} documents`;
  const browse = !d.query;
  const shown = d.total > d.results.length
    ? (browse ? ` Showing the newest ${d.results.length}.` : ` Showing the ${d.results.length} best matches.`) : '';
  const what = browse ? 'match the filters' : d.filtered ? `match “${d.query}” and the filters` : `match “${d.query}”`;
  return `${n} in projects you can access ${what}.${shown}`;
}

export function VaultLibraryResults({
  query, includeEarlier, currentProjectId, onDownload, downloadingId, filterParams = '',
}: {
  query: string;
  includeEarlier: boolean;
  currentProjectId: string | null;
  onDownload: (documentId: string, title: string, programId: string) => void;
  downloadingId: string;
  /** The find view's filters (vaultFilterParams); the library takes all but a folder. */
  filterParams?: string;
}) {
  const q = query.trim();
  const path = q || filterParams
    ? `/api/c2c/project-vault/search?q=${encodeURIComponent(q)}&limit=${LIBRARY_PAGE}${includeEarlier ? '&includeSuperseded=true' : ''}${filterParams}`
    : null;
  const raw = useLiveData<LibraryShape>(path, [path], isLibraryShape);
  const st = { ...raw, data: raw.data ? { ...raw.data, filtered: filterParams !== '' } : raw.data };
  if (!path) return null;
  if (st.loading) return <div className="vd-lib" data-testid="vault-library-results"><div className="scaf-note" role="status">Searching projects you can access…</div></div>;
  if (st.error || !st.data) {
    return (
      <div className="vd-lib" data-testid="vault-library-results">
        <div className="vd-dr-err" role="alert">
          {I.alertTriangle} The library search could not be verified. This is not a result of zero matches.
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

/* GET /api/c2c/project-vault/:id/search — one program's search, the Vault find
   view's contract and the picker's. `total` is the real count, not the page
   length, so a reader can say "12 of 340" instead of implying the page is
   everything. One guard for the route's readers here (Vault.tsx's find view,
   the picker below), moved from Vault.tsx on 2026-10-19 so they cannot drift.
   The editor's paging reader (editor/projectVaultSearch.ts readPage) still
   reads it with its own checks; folding it onto this guard is owed. */
export interface VaultSearchHit {
  originalFileAvailable?: boolean;
  disposition?: VaultDoc['disposition'];
  id: string;
  title: string;
  fileName: string | null;
  documentType: string | null;
  size: string | null;
  folderId: string | null;
  ctdSection: string | null;
  placementStatus: string | null;
  /** A body excerpt when the match was in the content; null when it was not. */
  snippet: string | null;
  /** The version, and whether it is the document's current one (VR-09). */
  version?: string | null;
  current?: boolean;
  /** The version's recorded sha256. */
  contentHash?: string | null;
  /** Metadata the search returns beside the title (VR-18). */
  evidenceKind?: string | null;
  classification?: string | null;
  /** The version's lifecycle stage; null when none is recorded. */
  lifecycleStage?: string | null;
  updatedAt?: string | null;
}

/**
 * A search hit as the row the tree renders. The one mapping, shared by the
 * Vault find view and the editor's files rail: two copies is how the rail came
 * to key a hit by its bare uuid while the tree keys the same document
 * `up-<uuid>`, so a file found by search never met its tree row and could not be
 * cited.
 */
export function searchHitToDoc(h: VaultSearchHit): VaultDoc {
  return {
    /* Keyed the way the tree keys the same document (`up-<uuid>`, server
       uploadLeaf), so a hit and its tree leaf are one selection. */
    id: `up-${h.id}`,
    num: h.ctdSection || '',
    title: h.title,
    // The same reader-facing name the tree shows (the server maps tree rows
    // through vaultIngestTypeLabel), not the raw token.
    type: h.documentType ? vaultIngestTypeLabel(h.documentType) : '',
    status: h.placementStatus || 'unfiled',
    pct: null,
    owner: '',
    ver: h.version ? `v${h.version}` : '',
    updated: '',
    // Only listed when the search asked for earlier versions (VR-09).
    earlierVersion: h.current === false,
    /* The server's ts_headline excerpt, with its <b> markers stripped: this is
       rendered as text, and a highlight that arrives as literal markup would
       read as corruption. */
    preview: (h.snippet || '').replace(/<\/?b>/g, ''),
    src: 'upload',
    docId: h.id,
    originalFileAvailable: h.originalFileAvailable,
    disposition: h.disposition,
    sizeLabel: h.size || undefined,
    ...(h.lifecycleStage !== undefined ? { lifecycleStage: h.lifecycleStage } : {}),
  };
}
export interface VaultSearchShape {
  query: string;
  includeSuperseded?: boolean;
  total: number;
  limit: number;
  offset: number;
  results: VaultSearchHit[];
}

export const isVaultSearchShape: ShapeGuard<VaultSearchShape> = (value): value is VaultSearchShape => {
  if (!value || typeof value !== 'object') return false;
  const read = value as Partial<VaultSearchShape>;
  return Array.isArray(read.results) && Number.isSafeInteger(read.total) &&
    typeof read.total === 'number' && read.total >= read.results.length &&
    read.results.every(hit => hit && typeof hit.id === 'string' && typeof hit.title === 'string');
};

/** A version's sha256 as the server pins it (lower(btrim(content_hash))), or null when none is recorded. */
export function pinnedSha256(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const h = raw.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(h) ? h : null;
}

/** A sha256 shortened for reading: the first 12 hex characters. */
export const shortSha256 = (h: string) => `${h.slice(0, 12)}…`;

/** A Vault version as a picker hands it to the screen that named it. */
export interface PickedVaultVersion {
  id: string;
  title: string;
  version: string | null;
  current: boolean;
  programId: string;
  /** The project that holds it; null when the search was one program's. */
  programName: string | null;
  /** Its recorded sha256 (pinnedSha256), or null when none is recorded. */
  contentHash: string | null;
}

const PICKER_PAGE = 25;

/** The search a picker runs: one program's when `programId` is set, the library's otherwise. */
function usePickerSearch(query: string, programId: string | undefined, includeEarlier: boolean) {
  const earlier = includeEarlier ? '&includeSuperseded=true' : '';
  const q = encodeURIComponent(query);
  const libraryPath = query && !programId ? `/api/c2c/project-vault/search?q=${q}&limit=${PICKER_PAGE}${earlier}` : null;
  const programPath = query && programId ? `/api/c2c/project-vault/${encodeURIComponent(programId)}/search?q=${q}&limit=${PICKER_PAGE}${earlier}` : null;
  const library = useLiveData<LibraryShape>(libraryPath, [libraryPath], isLibraryShape);
  const program = useLiveData<VaultSearchShape>(programPath, [programPath], isVaultSearchShape);
  if (programId) {
    const hits: PickedVaultVersion[] = (program.data?.results ?? []).map((h) => ({
      id: h.id, title: h.title, version: h.version ?? null, current: h.current !== false, programId, programName: null, contentHash: pinnedSha256(h.contentHash),
    }));
    return { loading: program.loading, error: program.error, read: program.data !== null, hits, total: program.data?.total ?? 0 };
  }
  const hits: PickedVaultVersion[] = (library.data?.results ?? []).map((h) => ({
    id: h.id, title: h.title, version: h.version, current: h.current, programId: h.program.id, programName: h.program.name, contentHash: pinnedSha256(h.contentHash),
  }));
  return { loading: library.loading, error: library.error, read: library.data !== null, hits, total: library.data?.total ?? 0 };
}

function PickerHit({ hit, inProgram, selectable, onChoose }: { hit: PickedVaultVersion; inProgram: boolean; selectable: boolean; onChoose: (h: PickedVaultVersion) => void }) {
  return (
    <div className="vpick-hit">
      <span>
        <strong>{hit.title}</strong>
        <small>
          {inProgram ? '' : `${hit.programName || 'Project'} · `}version {hit.version || 'not recorded'}{hit.current ? '' : ' · earlier version'}
        </small>
      </span>
      <button type="button" className="btn ghost small" disabled={!selectable} onClick={() => onChoose(hit)}>
        Select document
      </button>
    </div>
  );
}

/**
 * Pick one Vault version by searching for it (moved here from
 * CompanyDocumentSettings.tsx on 2026-10-19, so the company legal library and
 * a commitment's fulfilment name a version the same way).
 *
 * Without `programId` it reads the library search, over every program the
 * person can open, through isLibraryShape. With `programId` it reads that one
 * program's search, so a project's own documents are found however many other
 * projects match. An earlier version can be chosen only when `includeEarlier`
 * is set, and is said to be one. A search that failed says so; it is never "no
 * matching documents". When more match than are listed, it says how many.
 */
export function VaultVersionPicker({
  onChoose, disabled, includeEarlier = false, programId, label = 'Search your accessible Vaults', autoFocus = false,
}: {
  onChoose: (picked: PickedVaultVersion) => void;
  disabled: boolean;
  includeEarlier?: boolean;
  programId?: string;
  label?: string;
  /** Focus the search field when the picker appears (a choice was just removed). */
  autoFocus?: boolean;
}) {
  const inputId = React.useId();
  const [text, setText] = React.useState('');
  const [query, setQuery] = React.useState('');
  const search = usePickerSearch(query, programId, includeEarlier);
  const where = programId ? "this project's Vault" : 'your accessible projects';
  return (
    <div className="vpick">
      <div className="vpick-bar">
        <label className="vpick-field" htmlFor={inputId}>
          <span>{label}</span>
          <input id={inputId} value={text} onChange={(e) => setText(e.target.value)} placeholder="Document title or keyword" autoFocus={autoFocus} />
        </label>
        <button className="btn ghost small" type="button" disabled={disabled || !text.trim() || search.loading} onClick={() => setQuery(text.trim())}>
          Search Vault
        </button>
      </div>
      {search.loading && <p role="status">Searching {where}…</p>}
      {search.error && <p role="alert">The Vault search could not be read. Try another search or open Vault.</p>}
      {!search.loading && !search.error && search.read && (
        <div className="vpick-results">
          {search.hits.length === 0 && <p>No matching documents in {where}.</p>}
          {search.total > search.hits.length && (
            <p role="status">
              Showing {search.hits.length} of {search.total} matches. Refine the search to find one not listed.
            </p>
          )}
          {search.hits.map((hit) => (
            <PickerHit key={hit.id} hit={hit} inProgram={!!programId} selectable={!disabled && (hit.current || includeEarlier)} onChoose={onChoose} />
          ))}
        </div>
      )}
    </div>
  );
}
