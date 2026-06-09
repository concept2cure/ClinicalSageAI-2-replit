/**
 * eCTD validation rule corpus — the named, sourced, regionalized catalog of the
 * validation criteria the Submission Center checks against.
 *
 * WHY THIS EXISTS: a regulated submission tool must be able to trace every
 * gate verdict to a NAMED rule with a published source and a regional severity —
 * not an anonymous `if` in a function. This corpus is that single source of truth.
 * The deterministic checks in `dispatch-readiness.ts` and the eCTD validators each
 * carry a `findingCode`; every such code is cross-referenced here (the invariant
 * test in `validation-rule-corpus.test.ts` fails if a gate emits an un-cataloged
 * code), so the enforced rules and the documented corpus can never drift apart.
 *
 * HONESTY ABOUT SOURCES: this is a CURATED corpus that cites the authoritative
 * published criteria families (ICH eCTD spec; FDA eCTD Technical Conformance Guide
 * + Specifications for eCTD Validation Criteria; EU Module 1 eCTD spec + EU eCTD
 * Validation Criteria; Japan/PMDA eCTD notifications). It is NOT a verbatim copy of
 * any proprietary validator's rule spreadsheet, and rule ids are this system's
 * stable internal ids, not an agency's proprietary rule numbers. Each entry's
 * `enforcement` states plainly whether the rule is checked HERE (deterministically),
 * guaranteed by the packager's construction, or requires the full assembled package
 * / the agency's own validator (documented for traceability, not claimed as enforced).
 *
 * PURE + DETERMINISTIC data + lookups: no DB, no network, no LLM.
 *
 * @module server/services/ectd/validation-rule-corpus
 */

/**
 * Frameworks a rule applies to. `ich` = applies to every region (shared backbone).
 * Region codes follow the eCTD-adopting agencies' Module 1 specifications:
 *   fda (US) · eu (EU) · jp (Japan/PMDA) · ca (Health Canada) · au (TGA) · ch (Swissmedic)
 */
export type RuleRegion = 'ich' | 'fda' | 'eu' | 'jp' | 'ca' | 'au' | 'ch';

/** Region codes that carry a regional Module 1 backbone (i.e. not the shared `ich`). */
export type RegionalCode = Exclude<RuleRegion, 'ich'>;

/**
 * Severity, normalized across the agencies' own scales:
 *   high   → a reject/fail criterion (the agency will not accept the sequence)
 *   medium → a warning the reviewer will raise but that does not auto-reject
 *   low    → best-practice / recommendation
 */
export type RuleSeverity = 'high' | 'medium' | 'low';

export type RuleCategory =
  | 'structure'   // sequence / folder structure
  | 'backbone'    // index.xml / regional XML correctness
  | 'lifecycle'   // operation legality across sequences
  | 'integrity'   // checksums, references resolve
  | 'format'      // file formats (PDF version, etc.)
  | 'naming'      // file/folder naming + path conventions
  | 'content';    // required administrative / study content

export type RuleEnforcement =
  | 'dispatch-readiness' // checked deterministically by computeDispatchReadiness (carries findingCode)
  | 'ectd-validator'     // checked by the eCTD package validator (ectd4-validator)
  | 'packager'           // guaranteed by construction when the packager builds the bytes
  | 'external';          // requires the full package / the agency validator — documented, not enforced here

export interface ValidationRule {
  /** Stable internal id (this system's), used as the finding code where enforced here. */
  id: string;
  title: string;
  category: RuleCategory;
  /** Frameworks the rule applies to; `ich` means all regions. */
  regions: RuleRegion[];
  severity: RuleSeverity;
  rationale: string;
  /** Authoritative published criteria family this rule derives from (citation). */
  source: string;
  enforcement: RuleEnforcement;
  /** Finding code emitted when `enforcement === 'dispatch-readiness'`. */
  findingCode?: string;
}

const ICH_SPEC = 'ICH eCTD Specification (v3.2.2 / v4.0)';
const FDA_CRIT = 'FDA eCTD Technical Conformance Guide; Specifications for eCTD Validation Criteria';
const EU_CRIT = 'EU Module 1 eCTD Specification; EU eCTD Validation Criteria';
const JP_SPEC = 'Japan/PMDA eCTD Notification & Specification';
const HC_SPEC = 'Health Canada eCTD: Preparation of Regulatory Activities in eCTD Format; CA Module 1 specification';
const TGA_SPEC = 'TGA eCTD Specification and Validation Criteria (AU Module 1)';
const SMC_SPEC = 'Swissmedic eCTD: CH Module 1 specification and validation criteria';

/**
 * The corpus. Rules whose `enforcement` is `dispatch-readiness` map 1:1 to a
 * finding code emitted by computeDispatchReadiness (the gate the Submission Center
 * floors on). The rest are cataloged for traceability — checked by the packager's
 * construction, the eCTD validator, or the agency's own validator on the full bytes.
 */
