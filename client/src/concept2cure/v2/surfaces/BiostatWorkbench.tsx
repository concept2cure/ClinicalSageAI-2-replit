/**
 * Biostatistics Workbench — drives the REAL statistical engine instead of a
 * client-side normal approximation.
 *
 * Registry id: `biostat-workbench`.
 *
 * Wired to two real backends:
 *   • Statistical defensibility (server/routes/statistical-defensibility.ts,
 *     mounted /api/statistical-defensibility — deterministic, no DB):
 *       POST /assess          — reviewer-risk assessment of a study's statistics
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
import React, { useCallback, useMemo, useState } from 'react';
import { I } from '../icons';
import type { SurfaceViewProps } from '../surfaceViews';
import { EmptyState } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { usePublishSurfaceContext } from '../surfaceContext';
import { useSurfaceActionHandlers } from '../surfaceActions';
import {
  CALCULATORS,
  buildRequestBody,
  initialValues,
  isFieldVisible,
  type Calculator,
  type CalculatorField,
} from './biostatCalculators';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';
import type { FireToast } from '../toast';
import { saveToAuthoring } from '../authoringHandoff';
import { engineResultToHtml } from '../engineResultHtml';

interface Defensibility {
  overallScore?: number;
  overallRating?: string;
  reviewerRiskLevel?: string;
  criticalIssues?: any[];
  majorIssues?: any[];
  recommendations?: any;
}

async function readData<T = any>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  try {
    const res = await apiRequest('POST', path, body);
    const parsed = (await res.json().catch(() => null)) as any;
    return {
      ok: res.ok,
      status: res.status,
      data: (parsed?.data ?? null) as T | null,
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
    };
  }
}
function issueText(x: any): string {
  if (typeof x === 'string') return x;
  return String(x?.message ?? x?.issue ?? x?.description ?? JSON.stringify(x));
}
function ratingTone(r: string | undefined) {
  const v = String(r ?? '').toLowerCase();
  if (v.includes('high') || v.includes('poor') || v.includes('weak')) return 'err';
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
 * Flatten a result object into labeled scalar rows, descending into nested
 * objects. Arrays of numbers are joined; anything else is left to the raw view
 * so nothing is quietly dropped.
 */
function scalarRows(value: unknown, prefix = '', depth = 0): Row[] {
  if (depth > 3 || value === null || value === undefined) return [];
  if (typeof value === 'number') return [[prefix || 'value', Number.isFinite(value) ? fmt(value) : String(value)]];
  if (typeof value === 'boolean') return [[prefix || 'value', value ? 'yes' : 'no']];
  if (typeof value === 'string') return value.length <= 120 ? [[prefix || 'value', value]] : [];
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
      out.push(...scalarRows(v, prefix ? `${prefix} · ${humanize(k)}` : humanize(k), depth + 1));
    }
    return out;
  }
  return [];
}

/** Tabular sub-results (OC grids, decision tables, tipping grids) worth showing as tables. */
function objectTables(value: unknown): Array<{ label: string; rows: Record<string, unknown>[] }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const out: Array<{ label: string; rows: Record<string, unknown>[] }> = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === 'provenance') continue;
    if (Array.isArray(v) && v.length > 0 && v.every(r => r && typeof r === 'object' && !Array.isArray(r))) {
      out.push({ label: humanize(k), rows: v as Record<string, unknown>[] });
    }
  }
  return out;
}

