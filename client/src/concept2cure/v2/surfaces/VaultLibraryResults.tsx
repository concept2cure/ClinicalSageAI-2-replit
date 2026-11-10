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
import { getAuthToken, getJwtOrgId } from '@/utils/authToken';
import { I } from '../icons';
import { useLiveData, type ShapeGuard } from '../dataConnect';
import { describeReadFailure, readRefusalOf } from '../../mdx/hooks/useFetchJson';
import type { VaultDoc } from '../fixtures/vault-data';
import { vaultIngestTypeLabel } from '@shared/constants/domain/vault-taxonomy';
import '../styles/vault-picker.css';

/* One client at a time (P-107 item 3, 2026-11-08: "No cross-sponsor library view for a CRO. With no project open, the
   Vault first asks which sponsor; every view is inside one sponsor. Search never spans sponsors."). A read with no
   project to scope it (the library search, the governed-artifacts listing) is refused with CLIENT_REQUIRED when the
   person's projects belong to more than one client, and the refusal names the clients to choose from. The Vault page
   asks which sponsor before it reads anything (vaultSponsors.ts); this file's picker has no project list, so it
   reads the refusal. */

/** A client a read can be asked for: a client workspace, or the projects that have no client. */
export type VaultClient = { id: number | 'none'; name: string };
const NO_CLIENT: VaultClient = { id: 'none', name: 'No client' };

/** The server refused the read until a client is chosen. */
export const clientChoiceRequired = (read: { code?: string }) => read.code === 'CLIENT_REQUIRED';

function refusedClient(raw: unknown): VaultClient | null {
  if (raw === null) return NO_CLIENT;
  const c = (raw ?? {}) as { id?: unknown; name?: unknown };
  return typeof c.id === 'number' && typeof c.name === 'string' && c.name.trim() ? { id: c.id, name: c.name } : null;
}

/**
 * The clients the server named when it refused a read until one is chosen. Null when the read was not refused for
 * that; an empty list when it was and the clients could not be read from the refusal.
 */
export function clientsToChooseFrom(read: { code?: string; meta?: Record<string, unknown> }): VaultClient[] | null {
  if (!clientChoiceRequired(read)) return null;
  const raw = read.meta?.clients;
  if (!Array.isArray(raw)) return [];
  return raw.map(refusedClient).filter((c): c is VaultClient => c !== null);
}

export interface LibraryHit {
  id: string;
  title: string;
  documentType: string | null;
  size: string | null;
  version: string | null;
  current: boolean;
  snippet: string | null;
  program: { id: string; name: string | null };
  /** The project's sponsor (client workspace), or null when it has none (F1, S6 V2). */
  client?: LibrarySponsor | null;
  /** The version's recorded sha256, as vault.documents holds it. */
  contentHash?: string | null;
}

/** A sponsor as the library names it: a CRO's client, one client workspace of the organisation. */
export interface LibrarySponsor { id: number; name: string }

export interface LibraryShape {
  scope: 'verified-accessible-programs'; query: string; total: number; limit: number; results: LibraryHit[];
  /** 'browse' when filters were asked with no text (VR-18). */
  mode?: 'search' | 'browse';
  /** Set by the reader, not the server: whether the find view's filters were sent. */
  filtered?: boolean;
  /** Present when asked from inside a project: the sponsor whose projects were searched, null when it has none. */
  client?: LibrarySponsor | null;
}

const nullableText = (v: unknown): v is string | null => v === null || typeof v === 'string';
const isSponsor = (v: unknown): boolean => v === undefined || v === null ||
  (!!v && typeof v === 'object' && Number.isSafeInteger((v as LibrarySponsor).id) && typeof (v as LibrarySponsor).name === 'string');
