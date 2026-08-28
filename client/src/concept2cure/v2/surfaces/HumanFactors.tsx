import React, { useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { AnswerLead } from '../AnswerLead';
import { assessmentState } from '../assessmentState';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

/* ── Render contract (GET /api/human-factors → { data: HfFileData | null }) ── */

interface HfScenario {
  /** The c2c_hf_scenarios row id. A mitigation is a governed write against ONE
   *  row, so a scenario the client cannot name is a scenario it cannot mitigate. */
  id: string;
  task: string;
  useError: string;
  potentialHarmSeverity: string;
  mitigated: boolean;
  _new?: boolean;
}

interface HfFileData {
  device: string;
  framework: string;
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

/* ── Framework catalog (IEC 62366-1 element set + severity labels) ── */

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

/* ── Deterministic ports of the two service functions ── */

function hfAssessCompleteness(present: Record<string, boolean>): HfCompletenessResult {
  const P: string[] = [];
  const G: string[] = [];
  HF_ELEMENTS.forEach(([k]) => { (present[k] === true ? P : G).push(k); });
  return { completenessScore: P.length / HF_ELEMENTS.length, present: P, gaps: G, complete: G.length === 0, framework: 'IEC 62366-1' };
}

/** The server's own sentence for a refusal, never its enum token. */
function hfReason(body: unknown): string {
  const e = (body as { error?: { message?: unknown } } | null)?.error;
  return typeof e?.message === 'string' && e.message.trim() ? e.message.trim() : '';
}

/**
 * The reason to show for a THROWN request failure.
 *
 * `apiRequest` throws `ApiRequestError` for every non-OK status except 401, and
 * that error's message has already been reduced to the server's sentence (enum
 * tokens and infrastructure text filtered out). Anything else on this path is a
 * browser-native throw — "Failed to fetch", "NetworkError" — which must not be
 * rendered as though the service had said it.
 */
function hfThrownReason(e: unknown): string {
  return (e as { name?: unknown })?.name === 'ApiRequestError' && (e as Error).message
    ? (e as Error).message
    : 'the human-factors service could not be reached';
}

function hfAnalyzeRisk(scenarios: HfScenario[]): HfRiskResult {
  const crit = scenarios.filter(s => HF_SERIOUS.has(s.potentialHarmSeverity));
  const unmit = crit.filter(t => !t.mitigated).length;
  return { totalScenarios: scenarios.length, criticalTasks: crit, criticalTaskCount: crit.length, unmitigatedCriticalTasks: unmit, residualRiskAcceptable: unmit === 0, framework: 'IEC 62366-1 / FDA HFE' };
}

/* ════ Human Factors -- IEC 62366-1 surface ════ */

export function HumanFactors({ onAsk }: SurfaceViewProps) {
  const ask = onAsk;
  /* Fixture-free (real-data standard): the HFE/UE file reads the org's REAL
     human-factors store (hf_engineering_files, written via POST /api/human-factors)
     plus its hazard-related use scenarios (c2c_hf_scenarios). Real data, an honest
     empty, or an honest error — never a fabricated stand-in. */
  const hf = useLiveData<HfFileData>('/api/human-factors');
  const file = hf.data;

  /* ── The overlay holds ONLY what the server has acknowledged ───────────────
     This screen renders a SAFETY GATE: the IEC 62366-1 §5.9 summative-evaluation
     gate reads CLEAR exactly when no critical task is unmitigated. It used to be
     computed over a free-form React overlay that "Mitigate" and the element tiles
     wrote to directly, with no request behind either — so a device human-factors
     reviewer could watch a blocking gate clear on screen while the record still
     said blocked, and the screen silently reverted on reload.

     The overlay is now three narrow, write-confirmed things and nothing else:
       · `presentSaved`  — the element map the server RETURNED from PATCH /elements
       · `addedScenarios`— rows the server RETURNED from POST /scenarios
       · `mitigatedIds`  — ids the server ACKNOWLEDGED on PATCH …/mitigate
     There is no code path that puts an unwritten value into any of them, so
     everything the gate computes over is the record. The overlay resets whenever
     a fresh file arrives. */
  const [presentSaved, setPresentSaved] = useState<Record<string, boolean> | null>(null);
  const [addedScenarios, setAddedScenarios] = useState<HfScenario[]>([]);
  const [mitigatedIds, setMitigatedIds] = useState<string[]>([]);
  useEffect(() => { setPresentSaved(null); setAddedScenarios([]); setMitigatedIds([]); }, [file]);

  const present = presentSaved ?? file?.present ?? {};
  const scenarios = useMemo(() => {
    const base = Array.isArray(file?.scenarios) ? (file as HfFileData).scenarios : [];
    return [...base, ...addedScenarios].map(sc =>
      sc.id && mitigatedIds.indexOf(sc.id) !== -1 ? { ...sc, mitigated: true } : sc);
  }, [file, addedScenarios, mitigatedIds]);
  const device = file?.device ?? '';

  const [form, setForm] = useState(false);
  /** The critical task a reason for change is being captured against. */
  const [mitigating, setMitigating] = useState<HfScenario | null>(null);
  const [elBusy, setElBusy] = useState<string | null>(null);
  const [toast, fire] = useToast();
  const sevLabel = (s: string) => (HF_SEV.find(x => x[0] === s) || [])[1] || s;

  const hfe = useMemo(() => hfAssessCompleteness(present), [present]);
  const risk = useMemo(() => hfAnalyzeRisk(scenarios), [scenarios]);
  const compPct = Math.round(hfe.completenessScore * 100);
  const firstUnmit = risk.criticalTasks.find(t => !t.mitigated);

  /* ── The gate had two branches, so it could not tell silence from safety ────
     `risk.residualRiskAcceptable` is `unmitigatedCriticalTasks === 0`, and that
     count is a filter over `scenarios`. Over an HFE/UE file with no scenarios
     recorded the filter is vacuously empty, so a file nothing had ever examined
     took exactly the branch of one that had been examined and found controlled:
     the gate read CLEAR and the lead said "you're clear to run summative" about
     an analysis that had never run. That is the substitution assessmentState.ts
     exists to make unrepresentable — an empty findings set is not a finding of
     "none".

     `risk.totalScenarios > 0` is the positive evidence it asks for: hazard-
     related use scenarios actually on the record, which only exist because
     someone recorded them. It is deliberately NOT the emptiness that produced
     the bug — a file can hold scenarios and still have unmitigated critical
     tasks, and it can hold none at all, and those are now different states. */
  const hfState = assessmentState({
    loading: hf.loading,
    unreadable: Boolean(hf.error),
    scopeExists: Boolean(file),
    findingCount: risk.unmitigatedCriticalTasks,
    assessmentRan: risk.totalScenarios > 0,
  });
  /* What this screen is entitled to report is the CRITICAL-TASK position, and
     only that. Under IEC 62366-1 residual-risk acceptability is a documented
     manufacturer determination, and summative readiness rests on the whole
     HFE/UE file — neither follows automatically from a count of unmitigated
     critical tasks, so neither is asserted here. */
  const gateClear = hfState === 'assessed-clear';
  const gateBlocked = hfState === 'assessed-with-findings';
  const gateUnassessed = hfState === 'not-assessed';

  /* Ticking an HFE/UE element moves the file-completeness percentage this screen
     prints, so it is a claim about the record and must reach the record. This was
     `setPresentEdit({...})` and nothing else: every tick was lost on reload while
     the percentage moved. The server's returned map is adopted rather than the
     optimistic one, so what is displayed is what was stored. */
  const toggleEl = async (k: string) => {
    if (elBusy) return;
    const next = !present[k];
    setElBusy(k);
    try {
      const res = await apiRequest('PATCH', '/api/human-factors/elements', { element: k, present: next });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        fire('Element not saved -- ' + (hfReason(body) || 'the HFE/UE file did not accept the change') + '. Completeness is unchanged.');
        return;
      }
      const body = await res.json().catch(() => null);
      const stored = body?.data?.present;
      if (!stored || typeof stored !== 'object') {
        fire('Element not saved -- unexpected response. Completeness is unchanged.');
        return;
      }
      setPresentSaved(stored as Record<string, boolean>);
    } catch (e) {
      fire('Element not saved -- ' + hfThrownReason(e) + '. Completeness is unchanged.');
    } finally {
      setElBusy(null);
    }
  };

  const FORM: C2CFormConfig = {
    eyebrow: 'Use-related risk — IEC 62366-1',
    title: 'Add use scenario',
    sub: 'Each scenario is a task where a use error could cause harm. Serious or critical harm makes it a critical task that must be mitigated before summative testing.',
    governed: 'Use scenarios feed the use-related risk analysis and the HFE/UE report; changes are audit-logged.',
    submitLabel: 'Add scenario',
    fields: [
      { key: 'task', label: 'Task / use step', type: 'text', placeholder: 'e.g. Result interpretation (positive call)', required: true },
      { key: 'useError', label: 'Potential use error', type: 'text', placeholder: 'e.g. Misreading a borderline result', required: true },
      { key: 'potentialHarmSeverity', label: 'Potential harm severity', type: 'select', options: HF_SEV.map(s => ({ value: s[0], label: s[1] })), required: true },
      { key: 'mitigated', label: 'Mitigation in place?', type: 'select', options: [{ value: 'no', label: 'No — not yet mitigated' }, { value: 'yes', label: 'Yes — risk control documented' }], required: true },
    ],
  };

  const addScenario = async (v: Record<string, string>) => {
    const sev = v.potentialHarmSeverity || 'minor';
    const mit = v.mitigated === 'yes';
    // Real org-scoped persisted create. apiRequest throws on non-OK (except 401)
    // with the server's reason (e.g. NO_FILE, PENDING_STORE). Adopt the row the
    // server actually stored so completeness/risk recompute from it.
    try {
      const res = await apiRequest('POST', '/api/human-factors/scenarios', {
        task: v.task, useError: v.useError, potentialHarmSeverity: sev, mitigated: mit,
      });
      if (!res.ok) {
        fire('Could not add scenario — the organization needs an HFE/UE file');
        return;
      }
      const body = await res.json().catch(() => null);
      const row = body?.data;
      if (!row || !row.task) {
        fire('Could not add scenario — unexpected response');
        return;
      }
      const ns: HfScenario = { id: String(row.id ?? ''), task: row.task, useError: row.useError || '', potentialHarmSeverity: row.potentialHarmSeverity || 'minor', mitigated: row.mitigated === true, _new: true };
      setAddedScenarios(prev => [...prev, ns]);
      setForm(false);
      fire('Use scenario added' + (HF_SERIOUS.has(ns.potentialHarmSeverity) && !ns.mitigated ? ' -- unmitigated critical task' : ''));
    } catch (e) {
      fire('Could not add scenario -- ' + (e instanceof Error && e.message ? e.message : 'request failed'));
    }
  };

  /* ── Recording a mitigation is a governed write, not a setState ────────────
     `mitigate` was `setScenarioEdit(...)` and nothing else. Because the summative
     gate is computed from these rows, one click could flip the IEC 62366-1 §5.9
     gate from BLOCKED to CLEAR with nothing written anywhere — the single most
     dangerous thing this surface could do.

     It is now the same shape as adopting agency label text: capture a 21 CFR
     11.10(e) reason for change, PATCH the row, and change what is on screen ONLY
     on the server's acknowledgement. A refusal leaves the task unmitigated and
     the gate blocked, and says so. */
  const MITIGATE_FORM: C2CFormConfig = {
    eyebrow: 'Use-related risk — IEC 62366-1 §5.9',
    title: 'Record a mitigation',
    sub: mitigating
      ? `${mitigating.task} — ${mitigating.useError || 'use error not stated'} (${sevLabel(mitigating.potentialHarmSeverity)} harm).`
      : '',
    governed:
      'Declaring a critical use-related risk controlled can clear the summative-evaluation gate. ' +
      'The change is written to the HFE/UE record with your reason, under 21 CFR 11.10(e).',
    submitLabel: 'Record mitigation',
    fields: [
      {
        key: 'reasonForChange', label: 'Reason for change', type: 'textarea', required: true, rows: 3,
        placeholder: 'e.g. Alarm escalation redesign verified in formative round 3; risk control RC-14 documented',
        desc: 'At least 8 characters. This is the audit trail\u2019s answer to "why was this declared controlled".',
      },
    ],
  };

  const recordMitigation = async (v: Record<string, string>) => {
    const sc = mitigating;
    if (!sc) return;
    const reason = (v.reasonForChange || '').trim();
    if (reason.length < 8) {
      fire('Mitigation not recorded -- a reason for change of at least 8 characters is required.');
      return;
    }
    if (!sc.id) {
      fire('Mitigation not recorded -- this scenario has no record id. Reload the HFE/UE file and retry.');
      return;
    }
    try {
      const res = await apiRequest(
        'PATCH', '/api/human-factors/scenarios/' + encodeURIComponent(sc.id) + '/mitigate',
        { reasonForChange: reason },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        fire('Mitigation not recorded -- ' + (hfReason(body) || 'the HFE/UE record refused the change') + '. The summative gate is unchanged.');
        return;
      }
      if (body?.data?.mitigated !== true) {
        fire('Mitigation not recorded -- unexpected response. The summative gate is unchanged.');
        return;
      }
      setMitigatedIds(prev => prev.indexOf(sc.id) === -1 ? [...prev, sc.id] : prev);
      setMitigating(null);
      fire('Mitigation recorded against ' + sc.task);
      ask('Draft a risk-control mitigation for: ' + sc.task + ' (' + sc.useError + ')');
    } catch (e) {
      fire('Mitigation not recorded -- ' + hfThrownReason(e) + '. The summative gate is unchanged.');
    }
  };

  /* What AnA can see of this screen.
     Published BEFORE the loading / error / empty early returns below — a
     publisher that only runs on the success path goes silent exactly when the
     user asks what happened, and React would reject the conditional call.

     Each not-ready state is published as itself: "no HFE/UE file yet" is a
     different fact from "the store did not answer", and an unmitigated critical
     task count derived from a failed read would be a safety claim nobody made. */
  const anaContext = useMemo(() => {
    if (hf.loading) {
      return { summary: 'The HFE/UE file is still loading; nothing on screen is final yet.' };
    }
    if (hf.error) {
      return {
        summary:
          'The human-factors store could not be read, so this screen is showing no HFE/UE file because of ' +
          'a failure, not because none exists.',
        availableActions: ['Retry the HFE/UE file read'],
      };
    }
    if (hf.empty || !file) {
      return {
        summary:
          'Human factors (IEC 62366-1): this organisation has no HFE/UE file yet, so there is no ' +
          'completeness score or use-related risk analysis on screen.',
        availableActions: ['Create the HFE/UE file for this device'],
      };
    }
    return {
      summary:
        `Human factors (IEC 62366-1) for ${device || 'this device'}: HFE/UE file ${compPct}% complete ` +
        `(${hfe.gaps.length} element(s) still open). ${risk.totalScenarios} use scenario(s), ` +
        `${risk.criticalTaskCount} critical task(s), ${risk.unmitigatedCriticalTasks} unmitigated — ` +
        (gateUnassessed
          ? 'the critical-task gate is NOT ASSESSED: no hazard-related use scenarios are recorded, so no ' +
            'use-related risk analysis has run. An empty scenario set is not a finding that residual ' +
            'use-related risk is acceptable.'
          : gateBlocked
            ? 'the critical-task gate is BLOCKED until each unmitigated critical task is controlled.'
            : 'the critical-task gate is clear. Residual-risk acceptability and summative readiness are ' +
              'determinations documented across the whole HFE/UE file, not consequences of this count.'),
      facts: {
        device: device || null,
        completenessPercent: compPct,
        presentElements: hfe.present,
        openElements: hfe.gaps,
        totalScenarios: risk.totalScenarios,
        criticalTaskCount: risk.criticalTaskCount,
        unmitigatedCriticalTasks: risk.unmitigatedCriticalTasks,
        /* Was `residualRiskAcceptable: risk.residualRiskAcceptable` — the raw
           `unmitigatedCriticalTasks === 0`, which is TRUE over a file holding no
           scenarios at all. The prose summary alongside it was corrected, but a
           structured fact is the thing an assistant quotes verbatim, so leaving
           the boolean meant AnA could still state the determination the screen
           had just stopped making. The gate's own three states are the honest
           fact, and residual-risk acceptability is not reported at all because
           this surface does not know it. */
        criticalTaskGate: gateUnassessed ? 'not-assessed' : gateBlocked ? 'blocked' : 'clear',
        firstUnmitigatedCriticalTask: firstUnmit
          ? {
              task: firstUnmit.task, useError: firstUnmit.useError,
              severity: sevLabel(firstUnmit.potentialHarmSeverity),
            }
          : null,
        scenarios: scenarios.slice(0, 12).map((sc) => ({
          task: sc.task, useError: sc.useError,
          severity: sevLabel(sc.potentialHarmSeverity), mitigated: sc.mitigated,
        })),
      },
      availableActions: [
        'Add a use scenario (feeds the use-related risk analysis; the write is audit-logged)',
        'Record a mitigation against a critical task (governed — requires a reason for change, and only a ' +
          'mitigation the HFE/UE record accepts can move the summative gate)',
        'Mark an HFE/UE file element present or absent (written to the HFE/UE record and audit-logged)',
      ],
    };
  }, [hf.loading, hf.error, hf.empty, file, device, compPct, hfe, risk, firstUnmit, scenarios]);
  usePublishSurfaceContext('human-factors', anaContext);

  /* ── Honest states: loading / error / empty (no fixture fallback) ── */
  if (hf.loading) {
    return (
      <div className="hf" style={{ maxWidth: 1140 }}>
        <EmptyState title="Loading the HFE/UE file…" />
      </div>
    );
  }
  if (hf.error) {
    return (
      <div className="hf" style={{ maxWidth: 1140 }}>
        <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load the HFE/UE file"
          hint="The organization's IEC 62366-1 human-factors file didn't respond. Sign in and retry, or check the service is reachable." />
      </div>
    );
  }
  if (hf.empty || !file) {
    return (
      <div className="hf" style={{ maxWidth: 1140 }}>
        <EmptyState icon={I.fileText} title="No HFE/UE file yet"
          hint="Once an IEC 62366-1 HFE/UE file is recorded, its element completeness and use-related risk analysis — the gate before summative usability testing — appear here." />
      </div>
    );
  }

  return (
    <div className="hf" style={{ maxWidth: 1140 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Specialist {I.dot} device {I.dot} human factors</div>
          <h1 className="sp-title">Human factors {I.dot} IEC 62366-1</h1>
          <p className="sp-state">{device} -- use-related risk analysis and HFE/UE file completeness, the gate before summative testing.</p>
        </div>
        <button className="sp-primary" onClick={() => setForm(true)}>{I.plus} Add use scenario</button>
      </div>

      {/* Three branches, because there are three states. The middle one — an
          HFE/UE file with no hazard-related use scenarios on it — used to fall
          through to the cleared copy, so a file nothing had examined read as one
          examined and found controlled. It now says what is true of it, offers
          the step that would make an answer possible, and carries NO reassurance:
          reassurance is the one thing an absent analysis can never justify. */}
      <AnswerLead
        tone={gateBlocked ? 'urgent' : gateClear ? 'good' : 'calm'}
        eyebrow="Whether you can run the summative usability study yet"
        headline={gateBlocked
          ? <><b>{risk.unmitigatedCriticalTasks}</b> critical task{risk.unmitigatedCriticalTasks === 1 ? '' : 's'} still {risk.unmitigatedCriticalTasks === 1 ? 'has' : 'have'} no mitigation — summative testing shouldn't start until {risk.unmitigatedCriticalTasks === 1 ? 'it is' : 'they are'} controlled.</>
          : gateUnassessed
            ? <>No hazard-related use scenarios are recorded, so no use-related risk analysis has run — nothing here establishes whether critical tasks are controlled.</>
            : <>Every critical task has a documented mitigation. The critical-task gate is clear.</>}
        body={gateUnassessed
          ? <>The HFE/UE file is <b>{compPct}%</b> complete against IEC 62366-1{hfe.gaps.length ? ` -- ${hfe.gaps.length} element${hfe.gaps.length === 1 ? '' : 's'} still open` : ''}. An empty scenario set is not a finding of “no unmitigated critical tasks”, so nothing is claimed here either way.</>
          : <>You've analysed <b>{risk.totalScenarios}</b> use scenarios; <b>{risk.criticalTaskCount}</b> {risk.criticalTaskCount === 1 ? 'is a' : 'are'} critical task{risk.criticalTaskCount === 1 ? '' : 's'} (serious or critical harm). The HFE/UE file is <b>{compPct}%</b> complete against IEC 62366-1{hfe.gaps.length ? ` -- ${hfe.gaps.length} element${hfe.gaps.length === 1 ? '' : 's'} still open` : ''}.</>}
        reassure={gateUnassessed
          ? undefined
          : "I'll draft the mitigation for each critical task, tie it to the risk control, and assemble the HFE/UE report — you approve each one."}
        action={firstUnmit
          ? { label: 'Mitigate ' + firstUnmit.task, onClick: () => setMitigating(firstUnmit) }
          : gateUnassessed
            ? { label: 'Record a hazard-related use scenario', onClick: () => setForm(true) }
            : { label: 'Draft the HFE/UE report', onClick: () => ask('Assemble the HFE/UE report from the completed elements') }}
        secondary={gateUnassessed
          ? 'Identify the hazard-related use scenarios first — the risk analysis and the HFE/UE report are built from them.'
          : 'Or work the use-related risk table and HFE checklist below.'}
      />

      {/* Use-related risk -- the hero */}
      {/* The card reports the CRITICAL-TASK position and stops there. It used to
          title itself "Residual use-related risk acceptable" and say summative
          testing "may proceed" — both conclusions belong to the manufacturer's
          documented determination over the whole HFE/UE file (IEC 62366-1),
          not to a count of unmitigated critical tasks. The not-assessed state
          borrows neither the wording nor the treatment of the cleared one:
          no shield, no success tone, no "clear". */}
      <div className="pj-seclbl">Use-related risk analysis <span className="s">{I.dot} {risk.criticalTaskCount} critical of {risk.totalScenarios} scenarios {I.dot} critical-task gate: {gateUnassessed ? 'not assessed' : gateBlocked ? 'blocked' : 'clear'}</span></div>
      <div className={'hf-gate tone-' + (gateBlocked ? 'err' : gateClear ? 'ok' : 'idle')}>
        <span className="hf-gate-ic">{gateBlocked ? I.alertTriangle : gateClear ? I.shieldCheck : I.info}</span>
        <div>
          <div className="hf-gate-t">{gateUnassessed
            ? 'Critical-task gate not assessed'
            : gateBlocked ? 'Unmitigated critical tasks' : 'No unmitigated critical tasks'}</div>
          <div className="hf-gate-s">{gateUnassessed
            ? 'No hazard-related use scenarios are recorded, so the use-related risk analysis has not run. This gate is neither clear nor blocked — it has nothing to read.'
            : gateBlocked
              ? risk.unmitigatedCriticalTasks + ' critical task' + (risk.unmitigatedCriticalTasks === 1 ? '' : 's') + ' must be mitigated before summative testing (IEC 62366-1 S5.9).'
              : 'Every critical task on the record has a documented mitigation. Acceptability of residual use-related risk, and readiness for summative evaluation, remain determinations documented across the HFE/UE file; this gate does not establish either.'}</div>
        </div>
      </div>
      {scenarios.length === 0 ? (
        <p className="dv-mini-note">No use-related scenarios recorded yet — add one to start the use-related risk analysis.</p>
      ) : (
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
                ? <button className="hf-act" onClick={() => setMitigating(s)}
                    disabled={!s.id}
                    title={s.id ? 'Record a mitigation against the HFE/UE record' : 'This scenario has no record id — reload the HFE/UE file'}>{I.penLine} Mitigate</button>
                : <button className="hf-go" title="Provenance" onClick={() => ask('Show the use-related risk provenance for ' + s.task)}>{I.search}</button>}
            </div>
          );
        })}
      </div>
      )}

      {/* HFE/UE completeness checklist */}
      <div className="pj-seclbl">HFE/UE file completeness <span className="s">{I.dot} IEC 62366-1 {I.dot} {hfe.present.length}/{HF_ELEMENTS.length} elements {I.dot} each tick is written to the HFE/UE record</span></div>
      <div className="hf-el-grid">
        {HF_ELEMENTS.map(([k, l]) => (
          <button key={k} className="hf-el" data-have={present[k] || undefined} onClick={() => void toggleEl(k)}
            disabled={elBusy !== null} aria-busy={elBusy === k || undefined}
            title={present[k] ? 'Mark not present — written to the HFE/UE record' : 'Mark present — written to the HFE/UE record'}>
            <span className={'hf-el-dot tone-' + (present[k] ? 'ok' : 'idle')}>{present[k] ? I.check : ''}</span>
            <span className="hf-el-l">{l}</span>
          </button>
        ))}
      </div>

      {form && <C2CForm config={FORM} onCancel={() => setForm(false)} onSubmit={addScenario} />}
      {mitigating && <C2CForm config={MITIGATE_FORM} onCancel={() => setMitigating(null)} onSubmit={recordMitigation} />}
      <C2CToast msg={toast} />
    </div>
  );
}
