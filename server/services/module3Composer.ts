import { createSourceHash } from './cmc-module3-compiler';
/* The ICH Q3A/Q3B comparison lives in services/cmc/impurity-assessment, which
   consumes the threshold tables in services/global-ri/impurities-thresholds.
   This composer renders the verdict; it does not restate the guideline. */
import { assessRecordedImpurity, isThresholdAssessment, parseDoseMg, type ImpurityAssessmentResult } from './cmc/impurity-assessment'
/* The recorded-stability readers and the acceptance-criterion parser: the
   stability verdict is a comparison of numbers to limits, and both live there
   already — one copy, used by the shelf-life engine and by this section. */
import {
  parseAcceptanceCriterion,
  parseNumeric,
  readRecordedStabilityResults,
} from './cmc/recorded-stability';
/* The dissolution purposes live in shared/, not in the write-through module:
   that module already imports FROM this composer, and importing back would make
   a cycle. One definition, reachable by both, and by the register surface. */
import {
  DISSOLUTION_DEVELOPMENT_PURPOSES,
  DISSOLUTION_RELEASE_PURPOSE,
} from '../../shared/cmc/dissolution-purpose';
import {
  normalizeMaterialScope,
  scopeCovers,
  type CmcMaterialScope,
} from '../../shared/cmc/material-scope';
import {
  CHARACTERIZATION_TYPE_FIELD,
  CHARACTERIZATION_TYPE_LABEL,
  normalizeCharacterizationType,
} from '../../shared/cmc/characterization-type';

export type CmcSourceType =
  | 'drug_substance'
  | 'drug_product'
  | 'specification'
  | 'method'
  | 'stability'
  | 'batch'
  | 'change_control'
  | 'comparability'
  | 'manufacturing_process'
  | 'characterization'
  | 'reference_standard'
  | 'container_closure'
  | 'excipient'
  | 'process_validation'
  | 'raw_material_spec'
  | 'impurity_profile'
  | 'dissolution_profile'
  | 'formulation_record'
  /* Batch-analyses evidence from the QC register. Distinct from 'batch', which
     is the executed manufacturing record (§3.2.P.3.4); this is the quantitative
     test result behind §3.2.S.4.4 / §3.2.P.5.4. Conflating them would file a
     manufacturing record where a results table belongs. */
  | 'qc_result';

export interface CanonicalSource {
  id: string;
  sourceType: CmcSourceType;
  sourcePayload: Record<string, any>;
  sourceHash?: string;
  /**
   * Optional tenant tag. When populated, callers that span a trust boundary
   * (e.g. `buildModule3WithNarrative`, which sends source payloads to an LLM)
   * should assert that all sources share the same `organizationId` /
   * `projectId` as the request context to prevent cross-tenant leakage.
   * Left optional so the deterministic composer remains usable by existing
   * tenant-agnostic callers (autoDraftModule3, e2e tests).
   */
  organizationId?: number | string;
  projectId?: number | string;
}

export interface ComposedSection {
  sectionKey: string;
  sectionPath: string;
  structuredPayload: Record<string, any>;
  narrativeDraft: string;
  tables: GeneratedTable[];
  completeness: number;
  missingInputs: string[];
  lineage: Array<{ sourceObjectId: string; sourceHashAtCompile: string }>;
}

export interface GeneratedTable {
  title: string;
  headers: string[];
  rows: string[][];
}

interface SectionRule {
  sectionKey: string;
  requiredSourceTypes: CmcSourceType[];
  requiredFields: string[];
}

export const MODULE3_SECTION_RULES: SectionRule[] = [
  // --- Drug Substance (S) subsections ---
  { sectionKey: '3.2.S.1', requiredSourceTypes: ['drug_substance'], requiredFields: ['name', 'manufacturer'] },
  { sectionKey: '3.2.S.2', requiredSourceTypes: ['drug_substance', 'manufacturing_process', 'process_validation', 'raw_material_spec'], requiredFields: ['manufacturingRoute', 'processDescription', 'processControls', 'manufacturingProcessComplete'] },
  { sectionKey: '3.2.S.3', requiredSourceTypes: ['drug_substance', 'characterization', 'impurity_profile'], requiredFields: ['structuralElucidation', 'physicochemicalProperties', 'biologicalActivity', 'drugSubstanceImpurityProfileComplete'] },
  /* `drugSubstanceBatchAnalyses`, not the generic `batchAnalyses`: the
     renderer files a finished-product result to §3.2.P.5.4 only, so counting
     it here turned this section green on a table it never renders. The QC
     mapper decides the side once and emits the matching key. */
  { sectionKey: '3.2.S.4', requiredSourceTypes: ['specification', 'method', 'impurity_profile', 'qc_result'], requiredFields: ['acceptanceCriteria', 'validationStatus', 'drugSubstanceBatchAnalyses', 'drugSubstanceImpurityProfileComplete'] },
  /* §3.2.S.3.2 and §3.2.P.5.5 ARE the impurity sections, so an impurity profile
     that can actually be compared to its ICH threshold is required for them:
     both sections could previously report 100% complete over zero impurity
     data. `*ImpurityProfileComplete` means one record carries a named impurity,
     a level WITH its unit, the maximum daily dose the threshold is keyed to,
     and a class Q3A/Q3B governs — i.e. the comparison the section exists to
     make can be made.

     Dissolution is deliberately NOT a required field anywhere. It is
     dosage-form specific: requiring it would mark every parenteral and every
     biologic programme permanently incomplete for lacking a test that does not
     apply to it. The sections state its absence in words instead, which is the
     honest half of the same fact. */
  /* The `*Complete` keys close the union hole. `availableFields` is a union
     over every matched source, so a register holding one system with a
     container and closure and ANOTHER system with a suitability justification
     satisfied all three keys and reported 100% — while the primary container,
     the one the section exists for, had no suitability statement at all. Each
     mapper emits its `*Complete` key only when ONE record carries the whole
     story, so the union cannot assemble a complete section out of incomplete
     records.

     Side-scoped, for the same reason 3.2.S.4 is: both container closure
     sections match EVERY container_closure source and both reference standard
     sections match every reference_standard source, so a drug-product blister
     would otherwise turn the drug-substance section green on a system that
     section never renders. The registers store which side a record is evidence
     for; the mapper emits the matching key; these rules read it. */
  { sectionKey: '3.2.S.5', requiredSourceTypes: ['drug_substance', 'reference_standard'], requiredFields: ['drugSubstanceReferenceStandard', 'drugSubstanceReferenceStandardCoA', 'drugSubstanceReferenceStandardComplete'] },
  { sectionKey: '3.2.S.6', requiredSourceTypes: ['container_closure'], requiredFields: ['drugSubstanceContainerDescription', 'drugSubstanceClosureDescription', 'drugSubstanceSuitabilityJustification', 'drugSubstanceContainerClosureComplete'] },
  { sectionKey: '3.2.S.7', requiredSourceTypes: ['stability'], requiredFields: ['timePoints', 'storageCondition'] },
  // --- Drug Product (P) subsections ---
  { sectionKey: '3.2.P.1', requiredSourceTypes: ['drug_product', 'formulation_record'], requiredFields: ['dosageFormDescription', 'composition', 'strength', 'formulationCompositionComplete'] },
  /* `characterization` is here because a drug-product characterisation study —
     a polymorph screen on the compressed tablet, say — is pharmaceutical
     development evidence. Without it, the register wrote such a study through to
     cmc_source_objects, the form and the register grid both told the staffer it
     filed under §3.2.P.2, and it reached no composed section at all. */
  { sectionKey: '3.2.P.2', requiredSourceTypes: ['drug_product', 'drug_substance', 'comparability', 'formulation_record', 'dissolution_profile', 'container_closure', 'characterization'], requiredFields: ['formulationDevelopment', 'manufacturingProcessDev', 'containerClosureStudies'] },
  { sectionKey: '3.2.P.3', requiredSourceTypes: ['drug_product', 'batch', 'change_control', 'process_validation', 'manufacturing_process'], requiredFields: ['formulation', 'batchNumber', 'drugProductProcessComplete'] },
  /* §3.2.P.4 is Control of EXCIPIENTS. `raw_material_spec` was listed here
     because this was the only rule that named it, so a drug-substance starting
     material rendered inside the drug product's excipient section while the
     register grid told the staffer it filed under §3.2.S.2.3. It belongs to
     §3.2.S.2 above. */
  { sectionKey: '3.2.P.4', requiredSourceTypes: ['excipient'], requiredFields: ['excipientSpecifications', 'excipientAnalyticalProcedures', 'excipientControlComplete'] },
  { sectionKey: '3.2.P.5', requiredSourceTypes: ['specification', 'method', 'dissolution_profile', 'impurity_profile', 'qc_result'], requiredFields: ['releaseCriteria', 'methodName', 'drugProductBatchAnalyses', 'drugProductImpurityProfileComplete'] },
  { sectionKey: '3.2.P.6', requiredSourceTypes: ['drug_product', 'reference_standard'], requiredFields: ['drugProductReferenceStandard', 'drugProductReferenceStandardCoA', 'drugProductReferenceStandardComplete'] },
  { sectionKey: '3.2.P.7', requiredSourceTypes: ['container_closure'], requiredFields: ['drugProductContainerDescription', 'drugProductClosureDescription', 'drugProductSuitabilityJustification', 'drugProductContainerClosureComplete'] },
  { sectionKey: '3.2.P.8', requiredSourceTypes: ['stability', 'comparability'], requiredFields: ['shelfLifeClaim', 'comparabilityStatus'] },
  // NOTE: Appendices (3.2.A.*) and Regional Information (3.2.R.*) are intentionally
  // NOT composed here. They are owned by module3-extensions.ts, which performs the
  // region-specific dispatch (US/EU/JP/CA). composeFullModule3() concatenates this
  // core composer (S/P + structural) with the extensions; defining A/R rules here as
  // well produced duplicate appendix leaves and region leakage in assembled eCTD
  // packages. Keep this composer scoped to S/P + 3.1/3.3 (single source of truth).
  // --- Structural support sections ---
  { sectionKey: '3.1', requiredSourceTypes: ['drug_substance', 'drug_product'], requiredFields: ['name', 'dosageFormDescription'] },
  { sectionKey: '3.3', requiredSourceTypes: ['drug_substance', 'drug_product', 'reference_standard'], requiredFields: ['name', 'dosageFormDescription'] },
];

/** The QC sample types that are NOT tests of the material: a cleaning swab
 *  belongs to GMP cleaning records, a reference-standard qualification to
 *  §3.2.S.5/§3.2.P.6. Neither is batch-analyses evidence. Shared with the
 *  write-through mapper so the completeness gate and the renderer apply ONE
 *  rule. */
export const NON_BATCH_SAMPLE_TYPES = ['cleaning-verification', 'reference-standard'];

/** The sample type that makes a QC result DRUG PRODUCT evidence (§3.2.P.5.4). */
export const FINISHED_PRODUCT = 'finished-product';

/* Which material a CMC record is evidence for. ONE rule, in shared/, because
   the register surfaces display the section a row files under and must never
   name a different one than the composer reaches. */

// ── Helpers ───────────────────────────────────────────────────────────────────

function val(sources: CanonicalSource[], field: string): string {
  for (const s of sources) {
    const v = s.sourcePayload?.[field];
    if (v !== undefined && v !== null && v !== '') return String(v);
  }
  return '';
}

function valObj(sources: CanonicalSource[], field: string): Record<string, any> | null {
  for (const s of sources) {
    const v = s.sourcePayload?.[field];
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  }
  return null;
}

function valArr(sources: CanonicalSource[], field: string): any[] {
  for (const s of sources) {
    const v = s.sourcePayload?.[field];
    if (Array.isArray(v)) return v;
  }
  return [];
}

/**
 * Deterministic stability outcome read from the matched stability source(s).
 *
 * A CMC filing must never assert "the substance/product is stable" unless the
 * recorded results establish it. This inspects the result-bearing fields of the
 * stability payload(s) and returns one of:
 *
 *   - `'concern'` — a negative signal is present (OOS, degradation, failure,
 *                   out-of-specification). The stability conclusion must be
 *                   deferred and the concern surfaced.
 *   - `'pass'`    — result data is present, carries a clear in-spec / pass
 *                   signal, and carries NO negative signal. Stability may be
 *                   asserted for the reported time points.
 *   - `'defer'`   — no result data, or data with neither a clear pass nor a
 *                   clear fail signal (e.g. ongoing). Defer the conclusion.
 *
 * When in doubt this returns `'defer'`: a passing stability conclusion is only
 * ever emitted on an explicit, unambiguous positive signal.
 */
type StabilityOutcome = 'pass' | 'concern' | 'defer';

/**
 * The recorded pull-point results, compared to the acceptance criterion each
 * one records.
 *
 * This is what a stability conclusion IS. readStabilitySignal below serialised
 * every result-shaped field into one string and ran two word regexes over it —
 * it never read a number and never compared one to a limit, so a study whose
 * `conclusion` said "meets its specification at all time points" composed as
 * conforming while its 12-month assay sat at 88.1% against 95.0 - 105.0 %.
 */
function assessRecordedStability(stabilitySources: CanonicalSource[]): {
  compared: number;
  outOfSpec: Array<{ parameter: string; timePoint: string; result: number; criterion: string }>;
  uncomparable: number;
} {
  const outOfSpec: Array<{ parameter: string; timePoint: string; result: number; criterion: string }> = [];
  let compared = 0;
  let uncomparable = 0;

  for (const s of stabilitySources) {
    const payload = (s.sourcePayload || {}) as Record<string, unknown>;
    const series = [
      ...readRecordedStabilityResults(payload.results),
      ...readRecordedStabilityResults(payload.stabilityData ?? payload.stability_data),
      ...readRecordedStabilityResults(payload.stabilityParameters),
    ];
    for (const point of series) {
      const value = parseNumeric(point.result);
      if (value === null) continue;
      const criterion = parseAcceptanceCriterion([
        point.specification,
        (point as Record<string, unknown>).acceptanceCriteria,
        payload.acceptanceCriteria,
        payload.releaseCriteria,
      ]);
      if (!criterion) { uncomparable += 1; continue; }
      compared += 1;
      /* A two-sided range fails on either side; a one-sided criterion fails on
         the side it names. `direction` says which way the attribute trends
         TOWARD its limit, so `increasing` means the limit is an upper bound. */
      const belowLower = criterion.direction === 'decreasing' && value < criterion.limit;
      const aboveUpper = criterion.direction === 'increasing' && value > criterion.limit;
      const aboveRange = criterion.twoSided && criterion.upperLimit !== null && value > criterion.upperLimit;
      if (belowLower || aboveUpper || aboveRange) {
        outOfSpec.push({
          parameter: String(point.parameter ?? 'the recorded attribute'),
          timePoint: String(point.timePoint ?? '—'),
          result: value,
          criterion: String(
            point.specification ??
              (point as Record<string, unknown>).acceptanceCriteria ??
              payload.acceptanceCriteria ??
              '',
          ).trim(),
        });
      }
    }
  }
  return { compared, outOfSpec, uncomparable };
}

