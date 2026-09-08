/**
 * Process capability over a project's RECORDED batch results, per test.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The capability engine (services/cmc/process-capability) takes a series of
 * batch values and one parsed acceptance criterion. Turning a QC register into
 * that shape — group the results of one test across batches, insist the rows
 * agree on the criterion they were judged against, read the value out of the
 * `testResults` json — was written inline in the composer's §3.2.S.4.4 /
 * §3.2.P.5.4 renderer and existed nowhere else. So the indices a reviewer reads
 * in the compiled section could not be asked for anywhere: not over HTTP, not
 * by AnA, not before compiling.
 *
 * This is that assembly, extracted once. The composer renders what this
 * returns; the route and the AnA tool return it directly. There is one answer
 * to "is this process capable", and every surface gets it from here.
 *
 * ── What it refuses ──────────────────────────────────────────────────────────
 * Per test, in the section's own words, never as a silent omission:
 *   • rows recorded against DIFFERENT acceptance criteria — there is no single
 *     specification to measure against, and averaging two is not an answer;
 *   • whatever the engine itself refuses (fewer than six batches, an
 *     unparseable criterion, a series with no variation), carrying its code.
 * A test that could not be assessed is reported with its reason, so a series
 * with no indices is never mistaken for a series found capable.
 *
 * @module server/services/cmc/recorded-capability
 */
import { NON_BATCH_SAMPLE_TYPES, FINISHED_PRODUCT } from '../../../shared/cmc/qc-sample-types';
import { parseAcceptanceCriterion } from './recorded-stability';
import {
  assessProcessCapability,
  type ProcessCapabilityOutcome,
} from './process-capability';

/** The QC payload shape this reads — the canonical `qc_result` source payload. */
export interface RecordedQcResult {
  testMethod?: unknown;
  sampleType?: unknown;
  status?: unknown;
  isBatchAnalysis?: unknown;
  batchAnalysisSide?: unknown;
  batchNumber?: unknown;
  sampleId?: unknown;
  testResults?: unknown;
  specifications?: unknown;
}

export interface CapabilitySeries {
  /** The test method the series belongs to, as recorded. */
  test: string;
  /** How many rows of this test were on file, before any exclusion. */
  resultsOnFile: number;
  /** The acceptance criterion text every row of the series agreed on. */
  criterion: string | null;
  /** The engine's answer, or its refusal, or the criteria-disagreement refusal. */
  outcome: ProcessCapabilityOutcome;
}

/** How a batch is named in a report: its batch number, else its sample id. */
function batchOf(p: RecordedQcResult): string {
  return String(p?.batchNumber ?? '').trim() || String(p?.sampleId ?? '').trim() || '(no batch)';
}

/** The acceptance criterion a QC row was recorded against, '' when none was. */
function criterionOf(p: RecordedQcResult): string {
  const spec = p.specifications;
  if (typeof spec === 'string') return spec.trim();
  if (spec && typeof spec === 'object') {
    const criteria = (spec as Record<string, unknown>).acceptanceCriteria;
    if (typeof criteria === 'string') return criteria.trim();
  }
  return '';
}

/**
 * The numeric result of a QC row — `testResults.value`, or the scalar itself.
 *
 * An UNRECORDED result is NaN, never 0. `Number('')` is 0 and 0 is finite, so a
 * row saved before its result came back entered the series as a batch that
 * assayed zero: it moved the mean, inflated the standard deviation, and was
 * reported as a batch out of specification. The engine excludes a non-finite
 * value and names the batch, which is the honest treatment.
 */
function valueOf(p: RecordedQcResult): number {
  const r = p.testResults;
  const raw = r && typeof r === 'object' ? (r as Record<string, unknown>).value : r;
  const text = String(raw ?? '').trim();
  return text === '' ? Number.NaN : Number(text);
}

/**
 * One capability series per test method, in the order the tests first appear.
 * Rows with no test method are skipped: a series has to be a series of
 * something, and an unnamed one cannot be reported against a specification.
 */
