import React, { useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import { SampleTag, liveGet } from '../dataConnect';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';

/* ── Types ── */

interface HfScenario {
  task: string;
  useError: string;
  potentialHarmSeverity: string;
  mitigated: boolean;
  _new?: boolean;
}

interface HfCompletenessResult {
  completenessScore: number;
  present: string[];
  gaps: string[];
  complete: boolean;
  framework: string;
}

interface HfRiskResult {
  totalScenarios: number;
  criticalTasks: HfScenario[];
  criticalTaskCount: number;
  unmitigatedCriticalTasks: number;
  residualRiskAcceptable: boolean;
  framework: string;
}

/* ── Inline fixture data (kit window globals, verbatim) ── */

const HF_ELEMENTS: [string, string][] = [
  ['useSpecification', 'Use specification'],
  ['userProfiles', 'User profiles'],
  ['useEnvironments', 'Use environments'],
  ['userInterfaceCharacteristics', 'UI characteristics'],
  ['knownUseProblems', 'Known use problems'],
  ['hazardRelatedUseScenarios', 'Hazard-related use scenarios'],
  ['criticalTasks', 'Critical tasks'],
  ['formativeEvaluation', 'Formative evaluation'],
  ['summativeEvaluation', 'Summative evaluation'],
  ['hfeUeReport', 'HFE/UE report'],
];

const HF_SEV: [string, string][] = [
  ['negligible', 'Negligible'], ['minor', 'Minor'], ['serious', 'Serious'], ['critical', 'Critical'],
];

const HF_SERIOUS = new Set(['serious', 'critical']);

const HF_FILE = {
  device: 'DxAssay -- RT-PCR companion diagnostic',
  framework: 'IEC 62366-1',
  present: {
    useSpecification: true, userProfiles: true, useEnvironments: true, userInterfaceCharacteristics: true,
    knownUseProblems: false, hazardRelatedUseScenarios: true, criticalTasks: true,
    formativeEvaluation: false, summativeEvaluation: false, hfeUeReport: false,
  } as Record<string, boolean>,
};

const HF_SCENARIOS: HfScenario[] = [
  { task: 'Result interpretation (positive call)', useError: 'Misreading a borderline result -> wrong therapy selection', potentialHarmSeverity: 'critical', mitigated: false },
  { task: 'Sample loading', useError: 'Cross-contamination between wells', potentialHarmSeverity: 'serious', mitigated: true },
  { task: 'Reagent preparation', useError: 'Incorrect reconstitution volume -> invalid run', potentialHarmSeverity: 'minor', mitigated: true },
  { task: 'Barcode / sample ID scan', useError: 'Sample mix-up -> result assigned to wrong patient', potentialHarmSeverity: 'critical', mitigated: true },
  { task: 'Instrument maintenance', useError: 'Skipped decontamination cycle', potentialHarmSeverity: 'minor', mitigated: false },
];

/* ── Deterministic ports of the two service functions ── */

function hfAssessCompleteness(present: Record<string, boolean>): HfCompletenessResult {
  const P: string[] = [];
  const G: string[] = [];
  HF_ELEMENTS.forEach(([k]) => { (present[k] === true ? P : G).push(k); });
  return { completenessScore: P.length / HF_ELEMENTS.length, present: P, gaps: G, complete: G.length === 0, framework: 'IEC 62366-1' };
}

function hfAnalyzeRisk(scenarios: HfScenario[]): HfRiskResult {
  const crit = scenarios.filter(s => HF_SERIOUS.has(s.potentialHarmSeverity));
  const unmit = crit.filter(t => !t.mitigated).length;
  return { totalScenarios: scenarios.length, criticalTasks: crit, criticalTaskCount: crit.length, unmitigatedCriticalTasks: unmit, residualRiskAcceptable: unmit === 0, framework: 'IEC 62366-1 / FDA HFE' };
}

/* ════ Human Factors -- IEC 62366-1 surface ════ */

export function HumanFactors({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  // live ?? fixture: the org's real HFE/UE file + use scenarios
  // (GET /api/human-factors, c2c_hf_* store). The pill reflects DATA, not
  // token presence — sample until the store actually answers.
  const [live, setLive] = useState(false);
  const [device, setDevice] = useState<string>(HF_FILE.device);
  const [present, setPresent] = useState<Record<string, boolean>>(HF_FILE.present);
  const [scenarios, setScenarios] = useState<HfScenario[]>(HF_SCENARIOS);
  useEffect(() => {
    let cancelled = false;
    liveGet<{ data?: { device?: string; present?: Record<string, boolean>; scenarios?: HfScenario[] } | null }>(
      '/api/human-factors',
      { data: null },
    ).then((res) => {
      if (cancelled || res.sample) return;
      const hf = res.data?.data;
      if (!hf || !hf.present || !Array.isArray(hf.scenarios) || hf.scenarios.length === 0) return;
      setDevice(hf.device || HF_FILE.device);
      setPresent(hf.present);
      setScenarios(hf.scenarios);
      setLive(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [form, setForm] = useState(false);
  const [toast, setToast] = useState('');
  const fire = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };
  const label = (k: string) => (HF_ELEMENTS.find(e => e[0] === k) || [])[1] || k;
  const sevLabel = (s: string) => (HF_SEV.find(x => x[0] === s) || [])[1] || s;

  const hfe = useMemo(() => hfAssessCompleteness(present), [present]);
  const risk = useMemo(() => hfAnalyzeRisk(scenarios), [scenarios]);
  const compPct = Math.round(hfe.completenessScore * 100);
  const firstUnmit = risk.criticalTasks.find(t => !t.mitigated);

  const toggleEl = (k: string) => {
    const nv = { ...present, [k]: !present[k] };
    setPresent(nv);
  };

  const FORM: C2CFormConfig = {
    eyebrow: 'Use-related risk -- IEC 62366-1',
    title: 'Add use scenario',
    sub: 'Each scenario is a task where a use error could cause harm. Serious or critical harm makes it a critical task that must be mitigated before summative testing.',
    governed: 'Use scenarios feed the use-related risk analysis and the HFE/UE report; changes are audit-logged.',
    submitLabel: 'Add scenario',
    fields: [
      { key: 'task', label: 'Task / use step', type: 'text', placeholder: 'e.g. Result interpretation (positive call)', required: true },
      { key: 'useError', label: 'Potential use error', type: 'text', placeholder: 'e.g. Misreading a borderline result', required: true },
      { key: 'potentialHarmSeverity', label: 'Potential harm severity', type: 'select', options: HF_SEV.map(s => ({ value: s[0], label: s[1] })), required: true },
      { key: 'mitigated', label: 'Mitigation in place?', type: 'select', options: [{ value: 'no', label: 'No -- not yet mitigated' }, { value: 'yes', label: 'Yes -- risk control documented' }], required: true },
    ],
  };

  const addScenario = (v: Record<string, string>) => {
    const ns: HfScenario = { task: v.task, useError: v.useError, potentialHarmSeverity: v.potentialHarmSeverity || 'minor', mitigated: v.mitigated === 'yes', _new: true };
    const next = [...scenarios, ns];
    setScenarios(next);
    setForm(false);
    fire('Use scenario added' + (HF_SERIOUS.has(ns.potentialHarmSeverity) && !ns.mitigated ? ' -- unmitigated critical task' : ''));
  };

  const mitigate = (idx: number) => setScenarios(s => s.map((sc, i) => i === idx ? { ...sc, mitigated: true } : sc));

  return (
    <div className="hf" style={{ maxWidth: 1140 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Specialist {I.dot} device {I.dot} /api/human-factors {live ? <> {I.dot} live</> : ''}</div>
          <h1 className="sp-title">Human factors {I.dot} IEC 62366-1 <SampleTag sample={!live} /></h1>
          <p className="sp-state">{device} -- use-related risk analysis and HFE/UE file completeness, the gate before summative testing.</p>
        </div>
        <button className="sp-primary" onClick={() => setForm(true)}>{I.plus} Add use scenario</button>
      </div>

      <AnswerLead
        tone={risk.unmitigatedCriticalTasks > 0 ? 'urgent' : 'calm'}
        eyebrow="Whether you can run the summative usability study yet"
        headline={risk.unmitigatedCriticalTasks > 0
          ? <><b>{risk.unmitigatedCriticalTasks}</b> critical task{risk.unmitigatedCriticalTasks === 1 ? '' : 's'} still {risk.unmitigatedCriticalTasks === 1 ? 'has' : 'have'} no mitigation -- summative testing shouldn't start until {risk.unmitigatedCriticalTasks === 1 ? 'it is' : 'they are'} controlled.</>
          : <>Every critical task has a documented mitigation -- residual use-related risk is acceptable and you're clear to run summative.</>}
        body={<>You've analysed <b>{risk.totalScenarios}</b> use scenarios; <b>{risk.criticalTaskCount}</b> {risk.criticalTaskCount === 1 ? 'is a' : 'are'} critical task{risk.criticalTaskCount === 1 ? '' : 's'} (serious or critical harm). The HFE/UE file is <b>{compPct}%</b> complete against IEC 62366-1{hfe.gaps.length ? ` -- ${hfe.gaps.length} element${hfe.gaps.length === 1 ? '' : 's'} still open` : ''}.</>}
        reassure="I'll draft the mitigation for each critical task, tie it to the risk control, and assemble the HFE/UE report -- you approve each one."
        action={firstUnmit
          ? { label: 'Mitigate ' + firstUnmit.task, onClick: () => ask('Draft a risk-control mitigation for the critical task: ' + firstUnmit.task + ' (' + firstUnmit.useError + ')') }
          : { label: 'Draft the HFE/UE report', onClick: () => ask('Assemble the HFE/UE report from the completed elements') }}
        secondary="Or work the use-related risk table and HFE checklist below."
      />

      {/* Use-related risk -- the hero */}
      <div className="pj-seclbl">Use-related risk analysis <span className="s">{I.dot} {risk.criticalTaskCount} critical of {risk.totalScenarios} scenarios {I.dot} summative gate: {risk.residualRiskAcceptable ? 'clear' : 'blocked'}</span></div>
      <div className={'hf-gate tone-' + (risk.residualRiskAcceptable ? 'ok' : 'err')}>
        <span className="hf-gate-ic">{risk.residualRiskAcceptable ? I.shieldCheck : I.alertTriangle}</span>
        <div>
          <div className="hf-gate-t">{risk.residualRiskAcceptable ? 'Residual use-related risk acceptable' : 'Residual use-related risk not acceptable'}</div>
          <div className="hf-gate-s">{risk.residualRiskAcceptable
            ? 'All critical tasks are mitigated -- summative usability testing may proceed.'
            : risk.unmitigatedCriticalTasks + ' critical task' + (risk.unmitigatedCriticalTasks === 1 ? '' : 's') + ' must be mitigated before summative testing (IEC 62366-1 S5.9).'}</div>
        </div>
      </div>
      <div className="hf-scen">
        {scenarios.map((s, i) => {
          const isCrit = HF_SERIOUS.has(s.potentialHarmSeverity);
          return (
            <div key={i} className="hf-row" data-crit={isCrit || undefined} data-unmit={(isCrit && !s.mitigated) || undefined} data-fresh={s._new || undefined}>
              <div className="hf-row-main">
                <div className="hf-row-t">{s.task}{isCrit && <span className="hf-crit-tag">Critical task</span>}</div>
                <div className="hf-row-e">{s.useError}</div>
              </div>
              <span className={'hf-sev tone-' + (s.potentialHarmSeverity === 'critical' ? 'err' : s.potentialHarmSeverity === 'serious' ? 'warn' : 'idle')}>{sevLabel(s.potentialHarmSeverity)}</span>
              <span className={'hf-mit tone-' + (s.mitigated ? 'ok' : isCrit ? 'err' : 'idle')}>{s.mitigated ? <>{I.check} Mitigated</> : 'Unmitigated'}</span>
              {isCrit && !s.mitigated
                ? <button className="hf-act" onClick={() => ask('Draft a risk-control mitigation for: ' + s.task + ' (' + s.useError + ')')}>{I.penLine} Mitigate</button>
                : <button className="hf-go" title="Provenance" onClick={() => ask('Show the use-related risk provenance for ' + s.task)}>{I.search}</button>}
            </div>
          );
        })}
      </div>

      {/* HFE/UE completeness checklist */}
      <div className="pj-seclbl">HFE/UE file completeness <span className="s">{I.dot} IEC 62366-1 {I.dot} {hfe.present.length}/{HF_ELEMENTS.length} elements {I.dot} toggle as you complete them</span></div>
      <div className="hf-el-grid">
        {HF_ELEMENTS.map(([k, l]) => (
          <button key={k} className="hf-el" data-have={present[k] || undefined} onClick={() => toggleEl(k)} title={present[k] ? 'Mark not present' : 'Mark present'}>
            <span className={'hf-el-dot tone-' + (present[k] ? 'ok' : 'idle')}>{present[k] ? I.check : ''}</span>
            <span className="hf-el-l">{l}</span>
          </button>
        ))}
      </div>

      {form && <C2CForm config={FORM} onCancel={() => setForm(false)} onSubmit={addScenario} />}
      {toast && <div className="pdev-toast">{I.check} {toast}</div>}
    </div>
  );
}
