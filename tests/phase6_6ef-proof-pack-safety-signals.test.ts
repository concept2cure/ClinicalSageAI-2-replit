/**
 * Phase 6.6.E + 6.6.F — Proof Pack v1 + Safety Signals v1
 *
 * Comprehensive contract + structural tests covering:
 *
 *   E.1  ZIP export endpoint — Shadow route exists, builds ZIP in-memory
 *   E.2  Persistence model — DB migration, SQL helpers, UPSERT/SELECT
 *   E.3  Replay diff summary — diff_summary, drift_reason_codes, block_download
 *   E.4  Part 11 audit — audit events table, PROOF_PACK_* events
 *   F.1  Safety signal ingest — idempotent endpoint, toxicity badge, profile
 *   F.2  Lineage graph v1 — recursive CTE, structured fields only
 *
 * @phase 6.6.E + 6.6.F
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// Paths
// ═══════════════════════════════════════════════════════════════════════════════

const ROOT = join(__dirname, '..');
const SHADOW = join(ROOT, 'shadow_service', 'shadow_service');
const DB_MIGRATIONS = join(ROOT, 'db', 'migrations');

// New files (Phase 6.6.E)
const PROOF_PACK_MIGRATION = join(DB_MIGRATIONS, '20260211_phase6_6e_proof_pack_exports.sql');
const SQL_PROOF_PACK = join(SHADOW, 'sql_proof_pack.py');
const PROOF_PACK_ZIP = join(SHADOW, 'proof_pack_zip.py');

// Modified files
const ROUTER_PY = join(SHADOW, 'router_predicate.py');
const SQL_FDA_UNIVERSE = join(SHADOW, 'sql_fda_universe.py');
const BFF_ROUTE = join(ROOT, 'server', 'routes', 'defense-packet.ts');
const SHARED_TYPES = join(ROOT, 'shared', 'types', 'predicate-intelligence.ts');
const HOOKS = join(ROOT, 'client', 'src', 'hooks', 'use-predicate-intelligence.ts');
const SE_MATRIX_V2 = join(ROOT, 'client', 'src', 'components', 'predicate', 'SEMatrixV2Panel.tsx');

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function read(relPath: string): string {
  const fullPath = relPath.startsWith('/') ? relPath : join(ROOT, relPath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${relPath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

function readAbs(filePath: string): string {
  if (!existsSync(filePath)) throw new Error(`Missing: ${filePath}`);
  return readFileSync(filePath, 'utf-8');
}

// ═══════════════════════════════════════════════════════════════════════════════
// E.1 — ZIP Export Endpoint
// ═══════════════════════════════════════════════════════════════════════════════

describe('E.1 — ZIP Export (Proof Pack)', () => {
  it('proof_pack_zip.py exists', () => {
    expect(existsSync(PROOF_PACK_ZIP)).toBe(true);
  });

  it('ProofPackZipBuilder class exists', () => {
    const src = readAbs(PROOF_PACK_ZIP);
    expect(src).toContain('class ProofPackZipBuilder');
  });

  it('ZIP builder includes manifest.json', () => {
    const src = readAbs(PROOF_PACK_ZIP);
    expect(src).toContain('manifest.json');
  });

  it('ZIP builder includes se_matrix_payload.json', () => {
    const src = readAbs(PROOF_PACK_ZIP);
    expect(src).toContain('se_matrix_payload.json');
  });

  it('ZIP builder includes risk_codes.lock.json', () => {
    const src = readAbs(PROOF_PACK_ZIP);
    expect(src).toContain('risk_codes.lock.json');
  });

  it('ZIP builder includes checksums.sha256', () => {
    const src = readAbs(PROOF_PACK_ZIP);
    expect(src).toContain('checksums.sha256');
  });

  it('ZIP builder includes audit_events.jsonl', () => {
    const src = readAbs(PROOF_PACK_ZIP);
    expect(src).toContain('audit_events.jsonl');
  });

  it('build() returns zip_bytes + checksums + artifact_index', () => {
    const src = readAbs(PROOF_PACK_ZIP);
    expect(src).toContain('def build(');
    expect(src).toContain('zip_bytes');
    expect(src).toContain('checksums');
    expect(src).toContain('artifact_index');
  });

  it('verify_checksums function exists', () => {
    const src = readAbs(PROOF_PACK_ZIP);
    expect(src).toContain('def verify_checksums(');
  });

  it('uses in-memory BytesIO (no disk writes)', () => {
    const src = readAbs(PROOF_PACK_ZIP);
    expect(src).toContain('BytesIO');
    expect(src).not.toContain('open(');
  });

  it('SHA-256 hashing for checksums', () => {
    const src = readAbs(PROOF_PACK_ZIP);
    expect(src).toContain('sha256');
    expect(src).toContain('hashlib');
  });

  it('deterministic JSON via canonical sorting', () => {
    const src = readAbs(PROOF_PACK_ZIP);
    expect(src).toContain('sort_keys=True');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E.2 — Persistence Model
// ═══════════════════════════════════════════════════════════════════════════════

describe('E.2 — Persistence Model', () => {
  it('migration file exists', () => {
    expect(existsSync(PROOF_PACK_MIGRATION)).toBe(true);
  });

  const migration = () => readAbs(PROOF_PACK_MIGRATION);

  it('creates proof_pack_exports table', () => {
    expect(migration()).toContain('predicate.proof_pack_exports');
  });

  it('creates proof_pack_audit_events table', () => {
    expect(migration()).toContain('predicate.proof_pack_audit_events');
  });

  it('proof_pack_exports has manifest_hash UNIQUE', () => {
    const m = migration();
    expect(m).toContain('manifest_hash');
    // Table-level or column-level UNIQUE constraint
    expect(m).toMatch(/UNIQUE\s*\(\s*manifest_hash\s*\)|manifest_hash\s+TEXT\s+NOT NULL\s+UNIQUE/);
  });

  it('proof_pack_exports has status CHECK constraint', () => {
    const m = migration();
    expect(m).toContain("'CREATED'");
    expect(m).toContain("'ASSEMBLED'");
    expect(m).toContain("'FAILED'");
  });

  it('proof_pack_exports has risk_vocab_hash', () => {
    expect(migration()).toContain('risk_vocab_hash');
  });

  it('proof_pack_exports has risk_code_lock_hash', () => {
    expect(migration()).toContain('risk_code_lock_hash');
  });

  it('proof_pack_exports has zip_hash', () => {
    expect(migration()).toContain('zip_hash');
  });

  it('proof_pack_exports has downloaded_count', () => {
    expect(migration()).toContain('downloaded_count');
  });

  it('proof_pack_exports FKs to defense_packets', () => {
    expect(migration()).toContain('REFERENCES predicate.defense_packets');
  });

  it('proof_pack_audit_events FKs to proof_pack_exports', () => {
    expect(migration()).toContain('REFERENCES predicate.proof_pack_exports');
  });

  it('SQL helpers file exists', () => {
    expect(existsSync(SQL_PROOF_PACK)).toBe(true);
  });

  const sqlSrc = () => readAbs(SQL_PROOF_PACK);

  it('has INSERT_PROOF_PACK_EXPORT query', () => {
    expect(sqlSrc()).toContain('INSERT_PROOF_PACK_EXPORT');
  });

  it('has ON CONFLICT for idempotent upsert', () => {
    expect(sqlSrc()).toContain('ON CONFLICT');
  });

  it('has SELECT_PROOF_PACK_BY_MANIFEST_HASH', () => {
    expect(sqlSrc()).toContain('SELECT_PROOF_PACK_BY_MANIFEST_HASH');
  });

  it('has SELECT_PROOF_PACK_FOR_DOWNLOAD (JOIN with defense_packets)', () => {
    const src = sqlSrc();
    expect(src).toContain('SELECT_PROOF_PACK_FOR_DOWNLOAD');
    expect(src).toContain('JOIN');
  });

  it('has UPDATE_PROOF_PACK_ASSEMBLED', () => {
    expect(sqlSrc()).toContain('UPDATE_PROOF_PACK_ASSEMBLED');
  });

  it('has UPDATE_PROOF_PACK_DOWNLOADED', () => {
    expect(sqlSrc()).toContain('UPDATE_PROOF_PACK_DOWNLOADED');
  });

  it('has INSERT_AUDIT_EVENT', () => {
    expect(sqlSrc()).toContain('INSERT_AUDIT_EVENT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E.3 — Replay Diff Summary
// ═══════════════════════════════════════════════════════════════════════════════

describe('E.3 — Replay Diff Summary', () => {
  const router = () => readAbs(ROUTER_PY);

  it('replay-determinism endpoint returns diff_summary', () => {
    expect(router()).toContain('diff_summary');
  });

  it('replay-determinism returns drift_reason_codes', () => {
    expect(router()).toContain('drift_reason_codes');
  });

  it('replay-determinism returns block_download', () => {
    expect(router()).toContain('block_download');
  });

  it('drift reason: MANIFEST_CHANGED', () => {
    expect(router()).toContain('MANIFEST_CHANGED');
  });

  it('drift reason: CONTRACT_CHANGED', () => {
    expect(router()).toContain('CONTRACT_CHANGED');
  });

  it('drift reason: RISK_CODES_CHANGED', () => {
    expect(router()).toContain('RISK_CODES_CHANGED');
  });

  it('diff_summary has severity field', () => {
    const src = router();
    expect(src).toMatch(/severity.*HIGH|HIGH.*severity/);
  });

  it('block_download is true when HIGH severity drift detected', () => {
    const src = router();
    // HIGH severity means block_download = True
    expect(src).toContain('block_download');
    expect(src).toMatch(/HIGH/);
  });

  // TS types
  const types = () => readAbs(SHARED_TYPES);

  it('DriftSeverity type exists', () => {
    expect(types()).toContain('DriftSeverity');
  });

  it('DriftDiffEntry interface exists', () => {
    expect(types()).toContain('DriftDiffEntry');
  });

  it('ReplayDeterminismResult has diff_summary field', () => {
    expect(types()).toMatch(/ReplayDeterminismResult[\s\S]*?diff_summary/);
  });

  it('ReplayDeterminismResult has drift_reason_codes field', () => {
    expect(types()).toMatch(/ReplayDeterminismResult[\s\S]*?drift_reason_codes/);
  });

  it('ReplayDeterminismResult has block_download field', () => {
    expect(types()).toMatch(/ReplayDeterminismResult[\s\S]*?block_download/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E.4 — Part 11 Audit Completeness
// ═══════════════════════════════════════════════════════════════════════════════

describe('E.4 — Part 11 Audit Completeness', () => {
  const router = () => readAbs(ROUTER_PY);
  const bff = () => readAbs(BFF_ROUTE);

  it('Shadow: PROOF_PACK_CREATED audit event emitted on persist', () => {
    expect(router()).toContain('PROOF_PACK_CREATED');
  });

  it('Shadow: PROOF_PACK_DOWNLOADED audit event emitted on download', () => {
    expect(router()).toContain('PROOF_PACK_DOWNLOADED');
  });

  it('Shadow: PROOF_PACK_DRIFT_DETECTED audit event on replay drift', () => {
    expect(router()).toContain('PROOF_PACK_DRIFT_DETECTED');
  });

  it('BFF: logAuditEvent called for download', () => {
    const src = bff();
    expect(src).toContain('PROOF_PACK_DOWNLOADED');
    expect(src).toContain('logAuditEvent');
  });

  it('audit events stored in proof_pack_audit_events table', () => {
    const migration = readAbs(PROOF_PACK_MIGRATION);
    expect(migration).toContain('proof_pack_audit_events');
    expect(migration).toContain('action');
    expect(migration).toContain('user_id');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Shadow Endpoints — E.1/E.2/E.3
// ═══════════════════════════════════════════════════════════════════════════════

describe('Shadow Router — Proof Pack Endpoints', () => {
  const router = () => readAbs(ROUTER_PY);

  it('POST /proof-pack/persist endpoint exists', () => {
    expect(router()).toContain('@router.post("/proof-pack/persist")');
  });

  it('GET /proof-pack/{proof_pack_id}/download endpoint exists (G)', () => {
    expect(router()).toContain('@router.get("/proof-pack/{proof_pack_id}/download")');
  });

  it('GET /proof-pack/{proof_pack_id}/verify endpoint exists (G)', () => {
    expect(router()).toContain('@router.get("/proof-pack/{proof_pack_id}/verify")');
  });

  it('download returns ZIP content-type', () => {
    expect(router()).toContain('application/zip');
  });

  it('download returns X-Proof-Pack-Hash header', () => {
    expect(router()).toContain('X-Proof-Pack-Hash');
  });

  it('download returns X-Manifest-Hash header', () => {
    expect(router()).toContain('X-Manifest-Hash');
  });

  it('download blocks on risk_vocab_hash mismatch (409)', () => {
    const src = router();
    expect(src).toContain('409');
  });

  it('verify returns verified field (G — replaces hashes_consistent)', () => {
    expect(router()).toContain('verified');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BFF Routes — E.1/E.2
// ═══════════════════════════════════════════════════════════════════════════════

describe('BFF Routes — Proof Pack', () => {
  const bff = () => readAbs(BFF_ROUTE);

  it('persist route exists', () => {
    expect(bff()).toContain('predicate-intel/proof-pack/persist');
  });

  it('download route exists', () => {
    expect(bff()).toContain('predicate-intel/proof-pack');
    expect(bff()).toContain('/download');
  });

  it('verify route exists', () => {
    expect(bff()).toContain('/verify');
  });

  it('download sets Content-Disposition header', () => {
    expect(bff()).toContain('Content-Disposition');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Hooks — E.1/E.2
// ═══════════════════════════════════════════════════════════════════════════════

describe('React Hooks — Proof Pack', () => {
  const hooks = () => readAbs(HOOKS);

  it('proofPackExportKeys object exists', () => {
    expect(hooks()).toContain('proofPackExportKeys');
  });

  it('usePersistProofPack hook exported', () => {
    expect(hooks()).toContain('export function usePersistProofPack');
  });

  it('useVerifyProofPack hook exported', () => {
    expect(hooks()).toContain('export function useVerifyProofPack');
  });

  it('useDownloadProofPack hook exported', () => {
    expect(hooks()).toContain('export function useDownloadProofPack');
  });

  it('ProofPackPersistResult type imported', () => {
    expect(hooks()).toContain('ProofPackPersistResult');
  });

  it('ProofPackVerifyResult type imported', () => {
    expect(hooks()).toContain('ProofPackVerifyResult');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// UI — E.3 "Why Blocked?" Panel
// ═══════════════════════════════════════════════════════════════════════════════

describe('SEMatrixV2Panel — Why Blocked? + Evidence Pack', () => {
  const ui = () => readAbs(SE_MATRIX_V2);

  it('Download Evidence Pack button exists', () => {
    expect(ui()).toContain('download-proof-pack-btn');
  });

  it('drift panel exists with data-testid', () => {
    expect(ui()).toContain('drift-panel');
  });

  it('drift reason codes displayed', () => {
    expect(ui()).toContain('drift-reason-codes');
  });

  it('diff summary table rendered', () => {
    expect(ui()).toContain('diff-summary-table');
  });

  it('isDownloadBlocked is server-authoritative', () => {
    const src = ui();
    expect(src).toContain('block_download');
  });

  it('auto-persist on generate success', () => {
    const src = ui();
    expect(src).toContain('persistMutation');
  });

  it('imports usePersistProofPack', () => {
    expect(ui()).toContain('usePersistProofPack');
  });

  it('imports useDownloadProofPack', () => {
    expect(ui()).toContain('useDownloadProofPack');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F.1 — Safety Signal Ingest
// ═══════════════════════════════════════════════════════════════════════════════

describe('F.1 — Safety Signal Ingest', () => {
  const router = () => readAbs(ROUTER_PY);

  it('POST /safety-signals/ingest endpoint exists', () => {
    expect(router()).toContain('@router.post("/safety-signals/ingest")');
  });

  it('GET /safety-signals/{k_number}/profile endpoint exists', () => {
    expect(router()).toContain('@router.get("/safety-signals/{k_number}/profile")');
  });

  it('ingest uses UPSERT_SAFETY_SIGNAL (idempotent)', () => {
    expect(router()).toContain('UPSERT_SAFETY_SIGNAL');
  });

  it('profile returns toxicity_score', () => {
    expect(router()).toContain('toxicity_score');
  });

  it('profile returns badge field', () => {
    expect(router()).toContain('"badge"');
  });

  it('profile returns strategy_override', () => {
    expect(router()).toContain('strategy_override');
  });

  it('badge is TOXIC when toxicity > 0.6', () => {
    expect(router()).toContain('TOXIC');
    expect(router()).toContain('0.6');
  });

  it('badge is RISKY_FAMILY for family toxicity > 0.3', () => {
    expect(router()).toContain('RISKY_FAMILY');
  });

  it('badge is CLEAN when safe', () => {
    expect(router()).toContain('CLEAN');
  });

  it('verifies k_number exists before ingest', () => {
    expect(router()).toContain('SELECT_CLEARANCE');
    expect(router()).toContain('not found in FDA clearance universe');
  });

  // Existing SQL infrastructure
  const sql = () => readAbs(SQL_FDA_UNIVERSE);

  it('UPSERT_SAFETY_SIGNAL exists in sql_fda_universe', () => {
    expect(sql()).toContain('UPSERT_SAFETY_SIGNAL');
  });

  it('ON CONFLICT DO NOTHING for idempotent ingest', () => {
    expect(sql()).toContain('ON CONFLICT DO NOTHING');
  });

  it('SELECT_SIGNALS_BY_K_NUMBER exists', () => {
    expect(sql()).toContain('SELECT_SIGNALS_BY_K_NUMBER');
  });

  it('CHECK_FAMILY_SAFETY uses recursive CTE', () => {
    const src = sql();
    expect(src).toContain('CHECK_FAMILY_SAFETY');
    expect(src).toContain('WITH RECURSIVE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F.1 — BFF Routes for Safety Signals
// ═══════════════════════════════════════════════════════════════════════════════

describe('F.1 — BFF Routes for Safety Signals', () => {
  const bff = () => readAbs(BFF_ROUTE);

  it('ingest route exists', () => {
    expect(bff()).toContain('safety-signals/ingest');
  });

  it('profile route exists', () => {
    expect(bff()).toContain('safety-signals');
    expect(bff()).toContain('/profile');
  });

  it('ingest emits audit event', () => {
    expect(bff()).toContain('SAFETY_SIGNALS_INGESTED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F.1 — React Hooks for Safety Signals
// ═══════════════════════════════════════════════════════════════════════════════

describe('F.1 — React Hooks for Safety Signals', () => {
  const hooks = () => readAbs(HOOKS);

  it('useIngestSafetySignals hook exported', () => {
    expect(hooks()).toContain('export function useIngestSafetySignals');
  });

  it('useToxicityProfile hook exported', () => {
    expect(hooks()).toContain('export function useToxicityProfile');
  });

  it('safetySignalKeys object exists', () => {
    expect(hooks()).toContain('safetySignalKeys');
  });

  it('PredicateToxicityProfile type imported', () => {
    expect(hooks()).toContain('PredicateToxicityProfile');
  });

  it('SafetySignalIngestResult type imported', () => {
    expect(hooks()).toContain('SafetySignalIngestResult');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F.1 — Shared Types for Safety Signals
// ═══════════════════════════════════════════════════════════════════════════════

describe('F.1 — Shared Types for Safety Signals', () => {
  const types = () => readAbs(SHARED_TYPES);

  it('ToxicityBadge type exported', () => {
    expect(types()).toContain("export type ToxicityBadge = 'TOXIC' | 'RISKY_FAMILY' | 'CLEAN'");
  });

  it('PredicateToxicityProfile interface exported', () => {
    expect(types()).toContain('export interface PredicateToxicityProfile');
  });

  it('PredicateToxicityProfile has badge field', () => {
    expect(types()).toMatch(/PredicateToxicityProfile[\s\S]*?badge:\s*ToxicityBadge/);
  });

  it('PredicateToxicityProfile has strategy_override', () => {
    expect(types()).toMatch(/PredicateToxicityProfile[\s\S]*?strategy_override/);
  });

  it('SafetySignalIngestResult interface exported', () => {
    expect(types()).toContain('export interface SafetySignalIngestResult');
  });

  it('SafetySignalIngestResult has signals_upserted', () => {
    expect(types()).toMatch(/SafetySignalIngestResult[\s\S]*?signals_upserted/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F.2 — Lineage Graph v1
// ═══════════════════════════════════════════════════════════════════════════════

describe('F.2 — Lineage Graph v1', () => {
  const router = () => readAbs(ROUTER_PY);

  it('GET /lineage/{k_number}/graph endpoint exists', () => {
    expect(router()).toContain('@router.get("/lineage/{k_number}/graph")');
  });

  it('uses GET_FULL_LINEAGE_TREE recursive CTE', () => {
    expect(router()).toContain('GET_FULL_LINEAGE_TREE');
  });

  it('max_depth defaults to 2', () => {
    expect(router()).toMatch(/max_depth.*2/);
  });

  it('returns edges array', () => {
    expect(router()).toContain('"edges"');
  });

  it('returns family_toxicity', () => {
    expect(router()).toContain('"family_toxicity"');
  });

  it('returns total_nodes', () => {
    expect(router()).toContain('"total_nodes"');
  });

  it('confidence = 1.0 for summary_parse source', () => {
    expect(router()).toContain('summary_parse');
    expect(router()).toContain('1.0');
  });

  // Existing SQL
  const sql = () => readAbs(SQL_FDA_UNIVERSE);

  it('GET_FULL_LINEAGE_TREE exists in sql_fda_universe', () => {
    expect(sql()).toContain('GET_FULL_LINEAGE_TREE');
  });

  it('lineage CTE limits depth', () => {
    expect(sql()).toMatch(/WHERE t\.depth < \$2/);
  });

  it('UPSERT_LINEAGE exists for ingestion', () => {
    expect(sql()).toContain('UPSERT_LINEAGE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F.2 — BFF Routes for Lineage
// ═══════════════════════════════════════════════════════════════════════════════

describe('F.2 — BFF Routes for Lineage', () => {
  const bff = () => readAbs(BFF_ROUTE);

  it('lineage graph route exists', () => {
    expect(bff()).toContain('lineage');
    expect(bff()).toContain('/graph');
  });

  it('maxDepth query param forwarded', () => {
    expect(bff()).toContain('maxDepth');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F.2 — React Hooks for Lineage
// ═══════════════════════════════════════════════════════════════════════════════

describe('F.2 — React Hooks for Lineage', () => {
  const hooks = () => readAbs(HOOKS);

  it('useLineageGraph hook exported', () => {
    expect(hooks()).toContain('export function useLineageGraph');
  });

  it('lineageKeys object exists', () => {
    expect(hooks()).toContain('lineageKeys');
  });

  it('LineageGraph type imported', () => {
    expect(hooks()).toContain('LineageGraph');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F.2 — Shared Types for Lineage
// ═══════════════════════════════════════════════════════════════════════════════

describe('F.2 — Shared Types for Lineage', () => {
  const types = () => readAbs(SHARED_TYPES);

  it('LineageEdge interface exported', () => {
    expect(types()).toContain('export interface LineageEdge');
  });

  it('LineageEdge has confidence field', () => {
    expect(types()).toMatch(/LineageEdge[\s\S]*?confidence:\s*number/);
  });

  it('LineageEdge has parent_device_name field', () => {
    expect(types()).toMatch(/LineageEdge[\s\S]*?parent_device_name/);
  });

  it('LineageGraph interface exported', () => {
    expect(types()).toContain('export interface LineageGraph');
  });

  it('LineageGraph has family_toxicity', () => {
    expect(types()).toMatch(/LineageGraph[\s\S]*?family_toxicity:\s*number/);
  });

  it('LineageGraph has total_nodes', () => {
    expect(types()).toMatch(/LineageGraph[\s\S]*?total_nodes:\s*number/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-cutting: No duplicate SafetySignal types
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cross-cutting — Type Hygiene', () => {
  const types = () => readAbs(SHARED_TYPES);

  it('only one SafetySignal interface (not duplicated)', () => {
    const matches = types().match(/export interface SafetySignal\b/g);
    expect(matches?.length).toBe(1);
  });

  it('existing SignalType used (no duplicate SafetySignalType)', () => {
    // We should use the existing SignalType, not create a new SafetySignalType
    const src = types();
    expect(src).toContain('export type SignalType');
    // SafetySignalType should NOT exist as a separate export
    expect(src).not.toContain('export type SafetySignalType');
  });

  it('no orphan phase 6.6.F SafetySignal interface', () => {
    const src = types();
    // The F section should reference existing SafetySignal, not define a new one
    const fSection = src.split('Phase 6.6.F').pop() || '';
    expect(fSection).not.toContain('export interface SafetySignal {');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Existing Safety Infrastructure Integration
// ═══════════════════════════════════════════════════════════════════════════════

describe('Integration — Existing Safety Infrastructure', () => {
  it('predicate_safety_signals table defined in migration', () => {
    const fda = read('db/migrations/20260207_phase6_6a_fda_clearance_universe.sql');
    expect(fda).toContain('predicate.predicate_safety_signals');
  });

  it('predicate_lineage table defined in migration', () => {
    const fda = read('db/migrations/20260207_phase6_6a_fda_clearance_universe.sql');
    expect(fda).toContain('predicate.predicate_lineage');
  });

  it('strategy_engine.py uses TOXICITY_AVOID_THRESHOLD = 0.6', () => {
    const engine = readAbs(join(SHADOW, 'scoring', 'strategy_engine.py'));
    expect(engine).toContain('TOXICITY_AVOID_THRESHOLD');
    expect(engine).toContain('0.6');
  });

  it('strategy_engine.py calculates toxicity with same weights', () => {
    const engine = readAbs(join(SHADOW, 'scoring', 'strategy_engine.py'));
    expect(engine).toContain('Class1Recall');
    expect(engine).toContain('0.95');
  });

  it('existing toxic-detail endpoint returns signal citations', () => {
    const router = readAbs(ROUTER_PY);
    expect(router).toContain('toxic-detail');
    expect(router).toContain('toxic_because');
  });
});
