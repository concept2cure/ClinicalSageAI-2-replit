import React, { useState, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, liveGet } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';

/* ── Inline fixture types ── */

interface NdaModule {
  m: string;
  label: string;
  pct: number;
  docs: number;
  open: number;
  gate: string | null;
}

interface NdaM1Doc {
  id: string;
  label: string;
  st: string;
  blocker?: boolean;
  note?: string;
  _new?: boolean;
}

interface NdaClockStep {
  id: string;
  label: string;
  day: string;
  date: string;
  st: string;
  note?: string;
}

interface NdaRtfItem {
  sev: string;
  area: string;
  text: string;
  fix: string;
  _new?: boolean;
}

/* ── Inline fixture data (kit window globals) ── */

const NDA_MODULES: NdaModule[] = [
  { m: '1', label: 'Administrative & prescribing (Module 1)', pct: 78, docs: 14, open: 3, gate: 'Financial disclosure (3454/3455) — 2 investigators outstanding' },
  { m: '2', label: 'CTD summaries (Module 2)', pct: 71, docs: 9, open: 2, gate: '2.5 Clinical Overview in review; 2.7.4 Safety Summary drafting' },
  { m: '3', label: 'Quality / CMC (Module 3)', pct: 84, docs: 31, open: 2, gate: '3.2.S.4.4 comparability vs 3 post-change lots unreconciled' },
  { m: '4', label: 'Nonclinical study reports (Module 4)', pct: 96, docs: 22, open: 0, gate: null },
  { m: '5', label: 'Clinical study reports (Module 5)', pct: 69, docs: 18, open: 3, gate: 'ISS/ISE integrated summaries pending; define.xml validation 1 error' },
];

const NDA_M1_SEED: NdaM1Doc[] = [
  { id: '356h', label: 'Form FDA 356h — Application to Market a New Drug', st: 'complete' },
  { id: 'cover', label: 'Cover letter & comprehensive table of contents', st: 'complete' },
  { id: '1571', label: 'Form FDA 3674 — Certification of compliance (CT.gov)', st: 'complete' },
  { id: 'fin', label: 'Financial disclosure (Forms 3454 / 3455)', st: 'review', blocker: true, note: '2 of 41 investigators outstanding' },
  { id: 'pdufa', label: 'PDUFA user fee — cover sheet & payment', st: 'complete' },
  { id: 'ipsp', label: 'Pediatric: agreed iPSP / PREA assessment', st: 'draft' },
  { id: 'patent', label: 'Patent & exclusivity (Form 3542 / 3542a)', st: 'draft' },
  { id: 'debar', label: 'Debarment certification (FDC Act §306(k)(1))', st: 'complete' },
  { id: 'field', label: 'Field copy certification', st: 'complete' },
  { id: 'label', label: 'Proposed prescribing information (PLR/PLLR · SPL)', st: 'review' },
  { id: 'rems', label: 'REMS — proposed (if required)', st: 'na', note: 'Not required — risk managed by labeling' },
];

const NDA_CLOCK: NdaClockStep[] = [
  { id: 'sub', label: 'Submission received', day: 'Day 0', date: '14 Jul 2026', st: 'done' },
  { id: 'file', label: 'Filing decision (RTF / 74-day letter)', day: 'Day 60', date: '12 Sep 2026', st: 'current', note: 'Filing review — RTF risk assessment open' },
  { id: 'mid', label: 'Mid-cycle communication', day: '~Day 150', date: 'Dec 2026', st: 'upcoming' },
  { id: 'late', label: 'Late-cycle meeting', day: '~Day 240', date: 'Mar 2027', st: 'upcoming' },
  { id: 'adcom', label: 'Advisory committee (if convened)', day: '~Day 270', date: 'Apr 2027', st: 'upcoming' },
  { id: 'goal', label: 'PDUFA goal date (action)', day: 'Day 304', date: '14 May 2027', st: 'goal' },
];

const NDA_RTF_SEED: NdaRtfItem[] = [
  { sev: 'high', area: 'Module 5 · datasets', text: 'define.xml validation error in ADaM ADTTE; FDA may deem the dataset package incomplete at filing.', fix: 'Resolve define.xml + refresh reviewer guide (ADRG)' },
  { sev: 'med', area: 'Module 1 · financial', text: '2 investigators missing 3454/3455 — a common RTF trigger if unresolved.', fix: 'Collect outstanding disclosures or certify due diligence' },
  { sev: 'med', area: 'Module 3 · CMC', text: 'Comparability protocol acceptance criteria unreconciled vs post-change lots.', fix: 'Close 3.2.S.4.4 reconciliation' },
  { sev: 'low', area: 'Module 2 · summaries', text: '2.7.4 Safety Summary still drafting; needed for a complete CTD.', fix: 'Finalize ISS-derived safety summary' },
];

