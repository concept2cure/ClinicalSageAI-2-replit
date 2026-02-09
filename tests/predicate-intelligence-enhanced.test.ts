/**
 * Tests for Phase 6.6 Enhanced — Predicate Intelligence (6.6.A–D)
 *
 * Validates:
 *  1. Phase 6.6.A — FDA Clearance Universe migration (5 tables + matview)
 *  2. Phase 6.6.A — SQL FDA Universe queries (~30 parameterized queries)
 *  3. Phase 6.6.A — Pydantic models (22+ models/enums)
 *  4. Phase 6.6.A — Ingest job (FDA510kIngestor)
 *  5. Phase 6.6.A — Embedding builder (PredicateEmbeddingBuilder)
 *  6. Phase 6.6.B — Strategy Engine (StrategyEngine class)
 *  7. Phase 6.6.C — SE Matrix Generator (SEMatrixGenerator class)
 *  8. Phase 6.6.B/C — Router endpoints (predicate-suggest, generate-se-matrix)
 *  9. Phase 6.6.B/C — BFF proxy routes
 * 10. Shared TypeScript types — new types synced with Python models
 * 11. React hooks — new mutation hooks
 * 12. Phase 6.6.D — UI enhancements (Strategy tab, badges, SE generator)
 *
 * @phase 6.6 Enhanced — Predicate Intelligence A–D
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// Paths
// ═══════════════════════════════════════════════════════════════════════════════

const ROOT = path.resolve(__dirname, '..');
const SHADOW = path.join(ROOT, 'shadow_service', 'shadow_service');

// Phase 6.6.A files
const MIGRATION_6A = path.join(
  ROOT, 'db', 'migrations', '20260207_phase6_6a_fda_clearance_universe.sql'
);
const SQL_FDA_UNIVERSE = path.join(SHADOW, 'sql_fda_universe.py');
const MODELS_FDA_UNIVERSE = path.join(SHADOW, 'models_fda_universe.py');
const INGEST_JOB = path.join(SHADOW, 'jobs', 'ingest_fda_510k.py');
const EMBEDDING_JOB = path.join(SHADOW, 'jobs', 'build_predicate_embeddings.py');

// Phase 6.6.B files
const SCORING_INIT = path.join(SHADOW, 'scoring', '__init__.py');
const STRATEGY_ENGINE = path.join(SHADOW, 'scoring', 'strategy_engine.py');

// Phase 6.6.C files
const GENERATORS_INIT = path.join(SHADOW, 'generators', '__init__.py');
const SE_MATRIX_GEN = path.join(SHADOW, 'generators', 'se_matrix_generator.py');

// Router + BFF
const ROUTER_PY = path.join(SHADOW, 'router_predicate.py');
const BFF_ROUTE = path.join(ROOT, 'server', 'routes', 'predicate-intelligence.ts');

// Frontend
const SHARED_TYPES = path.join(ROOT, 'shared', 'types', 'predicate-intelligence.ts');
const HOOKS_FILE = path.join(ROOT, 'client', 'src', 'hooks', 'use-predicate-intelligence.ts');
const PAGE_FILE = path.join(ROOT, 'client', 'src', 'pages', 'PredicateIntelligence.tsx');

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function readFileContent(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Phase 6.6.A — FDA Clearance Universe Migration
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.A — FDA Clearance Universe Migration', () => {
  it('migration file exists', () => {
    expect(fileExists(MIGRATION_6A)).toBe(true);
  });

  it('enables pgvector extension', () => {
    const content = readFileContent(MIGRATION_6A);
    expect(content).toContain('CREATE EXTENSION IF NOT EXISTS vector');
  });

  it('enables pg_trgm extension', () => {
    const content = readFileContent(MIGRATION_6A);
    expect(content).toContain('pg_trgm');
  });

  it('creates predicate.fda_product_codes table', () => {
    const content = readFileContent(MIGRATION_6A);
    expect(content).toContain('predicate.fda_product_codes');
    expect(content).toContain('device_class');
    expect(content).toContain('regulation_number');
    expect(content).toContain('review_panel');
  });

  it('creates predicate.fda_510k_clearances table', () => {
    const content = readFileContent(MIGRATION_6A);
    expect(content).toContain('predicate.fda_510k_clearances');
    expect(content).toContain('k_number');
    expect(content).toContain('applicant');
    expect(content).toContain('device_name');
    expect(content).toContain('product_code');
    expect(content).toContain('decision_date');
    expect(content).toContain('decision_code');
    expect(content).toContain('summary_url');
    expect(content).toContain('clearance_type');
    expect(content).toContain('txt_content');
  });

  it('creates predicate.predicate_safety_signals table', () => {
    const content = readFileContent(MIGRATION_6A);
    expect(content).toContain('predicate.predicate_safety_signals');
    expect(content).toContain('signal_type');
    expect(content).toContain('severity_score');
  });

  it('creates predicate.fda_510k_embeddings table with vector column', () => {
    const content = readFileContent(MIGRATION_6A);
    expect(content).toContain('predicate.fda_510k_embeddings');
    expect(content).toContain('vector(1536)');
  });

  it('creates predicate.predicate_lineage table', () => {
    const content = readFileContent(MIGRATION_6A);
    expect(content).toContain('predicate.predicate_lineage');
    expect(content).toContain('child_k_number');
    expect(content).toContain('parent_k_number');
    expect(content).toContain('relationship_type');
    expect(content).toContain('lineage_distance');
  });

  it('creates toxic_predicates materialized view', () => {
    const content = readFileContent(MIGRATION_6A);
    expect(content).toContain('MATERIALIZED VIEW');
    expect(content).toContain('toxic_predicates');
  });

  it('creates ivfflat index on embeddings', () => {
    const content = readFileContent(MIGRATION_6A);
    expect(content).toContain('ivfflat');
  });

  it('creates indexes on key columns', () => {
    const content = readFileContent(MIGRATION_6A);
    expect(content).toContain('CREATE INDEX');
    // At least these important indexes
    expect(content).toContain('product_code');
    expect(content).toContain('decision_date');
  });

  it('references signal_type enum values', () => {
    const content = readFileContent(MIGRATION_6A);
    expect(content).toContain('Class1Recall');
    expect(content).toContain('Class2Recall');
    expect(content).toContain('SafetyCommunication');
    expect(content).toContain('MDRReport');
    expect(content).toContain('WarningLetter');
  });

  it('references relationship_type values', () => {
    const content = readFileContent(MIGRATION_6A);
    expect(content).toContain('DirectPredicate');
    expect(content).toContain('Grandparent');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Phase 6.6.A — SQL FDA Universe Queries
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.A — sql_fda_universe.py queries', () => {
  it('file exists', () => {
    expect(fileExists(SQL_FDA_UNIVERSE)).toBe(true);
  });

  const requiredQueries = [
    'UPSERT_PRODUCT_CODE',
    'UPSERT_CLEARANCE',
    'UPSERT_SAFETY_SIGNAL',
    'UPSERT_EMBEDDING',
    'UPSERT_LINEAGE',
    'SELECT_CLEARANCE',
    'SEMANTIC_SEARCH_CLEARANCES',
    'TEXT_SEARCH_CLEARANCES',
    'SELECT_SAFETY_SIGNALS',
    'CHECK_FAMILY_SAFETY',
    'SELECT_CLEARANCES_NEEDING_EMBEDDINGS',
    'REFRESH_TOXIC_PREDICATES',
  ];

  requiredQueries.forEach(q => {
    it(`defines query ${q}`, () => {
      const content = readFileContent(SQL_FDA_UNIVERSE);
      expect(content).toContain(q);
    });
  });

  it('uses pgvector distance operator <=>', () => {
    const content = readFileContent(SQL_FDA_UNIVERSE);
    expect(content).toContain('<=>');
  });

  it('uses parameterized queries with $N syntax', () => {
    const content = readFileContent(SQL_FDA_UNIVERSE);
    expect(content).toMatch(/\$1/);
    expect(content).toMatch(/\$2/);
  });

  it('uses recursive CTE for lineage safety check', () => {
    const content = readFileContent(SQL_FDA_UNIVERSE);
    expect(content).toContain('RECURSIVE');
  });

  it('uses ON CONFLICT for UPSERT operations', () => {
    const content = readFileContent(SQL_FDA_UNIVERSE);
    expect(content).toContain('ON CONFLICT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Phase 6.6.A — Pydantic Models (FDA Universe)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.A — models_fda_universe.py', () => {
  it('file exists', () => {
    expect(fileExists(MODELS_FDA_UNIVERSE)).toBe(true);
  });

  const requiredEnums = [
    'DecisionCode',
    'ClearanceType',
    'SignalType',
    'RelationshipType',
    'DeviceClass',
    'StrategyRecommendation',
    'LineageSafety',
  ];

  requiredEnums.forEach(e => {
    it(`defines enum ${e}`, () => {
      const content = readFileContent(MODELS_FDA_UNIVERSE);
      expect(content).toContain(`class ${e}`);
    });
  });

  const requiredModels = [
    'FDAProductCode',
    'FDA510kClearance',
    'FDA510kClearanceCreate',
    'SafetySignal',
    'SafetySignalCreate',
    'EmbeddingRecord',
    'PredicateLineage',
    'PredicateLineageCreate',
    'LineageNode',
    'StrategyScore',
    'PredicateSuggestion',
    'PredicateSuggestRequest',
    'PredicateSuggestResponse',
    'IngestionStatus',
    'ToxicPredicate',
  ];

  requiredModels.forEach(m => {
    it(`defines model ${m}`, () => {
      const content = readFileContent(MODELS_FDA_UNIVERSE);
      expect(content).toContain(`class ${m}`);
    });
  });

  it('uses Pydantic BaseModel', () => {
    const content = readFileContent(MODELS_FDA_UNIVERSE);
    expect(content).toContain('from pydantic import');
    expect(content).toContain('BaseModel');
  });

  it('StrategyRecommendation has all expected values', () => {
    const content = readFileContent(MODELS_FDA_UNIVERSE);
    expect(content).toContain('CONSERVATIVE');
    expect(content).toContain('AGGRESSIVE');
    expect(content).toContain('BALANCED');
    expect(content).toContain('RISKY');
    expect(content).toContain('AVOID');
  });

  it('LineageSafety has CLEAN, COMPROMISED, UNKNOWN', () => {
    const content = readFileContent(MODELS_FDA_UNIVERSE);
    expect(content).toContain('CLEAN');
    expect(content).toContain('COMPROMISED');
    expect(content).toContain('UNKNOWN');
  });

  it('PredicateSuggestion has composite_score field', () => {
    const content = readFileContent(MODELS_FDA_UNIVERSE);
    expect(content).toContain('composite_score');
  });

  it('PredicateSuggestRequest has product_code and intended_use', () => {
    const content = readFileContent(MODELS_FDA_UNIVERSE);
    expect(content).toContain('product_code: str');
    expect(content).toContain('intended_use: str');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Phase 6.6.A — FDA 510(k) Ingest Job
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.A — ingest_fda_510k.py', () => {
  it('file exists', () => {
    expect(fileExists(INGEST_JOB)).toBe(true);
  });

  it('defines FDA510kIngestor class', () => {
    const content = readFileContent(INGEST_JOB);
    expect(content).toContain('class FDA510kIngestor');
  });

  it('has run() method', () => {
    const content = readFileContent(INGEST_JOB);
    expect(content).toContain('async def run(');
  });

  it('uses openFDA API endpoint', () => {
    const content = readFileContent(INGEST_JOB);
    expect(content).toContain('api.fda.gov');
  });

  it('fetches 510k clearances', () => {
    const content = readFileContent(INGEST_JOB);
    expect(content).toContain('device/510k.json');
  });

  it('fetches enforcement data', () => {
    const content = readFileContent(INGEST_JOB);
    expect(content).toContain('enforcement');
  });

  it('extracts K-numbers from recall text', () => {
    const content = readFileContent(INGEST_JOB);
    expect(content).toMatch(/K\d{6}/);
  });

  it('maps recall severity to signal types', () => {
    const content = readFileContent(INGEST_JOB);
    expect(content).toContain('Class I');
    expect(content).toContain('Class II');
    expect(content).toContain('Class III');
  });

  it('uses httpx for HTTP requests', () => {
    const content = readFileContent(INGEST_JOB);
    expect(content).toContain('httpx');
  });

  it('supports CLI invocation', () => {
    const content = readFileContent(INGEST_JOB);
    expect(content).toContain('__main__');
  });

  it('uses UPSERT queries for idempotent operation', () => {
    const content = readFileContent(INGEST_JOB);
    expect(content).toContain('UPSERT_CLEARANCE');
    expect(content).toContain('UPSERT_SAFETY_SIGNAL');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Phase 6.6.A — Predicate Embedding Builder
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.A — build_predicate_embeddings.py', () => {
  it('file exists', () => {
    expect(fileExists(EMBEDDING_JOB)).toBe(true);
  });

  it('defines PredicateEmbeddingBuilder class', () => {
    const content = readFileContent(EMBEDDING_JOB);
    expect(content).toContain('class PredicateEmbeddingBuilder');
  });

  it('has run() method', () => {
    const content = readFileContent(EMBEDDING_JOB);
    expect(content).toContain('async def run(');
  });

  it('uses text-embedding-3-large model', () => {
    const content = readFileContent(EMBEDDING_JOB);
    expect(content).toContain('text-embedding-3-large');
  });

  it('uses 1536 dimensions', () => {
    const content = readFileContent(EMBEDDING_JOB);
    expect(content).toContain('1536');
  });

  it('processes embeddings in batches', () => {
    const content = readFileContent(EMBEDDING_JOB);
    expect(content).toContain('batch');
  });

  it('queries clearances needing embeddings', () => {
    const content = readFileContent(EMBEDDING_JOB);
    expect(content).toContain('SELECT_CLEARANCES_NEEDING_EMBEDDINGS');
  });

  it('upserts embeddings', () => {
    const content = readFileContent(EMBEDDING_JOB);
    expect(content).toContain('UPSERT_EMBEDDING');
  });

  it('supports CLI invocation', () => {
    const content = readFileContent(EMBEDDING_JOB);
    expect(content).toContain('__main__');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Phase 6.6.B — Strategy Engine
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.B — strategy_engine.py', () => {
  it('scoring package __init__.py exists', () => {
    expect(fileExists(SCORING_INIT)).toBe(true);
  });

  it('strategy engine file exists', () => {
    expect(fileExists(STRATEGY_ENGINE)).toBe(true);
  });

  it('defines StrategyEngine class', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('class StrategyEngine');
  });

  it('has suggest_predicates() method', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('async def suggest_predicates(');
  });

  it('defines TOXICITY_WEIGHTS dictionary', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('TOXICITY_WEIGHTS');
    expect(content).toContain('"Class1Recall"');
    expect(content).toContain('0.95');
  });

  it('defines TOXICITY_AVOID_THRESHOLD', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('TOXICITY_AVOID_THRESHOLD');
    expect(content).toContain('0.6');
  });

  it('defines TOXICITY_RISKY_THRESHOLD', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('TOXICITY_RISKY_THRESHOLD');
    expect(content).toContain('0.3');
  });

  it('calculates composite score (similarity - toxicity penalty)', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('_composite_score');
  });

  it('has toxicity calculation method', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('_calculate_toxicity');
  });

  it('checks family/lineage safety', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('_check_family_safety');
  });

  it('builds subject text from request fields', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('_build_subject_text');
  });

  it('supports semantic search with fallback to text', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('_get_candidates');
    expect(content).toContain('_semantic_search');
    expect(content).toContain('_text_search');
  });

  it('imports from sql_fda_universe', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('import sql_fda_universe');
  });

  it('imports StrategyRecommendation from models', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('StrategyRecommendation');
  });

  it('generates human-readable strategy explanations', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('explanation');
  });

  it('sorts suggestions by composite score', () => {
    const content = readFileContent(STRATEGY_ENGINE);
    expect(content).toContain('composite_score');
    expect(content).toContain('reverse=True');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Phase 6.6.C — SE Matrix Generator
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.C — se_matrix_generator.py', () => {
  it('generators package __init__.py exists', () => {
    expect(fileExists(GENERATORS_INIT)).toBe(true);
  });

  it('SE matrix generator file exists', () => {
    expect(fileExists(SE_MATRIX_GEN)).toBe(true);
  });

  it('defines SEMatrixGenerator class', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('class SEMatrixGenerator');
  });

  it('defines DiffResult dataclass', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('class DiffResult');
    expect(content).toContain('@dataclass');
  });

  it('has generate_payload() method', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('def generate_payload(');
  });

  it('has analyze_difference() method', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('def analyze_difference(');
  });

  it('has calculate_readiness() method', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('def calculate_readiness(');
  });

  it('defines 9 comparison characteristics', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('CHARACTERISTICS');
    expect(content).toContain('Intended Use');
    expect(content).toContain('Technological Characteristics');
    expect(content).toContain('Materials of Construction');
    expect(content).toContain('Energy Source');
    expect(content).toContain('Performance Characteristics');
    expect(content).toContain('Biocompatibility');
    expect(content).toContain('Sterilization Method');
    expect(content).toContain('Software/Firmware');
    expect(content).toContain('Labeling / General');
  });

  it('analyzes materials with ISO 10993 reference', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('ISO 10993');
  });

  it('analyzes energy with IEC 60601 reference', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('IEC 60601');
  });

  it('analyzes sterilization (EO, radiation, steam)', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('_analyze_sterilization');
  });

  it('analyzes software (IEC 62304)', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('IEC 62304');
    expect(content).toContain('_analyze_software');
  });

  it('analyzes intended use', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('_analyze_intended_use');
  });

  it('generates evidence-linked cells', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('EvidenceCell');
    expect(content).toContain('evidence_ids');
    expect(content).toContain('confidence');
  });

  it('returns template_id for DOCX rendering', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('510k_se_matrix_v2');
  });

  it('tracks significant material changes', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('SIGNIFICANT_MATERIAL_CHANGES');
    expect(content).toContain('titanium');
    expect(content).toContain('silicone');
  });

  it('references ISO sterilization standards', () => {
    const content = readFileContent(SE_MATRIX_GEN);
    expect(content).toContain('ISO 11135');
    expect(content).toContain('ISO 11137');
    expect(content).toContain('ISO 17665');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Router — New Endpoints (Phase 6.6.B/C)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Router — Phase 6.6.B/C new endpoints', () => {
  it('router_predicate.py exists', () => {
    expect(fileExists(ROUTER_PY)).toBe(true);
  });

  it('defines POST /device/predicate-suggest endpoint', () => {
    const content = readFileContent(ROUTER_PY);
    expect(content).toContain('/device/predicate-suggest');
    expect(content).toContain('@router.post');
  });

  it('defines PredicateSuggestRequestBody model', () => {
    const content = readFileContent(ROUTER_PY);
    expect(content).toContain('class PredicateSuggestRequestBody');
    expect(content).toContain('product_code');
    expect(content).toContain('intended_use');
  });

  it('suggest endpoint uses StrategyEngine', () => {
    const content = readFileContent(ROUTER_PY);
    expect(content).toContain('StrategyEngine');
    expect(content).toContain('suggest_predicates');
  });

  it('defines POST /generate-se-matrix endpoint', () => {
    const content = readFileContent(ROUTER_PY);
    expect(content).toContain('/generate-se-matrix');
  });

  it('defines GenerateSEMatrixRequest model', () => {
    const content = readFileContent(ROUTER_PY);
    expect(content).toContain('class GenerateSEMatrixRequest');
    expect(content).toContain('selected_predicate_k_number');
    expect(content).toContain('subject_device');
    expect(content).toContain('design_control_ids');
  });

  it('generate-se-matrix endpoint uses SEMatrixGenerator', () => {
    const content = readFileContent(ROUTER_PY);
    expect(content).toContain('SEMatrixGenerator');
    expect(content).toContain('generate_payload');
  });

  it('suggest endpoint sets program context', () => {
    const content = readFileContent(ROUTER_PY);
    // verify SET_PROGRAM_CONTEXT is called in suggest endpoint
    expect(content).toContain('SET_PROGRAM_CONTEXT');
  });

  it('generate-se-matrix fetches predicate from FDA clearances', () => {
    const content = readFileContent(ROUTER_PY);
    expect(content).toContain('sql_fda_universe');
    expect(content).toContain('SELECT_CLEARANCE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. BFF Proxy Routes
// ═══════════════════════════════════════════════════════════════════════════════

describe('BFF — Phase 6.6.B/C proxy routes', () => {
  it('BFF route file exists', () => {
    expect(fileExists(BFF_ROUTE)).toBe(true);
  });

  it('proxies POST /device/predicate-suggest', () => {
    const content = readFileContent(BFF_ROUTE);
    expect(content).toContain('/device/predicate-suggest');
  });

  it('proxies POST /generate-se-matrix', () => {
    const content = readFileContent(BFF_ROUTE);
    expect(content).toContain('/generate-se-matrix');
  });

  it('uses router.post for new endpoints', () => {
    const content = readFileContent(BFF_ROUTE);
    expect(content).toContain('router.post');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Shared TypeScript Types — Phase 6.6 Enhanced
// ═══════════════════════════════════════════════════════════════════════════════

describe('Shared Types — Phase 6.6 Enhanced', () => {
  it('types file exists', () => {
    expect(fileExists(SHARED_TYPES)).toBe(true);
  });

  it('exports StrategyRecommendation type', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('StrategyRecommendation');
    expect(content).toContain("'CONSERVATIVE'");
    expect(content).toContain("'AGGRESSIVE'");
    expect(content).toContain("'BALANCED'");
    expect(content).toContain("'RISKY'");
    expect(content).toContain("'AVOID'");
  });

  it('exports LineageSafety type', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('LineageSafety');
    expect(content).toContain("'CLEAN'");
    expect(content).toContain("'COMPROMISED'");
    expect(content).toContain("'UNKNOWN'");
  });

  it('exports SignalType type', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('SignalType');
    expect(content).toContain("'Class1Recall'");
    expect(content).toContain("'SafetyCommunication'");
  });

  it('exports DiffSeverity type', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('DiffSeverity');
    expect(content).toContain("'none'");
    expect(content).toContain("'critical'");
  });

  it('exports SECategory type', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('SECategory');
    expect(content).toContain("'intended_use'");
    expect(content).toContain("'biocompatibility'");
  });

  it('exports PredicateSuggestion interface', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('interface PredicateSuggestion');
    expect(content).toContain('composite_score');
    expect(content).toContain('strategy_recommendation');
    expect(content).toContain('lineage_safety');
    expect(content).toContain('reasoning');
  });

  it('exports PredicateSuggestRequest interface', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('interface PredicateSuggestRequest');
    expect(content).toContain('product_code');
    expect(content).toContain('intended_use');
    expect(content).toContain('max_results');
  });

  it('exports PredicateSuggestResponse interface', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('interface PredicateSuggestResponse');
    expect(content).toContain('suggestions');
    expect(content).toContain('total_candidates_evaluated');
  });

  it('exports GenerateSEMatrixRequest interface', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('interface GenerateSEMatrixRequest');
    expect(content).toContain('selected_predicate_k_number');
    expect(content).toContain('subject_device');
  });

  it('exports GenerateSEMatrixResponse interface', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('interface GenerateSEMatrixResponse');
    expect(content).toContain('se_matrix_payload');
    expect(content).toContain('defense_readiness_score');
    expect(content).toContain('discussion_required_count');
  });

  it('exports SEMatrixComparisonRow interface', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('interface SEMatrixComparisonRow');
    expect(content).toContain('sort_order');
    expect(content).toContain('equivalence_status');
    expect(content).toContain('diff_severity');
    expect(content).toContain('discussion_text');
  });

  it('exports SEMatrixPayload interface', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('interface SEMatrixPayload');
    expect(content).toContain('comparison_rows');
    expect(content).toContain('defense_readiness_score');
  });

  it('exports FDA510kClearance interface', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('interface FDA510kClearance');
    expect(content).toContain('k_number');
    expect(content).toContain('decision_date');
  });

  it('exports SafetySignal interface', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('interface SafetySignal');
    expect(content).toContain('signal_type');
    expect(content).toContain('severity_score');
  });

  it('exports ToxicPredicate interface', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('interface ToxicPredicate');
    expect(content).toContain('max_severity');
    expect(content).toContain('signal_count');
  });

  it('EquivalenceStatus includes PENDING', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain("'PENDING'");
  });

  it('QuestionSeverity includes critical', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain("'critical'");
  });

  it('SEMatrixRow has sort_order field', () => {
    const content = readFileContent(SHARED_TYPES);
    // Check the SEMatrixRow interface has sort_order
    const rowSection = content.substring(
      content.indexOf('interface SEMatrixRow {'),
      content.indexOf('}', content.indexOf('interface SEMatrixRow {')) + 1
    );
    expect(rowSection).toContain('sort_order');
  });

  it('SEMatrixRow has category field', () => {
    const content = readFileContent(SHARED_TYPES);
    const rowSection = content.substring(
      content.indexOf('interface SEMatrixRow {'),
      content.indexOf('}', content.indexOf('interface SEMatrixRow {')) + 1
    );
    expect(rowSection).toContain('category');
  });

  it('SEMatrixRow has diff_severity field', () => {
    const content = readFileContent(SHARED_TYPES);
    const rowSection = content.substring(
      content.indexOf('interface SEMatrixRow {'),
      content.indexOf('}', content.indexOf('interface SEMatrixRow {')) + 1
    );
    expect(rowSection).toContain('diff_severity');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. React Hooks — Phase 6.6 Enhanced
// ═══════════════════════════════════════════════════════════════════════════════

describe('Hooks — Phase 6.6 Enhanced', () => {
  it('hooks file exists', () => {
    expect(fileExists(HOOKS_FILE)).toBe(true);
  });

  it('imports PredicateSuggestRequest type', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('PredicateSuggestRequest');
  });

  it('imports PredicateSuggestResponse type', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('PredicateSuggestResponse');
  });

  it('imports GenerateSEMatrixRequest type', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('GenerateSEMatrixRequest');
  });

  it('imports GenerateSEMatrixResponse type', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('GenerateSEMatrixResponse');
  });

  it('exports useSuggestPredicates hook', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('export function useSuggestPredicates');
  });

  it('useSuggestPredicates calls /device/predicate-suggest', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('/device/predicate-suggest');
  });

  it('exports useGenerateSEMatrix hook', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('export function useGenerateSEMatrix');
  });

  it('useGenerateSEMatrix calls /generate-se-matrix', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('/generate-se-matrix');
  });

  it('predicateKeys includes predicateSuggest', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('predicateSuggest');
  });

  it('predicateKeys includes generatedSEMatrix', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('generatedSEMatrix');
  });

  it('useSuggestPredicates invalidates predicateSuggest and candidates keys', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('predicateKeys.predicateSuggest');
    expect(content).toContain('predicateKeys.candidates');
  });

  it('useGenerateSEMatrix invalidates generatedSEMatrix and seMatrix keys', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('predicateKeys.generatedSEMatrix');
    expect(content).toContain('predicateKeys.seMatrix');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Phase 6.6.D — UI Enhancements
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.D — PredicateIntelligence.tsx enhancements', () => {
  it('page file exists', () => {
    expect(fileExists(PAGE_FILE)).toBe(true);
  });

  it('imports useSuggestPredicates hook', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('useSuggestPredicates');
  });

  it('imports useGenerateSEMatrix hook', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('useGenerateSEMatrix');
  });

  it('imports PredicateSuggestion type', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('PredicateSuggestion');
  });

  it('imports StrategyRecommendation type', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('StrategyRecommendation');
  });

  it('imports SEMatrixComparisonRow type', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('SEMatrixComparisonRow');
  });

  it('imports DiffSeverity type', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('DiffSeverity');
  });

  it('defines StrategyBadge component', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('function StrategyBadge');
  });

  it('defines STRATEGY_COLORS mapping', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('STRATEGY_COLORS');
    expect(content).toContain('CONSERVATIVE');
    expect(content).toContain('AGGRESSIVE');
    expect(content).toContain('AVOID');
  });

  it('defines STRATEGY_ICONS mapping', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('STRATEGY_ICONS');
  });

  it('defines SEVERITY_COLORS mapping', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('SEVERITY_COLORS');
  });

  it('has Strategy Engine tab', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('Strategy Engine');
    expect(content).toContain('value="strategy"');
  });

  it('has StrategyTab component', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('function StrategyTab');
  });

  it('StrategyTab has product code and intended use inputs', () => {
    const content = readFileContent(PAGE_FILE);
    // Check that StrategyTab has the needed input fields
    expect(content).toContain('productCode');
    expect(content).toContain('intendedUse');
  });

  it('StrategyTab calls useSuggestPredicates', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('useSuggestPredicates(programId)');
  });

  it('StrategyTab has tissue contact and sterilization fields', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('tissueContact');
    expect(content).toContain('sterilization');
  });

  it('StrategyTab renders ranked suggestions table', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('Ranked Predicate Suggestions');
    expect(content).toContain('composite_score');
  });

  it('StrategyTab renders strategy reasoning', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('Strategy Reasoning');
    expect(content).toContain('reasoning');
  });

  it('SE Matrix tab has auto-generate form', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('Auto-Generate SE Matrix');
    expect(content).toContain('handleGenerateSEMatrix');
  });

  it('SEMatrixTab calls useGenerateSEMatrix', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('useGenerateSEMatrix(programId)');
  });

  it('renders generated comparison rows with status badges', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('Generated Substantial Equivalence Matrix');
    expect(content).toContain('discussion_text');
    expect(content).toContain('diff_severity');
  });

  it('renders defense readiness score for generated matrix', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('defense_readiness_score');
    expect(content).toContain('discussion_required_count');
  });

  it('EQUIVALENCE_COLORS includes PENDING', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain("PENDING: 'bg-gray-100");
  });

  it('has 4 tabs (Radar, Strategy, SE Matrix, Defense)', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('value="radar"');
    expect(content).toContain('value="strategy"');
    expect(content).toContain('value="se-matrix"');
    expect(content).toContain('value="defense"');
  });

  it('PredicateRadarTab has strategy engine integration', () => {
    const content = readFileContent(PAGE_FILE);
    // The radar tab now also triggers strategy analysis
    expect(content).toContain('suggestMut');
    expect(content).toContain('Strategy Engine Fields');
  });

  it('has advanced strategy fields in radar tab', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('showAdvanced');
    expect(content).toContain('Technology');
    expect(content).toContain('Materials');
    expect(content).toContain('Energy Source');
  });
});
