/**
 * The eCTD reference inside eCTD Compile: the spec versions the product is
 * qualified against and the controlled vocabularies, read-only.
 *
 * Moved here from the `ectd-publishing` screen (PublishingCenter.tsx) by the
 * D2 fold of 2026-10-29 (.design/client-journey/FUNCTION_PARITY.md, "Into eCTD
 * compile / From ectd-publishing"). The reads, their shape guards, the labels
 * and the action handlers are that screen's, moved rather than copied; the
 * changes are listed in docs/evidence/D2-ONE-ANA/2026-10-29/fold-ectd-publishing/.
 *
 * Wired to server/routes/ectd-v4.ts (mounted /api/ectd), three GETs, nothing
 * else: the spec-version register (qualification/qualify.ts SPEC_VERSIONS),
 * the vocabulary listing (v3.2.2 coded attributes + v4.0 genericode lists, with
 * the FDA Regional IG OID), and one v4.0 list's codes. Nothing here assembles,
 * validates, transmits or freezes a sequence, and nothing here changes what the
 * compile assembles.
 *
 * Every panel renders live server data, an honest empty, or a failed read with
 * Try again — never a fixture, and never an empty list over a failed read.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import { EmptyState, hasKeys, isRowsWith, type ShapeGuard } from '../dataConnect';
import type { SurfaceActionHandler } from '../surfaceActions';
import { QualifiedSpecVersions } from './EctdCompileDtdEvidence';
import { apiRequest } from '@/lib/queryClient';

export type EctdVersion = 'v3.2.2' | 'v4.0';

/**
 * The version this compile assembles. No sequence records an eCTD version of
 * its own (the status route's `sequence` carries number, region, type and leaf
 * count), and the packager writes exactly one:
 * `<!DOCTYPE ectd:ectd SYSTEM "util/dtd/ich-ectd-3-2.dtd">`
 * (server/services/submission-gateways/regional-packager.ts), the ICH v3.2.2
 * backbone server/routes/ectd-compile.ts names in its header. The panel opens
 * here; v4.0 is listed for reference.
 */
export const COMPILED_ECTD_VERSION: EctdVersion = 'v3.2.2';

type ReadState = 'idle' | 'loading' | 'ready' | 'error';
/** 'idle' is the pre-effect first frame: the same unsettled read as 'loading'. */
const settled = (s: ReadState): 'loading' | 'ready' | 'error' => (s === 'idle' ? 'loading' : s);

interface CvListSummary { id: string; shortName?: string; oid?: string; codeCount: number; }
interface CvListingResponse {
  regionalIgOid: string;
  v4: CvListSummary[];
  v3: Array<{ id: string; codeCount: number }>;
}
interface CvCodeRow { code: string; description: string; }
interface CvList { id: string; shortName: string; oid: string; codes: CvCodeRow[]; }
type SpecVersions = Record<EctdVersion, Record<string, string> | null>;

/**
 * A 200 is not the same thing as being a `T`: every wrong-but-plausible body a
 * proxy or a version skew can produce — `{ data: [] }`, `{}`, a bare array, a
 * JSON scalar — is truthy, and on the retired screen `list.codes` then read as
 * `undefined` and the render threw. So the shape is checked here, once, for all
 * three reads; a body that is not the declared shape comes back `ok: false`,
 * which every panel routes to its failed-read state.
 */
