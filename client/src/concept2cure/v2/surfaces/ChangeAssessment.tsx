import React, { useState } from 'react';
import { I } from '../icons';
import { SampleTag } from '../dataConnect';
import type { SurfaceViewProps } from '../surfaceViews';
import '../styles/project-home-v2.css';

/* ── Types ── */

interface ChangeStep {
  q: string;
  basis: string;
  a: string;
  detail: string;
  gate?: boolean;
}

interface ChangeDecisionData {
  steps: ChangeStep[];
  outcome: string;
  label: string;
  rationale: string;
}

interface ChangeDoc {
  kind: string;
  status: string;
}

interface ChangeItem {
  id: string;
  title: string;
  device: string;
  area: string;
  raised: string;
  owner: string;
  fda: ChangeDecisionData;
  eu: ChangeDecisionData;
  doc: ChangeDoc;
}

/* ── Inline fixture data (kit window globals, verbatim) ── */

const CHANGE_ITEMS: ChangeItem[] = [
  {
    id: 'CH-118', title: 'Add predictive-low glucose alert algorithm', device: 'BX-204 CGM', area: 'Software / labeling',
    raised: '2026-06-10', owner: 'R. Okafor',
    fda: {
      steps: [
        { q: 'Is the change made to address a safety issue (e.g. recall/CAPA)?', basis: 'Flowchart A', a: 'no', detail: 'Feature enhancement, not corrective.' },
        { q: 'Could the change significantly affect clinical functionality or performance specs?', basis: 'Flowchart A.3', a: 'yes', detail: 'A new algorithmic output (predictive low) that drives a clinical alert is a new functional claim.' },
        { q: 'Does a risk-based assessment show new/increased risk not addressed by existing controls?', basis: 'Flowchart A.4', a: 'yes', gate: true, detail: 'False-negative predictive alert is a new hazard not in the cleared risk file.' },
      ],
      outcome: 'new-submission', label: 'New 510(k) required', rationale: 'A new clinical functional claim with a new risk profile exceeds the "could significantly affect" threshold -- a new 510(k) is required before marketing the feature.',
    },
    eu: {
      steps: [
        { q: 'Change to intended purpose?', basis: 'MDCG 2020-3 Chart', a: 'no', detail: 'Intended purpose (CGM for diabetes management) unchanged.' },
        { q: 'Change to design/performance affecting safety/benefit-risk?', basis: 'Chart A S1', a: 'yes', gate: true, detail: 'New algorithm affects performance and benefit-risk -- significant.' },
      ],
      outcome: 'nb-notify', label: 'Significant change -- NB notification', rationale: 'Per MDCG 2020-3 this is a significant change to design/performance; the notified body must be notified and assess before the change is placed on the EU market.',
    },
    doc: { kind: 'New 510(k) + MDR significant-change file', status: 'draft' },
  },
  {
    id: 'CH-121', title: 'Change sensor adhesive supplier (equivalent material)', device: 'BX-204 CGM', area: 'Manufacturing / materials',
    raised: '2026-06-14', owner: 'M. Webb',
    fda: {
      steps: [
        { q: 'Is the change made to address a safety issue?', basis: 'Flowchart A', a: 'no', detail: 'Supply-chain change.' },
        { q: 'Change in materials with body contact?', basis: 'Flowchart C', a: 'yes', detail: 'Skin-contact adhesive -- new supplier.' },
        { q: 'Same material chemistry & biocompatibility profile (per risk-based assessment)?', basis: 'Flowchart C.2', a: 'yes', gate: true, detail: 'Identical chemistry; ISO 10993-10/-23 re-test passed equivalent. No new biocompatibility risk.' },
      ],
      outcome: 'letter-to-file', label: 'Document to file (no new 510(k))', rationale: 'Materials change with equivalent chemistry and passing biocompatibility re-test does not significantly affect safety/effectiveness -- document the rationale in a Letter to File per the 2017 guidance.',
    },
    eu: {
      steps: [
        { q: 'Change to intended purpose?', basis: 'MDCG 2020-3', a: 'no', detail: 'Unchanged.' },
        { q: 'Change of material that adversely affects safety/performance or biocompatibility?', basis: 'Chart C', a: 'no', gate: true, detail: 'Equivalent material, biocompatibility maintained.' },
      ],
      outcome: 'record-only', label: 'Non-significant -- internal change record', rationale: 'Not a significant change under MDCG 2020-3; record under the QMS change-control process and update the technical documentation. No prior NB notification required.',
    },
    doc: { kind: 'Letter to File + QMS change record', status: 'in-review' },
  },
  {
    id: 'CH-126', title: 'Update IFU -- add pediatric (age >= 7) indication wording', device: 'BX-204 CGM', area: 'Labeling / indications',
    raised: '2026-06-18', owner: 'A. Mueller',
    fda: {
      steps: [
        { q: 'Is the change made to address a safety issue?', basis: 'Flowchart A', a: 'no', detail: 'Labeling expansion.' },
        { q: 'Change to indications for use / intended patient population?', basis: 'Flowchart B', a: 'yes', gate: true, detail: 'New pediatric population is a change to indications for use.' },
      ],
      outcome: 'new-submission', label: 'New 510(k) required', rationale: 'A change to the indications for use / intended patient population is a per-se trigger for a new 510(k) under the 2017 guidance, regardless of risk assessment.',
    },
    eu: {
      steps: [
        { q: 'Change to intended purpose / indication?', basis: 'MDCG 2020-3', a: 'yes', gate: true, detail: 'New patient population = change of intended purpose.' },
      ],
      outcome: 'nb-notify', label: 'Significant change -- NB notification', rationale: 'Extension of intended purpose to a new population is significant; NB notification and assessment required before EU marketing.',
    },
    doc: { kind: 'New 510(k) (indications) + MDR significant-change file', status: 'planned' },
  },
];

