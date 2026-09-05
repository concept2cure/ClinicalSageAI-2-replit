/**
 * CDISC Define-XML generator — the only one.
 *
 * Every eCTD submission that carries CDISC datasets (SDTM/ADaM) must include a
 * define.xml describing those datasets, their variables, keys and controlled
 * terminology. This deterministically generates a Define-XML document (an
 * ODM-based metadata file) from supplied dataset/variable/codelist metadata, and
 * reports gaps (a dataset with no keys, a variable citing a missing codelist,
 * missing labels) so an author sees what is incomplete before submission.
 *
 * The Define-XML version is an explicit `defineVersion` input ('2.0' | '2.1',
 * default '2.1'), and the result echoes back which version was emitted. It used
 * to be implicit, with a second 2.0 generator and a third 2.1 one sitting beside
 * this file under names that read as alternatives; an edit could land in an
 * unreachable one and appear to work. Both are gone — a caller that needs 2.0
 * asks for 2.0 here.
 *
 * Pure / deterministic — identical metadata renders to byte-identical XML. The
 * companion `sdtm-domain-conformance-checker` validates a dataset's variables
 * against the SDTM model; this describes the datasets for the reviewer.
 *
 * Reference: CDISC Define-XML v2.1; the dataset/variable model mirrors the
 * SDTM-IG metadata an eCTD `m5.3.x` / dataset package would carry.
 *
 * @module server/services/cdisc/define-xml-generator
 */

export type DefineDataType = 'text' | 'integer' | 'float' | 'date' | 'datetime';

export interface DefineVariable {
  name: string;
  label: string;
  dataType: DefineDataType;
  length?: number;
  /** Required (Mandatory="Yes") in the dataset. */
  mandatory?: boolean;
  /** 1-based key sequence; present ⇒ a key variable. */
  keySequence?: number;
  /** References a codelist id in `codelists`. */
  codelistId?: string;
  /** def:Origin Type, e.g. 'CRF', 'Derived', 'Assigned', 'Protocol'. */
  origin?: string;
}

export interface DefineDataset {
  name: string;
  label: string;
  /** SDTM class (e.g. 'EVENTS', 'FINDINGS', 'INTERVENTIONS', 'SPECIAL PURPOSE'). */
  datasetClass?: string;
  /** Dataset structure description. */
  structure?: string;
  purpose?: 'Tabulation' | 'Analysis';
  variables: DefineVariable[];
}

export interface DefineCodelistTerm {
  value: string;
  decode?: string;
}

export interface DefineCodelist {
  id: string;
  name: string;
  dataType: 'text' | 'integer';
  terms: DefineCodelistTerm[];
}

/** Define-XML versions this generator emits. */
export type DefineXmlVersion = '2.0' | '2.1';

export interface DefineXmlInput {
  studyName: string;
  studyOID?: string;
  /** Standard label, e.g. 'SDTMIG 3.4'. */
  standard?: string;
  /** Define-XML version to emit. Default '2.1'. */
  defineVersion?: DefineXmlVersion;
  datasets: DefineDataset[];
  codelists?: DefineCodelist[];
}

export type DefineGapSeverity = 'error' | 'warning';

export interface DefineGap {
  severity: DefineGapSeverity;
  /** DUPLICATE_DATASET / EMPTY_DATASET / NO_KEYS / MISSING_LABEL / ORPHAN_CODELIST / UNUSED_CODELIST. */
  code: string;
  message: string;
}

export interface DefineXmlResult {
  xml: string;
  /** The version actually emitted — never inferred by the caller from the XML. */
  defineVersion: DefineXmlVersion;
  /** True ⇔ no error-severity gaps. */
  valid: boolean;
  gaps: DefineGap[];
  datasetCount: number;
  variableCount: number;
  codelistCount: number;
}