function cell(v: unknown): string {
  if (typeof v === 'number') return Number.isFinite(v) ? fmt(v) : String(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
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
    <label style={{ fontSize: 12, display: 'block' }}>
      <span>{field.label}{field.optional ? <span style={{ color: 'var(--text-300,#6b6963)' }}> (optional)</span> : null}</span>
      {field.kind === 'select' ? (
        <select {...common} style={{ height: 30 }}>
          {(field.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : field.kind === 'rows' ? (
        <textarea {...common} rows={Math.max(3, (value.match(/\n/g)?.length ?? 0) + 2)} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, resize: 'vertical' }} placeholder={field.placeholder} />
      ) : (
        <input {...common} style={{ height: 30 }} placeholder={field.placeholder} />
      )}
      {error && (
        <span id={`${field.key}-err`} style={{ display: 'block', fontSize: 11, color: 'var(--error,#b63939)', marginTop: 2 }}>{error}</span>
      )}
      {field.hint && <span id={`${field.key}-hint`} style={{ display: 'block', fontSize: 11, color: 'var(--text-300,#6b6963)', marginTop: 2 }}>{field.hint}</span>}
    </label>
  );
}

function CalculatorPanel({ calc, fireToast }: { calc: Calculator; fireToast: FireToast }) {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(calc));
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const visible = useMemo(() => calc.fields.filter(f => isFieldVisible(f, values)), [calc, values]);
  const rows = useMemo(() => scalarRows(result), [result]);
  const tables = useMemo(() => objectTables(result), [result]);
  const provenance = result?.provenance ?? null;

  /* BP-W2-4: file the tabulated result + full-hash provenance stamp as a
     governed authoring section. Never throws; the outcome is toasted either
     way, and on failure nothing navigates and the result stays on screen. */
  const insertIntoDocument = useCallback(async () => {
    setInserting(true);
    try {
      const html = engineResultToHtml({
        title: `${calc.title} — engine result`,
        rows: rows.map(([k, v]) => [k, v] as [string, unknown]),
        provenance,
      });
      const outcome = await saveToAuthoring({
        title: `${calc.title} — engine result`,
        module: 'M5',
        code: `biostat.${calc.id}`,
        content: html,
        subject: 'the computed result',
      });
      fireToast(outcome.message, outcome.ok ? 'ok' : 'error');
    } finally {
      setInserting(false);
    }
  }, [calc, rows, provenance, fireToast]);

  const run = useCallback(async () => {
    const { body, errors, fieldErrors: errs } = buildRequestBody(calc, values);
    setFieldErrors(errs);
    if (errors.length > 0) {
      // The toast announces (via its live region) that submission was refused
      // and names the first problem; the per-field messages say which controls.
      fireToast(errors.length === 1 ? errors[0] : `${errors[0]} (${errors.length} fields need attention.)`, 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await readData(`/api/biostat${calc.path}`, body);
      if (!res.ok || res.data === null) {
        fireToast(
          res.status === 401
            ? 'Sign in to your tenant to run the design calculators.'
            : res.error ?? `Calculation failed (HTTP ${res.status}).`,
          'error',
        );
        return;
      }
      setResult(res.data);
    } finally { setBusy(false); }
  }, [calc, values, fireToast]);

  const reset = useCallback(() => { setValues(initialValues(calc)); setResult(null); setFieldErrors({}); }, [calc]);

  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">{calc.title}</span>
        <span className="s">{calc.subtitle}</span>
      </div>
      <div className="pj-card-b">
        <div style={{ fontSize: 12, color: 'var(--text-300,#6b6963)', marginBottom: 12, lineHeight: 1.5 }}>{calc.about}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10, marginBottom: 12 }}>
          {visible.map(f => (
            <Field
              key={f.key}
              field={f}
              value={values[f.key] ?? ''}
              error={fieldErrors[f.key]}
              onChange={v => {
                setValues(s => ({ ...s, [f.key]: v }));
                // Clear this field's error as soon as the user acts on it —
                // leaving it up while they type says the new value is wrong too.
                setFieldErrors(e => (e[f.key] ? { ...e, [f.key]: '' } : e));
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn primary" style={{ height: 32 }} onClick={run} disabled={busy}>
            {I.zap} {busy ? 'Computing…' : 'Compute'}
          </button>
          <button className="btn" style={{ height: 32 }} onClick={reset} disabled={busy}>Reset</button>
          {result && <button className="btn" style={{ height: 32 }} aria-expanded={showRaw} aria-controls={`raw-${calc.id}`} onClick={() => setShowRaw(r => !r)}>{showRaw ? 'Hide' : 'Show'} raw response</button>}
          {result !== null && rows.length > 0 && (
            /* BP-W2-4: these numbers are SAP content, and until this button the
               only way off this screen was retyping them — which severs the
               provenance stamp from the result. The section is filed as the
               tabulated result plus the stamp with the FULL inputs hash. */
            <button
              className="btn"
              style={{ height: 32 }}
              disabled={inserting}
              onClick={() => void insertIntoDocument()}
            >
              {inserting ? 'Filing…' : 'Insert into document'}
            </button>
          )}
        </div>

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
                        <thead><tr>{Object.keys(t.rows[0]).map(h => <th key={h}>{humanize(h)}</th>)}</tr></thead>
                        <tbody>
                          {t.rows.slice(0, 60).map((r, i) => (
                            <tr key={i}>{Object.keys(t.rows[0]).map(h => <td key={h} className="mono">{cell(r[h])}</td>)}</tr>
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
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-300,#6b6963)' }}>
                {provenance.method} · {provenance.engine} {provenance.engineVersion}
                {provenance.inputsSha256 ? <> · inputs <span className="mono">{String(provenance.inputsSha256).slice(0, 12)}</span></> : null}
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
    </div>
  );
}

const PHASES = ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4'];

export function BiostatWorkbench(_props: SurfaceViewProps) {
  const [toast, fireToast] = useToast();

  const [asmt, setAsmt] = useState({ studyPhase: 'Phase 3', indication: '', studyDesign: '', primaryEndpoint: '', sampleSize: '' });
  const [asmtRes, setAsmtRes] = useState<Defensibility | null>(null);
  const [asmtBusy, setAsmtBusy] = useState(false);

  const [activeId, setActiveId] = useState<string>(CALCULATORS[0].id);
  const active = useMemo(() => CALCULATORS.find(c => c.id === activeId) ?? CALCULATORS[0], [activeId]);

  /* AnA can open any design engine by its name — the same tile click a person
     makes — so a drive can land on the right calculator before its inputs are
     discussed. The registry (CALCULATORS) is static, so no not-ready state;
     opening an engine is view-state only — computing a result stays deliberate. */
  useSurfaceActionHandlers('biostat-workbench', {
    'biostat-workbench.select-calculator': (params) => {
      const raw = String(params.calculator ?? '').trim();
      if (!raw) return { ok: false, reason: 'Name a design engine to open.' };
      const needle = raw.toLowerCase();
      const byId = CALCULATORS.filter((c) => c.id.toLowerCase() === needle);
      const byTitle = CALCULATORS.filter((c) => c.title.toLowerCase() === needle);
      const hits = byId.length ? byId
        : byTitle.length ? byTitle
        : CALCULATORS.filter((c) => c.title.toLowerCase().includes(needle));
      if (hits.length === 0) return { ok: false, reason: `No design engine matching "${raw}".` };
      if (hits.length > 1) return { ok: false, reason: `"${raw}" matches ${hits.length} engines — name one exactly.` };
      const c = hits[0];
      if (activeId === c.id) return { ok: true, detail: `Already on ${c.title}` };
      setActiveId(c.id);
      return { ok: true, detail: `Opened ${c.title}` };
    },
  });

  /* What AnA can see of this screen: which engine is selected, what it computes
     and what it needs. Without it, "is this the right design?" on the
     group-sequential screen is answered from the message text alone, and she
     cannot know the user is looking at boundaries rather than at MMRM sizing.
     The calculator's own `about` prose is reused rather than restated, so this
     cannot drift from what the user is reading. */
  const anaContext = useMemo(
    () => ({
      summary: `Biostatistics workbench, "${active.title}" selected — ${active.subtitle}.`,
      facts: {
        calculatorId: active.id,
        endpoint: `/api/biostat${active.path}`,
        computes: active.about,
        requiredInputs: active.fields.filter(f => !f.optional).map(f => f.label),
        optionalInputs: active.fields.filter(f => f.optional).map(f => f.label),
        availableCalculators: CALCULATORS.map(c => c.title),
        defensibilityAssessed: asmtRes !== null,
      },
      availableActions: [
        'Explain what this calculator computes',
        'Suggest inputs for a design',
        'Switch to another calculator',
        'Run a reviewer-risk defensibility assessment',
      ],
    }),
    [active, asmtRes]
  );

  usePublishSurfaceContext('biostat-workbench', anaContext);

  const runAssess = useCallback(async () => {
    if (!asmt.indication || !asmt.studyDesign || !asmt.primaryEndpoint) { fireToast('Enter indication, study design, and primary endpoint.', 'error'); return; }
    setAsmtBusy(true);
    try {
      const { ok, status, data } = await readData<Defensibility>('/api/statistical-defensibility/assess', {
        studyPhase: asmt.studyPhase, indication: asmt.indication, studyDesign: asmt.studyDesign,
        primaryEndpoint: asmt.primaryEndpoint, sampleSize: asmt.sampleSize ? Number(asmt.sampleSize) : 0,
      });
      if (!ok || !data) { fireToast(`Assessment failed (HTTP ${status}).`, 'error'); return; }
      setAsmtRes(data);
      fireToast('Reviewer-risk assessment complete.');
    } finally { setAsmtBusy(false); }
  }, [asmt, fireToast]);

  return (
    <div className="cm-body">
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Biostatistics workbench</span><span className="s">Reviewer-risk assessment + {CALCULATORS.length} design engines</span></div>
        <div className="pj-card-b" style={{ fontSize: 13, color: 'var(--text-300,#6b6963)' }}>
          Every calculation below runs on the server’s statistical engine — deterministic, provenance-stamped, and reference-tested against published tables and closed forms. Nothing is computed in the browser.
        </div>
      </div>

      {/* Reviewer-risk defensibility */}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Statistical defensibility</span><span className="s">Reviewer-risk assessment</span></div>
        <div className="pj-card-b">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 8, marginBottom: 10 }}>
            <label style={{ fontSize: 12 }}>Phase<select className="c2c-input" style={{ height: 30 }} value={asmt.studyPhase} onChange={(e) => setAsmt({ ...asmt, studyPhase: e.target.value })}>{PHASES.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label style={{ fontSize: 12 }}>Indication<input className="c2c-input" style={{ height: 30 }} value={asmt.indication} onChange={(e) => setAsmt({ ...asmt, indication: e.target.value })} placeholder="e.g. NSCLC" /></label>
            <label style={{ fontSize: 12 }}>Study design<input className="c2c-input" style={{ height: 30 }} value={asmt.studyDesign} onChange={(e) => setAsmt({ ...asmt, studyDesign: e.target.value })} placeholder="e.g. randomized double-blind" /></label>
            <label style={{ fontSize: 12 }}>Primary endpoint<input className="c2c-input" style={{ height: 30 }} value={asmt.primaryEndpoint} onChange={(e) => setAsmt({ ...asmt, primaryEndpoint: e.target.value })} placeholder="e.g. PFS" /></label>
            <label style={{ fontSize: 12 }}>Sample size<input className="c2c-input" style={{ height: 30 }} inputMode="numeric" value={asmt.sampleSize} onChange={(e) => setAsmt({ ...asmt, sampleSize: e.target.value.replace(/\D/g, '') })} /></label>
          </div>
          <button className="btn primary" style={{ height: 32 }} onClick={runAssess} disabled={asmtBusy}>{I.zap} {asmtBusy ? 'Assessing…' : 'Assess defensibility'}</button>

          {asmtRes && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
                {asmtRes.overallScore != null && <div><div style={{ fontSize: 26, fontWeight: 700 }}>{asmtRes.overallScore}</div><div style={{ fontSize: 12, color: 'var(--text-300,#6b6963)' }}>Overall score</div></div>}
                {asmtRes.overallRating && <div><span className={'rd-chip tone-' + ratingTone(asmtRes.overallRating)}>{asmtRes.overallRating}</span><div style={{ fontSize: 12, color: 'var(--text-300,#6b6963)', marginTop: 4 }}>Rating</div></div>}
                {asmtRes.reviewerRiskLevel && <div><span className={'rd-chip tone-' + ratingTone(asmtRes.reviewerRiskLevel)}>{asmtRes.reviewerRiskLevel}</span><div style={{ fontSize: 12, color: 'var(--text-300,#6b6963)', marginTop: 4 }}>Reviewer risk</div></div>}
              </div>
              {Array.isArray(asmtRes.criticalIssues) && asmtRes.criticalIssues.length > 0 && (
                <div style={{ marginBottom: 8 }}><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--error,#b63939)' }}>Critical issues</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>{asmtRes.criticalIssues.map((x, i) => <li key={i}>{issueText(x)}</li>)}</ul></div>
              )}
              {Array.isArray(asmtRes.majorIssues) && asmtRes.majorIssues.length > 0 && (
                <div style={{ marginBottom: 8 }}><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--warning,#955d22)' }}>Major issues</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>{asmtRes.majorIssues.map((x, i) => <li key={i}>{issueText(x)}</li>)}</ul></div>
              )}
              {Array.isArray(asmtRes.recommendations) && asmtRes.recommendations.length > 0 && (
                <div><div style={{ fontSize: 12, fontWeight: 600 }}>Recommendations</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>{asmtRes.recommendations.map((x: any, i: number) => <li key={i}>{issueText(x)}</li>)}</ul></div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Design calculators */}
      <div className="pj-card">
        <div className="pj-card-h"><span className="t">Design calculators</span><span className="s">Choose an engine</span></div>
        <div className="pj-card-b">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CALCULATORS.map(c => (
              <button
                key={c.id}
                className={'btn' + (c.id === activeId ? ' primary' : '')}
                style={{ height: 28, fontSize: 12 }}
                aria-pressed={c.id === activeId}
                onClick={() => setActiveId(c.id)}
              >
                {c.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Remounted per calculator so form state never leaks between engines —
          a leftover value under a key the next engine also uses would be sent
          silently. */}
      <CalculatorPanel key={active.id} calc={active} fireToast={fireToast} />

      <C2CToast msg={toast} />
    </div>
  );
}