/**
 * The stability conclusion a section may state, and the basis it rests on.
 *
 * The old wording said the results "remain within the acceptance criteria at
 * the reported time points" whenever a word regex found a positive-sounding
 * phrase anywhere on the payload. That is a claim about numbers, so it is made
 * from numbers or it is not made: a comparison names how many points were
 * compared, a failure names the point that failed, and a study whose results
 * carry no acceptance criterion gets neither verdict.
 */
function stabilityConclusion(
  sources: CanonicalSource[],
  material: 'drug substance' | 'drug product',
): string {
  const { compared, outOfSpec, uncomparable } = assessRecordedStability(sources);

  if (outOfSpec.length > 0) {
    const named = outOfSpec
      .slice(0, 4)
      .map((p) => `${p.parameter} at ${p.timePoint} = ${p.result}${p.criterion ? ` against ${p.criterion}` : ''}`)
      .join('; ');
    return (
      `${outOfSpec.length} of the ${compared} recorded result(s) compared here fall outside its recorded acceptance criterion ` +
      `(${named}${outOfSpec.length > 4 ? `; and ${outOfSpec.length - 4} more` : ''}). ` +
      `The stability conclusion and the proposed storage period are NOT established by this section.`
    );
  }
  if (compared > 0) {
    return (
      `All ${compared} recorded result(s) carrying an acceptance criterion are within their recorded acceptance criteria at the reported time points, ` +
      `supporting stability of the ${material} under the proposed storage conditions` +
      (uncomparable > 0
        ? `. A further ${uncomparable} recorded result(s) carry no acceptance criterion and were not compared.`
        : '.')
    );
  }
  if (uncomparable > 0) {
    return (
      `${uncomparable} recorded result(s) carry no recorded acceptance criterion, so whether they conform is NOT verified by this section. ` +
      `Any conclusion stated on the study is the applicant's and was not checked against the data here.`
    );
  }
  return `The stability conclusion and proposed storage period are subject to review of the stability results summarized above and are not asserted in this section.`;
}

function readStabilitySignal(stabilitySources: CanonicalSource[]): StabilityOutcome {
  /* The NUMBERS decide. The word regexes below survive only as the last resort
     for a study that records no comparable result at all, and the section says
     when that is the basis. */
  const measured = assessRecordedStability(stabilitySources);
  if (measured.outOfSpec.length > 0) return 'concern';
  if (measured.compared > 0) return 'pass';

  const NEG = /\b(oos|out[\s-]?of[\s-]?spec(?:ification)?|fail(?:ed|ing|ure)?|degrad\w*|non[\s-]?conform\w*|does not (?:meet|conform)|not within|exceed\w*|reject\w*|unstable)\b/i;
  const POS = /\b(pass(?:ed|ing)?|meets?|within (?:the )?(?:spec(?:ification)?|acceptance|limits?|criteria)|conform\w*|compl(?:ies|iant|y)|no significant change|satisfactory|in[\s-]?spec(?:ification)?)\b/i;

  const texts: string[] = [];
  const collect = (v: unknown, depth = 0): void => {
    if (v === undefined || v === null || depth > 5) return;
    if (typeof v === 'string') { if (v.trim()) texts.push(v); return; }
    if (typeof v === 'number' || typeof v === 'boolean') { texts.push(String(v)); return; }
    if (Array.isArray(v)) { for (const item of v) collect(item, depth + 1); return; }
    if (typeof v === 'object') {
      for (const inner of Object.values(v as Record<string, unknown>)) collect(inner, depth + 1);
    }
  };

  let sawResult = false;
  const RESULT_KEYS = [
    'status', 'conclusion', 'overallResult', 'stabilityConclusion',
    'result', 'results', 'stabilityParameters', 'stabilityData', 'stability_data',
  ];
  for (const s of stabilitySources) {
    const payload = s.sourcePayload || {};
    for (const key of RESULT_KEYS) {
      const v = payload[key];
      if (v !== undefined && v !== null && v !== '') {
        sawResult = true;
        collect(v);
      }
    }
  }

  if (!sawResult) return 'defer';
  const joined = texts.join(' | ');
  if (NEG.test(joined)) return 'concern';
  if (POS.test(joined)) return 'pass';
  return 'defer';
}

/**
 * The recorded QC results, as the batch-analyses table §3.2.S.4.4 / §3.2.P.5.4
 * exist to carry.
 *
 * qc_result sources gated these sections' completeness (`batchAnalyses`) and
 * were then NEVER rendered: the dashboard turned green on results the composed
 * document did not contain — the whole point of QC capture, absent from the
 * filing.
 *
 * Scoped by the sample type the register records, because it is the only thing
 * the record says about which material a result belongs to: a
 * 'finished-product' result is drug PRODUCT evidence and appears only in
 * §3.2.P.5.4; everything else appears in §3.2.S.4.4 carrying its own sample
 * type, so no row is ever presented as something it is not.
 */
function qcResultRows(
  sources: CanonicalSource[],
  side: 'drug_substance' | 'drug_product',
): Array<Record<string, any>> {
  return sources
    .filter((s) => s.sourceType === 'qc_result')
    .map((s) => (s.sourcePayload || {}) as Record<string, any>)
    .filter((p) => {
      const type = String(p.sampleType || '').toLowerCase();
      /* The SAME gate the QC mapper applied. Reading only the sample-type
         side let a cleaning-verification swab and a reference-standard
         qualification — records the mapper had already refused as batch
         data — render as drug-substance batch analyses while the section
         simultaneously reported batchAnalyses missing. `batchAnalysisSide`
         is the mapper's decision; the sample-type fallback keeps payloads
         written before it existed rendering correctly. */
      if (p.isBatchAnalysis === false) return false;
      if (NON_BATCH_SAMPLE_TYPES.includes(type)) return false;
      const decided = typeof p.batchAnalysisSide === 'string' ? p.batchAnalysisSide : null;
      if (decided) return decided === side;
      return side === 'drug_product' ? type === FINISHED_PRODUCT : type !== FINISHED_PRODUCT;
    });
}

/** One batch-analyses table from recorded QC results, or null when there are none. */
function batchAnalysesTable(
  sources: CanonicalSource[],
  side: 'drug_substance' | 'drug_product',
): GeneratedTable | null {
  const rows = qcResultRows(sources, side);
  if (rows.length === 0) return null;
  const resultText = (p: Record<string, any>): string => {
    const r = p.testResults;
    if (r == null) return '—';
    if (typeof r === 'string') return r;
    if (typeof r === 'object') {
      const value = [r.value, r.unit].filter((x) => x !== undefined && x !== null && x !== '').join(' ');
      // The observation carries what the number cannot (appearance, an OOS
      // trigger, a repeat) and is part of the result, not decoration.
      return [value, r.observation].filter(Boolean).join(' — ') || '—';
    }
    return String(r);
  };
  const criteriaText = (p: Record<string, any>): string => {
    const spec = p.specifications;
    if (spec == null) return '—';
    if (typeof spec === 'string') return spec;
    if (typeof spec === 'object' && typeof spec.acceptanceCriteria === 'string') {
      return spec.acceptanceCriteria || '—';
    }
    return '—';
  };
  return {
    title:
      side === 'drug_product'
        ? 'Batch Analyses — Drug Product (§3.2.P.5.4)'
        : 'Batch Analyses — Drug Substance (§3.2.S.4.4)',
    headers: ['Sample', 'Sample Type', 'Test Method', 'Acceptance Criteria', 'Result', 'Disposition', 'Reviewed'],
    rows: rows.map((p) => [
      String(p.sampleId || '—'),
      String(p.sampleType || '—'),
      String(p.testMethod || '—'),
      criteriaText(p),
      resultText(p),
      /* The RECORDED disposition and, where the numbers allow one, the
         computed one. A declared "pass" over a result its own criterion fails
         is stated as the contradiction it is rather than passed through. */
      (() => {
        const declared = String(p.passFailStatus || 'pending').toLowerCase();
        const verdict = qcResultVerdict(p);
        if (verdict === 'not-comparable') return declared;
        if (verdict === 'outside' && declared === 'pass') {
          return 'declared pass — the recorded result is OUTSIDE its recorded acceptance criterion';
        }
        if (verdict === 'within' && declared === 'fail') {
          return 'declared fail — the recorded result is within its recorded acceptance criterion';
        }
        return declared === 'pending' ? (verdict === 'outside' ? 'out of specification (computed)' : 'within criterion (computed)') : declared;
      })(),
      // §11 two-person review: an unreviewed result is not releasable
      // evidence, and a reader must be able to tell which it is looking at.
      p.reviewed ? 'reviewed' : 'not reviewed',
    ]),
  };
}

/**
 * Whether a recorded QC result actually meets its recorded acceptance criterion.
 *
 * `passFailStatus` is typed by whoever entered the result and nothing checked
 * it: a result of 3.4 % against a recorded criterion of "<= 2.0 %" submitted as
 * "pass" was written verbatim into the canonical source object and composed as
 * "1 conforming, 0 out of specification". A disposition in a dossier is a claim
 * about a number against a limit, so it is computed where both are recorded,
 * and the declared value is reported as the declaration it is.
 */
function qcResultVerdict(p: Record<string, any>): 'within' | 'outside' | 'not-comparable' {
  /* The result and the criterion as the QC mapper actually stores them — a
     `testResults: { value, unit, observation }` object and a `specifications:
     { acceptanceCriteria }` object — not the flat keys. Reading only the flat
     ones made every real record not-comparable, which is a silent no-op
     dressed as a refusal. */
  const results = p.testResults;
  const value = parseNumeric(
    results && typeof results === 'object' && !Array.isArray(results)
      ? (results as Record<string, unknown>).value
      : results ?? p.resultValue ?? p.result ?? p.testResult,
  );
  if (value === null) return 'not-comparable';
  const specs = p.specifications ?? p.specification;
  const criterion = parseAcceptanceCriterion([
    specs && typeof specs === 'object' && !Array.isArray(specs)
      ? (specs as Record<string, unknown>).acceptanceCriteria
      : specs,
    p.acceptanceCriteria,
    p.specificationLimit,
  ]);
  if (!criterion) return 'not-comparable';
  const belowLower = criterion.direction === 'decreasing' && value < criterion.limit;
  const aboveUpper = criterion.direction === 'increasing' && value > criterion.limit;
  const aboveRange = criterion.twoSided && criterion.upperLimit !== null && value > criterion.upperLimit;
  return belowLower || aboveUpper || aboveRange ? 'outside' : 'within';
}

/** A sentence about the recorded results, or '' when none were recorded. */
function batchAnalysesSentence(
  sources: CanonicalSource[],
  side: 'drug_substance' | 'drug_product',
): string {
  const rows = qcResultRows(sources, side);
  if (rows.length === 0) return '';
  /* Counted on the COMPUTED verdict where the record allows one. Counting the
     declared field said "1 conforming, 0 out of specification" over a result of
     3.4 % against a criterion of NMT 2.0 %. */
  const verdicts = rows.map((p) => ({ p, v: qcResultVerdict(p), declared: String(p.passFailStatus || '').toLowerCase() }));
  const comparable = verdicts.filter((x) => x.v !== 'not-comparable');
  const outside = comparable.filter((x) => x.v === 'outside');
  const contradicted = comparable.filter(
    (x) => (x.v === 'outside' && x.declared === 'pass') || (x.v === 'within' && x.declared === 'fail'),
  );
  const uncomparable = verdicts.filter((x) => x.v === 'not-comparable');
  const declaredPass = uncomparable.filter((x) => x.declared === 'pass').length;
  const declaredFail = uncomparable.filter((x) => x.declared === 'fail').length;
  const unreviewed = rows.filter((p) => !p.reviewed).length;
  return (
    `${rows.length} recorded QC result(s) are reported in the batch analyses table. ` +
    (comparable.length > 0
      ? `${comparable.length} carry both a numeric result and an acceptance criterion and were compared here: ` +
        `${comparable.length - outside.length} within criterion, ${outside.length} out of specification. `
      : '') +
    (uncomparable.length > 0
      ? `${uncomparable.length} record no numeric result or no acceptance criterion and were NOT compared; ` +
        `their recorded disposition (${declaredPass} pass, ${declaredFail} fail, ${uncomparable.length - declaredPass - declaredFail} pending) is the applicant's and is not verified by this section. `
      : '') +
    (contradicted.length > 0
      ? `${contradicted.length} recorded disposition(s) CONTRADICT the recorded result: ` +
        `${contradicted.map((x) => String(x.p.sampleId || 'an unnamed sample')).join(', ')}. That disagreement is not resolved by this section. `
      : '') +
    (outside.length > 0
      ? `Out-of-specification results are reported as recorded; their investigation and disposition are not asserted by this section. `
      : '') +
    (unreviewed > 0 ? `${unreviewed} result(s) have not completed second-person review. ` : '')
  );
}

/**
 * The controlled CMC changes behind a manufacturing section (§3.2.P.3 / ICH
 * Q12). The change register captured the change number, its assessed risk and
 * its filing category, the write-through carried them — and no section ever
 * rendered them, so the change history a reviewer asks for first existed only
 * as register rows.
 */
function changeHistoryTable(sources: CanonicalSource[]): GeneratedTable | null {
  const changes = sources
    .filter((s) => s.sourceType === 'change_control')
    .map((s) => (s.sourcePayload || {}) as Record<string, any>)
    .filter((p) => p.changeNumber || p.changeTitle || p.changeDescription);
  if (changes.length === 0) return null;
  return {
    title: 'Change History (ICH Q12)',
    headers: ['Change', 'Type', 'Description', 'Assessed Risk', 'Filing Category', 'Status', 'Implemented'],
    rows: changes.map((c) => [
      String(c.changeNumber || c.changeTitle || '—'),
      String(c.changeType || '—'),
      String(c.changeDescription || '—'),
      String(c.riskLevel || '—'),
      // The filing category is a REGULATORY classification the register
      // records; it is never inferred here from the change type.
      String(c.regulatoryFiling || 'not classified'),
      String(c.status || '—'),
      c.implementationDate ? String(c.implementationDate).slice(0, 10) : '—',
    ]),
  };
}

/**
 * The comparability assessments behind a post-change section (ICH Q5E). The
 * register captured what changed, the outcome and who reviewed it; only the
 * one-word status ever reached the document, so the rationale a reviewer
 * weighs was invisible.
 */
function comparabilityTable(sources: CanonicalSource[]): GeneratedTable | null {
  const rows = sources
    .filter((s) => s.sourceType === 'comparability')
    .map((s) => (s.sourcePayload || {}) as Record<string, any>)
    .filter((p) => p.assessmentName || p.changedElement || p.justification);
  if (rows.length === 0) return null;
  return {
    title: 'Comparability Assessments (ICH Q5E)',
    headers: ['Assessment', 'Changed Element', 'Change Type', 'Status', 'Outcome / Justification', 'Reviewed By'],
    rows: rows.map((c) => [
      String(c.assessmentName || '—'),
      String(c.changedElement || '—'),
      String(c.changeType || '—'),
      String(c.comparabilityStatus || c.status || '—'),
      String(c.justification || '—'),
      String(c.reviewedBy || '—'),
    ]),
  };
}

function kvTable(title: string, data: Record<string, any>): GeneratedTable {
  return {
    title,
    headers: ['Property', 'Value'],
    rows: Object.entries(data)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]),
  };
}

/** A stored date rendered as a day, or '' when nothing is recorded. */
function dayOf(v: unknown): string {
  if (v === undefined || v === null || v === '') return '';
  return String(v).slice(0, 10);
}