function isLibraryHit(v: unknown): v is LibraryHit {
  if (!v || typeof v !== 'object') return false;
  const h = v as LibraryHit;
  return typeof h.id === 'string' && h.id.length > 0 && typeof h.title === 'string' &&
    nullableText(h.version) && typeof h.current === 'boolean' && nullableText(h.snippet) &&
    !!h.program && typeof h.program.id === 'string' && h.program.id.length > 0 && nullableText(h.program.name) &&
    isSponsor(h.client);
}
export const isLibraryShape: ShapeGuard<LibraryShape> = (v): v is LibraryShape => {
  if (!v || typeof v !== 'object') return false;
  const d = v as LibraryShape;
  return d.scope === 'verified-accessible-programs' && typeof d.query === 'string' && Number.isSafeInteger(d.total) && d.total >= 0 &&
    Array.isArray(d.results) && d.results.every(isLibraryHit) && d.total >= d.results.length && isSponsor(d.client);
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
  /** A folder of this project's cabinet. Only a saved project view sets it; the library refuses it. */
  folderId?: string[];
}

/** The filters as query-string parameters ('&k=v…'), '' when none is set. */
export function vaultFilterParams(f: VaultFindFilters): string {
  return (Object.keys(f) as Array<keyof VaultFindFilters>).sort()
    .flatMap((k) => (f[k] ?? []).map((v) => `&${k}=${encodeURIComponent(v)}`))
    .join('');
}

/**
 * A saved view as GET /api/c2c/project-vault/:id/saved-views lists it (D2,
 * P-46; server/services/vault/vault-saved-views.ts). It holds a search, never
 * its results: applying one sets the find view's state and the search runs it
 * under the reader's current access. `applies: false` is a view the search
 * would now refuse, with the refusal; it is never applied in part.
 */
export interface SavedVaultView {
  id: number;
  label: string;
  visibility: 'private' | 'org_public';
  /** null: a library view, run over the projects the reader can access. */
  programId: string | null;
  q: string;
  filters: VaultFindFilters;
  includeSuperseded: boolean;
  createdBy: { userId: number; name: string | null };
  updatedBy: { userId: number; name: string | null } | null;
  mine: boolean;
  canEdit: boolean;
  canRename: boolean;
  canShare: boolean;
  canDelete: boolean;
  applies: boolean;
  refusal?: { error: string; message: string; parameter?: string };
}

export interface SavedViewsShape { programId: string; views: SavedVaultView[] }

const isActor = (v: unknown): v is { userId: number; name: string | null } =>
  !!v && typeof v === 'object' && Number.isSafeInteger((v as { userId: unknown }).userId) && nullableText((v as { name: unknown }).name);
const isFilterSet = (v: unknown): v is VaultFindFilters =>
  !!v && typeof v === 'object' && !Array.isArray(v) &&
  Object.values(v as Record<string, unknown>).every((vals) => Array.isArray(vals) && vals.every((x) => typeof x === 'string'));
const VIEW_FLAGS = ['mine', 'canEdit', 'canRename', 'canShare', 'canDelete', 'applies', 'includeSuperseded'] as const;
const hasViewIdentity = (s: SavedVaultView) =>
  Number.isSafeInteger(s.id) && s.id > 0 && typeof s.label === 'string' && s.label.length > 0 &&
  (s.visibility === 'private' || s.visibility === 'org_public');
const hasViewSearch = (s: SavedVaultView) => nullableText(s.programId) && typeof s.q === 'string' && isFilterSet(s.filters);
const hasViewActors = (s: SavedVaultView) => isActor(s.createdBy) && (s.updatedBy === null || isActor(s.updatedBy));
const hasViewFlags = (s: SavedVaultView) =>
  VIEW_FLAGS.every((k) => typeof s[k] === 'boolean') && (s.applies || typeof s.refusal?.message === 'string');

function isSavedVaultView(v: unknown): v is SavedVaultView {
  if (!v || typeof v !== 'object') return false;
  const s = v as SavedVaultView;
  return hasViewIdentity(s) && hasViewSearch(s) && hasViewActors(s) && hasViewFlags(s);
}

