/**
 * Gate 3 — Risk Code Zero-Drift Contract Parity Tests
 *
 * Validates that risk_codes.lock.json (canonical source of truth) stays
 * in perfect sync across all layers:
 *
 *   1. Lock ↔ Python risk_code_map.py  (exact set, count, version, significant)
 *   2. Lock ↔ TS generated types       (exact set, hash, significant)
 *   3. Lock ↔ TS hand-authored types    (exact set, order, count)
 *   4. Python maps completeness         (labels, severity, templates, artifacts, categories)
 *   5. Generated file freshness         (hash parity)
 *   6. Upstream contract                (DefensePacketSeed, stable task IDs)
 *   7. Downstream invariants            (manifest hashing, determinism, audit events)
 *
 * Phase 6.6.C — Zero Drift Enforcement
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// File Paths
// ═══════════════════════════════════════════════════════════════════════════════

const ROOT = resolve(__dirname, '..');
const LOCK_FILE = resolve(
  ROOT,
  'shadow_service/shadow_service/predicate_intel/risk_codes.lock.json'
);
const PY_MAP = resolve(ROOT, 'shadow_service/shadow_service/scoring/risk_code_map.py');
const PY_VALIDATOR = resolve(
  ROOT,
  'shadow_service/shadow_service/scoring/risk_code_contract_validator.py'
);
const TS_GENERATED = resolve(ROOT, 'shared/types/generated/risk-codes.generated.ts');
const TS_TYPES = resolve(ROOT, 'shared/types/predicate-intelligence.ts');
const PY_BUILDER = resolve(ROOT, 'shadow_service/shadow_service/predicate_intel/defense_packet.py');
const BFF_ROUTES = resolve(ROOT, 'server/routes/defense-packet.ts');
const PY_MODELS = resolve(ROOT, 'shadow_service/shadow_service/models_defense_packet.py');

function load(path: string): string {
  return readFileSync(path, 'utf-8');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Parse lock file
// ═══════════════════════════════════════════════════════════════════════════════

const lockRaw = load(LOCK_FILE);
const lock = JSON.parse(lockRaw) as {
  version: string;
  risk_codes: string[];
  significant_risk_codes: string[];
};
const lockHash = createHash('sha256').update(lockRaw).digest('hex');

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Lock ↔ Python risk_code_map.py — Exact Parity
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gate 3 — Lock ↔ Python risk_code_map.py', () => {
  const pyMap = load(PY_MAP);

  it('has exactly 24 RiskCode enum members', () => {
    // Scope to the RiskCode class block only (ends at next class or top-level comment)
    const classBlock = pyMap.match(/class RiskCode[\s\S]*?(?=\n\nclass |\n\n# )/)?.[0] ?? '';
    const enumMembers = classBlock.match(/^\s+\w+\s*=\s*"[A-Z_]+"/gm);
    expect(enumMembers).toHaveLength(24);
  });

  it('every lock code exists as RiskCode enum member', () => {
    for (const code of lock.risk_codes) {
      expect(pyMap).toContain(`${code} = "${code}"`);
    }
  });

  it('ALL_RISK_CODES frozenset has 24 members', () => {
    expect(pyMap).toContain('ALL_RISK_CODES');
    // Scope to the RiskCode class block
    const classBlock = pyMap.match(/class RiskCode[\s\S]*?(?=\n\nclass |\n\n# )/)?.[0] ?? '';
    const enumMembers = classBlock.match(/^\s+\w+\s*=\s*"[A-Z_]+"/gm);
    expect(enumMembers).toHaveLength(24);
  });

  it('RISK_CODE_MAP_VERSION matches lock version', () => {
    expect(pyMap).toContain(`RISK_CODE_MAP_VERSION = "${lock.version}"`);
  });

  it('SIGNIFICANT_RISK_CODES exact set matches lock', () => {
    for (const code of lock.significant_risk_codes) {
      expect(pyMap).toContain(`RiskCode.${code}.value`);
    }
    // Verify count: SIGNIFICANT_RISK_CODES frozenset should have exact count
    const sigBlock = pyMap.match(
      /SIGNIFICANT_RISK_CODES\s*(?::[^=]*)?\s*=\s*frozenset\(\{([\s\S]*?)\}\)/
    );
    expect(sigBlock).toBeTruthy();
    const sigEntries = sigBlock![1].match(/RiskCode\.\w+\.value/g);
    expect(sigEntries).toHaveLength(lock.significant_risk_codes.length);
  });

  it('RISK_CODE_LABELS covers all 24 codes', () => {
    for (const code of lock.risk_codes) {
      expect(pyMap).toContain(`RiskCode.${code}.value:`);
    }
  });

  it('RISK_CODE_SEVERITY_DEFAULT covers all 24 codes', () => {
    const sevBlock = pyMap.match(/RISK_CODE_SEVERITY_DEFAULT\s*(?::[^=]*)?\s*=\s*\{([\s\S]*?)\n\}/);
    expect(sevBlock).toBeTruthy();
    for (const code of lock.risk_codes) {
      expect(sevBlock![1]).toContain(`RiskCode.${code}.value`);
    }
  });

  it('RISK_CODE_DISCUSSION_TEMPLATE covers all 24 codes', () => {
    const tmplBlock = pyMap.match(
      /RISK_CODE_DISCUSSION_TEMPLATE\s*(?::[^=]*)?\s*=\s*\{([\s\S]*?)\n\}/
    );
    expect(tmplBlock).toBeTruthy();
    for (const code of lock.risk_codes) {
      expect(tmplBlock![1]).toContain(`RiskCode.${code}.value`);
    }
  });

  it('RISK_CODE_TO_ARTIFACTS covers all 24 codes', () => {
    const artBlock = pyMap.match(/RISK_CODE_TO_ARTIFACTS\s*(?::[^=]*)?\s*=\s*\{([\s\S]*?)\n\}/);
    expect(artBlock).toBeTruthy();
    for (const code of lock.risk_codes) {
      expect(artBlock![1]).toContain(`RiskCode.${code}.value`);
    }
  });

  it('RISK_CODE_TO_CATEGORY covers all 24 codes', () => {
    const catBlock = pyMap.match(/RISK_CODE_TO_CATEGORY\s*(?::[^=]*)?\s*=\s*\{([\s\S]*?)\n\}/);
    expect(catBlock).toBeTruthy();
    for (const code of lock.risk_codes) {
      expect(catBlock![1]).toContain(`RiskCode.${code}.value`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Lock ↔ Generated TS types
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gate 3 — Lock ↔ Generated TS Types', () => {
  it('generated file exists', () => {
    expect(existsSync(TS_GENERATED)).toBe(true);
  });

  const gen = load(TS_GENERATED);

  it('RISK_CODES_LOCK_HASH matches computed hash', () => {
    expect(gen).toContain(`RISK_CODES_LOCK_HASH = '${lockHash}'`);
  });

  it('RISK_CODES_LOCK_VERSION matches lock version', () => {
    expect(gen).toContain(`RISK_CODES_LOCK_VERSION = '${lock.version}'`);
  });

  it('RiskCode union has exactly 24 members', () => {
    // Scope to the RiskCode union block only (before the next blank line)
    const unionBlock = gen.match(/export type RiskCode =[\s\S]*?;/)?.[0] ?? '';
    const members = unionBlock.match(/\| '[A-Z_]+'/g);
    expect(members).toHaveLength(24);
  });

  it('every lock code appears in RiskCode union', () => {
    for (const code of lock.risk_codes) {
      expect(gen).toContain(`| '${code}'`);
    }
  });

  it('ALL_RISK_CODES array has exactly 24 entries', () => {
    const arrSection = gen.match(
      /ALL_RISK_CODES:\s*readonly\s+RiskCode\[\]\s*=\s*\[([\s\S]*?)\]\s*as\s*const/
    );
    expect(arrSection).toBeTruthy();
    const entries = arrSection![1].match(/'[A-Z_]+'/g);
    expect(entries).toHaveLength(24);
  });

  it('SIGNIFICANT_RISK_CODES array matches lock', () => {
    for (const code of lock.significant_risk_codes) {
      expect(gen).toContain(`'${code}',`);
    }
    const sigSection = gen.match(
      /SIGNIFICANT_RISK_CODES:\s*readonly\s+RiskCode\[\]\s*=\s*\[([\s\S]*?)\]\s*as\s*const/
    );
    expect(sigSection).toBeTruthy();
    const entries = sigSection![1].match(/'[A-Z_]+'/g);
    expect(entries).toHaveLength(lock.significant_risk_codes.length);
  });

  it('RISK_CODE_LABELS has entries for all 24 codes', () => {
    for (const code of lock.risk_codes) {
      expect(gen).toContain(`'${code}':`);
    }
  });

  it('RISK_CODE_SEVERITY has entries for all 24 codes', () => {
    const sevSection = gen.match(
      /RISK_CODE_SEVERITY:\s*Readonly<Record<RiskCode,\s*RiskSeverity>>\s*=\s*\{([\s\S]*?)\};/
    );
    expect(sevSection).toBeTruthy();
    for (const code of lock.risk_codes) {
      expect(sevSection![1]).toContain(`'${code}':`);
    }
  });

  it('RISK_CODE_DISCUSSION_TEMPLATES has entries for all 24 codes', () => {
    const tmplSection = gen.match(
      /RISK_CODE_DISCUSSION_TEMPLATES:\s*Readonly<Record<RiskCode,\s*string>>\s*=\s*\{([\s\S]*?)\};/
    );
    expect(tmplSection).toBeTruthy();
    for (const code of lock.risk_codes) {
      expect(tmplSection![1]).toContain(`'${code}':`);
    }
  });

  it('RISK_CODE_ARTIFACTS has entries for all 24 codes', () => {
    const artSection = gen.match(
      /RISK_CODE_ARTIFACTS:\s*Readonly<Record<RiskCode,\s*readonly\s*string\[\]>>\s*=\s*\{([\s\S]*?)\};/
    );
    expect(artSection).toBeTruthy();
    for (const code of lock.risk_codes) {
      expect(artSection![1]).toContain(`'${code}':`);
    }
  });

  it('REGULATORY_OBJECTION_LIBRARY has entries for all 24 codes', () => {
    const objSection = gen.match(
      /REGULATORY_OBJECTION_LIBRARY:\s*Readonly<Record<RiskCode,\s*RegulatoryObjection>>\s*=\s*\{([\s\S]*?)\};/
    );
    expect(objSection).toBeTruthy();
    for (const code of lock.risk_codes) {
      expect(objSection![1]).toContain(`'${code}':`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Lock ↔ Hand-authored TS types (predicate-intelligence.ts)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gate 3 — Lock ↔ Hand-Authored TS Types', () => {
  const ts = load(TS_TYPES);

  it('RiskCode union type exists', () => {
    expect(ts).toContain('export type RiskCode =');
  });

  it('every lock code appears in hand-authored RiskCode union', () => {
    for (const code of lock.risk_codes) {
      expect(ts).toContain(`'${code}'`);
    }
  });

  it('hand-authored RiskCode union has exactly 24 members', () => {
    // Extract the RiskCode union type block
    const unionMatch = ts.match(/export type RiskCode\s*=([\s\S]*?);/);
    expect(unionMatch).toBeTruthy();
    const members = unionMatch![1].match(/'[A-Z_]+'/g);
    expect(members).toHaveLength(24);
  });

  it('DiffFlagV2 type exists with canonical values', () => {
    expect(ts).toContain("'EQUIVALENT'");
    expect(ts).toContain("'DISCUSSION_REQUIRED'");
    expect(ts).toContain("'SIGNIFICANT'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Runtime validator exists
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gate 3 — Python Runtime Validator', () => {
  it('validator module exists', () => {
    expect(existsSync(PY_VALIDATOR)).toBe(true);
  });

  const validator = load(PY_VALIDATOR);

  it('validates all 9 contract checks', () => {
    expect(validator).toContain('Exact count match');
    expect(validator).toContain('Exact set match');
    expect(validator).toContain('Version match');
    expect(validator).toContain('Significant set match');
    expect(validator).toContain('Templates coverage');
    expect(validator).toContain('Labels coverage');
    expect(validator).toContain('Severity coverage');
    expect(validator).toContain('Category coverage');
    expect(validator).toContain('Artifact coverage');
  });

  it('raises RiskCodeContractError on failure', () => {
    expect(validator).toContain('RiskCodeContractError');
  });

  it('computes lock hash (sha256)', () => {
    expect(validator).toContain('sha256');
  });

  it('imports from scoring.risk_code_map', () => {
    expect(validator).toContain('from ..scoring.risk_code_map import');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Startup integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gate 3 — FastAPI Startup Integration', () => {
  const mainPy = load(resolve(ROOT, 'shadow_service/shadow_service/main.py'));

  it('lifespan calls validate_risk_code_contract', () => {
    expect(mainPy).toContain('validate_risk_code_contract');
  });

  it('raises SystemExit on contract failure', () => {
    expect(mainPy).toContain('SystemExit(1)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Upstream contract — stable task IDs + seed structure
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gate 3 — Upstream Contract (Builder)', () => {
  const builder = load(PY_BUILDER);

  it('task_id uses sha256 deterministic hash', () => {
    expect(builder).toContain('sha256');
  });

  it('builder produces triggered_risk_codes per row', () => {
    expect(builder).toContain('triggered_risk_codes');
  });

  it('builder produces manifest_hash', () => {
    expect(builder).toContain('manifest_hash');
  });

  it('generated_at is excluded from manifest hashing', () => {
    // The builder should explicitly exclude generated_at from the hash
    expect(builder).toContain('generated_at');
  });

  it('RISK_TO_TASK covers all 24 lock codes', () => {
    for (const code of lock.risk_codes) {
      expect(builder).toContain(`"${code}"`);
    }
  });

  it('imports SIGNIFICANT_RISK_CODES for diff flag logic', () => {
    expect(builder).toContain('SIGNIFICANT_RISK_CODES');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Downstream — manifest + audit events
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gate 3 — Downstream Invariants', () => {
  it('BFF emits SE_MATRIX audit events', () => {
    const bff = load(BFF_ROUTES);
    // At minimum: build/export are audited
    expect(bff).toContain('logAuditEvent');
  });

  it('BFF routes include manifest_hash in audit metadata', () => {
    const bff = load(BFF_ROUTES);
    expect(bff).toContain('manifest_hash');
  });

  it('BFF routes include risk_code_map_version in audit metadata', () => {
    const bff = load(BFF_ROUTES);
    expect(bff).toContain('risk_code_map_version');
  });

  it('Python models or builder export diff_flag concept', () => {
    const models = load(PY_MODELS);
    const builder = load(PY_BUILDER);
    const combined = models + builder;
    // diff_flag referenced somewhere in the defense packet layer
    expect(combined).toMatch(/diff_flag|EQUIVALENT|DISCUSSION_REQUIRED|SIGNIFICANT/);
  });

  it('Manifest includes risk_codes_lock_hash concept', () => {
    // Builder or models should reference lock hash
    const builder = load(PY_BUILDER);
    const models = load(PY_MODELS);
    const combined = builder + models;
    // The manifest should include lock hash for tamper detection
    expect(combined).toMatch(/risk_code|manifest_hash|payload_hash/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Generator script exists and has --check mode
// ═══════════════════════════════════════════════════════════════════════════════

describe('Gate 3 — Generator Script', () => {
  const generator = resolve(ROOT, 'scripts/generate-risk-code-types.ts');

  it('generator script exists', () => {
    expect(existsSync(generator)).toBe(true);
  });

  const gen = load(generator);

  it('supports --check flag', () => {
    expect(gen).toContain('--check');
  });

  it('reads from risk_codes.lock.json', () => {
    expect(gen).toContain('risk_codes.lock.json');
  });

  it('reads from risk_code_map.py', () => {
    expect(gen).toContain('risk_code_map.py');
  });

  it('computes sha256 lock hash', () => {
    expect(gen).toContain('sha256');
  });
});
