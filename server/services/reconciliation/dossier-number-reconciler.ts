/**
 * Dossier Number Reconciler
 *
 * The recurring reviewer finding the existing consistency checks do NOT catch:
 * the same quantity (enrolled N, primary-endpoint effect, dose, NOAEL …) is
 * reported with DIFFERENT values ACROSS a submission's documents — e.g. the
 * enrolled N in Module 2.5 ≠ Module 2.7.3 ≠ the CSR. `check_numerical_integrity`
 * catches this WITHIN one document; `check_dossier_consistency` compares a draft
 * pairwise against existing artifacts. Neither reconciles a set of already
 * extracted figures across the WHOLE dossier in one pass — that is this engine.
 *
 * Input is structured (figures already extracted upstream — by OCR, table
 * parsing, or the data-lineage citations), not raw prose, so this engine does
 * no text mining. It groups figures by `quantityKey`, detects values that
 * diverge beyond a configurable absolute/relative tolerance, and reports, per
 * key, the distinct values with their sources, a consensus (mode) when one
 * exists, and a severity.
 *
 * Pure, deterministic, synchronous — safe to call on every assembled dossier.
 * Reuses {@link DivergenceSeverity} from the cross-artifact-consistency service
 * so severities speak the same language across the consistency toolset.
 *
 * 2026-09-28 (row 74, track NC; ADR-0014 §7): nothing compared is no longer
 * 'clean'. A figure set in which no quantity is stated in two different
 * documents compared nothing across documents, yet reported 'clean' — for a
 * single figure, or for every figure from one document. It now reports verdict
 * 'not_assessed' with `notAssessedReason` ('no_shared_quantities'), and
 * `quantitiesCompared` counts the quantities that were compared. A conflict is
 * still reported wherever it is found, including inside one document. The
 * verdict is reconciliationVerdictFor (consistency-verdict.ts), which also
 * replaces this module's copy of the severity ladder; the verdicts are
 * DOSSIER_CONSISTENCY_VERDICTS. `noFiguresReport` is the report for a document
 * set that states no figure at all ('no_figures'), which the device reconciler
 * used to hand-build as 'clean'.
 *
 * 2026-09-28 (row 74, track NC review [4], [6]): a place is a document, or a
 * module of one document when the figures name their modules. A figure with no
 * module is its document, not a place of its own: the same figure emitted for
 * one document with its module and without it compared that document with
 * itself. `noFiguresReport` takes the device reconciler's count of current
 * documents, so a programme whose every document is superseded or withdrawn is
 * 'no_current_documents', not 'no_figures'.
 *
 * @module server/services/reconciliation/dossier-number-reconciler
 */

import type { DivergenceSeverity } from '../intelligence/cross-artifact-consistency.js';
import { reconciliationVerdictFor } from '../intelligence/consistency-verdict.js';
import type {
  DossierConsistencyVerdict,
  ReconciliationNotAssessedReason,
} from '../../../shared/ana/dossier-consistency.js';

export type { DivergenceSeverity };

/** Where a figure was found, for the reviewer to trace it back. */
export interface FigureSource {
  /** Originating document id (e.g. artifact id, file name). */
  readonly documentId: string;
  /** CTD module, when known (e.g. "2.5", "2.7.3"). */
  readonly module?: string;
  /** Section / table / heading within the document. */
  readonly section?: string;
  /** Character span or page/line locator within the source, for diffs. */
  readonly span?: string;
}

/** A single extracted number, attached to the quantity it measures. */
export interface ExtractedFigure {
  /**
   * Canonical key for the quantity this number measures, e.g. 'enrolled_n',
   * 'primary_endpoint_effect', 'dose_mg', 'noael'. Figures are reconciled
   * within a key — never across keys.
   */
  readonly quantityKey: string;
  /** The numeric value. */
  readonly value: number;
  /** Optional unit (%, mg, mg/kg …). Figures with mismatched units are flagged. */
  readonly unit?: string;
  /** Where this figure came from. */
  readonly source: FigureSource;
}

