import React, { useState, useMemo, useEffect } from 'react';
import { I } from '../icons';
import { SampleTag, useLiveList } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';

/* ── Types ── */

interface DcOutput {
  id: string;
  desc: string;
}

interface DcInput {
  id: string;
  cat: string;
  req: string;
  riskRef: string | null;
  outputs: DcOutput[];
  ver: string | null;
  verRef: string | null;
  val: string | null;
  valRef: string | null;
  _new?: boolean;
}

interface Dc82030Element {
  el: string;
  label: string;
  have: boolean;
  ref: string;
}

/* ── Inline fixture data (kit window globals, verbatim) ── */

const DC_INPUT_CATS: [string, string][] = [
  ['intended_use', 'Intended use'], ['user_need', 'User need'], ['functional', 'Functional'],
  ['performance', 'Performance'], ['safety', 'Safety'], ['regulatory', 'Regulatory'],
  ['usability', 'Usability'], ['interface', 'Interface'],
];

const DC_RESULT: Record<string, string> = { pass: 'ok', fail: 'err', pending: 'warn', null: 'idle' };

const DC_820_30: Dc82030Element[] = [
  { el: 'designPlan', label: 'Design & development plan', have: true, ref: '820.30(b)' },
  { el: 'designInputs', label: 'Design inputs', have: true, ref: '820.30(c)' },
  { el: 'designOutputs', label: 'Design outputs', have: true, ref: '820.30(d)' },
  { el: 'designReviews', label: 'Design reviews (independent)', have: true, ref: '820.30(e)' },
  { el: 'designVerification', label: 'Design verification', have: true, ref: '820.30(f)' },
  { el: 'designValidation', label: 'Design validation (prod.-equiv.)', have: false, ref: '820.30(g)' },
  { el: 'designTransfer', label: 'Design transfer documented', have: false, ref: '820.30(h)' },
  { el: 'designChanges', label: 'Design changes reviewed/verified', have: true, ref: '820.30(i)' },
  { el: 'traceability', label: 'Full requirements<->V&V traceability', have: false, ref: '820.30(j)' },
];

const DC_INPUTS: DcInput[] = [
  { id: 'DI-01', cat: 'intended_use', req: 'Continuously measure interstitial glucose over a 14-day wear period.', riskRef: 'HZ-01',
    outputs: [{ id: 'DO-01', desc: 'Sensor + algorithm spec, 14-day claim' }], ver: 'pass', verRef: 'V&V-114 accuracy', val: 'pass', valRef: 'HF summative' },
  { id: 'DI-02', cat: 'performance', req: 'MARD <= 10% across the glycemic range vs. YSI reference.', riskRef: 'HZ-01',
    outputs: [{ id: 'DO-02', desc: 'Accuracy algorithm; calibration model' }], ver: 'pass', verRef: 'V&V-114 MARD 8.2%', val: 'pass', valRef: 'Pivotal accuracy study' },
  { id: 'DI-03', cat: 'safety', req: 'No therapy decision on a single erroneous low reading.', riskRef: 'HZ-01',
    outputs: [{ id: 'DO-03', desc: 'Dual-sensor cross-check; alert logic' }], ver: 'pass', verRef: 'V&V-118 alert logic', val: 'pending', valRef: 'HF validation open' },
  { id: 'DI-04', cat: 'usability', req: 'Applicator usable by an untrained lay user without injury.', riskRef: 'HZ-02',
    outputs: [{ id: 'DO-04', desc: 'One-press applicator; IFU' }], ver: 'pass', verRef: 'V&V-121 wear study', val: 'pending', valRef: 'Summative HF not prod-equiv' },
  { id: 'DI-05', cat: 'interface', req: 'Secure BLE pairing; encrypted telemetry to the reader app.', riskRef: 'HZ-03',
    outputs: [{ id: 'DO-05', desc: 'AES-128 link; authenticated pairing' }], ver: 'pass', verRef: 'Pen-test PT-09', val: 'pass', valRef: 'Cybersecurity validation' },
  { id: 'DI-06', cat: 'regulatory', req: 'ISO 10993 biocompatibility for a 14-day skin-contact device.', riskRef: 'HZ-04',
    outputs: [{ id: 'DO-06', desc: 'Materials selection; adhesive' }], ver: 'pending', verRef: 'ISO 10993-11 pending', val: null, valRef: null },
  { id: 'DI-07', cat: 'functional', req: 'Report a reading every 5 minutes with < 0.5% data loss.', riskRef: null,
    outputs: [], ver: null, verRef: null, val: null, valRef: null },
];

