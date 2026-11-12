/**
 * The defensibility assessment and the design calculators — two sections of the
 * ONE Biostatistics surface (`surfaces/Biostatistics.tsx`).
 *
 * ── This was a second surface, and is not one any more (2026-11-09) ──────────
 * It was registered as `biostat-workbench` from 2026-07-21 to 2026-11-09. Why
 * it existed, and why it stopped needing to:
 *
 *  1. 2026-07-21 (`3b3299d733`) it was created — "workbench driving the real
 *     statistical engine (not client approx)" — BECAUSE `Biostatistics.tsx`
 *     carried its own ~520-line statistics engine in the browser, with its own
 *     Abramowitz & Stegun CDF and four copies of the sizing arithmetic that did
 *     not agree with each other.
 *  2. 2026-08 `docs/SURFACE_CONSOLIDATION_2026-08.md` §5 decided the merge:
 *     "Survivor: `biostatistics`. Fold the workbench in as a tab; it has no AnA
 *     at all today." It was not carried out.
 *  3. 2026-10-12 (`d1a742b5d6`) deleted the browser's engine from
 *     `Biostatistics.tsx`, which now calls the same server engines this file
 *     does. The reason for two surfaces ended there, leaving two registered
 *     destinations with the same `layoutMode`, the same icon, the same group
 *     and overlapping `apiPrefixes`, joined by a ghost button — and this one
 *     took `SurfaceViewProps` and dropped `onAsk`, so AnA could not be reached
 *     from it at all.
 *
 * The two capabilities are now exported as sections and mounted on the
 * survivor; the page shell, the back button and the surface registration are
 * gone. CLAUDE.md: "Zero duplication. One canonical implementation per
 * capability." Pinned by `__tests__/biostatIsOneSurface.test.tsx`.
 *
 * Wired to two real backends:
 *   • Statistical defensibility (server/routes/statistical-defensibility.ts,
 *     mounted /api/statistical-defensibility): POST /assess — the deterministic
 *     judgment engine (ana-biostats), the one AnA's assess_statistical_
 *     defensibility tool runs. Until 2026-10-05 this was a model's score.
 *   • Design-stats calculators (server/routes/biostat-design-stats.ts under
 *     /api/biostat, org-scoped): FIFTEEN deterministic engines, declared as data
 *     in `biostatCalculators.ts` and rendered by one generic form below.
 *
 * ── Why this file used to reach one engine out of fifteen ────────────────────
 * The calculators were built, mounted, unit-tested and reference-pinned, and the
 * workbench called exactly one of them (assurance). Group-sequential OC, MMRM
 * sizing, RMST, win ratio, BOIN, MRMC, Bayesian device sizing, multiplicity,
 * external-control sensitivity, enrollment forecasting, event projection and
 * diagnostic sizing were all running and unreachable from the product.
 *
 * They are now all reachable. The forms are generated from the registry rather
 * than hand-written, so the sixteenth engine costs a data entry, not a new form.
 *
 * ── What is NOT done here ────────────────────────────────────────────────────
 * Results are rendered from the server's response only — no in-browser
 * statistics, and nothing is fabricated. Where an engine returns a value the
 * generic renderer cannot tabulate (a nested grid, a memo), the raw response is
 * shown rather than silently dropped. The defensibility tools are pure math and
 * work immediately; the design calculators require a signed-in org and surface a
 * 401 honestly rather than showing an empty result.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import {
  CALCULATORS,
  IVD_CALCULATOR_BASE,
  buildRequestBody,
  calculatorEndpoint,
  calculatorResultKey,
  initialValues,
  isFieldVisible,
  type Calculator,
  type CalculatorField,
} from './biostatCalculators';
import '../styles/project-home-v2.css';

import type { FireToast } from '../toast';
import { useAuthoringHandoff } from '../authoringHandoff';
import { AuthoringHandoffNotice } from '../AuthoringHandoffNotice';
import { engineResultToHtml, engineResultTableColumns, engineResultCellText, type EngineResultTable } from '../engineResultHtml';

/**
 * Where a computed result belongs in the filing.
 *
 * Every hand-off said `module: 'M5'` from 2026-07-21 to 2026-11-09, the eleven
 * CLSI calculators included — and a 510(k), De Novo, PMA or IVDR filing has no
 * CTD Module 5. It files an eSTAR or a technical file, which is why every
 * device placement in `services/biostatistics-bridge/filing-placement.ts` is an
 * `ESTAR(...)` rule with `module: null`, and why `BridgePlacement.module` is
 * typed `'M1' | … | 'M5' | null`. That catalog's header names this hardcode as
 * the defect it was written to end; the sibling surface was fixed then and the
 * calculators were not, because they had no project in scope until the two
 * surfaces merged.
 *
 * Two things make a result a device result: the project files a device
 * application, or the engine is one of the CLSI analytical/clinical-performance
 * estimators, which are not clinical study reports in anyone's filing. The
 * column is `text('module')` and its own comment reads "ind-wizard, coauthor,
 * cmc, etc." — 'Risk-based monitoring' and 'eCTD co-author' are already in it —
 * so naming the eSTAR is within its purpose, and nothing parses this into a CTD
 * placement (the eSTAR and PMA mappers place by their own keys).
 *
 * 'M5' remains the answer for a drug design engine, as it has been throughout.
 */
