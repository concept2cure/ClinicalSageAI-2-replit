/**
 * The biostatistics engines' result for one study design, and its one rendering.
 *
 * Split out of `biostatBridge.tsx` on 2026-10-11, when the protocol
 * workspace's Statistics tab stopped being a read-only echo of the design
 * record and started showing the computation itself. Two surfaces now render
 * that computation — the Biostatistics designer's `DesignBridgePanel` and the
 * Authoring Statistics tab — and a second rendering would be a second place
 * for them to disagree about one design. There is one, and it lives here.
 *
 * ── What belongs here ────────────────────────────────────────────────────────
 * The wire shapes of the ENGINE's half of `GET /api/biostat-bridge/designs/
 * :studyId/assessment` (the computation, its assumptions, the design's gaps,
 * the judgment by dimension, the reviewer's risk table) and the components that
 * draw them. The bridge module keeps the reads, the governed writes, the filing
 * placements and the surfaces; it imports from here and re-exports these names,
 * so nothing outside the pair had to change.
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 * A design the engine could not size shows no figure — not a zero, not a dash
 * where a number belongs — and the gaps that stopped it. A value the engine
 * assumed is labelled as assumed. A dimension it did not score says so rather
 * than scoring 0.
 *
 * @module client/src/concept2cure/v2/surfaces/biostatEngineResult
 */
import React, { useState } from 'react';

/* The two formatting primitives both halves of this pair use. They are
   declared in this module because it is the lower of the two: the bridge
   imports from here and never the other way, so there is no cycle. */

/** A proportion as a percentage, or an em dash where there is no value. Never
 *  "0%" for an absent figure — that reads as a computed zero. */
export const pct = (v: number | null | undefined) => (v === null || v === undefined ? '\u2014' : `${Math.round(v * 100)}%`);

/** The secondary-text style used for provenance, paths and qualifiers. */
export const muted: React.CSSProperties = { fontSize: 11, color: 'var(--text-300,#6b6963)' };

// ─── Wire shapes (the engine's half of the assessment) ───────────────────────

export interface ReadinessCheck { key: string; label: string; ok: boolean; hint?: string }
export interface StatisticalReadiness {
  percent: number;
  checks: ReadinessCheck[];
  plannedSampleSize: number | null;
  power: number | null;
  alpha: number | null;
  primaryEndpoint: string | null;
}

export interface DesignGap {
  field: string;
  message: string;
  severity: 'blocking' | 'defaulted' | 'note';
  designPath: string;
}

export interface ReviewRow {
  element: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
  finding: string;
  action: string;
  codes: string[];
}
export interface StatisticalReview {
  rows: ReviewRow[];
  verdict: { challengeLikelihood: 'low' | 'moderate' | 'high'; mostVulnerable: string | null; recommendedActions: string[] };
  standardsChecked: string[];
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
}
/**
 * One value the sizing stood on, and where that value came from
 * (ana-biostats `ComputationAssumption`).
 *
 * This is the part of the result that makes a computed N reviewable rather
 * than merely displayed: `source` separates what the design RECORDS from what
 * the engine defaulted or derived, and `sensitivity` says which of them the
 * answer actually turns on. A surface that shows the N and drops these is
 * showing a figure nobody can defend.
 */
export interface ComputationAssumption {
  parameter: string;
  value: number | string;
  source: 'user_provided' | 'default' | 'derived' | 'literature';
  sensitivity: 'high' | 'moderate' | 'low';
}

/** One dimension of the judgment engine's verdict (ana-biostats `JudgmentDimension`). */
export interface JudgmentDimension {
  name: string;
  verdict: string;
  /** 0-100, or null where the dimension was not scored. */
  score: number | null;
  rationale: string;
  flags: string[];
}

/** The deterministic computation engine's result for one design. */
export interface DesignComputation {
  method: string;
  sampleSize: { total: number; perGroup: number; groups?: number };
  /** The total after the attrition adjustment, when one applied. */
  adjustedTotal?: number;
  power: number;
  alpha?: number;
  effectSize?: number;
  formula?: string;
  attritionAdjusted?: boolean;
  assumptions?: ComputationAssumption[];
}

/** The deterministic judgment engine's verdict on that computation. */
export interface DesignJudgment {
  overallVerdict: string;
  overallRisk: string;
  actionRecommendation: string;
  dimensions?: JudgmentDimension[];
  escalationReasons?: string[];
}

