#!/usr/bin/env npx tsx
/**
 * Gate 1 — Build-time TS Type Generator from risk_codes.lock.json
 *
 * Reads the canonical lock file and emits:
 *   shared/types/generated/risk-codes.generated.ts
 *
 * Exports:
 *   - RiskCode          (union type)
 *   - ALL_RISK_CODES    (readonly array)
 *   - SIGNIFICANT_RISK_CODES (readonly array)
 *   - RISK_CODE_LABELS  (Record<RiskCode, string>)
 *   - RISK_CODE_DISCUSSION_TEMPLATES (Record<RiskCode, string>)
 *   - RISK_CODE_ARTIFACTS (Record<RiskCode, readonly string[]>)
 *   - RISK_CODE_SEVERITY (Record<RiskCode, 'LOW'|'MEDIUM'|'HIGH'>)
 *   - RISK_CODES_LOCK_HASH (sha256 of lock file)
 *
 * CI enforces: `npx tsx scripts/generate-risk-code-types.ts --check`
 *   exits 1 if generated file differs from committed version.
 *
 * Phase 6.6.C — Zero Drift Enforcement
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Paths ──────────────────────────────────────────────────────────────────
const ROOT = resolve(import.meta.dirname ?? __dirname, '..');
const LOCK_PATH = resolve(
  ROOT,
  'shadow_service/shadow_service/predicate_intel/risk_codes.lock.json'
);
const PY_MAP_PATH = resolve(ROOT, 'shadow_service/shadow_service/scoring/risk_code_map.py');
const OUT_DIR = resolve(ROOT, 'shared/types/generated');
const OUT_FILE = resolve(OUT_DIR, 'risk-codes.generated.ts');

// ── Parse Lock File ────────────────────────────────────────────────────────
interface LockFile {
  version: string;
  risk_codes: string[];
  significant_risk_codes: string[];
}

const lockRaw = readFileSync(LOCK_PATH, 'utf-8');
const lock: LockFile = JSON.parse(lockRaw);
const lockHash = createHash('sha256').update(lockRaw).digest('hex');

// ── Parse Python risk_code_map.py for labels, templates, artifacts, severity ─
const pyMap = readFileSync(PY_MAP_PATH, 'utf-8');

function extractPyDict(varName: string): Record<string, string> {
  // Matches: VARNAME: dict[...] = { ... }  across multiple lines
  // Use [^=]* instead of dict[] match to handle nested generics like dict[str, list[str]]
  const re = new RegExp(`${varName}\\s*(?::[^=]*)?\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`);
  const m = pyMap.match(re);
  if (!m) throw new Error(`Could not find ${varName} in risk_code_map.py`);
  const body = m[1];

  const result: Record<string, string> = {};
  // Extract key-value pairs: RiskCode.XXX.value: "...",  or  RiskCode.XXX.value: ("..." + "...")
  const kvRegex =
    /RiskCode\.(\w+)\.value:\s*(?:Severity\.(\w+)\.value|"([^"]*)"|\(\s*"([^"]*(?:"\s*"[^"]*)*)"\s*\))/g;
  let kvMatch;
  while ((kvMatch = kvRegex.exec(body)) !== null) {
    const key = kvMatch[1];
    if (kvMatch[2]) {
      // Severity enum reference
      result[key] = kvMatch[2];
    } else if (kvMatch[3]) {
      result[key] = kvMatch[3];
    } else if (kvMatch[4]) {
      // Multi-line parenthesized string
      result[key] = kvMatch[4].replace(/"\s*"/g, '');
    }
  }
  return result;
}

function extractPyDictLists(varName: string): Record<string, string[]> {
  const re = new RegExp(`${varName}\\s*(?::[^=]*)?\\s*=\\s*\\{([\\s\\S]*?)\\n\\}`);
  const m = pyMap.match(re);
  if (!m) throw new Error(`Could not find ${varName} in risk_code_map.py`);
  const body = m[1];

  const result: Record<string, string[]> = {};
  // Split by RiskCode entries
  const entryRegex = /RiskCode\.(\w+)\.value:\s*\[([\s\S]*?)\]/g;
  let entryMatch;
  while ((entryMatch = entryRegex.exec(body)) !== null) {
    const key = entryMatch[1];
    const listBody = entryMatch[2];
    const items: string[] = [];
    const strRegex = /"([^"]+)"/g;
    let strMatch;
    while ((strMatch = strRegex.exec(listBody)) !== null) {
      items.push(strMatch[1]);
    }
    result[key] = items;
  }
  return result;
}

// Extract discussion templates via multi-line parenthesized strings
function extractDiscussionTemplates(): Record<string, string> {
  const re = /RISK_CODE_DISCUSSION_TEMPLATE\s*(?::[^=]*)?\s*=\s*\{([\s\S]*?)\n\}/;
  const m = pyMap.match(re);
  if (!m) throw new Error('Could not find RISK_CODE_DISCUSSION_TEMPLATE');
  const body = m[1];

  const result: Record<string, string> = {};
  const entryRegex = /RiskCode\.(\w+)\.value:\s*\(\s*([\s\S]*?)\s*\)/g;
  let entryMatch;
  while ((entryMatch = entryRegex.exec(body)) !== null) {
    const key = entryMatch[1];
    const raw = entryMatch[2];
    // Concatenate all string fragments
    const parts: string[] = [];
    const strRegex = /"([^"]*)"/g;
    let strMatch;
    while ((strMatch = strRegex.exec(raw)) !== null) {
      parts.push(strMatch[1]);
    }
    result[key] = parts.join('');
  }
  return result;
}

const labels = extractPyDict('RISK_CODE_LABELS');
const severity = extractPyDict('RISK_CODE_SEVERITY_DEFAULT');
const templates = extractDiscussionTemplates();
const artifacts = extractPyDictLists('RISK_CODE_TO_ARTIFACTS');

// ── Validate completeness ──────────────────────────────────────────────────
for (const code of lock.risk_codes) {
  if (!labels[code]) console.warn(`WARN: missing label for ${code}`);
  if (!severity[code]) console.warn(`WARN: missing severity for ${code}`);
  if (!templates[code]) console.warn(`WARN: missing template for ${code}`);
  if (!artifacts[code]) console.warn(`WARN: missing artifacts for ${code}`);
}

// ── Human-readable label helper (from UPPER_SNAKE to Title Case) ─────────
function titleCase(code: string): string {
  return labels[code] || code.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Emit generated file ────────────────────────────────────────────────────
function escStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

const lines: string[] = [];

lines.push(`/**`);
lines.push(` * AUTO-GENERATED — DO NOT EDIT`);
lines.push(` *`);
lines.push(` * Source: shadow_service/shadow_service/predicate_intel/risk_codes.lock.json`);
lines.push(` * Generator: scripts/generate-risk-code-types.ts`);
lines.push(` * Lock version: ${lock.version}`);
lines.push(` * Lock hash: ${lockHash}`);
lines.push(` * Generated: ${new Date().toISOString().split('T')[0]}`);
lines.push(` *`);
lines.push(` * To regenerate: npx tsx scripts/generate-risk-code-types.ts`);
lines.push(` * CI check:      npx tsx scripts/generate-risk-code-types.ts --check`);
lines.push(` */`);
lines.push(``);
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(`// Lock file metadata`);
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(``);
lines.push(`/** SHA-256 hash of risk_codes.lock.json (for manifest comparison). */`);
lines.push(`export const RISK_CODES_LOCK_HASH = '${lockHash}' as const;`);
lines.push(``);
lines.push(`/** Lock file version string. */`);
lines.push(`export const RISK_CODES_LOCK_VERSION = '${lock.version}' as const;`);
lines.push(``);
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(`// RiskCode union type (24 canonical codes)`);
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(``);
lines.push(`export type RiskCode =`);
for (let i = 0; i < lock.risk_codes.length; i++) {
  const code = lock.risk_codes[i];
  const sep = i === lock.risk_codes.length - 1 ? ';' : '';
  lines.push(`  | '${code}'${sep}`);
}
lines.push(``);
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(`// Canonical arrays`);
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(``);
lines.push(`/** All 24 canonical risk codes in lock file order. */`);
lines.push(`export const ALL_RISK_CODES: readonly RiskCode[] = [`);
for (const code of lock.risk_codes) {
  lines.push(`  '${code}',`);
}
lines.push(`] as const;`);
lines.push(``);
lines.push(`/** Risk codes that promote diff flag to SIGNIFICANT. */`);
lines.push(`export const SIGNIFICANT_RISK_CODES: readonly RiskCode[] = [`);
for (const code of lock.significant_risk_codes) {
  lines.push(`  '${code}',`);
}
lines.push(`] as const;`);
lines.push(``);