/** The payloads of one source type that are evidence for one side. */
function scopedPayloads(
  sources: CanonicalSource[],
  sourceType: CmcSourceType,
  side: 'drug_substance' | 'drug_product',
  fallback: CmcMaterialScope,
  scopeKey = 'scope',
): Array<Record<string, any>> {
  return sources
    .filter((s) => s.sourceType === sourceType)
    .map((s) => (s.sourcePayload || {}) as Record<string, any>)
    .filter((p) => scopeCovers(normalizeMaterialScope(p[scopeKey], fallback), side));
}

/** The rows of a json array field, ignoring anything that is not an object. */
function objectRows(v: unknown): Array<Record<string, any>> {
  if (!Array.isArray(v)) return [];
  return v.filter((r): r is Record<string, any> => Boolean(r) && typeof r === 'object' && !Array.isArray(r));
}

/**
 * §3.2.S.5 / §3.2.P.6 — the reference standards the material's results are
 * reported against.
 *
 * Both sections previously rendered one description and one CoA string read
 * from whichever source happened to carry them. The register records standards
 * as rows — code, type, lot, assigned value, characterisation, qualification —
 * so the section renders the file, and says plainly when the file is empty.
 *
 * Qualification is never inferred. A standard is reported as qualified only
 * when the register says its status is qualified; everything else is reported
 * with the status it actually carries.
 */
function referenceStandardSection(
  m: CanonicalSource[],
  side: 'drug_substance' | 'drug_product',
): { narrative: string; tables: GeneratedTable[] } {
  const material = side === 'drug_product' ? 'drug product' : 'drug substance';
  const suffix = side === 'drug_product' ? 'Drug Product' : 'Drug Substance';
  /* Unstated scope falls back to drug_substance, matching the register column's
     default: a standard is prepared from the substance far more often than not,
     and the fallback is only ever reached by a payload written without one. */
  const standards = scopedPayloads(m, 'reference_standard', side, 'drug_substance');

  if (standards.length === 0) {
    return {
      narrative:
        `No reference standard is recorded for the ${material}. The standard against which ` +
        `${material} test results are reported, and the qualification of that standard, are ` +
        `not established by this section.`,
      tables: [],
    };
  }

  const tables: GeneratedTable[] = [];
  tables.push({
    title: `Reference Standards — ${suffix}`,
    headers: ['Code', 'Standard', 'Type', 'Lot', 'Assigned Value', 'Prepared From', 'Certificate of Analysis', 'Storage', 'Retest / Expiry', 'Status', 'Qualified'],
    rows: standards.map((p) => [
      String(p.standardCode || '—'),
      String(p.standardName || '—'),
      String(p.standardType || '—'),
      String(p.lotNumber || '—'),
      String(p.assignedValue || '—'),
      String(p.materialSource || '—'),
      String(p.certificateOfAnalysis || '—'),
      String(p.storageConditions || '—'),
      dayOf(p.retestDate) || dayOf(p.expiryDate) || '—',
      String(p.status || 'draft'),
      // WHEN a standard was qualified is captured on the register and was read
      // by nothing; it is the date a reviewer checks the retest interval from.
      dayOf(p.qualificationDate) || '—',
    ]),
  });

  /* The characterisation data are what make a lot a STANDARD rather than just
     another lot, and are the first thing a reviewer asks a secondary standard
     for. Rows are attributed to the standard they belong to — never merged. */
  const charRows: string[][] = [];
  for (const p of standards) {
    for (const c of objectRows(p.characterization)) {
      charRows.push([
        String(p.standardCode || p.standardName || '—'),
        String(c.attribute || c.parameter || '—'),
        String(c.method || '—'),
        String(c.result ?? c.value ?? '—'),
      ]);
    }
  }
  if (charRows.length > 0) {
    tables.push({
      title: `Reference Standard Characterisation — ${suffix}`,
      headers: ['Standard', 'Attribute', 'Method', 'Result'],
      rows: charRows,
    });
  }

  const named = standards
    .map((p) => String(p.standardName || p.standardCode || '').trim())
    .filter(Boolean);
  const qualified = standards.filter((p) => String(p.status || '').toLowerCase() === 'qualified');
  const primary = standards.filter((p) => String(p.standardType || '').toLowerCase().includes('primary'));
  const withCoa = standards.filter((p) => String(p.certificateOfAnalysis || '').trim());
  const withProtocol = standards.filter((p) => String(p.qualificationProtocol || '').trim());

  const narrative =
    `${standards.length} reference standard(s) are recorded for the ${material}` +
    (named.length > 0 ? `: ${named.join(', ')}. ` : '. ') +
    (primary.length > 0
      ? `${primary.length} primary standard(s) are recorded. `
      : `No primary standard is recorded; the standard(s) above are not established as traceable to a primary standard by this section. `) +
    (qualified.length === standards.length
      ? `All recorded standards carry a qualified status in the reference standard register. `
      : `${qualified.length} of ${standards.length} recorded standard(s) carry a qualified status; the remainder are not established as qualified by this section. `) +
    (charRows.length > 0
      ? `Characterisation data are reported in the table above. `
      : `No characterisation data are recorded for these standards. `) +
    (withProtocol.length > 0
      ? `A qualification protocol is referenced for ${withProtocol.length} of ${standards.length} standard(s). `
      : '') +
    (withCoa.length === standards.length
      ? `A Certificate of Analysis is referenced for each standard. `
      : `A Certificate of Analysis is referenced for ${withCoa.length} of ${standards.length} standard(s). `);

  return { narrative, tables };
}

/**
 * §3.2.S.6 / §3.2.P.7 — the container closure system.
 *
 * FDA's container closure guidance judges a system on four criteria —
 * protection, compatibility, safety, performance — and the safety half of that
 * is the extractables and leachables package. Both were previously a single
 * free-text sentence. The register records the system, its materials of
 * construction, the compendial standards they are cited against, the E&L study
 * and the integrity testing, and this renders all of it.
 *
 * Suitability is never asserted here. The recorded justification is quoted as
 * what the applicant states; where none is recorded the section says the
 * suitability is not established rather than implying it.
 */
function containerClosureSection(
  m: CanonicalSource[],
  side: 'drug_substance' | 'drug_product',
): { narrative: string; tables: GeneratedTable[] } {
  const material = side === 'drug_product' ? 'drug product' : 'drug substance';
  const suffix = side === 'drug_product' ? 'Drug Product' : 'Drug Substance';
  /* Unstated scope falls back to drug_product, matching the register column's
     default (most recorded systems are the marketed presentation). */
  const systems = scopedPayloads(m, 'container_closure', side, 'drug_product');

  if (systems.length === 0) {
    return {
      narrative:
        `No container closure system is recorded for the ${material}. The container, the closure ` +
        `and their suitability for the intended use are not established by this section.`,
      tables: [],
    };
  }

  const label = (p: Record<string, any>): string =>
    String(p.systemName || p.containerDescription || 'Unnamed system');
  const listOf = (v: unknown): string =>
    Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean).join(', ') : String(v ?? '').trim();

  const tables: GeneratedTable[] = [];
  tables.push({
    title: `Container Closure System — ${suffix}`,
    headers: ['System', 'Component', 'Container', 'Closure', 'Supplier', 'Compendial Standards', 'Status', 'Qualified'],
    rows: systems.map((p) => [
      label(p),
      String(p.componentType || '—'),
      String(p.containerDescription || '—'),
      String(p.closureDescription || '—'),
      String(p.supplier || '—'),
      listOf(p.compendialStandards) || '—',
      String(p.status || 'draft'),
      dayOf(p.qualificationDate) || '—',
    ]),
  });

  const materialRows: string[][] = [];
  for (const p of systems) {
    for (const c of objectRows(p.materialsOfConstruction)) {
      materialRows.push([
        label(p),
        String(c.component || '—'),
        String(c.material || '—'),
        /* The system's supplier is NOT the component's. A materials line typed
           without a supplier cell degrades to an em dash like every other
           unrecorded cell, rather than attributing the vial maker's name to a
           stopper nobody said they made. */
        String(c.supplier || '—'),
        String(c.specification || '—'),
        String(c.compendialReference || c.compendialRef || '—'),
      ]);
    }
  }
  if (materialRows.length > 0) {
    tables.push({
      title: `Materials of Construction — ${suffix}`,
      headers: ['System', 'Component', 'Material', 'Supplier', 'Specification', 'Compendial Reference'],
      rows: materialRows,
    });
  }

  /* Extractables and leachables. A study with no per-analyte results is
     reported as a study DESIGN row — its presence is a fact, its results are
     not, and collapsing the two would present an unfinished study as data. */
  const elRows: string[][] = [];
  const elDesign: string[][] = [];
  /* A conclusion is only reported as supported when the study it belongs to
     actually carries per-analyte results. A record can carry the sentence "all
     extractables below the threshold" with no measurement behind it, and
     counting that with the supported ones would credit a study the table on the
     same page reports as having no results. */
  let elConclusions = 0;
  let elUnsupportedConclusions = 0;
  for (const p of systems) {
    const el = p.extractablesLeachables;
    if (!el || typeof el !== 'object' || Array.isArray(el)) continue;
    const study = el as Record<string, any>;
    const hasConclusion = Boolean(String(study.conclusion || '').trim());
    const results = objectRows(study.results);
    if (hasConclusion) {
      if (results.length > 0) elConclusions += 1;
      else elUnsupportedConclusions += 1;
    }
    if (results.length === 0) {
      elDesign.push([
        label(p),
        String(study.studyType || '—'),
        String(study.protocol || '—'),
        String(study.conditions || '—'),
        String(study.analyticalEvaluationThreshold || study.aet || '—'),
        'no per-analyte results recorded',
      ]);
      continue;
    }
    for (const r of results) {
      const level = [r.level, r.unit].filter((x) => x !== undefined && x !== null && x !== '').join(' ');
      elRows.push([
        label(p),
        String(study.studyType || '—'),
        String(r.analyte || '—'),
        level || '—',
        String(r.threshold ?? study.analyticalEvaluationThreshold ?? study.aet ?? '—'),
        String(r.assessment || '—'),
      ]);
    }
  }
  if (elRows.length > 0) {
    tables.push({
      title: `Extractables and Leachables — ${suffix}`,
      headers: ['System', 'Study', 'Analyte', 'Level', 'Threshold', 'Assessment'],
      rows: elRows,
    });
  }
  if (elDesign.length > 0) {
    tables.push({
      title: `Extractables and Leachables Studies — ${suffix}`,
      headers: ['System', 'Study', 'Protocol', 'Conditions', 'Threshold', 'Results'],
      rows: elDesign,
    });
  }

  const integrityRows: string[][] = [];
  for (const p of systems) {
    const it = p.integrityTesting;
    if (!it || typeof it !== 'object' || Array.isArray(it)) continue;
    const t = it as Record<string, any>;
    if (!String(t.method || t.acceptanceCriteria || t.result || '').trim()) continue;
    integrityRows.push([
      label(p),
      String(t.method || '—'),
      String(t.acceptanceCriteria || '—'),
      String(t.result || '—'),
      dayOf(t.testDate) || '—',
    ]);
  }
  if (integrityRows.length > 0) {
    tables.push({
      title: `Container Closure Integrity — ${suffix}`,
      headers: ['System', 'Method', 'Acceptance Criteria', 'Result', 'Tested'],
      rows: integrityRows,
    });
  }

  const justified = systems.filter((p) => String(p.suitabilityJustification || '').trim());
  const compendial = systems.filter((p) => listOf(p.compendialStandards));
  const elStudies = systems.filter((p) => {
    const el = p.extractablesLeachables;
    return Boolean(el) && typeof el === 'object' && !Array.isArray(el);
  });

  const head =
    systems.length === 1
      ? `The container closure system for the ${material} is ${label(systems[0])}: ` +
        `${String(systems[0].containerDescription || '[container not recorded]')} with ` +
        `${String(systems[0].closureDescription || '[closure not recorded]')}. `
      : `${systems.length} container closure systems are recorded for the ${material}: ` +
        `${systems.map(label).join(', ')}. `;

  const narrative =
    head +
    (materialRows.length > 0
      ? `Materials of construction are reported in the table above. `
      : `Materials of construction are not recorded for ${systems.length === 1 ? 'this system' : 'these systems'}. `) +
    (compendial.length > 0
      ? `Compendial standards cited: ${Array.from(new Set(systems.flatMap((p) => (Array.isArray(p.compendialStandards) ? p.compendialStandards : [])).map((x) => String(x).trim()).filter(Boolean))).join(', ')}. `
      : `No compendial standard is cited for the materials of construction. `) +
    (justified.length > 0
      ? `Suitability justification recorded by the applicant: ${justified.map((p) => `${label(p)} — ${String(p.suitabilityJustification).trim()}`).join('; ')}. ` +
        (justified.length < systems.length
          ? `${systems.length - justified.length} recorded system(s) carry no suitability justification. `
          : '')
      : `No suitability justification is recorded; the suitability of the container closure system for its intended use is not established by this section. `) +
    (elStudies.length > 0
      ? `Extractables and leachables data are reported as recorded for ${elStudies.length} of ${systems.length} system(s)` +
        (elConclusions > 0
          ? `, of which ${elConclusions} carry a study conclusion supported by the per-analyte results reported above. `
          : `; no study conclusion supported by per-analyte results is recorded, and the safety assessment of leachables is not asserted by this section. `) +
        (elUnsupportedConclusions > 0
          ? `${elUnsupportedConclusions} recorded conclusion(s) have no per-analyte results in this section and are not established by it. `
          : '')
      : `No extractables and leachables study is recorded; the safety of the materials of construction is not established by this section. `) +
    (integrityRows.length > 0
      ? `Container closure integrity testing is reported in the table above. `
      : `No container closure integrity testing is recorded. `);

  return { narrative, tables };
}

/* ── Impurities (§3.2.S.3.2 / §3.2.P.5.5) ──────────────────────────────────────
 *
 * Every impurity_profile source for one side, assessed against the ICH
 * threshold that governs it. The register holds ONE ROW PER IMPURITY, so these
 * collect across sources: a first-match `valArr(m, 'impurities')` read renders
 * exactly one impurity out of a register of twelve and silently drops the rest.
 *
 * The level is rendered in the unit it was RECORDED in. The previous table
 * appended a percent sign to whatever number was in the field, so a residual
 * solvent recorded in ppm printed as a percentage — a twenty-thousand-fold
 * overstatement in a filing.
 */
function impurityRows(
  sources: CanonicalSource[],
  side: 'drug_substance' | 'drug_product',
): Array<Record<string, any>> {
  return scopedPayloads(sources, 'impurity_profile', side, 'drug_substance')
    .filter((p) => String(p.impurityName || '').trim())
    /* A retired record is superseded, not current. Composing it as part of the
       impurity profile would present withdrawn data as the filing's own. */
    .filter((p) => String(p.status || '').toLowerCase() !== 'retired');
}

/**
 * A threshold as the guideline words it, with the limit that actually governs
 * at this dose. The wording alone reads as the verdict's basis, so a level of
 * 0.08% came out as "above 0.10% or 1.0 mg/day (whichever is lower)" — two
 * numbers, neither of them the one the comparison used.
 */