export const RULE_CORPUS: ValidationRule[] = [
  // ── Structure ──────────────────────────────────────────────────────────────
  {
    id: 'EMPTY_SEQUENCE',
    title: 'Sequence contains at least one dispatchable leaf',
    category: 'structure',
    regions: ['ich'],
    severity: 'high',
    rationale: 'A sequence whose every leaf is a delete (or which has no leaves) has nothing to transmit; the backbone would reference no content.',
    source: ICH_SPEC,
    enforcement: 'dispatch-readiness',
    findingCode: 'EMPTY_SEQUENCE',
  },
  {
    id: 'SEQUENCE_NUMBER_FORMAT',
    title: 'Sequence number is exactly four digits',
    category: 'structure',
    regions: ['ich'],
    severity: 'high',
    rationale: 'eCTD sequence folders are named with a four-digit, zero-padded number (0000, 0001, …); any other form breaks the lifecycle ordering.',
    source: ICH_SPEC,
    enforcement: 'dispatch-readiness',
    findingCode: 'SEQUENCE_NUMBER_FORMAT',
  },
  {
    id: 'FOLDER_STRUCTURE',
    title: 'Module folder structure conforms to the CTD hierarchy',
    category: 'structure',
    regions: ['ich'],
    severity: 'high',
    rationale: 'Leaves must live under the m1–m5 / regional folder tree defined by the spec; misplaced folders fail load.',
    source: ICH_SPEC,
    enforcement: 'packager',
  },

  // ── Backbone (index / regional XML) ─────────────────────────────────────────
  {
    id: 'INDEX_XML_PRESENT',
    title: 'A well-formed index.xml backbone is present',
    category: 'backbone',
    regions: ['ich'],
    severity: 'high',
    rationale: 'The ICH backbone index.xml is mandatory and must be well-formed XML; without it the sequence is not an eCTD.',
    source: ICH_SPEC,
    enforcement: 'packager',
  },
  {
    id: 'INDEX_XML_VALID',
    title: 'index.xml validates against the eCTD DTD/schema',
    category: 'backbone',
    regions: ['ich'],
    severity: 'high',
    rationale: 'The backbone must validate against the published DTD (v3.2.2) or XML schema (v4.0); structural validity is a reject criterion.',
    source: ICH_SPEC,
    enforcement: 'ectd-validator',
  },
  {
    id: 'REGIONAL_XML_PRESENT',
    title: 'Regional Module 1 backbone is present and valid',
    category: 'backbone',
    regions: ['fda', 'eu', 'jp', 'ca', 'au', 'ch'],
    severity: 'high',
    rationale: 'Each region requires its Module 1 backbone (us-regional.xml / eu-regional.xml / jp-regional.xml / ca-regional.xml / au-regional.xml / ch-regional.xml) validating against the regional schema.',
    source: FDA_CRIT,
    enforcement: 'packager',
  },
  {
    id: 'LEAF_TITLE_PRESENT',
    title: 'Every leaf carries a non-empty title',
    category: 'backbone',
    regions: ['ich'],
    severity: 'medium',
    rationale: 'A leaf with no title is unreviewable in the agency’s navigator; titles are required backbone attributes.',
    source: ICH_SPEC,
    enforcement: 'ectd-validator',
  },

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  {
    id: 'INVALID_LIFECYCLE_OP',
    title: 'Leaf lifecycle operation is one of new|replace|append|delete',
    category: 'lifecycle',
    regions: ['ich'],
    severity: 'high',
    rationale: 'The backbone only defines these four operations; any other value is invalid and fails load.',
    source: ICH_SPEC,
    enforcement: 'dispatch-readiness',
    findingCode: 'INVALID_LIFECYCLE_OP',
  },
  {
    id: 'LIFECYCLE_OP_IN_ORIGINAL',
    title: 'Original sequence uses only the "new" operation',
    category: 'lifecycle',
    regions: ['ich'],
    severity: 'high',
    rationale: 'In an original (0000) sequence there is no prior content, so replace/append/delete have no target and are filing errors.',
    source: ICH_SPEC,
    enforcement: 'dispatch-readiness',
    findingCode: 'LIFECYCLE_OP_IN_ORIGINAL',
  },
  {
    id: 'LIFECYCLE_TARGET_EXISTS',
    title: 'replace/append/delete reference an existing prior leaf',
    category: 'lifecycle',
    regions: ['ich'],
    severity: 'high',
    rationale: 'A modify operation must point at a leaf that exists in an earlier sequence; a dangling reference breaks lifecycle reconstruction.',
    source: ICH_SPEC,
    enforcement: 'external',
  },
  {
    id: 'DUPLICATE_NEW_SECTION',
    title: 'Section does not carry multiple unintended "new" leaves',
    category: 'lifecycle',
    regions: ['ich'],
    severity: 'low',
    rationale: 'Multiple new leaves in one section is sometimes intended (multi-document granularity) but often a mistake; surfaced for confirmation.',
    source: ICH_SPEC,
    enforcement: 'dispatch-readiness',
    findingCode: 'DUPLICATE_NEW_SECTION',
  },

  // ── Integrity ───────────────────────────────────────────────────────────────
  {
    id: 'UNRESOLVED_DOCUMENT',
    title: 'Every non-delete leaf resolves to a file',
    category: 'integrity',
    regions: ['ich'],
    severity: 'high',
    rationale: 'A leaf the backbone references but that resolves to no file cannot be assembled or loaded by the agency.',
    source: ICH_SPEC,
    enforcement: 'dispatch-readiness',
    findingCode: 'UNRESOLVED_DOCUMENT',
  },
  {
    id: 'MD5_PRESENT_AND_CORRECT',
    title: 'Each file has a correct MD5 checksum',
    category: 'integrity',
    regions: ['ich'],
    severity: 'high',
    rationale: 'Leaf checksums (and the regional md5 manifest) must match the file bytes; a mismatch indicates corruption and is a reject criterion.',
    source: ICH_SPEC,
    enforcement: 'packager',
  },
  {
    id: 'NO_ORPHAN_FILES',
    title: 'No files on disk are unreferenced by the backbone',
    category: 'integrity',
    regions: ['ich'],
    severity: 'medium',
    rationale: 'Files present in the sequence folder but not referenced by index.xml are orphans the agency will flag.',
    source: ICH_SPEC,
    enforcement: 'ectd-validator',
  },

  // ── Format ──────────────────────────────────────────────────────────────────
  {
    id: 'PDF_VERSION',
    title: 'PDF files conform to the accepted PDF version',
    category: 'format',
    regions: ['fda', 'eu', 'jp', 'ca', 'au', 'ch'],
    severity: 'high',
    rationale: 'Each region constrains the accepted PDF version range; out-of-range PDFs are rejected at intake.',
    source: FDA_CRIT,
    enforcement: 'external',
  },
  {
    id: 'PDF_NO_SECURITY',
    title: 'PDF files have no security settings / password protection',
    category: 'format',
    regions: ['fda', 'eu', 'jp', 'ca', 'au', 'ch'],
    severity: 'high',
    rationale: 'Encrypted or permission-restricted PDFs cannot be processed by the agency review tools.',
    source: FDA_CRIT,
    enforcement: 'external',
  },
  {
    id: 'ACCEPTED_FILE_TYPES',
    title: 'Only accepted file types appear in the sequence',
    category: 'format',
    regions: ['ich'],
    severity: 'high',
    rationale: 'eCTD restricts leaf file types (PDF and a small set of others per region); unexpected types fail validation.',
    source: ICH_SPEC,
    enforcement: 'external',
  },

  // ── Naming ──────────────────────────────────────────────────────────────────
  {
    id: 'FILE_NAMING',
    title: 'File and folder names follow the naming convention',
    category: 'naming',
    regions: ['ich'],
    severity: 'medium',
    rationale: 'Lowercase, restricted character set, and no spaces are required so paths are portable across agency systems.',
    source: ICH_SPEC,
    enforcement: 'packager',
  },
  {
    id: 'PATH_LENGTH',
    title: 'Total file path length is within the limit',
    category: 'naming',
    regions: ['ich'],
    severity: 'medium',
    rationale: 'Overlong paths break extraction on some agency systems; the spec caps the full relative path length.',
    source: ICH_SPEC,
    enforcement: 'external',
  },

  // ── Content ─────────────────────────────────────────────────────────────────
  {
    id: 'MISSING_REQUIRED_SECTION',
    title: 'Region-required Module 1 sections are present',
    category: 'content',
    regions: ['fda', 'eu', 'jp', 'ca', 'au', 'ch'],
    severity: 'medium',
    rationale: 'Each region’s Module 1 mandates specific administrative documents; absence is surfaced (advisory at dispatch, decisive at agency intake).',
    source: EU_CRIT,
    enforcement: 'dispatch-readiness',
    findingCode: 'MISSING_REQUIRED_SECTION',
  },
  {
    id: 'STF_FOR_STUDIES',
    title: 'Study reports carry a Study Tagging File (STF)',
    category: 'content',
    regions: ['ich'],
    severity: 'medium',
    rationale: 'Clinical and nonclinical study reports must be accompanied by an STF so the agency can index the study; missing STFs are flagged.',
    source: ICH_SPEC,
    enforcement: 'ectd-validator',
  },

  // ── Regional Module 1 — Health Canada (ca) ──────────────────────────────────
  {
    id: 'CA_REGIONAL_BACKBONE',
    title: 'Health Canada Module 1 backbone (ca-regional.xml) is present and valid',
    category: 'backbone',
    regions: ['ca'],
    severity: 'high',
    rationale: 'Health Canada regulatory activities in eCTD require a valid CA Module 1 backbone validating against the Health Canada regional schema and envelope metadata (dossier/activity identifiers).',
    source: HC_SPEC,
    enforcement: 'packager',
  },
  {
    id: 'CA_REQUIRED_M1',
    title: 'Health Canada-required Module 1 administrative documents are present',
    category: 'content',
    regions: ['ca'],
    severity: 'medium',
    rationale: 'The CA Module 1 mandates specific administrative content (e.g. cover letter, application/transmittal forms, product monograph where applicable); absence is flagged at intake.',
    source: HC_SPEC,
    enforcement: 'external',
  },

  // ── Regional Module 1 — TGA Australia (au) ──────────────────────────────────
  {
    id: 'AU_REGIONAL_BACKBONE',
    title: 'TGA Module 1 backbone (au-regional.xml) is present and valid',
    category: 'backbone',
    regions: ['au'],
    severity: 'high',
    rationale: 'TGA eCTD submissions require a valid AU Module 1 backbone validating against the TGA regional schema; the TGA publishes its own eCTD validation criteria with pass/fail severities.',
    source: TGA_SPEC,
    enforcement: 'packager',
  },
  {
    id: 'AU_VALIDATION_CRITERIA',
    title: 'Sequence passes the TGA eCTD validation criteria',
    category: 'backbone',
    regions: ['au'],
    severity: 'high',
    rationale: 'The TGA runs its published validation criteria on intake; high-severity criteria are reject conditions for the AU regional submission.',
    source: TGA_SPEC,
    enforcement: 'external',
  },

  // ── Regional Module 1 — Swissmedic (ch) ─────────────────────────────────────
  {
    id: 'CH_REGIONAL_BACKBONE',
    title: 'Swissmedic Module 1 backbone (ch-regional.xml) is present and valid',
    category: 'backbone',
    regions: ['ch'],
    severity: 'high',
    rationale: 'Swissmedic eCTD submissions require a valid CH Module 1 backbone validating against the Swissmedic regional schema and envelope.',
    source: SMC_SPEC,
    enforcement: 'packager',
  },
];

