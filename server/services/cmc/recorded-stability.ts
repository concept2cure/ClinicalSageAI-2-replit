/**
 * Reading a stability programme's RECORDED data, and running ICH Q1E over it.
 *
 * ── Why this is a service and not route code ──────────────────────────────────
 * The poolability decision has two callers with the same rules: the HTTP route
 * the stability surface posts to, and the AnA tool that answers "are my primary
 * batches combinable?" without the user pasting numbers. The eligibility rules
 * below are the whole safety story — one product, one storage condition,
 * distinct batches, one acceptance criterion — and a second copy of them is a
 * copy that drifts. The copy that drifts is the one that lets an invalid
 * assessment through, so there is exactly one.
 *
 * ── What "recorded" means ─────────────────────────────────────────────────────
 * The stability surface appends each pull-point result to
 * `stability_data.results`. The readers here are deliberately tolerant of the
 * shapes a json column can hold (parsed object, JSON string, or a bare array
 * from an older writer) and deliberately intolerant of guessing: a value that
 * cannot be read as a number reads as null, never as zero, and an acceptance
 * criterion that cannot be parsed yields no limit rather than a default one. A
 * fabricated limit here would silently produce a shelf life, which is the single
 * most consequential value this module computes.
 *
 * @module server/services/cmc/recorded-stability
 */

export interface StabilityPointRecord {
  timePoint?: unknown;
  parameter?: unknown;
  result?: unknown;
  specification?: unknown;
}

/** The recorded pull-point results on a study, whatever shape the column holds. */
export function readRecordedStabilityResults(value: unknown): StabilityPointRecord[] {
  let raw = value;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { results?: unknown }).results)
      ? (raw as { results: unknown[] }).results
      : [];
  return list.filter(
    (r): r is StabilityPointRecord => Boolean(r) && typeof r === 'object'
  );
}

/** The first finite number in a recorded value ("98.4%" → 98.4), else null. */
export function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const m = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * An acceptance criterion as recorded → the limit and which way the attribute
 * trends toward it.
 *
 *   "<= 2.0%"          → upper limit 2.0, attribute increasing toward it
 *   ">= 95.0%"         → lower limit 95.0, attribute decreasing toward it
 *   "95.0 – 105.0%"    → a two-sided range; the LOWER bound is taken, because a
 *                        potency/assay range is limited in practice by decay.
 *
 * Returns null when nothing numeric is recorded — the caller then reports the
 * parameter as not estimable and says why.
 */
export interface ParsedAcceptanceCriterion {
  /** The bound the shelf life is estimated against. */
  limit: number;
  direction: 'increasing' | 'decreasing';
  /** The other bound of a two-sided range, or null for a one-sided criterion. */
  upperLimit: number | null;
  twoSided: boolean;
}

/**
 * A two-sided range, matched as a RANGE rather than as two numbers.
 *
 * The separator is an ASCII hyphen, an en or em dash, or the word "to". The
 * lower bound may itself be negative; the separator may not be, which is the
 * whole point — see the note on the parser.
 */
const RANGE_RE =
  /(-?\d+(?:\.\d+)?)\s*(?:[–—]|-|\bto\b)\s*(-?\d+(?:\.\d+)?)/i;

export function parseAcceptanceCriterion(
  candidates: unknown[]
): ParsedAcceptanceCriterion | null {
  for (const candidate of candidates) {
    const text = String(candidate ?? '').trim();
    if (!text) continue;

    /* One-sided forms first: an explicit comparator settles the direction, and
       a criterion like "NLT -5.0 C" is legitimately about a negative quantity,
       so the minus sign must survive. */
    if (/(?:<=|≤|<|nmt|not more than|max)/i.test(text)) {
      const n = (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
      if (n.length > 0) return { limit: n[0], direction: 'increasing', upperLimit: null, twoSided: false };
      continue;
    }
    if (/(?:>=|≥|>|nlt|not less than|min)/i.test(text)) {
      const n = (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
      if (n.length > 0) return { limit: n[0], direction: 'decreasing', upperLimit: null, twoSided: false };
      continue;
    }

    /* Then a two-sided range, matched as ONE pattern.
       The old code pulled every number with /-?\d+(?:\.\d+)?/g and took the
       minimum. On "98.0-102.0%" — how an assay range is normally typed — the
       separating hyphen was consumed as a minus sign, so the range read as
       [98.0, -102.0] and the spec limit became -102: a potency that must stay
       above 98% compared against minus one hundred and two, which nothing can
       fail, and a shelf life that ran to the search horizon. It parsed
       correctly only when the hyphen happened to be spaced or was a dash. */
    const range = text.match(RANGE_RE);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
        const lower = Math.min(a, b);
        const upper = Math.max(a, b);
        /* The failure mode a shelf life is set by is the decreasing one: an
           assay drifts down out of its range. Both bounds are carried so the
           caller can state the criterion as recorded. */
        return { limit: lower, direction: 'decreasing', upperLimit: upper, twoSided: true };
      }
      /* Two identical bounds are not a range. Estimating against them would
         report a shelf life against a limit the record does not set. */
      continue;
    }

    /* A bare number with no comparator and no range states no direction, so it
       states no limit this engine can use. */
  }
  return null;
}

