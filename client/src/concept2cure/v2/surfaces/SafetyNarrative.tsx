import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, liveGet } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';
import { SAE_CASES, composeSafetyNarrative } from '../fixtures/safety-narrative-data';
import type { SaeCase } from '../fixtures/safety-narrative-data';

/* -- Constants -- */

const CRITERIA = ['death', 'life-threatening', 'hospitalization', 'disability', 'congenital anomaly', 'medically important'];
const OUTCOMES = ['recovered', 'recovering', 'recovered with sequelae', 'not recovered', 'fatal', 'unknown'];
const CAUSALITIES = ['related', 'probably related', 'possibly related', 'unlikely related', 'not related'];

/* ================================================================
   SafetyNarrative -- SAE case-narrative writer (ICH E3 section 16).
   The generated narrative IS the hero deliverable, not a dashboard.
   Registers as SURFACE_VIEWS['safety-narrative'].
   ================================================================ */

export function SafetyNarrative({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  const [cases, setCases] = useState<SaeCase[]>(SAE_CASES);
  const [selId, setSelId] = useState(SAE_CASES[0].id);
  const [sample, setSample] = useState(true);
  const sel = cases.find((c) => c.id === selId) || cases[0];
  const [toast, setToast] = useState('');
  const fire = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  /* live ?? fixture — adopt the org's seeded SAE worklist when the store
     returns the full case shape, else keep the codebase fixture so the writer
     is never empty. Local edits (setField) then work off whichever set loaded;
     the ICH E3 §16 composer runs deterministically over the selected case. */
  useEffect(() => {
    let cancelled = false;
    liveGet<{ data?: SaeCase[] }>('/api/safety-narratives/cases', { data: [] }).then((res) => {
      if (cancelled) return;
      const list = res.data?.data;
      if (!res.sample && Array.isArray(list) && list.length > 0 && list[0]?.id && list[0]?.event) {
        setCases(list);
        setSelId(list[0].id);
        setSample(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const result = useMemo(() => composeSafetyNarrative(sel), [sel]);
  const nMissing = result.missingFields.length;

  /* Answer-first lead -- context-aware to the real queue and clocks */
  const lead = useMemo(() => {
    const serious = cases.filter((c) => (c.event.seriousnessCriteria || []).length).length;
    const soonest = cases.slice().sort((a, b) => a.dueDays - b.dueDays)[0];
    const urgent = soonest && soonest.dueDays <= 3;
    return {
      tone: (urgent ? 'urgent' : 'calm') as 'urgent' | 'calm',
      head: urgent
        ? `${soonest.id} is due in ${soonest.dueDays} days -- ${soonest.clock}`
        : `${cases.length} case narratives in progress -- ${serious} serious`,
      body: urgent
        ? `The clock that matters right now is ${soonest.id} (${sel.studyId}). Its narrative is drafted from the case facts below -- complete any missing fields, QC it, and it's ready to file. You have time; work the most urgent one first.`
        : 'Each SAE narrative here is written deterministically from the structured case -- the same facts, the same ICH E3 section 16 convention, every time. Nothing is invented. Pick a case, complete what\'s missing, and hand it off.',
      next: urgent
        ? `Finish ${soonest.id} and send it for medical review`
        : `Complete ${sel.id} and attach it to the safety dossier`,
    };
  }, [cases, sel]);

  const setField = (path: string, val: string | string[]) => {
    setCases((cs) =>
      cs.map((c) => {
        if (c.id !== sel.id) return c;
        const nc = { ...c, event: { ...c.event } };
        if (path.startsWith('event.')) (nc.event as Record<string, unknown>)[path.slice(6)] = val;
        else (nc as Record<string, unknown>)[path] = val;
        return nc;
      }),
    );
  };

  const toggleCrit = (crit: string) => {
    const cur = sel.event.seriousnessCriteria || [];
    setField('event.seriousnessCriteria', cur.includes(crit) ? cur.filter((x) => x !== crit) : cur.concat([crit]));
  };

  return (
    <div className="sn">
      <SampleTag sample={sample} />
      {toast && <div className="sn-toast">{I.check} {toast}</div>}

      <div className="sn-head">
        <div className="sn-eyebrow">Safety narrative / PV -- ICH E3 section 16 -- E2B</div>
        <h1 className="sn-title">SAE case narrative writer</h1>
      </div>

      <AnswerLead
        tone={lead.tone}
        headline={lead.head}
        body={lead.body}
        action={{ label: lead.next, onClick: () => ask(lead.next) }}
      />

      <div className="sn-cols">
        {/* Left -- case queue + structured fields */}
        <div className="sn-left">
          <div className="sn-sec">Case queue</div>
          <div className="sn-queue">
            {cases.map((c) => {
              const serious = (c.event.seriousnessCriteria || []).length > 0;
              const miss = composeSafetyNarrative(c).missingFields.length;
              return (
                <button key={c.id} className="sn-case" data-on={c.id === sel.id || undefined} onClick={() => setSelId(c.id)}>
                  <div className="sn-case-top">
                    <span className="mono sn-case-id">{c.id}</span>
                    <span className={'sn-chip ' + (serious ? 'err' : 'idle')}>{serious ? 'Serious' : 'Non-serious'}</span>
                  </div>
                  <div className="sn-case-subj">{c.age}{c.sex === 'Female' ? 'F' : 'M'} -- {c.event.term}</div>
                  <div className="sn-case-meta">
                    <span className="sn-case-drug">{c.studyDrug}</span>
                    <span className={'sn-due ' + (c.dueDays <= 3 ? 'urgent' : '')}>{c.due}</span>
                    {miss > 0 && <span className="sn-miss">{miss} to complete</span>}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="sn-sec">Structured case -- {sel.id}</div>
          <div className="sn-fields">
            <div className="sn-f2">
              <label className="sn-fl">
                Severity
                <input className="sn-fi" value={sel.event.severity || ''} placeholder="e.g. grade 3 (severe)" onChange={(e) => setField('event.severity', e.target.value)} />
              </label>
              <label className="sn-fl">
                Study day
                <input className="sn-fi" value={sel.event.dayOnStudy || ''} onChange={(e) => setField('event.dayOnStudy', e.target.value)} />
              </label>
            </div>
            <label className="sn-fl">
              Action taken with study drug
              <input className="sn-fi" value={sel.event.actionTaken || ''} placeholder="e.g. study drug permanently discontinued" onChange={(e) => setField('event.actionTaken', e.target.value)} />
            </label>
            <div className="sn-f2">
              <label className="sn-fl">
                Causality (investigator)
                <select className="sn-fi" value={sel.event.causality || ''} onChange={(e) => setField('event.causality', e.target.value)}>
                  <option value="">-- not assessed --</option>
                  {CAUSALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="sn-fl">
                Outcome
                <select className="sn-fi" value={sel.event.outcome || ''} onChange={(e) => setField('event.outcome', e.target.value)}>
                  <option value="">-- unknown --</option>
                  {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </label>
            </div>
            <div className="sn-fl">
              Seriousness criteria
              <div className="sn-crits">
                {CRITERIA.map((c) => (
                  <button key={c} className="sn-crit" data-on={(sel.event.seriousnessCriteria || []).includes(c) || undefined} onClick={() => toggleCrit(c)}>{c}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right -- the generated narrative (the hero deliverable) */}
        <div className="sn-right">
          <div className="sn-sec">Generated narrative <span className="sn-sec-x">-- ICH E3 section 16, deterministic from the case facts</span></div>
          <div className="cm-doc">
            <div className="cm-doc-bar">
              <div>
                <span className="cm-doc-kind">SAE case narrative -- {sel.id}</span>
                <span className="cm-doc-prov">{sel.studyId} -- {result.serious ? 'Serious' : 'Non-serious'} -- {result.narrative.split(/\s+/).length} words</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="bs-da" onClick={() => ask('Review this SAE narrative for ' + sel.id + ' (' + sel.event.term + ') and flag any medical-review or consistency issues before I file it.')}>
                  {I.sparkles} Review with AnA
                </button>
                <button className="bs-da alt" onClick={() => fire('Narrative version saved to ' + sel.id)}>
                  {I.check} Save version
                </button>
              </div>
            </div>
            <div className="cm-doc-page">
              <div className="cm-doc-render">
                <h1>Serious adverse event case narrative</h1>
                <p style={{ fontFamily: 'var(--font-mono,monospace)', fontSize: 12, color: 'var(--text-400)' }}>{sel.id} -- {sel.clock}</p>
                <p>{result.narrative}</p>
                <hr />
                <p>Drafted deterministically from the structured case per ICH E3 section 16 convention. No clinical detail is inferred beyond the supplied facts.</p>
              </div>
            </div>
          </div>

          {/* QC -- missing fields before handoff */}
          <div className={'sn-qc ' + (nMissing ? 'warn' : 'ok')}>
            <span className="sn-qc-ic">{nMissing ? I.alertTriangle : (I.checkCircle || I.check)}</span>
            {nMissing ? (
              <div>
                <div className="sn-qc-t">{nMissing} field{nMissing > 1 ? 's' : ''} to complete before handoff</div>
                <div className="sn-qc-list">{result.missingFields.map((f) => <span key={f} className="sn-qc-tag">{f}</span>)}</div>
              </div>
            ) : (
              <div>
                <div className="sn-qc-t">Complete -- all E3 section 16 elements present</div>
                <div className="sn-qc-d">This narrative is ready for medical review and E2B(R3) transmission.</div>
              </div>
            )}
          </div>

          <div className="sn-hand">
            <button className="sn-hb" onClick={() => {
              try { localStorage.setItem('c2c_open_surface', 'submission-center'); } catch (_e) { /* noop */ }
              onNav('submission-center');
              ask('Transmit ' + sel.id + ' as an E2B(R3) ICSR to the FDA gateway.');
            }}>
              {I.send || I.rocket} Transmit as E2B ICSR
            </button>
            <button className="sn-hb alt" onClick={() => ask('Roll ' + sel.id + ' into the aggregate safety narrative (ICH E3 section 12) for ' + sel.studyId + '.')}>
              {I.layers || I.fileText} Add to aggregate (section 12)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
