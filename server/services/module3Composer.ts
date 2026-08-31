import { createSourceHash } from './cmc-module3-compiler';

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
  { sectionKey: '3.2.S.4', requiredSourceTypes: ['specification', 'method', 'impurity_profile', 'qc_result'], requiredFields: ['acceptanceCriteria', 'validationStatus', 'batchAnalyses'] },
  { sectionKey: '3.2.S.5', requiredSourceTypes: ['drug_substance', 'reference_standard'], requiredFields: ['referenceStandardDescription', 'certificateOfAnalysis'] },
  { sectionKey: '3.2.S.6', requiredSourceTypes: ['container_closure'], requiredFields: ['containerDescription', 'closureDescription', 'suitabilityJustification'] },
  { sectionKey: '3.2.S.7', requiredSourceTypes: ['stability'], requiredFields: ['timePoints', 'storageCondition'] },
  // --- Drug Product (P) subsections ---
  { sectionKey: '3.2.P.1', requiredSourceTypes: ['drug_product', 'formulation_record'], requiredFields: ['dosageFormDescription', 'composition', 'strength'] },
  { sectionKey: '3.2.P.2', requiredSourceTypes: ['drug_product', 'drug_substance', 'comparability', 'formulation_record', 'dissolution_profile'], requiredFields: ['formulationDevelopment', 'manufacturingProcessDev', 'containerClosureStudies'] },
  { sectionKey: '3.2.P.3', requiredSourceTypes: ['drug_product', 'batch', 'change_control', 'process_validation'], requiredFields: ['formulation', 'batchNumber'] },
  { sectionKey: '3.2.P.4', requiredSourceTypes: ['excipient', 'raw_material_spec'], requiredFields: ['excipientSpecifications', 'excipientAnalyticalProcedures'] },
  { sectionKey: '3.2.P.5', requiredSourceTypes: ['specification', 'method', 'dissolution_profile', 'impurity_profile', 'qc_result'], requiredFields: ['releaseCriteria', 'methodName', 'batchAnalyses'] },
  { sectionKey: '3.2.P.6', requiredSourceTypes: ['drug_product', 'reference_standard'], requiredFields: ['referenceStandardDescription', 'certificateOfAnalysis'] },
  { sectionKey: '3.2.P.7', requiredSourceTypes: ['container_closure'], requiredFields: ['containerDescription', 'closureDescription', 'suitabilityJustification'] },
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

// ── Helpers ─────────────────────────────��──────────────────────────────────────

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

function kvTable(title: string, data: Record<string, any>): GeneratedTable {
  return {
    title,
    headers: ['Property', 'Value'],
    rows: Object.entries(data)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]),
  };
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
        (impurityLimits ? `Impurity limits are established for ${Object.keys(impurityLimits).length} identified impurity/ies per ICH Q3A. ` :
          impurities.length > 0 ? `${impurities.length} specified impurity/ies characterized. ` : '') +
        (qualBasis ? `Qualification basis per ICH Q3A: ${qualBasis}. ` : ''),
      tables,
    };
  },

  '3.2.S.5': (m) => {
    const desc = val(m, 'referenceStandardDescription');
    const coa = val(m, 'certificateOfAnalysis');
    return {
      narrative: `The primary reference standard used for testing of the drug substance is: ${desc || '[not specified]'}. ` +
        (coa ? `Certificate of Analysis: ${coa}.` : ''),
      tables: [kvTable('Reference Standards — Drug Substance', { 'Reference Standard': desc, 'Certificate of Analysis': coa })],
    };
  },

  '3.2.S.6': (m) => {
    const container = val(m, 'containerDescription');
    const closure = val(m, 'closureDescription');
    const justification = val(m, 'suitabilityJustification');
    return {
      narrative: `The container closure system for the drug substance consists of ${container || '[container not specified]'} ` +
        `with ${closure || '[closure not specified]'}. ` +
        (justification ? `Suitability justification: ${justification}.` : ''),
      tables: [kvTable('Container Closure System — Drug Substance', { 'Container': container, 'Closure': closure, 'Suitability Justification': justification })],
    };
  },

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
    const disposition = val(m, 'disposition');
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
        (disposition ? `Batch disposition: ${disposition}. ` : '') +
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
        (dissolutionSpec || dissCondition ? `Dissolution specifications are established per ICH Q6A. ` : '') +
        (impurities.length > 0 ? `${impurities.length} specified impurity/ies characterized` + (qualBasis ? ` (${qualBasis})` : '') + `. ` : '') +
        (status ? `Validation status: ${status}.` : ''),
      tables,
    };
  },

  '3.2.P.6': (m) => {
    const desc = val(m, 'referenceStandardDescription');
    const coa = val(m, 'certificateOfAnalysis');
    return {
      narrative: `The primary reference standard used for testing of the drug product is: ${desc || '[not specified]'}. ` +
        (coa ? `Certificate of Analysis: ${coa}.` : ''),
      tables: [kvTable('Reference Standards — Drug Product', { 'Reference Standard': desc, 'Certificate of Analysis': coa })],
    };
  },

  '3.2.P.7': (m) => {
    const container = val(m, 'containerDescription');
    const closure = val(m, 'closureDescription');
    const justification = val(m, 'suitabilityJustification');
    return {
      narrative: `The container closure system for the drug product consists of ${container || '[container not specified]'} ` +
        `with ${closure || '[closure not specified]'}. ` +
        (justification ? `Suitability justification: ${justification}.` : ''),
      tables: [kvTable('Container Closure System — Drug Product', { 'Container': container, 'Closure': closure, 'Suitability Justification': justification })],
    };
  },

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
    const refStd = val(m, 'referenceStandardDescription');
    return {
      narrative: `This section provides literature references cited throughout Module 3 for the drug substance` +
        (name ? ` (${name})` : '') +
        ` and drug product` +
        (form ? ` (${form})` : '') +
        `. References include pharmacopoeial monographs, ICH guidelines, and published literature supporting the quality dossier.` +
        (refStd ? ` Primary reference standard: ${refStd}.` : ''),
      tables: [{
        title: 'Key References',
        headers: ['Category', 'Reference'],
        rows: [
          ['Pharmacopoeia', 'USP/NF, Ph. Eur., JP (as applicable)'],
          ['ICH Guidelines', 'Q1A-Q1E (Stability), Q2 (Validation), Q3A-Q3D (Impurities), Q6A/Q6B (Specifications)'],
          ['Regulatory', 'FDA Guidance for Industry, EMA Guidelines'],
          ...(refStd ? [['Reference Standard', refStd]] : []),
        ],
      }],
    };
  },
};

// ── Markdown renderer for tables ───────────────────────────────���───────────────

export function tablesToMarkdown(tables: GeneratedTable[]): string {
  return tables.map((t) => {
    const hdr = `| ${t.headers.join(' | ')} |`;
    const sep = `| ${t.headers.map(() => '---').join(' | ')} |`;
    const rows = t.rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
    return `### ${t.title}\n\n${hdr}\n${sep}\n${rows}`;
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
