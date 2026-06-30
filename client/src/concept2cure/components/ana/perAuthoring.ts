/**
 * perAuthoring — E3: IVDR Performance Evaluation Report (PER) authoring + verification.
 *
 * The PER prose (IVDR Annex XIII: scientific validity, analytical performance,
 * clinical performance) has historically been hand-written in Word with no
 * guarantee the narrative matches the recorded performance numbers. This module
 * joins the already-built server tools —
 *
 *   - record_analytical_performance_study  (LoD/LoQ/precision/CV …)
 *   - record_clinical_performance_study    (sensitivity/specificity/PPV/NPV/AUC-ROC + 95% CI)
 *   - create_per_document                  (the PER record per Annex XIII)
 *
 * — to the author → verify loop so the generated PER narrative PROVABLY
 * reproduces the recorded data:
 *
 *   1. materializePerSections()      builds the Annex XIII section skeleton and
 *                                    injects the recorded numbers as prose.
 *   2. deriveRequiredStrings()       auto-populates verify_docx_against_source's
 *                                    `required_strings` with the EXACT recorded
 *                                    performance values (incl. their 95% CIs) so
 *                                    VerificationPanel catches any missing or
 *                                    mistyped figure before download.
 *   3. assertPerExportable()         the 21 CFR Part 11 / IVDR honesty contract:
 *                                    isSample / not_assessed PERs are never
 *                                    sealable/exportable, and the narrative must
 *                                    never state a performance number that is not
 *                                    present in the recorded study data.
 *
 * Pure + framework-agnostic so it is unit-testable in isolation and reusable by
 * both the AnA chat (server-driven tool calls) and the Document Studio UI.
 *
 * No new CORE tool is introduced — this is a join + derivation layer over the
 * existing tools. Live data joins are marked `// INTEGRATION:`; the point where
 * each regeneration would persist as an auditable version row is marked
 * `// BUILD-1 INTEGRATION:`.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Recorded-data shapes — mirror the columns the server tools persist
// (server/services/ana/AnaToolExecutor.ts: ivd_analytical_performance,
// ivd_clinical_performance, ivdr_per_documents).
// ─────────────────────────────────────────────────────────────────────────────

/** A row recorded by record_analytical_performance_study. */
export interface AnalyticalPerformanceStudy {
  study_type:
    | 'accuracy'
    | 'precision'
    | 'linearity'
    | 'limit_of_detection'
    | 'limit_of_quantitation'
    | 'analytical_specificity'
    | 'interference'
    | 'matrix_comparison'
    | 'reagent_stability'
    | 'sample_stability'
    | 'carryover';
  title: string;
  study_id?: string | null;
  acceptance_criterion?: string | null;
  result_summary?: string | null;
  pass_fail?: 'pass' | 'fail' | 'pending' | null;
  n_samples?: number | null;
  n_replicates?: number | null;
  analytes?: string[] | null;
  matrix_type?: string | null;
  /**
   * Structured recorded figures keyed by metric. Populated by the live study
   * record (LoD/LoQ in analyte units; precision/CV as a percentage). Only the
   * figures actually present here may appear in the narrative (honesty contract).
   */
  metrics?: AnalyticalMetric[];
}

/** A single recorded analytical figure (e.g. LoD = 0.42 IU/mL). */
export interface AnalyticalMetric {
  kind: 'lod' | 'loq' | 'precision_cv' | 'precision_sd' | 'bias';
  value: number;
  /** Unit string recorded with the figure (e.g. "IU/mL", "%"). */
  unit?: string | null;
  /** Optional analyte / level label this figure belongs to. */
  label?: string | null;
}

/** A row recorded by record_clinical_performance_study. */
export interface ClinicalPerformanceStudy {
  title: string;
  study_id?: string | null;
  intended_population?: string | null;
  comparator?: string | null;
  comparator_kind?: 'predicate' | 'clinical_truth' | 'composite' | 'follow_up' | null;
  total_subjects?: number | null;
  positive_n?: number | null;
  negative_n?: number | null;
  sensitivity_pct?: number | null;
  sensitivity_lower?: number | null;
  sensitivity_upper?: number | null;
  specificity_pct?: number | null;
  specificity_lower?: number | null;
  specificity_upper?: number | null;
  ppv_pct?: number | null;
  npv_pct?: number | null;
  prevalence_pct?: number | null;
  auc_roc?: number | null;
  pre_specified_endpoint_met?: boolean | null;
}