/** Group a study's recorded series by the attribute being trended. */
export function groupByParameter(
  series: StabilityPointRecord[]
): Map<string, StabilityPointRecord[]> {
  const byParameter = new Map<string, StabilityPointRecord[]>();
  for (const r of series) {
    const key = String(r.parameter || '').trim();
    if (!key) continue;
    const list = byParameter.get(key) ?? [];
    list.push(r);
    byParameter.set(key, list);
  }
  return byParameter;
}

/** The condition SET a study is placed at, order-independent. */
export function conditionKey(codes: unknown): string {
  return (Array.isArray(codes) ? codes : [codes])
    .map(c => String(c ?? '').trim())
    .filter(Boolean)
    .sort()
    .join(' + ');
}

/** The shape the poolability assessment needs from a stability study row. */
export interface RecordedStabilityStudy {
  id: number;
  studyTitle: string | null;
  productName: string | null;
  batchNumber: string | null;
  storageConditions: unknown;
  duration: number | null;
  stabilityData: unknown;
}

export interface PoolabilityRefusal {
  ok: false;
  /** HTTP-shaped so the route can pass it straight through. */
  status: 400 | 404 | 409;
  error: string;
}
export interface PoolabilityOutcome {
  ok: true;
  data: Record<string, unknown>;
}

/**
 * Assess ICH Q1E batch poolability across the studies of record.
 *
 * ── The refusals are the design ───────────────────────────────────────────────
 * A poolability result computed from mismatched inputs is indistinguishable from
 * one computed from sound inputs, and would be filed as evidence for a
 * registered shelf life. So this stops rather than guesses:
 *   • batches must be of ONE product — one line through two molecules is never a
 *     valid claim;
 *   • every study must be placed at exactly ONE storage condition, and all at
 *     the SAME one. `storage_conditions` is an array and results carry no
 *     per-result condition, so a study spanning conditions has one
 *     undifferentiated series covering two degradation regimes and nothing valid
 *     can be fitted from it. Across studies, comparing 25°C slopes against 40°C
 *     slopes would reject poolability for a reason that is an artefact of the
 *     selection rather than a property of the batches;
 *   • batch numbers must be distinct. Repeat testing of one batch is not two
 *     batches, and counting it twice understates the between-batch variability
 *     the test exists to detect;
 *   • an attribute is assessed only where ≥2 batches recorded it AND those
 *     batches agree on the acceptance criterion. Disagreement is reported as a
 *     conflict to resolve, never averaged away.
 *
 * Nothing is written. A "pooled" verdict establishes that ONE figure may be
 * claimed for all the batches rather than the shortest; the claim itself is a
 * regulatory decision made on the study close-out.
 */
