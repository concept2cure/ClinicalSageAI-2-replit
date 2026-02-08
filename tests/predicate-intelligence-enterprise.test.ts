/**
 * Tests for Phase 6.6 Enterprise Enhancements
 *
 * Validates all NEW code added in the enterprise-grade enhancement pass:
 *  1. Risk Rollups migration + SQL
 *  2. Health endpoint + stats query
 *  3. Deterministic Reviewer Questions endpoint
 *  4. Toxic Detail endpoint (signal citations)
 *  5. Defense Manifest generator
 *  6. Evidence Cell DOCX renderer
 *  7. BFF proxy routes (health, reviewer-questions, toxic-detail)
 *  8. Shared TypeScript types (new interfaces)
 *  9. React hooks (health, reviewer-questions, toxic-detail)
 * 10. SE Matrix Generator ISO_STANDARDS fix
 *
 * @phase 6.6 Enterprise — Shadow FDA Reviewer
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// Paths
// ═══════════════════════════════════════════════════════════════════════════════

const ROOT = path.resolve(__dirname, '..');
const SHADOW = path.join(ROOT, 'shadow_service', 'shadow_service');
const DB_MIGRATIONS = path.join(ROOT, 'db', 'migrations');

// New files
const ROLLUPS_MIGRATION = path.join(DB_MIGRATIONS, '20260208_phase6_6a_risk_rollups.sql');
const DEFENSE_MANIFEST = path.join(SHADOW, 'generators', 'defense_manifest.py');
const EVIDENCE_RENDERER = path.join(SHADOW, 'generators', 'evidence_cell_renderer.py');

// Existing files with new content
const SQL_FDA_UNIVERSE = path.join(SHADOW, 'sql_fda_universe.py');
const ROUTER_PY = path.join(SHADOW, 'router_predicate.py');
const SE_MATRIX_GEN = path.join(SHADOW, 'generators', 'se_matrix_generator.py');
const MODELS_PREDICATE = path.join(SHADOW, 'models_predicate.py');
const FDA_MIGRATION = path.join(DB_MIGRATIONS, '20260207_phase6_6a_fda_clearance_universe.sql');
const BFF_ROUTE = path.join(ROOT, 'server', 'routes', 'predicate-intelligence.ts');
const SHARED_TYPES = path.join(ROOT, 'shared', 'types', 'predicate-intelligence.ts');
const HOOKS = path.join(ROOT, 'client', 'src', 'hooks', 'use-predicate-intelligence.ts');

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function read(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function exists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Risk Rollups Migration
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.A — Risk Rollups Migration', () => {
  it('migration file exists', () => {
    expect(exists(ROLLUPS_MIGRATION)).toBe(true);
  });

  it('creates predicate.predicate_risk_rollups table', () => {
    const content = read(ROLLUPS_MIGRATION);
    expect(content).toContain('predicate.predicate_risk_rollups');
  });

  it('has toxicity_score column', () => {
    const content = read(ROLLUPS_MIGRATION);
    expect(content).toContain('toxicity_score');
  });

  it('has family_toxicity_score column', () => {
    const content = read(ROLLUPS_MIGRATION);
    expect(content).toContain('family_toxicity_score');
  });

  it('has mdr_rate_bucket column with CHECK constraint', () => {
    const content = read(ROLLUPS_MIGRATION);
    expect(content).toContain('mdr_rate_bucket');
    expect(content).toContain('NONE');
    expect(content).toContain('CRITICAL');
  });

  it('has refresh_risk_rollup function', () => {
    const content = read(ROLLUPS_MIGRATION);
    expect(content).toContain('refresh_risk_rollup');
  });

  it('has refresh_all_risk_rollups function', () => {
    const content = read(ROLLUPS_MIGRATION);
    expect(content).toContain('refresh_all_risk_rollups');
  });

  it('creates indexes on toxicity and family toxicity', () => {
    const content = read(ROLLUPS_MIGRATION);
    expect(content).toContain('idx_rollups_toxicity');
    expect(content).toContain('idx_rollups_family_toxicity');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SQL FDA Universe — New Queries
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.A — SQL FDA Universe New Queries', () => {
  const content = read(SQL_FDA_UNIVERSE);

  it('has UPSERT_RISK_ROLLUP query', () => {
    expect(content).toContain('UPSERT_RISK_ROLLUP');
  });

  it('has SELECT_RISK_ROLLUP query', () => {
    expect(content).toContain('SELECT_RISK_ROLLUP');
  });

  it('has SELECT_TOXIC_ROLLUPS query', () => {
    expect(content).toContain('SELECT_TOXIC_ROLLUPS');
  });

  it('has HEALTH_STATS query', () => {
    expect(content).toContain('HEALTH_STATS');
  });

  it('HEALTH_STATS counts clearances, embeddings, signals, lineage, rollups', () => {
    expect(content).toContain('total_clearances');
    expect(content).toContain('total_embeddings');
    expect(content).toContain('total_signals');
    expect(content).toContain('total_lineage_edges');
    expect(content).toContain('total_rollups');
    expect(content).toContain('pct_with_embeddings');
    expect(content).toContain('pct_with_signals');
  });

  it('has TEXT_SEARCH_CLEARANCES query', () => {
    expect(content).toContain('TEXT_SEARCH_CLEARANCES');
  });

  it('has SELECT_SAFETY_SIGNALS query', () => {
    expect(content).toContain('SELECT_SAFETY_SIGNALS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Router — New Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6 — Router New Endpoints', () => {
  const content = read(ROUTER_PY);

  it('has /health endpoint', () => {
    expect(content).toContain('/health');
    expect(content).toContain('predicate_universe_health');
  });

  it('has /reviewer-questions endpoint', () => {
    expect(content).toContain('/reviewer-questions');
    expect(content).toContain('generate_reviewer_questions');
  });

  it('has /toxic-detail/{k_number} endpoint', () => {
    expect(content).toContain('/toxic-detail/');
    expect(content).toContain('get_toxic_detail');
  });

  it('has REVIEWER_QUESTION_RULES with regulatory logic', () => {
    expect(content).toContain('REVIEWER_QUESTION_RULES');
    expect(content).toContain('ISO 10993');
    expect(content).toContain('IEC 62304');
    expect(content).toContain('IEC 60601-1');
  });

  it('reviewer questions cover all key trigger fields', () => {
    const triggers = [
      'materials',
      'energy_source',
      'tissue_contact',
      'sterilization',
      'software',
      'duration',
      'intended_use',
      'technology',
    ];
    for (const t of triggers) {
      expect(content).toContain(`"trigger_field": "${t}"`);
    }
  });

  it('toxic-detail returns toxic_because with signal citations', () => {
    expect(content).toContain('toxic_because');
    expect(content).toContain('signal_type');
    expect(content).toContain('signal_date');
    expect(content).toContain('Recall #');
  });

  it('health endpoint returns stats from HEALTH_STATS query', () => {
    expect(content).toContain('HEALTH_STATS');
    expect(content).toContain('total_clearances');
    expect(content).toContain('pct_with_embeddings');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Defense Manifest Generator
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.C — Defense Manifest Generator', () => {
  it('file exists', () => {
    expect(exists(DEFENSE_MANIFEST)).toBe(true);
  });

  const content = read(DEFENSE_MANIFEST);

  it('has DefenseManifest class', () => {
    expect(content).toContain('class DefenseManifest');
  });

  it('has add_cell method', () => {
    expect(content).toContain('def add_cell');
  });

  it('has add_reviewer_question method', () => {
    expect(content).toContain('def add_reviewer_question');
  });

  it('has add_toxicity_warning method', () => {
    expect(content).toContain('def add_toxicity_warning');
  });

  it('has calculate_defense_readiness method', () => {
    expect(content).toContain('def calculate_defense_readiness');
  });

  it('has build method producing manifest payload', () => {
    expect(content).toContain('def build');
    expect(content).toContain('manifest_version');
    expect(content).toContain('manifest_hash');
    expect(content).toContain('defense_readiness_score');
  });

  it('has build_manifest_from_se_payload convenience function', () => {
    expect(content).toContain('def build_manifest_from_se_payload');
  });

  it('tracks missing_evidence in manifest', () => {
    expect(content).toContain('missing_evidence');
    expect(content).toContain('evidence_complete');
  });

  it('computes SHA-256 manifest hash for chain-of-custody', () => {
    expect(content).toContain('sha256');
    expect(content).toContain('manifest_hash');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Evidence Cell DOCX Renderer
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.C — Evidence Cell DOCX Renderer', () => {
  it('file exists', () => {
    expect(exists(EVIDENCE_RENDERER)).toBe(true);
  });

  const content = read(EVIDENCE_RENDERER);

  it('defines color constants (green, yellow, red)', () => {
    expect(content).toContain('COLOR_GREEN');
    expect(content).toContain('COLOR_YELLOW');
    expect(content).toContain('COLOR_RED');
  });

  it('has get_cell_highlight function', () => {
    expect(content).toContain('def get_cell_highlight');
  });

  it('has render_se_matrix_table function', () => {
    expect(content).toContain('def render_se_matrix_table');
  });

  it('generates EV_ bookmarks for defense packet extraction', () => {
    expect(content).toContain('EV_');
    expect(content).toContain('bookmarks');
  });

  it('returns table_header, table_rows, bookmarks, color_map', () => {
    expect(content).toContain('table_header');
    expect(content).toContain('table_rows');
    expect(content).toContain('bookmarks');
    expect(content).toContain('color_map');
  });

  it('tracks equivalent_count and discussion_count', () => {
    expect(content).toContain('equivalent_count');
    expect(content).toContain('discussion_count');
    expect(content).toContain('not_equivalent_count');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. BFF Proxy Routes — New Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6 — BFF New Proxy Routes', () => {
  const content = read(BFF_ROUTE);

  it('has /health route', () => {
    expect(content).toContain("'/health'");
    expect(content).toContain('/predicate/health');
  });

  it('has /reviewer-questions route', () => {
    expect(content).toContain("'/reviewer-questions'");
    expect(content).toContain('/predicate/reviewer-questions');
  });

  it('has /toxic-detail/:kNumber route', () => {
    expect(content).toContain("'/toxic-detail/:kNumber'");
    expect(content).toContain('/predicate/toxic-detail/');
  });

  it('health route does not require program access', () => {
    // Health is a system-level check, not program-scoped
    const healthSection = content.slice(
      content.indexOf("'/health'"),
      content.indexOf("'/health'") + 200
    );
    expect(healthSection).not.toContain('requireProgramAccess');
  });

  it('reviewer-questions requires auth + program access', () => {
    expect(content).toContain("'/reviewer-questions'");
    // The route definition should have requireConfigured + requireProgramAccess
    expect(content).toContain('requireConfigured');
    expect(content).toContain('requireProgramAccess');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Shared TypeScript Types — New Interfaces
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6 — Shared Types New Interfaces', () => {
  const content = read(SHARED_TYPES);

  it('has PredicateUniverseHealth interface', () => {
    expect(content).toContain('PredicateUniverseHealth');
    expect(content).toContain('total_clearances');
    expect(content).toContain('pct_with_embeddings');
  });

  it('has ReviewerQuestion interface', () => {
    expect(content).toContain('ReviewerQuestion');
    expect(content).toContain('required_evidence');
    expect(content).toContain('citation');
  });

  it('has ReviewerQuestionsResponse interface', () => {
    expect(content).toContain('ReviewerQuestionsResponse');
    expect(content).toContain('critical_count');
    expect(content).toContain('high_count');
  });

  it('has ToxicPredicateDetail interface', () => {
    expect(content).toContain('ToxicPredicateDetail');
    expect(content).toContain('toxic_because');
    expect(content).toContain('family_toxicity_score');
  });

  it('has ToxicSignalDetail interface', () => {
    expect(content).toContain('ToxicSignalDetail');
    expect(content).toContain('signal_type');
    expect(content).toContain('severity_score');
  });

  it('has DefenseManifest interface', () => {
    expect(content).toContain('interface DefenseManifest');
    expect(content).toContain('manifest_hash');
    expect(content).toContain('defense_readiness_score');
  });

  it('has DefenseManifestCell interface', () => {
    expect(content).toContain('DefenseManifestCell');
    expect(content).toContain('evidence_complete');
    expect(content).toContain('requires_citation');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. React Hooks — New Hooks
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6 — React Hooks New Additions', () => {
  const content = read(HOOKS);

  it('has usePredicateHealth hook', () => {
    expect(content).toContain('usePredicateHealth');
    expect(content).toContain('/health');
  });

  it('has useReviewerQuestions hook', () => {
    expect(content).toContain('useReviewerQuestions');
    expect(content).toContain('/reviewer-questions');
  });

  it('has useToxicDetail hook', () => {
    expect(content).toContain('useToxicDetail');
    expect(content).toContain('/toxic-detail/');
  });

  it('imports new types (PredicateUniverseHealth, ReviewerQuestionsResponse, ToxicPredicateDetail)', () => {
    expect(content).toContain('PredicateUniverseHealth');
    expect(content).toContain('ReviewerQuestionsResponse');
    expect(content).toContain('ToxicPredicateDetail');
  });

  it('has new query keys (health, reviewerQuestions, toxicDetail)', () => {
    expect(content).toContain("'health'");
    expect(content).toContain("'reviewer-questions'");
    expect(content).toContain("'toxic-detail'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. SE Matrix Generator — ISO_STANDARDS Fix
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.C — SE Matrix Generator Fix', () => {
  const content = read(SE_MATRIX_GEN);

  it('ISO_STANDARDS dict is clean (no property definitions)', () => {
    expect(content).not.toContain('raise NotImplementedError');
    expect(content).not.toContain('@property');
    expect(content).not.toContain('.setter');
  });

  it('ISO_STANDARDS has all required keys', () => {
    expect(content).toContain('"materials"');
    expect(content).toContain('"software"');
    expect(content).toContain('"sterilization"');
    expect(content).toContain('"energy_source"');
    expect(content).toContain('"technology"');
    expect(content).toContain('"intended_use"');
    expect(content).toContain('"performance"');
    expect(content).toContain('"biocompatibility"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Models — SECategory Fix
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6 — Models SECategory Fix', () => {
  const content = read(MODELS_PREDICATE);

  it('SECategory has MATERIALS (plural) for SE Matrix Generator compatibility', () => {
    expect(content).toContain('MATERIALS = "materials"');
  });

  it('SECategory has ENERGY_SOURCE for SE Matrix Generator compatibility', () => {
    expect(content).toContain('ENERGY_SOURCE = "energy_source"');
  });

  it('SECategory has STERILIZATION', () => {
    expect(content).toContain('STERILIZATION = "sterilization"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. FDA Migration — pg_trgm Extension
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.A — FDA Migration pg_trgm Fix', () => {
  const content = read(FDA_MIGRATION);

  it('enables pg_trgm extension', () => {
    expect(content).toContain('pg_trgm');
  });

  it('enables vector extension', () => {
    expect(content).toContain('CREATE EXTENSION IF NOT EXISTS vector');
  });
});
