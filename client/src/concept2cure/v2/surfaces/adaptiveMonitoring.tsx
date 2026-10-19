/**
 * Adaptive monitoring — the interim look a DSMB sits in front of, recorded.
 *
 * ── What this closes ─────────────────────────────────────────────────────────
 * Eight routes under `/api/biostat/adaptive/*` — create a plan, ingest an
 * interim snapshot, evaluate its stopping rules, re-estimate the sample size,
 * sign a decision, read the plan, read the IDMC report, read the operating
 * characteristics — were mounted, tested, and reached by NO client code. A
 * sponsor could COMPUTE an interim look (the stateless
 * `/api/biostat/adaptive/interim`, 2026-10-12) and could not RECORD one: no
 * stored plan, no snapshot history, no IDMC report, no decision.
 *
 * The wire and the Part 11 signature dialog live in `adaptiveMonitoringApi`;
 * this half is the panel. A decision is an electronic signature bound to the
 * look's own data — see that module's header for the ceremony it runs.
 *
 * ── Why it lives here and not on a rail ──────────────────────────────────────
 * CLAUDE.md RULE 2: no session adds a surface outside the launch catalog. This
 * is a panel of the existing biostatistics workbench, not a new destination.
 *
 * @module client/src/concept2cure/v2/surfaces/adaptiveMonitoring
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ADAPTATION_TYPES,
  AdaptiveDecisionSignModal,
  adaptationLabel,
  adaptiveApi,
  FAILED,
  type AdaptiveDecisionRow,
  type AdaptivePlan,
  type DecisionDraft,
  type InterimSnapshot,
  type Read,
} from './adaptiveMonitoringApi';
import { EmptyState } from '../dataConnect';
import { I } from '../icons';

const num = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '—');

/** A figure the engine produced, or an em dash. Never a zero standing in. */
function Figure({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>{num(value)}</div>
      <div style={{ fontSize: 11, color: 'var(--text-300,#6b6963)' }}>{label}</div>
    </div>
  );
}