export async function assessRecordedPoolability(
  studies: RecordedStabilityStudy[]
): Promise<PoolabilityRefusal | PoolabilityOutcome> {
  if (studies.length < 2) {
    return { ok: false, status: 400, error: 'Poolability compares batches, so it needs at least two DIFFERENT studies.' };
  }

  const products = Array.from(new Set(studies.map(s => String(s.productName ?? '').trim())));
  if (products.length > 1) {
    return {
      ok: false,
      status: 409,
      error: `Poolability combines batches of one product. These studies span ${products.length}: ${products.map(p => p || '(not recorded)').join(', ')}.`,
    };
  }

  const spanning = studies.filter(s => conditionKey(s.storageConditions).includes(' + '));
  if (spanning.length > 0) {
    return {
      ok: false,
      status: 409,
      error: `${spanning.map(s => `Study ${s.id} (${s.studyTitle || s.productName})`).join(', ')} ${spanning.length === 1 ? 'is' : 'are'} placed at more than one storage condition, and results are not recorded against a condition — so the long-term points cannot be separated from the others. Register one study per condition to assess poolability.`,
    };
  }

  const conditions = Array.from(new Set(studies.map(s => conditionKey(s.storageConditions))));
  if (conditions.length > 1) {
    return {
      ok: false,
      status: 409,
      error: `ICH Q1E combinability is assessed within one storage condition. These studies span ${conditions.length}: ${conditions.map(c => c || '(not recorded)').join(', ')}. Select studies from a single condition.`,
    };
  }

  const batchLabels = studies.map(s => String(s.batchNumber ?? '').trim());
  if (batchLabels.some(b => !b)) {
    return {
      ok: false,
      status: 409,
      error: 'Every study must record a batch number — poolability is a statement about batches, and an unlabelled one cannot be told apart from another.',
    };
  }
  const duplicateBatch = batchLabels.find((b, i) => batchLabels.indexOf(b) !== i);
  if (duplicateBatch) {
    return {
      ok: false,
      status: 409,
      error: `Batch "${duplicateBatch}" appears in more than one selected study. Repeat testing of one batch is not two batches, and counting it twice would hide the between-batch variability this test measures.`,
    };
  }

  const perStudy = studies.map(s => ({
    study: s,
    byParameter: groupByParameter(readRecordedStabilityResults(s.stabilityData)),
  }));

  const parameters = Array.from(
    new Set(perStudy.flatMap(p => Array.from(p.byParameter.keys())))
  ).sort();
  if (parameters.length === 0) {
    return {
      ok: false,
      status: 409,
      error: 'None of the selected studies has recorded pull-point results — there is nothing to fit.',
    };
  }

  const { assessBatchPoolability } = await import('./shelf-life-poolability.js');
  const durations = studies
    .map(s => (Number.isFinite(s.duration) ? (s.duration as number) : 0))
    .filter(d => d > 0);
  const maxTime = durations.length ? Math.max(120, Math.max(...durations) * 2) : 120;

  const assessments: Array<Record<string, unknown>> = [];
  for (const parameter of parameters) {
    /* A batch contributes only if it can be fitted. Q1E needs ≥3 numeric points
       over ≥2 distinct times per batch — the engine enforces this too, but
       filtering here lets a study be named as excluded and why, rather than the
       whole attribute failing with one opaque message. */
    const contributing: Array<{ batchId: string; data: Array<{ time: number; value: number }> }> = [];
    const excluded: Array<{ batchId: string; reason: string }> = [];
    const criteria: Array<{ batchId: string; limit: number; direction: 'increasing' | 'decreasing' }> = [];

    for (const { study, byParameter } of perStudy) {
      const batchId = String(study.batchNumber);
      const points = byParameter.get(parameter);
      if (!points || points.length === 0) {
        excluded.push({ batchId, reason: `Did not record ${parameter}.` });
        continue;
      }
      const usable = points
        .map(p => ({ time: parseNumeric(p.timePoint), value: parseNumeric(p.result) }))
        .filter((p): p is { time: number; value: number } => p.time !== null && p.value !== null);
      if (usable.length < 3 || new Set(usable.map(p => p.time)).size < 2) {
        excluded.push({
          batchId,
          reason: `Needs at least 3 numeric results over 2 or more distinct timepoints; has ${usable.length} numeric of ${points.length} recorded.`,
        });
        continue;
      }
      const criterion = parseAcceptanceCriterion(points.map(p => p.specification));
      if (!criterion) {
        excluded.push({ batchId, reason: 'No numeric acceptance criterion recorded against these results.' });
        continue;
      }
      contributing.push({ batchId, data: usable });
      criteria.push({ batchId, ...criterion });
    }

    if (contributing.length < 2) {
      assessments.push({
        parameter,
        assessable: false,
        reason: `Poolability needs at least 2 fittable batches; ${contributing.length} of ${studies.length} ${contributing.length === 1 ? 'qualifies' : 'qualify'}.`,
        contributingBatches: contributing.map(c => c.batchId),
        excludedBatches: excluded,
      });
      continue;
    }

    /* The batches must agree on what "in specification" means. If they do not,
       one line is being fitted to two different acceptance criteria and any
       pooled shelf life would be against a limit that no batch was actually
       judged by. Report the conflict; do not pick one. */
    const distinctCriteria = Array.from(new Set(criteria.map(c => `${c.direction}:${c.limit}`)));
    if (distinctCriteria.length > 1) {
      assessments.push({
        parameter,
        assessable: false,
        reason:
          'The selected batches recorded different acceptance criteria for this attribute, so there is no single limit to pool against. Reconcile the specification on the pull-point results first.',
        conflictingCriteria: criteria.map(c => ({ batchId: c.batchId, limit: c.limit, direction: c.direction })),
        contributingBatches: contributing.map(c => c.batchId),
        excludedBatches: excluded,
      });
      continue;
    }

    const { limit, direction } = criteria[0];
    try {
      const result = assessBatchPoolability({ batches: contributing, specLimit: limit, direction, maxTime });
      assessments.push({
        parameter,
        assessable: true,
        specLimit: limit,
        direction,
        contributingBatches: contributing.map(c => c.batchId),
        excludedBatches: excluded,
        ...result,
      });
    } catch (e) {
      assessments.push({
        parameter,
        assessable: false,
        reason: e instanceof Error ? e.message : String(e),
        contributingBatches: contributing.map(c => c.batchId),
        excludedBatches: excluded,
      });
    }
  }

  /* The claim a programme can support is set by its most constraining attribute,
     whatever the pooling decision was for each. */
  const assessed = assessments.filter(a => a.assessable) as Array<{
    parameter: string;
    shelfLife: number;
    statisticalCrossing?: number;
    decision: string;
  }>;
  const limiting = assessed.length ? assessed.reduce(moreConstraining) : null;

  return {
    ok: true,
    data: {
      studyIds: studies.map(s => s.id),
      productName: studies[0].productName,
      productNames: products,
      storageCondition: conditions[0] || null,
      batches: batchLabels,
      basis:
        'ICH Q1E — sequential ANCOVA combinability tests (equality of slopes, then of intercepts) at the 0.25 significance level',
      scopeLimit:
        'One attribute and one storage condition at a time. A pooled result is evidence for a shelf-life claim, not the claim; the registered shelf life is set on the study close-out.',
      maxTimeEvaluated: maxTime,
      limitingParameter: limiting ? limiting.parameter : null,
      supportedShelfLife: limiting ? limiting.shelfLife : null,
      limitingDecision: limiting ? limiting.decision : null,
      assessments,
    },
  };
}


