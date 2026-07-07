import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Inline fixture types ── */

interface LpSection {
  n: string;
  label: string;
  st: string;
  flag?: string;
}

interface LpContent {
  heading: string;
  body: string[];
  hl?: boolean;
  warn?: boolean;
}

interface LpNegotiation {
  round: string;
  cycle: string;
  sponsor: string;
  agency: string;
  rationale: string;
}

/* ── Inline fixture data (kit-identical) ── */

const LP_STAGES = ['Draft', 'FDA labeling review', 'Negotiation', 'Approved'];

/* USPI -- PLLR / 21 CFR 201.57 full prescribing information (17 sections) */
const LP_SECTIONS: LpSection[] = [
  { n: 'HL', label: 'Highlights of prescribing information', st: 'review' },
  { n: 'BW', label: 'Boxed warning', st: 'negotiation', flag: 'agency' },
  { n: '1', label: 'Indications and usage', st: 'negotiation', flag: 'agency' },
  { n: '2', label: 'Dosage and administration', st: 'review' },
  { n: '3', label: 'Dosage forms and strengths', st: 'approved' },
  { n: '4', label: 'Contraindications', st: 'approved' },
  { n: '5', label: 'Warnings and precautions', st: 'review' },
  { n: '6', label: 'Adverse reactions', st: 'review' },
  { n: '7', label: 'Drug interactions', st: 'draft' },
  { n: '8', label: 'Use in specific populations', st: 'negotiation', flag: 'agency' },
  { n: '9', label: 'Drug abuse and dependence', st: 'na' },
  { n: '10', label: 'Overdosage', st: 'draft' },
  { n: '11', label: 'Description', st: 'approved' },
  { n: '12', label: 'Clinical pharmacology', st: 'review' },
  { n: '13', label: 'Nonclinical toxicology', st: 'draft' },
  { n: '14', label: 'Clinical studies', st: 'review' },
  { n: '16', label: 'How supplied / storage and handling', st: 'approved' },
  { n: '17', label: 'Patient counseling information', st: 'draft' },
];

/* Rendered content per section (the actual label text) */
const LP_CONTENT: Record<string, LpContent> = {
  HL: { heading: 'Highlights of prescribing information', body: [
    'These highlights do not include all the information needed to use BX-204 safely and effectively. See full prescribing information for BX-204.',
    'BX-204 (rezatinib) injection, for intravenous use. Initial U.S. Approval: 2026',
  ], hl: true },
  BW: { heading: 'Boxed warning -- severe infusion-related reactions', body: [
    'Severe, life-threatening infusion-related reactions have occurred. Premedicate and monitor. Interrupt or discontinue for severe reactions. (5.1)',
  ], warn: true },
  '1': { heading: '1  Indications and usage', body: [
    'BX-204 is indicated for the treatment of adult patients with advanced RTK-X-overexpressing solid tumors who have received at least one prior line of systemic therapy.',
    'This indication is approved under accelerated approval based on overall response rate and duration of response. Continued approval may be contingent upon verification and description of clinical benefit in a confirmatory trial.',
  ] },
  '8': { heading: '8  Use in specific populations', body: [
    '8.1 Pregnancy -- Based on its mechanism of action, BX-204 can cause fetal harm. Advise pregnant women of the potential risk to a fetus.',
    '8.4 Pediatric use -- Safety and effectiveness in pediatric patients have not been established.',
  ] },
};

/* The end-of-review labeling negotiation -- sponsor text vs FDA's proposed redline */
const LP_NEGOTIATION: Record<string, LpNegotiation> = {
  '1': { round: 'Labeling round 2', cycle: 'FDA -- day 312 of review',
    sponsor: 'BX-204 is indicated for the treatment of adult patients with advanced RTK-X-overexpressing solid tumors.',
    agency: 'BX-204 is indicated for the treatment of adult patients with advanced RTK-X-overexpressing solid tumors who have received at least one prior line of systemic therapy.',
    rationale: 'FDA proposes restricting the indicated population to second-line+ to align with the pivotal trial enrollment (BX204-201). Accepting narrows the indication; countering requires first-line efficacy data.' },
  BW: { round: 'Labeling round 2', cycle: 'FDA -- day 312 of review',
    sponsor: '(no boxed warning proposed)',
    agency: 'BOXED WARNING: Severe, life-threatening infusion-related reactions have occurred...',
    rationale: 'FDA proposes adding a Boxed Warning based on 4 Grade >=3 infusion reactions in the safety database. AnA assessment: defensible to counter to a §5.1 Warning given the manageable, premedication-responsive profile -- but precedent in this class favors the boxed warning.' },
  '8': { round: 'Labeling round 1', cycle: 'FDA -- day 286 of review',
    sponsor: '8.4 Pediatric use -- Safety and effectiveness in pediatric patients have not been established. A pediatric study is planned under the iPSP.',
    agency: '8.4 Pediatric use -- Safety and effectiveness in pediatric patients have not been established.',
    rationale: 'FDA proposes removing the forward-looking iPSP sentence from labeling (belongs in the PMR, not the PI). Low-stakes -- accept.' },
};

/* ════ Labeling PI -- prescribing information surface ════ */

