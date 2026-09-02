import { createSourceHash } from './cmc-module3-compiler';
import {
  normalizeMaterialScope,
  scopeCovers,
  type CmcMaterialScope,
} from '../../shared/cmc/material-scope';

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
  { sectionKey: '3.2.S.2', requiredSourceTypes: ['drug_substance', 'manufacturing_process', 'process_validation'], requiredFields: ['manufacturingRoute', 'processDescription', 'processControls'] },
  { sectionKey: '3.2.S.3', requiredSourceTypes: ['drug_substance', 'characterization', 'impurity_profile'], requiredFields: ['structuralElucidation', 'physicochemicalProperties', 'biologicalActivity'] },
  /* `drugSubstanceBatchAnalyses`, not the generic `batchAnalyses`: the
     renderer files a finished-product result to §3.2.P.5.4 only, so counting
     it here turned this section green on a table it never renders. The QC
     mapper decides the side once and emits the matching key. */
  { sectionKey: '3.2.S.4', requiredSourceTypes: ['specification', 'method', 'impurity_profile', 'qc_result'], requiredFields: ['acceptanceCriteria', 'validationStatus', 'drugSubstanceBatchAnalyses'] },
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
  { sectionKey: '3.2.P.1', requiredSourceTypes: ['drug_product', 'formulation_record'], requiredFields: ['dosageFormDescription', 'composition', 'strength'] },
  { sectionKey: '3.2.P.2', requiredSourceTypes: ['drug_product', 'drug_substance', 'comparability', 'formulation_record', 'dissolution_profile', 'container_closure'], requiredFields: ['formulationDevelopment', 'manufacturingProcessDev', 'containerClosureStudies'] },
  { sectionKey: '3.2.P.3', requiredSourceTypes: ['drug_product', 'batch', 'change_control', 'process_validation'], requiredFields: ['formulation', 'batchNumber'] },
  { sectionKey: '3.2.P.4', requiredSourceTypes: ['excipient', 'raw_material_spec'], requiredFields: ['excipientSpecifications', 'excipientAnalyticalProcedures'] },
  { sectionKey: '3.2.P.5', requiredSourceTypes: ['specification', 'method', 'dissolution_profile', 'impurity_profile', 'qc_result'], requiredFields: ['releaseCriteria', 'methodName', 'drugProductBatchAnalyses'] },
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

function readStabilitySignal(stabilitySources: CanonicalSource[]): StabilityOutcome {
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
      String(p.passFailStatus || 'pending'),
      // §11 two-person review: an unreviewed result is not releasable
      // evidence, and a reader must be able to tell which it is looking at.
      p.reviewed ? 'reviewed' : 'not reviewed',
    ]),
  };
}

