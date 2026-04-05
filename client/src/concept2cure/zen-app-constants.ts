/**
 * ZenApp Constants and Types — Extracted from ZenApp.tsx (Stage 10)
 *
 * Pure data: layout modes, nav mappings, tool panel registry, industry modes.
 * No React imports, no side effects, no runtime state.
 */

import type { IndustryMode } from './types/workspace';

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT MODES
// ═══════════════════════════════════════════════════════════════════════════════

export type ToolPanel =
  | 'ectd'
  | 'protocol'
  | 'sop'
  | 'capa'
  | 'pms'
  | 'inspection'
  | 'intelligence'
  | 'vault'
  | 'doc-editor'
  | 'ana-biostats'
  | null;

export type LayoutMode =
  // ── Global destinations ──
  | 'projects'
  | 'apps'
  | 'artifacts-center'
  | 'setup'
  // ── Project tabs ──
  | 'project-home'
  | 'documents'
  | 'vault'
  | 'review'
  | 'submissions'
  | 'dossier-map'
  | 'section-workspace'
  | 'csr-workflow'
  | 'ind-checklist'
  | 'template-library'
  // ── Canonical workspace + editor ──
  | 'regulatory-workspace'
  | 'editor'
  | 'deep-research'
  // ── Specialist tools (launched from Apps) ──
  | 'precedent-intelligence'
  | 'biostatistics'
  | 'review-readiness'
  | 'report-engine'
  | 'safety-narrative'
  | 'vault-workspace'
  // ── Compatibility redirects (redirect on mount, no renderer) ──
  | 'workspace'
  | 'assistant'
  | 'ctd'
  | 'medtech-dashboard'
  | 'dossier'
  // ── Demoted modes (redirect to projects or documents via DEMOTED_REDIRECTS) ──
  | 'mission-control'
  | 'snowglobe'
  | 'snowglobe-chambers'
  | 'rules'
  | 'ectd-coauthor'
  | 'cmc'
  | 'document-vault'
  | 'clinical-trial'
  | 'templates'
  | 'sherpa'
  | 'analytics'
  | 'timeline'
  | 'audit'
  | 'enablement-center'
  | 'platform-admin'
  | 'biologics-dashboard'
  | 'ctd-onboarding'
  | 'client-intelligence'
  | 'collaboration-hub'
  | 'user-inbox'
  | 'client-branding'
  | 'training-center'
  | 'client-onboarding'
  | 'knowledge-base'
  | 'project-knowledge'
  | 'artifacts'
  | 'document-builder'
  | 'ana-platform-control'
  // ── Legacy batch-1 modes (kept for type safety only) ──
  | 'ind-workspace'
  | 'submission-workspace'
  | 'author'
  | 'intelligence-hub'
  | 'command-center'
  | 'legal-center'
  | 'about-training'
  | 'ana-dashboard'
  | 'integrations'
  // ── Unused MissionControl sub-modes (no renderer, no redirect needed) ──
  | 'intelligence-feed'
  | 'gap-analysis'
  | 'change-impact'
  | 'ana-memory'
  | 'artifact-graph'
  | 'review-center'
  | 'dossier-view'
  | 'risk-cockpit'
  | 'route-planner'
  | 'evidence-manager'
  | 'decision-log'
  | 'authority-tracker'
  | 'provenance-trail'
  | 'notifications'
  | 'program-wizard'
  | 'task-board'
  | 'team-workspace'
  | 'program-analytics';

// ═══════════════════════════════════════════════════════════════════════════════
// NAV MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════════

export const PRIMARY_NAV_ID_BY_LAYOUT: Partial<Record<LayoutMode, string>> = {
  projects: 'ri-copilot',
  'project-home': 'ri-copilot',
  'dossier-map': 'clinical-module5',
  documents: 'work',
  review: 'review',
  submissions: 'publish',
  'section-workspace': 'clinical-module5',
  'vault-workspace': 'vault',
  'review-readiness': 'verify',
  'report-engine': 'haq',
  'task-board': 'task-board',
  'csr-workflow': 'csr-workflow',
  'ind-checklist': 'ind-checklist',
  'template-library': 'templates',
};