// ── Lookups (pure) ────────────────────────────────────────────────────────────

const BY_ID = new Map(RULE_CORPUS.map((r) => [r.id, r]));

export function getRule(id: string): ValidationRule | undefined {
  return BY_ID.get(id);
}

/** Rules that apply to a region (includes shared `ich` rules). */
export function rulesForRegion(region: RegionalCode): ValidationRule[] {
  return RULE_CORPUS.filter((r) => r.regions.includes('ich') || r.regions.includes(region));
}

/** Region codes that carry at least one region-specific (non-`ich`) rule. */
export function supportedRegions(): RegionalCode[] {
  const set = new Set<RegionalCode>();
  for (const r of RULE_CORPUS) {
    for (const reg of r.regions) if (reg !== 'ich') set.add(reg);
  }
  return [...set];
}

export function rulesByEnforcement(enforcement: RuleEnforcement): ValidationRule[] {
  return RULE_CORPUS.filter((r) => r.enforcement === enforcement);
}

/** The set of finding codes the dispatch gate is expected to emit, per the corpus. */
export function dispatchFindingCodes(): Set<string> {
  return new Set(
    RULE_CORPUS.filter((r) => r.enforcement === 'dispatch-readiness' && r.findingCode).map((r) => r.findingCode as string)
  );
}

export interface CorpusSummary {
  total: number;
  byRegion: Record<RuleRegion, number>;
  bySeverity: Record<RuleSeverity, number>;
  byEnforcement: Record<RuleEnforcement, number>;
}

export function corpusSummary(): CorpusSummary {
  const byRegion: Record<RuleRegion, number> = { ich: 0, fda: 0, eu: 0, jp: 0, ca: 0, au: 0, ch: 0 };
  const bySeverity: Record<RuleSeverity, number> = { high: 0, medium: 0, low: 0 };
  const byEnforcement: Record<RuleEnforcement, number> = {
    'dispatch-readiness': 0,
    'ectd-validator': 0,
    packager: 0,
    external: 0,
  };
  for (const r of RULE_CORPUS) {
    for (const reg of r.regions) byRegion[reg] += 1;
    bySeverity[r.severity] += 1;
    byEnforcement[r.enforcement] += 1;
  }
  return { total: RULE_CORPUS.length, byRegion, bySeverity, byEnforcement };
}

export default { RULE_CORPUS, getRule, rulesForRegion, supportedRegions, rulesByEnforcement, dispatchFindingCodes, corpusSummary };