/** Tolerance within which two values are treated as agreeing. */
export interface ReconcileTolerance {
  /** Absolute tolerance: |a − b| ≤ absolute ⇒ agree. Default 0. */
  readonly absolute?: number;
  /** Relative tolerance: |a − b| / max(|a|,|b|) ≤ relative ⇒ agree. Default 0. */
  readonly relative?: number;
}

/** One distinct value within a quantity group, with the sources that report it. */
export interface ValueCluster {
  /** The representative (canonical) value of this cluster. */
  readonly value: number;
  /** Unit reported with this value, when present. */
  readonly unit?: string;
  /** Every source that reports a value in this cluster. */
  readonly sources: readonly FigureSource[];
  /** Number of figures in this cluster (== sources.length). */
  readonly count: number;
}

/** A reconciliation conflict for one quantity key. */
export interface ReconciliationConflict {
  readonly quantityKey: string;
  readonly severity: DivergenceSeverity;
  /** Distinct value clusters, ordered by descending support then ascending value. */
  readonly values: readonly ValueCluster[];
  /**
   * The consensus value — the cluster with the most supporting sources — when a
   * single strict plurality exists. Undefined when the top clusters tie.
   */
  readonly consensus?: number;
  /** True when ≥ 2 distinct units appear for the same quantity. */
  readonly unitMismatch: boolean;
  /** Human-readable summary of the divergence for the reviewer. */
  readonly description: string;
}

export interface ReconciliationReport {
  readonly figuresReconciled: number;
  readonly quantityKeysExamined: number;
  /**
   * Quantity keys stated in two places (two documents, or two modules of one
   * document), whose values were compared across them. 0 means no figure was
   * compared with another place's.
   */
  readonly quantitiesCompared: number;
  readonly conflictCount: number;
  readonly conflicts: readonly ReconciliationConflict[];
  /** 'not_assessed' when nothing was compared across documents: see `notAssessedReason`. */
  readonly verdict: DossierConsistencyVerdict;
  /** Why nothing was compared. */
  readonly notAssessedReason?: ReconciliationNotAssessedReason;
  readonly generatedAt: string;
}

/**
 * Severity for a quantity key. Mirrors the cross-artifact-consistency severity
 * map: sample size and dose-class quantities are RTF / patient-safety territory,
 * so a cross-module divergence there is critical. Unknown keys default to
 * 'medium'. Matching is by canonical key and by substring for common families.
 */
const SEVERITY_BY_KEY: Record<string, DivergenceSeverity> = {
  enrolled_n: 'critical',
  sample_size: 'critical',
  randomized_n: 'critical',
  analyzed_n: 'critical',
  dose_mg: 'critical',
  dose_kg: 'critical',
  noael: 'critical',
  mrsd: 'critical',
  primary_endpoint_effect: 'high',
  lsm_difference: 'high',
  mean_change: 'high',
  p_value: 'high',
  confidence_interval: 'high',
  hba1c_reduction: 'high',
  shelf_life: 'high',
  duration_weeks: 'medium',
  age_range: 'medium',
  batches: 'medium',
  // Device / IVD quantities — a performance-claim or predicate divergence across
  // the technical documentation / SE discussion / CER / IFU is a submission
  // blocker, so it ranks alongside the pharma RTF triggers.
  sensitivity: 'critical',
  specificity: 'critical',
  ppa: 'critical',
  npa: 'critical',
  lod: 'high',
  lob: 'high',
  loq: 'high',
  precision_cv: 'high',
  rpn: 'high',
};

