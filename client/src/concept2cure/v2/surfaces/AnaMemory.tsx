import React, { useState, useEffect, useMemo } from 'react';
import { I } from '../icons';
import { liveGetOrNull, liveMutateOrNull, useLiveData, EmptyState } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import '../styles/ana-v2.css';
import { C2CToast, useToast } from '../toast';

/* ════ AnA Memory — cross-session memory surface ════

   Fixture-free by construction (real-data standard). The surface renders the
   org's REAL memory from two stores, or an honest loading / empty / error
   state — never a fixture, never a "Sample data" pill:

     · client_memory_entries  → GET /api/mdx/ana/memory          (verifiable atoms)
     · ana_relational_profiles → GET /api/mdx/ana/memory/profile (how AnA is tuned)

   A user verification is persisted via POST /api/mdx/ana/memory/:id/verify and
   the row is updated in place — rolled back on any failure so the surface never
   shows a "Verified" state that was not actually recorded. */

/* ── Typed icon accessor ── */

const Ico = I as Record<string, React.ReactElement>;

/* ── Helper maps (kit constants — pure labels/config, no data) ── */

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

/* ── Render-contract types (shape of the two GET routes) ── */

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

/* ════ AnA Memory — cross-session memory surface ════ */

export function AnaMemory({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;

  const [atoms, setAtoms] = useState<MemoryAtom[]>([]);
  const [atomsLoading, setAtomsLoading] = useState(true);
  const [atomsError, setAtomsError] = useState<string | null>(null);
  const [cat, setCat] = useState('all');
  const [toast, fire] = useToast();

  /* Left panel — AnA's self-maintained relational notes. Read-only from the
     REAL ana_relational_profiles store; honest empty / error, no fixture. */
  const profState = useLiveData<RelationalProfile>('/api/mdx/ana/memory/profile');
  const prof = profState.data;

  /* Fixture-free read: adopt the org's REAL curated memory atoms
     (client_memory_entries via GET /api/mdx/ana/memory). A failed fetch is an
     honest error; a successful zero-row load is an honest empty — never a
     codebase fixture. Kept in local state so a verification updates the row in
     place (and rolls back if the server did not record it). */
  useEffect(() => {
    let cancelled = false;
    setAtomsLoading(true);
    setAtomsError(null);
    liveGetOrNull<MemoryAtom[]>('/api/mdx/ana/memory').then((res) => {
      if (cancelled) return;
      if (res.error) {
        setAtomsError(res.error);
        setAtomsLoading(false);
        return;
      }
      setAtoms(Array.isArray(res.data) ? res.data : []);
      setAtomsLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const verify = (id: number) => {
    // Optimistic flip — reverted below if the server did not persist it.
    setAtoms(list => list.map(a => (a.id === id ? { ...a, is_verified_by_user: true, verified_at: new Date().toISOString() } : a)));
    liveMutateOrNull('POST', '/api/mdx/ana/memory/' + id + '/verify', {})
      .then((r) => {
        if (r.error) {
          setAtoms(list => list.map(a => (a.id === id ? { ...a, is_verified_by_user: false, verified_at: undefined } : a)));
          fire('Could not verify — the change was not saved.', 'error');
        } else {
          fire('Verified — AnA will weight this memory more.');
        }
      });
  };

  const active = atoms.filter(a => a.status === 'active');
  const cats = useMemo(() => Array.from(new Set(active.map(a => a.category))), [atoms]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = active.filter(a => cat === 'all' || a.category === cat);
  const superseded = atoms.filter(a => a.status !== 'active');
  const unverified = active.filter(a => !a.is_verified_by_user).length;
  const tone = prof?.tone_calibration || {};

  const loading = atomsLoading || profState.loading;
  /* Genuinely nothing to show: no atoms and a successfully-loaded empty profile. */
  const nothing = atoms.length === 0 && profState.empty;

  return (
    <div className="amem">
      <C2CToast msg={toast} position="top" />

      {loading ? (
        <div className="amem-lead-sub" style={{ padding: '18px 14px' }}>Loading AnA's memory…</div>
      ) : atomsError ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load AnA's memory"
          hint="The memory store didn't respond. These are your organization's curated memory atoms — sign in and retry, or check the service is reachable."
        />
      ) : nothing ? (
        <EmptyState
          icon={Ico.database || Ico.layers || I.dot}
          title="AnA hasn't formed any memories yet"
          hint={
            <>
              As you work with AnA she records durable facts about your programs
              (<span className="mono">client_memory_entries</span>) and how she
              should work with you (<span className="mono">ana_relational_profiles</span>).
              Nothing has been captured for your organization yet.
            </>
          }
        />
      ) : (
        <>
          {/* Answer-first — AnA in first person */}
          <div className="amem-lead">
            <div className="amem-lead-badge">{I.sparkles}</div>
            <div className="amem-lead-body">
              <div className="amem-lead-eyebrow">AnA · cross-session memory</div>
              <div className="amem-lead-head">You and I have worked together across {prof?.interaction_count || 0} conversations — here's what I'm carrying into the next one.</div>
              <div className="amem-lead-sub">
                I keep the read {tone.detail === 'exhaustive' ? 'thorough' : tone.detail || 'concise'}, tone {tone.formality || 'standard'}, and I lead with the answer because that's how you like to work. I'm holding {active.length} active {active.length === 1 ? 'memory' : 'memories'} about your programs
                {unverified > 0 ? <>, {unverified} still waiting for your confirmation</> : null}. Correct anything that's off and I'll update.
              </div>
              <div className="amem-lead-actions">
                <button className="amem-go" onClick={() => ask('What do you remember about my active programs, and what should I do next?')}>{I.sparkles} Ask what AnA remembers</button>
              </div>
            </div>
          </div>

          <div className="amem-grid">
            {/* Left — relational profile (read-only, server-maintained) */}
            <div className="amem-col amem-col-narrow">
              <div className="amem-sec">{Ico.heart || Ico.user || I.dot} How AnA is tuned to you <span className="amem-sec-x">-- ana_relational_profiles</span></div>
              {prof ? (
                <>
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
                </>
              ) : profState.error ? (
                <div className="amem-note">{Ico.info || I.dot} AnA's relational notes couldn't be loaded right now.</div>
              ) : (
                <div className="amem-note">{Ico.info || I.dot} AnA hasn't formed relational notes yet — as you work together she'll record how you like to work and own any mistakes she makes.</div>
              )}
              <div className="amem-note">{Ico.info || I.dot} AnA writes these notes to <code>ana_relational_profiles</code> after each turn and reads them back into her context every conversation. Shown here read-only.</div>
            </div>

            {/* Right — memory atoms (verifiable) */}
            <div className="amem-col">
              <div className="amem-sec">{Ico.database || Ico.layers || I.dot} What I remember about your programs <span className="amem-sec-x">-- client_memory_entries · verify what's right</span></div>
              {active.length === 0 ? (
                <div className="amem-empty">No active memories yet — AnA records durable facts about your programs here as you work.</div>
              ) : (
                <>
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
                </>
              )}

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
        </>
      )}
    </div>
  );
}
