import React, { useState, useEffect, useMemo } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Typed icon accessor ── */

const Ico = I as Record<string, React.ReactElement>;

/* ── Helper maps (kit constants) ── */

const CAT_MAP: Record<string, { label: string; c: string }> = {
  persona:     { label: 'Persona',     c: 'ai'   },
  regulatory:  { label: 'Regulatory',  c: 'warn' },
  pipeline:    { label: 'Pipeline',    c: 'ok'   },
  competitive: { label: 'Competitive', c: 'idle' },
  operational: { label: 'Operational', c: 'ai'   },
  preference:  { label: 'Preference',  c: 'ok'   },
  history:     { label: 'History',     c: 'idle' },
};

const IMP_MAP: Record<string, { t: string; c: string }> = {
  critical: { t: 'Critical', c: 'err'  },
  high:     { t: 'High',     c: 'warn' },
  medium:   { t: 'Medium',   c: 'ai'   },
  low:      { t: 'Low',      c: 'idle' },
};

const TONE_LABELS: Record<string, string> = {
  warmth: 'Warmth', humor: 'Humor', formality: 'Formality', detail: 'Detail',
};

/* ── Fixture types ── */

interface MemoryAtom {
  id: number;
  category: string;
  subcategory: string;
  title: string;
  content: string;
  source_document_name: string;
  confidence_score: number;
  importance_level: string;
  is_verified_by_user: boolean;
  verified_at?: string;
  status: string;
  updated_at: string;
  superseded_by_id?: number;
}

interface EmotionalSignal {
  at: string;
  signal: string;
}

interface AcknowledgedMistake {
  at: string;
  mistake: string;
  correction: string;
}

interface RelationalProfile {
  interaction_count: number;
  last_interaction_at: string;
  profile_summary: string;
  tone_calibration: Record<string, string>;
  emotional_signals: EmotionalSignal[];
  acknowledged_mistakes: AcknowledgedMistake[];
}

/* ── Inline fixture data (kit window globals, grounded in real programs) ── */

const AMEM_ATOMS: MemoryAtom[] = [
  { id: 5001, category: 'regulatory', subcategory: 'pathway', title: 'BX-301 files a BLA under §351(a)',
    content: 'BX-301 (anti-BCMA) is on the BLA §351(a) pathway for relapsed multiple myeloma. Current filing readiness 64%.',
    source_document_name: 'BX-301 program charter', confidence_score: 0.98, importance_level: 'critical',
    is_verified_by_user: true, verified_at: '2026-06-30T14:12:00Z', status: 'active', updated_at: '2026-06-30T14:12:00Z' },
  { id: 5002, category: 'pipeline', subcategory: 'cmc', title: 'Drug-substance stability is the gating CMC item',
    content: '§3.2.S.7.3 is the critical open item for BX-301 -- the linear stability fit crosses the lower spec limit at ~26 months; a comparability protocol is not yet on file.',
    source_document_name: 'Stability study STB-301', confidence_score: 0.90, importance_level: 'high',
    is_verified_by_user: true, verified_at: '2026-06-28T09:40:00Z', status: 'active', updated_at: '2026-06-28T09:40:00Z' },
  { id: 5003, category: 'regulatory', subcategory: 'crl', title: 'BX-204 has an open CRL comparability deficiency',
    content: 'BX-204 (Bextrelimab, a CHO-produced IgG1κ mAb) carries an unresolved CRL comparability deficiency (D2) on NDA 212345 -- the gating item for the resubmission.',
    source_document_name: 'Complete Response Letter · 2026', confidence_score: 0.95, importance_level: 'critical',
    is_verified_by_user: false, status: 'active', updated_at: '2026-06-25T16:05:00Z' },
  { id: 5004, category: 'operational', subcategory: 'safety', title: 'BX-099 has an active pneumonitis signal',
    content: 'BX-099 is approved (application 211990). An active pneumonitis signal (PRR 4.2, 27 cases) is under evaluation; an expedited report is drafted -- no filing blocker.',
    source_document_name: 'PV signal log', confidence_score: 0.88, importance_level: 'medium',
    is_verified_by_user: false, status: 'active', updated_at: '2026-07-01T11:20:00Z' },
  { id: 5005, category: 'preference', subcategory: 'working-style', title: 'You work answer-first and concise',
    content: 'You want the plain-language answer and one clear next step first, then the evidence on demand. Low tolerance for decorative dashboards -- you want working tools and real, code-grounded outputs.',
    source_document_name: 'Interaction pattern', confidence_score: 0.82, importance_level: 'high',
    is_verified_by_user: false, status: 'active', updated_at: '2026-07-03T08:00:00Z' },
  { id: 5006, category: 'history', subcategory: 'superseded', title: 'BX-204 indication (earlier read)',
    content: 'An earlier note put BX-204 in a different indication; superseded once the program charter was reconciled.',
    source_document_name: 'Legacy import', confidence_score: 0.4, importance_level: 'low',
    is_verified_by_user: false, status: 'superseded', superseded_by_id: 5003, updated_at: '2026-06-20T10:00:00Z' },
];