function severityFor(quantityKey: string): DivergenceSeverity {
  const key = quantityKey.toLowerCase();
  if (key in SEVERITY_BY_KEY) return SEVERITY_BY_KEY[key];
  // Family fallbacks for keys not enumerated above.
  if (/(^|_)(n|sample|enroll|randomi[sz]|subjects?)($|_)/.test(key)) return 'critical';
  if (/dose|noael|loael|mrsd/.test(key)) return 'critical';
  if (/sensitivity|specificity|ppa|npa/.test(key)) return 'critical';
  if (/effect|p_?value|ci|mean|median|reduction|difference|lod|loq|cv|precision/.test(key)) return 'high';
  return 'medium';
}

/** Do two values agree within tolerance? Default tolerance ⇒ exact equality. */
function valuesAgree(a: number, b: number, tol: ReconcileTolerance): boolean {
  const absolute = tol.absolute ?? 0;
  const relative = tol.relative ?? 0;
  const diff = Math.abs(a - b);
  if (diff <= absolute) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (relative > 0 && scale > 0 && diff / scale <= relative) return true;
  return diff === 0;
}

/**
 * Cluster a group of figures sharing a quantityKey into agreement classes under
 * the given tolerance. A figure joins the first cluster whose representative it
 * agrees with; otherwise it seeds a new cluster. We sort the input by value
 * first so the result is independent of input order.
 */
function clusterFigures(
  figures: readonly ExtractedFigure[],
  tol: ReconcileTolerance,
): ValueCluster[] {
  const sorted = [...figures].sort((a, b) => a.value - b.value);
  const clusters: Array<{ value: number; unit?: string; sources: FigureSource[] }> = [];

  for (const fig of sorted) {
    const target = clusters.find(c => valuesAgree(c.value, fig.value, tol));
    if (target) {
      target.sources.push(fig.source);
      if (target.unit === undefined && fig.unit !== undefined) target.unit = fig.unit;
    } else {
      clusters.push({ value: fig.value, unit: fig.unit, sources: [fig.source] });
    }
  }

  return clusters
    .map(c => ({ value: c.value, unit: c.unit, sources: c.sources, count: c.sources.length }))
    .sort((a, b) => (b.count - a.count) || (a.value - b.value));
}

/** The consensus is the strict plurality cluster, or undefined on a tie. */
function consensusOf(clusters: readonly ValueCluster[]): number | undefined {
  if (clusters.length === 0) return undefined;
  const top = clusters[0];
  const tied = clusters.some((c, i) => i > 0 && c.count === top.count);
  return tied ? undefined : top.value;
}

function describeConflict(
  quantityKey: string,
  clusters: readonly ValueCluster[],
  consensus: number | undefined,
  unitMismatch: boolean,
): string {
  const rendered = clusters
    .map(c => {
      const where = c.sources
        .map(s => s.module ?? s.documentId)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .join(', ');
      return `${c.value}${c.unit ? ' ' + c.unit : ''} (${where})`;
    })
    .join('; ');
  const consensusNote =
    consensus !== undefined
      ? ` Consensus (plurality): ${consensus}.`
      : ' No plurality consensus (values tie).';
  const unitNote = unitMismatch ? ' UNIT MISMATCH across sources.' : '';
  return `"${quantityKey}" disagrees across the dossier: ${rendered}.${consensusNote}${unitNote}`;
}

/**
 * Is this quantity stated in two places, so its values were compared across
 * them? Two places are two documents, or two modules of one document. A figure
 * with no module is its document and adds no place of its own, so one
 * document's figure with and without its module is one place.
 */
function statedInTwoPlaces(group: readonly ExtractedFigure[]): boolean {
  if (new Set(group.map(f => f.source.documentId)).size > 1) return true;
  return new Set(group.map(f => f.source.module).filter((m): m is string => !!m)).size > 1;
}

/**
 * The report for a document set that states no figure: nothing was
 * reconciled, so the verdict is 'not_assessed', never 'clean' — 'no_figures',
 * or 'no_current_documents' when no current document was read at all.
 * reconcileDossierNumbers itself refuses an empty figure list as a parameter
 * error, because a caller that passes none has asked for nothing.
 */
