/**
 * CDISC define.xml generation + dataset conformance checks (SDTM / ADaM basics).
 *
 * FDA data submissions require define.xml (dataset/variable metadata) and clean
 * conformance. This builds a define.xml v2.0 skeleton from a structured dataset
 * spec and runs deterministic structural conformance rules (variable naming,
 * required identifier variables, data types, codelist resolution). It is honest
 * about scope: it covers the structural/metadata rules that are mechanical and
 * reproducible — it is NOT a full Pinnacle21/CDISC CT rule engine, so run the
 * validator of record before submission.
 *
 * Pure: no DB, no network. Identical spec → identical XML/findings.
 *
 * @module server/services/cdisc/define-xml
 */

export type CdiscStandard = 'SDTM' | 'ADaM';
export type CdiscDataType = 'text' | 'integer' | 'float' | 'date' | 'datetime' | 'time';

const VALID_TYPES: ReadonlySet<string> = new Set(['text', 'integer', 'float', 'date', 'datetime', 'time']);
const VAR_NAME_RE = /^[A-Z][A-Z0-9_]{0,7}$/; // uppercase, starts with a letter, ≤8 chars
const DATASET_NAME_RE = /^[A-Z][A-Z0-9]{1,7}$/;
const SDTM_REQUIRED = ['STUDYID', 'DOMAIN', 'USUBJID'];
const ADAM_REQUIRED = ['STUDYID', 'USUBJID'];

export interface VariableSpec {
  name: string;
  label: string;
  type: CdiscDataType;
  length?: number;
  /** OID of a codelist defined in the spec (optional). */
  codelist?: string;
  origin?: string;
  mandatory?: boolean;
}

export interface DatasetSpec {
  /** Dataset/domain name, e.g. "DM", "AE", "ADSL". */
  name: string;
  label: string;
  /** Observation class, e.g. "EVENTS", "FINDINGS", "SPECIAL PURPOSE". */
  datasetClass?: string;
  structure?: string;
  variables: VariableSpec[];
}

export interface CodeListSpec {
  oid: string;
  name: string;
  type?: CdiscDataType;
  items: { code: string; decode: string }[];
}

export interface DefineSpec {
  studyName: string;
  standard: CdiscStandard;
  datasets: DatasetSpec[];
  codelists?: CodeListSpec[];
}

export interface ConformanceFinding {
  severity: 'error' | 'warning';
  dataset: string;
  variable?: string;
  rule: string;
  message: string;
}

