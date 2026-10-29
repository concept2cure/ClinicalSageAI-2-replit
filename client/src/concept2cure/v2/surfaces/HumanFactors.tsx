import React, { useEffect, useMemo, useState } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import { readRefusalOf, type ReadRefusal } from '../../mdx/hooks/useFetchJson';
import { ReadRefused, unreadContext } from '../projectScopedRead';
import { apiRequest } from '@/lib/queryClient';
import { AnswerLead } from '../AnswerLead';
import { assessmentState } from '../assessmentState';
import type { SurfaceViewProps } from '../surfaceViews';
import { usePublishSurfaceContext } from '../surfaceContext';
import { C2CForm } from '../C2CForm';
import type { C2CFormConfig } from '../C2CForm';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import { shellProgramId, useShellProject } from '../shellProject';

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

/* What AnA is told while no file is drawn: no project, still loading, a failed
   read, no file, or a file the screen cannot tie to the open project. Each is
   published as itself. Null when a file is drawn and the full context applies. */
const HF_CTX = 'Human factors (IEC 62366-1): ';
function hfNotReadyContext(s: {
  programId: string | null; projectOpen: boolean; loading: boolean; error: boolean; refusal: ReadRefusal | null; noFile: boolean; keyed: boolean;
}): { summary: string; availableActions?: string[] } | null {
  if (!s.programId) {
    const why = s.projectOpen ? "the open project can't be read by project here" : 'No project is open';
    return { summary: `${HF_CTX}${why}, so no HFE/UE file is read or shown. Nothing is claimed here about any usability engineering file.`, availableActions: ['Open a project from Projects'] };
  }
  if (s.loading) return { summary: 'The HFE/UE file is still loading; nothing on screen is final yet.' };
  if (s.error) return unreadContext(s.refusal, 'the HFE/UE file', HF_CTX, 'Retry the HFE/UE file read', 'The human-factors store could not be read, so this screen is showing no HFE/UE file because of a failure, not because none exists.');
  /* Slice 0 audit 2: AnA is offered no action nothing performs. Keyed, the
     screen itself offers "Start the usability file" (slice 19). Unkeyed, a
     file recorded later would not be shown here either, and AnA is told so. */
  if (s.noFile && s.keyed) return { summary: `${HF_CTX}this project has no HFE/UE file yet, so there is no completeness score or use-related risk analysis on screen.`, availableActions: ['Start the usability file for this project (records the device under evaluation)'] };
  if (s.noFile) return { summary: `${HF_CTX}this organisation has no HFE/UE file yet, so there is no completeness score or use-related risk analysis on screen. A file recorded later is not shown here until this screen reads this project's records.` };
  /* Slice 0: the screen hides a file it cannot tie to the project, so AnA is
     not handed that file's facts, or its writes, as this screen's either. */
  if (!s.keyed) return { summary: `${HF_CTX}this screen reads the organization's first HFE/UE file, which may be another project's, so it shows no file, completeness or use-related risk analysis, and offers no write into it, until the read is keyed to the project.` };
  return null;
}

function hfAnalyzeRisk(scenarios: HfScenario[]): HfRiskResult {
  const crit = scenarios.filter(s => HF_SERIOUS.has(s.potentialHarmSeverity));
  const unmit = crit.filter(t => !t.mitigated).length;
  return { totalScenarios: scenarios.length, criticalTasks: crit, criticalTaskCount: crit.length, unmitigatedCriticalTasks: unmit, residualRiskAcceptable: unmit === 0, framework: 'IEC 62366-1 / FDA HFE' };
}

/* ════ Human Factors -- IEC 62366-1 surface ════ */