const AMEM_PROFILE: RelationalProfile = {
  interaction_count: 47, last_interaction_at: '2026-07-04T03:40:00Z',
  profile_summary: 'Jordan leads regulatory strategy and moves fast under filing pressure. Prefers a plain-language answer first, then the evidence. Wants working tools and real, code-grounded outputs -- not mockups or decorative dashboards. Deadline-sensitive: surface risk early and honestly.',
  tone_calibration: { warmth: 'medium', humor: 'rare', formality: 'standard', detail: 'concise' },
  emotional_signals: [{ at: '2026-07-04T03:40:00Z', signal: 'High urgency around the BX-301 filing timeline' }],
  acknowledged_mistakes: [
    { at: '2026-07-02T12:00:00Z', mistake: 'Drafted a surface from a design summary instead of the source of truth', correction: 'Always read the concept2cure-v2 codebase first; never invent values or capabilities' },
  ],
};

/* ════ AnA Memory -- cross-session memory surface ════ */

export function AnaMemory({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  const c2cApi = (window as any).C2C_API;
  const live = c2cApi && c2cApi.connected();

  const [mem, setMem] = useState<{ atoms: MemoryAtom[]; sample: boolean }>({ atoms: AMEM_ATOMS, sample: true });
  const [cat, setCat] = useState('all');
  const [toast, setToast] = useState('');
  const fire = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2400); };
  const prof = AMEM_PROFILE;

  /* live ?? fixture -- GET /api/mdx/ana/memory (canonical envelope → .data). */
  useEffect(() => {
    const fx = AMEM_ATOMS;
    if (!live) { setMem({ atoms: fx, sample: true }); return; }
    setMem({ atoms: fx, sample: true });
    c2cApi.get('/api/mdx/ana/memory')
      .then((r: any) => {
        const arr: MemoryAtom[] = Array.isArray(r) ? r : ((r && r.data) || []);
        setMem(arr.length ? { atoms: arr, sample: false } : { atoms: fx, sample: true });
      })
      .catch(() => setMem({ atoms: fx, sample: true }));
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  const verify = (id: number) => {
    setMem(m => ({ ...m, atoms: m.atoms.map(a => (a.id === id ? { ...a, is_verified_by_user: true, verified_at: new Date().toISOString() } : a)) }));
    if (live) c2cApi.post('/api/mdx/ana/memory/' + id + '/verify', {}).catch(() => {/* noop */});
    fire('Verified -- AnA will weight this memory more.');
  };

  const active = mem.atoms.filter(a => a.status === 'active');
  const cats = useMemo(() => Array.from(new Set(active.map(a => a.category))), [mem.atoms]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = active.filter(a => cat === 'all' || a.category === cat);
  const superseded = mem.atoms.filter(a => a.status !== 'active');
  const unverified = active.filter(a => !a.is_verified_by_user).length;
  const tone = prof.tone_calibration || {};

  return (
    <div className="amem">
      {toast && <div className="amem-toast">{I.check} {toast}</div>}

      {/* Answer-first -- AnA in first person */}
      <div className="amem-lead">
        <div className="amem-lead-badge">{I.sparkles}</div>
        <div className="amem-lead-body">
          <div className="amem-lead-eyebrow">AnA · cross-session memory <SampleTag sample={mem.sample} /></div>
          <div className="amem-lead-head">We've worked together across {prof.interaction_count || 0} conversations -- here's what I'm carrying into the next one.</div>
          <div className="amem-lead-sub">
            I keep the read {tone.detail === 'exhaustive' ? 'thorough' : tone.detail || 'concise'}, tone {tone.formality || 'standard'}, and I lead with the answer because that's how you like to work. I'm holding {active.length} active {active.length === 1 ? 'memory' : 'memories'} about your programs
            {unverified > 0 ? <>, {unverified} still waiting for your confirmation</> : null}. Correct anything that's off and I'll update.
          </div>
          <div className="amem-lead-actions">
            <button className="amem-go" onClick={() => ask('What do you remember about my active programs, and what should I do next on BX-301?')}>{I.sparkles} Ask what AnA remembers</button>
          </div>
        </div>
      </div>

      <div className="amem-grid">
        {/* Left -- relational profile (read-only, server-maintained) */}
        <div className="amem-col amem-col-narrow">
          <div className="amem-sec">{Ico.heart || Ico.user || I.dot} How AnA is tuned to you <span className="amem-sec-x">-- ana_relational_profiles</span></div>
          <div className="amem-prof">
            <div className="amem-prof-notes">{prof.profile_summary}</div>
            <div className="amem-tone">
              {Object.keys(TONE_LABELS).map(k => (
                <div key={k} className="amem-tone-cell"><span className="amem-tone-k">{TONE_LABELS[k]}</span><span className="amem-tone-v">{tone[k] || '--'}</span></div>
              ))}
            </div>
            {(prof.emotional_signals || []).slice(-1).map((s, i) => (
              <div key={i} className="amem-signal">{Ico.activity || I.dot} {s.signal}</div>
            ))}
          </div>

          <div className="amem-sec2">{Ico.shield || I.alertTriangle} Things I got wrong <span className="amem-sec-x">-- and how you set me straight</span></div>
          <div className="amem-mistakes">
            {(prof.acknowledged_mistakes || []).length === 0 && <div className="amem-empty">Nothing on the ledger yet.</div>}
            {(prof.acknowledged_mistakes || []).map((m, i) => (
              <div key={i} className="amem-mistake">
                <div className="amem-mistake-t">{I.close} {m.mistake}</div>
                <div className="amem-mistake-c">{I.check} {m.correction}</div>
              </div>
            ))}
          </div>
          <div className="amem-note">{Ico.info || I.dot} AnA writes these notes to <code>ana_relational_profiles</code> after each turn and reads them back into her context every conversation. Shown here read-only.</div>
        </div>

        {/* Right -- memory atoms (verifiable) */}
        <div className="amem-col">
          <div className="amem-sec">{Ico.database || Ico.layers || I.dot} What I remember about your programs <span className="amem-sec-x">-- client_memory_entries · verify what's right</span></div>
          <div className="amem-filters">
            <button className="amem-fchip" data-on={cat === 'all' || undefined} onClick={() => setCat('all')}>All {active.length}</button>
            {cats.map(c => {
              const meta = CAT_MAP[c] || { label: c, c: 'idle' };
              return (
                <button key={c} className={'amem-fchip ' + meta.c} data-on={cat === c || undefined} onClick={() => setCat(c)}>{meta.label}</button>
              );
            })}
          </div>
          <div className="amem-atoms">
            {shown.map(a => {
              const cm = CAT_MAP[a.category] || { label: a.category, c: 'idle' };
              const im = IMP_MAP[a.importance_level] || IMP_MAP.low;
              return (
                <div key={a.id} className="amem-atom" data-imp={a.importance_level}>
                  <div className="amem-atom-top">
                    <span className={'amem-tag ' + cm.c}>{cm.label}</span>
                    <span className={'amem-imp ' + im.c}>{im.t}</span>
                    <span className="amem-conf">{Math.round((a.confidence_score || 0) * 100)}% confidence</span>
                    {a.is_verified_by_user
                      ? <span className="amem-verified">{Ico.checkCircle || I.check} Verified</span>
                      : <button className="amem-verify" onClick={() => verify(a.id)}>{I.check} Verify</button>}
                  </div>
                  <div className="amem-atom-title">{a.title}</div>
                  <div className="amem-atom-content">{a.content}</div>
                  <div className="amem-atom-foot">
                    <span className="amem-src">{Ico.file || I.dot} {a.source_document_name}</span>
                    <button className="amem-atom-ask" onClick={() => ask('About what you remember -- "' + a.title + '": is this still accurate, and what does it change for my filing?')}>{I.sparkles} Ask AnA</button>
                  </div>
                </div>
              );
            })}
          </div>

          {superseded.length > 0 && (
            <div className="amem-superseded">
              <div className="amem-sec2">{Ico.clock || Ico.history || I.dot} Superseded <span className="amem-sec-x">-- kept for provenance, no longer active</span></div>
              {superseded.map(a => (
                <div key={a.id} className="amem-sup-row">
                  <span className="amem-tag idle">{(CAT_MAP[a.category] || {}).label || a.category}</span> <span className="amem-sup-t">{a.title}</span> {a.superseded_by_id ? <span className="amem-sup-by">{'→'} replaced by #{a.superseded_by_id}</span> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
