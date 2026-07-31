import React, { useState, useEffect, useRef } from 'react';
import { I } from '../icons';
import { useLiveData, useLiveRows, EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
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
  id?: string;
  sev: string;
  area: string;
  text: string;
  fix: string;
  _new?: boolean;
}

interface BlaAssessment {
  id: string;
  kind: string;
  title?: string | null;
  modality?: string | null;
  reference_product?: string | null;
  target_agency?: string | null;
  verdict?: string | null;
  status: string;
  program_id?: string | null;
}

/* ── Inline surface constants ── */

/* The CTD module readiness (M1–M5), the Module-1 admin worklist, the
   Refuse-to-File risk log, and the BLA 351(a) biologics assessments are all read
   fixture-free from their real, org-scoped stores (see the hooks below) — real
   data, an honest empty state, or an honest failed-load state, never a
   fabricated stand-in. The PDUFA review-clock steps below remain the surface's
   own local list: there is no clock store to read (nda-cockpit.routes.ts and
   bla-workbench.ts back every other panel; neither exposes a clock). */

const NDA_CLOCK: NdaClockStep[] = [
  { id: 'sub', label: 'Submission received', day: 'Day 0', date: '14 Jul 2026', st: 'done' },
  { id: 'file', label: 'Filing decision (RTF / 74-day letter)', day: 'Day 60', date: '12 Sep 2026', st: 'current', note: 'Filing review — RTF risk assessment open' },
  { id: 'mid', label: 'Mid-cycle communication', day: '~Day 150', date: 'Dec 2026', st: 'upcoming' },
  { id: 'late', label: 'Late-cycle meeting', day: '~Day 240', date: 'Mar 2027', st: 'upcoming' },
  { id: 'adcom', label: 'Advisory committee (if convened)', day: '~Day 270', date: 'Apr 2027', st: 'upcoming' },
  { id: 'goal', label: 'PDUFA goal date (action)', day: 'Day 304', date: '14 May 2027', st: 'goal' },
];

/* Biologics (BLA 351(a)) science-engine assessments — the biosimilar/biologic
   analytical-similarity, comparability, immunogenicity, and RTF/CRL filing-risk
   verdicts produced by /api/biopharma/bla and persisted org-scoped to
   c2c_bla_assessments. Read fixture-free below from
   GET /api/biopharma/bla/assessments: real rows, an honest empty state, or an
   honest failed-load state. The two maps here are display helpers (a kind→label
   map and a passing-verdict allowlist), not data. */
const BLA_KIND_LABEL: Record<string, string> = {
  analytical_similarity: 'Analytical similarity (CQA tiering)',
  comparability: 'Comparability (Q5E / post-change)',
  immunogenicity: 'Immunogenicity (ADA / NAb risk)',
  filing_risk: 'BLA filing risk (RTF / CRL)',
};

/* Only an explicit allowlist of passing verdicts renders green — every other
   value (moderate/medium/high/critical CRL risk, not_comparable,
   not_demonstrated, insufficient_data, elevated ADA risk, or any unknown
   string) is styled as attention, never as a false "complete". An unresolved
   biologics blocker must never present as green. Verdicts come from the engines:
   similarity `conclusion`, comparability `conclusion`, immunogenicity
   `risk.tier`, filing-risk `crlRisk`. */
const BLA_PASSING_VERDICTS = new Set(['similar', 'comparable', 'low', 'minimal', 'negligible', 'none']);
const isPassingBlaVerdict = (v?: string | null): boolean => !!v && BLA_PASSING_VERDICTS.has(v.toLowerCase());