function thresholdText(t: { expression: string; effectivePercent: number; governing: string }): string {
  const resolved = `${Number(t.effectivePercent.toFixed(4))}%`;
  return t.governing === 'absolute' || !t.expression.startsWith(resolved)
    ? `${resolved}; ${t.expression}`
    : t.expression;
}

/** The level as recorded, never re-unitised and never given a unit it lacks. */
function impurityLevelText(p: Record<string, any>): string {
  const level = String(p.observedLevel ?? '').trim();
  if (!level) return '—';
  const unit = String(p.levelUnit ?? '').trim();
  return unit ? `${level} ${unit}` : `${level} (unit not recorded)`;
}

interface ImpurityRendering {
  tables: GeneratedTable[];
  narrative: string;
  /** Impurities at or above the reporting threshold — what the section reports. */
  reportedCount: number;
}

function impurityRendering(
  sources: CanonicalSource[],
  side: 'drug_substance' | 'drug_product',
): ImpurityRendering {
  const rows = impurityRows(sources, side);
  const material = side === 'drug_product' ? 'drug product' : 'drug substance';
  const suffix = side === 'drug_product' ? 'Drug Product' : 'Drug Substance';
  if (rows.length === 0) {
    return {
      tables: [],
      narrative: `No impurity is recorded for the ${material}; the impurity profile is not established by this section. `,
      reportedCount: 0,
    };
  }

  const assessed = rows.map((p) => ({ p, a: assessRecordedImpurity(p, side) }));
  /* The Q3A/Q3B population: only these carry the reporting/identification/
     qualification vocabulary. A solvent and an elemental impurity ARE assessed,
     against their own guideline's single limit, and are counted separately —
     folding them into `reported` would state them as above a Q3A reporting
     threshold that was never applied to them. */
  const thresholdAssessed = assessed.filter((x) => isThresholdAssessment(x.a));
  const reported = thresholdAssessed.filter((x) => isThresholdAssessment(x.a) && x.a.disposition !== 'below-reporting');
  const belowReporting = thresholdAssessed.filter((x) => isThresholdAssessment(x.a) && x.a.disposition === 'below-reporting');
  const solventAssessed = assessed.filter((x) => x.a.ok && x.a.basis === 'ICH Q3C(R8)');
  const elementalAssessed = assessed.filter((x) => x.a.ok && x.a.basis === 'ICH Q3D(R2)');
  /* Refusals are carried with their reason: an impurity the product cannot
     compare to a threshold is stated as such, never dropped and never reported
     as if it had cleared one. */
  const unassessable = assessed
    .map((x) => x.a)
    .filter((a): a is Extract<ImpurityAssessmentResult, { ok: false }> => !a.ok);

  const tables: GeneratedTable[] = [];
  tables.push({
    title: `Impurity Profile — ${suffix}`,
    headers: ['Impurity', 'Class', 'Origin', 'RRT', 'Method', 'Observed Level', 'Specification Limit', 'ICH Disposition', 'Structure', 'Qualification Basis'],
    rows: assessed.map(({ p, a }) => [
      String(p.impurityName),
      String(p.impurityType || '—'),
      String(p.origin || '—'),
      String(p.relativeRetentionTime || '—'),
      String(p.analyticalMethod || '—'),
      impurityLevelText(p),
      String(p.specificationLimit || '—'),
      /* A solvent and an elemental impurity are judged against ONE limit from
         their own guideline; the three-threshold vocabulary is Q3A/Q3B's. */
      !a.ok
        ? `not assessable — ${a.message}`
        : a.basis === 'ICH Q3C(R8)'
          ? a.disposition === 'class-1-avoid'
            ? `ICH Q3C Class 1 — to be avoided (limit ${a.limitPpm} ppm)`
            : a.withinLimit
              ? `within the ICH Q3C Class ${a.solventClass} limit (${a.limitPpm} ppm)`
              : `above the ICH Q3C Class ${a.solventClass} limit (${a.limitPpm} ppm)`
          : a.basis === 'ICH Q3D(R2)'
            ? a.withinLimit
              ? `within the ICH Q3D ${a.elementClass} PDE (${a.pdeMicrogramsPerDay} µg/day, ${a.route})`
              : `above the ICH Q3D ${a.elementClass} PDE (${a.pdeMicrogramsPerDay} µg/day, ${a.route})`
            : a.disposition === 'below-reporting'
              ? `not above the reporting threshold (${thresholdText(a.thresholds.reporting)})`
              : a.disposition === 'reportable'
                ? `reportable (above ${thresholdText(a.thresholds.reporting)})`
                : a.disposition === 'above-identification'
                  ? `above the identification threshold (${thresholdText(a.thresholds.identification)})`
                  : `above the qualification threshold (${thresholdText(a.thresholds.qualification)})`,
      String(p.structure || p.molecularFormula || '—'),
      String(p.qualificationBasis || '—'),
    ]),
  });

  /* The threshold basis, stated ONCE with the dose it is keyed to. A threshold
     printed without its maximum daily dose is unverifiable, and the doses
     recorded across a register can disagree — which is a finding, not something
     to average away. */
  /* Compared as doses, not as spellings: "500 mg" and "0.5 g" are the same
     dose, and reporting them as a disagreement put a defect in the dossier that
     the register does not contain. An unparseable dose keeps its raw text so it
     is still visible as different. */
  const doseTexts = rows.map((p) => String(p.maximumDailyDose || '').trim()).filter(Boolean);
  const doseKeys = new Map<string, string>();
  for (const text of doseTexts) {
    const parsed = parseDoseMg(text);
    doseKeys.set(parsed.ok ? `mg:${parsed.mg}` : `raw:${text.toLowerCase()}`, text);
  }
  const doses = Array.from(doseKeys.values());
  /* The Q3A/Q3B threshold basis, which only a Q3A/Q3B assessment has: a
     solvent and an elemental impurity are judged against one limit from their
     own guideline and carry no dose-keyed threshold triple. */
  const firstOk = assessed.find((x) => isThresholdAssessment(x.a));
  if (firstOk && isThresholdAssessment(firstOk.a) && doses.length === 1) {
    tables.push(
      kvTable(`ICH Threshold Basis — ${suffix}`, {
        'Maximum Daily Dose': doses[0],
        'Reporting Threshold': firstOk.a.thresholds.reporting.expression,
        'Identification Threshold': firstOk.a.thresholds.identification.expression,
        'Qualification Threshold': firstOk.a.thresholds.qualification.expression,
        Citation: firstOk.a.citation,
      }),
    );
  }

  const outstanding = assessed.flatMap(({ p, a }) =>
    a.ok ? a.outstanding.map((o) => `${String(p.impurityName)} is ${o}`) : [],
  );

  /* "None is above the reporting threshold" is a CLAIM about every recorded
     impurity, and it is only true of the ones that were actually compared to a
     threshold. Asserted over a register whose impurities were all refused —
     no dose, no unit, an out-of-scope class — it stated the opposite of the
     truth: nothing had been compared to anything. It is made only over the
     assessed set, and only when there is one. */
  const assessedCount = reported.length + belowReporting.length;
  const guidelineAssessedCount = assessedCount + solventAssessed.length + elementalAssessed.length;
  let narrative =
    `${rows.length} impurity/ies are recorded for the ${material}. ` +
    (guidelineAssessedCount === 0
      ? `None has been compared to an ICH threshold, so their disposition is not established by this section. `
      : assessedCount === 0
        ? ''
        : reported.length > 0
          ? `Of the ${assessedCount} compared to an ICH Q3A/Q3B threshold, ${reported.length} are above the reporting threshold and are reported above. `
          : `None of the ${assessedCount} compared to an ICH Q3A/Q3B threshold is above it. `) +
    (belowReporting.length > 0
      ? `${belowReporting.length} are below the reporting threshold and are not reported as impurities of the ${material}. `
      : '') +
    /* Solvents and elemental impurities, counted under the guideline that
       actually governs them rather than folded into the Q3A/Q3B tally. */
    (solventAssessed.length > 0
      ? `${solventAssessed.length} residual solvent(s) are assessed against ICH Q3C(R8)` +
        (() => {
          const over = solventAssessed.filter((x) => x.a.ok && x.a.basis === 'ICH Q3C(R8)' && !x.a.withinLimit).length;
          const class1 = solventAssessed.filter((x) => x.a.ok && x.a.basis === 'ICH Q3C(R8)' && x.a.solventClass === 1).length;
          const clauses: string[] = [];
          if (over > 0) clauses.push(`${over} above its concentration limit`);
          if (class1 > 0) clauses.push(`${class1} of Class 1, which the guideline says should not be used`);
          return clauses.length > 0 ? `: ${clauses.join('; ')}. ` : `, each within its concentration limit. `;
        })()
      : '') +
    (elementalAssessed.length > 0
      ? `${elementalAssessed.length} elemental impurity/ies are assessed against ICH Q3D(R2)` +
        (() => {
          const over = elementalAssessed.filter((x) => x.a.ok && x.a.basis === 'ICH Q3D(R2)' && !x.a.withinLimit).length;
          return over > 0 ? `: ${over} above the permitted daily exposure for the recorded route. ` : `, each within the permitted daily exposure for its recorded route. `;
        })()
      : '');
  const needsDose = rows.length > solventAssessed.length + elementalAssessed.length;
  if (doses.length === 0 && needsDose) {
    narrative +=
      `No maximum daily dose is recorded, so no ICH Q3A/Q3B threshold can be keyed to these levels and their disposition is not established by this section. `;
  } else if (doses.length > 1) {
    narrative +=
      `The recorded maximum daily doses disagree (${doses.join('; ')}), so the applicable thresholds are not established by this section. `;
  }
  if (unassessable.length > 0) {
    narrative +=
      `${unassessable.length} recorded impurity/ies cannot be compared to a threshold: ` +
      `${unassessable
        .map((a) => `${a.impurityName} — ${a.message}${a.routeTo ? ` (governed instead by ${a.routeTo})` : ''}`)
        .join('; ')} `;
  }
  /* Where the applicant recorded its OWN thresholds and they differ from the
     guideline's, the disagreement is stated. The register captured them, the
     mapper carried them, and nothing rendered them — so a record contradicting
     ICH was silently replaced by ICH in the composed section. */
  const contradicting = assessed.filter((x) => isThresholdAssessment(x.a) && x.a.recordedThresholdDiffers);
  if (contradicting.length > 0) {
    narrative +=
      `${contradicting.length} record(s) state thresholds that differ from the ICH values applied above ` +
      `(${contradicting.map((x) => String(x.p.impurityName)).join(', ')}); the recorded values are reported in the table and the difference is not resolved by this section. `;
  }
  if (outstanding.length > 0) {
    narrative += `Outstanding against ICH: ${outstanding.join('; ')}. `;
  }
  /* A total is only ever stated over a complete, assessed set. Summing whatever
     rows happen to be in the register would present a partial file as the
     product's total impurity content. */
  narrative +=
    `A total impurity figure is not stated here; it is a specification test reported with the batch analyses. `;

  return { tables, narrative, reportedCount: reported.length };
}

/* ── Dissolution (§3.2.P.2 / §3.2.P.5) ─────────────────────────────────────────
 *
 * Purpose-scoped. §3.2.P.2 carries the profiles the method was developed and
 * compared on; §3.2.P.5 carries the profile the release acceptance criterion is
 * judged against. Both sections previously read the same four generic keys
 * through first-match helpers, so one record rendered identically into both and
 * four different records could each supply one row of a table presented as a
 * single test.
 */
function dissolutionProfilesFor(
  sources: CanonicalSource[],
  purposes: string[],
): Array<Record<string, any>> {
  return sources
    .filter((s) => s.sourceType === 'dissolution_profile')
    .map((s) => (s.sourcePayload || {}) as Record<string, any>)
    .filter((p) => purposes.includes(String(p.purpose || 'development')))
    // A retired profile is superseded, not current. See impurityRows.
    .filter((p) => String(p.status || '').toLowerCase() !== 'retired');
}

/** One profile's per-timepoint rows, or [] when it holds no usable point. */
function profilePoints(p: Record<string, any>): Array<Record<string, any>> {
  const pts = p.dissolutionResults;
  if (!Array.isArray(pts)) return [];
  return pts.filter((r) => r && typeof r === 'object');
}

function dissolutionRendering(
  sources: CanonicalSource[],
  purposes: string[],
  label: string,
): { tables: GeneratedTable[]; narrative: string } {
  const profiles = dissolutionProfilesFor(sources, purposes);
  if (profiles.length === 0) {
    return {
      tables: [],
      narrative: `No ${label} dissolution profile is recorded. `,
    };
  }
  const tables: GeneratedTable[] = [];
  tables.push({
    title: `Dissolution Method — ${label}`,
    headers: ['Batch', 'Strength', 'Apparatus', 'Speed', 'Medium', 'Volume', 'Temperature', 'Sinker', 'Units Tested', 'Acceptance Criterion', 'Tested'],
    rows: profiles.map((p) => [
      String(p.batchNumber || '—'),
      String(p.strength || '—'),
      String(p.apparatus || '—'),
      String(p.rotationSpeed || '—'),
      String(p.medium || '—'),
      String(p.mediumVolume || '—'),
      String(p.temperature || '—'),
      String(p.sinker || '—'),
      p.unitsTested ? String(p.unitsTested) : 'not recorded',
      String(p.dissolutionSpecification || 'not recorded'),
      dayOf(p.testDate) || '—',
    ]),
  });

  const pointRows: string[][] = [];
  for (const p of profiles) {
    for (const pt of profilePoints(p)) {
      pointRows.push([
        String(p.batchNumber || '—'),
        String(pt.timepoint ?? pt.timepointMin ?? '—'),
        pt.meanPercent !== undefined && pt.meanPercent !== null && pt.meanPercent !== '' ? String(pt.meanPercent) : '—',
        pt.sd !== undefined && pt.sd !== null && pt.sd !== '' ? String(pt.sd) : '—',
        pt.rsd !== undefined && pt.rsd !== null && pt.rsd !== '' ? String(pt.rsd) : '—',
        pt.min !== undefined && pt.min !== null && pt.min !== '' ? String(pt.min) : '—',
        pt.max !== undefined && pt.max !== null && pt.max !== '' ? String(pt.max) : '—',
        pt.n !== undefined && pt.n !== null && pt.n !== '' ? String(pt.n) : (p.unitsTested ? String(p.unitsTested) : '—'),
      ]);
    }
  }
  if (pointRows.length > 0) {
    tables.push({
      title: `Dissolution Profile — ${label}`,
      headers: ['Batch', 'Timepoint (min)', 'Mean % Dissolved', 'SD', '%RSD', 'Min', 'Max', 'n'],
      rows: pointRows,
    });
  }

  /* The reference profile a comparison is against. The register captures it and
     nothing rendered it, so a comparability profile arrived in §3.2.P.2 with
     the batch it was compared to missing — the half of the comparison a
     reviewer reads first. */
  const referenceRows: string[][] = [];
  for (const p of profiles) {
    const ref = p.comparisonResults;
    if (!Array.isArray(ref) || ref.length === 0) continue;
    for (const pt of ref.filter((r) => r && typeof r === 'object') as Array<Record<string, any>>) {
      referenceRows.push([
        String(p.batchNumber || '—'),
        String(p.comparisonBatch || 'reference batch not named'),
        String(pt.timepoint ?? pt.timepointMin ?? '—'),
        pt.meanPercent !== undefined && pt.meanPercent !== null && pt.meanPercent !== '' ? String(pt.meanPercent) : '—',
        pt.rsd !== undefined && pt.rsd !== null && pt.rsd !== '' ? String(pt.rsd) : '—',
        pt.n !== undefined && pt.n !== null && pt.n !== '' ? String(pt.n) : '—',
      ]);
    }
  }
  if (referenceRows.length > 0) {
    tables.push({
      title: `Reference Profile Compared Against — ${label}`,
      headers: ['Profile', 'Reference Batch', 'Timepoint (min)', 'Mean % Dissolved', '%RSD', 'n'],
      rows: referenceRows,
    });
  }

  const withoutUnits = profiles.filter((p) => !p.unitsTested);
  const withoutSpec = profiles.filter((p) => !String(p.dissolutionSpecification || '').trim());
  /* A JSON null is "not recorded" exactly as an absent key is: the register's
     own patch body writes null for a cleared cell, so checking only undefined
     dropped the disclosure for every profile edited through the drawer. */
  const unrecorded = (v: unknown) => v === undefined || v === null || String(v).trim() === '';
  const withoutVariability = profiles.filter((p) =>
    profilePoints(p).every((pt) => unrecorded(pt.sd) && unrecorded(pt.rsd)),
  );

  const withPoints = profiles.filter((p) => profilePoints(p).length > 0);
  const narrative =
    `${profiles.length} ${label} dissolution profile(s) are recorded` +
    (withPoints.length === profiles.length && withPoints.length > 0
      ? `, reported per timepoint above. `
      : withPoints.length > 0
        /* Stated per profile: "reported per timepoint above" over a set where
           only one profile carries timepoints reads as though all of them do. */
        ? `, of which ${withPoints.length} carry per-timepoint results, reported above. `
        : `, none of which carries a per-timepoint result. `) +
    (withoutUnits.length > 0
      ? `${withoutUnits.length} profile(s) do not record how many units were tested; a mean without its unit count does not support a conformance or a comparison, and none is asserted for them. `
      : '') +
    (withoutVariability.length > 0
      ? `${withoutVariability.length} profile(s) record no standard deviation or %RSD. `
      : '') +
    (withoutSpec.length > 0
      ? `${withoutSpec.length} profile(s) record no acceptance criterion, so conformance is not stated for them. `
      : '') +
    /* Similarity is never asserted here. f2 has eligibility conditions this
       section cannot check from a rendered table, and a similarity claim
       without them is a regulatorily void number presented as a conclusion. */
    `Profile similarity (f2) is not asserted in this section; it is computed from the recorded profiles by the dissolution comparison engine, which reports the eligibility conditions it evaluated. `;

  return { tables, narrative };
}