export const SIDEBAR_NAV_TO_LAYOUT: Record<string, LayoutMode> = {
  apps: 'apps',
  'artifacts-center': 'artifacts-center',
  setup: 'setup',
  projects: 'projects',
  home: 'projects',
  documents: 'regulatory-workspace',
  submissions: 'submissions',
  reports: 'report-engine',
  dossier: 'dossier-map',
  'ri-copilot': 'regulatory-workspace',
  'submission-builder': 'regulatory-workspace',
  cmc: 'section-workspace',
  'clinical-module5': 'section-workspace',
  verify: 'review-readiness',
  vault: 'vault-workspace',
  review: 'review',
  publish: 'submissions',
  haq: 'report-engine',
  'task-board': 'task-board',
  'csr-workflow': 'csr-workflow',
  'ind-checklist': 'ind-checklist',
  overview: 'project-home',
  work: 'documents',
  'review-tab': 'review',
  submit: 'submissions',
  templates: 'template-library',
  'template-library': 'template-library',
  tools: 'documents',
  dataroom: 'regulatory-workspace',
  upload: 'regulatory-workspace',
};

// ═══════════════════════════════════════════════════════════════════════════════
// INDUSTRY MODES
// ═══════════════════════════════════════════════════════════════════════════════

export const INDUSTRY_MODES: IndustryMode[] = [
  'biotech',
  'pharma',
  'cro',
  'medtech',
  'academic',
  'regulatory',
  'medical_writing',
];

export const normalizeIndustryMode = (value?: string): IndustryMode => {
  if (!value) return 'biotech';
  const normalized = value.toLowerCase().trim() as IndustryMode;
  return INDUSTRY_MODES.includes(normalized) ? normalized : 'biotech';
};

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL PANEL CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

import {
  Folder,
  ClipboardList,
  Globe,
  FileText,
  PenLine,
  FlaskConical,
  BookOpen,
  AlertTriangle,
  BarChart2,
  CheckSquare,
} from 'lucide-react';

export const TOOL_PANELS: Record<
  Exclude<ToolPanel, null>,
  {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    component: string;
  }
> = {
  ectd: { title: 'eCTD Navigator', icon: Folder, component: 'ECTDNavigator' },
  protocol: { title: 'Protocol Designer', icon: ClipboardList, component: 'StudyProtocolDesigner' },
  intelligence: {
    title: 'Regulatory Intelligence',
    icon: Globe,
    component: 'RegulatoryIntelligence',
  },
  vault: { title: 'Document Vault', icon: FileText, component: 'VaultBrowser' },
  'doc-editor': { title: 'Document Editor', icon: PenLine, component: 'EditorPanel' },
  'ana-biostats': { title: 'AnA Biostats', icon: FlaskConical, component: 'AnaBiostatsPanel' },
  sop: { title: 'SOP Management', icon: BookOpen, component: 'SOPManagement' },
  capa: { title: 'CAPA Management', icon: AlertTriangle, component: 'CAPAManagement' },
  pms: { title: 'Post-Market Surveillance', icon: BarChart2, component: 'PostMarketSurveillance' },
  inspection: {
    title: 'Inspection Readiness',
    icon: CheckSquare,
    component: 'InspectionReadiness',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT COLOR HELPER
// ═══════════════════════════════════════════════════════════════════════════════

export function getProjectColor(type: string): string {
  const colors: Record<string, string> = {
    '510K': 'blue',
    IND: 'purple',
    NDA: 'green',
    BLA: 'orange',
    PMA: 'red',
    MAA: 'pink',
    DE_NOVO: 'amber',
    EUA: 'cyan',
  };
  return colors[type] || 'gray';
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER PROFILE TYPE
// ═══════════════════════════════════════════════════════════════════════════════

export interface UserProfile {
  role?: string;
  objectives?: string[];
  criteria?: string[];
  preferences?: Record<string, string | number | boolean>;
  updatedAt?: string;
}
