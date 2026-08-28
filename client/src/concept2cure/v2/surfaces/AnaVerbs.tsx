import React, { useState, useMemo } from 'react';
import { I } from '../icons';

const SEG_ICONS: Record<string, string> = {
  pharma_biotech: 'beaker', medical_devices: 'stethoscope',
  diagnostics_ivd: 'microscope', cross_cutting: 'globe',
};
interface RegistryEntry {
  id: string; displayName: string; segment: string; category: string;
  agency: string; region: string; description?: string;
  dossierStandard?: string; ctdModule?: string;
}
interface RegistryPickerProps {
  value: string; onChange: (id: string) => void;
  initialSegment?: string; compact?: boolean;
  /* The visible tab, reported up. The picker owned this state privately, so the
     wizard's "Tailored for …" banner was computed once from the lane the user
     arrived in and could not follow them when they switched tabs — it went on
     naming a category they were no longer looking at. */
  onSegmentChange?: (segment: string) => void;
}

export function RegistryPicker({ value, onChange, initialSegment, compact, onSegmentChange }: RegistryPickerProps) {
  const segs = ((window as any).REG_SEGMENTS || {}) as Record<string, { label: string; count: number }>;
  const cats = ((window as any).REG_CATEGORIES || {}) as Record<string, { label: string }>;
  const registry = ((window as any).GLOBAL_REGISTRY || []) as RegistryEntry[];
  const segKeys = Object.keys(segs);
  const [seg, setSegState] = useState(initialSegment || segKeys[0] || 'pharma_biotech');
  const setSeg = (next: string) => {
    setSegState(next);
    onSegmentChange?.(next);
  };
  const [q, setQ] = useState('');
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [agencyFilter, setAgencyFilter] = useState<string | null>(null);
  const term = q.trim().toLowerCase();
  const segEntries = useMemo(() => registry.filter(e => e.segment === seg), [seg, registry]);
  const regions = useMemo(() => [...new Set(segEntries.map(e => e.region))].sort(), [segEntries]);
  const agencies = useMemo(() => [...new Set(segEntries.map(e => e.agency))].sort(), [segEntries]);
  const filtered = useMemo(() => {
    let pool = term ? registry : segEntries;
    if (term) pool = pool.filter(e =>
      e.displayName.toLowerCase().includes(term) || e.agency.toLowerCase().includes(term) ||
      e.region.toLowerCase().includes(term) || (e.dossierStandard || '').toLowerCase().includes(term) ||
      (e.ctdModule || '').toLowerCase().includes(term) || e.id.toLowerCase().includes(term)
    );
    if (regionFilter) pool = pool.filter(e => e.region === regionFilter);
    if (agencyFilter) pool = pool.filter(e => e.agency === agencyFilter);
    return pool;
  }, [term, segEntries, registry, regionFilter, agencyFilter]);
  const grouped = useMemo(() => {
    const byCat: Record<string, RegistryEntry[]> = {};
    filtered.forEach(e => { (byCat[e.category] = byCat[e.category] || []).push(e); });
    return Object.entries(byCat).map(([catId, entries]) => ({
      catId, label: cats[catId]?.label || catId, entries,
    }));
  }, [filtered, cats]);
  const clearFilters = () => { setRegionFilter(null); setAgencyFilter(null); };
  return (
    <div className={'rpk' + (compact ? ' rpk-compact' : '')}>
      <div className="rpk-search">
        <span className="ico rpk-search-ic">{I.search}</span>
        <input value={q} onChange={e => { setQ(e.target.value); if (e.target.value) clearFilters(); }}
          placeholder={'Search ' + registry.length + ' filing types — name, agency, region…'} />
        {q && <button className="tbtn rpk-search-x" onClick={() => setQ('')}>{I.close}</button>}
      </div>
      {!term && (
        <div className="rpk-tabs">
          {segKeys.map(k => (
            <button key={k} className="rpk-tab" data-on={seg === k || undefined}
              onClick={() => { setSeg(k); clearFilters(); }}>
              <span className="ico">{I[SEG_ICONS[k]] || '◇'}</span>
              <span>{segs[k].label}</span>
              <span className="rpk-tab-n">{segs[k].count}</span>
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
      {term && <div className="rpk-result-note">{filtered.length} type{filtered.length === 1 ? '' : 's'} match &quot;{q}&quot;</div>}
      <div className="rpk-body">
        {grouped.map(g => (
          <div key={g.catId} className="rpk-cat">
            <div className="rpk-cat-h">{g.label} <span className="rpk-cat-n">{g.entries.length}</span></div>
            <div className="rpk-cat-grid">
              {g.entries.map(e => (
                <button key={e.id} className="rpk-type" data-on={value === e.id || undefined}
                  onClick={() => onChange(e.id)} title={e.description || e.displayName}>
                  <div className="rpk-type-n">{e.displayName}</div>
                  <div className="rpk-type-meta">
                    <span className="rpk-chip rpk-chip-agency">{e.agency}</span>
                    <span className="rpk-chip rpk-chip-region">{e.region}</span>
                    {e.dossierStandard !== '—' && <span className="rpk-chip rpk-chip-dossier">{e.dossierStandard}</span>}
                    {e.ctdModule && e.ctdModule !== '—' && <span className="rpk-chip rpk-chip-ctd">{e.ctdModule}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
        {!grouped.length && (
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