// Severity type
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(`// Severity`);
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(``);
lines.push(`export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';`);
lines.push(``);

// Labels
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(`// Human-readable labels`);
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(``);
lines.push(`export const RISK_CODE_LABELS: Readonly<Record<RiskCode, string>> = {`);
for (const code of lock.risk_codes) {
  lines.push(`  '${code}': '${escStr(titleCase(code))}',`);
}
lines.push(`};`);
lines.push(``);

// Default severity
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(`// Default severity per risk code`);
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(``);
lines.push(`export const RISK_CODE_SEVERITY: Readonly<Record<RiskCode, RiskSeverity>> = {`);
for (const code of lock.risk_codes) {
  const sev = severity[code] || 'MEDIUM';
  lines.push(`  '${code}': '${sev}',`);
}
lines.push(`};`);
lines.push(``);

// Discussion templates
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(`// Canned discussion templates (no LLM — deterministic)`);
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(``);
lines.push(`export const RISK_CODE_DISCUSSION_TEMPLATES: Readonly<Record<RiskCode, string>> = {`);
for (const code of lock.risk_codes) {
  const tmpl = templates[code] || '';
  lines.push(`  '${code}': '${escStr(tmpl)}',`);
}
lines.push(`};`);
lines.push(``);

// Artifacts
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(`// Recommended artifacts per risk code`);
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(``);
lines.push(`export const RISK_CODE_ARTIFACTS: Readonly<Record<RiskCode, readonly string[]>> = {`);
for (const code of lock.risk_codes) {
  const arts = artifacts[code] || [];
  if (arts.length === 0) {
    lines.push(`  '${code}': [],`);
  } else {
    lines.push(`  '${code}': [`);
    for (const a of arts) {
      lines.push(`    '${escStr(a)}',`);
    }
    lines.push(`  ],`);
  }
}
lines.push(`};`);
lines.push(``);

