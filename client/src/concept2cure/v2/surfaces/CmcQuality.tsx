/**
 * Quality by design — CQAs, CPPs, the control strategy, and the ICH check.
 *
 * ── What this binds ───────────────────────────────────────────────────────────
 * Three deterministic, project-data-driven services existed server-side with no
 * caller in this UI at all:
 *
 *   GET  /api/cmc/quality/qbd/:projectId   CQAs and CPPs derived from the
 *                                          project's own specifications,
 *                                          methods, impurity profiles, stability
 *                                          and process records — not from
 *                                          drug-type heuristics
 *   POST /api/cmc/control-strategy         an ICH Q8/Q9/Q10/Q11 control strategy
 *                                          built from those CQAs and the methods
 *                                          that actually control them
 *   POST /api/cmc/ich-compliance           a rule-based check across
 *                                          Q1A/Q2/Q3A-B/Q3D/Q6A-B/Q8/Q9/Q10,
 *                                          every finding citing its guideline
 *
 * The Overview tab has been suggesting "Run the ICH compliance check and show
 * every gap" and "Generate the drug-substance control strategy" as prompts to
 * an assistant, while the endpoints that answer both questions deterministically
 * sat unreachable.
 *
 * ── The honesty these services demand of their UI ─────────────────────────────
 * All three distinguish "we checked and found nothing" from "we could not
 * check". `IchComplianceReport.overallStatus` has an `incomplete` value and
 * `CheckStatus` has `not_evaluated`; `QbdAnalysisResult` carries `partial` and
 * `unevaluatedInputs`; `StabilityMonitoringPlan.derivedFrom` says whether the
 * conditions are the project's or an ICH template. Every one of those is
 * surfaced here. A compliance screen that renders "could not check" as a green
 * tick is worse than no compliance screen.
 */

import React from 'react';
import { I } from '../icons';
import { apiRequest } from '@/lib/queryClient';
import { EmptyState, useLiveData } from '../dataConnect';
import { renderSafeMarkdown } from '../../components/ana/renderSafeMarkdown';
import { saveToAuthoring } from '../authoringHandoff';
import { cmcProjectUuid, cmcWriteError, openProgramAction } from './cmcShared';
import { C2CToast, useToast } from '../toast';

/* ── Read models (mirrors of the service types) ──────────────────────────── */

interface CqaItem {
  name: string;
  source: string;
  materialType?: string;
  evidenceDetail?: string;
  ichBasis: string[];
  methodLinked: boolean;
}

interface CppItem {
  name: string;
  processStep?: string;
  acceptableRange?: string;
  impacts?: string[];
  ichBasis: string[];
  source: string;
}

interface QbdResult {
  cqas: CqaItem[];
  cpps: CppItem[];
  inputs: {
    specificationCount: number;
    methodCount: number;
    stabilityStudyCount: number;
    drugSubstanceCount: number;
    processCount: number;
    cmcSourceObjectCount: number;
  };
  unevaluatedInputs: Array<{ input: string; reason: string }>;
  partial: boolean;
  gaps: string[];
  analyzedAt: string;
}

interface IchFinding {
  guideline: string;
  ruleId: string;
  status: 'pass' | 'warning' | 'fail' | 'not_applicable' | 'not_evaluated';
  message: string;
  evidence: string[];
  citation: string;
}

interface IchReport {
  overallStatus: 'compliant' | 'warnings' | 'non_compliant' | 'incomplete';
  guidelineStatus: Record<string, string>;
  findings: IchFinding[];
  counts: { pass: number; warning: number; fail: number; not_applicable: number; not_evaluated: number };
  unevaluatedInputs: Array<{ input: string; reason: string }>;
  evaluatedAt: string;
}

interface ControlElement {
  controlType: string;
  description: string;
  targetCqa?: string;
  acceptanceCriterion?: string;
  performedBy?: string;
  ichBasis: string[];
  justification: string;
}

interface StabilityMonitoringPlan {
  longTermCondition: string;
  acceleratedCondition: string;
  testParameters: string[];
  timePoints: string[];
  ichBasis: string[];
  derivedFrom: 'project_data' | 'ich_default' | 'not_evaluated';
  note?: string;
}

interface ControlStrategy {
  scope: string;
  cqas: CqaItem[];
  cpps: CppItem[];
  controlElements: ControlElement[];
  stabilityMonitoring: StabilityMonitoringPlan;
  gaps: string[];
  citations: string[];
  generatedAt: string;
}

