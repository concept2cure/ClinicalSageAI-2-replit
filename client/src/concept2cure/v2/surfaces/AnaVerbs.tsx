import React, { useState, useMemo } from 'react';
import { I } from '../icons';
import { hasKeys, liveGetOrNull } from '../dataConnect';
import { marketBuildText, marketSupportPath, type MarketSupportView } from '../MarketSupportLine';
import { filingAskPrompt, filingWfCode, resolveFilingCatalogEntry, FILING_CATEGORY_METADATA } from '@shared/regulatory/filing-catalog';
import { FILING_WF_LABEL } from '@shared/regulatory/filing-lifecycle-reference';
import { FilingLifecycleReference } from './FilingLifecycleReference';

const categoryDescription = new Map(FILING_CATEGORY_METADATA.map(category => [category.id as string, category.description]));
const workflowLabel = (entry: { id: string }) => {
  const filing = resolveFilingCatalogEntry(entry.id);
  return filing ? FILING_WF_LABEL[filingWfCode(filing)] ?? '' : '';
};

const SEG_ICONS: Record<string, string> = {
  pharma_biotech: 'beaker', medical_devices: 'stethoscope',
  diagnostics_ivd: 'microscope', cross_cutting: 'globe',
};
interface RegistryEntry {
  id: string; displayName: string; segment: string; category: string;
  agency: string; region: string; description?: string;
  dossierStandard?: string; ctdModule?: string; submissionFormat?: string; pathwayKey?: string | null;
}

/* ── What the platform offers for each filing (FILING_SPINE F19b) ───────────
   The offer is the server's (services/regulatory/market-support.ts `offer`,
   read through GET /api/submissions/market-support): build and sequence,
   author documents only, or not offered with the reason. Project creation
   refuses a filing that is not offered with the same reason (POST
   /api/c2c/projects, 422 FILING_NOT_OFFERED), so the picker lists only what
   creation accepts. Nothing here decides an offer. */
interface FilingOfferView {
  tier: 'build_and_sequence' | 'author_only' | 'not_offered'; label: string; reason: string;
  /** Registry ids the tier is stated for; null when it holds for every filing of the type. */
  appliesTo?: string[] | null;
}
/** What the picker says about one offered filing: the server's offer, or, for a
 *  filing that creates the application type without being that application (a
 *  meeting request filed as an NDA), no tier claim and the filings it names. */
type RowOffer =
  | { kind: 'offer'; offer: FilingOfferView }
  | { kind: 'unclaimed'; offer: FilingOfferView; type: string; agency: string; names: string[] };
type MarketRow = MarketSupportView & { offer?: FilingOfferView };
interface MarketSupportRead { applicationType: string; markets: MarketRow[] }

/** 'Health Canada', 'Health_Canada' and 'health-canada' are one agency name. */
const agencyKey = (a: string | null | undefined) => String(a ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '_');

/** The market row that answers for a catalog filing: matched on the agency the
 *  server names, or on the market as it was asked (a second-round read). */
const rowFor = (rows: MarketRow[] | undefined, agency: string) =>
  rows?.find((m) => agencyKey(m.agency) === agencyKey(agency) || agencyKey(m.market) === agencyKey(agency));

type Pair = { type: string; agency: string };

/** One read per application type in the catalog, each answering for every
 *  market the platform names; then one read per (type, agency) the first round
 *  did not name ('EU / Notified Body', 'ICH / Global'), asked for that market,
 *  so every filing's offer or refusal is the server's. A failed or malformed
 *  read fails the whole set. */