/** A malformed list is a failed read, never an empty one. */
export const isSavedViewsShape: ShapeGuard<SavedViewsShape> = (v): v is SavedViewsShape => {
  if (!v || typeof v !== 'object') return false;
  const d = v as SavedViewsShape;
  return typeof d.programId === 'string' && Array.isArray(d.views) && d.views.every(isSavedVaultView);
};

/** The find view's state as a view holds it. */
export interface SavedViewState { q: string; filters: VaultFindFilters; includeSuperseded: boolean; library: boolean }

/** A stored view's state, as the find view would hold it once applied. */
export const savedViewState = (v: SavedVaultView): SavedViewState =>
  ({ q: v.q, filters: v.filters, includeSuperseded: v.includeSuperseded, library: v.programId === null });

/**
 * One canonical string for a find state, so "this view has changed" is decided
 * one way: the text trimmed, and each dimension's values sorted.
 */
export function savedViewKey(s: SavedViewState): string {
  const filters = (Object.keys(s.filters) as Array<keyof VaultFindFilters>).sort()
    .map((k) => [k, [...(s.filters[k] ?? [])].sort()] as const)
    .filter(([, vals]) => vals.length > 0);
  return JSON.stringify([s.library, s.q.trim(), s.includeSuperseded, filters]);
}