/* ════ Design Controls -- DHF surface ════ */

export function DesignControls({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  /* live ?? fixture — useLiveList adopts the org's seeded design inputs only
     when GET /api/design-controls returns the full DcInput display shape, else
     fail-closes to the codebase fixture so the matrix is never empty. */
  const liveList = useLiveList<DcInput>('/api/design-controls', DC_INPUTS);
  const sample = liveList.sample;
  const [inputs, setInputs] = useState<DcInput[]>(DC_INPUTS);

  /* Sync the adopted live list into local state once (the "new design input"
     form then works off whichever set loaded). */
  useEffect(() => {
    if (!liveList.loading && !liveList.sample) setInputs(liveList.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveList.loading, liveList.sample]);
  const [form, setForm] = useState(false);
  const [toast, setToast] = useState('');
  const fire = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };
  const catLabel = (c: string) => (DC_INPUT_CATS.find(x => x[0] === c) || [])[1] || c;

  /* Traceability gaps drive the 820.30(j) completeness. */
  const trace = useMemo(() => {
    const total = inputs.length;
    const noOutput = inputs.filter(i => !i.outputs || !i.outputs.length).length;
    const noVer = inputs.filter(i => i.ver !== 'pass').length;
    const noVal = inputs.filter(i => i.val !== 'pass').length;
    const fullyTraced = inputs.filter(i => i.outputs && i.outputs.length && i.ver === 'pass' && i.val === 'pass').length;
    const pct = total ? Math.round(fullyTraced / total * 100) : 0;
    return { total, noOutput, noVer, noVal, fullyTraced, pct };
  }, [inputs]);

  const el = DC_820_30;
  const elHave = el.filter(e => e.have).length;
  const elPct = Math.round(elHave / el.length * 100);
  const firstGap = inputs.find(i => !i.outputs || !i.outputs.length) || inputs.find(i => i.ver !== 'pass') || inputs.find(i => i.val !== 'pass');

  const FORM: C2CFormConfig = {
    eyebrow: 'DHF -- 820.30(c)',
    title: 'New design input',
    sub: 'A design input is a requirement the device must meet. It enters the traceability matrix untraced until an output, verification and validation are linked.',
    governed: 'Design inputs are controlled records; adding one is audit-logged per 21 CFR 820.30.',
    submitLabel: 'Add design input',
    fields: [
      { key: 'req', label: 'Requirement', type: 'text', placeholder: 'e.g. Battery lasts a full 14-day wear period', required: true },
      { key: 'cat', label: 'Category', type: 'select', options: DC_INPUT_CATS.map(c => ({ value: c[0], label: c[1] })), required: true },
      { key: 'riskRef', label: 'Risk item reference (optional)', type: 'text', placeholder: 'e.g. HZ-02' },
    ],
  };

  const addInput = (v: Record<string, string>) => {
    const id = 'DI-' + String(inputs.length + 1).padStart(2, '0');
    const nr: DcInput = { id, cat: v.cat || 'functional', req: v.req, riskRef: v.riskRef || null, outputs: [], ver: null, verRef: null, val: null, valRef: null, _new: true };
    setInputs(is => [...is, nr]);
    setForm(false);
    fire('Design input ' + id + ' added -- untraced');
  };

  const cell = (result: string | null, ref: string | null, label: string) => {
    const tone = result === null ? 'idle' : (DC_RESULT[result] || 'idle');
    return (
      <div className={'dc-cell tone-' + tone} title={ref || label}>
        <span className="dc-cell-v">{result === null ? '--' : result}</span>
        {ref && <span className="dc-cell-ref">{ref}</span>}
      </div>
    );
  };

  return (
    <div className="dc" style={{ maxWidth: 1200 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Specialist {I.dot} device {I.dot} /api/design-controls {!sample ? <> {I.dot} live</> : ''}</div>
          <h1 className="sp-title">Design controls {I.dot} DHF <SampleTag sample={sample} /></h1>
          <p className="sp-state">21 CFR 820.30 design history file -- inputs {'->'} outputs {'->'} verification {'->'} validation, traced end to end.</p>
        </div>
        <button className="sp-primary" onClick={() => setForm(true)}>{I.plus} New design input</button>
      </div>

      <AnswerLead
        tone={trace.noVal > 0 || trace.noOutput > 0 ? 'urgent' : 'calm'}
        eyebrow="Whether the DHF will survive a design-control audit"
        headline={trace.fullyTraced < trace.total
          ? <><b>{trace.total - trace.fullyTraced}</b> of {trace.total} design inputs {trace.total - trace.fullyTraced === 1 ? 'is' : 'are'} not yet fully traced to output, verification and validation.</>
          : <>Every design input traces cleanly to output {'->'} verification {'->'} validation. The DHF is audit-ready on traceability.</>}
        body={<>Design-control completeness is <b>{elPct}%</b> across the nine 820.30 elements; traceability (820.30(j)) is <b>{trace.pct}%</b>. {trace.noVal > 0 && <>{trace.noVal} input{trace.noVal === 1 ? '' : 's'} still lack{trace.noVal === 1 ? 's' : ''} passing validation on production-equivalent units.</>}</>}
        reassure="I'll draft the missing V&V protocols, link each to the input it covers, and flag any orphan output before the review -- you sign off."
        action={firstGap
          ? { label: 'Close the ' + firstGap.id + ' gap', onClick: () => ask('What is missing to fully trace ' + firstGap.id + ' (' + firstGap.req + ')?') }
          : { label: 'Draft the design review minutes', onClick: () => ask('Draft the design review minutes confirming full traceability') }}
        secondary="Or work the traceability matrix and 820.30 checklist below."
      />

      {/* Traceability matrix -- the hero */}
      <div className="pj-seclbl">Design traceability matrix <span className="s">{I.dot} 820.30(j) {I.dot} input {'->'} output {'->'} verification {'->'} validation</span></div>
      <div className="dc-matrix">
        <div className="dc-mhead">
          <div className="dc-mh dc-mh-in">Design input</div>
          <div className="dc-mh">Output</div>
          <div className="dc-mh">Verification</div>
          <div className="dc-mh">Validation</div>
        </div>
        {inputs.map(i => {
          const gap = !i.outputs || !i.outputs.length || i.ver !== 'pass' || i.val !== 'pass';
          return (
            <div key={i.id} className="dc-mrow" data-gap={gap || undefined} data-fresh={i._new || undefined}>
              <div className="dc-in">
                <div className="dc-in-top">
                  <span className="dc-in-id mono">{i.id}</span>
                  <span className="dc-in-cat">{catLabel(i.cat)}</span>
                  {i.riskRef && <button className="dc-in-hz" onClick={() => ask('Show ' + i.riskRef + ' in the risk file and confirm this input controls it')}>{I.alertTriangle} {i.riskRef}</button>}
                </div>
                <div className="dc-in-req">{i.req}</div>
              </div>
              <div className="dc-cell-wrap">
                {(i.outputs && i.outputs.length)
                  ? <div className="dc-out">{i.outputs.map(o => <span key={o.id} className="dc-out-chip" title={o.desc}><span className="mono">{o.id}</span> {o.desc}</span>)}</div>
                  : <div className="dc-cell tone-err"><span className="dc-cell-v">missing</span><span className="dc-cell-ref">no output</span></div>}
              </div>
              <div className="dc-cell-wrap">{cell(i.ver, i.verRef, 'verification')}</div>
              <div className="dc-cell-wrap">{cell(i.val, i.valRef, 'validation')}</div>
            </div>
          );
        })}
      </div>

      {/* 820.30 completeness checklist */}
      <div className="pj-seclbl">21 CFR 820.30 completeness <span className="s">{I.dot} {elHave}/{el.length} elements present</span></div>
      <div className="dc-820">
        {el.map(e => (
          <div key={e.el} className="dc-820-row" data-have={e.have || undefined}>
            <span className={'dc-820-dot tone-' + (e.have ? 'ok' : 'err')}>{e.have ? I.check : I.alertTriangle}</span>
            <span className="dc-820-l">{e.label}</span>
            <span className="dc-820-ref mono">{e.ref}</span>
            {!e.have && <button className="dc-820-fix" onClick={() => ask('What is required to satisfy ' + e.ref + ' -- ' + e.label + '?')}>Resolve</button>}
          </div>
        ))}
      </div>

      {form && <C2CForm config={FORM} onCancel={() => setForm(false)} onSubmit={addInput} />}
      {toast && <div className="pdev-toast">{I.check} {toast}</div>}
    </div>
  );
}
