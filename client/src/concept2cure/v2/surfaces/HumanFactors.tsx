import React, { useEffect, useState } from 'react';
import { I } from '../icons';
import { useLiveData, EmptyState } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
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

interface HfFile {
  device: string;
  present: Record<string, boolean>;
  scenarios: HfScenario[];
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

/* ── Catalogs / enums (IEC 62366-1 vocabulary, not data rows) ── */

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

/* ── Deterministic ports of the two service functions (pure helpers) ── */

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
  // Fixture-free: the org's real HFE/UE file (GET /api/human-factors, c2c_hf_*
  // store). No sample fallback — real data, an honest empty, or an honest error.
  const hf = useLiveData<HfFile>('/api/human-factors');
  // Local editable copy seeded from the loaded file, so completeness/risk
  // recompute as the user toggles elements and adds/mitigates scenarios.
  const [present, setPresent] = useState<Record<string, boolean> | null>(null);
  const [scenarios, setScenarios] = useState<HfScenario[] | null>(null);
  const [device, setDevice] = useState<string>('');
  useEffect(() => {
    if (hf.data && hf.data.present && Array.isArray(hf.data.scenarios)) {
      setPresent(hf.data.present);
      setScenarios(hf.data.scenarios);
      setDevice(hf.data.device || '');
    }
  }, [hf.data]);

  const [form, setForm] = useState(false);
  const [toast, setToast] = useState('');
  const fire = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600); };

  // ── Honest data states — loading, error, empty — before any data render ──
  if (hf.loading && !present) {
    return (
      <div className="hf" style={{ maxWidth: 1140 }}>
        <div className="scaf-note">Loading the HFE/UE file…</div>
      </div>
    );
  }
  if (hf.error && !present) {
    return (
      <div className="hf" style={{ maxWidth: 1140 }}>
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn't load the human-factors file"
          hint="The human-factors service didn't respond. Retry shortly, or sign in with an org that has an HFE/UE file."
        />
      </div>
    );
  }
  if (!present || !scenarios) {
    return (
      <div className="hf" style={{ maxWidth: 1140 }}>
        <EmptyState
          icon={I.penLine}
          title="No HFE/UE file yet"
          hint={<>Start the IEC 62366-1 use-related risk file for this device and its use scenarios and completeness will appear here. Ask AnA to draft the use specification to begin.</>}
        />
      </div>
    );
  }

  const sevLabel = (s: string) => (HF_SEV.find(x => x[0] === s) || [])[1] || s;

  const hfe = hfAssessCompleteness(present);
  const risk = hfAnalyzeRisk(scenarios);
  const compPct = Math.round(hfe.completenessScore * 100);
  const firstUnmit = risk.criticalTasks.find(t => !t.mitigated);

  const toggleEl = (k: string) => {
    setPresent(p => (p ? { ...p, [k]: !p[k] } : p));
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

  const addScenario = async (v: Record<string, string>) => {
    const sev = v.potentialHarmSeverity || 'minor';
    const mit = v.mitigated === 'yes';
    // Real org-scoped persisted create. apiRequest returns the response; a
    // non-OK carries the server's reason (e.g. NO_FILE, PENDING_STORE). Adopt
    // the row the server actually stored so completeness/risk recompute from it.
    try {
      const res = await apiRequest('POST', '/api/human-factors/scenarios', {
        task: v.task, useError: v.useError, potentialHarmSeverity: sev, mitigated: mit,
      });
      if (!res.ok) {
        fire('Could not add scenario -- sign in with an org that has an HFE/UE file');
        return;
      }
      const body = await res.json().catch(() => null);
      const row = body?.data;
      if (!row || !row.task) {
        fire('Could not add scenario -- unexpected response');
        return;
      }
      const ns: HfScenario = { task: row.task, useError: row.useError || '', potentialHarmSeverity: row.potentialHarmSeverity || 'minor', mitigated: row.mitigated === true, _new: true };
      setScenarios(s => [...(s || []), ns]);
      setForm(false);
      fire('Use scenario added' + (HF_SERIOUS.has(ns.potentialHarmSeverity) && !ns.mitigated ? ' -- unmitigated critical task' : ''));
    } catch (e) {
      fire('Could not add scenario -- ' + (e instanceof Error && e.message ? e.message : 'request failed'));
    }
  };

  const mitigate = (idx: number) => setScenarios(s => (s || []).map((sc, i) => i === idx ? { ...sc, mitigated: true } : sc));

  return (
    <div className="hf" style={{ maxWidth: 1140 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Specialist {I.dot} device {I.dot} /api/human-factors {I.dot} live</div>
          <h1 className="sp-title">Human factors {I.dot} IEC 62366-1</h1>
          <p className="sp-state">{device || 'This device'} -- use-related risk analysis and HFE/UE file completeness, the gate before summative testing.</p>
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
                ? <button className="hf-act" onClick={() => { mitigate(i); ask('Draft a risk-control mitigation for: ' + s.task + ' (' + s.useError + ')'); }}>{I.penLine} Mitigate</button>
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