export interface ConformanceResult {
  standard: CdiscStandard;
  findings: ConformanceFinding[];
  summary: { datasets: number; variables: number; errors: number; warnings: number; pass: boolean };
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Run deterministic structural conformance checks over a dataset spec. */
export function checkDatasetConformance(spec: DefineSpec): ConformanceResult {
  const findings: ConformanceFinding[] = [];
  if (!spec || !Array.isArray(spec.datasets) || spec.datasets.length === 0) {
    throw new Error('spec.datasets must be a non-empty array');
  }
  const required = spec.standard === 'ADaM' ? ADAM_REQUIRED : SDTM_REQUIRED;
  const codelistOids = new Set((spec.codelists ?? []).map((c) => c.oid));
  let variableCount = 0;

  for (const ds of spec.datasets) {
    if (!DATASET_NAME_RE.test(ds.name ?? '')) {
      findings.push({ severity: 'error', dataset: ds.name ?? '(unnamed)', rule: 'dataset.name', message: 'Dataset name must be uppercase alphanumeric, start with a letter, ≤8 chars.' });
    }
    if (!Array.isArray(ds.variables) || ds.variables.length === 0) {
      findings.push({ severity: 'error', dataset: ds.name, rule: 'dataset.variables', message: 'Dataset has no variables.' });
      continue;
    }
    const names = new Set(ds.variables.map((v) => v.name));
    for (const req of required) {
      // DOMAIN only applies to SDTM domain datasets (skip the requirement for split/relrec-style names is out of scope here).
      if (!names.has(req)) {
        findings.push({ severity: 'error', dataset: ds.name, variable: req, rule: 'required.variable', message: `Required ${spec.standard} variable "${req}" is missing.` });
      }
    }
    for (const v of ds.variables) {
      variableCount++;
      if (!VAR_NAME_RE.test(v.name ?? '')) {
        findings.push({ severity: 'error', dataset: ds.name, variable: v.name, rule: 'variable.name', message: 'Variable name must be uppercase, start with a letter, ≤8 chars.' });
      }
      if (!VALID_TYPES.has(v.type)) {
        findings.push({ severity: 'error', dataset: ds.name, variable: v.name, rule: 'variable.type', message: `Invalid data type "${v.type}". Allowed: ${[...VALID_TYPES].join(', ')}.` });
      }
      if (!v.label?.trim()) {
        findings.push({ severity: 'error', dataset: ds.name, variable: v.name, rule: 'variable.label', message: 'Variable label is required.' });
      } else if (v.label.length > 40) {
        findings.push({ severity: 'warning', dataset: ds.name, variable: v.name, rule: 'variable.label.length', message: 'Variable label exceeds 40 characters (SDTM/ADaM convention).' });
      }
      if (v.type === 'text' && (v.length === undefined || v.length <= 0)) {
        findings.push({ severity: 'warning', dataset: ds.name, variable: v.name, rule: 'variable.length', message: 'Text variable has no positive length defined.' });
      }
      if (v.codelist && !codelistOids.has(v.codelist)) {
        findings.push({ severity: 'error', dataset: ds.name, variable: v.name, rule: 'codelist.ref', message: `Variable references codelist "${v.codelist}" which is not defined.` });
      }
    }
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  return {
    standard: spec.standard,
    findings,
    summary: { datasets: spec.datasets.length, variables: variableCount, errors, warnings, pass: errors === 0 },
  };
}

/**
 * Generate a define.xml v2.0 document from a dataset spec. Runs conformance
 * first and includes the findings so the caller never ships a define.xml whose
 * spec has structural errors without knowing.
 */
export function generateDefineXml(spec: DefineSpec): { xml: string; conformance: ConformanceResult } {
  const conformance = checkDatasetConformance(spec);

  const itemGroups: string[] = [];
  const itemDefs: string[] = [];

  for (const ds of spec.datasets) {
    const refs = ds.variables
      .map((v) => `        <ItemRef ItemOID="IT.${ds.name}.${v.name}" Mandatory="${v.mandatory ? 'Yes' : 'No'}"/>`)
      .join('\n');
    itemGroups.push(
      [
        `      <ItemGroupDef OID="IG.${ds.name}" Name="${xmlEscape(ds.name)}" Repeating="No" Purpose="Tabulation"` +
          (ds.datasetClass ? ` def:Class="${xmlEscape(ds.datasetClass)}"` : '') +
          (ds.structure ? ` def:Structure="${xmlEscape(ds.structure)}"` : '') +
          '>',
        `        <Description><TranslatedText xml:lang="en">${xmlEscape(ds.label)}</TranslatedText></Description>`,
        refs,
        '      </ItemGroupDef>',
      ].join('\n'),
    );
    for (const v of ds.variables) {
      const lenAttr = v.type === 'text' && v.length ? ` Length="${v.length}"` : '';
      const codeRef = v.codelist ? `\n        <CodeListRef CodeListOID="${xmlEscape(v.codelist)}"/>` : '';
      const origin = v.origin ? `\n        <def:Origin Type="${xmlEscape(v.origin)}"/>` : '';
      itemDefs.push(
        [
          `      <ItemDef OID="IT.${ds.name}.${v.name}" Name="${xmlEscape(v.name)}" DataType="${xmlEscape(v.type)}"${lenAttr}>`,
          `        <Description><TranslatedText xml:lang="en">${xmlEscape(v.label)}</TranslatedText></Description>${codeRef}${origin}`,
          '      </ItemDef>',
        ].join('\n'),
      );
    }
  }

  const codeLists = (spec.codelists ?? [])
    .map((cl) => {
      const items = cl.items
        .map(
          (it) =>
            `        <CodeListItem CodedValue="${xmlEscape(it.code)}"><Decode><TranslatedText xml:lang="en">${xmlEscape(it.decode)}</TranslatedText></Decode></CodeListItem>`,
        )
        .join('\n');
      return [
        `      <CodeList OID="${xmlEscape(cl.oid)}" Name="${xmlEscape(cl.name)}" DataType="${xmlEscape(cl.type ?? 'text')}">`,
        items,
        '      </CodeList>',
      ].join('\n');
    })
    .join('\n');

  const studyOid = `STD.${spec.studyName.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) || 'STUDY'}`;
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ODM xmlns="http://www.cdisc.org/ns/odm/v1.3" xmlns:def="http://www.cdisc.org/ns/def/v2.0" ODMVersion="1.3.2" FileType="Snapshot" CreationDateTime="">',
    `  <Study OID="${xmlEscape(studyOid)}">`,
    `    <GlobalVariables><StudyName>${xmlEscape(spec.studyName)}</StudyName><StudyDescription>${xmlEscape(spec.studyName)}</StudyDescription><ProtocolName>${xmlEscape(spec.studyName)}</ProtocolName></GlobalVariables>`,
    `    <MetaDataVersion OID="MDV.1" Name="${xmlEscape(spec.standard)} Define" def:DefineVersion="2.0.0">`,
    itemGroups.join('\n'),
    itemDefs.join('\n'),
    codeLists,
    '    </MetaDataVersion>',
    '  </Study>',
    '</ODM>',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');

  return { xml, conformance };
}