/* ── Materials (§3.2.P.4 excipients, §3.2.S.2.3 raw materials) ────────────────
 *
 * The material register holds ONE ROW PER MATERIAL, and §3.2.P.4 read a single
 * first-match `materialName` / `grade` pair — so a project using twelve
 * excipients rendered one of them, and which one depended on arrival order.
 */
function materialRows(
  sources: CanonicalSource[],
  sourceType: 'excipient' | 'raw_material_spec',
): Array<Record<string, any>> {
  return sources
    .filter((s) => s.sourceType === sourceType)
    .map((s) => (s.sourcePayload || {}) as Record<string, any>)
    .filter((p) => String(p.materialName || '').trim())
    // A retired material is superseded, not current.
    .filter((p) => String(p.status || '').toLowerCase() !== 'retired');
}

/** The specification a material is controlled to, as recorded. */
function materialSpecText(p: Record<string, any>): string {
  const rows = Array.isArray(p.testParameters) ? p.testParameters.filter((r: any) => r && typeof r === 'object') : [];
  if (rows.length > 0) {
    return rows.map((r: any) => [r.test, r.acceptanceCriteria].filter(Boolean).join(' ')).filter(Boolean).join('; ');
  }
  return String(p.compendialMonograph || '') ? `Complies with ${p.compendialMonograph}` : '—';
}

/**
 * §3.2.S.2.3 — the raw and starting materials the drug substance is made from.
 *
 * These rendered inside §3.2.P.4 Control of EXCIPIENTS, because that was the
 * only rule listing `raw_material_spec` — so a reviewer opening the drug
 * product's excipient section found a drug-substance synthetic intermediate,
 * and the register grid told the staffer the same row filed under §3.2.S.2.3.
 * The screen and the dossier disagreeing about where a record belongs is the
 * failure shared/cmc/material-scope.ts exists to prevent.
 */
function rawMaterialRendering(
  sources: CanonicalSource[],
): { tables: GeneratedTable[]; narrative: string } {
  const rawMaterials = materialRows(sources, 'raw_material_spec');
  if (rawMaterials.length === 0) return { tables: [], narrative: '' };
  const unspecified = rawMaterials.filter((p) => materialSpecText(p) === '—');
  return {
    tables: [{
      title: 'Raw and Starting Material Specifications',
      headers: ['Material', 'Role', 'Grade', 'Compendial Monograph', 'Specification', 'Supplier', 'Site'],
      rows: rawMaterials.map((p) => [
        String(p.materialName),
        String(p.materialRole || '—'),
        String(p.grade || '—'),
        String(p.compendialMonograph || '—'),
        materialSpecText(p),
        String(p.supplier || '—'),
        String(p.manufacturerSite || '—'),
      ]),
    }],
    narrative:
      `${rawMaterials.length} raw or starting material specification(s) are recorded for the drug substance, reported above. ` +
      (unspecified.length > 0
        ? `${unspecified.length} of them record neither a specification nor a compendial monograph, so what they are controlled to is not established by this section. `
        : ''),
  };
}

function materialRendering(
  sources: CanonicalSource[],
): { tables: GeneratedTable[]; narrative: string } {
  const excipients = materialRows(sources, 'excipient');
  const tables: GeneratedTable[] = [];

  if (excipients.length > 0) {
    tables.push({
      title: 'Control of Excipients',
      headers: ['Excipient', 'Function', 'Grade', 'Compendial Monograph', 'Specification', 'Analytical Procedure', 'Supplier', 'Origin'],
      rows: excipients.map((p) => [
        String(p.materialName),
        String(p.functionInFormulation || '—'),
        String(p.grade || '—'),
        String(p.compendialMonograph || '—'),
        materialSpecText(p),
        String(p.analyticalProcedures || (p.compendialMonograph ? `Per ${p.compendialMonograph}` : '—')),
        String(p.supplier || '—'),
        String(p.origin || 'not recorded'),
      ]),
    });
  }

  const novel = excipients.filter((p) => p.novelExcipient);
  const unjustifiedNovel = novel.filter((p) => !String(p.novelExcipientJustification || '').trim());
  const unspecified = excipients.filter((p) => materialSpecText(p) === '—');

  /* "each controlled to the specification reported above" was unconditional,
     and the very next clause named the excipients that record no specification
     at all — a blanket claim of control the same paragraph disproved, in the
     sentence a reader takes as the section's statement of control. */
  const specified = excipients.length - unspecified.length;
  const narrative =
    (excipients.length === 0
      ? `No excipient is recorded for the drug product; the control of excipients is not established by this section. `
      : unspecified.length === 0
        ? `${excipients.length} excipient(s) are recorded for the drug product, each controlled to the specification reported above. `
        : `${excipients.length} excipient(s) are recorded for the drug product. ${specified} of them are controlled to the specification reported above; ` +
          `${unspecified.length} record neither a specification nor a compendial monograph, so what those are controlled to is not established by this section. `) +
    /* A novel excipient carries its own safety package (ICH M4Q 3.2.P.4.6).
       Recording one without a justification is a gap the section states. */
    (novel.length > 0
      ? `${novel.length} excipient(s) are recorded as novel and require the safety documentation of §3.2.P.4.6` +
        (unjustifiedNovel.length > 0
          ? `; ${unjustifiedNovel.length} of those record no justification, which is not supplied by this section. `
          : `, whose justification is recorded against each. `)
      : '') +
    '';

  return { tables, narrative };
}

/* ── Formulation (§3.2.P.1 composition) ───────────────────────────────────────
 *
 * §3.2.P.1's composition table read a first-match `components` array, so a
 * project with several formulation versions rendered whichever arrived first.
 * The register records a version and a status; the section renders the CURRENT
 * one and says what it superseded.
 */
function formulationRecords(sources: CanonicalSource[]): Array<Record<string, any>> {
  return sources
    .filter((s) => s.sourceType === 'formulation_record')
    .map((s) => (s.sourcePayload || {}) as Record<string, any>)
    .filter((p) => String(p.formulationName || '').trim());
}

function formulationRendering(
  sources: CanonicalSource[],
): { tables: GeneratedTable[]; narrative: string; current: Record<string, any> | null } {
  const all = formulationRecords(sources);
  if (all.length === 0) {
    return { tables: [], narrative: '', current: null };
  }
  /* "Current" is a recorded status, never a guess at which arrived last. Where
     no record claims it, the section says so instead of electing one. */
  const current = all.filter((p) => String(p.status || '').toLowerCase() === 'current');
  const superseded = all.filter((p) => String(p.status || '').toLowerCase() === 'superseded');
  const chosen = current.length === 1 ? current[0] : null;

  const tables: GeneratedTable[] = [];
  const componentsOf = (p: Record<string, any>) =>
    Array.isArray(p.components) ? p.components.filter((c: any) => c && typeof c === 'object') : [];

  if (chosen) {
    tables.push({
      title: 'Quantitative Composition',
      headers: ['Component', 'Function / Role', 'Amount per Unit', '% w/w', 'Amount per Batch', 'Overage', 'Compendial Reference', 'Origin'],
      rows: componentsOf(chosen).map((c: any) => [
        String(c.component || c.name || 'Unknown'),
        String(c.role || c.function || '—'),
        /* A number whose unit was never recorded is reported as such — the
           rule this file already applies to a characterisation result. Joining
           and dropping the empty unit printed the figure bare, and a reader
           supplies whatever unit they expect. */
        (() => {
          const amount = String(c.amountPerUnit ?? c.amount ?? '').trim();
          if (!amount) return '—';
          const unit = String(c.unit ?? '').trim();
          return unit ? `${amount} ${unit}` : `${amount} (unit not recorded)`;
        })(),
        String(c.percentWeight ?? '—'),
        String(c.amountPerBatch ?? '—'),
        String(c.overage ?? '—'),
        String(c.compendialReference ?? '—'),
        String(c.origin ?? 'not recorded'),
      ]),
    });
  }
  if (all.length > 1) {
    tables.push({
      title: 'Formulation Versions',
      headers: ['Formulation', 'Version', 'Status', 'Batch Size', 'Supersedes', 'Components'],
      rows: all.map((p) => [
        String(p.formulationName),
        String(p.version || '—'),
        String(p.status || 'draft'),
        String(p.batchSize || '—'),
        String(p.supersedes || '—'),
        String(componentsOf(p).length),
      ]),
    });
  }

  const unjustified = all.reduce((n, p) => n + (Number(p.unjustifiedOverageCount) || 0), 0);
  const narrative =
    (chosen
      ? `The current formulation is ${String(chosen.formulationName)}` +
        (chosen.version ? ` (${String(chosen.version)})` : '') +
        `, comprising ${componentsOf(chosen).length} component(s) reported above` +
        (chosen.batchSize ? ` at a batch size of ${String(chosen.batchSize)}` : '') + `. `
      : current.length > 1
        ? `${current.length} formulation records are marked current, so which composition governs is not established by this section. `
        : `${all.length} formulation record(s) are on file and none is marked current, so the governing composition is not established by this section. `) +
    (superseded.length > 0 ? `${superseded.length} superseded version(s) are retained in the record. ` : '') +
    /* An overage is a regulatory question in its own right (ICH Q8 §2.3): one
       recorded without a justification is a gap, not a detail. */
    (unjustified > 0
      ? `${unjustified} component overage(s) are recorded without a justification; the reason for the overage is not established by this section. `
      : '');

  return { tables, narrative, current: chosen };
}

/**
 * §3.2.S.2.2 / §3.2.P.3.3 — the manufacturing process, from the register that
 * now writes it.
 *
 * Before this register existed, both sections rendered whatever single sentence
 * the drug substance or drug product form happened to carry in a "process
 * description" box. The process is a sequence of unit operations with critical
 * parameters and controls attached to each; that is what a reviewer reads, and
 * that is what the register records.
 *
 * Retired processes are excluded. A superseded route is history, not the
 * process the filing describes.
 */