async function readShaped<T>(path: string, isShape: ShapeGuard<T>): Promise<{ ok: boolean; body: T | null }> {
  try {
    const res = await apiRequest('GET', path);
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok || !isShape(body)) return { ok: false, body: null };
    return { ok: true, body };
  } catch {
    return { ok: false, body: null };
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * `/qualification/spec-versions` answers a map keyed by eCTD version. Both keys
 * are required because the selector offers exactly those two. A version
 * present-but-null is a real "nothing qualified yet" and renders as the empty
 * state, not as an error.
 */
const isSpecVersions: ShapeGuard<SpecVersions> = (v): v is SpecVersions =>
  isRecord(v) && (['v3.2.2', 'v4.0'] as const).every((k) => k in v && (v[k] == null || isRecord(v[k])));

/** `/controlled-vocab` answers `{ regionalIgOid, v4: [...], v3: [...] }`; both members are walked as arrays. */
const isCvListing: ShapeGuard<CvListingResponse> = (v): v is CvListingResponse =>
  hasKeys<CvListingResponse>('v4', 'v3')(v) && isRowsWith('id', 'codeCount')(v.v4) && isRowsWith('id', 'codeCount')(v.v3);

/** `/controlled-vocab/:listId` answers one genericode list; `codes` is what the table walks. */
const isCvList: ShapeGuard<CvList> = (v): v is CvList =>
  hasKeys<CvList>('codes')(v) && isRowsWith<CvCodeRow>('code', 'description')(v.codes);

/** A camelCase key as a sentence-case label: "applicationType" → "Application type". */
const sentenceLabel = (id: unknown) => {
  const s = String(id ?? '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Names for the keys of SPEC_VERSIONS (server/services/ectd/qualification/qualify.ts). */
const SPEC_LABELS: Record<string, string> = {
  ichBackbone: 'ICH backbone',
  fdaRegionalDtd: 'FDA regional DTD',
  validationCriteria: 'Validation criteria',
  fileFormats: 'File formats',
  transmission: 'Transmission',
  message: 'Message',
  fdaRegionalIg: 'FDA regional IG',
  controlledVocab: 'Controlled vocabulary',
};

/** Friendly label for a v4.0 code-list id. */
const V4_LABELS: Record<string, string> = {
  applicationType: 'Application type',
  submissionType: 'Submission type',
  submissionUnitType: 'Submission unit type',
  contextOfUse: 'Context of use (CTD sections)',
  formType: 'Form type',
  couKeywordDefinitionType: 'Keyword definition type',
  promotionalDocumentType: 'Promotional document type',
  promotionalMaterialAudienceType: 'Promotional material audience',
  promotionalMaterialType: 'Promotional material type',
  submissionContactType: 'Submission contact type',
  submissionContactStatus: 'Submission contact status',
  submissionUnitStatus: 'Submission unit status',
  telecomUse: 'Telecom use',
  telecomCapabilities: 'Telecom capabilities',
};

/** The list the browser opens at when the listing has it: the CTD sections, which a compile places leaves under. */
const DEFAULT_V4_LIST = 'contextOfUse';

/** Only strings can be lowercased; a row with a null code must not kill the filter. */
const lower = (s: unknown) => (typeof s === 'string' ? s.toLowerCase() : '');

export interface EctdReference {
  version: EctdVersion;
  setVersion: (v: EctdVersion) => void;
  /** The version this surface assembles, when it assembles one; the panel says which is which. */
  compiledVersion: EctdVersion | null;
  /** The spec register and the vocabulary listing: one read, one state, one Try again. */
  loadState: ReadState;
  retry: () => void;
  listing: CvListingResponse | null;
  /** The selected version's specifications, labelled, in the register's order. */
  specRows: Array<[string, string]>;
  selectedList: string | null;
  setSelectedList: (id: string) => void;
  list: CvList | null;
  listState: ReadState;
  retryList: () => void;
  filter: string;
  setFilter: (q: string) => void;
  filteredCodes: CvCodeRow[];
}

export function useEctdReference(defaultVersion: EctdVersion, compiledVersion: EctdVersion | null): EctdReference {
  const [version, setVersion] = useState<EctdVersion>(defaultVersion);
  const [specs, setSpecs] = useState<SpecVersions | null>(null);
  const [listing, setListing] = useState<CvListingResponse | null>(null);
  const [loadState, setLoadState] = useState<ReadState>('idle');
  const [reloadKey, setReloadKey] = useState(0);
  const [chosenList, setSelectedList] = useState<string | null>(null);
  const [list, setList] = useState<CvList | null>(null);
  const [listState, setListState] = useState<ReadState>('idle');
  const [filter, setFilter] = useState('');
  const mounted = useRef(true);
  const listRevision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoadState('loading');
      const [s, l] = await Promise.all([
        readShaped('/api/ectd/qualification/spec-versions', isSpecVersions),
        readShaped('/api/ectd/controlled-vocab', isCvListing),
      ]);
      if (!live) return;
      if (!s.ok || !l.ok || !s.body || !l.body) { setLoadState('error'); return; }
      setSpecs(s.body); setListing(l.body); setLoadState('ready');
    })();
    return () => { live = false; };
  }, [reloadKey]);

  /* The list on screen is one the listing supplied, or none. The retired screen
     read a default id ('contextOfUse') before the listing had answered — and
     after it had failed — so the server's own rule ("the client only ever
     sends an id the server itself supplied", ectd-v4.ts) did not hold. */
  const v4Ids = useMemo(() => (listing?.v4 ?? []).map((l) => l.id), [listing]);
  const selectedList = chosenList && v4Ids.includes(chosenList)
    ? chosenList
    : v4Ids.includes(DEFAULT_V4_LIST) ? DEFAULT_V4_LIST : (v4Ids[0] ?? null);

  const loadList = useCallback(async (listId: string) => {
    const request = ++listRevision.current;
    setListState('loading'); setList(null);
    const { ok, body } = await readShaped(`/api/ectd/controlled-vocab/${encodeURIComponent(listId)}`, isCvList);
    // A later pick supersedes this read: an older answer never paints the newer list's name.
    if (!mounted.current || listRevision.current !== request) return;
    if (!ok || !body) { setListState('error'); return; }
    setList(body); setListState('ready');
  }, []);

  useEffect(() => {
    // v4.0 browses genericode lists; v3.2.2 lists have no per-list codes endpoint.
    if (version === 'v4.0' && loadState === 'ready' && selectedList) void loadList(selectedList);
  }, [version, loadState, selectedList, loadList]);

  const specRows = useMemo<Array<[string, string]>>(
    () => Object.entries(specs?.[version] ?? {}).map(([k, v]) => [SPEC_LABELS[k] ?? sentenceLabel(k), String(v)]),
    [specs, version],
  );
  const filteredCodes = useMemo(() => {
    if (!list || !Array.isArray(list.codes)) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return list.codes;
    return list.codes.filter((c) => lower(c.code).includes(q) || lower(c.description).includes(q));
  }, [list, filter]);

  const retry = useCallback(() => setReloadKey((n) => n + 1), []);
  const retryList = useCallback(() => { if (selectedList) void loadList(selectedList); }, [selectedList, loadList]);

  // One object per change of state, so a context memo that depends on it recomputes only then.
  return useMemo(() => ({
    version, setVersion, compiledVersion, loadState, retry, listing, specRows,
    selectedList, setSelectedList, list, listState, retryList, filter, setFilter, filteredCodes,
  }), [version, compiledVersion, loadState, retry, listing, specRows, selectedList, list, listState, retryList, filter, filteredCodes]);
}