// Regulatory Objection Library — anticipated questions per risk code
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(`// Regulatory Objection Library — "Shadow Reviewer" anticipated questions`);
lines.push(`// ═══════════════════════════════════════════════════════════════════════════════`);
lines.push(``);
lines.push(`export interface RegulatoryObjection {`);
lines.push(`  readonly question: string;`);
lines.push(`  readonly severity: RiskSeverity;`);
lines.push(`  readonly recommended_artifacts: readonly string[];`);
lines.push(`  readonly ectd_location: string;`);
lines.push(`}`);
lines.push(``);

// Build the objection library from existing data
const objectionMap: Record<
  string,
  { question: string; severity: string; artifacts: string[]; ectd: string }
> = {
  IU_MISMATCH: {
    question:
      'How does your device maintain the same intended use as the predicate when the indications differ?',
    severity: 'HIGH',
    artifacts: ['Clinical Rationale Memo', 'IFU Draft', 'Warnings / Precautions Update'],
    ectd: '510(k) Summary, Section 11 — Substantial Equivalence Discussion',
  },
  INDICATIONS_EXPANDED: {
    question: 'What clinical evidence supports your expanded indications for use?',
    severity: 'HIGH',
    artifacts: [
      'Clinical Rationale Memo',
      'Literature Review',
      'Clinical Bridging Analysis',
      'Clinical Protocol / Study Plan',
    ],
    ectd: '510(k) Summary, Section 11 — Clinical Evidence + Appendix',
  },
  TECH_DIFFERENCE: {
    question: 'How does your technological change maintain equivalence to the predicate device?',
    severity: 'MEDIUM',
    artifacts: ['Bench Test Protocol', 'Bench Test Report', 'ISO 14971 Risk Management Plan'],
    ectd: '510(k) Summary, Section 12 — Performance Data',
  },
  ENERGY_SOURCE_CHANGE: {
    question:
      'How does the energy source change affect the safety and performance profile of your device?',
    severity: 'HIGH',
    artifacts: ['Electrical Safety / EMC Report', 'Bench Test Report', 'FMEA / Hazard Analysis'],
    ectd: '510(k) Summary, Section 12 — Electrical Safety + EMC',
  },
  DESIGN_ARCH_CHANGE: {
    question:
      'What verification and validation evidence demonstrates equivalent function despite the design change?',
    severity: 'MEDIUM',
    artifacts: ['Bench Test Protocol', 'Bench Test Report', 'FMEA / Hazard Analysis'],
    ectd: '510(k) Summary, Section 12 — Performance Data',
  },
  MATERIAL_CHANGE: {
    question: 'Why does your material change not impact biocompatibility?',
    severity: 'HIGH',
    artifacts: [
      'ISO 10993-1 Biological Evaluation Plan',
      'Cytotoxicity/Sensitization/Irritation Summary',
      'Chemical Characterization Report',
    ],
    ectd: '510(k) Section 11, biocompatibility summary + test reports in appendix',
  },
  TISSUE_CONTACT_CHANGE: {
    question: 'How does the change in tissue contact affect the biocompatibility evaluation?',
    severity: 'HIGH',
    artifacts: [
      'ISO 10993-1 Biological Evaluation Plan',
      'Residual Risk / Benefit-Risk Justification',
    ],
    ectd: '510(k) Section 11, biocompatibility summary',
  },
  CONTACT_DURATION_CHANGE: {
    question: 'Does the change in contact duration require additional biocompatibility endpoints?',
    severity: 'MEDIUM',
    artifacts: [
      'ISO 10993-1 Biological Evaluation Plan',
      'Cytotoxicity/Sensitization/Irritation Summary',
    ],
    ectd: '510(k) Section 11, biocompatibility summary',
  },
  STERILIZATION_METHOD_CHANGE: {
    question: 'How was the new sterilization method validated and what are the residual limits?',
    severity: 'MEDIUM',
    artifacts: ['Sterilization Validation (SAL)', 'EO Residuals Report'],
    ectd: '510(k) Section 12 — Sterilization',
  },
  PACKAGING_SYSTEM_CHANGE: {
    question: 'How does the packaging change maintain sterile barrier integrity?',
    severity: 'LOW',
    artifacts: ['Packaging Integrity / Seal Strength', 'Bench Test Report'],
    ectd: '510(k) Section 12 — Packaging / Shelf Life',
  },
  SHELF_LIFE_CHANGE: {
    question: 'What accelerated or real-time aging data supports your new shelf-life claim?',
    severity: 'LOW',
    artifacts: ['Bench Test Protocol', 'Bench Test Report', 'Performance Verification Summary'],
    ectd: '510(k) Section 12 — Shelf Life',
  },
  SOFTWARE_PRESENT_NEW: {
    question:
      'Your device introduces software not present in the predicate — provide full IEC 62304 lifecycle documentation.',
    severity: 'HIGH',
    artifacts: ['IEC 62304 Software Development Plan', 'SOUP List', 'SBOM', 'Threat Model'],
    ectd: '510(k) Section 14 — Software Documentation',
  },
  SOFTWARE_SAFETY_CLASS_DIFF: {
    question:
      'How do you justify the software safety classification difference from the predicate?',
    severity: 'MEDIUM',
    artifacts: ['IEC 62304 Software Development Plan', 'Verification & Validation Evidence'],
    ectd: '510(k) Section 14 — Software Documentation',
  },
  CYBERSECURITY_SURFACE_INCREASED: {
    question: 'What cybersecurity controls address the increased attack surface?',
    severity: 'HIGH',
    artifacts: ['SBOM', 'Vulnerability Assessment Summary', 'Patch / Update Process'],
    ectd: '510(k) Section 14 — Cybersecurity',
  },
  INTEROPERABILITY_CLAIM: {
    question: 'What testing supports your new interoperability claims?',
    severity: 'MEDIUM',
    artifacts: [
      'Bench Test Report',
      'Performance Verification Summary',
      'Vulnerability Assessment Summary',
    ],
    ectd: '510(k) Section 12 + 14 — Interoperability',
  },
  ML_ADAPTIVITY: {
    question: 'What predetermined change control plan governs ML/AI model updates?',
    severity: 'HIGH',
    artifacts: [
      'IEC 62304 Software Development Plan',
      'Verification & Validation Evidence',
      'ISO 14971 Risk Management Plan',
    ],
    ectd: '510(k) Section 14 — AI/ML Documentation',
  },
  PERFORMANCE_CLAIM_CHANGE: {
    question: 'What bench or clinical data supports your changed performance claims?',
    severity: 'MEDIUM',
    artifacts: [
      'Bench Test Protocol',
      'Bench Test Report',
      'Performance Verification Summary',
      'Clinical Bridging Analysis',
    ],
    ectd: '510(k) Section 12 — Performance Data',
  },
  CLINICAL_EVIDENCE_GAP: {
    question: 'Why is bench data alone sufficient to support the claimed differences?',
    severity: 'HIGH',
    artifacts: ['Clinical Protocol / Study Plan', 'Clinical Rationale Memo', 'Literature Review'],
    ectd: '510(k) Section 11 — Clinical Evidence',
  },
  HUMAN_FACTORS_CHANGE: {
    question:
      'What human factors validation evidence demonstrates safe use despite interface changes?',
    severity: 'MEDIUM',
    artifacts: ['Human Factors Validation Summary', 'IFU Draft', 'Warnings / Precautions Update'],
    ectd: '510(k) Section 12 — Human Factors',
  },
  STANDARDS_GAP: {
    question:
      'No recognized standard covers the identified differences — what alternative evidence is provided?',
    severity: 'MEDIUM',
    artifacts: ['Standards Matrix', 'Standards Gap Rationale', 'Conformance Test Summary'],
    ectd: '510(k) Section 13 — Standards',
  },
  LABELING_IFU_GAP: {
    question: 'How does your labeling reflect the identified device differences?',
    severity: 'LOW',
    artifacts: ['IFU Draft', 'Warnings / Precautions Update'],
    ectd: '510(k) Section 9 — Labeling',
  },
  PMS_SIGNAL_RISK: {
    question: 'What post-market signals exist for this predicate and how are they addressed?',
    severity: 'MEDIUM',
    artifacts: ['CAPA Summary', 'Complaint Trending', 'PSUR / PMCF Trigger Memo'],
    ectd: '510(k) Section 11 — Post-Market Surveillance',
  },
  PREDICATE_TOXICITY_HIGH: {
    question:
      'The predicate has elevated safety signals — justify why this predicate is still appropriate.',
    severity: 'HIGH',
    artifacts: ['Recall / Safety Signal Summary', 'CAPA Summary'],
    ectd: '510(k) Section 11 — SE Discussion + Risk Justification',
  },
  PREDICATE_LINEAGE_COMPROMISED: {
    question:
      'The predicate family tree shows safety concerns — document risk controls and consider alternate lineage.',
    severity: 'HIGH',
    artifacts: ['Recall / Safety Signal Summary', 'ISO 14971 Risk Management Plan', 'CAPA Summary'],
    ectd: '510(k) Section 11 — SE Discussion + Risk Justification',
  },
};