/**
 * What the engine-result rendering reads out of an assessment.
 *
 * A structural subset, deliberately: `DesignAssessment` stays declared in the
 * bridge module (it is that module's wire contract) and satisfies this, so this
 * module renders the engine result without owning the whole shape — and the
 * Statistics tab can pass the same object the designer does.
 */
/** The engine's refusal as the bridge sends it (bridge-service.ts). */
export interface EngineRefusal {
  code: 'missing_input' | 'not_supported' | 'invalid_input';
  message: string;
  field?: string;
}

export interface EngineResult {
  computation: DesignComputation | null;
  judgment: DesignJudgment | null;
  /** Set when the engine declined to size the design, with its own sentence. */
  refusal?: EngineRefusal | null;
  adapter: { input: Record<string, unknown> | null; gaps: DesignGap[]; mapped: string[] };
  provenance: { engine: string; engineVersion: string; inputsSha256: string | null };
}

// ─── The engine's result, rendered ───────────────────────────────────────────
//
// One rendering of the deterministic engines' output, shared by both surfaces
// that show it: the Biostatistics designer's `DesignBridgePanel` and the
// protocol workspace's Statistics tab. Before 2026-10-11 only the designer
// rendered the computation at all, and the Statistics tab showed the figures
// already stored on the design record — so an author in Authoring could read a
// sample size and not produce one. Two renderings of the same engine result
// would be two places for them to disagree, so there is one.

/**
 * The adapter's gaps, read defensively.
 *
 * The bridge's `adapter` is declared non-optional because the server
 * always sends it and the designer seeds its form from `adapter.input`. But a
 * 200 whose body omitted it is a broken read, not a design with no gaps, and
 * every reader below would throw on `.filter`. This renders the absence as an
 * absence instead.
 */
function gapsOf(a: EngineResult): DesignGap[] {
  const gaps = (a as { adapter?: { gaps?: unknown } }).adapter?.gaps;
  return Array.isArray(gaps) ? (gaps as DesignGap[]) : [];
}

/** The readiness checks, read defensively: a row without them is a broken
 *  read, and "0 of 0 checks pass" would report it as a clean design. */
export function readinessChecksOf(readiness: StatisticalReadiness | null | undefined): ReadinessCheck[] {
  const checks = (readiness as { checks?: unknown } | null | undefined)?.checks;
  return Array.isArray(checks) ? (checks as ReadinessCheck[]) : [];
}

/** The engine's refusal, or null — only a real sentence counts as one. */
function refusalOf(a: EngineResult): EngineRefusal | null {
  const r = a.refusal;
  return r && typeof r.message === 'string' && r.message.trim() ? r : null;
}

/** The provenance stamp, or null when the read carried none. */
function provenanceOf(a: EngineResult): EngineResult['provenance'] | null {
  const p = (a as { provenance?: EngineResult['provenance'] }).provenance;
  return p && typeof p.engine === 'string' ? p : null;
}

/**
 * The N the engine actually proposes: the attrition-adjusted total where the
 * method adjusted for attrition, the raw total otherwise. Never a zero
 * standing in for an absent figure — absent is null, and null is not drawn.
 */