/** Escape the five XML special characters. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Define-XML uses ItemGroupDef/ItemDef OID conventions. */
function igOid(ds: string): string {
  return `IG.${ds}`;
}
function itOid(ds: string, v: string): string {
  return `IT.${ds}.${v}`;
}
function clOid(id: string): string {
  return `CL.${id}`;
}

/**
 * Generate the Define-XML document + gap report from the supplied metadata, at
 * the requested `defineVersion` (default '2.1'). Pure / deterministic.
 */
export function generateDefineXml(input: DefineXmlInput): DefineXmlResult {
  const defineVersion: DefineXmlVersion = input.defineVersion ?? '2.1';
  const studyOID = input.studyOID ?? `STDY.${input.studyName}`;
  const standard = input.standard ?? 'SDTMIG 3.4';
  const codelists = input.codelists ?? [];
  const codelistIds = new Set(codelists.map((c) => c.id));
  const referencedCodelists = new Set<string>();

  const gaps: DefineGap[] = [];
  const seenDatasets = new Set<string>();
  let variableCount = 0;

  for (const ds of input.datasets) {
    if (seenDatasets.has(ds.name)) {
      gaps.push({ severity: 'error', code: 'DUPLICATE_DATASET', message: `Dataset ${ds.name} is defined more than once.` });
    }
    seenDatasets.add(ds.name);

    if (!ds.label || ds.label.trim() === '') {
      gaps.push({ severity: 'warning', code: 'MISSING_LABEL', message: `Dataset ${ds.name} has no label.` });
    }
    if (!ds.variables || ds.variables.length === 0) {
      gaps.push({ severity: 'error', code: 'EMPTY_DATASET', message: `Dataset ${ds.name} has no variables.` });
    }
    if (!(ds.variables ?? []).some((v) => typeof v.keySequence === 'number')) {
      gaps.push({ severity: 'error', code: 'NO_KEYS', message: `Dataset ${ds.name} declares no key variables.` });
    }

    for (const v of ds.variables ?? []) {
      variableCount += 1;
      if (!v.label || v.label.trim() === '') {
        gaps.push({ severity: 'warning', code: 'MISSING_LABEL', message: `Variable ${ds.name}.${v.name} has no label.` });
      }
      if (v.codelistId) {
        referencedCodelists.add(v.codelistId);
        if (!codelistIds.has(v.codelistId)) {
          gaps.push({ severity: 'error', code: 'ORPHAN_CODELIST', message: `Variable ${ds.name}.${v.name} references codelist "${v.codelistId}", which is not defined.` });
        }
      }
    }
  }

  for (const c of codelists) {
    if (!referencedCodelists.has(c.id)) {
      gaps.push({ severity: 'warning', code: 'UNUSED_CODELIST', message: `Codelist "${c.id}" is defined but not referenced by any variable.` });
    }
  }

  const xml = serialize(input, studyOID, standard, codelists, defineVersion);
  const valid = !gaps.some((g) => g.severity === 'error');

  return {
    xml,
    defineVersion,
    valid,
    gaps,
    datasetCount: input.datasets.length,
    variableCount,
    codelistCount: codelists.length,
  };
}

