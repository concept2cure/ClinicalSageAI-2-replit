/**
 * Publishing Center — the version-aware eCTD publishing surface.
 *
 * Registry id: `ectd-publishing`.
 *
 * Wired to the eCTD publishing engine (server/routes/ectd-v4.ts, mounted
 * /api/ectd), read/validate only — nothing here transmits or freezes:
 *   • GET /api/ectd/qualification/spec-versions   — the EXACT ICH/FDA spec
 *                                                   versions each package is
 *                                                   qualified against
 *   • GET /api/ectd/controlled-vocab              — every controlled-vocabulary
 *                                                   list (v3.2.2 coded attrs +
 *                                                   v4.0 genericode) with OIDs
 *   • GET /api/ectd/controlled-vocab/:listId      — a v4.0 list's codes
 *
 * The user picks the eCTD version (v3.2.2 or v4.0/HL7 RPS); the panels adapt —
 * v4.0 shows the FDA Regional IG OID and the genericode code systems, v3.2.2
 * shows the us-regional coded-attribute vocabularies. Every panel renders live
 * server data, an honest empty, or an honest error — never a fixture.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState, hasKeys, isRowsWith, type ShapeGuard } from '../dataConnect';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers, notifySurfaceActionReady } from '../surfaceActions';
import { apiRequest } from '@/lib/queryClient';
import '../styles/project-home-v2.css';

type EctdVersion = 'v3.2.2' | 'v4.0';

interface CvListSummary { id: string; shortName?: string; oid?: string; codeCount: number; }
interface CvListingResponse {
  regionalIgOid: string;
  v4: CvListSummary[];
  v3: Array<{ id: string; codeCount: number }>;
}
interface CvCodeRow { code: string; description: string; }
interface CvList { id: string; shortName: string; oid: string; codes: CvCodeRow[]; }
type SpecVersions = Record<EctdVersion, Record<string, string>>;

/**
 * A 200 used to be cast straight to `T` and handed to the panels. It is not the
 * same thing as being a `T`: every wrong-but-plausible body a proxy or a version
 * skew can produce — `{ data: [] }`, `{}`, a bare array, a JSON scalar — is
 * TRUTHY, so it sailed past the `!body` checks below, then `list.codes` read as
 * `undefined` and `filteredCodes.length` threw during render. The whole surface
 * went to "didn't finish loading" for what was really "the server answered with
 * something we don't understand".
 *
 * So the shape is checked HERE, once, for all three fetches. A body that isn't
 * the declared shape comes back `ok: false`, which is the branch each panel
 * already routes into its error panel.
 */