/** A row recorded by create_per_document. */
export interface PerDocument {
  device_name: string;
  per_version: string;
  per_status?: 'draft' | 'review' | 'approved' | 'superseded' | null;
  scientific_validity_done?: boolean | null;
  analytical_performance_done?: boolean | null;
  clinical_performance_done?: boolean | null;
  benefit_risk_conclusion?: string | null;
  author_name?: string | null;
  author_qualifications?: string | null;
  per_date?: string | null;
  /**
   * True when this PER (or any linked study) is built on sample/placeholder
   * data rather than a real recorded study. Sample PERs are never exportable.
   */
  isSample?: boolean;
}

/** The full data bundle the author/verify loop joins for a PER. */
export interface PerStudyBundle {
  per: PerDocument;
  analytical: AnalyticalPerformanceStudy[];
  clinical: ClinicalPerformanceStudy[];
  /** Scientific-validity sources (literature / consensus), free-text per IVDR. */
  scientificValiditySummary?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Number / 95% CI formatting — the canonical rendering. The SAME formatter is
// used to write the narrative AND to derive required_strings, so a figure can
// only verify if the prose reproduces it byte-for-byte.
// ─────────────────────────────────────────────────────────────────────────────

/** Trim a number to at most `maxDp` decimals without trailing-zero noise. */
function fmtNum(value: number, maxDp = 2): string {
  if (!Number.isFinite(value)) return '';
  // Round to maxDp, then drop trailing zeros (12.50 -> 12.5, 12.00 -> 12).
  const rounded = Number(value.toFixed(maxDp));
  return String(rounded);
}

/** Format a percentage figure, e.g. 96.4 -> "96.4%". */
export function formatPct(value: number, maxDp = 1): string {
  return `${fmtNum(value, maxDp)}%`;
}

/**
 * Format a metric value with its recorded unit, e.g. 0.42 / "IU/mL" ->
 * "0.42 IU/mL". A "%" unit is rendered with no space ("3.1%").
 */
export function formatWithUnit(value: number, unit?: string | null): string {
  const num = fmtNum(value, value < 1 ? 3 : 2);
  if (!unit) return num;
  return unit.trim() === '%' ? `${num}%` : `${num} ${unit.trim()}`;
}

/**
 * Canonical 95% CI rendering for a percentage point estimate:
 *   "96.4% (95% CI: 92.1–98.7%)"
 * Uses an en dash (–) between bounds — IVDR house style. When the bounds are
 * absent, falls back to the point estimate alone (no fabricated interval).
 */
export function formatPctWithCi(
  pointPct: number,
  lowerPct?: number | null,
  upperPct?: number | null,
  maxDp = 1,
): string {
  const point = formatPct(pointPct, maxDp);
  if (typeof lowerPct !== 'number' || typeof upperPct !== 'number') return point;
  return `${point} (95% CI: ${fmtNum(lowerPct, maxDp)}–${fmtNum(upperPct, maxDp)}%)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// required_strings derivation — the load-bearing honesty mechanism. Every
// recorded figure that the narrative cites becomes a verbatim required string.
// ─────────────────────────────────────────────────────────────────────────────

/** A required string + the figure it traces back to (for audit + UI). */
export interface RequiredString {
  value: string;
  /** Which study / metric this figure came from. */
  source: string;
}

const ANALYTICAL_METRIC_LABEL: Record<AnalyticalMetric['kind'], string> = {
  lod: 'Limit of detection (LoD)',
  loq: 'Limit of quantitation (LoQ)',
  precision_cv: 'Precision (CV)',
  precision_sd: 'Precision (SD)',
  bias: 'Bias',
};

/**
 * Derive the verbatim required_strings for verify_docx_against_source from the
 * recorded analytical + clinical study numbers — including the 95% CI strings.
 * The returned strings are EXACTLY what materializePerSections() writes into the
 * narrative, so verification fails the instant a figure is missing or mistyped.
 *
 * De-duplicated (a figure cited in two places needs to be present once) while
 * preserving first-seen order for stable, reviewer-readable output.
 */
export function deriveRequiredStrings(bundle: PerStudyBundle): RequiredString[] {
  const out: RequiredString[] = [];
  const seen = new Set<string>();
  const push = (value: string, source: string) => {
    const v = value.trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push({ value: v, source });
  };

  // Analytical performance — LoD / LoQ / precision (CV) / etc., with units.
  for (const study of bundle.analytical) {
    for (const m of study.metrics ?? []) {
      const label = ANALYTICAL_METRIC_LABEL[m.kind] ?? m.kind;
      const where = m.label ? `${study.title} — ${m.label}` : study.title;
      push(formatWithUnit(m.value, m.unit), `${label}: ${where}`);
    }
  }

  // Clinical performance — point estimate + 95% CI for each metric.
  for (const study of bundle.clinical) {
    if (typeof study.sensitivity_pct === 'number') {
      push(
        formatPctWithCi(study.sensitivity_pct, study.sensitivity_lower, study.sensitivity_upper),
        `Sensitivity: ${study.title}`,
      );
    }
    if (typeof study.specificity_pct === 'number') {
      push(
        formatPctWithCi(study.specificity_pct, study.specificity_lower, study.specificity_upper),
        `Specificity: ${study.title}`,
      );
    }
    if (typeof study.ppv_pct === 'number') {
      push(formatPct(study.ppv_pct), `PPV: ${study.title}`);
    }
    if (typeof study.npv_pct === 'number') {
      push(formatPct(study.npv_pct), `NPV: ${study.title}`);
    }
    if (typeof study.auc_roc === 'number') {
      // AUC-ROC is a 0–1 figure, rendered to 2–3 dp (e.g. "0.972").
      push(fmtNum(study.auc_roc, 3), `AUC-ROC: ${study.title}`);
    }
  }

  return out;
}

/** Convenience: the bare string list for the verify_docx_against_source call. */
export function requiredStringValues(bundle: PerStudyBundle): string[] {
  return deriveRequiredStrings(bundle).map(r => r.value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Annex XIII section skeleton + narrative materialization.
// ─────────────────────────────────────────────────────────────────────────────

/** The three pillars of an IVDR Annex XIII performance evaluation, in order. */
export const PER_SECTION_SKELETON = [
  { key: 'scientific_validity', heading: 'Scientific Validity' },
  { key: 'analytical_performance', heading: 'Analytical Performance' },
  { key: 'clinical_performance', heading: 'Clinical Performance' },
  { key: 'benefit_risk', heading: 'Benefit–Risk Conclusion' },
] as const;

export type PerSectionKey = (typeof PER_SECTION_SKELETON)[number]['key'];

export interface PerSection {
  key: PerSectionKey;
  heading: string;
  body: string;
}

/**
 * Is the skeleton complete — does it cover the three IVDR Annex XIII pillars
 * (scientific validity, analytical performance, clinical performance) plus the
 * benefit–risk conclusion? Used by the completeness test + the UI gate.
 */
export function isSkeletonComplete(sections: PerSection[]): boolean {
  const required: PerSectionKey[] = [
    'scientific_validity',
    'analytical_performance',
    'clinical_performance',
    'benefit_risk',
  ];
  const present = new Set(sections.map(s => s.key));
  return required.every(k => present.has(k));
}

function analyticalSectionBody(studies: AnalyticalPerformanceStudy[]): string {
  if (studies.length === 0) {
    // not_assessed — explicit, never a fabricated figure.
    return 'Analytical performance has not been assessed for this device. No analytical performance study has been recorded.';
  }
  const lines: string[] = [];
  for (const s of studies) {
    const parts: string[] = [`${s.title}`];
    if (s.acceptance_criterion) parts.push(`Acceptance criterion: ${s.acceptance_criterion}.`);
    for (const m of s.metrics ?? []) {
      const label = ANALYTICAL_METRIC_LABEL[m.kind] ?? m.kind;
      parts.push(`${label}: ${formatWithUnit(m.value, m.unit)}.`);
    }
    if (s.pass_fail) parts.push(`Outcome: ${s.pass_fail}.`);
    lines.push(parts.join(' '));
  }
  return lines.join('\n\n');
}

function clinicalSectionBody(studies: ClinicalPerformanceStudy[]): string {
  if (studies.length === 0) {
    return 'Clinical performance has not been assessed for this device. No clinical performance study has been recorded.';
  }
  const lines: string[] = [];
  for (const s of studies) {
    const parts: string[] = [`${s.title}.`];
    if (s.intended_population) parts.push(`Intended population: ${s.intended_population}.`);
    if (typeof s.total_subjects === 'number') parts.push(`A total of ${s.total_subjects} subjects were evaluated.`);
    if (typeof s.sensitivity_pct === 'number') {
      parts.push(
        `Diagnostic sensitivity was ${formatPctWithCi(
          s.sensitivity_pct,
          s.sensitivity_lower,
          s.sensitivity_upper,
        )}.`,
      );
    }
    if (typeof s.specificity_pct === 'number') {
      parts.push(
        `Diagnostic specificity was ${formatPctWithCi(
          s.specificity_pct,
          s.specificity_lower,
          s.specificity_upper,
        )}.`,
      );
    }
    if (typeof s.ppv_pct === 'number') parts.push(`Positive predictive value was ${formatPct(s.ppv_pct)}.`);
    if (typeof s.npv_pct === 'number') parts.push(`Negative predictive value was ${formatPct(s.npv_pct)}.`);
    if (typeof s.auc_roc === 'number') parts.push(`The area under the ROC curve was ${fmtNum(s.auc_roc, 3)}.`);
    lines.push(parts.join(' '));
  }
  return lines.join('\n\n');
}

/**
 * Materialize the Annex XIII section prose with the recorded numbers injected.
 * Every cited figure is rendered through the same formatters deriveRequiredStrings
 * uses, so the generated narrative is verifiable verbatim. Sections with no
 * recorded data render an explicit "has not been assessed" statement rather than
 * a fabricated figure.
 */
export function materializePerSections(bundle: PerStudyBundle): PerSection[] {
  const { per } = bundle;
  return [
    {
      key: 'scientific_validity',
      heading: 'Scientific Validity',
      body:
        bundle.scientificValiditySummary?.trim() ||
        `The scientific validity of the analyte measured by ${per.device_name} establishes the association of the analyte with the targeted clinical condition. ${
          per.scientific_validity_done
            ? 'A scientific validity report has been compiled from the available literature and consensus sources.'
            : 'Scientific validity has not yet been finalized for this device.'
        }`,
    },
    {
      key: 'analytical_performance',
      heading: 'Analytical Performance',
      body: analyticalSectionBody(bundle.analytical),
    },
    {
      key: 'clinical_performance',
      heading: 'Clinical Performance',
      body: clinicalSectionBody(bundle.clinical),
    },
    {
      key: 'benefit_risk',
      heading: 'Benefit–Risk Conclusion',
      body:
        per.benefit_risk_conclusion?.trim() ||
        'A benefit–risk conclusion has not yet been recorded for this device.',
    },
  ];
}

/**
 * Build the `replacements` map for build_from_template against the PER template
 * (the Annex XIII skeleton DOCX). Placeholders match perTemplate.ts.
 */
export function buildPerTemplateReplacements(bundle: PerStudyBundle): Record<string, string> {
  const sections = materializePerSections(bundle);
  const byKey = (k: PerSectionKey) => sections.find(s => s.key === k)?.body ?? '';
  const { per } = bundle;
  return {
    '{{DEVICE_NAME}}': per.device_name,
    '{{PER_VERSION}}': per.per_version,
    '{{PER_DATE}}': per.per_date ?? '',
    '{{AUTHOR_NAME}}': per.author_name ?? '',
    '{{AUTHOR_QUALIFICATIONS}}': per.author_qualifications ?? '',
    '{{SCIENTIFIC_VALIDITY}}': byKey('scientific_validity'),
    '{{ANALYTICAL_PERFORMANCE}}': byKey('analytical_performance'),
    '{{CLINICAL_PERFORMANCE}}': byKey('clinical_performance'),
    '{{BENEFIT_RISK}}': byKey('benefit_risk'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Honesty contract — 21 CFR Part 11 / IVDR. isSample / not_assessed PERs are
// never sealable/exportable, and the narrative must never state a number that
// is absent from the recorded study data.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportabilityVerdict {
  exportable: boolean;
  /** Human-readable, factual reasons the PER cannot be sealed/exported. */
  blockers: string[];
}

/**
 * Gate sealing/export of a PER. Blocks when:
 *   - the PER (or a linked study) is sample/placeholder data (isSample), or
 *   - any of the three Annex XIII pillars is not assessed (no recorded study),
 *     so the document would have to assert "not assessed" content as final, or
 *   - the narrative cites a performance figure that is NOT present in the
 *     recorded data (fabrication guard).
 *
 * Returns a verdict rather than throwing so the UI can render the blockers.
 */
export function assessPerExportability(
  bundle: PerStudyBundle,
  narrative?: string,
): ExportabilityVerdict {
  const blockers: string[] = [];

  if (bundle.per.isSample) {
    blockers.push('This PER is built on sample data and cannot be sealed or exported.');
  }
  if (bundle.analytical.length === 0) {
    blockers.push('Analytical performance has not been assessed — no analytical study is recorded.');
  }
  if (bundle.clinical.length === 0) {
    blockers.push('Clinical performance has not been assessed — no clinical study is recorded.');
  }
  if (!bundle.per.scientific_validity_done) {
    blockers.push('Scientific validity has not been finalized.');
  }

  // Fabrication guard: any performance figure asserted in the narrative that is
  // not among the recorded required strings is a blocker. We scan for the
  // canonical figure shapes (percentages and "(95% CI: …)" clauses) and require
  // each to be a recorded value.
  if (narrative) {
    const recorded = new Set(requiredStringValues(bundle));
    const ci = narrative.match(/\d[\d.]*% \(95% CI:[^)]*\)/g) ?? [];
    const barePct = narrative.match(/\d[\d.]*%/g) ?? [];
    const cited = new Set<string>([...ci, ...barePct]);
    // A bare "96.4%" inside a recorded CI string ("96.4% (95% CI: …)") is fine;
    // treat a citation as fabricated only when neither it nor a recorded string
    // containing it is present.
    for (const c of cited) {
      const ok = recorded.has(c) || [...recorded].some(r => r.includes(c));
      if (!ok) {
        blockers.push(`The narrative states "${c}", which is not present in the recorded study data.`);
      }
    }
  }

  return { exportable: blockers.length === 0, blockers };
}

/**
 * Throwing variant for server-side seal/export paths (parity with how other
 * governed exports assert before producing a sealed artifact).
 */
export function assertPerExportable(bundle: PerStudyBundle, narrative?: string): void {
  const verdict = assessPerExportability(bundle, narrative);
  if (!verdict.exportable) {
    throw new Error(`PER is not exportable: ${verdict.blockers.join(' ')}`);
  }
}

/**
 * The full author → verify plan for a PER: the template replacements, the
 * derived required_strings for verify_docx_against_source, the section
 * skeleton, and the exportability verdict. This is what the AnA tool-call
 * sequence / Document Studio consumes.
 *
 * // INTEGRATION: `bundle` is assembled from live record_analytical_performance_study /
 * // record_clinical_performance_study / create_per_document rows joined by
 * // program_id once the read route lands; until then callers pass fixtures.
 *
 * // BUILD-1 INTEGRATION: each call here that follows new study data being
 * // recorded should persist the regenerated PER as a new auditable version row
 * // (ivdr_per_documents history) so the regulatory trail shows which recorded
 * // figures each PER version reproduced.
 */
export interface PerAuthoringPlan {
  templatePlaceholders: Record<string, string>;
  requiredStrings: RequiredString[];
  sections: PerSection[];
  exportability: ExportabilityVerdict;
}

export function buildPerAuthoringPlan(bundle: PerStudyBundle): PerAuthoringPlan {
  const sections = materializePerSections(bundle);
  const narrative = sections.map(s => `${s.heading}\n\n${s.body}`).join('\n\n');
  return {
    templatePlaceholders: buildPerTemplateReplacements(bundle),
    requiredStrings: deriveRequiredStrings(bundle),
    sections,
    exportability: assessPerExportability(bundle, narrative),
  };
}
