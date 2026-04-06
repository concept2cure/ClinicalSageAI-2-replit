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
  // ── 8 canonical layout modes ──
  | 'chats'                  // Conversation home (ChatGPT-style)
  | 'projects'               // Project browser grid
  | 'project-home'           // Project landing (conversation-first)
  | 'project-workspace'      // All project-scoped tools (internal sub-routing via WorkspaceView)
  | 'reports'                // Reporting & Analytics — global report engine + analytics
  | 'communication-center'   // Tasks, reviews, submissions routing
  | 'apps'                   // App launcher + specialist tools
  | 'settings';              // Account, workspace, preferences
  // All project-scoped modes (documents, vault, review, etc.) are now WorkspaceView values
  // inside the project-workspace layout. Deep-research is a chat mode, not a layout mode.
  // All demoted/legacy modes handled as untyped strings in zenRouteNormalization.ts.

// ═══════════════════════════════════════════════════════════════════════════════
// NAV MAPPINGS
// ═══════════════════════════════════════════════════════════════════════════════

export const PRIMARY_NAV_ID_BY_LAYOUT: Partial<Record<LayoutMode, string>> = {
  chats: 'chats',
  projects: 'projects',
  'project-home': 'projects',
  'project-workspace': 'projects',
  reports: 'reports',
  'communication-center': 'communication-center',
  apps: 'apps',
  settings: 'settings',
};

export const SIDEBAR_NAV_TO_LAYOUT: Record<string, LayoutMode> = {
  // ── 6 primary destinations ──
  chats: 'chats',
  projects: 'projects',
  reports: 'reports',
  'communication-center': 'communication-center',
  apps: 'apps',
  settings: 'settings',
  // ── Project context entries (all route to project-workspace) ──
  home: 'projects',
  overview: 'project-home',
  documents: 'project-workspace',
  submissions: 'project-workspace',
  'project-reports': 'project-workspace',
  dossier: 'project-workspace',
  'ri-copilot': 'project-workspace',
  'submission-builder': 'project-workspace',
  cmc: 'project-workspace',
  'clinical-module5': 'project-workspace',
  verify: 'project-workspace',
  vault: 'project-workspace',
  review: 'project-workspace',
  publish: 'project-workspace',
  haq: 'project-workspace',
  'task-board': 'project-workspace',
  'csr-workflow': 'project-workspace',
  'ind-checklist': 'project-workspace',
  work: 'project-workspace',
  'review-tab': 'project-workspace',
  submit: 'project-workspace',
  templates: 'project-workspace',
  'template-library': 'project-workspace',
  tools: 'project-workspace',
  dataroom: 'project-workspace',
  upload: 'project-workspace',
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
  // Black-and-white only — no warm tones, no chroma.
  // Submission types differentiated by neutral grayscale steps.
  const colors: Record<string, string> = {
    '510K': '#737373',    // neutral-500
    IND: '#525252',       // neutral-600
    NDA: '#404040',       // neutral-700
    BLA: '#262626',       // neutral-800
    PMA: '#000000',       // black
    MAA: '#a3a3a3',       // neutral-400
    DE_NOVO: '#d4d4d4',   // neutral-300
    EUA: '#525252',       // neutral-600
  };
  return colors[type] || '#737373'; // neutral-500 fallback
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