/* ── Inline shared kit helpers ── */

function useRows<T extends { _new?: boolean }>(seed: T[]): readonly [T[], (r: T) => void] {
  const [rows, setRows] = useState(() => (seed || []).map((r) => ({ ...r })));
  const add = (r: T) => {
    const row: T = { ...r, _new: true };
    setRows((rs) => [row, ...rs]);
    setTimeout(() => setRows((rs) => rs.map((x) => (x === row ? { ...x, _new: false } : x))), 1500);
  };
  return [rows, add] as const;
}

function useToast(): [string, (m: string) => void] {
  const [msg, setMsg] = useState('');
  const fire = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2400);
  };
  return [msg, fire];
}

function C2CToast({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="de-toast">
      <span className="ico">{I.checkCircle}</span>
      {msg}
    </div>
  );
}

/* ════ NdaCockpit -- NDA / BLA filing cockpit ════ */

export function NdaCockpit({ onAsk, onNav }: SurfaceViewProps) {
  const [tab, setTab] = useState('ctd');
  const ask = onAsk;
  const open = (id: string) => {
    try { localStorage.setItem('c2c_open_surface', id); } catch (_e) { /* noop */ }
    onNav && onNav(id);
  };
  /* live ?? fixture — adopt the org's seeded CTD module readiness when the
     store returns the full shape, else keep the fixture. The overall % ready is
     derived from whichever set loaded. The M1 worklist, PDUFA clock, and RtF
     log stay the surface's local-first interactive lists. */
  const [modules, setModules] = useState<NdaModule[]>(NDA_MODULES);
  const [modulesSample, setModulesSample] = useState(true);
  useEffect(() => {
    let cancelled = false;
    liveGet<{ data?: NdaModule[] }>('/api/nda-cockpit/modules', { data: [] }).then((res) => {
      if (cancelled) return;
      const list = res.data?.data;
      if (
        !res.sample &&
        Array.isArray(list) &&
        list.length > 0 &&
        list[0]?.m &&
        typeof list[0]?.pct === 'number'
      ) {
        setModules(list);
        setModulesSample(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const overall = modules.length
    ? Math.round(modules.reduce((a, m) => a + m.pct, 0) / modules.length)
    : 0;
  const [rtf, addRtf] = useRows<NdaRtfItem>(NDA_RTF_SEED);
  const [m1, addM1] = useRows<NdaM1Doc>(NDA_M1_SEED);
  const [form, setForm] = useState<null | 'rtf' | 'm1'>(null);
  const [toast, fireToast] = useToast();
  const m1open = m1.filter(d => d.st !== 'complete' && d.st !== 'na').length;

  const RTF_FORM: C2CFormConfig = {
    eyebrow: 'Filing risk · log',
    title: 'Log a filing-risk item',
    governed: 'Filing-risk items feed the day-60 Refuse-to-File shadow review; logging writes an audit entry.',
    submitLabel: 'Log risk',
    fields: [
      { key: 'area', label: 'Module / area', type: 'select', options: ['Module 1 · admin', 'Module 2 · summaries', 'Module 3 · CMC', 'Module 4 · nonclinical', 'Module 5 · clinical', 'Module 5 · datasets'], required: true },
      { key: 'sev', label: 'Severity', type: 'seg', options: ['low', 'med', 'high'], default: 'med' },
      { key: 'text', label: 'Risk', type: 'textarea', placeholder: 'What could trigger a Refuse-to-File...', required: true },
      { key: 'fix', label: 'Remediation', type: 'text', placeholder: 'What closes it', required: true },
    ],
  };

  const M1_FORM: C2CFormConfig = {
    eyebrow: 'Module 1 · add document',
    title: 'Add a Module 1 document',
    governed: 'Module 1 administrative documents are governed submission components.',
    submitLabel: 'Add document',
    fields: [
      { key: 'label', label: 'Document', type: 'text', placeholder: 'e.g. Form FDA 356h', required: true },
      { key: 'st', label: 'Status', type: 'seg', options: ['draft', 'review', 'complete'], default: 'draft' },
      { key: 'note', label: 'Note', type: 'text', placeholder: 'Optional context' },
    ],
  };

  const submitRtf = (v: Record<string, string>) => {
    addRtf({ sev: v.sev, area: v.area, text: v.text, fix: v.fix });
    setForm(null);
    setTab('rtf');
    fireToast('Filing risk logged · ' + v.area);
  };

  const submitM1 = (v: Record<string, string>) => {
    addM1({ id: 'm1-' + Date.now(), label: v.label, st: v.st, note: v.note || undefined });
    setForm(null);
    setTab('m1');
    fireToast('Module 1 document added');
  };

  const tabs: [string, string][] = [['ctd', 'CTD readiness'], ['m1', 'Module 1 admin'], ['clock', 'PDUFA review clock'], ['rtf', 'Refuse-to-File risk']];

  /* Context-aware human lead */
  const clockNow = NDA_CLOCK.find(s => s.st === 'current') || NDA_CLOCK.find(s => s.st === 'goal');
  const highs = rtf.filter(r => r.sev === 'high');
  const topHigh = highs[0] || rtf.find(r => r.sev === 'med');
  const gateMod = modules.filter(m => m.gate).sort((a, b) => a.pct - b.pct)[0];
  const openItems = m1open + rtf.filter(r => r.sev !== 'low').length;

  const lead = (
    <AnswerLead
      tone={highs.length ? 'urgent' : 'calm'}
      eyebrow="Are you ready to file NDA 212345 — and what stands in the way"
      headline={highs.length && topHigh
        ? <>You're <b>{overall}% ready</b>, but <b>{topHigh.area.split('·')[1]?.trim() || topHigh.area}</b> would get you refused at the {clockNow ? clockNow.label.toLowerCase() : 'filing'} door.</>
        : <>You're <b>{overall}% ready</b> to file &mdash; no Refuse-to-File blockers left, {openItems} items to tidy before you submit.</>}
      body={highs.length && topHigh
        ? <>The one that matters right now: {topHigh.text.charAt(0).toLowerCase() + topHigh.text.slice(1)} Clear it &mdash; {topHigh.fix.toLowerCase()} &mdash; and the same review that refuses today accepts. {gateMod ? <>Module {gateMod.m} at {gateMod.pct}% is the next thing behind it.</> : null}</>
        : <>You're at the {clockNow ? clockNow.label.toLowerCase() : 'filing'} step ({clockNow ? clockNow.date : '—'}). The remaining items are administrative, not structural &mdash; you're through the hard part.</>}
      reassure={highs.length ? "This is fixable before Day 74. I'll draft each remediation with you, one at a time." : "You're close. I'll help you close out the last items and assemble the sequence."}
      action={{
        label: highs.length ? 'Fix the filing risks with AnA' : 'Draft the final readiness plan',
        onClick: () => ask && ask(highs.length && topHigh
          ? 'Draft a mitigation plan for the ' + topHigh.area + ' Refuse-to-File risk: ' + topHigh.text
          : 'Draft the final NDA 212345 readiness plan for the open administrative items'),
        alt: { label: 'See Refuse-to-File risks', onClick: () => setTab('rtf') },
      }}
      secondary="Or work the readiness detail below."
    />
  );

  return (
    <div className="cv-body"><div className="reg-wrap nda">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Pharma {I.dot} filing <SampleTag sample={modulesSample} />
          </div>
          <h1 className="reg-title">NDA filing cockpit</h1>
          <p className="reg-intro">BX-204 {I.dot} NDA 212345 {I.dot} 505(b)(1) {I.dot} standard review. The complete application on one surface &mdash; CTD Module 1-5 readiness, the Module 1 administrative set, the PDUFA review clock, and Refuse-to-File risk.</p>
        </div>
        {ask && <button className="reg-cta" onClick={() => ask('Assess NDA 212345 filing readiness and the top Refuse-to-File risks')}>{I.sparkles} Assess with AnA</button>}
      </div>

      {lead}

      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">{overall}%</div><div className="reg-kpi-l">Application readiness</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">Day 60</div><div className="reg-kpi-l">Filing review {I.dot} PDUFA Day 304</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v" data-tone="warn">{m1open}</div><div className="reg-kpi-l">Module 1 admin open</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v" data-tone="err">1</div><div className="reg-kpi-l">High RTF risk</div></div>
      </div>

      <div className="reg-tabs">
        {tabs.map(([id, l]) => (
          <button key={id} className={'reg-tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {tab === 'ctd' && (
        <div className="nda-mods">
          {modules.map(m => (
            <button key={m.m} className="nda-mod" onClick={() => open('dossier')}>
              <div className="nda-mod-n">M{m.m}</div>
              <div className="nda-mod-b">
                <div className="nda-mod-top"><span className="nda-mod-l">{m.label}</span><span className="nda-mod-pct">{m.pct}%</span></div>
                <div className="nda-mod-track"><span className="nda-mod-fill" data-risk={m.gate ? true : undefined} style={{ width: m.pct + '%' }} /></div>
                <div className="nda-mod-meta">
                  <span>{m.docs} documents {I.dot} {m.open} open</span>
                  {m.gate ? <span className="nda-mod-gate">{I.alertTriangle} {m.gate}</span> : <span className="nda-mod-ok">{I.check} module complete</span>}
                </div>
              </div>
              <span className="nda-mod-go">{I.arrowRight || I.right}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'm1' && (
        <div className="reg-card">
          <div className="reg-card-h"><span>Module 1 &mdash; administrative &amp; prescribing (21 CFR 314.50)</span><span className="reg-card-s" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Form 356h + required admin documents<button className="nda-open" onClick={() => setForm('m1')}>{I.plus} Add document</button></span></div>
          <table className="reg-tbl">
            <thead><tr><th>Document</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {m1.map(d => (
                <tr key={d.id} className={d._new ? 'de-row-new' : undefined} data-blocker={d.blocker || undefined}>
                  <td><div className="nda-m1-l">{d.label}</div>{d.note && <div className="nda-m1-note">{d.note}</div>}</td>
                  <td><span className={'reg-pill ' + d.st}>{d.st === 'na' ? 'N/A' : d.st}</span>{d.blocker && <span className="nda-blk">{I.alertTriangle} blocks filing</span>}</td>
                  <td style={{ textAlign: 'right' }}>{d.st !== 'na' && <button className="nda-open" onClick={() => open('dossier')}>Open {I.arrowRight || I.right}</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'clock' && (
        <div className="reg-card">
          <div className="reg-card-h"><span>PDUFA review clock &mdash; standard review (10-month)</span><span className="reg-card-s">Filing Day 60 → action Day 304</span></div>
          <div className="nda-clock">
            {NDA_CLOCK.map((s, i) => (
              <div key={s.id} className="nda-ck-step" data-st={s.st}>
                <div className="nda-ck-rail"><div className="nda-ck-dot">{s.st === 'done' ? I.check : s.st === 'goal' ? (I.flag || I.target) : i + 1}</div>{i < NDA_CLOCK.length - 1 && <div className="nda-ck-line" />}</div>
                <div className="nda-ck-b">
                  <div className="nda-ck-top"><span className="nda-ck-l">{s.label}</span><span className="nda-ck-day">{s.day}</span></div>
                  <div className="nda-ck-date">{s.date}{s.note ? ' · ' + s.note : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'rtf' && (
        <div className="reg-card">
          <div className="reg-card-h"><span>Refuse-to-File risk &mdash; shadow review of the 60-day filing decision</span><span style={{ display: 'flex', gap: 8 }}><button className="nda-open" onClick={() => setForm('rtf')}>{I.plus} Log risk</button>{ask && <button className="nda-open" onClick={() => ask('Draft a filing-risk mitigation plan for the open NDA Refuse-to-File items')}>{I.sparkles} Mitigation plan</button>}</span></div>
          <div className="nda-rtf">
            {rtf.map((r, i) => (
              <div key={i} className={'nda-rtf-row' + (r._new ? ' de-row-new' : '')} data-sev={r.sev}>
                <span className="nda-rtf-sev">{r.sev}</span>
                <div className="nda-rtf-b">
                  <div className="nda-rtf-area">{r.area}</div>
                  <div className="nda-rtf-t">{r.text}</div>
                  <div className="nda-rtf-fix">{I.arrowRight || I.right} {r.fix}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {form === 'rtf' && <C2CForm config={RTF_FORM} onCancel={() => setForm(null)} onSubmit={submitRtf} />}
      {form === 'm1' && <C2CForm config={M1_FORM} onCancel={() => setForm(null)} onSubmit={submitM1} />}
      <C2CToast msg={toast} />
    </div></div>
  );
}
