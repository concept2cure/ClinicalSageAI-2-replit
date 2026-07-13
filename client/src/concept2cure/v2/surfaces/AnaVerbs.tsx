import React, { useState, useEffect, useRef, useMemo } from 'react';
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
}
interface AnaVerbBarProps {
  submissionTypeId?: string; sectionId?: string; sectionLabel?: string;
  onVerb: (id: string) => void; activeVerb?: string;
}
interface StreamingRendererProps {
  active: boolean; verb: string; submissionTypeId?: string;
  sectionLabel?: string; documentId?: string; sectionKey?: string;
  onComplete?: () => void; onAccept?: (html: string, usage: UsageInfo) => void;
  onEdit?: (html: string, usage: UsageInfo) => void;
  onDiscard?: () => void; onApply?: () => void;
}
interface GovernedActionModalProps {
  action: string; submissionTypeId?: string; sectionLabel?: string;
  onConfirm: (data: { reason: string; meaning: string }) => void;
  onCancel: () => void;
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

export function RegistryPicker({ value, onChange, initialSegment, compact }: RegistryPickerProps) {
  const segs = ((window as any).REG_SEGMENTS || {}) as Record<string, { label: string; count: number }>;
  const cats = ((window as any).REG_CATEGORIES || {}) as Record<string, { label: string }>;
  const registry = ((window as any).GLOBAL_REGISTRY || []) as RegistryEntry[];
  const segKeys = Object.keys(segs);
  const [seg, setSeg] = useState(initialSegment || segKeys[0] || 'pharma_biotech');
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
  const authoring = (window as any).C2C_AUTHORING;
  const api = (window as any).C2C_API;
  const canLive = !!(documentId && sectionKey && authoring?.streamDraft && api?.connected?.());
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
    setLive(false); setErr(null); setSourcesN(null);
    const dn = ctx?.displayName || 'this filing type';
    const ag = ctx?.agency || 'FDA'; const ds = ctx?.dossierStandard || 'eCTD';
    const cm = ctx?.ctdModule || 'Module 2.5'; const rg = ctx?.region || 'US';
    const sl = sectionLabel || '2.5';
    const thinkingText: string[] = verb === 'draft'
      ? [`Analyzing §${sl} requirements for ${dn}…`,
         `Checking linked evidence sources: CSR-201 §7.1, bridging strategy memo, TPP v3.2.`,
         `Identifying regulatory framework: ${ag} ${ds}, ${cm}.`,
         `Cross-referencing precedent from approved analogues in ${rg}.`,
         `Constructing section with confidence-graded claims and citation grounding.`]
      : verb === 'review'
      ? [`Reviewing §${sl} against ${ag} requirements…`, `Checking claim-evidence linkage and citation completeness.`, `Evaluating regulatory language compliance for ${dn}.`]
      : verb === 'gap'
      ? [`Comparing §${sl} content against target section requirements for ${dn}…`, `Identifying missing subsections, data tables, and cross-references.`]
      : [`Loading §${sl} content for revision…`, `Applying edit instructions.`];
    const contentText = verb === 'draft'
      ? `<h3>${sl} — Drafted by AnA</h3><p>Based on the linked evidence from CSR-201 and the target product profile, this section presents the integrated clinical overview for ${dn}, structured per ${ag} requirements.</p><p>The confirmed objective response rate of 38.6% <span class="stream-cite">[E1]</span> (95% CI 31.5–46.0) exceeded the pre-specified threshold of 25%, derived from a pooled historical control of 412 patients across five sponsor-independent datasets <span class="stream-cite">[E2]</span>. Median duration of response was 11.4 months (95% CI 9.1–14.8).</p><p>Population-pharmacokinetic analysis characterizes exposure equivalence between the bridging and pivotal formulations, supporting the efficacy read-across per <span class="stream-cite">[E3]</span>.</p>`
      : verb === 'review'
      ? `<div class="stream-finding" data-sev="ok"><b>Structure:</b> Section follows ${ag} guidance for ${cm}. All required subsections present.</div><div class="stream-finding" data-sev="warn"><b>Claim grounding:</b> 1 ungrounded claim identified — bridging PK analysis cited as “established” but Module 2.7.2 shows status “in progress.” Recommend safer phrasing.</div><div class="stream-finding" data-sev="ok"><b>Citations:</b> 4/5 claims properly cited to locked source data. 1 citation (CSR-201 §7.1) should be verified against locked dataset.</div><div class="stream-finding" data-sev="err"><b>Regulatory tone:</b> §2.5.4 uses “establishes” which implies completed analysis — ${ag} reviewers may challenge this. Softened phrasing staged as tracked change.</div>`
      : verb === 'gap'
      ? `<div class="stream-finding" data-sev="err"><b>Missing:</b> Subgroup analysis by biomarker status (required for ${dn} per ${ag} guidance).</div><div class="stream-finding" data-sev="warn"><b>Incomplete:</b> Benefit-risk conclusions reference safety data but §2.7.4 safety summary not yet drafted — cross-reference will be broken at submission.</div><div class="stream-finding" data-sev="ok"><b>Complete:</b> Efficacy endpoints, study design, disposition data, and primary analysis tables are all present and grounded.</div><div class="stream-finding" data-sev="warn"><b>Recommended:</b> Add a tabular comparison of the subject vs predicate/benchmark to strengthen the regulatory narrative.</div>`
      : `<p>Content revised per your instructions. 3 tracked changes applied. Changes preserve ${ag} tone requirements for ${dn}.</p>`;
    const sources: GroundingSource[] = verb === 'draft' ? [
      { id: 'E1', label: 'CSR-201 §7.1', type: 'locked', location: 'Module 5.3.5', conf: 0.94 },
      { id: 'E2', label: 'Historical control meta-analysis', type: 'locked', location: 'Module 5.3.5.3', conf: 0.88 },
      { id: 'E3', label: 'FDA 2023 bridging guidance', type: 'published', location: 'External', conf: 0.92 },
      { id: 'E4', label: 'TPP v3.2', type: 'draft', location: 'Program files', conf: 0.72 },
    ] : verb === 'review' ? [
      { id: 'E1', label: 'CSR-201 locked dataset', type: 'locked', location: 'Module 5.3.5', conf: 0.96 },
      { id: 'E2', label: 'Module 2.7.2 draft', type: 'draft', location: 'Module 2', conf: 0.58 },
    ] : verb === 'gap' ? [
      { id: 'E1', label: ag + ' guidance for ' + dn, type: 'published', location: 'External', conf: 0.90 },
    ] : [];
    setPhase('thinking'); setThinkTokens([]); setContentTokens([]); setGroundingSources([]);
    let tIdx = 0, cIdx = 0;
    const cChars = contentText.split('');
    const tTimer = setInterval(() => {
      if (tIdx < thinkingText.length) { setThinkTokens(prev => [...prev, thinkingText[tIdx]]); tIdx++; }
      else {
        clearInterval(tTimer); setPhase('streaming');
        const cTimer = setInterval(() => {
          const chunk = cChars.slice(cIdx, cIdx + 8).join('');
          if (cIdx < cChars.length) { setContentTokens(prev => [...prev, chunk]); cIdx += 8; }
          else {
            clearInterval(cTimer); setPhase('done');
            setUsage({ live: false, sample: true, model: 'Sample', inputTokens: 2847,
              outputTokens: 1203, latencyMs: 3420, groundingScore: 0.91, evidenceDiscipline: 'locked-only' });
            setGroundingSources(sources); onComplete?.();
          }
        }, 15);
      }
    }, 400);
    return () => { clearInterval(tTimer); };
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
            {usage.live ? (<>
              <span className="stream-badge tone-ok">{I.sparkles} AI-generated</span>
              {usage.submissionType && <span className="stream-badge" title="Framework-grade tailoring — the draft is written to this submission type">{usage.submissionType}</span>}
              <span className="stream-badge">{usage.model}</span>
              {usage.sourcesRetrieved != null && <span className="stream-badge">{usage.sourcesRetrieved} source{usage.sourcesRetrieved === 1 ? '' : 's'}</span>}
            </>) : (<>
              <span className="stream-badge tone-warn">Sample draft</span>
              <span className="stream-badge">not a live model call</span>
            </>)}
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

export function GovernedActionModal({ action, submissionTypeId, sectionLabel, onConfirm, onCancel }: GovernedActionModalProps) {
  const [reason, setReason] = useState('');
  const [meaning, setMeaning] = useState('authorship');
  const ctx = (window as any).getSubmissionTypeContext?.(submissionTypeId) ?? null;
  const meanings = [
    { id: 'authorship', label: 'Authorship', desc: 'I authored this content' }, { id: 'review', label: 'Review', desc: 'I reviewed and found it acceptable' },
    { id: 'approval', label: 'Approval', desc: 'I authorize this for the next stage' }, { id: 'rejection', label: 'Rejection', desc: 'I reject this — return to author' },
    { id: 'verification', label: 'Verification', desc: 'I verified accuracy of data and claims' }, { id: 'authorization', label: 'Authorization', desc: 'I authorize this for submission' },
    { id: 'acknowledgment', label: 'Acknowledgment', desc: 'I acknowledge receipt / awareness' }, { id: 'witnessing', label: 'Witnessing', desc: 'I witnessed this action being performed' },
    { id: 'responsibility', label: 'Responsibility', desc: 'I accept responsibility for this content' },
  ];
  const prevHash = '7f3a' + Math.random().toString(36).slice(2, 6) + '…' + Math.random().toString(36).slice(2, 6);
  const thisHash = 'a8b2' + Math.random().toString(36).slice(2, 6) + '…' + Math.random().toString(36).slice(2, 6);
  return (
    <div className="esign-bd" onClick={onCancel}>
      <div className="esign-modal gov-modal" onClick={e => e.stopPropagation()}>
        <div className="esign-h">
          <span className="ico">{I.shieldCheck}</span>
          <div style={{ flex: 1 }}>
            <div className="t">Confirm: {action}</div>
            <div className="sub" style={{ fontSize: 11, color: 'var(--text-400)', marginTop: 2 }}>
              {ctx ? `${ctx.displayName} · ${ctx.agency} · ${ctx.region}` : 'Governed action'}
              {sectionLabel ? ` · §${sectionLabel}` : ''}
            </div>
          </div>
          <button className="tbtn" onClick={onCancel}>{I.close}</button>
        </div>
        <div className="gov-body">
          <div className="gov-notice">
            <span className="ico" style={{ color: 'var(--accent-200)' }}>{I.lock}</span>
            <span>This action mutates a governed document. Per 21 CFR Part 11 {'§'}11.50, provide a reason for change and signature meaning.</span>
          </div>
          <div className="gov-manifest">
            <div className="gov-manifest-h">Change manifest</div>
            <div className="gov-manifest-rows">
              <div className="gov-manifest-row"><span className="gov-mk">Action</span><span className="gov-mv">{action}</span></div>
              {ctx && <div className="gov-manifest-row"><span className="gov-mk">Filing type</span><span className="gov-mv">{ctx.displayName}</span></div>}
              {ctx && <div className="gov-manifest-row"><span className="gov-mk">Authority</span><span className="gov-mv">{ctx.agency} {'·'} {ctx.region}</span></div>}
              {sectionLabel && <div className="gov-manifest-row"><span className="gov-mk">Section</span><span className="gov-mv">{'§'}{sectionLabel}</span></div>}
              <div className="gov-manifest-row"><span className="gov-mk">Timestamp</span><span className="gov-mv mono">{new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC</span></div>
            </div>
          </div>
          <label className="gov-field">
            <span className="gov-label">Reason for change</span>
            <textarea className="gov-textarea" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Updated efficacy data per locked CSR-201 dataset" rows={3} />
          </label>
          <label className="gov-field">
            <span className="gov-label">Signature meaning ({'§'}11.50)</span>
            <div className="gov-meanings">
              {meanings.map(m => (
                <button key={m.id} className="gov-meaning" data-on={meaning === m.id || undefined} onClick={() => setMeaning(m.id)}>
                  <span className="gov-meaning-radio" />
                  <span className="gov-meaning-l">{m.label}</span>
                  <span className="gov-meaning-d">{m.desc}</span>
                </button>
              ))}
            </div>
          </label>
          <div className="gov-hashchain">
            <div className="gov-hashchain-h">{I.link} Audit hash-chain</div>
            <div className="gov-hashchain-viz">
              <div className="gov-hc-node prev"><span className="gov-hc-label">Previous</span><span className="gov-hc-hash mono">{prevHash}</span></div>
              <span className="gov-hc-arrow">{'→'}</span>
              <div className="gov-hc-node current"><span className="gov-hc-label">This action</span><span className="gov-hc-hash mono">{thisHash}</span></div>
            </div>
            <div className="gov-hc-note">This entry will be immutably chained to the previous audit record. The hash includes your identity, timestamp, action, reason, and the document state.</div>
          </div>
        </div>
        <div className="gov-footer">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!reason.trim()} onClick={() => onConfirm({ reason: reason.trim(), meaning })}>
            {I.shieldCheck} Confirm &amp; apply
          </button>
        </div>
      </div>
    </div>
  );
}
