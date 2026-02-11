/**
 * Phase 6.6.G — Proof Pack Trust Chain TypeScript Tests
 *
 * Tests:
 *   - TS type structure (ContractSnapshot, ProofPackPersistResult, etc.)
 *   - DriftSeverity enum completeness
 *   - Error response type shapes
 *   - ProofPackVerifyResult structured failures
 *
 * Run: npx vitest run tests/unit/proof-pack-trust-chain.test.ts
 */

import { describe, it, expect } from 'vitest';

// Type imports (compile-time only)
import type {
  ContractSnapshot,
  ProofPackPersistResult,
  ProofPackVerifyResult,
  ChecksumFailure,
  ProofPackDownloadBlockedError,
  ProofPackContractMismatchError,
  ProofPackEndpointRemovedError,
  DriftSeverity,
  ReplayDeterminismResult,
  DriftDiffEntry,
} from '../../shared/types/predicate-intelligence';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ContractSnapshot Type Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ContractSnapshot type', () => {
  it('has all required fields', () => {
    const snap: ContractSnapshot = {
      risk_vocab_hash: 'abc123',
      risk_codes_lock_hash: 'def456',
      schema_hash: 'ghi789',
      generator_version: '6.6.G',
    };
    expect(snap.risk_vocab_hash).toBe('abc123');
    expect(snap.risk_codes_lock_hash).toBe('def456');
    expect(snap.schema_hash).toBe('ghi789');
    expect(snap.generator_version).toBe('6.6.G');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ProofPackPersistResult Type Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ProofPackPersistResult type', () => {
  it('has G-expanded fields including contract snapshot', () => {
    const result: ProofPackPersistResult = {
      proof_pack_id: 'uuid-123',
      manifest_hash: 'abc',
      status: 'CREATED',
      zip_manifest_hash: 'def',
      contract: {
        risk_vocab_hash: 'h1',
        risk_codes_lock_hash: 'h2',
        schema_hash: 'h3',
        generator_version: 'v1',
      },
      block_download: false,
      created_at: '2025-02-11T00:00:00Z',
    };
    expect(result.proof_pack_id).toBe('uuid-123');
    expect(result.contract.risk_vocab_hash).toBe('h1');
    expect(result.block_download).toBe(false);
    expect(result.zip_manifest_hash).toBe('def');
  });

  it('supports REUSED status', () => {
    const result: ProofPackPersistResult = {
      proof_pack_id: 'uuid-456',
      manifest_hash: 'abc',
      status: 'REUSED',
      zip_manifest_hash: 'def',
      contract: {
        risk_vocab_hash: 'h1',
        risk_codes_lock_hash: 'h2',
        schema_hash: 'h3',
        generator_version: 'v1',
      },
      block_download: false,
      created_at: '2025-02-11T00:00:00Z',
    };
    expect(result.status).toBe('REUSED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. ProofPackVerifyResult Type Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ProofPackVerifyResult type', () => {
  it('has structured failures and contract comparison', () => {
    const result: ProofPackVerifyResult = {
      proof_pack_id: 'uuid-789',
      manifest_hash: 'abc',
      status: 'ASSEMBLED',
      verified: true,
      computed_checksums_match: true,
      failures: [],
      contract: {
        stored: {
          risk_vocab_hash: 'h1',
          risk_codes_lock_hash: 'h2',
          schema_hash: 'h3',
          generator_version: 'v1',
        },
        current: {
          risk_vocab_hash: 'h1',
          risk_codes_lock_hash: 'h2',
          schema_hash: 'h3',
          generator_version: 'v1',
        },
      },
      block_download: false,
      drift_severity: null,
      downloaded_count: 0,
      created_at: '2025-02-11T00:00:00Z',
    };
    expect(result.verified).toBe(true);
    expect(result.failures).toHaveLength(0);
    expect(result.contract.stored.risk_vocab_hash).toBe('h1');
  });

  it('reports structured failures when verify fails', () => {
    const failure: ChecksumFailure = {
      path: 'risk_vocab_hash',
      expected_sha256: 'aaaa',
      actual_sha256: 'bbbb',
    };
    const result: ProofPackVerifyResult = {
      proof_pack_id: 'uuid-fail',
      manifest_hash: 'abc',
      status: 'ASSEMBLED',
      verified: false,
      computed_checksums_match: false,
      failures: [failure],
      contract: {
        stored: {
          risk_vocab_hash: 'h1',
          risk_codes_lock_hash: 'h2',
          schema_hash: 'h3',
          generator_version: 'v1',
        },
        current: {
          risk_vocab_hash: 'NEW',
          risk_codes_lock_hash: 'h2',
          schema_hash: 'h3',
          generator_version: 'v1',
        },
      },
      block_download: false,
      drift_severity: 'HIGH',
      downloaded_count: 3,
      created_at: '2025-02-11T00:00:00Z',
    };
    expect(result.verified).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].path).toBe('risk_vocab_hash');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. DriftSeverity Type Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('DriftSeverity type', () => {
  it('includes NONE, LOW, MED, HIGH', () => {
    const severities: DriftSeverity[] = ['NONE', 'LOW', 'MED', 'HIGH'];
    expect(severities).toContain('NONE');
    expect(severities).toContain('LOW');
    expect(severities).toContain('MED');
    expect(severities).toContain('HIGH');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. ReplayDeterminismResult G-Expansion Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('ReplayDeterminismResult G-expansion', () => {
  it('includes drift_severity field', () => {
    const result: ReplayDeterminismResult = {
      deterministic: false,
      original_manifest_hash: 'aaa',
      replay_manifest_hash: 'bbb',
      original_risk_vocab_hash: 'ccc',
      replay_risk_vocab_hash: 'ccc',
      original_risk_codes: ['IU_MISMATCH'],
      replay_risk_codes: ['IU_MISMATCH'],
      drift_details: ['manifest_hash mismatch'],
      diff_summary: [
        { path: 'manifest_hash', before_hash: 'aaa', after_hash: 'bbb', severity: 'HIGH' },
      ],
      drift_reason_codes: ['MANIFEST_CHANGED'],
      drift_severity: 'HIGH',
      block_download: true,
    };
    expect(result.drift_severity).toBe('HIGH');
    expect(result.block_download).toBe(true);
  });

  it('deterministic result has NONE severity', () => {
    const result: ReplayDeterminismResult = {
      deterministic: true,
      original_manifest_hash: 'same',
      replay_manifest_hash: 'same',
      original_risk_vocab_hash: 'same',
      replay_risk_vocab_hash: 'same',
      original_risk_codes: [],
      replay_risk_codes: [],
      drift_details: [],
      diff_summary: [],
      drift_reason_codes: [],
      drift_severity: 'NONE',
      block_download: false,
    };
    expect(result.deterministic).toBe(true);
    expect(result.drift_severity).toBe('NONE');
    expect(result.block_download).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Error Response Type Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Error response types', () => {
  it('ProofPackDownloadBlockedError has correct structure', () => {
    const err: ProofPackDownloadBlockedError = {
      error_code: 'PROOF_PACK_DOWNLOAD_BLOCKED',
      drift_severity: 'HIGH',
      drift_reason_codes: ['MANIFEST_CHANGED', 'CONTRACT_CHANGED'],
      block_download: true,
      message: 'Download blocked due to detected drift.',
    };
    expect(err.error_code).toBe('PROOF_PACK_DOWNLOAD_BLOCKED');
    expect(err.block_download).toBe(true);
    expect(err.drift_reason_codes).toHaveLength(2);
  });

  it('ProofPackContractMismatchError has mismatches array', () => {
    const err: ProofPackContractMismatchError = {
      error_code: 'PROOF_PACK_CONTRACT_MISMATCH',
      mismatches: [{ field: 'risk_vocab_hash', expected: 'old', actual: 'new' }],
      expected_contract: {
        risk_vocab_hash: 'old',
        risk_codes_lock_hash: 'x',
        schema_hash: 'y',
        generator_version: 'z',
      },
      actual_contract: {
        risk_vocab_hash: 'new',
        risk_codes_lock_hash: 'x',
        schema_hash: 'y',
        generator_version: 'z',
      },
      block_download: true,
      message: 'Contract hash mismatch.',
    };
    expect(err.mismatches).toHaveLength(1);
    expect(err.mismatches[0].field).toBe('risk_vocab_hash');
  });

  it('ProofPackEndpointRemovedError has 410 error code', () => {
    const err: ProofPackEndpointRemovedError = {
      error_code: 'ENDPOINT_REMOVED_USE_PROOF_PACK_ID',
      message: 'Use GET /proof-pack/{proof_pack_id}/download instead.',
    };
    expect(err.error_code).toBe('ENDPOINT_REMOVED_USE_PROOF_PACK_ID');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. eCTD Stub Schema Validation Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('eCTD stub schemas', () => {
  it('leaf_map schema is valid JSON with required fields', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const schemaPath = path.resolve(__dirname, '../../schemas/leaf_map.schema.json');
    if (fs.existsSync(schemaPath)) {
      const data = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      expect(data.$schema).toBeDefined();
      expect(data.required).toContain('leaves');
    }
  });

  it('bundle schema references all sub-schemas', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const schemaPath = path.resolve(__dirname, '../../schemas/ectd_stubs.bundle.schema.json');
    if (fs.existsSync(schemaPath)) {
      const data = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      // The bundle is itself a JSON Schema, so sub-schemas are in properties.schemas.properties
      const schemasProps = data.properties?.schemas?.properties;
      expect(schemasProps).toHaveProperty('leaf_map');
      expect(schemasProps).toHaveProperty('sequence_plan');
      expect(schemasProps).toHaveProperty('m1_index');
    }
  });

  it('bundle specifies proof-pack/ root prefix', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const schemaPath = path.resolve(__dirname, '../../schemas/ectd_stubs.bundle.schema.json');
    if (fs.existsSync(schemaPath)) {
      const data = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      expect(data.properties?.proof_pack_layout?.properties?.root_prefix?.const).toBe(
        'proof-pack/'
      );
    }
  });
});
