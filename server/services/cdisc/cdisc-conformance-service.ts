/**
 * CDISC Conformance Service — unified validation + generation for SDTM/ADaM datasets.
 *
 * Exposes three deterministic, pure functions:
 *
 *   - {@link validateSdtmDataset} — validate a dataset descriptor against SDTM IG 3.4 rules.
 *   - {@link validateAdamDataset} — validate a dataset descriptor against ADaM IG 1.3 rules.
 *   - {@link generateDefineXml}   — generate a define.xml 2.1 skeleton from dataset descriptors.
 *
 * No LLM calls, no network, no DB — pure deterministic logic over governed
 * CDISC standards data. Designed to be registered as AnA tool handlers via
 * AnaToolExecutor.ts.
 *
 * @module server/services/cdisc/cdisc-conformance-service
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface VariableInput {
  name: string;
  label?: string;
  type?: 'Char' | 'Num';
  length?: number;
  role?: string;
}

export interface Finding {
  rule: string;
  severity: 'error' | 'warning';
  variable?: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  findings: Finding[];
}

export interface DatasetDescriptor {
  domain: string;
  label?: string;
  variables: Array<{
    name: string;
    label?: string;
    type?: 'Char' | 'Num';
    length?: number;
    role?: string;
  }>;
}

export interface DefineXmlResult {
  xml: string;
  datasetCount: number;
  variableCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SDTM IG 3.4 — known domains and required variables
// ─────────────────────────────────────────────────────────────────────────────

/** Known two-character SDTM domain codes (SDTM-IG v3.4). */
const SDTM_KNOWN_DOMAINS = new Set([
  'DM', 'AE', 'CM', 'LB', 'VS', 'EX', 'DS', 'MH',
  'SU', 'PE', 'EC', 'FA', 'QS', 'SC', 'DA', 'IE',
  'TI', 'TA', 'TE', 'TV', 'SE', 'SV', 'CO', 'DV',
  'EG', 'MB', 'MS', 'MI', 'PC', 'PP', 'RS', 'TU',
  'TR', 'IS', 'SS', 'AG', 'BE', 'BS', 'CP', 'CV',
  'DD', 'FT', 'GF', 'HO', 'MK', 'OE', 'PR', 'RE',
  'RP', 'SR', 'UR',
]);

/**
 * Required variables per SDTM domain (SDTM-IG v3.4 Core=Req).
 * Only the universally-required variables are listed; domain-specific
 * optional/expected variables are not enforced as required.
 */
const SDTM_REQUIRED_VARIABLES: Readonly<Record<string, readonly string[]>> = {
  DM: ['STUDYID', 'DOMAIN', 'USUBJID', 'SUBJID', 'RFSTDTC', 'RFENDTC'],
  AE: ['STUDYID', 'DOMAIN', 'USUBJID', 'AESEQ', 'AETERM', 'AEDECOD'],
  CM: ['STUDYID', 'DOMAIN', 'USUBJID', 'CMSEQ', 'CMTRT'],
  LB: ['STUDYID', 'DOMAIN', 'USUBJID', 'LBSEQ', 'LBTESTCD', 'LBTEST'],
  VS: ['STUDYID', 'DOMAIN', 'USUBJID', 'VSSEQ', 'VSTESTCD', 'VSTEST'],
  EX: ['STUDYID', 'DOMAIN', 'USUBJID', 'EXSEQ', 'EXTRT', 'EXDOSE'],
  DS: ['STUDYID', 'DOMAIN', 'USUBJID', 'DSSEQ', 'DSTERM', 'DSDECOD', 'DSCAT'],
  MH: ['STUDYID', 'DOMAIN', 'USUBJID', 'MHSEQ', 'MHTERM', 'MHDECOD'],
  SU: ['STUDYID', 'DOMAIN', 'USUBJID', 'SUSEQ', 'SUTRT'],
  PE: ['STUDYID', 'DOMAIN', 'USUBJID', 'PESEQ', 'PETESTCD', 'PETEST'],
  EC: ['STUDYID', 'DOMAIN', 'USUBJID', 'ECSEQ', 'ECTRT'],
  IE: ['STUDYID', 'DOMAIN', 'USUBJID', 'IESEQ', 'IETESTCD', 'IETEST'],
};

// ─────────────────────────────────────────────────────────────────────────────
// ADaM IG 1.3 — known datasets and required variables
// ─────────────────────────────────────────────────────────────────────────────

/** Known ADaM dataset names (ADaM IG v1.3). */
const ADAM_KNOWN_DATASETS = new Set([
  'ADSL', 'ADAE', 'ADTTE', 'ADLB', 'ADCM', 'ADVS', 'ADEX', 'ADPC',
  'ADPP', 'ADEG', 'ADMH', 'ADDS', 'ADSAFETY',
]);

/**
 * Required variables per ADaM dataset (ADaM IG v1.3).
 * ADSL has the most prescribed structure; BDS-style datasets (ADAE, ADLB, etc.)
 * share a common required set.
 */