lines.push(
  `export const REGULATORY_OBJECTION_LIBRARY: Readonly<Record<RiskCode, RegulatoryObjection>> = {`
);
for (const code of lock.risk_codes) {
  const obj = objectionMap[code];
  if (!obj) continue;
  lines.push(`  '${code}': {`);
  lines.push(`    question: '${escStr(obj.question)}',`);
  lines.push(`    severity: '${obj.severity}',`);
  lines.push(`    recommended_artifacts: [`);
  for (const a of obj.artifacts) {
    lines.push(`      '${escStr(a)}',`);
  }
  lines.push(`    ],`);
  lines.push(`    ectd_location: '${escStr(obj.ectd)}',`);
  lines.push(`  },`);
}
lines.push(`};`);
lines.push(``);

const content = lines.join('\n');

// ── --check mode: compare against existing file ────────────────────────────
if (process.argv.includes('--check')) {
  if (!existsSync(OUT_FILE)) {
    console.error(`FAIL: ${OUT_FILE} does not exist. Run generator first.`);
    process.exit(1);
  }
  const existing = readFileSync(OUT_FILE, 'utf-8');
  // Compare ignoring the "Generated:" date line
  const normalize = (s: string) => s.replace(/^ \* Generated: .+$/m, '').trim();
  if (normalize(existing) !== normalize(content)) {
    console.error(
      'FAIL: Generated risk code types are out of date.\n' +
        'Run: npx tsx scripts/generate-risk-code-types.ts'
    );
    process.exit(1);
  }
  console.log('OK: Generated risk code types are up to date.');
  process.exit(0);
}

// ── Write mode ─────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, content, 'utf-8');
console.log(`✓ Generated ${OUT_FILE}`);
console.log(`  Lock version: ${lock.version}`);
console.log(`  Lock hash:    ${lockHash}`);
console.log(`  Risk codes:   ${lock.risk_codes.length}`);
console.log(`  Significant:  ${lock.significant_risk_codes.length}`);