export function HumanFactors({ onAsk, onNav }: SurfaceViewProps) {
  const ask = onAsk;
  /* Slice 19 (D2, 2026-10-29): the file is the open project's. The project is
     the shell's open project (useShellProject), the read every project screen
     makes, and hf_engineering_files records it (20261029). With no project
     open, or one with no project record id, nothing is read and the screen
     says which. `reads` re-reads the file after "Start the usability file". */
  const openProject = useShellProject();
  const programId = shellProgramId(openProject);
  const [reads, setReads] = useState(0);
  /* Fixture-free (real-data standard): the HFE/UE file reads the org's REAL
     human-factors store (hf_engineering_files, written via POST /api/human-factors)
     plus its hazard-related use scenarios (c2c_hf_scenarios). Real data, an honest
     empty, or an honest error — never a fabricated stand-in. */
  const hf = useLiveData<HfFileData>(
    programId ? '/api/human-factors?program_id=' + encodeURIComponent(programId) : null,
    [programId, reads],
  );
  const file = hf.data;
  /* A refused read is said as what it is, not as a failed one (D2, 2026-10-29;
     docs/evidence/D2-ONE-ANA/2026-10-29/refusal-not-failed-read/): the route
     answers 403 ORG_REQUIRED, refuses a project the organization does not own
     (404) or could not check (503), and sits behind the module gate (403), and
     each was drawn as "Couldn't load the HFE/UE file". Null for a genuine
     failure, which still is. */
  const hfRefusal = hf.error ? readRefusalOf(hf) : null;
  /* Slice 0 (INFORMATION_ARCHITECTURE.md, `human-factors` row): the read
     returned the organization's FIRST file, which may be another project's.
     Its panels, and the writes into it, render only when the route reports the
     read keyed to the OPEN project: `meta.scope === 'program'` and its
     `programId`. An unreported scope, the organization's scope, or another
     project's id counts as not keyed, so an unscoped file is never drawn under
     a project. */
  const keyed = programId != null && hf.meta?.scope === 'program' && hf.meta?.programId === programId;

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
  const [starting, setStarting] = useState(false);
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
      const res = await apiRequest('PATCH', '/api/human-factors/elements', { element: k, present: next, programId });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        fire('Element not saved — ' + (hfReason(body) || 'the HFE/UE file did not accept the change') + '. Completeness is unchanged.');
        return;
      }
      const body = await res.json().catch(() => null);
      const stored = body?.data?.present;
      if (!stored || typeof stored !== 'object') {
        fire('Element not saved — unexpected response. Completeness is unchanged.');
        return;
      }
      setPresentSaved(stored as Record<string, boolean>);
    } catch (e) {
      fire('Element not saved — ' + hfThrownReason(e) + '. Completeness is unchanged.');
    } finally {
      setElBusy(null);
    }
  };

  const FORM: C2CFormConfig = {
    eyebrow: 'Use-related risk — IEC 62366-1',
    title: 'Add use scenario',
    sub: 'Each scenario is a task where a use error could cause harm. Serious or critical harm makes it a critical task that must be mitigated before summative testing.',
    /* Slice 0 audit: "changes are audit-logged" dropped — creating a scenario
       records no audit row (server/routes/human-factors.ts:269). */
    governed: 'Use scenarios feed the use-related risk analysis and the HFE/UE report.',
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
        task: v.task, useError: v.useError, potentialHarmSeverity: sev, mitigated: mit, programId,
      });
      if (!res.ok) {
        fire('Could not add scenario — this project needs an HFE/UE file');
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
      fire('Use scenario added' + (HF_SERIOUS.has(ns.potentialHarmSeverity) && !ns.mitigated ? ' — unmitigated critical task' : ''));
    } catch (e) {
      fire('Could not add scenario — ' + (e instanceof Error && e.message ? e.message : 'request failed'));
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
      fire('Mitigation not recorded — a reason for change of at least 8 characters is required.');
      return;
    }
    if (!sc.id) {
      fire('Mitigation not recorded — this scenario has no record id. Reload the HFE/UE file and retry.');
      return;
    }
    try {
      const res = await apiRequest(
        'PATCH', '/api/human-factors/scenarios/' + encodeURIComponent(sc.id) + '/mitigate',
        { reasonForChange: reason },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        fire('Mitigation not recorded — ' + (hfReason(body) || 'the HFE/UE record refused the change') + '. The summative gate is unchanged.');
        return;
      }
      if (body?.data?.mitigated !== true) {
        fire('Mitigation not recorded — unexpected response. The summative gate is unchanged.');
        return;
      }
      setMitigatedIds(prev => prev.indexOf(sc.id) === -1 ? [...prev, sc.id] : prev);
      setMitigating(null);
      fire('Mitigation recorded against ' + sc.task);
      ask('Draft a risk-control mitigation for: ' + sc.task + ' (' + sc.useError + ')');
    } catch (e) {
      fire('Mitigation not recorded — ' + hfThrownReason(e) + '. The summative gate is unchanged.');
    }
  };

  /* ── Start the usability file (slice 19) ────────────────────────────────────
     A project with no file of its own reached a dead end: every file recorded
     before 20261029 has no project, so no project shows it, and nothing here
     created one. This records the device's HFE/UE file FOR THIS PROJECT over the
     existing POST, which checks the organization owns the project. Only a create
     the route reports as this project's is taken as one; then the file is read
     again from the record, so what is drawn is what was stored. A refused or
     failed start says so, and no file is drawn. */
  const START_FORM: C2CFormConfig = {
    eyebrow: 'Usability engineering — IEC 62366-1',
    title: 'Start the usability file',
    sub: 'The HFE/UE file for this project\u2019s device. Every IEC 62366-1 element starts as not present; mark each one as its evidence is recorded.',
    governed: 'The file is recorded for this project and the creation is written to the audit trail.',
    submitLabel: 'Start the file',
    fields: [
      { key: 'device', label: 'Device under evaluation', type: 'text', placeholder: 'e.g. Aurora CGM — continuous glucose monitor', required: true },
    ],
  };

  const startFile = async (v: Record<string, string>) => {
    const deviceName = (v.device || '').trim();
    if (!deviceName) {
      fire('File not started — name the device under evaluation.');
      return;
    }
    try {
      const res = await apiRequest('POST', '/api/human-factors', { device: deviceName, programId });
      const body = await res.json().catch(() => null);
      const recorded = res.ok && body?.meta?.scope === 'program' && body?.meta?.programId === programId;
      if (!recorded) {
        fire('File not started — ' + (hfReason(body) || 'the HFE/UE record did not take it as this project\u2019s') + '.');
        return;
      }
      setStarting(false);
      fire('Usability file started for ' + deviceName);
      setReads(n => n + 1);
    } catch (e) {
      fire('File not started — ' + hfThrownReason(e) + '.');
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
    const notReady = hfNotReadyContext({
      programId, projectOpen: openProject != null, loading: hf.loading, error: Boolean(hf.error),
      refusal: hfRefusal, noFile: hf.empty || !file, keyed,
    });
    if (notReady) return notReady;
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
        /* Slice 0 audit: no "audit-logged" — the scenario create writes no audit row. */
        'Add a use scenario (feeds the use-related risk analysis)',
        'Record a mitigation against a critical task (governed — requires a reason for change, and only a ' +
          'mitigation the HFE/UE record accepts can move the summative gate)',
        'Mark an HFE/UE file element present or absent (written to the HFE/UE record and audit-logged)',
      ],
    };
  }, [programId, openProject, hf.loading, hf.error, hfRefusal, hf.empty, file, keyed, device, compPct, hfe, risk, firstUnmit, scenarios]);
  usePublishSurfaceContext('human-factors', anaContext);

  /* ── Honest states: no project / loading / error / empty (no fixture fallback) ── */
  if (!programId) {
    return (
      <div className="hf" style={{ maxWidth: 1140 }}>
        <EmptyState icon={I.info} testId="hf-no-project"
          title="Open a project to see its usability engineering file"
          hint={openProject
            ? "The open project can't be read by project here, so this screen reads no HFE/UE file."
            : 'No project is open, so this screen reads no HFE/UE file.'}
          action={{ label: 'Open projects', onAct: () => onNav('projects') }} />
      </div>
    );
  }
  if (hf.loading) {
    return (
      <div className="hf" style={{ maxWidth: 1140 }}>
        <EmptyState title="Loading the HFE/UE file…" />
      </div>
    );
  }
  if (hfRefusal) {
    return (
      <div className="hf" style={{ maxWidth: 1140 }}>
        <ReadRefused refusal={hfRefusal} what="the HFE/UE file" retry={() => setReads((n) => n + 1)} testId="hf-refused" />
      </div>
    );
  }
  if (hf.error) {
    return (
      <div className="hf" style={{ maxWidth: 1140 }}>
        <EmptyState tone="error" icon={I.alertTriangle} title="Couldn't load the HFE/UE file"
          hint="This project's IEC 62366-1 human-factors file could not be read, so none is shown. Sign in and retry, or check the service is reachable." />
      </div>
    );
  }
  if (hf.empty || !file) {
    /* Slice 0 audit 2: this branch runs before the keyed check, so unkeyed it
       must not promise a recorded file "appears here" — it would be hidden. */
    return (
      <div className="hf" style={{ maxWidth: 1140 }}>
        <EmptyState icon={I.fileText} title="No HFE/UE file yet"
          hint={keyed
            ? 'Once an IEC 62366-1 HFE/UE file is recorded, its element completeness and use-related risk analysis — the gate before summative usability testing — appear here.'
            : "No IEC 62366-1 HFE/UE file is recorded for the organization. A file is shown here once this screen reads this project's records."}
          /* Slice 19: only the project's own empty file can be started from here. */
          action={keyed ? { label: 'Start the usability file', onAct: () => setStarting(true) } : undefined} />
        {starting && <C2CForm config={START_FORM} onCancel={() => setStarting(false)} onSubmit={startFile} />}
        <C2CToast msg={toast} />
      </div>
    );
  }

  return (
    <div className="hf" style={{ maxWidth: 1140 }}>
      <div className="sp-head">
        <div>
          <div className="sp-eyebrow">Specialist {I.dot} device {I.dot} human factors</div>
          <h1 className="sp-title">Human factors {I.dot} IEC 62366-1</h1>
          {/* Slice 0: the device name is the file's record, so it is named only once the read is keyed. */}
          <p className="sp-state">{keyed
            ? `${device} — use-related risk analysis and HFE/UE file completeness, the gate before summative testing.`
            : 'Use-related risk analysis and HFE/UE file completeness, the gate before summative testing.'}</p>
        </div>
        {/* Slice 0 audit: the scenario POST attaches to the organization's oldest
            file (human-factors.ts:259), not necessarily the one read, so no write
            is offered into a file this screen cannot tie to the project. */}
        {keyed && <button className="sp-primary" onClick={() => setForm(true)}>{I.plus} Add use scenario</button>}
      </div>

      {/* Slice 0: the file panels below read the organization's first file, which
          may be another project's, so they are not shown until the read is keyed. */}
      {!keyed ? (
        <EmptyState icon={I.info} testId="hf-not-keyed"
          title="Shown once this screen reads this project's records"
          hint="This screen reads the organization's first HFE/UE file, which may be another project's, so its use-related risk analysis and completeness are not shown here, and no use scenario is added from here." />
      ) : (<>

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
          ? <>The HFE/UE file is <b>{compPct}%</b> complete against IEC 62366-1{hfe.gaps.length ? ` — ${hfe.gaps.length} element${hfe.gaps.length === 1 ? '' : 's'} still open` : ''}. An empty scenario set is not a finding of “no unmitigated critical tasks”, so nothing is claimed here either way.</>
          : <>You've analysed <b>{risk.totalScenarios}</b> use scenarios; <b>{risk.criticalTaskCount}</b> {risk.criticalTaskCount === 1 ? 'is a' : 'are'} critical task{risk.criticalTaskCount === 1 ? '' : 's'} (serious or critical harm). The HFE/UE file is <b>{compPct}%</b> complete against IEC 62366-1{hfe.gaps.length ? ` — ${hfe.gaps.length} element${hfe.gaps.length === 1 ? '' : 's'} still open` : ''}.</>}
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
                : <button className="hf-go" title="Provenance" aria-label="Provenance" onClick={() => ask('Show the use-related risk provenance for ' + s.task)}>{I.search}</button>}
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
      </>)}

      {form && <C2CForm config={FORM} onCancel={() => setForm(false)} onSubmit={addScenario} />}
      {mitigating && <C2CForm config={MITIGATE_FORM} onCancel={() => setMitigating(null)} onSubmit={recordMitigation} />}
      <C2CToast msg={toast} />
    </div>
  );
}
