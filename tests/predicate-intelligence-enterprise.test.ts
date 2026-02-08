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
const DOCX_FACTORY = path.join(SHADOW, 'generators', 'docx_factory.py');
const DEFENSE_PACKET_BUILDER = path.join(SHADOW, 'generators', 'defense_packet_builder.py');
const GENERATORS_INIT = path.join(SHADOW, 'generators', '__init__.py');

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

// ═══════════════════════════════════════════════════════════════════════════════
// 12. DOCX Factory (real python-docx renderer)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.C — SE Matrix DOCX Factory', () => {
  it('docx_factory.py file exists', () => {
    expect(exists(DOCX_FACTORY)).toBe(true);
  });

  it('defines SEMatrixDocxFactory class', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('class SEMatrixDocxFactory');
  });

  it('has render() method returning BytesIO', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('def render(');
    expect(content).toContain('io.BytesIO');
  });

  it('imports python-docx Document', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('from docx import Document');
  });

  it('imports Pt, Inches, RGBColor from docx.shared', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('from docx.shared import');
    expect(content).toContain('Pt');
    expect(content).toContain('RGBColor');
  });

  it('renders cover page with device info', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('_render_cover_page');
    expect(content).toContain('510(k) Substantial Equivalence Comparison');
  });

  it('renders executive summary with readiness interpretation', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('_render_executive_summary');
    expect(content).toContain('Executive Summary');
  });

  it('renders main comparison matrix table', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('_render_matrix_table');
    expect(content).toContain('Substantial Equivalence Comparison Matrix');
  });

  it('renders per-characteristic discussion', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('_render_discussions');
    expect(content).toContain('Detailed Discussion by Characteristic');
  });

  it('renders reviewer questions appendix', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('_render_reviewer_questions');
    expect(content).toContain('Appendix A: Anticipated FDA Reviewer Questions');
  });

  it('renders toxicity warnings appendix', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('_render_toxicity_warnings');
    expect(content).toContain('Appendix B: Predicate Toxicity Warnings');
  });

  it('renders evidence traceability index', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('_render_evidence_index');
    expect(content).toContain('Evidence Traceability Index');
  });

  it('renders footer with manifest hash', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('_render_footer');
    expect(content).toContain('Manifest SHA-256');
  });

  it('applies color-coded cell shading (green/yellow/red)', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('_set_cell_shading');
    expect(content).toContain('C6EFCE'); // green
    expect(content).toContain('FFEB9C'); // yellow
    expect(content).toContain('FFC7CE'); // red
  });

  it('adds EV_ bookmarks for evidence extraction', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('_add_bookmark');
    expect(content).toContain('EV_');
  });

  it('sets landscape orientation for wide table', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('WD_ORIENT.LANDSCAPE');
  });

  it('has color legend after matrix table', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('Legend:');
    expect(content).toContain('Equivalent + Evidence');
    expect(content).toContain('Discussion Required');
  });

  it('has readiness assessment interpretation logic', () => {
    const content = read(DOCX_FACTORY);
    expect(content).toContain('strong substantial equivalence');
    expect(content).toContain('moderate substantial equivalence');
    expect(content).toContain('Significant gaps');
    expect(content).toContain('incomplete');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. Evidence Cell Renderer — Upgraded with python-docx rendering
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.C — Evidence Cell Renderer Upgrade', () => {
  const content = read(EVIDENCE_RENDERER);

  it('has render_to_docx_table function', () => {
    expect(content).toContain('def render_to_docx_table(');
  });

  it('has _render_value_cell helper', () => {
    expect(content).toContain('def _render_value_cell(');
  });

  it('imports python-docx Document', () => {
    expect(content).toContain('from docx import Document');
  });

  it('imports OxmlElement for bookmarks and shading', () => {
    expect(content).toContain('from docx.oxml import OxmlElement');
  });

  it('has _apply_cell_shading function', () => {
    expect(content).toContain('def _apply_cell_shading(');
  });

  it('has _apply_cell_borders function', () => {
    expect(content).toContain('def _apply_cell_borders(');
  });

  it('has _insert_bookmark function', () => {
    expect(content).toContain('def _insert_bookmark(');
  });

  it('has _status_column_color function', () => {
    expect(content).toContain('def _status_column_color(');
  });

  it('has SEVERITY_BADGES mapping', () => {
    expect(content).toContain('SEVERITY_BADGES');
    expect(content).toContain('Critical');
    expect(content).toContain('Medium');
  });

  it('still exports render_se_matrix_table (backward compatible)', () => {
    expect(content).toContain('def render_se_matrix_table(');
  });

  it('still exports get_cell_highlight (backward compatible)', () => {
    expect(content).toContain('def get_cell_highlight(');
  });

  it('render plan includes severity_badge field', () => {
    expect(content).toContain('"severity_badge"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. Defense Packet ZIP Builder
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.D — Defense Packet ZIP Builder', () => {
  it('defense_packet_builder.py file exists', () => {
    expect(exists(DEFENSE_PACKET_BUILDER)).toBe(true);
  });

  it('defines DefensePacketBuilder class', () => {
    const content = read(DEFENSE_PACKET_BUILDER);
    expect(content).toContain('class DefensePacketBuilder');
  });

  it('has build() method returning BytesIO', () => {
    const content = read(DEFENSE_PACKET_BUILDER);
    expect(content).toContain('def build(');
    expect(content).toContain('io.BytesIO');
  });

  it('uses zipfile module for ZIP creation', () => {
    const content = read(DEFENSE_PACKET_BUILDER);
    expect(content).toContain('import zipfile');
    expect(content).toContain('zipfile.ZipFile');
    expect(content).toContain('ZIP_DEFLATED');
  });

  it('includes SE Matrix DOCX in ZIP', () => {
    const content = read(DEFENSE_PACKET_BUILDER);
    expect(content).toContain('SE_Matrix_');
    expect(content).toContain('.docx');
  });

  it('includes defense_manifest.json in ZIP', () => {
    const content = read(DEFENSE_PACKET_BUILDER);
    expect(content).toContain('defense_manifest.json');
  });

  it('includes reviewer_questions.json in ZIP', () => {
    const content = read(DEFENSE_PACKET_BUILDER);
    expect(content).toContain('reviewer_questions.json');
  });

  it('includes toxicity_warnings.json in ZIP', () => {
    const content = read(DEFENSE_PACKET_BUILDER);
    expect(content).toContain('toxicity_warnings.json');
  });

  it('includes README.txt in ZIP', () => {
    const content = read(DEFENSE_PACKET_BUILDER);
    expect(content).toContain('README.txt');
  });

  it('has get_zip_filename method', () => {
    const content = read(DEFENSE_PACKET_BUILDER);
    expect(content).toContain('def get_zip_filename(');
  });

  it('imports from docx_factory and defense_manifest', () => {
    const content = read(DEFENSE_PACKET_BUILDER);
    expect(content).toContain('from .defense_manifest import');
    expect(content).toContain('from .docx_factory import');
  });

  it('README contains chain-of-custody info', () => {
    const content = read(DEFENSE_PACKET_BUILDER);
    expect(content).toContain('chain-of-custody');
    expect(content).toContain('manifest_hash');
  });

  it('sanitizes filenames for safety', () => {
    const content = read(DEFENSE_PACKET_BUILDER);
    expect(content).toContain('_sanitize_filename');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. Router — New DOCX Download Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.C/D — Router DOCX Download Endpoints', () => {
  const content = read(ROUTER_PY);

  it('defines POST /render-se-docx endpoint', () => {
    expect(content).toContain('/render-se-docx');
    expect(content).toContain('RenderSEDocxRequest');
  });

  it('defines POST /download-defense-packet endpoint', () => {
    expect(content).toContain('/download-defense-packet');
    expect(content).toContain('DownloadDefensePacketRequest');
  });

  it('render-se-docx returns StreamingResponse with DOCX media type', () => {
    expect(content).toContain('StreamingResponse');
    expect(content).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('download-defense-packet returns StreamingResponse with ZIP media type', () => {
    expect(content).toContain('application/zip');
  });

  it('render-se-docx imports SEMatrixDocxFactory', () => {
    expect(content).toContain('SEMatrixDocxFactory');
  });

  it('download-defense-packet imports DefensePacketBuilder', () => {
    expect(content).toContain('DefensePacketBuilder');
  });

  it('render-se-docx has include_reviewer_questions option', () => {
    expect(content).toContain('include_reviewer_questions');
  });

  it('render-se-docx has include_toxicity_warnings option', () => {
    expect(content).toContain('include_toxicity_warnings');
  });

  it('download-defense-packet collects signals from DB', () => {
    expect(content).toContain('SELECT_SIGNALS_BY_K_NUMBER');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 16. BFF — New DOCX Download Routes
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.C/D — BFF DOCX Download Routes', () => {
  const content = read(BFF_ROUTE);

  it('has /render-se-docx route', () => {
    expect(content).toContain('/render-se-docx');
  });

  it('has /download-defense-packet route', () => {
    expect(content).toContain('/download-defense-packet');
  });

  it('render-se-docx sets DOCX content type', () => {
    expect(content).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('download-defense-packet sets ZIP content type', () => {
    expect(content).toContain('application/zip');
  });

  it('both routes use POST method', () => {
    // Should have router.post for both
    expect(content).toContain('/render-se-docx');
    expect(content).toContain('/download-defense-packet');
    // Both are POST routes
    expect(content).toContain('router.post');
  });

  it('both routes require authentication', () => {
    expect(content).toContain('requireProgramAccess');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 17. Shared Types — New DOCX Interfaces
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.C/D — Shared Types for DOCX', () => {
  const content = read(SHARED_TYPES);

  it('has RenderSEDocxRequest interface', () => {
    expect(content).toContain('RenderSEDocxRequest');
    expect(content).toContain('include_reviewer_questions');
    expect(content).toContain('include_toxicity_warnings');
  });

  it('has DownloadDefensePacketRequest interface', () => {
    expect(content).toContain('DownloadDefensePacketRequest');
    expect(content).toContain('selected_predicate_k_number');
  });

  it('has SEMatrixRenderPlan interface', () => {
    expect(content).toContain('SEMatrixRenderPlan');
    expect(content).toContain('table_header');
    expect(content).toContain('table_rows');
    expect(content).toContain('bookmarks');
    expect(content).toContain('color_map');
    expect(content).toContain('severity_badge');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 18. React Hooks — DOCX Download Hooks
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.C/D — React Hooks for DOCX Download', () => {
  const content = read(HOOKS);

  it('has useRenderSEDocx hook', () => {
    expect(content).toContain('useRenderSEDocx');
  });

  it('has useDownloadDefensePacket hook', () => {
    expect(content).toContain('useDownloadDefensePacket');
  });

  it('useRenderSEDocx uses fetch for binary download', () => {
    expect(content).toContain('res.blob()');
    expect(content).toContain('/render-se-docx');
  });

  it('useDownloadDefensePacket uses fetch for ZIP download', () => {
    expect(content).toContain('/download-defense-packet');
  });

  it('both hooks extract filename from Content-Disposition', () => {
    expect(content).toContain('Content-Disposition');
  });

  it('imports RenderSEDocxRequest type', () => {
    expect(content).toContain('RenderSEDocxRequest');
  });

  it('imports DownloadDefensePacketRequest type', () => {
    expect(content).toContain('DownloadDefensePacketRequest');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 19. Generators __init__.py Documentation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Phase 6.6.C — Generators Package __init__', () => {
  const content = read(GENERATORS_INIT);

  it('documents docx_factory module', () => {
    expect(content).toContain('docx_factory');
  });

  it('documents defense_packet_builder module', () => {
    expect(content).toContain('defense_packet_builder');
  });

  it('documents evidence_cell_renderer module', () => {
    expect(content).toContain('evidence_cell_renderer');
  });

  it('documents se_matrix_generator module', () => {
    expect(content).toContain('se_matrix_generator');
  });

  it('documents defense_manifest module', () => {
    expect(content).toContain('defense_manifest');
  });
});
