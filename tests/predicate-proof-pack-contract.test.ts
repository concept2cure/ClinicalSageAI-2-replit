/**
 * Phase 6.6.E — Proof Pack + Replay Determinism Contract Tests
 *
 * Tests:
 *   1. ProofPack type structure (required fields, no secrets)
 *   2. UI ProofStrip renders all 4 badges
 *   3. Replay Determinism blocks on mismatch (mock)
 *   4. BFF routes exist for proof-pack + replay-determinism
 *   5. Shadow router has both endpoints
 *   6. Hooks export useProofPack + useReplayDeterminism
 *   7. CI gate: ProofPack must include risk_vocab_hash and manifest_hash
 *
 * @phase 6.6.E
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, '..');

function readFile(relPath: string): string {
  const fullPath = join(ROOT, relPath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${relPath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ProofPack Type Structure
// ═══════════════════════════════════════════════════════════════════════════════

describe('ProofPack Type Structure', () => {
  const src = readFile('shared/types/predicate-intelligence.ts');

  it('exports ProofPack interface', () => {
    expect(src).toContain('export interface ProofPack');
  });

  it('ProofPack has required field: subject_hash', () => {
    expect(src).toMatch(/interface ProofPack[\s\S]*?subject_hash:\s*string/);
  });

  it('ProofPack has required field: risk_vocab_version', () => {
    expect(src).toMatch(/interface ProofPack[\s\S]*?risk_vocab_version:\s*string/);
  });

  it('ProofPack has required field: risk_vocab_hash', () => {
    expect(src).toMatch(/interface ProofPack[\s\S]*?risk_vocab_hash:\s*string/);
  });

  it('ProofPack has required field: manifest_hash', () => {
    expect(src).toMatch(/interface ProofPack[\s\S]*?manifest_hash:\s*string/);
  });

  it('ProofPack has required field: generated_at', () => {
    expect(src).toMatch(/interface ProofPack[\s\S]*?generated_at:\s*string/);
  });

  it('ProofPack has required field: ingest_freshness', () => {
    expect(src).toMatch(/interface ProofPack[\s\S]*?ingest_freshness:\s*IngestFreshness/);
  });

  it('ProofPack has required field: audit', () => {
    expect(src).toMatch(/interface ProofPack[\s\S]*?audit:\s*ProofPackAudit/);
  });

  it('IngestFreshnessStatus is GREEN | YELLOW | RED', () => {
    expect(src).toMatch(/IngestFreshnessStatus\s*=\s*'GREEN'\s*\|\s*'YELLOW'\s*\|\s*'RED'/);
  });

  it('ProofPackAudit has signature_method field', () => {
    expect(src).toMatch(/interface ProofPackAudit[\s\S]*?signature_method/);
  });

  it('exports ReplayDeterminismResult interface', () => {
    expect(src).toContain('export interface ReplayDeterminismResult');
  });

  it('ReplayDeterminismResult has deterministic boolean', () => {
    expect(src).toMatch(/interface ReplayDeterminismResult[\s\S]*?deterministic:\s*boolean/);
  });

  it('ReplayDeterminismResult has drift_details array', () => {
    expect(src).toMatch(/interface ReplayDeterminismResult[\s\S]*?drift_details:\s*string\[\]/);
  });

  it('exports ReplayDeterminismRequest interface', () => {
    expect(src).toContain('export interface ReplayDeterminismRequest');
  });

  it('ReplayDeterminismRequest has originalManifestHash', () => {
    expect(src).toMatch(/interface ReplayDeterminismRequest[\s\S]*?originalManifestHash:\s*string/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. UI: ProofStrip renders all 4 badges
// ═══════════════════════════════════════════════════════════════════════════════

describe('ProofStrip UI Component', () => {
  const src = readFile('client/src/components/predicate/ProofStrip.tsx');

  it('file exists and is non-empty', () => {
    expect(src.length).toBeGreaterThan(100);
  });

  it('renders Contract badge with version', () => {
    expect(src).toContain('proof.risk_vocab_version');
    expect(src).toContain('Contract:');
  });

  it('renders Manifest badge with hash', () => {
    expect(src).toContain('proof.manifest_hash');
    expect(src).toContain('Manifest:');
  });

  it('renders Freshness badge with color-coded status', () => {
    expect(src).toContain('proof.ingest_freshness.status');
    expect(src).toContain('FDA data updated:');
  });

  it('renders Audit badge with signer type + key id', () => {
    expect(src).toContain('proof.audit.signature_method');
    expect(src).toContain('proof.audit.key_id');
    expect(src).toContain('Audit:');
  });

  it('has copy buttons for all hashes', () => {
    expect(src).toContain('CopyButton');
    // At least 3 copy buttons: risk_vocab_hash, manifest_hash, audit doc_hash
    const copyCount = (src.match(/CopyButton/g) || []).length;
    expect(copyCount).toBeGreaterThanOrEqual(3);
  });

  it('imports useProofPack hook', () => {
    expect(src).toContain('useProofPack');
  });

  it('has data-testid for testing', () => {
    expect(src).toContain('data-testid="proof-strip"');
  });

  it('has GREEN/YELLOW/RED freshness color mapping', () => {
    expect(src).toContain('GREEN');
    expect(src).toContain('YELLOW');
    expect(src).toContain('RED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. UI: Replay Determinism blocks on mismatch
// ═══════════════════════════════════════════════════════════════════════════════

describe('Replay Determinism UI (SEMatrixV2Panel)', () => {
  const src = readFile('client/src/components/predicate/SEMatrixV2Panel.tsx');

  it('imports useReplayDeterminism hook', () => {
    expect(src).toContain('useReplayDeterminism');
  });

  it('has Replay / Verify Determinism button', () => {
    expect(src).toContain('Replay / Verify Determinism');
  });

  it('has data-testid for replay button', () => {
    expect(src).toContain('data-testid="replay-determinism-btn"');
  });

  it('has data-testid for replay result badge', () => {
    expect(src).toContain('data-testid="replay-result-badge"');
  });

  it('shows GREEN badge when deterministic', () => {
    expect(src).toContain('Deterministic');
    expect(src).toContain('Verified');
  });

  it('shows RED DRIFT warning when not deterministic', () => {
    expect(src).toContain('RED DRIFT DETECTED');
  });

  it('shows drift detail lines on mismatch', () => {
    expect(src).toContain('data-testid="drift-details"');
    expect(src).toContain('drift_details');
  });

  it('imports ShieldCheck and ShieldAlert icons', () => {
    expect(src).toContain('ShieldCheck');
    expect(src).toContain('ShieldAlert');
  });

  it('download blocking is server-authoritative via block_download (GAP 1 — CRITICAL)', () => {
    // Phase 6.6.E: download is now server-authoritative via block_download field
    expect(src).toContain('block_download');
    // isDownloadBlocked derived from server response, not UI heuristic
    expect(src).toContain('isDownloadBlocked');
  });

  it('download button has data-testid for testing', () => {
    expect(src).toContain('data-testid="download-docx-btn"');
  });

  it('download button shows "Download Blocked" label on drift', () => {
    expect(src).toContain('Download Blocked (Drift)');
  });

  it('replay button is in the same container as generate and download buttons', () => {
    // The action buttons div should contain both Download and Replay
    // Both should be in the flex container, not separated into different sections
    const actionSection = src.slice(
      src.indexOf('Action buttons'),
      src.indexOf('Error states') !== -1 ? src.indexOf('Error states') : src.indexOf('Results')
    );
    expect(actionSection).toContain('download-docx-btn');
    expect(actionSection).toContain('replay-determinism-btn');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. BFF Routes
// ═══════════════════════════════════════════════════════════════════════════════

describe('BFF Defense Packet Routes', () => {
  const src = readFile('server/routes/defense-packet.ts');

  it('has proof-pack GET route', () => {
    expect(src).toContain('proof-pack');
    expect(src).toMatch(/router\.(get|use)\([\s\S]*?proof-pack/);
  });

  it('has replay-determinism POST route', () => {
    expect(src).toContain('replay-determinism');
    expect(src).toMatch(/router\.(post|use)\([\s\S]*?replay-determinism/);
  });

  it('proof-pack route proxies to Shadow Service', () => {
    expect(src).toContain('/predicate/proof-pack');
  });

  it('proof-pack route emits Part 11 audit event', () => {
    expect(src).toContain('PROOF_PACK_ACCESSED');
  });

  it('replay-determinism emits Part 11 audit event', () => {
    expect(src).toContain('DETERMINISM_REPLAY');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Shadow Router Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

describe('Shadow Router — Predicate Intelligence', () => {
  const src = readFile('shadow_service/shadow_service/router_predicate.py');

  it('has proof-pack GET endpoint', () => {
    expect(src).toContain('@router.get("/proof-pack")');
  });

  it('has replay-determinism POST endpoint', () => {
    expect(src).toContain('/replay-determinism');
    expect(src).toContain('async def replay_determinism');
  });

  it('proof-pack returns risk_vocab_hash', () => {
    expect(src).toContain('"risk_vocab_hash"');
  });

  it('proof-pack returns manifest_hash', () => {
    // The endpoint returns "manifest_hash" key
    const proofSection = src.slice(src.indexOf('def get_proof_pack'));
    expect(proofSection).toContain('"manifest_hash"');
  });

  it('proof-pack returns ingest_freshness', () => {
    expect(src).toContain('"ingest_freshness"');
  });

  it('replay-determinism returns deterministic boolean', () => {
    expect(src).toContain('"deterministic"');
  });

  it('replay-determinism returns drift_details', () => {
    expect(src).toContain('"drift_details"');
  });

  it('proof-pack includes freshness status calculation', () => {
    expect(src).toContain('INGEST_FRESHNESS_DAYS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Hooks
// ═══════════════════════════════════════════════════════════════════════════════

describe('Predicate Intelligence Hooks', () => {
  const src = readFile('client/src/hooks/use-predicate-intelligence.ts');

  it('exports useProofPack hook', () => {
    expect(src).toContain('export function useProofPack');
  });

  it('exports useReplayDeterminism hook', () => {
    expect(src).toContain('export function useReplayDeterminism');
  });

  it('exports proofPackKeys', () => {
    expect(src).toContain('export const proofPackKeys');
  });

  it('imports ProofPack type', () => {
    expect(src).toContain('ProofPack');
  });

  it('imports ReplayDeterminismRequest type', () => {
    expect(src).toContain('ReplayDeterminismRequest');
  });

  it('imports ReplayDeterminismResult type', () => {
    expect(src).toContain('ReplayDeterminismResult');
  });

  it('useProofPack uses defensePacketFetch', () => {
    expect(src).toContain('defensePacketFetch');
    expect(src).toContain('proof-pack');
  });

  it('useReplayDeterminism uses defensePacketFetch', () => {
    const replaySection = src.slice(src.indexOf('useReplayDeterminism'));
    expect(replaySection).toContain('replay-determinism');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. CI Gate: ProofPack must include risk_vocab_hash + manifest_hash
// ═══════════════════════════════════════════════════════════════════════════════

describe('CI Gate: ProofPack contract enforcement', () => {
  const types = readFile('shared/types/predicate-intelligence.ts');

  it('ProofPack.risk_vocab_hash is a required (non-optional) field', () => {
    // Match "risk_vocab_hash: string" but NOT "risk_vocab_hash?: string"
    const match = types.match(/interface ProofPack\s*\{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).toContain('risk_vocab_hash: string');
    expect(body).not.toContain('risk_vocab_hash?: string');
  });

  it('ProofPack.manifest_hash is a required (non-optional) field', () => {
    const match = types.match(/interface ProofPack\s*\{([^}]+)\}/s);
    expect(match).not.toBeNull();
    const body = match![1];
    expect(body).toContain('manifest_hash: string');
    expect(body).not.toContain('manifest_hash?: string');
  });

  it('Python endpoint returns both risk_vocab_hash and manifest_hash', () => {
    const router = readFile('shadow_service/shadow_service/router_predicate.py');
    const proofFn = router.slice(router.indexOf('def get_proof_pack'));
    const returnBlock = proofFn.slice(proofFn.indexOf('return {'));
    expect(returnBlock).toContain('"risk_vocab_hash"');
    expect(returnBlock).toContain('"manifest_hash"');
  });

  it('GenerateSEMatrixV2Response has optional manifest_hash for replay', () => {
    expect(types).toMatch(/interface GenerateSEMatrixV2Response[\s\S]*?manifest_hash\?:\s*string/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Main page wiring
// ═══════════════════════════════════════════════════════════════════════════════

describe('PredicateIntelligence page wiring', () => {
  const src = readFile('client/src/pages/PredicateIntelligence.tsx');

  it('imports ProofStrip component', () => {
    expect(src).toContain('import { ProofStrip }');
  });

  it('renders ProofStrip with programId', () => {
    expect(src).toContain('<ProofStrip');
    expect(src).toContain('programId={programId}');
  });

  it('ProofStrip is positioned top-right (in header flex container)', () => {
    const headerSection = src.slice(
      src.indexOf('Header + Proof Strip'),
      src.indexOf('Program ID selector') !== -1
        ? src.indexOf('Program ID selector')
        : src.indexOf('Summary stats')
    );
    expect(headerSection).toContain('justify-between');
    expect(headerSection).toContain('ProofStrip');
  });

  it('passes subjectHash to ProofStrip', () => {
    expect(src).toMatch(/ProofStrip[\s\S]*?subjectHash/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. SQL helpers
// ═══════════════════════════════════════════════════════════════════════════════

describe('SQL FDA Universe — ingest freshness', () => {
  const src = readFile('shadow_service/shadow_service/sql_fda_universe.py');

  it('has SELECT_LAST_SUCCESSFUL_INGEST query', () => {
    expect(src).toContain('SELECT_LAST_SUCCESSFUL_INGEST');
  });

  it('query filters by completed status', () => {
    expect(src).toContain("status = 'completed'");
  });
});