/** How many matched, and how many are shown. */
export function libraryHeadline(d: LibraryShape): string {
  const n = d.total === 1 ? '1 document' : `${d.total} documents`;
  const browse = !d.query;
  const shown = d.total > d.results.length
    ? (browse ? ` Showing the newest ${d.results.length}.` : ` Showing the ${d.results.length} best matches.`) : '';
  const verb = d.total === 1 ? 'matches' : 'match';
  const what = browse ? `${verb} the filters` : d.filtered ? `${verb} “${d.query}” and the filters` : `${verb} “${d.query}”`;
  /* Searched inside one sponsor's projects (F1, S6 V2): the headline says whose, since the list is not every project. */
  const where = d.client ? `${d.client.name} projects you can access` : 'projects you can access';
  return `${n} in ${where} ${what}.${shown}`;
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
    /* From inside a project, the library is that project's sponsor's projects (F1, S6 V2): a CRO's sponsors never mix
       in one list. The server reads the sponsor from the project's own record, never from this request. */
    ? `/api/c2c/project-vault/search?q=${encodeURIComponent(q)}&limit=${LIBRARY_PAGE}${includeEarlier ? '&includeSuperseded=true' : ''}${filterParams}${currentProjectId ? `&sameClientAs=${encodeURIComponent(currentProjectId)}` : ''}`
    : null;
  const raw = useLiveData<LibraryShape>(path, [path], isLibraryShape);
  const st = { ...raw, data: raw.data ? { ...raw.data, filtered: filterParams !== '' } : raw.data };
  if (!path) return null;
  if (st.loading) return <div className="vd-lib" data-testid="vault-library-results"><div className="scaf-note" role="status">Searching projects you can access…</div></div>;
  if (st.error || !st.data) {
    /* A refusal (the plan does not include the Vault, not in this release, the
       person's role) is said as itself through the one read classifier (S6 V1);
       only a failure to answer is an unverified result. */
    const refusal = st.error ? readRefusalOf(st) : null;
    /* Refused until a client is chosen (P-107): the search never spans clients. From inside a project it is that
       project's client's, so this is said only where no project scopes it. */
    const words = clientsToChooseFrom(st) !== null
      ? 'Your projects belong to more than one client, and a search never spans clients. Open a project to search its client’s Vaults.'
      : refusal
        ? describeReadFailure(refusal, 'the library').message
        : 'The library search could not be verified. This is not a result of zero matches.';
    return (
      <div className="vd-lib" data-testid="vault-library-results">
        <div className="vd-dr-err" role="alert">{I.alertTriangle}{' '}{words}</div>
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
            {/* Across sponsors, each row says whose project it is; inside one sponsor, the headline does. */}
            {!d.client && h.client ? ` · ${h.client.name}` : ''}
          </span>
          {h.snippet ? <span className="vd-lib-snip">{h.snippet.replace(/<\/?b>/g, '')}</span> : null}
          <button
            type="button"
            className="btn ghost small"
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
/** One dimension's counts as the search returns them: each value and how many it selects. */
export type VaultFacetBucket = { value: string | null; count: number };
export type VaultFacets = Partial<Record<keyof VaultFindFilters | 'folderId', VaultFacetBucket[]>>;

/** A dimension's counts, or null when the read did not carry well-formed ones (never zeros). */
export function facetCounts(facets: unknown, key: string): Map<string, number> | null {
  const list = facets && typeof facets === 'object' ? (facets as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(list)) return null;
  const counts = new Map<string, number>();
  for (const b of list) {
    if (!b || typeof b !== 'object' || !Number.isSafeInteger((b as VaultFacetBucket).count) || (b as VaultFacetBucket).count < 0) return null;
    const v = (b as VaultFacetBucket).value;
    if (typeof v === 'string') counts.set(v, (b as VaultFacetBucket).count);
  }
  return counts;
}

export interface VaultSearchShape {
  query: string;
  /** Counts per filter value, when asked for (facets=true) on the first page. */
  facets?: VaultFacets;
  includeSuperseded?: boolean;
  total: number;
  limit: number;
  offset: number;
  results: VaultSearchHit[];
  /** Versions in scope whose text is still being read, so no search can find them yet (MR-08 Stage 3). */
  pendingCount?: number;
}

/** What a search says about versions it cannot see yet; null when there are none. */
export function pendingSearchNote(pendingCount: number | undefined): string | null {
  if (!pendingCount || pendingCount < 1) return null;
  return pendingCount === 1
    ? '1 document is still being read and is not searched yet.'
    : `${pendingCount} documents are still being read and are not searched yet.`;
}

export const isVaultSearchShape: ShapeGuard<VaultSearchShape> = (value): value is VaultSearchShape => {
  if (!value || typeof value !== 'object') return false;
  const read = value as Partial<VaultSearchShape>;
  return Array.isArray(read.results) && Number.isSafeInteger(read.total) &&
    typeof read.total === 'number' && read.total >= read.results.length &&
    read.results.every(hit => hit && typeof hit.id === 'string' && typeof hit.title === 'string' &&
      typeof hit.current === 'boolean');
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
/** `client` is the client whose Vaults the library is searched in, once the person's projects needed one chosen. */
type PickerRequest = { query: string; offset: number; attempt: number; pending: boolean; client: VaultClient | null };
type PickerProps = {
  onChoose: (picked: PickedVaultVersion) => void;
  disabled: boolean;
  includeEarlier?: boolean;
  programId?: string;
  label?: string;
  /** Focus the search field when the picker appears (a choice was just removed). */
  autoFocus?: boolean;
};
const pickerOwner = () => `${getJwtOrgId()}:${getAuthToken()}`;

function pickerPaths({ query, offset, client }: PickerRequest, programId: string | undefined, includeEarlier: boolean) {
  const earlier = includeEarlier ? '&includeSuperseded=true' : '';
  const q = encodeURIComponent(query);
  const page = offset ? `&offset=${offset}` : '';
  const within = client ? `&client=${encodeURIComponent(String(client.id))}` : '';
  const libraryPath = query && !programId ? `/api/c2c/project-vault/search?q=${q}&limit=${PICKER_PAGE}${earlier}${page}${within}` : null;
  const programPath = query && programId ? `/api/c2c/project-vault/${encodeURIComponent(programId)}/search?q=${q}&limit=${PICKER_PAGE}${earlier}${page}` : null;
  return { libraryPath, programPath };
}

/** The search a picker runs: one program's when `programId` is set, the library's otherwise. */
function usePickerSearch(request: PickerRequest, programId: string | undefined, includeEarlier: boolean, owner: string) {
  const { attempt } = request;
  const { libraryPath, programPath } = pickerPaths(request, programId, includeEarlier);
  const library = useLiveData<LibraryShape>(libraryPath, [libraryPath, attempt, owner], isLibraryShape);
  const program = useLiveData<VaultSearchShape>(programPath, [programPath, attempt, owner], isVaultSearchShape);
  if (programId) {
    const hits: PickedVaultVersion[] = (program.data?.results ?? []).map((h) => ({
      id: h.id, title: h.title, version: h.version ?? null, current: h.current === true, programId, programName: null, contentHash: pinnedSha256(h.contentHash),
    }));
    return { loading: program.loading, error: program.error, read: program.data !== null, hits, total: program.data?.total ?? 0, clients: null };
  }
  const hits: PickedVaultVersion[] = (library.data?.results ?? []).map((h) => ({
    id: h.id, title: h.title, version: h.version, current: h.current, programId: h.program.id, programName: h.program.name, contentHash: pinnedSha256(h.contentHash),
  }));
  /* Refused until a client is chosen (P-107: a search never spans clients): the clients the server named. */
  return { loading: library.loading, error: library.error, read: library.data !== null, hits, total: library.data?.total ?? 0, clients: clientsToChooseFrom(library) };
}

/** The library search was refused until a client is chosen: the picker asks which, then searches that client's Vaults. */
function PickerClientChoice({ clients, disabled, onChoose }: { clients: readonly VaultClient[]; disabled: boolean; onChoose: (c: VaultClient) => void }) {
  if (clients.length === 0) {
    return <p role="alert">Your projects belong to more than one client, and the clients could not be listed. Open the document’s project and choose it from there.</p>;
  }
  return (
    <div className="vpick-results" role="group" aria-label="Choose a client to search">
      <p role="status">Your projects belong to more than one client, and a search never spans clients. Choose whose Vaults to search.</p>
      {clients.map((c) => (
        <div key={String(c.id)} className="vpick-hit">
          <span><strong>{c.id === 'none' ? 'Projects with no client' : c.name}</strong></span>
          <button type="button" className="btn ghost small" disabled={disabled} onClick={() => onChoose(c)}>Search its Vaults</button>
        </div>
      ))}
    </div>
  );
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
 * matching documents". Offset pages and retries use the same canonical reads.
 * Controls reset when their session or program changes; each request owns its
 * result component so retained hook data cannot appear under a new query/page.
 */
export function VaultVersionPicker(props: PickerProps) {
  const owner = pickerOwner();
  return <VaultPickerControls key={`${owner}:${props.programId ?? ''}:${!!props.includeEarlier}`} {...props} owner={owner} />;
}

function VaultPickerControls({ onChoose, disabled, includeEarlier = false, programId, label = 'Search your accessible Vaults', autoFocus = false, owner }: PickerProps & { owner: string }) {
  const inputId = React.useId();
  const [text, setText] = React.useState('');
  const [request, setRequest] = React.useState<PickerRequest>({ query: '', offset: 0, attempt: 0, pending: false, client: null });
  const search = () => setRequest(previous => ({ ...previous, query: text.trim(), offset: 0, attempt: previous.attempt + 1, pending: true }));
  const within = (client: VaultClient | null) => setRequest(previous => ({ ...previous, client, offset: 0, attempt: previous.attempt + 1, pending: true }));
  const retry = () => setRequest(previous => ({ ...previous, attempt: previous.attempt + 1, pending: true }));
  const move = (offset: number) => setRequest(previous => ({ ...previous, offset, attempt: previous.attempt + 1, pending: true }));
  const settled = React.useCallback((attempt: number) => setRequest(previous => previous.attempt === attempt ? { ...previous, pending: false } : previous), []);
  return (
    <div className="vpick">
      <div className="vpick-bar">
        <label className="vpick-field" htmlFor={inputId}>
          <span>{label}</span>
          <input id={inputId} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} placeholder="Document title or keyword" autoFocus={autoFocus} onKeyDown={e => { if (e.key === 'Enter' && text.trim() && !request.pending && !disabled) { e.preventDefault(); search(); } }} />
        </label>
        <button className="btn ghost small" type="button" disabled={disabled || !text.trim() || request.pending} onClick={search}>
          Search Vault
        </button>
      </div>
      {request.client && !programId ? (
        <p role="status">
          Searching {request.client.id === 'none' ? 'projects with no client' : request.client.name} only.{' '}
          <button type="button" className="btn ghost small" disabled={disabled} onClick={() => within(null)}>Change client</button>
        </p>
      ) : null}
      <PickerRead key={`${request.attempt}:${request.query}:${request.offset}`} {...{ request, programId, includeEarlier, owner, disabled, onChoose, retry, move, settled, within }} />
    </div>
  );
}

function PickerRead({ request, programId, includeEarlier, owner, disabled, onChoose, retry, move, settled, within }: {
  request: PickerRequest; programId?: string; includeEarlier: boolean; owner: string; disabled: boolean;
  onChoose: (hit: PickedVaultVersion) => void; retry: () => void; move: (offset: number) => void; settled: (attempt: number) => void;
  within: (client: VaultClient) => void;
}) {
  const search = usePickerSearch(request, programId, includeEarlier, owner);
  React.useEffect(() => { if (request.query && !search.loading) settled(request.attempt); }, [request.query, request.attempt, search.loading, settled]);
  if (owner !== pickerOwner() || !request.query) return null;
  const where = programId ? "this project's Vault" : 'your accessible projects';
  if (search.loading) return <p role="status">Searching {where}…</p>;
  if (search.clients !== null) return <PickerClientChoice clients={search.clients} disabled={disabled} onChoose={within} />;
  if (search.error || !search.read) return <div><p role="alert">The Vault search could not be read. Try another search or open Vault.</p><button type="button" className="btn ghost small" disabled={disabled} onClick={retry}>Retry Vault search</button></div>;
  const choose = (hit: PickedVaultVersion) => { if (owner === pickerOwner()) onChoose(hit); };
  return <PickerResults {...{ search, request, disabled, programId, includeEarlier, where, move }} onChoose={choose} />;
}

function pickerPageHeadline(total: number, shown: number, offset: number): string {
  if (!shown) return `Showing 0 of ${total} matches.`;
  if (!offset && total > shown) return `Showing ${shown} of ${total} matches. Refine the search to find one not listed.`;
  return `Showing ${offset + 1}–${offset + shown} of ${total} matches.`;
}

function PickerResults({ search, request, disabled, programId, includeEarlier, where, move, onChoose }: {
  search: ReturnType<typeof usePickerSearch>; request: PickerRequest; disabled: boolean; programId?: string;
  includeEarlier: boolean; where: string; move: (offset: number) => void; onChoose: (hit: PickedVaultVersion) => void;
}) {
  return <>
    <div className="vpick-results">
      {search.hits.length === 0 && <p>No matching documents in {where}.</p>}
      {search.total > 0 && <p role="status">{pickerPageHeadline(search.total, search.hits.length, request.offset)}</p>}
      {search.hits.map(hit => <PickerHit key={hit.id} hit={hit} inProgram={!!programId} selectable={!disabled && (hit.current || includeEarlier)} onChoose={onChoose} />)}
    </div>
    <div className="vpick-pages" role="group" aria-label="Vault search pages"><button type="button" className="btn ghost small" disabled={disabled || request.offset === 0} onClick={() => move(Math.max(0, request.offset - PICKER_PAGE))}>Previous Vault results</button><button type="button" className="btn ghost small" disabled={disabled || request.offset + PICKER_PAGE >= search.total} onClick={() => move(request.offset + PICKER_PAGE)}>Next Vault results</button></div>
  </>;
}
