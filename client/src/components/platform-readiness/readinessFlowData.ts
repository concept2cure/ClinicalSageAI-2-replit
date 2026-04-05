/**
 * Concept2Cure Phase 0–1 Platform Readiness — React Flow Data
 *
 * Comprehensive node/edge definitions for three interactive views:
 *   1. Platform Overview (module readiness, templates, AI, Canvas, DOCX, gaps)
 *   2. Remediation Roadmap (Gantt-style phases & tasks)
 *   3. Architecture Data Flow (Client → Server → DB wiring)
 *
 * @version 1.0.0
 */

import type { Node, Edge } from 'reactflow';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type GapSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ConnectionStatus = 'connected' | 'broken' | 'unmounted';

export interface GapItem {
  id: string;
  severity: GapSeverity;
  title: string;
  description: string;
  module: 'ectd' | 'cmc' | 'cerv2' | 'platform';
}

export interface RemediationTask {
  id: string;
  phase: string;
  title: string;
  effort: string;
  priority: GapSeverity;
  status: 'not-started' | 'in-progress' | 'completed';
  dependency?: string;
}

export interface TemplateInfo {
  name: string;
  status: 'ready' | 'partial' | 'missing';
  aiEndpoint?: string;
  docxSeed?: boolean;
  canvasEnabled?: boolean;
}