const ADAM_REQUIRED_VARIABLES: Readonly<Record<string, readonly string[]>> = {
  ADSL: ['STUDYID', 'USUBJID', 'SUBJID', 'SITEID', 'ARM', 'ACTARM', 'TRT01P', 'TRT01A', 'SAFFL', 'ITTFL'],
  ADAE: ['STUDYID', 'USUBJID', 'TRTA', 'AEDECOD', 'ASTDT'],
  ADTTE: ['STUDYID', 'USUBJID', 'PARAMCD', 'PARAM', 'AVAL', 'CNSR', 'STARTDT'],
  ADLB: ['STUDYID', 'USUBJID', 'PARAMCD', 'PARAM', 'AVAL', 'ADT'],
  ADCM: ['STUDYID', 'USUBJID', 'CMTRT', 'ASTDT'],
  ADVS: ['STUDYID', 'USUBJID', 'PARAMCD', 'PARAM', 'AVAL', 'ADT'],
  ADEX: ['STUDYID', 'USUBJID', 'PARAMCD', 'PARAM', 'AVAL'],
};

// ─────────────────────────────────────────────────────────────────────────────
// validateSdtmDataset
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate an SDTM dataset descriptor against SDTM IG 3.4 rules.
 *
 * Checks:
 *   - Domain code is a known 2-char SDTM domain.
 *   - Required variables per domain are present.
 *   - Variable names are ≤8 characters and uppercase.
 *
 * @throws when input is missing required fields (triggers `isStatsParamError`).
 */
