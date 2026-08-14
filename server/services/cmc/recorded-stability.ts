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
export function parseAcceptanceCriterion(
  candidates: unknown[]
): { limit: number; direction: 'increasing' | 'decreasing' } | null {
  for (const candidate of candidates) {
    const text = String(candidate ?? '').trim();
    if (!text) continue;
    const numbers = (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
    if (numbers.length === 0) continue;

    if (/(?:<=|≤|<|nmt|not more than|max)/i.test(text)) {
      return { limit: numbers[0], direction: 'increasing' };
    }
    if (/(?:>=|≥|>|nlt|not less than|min)/i.test(text)) {
      return { limit: numbers[0], direction: 'decreasing' };
    }
    if (numbers.length >= 2) {
      // A range: the attribute is bounded on both sides, and the failure mode a
      // shelf life is set by is the decreasing one.
      return { limit: Math.min(...numbers), direction: 'decreasing' };
    }
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
    decision: string;
  }>;
  const limiting = assessed.length
    ? assessed.reduce((min, a) => (a.shelfLife < min.shelfLife ? a : min))
    : null;

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
