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
  | 'excipient';

export interface CanonicalSource {
  id: string;
  sourceType: CmcSourceType;
  sourcePayload: Record<string, any>;
  sourceHash?: string;
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
  { sectionKey: '3.2.S.2', requiredSourceTypes: ['drug_substance', 'manufacturing_process'], requiredFields: ['manufacturingRoute', 'processDescription', 'processControls'] },
  { sectionKey: '3.2.S.3', requiredSourceTypes: ['drug_substance', 'characterization'], requiredFields: ['structuralElucidation', 'physicochemicalProperties', 'biologicalActivity'] },
  { sectionKey: '3.2.S.4', requiredSourceTypes: ['specification', 'method'], requiredFields: ['acceptanceCriteria', 'validationStatus'] },
  { sectionKey: '3.2.S.5', requiredSourceTypes: ['drug_substance', 'reference_standard'], requiredFields: ['referenceStandardDescription', 'certificateOfAnalysis'] },
  { sectionKey: '3.2.S.6', requiredSourceTypes: ['container_closure'], requiredFields: ['containerDescription', 'closureDescription', 'suitabilityJustification'] },
  { sectionKey: '3.2.S.7', requiredSourceTypes: ['stability'], requiredFields: ['timePoints', 'storageCondition'] },
  // --- Drug Product (P) subsections ---
  { sectionKey: '3.2.P.1', requiredSourceTypes: ['drug_product'], requiredFields: ['dosageFormDescription', 'composition', 'strength'] },
  { sectionKey: '3.2.P.2', requiredSourceTypes: ['drug_product', 'drug_substance', 'comparability'], requiredFields: ['formulationDevelopment', 'manufacturingProcessDev', 'containerClosureStudies'] },
  { sectionKey: '3.2.P.3', requiredSourceTypes: ['drug_product', 'batch', 'change_control'], requiredFields: ['formulation', 'batchNumber'] },
  { sectionKey: '3.2.P.4', requiredSourceTypes: ['excipient'], requiredFields: ['excipientSpecifications', 'excipientAnalyticalProcedures'] },
  { sectionKey: '3.2.P.5', requiredSourceTypes: ['specification', 'method'], requiredFields: ['releaseCriteria', 'methodName'] },
  { sectionKey: '3.2.P.6', requiredSourceTypes: ['drug_product', 'reference_standard'], requiredFields: ['referenceStandardDescription', 'certificateOfAnalysis'] },
  { sectionKey: '3.2.P.7', requiredSourceTypes: ['container_closure'], requiredFields: ['containerDescription', 'closureDescription', 'suitabilityJustification'] },
  { sectionKey: '3.2.P.8', requiredSourceTypes: ['stability', 'comparability'], requiredFields: ['shelfLifeClaim', 'comparabilityStatus'] },
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
    return {
      narrative: `The drug substance is manufactured via ${route || '[route not specified]'}. ` +
        (desc ? `The manufacturing process consists of: ${desc}. ` : '') +
        (controls ? `In-process controls include: ${controls}.` : ''),
      tables: [kvTable('Manufacturing Process Summary', { 'Synthetic Route': route, 'Process Description': desc, 'In-Process Controls': controls })],
    };
  },

  '3.2.S.3': (m) => {
    const struct = val(m, 'structuralElucidation');
    const phys = val(m, 'physicochemicalProperties');
    const bio = val(m, 'biologicalActivity');
    return {
      narrative: `Structural elucidation of the drug substance was confirmed by ${struct || '[methods not specified]'}. ` +
        (phys ? `Physicochemical properties: ${phys}. ` : '') +
        (bio ? `Biological activity: ${bio}.` : ''),
      tables: [kvTable('Characterisation Summary', { 'Structural Elucidation': struct, 'Physicochemical Properties': phys, 'Biological Activity': bio })],
    };
  },

  '3.2.S.4': (m) => {
    const criteria = valObj(m, 'acceptanceCriteria');
    const status = val(m, 'validationStatus');
    const tables: GeneratedTable[] = [];
    if (criteria) {
      tables.push({
        title: 'Drug Substance Specification',
        headers: ['Test', 'Acceptance Criteria'],
        rows: Object.entries(criteria).map(([test, crit]) => [test, String(crit)]),
      });
    }
    return {
      narrative: `The drug substance specification defines acceptance criteria for quality attributes. ` +
        (status ? `Analytical methods are ${status}. ` : '') +
        (criteria ? `${Object.keys(criteria).length} test(s) are defined in the specification.` : ''),
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
    const tables: GeneratedTable[] = [];
    if (timePoints.length > 0) {
      tables.push({
        title: 'Stability Study Design — Drug Substance',
        headers: ['Parameter', 'Value'],
        rows: [
          ['Storage Condition', condition || '[not specified]'],
          ['Time Points (months)', timePoints.join(', ')],
        ],
      });
    }
    return {
      narrative: `Stability studies for the drug substance were conducted under ${condition || '[condition not specified]'} ` +
        (timePoints.length > 0 ? `at time points: ${timePoints.join(', ')} months. ` : '. ') +
        `Results demonstrate that the drug substance is stable under the proposed storage conditions.`,
      tables,
    };
  },

  '3.2.P.1': (m) => {
    const form = val(m, 'dosageFormDescription');
    const comp = val(m, 'composition');
    const strength = val(m, 'strength');
    return {
      narrative: `The drug product is a ${form || '[dosage form not specified]'} ` +
        (strength ? `with a strength of ${strength}. ` : '. ') +
        (comp ? `Composition: ${comp}.` : ''),
      tables: [kvTable('Drug Product Description and Composition', { 'Dosage Form': form, 'Strength': strength, 'Composition': comp })],
    };
  },

  '3.2.P.2': (m) => {
    const formDev = val(m, 'formulationDevelopment');
    const mfgDev = val(m, 'manufacturingProcessDev');
    const ccStudies = val(m, 'containerClosureStudies');
    return {
      narrative: `Pharmaceutical development studies were conducted to support the proposed formulation and manufacturing process. ` +
        (formDev ? `Formulation development: ${formDev}. ` : '') +
        (mfgDev ? `Manufacturing process development: ${mfgDev}. ` : '') +
        (ccStudies ? `Container closure studies: ${ccStudies}.` : ''),
      tables: [kvTable('Pharmaceutical Development Summary', { 'Formulation Development': formDev, 'Manufacturing Process Development': mfgDev, 'Container Closure Studies': ccStudies })],
    };
  },

  '3.2.P.3': (m) => {
    const formulation = val(m, 'formulation');
    const batchNum = val(m, 'batchNumber');
    const disposition = val(m, 'disposition');
    const tables: GeneratedTable[] = [];
    tables.push({
      title: 'Batch Formula',
      headers: ['Parameter', 'Value'],
      rows: [
        ['Formulation', formulation || '[not specified]'],
        ['Batch Number', batchNum || '[not specified]'],
        ...(disposition ? [['Disposition', disposition]] : []),
      ],
    });
    return {
      narrative: `The drug product is manufactured according to the batch formula described below. ` +
        (batchNum ? `Representative batch: ${batchNum}. ` : '') +
        (disposition ? `Batch disposition: ${disposition}.` : ''),
      tables,
    };
  },

  '3.2.P.4': (m) => {
    const specs = val(m, 'excipientSpecifications');
    const procs = val(m, 'excipientAnalyticalProcedures');
    return {
      narrative: `Excipients used in the drug product formulation are controlled to compendial or in-house specifications. ` +
        (specs ? `Excipient specifications: ${specs}. ` : '') +
        (procs ? `Analytical procedures: ${procs}.` : ''),
      tables: [kvTable('Control of Excipients', { 'Excipient Specifications': specs, 'Analytical Procedures': procs })],
    };
  },

  '3.2.P.5': (m) => {
    const criteria = val(m, 'releaseCriteria');
    const method = val(m, 'methodName');
    const status = val(m, 'validationStatus');
    return {
      narrative: `The drug product specification defines release and shelf-life acceptance criteria. ` +
        (method ? `Primary analytical method: ${method}. ` : '') +
        (criteria ? `Release criteria: ${criteria}. ` : '') +
        (status ? `Validation status: ${status}.` : ''),
      tables: [kvTable('Drug Product Specification', { 'Release Criteria': criteria, 'Analytical Method': method, 'Validation Status': status })],
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

    const availableFields = new Set(
      matched.flatMap((m) => Object.keys(m.sourcePayload || {}))
    );
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