export function filingModuleForCalculator(calc: Calculator, deviceProject?: boolean): string {
  const clsi = calc.base === IVD_CALCULATOR_BASE;
  return deviceProject || clsi ? 'eSTAR performance' : 'M5';
}

/** A dimension of the engine's judgment (ana-biostats JudgmentDimension). */
interface JudgedDimension {
  name: string;
  verdict: 'adequate' | 'marginal' | 'inadequate' | 'insufficient_information';
  score: number;
  rationale: string;
  flags: string[];
}

/** POST /api/statistical-defensibility/assess, status 'assessed' (deterministic). */
interface Defensibility {
  status: 'assessed';
  engine: 'deterministic';
  sampleSize: number | null;
  power: number | null;
  /* What the engine says it computed. The payload carried only the N, the
     power and the judgment, so nothing on screen stated the hazard ratio the
     sizing used — which is why a mislabelled input could show an 11x
     under-sizing with a verdict chip beside it and nothing to contradict it.
     `formula` prints "HR=0.700". */
  method?: string | null;
  formula?: string | null;
  assumptions?: Array<{ parameter: string; value: number | string; source: string; sensitivity: string }>;
  judgment: {
    overallVerdict: JudgedDimension['verdict'];
    overallRisk: 'low' | 'moderate' | 'high' | 'critical';
    actionRecommendation: 'proceed' | 'proceed_with_conditions' | 'revise' | 'escalate';
    dimensions: JudgedDimension[];
    escalationReasons: string[];
  };
}

/**
 * POST and read the result out of the envelope the server used.
 *
 * `resultKey` exists because the two routers this surface drives answer
 * differently: `/api/biostat` sends `{success, data}` and
 * `/api/diagnostics-performance` sends `{result}`. Reading the wrong key
 * yields null, which this surface renders as "Calculation failed" — a refusal
 * where a result was returned. One parameter, declared per calculator in
 * `biostatCalculators.ts`, rather than two copies of this function.
 */
/** The inputs a NEEDS_PARAMETERS refusal names (its `data.errors[].field`). A field not yet filled is not an error. */
function neededFields(e: unknown): string[] | undefined {
  const err = e as { code?: unknown; payload?: { data?: { errors?: Array<{ field?: unknown }> } } };
  if (err.code !== 'NEEDS_PARAMETERS') return undefined;
  const fields = (err.payload?.data?.errors ?? []).map((x) => x.field).filter((f): f is string => typeof f === 'string');
  return fields.length ? fields : undefined;
}

async function readData<T = any>(
  path: string,
  body: unknown,
  resultKey: 'data' | 'result' = 'data',
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null; needs?: string[] }> {
  try {
    const res = await apiRequest('POST', path, body);
    const parsed = (await res.json().catch(() => null)) as any;
    return {
      ok: res.ok,
      status: res.status,
      data: (parsed?.[resultKey] ?? null) as T | null,
      // Servers here report failures as { error } or { message }; surfacing the
      // server's own words beats a generic "calculation failed", because the
      // usual cause is a domain constraint the form cannot check locally (an
      // information fraction not ending at 1, a covariance ordering violation).
      // Reading `error` first defeated that: on { error: 'VALIDATION_FAILED',
      // message: '<the violated constraint>' } the enum won and the toast showed
      // the token. serverMessage takes the sentence wherever the envelope put it
      // and returns null when none of it is copy, which leaves the callers' own
      // fallback in charge.
      error: serverMessage(parsed),
    };
  } catch (e) {
    // apiRequest THROWS for every non-OK status except 401, so a real server
    // refusal arrives HERE, not in the branch above. Discarding it reported
    // every domain-constraint rejection as a bare "(HTTP 0)" — the opposite of
    // what the comment above intends. An ApiRequestError carries the real status
    // and a message already reduced to a displayable sentence; anything else is
    // a browser-native fetch rejection whose message is not user copy.
    const known = (e as { name?: unknown })?.name === 'ApiRequestError';
    return {
      ok: false,
      status: known ? (e as { status: number }).status : 0,
      data: null,
      error: known && (e as Error).message ? (e as Error).message : null,
      needs: known ? neededFields(e) : undefined,
    };
  }
}
function ratingTone(r: string | undefined) {
  const v = String(r ?? '').toLowerCase();
  if (v.includes('high') || v.includes('critical') || v.includes('inadequate') || v.includes('escalate')) return 'err';
  if (v.includes('marginal') || v.includes('insufficient') || v.includes('revise')) return 'warn';
  if (v.includes('moderate') || v.includes('medium') || v.includes('fair')) return 'warn';
  return 'ok';
}

/** Insert spaces before capitals so `posteriorSe` reads as `posterior Se`. */
function humanize(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}

function fmt(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const abs = Math.abs(v);
  // Very small and very large magnitudes lose all their information under fixed
  // rounding — a variance of 4.3e-4 must not render as "0".
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e7)) return v.toExponential(4);
  return String(Math.round(v * 1e6) / 1e6);
}

type Row = [string, string];