/** The looks on a plan, with the figures each carries. */
function SnapshotTable({ snapshots, selectedId, onSelect }: {
  snapshots: InterimSnapshot[];
  selectedId: number | null;
  onSelect: (s: InterimSnapshot) => void;
}) {
  if (snapshots.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-300,#6b6963)' }}>
        No interim look is recorded on this plan yet. Record one below; nothing is computed until there is data at a look.
      </div>
    );
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="reg-tbl" aria-label="Interim looks on this plan">
        <thead>
          <tr>
            <th scope="col">Look</th><th scope="col">Information fraction</th><th scope="col">Enrolled</th>
            <th scope="col">Blinded</th><th scope="col">Z</th><th scope="col">Conditional power</th>
            <th scope="col">Predictive power</th><th scope="col"><span className="sr-only">Select</span></th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <tr key={s.id} aria-selected={s.id === selectedId}>
              <td>{s.lookNumber}</td>
              <td className="mono">{num(s.informationFraction)}</td>
              <td className="mono">{s.enrolledCount ?? '—'}</td>
              {/* A null blinding flag is "not recorded", not "unblinded". */}
              <td>{s.isBlinded === null ? 'not recorded' : s.isBlinded ? 'blinded' : 'unblinded'}</td>
              <td className="mono">{num(s.testStatistic)}</td>
              <td className="mono">{num(s.conditionalPower)}</td>
              <td className="mono">{num(s.predictivePower)}</td>
              <td>
                <button className="btn" style={{ height: 26 }} onClick={() => onSelect(s)}
                  aria-pressed={s.id === selectedId}>
                  {s.id === selectedId ? 'Selected' : 'Select'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The decisions already signed on this plan. */
function DecisionLog({ decisions }: { decisions: AdaptiveDecisionRow[] }) {
  if (decisions.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-300,#6b6963)' }}>No decision has been signed on this plan.</div>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="reg-tbl" aria-label="Decisions signed on this plan">
        <thead><tr><th scope="col">Look</th><th scope="col">Adaptation</th><th scope="col">Decision</th><th scope="col">Rationale</th><th scope="col">Signed</th></tr></thead>
        <tbody>
          {decisions.map((d) => (
            <tr key={d.id}>
              <td className="mono">{d.snapshotId ?? '—'}</td>
              <td>{adaptationLabel(d.adaptationType)}</td>
              <td>{d.decision}</td>
              <td style={{ fontSize: 12 }}>{d.rationale}</td>
              {/* The signature is in electronic_signatures, bound to the look.
                  This column is the decision row's own record of when it was
                  signed — it says "not recorded" rather than inventing one. */}
              <td className="mono">{d.approvedAt ? new Date(d.approvedAt).toISOString().slice(0, 16).replace('T', ' ') : 'not recorded'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A pane the generic renderer cannot tabulate: shown raw rather than dropped. */
function EngineJson({ read }: { read: Read<Record<string, unknown>> }) {
  if (read.kind !== 'ok') return null;
  return (
    <pre style={{ fontSize: 11, maxHeight: 260, overflow: 'auto', background: 'var(--bg-050)', padding: 8, borderRadius: 4 }}>
      {JSON.stringify(read.value, null, 2)}
    </pre>
  );
}

type Runner = (
  what: string,
  fn: () => Promise<Record<string, unknown>>,
  set: (r: Read<Record<string, unknown>>) => void,
) => Promise<void>;

/** The four engine reads a look supports. Each is disabled until a look is chosen. */
function LookActions({ plan, selected, run, setEvaluation, setReport, setOc }: {
  plan: AdaptivePlan;
  selected: InterimSnapshot | null;
  run: Runner;
  setEvaluation: (r: Read<Record<string, unknown>>) => void;
  setReport: (r: Read<Record<string, unknown>>) => void;
  setOc: (r: Read<Record<string, unknown>>) => void;
}) {
  const needLook = 'Select a look first';
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className="btn" style={{ height: 30 }} disabled={!selected}
        title={selected ? 'Evaluate the stopping rules at this look' : needLook}
        onClick={() => selected && void run('The evaluation', () => adaptiveApi.evaluate(plan.id, selected.id), setEvaluation)}>
        {I.zap} Evaluate stopping rules
      </button>
      <button className="btn" style={{ height: 30 }} disabled={!selected}
        title={selected ? 'Blinded sample-size re-estimation at this look' : needLook}
        onClick={() => selected && void run('The re-estimation', () => adaptiveApi.reestimate(plan.id, selected.id), setEvaluation)}>
        {I.sigma} Re-estimate sample size
      </button>
      <button className="btn" style={{ height: 30 }} disabled={!selected}
        title={selected ? 'The IDMC report for this look' : needLook}
        onClick={() => selected && void run('The IDMC report', () => adaptiveApi.idmcReport(plan.id, selected.lookNumber), setReport)}>
        {I.fileText} IDMC report
      </button>
      <button className="btn" style={{ height: 30 }}
        onClick={() => void run('The operating characteristics', () => adaptiveApi.operatingCharacteristics(plan.id), setOc)}>
        {I.barChart} Operating characteristics
      </button>
    </div>
  );
}

/** What the decision is, before the signature dialog asks who is signing it. */
function DecisionForm({ disabled, adaptationType, onAdaptationType, decision, onDecision, onSign }: {
  disabled: boolean;
  adaptationType: string;
  onAdaptationType: (v: string) => void;
  decision: string;
  onDecision: (v: string) => void;
  onSign: () => void;
}) {
  const stated = decision.trim().length > 0;
  return (
    <div style={{ borderTop: '1px solid var(--border-200,#e5e3df)', paddingTop: 10, display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600 }}>Sign a decision at this look</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ fontSize: 12 }}>
          Adaptation
          <select className="c2c-input" style={{ height: 30 }} value={adaptationType}
            onChange={(e) => onAdaptationType(e.target.value)}>
            {ADAPTATION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, flex: 1, minWidth: 220 }}>
          Decision
          <input className="c2c-input" style={{ height: 30 }} value={decision}
            onChange={(e) => onDecision(e.target.value)} placeholder="e.g. Increase N to 640" />
        </label>
        <button className="btn primary" style={{ height: 30 }} disabled={disabled || !stated}
          title={
            disabled ? 'Select the look this decision is about'
              : !stated ? 'State the decision'
                : 'Opens the signature dialog; nothing is written until it completes'
          }
          onClick={onSign}>
          {I.penLine} Sign decision…
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-300,#6b6963)' }}>
        The signature binds the look&rsquo;s data. The rationale you give in the dialog is the
        signature&rsquo;s reason and is stored with it.
      </div>
    </div>
  );
}

/** The plan to open. A non-integer is refused here rather than requested. */
function OpenPlanForm({ value, onValue, onOpen, onInvalid }: {
  value: string;
  onValue: (v: string) => void;
  onOpen: (planId: number) => void;
  onInvalid: (message: string) => void;
}) {
  return (
    <form
      style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(value.trim());
        if (!Number.isInteger(n) || n <= 0) {
          onInvalid('An adaptive plan id is a positive integer.');
          return;
        }
        onOpen(n);
      }}
    >
      <label style={{ fontSize: 12 }}>
        Adaptive plan id
        <input className="c2c-input" style={{ height: 30 }} inputMode="numeric" value={value}
          onChange={(e) => onValue(e.target.value)} placeholder="e.g. 12" />
      </label>
      <button className="btn primary" style={{ height: 30 }} type="submit">{I.search} Open plan</button>
    </form>
  );
}

/** What the plan is, and how much of it is on the record. */
function PlanHeader({ plan, looks, signed }: { plan: AdaptivePlan; looks: number; signed: number }) {
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontWeight: 600 }}>{plan.title || `Plan ${plan.id}`}</div>
        <div style={{ fontSize: 12, color: 'var(--text-300,#6b6963)' }}>
          {/* Absent is "not recorded", never a made-up design type. */}
          {plan.designType || 'design type not recorded'}
          {plan.spendingFunction ? ` · ${plan.spendingFunction}` : ''}
        </div>
      </div>
      <Figure label="Max sample size" value={plan.maxSampleSize} />
      <Figure label="Looks recorded" value={looks} />
      <Figure label="Decisions signed" value={signed} />
    </div>
  );
}