async function readJson<T>(
  path: string,
  isShape: ShapeGuard<T>,
): Promise<{ ok: boolean; status: number; body: T | null }> {
  try {
    const res = await apiRequest('GET', path);
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) return { ok: false, status: res.status, body: null };
    if (!isShape(body)) return { ok: false, status: res.status, body: null };
    return { ok: true, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * `/qualification/spec-versions` answers a map keyed by eCTD version. Both keys
 * are required because the selector offers exactly those two versions — a body
 * carrying neither cannot serve this panel, whatever else it holds. A version
 * present-but-null is left alone: that is a real "nothing qualified yet" and
 * renders as the empty state, not as an error.
 */
const isSpecVersions: ShapeGuard<SpecVersions> = (v): v is SpecVersions => {
  if (!isRecord(v)) return false;
  const rec = v;
  return (['v3.2.2', 'v4.0'] as const).every((k) => k in rec && (rec[k] == null || isRecord(rec[k])));
};

/**
 * `/controlled-vocab` answers `{ regionalIgOid, v4: [...], v3: [...] }`. Both
 * members are dereferenced as arrays (`.length`, `.map`), and `?.` on the
 * container never covered that — `listing?.v4` is fine and `listing.v4.map` is
 * not, when `v4` came back as an object or absent entirely.
 */
const isCvListing: ShapeGuard<CvListingResponse> = (v): v is CvListingResponse =>
  hasKeys<CvListingResponse>('v4', 'v3')(v) &&
  isRowsWith('id', 'codeCount')(v.v4) &&
  isRowsWith('id', 'codeCount')(v.v3);

/** `/controlled-vocab/:listId` answers one genericode list; `codes` is what the table walks. */
const isCvList: ShapeGuard<CvList> = (v): v is CvList =>
  hasKeys<CvList>('codes')(v) && isRowsWith<CvCodeRow>('code', 'description')(v.codes);

/** Code-list ids arrive camelCase. A row that lost its id renders blank instead of throwing. */
const humanize = (id: unknown) => String(id ?? '').replace(/([A-Z])/g, ' $1');

/** Only strings can be lowercased; a row with a null code must not kill the filter. */
const lower = (s: unknown) => (typeof s === 'string' ? s.toLowerCase() : '');

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

export function PublishingCenter(_props: SurfaceViewProps) {
  const [version, setVersion] = useState<EctdVersion>('v4.0');

  const [specs, setSpecs] = useState<SpecVersions | null>(null);
  const [listing, setListing] = useState<CvListingResponse | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [selectedList, setSelectedList] = useState<string>('contextOfUse');
  const [list, setList] = useState<CvList | null>(null);
  const [listState, setListState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [filter, setFilter] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoadState('loading');
      const [s, l] = await Promise.all([
        readJson('/api/ectd/qualification/spec-versions', isSpecVersions),
        readJson('/api/ectd/controlled-vocab', isCvListing),
      ]);
      if (!live) return;
      if (!s.ok || !l.ok || !s.body || !l.body) { setLoadState('error'); return; }
      setSpecs(s.body); setListing(l.body); setLoadState('ready');
      /* The default list id may not exist in this server's v4 listing; a
         controlled <select> with no matching option shows its first entry while
         the table below renders the default's codes — two different lists. */
      const v4 = l.body.v4;
      setSelectedList((cur) => (v4.some((x) => x.id === cur) ? cur : (v4[0]?.id ?? cur)));
    })();
    return () => { live = false; };
  }, [reloadKey]);

  const loadList = useCallback(async (listId: string) => {
    setListState('loading'); setList(null);
    const { ok, body } = await readJson(`/api/ectd/controlled-vocab/${encodeURIComponent(listId)}`, isCvList);
    if (!ok || !body) { setListState('error'); return; }
    setList(body); setListState('ready');
  }, []);

  useEffect(() => {
    // v4.0 browses genericode lists; v3.2.2 lists have no per-list codes endpoint here.
    if (version === 'v4.0') void loadList(selectedList);
  }, [version, selectedList, loadList]);

  const specRows = specs ? Object.entries(specs[version] ?? {}) : [];
  const filteredCodes = useMemo(() => {
    // `list` is only ever a guarded CvList now, so `codes` is an array — but the
    // memo returned `list.codes` unchecked, and that undefined was what reached
    // `filteredCodes.length` in the render below and unwound the whole surface.
    if (!list || !Array.isArray(list.codes)) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return list.codes;
    return list.codes.filter((c) => lower(c.code).includes(q) || lower(c.description).includes(q));
  }, [list, filter]);

  /* WHAT ANA SEES HERE. The NAME is the trap: "Publishing Center" reads as the
     place that transmits, and it is not — three GETs, no writes. Every branch
     says so, because "can I publish from here?" is the question this context
     will be asked to answer. */
  const anaContext = useMemo(() => {
    const readOnly =
      'eCTD publishing reference — spec versions and controlled vocabularies, read-only; nothing on this screen publishes, transmits, or freezes a sequence.';
    // True in every state — a fact about the surface, not about the fetch.
    const disclaimer =
      'Sequence assembly, validation runs and transmission live on their own surfaces (compile, submission center, gateway) — nothing here performs them.';
    // readJson collapses "no response" and "wrong shape" into one branch; the
    // summary must not claim to know which.
    if (loadState === 'error') {
      return {
        summary: `${readOnly} The spec-version register and vocabulary listing did not load or answered in an unreadable shape — nothing is shown, which is a failed read, not an empty register.`,
        facts: { disclaimer },
      };
    }
    if (loadState !== 'ready') {
      // 'idle' is the pre-effect first render — the same unsettled read as 'loading'.
      return { summary: `${readOnly} Spec versions and vocabularies are still loading.`, facts: { disclaimer } };
    }
    if (specRows.length === 0) {
      return {
        summary: `${readOnly} No spec versions are recorded for ${version}.`,
        facts: { version, disclaimer },
      };
    }
    // v3.2.2 has no per-list codes endpoint — the code browser is v4.0-only, so
    // its facts are published only when that pane is actually on screen.
    const codeListState = listState === 'ready' ? 'ready' : listState === 'error' ? 'error' : 'loading';
    return {
      summary:
        `${readOnly} Showing ${version}: ${specRows.length} qualified specification(s).` +
        (version === 'v3.2.2'
          ? ' The per-list code browser applies to v4.0 lists only; v3.2.2 coded-attribute lists are shown with counts.'
          : codeListState === 'loading'
            ? ` The "${selectedList}" code list is still loading.`
            : codeListState === 'error'
              ? ` The "${selectedList}" code list did not load or was unreadable.`
              : ` Browsing "${selectedList}": ${filteredCodes.length} code(s)${filter.trim() ? ` matching "${filter.trim()}"` : ''}.`),
      facts: {
        version,
        ...(version === 'v4.0' && listing?.regionalIgOid ? { regionalIgOid: listing.regionalIgOid } : {}),
        specRowCount: specRows.length,
        ...(version === 'v4.0'
          ? {
              selectedList,
              codeListState,
              ...(filter.trim() ? { filter: filter.trim() } : {}),
              // A count while loading/errored would be a guessed 0 — absent beats guessed.
              ...(codeListState === 'ready' ? { filteredCodeCount: filteredCodes.length } : {}),
            }
          : {}),
        disclaimer,
      },
      availableActions: ['Switch eCTD version, pick a vocabulary list, filter its codes — all view-only'],
    };
  }, [loadState, listState, version, specs, listing, selectedList, filter, filteredCodes]);
  /* This surface publishes nothing and transmits nothing — it is the spec and
     vocabulary reference. All three actions move the view only. */
  useSurfaceActionHandlers('ectd-publishing', {
    'ectd-publishing.set-version': (params) => {
      const target = params.version === 'v3.2.2' ? 'v3.2.2' : 'v4.0';
      if (version === target) return { ok: true, detail: `Already showing ${target}` };
      setVersion(target as EctdVersion);
      return { ok: true, detail: `Showing the ${target} register` };
    },
    'ectd-publishing.open-list': (params) => {
      const raw = String(params.list ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a vocabulary list to open.' };
      if (version !== 'v4.0') {
        return {
          ok: false,
          reason: 'v3.2.2 has no per-list code browser — switch to v4.0 first, where the controlled vocabularies are listed.',
        };
      }
      if (listState === 'loading' || listState === 'idle') {
        return { ok: false, reason: 'The vocabulary listing is still loading.', retry: true };
      }
      if (listState === 'error' || !listing) {
        return { ok: false, reason: 'The vocabulary listing could not be read, so no code lists are available to open.' };
      }
      const ids = (listing.v4 ?? []).map((l) => l.id);
      const needle = raw.toLowerCase();
      const exact = ids.filter((id) => id.toLowerCase() === needle);
      const hits = exact.length ? exact : ids.filter((id) => id.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No controlled-vocabulary list named "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} lists — name one exactly.` };
      setSelectedList(hits[0]);
      return { ok: true, detail: `Opened the ${hits[0]} code list` };
    },
    'ectd-publishing.filter-codes': (params) => {
      const next = String(params.query ?? '');
      if (filter === next) return { ok: true, detail: next ? `Already filtered by "${next}"` : 'Filter already cleared' };
      setFilter(next);
      return {
        ok: true,
        detail: next.trim() ? `Filtered the code list by "${next.trim()}"` : 'Cleared the code filter',
      };
    },
  });
  useEffect(() => {
    if (listState === 'ready' || listState === 'error') notifySurfaceActionReady('ectd-publishing');
  }, [listState]);

  usePublishSurfaceContext('ectd-publishing', anaContext);

  return (
    <div className="cm-body">
      {/* ── Header: version selector ── */}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Publishing Center</span>
          {/* The NAME is the trap; this sentence existed only in the assistant
              context, never on screen. */}
          <span className="s">eCTD backbone, controlled vocabulary &amp; qualification — read-only reference. Nothing here publishes, transmits, validates or freezes a sequence.</span>
        </div>
        <div className="pj-card-b" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>eCTD version</label>
          <select className="c2c-input" style={{ height: 30 }} value={version} onChange={(e) => setVersion(e.target.value as EctdVersion)}>
            <option value="v4.0">eCTD v4.0 · HL7 RPS</option>
            <option value="v3.2.2">eCTD v3.2.2</option>
          </select>
          {/* Was tone-ok + shieldCheck: read as "validated against the IG".
              It is an identifier echoed from the listing; nothing here validated. */}
          {version === 'v4.0' && listing?.regionalIgOid && (
            <span className="rd-chip tone-idle mono" title="FDA eCTD v4.0 Regional Implementation Guide OID, as listed by the vocabulary service">
              Regional IG OID {listing.regionalIgOid}
            </span>
          )}
        </div>
      </div>

      {/* ── Qualified against (spec versions) ── */}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Qualified against</span>
          <span className="s">{version}</span>
        </div>
        <div className="pj-card-b" style={{ padding: 0 }}>
          {loadState === 'loading' || loadState === 'idle' ? (
            /* 'idle' is the pre-effect first render — the same unsettled read as
               'loading'. It used to fall through to "No spec versions". */
            <div style={{ padding: 16 }}><EmptyState icon={I.book} title="Loading spec versions…" busy /></div>
          ) : loadState === 'error' ? (
            <div style={{ padding: 16 }}><EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load spec versions" hint="The specification-version register didn’t respond, or answered in a shape this panel can’t read — this panel cannot tell which. Retry; if it persists, check the service." retry={() => setReloadKey((n) => n + 1)} /></div>
          ) : specRows.length === 0 ? (
            <div style={{ padding: 16 }}><EmptyState icon={I.book} title="No spec versions" /></div>
          ) : (
            <table className="reg-tbl"><thead><tr><th>Specification</th><th>Version qualified against</th></tr></thead>
              <tbody>{specRows.map(([k, v]) => (
                <tr key={k}><td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{k.replace(/([A-Z])/g, ' $1')}</td><td>{v}</td></tr>
              ))}</tbody></table>
          )}
        </div>
      </div>

      {/* ── Controlled vocabulary ── */}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Controlled vocabulary</span>
          {version === 'v4.0' && list && <span className="s mono">{list.oid !== 'na' ? list.oid : 'no OID'}</span>}
        </div>
        <div className="pj-card-b">
          {version === 'v3.2.2' ? (
            /* This panel skipped the loading / error / empty ladder the spec
               panel uses: in flight, failed, wrong shape and genuinely empty all
               rendered "Vocabulary unavailable — sign in", asserting a cause the
               read does not know. */
            loadState === 'loading' || loadState === 'idle' ? (
              <EmptyState icon={I.book} title="Loading the v3.2.2 vocabulary…" busy />
            ) : loadState === 'error' ? (
              <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load the v3.2.2 vocabulary" hint="The controlled-vocabulary service didn’t respond, or answered in a shape this panel can’t read." />
            ) : listing?.v3?.length ? (
              <>
                <p style={{ fontSize: 12.5, color: 'var(--c2c-dim,#667085)', marginTop: 0 }}>
                  eCTD v3.2.2 carries its US-regional controlled values as coded attributes
                  (<span className="mono">fdaat</span>/<span className="mono">fdast</span>/<span className="mono">fdasst</span>/<span className="mono">fdaft</span>) in <span className="mono">us-regional.xml</span>.
                </p>
                <table className="reg-tbl"><thead><tr><th>Coded-attribute list</th><th style={{ textAlign: 'right' }}>Codes</th></tr></thead>
                  <tbody>{listing.v3.map((l) => (
                    <tr key={l.id}><td style={{ fontWeight: 600 }}>{humanize(l.id)}</td><td style={{ textAlign: 'right' }}>{l.codeCount}</td></tr>
                  ))}</tbody></table>
              </>
            ) : (
              <EmptyState icon={I.book} title="No v3.2.2 coded-attribute lists were returned" />
            )
          ) : (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--c2c-dim,#667085)' }}>Code list</label>
                <select aria-label="Controlled vocabulary list" className="c2c-input" style={{ height: 30, minWidth: 260 }} value={selectedList} onChange={(e) => setSelectedList(e.target.value)}>
                  {(listing?.v4 ?? []).map((l) => (
                    <option key={l.id} value={l.id}>{V4_LABELS[l.id] ?? l.id} ({l.codeCount})</option>
                  ))}
                </select>
                <input
                  aria-label="Filter codes"
                  className="c2c-input" style={{ height: 30, marginLeft: 'auto', minWidth: 200 }}
                  placeholder="Filter codes…" value={filter} onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              {listState === 'loading' || listState === 'idle' ? (
                <EmptyState icon={I.book} title="Loading codes…" busy />
              ) : listState === 'error' ? (
                <EmptyState tone="error" icon={I.alertTriangle} title="Couldn’t load this code list" hint="The controlled-vocabulary service didn’t respond, or answered in a shape this panel can’t read." />
              ) : !list || filteredCodes.length === 0 ? (
                <EmptyState icon={I.book} title={filter ? 'No codes match your filter' : 'No codes'} />
              ) : (
                <div style={{ maxHeight: 420, overflow: 'auto' }}>
                  <table className="reg-tbl"><thead><tr><th style={{ width: 220 }}>Code</th><th>Description</th></tr></thead>
                    <tbody>{filteredCodes.map((c) => (
                      <tr key={c.code}><td className="mono">{c.code}</td><td>{c.description}</td></tr>
                    ))}</tbody></table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