export function assessRecordedCapability(results: RecordedQcResult[]): CapabilitySeries[] {
  const byTest = new Map<string, RecordedQcResult[]>();
  for (const p of results) {
    const test = String(p?.testMethod ?? '').trim();
    if (!test) continue;
    const list = byTest.get(test) ?? [];
    list.push(p);
    byTest.set(test, list);
  }

  const series: CapabilitySeries[] = [];
  for (const [test, rows] of byTest) {
    const criteria = [...new Set(rows.map(criterionOf).filter(Boolean))];
    if (criteria.length > 1) {
      series.push({
        test,
        resultsOnFile: rows.length,
        criterion: null,
        outcome: {
          ok: false,
          code: 'CRITERIA_DISAGREE',
          message:
            `the batches were recorded against different acceptance criteria (${criteria.join('; ')}), ` +
            'so there is no single specification to measure against',
          excludedBatches: [],
        },
      });
      continue;
    }
    /* A row that recorded NO criterion is not judged against its neighbours'.
       The unique-non-empty set silently absorbed it, so a batch tested to no
       stated specification was counted toward a capability index against
       limits it was never measured to — and, in the simulation's own data, was
       one of the six batches that got the series over the assessment floor. */
    const withoutCriterion = rows.filter((r) => !criterionOf(r));
    if (criteria.length === 1 && withoutCriterion.length > 0) {
      series.push({
        test,
        resultsOnFile: rows.length,
        criterion: criteria[0],
        outcome: {
          ok: false,
          code: 'CRITERION_NOT_RECORDED',
          message:
            `no acceptance criterion is recorded for ${withoutCriterion.length} of the ${rows.length} batches ` +
            `(${withoutCriterion.map(batchOf).join(', ')}), so they cannot be judged against the ` +
            `${criteria[0]} recorded for the others`,
          excludedBatches: withoutCriterion.map(batchOf),
        },
      });
      continue;
    }
    const points = rows.map((p) => ({ batch: batchOf(p), value: valueOf(p) }));
    series.push({
      test,
      resultsOnFile: rows.length,
      criterion: criteria[0] ?? null,
      outcome: assessProcessCapability(points, parseAcceptanceCriterion(criteria)),
    });
  }
  return series;
}

/** The one sentence a series is reported as, assessed or refused. */
export function capabilitySentence(s: CapabilitySeries): string {
  if (!s.outcome.ok) return `${s.test}: capability not assessed — ${s.outcome.message}.`;
  const a = s.outcome;
  const fmt = (v: number | null) => (v === null ? '—' : String(v));
  return (
    `${s.test}: over ${a.n} batches the mean is ${a.mean} (sd ${a.sdOverall}); ` +
    `Ppk ${fmt(a.ppk)}, Cpk ${fmt(a.cpk)}${a.pp !== null ? `, Pp ${fmt(a.pp)}` : ''} — ${a.verdict}` +
    (a.notes.length > 0 ? ` (${a.notes.join(' ')})` : '') + '.'
  );
}

/**
 * Whether a recorded QC result is BATCH ANALYSIS evidence for one side.
 *
 * The mapper's own decision (`batchAnalysisSide`) is authoritative; the
 * sample-type fallback keeps payloads written before that field existed
 * classified the same way. Reading only the sample type let a cleaning-
 * verification swab and a reference-standard qualification — records the
 * mapper had already refused as batch data — render as drug-substance batch
 * analyses while the section reported batchAnalyses missing.
 */
export function isBatchAnalysisFor(
  p: RecordedQcResult,
  side: 'drug_substance' | 'drug_product',
): boolean {
  const type = String(p?.sampleType ?? '').toLowerCase();
  /* A RETIRED record feeds nothing — the rule the composer applies to every
     source before a section reads it. The route and the tool read the project's
     qc_result rows directly, so without this they would report capability over
     a result the filed section excludes: the same computation over a different
     input set is still two answers. No qc_result payload carries a status
     today, so this changes nothing now and closes the divergence before it
     opens. */
  if (String((p as { status?: unknown })?.status ?? '').trim().toLowerCase() === 'retired') return false;
  if (p?.isBatchAnalysis === false) return false;
  if (NON_BATCH_SAMPLE_TYPES.includes(type)) return false;
  const decided = typeof p?.batchAnalysisSide === 'string' ? p.batchAnalysisSide : null;
  if (decided) return decided === side;
  return side === 'drug_product' ? type === FINISHED_PRODUCT : type !== FINISHED_PRODUCT;
}