export interface ModuleDetail {
  id: string;
  name: string;
  readiness: number;
  clientFiles: number;
  clientLines: number;
  serverFiles: number;
  serverLines: number;
  templates: TemplateInfo[];
  aiEndpoints: { path: string; status: 'live' | 'stub' | 'missing' }[];
  canvas: boolean;
  docxFactory: boolean;
  exports: string[];
  gaps: GapItem[];
  tasks: RemediationTask[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE DATA
// ─────────────────────────────────────────────────────────────────────────────

export const MODULES: Record<string, ModuleDetail> = {
  ectd: {
    id: 'ectd',
    name: 'eCTD Co-Author',
    readiness: 62,
    clientFiles: 38,
    clientLines: 16501,
    serverFiles: 3,
    serverLines: 23,
    templates: [
      { name: 'IND Module 1 – Admin', status: 'ready', docxSeed: true, canvasEnabled: true },
      { name: 'IND Module 2 – Summaries', status: 'ready', docxSeed: true, canvasEnabled: true },
      { name: 'IND Module 3 – Quality', status: 'partial', docxSeed: false, canvasEnabled: true },
      { name: 'Non-Clinical (Module 4)', status: 'partial', docxSeed: false, canvasEnabled: true },
      { name: 'Clinical (Module 5)', status: 'partial', docxSeed: false, canvasEnabled: true },
      { name: 'Cover Letter', status: 'ready', docxSeed: true, canvasEnabled: true },
      { name: 'Stability Report', status: 'missing', docxSeed: false, canvasEnabled: false },
    ],
    aiEndpoints: [
      { path: '/api/coauthor/sessions', status: 'stub' },
      { path: '/api/coauthor/generate', status: 'missing' },
      { path: '/api/coauthor/suggest', status: 'missing' },
      { path: '/api/coauthor/validate', status: 'missing' },
      { path: '/api/coauthor/compliance-check', status: 'missing' },
      { path: '/api/ectd-documents/list', status: 'stub' },
      { path: '/api/ectd-documents/create', status: 'missing' },
      { path: '/api/ectd-documents/export', status: 'missing' },
    ],
    canvas: true,
    docxFactory: true,
    exports: ['DOCX', 'PDF', 'eCTD XML'],
    gaps: [
      {
        id: 'C5',
        severity: 'critical',
        title: 'CoAuthor server stubs',
        description: 'coauthor.ts is 23-line stub — 18 of 20 client endpoints return 404',
        module: 'ectd',
      },
      {
        id: 'C6',
        severity: 'critical',
        title: 'eCTD document routes empty',
        description: 'ectd-documents.ts returns empty arrays for all queries',
        module: 'ectd',
      },
      {
        id: 'H6',
        severity: 'high',
        title: 'Missing DB migrations',
        description: '6 eCTD tables defined but never migrated',
        module: 'ectd',
      },
      {
        id: 'H7',
        severity: 'high',
        title: 'Shadow service not wired',
        description: 'Python eCTD router (773L) has no Express proxy',
        module: 'ectd',
      },
      {
        id: 'M4',
        severity: 'medium',
        title: 'Templates incomplete',
        description: 'Modules 3-5 missing DOCX seed files',
        module: 'ectd',
      },
      {
        id: 'M5',
        severity: 'medium',
        title: 'Export pipeline partial',
        description: 'eCTD XML export defined but not connected to shadow service generator',
        module: 'ectd',
      },
    ],
    tasks: [
      {
        id: 'P0C-1',
        phase: '0C',
        title: 'Implement 18 CoAuthor endpoints',
        effort: '3 days',
        priority: 'critical',
        status: 'not-started',
      },
      {
        id: 'P0C-2',
        phase: '0C',
        title: 'Wire shadow eCTD router proxy',
        effort: '4 hrs',
        priority: 'critical',
        status: 'not-started',
      },
      {
        id: 'P0C-3',
        phase: '0C',
        title: 'Migrate 6 eCTD DB tables',
        effort: '2 hrs',
        priority: 'high',
        status: 'not-started',
      },
      {
        id: 'P0C-4',
        phase: '0C',
        title: 'Seed DOCX templates (M3-M5)',
        effort: '1 day',
        priority: 'medium',
        status: 'not-started',
      },
      {
        id: 'P0C-5',
        phase: '0C',
        title: 'Connect eCTD XML export pipeline',
        effort: '4 hrs',
        priority: 'medium',
        status: 'not-started',
      },
      {
        id: 'P0C-6',
        phase: '0C',
        title: 'Add auth guards to eCTD routes',
        effort: '2 hrs',
        priority: 'high',
        status: 'not-started',
      },
      {
        id: 'P0C-7',
        phase: '0C',
        title: 'Integration tests for CoAuthor',
        effort: '1 day',
        priority: 'high',
        status: 'not-started',
      },
      {
        id: 'P0C-8',
        phase: '0C',
        title: 'Canvas section persistence',
        effort: '4 hrs',
        priority: 'medium',
        status: 'not-started',
      },
    ],
  },
  cmc: {
    id: 'cmc',
    name: 'CMC Wizard',
    readiness: 15,
    clientFiles: 102,
    clientLines: 90454,
    serverFiles: 24,
    serverLines: 10935,
    templates: [
      {
        name: 'Module 3.2.S – Drug Substance',
        status: 'partial',
        docxSeed: false,
        canvasEnabled: true,
      },
      {
        name: 'Module 3.2.P – Drug Product',
        status: 'partial',
        docxSeed: false,
        canvasEnabled: true,
      },
      {
        name: 'Module 3.2.A – Appendices',
        status: 'missing',
        docxSeed: false,
        canvasEnabled: false,
      },
      { name: 'Module 3.2.R – Regional', status: 'missing', docxSeed: false, canvasEnabled: false },
      { name: 'Stability Protocol', status: 'ready', docxSeed: true, canvasEnabled: true },
      { name: 'Batch Analysis', status: 'partial', docxSeed: false, canvasEnabled: true },
      { name: 'Specification Sheet', status: 'partial', docxSeed: false, canvasEnabled: true },
    ],
    aiEndpoints: [
      { path: '/api/cmc/guidance', status: 'stub' },
      { path: '/api/cmc/specifications', status: 'missing' },
      { path: '/api/cmc/stability', status: 'missing' },
      { path: '/api/cmc/batch-records', status: 'missing' },
      { path: '/api/cmc/process-validation', status: 'missing' },
      { path: '/api/cmc/excipients', status: 'missing' },
      { path: '/api/cmc/container-closure', status: 'missing' },
      { path: '/api/cmc/analytical-methods', status: 'missing' },
    ],
    canvas: true,
    docxFactory: true,
    exports: ['DOCX', 'PDF'],
    gaps: [
      {
        id: 'C7',
        severity: 'critical',
        title: 'CMC routes never mounted',
        description:
          '24 server files (10,935L) imported but app.use() never called — all 120 endpoints return 404',
        module: 'cmc',
      },
      {
        id: 'C8',
        severity: 'critical',
        title: 'CMC DB tables never migrated',
        description: '12 Drizzle tables + 2 SQL schemas defined but never pushed to PostgreSQL',
        module: 'cmc',
      },
      {
        id: 'H8',
        severity: 'high',
        title: 'CmcWizard shell has no data capture',
        description: 'CmcWizard.jsx (98L) is a 5-step UI shell with zero API calls or form fields',
        module: 'cmc',
      },
      {
        id: 'H9',
        severity: 'high',
        title: 'Module 3 CTD gaps',
        description: '7 of 17 sub-sections missing: S.5, S.6, P.4, P.6, P.7, 3.2.A, 3.2.R',
        module: 'cmc',
      },
      {
        id: 'M6',
        severity: 'medium',
        title: 'ComprehensiveCMCPlatform stale',
        description: '25,424-line flagship component — all API calls fail against unmounted routes',
        module: 'cmc',
      },
    ],
    tasks: [
      {
        id: 'P0D-1',
        phase: '0D',
        title: 'Mount CMC routes (5 lines of app.use)',
        effort: '30 min',
        priority: 'critical',
        status: 'not-started',
      },
      {
        id: 'P0D-2',
        phase: '0D',
        title: 'Migrate 12 CMC Drizzle tables',
        effort: '2 hrs',
        priority: 'critical',
        status: 'not-started',
        dependency: 'P0D-1',
      },
      {
        id: 'P0D-3',
        phase: '0D',
        title: 'Run cmc_blueprints.sql + playbook schema',
        effort: '30 min',
        priority: 'high',
        status: 'not-started',
        dependency: 'P0D-2',
      },
      {
        id: 'P0D-4',
        phase: '0D',
        title: 'Verify 120 endpoints respond',
        effort: '2 hrs',
        priority: 'high',
        status: 'not-started',
        dependency: 'P0D-1',
      },
      {
        id: 'P0D-5',
        phase: '0D',
        title: 'Wire CmcWizard.jsx to API',
        effort: '1 day',
        priority: 'high',
        status: 'not-started',
        dependency: 'P0D-4',
      },
      {
        id: 'P0D-6',
        phase: '0D',
        title: 'Seed DOCX templates for M3',
        effort: '1 day',
        priority: 'medium',
        status: 'not-started',
      },
      {
        id: 'P0D-7',
        phase: '0D',
        title: 'Add missing CTD sub-sections',
        effort: '3 days',
        priority: 'high',
        status: 'not-started',
        dependency: 'P0D-5',
      },
      {
        id: 'P0D-8',
        phase: '0D',
        title: 'Integration tests for CMC',
        effort: '1 day',
        priority: 'medium',
        status: 'not-started',
      },
      {
        id: 'P0D-9',
        phase: '0D',
        title: 'Connect shadow CMC guidance service',
        effort: '4 hrs',
        priority: 'medium',
        status: 'not-started',
      },
    ],
  },
  cerv2: {
    id: 'cerv2',
    name: 'Medical Device & Diagnostics (CERV2)',
    readiness: 83,
    clientFiles: 45,
    clientLines: 28000,
    serverFiles: 12,
    serverLines: 8500,
    templates: [
      {
        name: '510(k) Summary',
        status: 'ready',
        aiEndpoint: '/api/cerv2/ai/generate',
        docxSeed: true,
        canvasEnabled: true,
      },
      {
        name: '510(k) Predicate Comparison',
        status: 'ready',
        aiEndpoint: '/api/cerv2/ai/generate',
        docxSeed: true,
        canvasEnabled: true,
      },
      {
        name: '510(k) Substantial Equivalence',
        status: 'ready',
        aiEndpoint: '/api/cerv2/ai/generate',
        docxSeed: true,
        canvasEnabled: true,
      },
      {
        name: 'PMA – Clinical Summary',
        status: 'ready',
        aiEndpoint: '/api/cerv2/ai/generate',
        docxSeed: true,
        canvasEnabled: true,
      },
      {
        name: 'PMA – Non-Clinical Testing',
        status: 'ready',
        aiEndpoint: '/api/cerv2/ai/generate',
        docxSeed: true,
        canvasEnabled: true,
      },
      {
        name: 'CER – Literature Review',
        status: 'ready',
        aiEndpoint: '/api/cerv2/ai/generate',
        docxSeed: true,
        canvasEnabled: true,
      },
      {
        name: 'CER – Benefit-Risk Analysis',
        status: 'ready',
        aiEndpoint: '/api/cerv2/ai/generate',
        docxSeed: true,
        canvasEnabled: true,
      },
      {
        name: 'CER – Post-Market Surveillance',
        status: 'ready',
        aiEndpoint: '/api/cerv2/ai/generate',
        docxSeed: true,
        canvasEnabled: true,
      },
      { name: 'eSTAR Sections', status: 'partial', docxSeed: false, canvasEnabled: true },
      {
        name: 'Device Description',
        status: 'ready',
        aiEndpoint: '/api/cerv2/ai/generate',
        docxSeed: true,
        canvasEnabled: true,
      },
    ],
    aiEndpoints: [
      { path: '/api/cerv2/ai/generate', status: 'live' },
      { path: '/api/cerv2/ai/suggest', status: 'live' },
      { path: '/api/cerv2/ai/compliance', status: 'live' },
      { path: '/api/cerv2/ai/literature-search', status: 'live' },
      { path: '/api/cerv2/ai/predicate-analysis', status: 'live' },
      { path: '/api/cerv2/documents', status: 'live' },
      { path: '/api/cerv2/templates', status: 'live' },
      { path: '/api/cerv2/export', status: 'live' },
    ],
    canvas: true,
    docxFactory: true,
    exports: ['DOCX', 'PDF', 'eSTAR ZIP'],
    gaps: [
      {
        id: 'C1',
        severity: 'critical',
        title: 'cover_letter not in docTypes',
        description:
          'generateSection returns 400 for cover_letter — not mapped in docTypes registry',
        module: 'cerv2',
      },
      {
        id: 'C2',
        severity: 'critical',
        title: 'cerv2-versions stub route',
        description: '/api/cerv2-versions returns hardcoded mock data with no DB backing',
        module: 'cerv2',
      },
      {
        id: 'C3',
        severity: 'critical',
        title: 'Auth bypass on 4 routes',
        description: 'Mock auth middleware allows unauthenticated access to production endpoints',
        module: 'cerv2',
      },
      {
        id: 'C4',
        severity: 'critical',
        title: 'eSTAR ZIP export incomplete',
        description: 'eSTAR export handler exists but missing 3 section generators',
        module: 'cerv2',
      },
      {
        id: 'H1',
        severity: 'high',
        title: 'Missing FAERS integration',
        description: 'FAERS client exists but never called from any section generator',
        module: 'cerv2',
      },
      {
        id: 'H2',
        severity: 'high',
        title: 'PDF export timeout',
        description: 'Large documents (>50 pages) hit 30s timeout on PDF generation',
        module: 'cerv2',
      },
      {
        id: 'H3',
        severity: 'high',
        title: 'Canvas autosave race condition',
        description: 'Concurrent autosave can overwrite edits in multi-section Canvas',
        module: 'cerv2',
      },
      {
        id: 'H4',
        severity: 'high',
        title: 'Literature search rate limiting',
        description: 'PubMed API calls not rate-limited — can trigger 429 errors at scale',
        module: 'cerv2',
      },
    ],
    tasks: [
      {
        id: 'P0A-1',
        phase: '0A',
        title: 'Add cover_letter to docTypes',
        effort: '30 min',
        priority: 'critical',
        status: 'not-started',
      },
      {
        id: 'P0A-2',
        phase: '0A',
        title: 'Replace cerv2-versions mock',
        effort: '2 hrs',
        priority: 'critical',
        status: 'not-started',
      },
      {
        id: 'P0A-3',
        phase: '0A',
        title: 'Add real auth to 4 routes',
        effort: '1 hr',
        priority: 'critical',
        status: 'not-started',
      },
      {
        id: 'P0A-4',
        phase: '0A',
        title: 'Complete eSTAR section generators',
        effort: '1 day',
        priority: 'critical',
        status: 'not-started',
      },
      {
        id: 'P0A-5',
        phase: '0A',
        title: 'Wire FAERS client to generators',
        effort: '4 hrs',
        priority: 'high',
        status: 'not-started',
      },
      {
        id: 'P0A-6',
        phase: '0A',
        title: 'Fix PDF timeout for large docs',
        effort: '4 hrs',
        priority: 'high',
        status: 'not-started',
      },
      {
        id: 'P1B-1',
        phase: '1B',
        title: 'Fix Canvas autosave race',
        effort: '4 hrs',
        priority: 'high',
        status: 'not-started',
      },
      {
        id: 'P1B-2',
        phase: '1B',
        title: 'Add PubMed rate limiter',
        effort: '2 hrs',
        priority: 'high',
        status: 'not-started',
      },
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SEVERITY COLORS
// ─────────────────────────────────────────────────────────────────────────────

export const SEVERITY_COLORS: Record<
  GapSeverity,
  { bg: string; border: string; text: string; badge: string }
> = {
  critical: { bg: '#fafaf9', border: '#44403c', text: '#1c1917', badge: '#44403c' },
  high: { bg: '#fff7ed', border: '#ea580c', text: '#9a3412', badge: '#ea580c' },
  medium: { bg: '#fafaf9', border: '#57534e', text: '#292524', badge: '#57534e' },
  low: { bg: '#fafaf9', border: '#57534e', text: '#1c1917', badge: '#57534e' },
};

export const MODULE_COLORS: Record<string, { bg: string; border: string; header: string }> = {
  ectd: { bg: '#fafaf9', border: '#44403c', header: '#292524' },
  cmc: { bg: '#fffbe6', border: '#a8a29e', header: '#8b6914' },
  cerv2: { bg: '#fafaf9', border: '#57534e', header: '#292524' },
};

export const STATUS_ICONS: Record<string, string> = {
  ready: '✅',
  partial: '⚠️',
  missing: '❌',
  live: '🟢',
  stub: '🟡',
  connected: '🟢',
  broken: '🔴',
  unmounted: '⚪',
};

// ─────────────────────────────────────────────────────────────────────────────
// VIEW 1: PLATFORM OVERVIEW NODES & EDGES
// ─────────────────────────────────────────────────────────────────────────────

export function buildOverviewNodes(): Node[] {
  const nodes: Node[] = [];
  const moduleKeys = ['ectd', 'cmc', 'cerv2'] as const;
  const xPositions = [0, 500, 1050];

  // Platform header node
  nodes.push({
    id: 'platform-header',
    type: 'platformHeader',
    position: { x: 400, y: 0 },
    data: {
      label: 'Concept2Cure Platform',
      readiness: 55,
      critical: 8,
      high: 9,
      medium: 6,
      low: 4,
    },
    draggable: true,
  });

  moduleKeys.forEach((key, i) => {
    const mod = MODULES[key];
    const baseY = 140;

    // Module card node
    nodes.push({
      id: `module-${key}`,
      type: 'moduleCard',
      position: { x: xPositions[i], y: baseY },
      data: { module: mod },
      draggable: true,
    });

    // Template sub-nodes
    mod.templates.forEach((tmpl, ti) => {
      nodes.push({
        id: `tmpl-${key}-${ti}`,
        type: 'templateItem',
        position: { x: xPositions[i] + 10, y: baseY + 280 + ti * 52 },
        data: { template: tmpl, moduleId: key },
        draggable: true,
        parentNode: `module-${key}`,
        extent: 'parent' as const,
        hidden: true, // shown on expand
      });
    });

    // AI endpoint sub-nodes
    mod.aiEndpoints.forEach((ep, ei) => {
      nodes.push({
        id: `ai-${key}-${ei}`,
        type: 'endpointItem',
        position: { x: xPositions[i] + 10, y: baseY + 280 + mod.templates.length * 52 + ei * 42 },
        data: { endpoint: ep, moduleId: key },
        draggable: true,
        parentNode: `module-${key}`,
        extent: 'parent' as const,
        hidden: true,
      });
    });

    // Gap badges
    mod.gaps.forEach((gap, gi) => {
      nodes.push({
        id: `gap-${gap.id}`,
        type: 'gapBadge',
        position: {
          x: xPositions[i] + 10 + (gi % 4) * 95,
          y: baseY + 660 + Math.floor(gi / 4) * 50,
        },
        data: { gap },
        draggable: true,
      });
    });
  });

  return nodes;
}

export function buildOverviewEdges(): Edge[] {
  const edges: Edge[] = [];

  // Platform → modules
  ['ectd', 'cmc', 'cerv2'].forEach(key => {
    edges.push({
      id: `platform-to-${key}`,
      source: 'platform-header',
      target: `module-${key}`,
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#b0aea5', strokeWidth: 1.5 },
    });
  });

  // Inter-module data flows
  edges.push({
    id: 'flow-cmc-ectd',
    source: 'module-cmc',
    target: 'module-ectd',
    type: 'smoothstep',
    animated: true,
    label: 'Module 3 → eCTD',
    style: { stroke: '#57534e', strokeWidth: 2 },
    labelStyle: { fontSize: 11, fontWeight: 600 },
  });

  edges.push({
    id: 'flow-cerv2-ectd',
    source: 'module-cerv2',
    target: 'module-ectd',
    type: 'smoothstep',
    animated: true,
    label: 'Device docs → eCTD',
    style: { stroke: '#57534e', strokeWidth: 2 },
    labelStyle: { fontSize: 11, fontWeight: 600 },
  });

  return edges;
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW 2: REMEDIATION ROADMAP NODES & EDGES
// ─────────────────────────────────────────────────────────────────────────────

interface PhaseConfig {
  id: string;
  label: string;
  dates: string;
  color: string;
  module: string;
}

const PHASES: PhaseConfig[] = [
  {
    id: '0A',
    label: 'Phase 0A — Immediate Fixes',
    dates: 'Feb 13',
    color: '#44403c',
    module: 'cerv2',
  },
  {
    id: '0C',
    label: 'Phase 0C — eCTD Co-Author',
    dates: 'Feb 14–20',
    color: '#44403c',
    module: 'ectd',
  },
  { id: '0D', label: 'Phase 0D — CMC Wizard', dates: 'Feb 14–17', color: '#a8a29e', module: 'cmc' },
  {
    id: '0B',
    label: 'Phase 0B — Templates',
    dates: 'Feb 21–Mar 3',
    color: '#78716c',
    module: 'all',
  },
  {
    id: '1A',
    label: 'Phase 1A — AI Integration',
    dates: 'Mar 4–11',
    color: '#78716c',
    module: 'all',
  },
  {
    id: '1B',
    label: 'Phase 1B — Polish & QA',
    dates: 'Mar 12–17',
    color: '#78716c',
    module: 'all',
  },
];

export function buildRoadmapNodes(): Node[] {
  const nodes: Node[] = [];
  const allTasks = [...MODULES.ectd.tasks, ...MODULES.cmc.tasks, ...MODULES.cerv2.tasks];

  PHASES.forEach((phase, pi) => {
    // Phase header
    nodes.push({
      id: `phase-${phase.id}`,
      type: 'phaseHeader',
      position: { x: 0, y: pi * 200 },
      data: {
        phase,
        taskCount: allTasks.filter(t => t.phase === phase.id).length,
      },
      draggable: true,
    });

    // Tasks within phase
    const phaseTasks = allTasks.filter(t => t.phase === phase.id);
    phaseTasks.forEach((task, ti) => {
      nodes.push({
        id: `task-${task.id}`,
        type: 'taskCard',
        position: { x: 320 + (ti % 4) * 280, y: pi * 200 + Math.floor(ti / 4) * 90 },
        data: { task },
        draggable: true,
      });
    });
  });

  return nodes;
}

export function buildRoadmapEdges(): Edge[] {
  const edges: Edge[] = [];
  const allTasks = [...MODULES.ectd.tasks, ...MODULES.cmc.tasks, ...MODULES.cerv2.tasks];

  // Phase → task edges
  PHASES.forEach(phase => {
    const phaseTasks = allTasks.filter(t => t.phase === phase.id);
    phaseTasks.forEach(task => {
      edges.push({
        id: `phase-${phase.id}-to-${task.id}`,
        source: `phase-${phase.id}`,
        target: `task-${task.id}`,
        type: 'smoothstep',
        style: { stroke: phase.color, strokeWidth: 1.5 },
      });
    });
  });

  // Dependency edges
  allTasks.forEach(task => {
    if (task.dependency) {
      edges.push({
        id: `dep-${task.dependency}-to-${task.id}`,
        source: `task-${task.dependency}`,
        target: `task-${task.id}`,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#a8a29e', strokeWidth: 2, strokeDasharray: '5 5' },
        label: 'depends on',
        labelStyle: { fontSize: 10, fill: '#44403c' },
      });
    }
  });

  // Sequential phase edges
  for (let i = 0; i < PHASES.length - 1; i++) {
    edges.push({
      id: `phase-seq-${PHASES[i].id}-${PHASES[i + 1].id}`,
      source: `phase-${PHASES[i].id}`,
      target: `phase-${PHASES[i + 1].id}`,
      type: 'smoothstep',
      style: { stroke: '#b0aea5', strokeWidth: 1, strokeDasharray: '8 4' },
    });
  }

  return edges;
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW 3: ARCHITECTURE DATA FLOW NODES & EDGES
// ─────────────────────────────────────────────────────────────────────────────

interface ArchComponent {
  id: string;
  label: string;
  layer: 'client' | 'server' | 'shadow' | 'database';
  module: string;
  status: ConnectionStatus;
  detail: string;
}

const ARCH_COMPONENTS: ArchComponent[] = [
  // Client layer
  {
    id: 'cli-cerv2',
    label: 'CERV2EditorAI',
    layer: 'client',
    module: 'cerv2',
    status: 'connected',
    detail: '45 files, 28K lines',
  },
  {
    id: 'cli-coauthor',
    label: 'CoAuthor.jsx',
    layer: 'client',
    module: 'ectd',
    status: 'broken',
    detail: '13,461 lines — 18/20 endpoints 404',
  },
  {
    id: 'cli-cmc',
    label: 'CMC Platform',
    layer: 'client',
    module: 'cmc',
    status: 'broken',
    detail: '102 files, 90,454 lines — all 404',
  },
  {
    id: 'cli-canvas',
    label: 'Canvas Editor',
    layer: 'client',
    module: 'cerv2',
    status: 'connected',
    detail: 'Shared TipTap/ProseMirror',
  },
  {
    id: 'cli-docx',
    label: 'DOCX Factory UI',
    layer: 'client',
    module: 'cerv2',
    status: 'connected',
    detail: 'Export dialog components',
  },

  // Server layer — Mounted
  {
    id: 'srv-cerv2',
    label: '/api/cerv2/*',
    layer: 'server',
    module: 'cerv2',
    status: 'connected',
    detail: '26 endpoints, fully mounted',
  },
  {
    id: 'srv-docx',
    label: '/api/docx-factory/*',
    layer: 'server',
    module: 'cerv2',
    status: 'connected',
    detail: '12 endpoints via shadow proxy',
  },
  {
    id: 'srv-ind',
    label: '/api/ind/*',
    layer: 'server',
    module: 'ectd',
    status: 'connected',
    detail: '30+ IND automation endpoints',
  },

  // Server layer — Stubs / unmounted
  {
    id: 'srv-coauthor',
    label: '/api/coauthor/*',
    layer: 'server',
    module: 'ectd',
    status: 'broken',
    detail: '23-line STUB — only GET/POST sessions',
  },
  {
    id: 'srv-ectd-docs',
    label: '/api/ectd-documents/*',
    layer: 'server',
    module: 'ectd',
    status: 'broken',
    detail: '23-line STUB — returns empty []',
  },
  {
    id: 'srv-cmc',
    label: '/api/cmc/*',
    layer: 'server',
    module: 'cmc',
    status: 'unmounted',
    detail: '24 files, 10,935L — NEVER app.use()',
  },
  {
    id: 'srv-cmc-dash',
    label: '/api/cmc-dashboard',
    layer: 'server',
    module: 'cmc',
    status: 'broken',
    detail: '36-line stub, zeroed data',
  },

  // Shadow service
  {
    id: 'shadow-docx',
    label: 'DOCX Factory',
    layer: 'shadow',
    module: 'cerv2',
    status: 'connected',
    detail: '12 endpoints, Jinja2 templates',
  },
  {
    id: 'shadow-ectd',
    label: 'eCTD Router',
    layer: 'shadow',
    module: 'ectd',
    status: 'unmounted',
    detail: '773 lines — no Express proxy',
  },
  {
    id: 'shadow-ind',
    label: 'IND Automation',
    layer: 'shadow',
    module: 'ectd',
    status: 'connected',
    detail: 'FastAPI service on port 8001',
  },
  {
    id: 'shadow-cmc',
    label: 'CMC Guidance',
    layer: 'shadow',
    module: 'cmc',
    status: 'unmounted',
    detail: '126 lines — no Express proxy',
  },

  // Database
  {
    id: 'db-cerv2',
    label: 'CERV2 Tables',
    layer: 'database',
    module: 'cerv2',
    status: 'connected',
    detail: 'Drizzle: migrated & seeded',
  },
  {
    id: 'db-ectd',
    label: 'eCTD Tables',
    layer: 'database',
    module: 'ectd',
    status: 'broken',
    detail: '6 tables defined, never migrated',
  },
  {
    id: 'db-cmc',
    label: 'CMC Tables',
    layer: 'database',
    module: 'cmc',
    status: 'unmounted',
    detail: '12 Drizzle + 2 SQL — never migrated',
  },
  {
    id: 'db-ind',
    label: 'IND Tables',
    layer: 'database',
    module: 'ectd',
    status: 'connected',
    detail: 'Drizzle: migrated & seeded',
  },
];

export function buildArchitectureNodes(): Node[] {
  const nodes: Node[] = [];
  const layers: Record<string, { y: number; label: string }> = {
    client: { y: 0, label: 'Client Layer (React SPA)' },
    server: { y: 250, label: 'Express Server (Port 5000)' },
    shadow: { y: 500, label: 'Shadow Service (Python FastAPI)' },
    database: { y: 730, label: 'PostgreSQL Database' },
  };

  // Layer labels
  Object.entries(layers).forEach(([key, layer]) => {
    nodes.push({
      id: `layer-${key}`,
      type: 'layerLabel',
      position: { x: -200, y: layer.y + 30 },
      data: { label: layer.label },
      draggable: false,
      selectable: false,
    });
  });

  // Component nodes
  const byLayer: Record<string, ArchComponent[]> = {
    client: [],
    server: [],
    shadow: [],
    database: [],
  };
  ARCH_COMPONENTS.forEach(c => byLayer[c.layer].push(c));

  Object.entries(byLayer).forEach(([layerKey, components]) => {
    components.forEach((comp, ci) => {
      nodes.push({
        id: comp.id,
        type: 'archComponent',
        position: { x: ci * 230, y: layers[layerKey].y },
        data: { component: comp },
        draggable: true,
      });
    });
  });

  return nodes;
}

export function buildArchitectureEdges(): Edge[] {
  const edges: Edge[] = [];

  const connections: { src: string; tgt: string; status: ConnectionStatus; label?: string }[] = [
    // Client → Server (working)
    { src: 'cli-cerv2', tgt: 'srv-cerv2', status: 'connected', label: 'REST API' },
    { src: 'cli-canvas', tgt: 'srv-cerv2', status: 'connected', label: 'Canvas save' },
    { src: 'cli-docx', tgt: 'srv-docx', status: 'connected', label: 'Export' },

    // Client → Server (broken)
    { src: 'cli-coauthor', tgt: 'srv-coauthor', status: 'broken', label: '404 — 18 endpoints' },
    { src: 'cli-coauthor', tgt: 'srv-ectd-docs', status: 'broken', label: '404 — empty stub' },
    { src: 'cli-cmc', tgt: 'srv-cmc', status: 'broken', label: '404 — unmounted' },
    { src: 'cli-cmc', tgt: 'srv-cmc-dash', status: 'broken', label: 'zeroed data' },

    // Server → Shadow (working)
    { src: 'srv-docx', tgt: 'shadow-docx', status: 'connected', label: 'HTTP proxy' },
    { src: 'srv-ind', tgt: 'shadow-ind', status: 'connected', label: 'HTTP proxy' },

    // Server → Shadow (broken / unmounted)
    { src: 'srv-coauthor', tgt: 'shadow-ectd', status: 'unmounted', label: 'no proxy wired' },
    { src: 'srv-cmc', tgt: 'shadow-cmc', status: 'unmounted', label: 'no proxy wired' },

    // Server → Database (working)
    { src: 'srv-cerv2', tgt: 'db-cerv2', status: 'connected', label: 'Drizzle ORM' },
    { src: 'srv-ind', tgt: 'db-ind', status: 'connected', label: 'Drizzle ORM' },

    // Server → Database (broken)
    { src: 'srv-coauthor', tgt: 'db-ectd', status: 'broken', label: 'tables not migrated' },
    { src: 'srv-cmc', tgt: 'db-cmc', status: 'unmounted', label: 'tables not migrated' },
  ];

  const statusStyles: Record<
    ConnectionStatus,
    { stroke: string; animated: boolean; dasharray?: string }
  > = {
    connected: { stroke: '#57534e', animated: false },
    broken: { stroke: '#44403c', animated: true, dasharray: '5 5' },
    unmounted: { stroke: '#b0aea5', animated: false, dasharray: '8 4' },
  };

  connections.forEach((conn, i) => {
    const style = statusStyles[conn.status];
    edges.push({
      id: `arch-${i}`,
      source: conn.src,
      target: conn.tgt,
      type: 'smoothstep',
      animated: style.animated,
      label: conn.label,
      style: {
        stroke: style.stroke,
        strokeWidth: conn.status === 'broken' ? 2.5 : 1.5,
        ...(style.dasharray ? { strokeDasharray: style.dasharray } : {}),
      },
      labelStyle: {
        fontSize: 10,
        fontWeight: conn.status === 'broken' ? 700 : 400,
        fill: style.stroke,
      },
    });
  });

  return edges;
}
