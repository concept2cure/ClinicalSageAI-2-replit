/**
 * Tests for Phase 6.6 — Predicate Intelligence
 *
 * Validates:
 *  1. Database migration file — schema, tables, enum, RLS policies, indexes
 *  2. Python model definitions — all Pydantic models exported
 *  3. SQL query definitions — all parameterized queries defined
 *  4. Core intelligence modules — predicate_analyzer, evidence_cell, shadow_510k_reviewer
 *  5. FastAPI router — all endpoints defined with correct methods
 *  6. Router registration — predicate router included in main.py
 *  7. BFF proxy route — Express router with auth middleware + shadow proxy
 *  8. BFF registration — mounted in server/index.ts
 *  9. Shared TypeScript types — all interfaces exported
 * 10. React hooks — all query/mutation hooks exported
 * 11. Frontend page — component structure and tab layout
 * 12. Route registration — lazy import + Route in App.jsx
 * 13. Sidebar nav — both mobile and desktop nav items
 *
 * @phase 6.6 — Predicate Intelligence
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// Paths
// ═══════════════════════════════════════════════════════════════════════════════

const ROOT = path.resolve(__dirname, '..');
const SHADOW = path.join(ROOT, 'shadow_service', 'shadow_service');
const MIGRATION = path.join(
  ROOT,
  'db',
  'migrations',
  '20260207_phase6_6_predicate_intelligence.sql'
);
const MODELS_PY = path.join(SHADOW, 'models_predicate.py');
const SQL_PY = path.join(SHADOW, 'sql_predicate.py');
const ANALYZER_PY = path.join(SHADOW, 'predicate_analyzer.py');
const EVIDENCE_PY = path.join(SHADOW, 'evidence_cell.py');
const SHADOW_REVIEW_PY = path.join(SHADOW, 'shadow_510k_reviewer.py');
const ROUTER_PY = path.join(SHADOW, 'router_predicate.py');
const MAIN_PY = path.join(SHADOW, 'main.py');
const BFF_ROUTE = path.join(ROOT, 'server', 'routes', 'predicate-intelligence.ts');
const SERVER_INDEX = path.join(ROOT, 'server', 'index.ts');
const SHARED_TYPES = path.join(ROOT, 'shared', 'types', 'predicate-intelligence.ts');
const HOOKS_FILE = path.join(ROOT, 'client', 'src', 'hooks', 'use-predicate-intelligence.ts');
const PAGE_FILE = path.join(ROOT, 'client', 'src', 'pages', 'PredicateIntelligence.tsx');
const APP_JSX = path.join(ROOT, 'client', 'src', 'App.jsx');
const SIDEBAR = path.join(ROOT, 'client', 'src', 'components', 'layout', 'Sidebar.tsx');

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
// 1. Database Migration
// ═══════════════════════════════════════════════════════════════════════════════

describe('DB Migration — predicate schema', () => {
  it('migration file exists', () => {
    expect(fileExists(MIGRATION)).toBe(true);
  });

  it('creates predicate schema', () => {
    const content = readFileContent(MIGRATION);
    expect(content).toContain('CREATE SCHEMA IF NOT EXISTS predicate');
  });

  it('creates predicate.candidates table', () => {
    const content = readFileContent(MIGRATION);
    expect(content).toContain('predicate.candidates');
    expect(content).toContain('toxicity_score');
    expect(content).toContain('golden_bridge_path');
    expect(content).toContain('similarity_score');
  });

  it('creates predicate.se_matrix_rows table', () => {
    const content = readFileContent(MIGRATION);
    expect(content).toContain('predicate.se_matrix_rows');
    expect(content).toContain('subject_value');
    expect(content).toContain('predicate_value');
    expect(content).toContain('equivalence_status');
  });

  it('creates predicate.fda_enforcement table', () => {
    const content = readFileContent(MIGRATION);
    expect(content).toContain('predicate.fda_enforcement');
    expect(content).toContain('event_type');
  });

  it('creates predicate.defense_previews table', () => {
    const content = readFileContent(MIGRATION);
    expect(content).toContain('predicate.defense_previews');
    expect(content).toContain('readiness_score');
    expect(content).toContain('anticipated_questions');
    expect(content).toContain('evidence_gaps');
  });

  it('defines equivalence_status enum', () => {
    const content = readFileContent(MIGRATION);
    expect(content).toContain('equivalence_status');
    expect(content).toMatch(/EQUIVALENT/);
    expect(content).toMatch(/DISCUSSION_REQUIRED/);
    expect(content).toMatch(/NOT_EQUIVALENT/);
    expect(content).toMatch(/TOXIC/);
  });

  it('creates RLS policies on program_id', () => {
    const content = readFileContent(MIGRATION);
    expect(content).toContain('ROW LEVEL SECURITY');
    expect(content).toContain('app.current_program_id');
  });

  it('creates indexes on key columns', () => {
    const content = readFileContent(MIGRATION);
    expect(content).toContain('CREATE INDEX');
    expect(content).toContain('program_id');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Python Pydantic Models
// ═══════════════════════════════════════════════════════════════════════════════

describe('Python models_predicate.py', () => {
  it('file exists', () => {
    expect(fileExists(MODELS_PY)).toBe(true);
  });

  const requiredClasses = [
    'PredicateCandidateCreate',
    'PredicateCandidate',
    'SEMatrixRowCreate',
    'SEMatrixRow',
    'DefensePreview',
    'FDAEnforcementEvent',
    'PredicateSearchResult',
  ];

  requiredClasses.forEach(cls => {
    it(`defines class ${cls}`, () => {
      const content = readFileContent(MODELS_PY);
      expect(content).toContain(`class ${cls}`);
    });
  });

  it('uses Pydantic BaseModel', () => {
    const content = readFileContent(MODELS_PY);
    expect(content).toContain('from pydantic import');
    expect(content).toContain('BaseModel');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SQL Queries
// ═══════════════════════════════════════════════════════════════════════════════

describe('Python sql_predicate.py', () => {
  it('file exists', () => {
    expect(fileExists(SQL_PY)).toBe(true);
  });

  const requiredQueries = [
    'INSERT_CANDIDATE',
    'SELECT_CANDIDATES_BY_PROGRAM',
    'INSERT_SE_ROW',
    'INSERT_ENFORCEMENT',
    'INSERT_DEFENSE_PREVIEW',
    'SELECT_ENFORCEMENT_BY_K_NUMBER',
  ];

  requiredQueries.forEach(q => {
    it(`defines query ${q}`, () => {
      const content = readFileContent(SQL_PY);
      expect(content).toContain(q);
    });
  });

  it('uses parameterized queries with $N syntax', () => {
    const content = readFileContent(SQL_PY);
    expect(content).toMatch(/\$1/);
    expect(content).toMatch(/\$2/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Core Intelligence Modules
// ═══════════════════════════════════════════════════════════════════════════════

describe('predicate_analyzer.py', () => {
  it('file exists', () => {
    expect(fileExists(ANALYZER_PY)).toBe(true);
  });

  it('defines PredicateAnalyzer class', () => {
    const content = readFileContent(ANALYZER_PY);
    expect(content).toContain('class PredicateAnalyzer');
  });

  it('implements find_predicates method', () => {
    const content = readFileContent(ANALYZER_PY);
    expect(content).toContain('find_predicates');
  });

  it('implements toxicity calculation', () => {
    const content = readFileContent(ANALYZER_PY);
    expect(content).toContain('calculate_toxicity');
  });

  it('implements conservative and aggressive route finding', () => {
    const content = readFileContent(ANALYZER_PY);
    expect(content).toContain('_get_conservative_predicates');
    expect(content).toContain('_get_aggressive_predicates');
  });

  it('uses toxicity severity weights', () => {
    const content = readFileContent(ANALYZER_PY);
    expect(content).toContain('recall');
    expect(content).toContain('safety');
  });
});

describe('evidence_cell.py', () => {
  it('file exists', () => {
    expect(fileExists(EVIDENCE_PY)).toBe(true);
  });

  it('defines EvidenceCell class', () => {
    const content = readFileContent(EVIDENCE_PY);
    expect(content).toContain('class EvidenceCell');
  });

  it('implements to_docx_sdt for Word Content Controls', () => {
    const content = readFileContent(EVIDENCE_PY);
    expect(content).toContain('to_docx_sdt');
  });

  it('has EvidenceCell dataclass with audit support', () => {
    const content = readFileContent(EVIDENCE_PY);
    expect(content).toContain('class EvidenceCell');
    expect(content).toContain('to_manifest');
  });

  it('supports confidence-based color coding', () => {
    const content = readFileContent(EVIDENCE_PY);
    expect(content).toContain('confidence');
  });
});

describe('shadow_510k_reviewer.py', () => {
  it('file exists', () => {
    expect(fileExists(SHADOW_REVIEW_PY)).toBe(true);
  });

  it('defines Shadow510kReviewer class', () => {
    const content = readFileContent(SHADOW_REVIEW_PY);
    expect(content).toContain('class Shadow510kReviewer');
  });

  it('implements generate_defense_preview', () => {
    const content = readFileContent(SHADOW_REVIEW_PY);
    expect(content).toContain('generate_defense_preview');
  });

  it('calculates readiness score', () => {
    const content = readFileContent(SHADOW_REVIEW_PY);
    expect(content).toContain('readiness');
  });

  it('identifies evidence gaps', () => {
    const content = readFileContent(SHADOW_REVIEW_PY);
    expect(content).toContain('evidence_gap');
  });

  it('categorizes anticipated FDA questions', () => {
    const content = readFileContent(SHADOW_REVIEW_PY);
    expect(content).toMatch(
      /material|software|dimensions|indications|sterilization|biocompatibility|electrical/
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. FastAPI Router
// ═══════════════════════════════════════════════════════════════════════════════

describe('router_predicate.py', () => {
  it('file exists', () => {
    expect(fileExists(ROUTER_PY)).toBe(true);
  });

  it('defines APIRouter with /predicate prefix', () => {
    const content = readFileContent(ROUTER_PY);
    expect(content).toContain('APIRouter');
    expect(content).toContain('/predicate');
  });

  const requiredEndpoints = [
    '/candidates',
    '/se-matrix',
    '/defense-preview',
    '/generate-510k-preview',
  ];

  requiredEndpoints.forEach(endpoint => {
    it(`defines ${endpoint} endpoint`, () => {
      const content = readFileContent(ROUTER_PY);
      expect(content).toContain(endpoint);
    });
  });

  it('uses require_predicate_admin dependency', () => {
    const content = readFileContent(ROUTER_PY);
    expect(content).toContain('require_predicate_admin');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Router Registration in main.py
// ═══════════════════════════════════════════════════════════════════════════════

describe('Shadow Service main.py — predicate router', () => {
  it('imports predicate router', () => {
    const content = readFileContent(MAIN_PY);
    expect(content).toContain('from .router_predicate import router as predicate_router');
  });

  it('includes predicate router', () => {
    const content = readFileContent(MAIN_PY);
    expect(content).toContain('app.include_router(predicate_router)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. BFF Proxy Route
// ═══════════════════════════════════════════════════════════════════════════════

describe('BFF predicate-intelligence.ts', () => {
  it('file exists', () => {
    expect(fileExists(BFF_ROUTE)).toBe(true);
  });

  it('uses authenticateToken middleware', () => {
    const content = readFileContent(BFF_ROUTE);
    expect(content).toContain('authenticateToken');
  });

  it('implements requireConfigured check', () => {
    const content = readFileContent(BFF_ROUTE);
    expect(content).toContain('requireConfigured');
    expect(content).toContain('REVIEW_ADMIN_TOKEN');
  });

  it('implements requireProgramAccess IDOR prevention', () => {
    const content = readFileContent(BFF_ROUTE);
    expect(content).toContain('requireProgramAccess');
    expect(content).toContain('regulatoryPrograms');
    expect(content).toContain('organizationId');
  });

  it('has proxyToShadow helper with admin token injection', () => {
    const content = readFileContent(BFF_ROUTE);
    expect(content).toContain('proxyToShadow');
    expect(content).toContain('X-Admin-Token');
    expect(content).toContain('SHADOW_SERVICE_URL');
  });

  const requiredRoutes = [
    "'/candidates'",
    "'/se-matrix'",
    "'/defense-preview'",
    "'/analyze'",
    "'/radar'",
    "'/generate-510k-preview'",
  ];

  requiredRoutes.forEach(route => {
    it(`proxies ${route}`, () => {
      const content = readFileContent(BFF_ROUTE);
      expect(content).toContain(route);
    });
  });

  it('exports default router', () => {
    const content = readFileContent(BFF_ROUTE);
    expect(content).toContain('export default router');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. BFF Registration in server/index.ts
// ═══════════════════════════════════════════════════════════════════════════════

describe('server/index.ts — predicate intelligence BFF mount', () => {
  it('imports predicate intelligence routes', () => {
    const content = readFileContent(SERVER_INDEX);
    expect(content).toContain("'./routes/predicate-intelligence.js'");
  });

  it('mounts at /api/predicate-intelligence', () => {
    const content = readFileContent(SERVER_INDEX);
    expect(content).toContain("'/api/predicate-intelligence'");
  });

  it('has error boundary with try/catch', () => {
    const content = readFileContent(SERVER_INDEX);
    // Check for the console.error message specific to predicate
    expect(content).toContain('Predicate Intelligence BFF proxy routes');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Shared TypeScript Types
// ═══════════════════════════════════════════════════════════════════════════════

describe('shared/types/predicate-intelligence.ts', () => {
  it('file exists', () => {
    expect(fileExists(SHARED_TYPES)).toBe(true);
  });

  const requiredTypes = [
    'EquivalenceStatus',
    'EnforcementEventType',
    'EnforcementEvent',
    'PredicateCandidate',
    'PredicateCandidateCreate',
    'GoldenBridgeResult',
    'BridgeHop',
    'SEMatrixRow',
    'SEMatrixRowCreate',
    'DefensePreview',
    'AnticipatedQuestion',
    'EvidenceGap',
    'RadarPoint',
    'Generate510kPreviewRequest',
    'Generate510kPreviewResponse',
  ];

  requiredTypes.forEach(type => {
    it(`exports ${type}`, () => {
      const content = readFileContent(SHARED_TYPES);
      expect(content).toContain(type);
    });
  });

  it('defines equivalence status values', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('EQUIVALENT');
    expect(content).toContain('DISCUSSION_REQUIRED');
    expect(content).toContain('NOT_EQUIVALENT');
    expect(content).toContain('TOXIC');
  });

  it('defines enforcement event types', () => {
    const content = readFileContent(SHARED_TYPES);
    expect(content).toContain('recall_class_i');
    expect(content).toContain('safety_communication');
    expect(content).toContain('warning_letter');
    expect(content).toContain('mdr_signal');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. React Hooks
// ═══════════════════════════════════════════════════════════════════════════════

describe('use-predicate-intelligence.ts hooks', () => {
  it('file exists', () => {
    expect(fileExists(HOOKS_FILE)).toBe(true);
  });

  const requiredHooks = [
    'useCandidates',
    'useCandidate',
    'useCreateCandidate',
    'useAnalyze',
    'useSEMatrix',
    'useCreateSEMatrixRow',
    'useDefensePreview',
    'useGenerateDefensePreview',
    'useRadarData',
    'useGenerate510kPreview',
  ];

  requiredHooks.forEach(hook => {
    it(`exports ${hook}`, () => {
      const content = readFileContent(HOOKS_FILE);
      expect(content).toContain(`export function ${hook}`);
    });
  });

  it('defines predicateKeys for query cache', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('predicateKeys');
  });

  it('uses predicateFetch helper with org header', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('predicateFetch');
    expect(content).toContain('x-organization-id');
    expect(content).toContain("credentials: 'include'");
  });

  it('uses /api/predicate-intelligence base URL', () => {
    const content = readFileContent(HOOKS_FILE);
    expect(content).toContain('/api/predicate-intelligence');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. Frontend Page
// ═══════════════════════════════════════════════════════════════════════════════

describe('PredicateIntelligence.tsx page', () => {
  it('file exists', () => {
    expect(fileExists(PAGE_FILE)).toBe(true);
  });

  it('exports default PredicateIntelligencePage', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('export default function PredicateIntelligencePage');
  });

  it('has Predicate Radar tab', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('Predicate Radar');
    expect(content).toContain('PredicateRadarTab');
  });

  it('has SE Matrix tab', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('SE Matrix');
    expect(content).toContain('SEMatrixTab');
  });

  it('has Defense Meter tab', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('Defense Meter');
    expect(content).toContain('DefenseMeterTab');
  });

  it('has ToxicityBadge component with safety thresholds', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('ToxicityBadge');
    expect(content).toContain('TOXICITY_THRESHOLDS');
  });

  it('has ReadinessMeter circular progress', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('ReadinessMeter');
    expect(content).toContain('circumference');
  });

  it('has scatter plot visualization', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('Similarity');
    expect(content).toContain('similarity_score');
    expect(content).toContain('toxicity_score');
  });

  it('uses shadcn/ui components', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain("from '@/components/ui/card'");
    expect(content).toContain("from '@/components/ui/button'");
    expect(content).toContain("from '@/components/ui/tabs'");
    expect(content).toContain("from '@/components/ui/table'");
    expect(content).toContain("from '@/components/ui/badge'");
  });

  it('imports predicate intelligence hooks', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain("from '@/hooks/use-predicate-intelligence'");
  });

  it('resolves programId from props or URL params', () => {
    const content = readFileContent(PAGE_FILE);
    expect(content).toContain('propProgramId');
    expect(content).toContain('urlProgramId');
    expect(content).toContain('program_id');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Route Registration in App.jsx
// ═══════════════════════════════════════════════════════════════════════════════

describe('App.jsx — predicate intelligence route', () => {
  it('has lazy import for PredicateIntelligence', () => {
    const content = readFileContent(APP_JSX);
    expect(content).toContain("lazy(() => import('./pages/PredicateIntelligence'))");
  });

  it('has Route at /predicate-intelligence', () => {
    const content = readFileContent(APP_JSX);
    expect(content).toContain('path="/predicate-intelligence"');
  });

  it('uses Suspense with LoadingPage fallback', () => {
    const content = readFileContent(APP_JSX);
    // Find the predicate route section
    const idx = content.indexOf('PredicateIntelligence />');
    expect(idx).toBeGreaterThan(-1);
    // The Suspense should appear before the component
    const section = content.substring(Math.max(0, idx - 200), idx + 50);
    expect(section).toContain('Suspense');
    expect(section).toContain('LoadingPage');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. Sidebar Navigation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Sidebar — predicate intelligence nav item', () => {
  it('has nav item href for /predicate-intelligence', () => {
    const content = readFileContent(SIDEBAR);
    expect(content).toContain('/predicate-intelligence');
  });

  it('displays "Predicate Intelligence" label', () => {
    const content = readFileContent(SIDEBAR);
    expect(content).toContain('Predicate Intelligence');
  });

  it('uses Radar icon', () => {
    const content = readFileContent(SIDEBAR);
    expect(content).toContain('<Radar');
  });

  it('appears in both mobile and desktop sidebars', () => {
    const content = readFileContent(SIDEBAR);
    const matches = content.match(/predicate-intelligence/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