export function computedTotalN(c: DesignComputation | null | undefined): number | null {
  const n = c ? c.adjustedTotal ?? c.sampleSize?.total : undefined;
  /* A zero is not a sample size. The server withholds `computation` when the
     adapter blocks, but a computation that arrives with a total of 0 (or a
     negative one) is an absent figure wearing a number, and this line used to
     render it as "0 subjects" and leave the governed write enabled. */
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Whether this assessment may show a figure at all.
 *
 * The invariant "no number for a design with a blocking gap" lived only in
 * `server/services/biostatistics-bridge/design-adapter.ts` (`input: blocking ?
 * null : input`). The client enforced nothing: an assessment carrying BOTH a
 * blocking gap and a computation rendered the number, showed "blocking"
 * beside it, and left the governed Apply write enabled. One bad server
 * response, one stale cached assessment, or one future caller that computes
 * before checking is enough — so the rule is now enforced where it is
 * rendered as well as where it is produced.
 */
export function engineFigureIsUsable(a: EngineResult): boolean {
  const gaps = Array.isArray(a.adapter?.gaps) ? a.adapter.gaps : [];
  if (gaps.some((g) => g.severity === 'blocking')) return false;
  return computedTotalN(a.computation) !== null;
}

const verdictTone = (v: string) => (v === 'adequate' ? 'ok' : v === 'marginal' ? 'warn' : 'err');
const dashed = (v: string) => v.replace(/_/g, ' ');

/** Where an assumed value came from. `user_provided` says "the design", because
 *  on this path the "user" is the design record, not the person reading it. */
const SOURCE_LABEL: Record<ComputationAssumption['source'], string> = {
  user_provided: 'from the design', default: 'default', derived: 'derived', literature: 'literature',
};

/**
 * What the engine computed, stamped with the engine and the hash of its inputs
 * — or the sentence that says it computed nothing. The two are never blended:
 * an unsized design shows no number at all, not a zero.
 */
export function ComputedSizeLine({ assessment: a }: { assessment: EngineResult }) {
  const n = computedTotalN(a.computation);
  const prov = provenanceOf(a);
  const blocked = gapsOf(a).some((g) => g.severity === 'blocking');
  /* `blocked` is part of this condition, not only of the copy below it. An
     assessment carrying a blocking gap AND a computation used to render the
     number with "blocking" beside it. A figure whose inputs the bridge says
     are incomplete is not a figure to put in front of a statistician. */
  if (!a.computation || n === null || blocked) {
    const refused = refusalOf(a);
    return (
      <div style={{ fontSize: 12 }}>
        <b>Not sized.</b>{' '}
        {refused
          /* The engine's own sentence, which until 2026-10-11 the read path
             turned into "Something went wrong while assessing the design."
             (bridge-service.ts computeFor). */
          ? refused.message
          : blocked
            ? 'The engine produced no figure for this design — what it needs is not on the record. Each missing field is named below.'
            : 'The engine produced no figure for this design and the bridge named no missing field, so this assessment is incomplete rather than complete and empty. Reload it before relying on it.'}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
      <span><b>{n}</b> subjects</span>
      <span><b>{pct(a.computation.power)}</b> power</span>
      {a.judgment && (
        <span className={'rd-chip tone-' + verdictTone(a.judgment.overallVerdict)}>{dashed(a.judgment.overallVerdict)}</span>
      )}
      <span style={muted}>
        {a.computation.method}
        {prov ? ` · ${prov.engine} ${prov.engineVersion}` : ''}
        {prov?.inputsSha256 ? ' · inputs ' + prov.inputsSha256.slice(0, 12) : ''}
      </span>
    </div>
  );
}

/** The design's gaps, by severity: what blocks the computation, what the engine
 *  assumed in place of a missing value, and what it merely noted. */
export function DesignGapList({ gaps }: { gaps: DesignGap[] }) {
  if (gaps.length === 0) return null;
  const blocking = gaps.filter((g) => g.severity === 'blocking');
  const defaulted = gaps.filter((g) => g.severity === 'defaulted');
  const notes = gaps.filter((g) => g.severity === 'note');
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: 'grid', gap: 4 }} aria-label="Design gaps">
      {blocking.map((g) => <li key={'b' + g.field}><span className="rd-chip tone-err" style={{ marginRight: 6 }}>blocking</span>{g.message} <span style={muted}>({g.designPath})</span></li>)}
      {defaulted.map((g) => <li key={'d' + g.field}><span className="rd-chip tone-warn" style={{ marginRight: 6 }}>assumed</span>{g.message}</li>)}
      {notes.map((g) => <li key={'n' + g.field + g.message.length}><span className="rd-chip tone-idle" style={{ marginRight: 6 }}>note</span>{g.message}</li>)}
    </ul>
  );
}

/**
 * The values the sizing stood on, each with where it came from and how much
 * the answer turns on it. A computed N without these is a figure a reviewer
 * cannot check, which on this product is the same as a figure nobody may use.
 */