const READ_ONLY = 'Spec versions and controlled vocabularies, for reference; the panel changes nothing the compile assembles.';

/** One sentence for the surface's summary. */
export function ectdReferenceSummary(ref: EctdReference): string {
  const state = settled(ref.loadState);
  if (state === 'error') {
    return 'The eCTD reference (spec versions and controlled vocabularies) did not load or answered in an unreadable shape — a failed read, not an empty register.';
  }
  if (state === 'loading') return 'The eCTD reference is still loading.';
  const which = ref.compiledVersion == null
    ? ref.version
    : ref.version === ref.compiledVersion
      ? `${ref.version}, the version this compile assembles`
      : `${ref.version} for reference only (this compile assembles ${ref.compiledVersion})`;
  return `The eCTD reference shows ${which}: ${ref.specRows.length} qualified specification(s).`;
}

/**
 * What AnA is told about the panel. Every count is published only from a read
 * that answered: a count while loading or after a failure would be a guessed 0.
 */
export function ectdReferenceFacts(ref: EctdReference): Record<string, unknown> {
  const readState = settled(ref.loadState);
  const codeListState = settled(ref.listState);
  const v4 = ref.version === 'v4.0';
  return {
    readOnly: READ_ONLY,
    ...(ref.compiledVersion ? { compiledVersion: ref.compiledVersion } : {}),
    version: ref.version,
    readState,
    ...(readState === 'ready'
      ? {
          specVersions: Object.fromEntries(ref.specRows),
          ...(v4
            ? {
                ...(ref.listing?.regionalIgOid ? { regionalIgOid: ref.listing.regionalIgOid } : {}),
                v4ListCount: ref.listing?.v4.length ?? 0,
                ...(ref.selectedList
                  ? {
                      selectedList: ref.selectedList,
                      codeListState,
                      ...(ref.filter.trim() ? { filter: ref.filter.trim() } : {}),
                      ...(codeListState === 'ready' ? { filteredCodeCount: ref.filteredCodes.length } : {}),
                    }
                  : {}),
              }
            : { codedAttributeListCount: ref.listing?.v3.length ?? 0 }),
        }
      : {}),
  };
}