/** A sentence about the recorded results, or '' when none were recorded. */
function batchAnalysesSentence(
  sources: CanonicalSource[],
  side: 'drug_substance' | 'drug_product',
): string {
  const rows = qcResultRows(sources, side);
  if (rows.length === 0) return '';
  const passed = rows.filter((p) => String(p.passFailStatus || '').toLowerCase() === 'pass').length;
  const failed = rows.filter((p) => String(p.passFailStatus || '').toLowerCase() === 'fail').length;
  const pending = rows.length - passed - failed;
  const unreviewed = rows.filter((p) => !p.reviewed).length;
  return (
    `${rows.length} recorded QC result(s) are reported in the batch analyses table: ` +
    `${passed} conforming, ${failed} out of specification, ${pending} pending. ` +
    (failed > 0
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
): Array<Record<string, any>> {
  return sources
    .filter((s) => s.sourceType === sourceType)
    .map((s) => (s.sourcePayload || {}) as Record<string, any>)
    .filter((p) => scopeCovers(normalizeMaterialScope(p.scope, fallback), side));
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
        (pvStatus ? `Process validation status: ${pvStatus}` + (pvProtocol ? ` (protocol: ${pvProtocol})` : '') + `. ` : '') +
        (pvBatches ? `${pvBatches} consecutive batch(es) validated.` : ''),
      tables,
    };
  },

  '3.2.S.3': (m) => {
    const struct = val(m, 'structuralElucidation');
    const phys = val(m, 'physicochemicalProperties');
    const bio = val(m, 'biologicalActivity');
    const impurities = valArr(m, 'impurities');
    const qualBasis = val(m, 'qualificationBasis');
    const tables: GeneratedTable[] = [];
    tables.push(kvTable('Characterisation Summary', { 'Structural Elucidation': struct, 'Physicochemical Properties': phys, 'Biological Activity': bio }));
    if (impurities.length > 0) {
      tables.push({
        title: 'Impurity Profile — Drug Substance',
        headers: ['Impurity', 'Observed Level', 'Specification Limit', 'Identification'],
        rows: impurities.map((imp: any) => [
          imp.impurityName || 'Unknown',
          imp.observedLevel !== undefined ? `${imp.observedLevel}%` : '—',
          imp.specLimit !== undefined ? `${imp.specLimit}%` : '—',
          imp.identification || '—',
        ]),
      });
    }
    return {
      narrative: `Structural elucidation of the drug substance was confirmed by ${struct || '[methods not specified]'}. ` +
        (phys ? `Physicochemical properties: ${phys}. ` : '') +
        (bio ? `Biological activity: ${bio}. ` : '') +
        (impurities.length > 0 ? `${impurities.length} impurity/ies have been identified and characterized. ` : '') +
        (qualBasis ? `Qualification basis: ${qualBasis}.` : ''),
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
    const impurities = valArr(m, 'impurities');
    const qualBasis = val(m, 'qualificationBasis');
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
    } else if (impurities.length > 0) {
      tables.push({
        title: 'Impurity Limits — Drug Substance',
        headers: ['Impurity', 'Observed Level', 'Specification Limit', 'Identification'],
        rows: impurities.map((imp: any) => [
          imp.impurityName || 'Unknown',
          imp.observedLevel !== undefined ? `${imp.observedLevel}%` : '—',
          imp.specLimit !== undefined ? `${imp.specLimit}%` : '—',
          imp.identification || '—',
        ]),
      });
    }
    return {
      narrative: `The drug substance specification defines acceptance criteria for quality attributes. ` +
        (statusSummary
          ? methodSources.length > 1
            ? `Analytical method validation status: ${statusSummary}. `
            : `Analytical methods are ${statusSummary}. `
          : '') +
        (criteria ? `${Object.keys(criteria).length} test(s) are defined in the specification. ` : '') +
        batchAnalysesSentence(m, 'drug_substance') +
        (impurityLimits ? `Impurity limits are established for ${Object.keys(impurityLimits).length} identified impurity/ies per ICH Q3A. ` :
          impurities.length > 0 ? `${impurities.length} specified impurity/ies characterized. ` : '') +
        (qualBasis ? `Qualification basis per ICH Q3A: ${qualBasis}. ` : ''),
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
    const signal = readStabilitySignal(m);
    const conclusion =
      signal === 'pass'
        ? `The stability results summarized above remain within the acceptance criteria at the reported time points, supporting stability of the drug substance under the proposed storage conditions.`
        : signal === 'concern'
        ? `The stability results summarized above include out-of-specification or degradation findings; the stability conclusion and proposed storage period are not established by this section and are subject to review of these data.`
        : `The stability conclusion and proposed storage period are subject to review of the stability results summarized above and are not asserted in this section.`;
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
    const formulationName = val(m, 'formulationName');
    const formulationVersion = val(m, 'version');
    const components = valArr(m, 'components');
    const tables: GeneratedTable[] = [];
    tables.push(kvTable('Drug Product Description and Composition', {
      'Dosage Form': form, 'Strength': strength,
      ...(formulationName ? { 'Formulation': formulationName } : {}),
      ...(formulationVersion ? { 'Formulation Version': formulationVersion } : {}),
      'Composition': comp,
    }));
    if (components.length > 0) {
      tables.push({
        title: 'Quantitative Composition',
        headers: ['Component', 'Function / Role', 'Amount per Unit'],
        rows: components.map((c: any) => [
          c.component || c.name || 'Unknown',
          c.role || c.function || '—',
          c.amount || '—',
        ]),
      });
    }
    return {
      narrative: `The drug product is a ${form || '[dosage form not specified]'} ` +
        (strength ? `with a strength of ${strength}. ` : '. ') +
        (formulationName ? `Formulation: ${formulationName}` + (formulationVersion ? ` (${formulationVersion})` : '') + `. ` : '') +
        (components.length > 0 ? `The formulation comprises ${components.length} component(s). ` : '') +
        (comp ? `Composition: ${comp}.` : ''),
      tables,
    };
  },

  '3.2.P.2': (m) => {
    const formDev = val(m, 'formulationDevelopment');
    const mfgDev = val(m, 'manufacturingProcessDev');
    const ccStudies = val(m, 'containerClosureStudies');
    const devHistory = val(m, 'developmentHistory');
    const dissCondition = val(m, 'condition');
    const dissSpec = val(m, 'specification');
    const dissResults = valArr(m, 'results');
    const dissPassFail = val(m, 'passFail');
    const tables: GeneratedTable[] = [];
    tables.push(kvTable('Pharmaceutical Development Summary', {
      'Formulation Development': formDev,
      'Manufacturing Process Development': mfgDev,
      'Container Closure Studies': ccStudies,
      ...(devHistory ? { 'Development History': devHistory } : {}),
    }));
    if (dissCondition || dissResults.length > 0) {
      const dissRows: string[][] = [];
      if (dissCondition) dissRows.push(['Test Condition', dissCondition]);
      if (dissSpec) dissRows.push(['Specification', dissSpec]);
      for (const r of dissResults) {
        if (typeof r === 'object' && r !== null) {
          dissRows.push([r.timepoint || 'N/A', r.result || '—']);
        }
      }
      if (dissPassFail) dissRows.push(['Overall Result', dissPassFail]);
      tables.push({
        title: 'Dissolution Profile — Development',
        headers: ['Parameter', 'Value'],
        rows: dissRows,
      });
    }
    return {
      narrative: `Pharmaceutical development studies were conducted to support the proposed formulation and manufacturing process. ` +
        (formDev ? `Formulation development: ${formDev}. ` : '') +
        (mfgDev ? `Manufacturing process development: ${mfgDev}. ` : '') +
        (ccStudies ? `Container closure studies: ${ccStudies}. ` : '') +
        (devHistory ? `Development history: ${devHistory}. ` : '') +
        (dissCondition ? `Dissolution testing performed under: ${dissCondition}` + (dissPassFail ? ` — ${dissPassFail}` : '') + `. ` : ''),
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
    const processSteps = valArr(m, 'processSteps');
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
    // Manufacturing process flow if steps are provided
    if (processSteps.length > 0) {
      tables.push({
        title: 'Manufacturing Process Steps',
        headers: ['Step', 'Unit Operation', 'In-Process Controls', 'Critical Process Parameters'],
        rows: processSteps.map((step: any, idx: number) => {
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
        (processSteps.length > 0 ? `The process comprises ${processSteps.length} unit operations. ` : '') +
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
    const specs = val(m, 'excipientSpecifications');
    const procs = val(m, 'excipientAnalyticalProcedures');
    const rmName = val(m, 'materialName');
    const rmGrade = val(m, 'grade');
    const rmSupplier = val(m, 'supplier');
    const rmCompliance = val(m, 'compendialCompliance');
    const rmTestParams = valArr(m, 'testParameters');
    const tables: GeneratedTable[] = [];
    tables.push(kvTable('Control of Excipients', { 'Excipient Specifications': specs, 'Analytical Procedures': procs }));
    if (rmName || rmGrade) {
      const rmRows: string[][] = [];
      if (rmName) rmRows.push(['Material Name', rmName]);
      if (rmGrade) rmRows.push(['Grade', rmGrade]);
      if (rmSupplier) rmRows.push(['Supplier', rmSupplier]);
      if (rmCompliance) rmRows.push(['Compendial Compliance', rmCompliance]);
      if (rmTestParams.length > 0) rmRows.push(['Test Parameters', rmTestParams.join('; ')]);
      tables.push({
        title: 'Raw Material / Starting Material Specifications',
        headers: ['Property', 'Value'],
        rows: rmRows,
      });
    }
    return {
      narrative: `Excipients used in the drug product formulation are controlled to compendial or in-house specifications. ` +
        (specs ? `Excipient specifications: ${specs}. ` : '') +
        (procs ? `Analytical procedures: ${procs}. ` : '') +
        (rmName ? `Raw material specifications are established for ${rmName}` + (rmGrade ? ` (${rmGrade})` : '') + `. ` : '') +
        (rmCompliance ? `Compendial compliance: ${rmCompliance}.` : ''),
      tables,
    };
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
    // Fields from dissolution_profile source type
    const dissCondition = val(m, 'condition');
    const dissSpecStr = val(m, 'specification');
    const dissResults = valArr(m, 'results');
    const dissPassFail = val(m, 'passFail');
    // Fields from impurity_profile source type
    const impurities = valArr(m, 'impurities');
    const qualBasis = val(m, 'qualificationBasis');
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
    // Dissolution specification (from dissolutionSpecification object or dissolution_profile source)
    if (dissolutionSpec) {
      tables.push({
        title: 'Dissolution Specification',
        headers: ['Parameter', 'Value'],
        rows: Object.entries(dissolutionSpec).map(([k, v]) => [k, String(v)]),
      });
    } else if (dissCondition || dissResults.length > 0) {
      const dissRows: string[][] = [];
      if (dissCondition) dissRows.push(['Test Condition', dissCondition]);
      if (dissSpecStr) dissRows.push(['Specification', dissSpecStr]);
      for (const r of dissResults) {
        if (typeof r === 'object' && r !== null) {
          dissRows.push([r.timepoint || 'N/A', r.result || '—']);
        }
      }
      if (dissPassFail) dissRows.push(['Pass/Fail', dissPassFail]);
      tables.push({
        title: 'Dissolution Profile',
        headers: ['Parameter', 'Value'],
        rows: dissRows,
      });
    }
    // Impurity limits (from impurityLimits object or impurity_profile source)
    if (impurityLimits) {
      tables.push({
        title: 'Impurity Limits — Drug Product',
        headers: ['Impurity', 'Identification Threshold', 'Qualification Threshold', 'Specification Limit'],
        rows: Object.entries(impurityLimits).map(([impurity, limits]) => {
          const l = typeof limits === 'object' && limits !== null ? limits as Record<string, any> : {};
          return [impurity, String(l.identification || '—'), String(l.qualification || '—'), String(l.specLimit || String(limits))];
        }),
      });
    } else if (impurities.length > 0) {
      tables.push({
        title: 'Impurity Profile — Drug Product',
        headers: ['Impurity', 'Observed Level', 'Specification Limit', 'Identification'],
        rows: impurities.map((imp: any) => [
          imp.impurityName || 'Unknown',
          imp.observedLevel !== undefined ? `${imp.observedLevel}%` : '—',
          imp.specLimit !== undefined ? `${imp.specLimit}%` : '—',
          imp.identification || '—',
        ]),
      });
    }
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
        (dissolutionSpec || dissCondition ? `Dissolution specifications are established per ICH Q6A. ` : '') +
        (impurities.length > 0 ? `${impurities.length} specified impurity/ies characterized` + (qualBasis ? ` (${qualBasis})` : '') + `. ` : '') +
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
      const signal = readStabilitySignal(stabilitySources);
      narrative += signal === 'pass'
        ? `The stability results summarized above remain within the acceptance criteria at the reported time points, supporting stability of the drug product under the proposed storage conditions. `
        : signal === 'concern'
        ? `The stability results summarized above include out-of-specification or degradation findings; the stability conclusion is not established by this section and is subject to review of these data. `
        : `The stability conclusion is subject to review of the stability results summarized above and is not asserted in this section. `;
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
    const matched = sourceObjects.filter((s) => rule.requiredSourceTypes.includes(s.sourceType));
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
      narrativeDraft = `Section ${rule.sectionKey} has no source data available. ` +
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