/* The attribute a shelf-life claim is limited by. The proposable shelf life is
   the ICH Q1E-capped number, so two attributes that both exceed the
   extrapolation limit tie on it; the tie is broken by the statistical
   crossing, which is where each attribute's data actually run out. Without
   the tie-break the first attribute in recorded order was reported as
   limiting, which is an artefact of ordering, not of the data. */
function moreConstraining<T extends { shelfLife: number; statisticalCrossing?: number }>(min: T, a: T): T {
  if (a.shelfLife !== min.shelfLife) return a.shelfLife < min.shelfLife ? a : min;
  return (a.statisticalCrossing ?? Infinity) < (min.statisticalCrossing ?? Infinity) ? a : min;
}

/* ── Single-study ICH Q1E estimate over a RECORDED study ────────────────────
   Extracted from POST /api/cmc/stability-studies/:id/shelf-life so the route
   and AnA's recorded-estimate tool run the SAME code. Two copies of a
   shelf-life fit is two answers to a question a registered shelf life is set
   from — the duplication this repo's working agreement forbids. */

export interface RecordedShelfLifeStudy {
  id: number | string;
  studyTitle?: string | null;
  productName?: string | null;
  batchNumber?: string | null;
  storageConditions?: unknown;
  duration?: number | null;
  stabilityData?: unknown;
}

export type RecordedShelfLifeOutcome =
  | { ok: false; error: string }
  | {
      ok: true;
      data: {
        studyId: number | string;
        studyTitle?: string | null;
        productName?: string | null;
        batchNumber?: string | null;
        storageConditions?: unknown;
        basis: string;
        scopeLimit: string;
        maxTimeEvaluated: number;
        limitingParameter: string | null;
        supportedShelfLife: number | null;
        estimates: Array<Record<string, unknown>>;
      };
    };