function processRendering(
  sources: CanonicalSource[],
  side: 'drug_substance' | 'drug_product',
): { tables: GeneratedTable[]; narrative: string } {
  const all = scopedPayloads(sources, 'manufacturing_process', side, 'drug_substance', 'processScope')
    .filter((p) => String(p.status || '').toLowerCase() !== 'retired');
  if (all.length === 0) return { tables: [], narrative: '' };

  const tables: GeneratedTable[] = [];
  const named = all.map((p) => String(p.processName || '').trim()).filter(Boolean);

  /* Steps are attributed to the process they belong to — never merged. A
     project with a drug-substance route and a granulation process would
     otherwise present one flattened sequence that neither process performs. */
  const stepRows: string[][] = [];
  for (const p of all) {
    for (const st of objectRows(p.processSteps)) {
      const controls = objectRows(st.inProcessControls ?? st.in_process_controls);
      stepRows.push([
        String(p.processName || '—'),
        String(st.stepNumber ?? st.step_number ?? st.order ?? '—'),
        String(st.unitOperation || st.unit_operation || st.stepName || st.step_name || '—'),
        String(st.description || '—'),
        String(st.equipment || st.equipmentContext || '—'),
        [st.holdTime ?? st.hold_time, st.holdTimeCondition ?? st.hold_time_condition].filter(Boolean).join(' ') || '—',
        controls.length > 0
          ? controls
              .map((c: any) => [c.test || c.control || c.parameter, c.acceptanceCriteria || c.acceptance_criteria || c.limit].filter(Boolean).join(' '))
              .filter(Boolean)
              .join('; ') || '—'
          : '—',
      ]);
    }
  }
  if (stepRows.length > 0) {
    tables.push({
      title: 'Manufacturing Process Steps',
      headers: ['Process', 'Step', 'Unit Operation', 'Description', 'Equipment', 'Hold Time', 'In-Process Controls'],
      rows: stepRows,
    });
  }

  /* Critical process parameters with their proven ranges. A CPP with no range
     is reported as recorded without one rather than dropped: an operating range
     nobody wrote down is exactly the gap a reviewer is looking for. */
  const cppRows: string[][] = [];
  let cppsWithoutRange = 0;
  for (const p of all) {
    for (const c of objectRows(p.criticalProcessParameters)) {
      const low = c.rangeLow ?? c.range_low ?? c.min;
      const high = c.rangeHigh ?? c.range_high ?? c.max;
      const hasRange = low !== undefined && low !== null && low !== '' && high !== undefined && high !== null && high !== '';
      if (!hasRange) cppsWithoutRange += 1;
      cppRows.push([
        String(p.processName || '—'),
        String(c.parameter || c.name || '—'),
        String(c.step || c.unitOperation || c.unit_operation || '—'),
        String(c.target ?? '—'),
        hasRange ? `${low} – ${high}` : 'not recorded',
        String(c.unit || '—'),
        String(c.criticality || '—'),
        String(c.linkedCqa || c.linked_cqa || c.cqa || '—'),
      ]);
    }
  }
  if (cppRows.length > 0) {
    tables.push({
      title: 'Critical Process Parameters',
      headers: ['Process', 'Parameter', 'Step', 'Target', 'Proven Range', 'Unit', 'Criticality', 'Linked CQA'],
      rows: cppRows,
    });
  }

  /* The register's process-level control list, attributed to its own process.
     `processControlRows` was written by the mapper and read by nothing: the only
     path those controls took into a section was the flattened text, which both
     §3.2.S.2 and §3.2.P.3 read with a FIRST-MATCH helper over a register that is
     one row per process — so with two processes on a side, the second process's
     controls appeared in no table and no sentence anywhere in Module 3. */
  const controlRows: string[][] = [];
  for (const p of all) {
    for (const c of objectRows(p.processControlRows)) {
      controlRows.push([
        String(p.processName || '—'),
        String(c.test || c.control || c.parameter || '—'),
        String(c.acceptanceCriteria || c.acceptance_criteria || c.limit || '—'),
        String(c.samplingPoint || c.sampling_point || c.step || '—'),
        String(c.frequency || '—'),
      ]);
    }
  }
  if (controlRows.length > 0) {
    tables.push({
      title: 'In-Process Controls',
      headers: ['Process', 'Test', 'Acceptance Criteria', 'Sampling Point', 'Frequency'],
      rows: controlRows,
    });
  }

  const equipRows: string[][] = [];
  for (const p of all) {
    for (const e of objectRows(p.equipmentList)) {
      equipRows.push([
        String(p.processName || '—'),
        String(e.equipment || e.name || '—'),
        String(e.type || e.unitOperation || '—'),
        String(e.model || '—'),
        String(e.qualificationStatus || e.qualification_status || 'not recorded'),
      ]);
    }
  }
  if (equipRows.length > 0) {
    tables.push({
      title: 'Equipment',
      headers: ['Process', 'Equipment', 'Type', 'Model / Identifier', 'Qualification Status'],
      rows: equipRows,
    });
  }

  const batchSizes = all.map((p) => String(p.processBatchSize || '').trim()).filter(Boolean);
  const withSteps = all.filter((p) => objectRows(p.processSteps).length > 0);
  /* The mapper side-scopes the control text — §3.2.S.2's required field is
     `processControls` and the drug-product twin is `drugProductProcessControls`
     — so reading only the first made this clause unconditionally true for
     §3.2.P.3: the section stated "No in-process control is recorded" directly
     under a table printing the controls it was denying. */
  const controlTextOf = (p: Record<string, any>) =>
    String(p.processControls || p.drugProductProcessControls || '').trim();
  const withControls = all.filter((p) => controlTextOf(p));
  const reprocessing = all.map((p) => String(p.reprocessing || '').trim()).filter(Boolean);
  const validatedNames = all
    .filter((p) => String(p.processValidationStatus || '').trim().toLowerCase() === 'validated')
    .map((p) => String(p.processName || 'unnamed process'));
  const material = side === 'drug_substance' ? 'drug substance' : 'drug product';

  const narrative =
    `${all.length} manufacturing process(es) are recorded for the ${material}` +
    (named.length > 0 ? `: ${named.join(', ')}. ` : '. ') +
    (withSteps.length === all.length
      ? `Each is recorded as an ordered sequence of unit operations, reported above. `
      : withSteps.length > 0
        ? `${withSteps.length} of ${all.length} record an ordered sequence of unit operations; the remainder describe no steps, so their process is not established by this section. `
        : `None records an ordered sequence of unit operations, so the process is not established by this section. `) +
    (cppRows.length > 0
      ? `${cppRows.length} critical process parameter(s) are recorded` +
        (cppsWithoutRange > 0
          ? `, of which ${cppsWithoutRange} carry no proven acceptable range — the range those parameters are controlled within is not established by this section. `
          : `, each with a proven acceptable range. `)
      : `No critical process parameter is recorded, so what is controlled to keep the process in a state of control is not established by this section. `) +
    (withControls.length === 0
      ? `No in-process control is recorded. `
      : withControls.length < all.length
        ? `${withControls.length} of ${all.length} record in-process controls. `
        : '') +
    (batchSizes.length > 0 ? `Recorded batch size(s): ${batchSizes.join('; ')}. ` : '') +
    /* The register's own validation state, which is a Part 11 signature on this
       table and was emitted by the mapper and read by nothing — so a process
       signed as validated composed a section that said nothing about it. */
    (validatedNames.length === all.length
      ? `Each is recorded as validated in the process register. `
      : validatedNames.length > 0
        ? `${validatedNames.join(', ')} ${validatedNames.length === 1 ? 'is' : 'are'} recorded as validated in the process register; the remainder are not established as validated by this section. `
        : `None is recorded as validated in the process register. `) +
    (reprocessing.length > 0 ? `Reprocessing: ${reprocessing.join(' ')} ` : '');

  return { tables, narrative };
}

/**
 * §3.2.S.3.1 — characterisation, from the register that now writes it.
 *
 * The section asks three separate questions and the register types each study
 * by which one it answers, so the narrative can report each question's state
 * independently. A section that reported "characterised" over three NMR studies
 * would be asserting physicochemical and biological data it does not hold.
 */
function characterizationRendering(
  sources: CanonicalSource[],
  side: 'drug_substance' | 'drug_product',
): { tables: GeneratedTable[]; narrative: string; byType: Record<string, Record<string, any>[]> } {
  const all = scopedPayloads(sources, 'characterization', side, 'drug_substance', 'characterizationScope')
    .filter((p) => String(p.status || '').toLowerCase() !== 'retired');
  const byType: Record<string, Record<string, any>[]> = { structural: [], physicochemical: [], biological: [] };
  for (const p of all) {
    const t = normalizeCharacterizationType(p.characterizationType);
    byType[t].push(p);
  }
  if (all.length === 0) return { tables: [], narrative: '', byType };

  const tables: GeneratedTable[] = [{
    title: 'Characterisation Studies',
    headers: ['Type', 'Study', 'Technique', 'Attribute', 'Result', 'Conclusion', 'Reference', 'Status'],
    rows: all.map((p) => {
      const unit = String(p.characterizationResultUnit || '').trim();
      const value = String(p.characterizationResult ?? '').trim();
      return [
        CHARACTERIZATION_TYPE_LABEL[normalizeCharacterizationType(p.characterizationType)],
        String(p.studyTitle || '—'),
        String(p.technique || '—'),
        String(p.attribute || '—'),
        /* A number with no recorded unit is reported as such. Printing it bare
           lets the reader supply a unit the register never held. */
        value ? (unit ? `${value} ${unit}` : `${value} (unit not recorded)`) : '—',
        String(p.conclusion || '—'),
        String(p.studyReference || '—'),
        String(p.status || 'draft'),
      ];
    }),
  }];

  /* Supporting detail — spectral assignments, per-parameter measurements —
     attributed to the study it belongs to. */
  const detailRows: string[][] = [];
  for (const p of all) {
    for (const d of objectRows(p.supportingData)) {
      detailRows.push([
        String(p.studyTitle || '—'),
        String(d.label || d.parameter || d.assignment || '—'),
        [d.value, d.unit].filter((x) => x !== undefined && x !== null && x !== '').join(' ') || '—',
        String(d.note || '—'),
      ]);
    }
  }
  if (detailRows.length > 0) {
    tables.push({
      title: 'Characterisation Supporting Data',
      headers: ['Study', 'Parameter / Assignment', 'Value', 'Note'],
      rows: detailRows,
    });
  }

  const answered = (t: 'structural' | 'physicochemical' | 'biological') =>
    byType[t].some((p) => String(p[CHARACTERIZATION_TYPE_FIELD[t]] || '').trim());
  const missing = (['structural', 'physicochemical', 'biological'] as const).filter((t) => !answered(t));
  /* A study that named a technique but recorded no result still produces a
     statement — the technique's own name — so counting empty statements missed
     exactly the studies this clause exists to name. */
  const recordedButEmpty = all.filter((p) => p.characterizationEstablishes === false);

  /* The three-question completeness claim belongs to §3.2.S.3.1, which asks
     for structure, physicochemical properties AND biological activity. A
     drug-product study is §3.2.P.2 development evidence and that section asks
     for none of the three, so reporting them as "not established" there would
     invent a requirement the CTD does not make of it. */
  const narrative =
    `${all.length} characterisation study/ies are recorded${side === 'drug_product' ? ' for the drug product' : ''}, reported above. ` +
    (side === 'drug_substance'
      ? missing.length === 0
        ? `Structure, physicochemical properties and biological activity are each established by at least one recorded study. `
        : `No recorded study establishes ${missing.map((t) => CHARACTERIZATION_TYPE_LABEL[t].toLowerCase()).join(' or ')}; ` +
          `that is not established by this section. `
      : '') +
    (recordedButEmpty.length > 0
      ? `${recordedButEmpty.length} study/ies are on file with neither a result nor a conclusion recorded. `
      : '');

  return { tables, narrative, byType };
}

// ── Section-specific narrative + table generators ──────────────────────────────

type SectionGenerator = (matched: CanonicalSource[]) => { narrative: string; tables: GeneratedTable[] };

