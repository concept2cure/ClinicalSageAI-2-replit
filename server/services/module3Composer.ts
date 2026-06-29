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
  | 'formulation_record';

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
  { sectionKey: '3.2.S.4', requiredSourceTypes: ['specification', 'method', 'impurity_profile'], requiredFields: ['acceptanceCriteria', 'validationStatus'] },
  { sectionKey: '3.2.S.5', requiredSourceTypes: ['drug_substance', 'reference_standard'], requiredFields: ['referenceStandardDescription', 'certificateOfAnalysis'] },
  { sectionKey: '3.2.S.6', requiredSourceTypes: ['container_closure'], requiredFields: ['containerDescription', 'closureDescription', 'suitabilityJustification'] },
  { sectionKey: '3.2.S.7', requiredSourceTypes: ['stability'], requiredFields: ['timePoints', 'storageCondition'] },
  // --- Drug Product (P) subsections ---
  { sectionKey: '3.2.P.1', requiredSourceTypes: ['drug_product', 'formulation_record'], requiredFields: ['dosageFormDescription', 'composition', 'strength'] },
  { sectionKey: '3.2.P.2', requiredSourceTypes: ['drug_product', 'drug_substance', 'comparability', 'formulation_record', 'dissolution_profile'], requiredFields: ['formulationDevelopment', 'manufacturingProcessDev', 'containerClosureStudies'] },
  { sectionKey: '3.2.P.3', requiredSourceTypes: ['drug_product', 'batch', 'change_control', 'process_validation'], requiredFields: ['formulation', 'batchNumber'] },
  { sectionKey: '3.2.P.4', requiredSourceTypes: ['excipient', 'raw_material_spec'], requiredFields: ['excipientSpecifications', 'excipientAnalyticalProcedures'] },
  { sectionKey: '3.2.P.5', requiredSourceTypes: ['specification', 'method', 'dissolution_profile', 'impurity_profile'], requiredFields: ['releaseCriteria', 'methodName'] },
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
    const desc = val(m, 'processDescription');
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
    const status = val(m, 'validationStatus');
    const methodName = val(m, 'methodName');
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
          methodName || 'Per monograph',
          String(crit),
          status || 'Pending',
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
        (status ? `Analytical methods are ${status}. ` : '') +
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
    return {
      narrative: `Stability studies for the drug substance were conducted under ${condition || '[condition not specified]'} ` +
        (timePoints.length > 0 ? `at time points: ${timePoints.join(', ')} months. ` : '. ') +
        (batchesStudied.length > 0 ? `${batchesStudied.length} batch(es) were placed on stability. ` : '') +
        `Results demonstrate that the drug substance is stable under the proposed storage conditions.`,
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
    const method = val(m, 'methodName');
    const status = val(m, 'validationStatus');
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
              t.method || method || 'Per monograph',
              t.releaseCriteria || t.release || '—',
              t.shelfLifeCriteria || t.shelfLife || '—',
            ];
          }
          return [String(t), method || '—', criteria || '—', '—'];
        }),
      });
    } else {
      tables.push(kvTable('Drug Product Specification', { 'Release Criteria': criteria, 'Analytical Method': method, 'Validation Status': status }));
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
        (method ? `Primary analytical method: ${method}. ` : '') +
        (releaseTests.length > 0 ? `${releaseTests.length} quality attribute(s) are defined for release testing. ` : '') +
        (criteria ? `Release criteria: ${criteria}. ` : '') +
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
    return {
      narrative: `Stability studies support a shelf life of ${shelf || '[not specified]'} for the drug product. ` +
        (comp ? `Comparability assessment status: ${comp}. ` : '') +
        `The drug product is stable under the proposed storage conditions.`,
      tables,
    };
  },

  // The 3.2.A.* (Appendices) and 3.2.R.* (Regional) generators below are retained
  // for reference/possible reuse but are intentionally NOT wired into
  // MODULE3_SECTION_RULES — those sections are composed by module3-extensions.ts
  // with region-specific dispatch. Looked up by sectionKey only, so they are
  // dormant unless a matching rule is (re)added (which would re-introduce the
  // duplicate-appendix regression these were removed to fix).
  '3.2.A.1': (m) => {
    const mfgSite = val(m, 'manufacturingSite');
    const route = val(m, 'manufacturingRoute');
    const processDesc = val(m, 'processDescription');
    const container = val(m, 'containerDescription');
    const closure = val(m, 'closureDescription');
    const justification = val(m, 'suitabilityJustification');
    const processSteps = valArr(m, 'processSteps');
    const tables: GeneratedTable[] = [];
    tables.push(kvTable('Facilities Summary', {
      'Manufacturing Site': mfgSite,
      'Synthetic/Manufacturing Route': route,
      'Process Description': processDesc,
    }));
    tables.push(kvTable('Primary Equipment / Container Closure', {
      'Primary Container': container,
      'Closure': closure,
      'Suitability Justification': justification,
    }));
    if (processSteps.length > 0) {
      tables.push({
        title: 'Unit Operations and Associated Equipment',
        headers: ['Step', 'Unit Operation', 'Equipment / Facility'],
        rows: processSteps.map((step: any, idx: number) => {
          if (typeof step === 'object' && step !== null) {
            return [
              String(idx + 1),
              step.operation || step.name || 'Unspecified',
              step.equipment || step.facility || mfgSite || '—',
            ];
          }
          return [String(idx + 1), String(step), mfgSite || '—'];
        }),
      });
    }
    return {
      narrative: `Per ICH M4Q, Section 3.2.A.1 (Facilities and Equipment) describes the facilities, equipment, and ` +
        `related controls used in the manufacture of the drug substance and drug product. ` +
        (mfgSite ? `Manufacturing operations are performed at ${mfgSite}. ` : 'Manufacturing site not yet recorded. ') +
        (route ? `The manufacturing route is: ${route}. ` : '') +
        (processDesc ? `Process overview: ${processDesc}. ` : '') +
        `\n\nPrimary container closure equipment and packaging components used during manufacture and storage are ` +
        (container ? `${container}` + (closure ? ` with ${closure}` : '') + `. ` : `not yet specified. `) +
        (justification ? `Suitability of the equipment and packaging is supported by: ${justification}. ` : '') +
        `\n\nFacility cleaning, equipment qualification, and changeover procedures follow site SOPs and current GMP requirements. ` +
        `Cross-contamination controls, environmental monitoring, and utilities (HVAC, water, compressed gases) ` +
        `meet the standards applicable to the dosage form.`,
      tables,
    };
  },

  '3.2.A.2': (m) => {
    const name = val(m, 'name');
    const route = val(m, 'manufacturingRoute');
    const processDesc = val(m, 'processDescription');
    const biologicalOrigin = val(m, 'biologicalOrigin');
    const cellLine = val(m, 'cellLine');
    const sourceOrganism = val(m, 'sourceOrganism');
    const viralSafety = val(m, 'viralSafetyEvaluation');
    const tseStatus = val(m, 'tseStatus');
    const modality = val(m, 'modality'); // 'small_molecule' | 'biologic' (preferred explicit signal)

    // Detect biological origin. Prefer an explicit 'modality' field on the
    // drug substance source; fall back to a heuristic regex only when no
    // structured signal is present. Regex uses word boundaries and concrete
    // biologic tokens to avoid false positives on chemical drug substances
    // whose name or processDescription incidentally mentions 'tissue' or
    // 'plasma' (e.g. 'tissue paper packaging', 'plasma etching').
    const explicitSmallMolecule = /^(small[-_ ]?molecule|synthetic|chemical)$/i.test(modality);
    const explicitBiologic = /^biologic(al)?$/i.test(modality);
    const biologicHeuristic =
      /\b(biologic|recombinant|monoclonal|vaccine|fermentation|mammalian)\b|\bmAb\b|\bcell[\s-]*line\b|\b(human|animal)\s*tissue\b|\bplasma[-\s]derived\b/i
        .test(`${route} ${processDesc} ${name}`);
    const isBiologic =
      explicitBiologic ||
      (!explicitSmallMolecule &&
        !!(biologicalOrigin || cellLine || sourceOrganism || viralSafety || tseStatus || biologicHeuristic));

    if (!isBiologic) {
      return {
        narrative: `Per ICH M4Q, Section 3.2.A.2 (Adventitious Agents Safety Evaluation) addresses viral, ` +
          `bacterial, fungal, mycoplasma, and TSE/BSE safety for biologically-derived materials. ` +
          `\n\nNot applicable for chemical drug substances. ` +
          (name ? `The drug substance ${name} is synthesized via ${route || 'a chemical route'} ` : 'The drug substance is produced via a chemical synthetic route ') +
          `with no animal- or human-derived raw materials, no cell-line propagation, and no fermentation step. ` +
          `Accordingly, an adventitious agents safety evaluation is not required. ` +
          `\n\nRaw materials are controlled per 3.2.S.2.3 and excipients per 3.2.P.4. ` +
          `Any future change to a biologically-derived starting material would trigger re-assessment of this section.`,
        tables: [kvTable('Adventitious Agents Safety Evaluation', {
          'Applicability': 'Not applicable — chemical drug substance',
          'Drug Substance': name || '—',
          'Manufacturing Route': route || '—',
          'Biological Origin': 'None',
        })],
      };
    }

    const tables: GeneratedTable[] = [];
    tables.push(kvTable('Adventitious Agents Safety — Source Materials', {
      'Drug Substance': name,
      'Biological Origin': biologicalOrigin,
      'Source Organism / Cell Line': sourceOrganism || cellLine,
      'Manufacturing Route': route,
      'TSE/BSE Status': tseStatus,
    }));
    if (viralSafety) {
      tables.push(kvTable('Viral Safety Evaluation Summary', {
        'Evaluation': viralSafety,
        'Reference': 'ICH Q5A(R2) — Viral Safety Evaluation of Biotechnology Products',
      }));
    }
    return {
      narrative: `Per ICH M4Q and ICH Q5A(R2), Section 3.2.A.2 (Adventitious Agents Safety Evaluation) summarizes ` +
        `the controls implemented to assure freedom from adventitious viral, bacterial, fungal, mycoplasma, and ` +
        `TSE/BSE agents in the drug substance and drug product. ` +
        (name ? `The drug substance ${name} ` : 'The drug substance ') +
        (biologicalOrigin ? `is derived from ${biologicalOrigin}. ` : 'is biologically derived. ') +
        (sourceOrganism || cellLine ? `Source material: ${sourceOrganism || cellLine}. ` : '') +
        `\n\nThe control strategy combines (i) qualification and testing of source materials, ` +
        `(ii) in-process testing for adventitious agents, and (iii) viral clearance / inactivation steps ` +
        `incorporated into the manufacturing process. ` +
        (viralSafety ? `Viral safety evaluation: ${viralSafety}. ` : '') +
        (tseStatus ? `TSE/BSE risk assessment: ${tseStatus}. ` : '') +
        `\n\nCell bank characterization, end-of-production cell testing, and downstream clearance data ` +
        `are referenced in 3.2.S.2.3. Raw materials of animal or human origin (where applicable) are ` +
        `controlled per EMA EMEA/410/01 and 9 CFR.`,
      tables,
    };
  },

  '3.2.A.3': (m) => {
    const comp = val(m, 'composition');
    const formulationName = val(m, 'formulationName');
    const components = valArr(m, 'components');

    // Detect human/animal-origin excipients.
    //
    // Strategy:
    //  (1) Trust an explicit per-component `origin` field when present
    //      ('animal', 'human', 'bovine', 'porcine', ovine, equine, murine,
    //      hamster). Plant/mineral/synthetic origins do NOT trigger this
    //      section.
    //  (2) Fall back to a name-based regex restricted to unambiguously
    //      human/animal tokens. Excluded intentionally:
    //        - 'stearate' — magnesium stearate is overwhelmingly vegetable
    //          grade in modern pharma and CANNOT be inferred animal-origin
    //          from the name alone.
    //        - 'lactose' — should be declared via the structured origin field
    //          (dairy-derived but composition string alone is insufficient).
    //        - 'cholesterol' — can be synthetic or phytosterol-derived.
    //  (3) When the only signal is the regex fallback (not an explicit
    //      origin field), the section is rendered as POTENTIAL / review-required
    //      rather than asserting human/animal origin.
    const explicitAnimalOriginRe = /^(animal|human|bovine|porcine|ovine|equine|murine|hamster|fish|egg|milk)$/i;
    const animalNameRe = /\b(gelatin|tallow|albumin|serum|collagen|chondroitin|heparin|insulin|bovine|porcine|ovine|equine|murine|hamster|lanolin|shellac)\b/i;
    const humanNameRe = /\bhuman[\s-]*(serum|albumin|plasma|tissue|cell|derived)\b/i;

    function classifyComponent(c: any): 'explicit' | 'name-fallback' | 'none' {
      if (typeof c !== 'object' || c === null) return 'none';
      const originField = String(c.origin || c.source || '').trim();
      if (originField && explicitAnimalOriginRe.test(originField)) return 'explicit';
      const text = `${c.component || ''} ${c.name || ''}`;
      if (animalNameRe.test(text) || humanNameRe.test(text)) return 'name-fallback';
      return 'none';
    }

    const explicitOriginComponents = components.filter((c) => classifyComponent(c) === 'explicit');
    const nameFallbackComponents = components.filter((c) => classifyComponent(c) === 'name-fallback');
    const humanAnimalComponents = [...explicitOriginComponents, ...nameFallbackComponents];

    // Composition string is a far weaker signal than structured components — only
    // unambiguous tokens count, and trigger a 'potential / review' rather than an
    // assertion of human/animal origin.
    const compPotentiallyAnimal = !!comp && (animalNameRe.test(comp) || humanNameRe.test(comp));

    // Confidence: 'explicit' when we have at least one explicit-origin component;
    // 'potential' when only the regex/composition fallback fired.
    const confidence: 'explicit' | 'potential' | 'none' =
      explicitOriginComponents.length > 0
        ? 'explicit'
        : nameFallbackComponents.length > 0 || compPotentiallyAnimal
          ? 'potential'
          : 'none';

    const tables: GeneratedTable[] = [];

    if (confidence === 'none') {
      tables.push(kvTable('Excipients of Human or Animal Origin', {
        'Applicability': 'Not applicable — no excipients of human or animal origin',
        'Drug Product Formulation': formulationName || '—',
        'Composition': comp || '—',
      }));
      return {
        narrative: `Per ICH M4Q, Section 3.2.A.3 (Excipients of Human or Animal Origin) addresses TSE/BSE, ` +
          `viral, and other adventitious-agent risks associated with excipients of human or animal origin. ` +
          `\n\nNo excipients of human or animal origin are used in the drug product formulation` +
          (formulationName ? ` (${formulationName})` : '') + `. ` +
          `All excipients are of plant, mineral, or synthetic origin and comply with the relevant compendial ` +
          `monographs (USP/NF, Ph. Eur., JP) as detailed in 3.2.P.4. ` +
          `\n\nAccordingly, no additional TSE/BSE or viral safety documentation is required for this section. ` +
          `Any future formulation change introducing a human- or animal-derived excipient would trigger ` +
          `re-evaluation and supplementary safety documentation per EMA EMEA/410/01 rev. 3.`,
        tables,
      };
    }

    tables.push({
      title: confidence === 'potential'
        ? 'Excipients of Human or Animal Origin — POTENTIAL (Review Required)'
        : 'Excipients of Human or Animal Origin',
      headers: ['Excipient', 'Function / Role', 'Origin', 'TSE/BSE Certification'],
      rows: humanAnimalComponents.length > 0
        ? humanAnimalComponents.map((c: any) => [
            c.component || c.name || 'Unknown',
            c.role || c.function || '—',
            c.origin || c.source || (confidence === 'potential'
              ? 'Potential animal/human origin (name-based fallback — review required)'
              : 'Animal/human origin (per composition)'),
            c.tseCertification || c.certification ||
              (confidence === 'potential' ? 'CEP/TSE certification — confirm via supplier' : 'Certificate on file (CEP/TSE-compliant)'),
          ])
        : [['(Per composition statement)', '—',
            confidence === 'potential'
              ? 'Potential human/animal-origin material — review required'
              : 'Human/animal-origin material detected',
            confidence === 'potential' ? 'Confirm CEP/TSE certification with supplier' : 'CEP/TSE certification required']],
    });

    const leadParagraph = confidence === 'explicit'
      ? `${explicitOriginComponents.length > 0 ? explicitOriginComponents.length : 'One or more'} excipient(s) ` +
        `of human or animal origin have been identified. Each is qualified through (i) a documented origin / ` +
        `country-of-origin statement, (ii) TSE/BSE compliance per EMA EMEA/410/01 rev. 3 (Certificate of ` +
        `Suitability — CEP), and (iii) viral safety evaluation where applicable.`
      : `Potential human- or animal-origin excipient(s) have been flagged by a name-based heuristic and require ` +
        `confirmation. Where confirmed, each component must be qualified through (i) a documented origin / ` +
        `country-of-origin statement, (ii) TSE/BSE compliance per EMA EMEA/410/01 rev. 3 (Certificate of ` +
        `Suitability — CEP), and (iii) viral safety evaluation where applicable. ` +
        `Components identified as plant, mineral, or synthetic in origin should be re-tagged via the structured ` +
        `origin field to suppress this flag.`;

    return {
      narrative: `Per ICH M4Q, Section 3.2.A.3 (Excipients of Human or Animal Origin) summarizes the controls ` +
        `applied to excipients derived from human or animal sources used in the drug product formulation. ` +
        (formulationName ? `Formulation: ${formulationName}. ` : '') +
        `\n\n${leadParagraph} ` +
        `\n\nSpecifications, analytical procedures, and supplier qualification details are provided in 3.2.P.4 ` +
        `(Control of Excipients). Audit trails for vendor changes are maintained per the site quality system.`,
      tables,
    };
  },

  '3.2.R.1.US': (m) => {
    const form = val(m, 'dosageFormDescription');
    const strength = val(m, 'strength');
    const comp = val(m, 'composition');
    const mfgSite = val(m, 'manufacturingSite');
    const batchNum = val(m, 'batchNumber');
    const batchSize = val(m, 'batchSize');
    const tables: GeneratedTable[] = [];
    tables.push(kvTable('US Regional Information — Submission Summary', {
      'Region': 'United States — FDA',
      'Submission Type': 'NDA / ANDA / BLA (as applicable)',
      'Dosage Form': form,
      'Strength': strength,
      'Manufacturing Site': mfgSite,
      'Representative Batch': batchNum,
      'Batch Size': batchSize,
    }));
    tables.push({
      title: 'US-Specific Documentation Pointers',
      headers: ['Item', 'Reference / Location'],
      rows: [
        // NDA / ANDA — governed by 21 CFR Part 314
        ['Executed Batch Records (NDA / ANDA)', 'Provided per 21 CFR 314.50(d)(1)(ii) — see 3.2.P.3.4'],
        ['Comparability Protocols (NDA / ANDA)', 'Per 21 CFR 314.70 — referenced in 3.2.P.2 / 3.2.P.3'],
        // BLA — governed by 21 CFR Parts 600–680
        ['Executed Batch Records (BLA)', 'Provided per 21 CFR 601.2 (content & format of BLA) — see 3.2.P.3.4'],
        ['Post-Approval Changes (BLA)', 'Per 21 CFR 601.12 — referenced in 3.2.P.2 / 3.2.P.3'],
        // Cross-application items
        ['Method Validation Package', 'Per FDA Guidance for Industry (Analytical Procedures and Methods Validation)'],
        ['Container Closure (Type III DMF)', 'Letter of Authorization on file — see 3.2.P.7'],
        ['Establishment Information', `FEI / DUNS for ${mfgSite || '[site]'} — see Form FDA 356h`],
      ],
    });
    return {
      narrative: `Per ICH M4Q, Section 3.2.R.1 (Regional Information) — United States contains FDA-specific ` +
        `information required to support a US marketing application (NDA, ANDA, or BLA, as applicable). ` +
        (form ? `The drug product is a ${form}` + (strength ? ` (${strength})` : '') + `. ` : '') +
        (mfgSite ? `Primary US-listed manufacturing site: ${mfgSite}. ` : '') +
        `\n\nThis section provides pointers to the regulations applicable by submission type. For NDA / ANDA: ` +
        `(i) executed batch records per 21 CFR 314.50(d)(1)(ii), (ii) the method validation package per ` +
        `FDA Guidance for Industry, (iii) comparability protocols per 21 CFR 314.70, and (iv) Type III Drug ` +
        `Master File (DMF) letters of authorization for container closure components. For BLA: equivalent ` +
        `content per 21 CFR 601.2 (BLA content & format) and 21 CFR 601.12 (post-approval changes), with ` +
        `additional product- and establishment-specific requirements under 21 CFR Parts 600–680. ` +
        `\n\nEstablishment information (FEI / DUNS / registration status) for all manufacturing, packaging, ` +
        `testing, and labeling sites listed in Form FDA 356h is cross-referenced. Field copies, certifications, ` +
        `and patent/exclusivity information are provided in Module 1 (administrative). ` +
        (comp ? `\n\nComposition statement: ${comp}.` : ''),
      tables,
    };
  },

  '3.2.R.1.EU': (m) => {
    const form = val(m, 'dosageFormDescription');
    const strength = val(m, 'strength');
    const comp = val(m, 'composition');
    const tables: GeneratedTable[] = [];
    tables.push(kvTable('EU Regional Information — Submission Summary', {
      'Region': 'European Union — EMA',
      'Submission Type': 'MAA (Centralised / Decentralised / National)',
      'Dosage Form': form,
      'Strength': strength,
    }));
    tables.push({
      title: 'EU-Specific Documentation Pointers',
      headers: ['Item', 'Reference / Location'],
      rows: [
        ['QP Declaration on GMP Compliance', 'Per Annex 16 of EU GMP Guide — included in Module 1.5.2'],
        ['Manufacturing Authorisation', 'Copy of MIA for each EU-based site — Module 1.2'],
        ['Process Validation Scheme', 'Per Annex 15 (Qualification & Validation) — cross-ref 3.2.P.3.5'],
        ['Certificate of Suitability (CEP)', 'Where applicable, for drug substance and excipients — Module 1'],
        ['Environmental Risk Assessment', 'Per EMA/CHMP/SWP/4447/00 Rev. 1 — Module 1.6'],
        ['TSE/BSE Compliance', 'Per EMA EMEA/410/01 rev. 3 — cross-ref 3.2.A.2 and 3.2.A.3'],
      ],
    });
    return {
      narrative: `Per ICH M4Q, Section 3.2.R.1 (Regional Information) — European Union contains EMA-specific ` +
        `information required to support a Marketing Authorisation Application (MAA) under the centralised, ` +
        `decentralised, mutual recognition, or national procedure. ` +
        (form ? `The drug product is a ${form}` + (strength ? ` (${strength})` : '') + `. ` : '') +
        `\n\nThis section provides pointers to the Qualified Person (QP) declaration on GMP compliance ` +
        `(per Annex 16 of the EU GMP Guide), Manufacturing Authorisations (MIA) for each EU-based ` +
        `manufacturing site, the process validation scheme aligned with Annex 15 (Qualification & ` +
        `Validation), and Certificates of Suitability (CEP) for the drug substance and applicable excipients. ` +
        `\n\nEnvironmental Risk Assessment (ERA) per EMA/CHMP/SWP/4447/00 Rev. 1 and TSE/BSE compliance ` +
        `documentation per EMA EMEA/410/01 rev. 3 are provided in Module 1.6 and cross-referenced from ` +
        `3.2.A.2 / 3.2.A.3 of this dossier. ` +
        (comp ? `\n\nComposition statement: ${comp}.` : ''),
      tables,
    };
  },

  '3.2.R.1.JP': (m) => {
    const form = val(m, 'dosageFormDescription');
    const strength = val(m, 'strength');
    const comp = val(m, 'composition');
    const tables: GeneratedTable[] = [];
    tables.push(kvTable('Japan Regional Information — Submission Summary', {
      'Region': 'Japan — PMDA / MHLW',
      'Submission Type': 'J-NDA (Shinyaku Shinsei)',
      'Dosage Form': form,
      'Strength': strength,
    }));
    tables.push({
      title: 'Japan-Specific Documentation Pointers',
      headers: ['Item', 'Reference / Location'],
      rows: [
        ['Foreign Manufacturer Accreditation', 'Per Article 13-3, PMD Act — Module 1 (J-administrative)'],
        ['Marketing Authorization Holder (MAH)', 'Designated MAH details — Module 1'],
        ['JP Compendial Compliance', 'JP 18th Edition — referenced in 3.2.P.4 and 3.2.P.5'],
        ['GMP Compliance Certificate', 'Per MHLW Ordinance No. 179 — Module 1'],
        ['Japanese-Specific Specifications', 'Where JP monograph differs from USP/Ph. Eur. — see 3.2.P.5'],
        ['Stability Data — Japanese Climate Zone', 'Zone II data per ICH Q1A(R2) (long-term 25 °C / 60% RH; intermediate 30 °C / 65% RH) per PMDA expectations — cross-ref 3.2.P.8'],
      ],
    });
    return {
      narrative: `Per ICH M4Q, Section 3.2.R.1 (Regional Information) — Japan contains PMDA / MHLW-specific ` +
        `information required to support a Japanese New Drug Application (J-NDA, Shinyaku Shinsei) ` +
        `under the Pharmaceuticals and Medical Devices (PMD) Act. ` +
        (form ? `The drug product is a ${form}` + (strength ? ` (${strength})` : '') + `. ` : '') +
        `\n\nThis section provides pointers to Foreign Manufacturer Accreditation under Article 13-3 of ` +
        `the PMD Act, designation of the Japanese Marketing Authorization Holder (MAH), and GMP ` +
        `compliance certification per MHLW Ordinance No. 179. ` +
        `\n\nCompendial compliance with the Japanese Pharmacopoeia (JP 18th Edition) is documented in ` +
        `3.2.P.4 (Control of Excipients) and 3.2.P.5 (Control of Drug Product). Where JP monograph ` +
        `requirements differ from USP or Ph. Eur., the Japan-specific specifications are presented. ` +
        `Stability data covering Japanese climate Zone II per ICH Q1A(R2) (long-term 25 °C / 60% RH; ` +
        `intermediate 30 °C / 65% RH), as expected by PMDA, are cross-referenced to 3.2.P.8. ` +
        (comp ? `\n\nComposition statement: ${comp}.` : ''),
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
