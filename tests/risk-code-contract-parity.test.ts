/**
 * Phase 6.6.C2 — Risk Code Contract Parity Gate
 *
 * Ensures all three layers (Python enum → lock file → TS type)
 * declare the exact same canonical risk codes.
 *
 * If this test fails, someone has edited one layer without updating
 * the others — which would break SE matrix determinism.
 *
 * @phase 6.6.C2
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ── Load risk_codes.lock.json (single source of truth) ──

const LOCK_FILE_PATH = path.resolve(
  __dirname,
  '../shadow_service/shadow_service/predicate_intel/risk_codes.lock.json'
);

interface LockFile {
  version: string;
  risk_codes: string[];
  significant_risk_codes: string[];
}

function loadLockFile(): LockFile {
  const raw = fs.readFileSync(LOCK_FILE_PATH, 'utf-8');
  return JSON.parse(raw) as LockFile;
}

// ── Extract RiskCode type members from TS source ──

const TS_TYPES_PATH = path.resolve(__dirname, '../shared/types/predicate-intelligence.ts');

function extractTsRiskCodes(): string[] {
  const src = fs.readFileSync(TS_TYPES_PATH, 'utf-8');

  // Match the "export type RiskCode =" block — each '...' member
  const typeMatch = src.match(/export type RiskCode\s*=\s*([\s\S]*?);/);
  if (!typeMatch) {
    throw new Error('Could not find "export type RiskCode = ..." in TS types');
  }

  const block = typeMatch[1];
  const codes: string[] = [];
  // Each member is a single-quoted or double-quoted string after a |
  for (const m of block.matchAll(/['"]([A-Z_]+)['"]/g)) {
    codes.push(m[1]);
  }

  return codes;
}

// ── Tests ──

describe('Phase 6.6.C2 — Risk Code Contract Parity', () => {
  const lock = loadLockFile();
  const tsRiskCodes = extractTsRiskCodes();

  it('lock file contains exactly 24 risk codes', () => {
    expect(lock.risk_codes).toHaveLength(24);
  });

  it('lock file version is 2.0.0', () => {
    expect(lock.version).toBe('2.0.0');
  });

  it('TS RiskCode type has exactly 24 members', () => {
    expect(tsRiskCodes).toHaveLength(24);
  });

  it('TS RiskCode type matches lock file risk_codes exactly', () => {
    // Both must have the same codes (order may differ)
    expect([...tsRiskCodes].sort()).toEqual([...lock.risk_codes].sort());
  });

  it('TS RiskCode type members match lock file in declaration order', () => {
    // Enforces that TS type declaration order matches lock file order
    expect(tsRiskCodes).toEqual(lock.risk_codes);
  });

  it('lock file significant_risk_codes are a subset of risk_codes', () => {
    for (const sig of lock.significant_risk_codes) {
      expect(lock.risk_codes).toContain(sig);
    }
  });

  it('lock file significant_risk_codes has exactly 4 entries', () => {
    expect(lock.significant_risk_codes).toHaveLength(4);
  });

  it('no duplicate risk codes in lock file', () => {
    const unique = new Set(lock.risk_codes);
    expect(unique.size).toBe(lock.risk_codes.length);
  });

  it('no duplicate significant risk codes in lock file', () => {
    const unique = new Set(lock.significant_risk_codes);
    expect(unique.size).toBe(lock.significant_risk_codes.length);
  });

  it('all codes follow UPPER_SNAKE_CASE convention', () => {
    for (const code of lock.risk_codes) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
  });
});