export function noFiguresReport(documentsRead: number): ReconciliationReport {
  return {
    figuresReconciled: 0,
    quantityKeysExamined: 0,
    quantitiesCompared: 0,
    conflictCount: 0,
    conflicts: [],
    ...reconciliationVerdictFor({ conflicts: [], documentsRead, figures: 0, quantitiesCompared: 0 }),
    generatedAt: new Date().toISOString(),
  };
}

export interface ReconcileParams {
  readonly figures: readonly ExtractedFigure[];
  readonly tolerance?: ReconcileTolerance;
}

/**
 * Reconcile a set of extracted figures across a dossier's documents. Groups by
 * quantityKey, detects cross-source divergence beyond tolerance, and returns the
 * conflicts with their distinct values, sources, consensus, and severity.
 *
 * Throws a parameter-validation Error (message phrased so the AnA layer relays
 * it as needs_parameters) when figures are missing or malformed.
 */
export function reconcileDossierNumbers(params: ReconcileParams): ReconciliationReport {
  const figures = params?.figures;
  if (!Array.isArray(figures) || figures.length === 0) {
    throw new Error('figures[] is required and must contain at least one extracted figure.');
  }

  for (const [i, fig] of figures.entries()) {
    if (!fig || typeof fig !== 'object') {
      throw new Error(`figures[${i}] must be an object.`);
    }
    if (typeof fig.quantityKey !== 'string' || fig.quantityKey.trim() === '') {
      throw new Error(`figures[${i}].quantityKey is required and must be a non-empty string.`);
    }
    if (typeof fig.value !== 'number' || !Number.isFinite(fig.value)) {
      throw new Error(`figures[${i}].value is required and must be a finite number.`);
    }
    if (
      !fig.source ||
      typeof fig.source.documentId !== 'string' ||
      fig.source.documentId.trim() === ''
    ) {
      throw new Error(`figures[${i}].source.documentId is required and must be a non-empty string.`);
    }
  }

  const tol: ReconcileTolerance = {
    absolute: params.tolerance?.absolute ?? 0,
    relative: params.tolerance?.relative ?? 0,
  };
  if (tol.absolute! < 0 || tol.relative! < 0) {
    throw new Error('tolerance.absolute and tolerance.relative must be non-negative.');
  }

  // Group by quantityKey, preserving a stable key order (first appearance).
  const groups = new Map<string, ExtractedFigure[]>();
  for (const fig of figures) {
    const list = groups.get(fig.quantityKey) ?? [];
    list.push(fig);
    groups.set(fig.quantityKey, list);
  }

  const conflicts: ReconciliationConflict[] = [];
  for (const [quantityKey, group] of groups) {
    const clusters = clusterFigures(group, tol);
    const distinctUnits = new Set(
      group.map(f => f.unit).filter((u): u is string => typeof u === 'string'),
    );
    const unitMismatch = distinctUnits.size >= 2;

    // A conflict exists when the same quantity resolves to ≥ 2 agreement
    // clusters (values disagree beyond tolerance) OR units disagree.
    if (clusters.length < 2 && !unitMismatch) continue;

    const consensus = consensusOf(clusters);
    conflicts.push({
      quantityKey,
      severity: severityFor(quantityKey),
      values: clusters,
      consensus,
      unitMismatch,
      description: describeConflict(quantityKey, clusters, consensus, unitMismatch),
    });
  }

  // Order conflicts by severity (critical first) then key, for stable output.
  const severityRank: Record<DivergenceSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  conflicts.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      a.quantityKey.localeCompare(b.quantityKey),
  );

  const quantitiesCompared = Array.from(groups.values()).filter(statedInTwoPlaces).length;
  return {
    figuresReconciled: figures.length,
    quantityKeysExamined: groups.size,
    quantitiesCompared,
    conflictCount: conflicts.length,
    conflicts,
    ...reconciliationVerdictFor({ conflicts, figures: figures.length, quantitiesCompared }),
    generatedAt: new Date().toISOString(),
  };
}