/** Everything a loaded plan shows: its looks, the engine reads, the decision. */
function LoadedPlan(props: {
  plan: AdaptivePlan;
  snapshots: InterimSnapshot[];
  decisions: AdaptiveDecisionRow[];
  selected: InterimSnapshot | null;
  onSelect: (s: InterimSnapshot) => void;
  run: Runner;
  evaluation: Read<Record<string, unknown>>;
  setEvaluation: (r: Read<Record<string, unknown>>) => void;
  report: Read<Record<string, unknown>>;
  setReport: (r: Read<Record<string, unknown>>) => void;
  oc: Read<Record<string, unknown>>;
  setOc: (r: Read<Record<string, unknown>>) => void;
  adaptationType: string;
  onAdaptationType: (v: string) => void;
  decisionText: string;
  onDecisionText: (v: string) => void;
  onDraft: (d: DecisionDraft) => void;
}) {
  const { plan, snapshots, decisions, selected, evaluation, report, oc } = props;
  return (
    <>
      <PlanHeader plan={plan} looks={snapshots.length} signed={decisions.length} />
      <SnapshotTable snapshots={snapshots} selectedId={selected?.id ?? null} onSelect={props.onSelect} />
      <LookActions plan={plan} selected={selected} run={props.run}
        setEvaluation={props.setEvaluation} setReport={props.setReport} setOc={props.setOc} />
      {evaluation.kind === 'loading' && <div role="status" className="scaf-note">Running on the statistical engine…</div>}
      <EngineJson read={evaluation} />
      <EngineJson read={report} />
      <EngineJson read={oc} />
      <DecisionForm
        disabled={!selected}
        adaptationType={props.adaptationType}
        onAdaptationType={props.onAdaptationType}
        decision={props.decisionText}
        onDecision={props.onDecisionText}
        onSign={() => selected && props.onDraft({
          planId: plan.id, snapshot: selected,
          adaptationType: props.adaptationType, decision: props.decisionText.trim(),
        })}
      />
      <DecisionLog decisions={decisions} />
    </>
  );
}

/**
 * Every read this panel makes, and the two callbacks that make them.
 *
 * A hook rather than state in the component because the component is then a
 * composition of the pieces above it, which is what keeps it readable — and
 * because `run` has one definition for all four engine reads, so none of them
 * can forget to clear its notice or to report its failure.
 */