function useFilingOffers(pairs: Pair[]) {
  const key = pairs.map((p) => `${p.type}|${p.agency}`).join(';');
  const [bump, setBump] = useState(0);
  const [state, setState] = useState<{ loading: boolean; error: boolean; byType: Map<string, MarketRow[]> }>(
    { loading: pairs.length > 0, error: false, byType: new Map() },
  );
  React.useEffect(() => {
    let cancelled = false;
    if (!pairs.length) { setState({ loading: false, error: false, byType: new Map() }); return undefined; }
    // A re-read keeps the failure on screen (and its Retry button mounted,
    // marked busy) until the answer arrives, so focus never falls to the page.
    setState((s) => ({ ...s, loading: true }));
    const guard = hasKeys<MarketSupportRead>('markets');
    // A read with no offer on a row cannot say what is offered: a failure, not "none".
    const bad = (r: { error?: unknown; data?: MarketSupportRead | null }) =>
      !!r.error || !r.data || !Array.isArray(r.data.markets) || r.data.markets.some((m) => !m?.offer);
    const types = [...new Set(pairs.map((p) => p.type))];
    (async () => {
      const first = await Promise.all(types.map((t) => liveGetOrNull<MarketSupportRead>(marketSupportPath(t), guard)));
      if (first.some(bad)) return { error: true, byType: new Map<string, MarketRow[]>() };
      const byType = new Map<string, MarketRow[]>(types.map((t, i) => [t, [...first[i].data!.markets]]));
      const unnamed = pairs.filter((p) => !rowFor(byType.get(p.type), p.agency));
      const second = await Promise.all(unnamed.map((p) => liveGetOrNull<MarketSupportRead>(marketSupportPath(p.type, p.agency), guard)));
      if (second.some(bad)) return { error: true, byType: new Map<string, MarketRow[]>() };
      unnamed.forEach((p, i) => byType.get(p.type)!.push(...second[i].data!.markets));
      return { error: false, byType };
    })().then((out) => {
      if (!cancelled) setState({ loading: false, ...out });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bump]);
  return { ...state, retry: () => setBump((b) => b + 1) };
}

interface RegistryPickerProps {
  value: string; onChange: (id: string) => void;
  /** The application type a catalog filing creates (Projects.tsx programTypeFor):
   *  the type the market verdict is asked about, as creation will send it. */
  applicationTypeOf: (entry: { id: string; pathwayKey?: string | null }) => string;
  initialSegment?: string; compact?: boolean;
  /* The visible tab, reported up. The picker owned this state privately, so the
     wizard's "Tailored for …" banner was computed once from the lane the user
     arrived in and could not follow them when they switched tabs — it went on
     naming a category they were no longer looking at. */
  onSegmentChange?: (segment: string) => void;
  onBrowseChange?: (browse: { segment: string; query: string }) => void;
  onAsk?: (text: string) => void;
}

function FilingReferenceFacts({ entry }: { entry: RegistryEntry }) {
  return <dl className="filing-reference-facts"><div><dt>Authority / region</dt><dd>{entry.agency} · {entry.region}</dd></div>
    <div><dt>Submission format</dt><dd>{typeof entry.submissionFormat !== 'string' ? 'Submission format not recorded' : entry.submissionFormat && entry.submissionFormat !== '—' ? entry.submissionFormat : 'No standard transmission format'}</dd></div>
    <div><dt>CTD module</dt><dd>{typeof entry.ctdModule !== 'string' ? 'CTD structure not recorded' : entry.ctdModule && entry.ctdModule !== '—' ? entry.ctdModule : 'Not CTD-structured'}</dd></div>
    <div><dt>Reference workflow family</dt><dd>{workflowLabel(entry) || 'No catalogue workflow family recorded'}</dd></div>
  </dl>;
}

function ChosenFilingNote({ entry, chosen, market, onAsk }: {
  entry: RegistryEntry; chosen: RowOffer; market: MarketRow | undefined; onAsk?: (text: string) => void;
}) {
  const build = chosen.kind === 'offer' ? marketBuildText(market ?? {}) : null;
  return <div className="rpk-result-note" role="status" data-testid="rpk-chosen-offer">
    {chosen.kind === 'offer' ? <p><strong>{chosen.offer.label}.</strong> {chosen.offer.reason}</p> : <p>
      <strong>No tier is stated for this filing.</strong>{' '}
      {chosen.offer.label} is stated for the {chosen.agency} {chosen.type.toUpperCase()} application itself
      ({chosen.names.join(', ')}). This filing is not one of them. Creating it opens
      a project whose application type is {chosen.type.toUpperCase()}.
    </p>}
    <FilingReferenceFacts entry={entry} />
    {entry.description && <p><strong>Catalog reference.</strong> {entry.description}</p>}
    <p data-testid="rpk-chosen-build"><strong>How you’ll build it.</strong>{' '}
      {chosen.kind === 'unclaimed' ? 'No build details are stated for this filing; the support above concerns the application it creates.'
        : build ?? 'Build details could not be read for this filing’s market.'}
    </p>
    <FilingLifecycleReference filingId={entry.id} />
    {onAsk && <button type="button" className="btn ghost sm" onClick={() => onAsk(filingAskPrompt(entry.displayName))}>
      {I.sparkles} Ask AnA
    </button>}
  </div>;
}

export function RegistryPicker({ value, onChange, applicationTypeOf, initialSegment, compact, onSegmentChange, onBrowseChange, onAsk }: RegistryPickerProps) {
  const segs = ((window as any).REG_SEGMENTS || {}) as Record<string, { label: string; count: number }>;
  const cats = ((window as any).REG_CATEGORIES || {}) as Record<string, { label: string }>;
  const catalog = useMemo(() => ((window as any).GLOBAL_REGISTRY || []) as RegistryEntry[], []);
  /* Recomputed with the caller's rule (it reads the visible tab), so the
     verdict is asked about exactly the type creation will send. */
  const typeOf = useMemo(
    () => new Map(catalog.map((e) => [e.id, applicationTypeOf({ id: e.id, pathwayKey: e.pathwayKey })])),
    [catalog, applicationTypeOf],
  );
  const pairs = useMemo(() => {
    const seen = new Map<string, Pair>();
    for (const e of catalog) {
      const type = typeOf.get(e.id) ?? '';
      seen.set(`${type}|${e.agency}`, { type, agency: e.agency });
    }
    return [...seen.values()].sort((a, b) => `${a.type}|${a.agency}`.localeCompare(`${b.type}|${b.agency}`));
  }, [catalog, typeOf]);
  const offers = useFilingOffers(pairs);
  /* Each filing's offer is its market's row in its type's reads. An offer the server states for named filings only (appliesTo) makes no
     claim for the others: a Type A meeting creates an NDA project, and is not
     an NDA built and sequenced here. */
  const { registry, offerOf, notOffered } = useMemo(() => {
    const offered: RegistryEntry[] = [];
    const refused: Array<{ entry: RegistryEntry; reason: string }> = [];
    const byId = new Map<string, RowOffer>();
    if (offers.loading || offers.error) return { registry: offered, offerOf: byId, notOffered: refused };
    const nameOf = new Map(catalog.map((e) => [e.id.toLowerCase(), e.displayName]));
    for (const e of catalog) {
      const type = typeOf.get(e.id) ?? '';
      const row = rowFor(offers.byType.get(type), e.agency);
      // Every pair was read, so a missing row is a defect in the read, stated as such.
      if (!row?.offer) { refused.push({ entry: e, reason: 'The server stated no offer for this filing\'s market.' }); continue; }
      if (row.offer.tier === 'not_offered') { refused.push({ entry: e, reason: row.offer.reason }); continue; }
      const scope = row.offer.appliesTo;
      if (Array.isArray(scope) && !scope.some((id) => id.toLowerCase() === e.id.toLowerCase())) {
        const names = scope.map((id) => nameOf.get(id.toLowerCase()) ?? id);
        byId.set(e.id, { kind: 'unclaimed', offer: row.offer, type, agency: e.agency, names });
      } else {
        byId.set(e.id, { kind: 'offer', offer: row.offer });
      }
      offered.push(e);
    }
    return { registry: offered, offerOf: byId, notOffered: refused };
  }, [catalog, typeOf, offers]);
  const segKeys = Object.keys(segs);
  const [seg, setSegState] = useState(initialSegment || segKeys[0] || 'pharma_biotech');
  const setSeg = (next: string) => {
    setSegState(next);
    onSegmentChange?.(next);
  };
  const [q, setQ] = useState('');
  React.useEffect(() => { onBrowseChange?.({ segment: seg, query: q }); }, [seg, q, onBrowseChange]);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [agencyFilter, setAgencyFilter] = useState<string | null>(null);
  const term = q.trim().toLowerCase();
  const segEntries = useMemo(() => registry.filter(e => e.segment === seg), [seg, registry]);
  const regions = useMemo(() => [...new Set(segEntries.map(e => e.region))].sort(), [segEntries]);
  const agencies = useMemo(() => [...new Set(segEntries.map(e => e.agency))].sort(), [segEntries]);
  /* One match rule for offered and not-offered filings, so a search lists
     every filing it matches, offered or not. */
  const matches = (e: RegistryEntry) =>
    e.displayName.toLowerCase().includes(term) || e.agency.toLowerCase().includes(term) ||
    e.region.toLowerCase().includes(term) || (e.dossierStandard || '').toLowerCase().includes(term) ||
    (e.ctdModule || '').toLowerCase().includes(term) || e.id.toLowerCase().includes(term) ||
    (e.description || '').toLowerCase().includes(term) || workflowLabel(e).toLowerCase().includes(term);
  const filtered = useMemo(() => {
    let pool = term ? registry : segEntries;
    if (term) pool = pool.filter(matches);
    if (regionFilter) pool = pool.filter(e => e.region === regionFilter);
    if (agencyFilter) pool = pool.filter(e => e.agency === agencyFilter);
    return pool;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `matches` reads only `term`
  }, [term, segEntries, registry, regionFilter, agencyFilter]);
  /* What a client starts with first: the filings the platform builds,
     validates and sequences end to end. The tab listed them among every
     documents-only filing in one wall of identical cards (43 in Pharma &
     Biotech), and a client testing the product read the documents-only ones as
     disabled (docs/design/CLIENT_JOURNEY_2026-10-25.md). The rest follow one
     press away; a search lists everything it matches, as before. The rest are
     not all documents-only: a filing that creates an application without
     being it (a Pre-IND meeting) has no tier stated, so the heading claims
     nothing the server did not. The split is the server's offer, so nothing
     here decides what is built. */
  const isFull = (e: RegistryEntry) => {
    const o = offerOf.get(e.id);
    return o?.kind === 'offer' && o.offer.tier === 'build_and_sequence';
  };
  const [showRest, setShowRest] = useState(false);
  const groupOf = (entries: RegistryEntry[]) => {
    const byCat: Record<string, RegistryEntry[]> = {};
    entries.forEach(e => { (byCat[e.category] = byCat[e.category] || []).push(e); });
    return Object.entries(byCat).map(([catId, list]) => ({
      catId, label: cats[catId]?.label || catId, description: categoryDescription.get(catId), entries: list,
    }));
  };
  const full = term ? filtered : filtered.filter(isFull);
  const rest = term ? [] : filtered.filter((e) => !isFull(e));
  /* A tab with nothing built end to end, or a chosen filing among the rest,
     opens the rest: the choice is never hidden behind a press. */
  const restOpen = showRest || full.length === 0 || rest.some((e) => e.id === value);
  const grouped = groupOf(full);
  const restGrouped = restOpen ? groupOf(rest) : [];
  /* A search that matches filings the platform does not offer lists them, each
     with the server's reason, rather than "no match". */
  const notOfferedMatches = useMemo(
    () => notOffered.filter(({ entry: e }) => (term ? matches(e) : e.segment === seg)
      && (!regionFilter || e.region === regionFilter) && (!agencyFilter || e.agency === agencyFilter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `matches` reads only `term`
    [term, notOffered, seg, regionFilter, agencyFilter],
  );
  const notOfferedCount = notOfferedMatches.length;
  const chosen = value ? offerOf.get(value) : undefined;
  const chosenEntry = catalog.find(entry => entry.id === value);
  const chosenMarket = chosenEntry ? rowFor(offers.byType.get(typeOf.get(value) ?? ''), chosenEntry.agency) : undefined;
  const notOfferedInTab = notOffered.filter((n) => n.entry.segment === seg).length;
  /* After a Retry that succeeds, the alert (and its button) gives way to the
     list: focus goes to the search box rather than falling to the page. */
  const searchRef = React.useRef<HTMLInputElement>(null);
  const retried = React.useRef(false);
  const retry = () => { retried.current = true; offers.retry(); };
  React.useEffect(() => {
    if (retried.current && !offers.loading && !offers.error) { retried.current = false; searchRef.current?.focus(); }
  }, [offers.loading, offers.error]);
  const clearFilters = () => { setRegionFilter(null); setAgencyFilter(null); };
  const card = (e: RegistryEntry) => (
    <button key={e.id} className="rpk-type" data-on={value === e.id || undefined}
      onClick={() => onChange(e.id)} title={e.description || e.displayName}>
      <div className="rpk-type-n">{e.displayName}</div>
      <div className="rpk-type-meta">
        {(() => {
          const o = offerOf.get(e.id);
          return o?.kind === 'offer' && o.offer.tier === 'author_only'
            ? <span className="rpk-chip">{o.offer.label}</span>
            : null;
        })()}
        <span className="rpk-chip rpk-chip-agency">{e.agency}</span>
        <span className="rpk-chip rpk-chip-region">{e.region}</span>
        {term && <span className="rpk-chip rpk-chip-segment">{segs[e.segment]?.label ?? e.segment}</span>}
        {e.dossierStandard !== '—' && <span className="rpk-chip rpk-chip-dossier">{e.dossierStandard}</span>}
        {e.ctdModule && e.ctdModule !== '—' && <span className="rpk-chip rpk-chip-ctd">{e.ctdModule}</span>}
      </div>
    </button>
  );
  /* No filing is offered before the server has said what it offers: a pending
     read lists nothing, and a failed read says so and offers Retry. */
  if (offers.loading || offers.error) {
    return (
      <div className={'rpk' + (compact ? ' rpk-compact' : '')}>
        {offers.error
          ? (
            <div className="rpk-result-note" role="alert">
              Which filing types the platform can carry could not be read, so none is offered yet.{' '}
              <button type="button" className="nda-open" onClick={retry}
                disabled={offers.loading} aria-busy={offers.loading || undefined}>
                {offers.loading ? 'Reading again…' : 'Retry'}
              </button>
            </div>
          )
          : <div className="rpk-result-note" role="status">Checking which filing types the platform can carry…</div>}
      </div>
    );
  }
  return (
    <div className={'rpk' + (compact ? ' rpk-compact' : '')}>
      <div className="rpk-search">
        <span className="ico rpk-search-ic">{I.search}</span>
        <input ref={searchRef} aria-label="Search filing types" value={q} onChange={e => { setQ(e.target.value); if (e.target.value) clearFilters(); }}
          placeholder={'Search ' + registry.length + ' filing types — name, agency, region…'} />
        {q && <button className="tbtn rpk-search-x" aria-label="Clear search" onClick={() => setQ('')}>{I.close}</button>}
      </div>
      {!term && (
        <div className="rpk-tabs">
          {segKeys.map(k => (
            <button key={k} className="rpk-tab" data-on={seg === k || undefined}
              onClick={() => { setSeg(k); clearFilters(); setShowRest(false); }}>
              <span className="ico">{I[SEG_ICONS[k]] || '◇'}</span>
              <span>{segs[k].label}</span>
              <span className="rpk-tab-n">{registry.filter(e => e.segment === k).length}</span>
            </button>
          ))}
        </div>
      )}
      {!term && (regions.length > 1 || agencies.length > 1) && (
        <div className="rpk-filters">
          <div className="rpk-filter-row">
            <span className="rpk-filter-label">Region</span>
            <button className={'rpk-fchip' + (!regionFilter ? ' on' : '')} onClick={() => setRegionFilter(null)}>All</button>
            {regions.map(r => (
              <button key={r} className={'rpk-fchip' + (regionFilter === r ? ' on' : '')}
                onClick={() => setRegionFilter(regionFilter === r ? null : r)}>{r}</button>
            ))}
          </div>
          <div className="rpk-filter-row">
            <span className="rpk-filter-label">Agency</span>
            <button className={'rpk-fchip' + (!agencyFilter ? ' on' : '')} onClick={() => setAgencyFilter(null)}>All</button>
            {agencies.map(a => (
              <button key={a} className={'rpk-fchip' + (agencyFilter === a ? ' on' : '')}
                onClick={() => setAgencyFilter(agencyFilter === a ? null : a)}>{a}</button>
            ))}
          </div>
        </div>
      )}
      {term && (
        <div className="rpk-result-note">
          {filtered.length} offered type{filtered.length === 1 ? '' : 's'} match &quot;{q}&quot;
          {notOfferedCount > 0 && <>; {notOfferedCount} not offered, listed below with the reason</>}
        </div>
      )}
      {!term && notOfferedInTab > 0 && (
        <div className="rpk-result-note">
          {notOfferedInTab} filing type{notOfferedInTab === 1 ? '' : 's'} in {segs[seg]?.label ?? 'this tab'}{' '}
          {notOfferedInTab === 1 ? 'is' : 'are'} not offered. Search for one to see why.
        </div>
      )}
      {/* What the platform offers for the chosen filing, as text: a tooltip
          never reaches a keyboard or touch user. */}
      {chosen && chosenEntry && <ChosenFilingNote entry={chosenEntry} chosen={chosen} market={chosenMarket} onAsk={onAsk} />}
      <div className="rpk-body">
        {!term && full.length > 0 && (
          <div className="rpk-tier-h" data-testid="rpk-full-heading">
            Built and validated here
            <span className="rpk-tier-s">The platform assembles and validates the electronic submission (eCTD sequence) for these filings.</span>
          </div>
        )}
        {grouped.map(g => (
          <div key={g.catId} className="rpk-cat">
            <div className="rpk-cat-h">{g.label} <span className="rpk-cat-n">{g.entries.length}</span></div>
            {g.description && <p className="rpk-result-note">{g.description}</p>}
            <div className="rpk-cat-grid">{g.entries.map(card)}</div>
          </div>
        ))}
        {rest.length > 0 && (
          <div className="rpk-rest" data-testid="rpk-rest">
            <div className="rpk-tier-h">
              More filing types
              <span className="rpk-tier-s">
                Those marked “Author documents for this market” are written and approved here and filed elsewhere.
                Choose a filing to see what the platform does for it.
              </span>
            </div>
            {!restOpen ? (
              <button type="button" className="btn ghost" onClick={() => setShowRest(true)} aria-expanded={false}>
                Show {rest.length} more filing type{rest.length === 1 ? '' : 's'}
              </button>
            ) : restGrouped.map(g => (
              <div key={g.catId} className="rpk-cat">
                <div className="rpk-cat-h">{g.label} <span className="rpk-cat-n">{g.entries.length}</span></div>
            {g.description && <p className="rpk-result-note">{g.description}</p>}
                <div className="rpk-cat-grid">{g.entries.map(card)}</div>
              </div>
            ))}
          </div>
        )}
        {notOfferedCount > 0 && (
          <details className="rpk-cat" data-testid="rpk-not-offered" open={term ? true : undefined}>
            <summary className="rpk-cat-h">Not offered <span className="rpk-cat-n">{notOfferedCount}</span></summary>
            {notOfferedMatches.map(({ entry: e, reason }) => (
              <div key={e.id} className="rpk-result-note">
                <strong>{e.displayName} · {e.agency}.</strong> <span>{segs[e.segment]?.label ?? e.segment}.</span> {reason}
                {e.description && <p>{e.description}</p>}
                <FilingReferenceFacts entry={e} />
                <FilingLifecycleReference filingId={e.id} label={`Filing reference for ${e.displayName}`} />
              </div>
            ))}
          </details>
        )}
        {!grouped.length && !rest.length && !notOfferedCount && (
          <div className="rpk-empty">
            <span className="ico">{I.search}</span>
            <p>No filing types match{term ? ' "' + q + '"' : ' these filters'}. {term ? 'Try an agency (FDA, EMA) or a pathway (510(k), BLA).' : 'Clear filters to browse.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Four exports were deleted here ──────────────────────────────────────────
   `RegistryPickerDropdown`, `RegistryContextHeader`, `AnaVerbBar` and
   `StreamingRenderer` had ZERO importers anywhere in client/src. Only
   `RegistryPicker` (7 callers) was ever reached.

   `StreamingRenderer` was not merely unreached, it was unreachable: its
   `canLive` gate required `window.C2C_AUTHORING.streamDraft`, a channel this
   repository assigns nowhere, so the condition could never be true. The
   surrounding comment said as much and kept the code "until that channel is
   ported". Two hundred lines held open for a provider nobody was writing is
   not a port in progress; it is the thing the next person reaches for.

   And it would have been the WRONG thing to reach for. Its Accept wrote
   content into a regulated document on its own authority. The canonical path
   — `useAnaChat` → `AnaTurn` → `GovernedActionSignoff`, driven by the server's
   own PART11_SIGNATURE_REQUIRED refusal — is the one every live surface uses,
   and it is the one that carries the §11.50 ceremony. Reviving this would have
   built a second, ungoverned accept beside it.

   `AnaVerbBar` advertised four keyboard shortcuts (⌘D/⌘E/⌘R/⌘G) bound nowhere,
   and named four endpoints in a data array that nothing dialled.

   NOT DELETED, and worth someone's attention: those four endpoints are real
   and mounted — POST /api/claude/{draft,draft/stream,review,gap-analysis}
   (server/routes/ana-intelligence.ts, mounted in register-ai-routes.ts:109).
   They now have no client caller at all; `/api/claude/batch`, which BatchDraft
   does call, shares their router. Whether they get a caller or get retired is a
   product decision, not a cleanup — so this change does not quietly make it. */


// GovernedActionModal — the duplicate copy that lived here was retired
// alongside the standalone v2/surfaces/GovernedActionModal.tsx. Both were
// 21 CFR Part 11-non-compliant (no re-auth per §11.200, 1-char reason
// accepted, fabricated hash-chain visualization). All callers moved to
// _shared/components/EsignModal (real password re-auth, 8-char reason floor,
// no fake hash chain). Grep confirms nothing imported this export.
