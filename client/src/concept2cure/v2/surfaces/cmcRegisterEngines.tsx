/**
 * Two engines on their registers (P-122, 2026-11-10; inventory B3 and B4).
 *
 *   • The impurity register's "Against the guideline" column: each recorded
 *     impurity judged by `assessRecordedImpurity` — ICH Q3A/Q3B thresholds at
 *     the recorded daily dose, the Q3C class and limit for a solvent, the Q3D
 *     PDE for an element, the ICH M7 class, control and acceptable intake for a
 *     mutagenic one (GET /api/cmc/impurity-profiles/assessment). Until now the
 *     register showed only that M7 inputs were "required"; the verdict was in the
 *     composed §3.2.S.3.2 and in chat.
 *   • The dissolution register's f2 comparison of two recorded profiles
 *     (POST /api/cmc/dissolution-profiles/compare). The register's own empty
 *     state promised "an f2 comparison is computed from the recorded profiles";
 *     no control computed one.
 *
 * Every figure and refusal here is the server's; this file chooses words for
 * the verdicts and formats numbers, nothing more (RULE 2). A refusal is shown
 * as the answer it is, in the engine's words, never as a blank.
 */
import React from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useLiveData } from '../dataConnect';
import { cmcWriteError } from './cmcShared';

/* ── Impurities ─────────────────────────────────────────────────────────── */

interface Threshold { effectivePercent: number; expression: string }
type Assessment = { side: 'drug_substance' | 'drug_product' } & (
  | { ok: false; code: string; message: string; routeTo?: string }
  | { ok: true; basis: 'ICH Q3A(R2)/Q3B(R2)'; disposition: string; thresholds: { reporting: Threshold; identification: Threshold; qualification: Threshold }; outstanding: string[] }
  | { ok: true; basis: 'ICH Q3C(R8)'; solventClass: number; limitPpm: number; withinLimit: boolean; disposition: string; outstanding: string[] }
  | { ok: true; basis: 'ICH Q3D(R2)'; elementClass: string; pdeMicrogramsPerDay: number; observedMicrogramsPerDay: number; withinLimit: boolean; route: string; outstanding: string[] }
  | { ok: true; basis: 'ICH M7(R2)'; impurityClass: number; className: string; controlApproach: string; acceptableIntakeUgPerDay: number | null; concentrationLimitPpm: number | null; withinLimit: boolean | null; disposition: string; outstanding: string[] }
);
export interface ImpurityAssessmentRow { id: number; impurityName: string; assessments: Assessment[] }

const num = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 3 });
const Q3_DISPOSITION: Record<string, string> = {
  'above-qualification': 'at or above qualification — a qualification basis is required',
  'above-identification': 'at or above identification — the structure must be known',
  reportable: 'reportable',
  'below-reporting': 'below the reporting threshold',
};

type Verdict = { tone: 'ok' | 'warn' | 'err' | 'dim'; text: string };
type Of<B extends string> = Extract<Assessment, { basis: B }>;

function q3ab(a: Of<'ICH Q3A(R2)/Q3B(R2)'>): Verdict {
  return {
    tone: a.disposition === 'above-qualification' ? 'err' : a.disposition === 'above-identification' ? 'warn' : 'ok',
    text: `${a.side === 'drug_product' ? 'Q3B' : 'Q3A'}: ${Q3_DISPOSITION[a.disposition] ?? a.disposition} · ` +
      `reporting ${num(a.thresholds.reporting.effectivePercent)} %, identification ${num(a.thresholds.identification.effectivePercent)} %, ` +
      `qualification ${num(a.thresholds.qualification.effectivePercent)} %`,
  };
}
function q3c(a: Of<'ICH Q3C(R8)'>): Verdict {
  return { tone: a.withinLimit ? 'ok' : 'err', text: `Q3C class ${a.solventClass}: limit ${num(a.limitPpm)} ppm · ${a.withinLimit ? 'within' : 'above'}` };
}
function q3d(a: Of<'ICH Q3D(R2)'>): Verdict {
  return {
    tone: a.withinLimit ? 'ok' : 'err',
    text: `Q3D ${a.elementClass}: ${num(a.observedMicrogramsPerDay)} of ${num(a.pdeMicrogramsPerDay)} µg/day ${a.route} PDE · ${a.withinLimit ? 'within' : 'above'}`,
  };
}
function m7(a: Of<'ICH M7(R2)'>): Verdict {
  const limit = a.acceptableIntakeUgPerDay == null ? 'no TTC limit'
    : `acceptable intake ${num(a.acceptableIntakeUgPerDay)} µg/day${a.concentrationLimitPpm == null ? '' : ` (${num(a.concentrationLimitPpm)} ppm)`}`;
  const where = a.withinLimit == null ? '' : a.withinLimit ? ' · within' : ' · above';
  const tone = a.withinLimit === false ? 'err' : a.withinLimit == null && a.impurityClass <= 2 ? 'warn' : 'ok';
  return { tone, text: `M7 class ${a.impurityClass} (${a.className}): ${limit}${where} · control: ${a.controlApproach}` };
}

/** One assessment in words: the guideline, its verdict and its limit. */
function verdict(a: Assessment): Verdict {
  if (!a.ok) return { tone: 'warn', text: `Not assessed: ${a.message}` };
  if (a.basis === 'ICH Q3A(R2)/Q3B(R2)') return q3ab(a);
  if (a.basis === 'ICH Q3C(R8)') return q3c(a);
  if (a.basis === 'ICH Q3D(R2)') return q3d(a);
  if (a.basis === 'ICH M7(R2)') return m7(a);
  return { tone: 'dim', text: 'Assessed' };
}