const SECTION_GENERATORS: Record<string, SectionGenerator> = {
  '3.2.S.1': (m) => {
    const name = val(m, 'name');
    const mfr = val(m, 'manufacturer');
    return {
      narrative: `The drug substance is ${name || '[name not provided]'}` +
        (mfr ? `, manufactured by ${mfr}.` : '.') +
        ` This section provides general information including nomenclature, molecular structure, and general properties of the drug substance.`,
      tables: [kvTable('Drug Substance General Information', { 'Drug Substance Name': name, 'Manufacturer': mfr })],
    };
  },

  '3.2.S.2': (m) => {
    const route = val(m, 'manufacturingRoute');
    const descRaw = val(m, 'processDescription');
    // The §3.2.S register records ONE process text (its form labels the route
    // field as the §3.2.S.2.2 description), so route and description are
    // often the same recorded sentence — rendering it twice reads as padding.
    const desc = descRaw === route ? '' : descRaw;
    const controls = val(m, 'processControls');
    const pvStatus = val(m, 'validationStatus');
    const pvProtocol = val(m, 'protocol');
    const pvCriteria = val(m, 'acceptanceCriteria');
    const pvBatches = val(m, 'consecutiveBatches');
    const tables: GeneratedTable[] = [];
    tables.push(kvTable('Manufacturing Process Summary', { 'Synthetic Route': route, 'Process Description': desc, 'In-Process Controls': controls }));
    /* §3.2.S.2.2 proper: the ordered unit operations, their critical parameters
       and the equipment, from the manufacturing process register. Until that
       register existed this section rendered one free-text sentence typed on
       the drug substance form and called it the manufacturing process. */
    const process = processRendering(m, 'drug_substance');
    tables.push(...process.tables);
    /* §3.2.S.2.3 Control of Materials — the raw and starting materials the
       route consumes. */
    const rawMaterials = rawMaterialRendering(m);
    tables.push(...rawMaterials.tables);
    if (pvStatus || pvProtocol) {
      tables.push({
        title: 'Process Validation Summary',
        headers: ['Parameter', 'Value'],
        rows: [
          ...(pvProtocol ? [['Validation Protocol', pvProtocol]] : []),
          ...(pvStatus ? [['Validation Status', pvStatus]] : []),
          ...(pvCriteria ? [['Acceptance Criteria', pvCriteria]] : []),
          ...(pvBatches ? [['Consecutive Batches', pvBatches]] : []),
        ],
      });
    }
    return {
      narrative: `The drug substance is manufactured via ${route || '[route not specified]'}. ` +
        (desc ? `The manufacturing process consists of: ${desc}. ` : '') +
        (controls ? `In-process controls include: ${controls}. ` : '') +
        process.narrative +
        rawMaterials.narrative +
        (pvStatus ? `Process validation status: ${pvStatus}` + (pvProtocol ? ` (protocol: ${pvProtocol})` : '') + `. ` : '') +
        (pvBatches ? `${pvBatches} consecutive batch(es) validated.` : ''),
      tables,
    };
  },

  '3.2.S.3': (m) => {
    const struct = val(m, 'structuralElucidation');
    const phys = val(m, 'physicochemicalProperties');
    const bio = val(m, 'biologicalActivity');
    const tables: GeneratedTable[] = [];
    tables.push(kvTable('Characterisation Summary', { 'Structural Elucidation': struct, 'Physicochemical Properties': phys, 'Biological Activity': bio }));
    /* §3.2.S.3.1 proper. The summary above is a first-match read over three
       free-text boxes on the drug substance form; the studies below are the
       recorded experiments, typed by which of the section's three questions
       each one answers. */
    const characterization = characterizationRendering(m, 'drug_substance');
    tables.push(...characterization.tables);
    /* §3.2.S.3.2 — the impurity register, assessed against the ICH threshold
       that governs each level. The table this replaced appended a percent sign
       to whatever number was in the field (so a ppm figure printed as a
       percentage), read one first-match array out of a register holding one row
       per impurity, and stated a count of "identified and characterized"
       impurities over rows that carried neither. */
    const impurities = impurityRendering(m, 'drug_substance');
    tables.push(...impurities.tables);
    return {
      narrative: `Structural elucidation of the drug substance was confirmed by ${struct || '[methods not specified]'}. ` +
        (phys ? `Physicochemical properties: ${phys}. ` : '') +
        (bio ? `Biological activity: ${bio}. ` : '') +
        characterization.narrative +
        impurities.narrative,
      tables,
    };
  },

  '3.2.S.4': (m) => {
    const criteria = valObj(m, 'acceptanceCriteria');
    /* Methods, PLURAL. A first-match val() read stamped ONE method's name and
       lifecycle status onto every acceptance-criteria row — with two methods
       in different states, whichever source was updated last claimed every
       attribute, asserting a validation state the record contradicts. The
       register captures no attribute↔method link, so per-row attribution is
       honest only when exactly one method exists; otherwise the rows point at
       the methods table and the narrative reports each status by name. */
    const methodSources = m
      .filter((s) => s.sourceType === 'method')
      .map((s) => (s.sourcePayload || {}) as Record<string, any>)
      .filter((p) => p.methodName || p.methodCode || p.technique || p.validationStatus);
    const soleMethod = methodSources.length === 1 ? methodSources[0] : null;
    const status = soleMethod ? String(soleMethod.validationStatus || '') : '';
    const methodName = soleMethod
      ? String(soleMethod.methodName || soleMethod.methodCode || '')
      : '';
    const statusSummary =
      methodSources.length > 1
        ? methodSources
            .map((p) => `${p.validationStatus || 'status not recorded'} (${p.methodName || p.methodCode || 'unnamed method'})`)
            .join('; ')
        : status;
    const impurityLimits = valObj(m, 'impurityLimits');
    const tables: GeneratedTable[] = [];
    if (criteria) {
      tables.push({
        title: 'Drug Substance Specification — Acceptance Criteria',
        headers: ['Quality Attribute', 'Test Method', 'Acceptance Criteria', 'Validation Status'],
        rows: Object.entries(criteria).map(([test, crit]) => [
          test,
          methodName || (methodSources.length > 1 ? 'See Analytical Methods table' : 'Not specified'),
          String(crit),
          status || (methodSources.length > 1 ? '—' : 'Pending'),
        ]),
      });
    }
    if (methodSources.length > 0) {
      tables.push({
        title: 'Analytical Methods',
        headers: ['Method', 'Technique', 'Validation Status', 'Validated'],
        rows: methodSources.map((p) => [
          String(p.methodName || p.methodCode || 'Unnamed method'),
          String(p.technique || p.methodType || '—'),
          String(p.validationStatus || '—'),
          p.validationDate ? String(p.validationDate).slice(0, 10) : '—',
        ]),
      });
    }
    // §3.2.S.4.4 — the recorded results themselves, not just their count.
    const batchTable = batchAnalysesTable(m, 'drug_substance');
    if (batchTable) tables.push(batchTable);
    // Impurity limits from structured object or impurity_profile source array
    if (impurityLimits) {
      tables.push({
        title: 'Impurity Limits — Drug Substance',
        headers: ['Impurity', 'Identification Threshold', 'Qualification Threshold', 'Specification Limit'],
        rows: Object.entries(impurityLimits).map(([impurity, limits]) => {
          const l = typeof limits === 'object' && limits !== null ? limits as Record<string, any> : {};
          return [impurity, String(l.identification || '—'), String(l.qualification || '—'), String(l.specLimit || String(limits))];
        }),
      });
    }
    /* §3.2.S.4.1's impurity limits, from the register that produces them,
       assessed against the ICH threshold each level is governed by. The branch
       this replaced read a first-match array (one impurity out of a register of
       many) and appended a percent sign to whatever number it found. */
    const dsImpurities = impurityRendering(m, 'drug_substance');
    tables.push(...dsImpurities.tables);
    return {
      narrative: `The drug substance specification defines acceptance criteria for quality attributes. ` +
        (statusSummary
          ? methodSources.length > 1
            ? `Analytical method validation status: ${statusSummary}. `
            : `Analytical methods are ${statusSummary}. `
          : '') +
        (criteria ? `${Object.keys(criteria).length} test(s) are defined in the specification. ` : '') +
        batchAnalysesSentence(m, 'drug_substance') +
        (impurityLimits ? `Impurity limits are established for ${Object.keys(impurityLimits).length} identified impurity/ies per ICH Q3A. ` : '') +
        dsImpurities.narrative,
      tables,
    };
  },

  '3.2.S.5': (m) => referenceStandardSection(m, 'drug_substance'),

  '3.2.S.6': (m) => containerClosureSection(m, 'drug_substance'),

  '3.2.S.7': (m) => {
    const timePoints = valArr(m, 'timePoints');
    const condition = val(m, 'storageCondition');
    const stabilityParameters = valArr(m, 'stabilityParameters');
    const batchesStudied = valArr(m, 'batchesStudied');
    const packagingConfig = val(m, 'packagingConfiguration');
    const tables: GeneratedTable[] = [];
    // Study design table
    tables.push({
      title: 'Stability Study Design — Drug Substance',
      headers: ['Parameter', 'Value'],
      rows: [
        ['Storage Condition', condition || '[not specified]'],
        ['Time Points (months)', timePoints.length > 0 ? timePoints.join(', ') : '[not specified]'],
        ...(packagingConfig ? [['Packaging Configuration', packagingConfig]] : []),
        ...(batchesStudied.length > 0 ? [['Batches Studied', batchesStudied.join(', ')]] : []),
      ],
    });
    // Stability data matrix if parameters provided
    if (stabilityParameters.length > 0) {
      const paramHeaders = ['Test Parameter', ...timePoints.map((tp: any) => `${tp} mo`)];
      tables.push({
        title: 'Stability Data Summary — Drug Substance',
        headers: paramHeaders.length > 1 ? paramHeaders : ['Test Parameter', 'Acceptance Criteria', 'Result'],
        rows: stabilityParameters.map((sp: any) => {
          if (typeof sp === 'object' && sp !== null) {
            const row = [sp.parameter || sp.test || 'Unknown'];
            if (timePoints.length > 0) {
              for (const tp of timePoints) {
                row.push(sp[`t${tp}`] || sp[String(tp)] || '—');
              }
            } else {
              row.push(String(sp.acceptanceCriteria || '—'), String(sp.result || '—'));
            }
            return row;
          }
          return [String(sp)];
        }),
      });
    }
    // Do NOT assert a passing stability conclusion the data does not establish.
    // Read a deterministic pass/concern signal from the matched stability
    // source(s); assert stability only on a clear positive signal, flag a clear
    // negative one, and otherwise defer to review of the summarized data.
    const conclusion = stabilityConclusion(m, 'drug substance');
    return {
      narrative: `Stability studies for the drug substance were conducted under ${condition || '[condition not specified]'} ` +
        (timePoints.length > 0 ? `at time points: ${timePoints.join(', ')} months. ` : '. ') +
        (batchesStudied.length > 0 ? `${batchesStudied.length} batch(es) were placed on stability. ` : '') +
        conclusion,
      tables,
    };
  },

  '3.2.P.1': (m) => {
    const form = val(m, 'dosageFormDescription');
    const comp = val(m, 'composition');
    const strength = val(m, 'strength');
    /* The formulation register, which records a VERSION and its status. The
       read this replaced took a first-match `components` array, so a project
       with several formulation versions rendered whichever arrived first. */
    const formulation = formulationRendering(m);
    const tables: GeneratedTable[] = [];
    tables.push(kvTable('Drug Product Description and Composition', {
      'Dosage Form': form, 'Strength': strength,
      ...(formulation.current ? { 'Formulation': String(formulation.current.formulationName) } : {}),
      ...(formulation.current?.version ? { 'Formulation Version': String(formulation.current.version) } : {}),
      'Composition': comp,
    }));
    tables.push(...formulation.tables);
    return {
      narrative: `The drug product is a ${form || '[dosage form not specified]'} ` +
        (strength ? `with a strength of ${strength}. ` : '. ') +
        (formulation.narrative || `No formulation record is on file; the composition is not established by this section. `) +
        (comp ? `Composition: ${comp}.` : ''),
      tables,
    };
  },

  '3.2.P.2': (m) => {
    const formDev = val(m, 'formulationDevelopment');
    const mfgDev = val(m, 'manufacturingProcessDev');
    const ccStudies = val(m, 'containerClosureStudies');
    const devHistory = val(m, 'developmentHistory');
    const developmentDissolution = dissolutionRendering(
      m,
      DISSOLUTION_DEVELOPMENT_PURPOSES,
      'development',
    );
    const tables: GeneratedTable[] = [];
    tables.push(kvTable('Pharmaceutical Development Summary', {
      'Formulation Development': formDev,
      'Manufacturing Process Development': mfgDev,
      'Container Closure Studies': ccStudies,
      ...(devHistory ? { 'Development History': devHistory } : {}),
    }));
    /* The development and comparability profiles, from the dissolution register.
       This section and §3.2.P.5 used to read the SAME four generic first-match
       keys, so a single recorded profile rendered identically into both — the
       method-development record and the release control presented as the same
       test. The register stores which one a profile is. */
    tables.push(...developmentDissolution.tables);
    /* Drug-product characterisation studies. §3.2.S.3 is the drug SUBSTANCE's
       characterisation section and the CTD has no drug-product twin, so these
       belong here — which is what the register grid and the form's own field
       description tell the staffer. */
    const productCharacterization = characterizationRendering(m, 'drug_product');
    tables.push(...productCharacterization.tables);
    return {
      narrative: `Pharmaceutical development studies were conducted to support the proposed formulation and manufacturing process. ` +
        (formDev ? `Formulation development: ${formDev}. ` : '') +
        (mfgDev ? `Manufacturing process development: ${mfgDev}. ` : '') +
        (ccStudies ? `Container closure studies: ${ccStudies}. ` : '') +
        (devHistory ? `Development history: ${devHistory}. ` : '') +
        developmentDissolution.narrative +
        productCharacterization.narrative,
      tables,
    };
  },

  '3.2.P.3': (m) => {
    const formulation = val(m, 'formulation');
    const batchNum = val(m, 'batchNumber');
    /* The §11 release decision, read from ONE batch record.
       val() scans each key independently across sources, so with more than one
       batch source the disposition, the releaser and the date could each come
       from a DIFFERENT batch — a release attribution the register never made.
       The facts travel together or not at all. Gated on what the register
       actually writes (release_status / released_by / released_at); the old
       `disposition` gate was a column no route ever populates, so the clause
       could never render. */
    const releasedBatch = m
      .filter((s) => s.sourceType === 'batch')
      .map((s) => (s.sourcePayload || {}) as Record<string, any>)
      .find((p) => p.releasedBy || p.releasedAt || p.releaseStatus || p.disposition) ?? null;
    const disposition = String(releasedBatch?.disposition || releasedBatch?.releaseStatus || val(m, 'disposition') || '');
    const releasedBy = String(releasedBatch?.releasedBy || '');
    const releasedAt = String(releasedBatch?.releasedAt || '');
    const releasedBatchNumber = String(releasedBatch?.batchNumber || '');
    const batchSize = val(m, 'batchSize');
    const manufacturingSite = val(m, 'manufacturingSite');
    /* §3.2.P.3.3 proper, from the manufacturing process register. */
    const process = processRendering(m, 'drug_product');
    /* The drug product form has always had a free-text step list of its own,
       and this section rendered it through a first-match array read across
       EVERY matched source — so once the process register began emitting
       `processSteps` as structured rows, whichever source came first won and
       the two shapes rendered through one column mapping. The register is the
       canonical home; the form's list is read from the drug product source
       only, and only when no process is recorded, so a project that has not
       reached the register yet does not lose what it typed. */
    const legacySteps = process.tables.length > 0
      ? []
      : (m
          .filter((so) => so.sourceType === 'drug_product')
          .map((so) => (so.sourcePayload || {}) as Record<string, any>)
          .map((pl) => pl.processSteps)
          .find((v) => Array.isArray(v) && v.length > 0) as any[] | undefined) ?? [];
    const validationStatus = val(m, 'validationStatus');
    const pvProtocol = val(m, 'protocol');
    const pvCriteria = val(m, 'acceptanceCriteria');
    const pvConclusion = val(m, 'conclusion');
    const tables: GeneratedTable[] = [];
    // Batch formula table
    tables.push({
      title: 'Batch Formula',
      headers: ['Parameter', 'Value'],
      rows: [
        ['Formulation', formulation || '[not specified]'],
        ['Batch Number', batchNum || '[not specified]'],
        ...(batchSize ? [['Batch Size', batchSize]] : []),
        ...(manufacturingSite ? [['Manufacturing Site', manufacturingSite]] : []),
        ...(disposition ? [['Disposition', disposition]] : []),
        ...(validationStatus ? [['Process Validation Status', validationStatus]] : []),
        ...(pvProtocol ? [['Validation Protocol', pvProtocol]] : []),
        ...(pvCriteria ? [['Validation Acceptance Criteria', pvCriteria]] : []),
      ],
    });
    /* The controlled changes. The register records which CTD sections each
       change's impact assessment names; the narrative reports THAT rather
       than asserting every change is "against this process" — a claim the
       record does not make for a change assessed against, say, §3.2.S.2. */
    const changeTable = changeHistoryTable(m);
    const changeSectionsNoted = [
      ...new Set(
        m
          .filter((s) => s.sourceType === 'change_control')
          .flatMap((s) => {
            const ia = (s.sourcePayload || {}).impactAssessment;
            const listed = ia && typeof ia === 'object' ? (ia as Record<string, any>).impactedSections : null;
            return Array.isArray(listed) ? listed.map((x: unknown) => String(x)) : [];
          })
          .filter(Boolean),
      ),
    ];
    if (changeTable) tables.push(changeTable);
    tables.push(...process.tables);
    const dpProcessDescription = val(m, 'drugProductProcessDescription');
    const dpProcessControls = val(m, 'drugProductProcessControls');
    if (dpProcessDescription || dpProcessControls) {
      tables.push(kvTable('Manufacturing Process Summary', {
        'Process Description': dpProcessDescription,
        'In-Process Controls': dpProcessControls,
      }));
    }
    if (legacySteps.length > 0) {
      tables.push({
        title: 'Manufacturing Process Steps (drug product record)',
        headers: ['Step', 'Unit Operation', 'In-Process Controls', 'Critical Process Parameters'],
        rows: legacySteps.map((step: any, idx: number) => {
          if (typeof step === 'object' && step !== null) {
            return [
              String(idx + 1),
              step.operation || step.name || 'Unspecified',
              step.ipc || step.inProcessControls || '—',
              step.cpp || step.criticalParams || '—',
            ];
          }
          return [String(idx + 1), String(step), '—', '—'];
        }),
      });
    }
    return {
      narrative: `The drug product is manufactured according to the batch formula described below. ` +
        (batchNum ? `Representative batch: ${batchNum}` : '') +
        (batchSize ? ` (batch size: ${batchSize})` : '') +
        `. ` +
        (manufacturingSite ? `Manufactured at: ${manufacturingSite}. ` : '') +
        process.narrative +
        (legacySteps.length > 0 ? `The process comprises ${legacySteps.length} unit operations. ` : '') +
        (disposition
          ? `Batch ${releasedBatchNumber || batchNum || '[number not recorded]'} disposition: ${disposition}` +
            (releasedBy ? `, released by ${releasedBy}` : '') +
            (releasedAt ? ` on ${releasedAt.slice(0, 10)}` : '') + `. `
          : '') +
        (changeTable
          ? `${changeTable.rows.length} controlled change(s) are recorded in the change register` +
            (changeSectionsNoted.length > 0
              ? `, of which the impact assessment names ${changeSectionsNoted.join(', ')}`
              : '') +
            `; see the change history table. `
          : '') +
        (pvConclusion ? `Process validation conclusion: ${pvConclusion}.` :
          validationStatus ? `Process validation status: ${validationStatus}.` : ''),
      tables,
    };
  },

  '3.2.P.4': (m) => {
    /* Every recorded material, not the first one. The reads this replaced took a
       single first-match `materialName` / `grade` pair out of a register that
       holds one row per material, so a product using twelve excipients rendered
       one of them and the choice depended on arrival order. */
    const materials = materialRendering(m);
    return { narrative: materials.narrative, tables: materials.tables };
  },

  '3.2.P.5': (m) => {
    const criteria = val(m, 'releaseCriteria');
    // Release and shelf-life limits are DIFFERENT regulatory claims; the spec
    // register records both, and the shelf limit renders under its own label.
    const shelfCriteria = val(m, 'shelfLifeCriteria');
    /* Same plural-methods honesty as 3.2.S.4: one method may be named
       per-row; several point at their own table. */
    const methodSources = m
      .filter((s) => s.sourceType === 'method')
      .map((s) => (s.sourcePayload || {}) as Record<string, any>)
      .filter((p) => p.methodName || p.methodCode || p.technique || p.validationStatus);
    const soleMethod = methodSources.length === 1 ? methodSources[0] : null;
    const method = soleMethod ? String(soleMethod.methodName || soleMethod.methodCode || '') : '';
    const status = soleMethod ? String(soleMethod.validationStatus || '') : '';
    const releaseTests = valArr(m, 'releaseTests');
    const shelfLifeTests = valArr(m, 'shelfLifeTests');
    const dissolutionSpec = valObj(m, 'dissolutionSpecification');
    const impurityLimits = valObj(m, 'impurityLimits');
    const tables: GeneratedTable[] = [];
    // Release/shelf-life specification matrix
    if (releaseTests.length > 0 || shelfLifeTests.length > 0) {
      const allTests = releaseTests.length > 0 ? releaseTests : shelfLifeTests;
      tables.push({
        title: 'Drug Product Specification — Release & Shelf-Life',
        headers: ['Quality Attribute', 'Test Method', 'Release Criteria', 'Shelf-Life Criteria'],
        rows: allTests.map((t: any) => {
          if (typeof t === 'object' && t !== null) {
            return [
              t.attribute || t.test || 'Unknown',
              t.method || method || 'Not specified',
              t.releaseCriteria || t.release || '—',
              t.shelfLifeCriteria || t.shelfLife || '—',
            ];
          }
          return [String(t), method || '—', criteria || '—', shelfCriteria || '—'];
        }),
      });
    } else {
      tables.push(
        kvTable('Drug Product Specification', {
          'Release Criteria': criteria,
          'Shelf-Life Criteria': shelfCriteria,
          'Analytical Method':
            method || (methodSources.length > 1 ? 'See Analytical Methods table' : ''),
          'Validation Status': status,
        }),
      );
    }
    if (methodSources.length > 0) {
      tables.push({
        title: 'Analytical Methods',
        headers: ['Method', 'Technique', 'Validation Status', 'Validated'],
        rows: methodSources.map((p) => [
          String(p.methodName || p.methodCode || 'Unnamed method'),
          String(p.technique || p.methodType || '—'),
          String(p.validationStatus || '—'),
          p.validationDate ? String(p.validationDate).slice(0, 10) : '—',
        ]),
      });
    }
    // §3.2.P.5.4 — the recorded finished-product results themselves.
    const dpBatchTable = batchAnalysesTable(m, 'drug_product');
    if (dpBatchTable) tables.push(dpBatchTable);
    /* A canonical caller may pass a `dissolutionSpecification` object. The
       product's own producer is the dissolution register, rendered here scoped
       to the RELEASE profiles: this section is the acceptance criterion, and
       the development profiles belong to §3.2.P.2. Both sections used to read
       the same four first-match keys, so one record rendered identically into
       both and four different records could each supply one row of a table
       presented as one test. */
    if (dissolutionSpec) {
      tables.push({
        title: 'Dissolution Specification',
        headers: ['Parameter', 'Value'],
        rows: Object.entries(dissolutionSpec).map(([k, v]) => [k, String(v)]),
      });
    }
    const releaseDissolution = dissolutionRendering(m, [DISSOLUTION_RELEASE_PURPOSE], 'release specification');
    tables.push(...releaseDissolution.tables);
    if (impurityLimits) {
      tables.push({
        title: 'Impurity Limits — Drug Product',
        headers: ['Impurity', 'Identification Threshold', 'Qualification Threshold', 'Specification Limit'],
        rows: Object.entries(impurityLimits).map(([impurity, limits]) => {
          const l = typeof limits === 'object' && limits !== null ? limits as Record<string, any> : {};
          return [impurity, String(l.identification || '—'), String(l.qualification || '—'), String(l.specLimit || String(limits))];
        }),
      });
    }
    // §3.2.P.5.5 — the drug-product impurities, assessed against ICH Q3B.
    const dpImpurities = impurityRendering(m, 'drug_product');
    tables.push(...dpImpurities.tables);
    return {
      narrative: `The drug product specification defines release and shelf-life acceptance criteria. ` +
        (method
          ? `Primary analytical method: ${method}. `
          : methodSources.length > 1
            ? `${methodSources.length} analytical methods are registered (see Analytical Methods table). `
            : '') +
        (releaseTests.length > 0 ? `${releaseTests.length} quality attribute(s) are defined for release testing. ` : '') +
        (criteria ? `Release criteria: ${criteria}. ` : '') +
        (shelfCriteria ? `Shelf-life criteria: ${shelfCriteria}. ` : '') +
        batchAnalysesSentence(m, 'drug_product') +
        (dissolutionSpec ? `Dissolution specifications are established per ICH Q6A. ` : '') +
        releaseDissolution.narrative +
        dpImpurities.narrative +
        (status ? `Validation status: ${status}.` : ''),
      tables,
    };
  },

  '3.2.P.6': (m) => referenceStandardSection(m, 'drug_product'),

  '3.2.P.7': (m) => containerClosureSection(m, 'drug_product'),

  '3.2.P.8': (m) => {
    const shelf = val(m, 'shelfLifeClaim');
    const comp = val(m, 'comparabilityStatus');
    const condition = val(m, 'storageCondition');
    const timePoints = valArr(m, 'timePoints');
    // 3.2.P.8 requiredSourceTypes is ['stability','comparability'], so this
    // section fires when ONLY a comparability source is present (no stability
    // study). Claim stability studies / a shelf life only when a stability
    // source is actually present; otherwise report comparability alone.
    const stabilitySources = m.filter((s) => s.sourceType === 'stability');
    const hasStability = stabilitySources.length > 0;
    const hasComparability = m.some((s) => s.sourceType === 'comparability');
    const tables: GeneratedTable[] = [];
    tables.push({
      title: 'Stability Summary — Drug Product',
      headers: ['Parameter', 'Value'],
      rows: [
        ['Shelf Life Claim', shelf || '[not specified]'],
        ['Comparability Status', comp || '[not specified]'],
        ...(condition ? [['Storage Condition', condition]] : []),
        ...(timePoints.length > 0 ? [['Time Points (months)', timePoints.join(', ')]] : []),
      ],
    });
    const compTable = comparabilityTable(m);
    if (compTable) tables.push(compTable);
    let narrative = '';
    if (hasStability) {
      narrative += `Stability studies for the drug product were conducted under ${condition || '[condition not specified]'}` +
        (timePoints.length > 0 ? ` at time points: ${timePoints.join(', ')} months` : '') + `. `;
      narrative += shelf
        ? `A shelf life of ${shelf} is proposed, subject to review of the stability data summarized above. `
        : `The proposed shelf life is subject to review of the stability data summarized above. `;
      narrative += `${stabilityConclusion(stabilitySources, 'drug product')} `;
    } else {
      narrative += `No drug product stability study is present in this section; a shelf life and the stability of the drug product are not established here. `;
    }
    if (hasComparability) {
      narrative += comp
        ? `Comparability assessment status: ${comp}. `
        : `A comparability assessment is included; its status is not specified. `;
      if (compTable) {
        narrative += `${compTable.rows.length} comparability assessment(s) are summarized above with the recorded outcome for each. `;
      }
    }
    return {
      narrative: narrative.trim(),
      tables,
    };
  },

  '3.1': (m) => {
    const name = val(m, 'name');
    const form = val(m, 'dosageFormDescription');
    return {
      narrative: `This section provides a table of contents and introductory overview for Module 3 — Quality. ` +
        (name ? `The drug substance is ${name}. ` : '') +
        (form ? `The drug product is formulated as a ${form}. ` : '') +
        `Detailed information on the drug substance and drug product is provided in subsections 3.2.S and 3.2.P respectively.`,
      tables: [{
        title: 'Module 3 — Table of Contents',
        headers: ['Section', 'Title'],
        rows: [
          ['3.2.S.1', 'General Information'],
          ['3.2.S.2', 'Manufacture (Drug Substance)'],
          ['3.2.S.3', 'Characterisation'],
          ['3.2.S.4', 'Control of Drug Substance'],
          ['3.2.S.5', 'Reference Standards (Drug Substance)'],
          ['3.2.S.6', 'Container Closure System (Drug Substance)'],
          ['3.2.S.7', 'Stability (Drug Substance)'],
          ['3.2.P.1', 'Description and Composition'],
          ['3.2.P.2', 'Pharmaceutical Development'],
          ['3.2.P.3', 'Manufacture (Drug Product)'],
          ['3.2.P.4', 'Control of Excipients'],
          ['3.2.P.5', 'Control of Drug Product'],
          ['3.2.P.6', 'Reference Standards (Drug Product)'],
          ['3.2.P.7', 'Container Closure System (Drug Product)'],
          ['3.2.P.8', 'Stability (Drug Product)'],
          // Appendices (3.2.A.*) and Regional (3.2.R.*) are listed by the
          // module3-extensions composer, which owns those sections with
          // region-specific dispatch. See the MODULE3_SECTION_RULES note above.
        ],
      }],
    };
  },

  '3.3': (m) => {
    const name = val(m, 'name');
    const form = val(m, 'dosageFormDescription');
    /* Primacy is a RECORDED type, never the order sources arrived in. Reading
       one `referenceStandardDescription` with val() named whichever standard
       happened to be first "the primary reference standard" — so a working
       standard recorded before the primary one was stated as primary in the
       dossier while the register correctly called it working. */
    const standards = m
      .filter((s) => s.sourceType === 'reference_standard')
      .map((s) => (s.sourcePayload || {}) as Record<string, any>)
      .filter((p) => String(p.referenceStandardDescription || '').trim());
    const primary = standards.filter((p) => String(p.standardType || '').toLowerCase().includes('primary'));
    const listed = primary.length > 0 ? primary : standards;
    const standardSentence =
      standards.length === 0
        ? ''
        : primary.length > 0
          ? ` Primary reference standard${primary.length > 1 ? 's' : ''}: ${primary.map((p) => String(p.referenceStandardDescription)).join('; ')}.`
          : ` ${standards.length} reference standard(s) are recorded; none is recorded as a primary standard, and primacy is not asserted here: ${standards.map((p) => String(p.referenceStandardDescription)).join('; ')}.`;
    return {
      narrative: `This section provides literature references cited throughout Module 3 for the drug substance` +
        (name ? ` (${name})` : '') +
        ` and drug product` +
        (form ? ` (${form})` : '') +
        `. References include pharmacopoeial monographs, ICH guidelines, and published literature supporting the quality dossier.` +
        standardSentence,
      tables: [{
        title: 'Key References',
        headers: ['Category', 'Reference'],
        rows: [
          ['Pharmacopoeia', 'USP/NF, Ph. Eur., JP (as applicable)'],
          ['ICH Guidelines', 'Q1A-Q1E (Stability), Q2 (Validation), Q3A-Q3D (Impurities), Q6A/Q6B (Specifications)'],
          ['Regulatory', 'FDA Guidance for Industry, EMA Guidelines'],
          // Each standard under the type it was RECORDED as.
          ...listed.map((p) => [
            `${String(p.standardType || 'Reference')} standard`.replace(/^./, (c) => c.toUpperCase()),
            String(p.referenceStandardDescription),
          ]),
        ],
      }],
    };
  },
};