function useAdaptivePlan() {
  const [planId, setPlanId] = useState<number | null>(null);
  const [plan, setPlan] = useState<Read<AdaptivePlan>>({ kind: 'idle' });
  const [selected, setSelected] = useState<InterimSnapshot | null>(null);
  const [evaluation, setEvaluation] = useState<Read<Record<string, unknown>>>({ kind: 'idle' });
  const [oc, setOc] = useState<Read<Record<string, unknown>>>({ kind: 'idle' });
  const [report, setReport] = useState<Read<Record<string, unknown>>>({ kind: 'idle' });
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const loadPlan = useCallback(async (id: number) => {
    setPlan({ kind: 'loading' });
    // A new plan invalidates every read taken against the previous one.
    setSelected(null);
    setEvaluation({ kind: 'idle' });
    setReport({ kind: 'idle' });
    try {
      setPlan({ kind: 'ok', value: await adaptiveApi.plan(id) });
    } catch (e) {
      setPlan({ kind: 'failed', message: e instanceof Error ? e.message : FAILED });
    }
  }, []);

  useEffect(() => {
    if (planId !== null) void loadPlan(planId);
  }, [planId, loadPlan]);

  const run: Runner = useCallback(async (what, fn, set) => {
    set({ kind: 'loading' });
    setNotice(null);
    try {
      set({ kind: 'ok', value: await fn() });
    } catch (e) {
      const message = e instanceof Error ? e.message : FAILED;
      /* Both: the pane says it has no value, and the notice says why. An
         engine read that failed must not read as one that returned nothing. */
      set({ kind: 'failed', message });
      setNotice({ tone: 'error', text: `${what} did not run. ${message}` });
    }
  }, []);

  const snapshots = useMemo(
    () => (plan.kind === 'ok' && Array.isArray(plan.value.snapshots) ? plan.value.snapshots : []),
    [plan],
  );
  const decisions = useMemo(
    () => (plan.kind === 'ok' && Array.isArray(plan.value.decisions) ? plan.value.decisions : []),
    [plan],
  );

  return {
    planId, setPlanId, plan, loadPlan, selected, setSelected,
    evaluation, setEvaluation, oc, setOc, report, setReport,
    notice, setNotice, run, snapshots, decisions,
  };
}

export function AdaptiveMonitoringPanel() {
  const [planIdInput, setPlanIdInput] = useState('');
  const [draft, setDraft] = useState<DecisionDraft | null>(null);
  const [adaptationType, setAdaptationType] = useState<string>(ADAPTATION_TYPES[0][0]);
  const [decisionText, setDecisionText] = useState('');
  const a = useAdaptivePlan();

  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">Adaptive monitoring</span>
        <span className="s">interim looks, their figures, and the signed decision</span>
      </div>
      <div className="pj-card-b" style={{ padding: 12, display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-300,#6b6963)', lineHeight: 1.5 }}>
          The stored side of an adaptive trial: a plan, its interim looks, the stopping rules evaluated at each,
          the blinded sample-size re-estimation, the IDMC report, and the decision — which is an electronic
          signature bound to the look&rsquo;s own data, not a button. To compute a look without recording one,
          use the <b>Interim look</b> calculator below.
        </div>

        <OpenPlanForm
          value={planIdInput}
          onValue={setPlanIdInput}
          onOpen={a.setPlanId}
          onInvalid={(text) => a.setNotice({ tone: 'error', text })}
        />

        {a.notice && (
          <div className={a.notice.tone === 'error' ? 'pde-refusal' : 'scaf-note'} role="status">{a.notice.text}</div>
        )}

        {a.plan.kind === 'loading' && <div role="status" className="scaf-note">Reading the plan…</div>}
        {a.plan.kind === 'failed' && (
          <EmptyState tone="error" icon={I.alertTriangle} title="The plan was not read" hint={a.plan.message}
            retry={a.planId !== null ? () => void a.loadPlan(a.planId as number) : undefined} />
        )}

        {a.plan.kind === 'ok' && (
          <LoadedPlan
            plan={a.plan.value}
            snapshots={a.snapshots}
            decisions={a.decisions}
            selected={a.selected}
            onSelect={a.setSelected}
            run={a.run}
            evaluation={a.evaluation}
            setEvaluation={a.setEvaluation}
            report={a.report}
            setReport={a.setReport}
            oc={a.oc}
            setOc={a.setOc}
            adaptationType={adaptationType}
            onAdaptationType={setAdaptationType}
            decisionText={decisionText}
            onDecisionText={setDecisionText}
            onDraft={setDraft}
          />
        )}
      </div>

      {draft && (
        <AdaptiveDecisionSignModal
          draft={draft}
          onClose={() => setDraft(null)}
          onSigned={() => {
            setDraft(null);
            setDecisionText('');
            a.setNotice({ tone: 'ok', text: 'The decision was signed and recorded.' });
            if (a.planId !== null) void a.loadPlan(a.planId);
          }}
        />
      )}
    </div>
  );
}