/**
 * Keys whose value EXPLAINS AN ABSENCE, and so is rendered whatever its length.
 *
 * The 120-character cap below exists to keep a long memo (external-control's
 * renderExternalControlMemo) out of the row table and in the raw view. That is
 * right for a memo and wrong for the one kind of string a reader cannot do
 * without. The interim engine reports conditional power under H1 as
 * `{drift: null, conditionalPower: null, reason: '<148 characters>'}` when no
 * design effect was supplied — deliberately, rather than defaulting a drift
 * nobody chose. The null yielded no row and the sentence was over the cap, so
 * the H1 figure vanished from the table with no explanation anywhere on
 * screen: a refusal rendered as nothing, which this product forbids.
 */
const EXPLAINS_ABSENCE = new Set(['reason', 'note', 'notAssessedReason', 'notComputedReason']);

/**
 * Flatten a result object into labeled scalar rows, descending into nested
 * objects. Arrays of numbers are joined; anything else is left to the raw view
 * so nothing is quietly dropped.
 */
function scalarRows(value: unknown, prefix = '', depth = 0, key = ''): Row[] {
  if (depth > 3 || value === null || value === undefined) return [];
  if (typeof value === 'number') return [[prefix || 'value', Number.isFinite(value) ? fmt(value) : String(value)]];
  if (typeof value === 'boolean') return [[prefix || 'value', value ? 'yes' : 'no']];
  if (typeof value === 'string') {
    return value.length <= 120 || EXPLAINS_ABSENCE.has(key) ? [[prefix || 'value', value]] : [];
  }
  if (Array.isArray(value)) {
    if (value.every(v => typeof v === 'number')) {
      return [[prefix, (value as number[]).map(fmt).join(', ')]];
    }
    return [];
  }
  if (typeof value === 'object') {
    const out: Row[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Provenance is a reproducibility record, not a result; it has its own row.
      if (k === 'provenance') continue;
      out.push(...scalarRows(v, prefix ? `${prefix} · ${humanize(k)}` : humanize(k), depth + 1, k));
    }
    return out;
  }
  return [];
}

/**
 * Tabular sub-results (OC grids, decision tables, tipping grids, survival
 * curves) worth showing as tables.
 *
 * Descends ONE level, which `scalarRows` has always done and this did not.
 * That asymmetry surfaced on 2026-10-12: `restrictedMeanSurvival` began
 * carrying the Kaplan–Meier table it had always computed and discarded, and in
 * the two-arm case `rmstDifference` embeds each arm's whole result — so the
 * curves sit at `treatment.survivalCurve` and `control.survivalCurve`. The
 * single-arm call rendered its table and the two-arm call, which is the common
 * case, rendered nothing while showing "Treatment · Rmst" and the rest of that
 * arm's scalars beside it. Data on the wire and not on the screen reads as
 * "this engine has no curve" rather than "this renderer did not look".
 *
 * Copying the curves up to the top level of the difference result would have
 * fixed the one case and left two places holding one table. One level of
 * descent fixes it for every engine that nests a table. Nested labels carry
 * the parent key, as the scalar rows do, so a reader can tell the arms apart.
 */
function objectTables(value: unknown, prefix = '', depth = 0): EngineResultTable[] {
  if (!isPlainObject(value)) return [];
  const out: EngineResultTable[] = [];
  for (const [k, v] of Object.entries(value)) {
    // Provenance is a reproducibility record, not a result; it has its own row.
    if (k === 'provenance') continue;
    const label = prefix ? `${prefix} · ${humanize(k)}` : humanize(k);
    if (isRowArray(v)) {
      const table: EngineResultTable = { label, rows: v };
      table.columns = engineResultTableColumns(table).map(({ key }) => ({ key, label: humanize(key) }));
      out.push(table);
    } else if (depth === 0 && isPlainObject(v)) {
      out.push(...objectTables(v, label, depth + 1));
    }
  }
  return out;
}

/** An object worth descending into: not null, not an array. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** An array of records, which is what a table is made of. */
function isRowArray(v: unknown): v is Array<Record<string, unknown> | null> {
  return Array.isArray(v) && v.length > 0 && v.every((r) => r === null || isPlainObject(r));
}