export function validateSdtmDataset(input: {
  domain?: string;
  variables?: VariableInput[];
}): ValidationResult {
  if (!input.domain || typeof input.domain !== 'string') {
    throw new Error('domain is required');
  }
  if (!Array.isArray(input.variables)) {
    throw new Error('variables must be an array');
  }

  const domain = input.domain.trim().toUpperCase();
  const findings: Finding[] = [];

  // Rule 1: Domain must be a known SDTM domain code
  if (!SDTM_KNOWN_DOMAINS.has(domain)) {
    findings.push({
      rule: 'UNKNOWN_DOMAIN',
      severity: 'error',
      message: `"${domain}" is not a recognized SDTM domain code (SDTM-IG v3.4).`,
    });
  }

  // Rule 2: Variable names must be uppercase and ≤8 characters
  for (const v of input.variables) {
    const name = (v.name ?? '').trim();
    if (!name) continue;

    if (name !== name.toUpperCase()) {
      findings.push({
        rule: 'VARIABLE_NAME_CASE',
        severity: 'error',
        variable: name,
        message: `Variable name "${name}" must be uppercase.`,
      });
    }
    if (name.length > 8) {
      findings.push({
        rule: 'VARIABLE_NAME_LENGTH',
        severity: 'error',
        variable: name,
        message: `Variable name "${name}" exceeds 8 characters (length: ${name.length}).`,
      });
    }
  }

  // Rule 3: Required variables must be present (for known domains)
  const requiredVars = SDTM_REQUIRED_VARIABLES[domain];
  if (requiredVars) {
    const suppliedNames = new Set(
      input.variables.map((v) => (v.name ?? '').trim().toUpperCase()),
    );
    for (const reqVar of requiredVars) {
      if (!suppliedNames.has(reqVar)) {
        findings.push({
          rule: 'MISSING_REQUIRED',
          severity: 'error',
          variable: reqVar,
          message: `Required variable ${reqVar} is missing from ${domain} dataset.`,
        });
      }
    }
  }

  return {
    valid: findings.filter((f) => f.severity === 'error').length === 0,
    findings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// validateAdamDataset
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate an ADaM dataset descriptor against ADaM IG 1.3 rules.
 *
 * Checks:
 *   - Dataset name is a known ADaM dataset.
 *   - Required variables per dataset are present.
 *   - Variable names are ≤8 characters and uppercase.
 *
 * @throws when input is missing required fields (triggers `isStatsParamError`).
 */
export function validateAdamDataset(input: {
  dataset?: string;
  variables?: VariableInput[];
}): ValidationResult {
  if (!input.dataset || typeof input.dataset !== 'string') {
    throw new Error('dataset is required');
  }
  if (!Array.isArray(input.variables)) {
    throw new Error('variables must be an array');
  }

  const dataset = input.dataset.trim().toUpperCase();
  const findings: Finding[] = [];

  // Rule 1: Dataset must be a known ADaM dataset
  if (!ADAM_KNOWN_DATASETS.has(dataset)) {
    findings.push({
      rule: 'UNKNOWN_DATASET',
      severity: 'error',
      message: `"${dataset}" is not a recognized ADaM dataset (ADaM IG v1.3).`,
    });
  }

  // Rule 2: Variable names must be uppercase and ≤8 characters
  for (const v of input.variables) {
    const name = (v.name ?? '').trim();
    if (!name) continue;

    if (name !== name.toUpperCase()) {
      findings.push({
        rule: 'VARIABLE_NAME_CASE',
        severity: 'error',
        variable: name,
        message: `Variable name "${name}" must be uppercase.`,
      });
    }
    if (name.length > 8) {
      findings.push({
        rule: 'VARIABLE_NAME_LENGTH',
        severity: 'error',
        variable: name,
        message: `Variable name "${name}" exceeds 8 characters (length: ${name.length}).`,
      });
    }
  }

  // Rule 3: Required variables must be present (for known datasets)
  const requiredVars = ADAM_REQUIRED_VARIABLES[dataset];
  if (requiredVars) {
    const suppliedNames = new Set(
      input.variables.map((v) => (v.name ?? '').trim().toUpperCase()),
    );
    for (const reqVar of requiredVars) {
      if (!suppliedNames.has(reqVar)) {
        findings.push({
          rule: 'MISSING_REQUIRED',
          severity: 'error',
          variable: reqVar,
          message: `Required variable ${reqVar} is missing from ${dataset} dataset.`,
        });
      }
    }
  }

  return {
    valid: findings.filter((f) => f.severity === 'error').length === 0,
    findings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// generateDefineXml
// ─────────────────────────────────────────────────────────────────────────────

/** Escape the five XML special characters. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate a define.xml 2.1 skeleton from an array of dataset descriptors.
 *
 * Input: array of dataset descriptors (domain, label, variables with name/label/type/length/role).
 * Output: `{xml, datasetCount, variableCount}` — the XML is a valid define.xml 2.1
 * structure with proper ODM wrapper, MetaDataVersion, ItemGroupDef, ItemDef.
 *
 * @throws when input is missing required fields (triggers `isStatsParamError`).
 */
export function generateDefineXml(input: {
  datasets?: DatasetDescriptor[];
  studyName?: string;
}): DefineXmlResult {
  if (!Array.isArray(input.datasets) || input.datasets.length === 0) {
    throw new Error('datasets must be a non-empty array');
  }

  const studyName = input.studyName ?? 'STUDY';
  const studyOID = `STDY.${studyName}`;
  const indent = '  ';
  let variableCount = 0;

  // ── Build XML ──────────────────────────────────────────────────────────────
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<ODM xmlns="http://www.cdisc.org/ns/odm/v1.3" xmlns:def="http://www.cdisc.org/ns/def/v2.1" ODMVersion="1.3.2" FileType="Snapshot">\n';
  xml += `${indent}<Study OID="${escapeXml(studyOID)}">\n`;
  xml += `${indent}${indent}<GlobalVariables>\n`;
  xml += `${indent}${indent}${indent}<StudyName>${escapeXml(studyName)}</StudyName>\n`;
  xml += `${indent}${indent}${indent}<StudyDescription>${escapeXml(studyName)}</StudyDescription>\n`;
  xml += `${indent}${indent}${indent}<ProtocolName>${escapeXml(studyName)}</ProtocolName>\n`;
  xml += `${indent}${indent}</GlobalVariables>\n`;
  xml += `${indent}${indent}<MetaDataVersion OID="MDV.${escapeXml(studyName)}" Name="${escapeXml(studyName)}" def:DefineVersion="2.1.0">\n`;

  // ItemGroupDefs (datasets) with ItemRefs
  for (const ds of input.datasets) {
    const domain = (ds.domain ?? '').trim().toUpperCase();
    const label = ds.label ?? domain;
    xml += `${indent}${indent}${indent}<ItemGroupDef OID="IG.${escapeXml(domain)}" Name="${escapeXml(domain)}" SASDatasetName="${escapeXml(domain)}" Repeating="Yes" Purpose="Tabulation">\n`;
    xml += `${indent}${indent}${indent}${indent}<Description><TranslatedText xml:lang="en">${escapeXml(label)}</TranslatedText></Description>\n`;
    for (const v of ds.variables ?? []) {
      const varName = (v.name ?? '').trim().toUpperCase();
      xml += `${indent}${indent}${indent}${indent}<ItemRef ItemOID="IT.${escapeXml(domain)}.${escapeXml(varName)}" Mandatory="Yes"/>\n`;
      variableCount += 1;
    }
    xml += `${indent}${indent}${indent}</ItemGroupDef>\n`;
  }

  // ItemDefs (variables)
  for (const ds of input.datasets) {
    const domain = (ds.domain ?? '').trim().toUpperCase();
    for (const v of ds.variables ?? []) {
      const varName = (v.name ?? '').trim().toUpperCase();
      const varLabel = v.label ?? varName;
      const dataType = v.type === 'Num' ? 'float' : 'text';
      const lengthAttr = typeof v.length === 'number' ? ` Length="${v.length}"` : '';
      xml += `${indent}${indent}${indent}<ItemDef OID="IT.${escapeXml(domain)}.${escapeXml(varName)}" Name="${escapeXml(varName)}" DataType="${dataType}"${lengthAttr}>\n`;
      xml += `${indent}${indent}${indent}${indent}<Description><TranslatedText xml:lang="en">${escapeXml(varLabel)}</TranslatedText></Description>\n`;
      xml += `${indent}${indent}${indent}</ItemDef>\n`;
    }
  }

  xml += `${indent}${indent}</MetaDataVersion>\n`;
  xml += `${indent}</Study>\n`;
  xml += '</ODM>\n';

  return {
    xml,
    datasetCount: input.datasets.length,
    variableCount,
  };
}