/** The register's assessments, by impurity id. Null while loading or when the read was refused — the cell says which. */
export function useImpurityAssessments(projectId: string | undefined) {
  const read = useLiveData<ImpurityAssessmentRow[]>(
    '/api/cmc/impurity-profiles/assessment' + (projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''),
  );
  const byId = React.useMemo(() => new Map((read.data ?? []).map((r) => [r.id, r])), [read.data]);
  return { byId, loading: read.loading, error: read.error ?? null };
}

/** The "Against the guideline" cell for one impurity. */
export function ImpurityVerdictCell({ id, read }: { id: number; read: ReturnType<typeof useImpurityAssessments> }) {
  if (read.loading) return <span className="cm-meta">assessing…</span>;
  if (read.error) return <span className="cm-meta">{read.error}</span>;
  const row = read.byId.get(id);
  if (!row) return <span className="cm-meta">not assessed</span>;
  return (
    <span className="cm-verdicts">
      {row.assessments.map((a) => {
        const v = verdict(a);
        return <span key={a.side} className={'rd-chip rd-chip-sentence tone-' + v.tone}>{v.text}</span>;
      })}
    </span>
  );
}

/* ── Dissolution f2 ─────────────────────────────────────────────────────── */

interface Profile { id: number; batchNumber?: string | null; productName: string; purpose: string }
type F2Answer = {
  status: 'computed' | 'not_comparable';
  methodsMatch: boolean;
  reference: { id: number; batch: string | null };
  test: { id: number; batch: string | null };
  result:
    | { outcome: 'computed'; f2Reported: string; f2Similar: boolean; f1Reported: string; inputsUsed: { includedTimepointsMin: number[]; unitsTested: { reference: number; test: number } }; scope: string }
    | { outcome: 'refused'; code: string; message: string; offending: Array<{ role?: string; timepointMin?: number; observed?: string; required: string }> };
};

const label = (p: Profile) => `${p.batchNumber || `profile ${p.id}`} · ${p.purpose}`;

/** Pick two recorded profiles and ask the engine whether they are similar. */
export function DissolutionCompare({ profiles }: { profiles: Profile[] }) {
  const [ref, setRef] = React.useState('');
  const [test, setTest] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [answer, setAnswer] = React.useState<F2Answer | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  if (profiles.length < 2) return null;
  const compare = async () => {
    setBusy(true); setError(null); setAnswer(null);
    try {
      const res = await apiRequest('POST', '/api/cmc/dissolution-profiles/compare', { referenceId: Number(ref), testId: Number(test) });
      const json = await res.json().catch(() => null);
      if (!res.ok) setError(cmcWriteError(json, res.status));
      else setAnswer((json as { data: F2Answer }).data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const pick = (value: string, set: (v: string) => void, name: string) => (
    <label className="cm-f2-pick">
      {name}
      <select className="de-select" aria-label={name} value={value} onChange={(e) => { set(e.target.value); setAnswer(null); }}>
        <option value="">Choose…</option>
        {profiles.map((p) => <option key={p.id} value={String(p.id)}>{label(p)}</option>)}
      </select>
    </label>
  );
  return (
    <section className="pj-sec cm-f2" aria-label="Compare two profiles (f2)">
      <div className="pj-sec-h"><h3>Compare two profiles</h3><span className="sec-sub">f2 similarity, FDA/EMA rules</span></div>
      <div className="cm-f2-row">
        {pick(ref, setRef, 'Reference profile')}
        {pick(test, setTest, 'Test profile')}
        <button type="button" className="btn ghost small" disabled={!ref || !test || ref === test || busy} onClick={() => void compare()}>
          {busy ? 'Comparing…' : 'Compare'}
        </button>
      </div>
      {error && <p className="sec-sub" role="alert">{error}</p>}
      {answer && <F2Result answer={answer} />}
    </section>
  );
}

function F2Result({ answer }: { answer: F2Answer }) {
  const r = answer.result;
  if (r.outcome === 'refused') {
    return (
      <div className="cm-f2-out" data-testid="cm-f2-refused">
        <p className="sec-sub"><span data-tone="warn">Not comparable</span> — {r.message}</p>
        {r.offending.length > 0 && (
          <ul className="cm-meta">{r.offending.map((o, i) => <li key={i}>{[o.role, o.timepointMin != null ? `${o.timepointMin} min` : null, o.observed ? `recorded ${o.observed}` : null].filter(Boolean).join(', ')}: needs {o.required}</li>)}</ul>
        )}
      </div>
    );
  }
  return (
    <div className="cm-f2-out" data-testid="cm-f2-computed">
      <p className="sec-sub">
        <b>f2 {r.f2Reported}</b> · <span data-tone={r.f2Similar ? 'ok' : 'err'}>{r.f2Similar ? 'similar (f2 ≥ 50)' : 'not similar (f2 < 50)'}</span>
        {' '}· f1 {r.f1Reported} · over {r.inputsUsed.includedTimepointsMin.join(', ')} min · {r.inputsUsed.unitsTested.reference} and {r.inputsUsed.unitsTested.test} units
        {!answer.methodsMatch && <> · <span data-tone="warn">run under different conditions</span></>}
      </p>
      <p className="cm-meta">{r.scope}</p>
    </div>
  );
}