/**
 * Fit the recorded pull points of ONE stability study per ICH Q1E.
 *
 * Refuses — rather than caveats — when the study cannot support a fit: no
 * recorded results, or results spanning more than one storage condition with
 * no per-result condition to separate them. The output is a month count
 * someone sets a registered shelf life from, and a footnote on a
 * plausible-looking number does not survive being copied into a summary.
 */
export async function estimateRecordedShelfLife(
  study: RecordedShelfLifeStudy,
): Promise<RecordedShelfLifeOutcome> {
  const { estimateShelfLife } = await import('./shelf-life');
  const series = readRecordedStabilityResults(study.stabilityData);
  if (series.length === 0) {
    return { ok: false, error: 'This study has no recorded pull-point results — there is nothing to fit.' };
  }

  const placedAt = (Array.isArray(study.storageConditions) ? study.storageConditions : [])
    .map((c) => String(c ?? '').trim())
    .filter(Boolean);
  if (placedAt.length > 1) {
    return {
      ok: false,
      error: `This study is placed at ${placedAt.length} storage conditions (${placedAt.join(', ')}) and its results are not recorded against a condition, so the points for one condition cannot be separated from the others. Register one study per condition to fit a shelf life.`,
    };
  }

  const byParameter = groupByParameter(series);
  const duration = Number(study.duration);
  const maxTime = Number.isFinite(duration) && duration > 0 ? Math.max(120, duration * 2) : 120;

  const estimates: Array<Record<string, unknown>> = [];
  for (const [parameter, points] of byParameter) {
    const usable = points
      .map((p) => ({ time: parseNumeric(p.timePoint), value: parseNumeric(p.result) }))
      .filter((p): p is { time: number; value: number } => p.time !== null && p.value !== null);
    const criterion = parseAcceptanceCriterion(points.map((p) => p.specification));

    if (usable.length < 3) {
      estimates.push({
        parameter,
        estimable: false,
        reason: `ICH Q1E regression needs at least 3 numeric timepoints; ${usable.length} of ${points.length} recorded ${points.length === 1 ? 'result is' : 'results are'} numeric.`,
        pointsRecorded: points.length,
        pointsUsable: usable.length,
      });
      continue;
    }
    if (!criterion) {
      estimates.push({
        parameter,
        estimable: false,
        reason:
          'No numeric specification limit was recorded against these results, so there is no limit for the confidence bound to intersect. Record the acceptance criterion (e.g. "<= 2.0%" or ">= 95.0%") on the pull-point results.',
        pointsRecorded: points.length,
        pointsUsable: usable.length,
      });
      continue;
    }

    try {
      const result = estimateShelfLife({
        data: usable,
        specLimit: criterion.limit,
        direction: criterion.direction,
        maxTime,
      });
      estimates.push({
        parameter,
        estimable: true,
        specLimit: criterion.limit,
        direction: criterion.direction,
        pointsUsed: usable.length,
        ...result,
      });
    } catch (e) {
      estimates.push({
        parameter,
        estimable: false,
        reason: e instanceof Error ? e.message : String(e),
        pointsRecorded: points.length,
        pointsUsable: usable.length,
      });
    }
  }

  // The programme-level answer is the most constraining attribute, which is
  // what a shelf-life claim is actually limited by.
  const estimable = estimates.filter((e) => e.estimable) as Array<{
    parameter: string;
    shelfLife: number;
    statisticalCrossing?: number;
  }>;
  const limiting = estimable.length ? estimable.reduce(moreConstraining) : null;

  return {
    ok: true,
    data: {
      studyId: study.id,
      studyTitle: study.studyTitle,
      productName: study.productName,
      batchNumber: study.batchNumber,
      storageConditions: study.storageConditions,
      basis: 'ICH Q1E — ordinary least squares, one-sided 95% mean confidence limit vs the specification limit',
      scopeLimit:
        'Single attribute, single factor, one batch. Batch poolability (ICH Q1E ANCOVA) is assessed separately and is not implied by this estimate.',
      maxTimeEvaluated: maxTime,
      limitingParameter: limiting ? limiting.parameter : null,
      supportedShelfLife: limiting ? limiting.shelfLife : null,
      estimates,
    },
  };
}
