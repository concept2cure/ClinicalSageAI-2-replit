import React, { useState, useEffect, useRef, useMemo } from 'react';
import { I } from '../icons';
import { connected } from '../dataConnect';

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
interface AnaVerbBarProps {
  submissionTypeId?: string; sectionId?: string; sectionLabel?: string;
  onVerb: (id: string) => void; activeVerb?: string;
}
interface StreamingRendererProps {
  active: boolean; verb: string; submissionTypeId?: string;
  sectionLabel?: string; documentId?: string; sectionKey?: string;
  /* `onApply?: () => void` used to sit at the end of this list. It was declared
     and nothing else: never destructured below, never called, so a parent that
     wired an Apply handler got silence. It was also redundant — the "Accept"
     button IS the apply, and it calls `onAccept` with the html and the usage,
     which is strictly more than an argumentless onApply could carry.
     A prop in a component's contract is a promise that it will be called. */
  onComplete?: () => void; onAccept?: (html: string, usage: UsageInfo) => void;
  onEdit?: (html: string, usage: UsageInfo) => void;
  onDiscard?: () => void;
}
interface GroundingSource {
  id: string; label: string; type: string; location: string; conf: number;
}
interface UsageInfo {
  live: boolean; sample?: boolean; model: string;
  inputTokens?: number; outputTokens?: number; latencyMs?: number;
  groundingScore?: number; evidenceDiscipline?: string;
  submissionType?: string; sourcesRetrieved?: number;
  agency?: string; docType?: string;
}
type StreamPhase = 'idle' | 'thinking' | 'streaming' | 'done' | 'error';

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