/* ── Vocabulary ──────────────────────────────────────────────────────────── */

const FINDING_TONE: Record<string, string> = {
  pass: 'ok',
  warning: 'warn',
  fail: 'err',
  not_applicable: 'dim',
  /* Deliberately warn, not dim: "we could not check this" is an open question,
     not a settled non-issue, and must not read like one. */
  not_evaluated: 'warn',
};

const OVERALL_LABEL: Record<string, { tone: string; text: string }> = {
  compliant: { tone: 'ok', text: 'compliant' },
  warnings: { tone: 'warn', text: 'compliant with warnings' },
  non_compliant: { tone: 'err', text: 'non-compliant' },
  incomplete: { tone: 'warn', text: 'incomplete — some checks could not run' },
};

const CONTROL_TYPE_LABEL: Record<string, string> = {
  release_test: 'Release test',
  in_process_control: 'In-process control',
  stability_monitoring: 'Stability monitoring',
  raw_material_test: 'Raw material test',
  process_parameter_range: 'Process parameter range',
};

/* ── The surface ─────────────────────────────────────────────────────────── */

export function CmQuality({ ask, nav }: { ask: (text: string) => void; nav?: (id: string) => void }) {
  const projectId = cmcProjectUuid();
  const qbd = useLiveData<QbdResult>(
    projectId ? '/api/cmc/quality/qbd/' + encodeURIComponent(projectId) : null,
  );
  const [toast, fireToast] = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [ich, setIch] = React.useState<IchReport | null>(null);
  const [strategy, setStrategy] = React.useState<ControlStrategy | null>(null);
  const [scope, setScope] = React.useState<'both' | 'drug_substance' | 'drug_product'>('both');
  const [savingDoc, setSavingDoc] = React.useState(false);
  const savingRef = React.useRef(false);

  const post = async <T,>(key: string, path: string, body: unknown): Promise<T | null> => {
    if (busy) return null;
    setBusy(key);
    try {
      const res = await apiRequest('POST', path, body);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        fireToast(cmcWriteError(json, res.status), 'error');
        return null;
      }
      return ((json as { data?: T })?.data ?? null) as T | null;
    } catch (e) {
      fireToast(e instanceof Error ? e.message : String(e), 'error');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const runIch = async () => {
    if (!projectId) return;
    const report = await post<IchReport>('ich', '/api/cmc/ich-compliance', { projectId });
    if (report) {
      setIch(report);
      const blocking = report.counts.fail;
      fireToast(
        blocking
          ? `ICH check complete — ${blocking} ${blocking === 1 ? 'deficiency' : 'deficiencies'}, ${report.counts.warning} warnings.`
          : `ICH check complete — no deficiencies, ${report.counts.warning} warnings, ${report.counts.not_evaluated} not evaluated.`,
      );
    }
  };

  const runStrategy = async () => {
    if (!projectId) return;
    const doc = await post<ControlStrategy>('strategy', '/api/cmc/control-strategy', { projectId, scope });
    if (doc) {
      setStrategy(doc);
      fireToast(`Control strategy generated — ${doc.controlElements.length} control elements over ${doc.cqas.length} CQAs.`);
    }
  };

  /* The generated strategy is Module 3 quality documentation, so "open in
     editor" CREATES it: the document and the section carrying the markdown are
     both POSTed, and navigation happens only on a clean write. See
     ../authoringHandoff. */
  const openStrategyInEditor = async () => {
    if (!strategy || savingRef.current) return;
    savingRef.current = true;
    setSavingDoc(true);
    try {
      const res = await saveToAuthoring({
        title: 'CMC Control Strategy',
        module: 'M3',
        code: 'cmc_control_strategy',
        content: strategyMarkdown(strategy),
        subject: 'the control strategy',
      });
      if (!res.ok) { fireToast(res.message, 'error'); return; }
      if (nav) nav('document-authoring');
      else fireToast(res.message);
    } finally {
      savingRef.current = false;
      setSavingDoc(false);
    }
  };

  if (!projectId) {
    return (
      <div className="cm-body">
        <Head ask={ask} />
        <div className="pj-card">
          <div className="pj-card-b">
            <EmptyState
              icon={I.sigma}
              title="Open a program to analyse its quality design"
              hint="CQAs, CPPs, the control strategy and the ICH check are all derived from one project's own specifications, methods, impurity profiles, stability and process records."
              action={openProgramAction(nav)}
              regulation="Serves the quality design record (ICH Q8, Q9 and Q10)"
            />
          </div>
        </div>
      </div>
    );
  }

  const result = qbd.data;

  return (
    <div className="cm-body">
      <Head
        ask={ask}
        actions={
          <>
            <button className="nda-open" onClick={() => void runIch()} disabled={Boolean(busy)}>
              {I.shieldCheck} {busy === 'ich' ? 'Checking…' : 'Run ICH compliance check'}
            </button>
            <button className="reg-cta" onClick={() => void runStrategy()} disabled={Boolean(busy)}>
              {I.workflow} {busy === 'strategy' ? 'Generating…' : 'Generate control strategy'}
            </button>
          </>
        }
      />

      {/* ── CQAs / CPPs ── */}
      {qbd.loading ? (
        <EmptyState icon={I.sigma} title="Deriving CQAs and CPPs from this project’s data…" busy testId="cmc-qbd-loading" />
      ) : qbd.error ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn’t derive the quality attributes"
          hint={`The QbD register didn’t respond (${qbd.error}). It reads this project's specifications, methods, impurity profiles, stability and process records.`}
        />
      ) : result ? (
        <>
          <div className="cm-kpis">
            <Kpi l="CQAs derived" v={result.cqas.length} s="ICH Q8" />
            <Kpi l="Controlled by a method" v={result.cqas.filter((c) => c.methodLinked).length} tone={result.cqas.length && result.cqas.every((c) => c.methodLinked) ? 'ok' : 'warn'} />
            <Kpi l="CPPs derived" v={result.cpps.length} s="ICH Q11" />
            <Kpi l="Specifications read" v={result.inputs.specificationCount} />
            <Kpi l="Methods read" v={result.inputs.methodCount} />
            <Kpi l="Gaps" v={result.gaps.length} tone={result.gaps.length ? 'warn' : 'ok'} />
          </div>

          {result.partial && (
            <div className="pj-con" style={{ marginBottom: 14 }}>
              <span className="ico">{I.alertTriangle}</span>
              <div>
                <div className="pj-con-t">This analysis is partial</div>
                <div className="pj-con-d">
                  {result.unevaluatedInputs.map((u) => `${u.input} (${u.reason})`).join('; ')}. Attributes derived
                  from those inputs are missing from the lists below, and their absence is not evidence that they
                  do not exist.
                </div>
              </div>
            </div>
          )}

          {result.gaps.length > 0 && (
            <div className="pj-con" style={{ marginBottom: 14 }}>
              <span className="ico">{I.info}</span>
              <div>
                <div className="pj-con-t">{result.gaps.length} {result.gaps.length === 1 ? 'gap' : 'gaps'} in the quality design</div>
                <div className="pj-con-d"><ul className="cm-list">{result.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
              </div>
            </div>
          )}

          <div className="pj-card" style={{ marginBottom: 16 }}>
            <div className="pj-card-h">
              <span className="t">Critical quality attributes</span>
              <span className="s">derived from this project’s records — ICH Q8(R2)</span>
            </div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {result.cqas.length === 0 ? (
                <div style={{ padding: 12 }}>
                  <EmptyState
                    icon={I.sigma}
                    title="No CQAs could be derived yet"
                    hint="CQAs are inferred from recorded specifications, impurity profiles, stability-indicating parameters and method purposes. Record those and they appear here — nothing is inferred from the drug type alone."
                  />
                </div>
              ) : (
                <table className="reg-tbl">
                  <thead><tr><th>Attribute</th><th>Material</th><th>Derived from</th><th>Evidence</th><th>ICH basis</th><th>Method</th></tr></thead>
                  <tbody>
                    {result.cqas.map((c, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td>{c.materialType || '--'}</td>
                        <td>{c.source.replace(/_/g, ' ')}</td>
                        <td>{c.evidenceDetail || '--'}</td>
                        <td className="mono">{c.ichBasis.join(', ') || '--'}</td>
                        <td>
                          <span className={'rd-chip tone-' + (c.methodLinked ? 'ok' : 'warn')}>
                            {c.methodLinked ? 'controlled' : 'no method'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="pj-card" style={{ marginBottom: 16 }}>
            <div className="pj-card-h">
              <span className="t">Critical process parameters</span>
              <span className="s">from recorded process validation and source objects — ICH Q11</span>
            </div>
            <div className="pj-card-b" style={{ padding: 0 }}>
              {result.cpps.length === 0 ? (
                <div style={{ padding: 12 }}>
                  <EmptyState
                    icon={I.workflow}
                    title="No CPPs recorded yet"
                    hint="Record the critical process parameters on a process-validation record (Batch records tab) and they are read here with the attributes they impact."
                  />
                </div>
              ) : (
                <table className="reg-tbl">
                  <thead><tr><th>Parameter</th><th>Process step</th><th>Acceptable range</th><th>Impacts</th><th>ICH basis</th></tr></thead>
                  <tbody>
                    {result.cpps.map((p, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td>{p.processStep || '--'}</td>
                        <td>{p.acceptableRange || '--'}</td>
                        <td>{(p.impacts ?? []).join(', ') || '--'}</td>
                        <td className="mono">{p.ichBasis.join(', ') || '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : null}

      {/* ── ICH compliance ── */}
      <div className="pj-card" style={{ marginBottom: 16 }}>
        <div className="pj-card-h">
          <span className="t">ICH compliance</span>
          <span className="s">Q1A · Q2 · Q3A/B · Q3D · Q6A/B · Q8 · Q9 · Q10 — rule-based, every finding cited</span>
        </div>
        <div className="pj-card-b">
          {!ich ? (
            <EmptyState
              icon={I.shieldCheck}
              title="No check run yet"
              hint="The check runs deterministic rules over this project's recorded data and cites the guideline behind each finding. It is not an opinion and it is not an AI summary — run it above."
            />
          ) : (
            <>
              <div className="cm-gate" style={{ marginBottom: 10 }}>
                <span className={'rd-chip tone-' + (OVERALL_LABEL[ich.overallStatus]?.tone ?? 'dim')}>
                  {OVERALL_LABEL[ich.overallStatus]?.text ?? ich.overallStatus}
                </span>
                <span className="cm-meta">
                  {ich.counts.pass} pass · {ich.counts.warning} warning · {ich.counts.fail} fail ·
                  {' '}{ich.counts.not_applicable} n/a · {ich.counts.not_evaluated} not evaluated ·
                  checked {new Date(ich.evaluatedAt).toLocaleString()}
                </span>
              </div>
              {ich.unevaluatedInputs.length > 0 && (
                <div className="pj-con" style={{ marginBottom: 10 }}>
                  <span className="ico">{I.alertTriangle}</span>
                  <div>
                    <div className="pj-con-t">Some inputs could not be read</div>
                    <div className="pj-con-d">
                      {ich.unevaluatedInputs.map((u) => `${u.input} (${u.reason})`).join('; ')}. The rules that depend on
                      them are reported as <b>not evaluated</b>, never as passing.
                    </div>
                  </div>
                </div>
              )}
              <table className="reg-tbl">
                <thead><tr><th>Guideline</th><th>Rule</th><th>Status</th><th>Finding</th><th>Evidence</th><th>Citation</th></tr></thead>
                <tbody>
                  {ich.findings.map((f, i) => (
                    <tr key={i}>
                      <td className="mono" style={{ fontWeight: 600 }}>{f.guideline}</td>
                      <td className="mono">{f.ruleId}</td>
                      <td><span className={'rd-chip tone-' + (FINDING_TONE[f.status] ?? 'dim')}>{f.status.replace(/_/g, ' ')}</span></td>
                      <td>{f.message}</td>
                      <td>{f.evidence.length ? f.evidence.slice(0, 2).join('; ') + (f.evidence.length > 2 ? ` +${f.evidence.length - 2}` : '') : '--'}</td>
                      <td className="cm-meta">{f.citation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {/* ── Control strategy ── */}
      <div className="pj-card">
        <div className="pj-card-h">
          <span className="t">Control strategy</span>
          <span className="s">ICH Q8 / Q9 / Q10 / Q11 — built from the CQAs above and the methods that control them</span>
          <select
            className="de-select cm-inline-select"
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            aria-label="Control strategy scope"
          >
            <option value="both">Drug substance and product</option>
            <option value="drug_substance">Drug substance only</option>
            <option value="drug_product">Drug product only</option>
          </select>
        </div>
        <div className="pj-card-b">
          {!strategy ? (
            <EmptyState
              icon={I.workflow}
              title="No control strategy generated yet"
              hint="The generator reads this project's CQAs, specifications, methods and stability program and produces the control elements with a risk-based justification and a citation for each. Generate it above."
            />
          ) : (
            <>
              {strategy.gaps.length > 0 && (
                <div className="pj-con" style={{ marginBottom: 10 }}>
                  <span className="ico">{I.info}</span>
                  <div>
                    <div className="pj-con-t">{strategy.gaps.length} {strategy.gaps.length === 1 ? 'gap the strategy could not close' : 'gaps the strategy could not close'}</div>
                    <div className="pj-con-d"><ul className="cm-list">{strategy.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></div>
                  </div>
                </div>
              )}
              <table className="reg-tbl">
                <thead><tr><th>Control</th><th>Type</th><th>Target CQA</th><th>Acceptance criterion</th><th>Performed by</th><th>ICH basis</th></tr></thead>
                <tbody>
                  {strategy.controlElements.map((c, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }} title={c.justification}>{c.description}</td>
                      <td>{CONTROL_TYPE_LABEL[c.controlType] ?? c.controlType.replace(/_/g, ' ')}</td>
                      <td>{c.targetCqa || '--'}</td>
                      <td>{c.acceptanceCriterion || '--'}</td>
                      <td>{c.performedBy || <span className="sp-tone-warn">not assigned</span>}</td>
                      <td className="mono">{c.ichBasis.join(', ') || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="cm-sub-head">Stability monitoring plan</div>
              {strategy.stabilityMonitoring.derivedFrom !== 'project_data' && (
                <div className="pj-con" style={{ marginBottom: 10 }}>
                  <span className="ico">{I.alertTriangle}</span>
                  <div>
                    <div className="pj-con-t">
                      {strategy.stabilityMonitoring.derivedFrom === 'not_evaluated'
                        ? 'The stability inputs could not be read'
                        : 'These are ICH defaults, not this project’s stability program'}
                    </div>
                    <div className="pj-con-d">{strategy.stabilityMonitoring.note || 'Register the project’s stability studies and regenerate to replace the template with the real program.'}</div>
                  </div>
                </div>
              )}
              <table className="reg-tbl">
                <tbody>
                  <tr><td style={{ fontWeight: 600 }}>Long-term condition</td><td>{strategy.stabilityMonitoring.longTermCondition}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Accelerated condition</td><td>{strategy.stabilityMonitoring.acceleratedCondition}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Test parameters</td><td>{strategy.stabilityMonitoring.testParameters.join(', ') || '--'}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Pull points</td><td>{strategy.stabilityMonitoring.timePoints.join(', ') || '--'}</td></tr>
                </tbody>
              </table>

              <div className="cm-doc" style={{ marginTop: 16 }}>
                <div className="cm-doc-bar">
                  <div>
                    <span className="cm-doc-kind">Control strategy</span>
                    <span className="cm-doc-prov">deterministic — generated {new Date(strategy.generatedAt).toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="bs-da" onClick={() => ask('Review this control strategy and tell me what a reviewer would challenge')}>
                      {I.sparkles} Challenge with AnA
                    </button>
                    <button className="bs-da primary" onClick={() => void openStrategyInEditor()} disabled={savingDoc}>
                      {I.penLine} {savingDoc ? 'Saving to the editor…' : 'Open in editor'}
                    </button>
                  </div>
                </div>
                <div className="cm-doc-page">
                  <div className="cm-doc-render" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(strategyMarkdown(strategy)) }} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <C2CToast msg={toast} />
    </div>
  );
}

/* ── The strategy as a document ──────────────────────────────────────────── */

/**
 * The generated strategy rendered as the §3.2 narrative it becomes. Every row
 * comes from the service payload — nothing is added, and the provenance line at
 * the foot says what produced it, so the document cannot be mistaken for a
 * hand-written justification.
 */
export function strategyMarkdown(s: ControlStrategy): string {
  const scopeLabel =
    s.scope === 'drug_substance' ? 'Drug substance' : s.scope === 'drug_product' ? 'Drug product' : 'Drug substance and drug product';
  let md = `# Control Strategy\n\n*${scopeLabel} — ICH Q8(R2) / Q9(R1) / Q10 / Q11*\n\n`;

  md += `## 1. Critical Quality Attributes\n\n`;
  if (s.cqas.length === 0) {
    md += `No critical quality attributes could be derived from the recorded data.\n\n`;
  } else {
    md += `| Attribute | Material | Derived from | ICH basis | Controlled by a method |\n|---|---|---|---|---|\n`;
    s.cqas.forEach((c) => {
      md += `| ${c.name} | ${c.materialType || '--'} | ${c.source.replace(/_/g, ' ')} | ${c.ichBasis.join(', ') || '--'} | ${c.methodLinked ? 'Yes' : 'No'} |\n`;
    });
    md += `\n`;
  }

  md += `## 2. Critical Process Parameters\n\n`;
  if (s.cpps.length === 0) {
    md += `No critical process parameters are recorded for this project.\n\n`;
  } else {
    md += `| Parameter | Process step | Acceptable range | Impacts |\n|---|---|---|---|\n`;
    s.cpps.forEach((p) => {
      md += `| ${p.name} | ${p.processStep || '--'} | ${p.acceptableRange || '--'} | ${(p.impacts ?? []).join(', ') || '--'} |\n`;
    });
    md += `\n`;
  }

  md += `## 3. Control Elements\n\n`;
  if (s.controlElements.length === 0) {
    md += `No control elements could be assembled from the recorded data.\n\n`;
  } else {
    s.controlElements.forEach((c, i) => {
      md += `### 3.${i + 1} ${c.description}\n\n`;
      md += `- **Control type**: ${CONTROL_TYPE_LABEL[c.controlType] ?? c.controlType.replace(/_/g, ' ')}\n`;
      if (c.targetCqa) md += `- **Target attribute**: ${c.targetCqa}\n`;
      if (c.acceptanceCriterion) md += `- **Acceptance criterion**: ${c.acceptanceCriterion}\n`;
      if (c.performedBy) md += `- **Performed by**: ${c.performedBy}\n`;
      md += `- **Basis**: ${c.ichBasis.join(', ') || '--'}\n`;
      md += `- **Justification**: ${c.justification}\n\n`;
    });
  }

  md += `## 4. Stability Monitoring\n\n`;
  md += `- **Long-term**: ${s.stabilityMonitoring.longTermCondition}\n`;
  md += `- **Accelerated**: ${s.stabilityMonitoring.acceleratedCondition}\n`;
  md += `- **Parameters**: ${s.stabilityMonitoring.testParameters.join(', ') || '--'}\n`;
  md += `- **Pull points**: ${s.stabilityMonitoring.timePoints.join(', ') || '--'}\n`;
  if (s.stabilityMonitoring.derivedFrom !== 'project_data') {
    md += `\n> **These conditions are not this project's recorded stability program.** ${s.stabilityMonitoring.note || 'They are generic ICH Q1A(R2) values.'}\n`;
  }
  md += `\n`;

  if (s.gaps.length) {
    md += `## 5. Open Gaps\n\n`;
    s.gaps.forEach((g) => { md += `- ${g}\n`; });
    md += `\n`;
  }

  if (s.citations.length) {
    md += `## References\n\n`;
    s.citations.forEach((c) => { md += `- ${c}\n`; });
    md += `\n`;
  }

  md += `---\n*Generated deterministically from this project's recorded CMC data (specifications, analytical methods, impurity profiles, stability studies and process records). Review and approve through change control before it is filed.*\n`;
  return md;
}

/* ── Local chrome ────────────────────────────────────────────────────────── */

const SUGGEST = [
  'Which CQAs have no validated method controlling them?',
  'What would a reviewer challenge in this control strategy?',
  'Turn the ICH findings into a remediation plan with owners',
];

function Head({ ask, actions }: { ask: (text: string) => void; actions?: React.ReactNode }) {
  return (
    <>
      <div className="cm-head">
        <div>
          <div className="cm-kicker">CMC — Module 3 operating system</div>
          <h1 className="cm-title">Quality by design</h1>
          <div className="cm-meta">CQAs and CPPs derived from your own records, the control strategy over them, and the ICH check</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {actions}
          <button className="reg-cta" onClick={() => ask(SUGGEST[0])}>{I.sparkles} Ask AnA</button>
        </div>
      </div>
      <div className="sp-starters" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {SUGGEST.map((s, i) => (
          <button key={i} className="sp-starter" onClick={() => ask(s)}>
            <span className="sk">{I.sparkles}</span><span>{s}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function Kpi({ l, v, s, tone }: { l: string; v: React.ReactNode; s?: string; tone?: string }) {
  return (
    <div className="reg-kpi" data-tone={tone}>
      <div className="reg-kpi-v">{v}</div>
      <div className="reg-kpi-l">{l}{s ? ' -- ' + s : ''}</div>
    </div>
  );
}