/**
 * The three view-only operations, by the action ids the caller is registered
 * under. Each drives the same state its control drives; none reads anything
 * but a code list the listing supplied.
 */
export function ectdReferenceActionHandlers(
  ref: EctdReference,
  ids: { setVersion: string; openList: string; filterCodes: string },
): Record<string, SurfaceActionHandler> {
  return {
    [ids.setVersion]: (params) => {
      const target: EctdVersion = params.version === 'v3.2.2' ? 'v3.2.2' : 'v4.0';
      const note = ref.compiledVersion && target !== ref.compiledVersion
        ? ` — reference only; this compile assembles ${ref.compiledVersion}`
        : '';
      if (ref.version === target) return { ok: true, detail: `Already showing ${target}${note}` };
      ref.setVersion(target);
      return { ok: true, detail: `Showing the ${target} register${note}` };
    },
    [ids.openList]: (params) => {
      const raw = String(params.list ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a vocabulary list to open.' };
      if (ref.version !== 'v4.0') {
        return {
          ok: false,
          reason: 'v3.2.2 has no per-list code browser — switch to v4.0 first, where the controlled vocabularies are listed.',
        };
      }
      const state = settled(ref.loadState);
      if (state === 'loading') return { ok: false, reason: 'The vocabulary listing is still loading.', retry: true };
      if (state === 'error' || !ref.listing) {
        return { ok: false, reason: 'The vocabulary listing could not be read, so no code lists are available to open.' };
      }
      const ids = ref.listing.v4.map((l) => l.id);
      const needle = raw.toLowerCase();
      const exact = ids.filter((id) => id.toLowerCase() === needle);
      const hits = exact.length ? exact : ids.filter((id) => id.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No controlled-vocabulary list named "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} lists — name one exactly.` };
      ref.setSelectedList(hits[0]);
      return { ok: true, detail: `Opened the ${hits[0]} code list` };
    },
    [ids.filterCodes]: (params) => {
      const next = String(params.query ?? '');
      if (ref.filter === next) return { ok: true, detail: next ? `Already filtered by "${next}"` : 'Filter already cleared' };
      ref.setFilter(next);
      return { ok: true, detail: next.trim() ? `Filtered the code list by "${next.trim()}"` : 'Cleared the code filter' };
    },
  };
}

/** Both cards, in order: the specifications, then the panel that chooses the version they are for. */
export function EctdReferenceCards({ reference: ref }: { reference: EctdReference }) {
  return (
    <>
      <QualifiedSpecVersions state={ref.loadState} version={ref.version} compiledVersion={ref.compiledVersion}
        rows={ref.specRows} onRetry={ref.retry} />
      <EctdReferencePanel reference={ref} />
    </>
  );
}

/** The version choice, the Regional IG OID, and the controlled vocabularies. */
export function EctdReferencePanel({ reference: ref }: { reference: EctdReference }) {
  const state = settled(ref.loadState);
  return (
    <section className="pj-card" aria-label="eCTD reference">
      <div className="pj-card-h">
        <span className="t">eCTD reference</span>
        <span className="s">Read-only. Nothing in this panel changes what the compile assembles.</span>
      </div>
      <div className="pj-card-b" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--text-400)' }} htmlFor="ectd-reference-version">eCTD version</label>
        <select id="ectd-reference-version" className="c2c-input" style={{ height: 30 }}
          value={ref.version} onChange={(e) => ref.setVersion(e.target.value as EctdVersion)}>
          <option value="v3.2.2">eCTD v3.2.2</option>
          <option value="v4.0">eCTD v4.0 · HL7 RPS</option>
        </select>
        {ref.compiledVersion && (
          <span style={{ fontSize: 12.5, color: 'var(--text-400)' }}>
            {ref.version === ref.compiledVersion
              ? 'The version this compile assembles (ICH index.xml).'
              : `Reference only. This compile assembles eCTD ${ref.compiledVersion}, not ${ref.version}.`}
          </span>
        )}
        {/* An identifier echoed from the listing; nothing here validated against it. */}
        {ref.version === 'v4.0' && ref.listing?.regionalIgOid && (
          <span className="rd-chip tone-idle mono" title="FDA eCTD v4.0 Regional Implementation Guide OID, as listed by the vocabulary service">
            Regional IG OID {ref.listing.regionalIgOid}
          </span>
        )}
      </div>
      <div className="pj-card-b" style={{ paddingTop: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8, display: 'flex', gap: 8 }}>
          Controlled vocabulary
          {ref.version === 'v4.0' && ref.list && (
            <span className="mono" style={{ fontWeight: 400, color: 'var(--text-400)' }}>{ref.list.oid !== 'na' ? ref.list.oid : 'no OID'}</span>
          )}
        </div>
        {state === 'loading' ? (
          <EmptyState icon={I.book} title={`Loading the ${ref.version} vocabulary…`} busy />
        ) : state === 'error' ? (
          <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load the controlled vocabulary"
            hint="The controlled-vocabulary service didn’t respond, or answered in a shape this panel can’t read. This is a failed read, not an empty vocabulary."
            retry={ref.retry} />
        ) : ref.version === 'v3.2.2' ? (
          <V3Vocabulary listing={ref.listing} />
        ) : (
          <V4Vocabulary reference={ref} />
        )}
      </div>
    </section>
  );
}

function V3Vocabulary({ listing }: { listing: CvListingResponse | null }) {
  if (!listing?.v3.length) {
    return <EmptyState icon={I.book} title="No v3.2.2 coded-attribute lists were returned" hint="The controlled-vocabulary service answered with no v3.2.2 lists. This is what the service returned, not a failed read." />;
  }
  return (
    <>
      <p style={{ fontSize: 12.5, color: 'var(--text-400)', marginTop: 0 }}>
        eCTD v3.2.2 carries its US-regional controlled values as coded attributes
        (<span className="mono">fdaat</span>/<span className="mono">fdast</span>/<span className="mono">fdasst</span>/<span className="mono">fdaft</span>) in <span className="mono">us-regional.xml</span>.
      </p>
      <table className="reg-tbl"><thead><tr><th>Coded-attribute list</th><th style={{ textAlign: 'right' }}>Codes</th></tr></thead>
        <tbody>{listing.v3.map((l) => (
          <tr key={l.id}><td style={{ fontWeight: 600 }}>{sentenceLabel(l.id)}</td><td style={{ textAlign: 'right' }}>{l.codeCount}</td></tr>
        ))}</tbody></table>
    </>
  );
}

function V4Vocabulary({ reference: ref }: { reference: EctdReference }) {
  const lists = ref.listing?.v4 ?? [];
  if (lists.length === 0 || !ref.selectedList) {
    return <EmptyState icon={I.book} title="No v4.0 code lists were returned" hint="The controlled-vocabulary service answered with no v4.0 lists. This is what the service returned, not a failed read." />;
  }
  const listState = settled(ref.listState);
  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <label style={{ fontSize: 12, color: 'var(--text-400)' }} htmlFor="ectd-reference-list">Controlled vocabulary list</label>
        <select id="ectd-reference-list" className="c2c-input" style={{ height: 30, minWidth: 260 }}
          value={ref.selectedList} onChange={(e) => ref.setSelectedList(e.target.value)}>
          {lists.map((l) => <option key={l.id} value={l.id}>{V4_LABELS[l.id] ?? l.id} ({l.codeCount})</option>)}
        </select>
        <input aria-label="Filter codes" className="c2c-input" style={{ height: 30, marginLeft: 'auto', minWidth: 200 }}
          placeholder="Filter codes…" value={ref.filter} onChange={(e) => ref.setFilter(e.target.value)} />
      </div>
      {listState === 'loading' ? (
        <EmptyState icon={I.book} title="Loading codes…" busy />
      ) : listState === 'error' ? (
        <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load this code list"
          hint="The controlled-vocabulary service didn’t respond, or answered in a shape this panel can’t read. This is a failed read, not an empty list."
          retry={ref.retryList} />
      ) : ref.filteredCodes.length === 0 ? (
        <EmptyState icon={I.book} title={ref.filter.trim() ? 'No codes match your filter' : 'No codes'}
          hint={ref.filter.trim() ? undefined : 'The controlled-vocabulary service answered this list with no codes.'} />
      ) : (
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          <table className="reg-tbl"><thead><tr><th style={{ width: 220 }}>Code</th><th>Description</th></tr></thead>
            <tbody>{ref.filteredCodes.map((c) => (
              <tr key={c.code}><td className="mono">{c.code}</td><td>{c.description}</td></tr>
            ))}</tbody></table>
        </div>
      )}
    </>
  );
}