/* ── Inline shared kit helpers ── */

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
  /* Real rows — the org's CTD module (M1–M5) readiness, assembled from the real
     eCTD submission core (submissions where application_type IN ('nda','bla') +
     ectd_sequences + submission_leaves + coauthor_documents) by
     GET /api/nda-cockpit/modules. Fixture-free: real data, an honest empty
     state, or an honest failed-load state — never a fabricated stand-in. The
     overall % ready is derived from the loaded rows. The M1 worklist, PDUFA
     clock, and RtF log stay the surface's own lists. */
  const modulesLive = useLiveRows<NdaModule>('/api/nda-cockpit/modules');
  const modules = modulesLive.rows;
  const overall = modules.length
    ? Math.round(modules.reduce((a, m) => a + m.pct, 0) / modules.length)
    : 0;
  /* Real rows — the org's Refuse-to-File risk log (org-scoped DB read that
     fails closed to an empty list). The list stays locally mutable so a logged
     risk appears immediately, and the POST persists it. Seed the local list
     once, when the read settles. */
  const rtfLive = useLiveRows<NdaRtfItem>('/api/nda-cockpit/rtf');
  const rtfIsLive = !rtfLive.error;
  const [rtf, setRtf] = useState<NdaRtfItem[]>([]);
  const rtfSeeded = useRef(false);
  useEffect(() => {
    if (!rtfLive.loading && !rtfSeeded.current) {
      rtfSeeded.current = true;
      setRtf(rtfLive.rows.map((r) => ({ ...r })));
    }
  }, [rtfLive.loading, rtfLive.rows]);
  const addRtf = (r: NdaRtfItem) => {
    const row: NdaRtfItem = { ...r, _new: true };
    setRtf((rs) => [row, ...rs]);
    setTimeout(() => setRtf((rs) => rs.map((x) => (x === row ? { ...x, _new: false } : x))), 1500);
  };
  /* Real rows — the org's Module-1 admin worklist (org-scoped DB read that
     fails closed to an empty list). The list stays locally mutable so an added
     document appears immediately, and the POST persists it. Seed the local list
     once, when the read settles. */
  const m1Live = useLiveRows<NdaM1Doc>('/api/nda-cockpit/m1');
  const m1IsLive = !m1Live.error;
  const [m1, setM1] = useState<NdaM1Doc[]>([]);
  const m1Seeded = useRef(false);
  useEffect(() => {
    if (!m1Live.loading && !m1Seeded.current) {
      m1Seeded.current = true;
      setM1(m1Live.rows.map((r) => ({ ...r })));
    }
  }, [m1Live.loading, m1Live.rows]);
  const addM1 = (r: NdaM1Doc) => {
    const row: NdaM1Doc = { ...r, _new: true };
    setM1((rs) => [row, ...rs]);
    setTimeout(() => setM1((rs) => rs.map((x) => (x === row ? { ...x, _new: false } : x))), 1500);
  };
  /* Real rows — the org's BLA 351(a) biologics assessments, read fixture-free
     from GET /api/biopharma/bla/assessments (org-scoped read of
     c2c_bla_assessments). That endpoint returns { assessments: [...] } rather
     than the standard { data } envelope, so read the object payload and take the
     list off it. Read-only here — assessments are authored and Part 11-signed in
     the biologics workbench. Real data, an honest empty state, or an honest
     failed-load state — never a fabricated stand-in. */
  const blaLive = useLiveData<{ assessments?: BlaAssessment[] }>('/api/biopharma/bla/assessments');
  const blaList = blaLive.data?.assessments;
  const bla: BlaAssessment[] = Array.isArray(blaList) ? blaList : [];

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

  const submitRtf = async (v: Record<string, string>) => {
    setForm(null);
    setTab('rtf');
    const local = (): NdaRtfItem => ({ id: 'rtf-' + Date.now(), sev: v.sev, area: v.area, text: v.text, fix: v.fix });
    if (!rtfIsLive) {
      // Read failed (no org/session) — nothing to persist to; show it locally
      // and say so instead of faking success.
      addRtf(local());
      fireToast('Filing risk logged · ' + v.area + ' · shown locally, not persisted');
      return;
    }
    try {
      const res = await apiRequest('POST', '/api/nda-cockpit/rtf', {
        area: v.area,
        text: v.text,
        sev: v.sev,
        fix: v.fix,
      });
      if (!res.ok) {
        addRtf(local());
        fireToast('Could not log filing risk · sign in required — shown locally, not persisted');
        return;
      }
      const body = await res.json().catch(() => null);
      const row = body?.data;
      // Adopt the persisted row (server-generated id) when returned, else the local shape.
      addRtf(row && typeof row.area === 'string' ? (row as NdaRtfItem) : local());
      fireToast('Filing risk logged · ' + v.area);
    } catch (e) {
      // apiRequest throws on non-OK with the server's reason. Fall back to local
      // and say it did not persist — never report a write that did not happen.
      addRtf(local());
      fireToast(
        'Could not log filing risk · ' +
          (e instanceof Error && e.message ? e.message : 'request failed') +
          ' — shown locally, not persisted',
      );
    }
  };

  const submitM1 = async (v: Record<string, string>) => {
    setForm(null);
    setTab('m1');
    const local = (): NdaM1Doc => ({ id: 'm1-' + Date.now(), label: v.label, st: v.st, note: v.note || undefined });
    if (!m1IsLive) {
      // Read failed (no org/session) — nothing to persist to; show it locally
      // and say so instead of faking success.
      addM1(local());
      fireToast('Module 1 document added · shown locally, not persisted');
      return;
    }
    try {
      const res = await apiRequest('POST', '/api/nda-cockpit/m1', {
        label: v.label,
        st: v.st,
        note: v.note || undefined,
      });
      if (!res.ok) {
        addM1(local());
        fireToast('Could not save Module 1 document · sign in required — shown locally, not persisted');
        return;
      }
      const body = await res.json().catch(() => null);
      const row = body?.data;
      // Adopt the persisted row (server-generated id) when returned, else the local shape.
      addM1(row && typeof row.id === 'string' ? (row as NdaM1Doc) : local());
      fireToast('Module 1 document added');
    } catch (e) {
      // apiRequest throws on non-OK with the server's reason. Fall back to local
      // and say it did not persist — never report a write that did not happen.
      addM1(local());
      fireToast(
        'Could not save Module 1 document · ' +
          (e instanceof Error && e.message ? e.message : 'request failed') +
          ' — shown locally, not persisted',
      );
    }
  };

  const tabs: [string, string][] = [['ctd', 'CTD readiness'], ['m1', 'Module 1 admin'], ['clock', 'PDUFA review clock'], ['rtf', 'Refuse-to-File risk'], ['bla', 'BLA biologics']];

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
          <div className="reg-eyebrow">
            Pharma {I.dot} filing
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
        <div className="reg-kpi"><div className="reg-kpi-v" data-tone={highs.length ? 'err' : undefined}>{highs.length}</div><div className="reg-kpi-l">High RTF risk</div></div>
      </div>

      <div className="reg-tabs">
        {tabs.map(([id, l]) => (
          <button key={id} className={'reg-tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {tab === 'ctd' && (
        modules.length > 0 ? (
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
        ) : modulesLive.loading ? (
          <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading CTD module readiness…</div>
        ) : modulesLive.error ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load CTD module readiness"
            hint="The NDA/BLA submission core didn't respond. Sign in and retry, or check that the NDA cockpit service is reachable."
          />
        ) : (
          <EmptyState
            icon={I.fileText}
            title="No CTD modules yet"
            hint="No NDA/BLA application is provisioned for this organization yet. Once a submission is set up and its eCTD sections are authored, each CTD module's readiness (M1–M5) appears here org-scoped with its real completion and gating items."
          />
        )
      )}

      {tab === 'm1' && (
        <div className="reg-card">
          <div className="reg-card-h"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Module 1 &mdash; administrative &amp; prescribing (21 CFR 314.50)</span><span className="reg-card-s" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Form 356h + required admin documents<button className="nda-open" onClick={() => setForm('m1')}>{I.plus} Add document</button></span></div>
          {m1.length > 0 ? (
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
          ) : m1Live.loading ? (
            <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading Module 1 documents…</div>
          ) : m1Live.error ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load Module 1 documents"
              hint="The Module 1 administrative store didn't respond. Sign in and retry, or check that the NDA cockpit service is reachable."
            />
          ) : (
            <EmptyState
              icon={I.fileText}
              title="No Module 1 documents yet"
              hint="Add the Form FDA 356h and the required administrative documents (21 CFR 314.50). Each appears here org-scoped with its real filing status."
            />
          )}
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
          <div className="reg-card-h"><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Refuse-to-File risk &mdash; shadow review of the 60-day filing decision</span><span style={{ display: 'flex', gap: 8 }}><button className="nda-open" onClick={() => setForm('rtf')}>{I.plus} Log risk</button>{ask && <button className="nda-open" onClick={() => ask('Draft a filing-risk mitigation plan for the open NDA Refuse-to-File items')}>{I.sparkles} Mitigation plan</button>}</span></div>
          {rtf.length > 0 ? (
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
          ) : rtfLive.loading ? (
            <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading Refuse-to-File risks…</div>
          ) : rtfLive.error ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load Refuse-to-File risks"
              hint="The filing-risk store didn't respond. Sign in and retry, or check that the NDA cockpit service is reachable."
            />
          ) : (
            <EmptyState
              icon={I.shieldCheck}
              title="No refuse-to-file items"
              hint="No filing-risk items are logged for this application. Log a risk above to shadow-review the 60-day filing decision, or ask AnA to assess the submission for Refuse-to-File triggers."
            />
          )}
        </div>
      )}

      {tab === 'bla' && (
        <div className="reg-card">
          <div className="reg-card-h">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              BLA 351(a) biologics &mdash; science-engine assessments
            </span>
            <span className="reg-card-s" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              Analytical similarity · comparability · immunogenicity · filing risk
              {ask && <button className="nda-open" onClick={() => ask('Run the BLA filing-risk (RTF/CRL) assessment for the biologics program and summarize the top triggers')}>{I.sparkles} Assess filing risk</button>}
            </span>
          </div>
          {bla.length > 0 ? (
            <>
              <table className="reg-tbl">
                <thead><tr><th>Assessment</th><th>Modality</th><th>Verdict</th><th>Status</th></tr></thead>
                <tbody>
                  {bla.map(a => (
                    <tr key={a.id}>
                      <td>
                        <div className="nda-m1-l">{BLA_KIND_LABEL[a.kind] || a.kind}</div>
                        {a.title && <div className="nda-m1-note">{a.title}{a.target_agency ? ' · ' + a.target_agency : ''}</div>}
                      </td>
                      <td>{a.modality || '—'}</td>
                      <td>{a.verdict ? <span className={'reg-pill ' + (isPassingBlaVerdict(a.verdict) ? 'complete' : 'review')}>{a.verdict.replace(/_/g, ' ')}</span> : '—'}</td>
                      <td><span className={'reg-pill ' + (a.status === 'signed' ? 'complete' : 'draft')}>{a.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="scaf-note" style={{ marginTop: 10 }}>
                The three biologics science engines (CQA-tiered analytical similarity, Q5E comparability, ADA/NAb
                immunogenicity) and the RTF/CRL filing-risk profile are deterministic functions of the submitted data,
                authored and Part 11-signed in the biologics workbench (<code>/api/biopharma/bla</code>). This tab reflects
                the org's persisted assessments &mdash; it never fabricates a verdict.
              </p>
            </>
          ) : blaLive.loading ? (
            <div className="scaf-note" style={{ padding: '18px 10px' }}>Loading BLA biologics assessments…</div>
          ) : blaLive.error ? (
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="Couldn't load BLA biologics assessments"
              hint="The biologics assessment store didn't respond. Sign in and retry, or check that the biologics workbench service is reachable."
            />
          ) : (
            <EmptyState
              icon={I.fileText}
              title="No BLA biologics assessments yet"
              hint="No 351(a) biologics assessments have been run for this organization yet. The analytical-similarity, comparability, immunogenicity, and filing-risk engines are authored and Part 11-signed in the biologics workbench; once an assessment is persisted here org-scoped, it appears with its verdict."
            />
          )}
        </div>
      )}

      {form === 'rtf' && <C2CForm config={RTF_FORM} onCancel={() => setForm(null)} onSubmit={submitRtf} />}
      {form === 'm1' && <C2CForm config={M1_FORM} onCancel={() => setForm(null)} onSubmit={submitM1} />}
      <C2CToast msg={toast} />
    </div></div>
  );
}