export function LabelingPI({ onAsk }: SurfaceViewProps) {
  const [fmt, setFmt] = useState('uspi');
  const [active, setActive] = useState('1');
  const [stage, setStage] = useState('Negotiation');
  const stIdx = LP_STAGES.indexOf(stage);
  const sec = LP_SECTIONS.find(s => s.n === active) || LP_SECTIONS[2];
  const content = LP_CONTENT[active] || { heading: sec.n + '  ' + sec.label, body: ['Section content is maintained in the structured label and rendered here. Open in the editor to author, or ask AnA to draft from the clinical and safety files.'] };
  const neg = LP_NEGOTIATION[active];
  const agencyOpen = LP_SECTIONS.filter(s => s.flag === 'agency').length;

  return (
    <div className="reg-wrap lp">
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Platform -- authoring</div>
          <h1 className="reg-title">Labeling -- prescribing information</h1>
          <p className="reg-sub">The label itself -- PLLR / 21 CFR 201.57 (USPI), EU SmPC (QRD), and SPL for submission. The highest-stakes document of the review, negotiated with the agency at end of cycle.</p>
        </div>
        <button className="reg-cta" onClick={() => onAsk && onAsk('Draft the BX-204 USPI from the clinical studies, safety file, and CMC')}>{I.sparkles} Draft with AnA</button>
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">PLLR</div><div className="reg-kpi-l">USPI format -- 21 CFR 201.57</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">17</div><div className="reg-kpi-l">Full PI sections</div></div>
        <div className="reg-kpi" data-tone="warn"><div className="reg-kpi-v">{agencyOpen}</div><div className="reg-kpi-l">Open agency edits</div></div>
        <div className="reg-kpi" data-tone="err"><div className="reg-kpi-v">1</div><div className="reg-kpi-l">Boxed warning proposed</div></div>
      </div>

      <div className="lp-fmt">
        {([['uspi', 'USPI -- PLLR'], ['smpc', 'EU SmPC -- QRD'], ['spl', 'SPL -- submission']] as [string, string][]).map(([id, l]) => (
          <button key={id} className={'lp-fmt-b' + (fmt === id ? ' on' : '')} onClick={() => setFmt(id)}>{l}</button>
        ))}
        <div className="lp-stages">
          {LP_STAGES.map((s, i) => (
            <button key={s} className={'lp-stage' + (i === stIdx ? ' on' : '') + (i < stIdx ? ' done' : '')} onClick={() => setStage(s)}>
              <span className="lp-stage-dot">{i < stIdx ? I.check : i + 1}</span>{s}
            </button>
          ))}
        </div>
      </div>

      <div className="lp-split">
        <aside className="lp-tree">
          <div className="lp-tree-h">Label sections</div>
          {LP_SECTIONS.map(s => (
            <button key={s.n} className={'lp-sec' + (s.n === active ? ' on' : '')} data-st={s.st} onClick={() => setActive(s.n)}>
              <span className="lp-sec-n">{s.n}</span>
              <span className="lp-sec-l">{s.label}</span>
              {s.flag === 'agency' && <span className="lp-sec-flag" title="FDA proposed an edit">{I.gitBranch || I.alertTriangle}</span>}
              <span className="lp-sec-dot" data-st={s.st} />
            </button>
          ))}
        </aside>

        <div className="lp-main">
          <div className="lp-doc">
            <div className="lp-doc-bar">
              <span className="lp-doc-id">BX-204 (rezatinib) -- USPI -- v3.2</span>
              <div className="lp-doc-acts">
                <button className="reg-mini">{I.fileText} PDF</button>
                <button className="reg-mini">{I.download} Word</button>
                <button className="reg-mini" onClick={() => onAsk && onAsk('Open §' + active + ' of the BX-204 USPI in the editor')}>{I.penLine} Open in editor</button>
              </div>
            </div>
            <div className={'lp-page' + (content.hl ? ' hl' : '')}>
              {content.warn && <div className="lp-bw">{content.body[0]}</div>}
              {!content.warn && <>
                <div className="lp-page-h">{content.heading}</div>
                {content.body.map((p, i) => <p key={i} className="lp-page-p">{p}</p>)}
              </>}
              {content.hl && <div className="lp-hl-note">Highlights are a concise summary; see the numbered full prescribing information for complete labeling.</div>}
            </div>
          </div>

          {neg && (
            <div className="lp-neg">
              <div className="lp-neg-h">
                <span className="lp-neg-t">{I.gitBranch || I.alertTriangle} Agency labeling negotiation -- §{active}</span>
                <span className="lp-neg-m">{neg.round} -- {neg.cycle}</span>
              </div>
              <div className="lp-neg-diff">
                <div className="lp-neg-row sponsor"><span className="lp-neg-tag">Sponsor</span><p>{neg.sponsor}</p></div>
                <div className="lp-neg-row agency"><span className="lp-neg-tag">FDA proposed</span><p>{neg.agency}</p></div>
              </div>
              <div className="lp-neg-rat"><span>{I.sparkles}</span><p>{neg.rationale}</p></div>
              <div className="lp-neg-acts">
                <button className="reg-btn pri">{I.check} Accept FDA text</button>
                <button className="reg-btn" onClick={() => onAsk && onAsk('Draft a counter-proposal to FDA labeling edit on §' + active)}>Counter with AnA</button>
                <button className="reg-btn ghost">View full redline</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