// ── Markdown renderer for tables ───────────────────────────────────────────

/**
 * A cell that cannot break the table it is written into.
 *
 * These tables now carry FREE TEXT a staffer typed — a QC observation, a
 * change description, a comparability outcome — and a newline or a literal
 * `|` in it split one row into two or invented a column, corrupting the
 * governed artifact's content. The text is preserved, not dropped: newlines
 * become spaces and pipes are escaped.
 */
function mdCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?|\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

export function tablesToMarkdown(tables: GeneratedTable[]): string {
  return tables.map((t) => {
    const hdr = `| ${t.headers.map(mdCell).join(' | ')} |`;
    const sep = `| ${t.headers.map(() => '---').join(' | ')} |`;
    const rows = t.rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`).join('\n');
    return `### ${mdCell(t.title)}\n\n${hdr}\n${sep}\n${rows}`;
  }).join('\n\n');
}

// ── Main composition function ──────────────────────────────────────────────────

export function composeModule3FromCanonicalSources(sourceObjects: CanonicalSource[]): ComposedSection[] {
  return MODULE3_SECTION_RULES.map((rule) => {
    /* A retired record feeds nothing — not the tables, not the narrative, not
       the completeness count. The impurity and dissolution renderers each
       filtered retirement out of their own tables, and the section around them
       still counted the retired row's fields as available: a retired impurity
       could satisfy §3.2.S.3's impurity requirement while appearing nowhere in
       the section it completed. Retirement is a status no source type uses for
       anything else, so the rule belongs here, once. */
    const inScope = sourceObjects.filter((s) => rule.requiredSourceTypes.includes(s.sourceType));
    const matched = inScope.filter(
      (s) => String((s.sourcePayload || {}).status ?? '').trim().toLowerCase() !== 'retired',
    );
    const retiredCount = inScope.length - matched.length;
    const structuredPayload = {
      sectionKey: rule.sectionKey,
      sourceTypes: rule.requiredSourceTypes,
      sourceObjects: matched.map((m) => ({ type: m.sourceType, payload: m.sourcePayload })),
    };

    // A field is "available" only when at least one matched source carries a
    // non-empty value for it. Otherwise the section can report 100% complete
    // while the rendered narrative shows "[name not provided]" placeholders.
    // (Falsely-green dashboards are worse than missing-data dashboards.)
    const isPresent = (v: unknown) => v !== undefined && v !== null && v !== '';
    const availableFields = new Set<string>();
    for (const m of matched) {
      const payload = m.sourcePayload || {};
      for (const [k, v] of Object.entries(payload)) {
        if (isPresent(v)) availableFields.add(k);
      }
    }
    const missingInputs = rule.requiredFields.filter((field) => !availableFields.has(field));
    const completeness = rule.requiredFields.length === 0
      ? 100
      : Math.round(((rule.requiredFields.length - missingInputs.length) / rule.requiredFields.length) * 100);

    const lineage = matched.map((m) => ({
      sourceObjectId: m.id,
      sourceHashAtCompile: m.sourceHash || createSourceHash(m.sourcePayload),
    }));

    // Generate real narrative and tables from section-specific generators
    const generator = SECTION_GENERATORS[rule.sectionKey];
    let narrativeDraft: string;
    let tables: GeneratedTable[];

    if (generator && matched.length > 0) {
      const generated = generator(matched);
      narrativeDraft = generated.narrative;
      tables = generated.tables;
    } else if (matched.length === 0) {
      /* "No data" and "the only data is retired" are different states, and a
         reviewer who cannot tell them apart will go looking for a record that
         is right there, superseded. */
      narrativeDraft = `Section ${rule.sectionKey} has no source data available. ` +
        (retiredCount > 0
          ? `${retiredCount} recorded source(s) for this section are retired and do not compose. `
          : '') +
        `Required inputs: ${rule.requiredFields.join(', ')}.`;
      tables = [];
    } else {
      narrativeDraft = `Section ${rule.sectionKey} assembled from ${matched.length} source object(s). ` +
        (missingInputs.length > 0 ? `Missing inputs: ${missingInputs.join(', ')}.` : 'All required inputs present.');
      tables = [];
    }

    return {
      sectionKey: rule.sectionKey,
      sectionPath: rule.sectionKey,
      structuredPayload,
      narrativeDraft,
      tables,
      completeness,
      missingInputs,
      lineage,
    };
  });
}

export function impactedSectionsForSourceType(changedSourceType: CmcSourceType): string[] {
  return MODULE3_SECTION_RULES
    .filter((rule) => rule.requiredSourceTypes.includes(changedSourceType))
    .map((rule) => rule.sectionKey);
}