export function RegistryPickerDropdown({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ctx = (window as any).getSubmissionTypeContext?.(value) ?? null;
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return (
    <div className="rpkd" ref={ref}>
      <button className="rpkd-trigger" onClick={() => setOpen(o => !o)} title="Switch filing type">
        {ctx ? (
          <>
            <span className="ico" style={{ fontSize: 13, color: 'var(--accent-200)' }}>{I[SEG_ICONS[ctx.segment]] || '◇'}</span>
            <span className="rpkd-name">{ctx.displayName}</span>
            <span className="rpkd-chip">{ctx.agency}</span>
            <span className="rpkd-chip">{ctx.region}</span>
          </>
        ) : (
          <span className="rpkd-name">Select filing type</span>
        )}
        <span className="ico rpkd-chev">{I.chevDown}</span>
      </button>
      {open && (
        <div className="rpkd-dropdown">
          <RegistryPicker value={value} onChange={id => { onChange(id); setOpen(false); }}
            initialSegment={ctx ? ctx.segment : undefined} compact />
        </div>
      )}
    </div>
  );
}

export function RegistryContextHeader({ submissionTypeId }: { submissionTypeId: string }) {
  const ctx = (window as any).getSubmissionTypeContext?.(submissionTypeId) ?? null;
  if (!ctx) return null;
  const seg = ((window as any).REG_SEGMENTS || {})[ctx.segment] || {};
  const cat = ((window as any).REG_CATEGORIES || {})[ctx.category] || {};
  return (
    <div className="rch" title={ctx.description || ctx.displayName}>
      <span className="rch-seg" title={seg.label}>{I[SEG_ICONS[ctx.segment]] || '◇'}</span>
      <span className="rch-name">{ctx.displayName}</span>
      <span className="rch-sep">{'·'}</span>
      <span className="rch-chip rch-chip-agency">{ctx.agency}</span>
      <span className="rch-chip rch-chip-region">{ctx.region}</span>
      {ctx.dossierStandard !== '—' && <><span className="rch-sep">{'·'}</span><span className="rch-chip tone-ai">{ctx.dossierStandard}</span></>}
      {ctx.ctdModule !== '—' && <span className="rch-chip tone-ok">{ctx.ctdModule}</span>}
      {cat.label && <span className="rch-cat">{cat.label}</span>}
    </div>
  );
}

export function AnaVerbBar({ onVerb, activeVerb }: AnaVerbBarProps) {
  const verbs = [
    { id: 'draft', label: 'Draft', ic: 'sparkles', key: '⌘D', endpoint: '/api/claude/draft/stream', desc: 'Author this section from linked evidence' },
    { id: 'edit', label: 'Edit', ic: 'penLine', key: '⌘E', endpoint: '/api/claude/draft', desc: 'Refine existing content with instructions' },
    { id: 'review', label: 'Review', ic: 'shieldCheck', key: '⌘R', endpoint: '/api/claude/review', desc: 'Compliance review against regulatory requirements' },
    { id: 'gap', label: 'Gap analysis', ic: 'alertTriangle', key: '⌘G', endpoint: '/api/claude/gap-analysis', desc: 'Identify missing content vs target sections' },
  ];
  return (
    <div className="avb">
      {verbs.map(v => (
        <button key={v.id} className="avb-btn" data-on={activeVerb === v.id || undefined}
          onClick={() => onVerb(v.id)} title={v.desc + ' (' + v.key + ')'}>
          <span className="ico">{I[v.ic]}</span>
          <span>{v.label}</span>
          <span className="avb-key">{v.key}</span>
        </button>
      ))}
    </div>
  );
}

export function StreamingRenderer({
  active, verb, submissionTypeId, sectionLabel, documentId, sectionKey,
  onComplete, onAccept, onEdit, onDiscard,
}: StreamingRendererProps) {
  const [phase, setPhase] = useState<StreamPhase>('idle');
  const [thinkTokens, setThinkTokens] = useState<string[]>([]);
  const [contentTokens, setContentTokens] = useState<string[]>([]);
  const [showThinking, setShowThinking] = useState(false);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [groundingSources, setGroundingSources] = useState<GroundingSource[]>([]);
  const [live, setLive] = useState(false);
  const [sourcesN, setSourcesN] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ctx = (window as any).getSubmissionTypeContext?.(submissionTypeId) ?? null;
  // canLive had TWO dead dependencies, not one. `api?.connected?.()` read
  // window.C2C_API — assigned nowhere — and is now the ported connected().
  // `authoring?.streamDraft` reads window.C2C_AUTHORING, which is ALSO assigned
  // nowhere: it is the design kit's streaming channel, declared in BatchDraft.tsx
  // and never provided. So fixing the first blocker does not make this path live,
  // and pretending otherwise would be the same defect in a new place.
  //
  // The streamDraft dependency stays because it is REAL — a streaming draft needs
  // a streamer. What is missing is the provider, not the check. Until that channel
  // is ported, canLive is correctly false and the surface takes its honest
  // non-streaming path. tests/ci/no-ghost-globals.contract.test.ts pins the ghost
  // to this file and BatchDraft so it cannot spread further.
  const authoring = (window as any).C2C_AUTHORING;
  const canLive = !!(documentId && sectionKey && authoring?.streamDraft && connected());
  const acceptable = verb === 'draft' || verb === 'edit';
  useEffect(() => {
    if (!active || !verb) {
      setPhase('idle'); setThinkTokens([]); setContentTokens([]);
      setUsage(null); setGroundingSources([]); setErr(null); setSourcesN(null);
      return;
    }
    if (canLive && acceptable) {
      setLive(true); setErr(null); setSourcesN(null); setUsage(null);
      setGroundingSources([]); setThinkTokens([]); setContentTokens([]); setPhase('thinking');
      const ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      abortRef.current = ac;
      authoring.streamDraft({
        documentId, sectionKey, tone: ctx?.agency || 'FDA', context: '§' + (sectionLabel || ''),
        requirements: verb === 'edit' ? 'Refine the existing section content per the editor instructions.' : undefined,
        signal: ac?.signal,
        onMeta: (ev: any) => { setSourcesN(ev?.sourcesRetrieved != null ? ev.sourcesRetrieved : null); setPhase('streaming'); },
        onThinking: (t: string) => { if (t) setThinkTokens(prev => [...prev, t]); },
        onText: (_delta: string, full: string) => { setPhase('streaming'); setContentTokens([full]); },
        onComplete: (content: string | null, metadata: any) => {
          setPhase('done');
          if (content != null) setContentTokens([content]);
          setUsage({ live: true, model: metadata?.model || metadata?.provider || 'AnA',
            submissionType: metadata?.submissionType, sourcesRetrieved: metadata?.sourcesRetrieved,
            agency: metadata?.agency, docType: metadata?.docType });
          onComplete?.();
        },
        onError: (msg: string) => { setPhase('error'); setErr(msg || 'Drafting unavailable'); },
      });
      return () => { try { abortRef.current?.abort(); } catch (_) { /* noop */ } };
    }
    /* ── The simulated fallback is gone ───────────────────────────────────
       When the live channel is unavailable — which is ALWAYS, because
       `window.C2C_AUTHORING` is assigned nowhere in this repository, as the
       comment above `canLive` says — this path used to run a fake draft:

         • it typed out invented CLINICAL RESULTS character by character to
           look generated — "confirmed objective response rate of 38.6%
           (95% CI 31.5–46.0)", "pooled historical control of 412 patients
           across five sponsor-independent datasets", "median duration of
           response 11.4 months";
         • it attached invented EVIDENCE with confidence scores — "CSR-201
           §7.1 · Module 5.3.5 · 94%", "Historical control meta-analysis ·
           88%" — none of which are documents in this tenant;
         • the review verb invented specific findings about the user's own
           section ("1 ungrounded claim identified", "4/5 claims properly
           cited");
         • and the result carried an Accept button that writes it into a
           regulated document.

       A `sample: true` flag on the usage line was the only thing separating
       that from a real draft. Numbers with confidence intervals and cited
       sources do not read as a sample to the person about to file them, and
       CLAUDE.md is explicit: no fixture data in governed paths, fail closed,
       never fabricate.

       So the surface now refuses. The error branch below already says the
       right thing — "Drafting unavailable … Nothing was written" — and it
       names why, rather than performing a draft nobody can trust. */
    setLive(false);
    setSourcesN(null);
    setUsage(null);
    setGroundingSources([]);
    setThinkTokens([]);
    setContentTokens([]);
    setPhase('error');
    setErr(
      !documentId || !sectionKey
        ? 'Open a document section first — AnA drafts into a section, and none is selected.'
        : !connected()
          ? 'The drafting service is not reachable from this environment. Nothing was written.'
          : 'The drafting service is not configured in this environment, so no draft was produced. Nothing was written.',
    );
    return undefined;
  }, [active, verb]);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [thinkTokens, contentTokens]);
  if (phase === 'idle') return null;
  return (
    <div className="stream-render" ref={scrollRef}>
      {thinkTokens.length > 0 && (
        <div className="stream-think-wrap">
          <button className="stream-think-toggle" onClick={() => setShowThinking(s => !s)}>
            <span className="ico">{I.sparkles}</span>
            <span>AnA reasoning {'·'} {thinkTokens.length} step{thinkTokens.length === 1 ? '' : 's'}</span>
            {phase === 'thinking' && <span className="rce-delib-spin" />}
            {phase !== 'thinking' && <span className="ico" style={{ fontSize: 10 }}>{showThinking ? I.chevDown : I.chevRight}</span>}
          </button>
          {(showThinking || phase === 'thinking') && (
            <div className="stream-think-body">
              {thinkTokens.map((t, i) => <div key={i} className="stream-think-line">{t}</div>)}
            </div>
          )}
        </div>
      )}
      {phase === 'error' && (
        <div className="stream-err">
          <div className="stream-err-h">{I.alertTriangle} Drafting unavailable</div>
          <div className="stream-err-b">{err || 'The drafting service did not return a draft. Nothing was written.'}</div>
          <button className="btn ghost" style={{ height: 28, fontSize: 12 }} onClick={() => onDiscard?.()}>Dismiss</button>
        </div>
      )}
      {live && sourcesN != null && (phase === 'streaming' || phase === 'done') && (
        <div className="stream-srcmeta">{I.link} Drafted from {sourcesN} Data-Room source{sourcesN === 1 ? '' : 's'}</div>
      )}
      {(phase === 'streaming' || phase === 'done') && (
        <div className="stream-content">
          {(() => {
            const html = contentTokens.join('');
            return /<[a-z][\s\S]*>/i.test(html)
              ? <div dangerouslySetInnerHTML={{ __html: html }} />
              : <div>{html.split(/\n{2,}/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}</div>;
          })()}
          {phase === 'streaming' && <span className="stream-cursor" />}
        </div>
      )}
      {phase === 'done' && !live && groundingSources.length > 0 && (
        <div className="stream-grounding">
          <div className="stream-grounding-h">{I.link} Evidence grounding</div>
          <div className="stream-grounding-cards">
            {groundingSources.map(s => (
              <div key={s.id} className={'stream-gsrc' + (s.type === 'draft' ? ' draft' : '')}>
                <span className="stream-gsrc-id">{s.id}</span>
                <span className="stream-gsrc-label">{s.label}</span>
                <span className="stream-gsrc-loc">{s.location}</span>
                <span className={'stream-gsrc-conf' + (s.conf >= 0.85 ? ' hi' : s.conf >= 0.7 ? ' med' : ' lo')}>{Math.round(s.conf * 100)}%</span>
                {s.type === 'draft' && <span className="stream-gsrc-warn">draft source</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {phase === 'done' && usage && (
        <div className="stream-prov">
          <div className="stream-prov-badges">
            {/* The "Sample draft / not a live model call" branch is gone with
                the simulated path that set it. `usage` is now only ever written
                by the live stream's onComplete, so a provenance row exists only
                when a real model produced the content. A badge is a weak place
                to carry "none of this is real" anyway — it sat under invented
                clinical numbers and above an Accept button. */}
            <span className="stream-badge tone-ok">{I.sparkles} AI-generated</span>
            {usage.submissionType && <span className="stream-badge" title="Framework-grade tailoring — the draft is written to this submission type">{usage.submissionType}</span>}
            <span className="stream-badge">{usage.model}</span>
            {usage.sourcesRetrieved != null && <span className="stream-badge">{usage.sourcesRetrieved} source{usage.sourcesRetrieved === 1 ? '' : 's'}</span>}
          </div>
          {acceptable ? (
            <div className="stream-actions">
              <button className="btn ghost" style={{ height: 28, fontSize: 12 }} onClick={() => onDiscard?.()}>{I.x} Discard</button>
              <button className="btn ghost" style={{ height: 28, fontSize: 12 }} onClick={() => onEdit?.(contentTokens.join(''), usage)}>{I.penLine} Edit</button>
              <button className="btn primary" style={{ height: 28, fontSize: 12 }} onClick={() => onAccept?.(contentTokens.join(''), usage)}>{I.check} Accept</button>
            </div>
          ) : (
            <button className="btn ghost" style={{ height: 28, fontSize: 12, marginLeft: 'auto' }} onClick={() => onDiscard?.()}>Done</button>
          )}
        </div>
      )}
    </div>
  );
}

// GovernedActionModal — the duplicate copy that lived here was retired
// alongside the standalone v2/surfaces/GovernedActionModal.tsx. Both were
// 21 CFR Part 11-non-compliant (no re-auth per §11.200, 1-char reason
// accepted, fabricated hash-chain visualization). All callers moved to
// _shared/components/EsignModal (real password re-auth, 8-char reason floor,
// no fake hash chain). Grep confirms nothing imported this export.