const CA_OUT: Record<string, { tone: string; ic: string }> = {
  'new-submission': { tone: 'err', ic: 'alertTriangle' },
  'nb-notify':      { tone: 'err', ic: 'alertTriangle' },
  'letter-to-file': { tone: 'ok',  ic: 'fileCheck' },
  'record-only':    { tone: 'ok',  ic: 'fileCheck' },
};

/* ── Inner components ── */

interface ChangeDecisionProps {
  title: string;
  flag: string;
  dec: ChangeDecisionData;
}

function ChangeDecision({ title, flag, dec }: ChangeDecisionProps) {
  const out = CA_OUT[dec.outcome] || { tone: 'warn', ic: 'minus' };
  return (
    <div className="chg-dec">
      <div className="chg-dec-h"><span className="chg-flag">{flag}</span>{title}</div>
      <div className="chg-steps">
        {dec.steps.map((s, i) => (
          <div key={i} className="chg-step" data-a={s.a} data-gate={s.gate || undefined}>
            <div className="chg-step-node">{s.a === 'yes' ? I.check : s.a === 'no' ? I.minus : i + 1}</div>
            <div className="chg-step-body">
              <div className="chg-step-q"><span>{s.q}</span><span className="chg-step-a" data-a={s.a}>{s.a === 'yes' ? 'Yes' : 'No'}</span></div>
              <div className="chg-step-d">{s.detail}</div>
              <div className="chg-step-b">{s.gate ? 'Decision gate -- ' : ''}{s.basis}</div>
            </div>
          </div>
        ))}
      </div>
      <div className={`chg-out ${out.tone}`}>
        <span className="chg-out-ic">{(I as Record<string, React.ReactElement>)[out.ic] || I.check}</span>
        <div><div className="chg-out-l">{dec.label}</div><div className="chg-out-r">{dec.rationale}</div></div>
      </div>
    </div>
  );
}

/* ════ Change Assessment surface ════ */

export function ChangeAssessment({ onAsk }: SurfaceViewProps) {
  const [sel, setSel] = useState(CHANGE_ITEMS[0].id);
  const item = CHANGE_ITEMS.find(c => c.id === sel) || CHANGE_ITEMS[0];
  const triggers = CHANGE_ITEMS.filter(c => c.fda.outcome === 'new-submission' || c.eu.outcome === 'nb-notify').length;

  return (
    <div className="page-inner reg">
      <SampleTag sample={true} />
      <div className="reg-head">
        <div>
          <div className="reg-eyebrow">Platform {I.dot} lifecycle</div>
          <h1 className="reg-title">Change assessment</h1>
          <p className="reg-sub">Every design, labeling or manufacturing change runs the FDA "When to Submit a 510(k) for a Change" (2017) and EU MDR significant-change (MDCG 2020-3) determinations -- resolving to a new submission or a document-to-file.</p>
        </div>
        {onAsk && <button className="reg-ask" onClick={() => onAsk('Assess a new device change for 510(k) / MDR significant-change impact')}>{I.sparkles} Assess a change</button>}
      </div>

      <div className="reg-kpis">
        <div className="reg-kpi"><div className="reg-kpi-v">{CHANGE_ITEMS.length}</div><div className="reg-kpi-l">Open changes</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{triggers}</div><div className="reg-kpi-l">Trigger a filing</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">{CHANGE_ITEMS.length - triggers}</div><div className="reg-kpi-l">Document to file</div></div>
        <div className="reg-kpi"><div className="reg-kpi-v">2</div><div className="reg-kpi-l">Jurisdictions assessed</div></div>
      </div>

      <div className="chg-split">
        <div className="chg-list">
          {CHANGE_ITEMS.map(c => {
            const trig = c.fda.outcome === 'new-submission' || c.eu.outcome === 'nb-notify';
            return (
              <button key={c.id} className="chg-row" data-on={c.id === sel || undefined} onClick={() => setSel(c.id)}>
                <div className="chg-row-top"><span className="chg-row-id">{c.id}</span><span className={`chg-row-tag ${trig ? 'err' : 'ok'}`}>{trig ? 'Filing' : 'File only'}</span></div>
                <div className="chg-row-t">{c.title}</div>
                <div className="chg-row-m">{c.device} {I.dot} {c.area} {I.dot} {c.owner}</div>
              </button>
            );
          })}
        </div>

        <div className="chg-detail">
          <div className="chg-detail-h">
            <div>
              <div className="chg-detail-t">{item.title}</div>
              <div className="chg-detail-m">{item.id} {I.dot} {item.device} {I.dot} {item.area} {I.dot} raised {item.raised}</div>
            </div>
            <span className={`reg-st ${item.doc.status}`}>{item.doc.status}</span>
          </div>

          <div className="chg-decisions">
            <ChangeDecision title="FDA -- 21 CFR 807 / 2017 guidance" flag="US" dec={item.fda} />
            <ChangeDecision title="EU MDR -- MDCG 2020-3" flag="EU" dec={item.eu} />
          </div>

          <div className="chg-doc">
            <div className="chg-doc-l">{I.fileText} Generates: <b>{item.doc.kind}</b></div>
            <div className="chg-doc-acts">
              <button className="reg-doc-open" onClick={() => onAsk && onAsk(`Draft the ${item.doc.kind} for ${item.id} -- ${item.title}`)}>{I.sparkles} Draft with AnA</button>
              <button className="reg-doc-open ghost">{I.externalLink} Open change record</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