function Field({ field, value, error, onChange }: {
  field: CalculatorField;
  value: string;
  /** This field's own validation message, if it has one. */
  error?: string;
  onChange: (v: string) => void;
}) {
  /* The hint and the error are referenced rather than nested, for two reasons:
     nesting them in the <label> folds them into the field's accessible NAME, so
     the control announces its whole help text on every focus; and a description
     is what `aria-describedby` is for. `aria-invalid` is what identifies WHICH
     input is wrong — a single summary string says something is wrong without
     saying where, which for a fifteen-field form is not identification.
     WCAG 2.2 SC 3.3.1. */
  const describedBy = [error ? `${field.key}-err` : null, field.hint ? `${field.key}-hint` : null]
    .filter(Boolean).join(' ') || undefined;
  const common = {
    className: 'c2c-input',
    value,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    onChange: (e: any) => onChange(e.target.value),
  };
  return (
    <label className="wb-f">
      <span>{field.label}{field.optional ? <span style={{ color: 'var(--text-300,#6b6963)' }}> (optional)</span> : null}</span>
      {field.kind === 'select' ? (
        <select {...common}>
          {(field.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : field.kind === 'rows' ? (
        <textarea {...common} rows={Math.max(3, (value.match(/\n/g)?.length ?? 0) + 2)} className="wb-f-rows" placeholder={field.placeholder} />
      ) : (
        <input {...common} placeholder={field.placeholder} />
      )}
      {error && (
        <span id={`${field.key}-err`} style={{ display: 'block', fontSize: 11, color: 'var(--error,#b63939)', marginTop: 2 }}>{error}</span>
      )}
      {field.hint && <span id={`${field.key}-hint`} style={{ display: 'block', fontSize: 11, color: 'var(--text-300,#6b6963)', marginTop: 2 }}>{field.hint}</span>}
    </label>
  );
}

function CalculatorPanel({ calc, fireToast, onNav, deviceProject }: { calc: Calculator; fireToast: FireToast; onNav?: (id: string) => void; deviceProject?: boolean }) {
  const handoff = useAuthoringHandoff();
  const saveToAuthoring = handoff.save;
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(calc));
  const [acceptedResult, setAcceptedResult] = useState<{ generation: number; data: any } | null>(null);
  const calculationGeneration = useRef(0);
  const result = acceptedResult?.data ?? null;
  const [resultNotice, setResultNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const inserting = handoff.state?.phase === 'pending';
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const visible = useMemo(() => calc.fields.filter(f => isFieldVisible(f, values)), [calc, values]);
  const rows = useMemo(() => scalarRows(result), [result]);
  const tables = useMemo(() => objectTables(result), [result]);
  const provenance = result?.provenance ?? null;

  // An edit-back is still a new input revision. Invalidate synchronously so
  // even a response or filing callback queued before the next render is stale.
  const discardResult = useCallback(() => {
    const generation = ++calculationGeneration.current;
    setAcceptedResult(null);
    setShowRaw(false);
    setBusy(false);
    return generation;
  }, []);

  useEffect(() => () => { calculationGeneration.current += 1; }, []);

  /* BP-W2-4: file the tabulated result + full-hash provenance stamp as a
     governed authoring section. Never throws; on failure nothing navigates
     and the result stays on screen. The outcome is announced once, by the
     AuthoringHandoffNotice below the result (role=status on success,
     role=alert otherwise). Repeating it as a toast made a screen reader
     announce the same outcome twice (WCAG 4.1.3), so only a refusal the
     notice does not show — a save already held by another — is toasted. */
  const insertIntoDocument = useCallback(async () => {
    if (handoff.blocked) return;
    if (!acceptedResult || acceptedResult.generation !== calculationGeneration.current) {
      fireToast('Compute again before inserting a result into a document.', 'error');
      return;
    }
    // This explicit click authorizes this accepted snapshot. Later input edits
    // do not cancel an Authoring write that has already started.
    const html = engineResultToHtml({
      title: `${calc.title} — engine result`,
      rows: rows.map(([k, v]) => [k, v] as [string, unknown]),
      tables,
      provenance,
    });
    const outcome = await saveToAuthoring({
      title: `${calc.title} — engine result`,
      module: filingModuleForCalculator(calc, deviceProject),
      code: `biostat.${calc.id}`,
      content: html,
      subject: 'the computed result',
    });
    if (outcome.isCurrent() && !outcome.ok && outcome.phase === 'blocked') fireToast(outcome.message, 'error');
  }, [acceptedResult, calc, rows, tables, provenance, fireToast, saveToAuthoring, handoff.blocked, deviceProject]);

  const run = useCallback(async () => {
    const generation = discardResult();
    setResultNotice(null);
    const { body, errors, fieldErrors: errs } = buildRequestBody(calc, values);
    setFieldErrors(errs);
    if (errors.length > 0) {
      setResultNotice('Calculation not run. Correct the marked inputs and compute again.');
      // The toast announces (via its live region) that submission was refused
      // and names the first problem; the per-field messages say which controls.
      fireToast(errors.length === 1 ? errors[0] : `${errors[0]} (${errors.length} fields need attention.)`, 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await readData(calculatorEndpoint(calc), body, calculatorResultKey(calc));
      if (generation !== calculationGeneration.current) return;
      if (!res.ok || res.data === null) {
        setResultNotice('Calculation failed. Compute again before inserting a result into a document.');
        fireToast(
          res.status === 401
            ? 'Sign in to your tenant to run the design calculators.'
            : res.error ?? `Calculation failed (HTTP ${res.status}).`,
          'error',
        );
        return;
      }
      setAcceptedResult({ generation, data: res.data });
    } finally {
      if (generation === calculationGeneration.current) setBusy(false);
    }
  }, [calc, values, fireToast, discardResult]);

  const reset = useCallback(() => {
    discardResult();
    setValues(initialValues(calc));
    setFieldErrors({});
    setResultNotice(null);
  }, [calc, discardResult]);

  return (
    <div className="wb-calc">
      <h3 className="wb-calc-t">{calc.title}<span className="sec-sub"> {calc.subtitle}</span></h3>
      <p className="wb-calc-about">{calc.about}</p>

      <div className="wb-calc-fields">
          {visible.map(f => (
            <Field
              key={f.key}
              field={f}
              value={values[f.key] ?? ''}
              error={fieldErrors[f.key]}
              onChange={v => {
                if (result !== null || busy) {
                  setResultNotice('Inputs changed. Compute again before inserting a result into a document.');
                }
                discardResult();
                setValues(s => ({ ...s, [f.key]: v }));
                // Clear this field's error as soon as the user acts on it —
                // leaving it up while they type says the new value is wrong too.
                setFieldErrors(e => (e[f.key] ? { ...e, [f.key]: '' } : e));
              }}
            />
          ))}
        </div>

        <div className="wb-calc-acts">
          {/* Ghost, not primary: the page's one primary is "Assess
              defensibility" above. Compute is this section's action, and the
              engine list beside it carries no fill either. */}
          <button type="button" className="btn ghost" onClick={run} disabled={busy}>
            {I.zap} {busy ? 'Computing…' : 'Compute'}
          </button>
          <button type="button" className="btn" onClick={reset}>Reset</button>
          {result && <button type="button" className="btn" aria-expanded={showRaw} aria-controls={`raw-${calc.id}`} onClick={() => setShowRaw(r => !r)}>{showRaw ? 'Hide' : 'Show'} raw response</button>}
          {result !== null && (rows.length > 0 || tables.length > 0) && (
            /* BP-W2-4: these numbers are SAP content, and until this button the
               only way off this screen was retyping them — which severs the
               provenance stamp from the result. The section is filed as the
               tabulated result plus the stamp with the FULL inputs hash. */
            <button
              type="button"
              className="btn"
              disabled={handoff.blocked}
              onClick={() => void insertIntoDocument()}
            >
              {inserting ? 'Filing…' : 'Insert into document'}
            </button>
          )}
        </div>

        <AuthoringHandoffNotice handoff={handoff} onNav={onNav} />
        {resultNotice && (
          <div role="status" style={{ marginTop: 12, fontSize: 12, color: 'var(--text-300,#6b6963)' }}>{resultNotice}</div>
        )}

        {result !== null && (
          <div style={{ marginTop: 12 }}>
            {rows.length === 0 && tables.length === 0 ? (
              <EmptyState icon={I.beaker} title="Computed" hint="The engine returned a result with no scalar fields to tabulate — open the raw response to see it." />
            ) : (
              <>
                {rows.length > 0 && (
                  <table className="reg-tbl"><tbody>
                    {rows.map(([k, v]) => (
                      <tr key={k}><td>{k}</td><td style={{ textAlign: 'right' }} className="mono">{v}</td></tr>
                    ))}
                  </tbody></table>
                )}
                {tables.map(t => (
                  <div key={t.label} style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{t.label}</div>
                    <div style={{ overflowX: 'auto' }}>
                      <table className="reg-tbl">
                        <thead><tr>{t.columns?.length
                          ? t.columns.map(({ key, label }) => <th key={key}>{label}</th>)
                          : <th>Record</th>}</tr></thead>
                        <tbody>
                          {t.rows.slice(0, 60).map((r, i) => (
                            <tr key={i}>{t.columns?.length
                              ? t.columns.map(({ key }) => <td key={key} className="mono">{engineResultCellText(
                                r !== null && Object.prototype.hasOwnProperty.call(r, key) ? r[key] : null,
                              )}</td>)
                              : <td className="mono">{engineResultCellText(r)}</td>}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {t.rows.length > 60 && (
                      <div style={{ fontSize: 11, color: 'var(--text-300,#6b6963)', marginTop: 4 }}>
                        Showing 60 of {t.rows.length} rows — the full table is in the raw response.
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {provenance && (
              // Shown because these numbers go into an SAP or a submission and a
              // reviewer will ask how they were produced. The hash is over the
              // inputs, so the same hash means the same computation.
              <div
                className="wb-prov"
                title={provenance.inputsSha256
                  ? `Engine ${provenance.engine} ${provenance.engineVersion} · input record ${String(provenance.inputsSha256)}`
                  : undefined}
              >
                {provenance.method} · {provenance.engine} {provenance.engineVersion}
                {provenance.reproducible ? ' · reproducible' : null}
              </div>
            )}

            {showRaw && (
              <pre id={`raw-${calc.id}`} style={{ marginTop: 10, maxHeight: 320, overflow: 'auto', background: 'var(--canvas-elevated,#ffffff)', color: 'var(--text-100,#3d3d3a)', padding: 10, borderRadius: 6, fontSize: 11 }}>
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        )}
    </div>
  );
}

const PHASES = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];
const DESIGN_TYPES = ['superiority', 'non_inferiority', 'equivalence', 'single_arm'] as const;
const ENDPOINT_TYPES = ['continuous', 'binary', 'time_to_event'] as const;
const OBJECTIVES = ['efficacy', 'safety', 'performance', 'bioequivalence'] as const;
const label = (v: string) => v.replace(/_/g, ' ');

/**
 * What the defensibility engine computed, and its judgment OF that.
 *
 * Its own component since 2026-10-12, when it grew the engine's own statement
 * of the computation — `method`, `formula` and `assumptions`. Those three were
 * absent from the payload, so the panel showed a total and a verdict chip with
 * nothing to check them against; the workbench meanwhile labelled the engine's
 * `effectSize` "Hazard ratio" when the engine reads it as the hazard-ratio
 * REDUCTION, and an eleven-fold under-sizing had nothing on screen to
 * contradict it. `formula` is where the hazard ratio actually used is printed.
 */
function DefensibilityResult({ asmtRes }: { asmtRes: Defensibility }) {
  return (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
              <div><span className={'rd-chip tone-' + ratingTone(asmtRes.judgment.overallVerdict)}>{label(asmtRes.judgment.overallVerdict)}</span><div style={{ fontSize: 12, color: 'var(--text-300)', marginTop: 4 }}>Verdict</div></div>
              <div><span className={'rd-chip tone-' + ratingTone(asmtRes.judgment.overallRisk)}>{asmtRes.judgment.overallRisk}</span><div style={{ fontSize: 12, color: 'var(--text-300)', marginTop: 4 }}>Reviewer risk</div></div>
              <div><span className={'rd-chip tone-' + ratingTone(asmtRes.judgment.actionRecommendation)}>{label(asmtRes.judgment.actionRecommendation)}</span><div style={{ fontSize: 12, color: 'var(--text-300)', marginTop: 4 }}>Recommended action</div></div>
              {asmtRes.sampleSize != null && <div><div style={{ fontSize: 22, fontWeight: 700 }}>{asmtRes.sampleSize}</div><div style={{ fontSize: 12, color: 'var(--text-300)' }}>Total N computed</div></div>}
            </div>
            <table className="ctable" style={{ width: '100%', fontSize: 13 }}>
              <caption style={{ textAlign: 'left', fontSize: 12, color: 'var(--text-300)', paddingBottom: 4 }}>Judged by dimension</caption>
              <thead><tr><th scope="col">Dimension</th><th scope="col">Verdict</th><th scope="col">Why</th></tr></thead>
              <tbody>
                {asmtRes.judgment.dimensions.map((d) => (
                  <tr key={d.name}>
                    <td>{d.name}</td>
                    <td><span className={'rd-chip tone-' + ratingTone(d.verdict)}>{label(d.verdict)}</span></td>
                    <td>{d.rationale}{d.flags.length > 0 ? ` — ${d.flags.join('; ')}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {asmtRes.judgment.escalationReasons.length > 0 && (
              <div style={{ marginTop: 8 }}><div style={{ fontSize: 12, fontWeight: 600 }}>Escalation reasons</div>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>{asmtRes.judgment.escalationReasons.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            )}
            {/* What the engine computed, in its own words. The verdict above
                is a judgment OF this; without it a reader cannot check the
                number against the design in front of them — and the formula
                is where the hazard ratio actually used is printed. */}
            {(asmtRes.method || asmtRes.formula) && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-300,#6b6963)' }}>
                {asmtRes.method && <div><b style={{ color: 'var(--text-200,#44423d)' }}>Method:</b> {asmtRes.method}</div>}
                {asmtRes.formula && <div style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', marginTop: 2 }}>{asmtRes.formula}</div>}
              </div>
            )}
            {Array.isArray(asmtRes.assumptions) && asmtRes.assumptions.length > 0 && (
              <table className="ctable" style={{ width: '100%', fontSize: 13, marginTop: 8 }}>
                <caption style={{ textAlign: 'left', fontSize: 12, color: 'var(--text-300)', paddingBottom: 4 }}>Assumptions the engine used</caption>
                <thead><tr><th scope="col">Assumption</th><th scope="col">Value</th><th scope="col">Source</th><th scope="col">Answer turns on it</th></tr></thead>
                <tbody>
                  {asmtRes.assumptions.map((a) => (
                    <tr key={a.parameter}>
                      <td style={{ whiteSpace: 'nowrap' }}>{a.parameter}</td>
                      <td style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>{String(a.value)}</td>
                      <td>{a.source === 'user_provided' ? 'from the design' : a.source}</td>
                      <td><span className={'rd-chip tone-' + (a.sensitivity === 'high' ? 'warn' : 'idle')}>{a.sensitivity}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
  );
}

/**
 * Reviewer-risk defensibility — a section of the Biostatistics surface.
 *
 * It was the top half of a second surface, `biostat-workbench`, until
 * 2026-11-09. See this module's header for why that surface existed and why it
 * no longer does.
 */
export function DefensibilitySection({ fireToast }: { fireToast: FireToast }) {
  // The engine's own inputs (ana-biostats StatisticalInput). It judges the
  // design it computes from these, so what it needs is what the form asks for.
  const [asmt, setAsmt] = useState({
    studyPhase: 'Phase 3', indication: '', studyType: 'superiority', objectiveType: 'efficacy',
    endpointType: 'continuous', effectSize: '', controlRate: '', treatmentRate: '', margin: '',
    alpha: '0.05', powerTarget: '0.8', attritionRate: '0.1', allocationRatio: '1',
  });
  const [asmtRes, setAsmtRes] = useState<Defensibility | null>(null);
  const [asmtBusy, setAsmtBusy] = useState(false);
  // The fields the engine still needs, by the labels on this form (2026-11-10: they were a red error toast in
  // developer words, "Missing or invalid: effectSize", for a form nobody had filled yet).
  const [asmtNeeds, setAsmtNeeds] = useState<string[]>([]);
  const fieldLabel = (field: string): string => ({
    effectSize: asmt.endpointType === 'time_to_event' ? 'Hazard-ratio reduction (1 − HR)' : 'Effect size (standardized)',
    controlRate: 'Control rate', treatmentRate: 'Treatment rate',
    nonInferiorityMargin: 'Non-inferiority margin', equivalenceMargin: 'Equivalence margin',
    alpha: 'Alpha (two-sided)', powerTarget: 'Power', attritionRate: 'Dropout rate', allocationRatio: 'Allocation ratio',
  } as Record<string, string>)[field] ?? field;

  const runAssess = useCallback(async () => {
    setAsmtBusy(true); setAsmtNeeds([]);
    try {
      const n = (v: string) => (v.trim() === '' ? undefined : Number(v));
      const { ok, status, data, error, needs } = await readData<Defensibility>('/api/statistical-defensibility/assess', {
        clientTrack: 'biotech_pharma',
        phase: asmt.studyPhase, indication: asmt.indication || undefined,
        studyType: asmt.studyType, objectiveType: asmt.objectiveType, endpointType: asmt.endpointType,
        effectSize: n(asmt.effectSize), controlRate: n(asmt.controlRate), treatmentRate: n(asmt.treatmentRate),
        nonInferiorityMargin: asmt.studyType === 'non_inferiority' ? n(asmt.margin) : undefined,
        equivalenceMargin: asmt.studyType === 'equivalence' ? n(asmt.margin) : undefined,
        alpha: n(asmt.alpha), powerTarget: n(asmt.powerTarget), attritionRate: n(asmt.attritionRate),
        allocationRatio: n(asmt.allocationRatio),
      });
      if (needs) { setAsmtRes(null); setAsmtNeeds(needs); return; }
      if (!ok || !data) {
        setAsmtRes(null);
        fireToast(error ?? `Assessment failed (HTTP ${status}).`, 'error');
        return;
      }
      setAsmtRes(data);
      fireToast('Defensibility assessed.');
    } finally { setAsmtBusy(false); }
  }, [asmt, fireToast]);

  return (
    <section className="pj-sec" aria-label="Statistical defensibility">
      <div className="pj-sec-h"><h2>Statistical defensibility</h2><span className="sec-sub">Reviewer-risk assessment</span></div>
      <div className="wb-fields">
        <label className="wb-f">Phase<select className="c2c-input" value={asmt.studyPhase} onChange={(e) => setAsmt({ ...asmt, studyPhase: e.target.value })}>{PHASES.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="wb-f">Indication<input className="c2c-input" value={asmt.indication} onChange={(e) => setAsmt({ ...asmt, indication: e.target.value })} placeholder="e.g. NSCLC" /></label>
        <label className="wb-f">Design<select className="c2c-input" value={asmt.studyType} onChange={(e) => setAsmt({ ...asmt, studyType: e.target.value })}>{DESIGN_TYPES.map((v) => <option key={v} value={v}>{label(v)}</option>)}</select></label>
        <label className="wb-f">Objective<select className="c2c-input" value={asmt.objectiveType} onChange={(e) => setAsmt({ ...asmt, objectiveType: e.target.value })}>{OBJECTIVES.map((v) => <option key={v} value={v}>{label(v)}</option>)}</select></label>
        <label className="wb-f">Primary endpoint type<select className="c2c-input" value={asmt.endpointType} onChange={(e) => setAsmt({ ...asmt, endpointType: e.target.value })}>{ENDPOINT_TYPES.map((v) => <option key={v} value={v}>{label(v)}</option>)}</select></label>
        {asmt.endpointType === 'binary' ? (
          <>
            <label className="wb-f">Control rate<input className="c2c-input" inputMode="decimal" value={asmt.controlRate} onChange={(e) => setAsmt({ ...asmt, controlRate: e.target.value })} placeholder="e.g. 0.5" /></label>
            <label className="wb-f">Treatment rate<input className="c2c-input" inputMode="decimal" value={asmt.treatmentRate} onChange={(e) => setAsmt({ ...asmt, treatmentRate: e.target.value })} placeholder="e.g. 0.7" /></label>
          </>
        ) : (
          <label className="wb-f">
            {/* The engine reads this field for a time-to-event design as the
                hazard-ratio REDUCTION (computation-engine.ts hazardRatio,
                HR = 1 - effectSize). It was labelled "Hazard ratio" with the
                placeholder 0.7, so an oncologist typing their protocol's HR
                sized for HR 0.300: 50 subjects where 550 is right. */}
            {asmt.endpointType === 'time_to_event' ? 'Hazard-ratio reduction (1 − HR)' : 'Effect size (standardized)'}
            <input className="c2c-input" inputMode="decimal" value={asmt.effectSize} onChange={(e) => setAsmt({ ...asmt, effectSize: e.target.value })} placeholder={asmt.endpointType === 'time_to_event' ? 'e.g. 0.3' : 'e.g. 0.5'} />
            {asmt.endpointType === 'time_to_event' && (
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-300,#6b6963)', marginTop: 2 }}>
                Not the hazard ratio itself. For a protocol stating HR 0.7, enter 0.3.
              </span>
            )}
          </label>
        )}
        {(asmt.studyType === 'non_inferiority' || asmt.studyType === 'equivalence') && (
          <label className="wb-f">{asmt.studyType === 'equivalence' ? 'Equivalence margin' : 'Non-inferiority margin'}<input className="c2c-input" inputMode="decimal" value={asmt.margin} onChange={(e) => setAsmt({ ...asmt, margin: e.target.value })} /></label>
        )}
        <label className="wb-f">Alpha (two-sided)<input className="c2c-input" inputMode="decimal" value={asmt.alpha} onChange={(e) => setAsmt({ ...asmt, alpha: e.target.value })} /></label>
        <label className="wb-f">Power<input className="c2c-input" inputMode="decimal" value={asmt.powerTarget} onChange={(e) => setAsmt({ ...asmt, powerTarget: e.target.value })} /></label>
        <label className="wb-f">Dropout rate<input className="c2c-input" inputMode="decimal" value={asmt.attritionRate} onChange={(e) => setAsmt({ ...asmt, attritionRate: e.target.value })} /></label>
        <label className="wb-f">Allocation ratio<input className="c2c-input" inputMode="decimal" value={asmt.allocationRatio} onChange={(e) => setAsmt({ ...asmt, allocationRatio: e.target.value })} /></label>
      </div>
      <button type="button" className="btn" onClick={runAssess} disabled={asmtBusy}>{I.zap} {asmtBusy ? 'Assessing…' : 'Assess defensibility'}</button>
      {asmtNeeds.length > 0 && (
        <p role="status" style={{ marginTop: 8, fontSize: 12, color: 'var(--text-300,#6b6963)' }}>
          {`To assess this design, enter: ${[...new Set(asmtNeeds.map(fieldLabel))].join(', ')}.`}
        </p>
      )}

      {asmtRes && <DefensibilityResult asmtRes={asmtRes} />}
    </section>
  );
}

/**
 * Resolve the design engine AnA named: an exact id, then an exact title, then
 * one title containing the phrase. Honest misses and ambiguity refusals.
 */
export function resolveCalculatorByName(name: string): { ok: true; calc: Calculator } | { ok: false; reason: string } {
  const raw = name.trim();
  if (!raw) return { ok: false, reason: 'Name a design engine to open.' };
  const needle = raw.toLowerCase();
  const byId = CALCULATORS.filter((c) => c.id.toLowerCase() === needle);
  const byTitle = CALCULATORS.filter((c) => c.title.toLowerCase() === needle);
  const hits = byId.length ? byId
    : byTitle.length ? byTitle
    : CALCULATORS.filter((c) => c.title.toLowerCase().includes(needle));
  if (hits.length === 0) return { ok: false, reason: `No design engine matching "${raw}".` };
  if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} engines — name one exactly.` };
  return { ok: true, calc: hits[0] };
}

/**
 * The design calculators — a section of the Biostatistics surface.
 *
 * It was the bottom half of `biostat-workbench`. The surface action AnA uses to
 * open an engine by name moved with it to `biostatistics`, whose ONE handler
 * set registers it (`Biostatistics.tsx`): the surface owns the open engine and
 * passes it here as `activeId` / `onSelect`. Rendered without them (a test
 * mounting the section alone), the section keeps its own choice.
 */
export function DesignCalculatorsSection({ fireToast, onNav, deviceProject, activeId: chosenId, onSelect }: {
  fireToast: FireToast;
  onNav?: (id: string) => void;
  deviceProject?: boolean;
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  const [ownId, setOwnId] = useState<string>(CALCULATORS[0].id);
  const activeId = onSelect ? (chosenId ?? CALCULATORS[0].id) : ownId;
  const setActiveId = onSelect ?? setOwnId;
  const active = useMemo(() => CALCULATORS.find(c => c.id === activeId) ?? CALCULATORS[0], [activeId]);

  /* No action registration here. The bus holds ONE registration, and this
     section's (made under `biostatistics` on 2026-11-09) ran its effect before
     the surface's (React runs a child's effects first): it answered a design
     held while the list loaded with "This screen does not support", and the
     surface's registration then replaced it, so `select-calculator` was never
     reachable on the mounted screen. The surface registers it now. */

  return (
    <section className="pj-sec" aria-label="Design calculators">
      <div className="pj-sec-h"><h2>Design calculators</h2><span className="sec-sub">{CALCULATORS.length} deterministic engines, one chosen</span></div>
      <div className="wb-engines">
        {CALCULATORS.map(c => (
          <button
            key={c.id}
            type="button"
            className="btn small"
            aria-pressed={c.id === activeId}
            onClick={() => setActiveId(c.id)}
          >
            {c.title}
          </button>
        ))}
      </div>

      {/* Remounted per calculator so form state never leaks between engines —
          a leftover value under a key the next engine also uses would be sent
          silently. */}
      <CalculatorPanel key={active.id} calc={active} fireToast={fireToast} onNav={onNav} deviceProject={deviceProject} />
    </section>
  );
}

/** The titles AnA may name to open an engine, for the surface's context block. */
export const CALCULATOR_TITLES: readonly string[] = CALCULATORS.map((c) => c.title);