export function EngineAssumptionsTable({ assumptions: raw }: { assumptions: ComputationAssumption[] }) {
  /* A 200 whose `computation.assumptions` is not an array threw
     "assumptions.map is not a function" and React unmounted this whole pane —
     an error rendered as nothing, which is the one thing this file's own
     header forbids. Every other list here was already guarded; this one and
     `flags` below were not. */
  const assumptions = Array.isArray(raw) ? raw : [];
  if (assumptions.length === 0) return null;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="reg-tbl" aria-label="Assumptions the engine used">
        <thead><tr><th>Assumption</th><th>Value</th><th>Source</th><th>Answer turns on it</th></tr></thead>
        <tbody>
          {assumptions.map((x) => (
            <tr key={x.parameter}>
              <td style={{ whiteSpace: 'nowrap' }}>{x.parameter}</td>
              <td style={{ fontFamily: 'var(--font-mono)' }}>{String(x.value)}</td>
              <td>{SOURCE_LABEL[x.source] ?? x.source}</td>
              <td><span className={'rd-chip tone-' + (x.sensitivity === 'high' ? 'warn' : 'idle')}>{x.sensitivity}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The judgment engine's verdict dimension by dimension, with its reason for
 * each. The overall verdict alone tells a statistician that something is
 * marginal and not which part of the design made it so.
 */
export function JudgmentDimensionTable({ judgment }: { judgment: DesignJudgment }) {
  const dims = Array.isArray(judgment.dimensions) ? judgment.dimensions : [];
  const escalations = Array.isArray(judgment.escalationReasons) ? judgment.escalationReasons : [];
  if (dims.length === 0 && escalations.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {dims.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="reg-tbl" aria-label="Judged by dimension">
            <thead><tr><th>Dimension</th><th>Verdict</th><th>Score</th><th>Why</th></tr></thead>
            <tbody>
              {dims.map((d) => (
                <tr key={d.name}>
                  <td style={{ whiteSpace: 'nowrap' }}>{d.name}</td>
                  <td><span className={'rd-chip tone-' + verdictTone(d.verdict)}>{dashed(d.verdict)}</span></td>
                  {/* A dimension the engine did not score says so. A 0 would read as "scored zero". */}
                  <td style={{ whiteSpace: 'nowrap' }}>{typeof d.score === 'number' ? `${d.score}/100` : 'not scored'}</td>
                  <td style={{ fontSize: 12 }}>{d.rationale}{Array.isArray(d.flags) && d.flags.length > 0 ? ` — ${d.flags.join('; ')}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {escalations.length > 0 && (
        <div style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 600 }}>Escalation reasons</div>
          <ul style={{ margin: '2px 0 0', paddingLeft: 18, display: 'grid', gap: 2 }}>
            {escalations.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The whole engine result for one design: the computed figures, the gaps, the
 * assumptions and the judgment by dimension. Both surfaces mount THIS, so
 * neither can show a narrower version of the same answer.
 */
export function EngineResultPanel({ assessment: a }: { assessment: EngineResult }) {
  const judgment = a.judgment;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <ComputedSizeLine assessment={a} />
      <DesignGapList gaps={gapsOf(a)} />
      <EngineAssumptionsTable assumptions={a.computation?.assumptions ?? []} />
      {judgment && (
        <>
          <div style={{ fontSize: 12 }}>
            Recommended action: <b>{dashed(judgment.actionRecommendation)}</b>
            <span style={muted}> · {judgment.overallRisk} statistical risk</span>
          </div>
          <JudgmentDimensionTable judgment={judgment} />
        </>
      )}
    </div>
  );
}
// ─── Statistical review table ────────────────────────────────────────────────

const riskTone = (r: string) => (r === 'low' ? 'ok' : r === 'medium' ? 'warn' : 'err');

export function StatisticalReviewTable({ review }: { review: StatisticalReview }) {
  const [open, setOpen] = useState(review.overallRisk !== 'low');
  const v = review.verdict;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
        <span className={'rd-chip tone-' + riskTone(review.overallRisk)}>{review.overallRisk} statistical risk</span>
        <span>Regulatory challenge likelihood: <b>{v.challengeLikelihood}</b>{v.mostVulnerable ? <> — most vulnerable: <b>{v.mostVulnerable}</b></> : null}</span>
        <button className="btn" style={{ height: 24, fontSize: 11, marginLeft: 'auto' }} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Show'} review
        </button>
      </div>
      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table className="reg-tbl" aria-label="Statistical risk summary">
            <thead><tr><th>Element</th><th>Risk</th><th>Finding</th><th>Action</th></tr></thead>
            <tbody>
              {review.rows.map((r) => (
                <tr key={r.element}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.element}{r.codes.length ? <span style={{ ...muted, display: 'block', fontFamily: 'var(--font-mono)' }}>{r.codes.join(' ')}</span> : null}</td>
                  <td><span className={'rd-chip tone-' + riskTone(r.risk)}>{r.risk}</span></td>
                  <td style={{ fontSize: 12 }}>{r.finding}</td>
                  <td style={{ fontSize: 12 }}>{r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {review.standardsChecked.length > 0 && <div style={muted}>Standards checked: {review.standardsChecked.join(' · ')}</div>}
        </div>
      )}
    </div>
  );
}