function serialize(
  input: DefineXmlInput,
  studyOID: string,
  standard: string,
  codelists: DefineCodelist[],
  defineVersion: DefineXmlVersion,
): string {
  // The def: namespace URI and def:DefineVersion are the two places the version
  // is asserted; they must agree or the file fails schema validation at the
  // gateway, so both derive from the one parameter.
  const defNs = `http://www.cdisc.org/ns/def/v${defineVersion}`;
  const defineVersionAttr = `${defineVersion}.0`;
  const i = '  ';
  let out = '<?xml version="1.0" encoding="UTF-8"?>\n';
  out += `<ODM xmlns="http://www.cdisc.org/ns/odm/v1.3" xmlns:def="${defNs}" ODMVersion="1.3.2" FileType="Snapshot">\n`;
  out += `${i}<Study OID="${escapeXml(studyOID)}">\n`;
  out += `${i}${i}<GlobalVariables>\n`;
  out += `${i}${i}${i}<StudyName>${escapeXml(input.studyName)}</StudyName>\n`;
  out += `${i}${i}${i}<StudyDescription>${escapeXml(input.studyName)}</StudyDescription>\n`;
  out += `${i}${i}${i}<ProtocolName>${escapeXml(input.studyName)}</ProtocolName>\n`;
  out += `${i}${i}</GlobalVariables>\n`;
  out += `${i}${i}<MetaDataVersion OID="MDV.${escapeXml(input.studyName)}" Name="${escapeXml(input.studyName)}" def:DefineVersion="${defineVersionAttr}" def:StandardName="${escapeXml(standard)}">\n`;

  // ItemGroupDefs (datasets) with ItemRefs.
  for (const ds of input.datasets) {
    const attrs =
      `OID="${escapeXml(igOid(ds.name))}" Name="${escapeXml(ds.name)}" Repeating="Yes" ` +
      `SASDatasetName="${escapeXml(ds.name)}" Purpose="${escapeXml(ds.purpose ?? 'Tabulation')}" ` +
      (ds.datasetClass ? `def:Class="${escapeXml(ds.datasetClass)}" ` : '') +
      (ds.structure ? `def:Structure="${escapeXml(ds.structure)}" ` : '');
    out += `${i}${i}${i}<ItemGroupDef ${attrs.trim()}>\n`;
    out += `${i}${i}${i}${i}<Description><TranslatedText xml:lang="en">${escapeXml(ds.label ?? ds.name)}</TranslatedText></Description>\n`;
    for (const v of ds.variables ?? []) {
      const key = typeof v.keySequence === 'number' ? ` KeySequence="${v.keySequence}"` : '';
      out += `${i}${i}${i}${i}<ItemRef ItemOID="${escapeXml(itOid(ds.name, v.name))}" Mandatory="${v.mandatory ? 'Yes' : 'No'}"${key}/>\n`;
    }
    out += `${i}${i}${i}</ItemGroupDef>\n`;
  }

  // ItemDefs (variables).
  for (const ds of input.datasets) {
    for (const v of ds.variables ?? []) {
      const len = typeof v.length === 'number' ? ` Length="${v.length}"` : '';
      out += `${i}${i}${i}<ItemDef OID="${escapeXml(itOid(ds.name, v.name))}" Name="${escapeXml(v.name)}" DataType="${escapeXml(v.dataType)}"${len}>\n`;
      out += `${i}${i}${i}${i}<Description><TranslatedText xml:lang="en">${escapeXml(v.label ?? v.name)}</TranslatedText></Description>\n`;
      if (v.codelistId) {
        out += `${i}${i}${i}${i}<CodeListRef CodeListOID="${escapeXml(clOid(v.codelistId))}"/>\n`;
      }
      if (v.origin) {
        out += `${i}${i}${i}${i}<def:Origin Type="${escapeXml(v.origin)}"/>\n`;
      }
      out += `${i}${i}${i}</ItemDef>\n`;
    }
  }

  // CodeLists.
  for (const c of codelists) {
    out += `${i}${i}${i}<CodeList OID="${escapeXml(clOid(c.id))}" Name="${escapeXml(c.name)}" DataType="${escapeXml(c.dataType)}">\n`;
    for (const t of c.terms) {
      out += `${i}${i}${i}${i}<CodeListItem CodedValue="${escapeXml(t.value)}">\n`;
      out += `${i}${i}${i}${i}${i}<Decode><TranslatedText xml:lang="en">${escapeXml(t.decode ?? t.value)}</TranslatedText></Decode>\n`;
      out += `${i}${i}${i}${i}</CodeListItem>\n`;
    }
    out += `${i}${i}${i}</CodeList>\n`;
  }

  out += `${i}${i}</MetaDataVersion>\n`;
  out += `${i}</Study>\n`;
  out += '</ODM>\n';
  return out;
}
