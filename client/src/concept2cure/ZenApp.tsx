/**
 * @fileoverview Zen App - Complete Application Shell
 * @module concept2cure/ZenApp
 * @version 3.0.0
 *
 * @description
 * The "New iPhone" of regulatory intelligence - complete minimalist application.
 * Combines all zen components into a cohesive, elegant experience.
 *
 * NOW CONNECTED TO:
 * - AnA 1.0 RI (AI chat)
 * - Project Cortex (data harvesting)
 * - Unified data layers
 *
 * Layout:
 * - Collapsible sidebar with conversations
 * - Main chat area (Claude.ai style)
 * - Tool panels slide from right (like Claude artifacts)
 * - Command palette (⌘K)
 * - Settings modal
 * - Project switcher
 *
 * @compliance
 * - FDA 21 CFR Part 11: Full audit trail
 * - WCAG 2.1 AA: Accessible throughout
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { ZenSidebar } from './components/sidebar/ZenSidebar';
import { ZenChat } from './components/chat/ZenChat';
import { ZenCommandPalette } from './components/command/ZenCommandPalette';
const ZenSettings = React.lazy(() =>
  import('./components/settings/ZenSettings').then(m => ({ default: m.ZenSettings }))
);
import { ProjectSwitcher, NewProjectModal } from './components/projects/ProjectSwitcher';
import ProjectConfigPanel from './components/workspace/ProjectConfigPanel';
// [BATCH 3] WorkflowTimeline — renderer removed, import kept for type compatibility
import { ProjectFilesCompact } from './components/workspace/ProjectFilesCompact';
import { ProjectHeaderBar, getProjectAccentColor } from './components/workspace/ProjectHeaderBar';
// [BATCH 3] CustomInstructions — knowledge-base renderer removed
import { useProjectKnowledge } from './hooks/useProjectKnowledge';
import { useProjectTasks } from './hooks/useProjectTasks';
import { useAuthoringIntelligence } from './hooks/useAuthoringIntelligence';
import { useProjects } from './hooks/useProjects';
import { useCortexThreads, useCortexHealth } from './hooks/useCortex';
import { usePlatformContext } from './hooks/useLicense';
import { useWorkspaceSummary } from './hooks/useWorkspaceSummary';
import { useReadinessAssessment } from './hooks/useOrchestration';
import {
  useProjectIntelligence,
  useNextBestActions,
  useRecommendations,
} from './hooks/useIntelligence';

import { ProjectWorkspaceShell } from './components/workspace/ProjectWorkspaceShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { IndustryMode } from './types/workspace';
// [BATCH 3] ProductAuditQuestionnaire — renderer removed
import { isFeatureEnabled } from '@/flags/featureFlags';
import { getProjectModuleRoutePolicy } from './router/projectModuleRoutePolicy';

// Lazy-load CERV2Page for embedded module rendering inside the shell
const EmbeddedCERV2Page = lazy(() => import('@/pages/csr/CERV2Page'));
// Lazy-load PMA Workspace for embedded module rendering
const EmbeddedPMAWorkspace = lazy(() => import('./components/pma/PMAWorkspace'));
// [BATCH 1 DELETED] LandingPage, CommandCenterHub, IntelligenceHub, AnaDashboard,
// AboutTrainingCenter, LegalCenter, IntegrationsPage, SubmissionOpsCommandCenter, INDWorkspace, PricingPage
// Full Document Builder wizard (CSR + CTD across global agencies)
const FullDocumentBuilder = lazy(() => import('./components/builder/FullDocumentBuilder'));
// Tools Landing — curated workbench (builder is one tool inside it)
const ToolsLanding = lazy(() => import('./components/workspace/ToolsLanding'));
import {
  Archive,
  X,
  ChevronLeft,
  Maximize2,
  Minimize2,
  ClipboardList,
  BookOpen,
  BarChart2,
  AlertTriangle,
  CheckSquare,
  Globe,
  Folder,
  ShieldCheck,
  WifiOff,
  FileText,
  Plus,
  ArrowLeft,
  CircleDot,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Zap,
  ListTodo,
  Calendar,
  TrendingUp,
  Beaker,
  GitBranch,
  Shield,
  Eye,
  FlaskConical,
  Scale,
  Building2,
  Fingerprint,
  Bell,
  Star,
  MessageSquare,
  FolderOpen,
  Upload,
  Link2,
  Sparkles,
  PenLine,
  Layers,
  Download,
  Brain,
  Snowflake,
  Bot,
  Activity,
  Rocket,
  FileStack,
  Users,
  Loader2,
} from 'lucide-react';
import { LoadingState } from '@/components/ui/statesV2';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Canonical loading fallback for Suspense boundaries
const ModuleLoadingFallback = () => (
  <div className="flex-1 bg-white p-6">
    <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
      <div className="h-6 bg-stone-100 rounded w-1/3" />
      <div className="h-3 bg-stone-50 rounded w-2/3" />
      <div className="mt-6 space-y-3">
        <div className="h-32 bg-stone-50 rounded-lg" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-20 bg-stone-50 rounded-lg" />
          <div className="h-20 bg-stone-50 rounded-lg" />
          <div className="h-20 bg-stone-50 rounded-lg" />
        </div>
      </div>
    </div>
  </div>
);

// Utility: instantly redirect dead layout modes to regulatory-workspace
const RedirectToWorkspace: React.FC<{ onRedirect: () => void }> = ({ onRedirect }) => {
  React.useEffect(() => {
    onRedirect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};

// Lazy load the Convergent Canvas for the Sherpa System
// [BATCH 3] ConvergentCanvas (Sherpa mode) — renderer removed

// Enablement Center — Dr. Sage + AnA 1.0 dual-AI enablement hub
// [BATCH 3] EnablementCenter — renderer removed

// [Phase A] Dr. Sage removed — AnA is the single guide identity
// import DrSageGlobalLayer from './components/dr-sage/DrSagePanel';

// AnA Persistent Panel — always-available AI conversation on every page
import AnaPersistentPanel from './components/chat/AnaPersistentPanel';
import { GlobalOperatingShell } from './components/shell/GlobalOperatingShell';

// Canonical authoring context resolver
import {
  resolveAuthoringContext,
  resolveWorkflowStage,
  type ContextResolverInput,
} from './services/authoring-context-resolver';
import type {
  AuthoringContextPack,
  ReadinessSnapshot,
  ContradictionEntry,
} from '../../../shared/types/authoring-context';

// First-run onboarding experience
const FirstRunExperience = lazy(() => import('./components/enablement/FirstRunExperience'));

// [BATCH 3] SnowGlobe — removed as user-reachable world

// [BATCH 1 DELETED] AboutTrainingCenter

// [BATCH 3] MissionControl + RulesManager — removed as user-reachable world

// [BATCH 1 DELETED] INDWorkspace

// IND Workspace Right Rail (section-specific CTD context)
const INDRightRail = lazy(() =>
  import('./components/workspace/INDRightRail').then(m => ({ default: m.INDRightRail }))
);

// [BATCH 1 DELETED] SubmissionOpsCommandCenter

// ─── Regulatory module standalones ────────────────────────────────────────────
// Document Editor panel (bridge to UnifiedDocumentEditor + live APIs)
const EditorPanel = lazy(() =>
  import('./components/editor/EditorPanel').then(m => ({ default: m.default }))
);
// [BATCH 3] ECTDCoAuthorStandalone — standalone mode removed, redirects to documents

// AnA 1.0 Intelligence Home (evidence-first landing surface)
const RICopilotHome = lazy(() =>
  import('./components/intelligence/RICopilotHome').then(m => ({
    default: m.RICopilotHome,
  }))
);

// Precedent Intelligence Dashboard (standalone 4-tab view)
const PrecedentIntelligenceDashboard = lazy(() =>
  import('./components/precedent/PrecedentIntelligenceDashboard').then(m => ({
    default: m.PrecedentIntelligenceDashboard,
  }))
);

// DocumentAppHub removed — absorbed into workspace flow (Wave 2)
// ProjectLauncher removed — all project routes go directly to regulatory-workspace

// ─── Regulatory module lazy-loads for tool panels ─────────────────────────────
const CAPAManagementPanel = lazy(() =>
  import('./components/regulatory/CAPAManagement').then(m => ({ default: m.default }))
);
const PostMarketSurveillancePanel = lazy(() =>
  import('./components/regulatory/PostMarketSurveillance').then(m => ({ default: m.default }))
);
const InspectionReadinessPanel = lazy(() =>
  import('./components/regulatory/InspectionReadiness').then(m => ({ default: m.default }))
);
const ECTDNavigatorPanel = lazy(() =>
  import('./components/regulatory/ECTDNavigator').then(m => ({ default: m.default }))
);
const RegulatoryIntelligenceFullPanel = lazy(() =>
  import('./components/regulatory/RegulatoryIntelligence').then(m => ({ default: m.default }))
);
const VaultBrowserPanel = lazy(() =>
  import('@/components/sharepoint/SharePointFileManager').then(m => ({ default: m.default }))
);

// [BATCH 3] CMC, Vault, StudyArchitect, Templates — standalone modes removed, redirect to documents

const IntelligentReportGenerator = lazy(
  () => import('./components/reports/IntelligentReportGenerator')
);

// [BATCH 1 DELETED] AnaDashboard

const SafetyNarrativePage = lazy(() => import('./pages/SafetyNarrative'));

// [BATCH 3] AnaPlatformControlPage — demoted, redirect to projects

const DocumentCanvasPanel = lazy(() =>
  import('./components/workspace/DocumentCanvasPanel').then(m => ({
    default: m.DocumentCanvasPanel,
  }))
);
const ProjectKnowledgePanel = lazy(() =>
  import('./components/workspace/ProjectKnowledgePanel').then(m => ({
    default: m.ProjectKnowledgePanel,
  }))
);

// ─── Unified workflow components ─────────────────────────────────────────────
const ProjectHomeDashboard = lazy(() =>
  import('./components/workflow/ProjectHomeDashboard').then(m => ({
    default: m.ProjectHomeDashboard,
  }))
);
const DossierMap = lazy(() =>
  import('./components/workflow/DossierMap').then(m => ({ default: m.DossierMap }))
);
const SectionWorkspace = lazy(() =>
  import('./components/workflow/SectionWorkspace').then(m => ({ default: m.SectionWorkspace }))
);
const SubmissionReadinessView = lazy(() =>
  import('./components/workflow/SubmissionReadiness').then(m => ({
    default: m.SubmissionReadiness,
  }))
);
const SubmissionBuilderView = lazy(() =>
  import('./components/submission/SubmissionBuilder').then(m => ({
    default: m.default,
  }))
);
const ProjectTaskBoardView = lazy(() =>
  import('./components/workspace/ProjectTaskBoard').then(m => ({
    default: m.ProjectTaskBoard,
  }))
);
const CSRWorkflowView = lazy(() =>
  import('./components/workflow/CSRWorkflow').then(m => ({
    default: m.CSRWorkflow,
  }))
);
const INDChecklistView = lazy(() =>
  import('./components/workflow/INDChecklist').then(m => ({
    default: m.INDChecklist,
  }))
);
const TemplateLibraryView = lazy(() =>
  import('./components/submission/TemplateLibrary').then(m => ({
    default: m.default,
  }))
);
const HAQManagerView = lazy(() =>
  import('./components/workflow/HAQManager').then(m => ({
    default: m.HAQManager,
  }))
);

// ─── New intent-organized workspace lazy loads ──────────────────────────────
// [BATCH 1 DELETED] IntelligenceHub
const RegulatoryPrecedentIntelligence = lazy(
  () => import('./pages/RegulatoryPrecedentIntelligence')
);
const ReviewReadiness = lazy(() =>
  import('./pages/ReviewReadiness').then(m => ({ default: m.ReviewReadiness }))
);
// [BATCH 1 DELETED] CommandCenterHub

// [BATCH 3] ClientIntelligencePage — demoted, redirect to projects

// [BATCH 3] CollaborationHubPage — demoted, redirect to projects

// [BATCH 3] UserInboxPage — demoted, redirect to projects

// [BATCH 3] ClientBrandingSettings — demoted, redirect to projects

// Biostatistics Platform — statistical analysis, power calculations, endpoints
const BiostatPlatformDashboard = lazy(
  () => import('@/components/biostat/BiostatPlatformDashboard')
);

// AnA Biostats Panel — structured input, computation, judgment, governed documents
const AnaBiostatsPanel = lazy(() => import('@/concept2cure/components/biostats/AnaBiostatsPanel'));

// [BATCH 3] TrainingManagementPage — demoted, redirect to projects
// [BATCH 1 DELETED] IntegrationsPage

// Agent Hub and Review Pulse removed — shell-only modules not demo-ready

// [BATCH 3] OnboardingWizardPage — demoted, redirect to projects

// Knowledge Base — account-level skills, .MD upload, materials ingestion
// Already imported: CustomInstructions from './components/knowledge/CustomInstructions'

// Project Knowledge — project-level context, uploads, sources
// Already lazy-loaded: ProjectKnowledgePanel

// [BATCH 1 DELETED] LegalCenter

// Platform Home — Claude.ai-style landing dashboard
const PlatformHome = lazy(() => import('./components/home/PlatformHome'));

// ─── New global destination pages (Phase 1 OS restructure) ──────────────────
const AppsPage = lazy(() => import('./pages/AppsPage'));
const ArtifactsPage = lazy(() => import('./pages/ArtifactsPage'));
const VaultPage = lazy(() => import('./pages/VaultPage'));
const SetupPage = lazy(() => import('./pages/SetupPage'));

// [BATCH 3] ArtifactsGalleryPage — demoted, redirect to documents

// [BATCH 3] PlatformAdminPage — demoted, redirect to projects

// [BATCH 3] BiologicsDashboardPage — demoted, redirect to projects

// [BATCH 3] CTDOnboardingWizardPage — demoted, redirect to projects

// Project Sidebar — Claude.ai-style right sidebar (Context, Instructions, Files)
import { ProjectSidebar } from './components/workspace/ProjectSidebar';

// Map panel keys to lazy components
// Early-access modules (capa, pms, inspection) gated behind feature flag
const PANEL_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  ...(isFeatureEnabled('ENABLE_EARLY_ACCESS_MODULES')
    ? {
        capa: CAPAManagementPanel,
        pms: PostMarketSurveillancePanel,
        inspection: InspectionReadinessPanel,
      }
    : {}),
  ectd: ECTDNavigatorPanel,
  intelligence: RegulatoryIntelligenceFullPanel,
  vault: VaultBrowserPanel,
  'doc-editor': EditorPanel,
  'ana-biostats': AnaBiostatsPanel,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type ToolPanel =
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

type LayoutMode =
  // ── Global destinations ──
  | 'projects'
  | 'apps'
  | 'artifacts-center'
  | 'setup'
  // ── Project tabs ──
  | 'project-home' // Overview
  | 'documents' // Work
  | 'vault' // Vault
  | 'review' // Review
  | 'submissions' // Submit
  | 'dossier-map' // Sub-view within Work
  | 'section-workspace' // Sub-view within Work
  | 'csr-workflow' // CSR guided authoring (ICH E3)
  | 'ind-checklist' // IND requirements checklist (21 CFR 312.23)
  | 'template-library' // Template browser and creation
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
  | 'workspace' // → regulatory-workspace
  | 'assistant' // → regulatory-workspace
  | 'ctd' // → regulatory-workspace
  | 'medtech-dashboard' // → regulatory-workspace
  | 'dossier' // → regulatory-workspace
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

const PRIMARY_NAV_ID_BY_LAYOUT: Partial<Record<LayoutMode, string>> = {
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

const LEGACY_NAV_ID_BY_LAYOUT: Partial<Record<LayoutMode, string>> = {
  'regulatory-workspace': 'submission-builder',
  workspace: 'work',
  'ind-workspace': 'work',
  'ectd-coauthor': 'work',
  cmc: 'cmc',
  'clinical-trial': 'clinical-module5',
  author: 'work',
  editor: 'work',
  templates: 'work',
  'document-builder': 'work',
  'intelligence-hub': 'ri-copilot',
  snowglobe: 'projects',
  'snowglobe-chambers': 'projects',
  'command-center': 'projects',
  'mission-control': 'projects',
  'submission-workspace': 'submissions',
  'document-vault': 'vault',
  'enablement-center': 'projects',
  'client-intelligence': 'projects',
  'collaboration-hub': 'review',
  'user-inbox': 'projects',
  'client-branding': 'projects',
  biostatistics: 'biostatistics',
  'training-center': 'projects',
  'client-onboarding': 'projects',
  'knowledge-base': 'projects',
  'project-knowledge': 'projects',
  'legal-center': 'review',
  sherpa: 'documents',
  audit: 'review',
  timeline: 'projects',
  analytics: 'projects',
  artifacts: 'documents',
  'about-training': 'projects',
  'precedent-intelligence': 'documents',
  'deep-research': 'documents',
  'safety-narrative': 'documents',
  'ana-dashboard': 'projects',
  'ana-platform-control': 'projects',
  'platform-admin': 'projects',
  'biologics-dashboard': 'documents',
  'ctd-onboarding': 'projects',
  integrations: 'projects',
};

const INDUSTRY_MODES: IndustryMode[] = [
  'biotech',
  'pharma',
  'cro',
  'medtech',
  'academic',
  'regulatory',
  'medical_writing',
];

const normalizeIndustryMode = (value?: string): IndustryMode => {
  if (!value) {
    return 'biotech';
  }

  const normalized = value.toLowerCase().trim() as IndustryMode;
  return INDUSTRY_MODES.includes(normalized) ? normalized : 'biotech';
};

interface UserProfile {
  role?: string;
  objectives?: string[];
  criteria?: string[];
  preferences?: Record<string, string | number | boolean>;
  updatedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL PANEL CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

// [BATCH 4] TOOL_PANELS — these contextual drawer panels are not user-visible
// as a static catalog. They are only triggered programmatically (e.g. by AnA
// or deep links). Retained for future AnA-driven contextual panel support.
// No standalone "module picker" surfaces these to users.
const TOOL_PANELS: Record<
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
  // Retained for compliance-sector clients but not actively surfaced:
  sop: { title: 'SOP Management', icon: BookOpen, component: 'SOPManagement' },
  capa: { title: 'CAPA Management', icon: AlertTriangle, component: 'CAPAManagement' },
  pms: { title: 'Post-Market Surveillance', icon: BarChart2, component: 'PostMarketSurveillance' },
  inspection: {
    title: 'Inspection Readiness',
    icon: CheckSquare,
    component: 'InspectionReadiness',
  },
};

// Helper to get project color by type
function getProjectColor(type: string): string {
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
// TOOL PANEL WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

interface ToolPanelWrapperProps {
  panel: Exclude<ToolPanel, null>;
  onClose: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const ToolPanelWrapper: React.FC<ToolPanelWrapperProps> = ({
  panel,
  onClose,
  isFullscreen,
  onToggleFullscreen,
}) => {
  const config = TOOL_PANELS[panel];
  const Icon = config.icon;

  // In a real implementation, we'd lazy-load the actual components
  // For now, render a placeholder that shows the component is ready
  return (
    <div
      className={cn(
        'flex flex-col h-full bg-white border-l border-stone-200',
        isFullscreen ? 'w-full' : 'w-full sm:w-80 md:w-96 lg:w-[600px]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-stone-100 bg-stone-50/50">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-stone-600" />
            <span className="font-medium text-stone-900">{config.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-700 hover:bg-stone-200/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto zen-scroll">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full">
                <LoadingState size="sm" message="" />
              </div>
            }
          >
            {PANEL_COMPONENTS[panel] ? (
              (() => {
                const PanelComponent = PANEL_COMPONENTS[panel];
                return <PanelComponent />;
              })()
            ) : (
              <div className="flex items-center justify-center h-full text-center p-8">
                <div>
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-stone-100 flex items-center justify-center">
                    <Icon className="w-8 h-8 text-stone-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-stone-900 mb-2">{config.title}</h3>
                  <p className="text-sm text-stone-500 max-w-sm">
                    {config.title} module loading...
                  </p>
                </div>
              </div>
            )}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD — Real data from project/artifact APIs
// ═══════════════════════════════════════════════════════════════════════════════

// [BATCH 4] AnalyticsDashboardInline deleted — dead code (~200 lines)

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ZEN APP
// ═══════════════════════════════════════════════════════════════════════════════

interface ZenAppProps {
  initialProjectId?: string;
  initialConversationId?: string;
}

export const ZenApp: React.FC<ZenAppProps> = ({ initialProjectId, initialConversationId } = {}) => {
  // ─────────────────────────────────────────────────────────────────────────────
  // URL-DRIVEN PROJECT IDENTITY
  // ─────────────────────────────────────────────────────────────────────────────
  const [location, navigate] = useLocation();
  const embedModulesEnabled = isFeatureEnabled('EMBED_MODULES_IN_SHELL');
  const projectModuleRoutePolicy = useMemo(
    () => getProjectModuleRoutePolicy(location, embedModulesEnabled),
    [location, embedModulesEnabled]
  );
  const urlProjectId = projectModuleRoutePolicy.projectId;

  // ─────────────────────────────────────────────────────────────────────────────
  // EMBEDDED MODULE DETECTION
  // When EMBED_MODULES_IN_SHELL is enabled and URL has /project/:id/510k,
  // render CERV2Page inside the shell frame instead of as a standalone page.
  // ─────────────────────────────────────────────────────────────────────────────
  const embeddedModule = projectModuleRoutePolicy.shouldRenderInShell
    ? projectModuleRoutePolicy.module
    : null;

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA HOOKS (Connected to Cortex + Data Layer)
  // ─────────────────────────────────────────────────────────────────────────────

  // Cortex health check
  const { data: cortexHealth } = useCortexHealth({ refetchInterval: 30000 });
  const isConnected = cortexHealth?.status === 'healthy';

  // License gating + user intelligence (personalized context)
  const {
    industryMode: orgIndustryMode,
    greeting: platformGreeting,
    intelligence: userIntelligence,
    lastWorkSummary,
    nextTask,
  } = usePlatformContext();

  // Workspace summary — real counts, org, recent activity, next actions
  const { data: workspaceSummary, isLoading: summaryLoading } = useWorkspaceSummary();

  // Projects from database
  const {
    projects: rawProjects,
    createProject: createProjectMutation,
    updateProject: updateProjectMutation,
    deleteProject: deleteProjectMutation,
    updateOwnershipPreferences: updateOwnershipPreferencesMutation,
  } = useProjects();

  // Map DB submission type strings to the UI SubmissionType enum
  function mapSubmissionType(raw: string): string {
    const map: Record<string, string> = {
      clinical_trial: 'IND',
      regulatory_submission: 'NDA',
      medical_device: '510K',
      literature_review: 'NDA',
      ind: 'IND',
      nda: 'NDA',
      bla: 'BLA',
      pma: 'PMA',
      maa: 'MAA',
      eua: 'EUA',
      de_novo: 'DE_NOVO',
    };
    if (['510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'].includes(raw)) return raw;
    return map[raw?.toLowerCase()] || 'IND';
  }

  // Transform projects for UI
  const projects = useMemo(() => {
    return rawProjects.map(p => ({
      id: p.id,
      name: p.name,
      type: mapSubmissionType(p.submissionType),
      color: getProjectColor(p.submissionType),
      description: p.description,
      sponsor: p.sponsor,
      product: p.product,
      region: p.region,
      targetAgency: (p as any).targetAgency,
      pinned: (p.metadata as any)?.pinned ?? false,
      lastUpdated: p.updatedAt,
      conversationCount: p.conversations?.length ?? 0,
      starred: (p.metadata as any)?.starred ?? false,
      archived: p.status === 'archived',
      status: p.status || 'active',
    }));
  }, [rawProjects]);

  // ─────────────────────────────────────────────────────────────────────────────
  // LOCAL STATE
  // ─────────────────────────────────────────────────────────────────────────────

  // Sidebar — auto-collapse on small screens
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Modals
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined);
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [projectsSearchQuery, setProjectsSearchQuery] = useState('');
  const [showFirstRun, setShowFirstRun] = useState(() => {
    try {
      return !localStorage.getItem('concept2cure_first_run_complete');
    } catch {
      return false;
    }
  });

  // Tool panels
  const [activeToolPanel, setActiveToolPanel] = useState<ToolPanel>(null);
  const [toolPanelFullscreen, setToolPanelFullscreen] = useState(false);

  // Layout mode — initialize from URL when deep-linked into a project
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    urlProjectId ? 'regulatory-workspace' : initialProjectId ? 'project-home' : 'projects'
  );

  // Active section code — tracks which dossier section is open in SectionWorkspace
  const [activeSectionCode, setActiveSectionCode] = useState<string | null>(null);

  // Submission view sub-tab: readiness checklist vs package builder
  const [submissionTab, setSubmissionTab] = useState<'readiness' | 'builder'>('readiness');

  // Guard: prevents URL-sync from reverting a navigation that's in-flight
  const navInProgressRef = useRef(false);

  // Page-level context for AnA awareness (active tab, filters, etc.)
  const [moduleContext, setModuleContext] = useState<Record<string, unknown>>({});

  // ── Authoring context state (feeds AnA with section/artifact/workflow awareness) ──
  const [activeArtifactId, setActiveArtifactId] = useState<string | undefined>();
  const [activeArtifactVersion, setActiveArtifactVersion] = useState<string | undefined>();
  const [activeArtifactStatus, setActiveArtifactStatus] = useState<string | undefined>();
  const [activeSectionTitle, setActiveSectionTitle] = useState<string | undefined>();
  const [activeModuleCode, setActiveModuleCode] = useState<string | undefined>();
  const [sectionReadiness, setSectionReadiness] = useState<ReadinessSnapshot | undefined>();
  const [sectionContradictions, setSectionContradictions] = useState<
    ContradictionEntry[] | undefined
  >();

  // Account-level custom instructions for Knowledge Base
  const [customInstructions, setCustomInstructions] = useState('');

  // Right panel tab in workspace mode
  const [workspacePanelTab, setWorkspacePanelTab] = useState<'files' | 'outputs' | 'instructions'>(
    'files'
  );
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(true);

  const [moduleAssistantOpen, setModuleAssistantOpen] = useState(false);

  // Tools sub-view: 'landing' shows the curated workbench, 'builder' shows FullDocumentBuilder, 'haq' shows HAQ Manager
  const [toolsSubView, setToolsSubView] = useState<'landing' | 'builder' | 'haq'>('landing');
  // Reset tools sub-view when entering documents mode (always land on workbench)
  useEffect(() => {
    if (layoutMode === 'documents') setToolsSubView('landing');
  }, [layoutMode]);

  // Pending editor content — when a module wants to open the editor with pre-populated content
  const [pendingEditorContent, setPendingEditorContent] = useState<{
    title: string;
    content: string;
    ctdSection?: string;
  } | null>(null);

  // Direct artifact open — when a module has already saved an artifact and wants to open it
  const [openArtifactId, setOpenArtifactId] = useState<string | undefined>();

  // AnA intelligence view: 'intelligence' = evidence-first home, 'editor' = document editing
  const [riViewMode, setRiViewMode] = useState<'intelligence' | 'editor'>(
    urlProjectId ? 'editor' : 'intelligence'
  );

  // Active selection — URL projectId takes precedence, then session restore, then first project
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(
    urlProjectId ?? initialProjectId ?? projects[0]?.id
  );
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(
    initialConversationId
  );
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>();

  // Sherpa project detail view state
  const [sherpaDetailProjectId, setSherpaDetailProjectId] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState<string>('all');

  // Task management for the selected project in sherpa mode
  const {
    tasks: projectTasks,
    isLoadingTasks,
    summary: taskSummary,
    createTask,
    updateTask,
    generateMilestones,
    isGenerating: isGeneratingMilestones,
  } = useProjectTasks(sherpaDetailProjectId || activeProjectId || '');

  // Run log — lightweight action execution transparency
  // NOTE: declared after activeProjectId to avoid TDZ in deps arrays
  const [runLog, setRunLog] = useState<
    Array<{
      id: string;
      intent: string;
      label: string;
      status: 'running' | 'done' | 'failed';
      ts: number;
    }>
  >([]);

  const DEMOTED_REDIRECTS: Partial<Record<LayoutMode, LayoutMode>> = {
    'mission-control': 'projects',
    snowglobe: 'projects',
    'snowglobe-chambers': 'projects',
    rules: 'projects',
    'ectd-coauthor': 'documents',
    cmc: 'documents',
    'document-vault': 'vault',
    'vault-workspace': 'vault',
    'review-readiness': 'review',
    'clinical-trial': 'documents',
    // templates: now a real layout mode — removed from DEMOTED_REDIRECTS
    'document-builder': 'documents',
    artifacts: 'artifacts-center',
    sherpa: 'projects',
    analytics: 'projects',
    timeline: 'projects',
    audit: 'projects',
    'enablement-center': 'projects',
    'platform-admin': 'projects',
    'biologics-dashboard': 'projects',
    'ctd-onboarding': 'projects',
    'client-intelligence': 'projects',
    'collaboration-hub': 'projects',
    'user-inbox': 'projects',
    'client-branding': 'projects',
    'training-center': 'projects',
    'client-onboarding': 'projects',
    'knowledge-base': 'projects',
    'project-knowledge': 'projects',
    'ana-platform-control': 'projects',
  };

  // [C-03/C-04] Validate initialProjectId exists in the projects array.
  // If the stored/URL project was deleted or is inaccessible, fall back gracefully.
  useEffect(() => {
    if (initialProjectId && projects.length > 0 && !projects.find(p => p.id === initialProjectId)) {
      setActiveProjectId(projects[0]?.id);
      setLayoutMode('projects');
    }
  }, [initialProjectId, projects]);

  // [BATCH 3] Redirect demoted layout modes to surviving destinations.
  // This catches deep links, stale bookmarks, and any navigation to removed worlds.
  useEffect(() => {
    const redirect = DEMOTED_REDIRECTS[layoutMode];
    if (redirect) {
      setLayoutMode(redirect);
    }
  }, [layoutMode]);

  // Load persisted run log from sessionStorage when the active project changes
  useEffect(() => {
    if (!activeProjectId) return;
    try {
      const stored = sessionStorage.getItem(`runlog:${activeProjectId}`);
      setRunLog(stored ? JSON.parse(stored) : []);
    } catch {
      setRunLog([]);
    }
  }, [activeProjectId]);

  const handleActionRun = useCallback(
    (entry: {
      id: string;
      intent: string;
      label: string;
      status: 'running' | 'done' | 'failed';
      ts: number;
    }) => {
      setRunLog(prev => {
        const idx = prev.findIndex(e => e.id === entry.id);
        const next =
          idx === -1 ? [entry, ...prev].slice(0, 20) : prev.map((e, i) => (i === idx ? entry : e));
        // Persist immediately in the updater so we always save the final value
        if (activeProjectId) {
          try {
            sessionStorage.setItem(`runlog:${activeProjectId}`, JSON.stringify(next));
          } catch {
            /* quota exceeded */
          }
        }
        return next;
      });
    },
    [activeProjectId]
  );

  // Derive active project early so downstream hooks / memos can reference it
  const activeProject = projects.find(p => p.id === activeProjectId);
  const activeRawProject = rawProjects.find(p => p.id === activeProjectId);

  useEffect(() => {
    if (!activeRawProject) return;
    const preferredContext =
      activeRawProject.ownership?.preferences?.currentWorkbenchContext ||
      activeRawProject.ownership?.currentWorkbenchContext;
    if (!preferredContext) return;
    if (layoutMode === preferredContext) return;
    if (urlProjectId) return; // Respect direct URL route during initial load
    setLayoutMode(preferredContext as LayoutMode);
  }, [activeRawProject, layoutMode, urlProjectId]);

  useEffect(() => {
    if (!activeProjectId) return;
    if (!activeRawProject) return;
    const supportedContexts = new Set([
      'project-home',
      'regulatory-workspace',
      'documents',
      'review',
      'review-readiness',
      'submissions',
      'section-workspace',
      'report-engine',
    ]);
    if (!supportedContexts.has(layoutMode)) return;
    const currentStored =
      activeRawProject.ownership?.preferences?.currentWorkbenchContext ||
      activeRawProject.ownership?.currentWorkbenchContext;
    if (currentStored === layoutMode) return;
    const t = setTimeout(() => {
      void updateOwnershipPreferencesMutation({
        projectId: activeProjectId,
        preferences: { currentWorkbenchContext: layoutMode as any },
      }).catch(error => {
        console.warn('Failed to persist workbench context preference', error);
      });
    }, 350);
    return () => clearTimeout(t);
  }, [activeProjectId, activeRawProject, layoutMode, updateOwnershipPreferencesMutation]);

  useEffect(() => {
    if (!activeRawProject?.ownership) return;
    setModuleContext(prev => ({
      ...prev,
      projectInstructions:
        activeRawProject.ownership?.preferences?.projectInstructions ||
        activeRawProject.ownership?.projectInstructions ||
        '',
      reviewState:
        activeRawProject.ownership?.derived?.reviewState || activeRawProject.ownership?.reviewState,
      readinessState:
        activeRawProject.ownership?.derived?.readinessState ||
        activeRawProject.ownership?.readinessState,
    }));
    setCustomInstructions(
      activeRawProject.ownership?.preferences?.projectInstructions ||
        activeRawProject.ownership?.projectInstructions ||
        ''
    );
  }, [activeRawProject]);

  // Readiness score for the active project (displayed in ProjectHeaderBar)
  const { data: readinessData } = useReadinessAssessment(
    activeProjectId ? Number(activeProjectId) : null
  );
  const projectReadinessScore = readinessData?.metrics?.readinessScore;

  // Intelligence profile + next best actions for enriched AnaPersistentPanel
  const { data: intelligenceProfile } = useProjectIntelligence(
    activeProjectId ? Number(activeProjectId) : null
  );
  const { data: nextActionsData } = useNextBestActions(
    activeProjectId ? Number(activeProjectId) : null,
    5
  );
  const { data: recommendationsData } = useRecommendations(
    activeProjectId ? Number(activeProjectId) : null
  );

  // Project intelligence stats for AnaPersistentPanel greeting enrichment
  const projectIntelligenceStats = useMemo(() => {
    if (!readinessData && !intelligenceProfile) return undefined;
    return {
      documentCount: readinessData?.metrics?.artifactCount ?? 0,
      signalCount: readinessData?.metrics?.signalCount ?? 0,
      readinessScore: projectReadinessScore ?? null,
      memoryAtomCount: readinessData?.metrics?.memoryAtomCount ?? 0,
      // Enriched from useRecommendations (active recommendations sorted by severity)
      recommendations: recommendationsData?.recommendations
        ?.filter(r => r.status === 'active')
        ?.slice(0, 5)
        ?.map(r => ({
          id: r.recommendationId,
          title: r.suggestedAction || r.reason,
          severity: r.severity,
          category: r.type,
        })),
      nextActions: nextActionsData?.actions?.slice(0, 3).map(a => ({
        id: a.actionId,
        title: a.title,
        priority: a.urgency,
        reason: a.description,
      })),
      riskFactors: intelligenceProfile?.riskFactors?.slice(0, 5).map(rf => ({
        description: rf.risk,
        likelihood: rf.likelihood,
        impact: rf.impact,
      })),
      openQuestions: intelligenceProfile?.openQuestions?.slice(0, 5).map(oq => ({
        question: oq.question,
        priority: oq.priority ?? 'medium',
        context: oq.context ?? '',
      })),
    };
  }, [
    readinessData,
    projectReadinessScore,
    intelligenceProfile,
    nextActionsData,
    recommendationsData,
  ]);

  // ── Canonical AuthoringContextPack — derived from all available state ──────
  const authoringContext = useMemo<AuthoringContextPack | null>(() => {
    return resolveAuthoringContext({
      projectId: activeProjectId,
      layoutMode: layoutMode,
      submissionType: activeProject?.type,
      regulatorBody: activeProject?.region || activeProject?.regulatoryRegion,
      sectionCode: activeSectionCode,
      sectionTitle: activeSectionTitle,
      artifactId: activeArtifactId,
      artifactVersion: activeArtifactVersion,
      artifactStatus: activeArtifactStatus,
      readiness: sectionReadiness,
      contradictions: sectionContradictions,
    });
  }, [
    activeProjectId,
    layoutMode,
    activeProject?.type,
    activeProject?.region,
    activeProject?.regulatoryRegion,
    activeSectionCode,
    activeSectionTitle,
    activeArtifactId,
    activeArtifactVersion,
    activeArtifactStatus,
    sectionReadiness,
    sectionContradictions,
  ]);

  // Handler for child surfaces to update authoring context fields
  const handleAuthoringContextChange = useCallback((partial: Partial<AuthoringContextPack>) => {
    if (partial.sectionCode !== undefined) setActiveSectionCode(partial.sectionCode || null);
    if (partial.sectionTitle !== undefined) setActiveSectionTitle(partial.sectionTitle);
    if (partial.moduleCode !== undefined) setActiveModuleCode(partial.moduleCode);
    if (partial.artifactId !== undefined) setActiveArtifactId(partial.artifactId);
    if (partial.artifactVersionId !== undefined)
      setActiveArtifactVersion(partial.artifactVersionId);
    if (partial.artifactStatus !== undefined) setActiveArtifactStatus(partial.artifactStatus);
    if (partial.readiness !== undefined) setSectionReadiness(partial.readiness);
    if (partial.contradictions !== undefined) setSectionContradictions(partial.contradictions);
  }, []);

  // ── P1: Draft insertion → pendingEditorContent → EditorPanel auto-creates artifact ──
  const handleDraftInsert = useCallback(
    (content: string, title: string, ctdSection?: string) => {
      setPendingEditorContent({ title, content, ctdSection });
      // Switch to documents mode where EditorPanel will consume the pending content
      if (
        layoutMode !== 'documents' &&
        layoutMode !== 'workspace' &&
        layoutMode !== 'regulatory-workspace'
      ) {
        setLayoutMode('documents');
      }
    },
    [layoutMode]
  );

  useEffect(() => {
    if (layoutMode !== 'biostatistics') return;
    setLayoutMode('regulatory-workspace');
    setActiveToolPanel('ana-biostats');
  }, [layoutMode]);

  // Project-scoped artifacts for route/handoff decisions (must come after activeProjectId)
  const { data: projectArtifacts = [] } = useQuery({
    queryKey: ['project-artifacts', activeProjectId],
    queryFn: async () => {
      if (!activeProjectId) return [];
      const token =
        sessionStorage.getItem('trialsage_access_token') ||
        localStorage.getItem('trialsage_access_token');
      const res = await fetch(`/api/concept2cure/projects/${activeProjectId}/artifacts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data?.data ?? data?.artifacts ?? [];
    },
    enabled: !!activeProjectId,
    staleTime: 30_000,
  });

  // ── P2: Navigate to section — real navigation ──
  const handleNavigateToSection = useCallback(
    (sectionCode: string) => {
      setActiveSectionCode(sectionCode);
      const moduleNum = sectionCode.charAt(0);
      const match = projectArtifacts.find(
        (a: any) =>
          a.ctdSection === sectionCode ||
          a.ctdSection === `csr-${sectionCode}` ||
          a.ctdSection === `m${moduleNum}-${sectionCode}`
      );
      if (match) {
        setOpenArtifactId(match.id);
      } else {
        setPendingEditorContent({
          title: `Section ${sectionCode}`,
          content: '',
          ctdSection: sectionCode,
        });
      }
      setRiViewMode('editor');
      setLayoutMode('regulatory-workspace');
    },
    [projectArtifacts]
  );

  // ── P2: Open artifact — real navigation ──
  const handleOpenArtifact = useCallback(
    (artifactId: string) => {
      // On project-home (AnA-first): show artifact in canvas panel without leaving conversation
      // On other modes: navigate to documents/editor
      setActiveArtifactId(artifactId);
      if (layoutMode !== 'project-home') {
        setOpenArtifactId(artifactId);
        setLayoutMode('documents');
      }
    },
    [layoutMode]
  );

  // ── P5: Governed promotion — calls real status API ──
  const handleRequestPromotion = useCallback(
    async (artifactId: string): Promise<{ promoted: boolean; message: string }> => {
      if (!activeProjectId) {
        return { promoted: false, message: 'No active project.' };
      }
      const token =
        sessionStorage.getItem('trialsage_access_token') ||
        localStorage.getItem('trialsage_access_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(
        `/api/concept2cure/projects/${activeProjectId}/artifacts/${artifactId}/status`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ status: 'review' }),
        }
      );
      if (res.ok) {
        return {
          promoted: true,
          message: 'Artifact promoted to review. Governance workflow initiated.',
        };
      }
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { promoted: false, message: err.error || err.message || 'Promotion failed.' };
    },
    [activeProjectId]
  );

  // Workspace suggested actions — context-aware quick-start chips for AnA
  const workspaceSuggestedActions = useMemo(() => {
    const biostatsAction = {
      id: 'open-ana-biostats',
      label: 'Open AnA Biostats',
      intent: 'go-biostatistics',
      description: 'Run SAP-grade biostatistics analysis and governed document generation.',
    };

    const base = workspaceSummary?.nextActions ?? [];
    if (base.length > 0) {
      const withBiostats = base.some(action => action.intent === 'go-biostatistics')
        ? base
        : [biostatsAction, ...base];
      return withBiostats.slice(0, 4);
    }

    const t = (activeProject?.type || 'IND').toUpperCase();
    const starters: Record<
      string,
      Array<{ id: string; label: string; intent: string; description: string }>
    > = {
      '510K': [
        {
          id: 'upload-device-docs',
          label: 'Upload device documents',
          intent: 'upload-source-documents',
          description: 'Add device specs, test results, and labeling.',
        },
        {
          id: 'find-predicates',
          label: 'Find likely predicates',
          intent: 'find-likely-510k-predicates',
          description: 'Search FDA for substantially equivalent devices.',
        },
        {
          id: 'draft-device-desc',
          label: 'Draft device description',
          intent: 'draft-510k-device-description',
          description: 'Generate Section 3 device description.',
        },
        {
          id: 'check-estar',
          label: 'Check eSTAR readiness',
          intent: 'check-estar-readiness',
          description: 'Review eSTAR template requirements.',
        },
      ],
      IND: [
        {
          id: 'upload-source',
          label: 'Upload source documents',
          intent: 'upload-source-documents',
          description: 'Add CSRs, CMC data, and preclinical files.',
        },
        {
          id: 'draft-ind-outline',
          label: 'Draft IND outline',
          intent: 'draft-ind-outline',
          description: 'Generate IND outline per 21 CFR 312.23.',
        },
        {
          id: 'missing-sections',
          label: 'Identify missing sections',
          intent: 'identify-missing-ind-sections',
          description: 'Audit your IND for incomplete sections.',
        },
        {
          id: 'gen-cmc-workplan',
          label: 'Generate CMC workplan',
          intent: 'generate-cmc-workplan',
          description: 'Build Module 3 CMC workplan and timeline.',
        },
      ],
      CER: [
        {
          id: 'upload-evidence',
          label: 'Upload evidence & literature',
          intent: 'upload-source-documents',
          description: 'Add clinical literature and PMS data.',
        },
        {
          id: 'build-cer-outline',
          label: 'Build CER outline',
          intent: 'build-cer-outline',
          description: 'Structure CER sections per MEDDEV 2.7/1 Rev 4.',
        },
        {
          id: 'draft-benefit-risk',
          label: 'Draft benefit-risk section',
          intent: 'draft-cer-benefit-risk',
          description: 'Generate the benefit-risk analysis.',
        },
        {
          id: 'review-pms-pmcf',
          label: 'Review PMS / PMCF gaps',
          intent: 'review-pms-pmcf-gaps',
          description: 'Identify post-market surveillance gaps.',
        },
      ],
      NDA: [
        {
          id: 'upload-source',
          label: 'Upload source documents',
          intent: 'upload-source-documents',
          description: 'Add CSRs, CMC data, and prior filings.',
        },
        {
          id: 'draft-nda-outline',
          label: 'Draft NDA outline',
          intent: 'draft-nda-outline',
          description: 'Generate NDA outline per 21 CFR 314.',
        },
        {
          id: 'nda-missing',
          label: 'Identify missing sections',
          intent: 'identify-missing-nda-sections',
          description: 'Audit NDA for gaps and missing modules.',
        },
        {
          id: 'gen-summary',
          label: 'Generate ISS/ISE outline',
          intent: 'generate-iss-ise-outline',
          description: 'Outline Integrated Summary of Safety/Efficacy.',
        },
      ],
    };
    const fallback = starters[t] ?? starters['IND'];
    return fallback.some(action => action.intent === 'go-biostatistics')
      ? fallback.slice(0, 4)
      : [biostatsAction, ...fallback].slice(0, 4);
  }, [activeProject?.type, workspaceSummary?.nextActions]);

  // Pending draft request from IND Workspace → passed to AnA when switching to workspace mode
  const [pendingDraftSection, setPendingDraftSection] = useState<{
    code: string;
    title: string;
  } | null>(null);

  // External message to send into AnA chat (triggered by suggested prompts, dashboard actions)
  const [externalChatMessage, setExternalChatMessage] = useState<{
    text: string;
    ts: number;
  } | null>(null);

  // Instructions + knowledge for Instructions tab (lifted so it doesn't remount per tab)
  const workspaceKnowledge = useProjectKnowledge(activeProjectId ?? null);

  // ── Authoring intelligence — real readiness/contradiction data for active section ──
  const authoringIntelligence = useAuthoringIntelligence(
    activeProjectId,
    layoutMode === 'section-workspace' ? activeSectionCode : null
  );
  // Feed real intelligence data into authoring context when available
  useEffect(() => {
    if (authoringIntelligence.readiness) setSectionReadiness(authoringIntelligence.readiness);
    if (authoringIntelligence.contradictions)
      setSectionContradictions(authoringIntelligence.contradictions);
  }, [authoringIntelligence.readiness, authoringIntelligence.contradictions]);

  // Threads for current project
  const { data: threads = [] } = useCortexThreads(activeProjectId);

  // Transform threads to conversations for sidebar
  const conversations = useMemo(() => {
    return threads.map(t => ({
      id: t.id,
      title: t.title || 'New conversation',
      projectId: t.projectId || activeProjectId || '',
      timestamp: t.updatedAt,
      starred: false,
      pinned: false,
    }));
  }, [threads, activeProjectId]);

  // Set active project when projects load (prefer summary's last-touched project)
  // NOTE: activeProjectId intentionally excluded from deps to prevent re-trigger loops
  // Restore last active project from workspace summary (don't force-select first project)
  // This allows an unscoped "general" chat mode when no project is selected (Claude.ai parity)
  useEffect(() => {
    if (!activeProjectId) {
      const summaryProject = workspaceSummary?.active?.projectId;
      if (summaryProject) {
        setActiveProjectId(summaryProject);
      }
      // Intentionally NOT auto-selecting projects[0] — allow unscoped state
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, workspaceSummary]);

  // Open a tool panel from the ?panel= URL query param on first load
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const panelParam = params.get('panel') as ToolPanel | null;
      if (panelParam && panelParam in TOOL_PANELS) {
        setActiveToolPanel(panelParam);
        // Strip the query param so a refresh doesn't re-open it
        const url = new URL(window.location.href);
        url.searchParams.delete('panel');
        window.history.replaceState({}, '', url.toString());
      }
    } catch (_) {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link: if URL has /project/:projectId, set active project + go to workspace
  useEffect(() => {
    if (urlProjectId && urlProjectId !== activeProjectId) {
      setActiveProjectId(urlProjectId);
      setRiViewMode('editor');
      setLayoutMode('regulatory-workspace');
    }
    // Also support legacy ?projectId= query param for backwards compat
    try {
      const params = new URLSearchParams(window.location.search);
      const qp = params.get('projectId');
      if (qp && !urlProjectId) {
        setActiveProjectId(qp);
        setRiViewMode('editor');
        setLayoutMode('regulatory-workspace');
        // Upgrade to path-based URL
        navigate(`/concept2cure/project/${qp}`);
      }
    } catch (_) {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlProjectId]);

  // Sync URL path when active project or layout changes
  useEffect(() => {
    if ((layoutMode === 'workspace' || layoutMode === 'regulatory-workspace') && activeProjectId) {
      // Only update URL if not already on the right project path
      const expected = `/concept2cure/project/${activeProjectId}`;
      if (!window.location.pathname.startsWith(expected)) {
        window.history.replaceState({}, '', expected);
      }
      navInProgressRef.current = false;
    } else if (layoutMode === 'projects' && !embeddedModule) {
      // Back to project hub — clear project from URL
      // Skip if a navigation is in-flight (state updates still batching)
      if (navInProgressRef.current) return;
      if (window.location.pathname.includes('/project/')) {
        window.history.replaceState({}, '', '/concept2cure');
      }
    }
  }, [layoutMode, activeProjectId, embeddedModule]);

  // Clear stale pending state when switching layout modes
  useEffect(() => {
    if (layoutMode !== 'workspace' && layoutMode !== 'regulatory-workspace') {
      setPendingDraftSection(null);
    }
  }, [layoutMode]);

  const handleNewChat = useCallback(() => {
    // Clear active conversation/thread
    setActiveConversationId(undefined);
    setActiveThreadId(undefined);
    setLayoutMode(activeProjectId ? 'regulatory-workspace' : 'projects');
    setActiveToolPanel(null);
  }, [activeProjectId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // NAVIGATION HELPER — intercepts special paths before falling through to layoutMode
  // ─────────────────────────────────────────────────────────────────────────────
  const handleAnaPanelNavigate = useCallback((path: string) => {
    if (path === 'ana-intelligence') {
      setSettingsSection('ana-intelligence');
      setSettingsOpen(true);
      return;
    }
    setLayoutMode(path as LayoutMode);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // KEYBOARD SHORTCUTS — use refs to avoid re-attaching listeners on every state change
  // ─────────────────────────────────────────────────────────────────────────────

  const kbStateRef = useRef({
    activeToolPanel,
    commandPaletteOpen,
    settingsOpen,
    layoutMode,
    activeProjectId,
  });
  kbStateRef.current = {
    activeToolPanel,
    commandPaletteOpen,
    settingsOpen,
    layoutMode,
    activeProjectId,
  };

  const handleNewChatRef = useRef(handleNewChat);
  handleNewChatRef.current = handleNewChat;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const st = kbStateRef.current;

      // Command palette: ⌘K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }

      // New chat: ⌘N or Ctrl+N
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleNewChatRef.current();
      }

      // Settings: ⌘,
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      }

      // Edit project: ⌘E or Ctrl+E (workspace mode only)
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key === 'e' &&
        st.layoutMode === 'workspace' &&
        st.activeProjectId
      ) {
        e.preventDefault();
        setEditProjectOpen(true);
      }

      // Close tool panel: Escape
      if (e.key === 'Escape' && st.activeToolPanel && !st.commandPaletteOpen && !st.settingsOpen) {
        setActiveToolPanel(null);
        setToolPanelFullscreen(false);
      }

      // Vault drawer: Alt+V
      if (e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        setActiveToolPanel('vault');
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Listen for Mission Control inter-page navigation events
    const handleMcNavigate = (e: Event) => {
      const mode = (e as CustomEvent).detail?.mode as LayoutMode;
      if (mode) {
        setLayoutMode(mode);
        setActiveToolPanel(null);
      }
    };
    window.addEventListener('mc-navigate', handleMcNavigate);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mc-navigate', handleMcNavigate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  const handleDeleteConversation = useCallback(
    (id: string) => {
      // Threads are managed by Cortex - would call deleteThread mutation
      if (activeConversationId === id) {
        setActiveConversationId(undefined);
        setActiveThreadId(undefined);
      }
    },
    [activeConversationId]
  );

  const handleToggleConversationStar = useCallback((id: string) => {
    // Would update thread metadata via Cortex
    console.log('Toggle star for conversation:', id);
  }, []);

  const handleToggleConversationPin = useCallback((id: string) => {
    // Would update thread metadata via Cortex
    console.log('Toggle pin for conversation:', id);
  }, []);

  const handleMoveConversation = useCallback(
    async (conversationId: string, targetProjectId: string) => {
      try {
        await apiRequest('PATCH', `/api/chat/thread/${conversationId}`, {
          project_id: targetProjectId,
        });
      } catch (error) {
        console.error('Failed to move conversation:', error);
      }
    },
    []
  );

  const handleThreadChange = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    setActiveConversationId(threadId);
  }, []);

  const handleCommandAction = useCallback(
    (actionId: string) => {
      console.log('Command action:', actionId);

      // Handle tool panel opens
      if (actionId.startsWith('tool-')) {
        const panel = actionId.replace('tool-', '') as ToolPanel;
        setActiveToolPanel(panel);
        setLayoutMode(panel === 'ectd' ? 'ctd' : 'editor');
        setCommandPaletteOpen(false);
        return;
      }

      // Handle module navigation — every module accessible via command palette
      // [BATCH 3] Only surviving first-class + specialist destinations remain
      const MODULE_ROUTES: Record<string, LayoutMode> = {
        'go-copilot': 'regulatory-workspace',
        'go-home': 'projects',
        'go-review-readiness': 'review-readiness',
        'go-biostatistics': 'regulatory-workspace',
        'go-report-engine': 'report-engine',
      };

      if (MODULE_ROUTES[actionId]) {
        setLayoutMode(MODULE_ROUTES[actionId]);
        if (actionId === 'go-biostatistics') {
          setActiveToolPanel('ana-biostats');
        }
        setCommandPaletteOpen(false);
        return;
      }

      // Handle other actions
      switch (actionId) {
        case 'new-chat':
          handleNewChat();
          setCommandPaletteOpen(false);
          break;
        case 'new-510k':
        case 'new-ind':
        case 'new-nda':
        case 'new-bla':
        case 'new-pma':
          setNewProjectOpen(true);
          setCommandPaletteOpen(false);
          break;
        case 'settings-account':
        case 'settings-org':
        case 'settings':
          setSettingsOpen(true);
          setCommandPaletteOpen(false);
          break;
        case 'settings-intelligence':
        case 'ana-intelligence':
          setSettingsSection('ana-intelligence');
          setSettingsOpen(true);
          setCommandPaletteOpen(false);
          break;
        case 'projects':
          setProjectSwitcherOpen(true);
          setCommandPaletteOpen(false);
          break;
      }
    },
    [handleNewChat]
  );

  const handleCreateProject = useCallback(
    async (data: {
      name: string;
      type: string;
      description?: string;
      sponsor?: string;
      product?: string;
      region?: string;
      goal?: string;
      color?: string;
      registryId?: string;
      applicationFamily?: string;
      applicationType?: string;
      agency?: string;
      dossierStandard?: string;
    }) => {
      try {
        await createProjectMutation({
          name: data.name,
          submissionType: data.type as any,
          description: data.description,
          sponsor: data.sponsor,
          product: data.product,
          region: data.region,
          goal: data.goal,
          color: data.color,
          registryId: data.registryId,
          applicationFamily: data.applicationFamily,
          applicationType: data.applicationType,
          agency: data.agency,
          dossierStandard: data.dossierStandard,
          conversations: [],
        });
        setNewProjectOpen(false);
      } catch (error) {
        console.error('Failed to create project:', error);
      }
    },
    [createProjectMutation]
  );

  const handleArchiveProject = useCallback(
    async (id: string) => {
      const project = rawProjects.find(p => p.id === id);
      if (project) {
        await updateProjectMutation({
          ...project,
          status: 'archived' as const,
        });
      }
    },
    [rawProjects, updateProjectMutation]
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      await deleteProjectMutation(id);
      if (activeProjectId === id && projects.length > 1) {
        setActiveProjectId(projects.find(p => p.id !== id)?.id);
      }
    },
    [activeProjectId, projects, deleteProjectMutation]
  );

  const handleToggleProjectStar = useCallback(
    async (id: string) => {
      const project = rawProjects.find(p => p.id === id);
      if (project) {
        const currentStarred = (project.metadata as any)?.starred ?? false;
        await updateProjectMutation({
          ...project,
          metadata: { ...((project.metadata as any) || {}), starred: !currentStarred } as any,
        });
      }
    },
    [rawProjects, updateProjectMutation]
  );

  const handleToggleProjectPin = useCallback(
    async (id: string) => {
      const project = rawProjects.find(p => p.id === id);
      if (project) {
        const currentPinned = (project.metadata as any)?.pinned ?? false;
        await updateProjectMutation({
          ...project,
          metadata: { ...((project.metadata as any) || {}), pinned: !currentPinned } as any,
        });
      }
    },
    [rawProjects, updateProjectMutation]
  );

  const handleEditProject = useCallback(
    async (data: Record<string, any>) => {
      const project = rawProjects.find(p => p.id === activeProjectId);
      if (project) {
        try {
          await updateProjectMutation({
            ...project,
            ...(data.name !== undefined && { name: data.name }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.sponsor !== undefined && { sponsor: data.sponsor }),
            ...(data.product !== undefined && { product: data.product }),
            ...(data.region !== undefined && { region: data.region }),
            ...(data.status !== undefined && { status: data.status }),
            metadata: {
              ...((project.metadata as any) || {}),
              ...(data.targetAgency !== undefined && { targetAgency: data.targetAgency }),
              ...(data.targetSubmissionDate !== undefined && {
                targetSubmissionDate: data.targetSubmissionDate,
              }),
              ...(data.submissionType !== undefined && { submissionType: data.submissionType }),
            } as any,
          });
        } catch (error) {
          console.error('Failed to update project:', error);
        }
      }
    },
    [activeProjectId, rawProjects, updateProjectMutation]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  const contextMetrics = useMemo(() => {
    if (!activeProject || !taskSummary) {
      return {
        deadlineDays: '—',
        complianceScore: 0,
        riskCount: 0,
        lastActivity: 'No project selected',
        auditStatus: 'Audit trail active',
      };
    }
    const targetDateStr =
      activeProject.metadata?.targetSubmissionDate || (activeProject as any).targetEndDate;
    const targetDate = targetDateStr ? new Date(targetDateStr) : null;
    const deadlineDays = targetDate
      ? Math.max(0, Math.ceil((targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : '—';
    const complianceScore = taskSummary.healthScore / 100;
    const riskCount = taskSummary.overdue + (taskSummary.byStatus?.blocked || 0);
    const ownershipActivity = activeRawProject?.ownership?.derived?.activityHistory?.[0];
    const lastActivity = ownershipActivity
      ? `${ownershipActivity.action} · ${new Date(ownershipActivity.timestamp).toLocaleString()}`
      : taskSummary.total > 0
      ? `${taskSummary.completed}/${taskSummary.total} tasks complete`
      : 'No tasks yet';
    return {
      deadlineDays,
      complianceScore,
      riskCount,
      lastActivity,
      auditStatus: 'Audit trail active',
    };
  }, [activeProject, activeRawProject, taskSummary]);

  // Dynamic workspace label based on active project's submission type
  const submissionWorkspaceLabel = useMemo(() => {
    const subType = activeProject?.type?.toUpperCase();
    switch (subType) {
      case '510K':
      case '510(K)':
        return '510(k) Filing';
      case 'NDA':
        return 'NDA Filing';
      case 'BLA':
        return 'BLA Filing';
      case 'PMA':
        return 'PMA Filing';
      case 'IND':
      default:
        return 'IND Filing';
    }
  }, [activeProject?.type]);

  const workflowRunId = activeProjectId ? `workflow-run-${activeProjectId}` : 'workflow-run-demo';
  const activeNavId = useMemo(() => {
    if (activeToolPanel === 'vault') return 'vault';
    if (activeToolPanel === 'ana-biostats') return 'biostatistics';
    if (layoutMode === 'regulatory-workspace') {
      return riViewMode === 'intelligence' ? 'ri-copilot' : 'submission-builder';
    }
    return PRIMARY_NAV_ID_BY_LAYOUT[layoutMode] ?? LEGACY_NAV_ID_BY_LAYOUT[layoutMode];
  }, [activeToolPanel, layoutMode, riViewMode]);

  const currentGlobalNodeLabel = useMemo(() => {
    if (activeToolPanel === 'vault') return 'Vault';
    if (activeToolPanel === 'ana-biostats') return 'Biostatistics';
    const labelByNavId: Record<string, string> = {
      'ri-copilot': 'Intelligence',
      'submission-builder': 'Submission Builder',
      cmc: 'CMC',
      'clinical-module5': 'Clinical / Module 5',
      verify: 'Verify',
      vault: 'Vault Workspace',
      review: 'Review',
      publish: 'Publish',
      haq: 'HAQ',
      biostatistics: 'Biostatistics',
    };
    return activeNavId ? labelByNavId[activeNavId] ?? 'Workspace' : 'Workspace';
  }, [activeNavId, activeProject, activeToolPanel]);

  const handleHeaderAction = useCallback(
    (
      action:
        | 'ri-copilot'
        | 'submission-builder'
        | 'cmc'
        | 'clinical-module5'
        | 'verify'
        | 'review'
        | 'publish'
        | 'haq'
        | 'vault'
    ) => {
      switch (action) {
        case 'ri-copilot':
          setRiViewMode('intelligence');
          setLayoutMode(activeProjectId ? 'regulatory-workspace' : 'projects');
          break;
        case 'submission-builder':
          setRiViewMode('editor');
          setLayoutMode(activeProjectId ? 'regulatory-workspace' : 'projects');
          break;
        case 'cmc':
          setRiViewMode('editor');
          setLayoutMode('section-workspace');
          break;
        case 'clinical-module5':
          setRiViewMode('editor');
          setLayoutMode('section-workspace');
          break;
        case 'verify':
          setActiveToolPanel(null);
          setLayoutMode('review-readiness');
          break;
        case 'vault':
          setActiveToolPanel(null);
          setLayoutMode('vault');
          break;
        case 'review':
          setActiveToolPanel(null);
          setLayoutMode('review');
          break;
        case 'haq':
          setActiveToolPanel(null);
          setLayoutMode('report-engine');
          break;
        case 'publish':
          setActiveToolPanel(null);
          setLayoutMode('submissions');
          break;
      }
    },
    [activeProjectId]
  );

  const timelineSteps = useMemo(
    () => [
      {
        id: 'step-intake',
        name: 'Project Intake',
        description: 'Capture submission scope, device metadata, and milestones.',
        status: 'COMPLETED' as const,
        stepType: 'TASK' as const,
        order: 1,
        phaseId: 'phase-intake',
        phaseName: 'Intake',
        assigneeRole: 'RA Lead',
        completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        isRequired: true,
      },
      {
        id: 'step-authoring',
        name: 'Draft Core Sections',
        description: 'Generate and refine core submission sections.',
        status: 'IN_PROGRESS' as const,
        stepType: 'TASK' as const,
        order: 2,
        phaseId: 'phase-authoring',
        phaseName: 'Authoring',
        assigneeRole: 'Medical Writer',
        startedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
        slaDueAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
        isRequired: true,
      },
      {
        id: 'step-review',
        name: 'Regulatory Review',
        description: 'QA and regulatory approval of drafted sections.',
        status: 'READY' as const,
        stepType: 'APPROVAL' as const,
        order: 3,
        phaseId: 'phase-review',
        phaseName: 'Review',
        assigneeRole: 'QA Manager',
        slaDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isRequired: true,
      },
      {
        id: 'step-export',
        name: 'Submission Export',
        description: 'Generate finalized eCTD package for submission.',
        status: 'PENDING' as const,
        stepType: 'EXPORT' as const,
        order: 4,
        phaseId: 'phase-export',
        phaseName: 'Submission',
        assigneeRole: 'Project Manager',
        isRequired: true,
      },
    ],
    []
  );

  const userRole = userProfile?.role || 'Regulatory Lead';
  const rawIndustry = userProfile?.preferences?.industryMode;
  const industryMode = normalizeIndustryMode(
    typeof rawIndustry === 'string' ? rawIndustry : orgIndustryMode
  );
  const rawDisplayName = userProfile?.preferences?.displayName;
  const userName =
    (typeof rawDisplayName === 'string' && rawDisplayName) ||
    userIntelligence?.identity?.name ||
    'User';
  const userEmail = userIntelligence?.identity?.email ?? undefined;

  useEffect(() => {
    const loadProfile = () => {
      try {
        const savedProfile = localStorage.getItem('concept2cure_user_profile');
        if (savedProfile) {
          setUserProfile(JSON.parse(savedProfile));
        }
      } catch (error) {
        console.warn('Unable to load user profile', error);
      }
    };

    loadProfile();

    const onStorage = (event: Event) => {
      const storageEvent = event as { key?: string };
      if (storageEvent.key === 'concept2cure_user_profile') {
        loadProfile();
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ── Workspace header — shared nav bar for non-chat modules ─────────────────
  const WorkspaceHeader = ({
    title,
    subtitle,
    icon,
    onBack,
    backLabel,
  }: {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    onBack: () => void;
    backLabel?: string;
  }) => (
    <div className="flex items-center gap-3 px-4 h-12 border-b border-stone-100 bg-white flex-shrink-0">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>{backLabel || 'Back'}</span>
      </button>
      <div className="w-px h-4 bg-stone-200" />
      {icon && <span className="text-stone-400">{icon}</span>}
      <span className="text-sm font-medium text-stone-900">{title}</span>
      {subtitle && <span className="text-xs text-stone-400 ml-1 hidden sm:inline">{subtitle}</span>}
    </div>
  );

  return (
    <div className="zen flex h-screen w-full overflow-hidden bg-white">
      {/* CSS Variables */}
      <style>{`
        .zen {
          --zen-canvas: #FAFAF9;
          --zen-canvas-muted: #F5F5F4;
          --zen-canvas-elevated: #FFFFFF;
          --zen-ink: #18181B;
          --zen-ink-muted: #71717A;
          --zen-border: #E4E4E7;
          --zen-accent: #d97757;
        }

        .zen-scroll::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }

        .zen-scroll::-webkit-scrollbar-track {
          background: transparent;
        }

        .zen-scroll::-webkit-scrollbar-thumb {
          background-color: #E4E4E7;
          border-radius: 9999px;
        }

        .zen-scroll::-webkit-scrollbar-thumb:hover {
          background-color: #D4D4D8;
        }
      `}</style>

      {/* Connection Status - only show if confirmed offline after health check loaded */}
      {cortexHealth && !isConnected && (
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1.5 bg-amber-50 border-b border-amber-200 text-amber-700 text-sm">
          <WifiOff className="w-4 h-4" />
          <span>RI running in offline mode — chat still available</span>
        </div>
      )}

      {/* Sidebar */}
      <ZenSidebar
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        conversations={conversations}
        projects={projects}
        activeConversationId={activeConversationId}
        activeProjectId={activeProjectId}
        activeNavId={
          activeToolPanel === 'vault'
            ? 'vault'
            : activeToolPanel === 'ana-biostats'
            ? 'biostatistics'
            : activeNavId
        }
        onSelectConversation={id => {
          setActiveConversationId(id);
          setActiveThreadId(id);
        }}
        onSelectProject={id => {
          setActiveProjectId(id);
          setLayoutMode('project-home');
        }}
        onNewChat={handleNewChat}
        onOpenProjects={() => setProjectSwitcherOpen(true)}
        onOpenSearch={() => setCommandPaletteOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onDeleteConversation={handleDeleteConversation}
        onToggleStar={handleToggleConversationStar}
        onTogglePin={handleToggleProjectPin}
        onArchiveProject={handleArchiveProject}
        onDeleteProject={handleDeleteProject}
        onMoveConversation={handleMoveConversation}
        industryMode={industryMode}
        onNavigate={id => {
          switch (id) {
            // ── Global destinations + project tabs (mapped via SIDEBAR_NAV_TO_LAYOUT) ──
            case 'projects':
            case 'home':
            case 'apps':
            case 'artifacts-center':
            case 'setup':
            case 'overview':
            case 'work':
            case 'vault':
            case 'review-tab':
            case 'submit':
            case 'documents':
            case 'review':
            case 'reports':
            case 'submissions':
            case 'dossier':
            case 'publish':
            case 'verify':
            case 'haq':
            case 'submission-builder':
            case 'clinical-module5':
            case 'cmc':
            case 'ri-copilot':
            case 'task-board':
            case 'csr-workflow':
            case 'ind-checklist':
            case 'templates':
            case 'template-library':
              setLayoutMode(SIDEBAR_NAV_TO_LAYOUT[id] ?? 'projects');
              if (id === 'ri-copilot') setRiViewMode('intelligence');
              if (id === 'submission-builder') setRiViewMode('editor');
              break;
            case 'tools':
              setLayoutMode(SIDEBAR_NAV_TO_LAYOUT['tools'] ?? 'documents');
              break;
            case 'agents':
              setLayoutMode('regulatory-workspace');
              break;
            case 'evidence-search':
              setCommandPaletteOpen(true);
              break;
            case 'project-config':
              setEditProjectOpen(true);
              break;
            // ── Product routes (external modules) ──
            case 'ai-copilot':
              setRiViewMode('intelligence');
              setLayoutMode('regulatory-workspace');
              break;
            case '510k-workspace':
              if (activeProjectId) {
                navigate(`/concept2cure/project/${activeProjectId}/510k`);
              } else {
                setLayoutMode('projects');
              }
              break;
            case 'pma-workspace':
              if (embeddedModule !== null || !embedModulesEnabled) {
                setLayoutMode('projects');
              } else if (activeProjectId) {
                navigate(`/concept2cure/project/${activeProjectId}/pma`);
              } else {
                setLayoutMode('projects');
              }
              break;
            case 'cer-generator':
              if (activeProjectId) {
                navigate(`/concept2cure/project/${activeProjectId}/cer`);
              } else {
                setLayoutMode('projects');
              }
              break;
            // ── Core submission workflow ──
            case 'regulatory-workspace':
            case 'section-workspace':
              setLayoutMode(id);
              break;
            case 'document-vault':
              setLayoutMode('vault');
              break;
            // ── Surviving specialist tools ──
            case 'precedent-intelligence':
              setLayoutMode('precedent-intelligence');
              break;
            case 'review-readiness':
              setLayoutMode('review-readiness');
              break;
            case 'biostatistics':
              setLayoutMode('regulatory-workspace');
              setActiveToolPanel('ana-biostats');
              break;
            case 'report-engine':
              setLayoutMode('report-engine');
              break;
            case 'safety-narrative':
              setLayoutMode('safety-narrative');
              break;
            case 'deep-research':
              setLayoutMode('deep-research');
              break;
            // [BATCH 3] All demoted/deleted modes — set the layout mode and let
            // the DEMOTED_REDIRECTS useEffect handle the redirect.
            default: {
              // If it's a known LayoutMode string, set it (useEffect will redirect).
              // Otherwise ignore.
              const knownModes: string[] = [
                'mission-control',
                'snowglobe',
                'snowglobe-chambers',
                'rules',
                'ectd-coauthor',
                'cmc',
                'document-vault',
                'clinical-trial',
                'templates',
                'sherpa',
                'analytics',
                'timeline',
                'audit',
                'enablement-center',
                'platform-admin',
                'biologics-dashboard',
                'ctd-onboarding',
                'client-intelligence',
                'collaboration-hub',
                'user-inbox',
                'client-branding',
                'training-center',
                'client-onboarding',
                'knowledge-base',
                'project-knowledge',
                'artifacts',
                'document-builder',
                'ana-platform-control',
                'author',
                'ind-workspace',
                'submission-workspace',
                'intelligence-hub',
                'command-center',
                'legal-center',
                'about-training',
                'ana-dashboard',
                'integrations',
                'agents',
                'tasks',
              ];
              if (knownModes.includes(id)) {
                setLayoutMode(id as LayoutMode);
              }
              break;
            }
          }
        }}
        userName={userName}
        userEmail={userEmail}
      />

      {/* Main area — no top bar, exactly like Claude.ai */}
      <GlobalOperatingShell
        layoutMode={layoutMode}
        activeProjectName={activeProject?.name}
        activeNavId={activeNavId}
        currentGlobalNodeLabel={currentGlobalNodeLabel}
        activeArtifactLabel={
          activeArtifactId
            ? `${activeArtifactId}${activeArtifactVersion ? ` · v${activeArtifactVersion}` : ''}`
            : undefined
        }
        onAction={handleHeaderAction}
      >
        {/* Content Area */}
        <div className="flex-1 flex min-w-0 min-h-0">
          {/* ── Embedded Module Host ── */}
          {embeddedModule === '510k' && urlProjectId && (
            <>
              {/* Module content area */}
              <div
                className={cn(
                  'flex-1 flex flex-col min-h-0 overflow-hidden',
                  moduleAssistantOpen && 'mr-0'
                )}
              >
                <ErrorBoundary>
                  <Suspense fallback={<ModuleLoadingFallback />}>
                    <EmbeddedCERV2Page
                      embedded={true}
                      projectId={urlProjectId}
                      onBackToProject={() => navigate(`/concept2cure/project/${urlProjectId}`)}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>

              {/* Assistant toggle button (fixed right edge) */}
              {!moduleAssistantOpen && (
                <button
                  onClick={() => setModuleAssistantOpen(true)}
                  className="flex-shrink-0 w-10 flex flex-col items-center justify-center gap-1 bg-stone-50 hover:bg-stone-100 border-l border-stone-200 transition-colors"
                  title="Open AI Assistant"
                  data-testid="module-assistant-toggle"
                >
                  <MessageSquare className="w-4 h-4 text-stone-500" />
                  <span
                    className="text-[10px] text-stone-400 writing-mode-vertical"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    Assistant
                  </span>
                </button>
              )}

              {/* Collapsible assistant drawer */}
              {moduleAssistantOpen && (
                <div
                  className="flex-shrink-0 w-[380px] flex flex-col border-l border-stone-200 bg-white"
                  data-testid="module-assistant-panel"
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100 bg-stone-50">
                    <span className="text-sm font-medium text-stone-700">AI Assistant</span>
                    <button
                      onClick={() => setModuleAssistantOpen(false)}
                      className="p-1 rounded hover:bg-stone-200 text-stone-400 hover:text-stone-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <ZenChat
                      projectId={activeProjectId || urlProjectId}
                      projectName={activeProject?.name}
                      submissionType={activeProject?.type || '510K'}
                      threadId={activeThreadId}
                      greeting={{ text: 'How can I help with your 510(k) submission?' }}
                      onNavigate={handleAnaPanelNavigate}
                      onNewProject={() => setNewProjectOpen(true)}
                      onThreadChange={handleThreadChange}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Embedded PMA Module Host ── */}
          {embeddedModule === 'pma' && urlProjectId && (
            <>
              <div
                className={cn(
                  'flex-1 flex flex-col min-h-0 overflow-hidden',
                  moduleAssistantOpen && 'mr-0'
                )}
              >
                <ErrorBoundary>
                  <Suspense fallback={<ModuleLoadingFallback />}>
                    <EmbeddedPMAWorkspace
                      embedded={true}
                      projectId={urlProjectId}
                      projectName={activeProject?.name}
                      onBackToProject={() => navigate(`/concept2cure/project/${urlProjectId}`)}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>

              {/* Assistant toggle for PMA */}
              {!moduleAssistantOpen && (
                <button
                  onClick={() => setModuleAssistantOpen(true)}
                  className="flex-shrink-0 w-10 flex flex-col items-center justify-center gap-1 bg-stone-50 hover:bg-stone-100 border-l border-stone-200 transition-colors"
                  title="Open AI Assistant"
                >
                  <MessageSquare className="w-4 h-4 text-stone-500" />
                  <span
                    className="text-[10px] text-stone-400 writing-mode-vertical"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    Assistant
                  </span>
                </button>
              )}

              {moduleAssistantOpen && (
                <div className="flex-shrink-0 w-[380px] flex flex-col border-l border-stone-200 bg-white">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100 bg-stone-50">
                    <span className="text-sm font-medium text-stone-700">AI Assistant</span>
                    <button
                      onClick={() => setModuleAssistantOpen(false)}
                      className="p-1 rounded hover:bg-stone-200 text-stone-400 hover:text-stone-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <ZenChat
                      projectId={activeProjectId || urlProjectId}
                      projectName={activeProject?.name}
                      submissionType="PMA"
                      threadId={activeThreadId}
                      greeting={{ text: 'How can I help with your PMA submission?' }}
                      onNavigate={handleAnaPanelNavigate}
                      onNewProject={() => setNewProjectOpen(true)}
                      onThreadChange={handleThreadChange}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Embedded CER Module Host ── */}
          {embeddedModule === 'cer' && urlProjectId && (
            <>
              <div
                className={cn(
                  'flex-1 flex flex-col min-h-0 overflow-hidden',
                  moduleAssistantOpen && 'mr-0'
                )}
              >
                <ErrorBoundary>
                  <Suspense fallback={<ModuleLoadingFallback />}>
                    <EmbeddedCERV2Page
                      embedded={true}
                      initialDocumentType="cerv2_cer"
                      projectId={urlProjectId}
                      onBackToProject={() => navigate(`/concept2cure/project/${urlProjectId}`)}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>

              {!moduleAssistantOpen && (
                <button
                  onClick={() => setModuleAssistantOpen(true)}
                  className="flex-shrink-0 w-10 flex flex-col items-center justify-center gap-1 bg-stone-50 hover:bg-stone-100 border-l border-stone-200 transition-colors"
                  title="Open AI Assistant"
                  data-testid="module-assistant-toggle-cer"
                >
                  <MessageSquare className="w-4 h-4 text-stone-500" />
                  <span
                    className="text-[10px] text-stone-400 writing-mode-vertical"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    Assistant
                  </span>
                </button>
              )}

              {moduleAssistantOpen && (
                <div
                  className="flex-shrink-0 w-[380px] flex flex-col border-l border-stone-200 bg-white"
                  data-testid="module-assistant-panel-cer"
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-stone-100 bg-stone-50">
                    <span className="text-sm font-medium text-stone-700">AI Assistant</span>
                    <button
                      onClick={() => setModuleAssistantOpen(false)}
                      className="p-1 rounded hover:bg-stone-200 text-stone-400 hover:text-stone-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <ZenChat
                      projectId={activeProjectId || urlProjectId}
                      projectName={activeProject?.name}
                      submissionType="CER"
                      threadId={activeThreadId}
                      greeting={{ text: 'How can I help with your Clinical Evaluation Report?' }}
                      onNavigate={handleAnaPanelNavigate}
                      onNewProject={() => setNewProjectOpen(true)}
                      onThreadChange={handleThreadChange}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* [BATCH 3] Removed renderers: sherpa, analytics, timeline, audit,
              mission-control, snowglobe, snowglobe-chambers.
              These modes now redirect via DEMOTED_REDIRECTS useEffect. */}

          {/* [BATCH 3] Removed: timeline, audit, mission-control, snowglobe, snowglobe-chambers */}
          {/* [BATCH 1] Removed: about-training, ind-workspace, medtech-dashboard */}

          {/* ── Global destination: Apps launcher ── */}
          {!embeddedModule && layoutMode === 'apps' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-apps"
            >
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  <AppsPage
                    submissionType={activeProject?.type}
                    onNavigate={id => {
                      switch (id) {
                        case 'deep-research':
                          setLayoutMode('deep-research');
                          break;
                        case 'precedent-intelligence':
                          setLayoutMode('precedent-intelligence');
                          break;
                        case 'safety-narrative':
                          setLayoutMode('safety-narrative');
                          break;
                        case 'biostatistics':
                          setLayoutMode('regulatory-workspace');
                          setActiveToolPanel('ana-biostats');
                          break;
                        case '510k-workspace':
                          if (activeProjectId)
                            navigate(`/concept2cure/project/${activeProjectId}/510k`);
                          else setLayoutMode('projects');
                          break;
                        case 'pma-workspace':
                          if (activeProjectId)
                            navigate(`/concept2cure/project/${activeProjectId}/pma`);
                          else setLayoutMode('projects');
                          break;
                        case 'cer-generator':
                          if (activeProjectId)
                            navigate(`/concept2cure/project/${activeProjectId}/cer`);
                          else setLayoutMode('projects');
                          break;
                        default:
                          // All apps in the catalog have explicit routes above.
                          // If somehow an unknown app ID arrives, go to projects.
                          setLayoutMode('projects');
                          break;
                      }
                    }}
                    activeProjectId={activeProjectId}
                    activeProjectName={activeProject?.name}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Global destination: Artifacts browser ── */}
          {!embeddedModule && layoutMode === 'artifacts-center' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-artifacts-center"
            >
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  <ArtifactsPage
                    onOpenArtifact={(projectId, artifactId) => {
                      setActiveProjectId(projectId);
                      setOpenArtifactId(artifactId);
                      setRiViewMode('editor');
                      setLayoutMode('regulatory-workspace');
                    }}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Global destination: Setup ── */}
          {!embeddedModule && layoutMode === 'setup' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-setup"
            >
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  <SetupPage
                    onOpenSettings={section => {
                      if (section) setSettingsSection(section);
                      setSettingsOpen(true);
                    }}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Project tab: Vault ── */}
          {!embeddedModule && layoutMode === 'vault' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-vault"
            >
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  <VaultPage
                    projectId={activeProjectId}
                    projectName={activeProject?.name}
                    onOpenDocument={docId => {
                      setOpenArtifactId(docId);
                      setRiViewMode('editor');
                      setLayoutMode('regulatory-workspace');
                    }}
                    onDraftFromSource={(sourceTitle, sourceId) => {
                      setPendingEditorContent({
                        title: `Draft from: ${sourceTitle}`,
                        content: '',
                        ctdSection: undefined,
                      });
                      setRiViewMode('editor');
                      setLayoutMode('regulatory-workspace');
                    }}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* [CONSOLIDATED] review-readiness now redirects to 'review' via DEMOTED_REDIRECTS */}

          {/* ── Biostatistics Platform — power, endpoints, design ── */}
          {!embeddedModule && layoutMode === 'biostatistics' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-biostatistics">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-stone-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Home</span>
                </button>
                <span className="text-stone-200">&middot;</span>
                <FlaskConical className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-medium text-stone-800">Biostatistics</span>
                {activeProject && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 font-medium">
                    {activeProject.name}
                  </span>
                )}
              </div>
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <LoadingState size="sm" message="" />
                    </div>
                  }
                >
                  <BiostatPlatformDashboard />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Legal Center — IP, contracts, regulatory law ── */}

          {/* ── Intelligent Report Engine — immutable records, atom provenance, quasi-indemnification ── */}
          {!embeddedModule && layoutMode === 'report-engine' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-report-engine">
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <LoadingState size="sm" message="" />
                  </div>
                }
              >
                <IntelligentReportGenerator />
              </Suspense>
            </div>
          )}

          {/* ── Safety Narrative — ICH E3 §12 compliant narrative generation ── */}
          {!embeddedModule && layoutMode === 'safety-narrative' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-safety-narrative">
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <LoadingState size="sm" message="" />
                  </div>
                }
              >
                <SafetyNarrativePage projectId={activeProjectId ? Number(activeProjectId) : null} />
              </Suspense>
            </div>
          )}

          {/* Precedent Intelligence Dashboard (standalone) */}
          {layoutMode === 'precedent-intelligence' && (
            <div
              className="flex-1 flex flex-col min-h-0"
              data-testid="workspace-precedent-intelligence"
            >
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <LoadingState size="sm" message="" />
                  </div>
                }
              >
                <PrecedentIntelligenceDashboard
                  onNavigateToEditor={() => setLayoutMode('regulatory-workspace')}
                />
              </Suspense>
            </div>
          )}

          {/* Redirect deprecated routes to unified workspace */}
          {['workspace', 'medtech-dashboard', 'dossier'].includes(layoutMode) && (
            <RedirectToWorkspace onRedirect={() => setLayoutMode('regulatory-workspace')} />
          )}

          {/* ── Project Workspace (3-pane: tree | content | inspector) ───── */}
          {!embeddedModule &&
            layoutMode === 'regulatory-workspace' &&
            (riViewMode === 'intelligence' ? (
              <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-ri-copilot">
                {/* Intelligence mode header */}
                <div className="flex items-center gap-2 px-3 h-9 border-b border-stone-100 bg-white flex-shrink-0">
                  <button
                    onClick={() => setLayoutMode('projects')}
                    className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Home</span>
                  </button>
                  <span className="text-stone-200">·</span>
                  <Brain className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-stone-800">Intelligence</span>
                  {activeProject && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 font-medium">
                      {activeProject.name}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <div className="flex items-center rounded-md border border-stone-200 overflow-hidden">
                      <button
                        data-testid="view-toggle-intelligence"
                        onClick={() => setRiViewMode('intelligence')}
                        className={cn(
                          'px-2 py-0.5 text-[11px] font-medium transition-colors',
                          'bg-blue-100 text-stone-700'
                        )}
                      >
                        Intelligence
                      </button>
                      <button
                        data-testid="view-toggle-editor"
                        onClick={() => setRiViewMode('editor')}
                        className="px-2 py-0.5 text-[11px] font-medium text-stone-500 hover:bg-stone-50 transition-colors"
                      >
                        Documents
                      </button>
                    </div>
                  </div>
                </div>
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="flex-1 flex items-center justify-center">
                        <LoadingState size="sm" message="" />
                      </div>
                    }
                  >
                    <RICopilotHome
                      projectId={activeProjectId}
                      projectName={activeProject?.name}
                      submissionType={activeProject?.type}
                      indication={activeProject?.description}
                      onAnalyzeEvidence={() => setRiViewMode('editor')}
                      onDraftFromPrecedent={(content, title, ctdSection) => {
                        setPendingEditorContent({ content, title, ctdSection });
                        setRiViewMode('editor');
                      }}
                      onOpenEditor={() => setRiViewMode('editor')}
                      onSelectProject={() => setProjectSwitcherOpen(true)}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            ) : (
              <ProjectWorkspaceShell
                projectId={activeProjectId}
                projectName={activeProject?.name}
                projectType={activeProject?.type}
                submissionType={activeProject?.type}
                industryMode={industryMode}
                onBackToProjects={() => setLayoutMode('projects')}
                onSelectProject={() => setProjectSwitcherOpen(true)}
                onSwitchToIntelligence={() => setRiViewMode('intelligence')}
                initialContent={pendingEditorContent?.content}
                initialTitle={pendingEditorContent?.title}
                initialCtdSection={pendingEditorContent?.ctdSection}
                onInitialContentConsumed={() => setPendingEditorContent(null)}
                openArtifactId={openArtifactId}
                onOpenArtifactConsumed={() => setOpenArtifactId(undefined)}
                onActiveDocumentChange={doc => {
                  if (doc) {
                    setActiveArtifactId(doc.id);
                    setActiveArtifactVersion(doc.version != null ? String(doc.version) : undefined);
                    setActiveArtifactStatus(doc.status);
                    if (doc.ctdSection) setActiveSectionCode(doc.ctdSection);
                  } else {
                    setActiveArtifactId(undefined);
                    setActiveArtifactVersion(undefined);
                    setActiveArtifactStatus(undefined);
                  }
                }}
                onNavigate={mode => {
                  if (mode === 'haq') {
                    setLayoutMode('documents');
                    setToolsSubView('haq');
                    return;
                  }
                  setLayoutMode(mode as LayoutMode);
                }}
              />
            ))}

          {/* ── Project Home: AnA-first with light context strip ── */}
          {/* Strip is flex-shrink-0; AnA (rendered separately below) takes flex-1 */}
          {!embeddedModule && layoutMode === 'project-home' && activeProject && (
            <div className="flex-shrink-0" data-testid="workspace-overview">
              <ProjectHomeDashboard
                project={{
                  id: Number(activeProjectId) || 0,
                  name: activeProject.name,
                  type: activeProject.type,
                  description: activeProject.description ?? null,
                  sponsor: ((activeProject as Record<string, unknown>).sponsor as string) || null,
                  product: ((activeProject as Record<string, unknown>).product as string) || null,
                  region: ((activeProject as Record<string, unknown>).region as string) || null,
                }}
                onNavigate={mode => {
                  const mapped = SIDEBAR_NAV_TO_LAYOUT[mode];
                  if (mapped) {
                    setLayoutMode(mapped);
                  } else {
                    console.warn(`[ProjectHomeDashboard] Unknown nav mode: ${mode}`);
                  }
                }}
                onOpenConfig={() => setEditProjectOpen(true)}
                onOpenSearch={() => setCommandPaletteOpen(true)}
                onSuggestedPrompt={prompt => {
                  setExternalChatMessage({ text: prompt, ts: Date.now() });
                }}
                onOpenArtifact={artifactId => {
                  setOpenArtifactId(artifactId);
                  setRiViewMode('editor');
                  setLayoutMode('regulatory-workspace');
                }}
              />
            </div>
          )}

          {/* ── Unified Workflow: Dossier Map ────────────────────────────── */}
          {!embeddedModule && layoutMode === 'dossier-map' && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <DossierMap
                projectId={activeProjectId}
                projectName={activeProject?.name}
                projectType={activeProject?.type}
                onSectionClick={sectionCode => {
                  // Smart routing: if artifact exists, go straight to editor
                  const moduleNum = sectionCode.charAt(0);
                  const match = projectArtifacts.find(
                    (a: any) =>
                      a.ctdSection === sectionCode ||
                      a.ctdSection === `csr-${sectionCode}` ||
                      a.ctdSection === `m${moduleNum}-${sectionCode}`
                  );
                  if (match) {
                    setOpenArtifactId(match.id);
                    setRiViewMode('editor');
                    setLayoutMode('regulatory-workspace');
                  } else {
                    // Create draft directly and open in editor
                    setPendingEditorContent({
                      title: sectionCode,
                      content: '',
                      ctdSection: sectionCode,
                    });
                    setRiViewMode('editor');
                    setLayoutMode('regulatory-workspace');
                  }
                }}
                onCreateForSection={(sectionCode, sectionTitle) => {
                  setPendingEditorContent({
                    title: sectionTitle,
                    content: '',
                    ctdSection: sectionCode,
                  });
                  setRiViewMode('editor');
                  setLayoutMode('regulatory-workspace');
                }}
                onNavigateSubmit={() => setLayoutMode('submissions')}
                onBack={() => setLayoutMode(activeProjectId ? 'project-home' : 'projects')}
              />
            </Suspense>
          )}

          {/* ── Unified Workflow: Tools (curated workbench — builder is one tool inside) */}
          {!embeddedModule && layoutMode === 'documents' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-tools">
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  {toolsSubView === 'builder' ? (
                    <FullDocumentBuilder
                      onOpenInEditor={(content, title, ctdSection) => {
                        setPendingEditorContent({ content, title, ctdSection });
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                        setToolsSubView('landing');
                      }}
                    />
                  ) : toolsSubView === 'haq' ? (
                    <HAQManagerView
                      projectId={activeProjectId}
                      projectName={activeProject?.name}
                      onOpenInEditor={(content, title) => {
                        setPendingEditorContent({ content, title });
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                        setToolsSubView('landing');
                      }}
                    />
                  ) : (
                    <ToolsLanding
                      projectName={activeProject?.name}
                      recentArtifacts={workspaceSummary?.recent?.documents?.slice(0, 3)?.map(d => ({
                        id: d.id,
                        title: d.name,
                        updatedAt: d.uploadedAt,
                      }))}
                      onResumeArtifact={artifactId => {
                        setOpenArtifactId(artifactId);
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                      }}
                      onAction={toolId => {
                        switch (toolId) {
                          case 'recent':
                            // Open workspace in document studio mode — shows recent documents list
                            setRiViewMode('editor');
                            setLayoutMode('regulatory-workspace');
                            break;
                          case 'create':
                            // Create a new blank document — lands in EditorPanel with new artifact
                            setPendingEditorContent({ content: '', title: 'Untitled Document' });
                            setRiViewMode('editor');
                            setLayoutMode('regulatory-workspace');
                            break;
                          case 'builder':
                            // Open Document Builder wizard (multi-step CSR/CTD generation)
                            setToolsSubView('builder');
                            break;
                          case 'templates':
                            // Open workspace — user selects templates from left rail
                            setRiViewMode('editor');
                            setLayoutMode('regulatory-workspace');
                            break;
                          case 'dossier':
                            setLayoutMode('dossier-map');
                            break;
                          case 'vault':
                            setLayoutMode('vault');
                            break;
                          case 'review':
                            setLayoutMode('review');
                            break;
                          case 'submit':
                            setLayoutMode('submissions');
                            break;
                          case 'haq':
                            setToolsSubView('haq');
                            break;
                        }
                      }}
                    />
                  )}
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* [CONSOLIDATED] vault-workspace now redirects to 'vault' via DEMOTED_REDIRECTS */}

          {/* ── Unified Workflow: Review (governance & approvals) ─────────── */}
          {!embeddedModule && layoutMode === 'review' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-review">
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  <ReviewReadiness
                    projectId={activeProjectId}
                    onClose={() => setLayoutMode(activeProjectId ? 'project-home' : 'projects')}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Unified Workflow: Submissions (readiness, builder & export) ── */}
          {!embeddedModule && layoutMode === 'submissions' && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <div className="flex-1 flex flex-col min-h-0">
                {/* Submission sub-nav tabs */}
                <div className="flex items-center gap-1 border-b border-stone-200 bg-white px-4">
                  {(['readiness', 'builder'] as const).map(tab => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setSubmissionTab(tab)}
                      className={cn(
                        'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                        submissionTab === tab
                          ? 'border-stone-900 text-stone-900'
                          : 'border-transparent text-stone-500 hover:text-stone-700'
                      )}
                    >
                      {tab === 'readiness' ? 'Readiness' : 'Package Manifest'}
                    </button>
                  ))}
                </div>
                <div className="border-b border-amber-200 bg-amber-50/60 px-4 py-2 text-xs text-amber-800">
                  Beta note: package generation currently exports a submission manifest JSON for internal review and handoff.
                </div>

                {submissionTab === 'readiness' ? (
                  <SubmissionReadinessView
                    projectId={activeProjectId}
                    projectName={activeProject?.name}
                    projectType={activeProject?.type}
                    onSectionClick={(sectionCode, sectionTitle) => {
                      const moduleNum = sectionCode.charAt(0);
                      const match = projectArtifacts.find(
                        (a: any) =>
                          a.ctdSection === sectionCode ||
                          a.ctdSection === `csr-${sectionCode}` ||
                          a.ctdSection === `m${moduleNum}-${sectionCode}`
                      );
                      if (match) {
                        setOpenArtifactId(match.id);
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                      } else {
                        setPendingEditorContent({
                          title: sectionTitle || `Section ${sectionCode}`,
                          content: '',
                          ctdSection: sectionCode,
                        });
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                      }
                    }}
                    onBack={() => setLayoutMode(activeProjectId ? 'project-home' : 'projects')}
                    onExport={async () => {
                      if (!activeProjectId) return;
                      try {
                        const res = await apiRequest(
                          'POST',
                          `/api/concept2cure/projects/${activeProjectId}/submission-package`
                        );
                        const payload = await res.json();
                        const manifest = payload?.data ?? payload;
                        if (manifest) {
                          const blob = new Blob([JSON.stringify(manifest, null, 2)], {
                            type: 'application/json',
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${
                            manifest.projectName || 'submission'
                          }-package-manifest.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }
                      } catch (err) {
                        console.error('[Export] Package generation failed:', err);
                      }
                    }}
                  />
                ) : (
                  <Suspense fallback={<ModuleLoadingFallback />}>
                    <SubmissionBuilderView
                      projectId={String(activeProjectId || '')}
                      projectName={activeProject?.name}
                      submissionType={(activeProject?.type as 'IND' | 'NDA' | 'BLA') || 'IND'}
                      artifacts={projectArtifacts.map((a: any) => ({
                        id: String(a.id),
                        title: a.title || 'Untitled',
                        ctdSection: a.ctdSection || a.ctd_section,
                        status: a.status || 'draft',
                        version: a.version || 1,
                      }))}
                      onOpenArtifact={artifactId => {
                        setOpenArtifactId(artifactId);
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                      }}
                      onCreateArtifact={(sectionId, sectionLabel) => {
                        setPendingEditorContent({
                          title: sectionLabel,
                          content: '',
                          ctdSection: sectionId,
                        });
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                      }}
                      onGeneratePackage={async () => {
                        if (!activeProjectId) return;
                        try {
                          const res = await apiRequest(
                            'POST',
                            `/api/concept2cure/projects/${activeProjectId}/submission-package`
                          );
                          const manifest = await res.json();
                          const blob = new Blob([JSON.stringify(manifest, null, 2)], {
                            type: 'application/json',
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `submission-package-manifest-${activeProjectId}-${Date.now()}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch (err) {
                          console.error('[SubmissionBuilder] Package generation failed:', err);
                        }
                      }}
                      onClose={() => setSubmissionTab('readiness')}
                    />
                  </Suspense>
                )}
              </div>
            </Suspense>
          )}

          {/* ── Unified Workflow: Task Board (full Kanban view) ──────────── */}
          {!embeddedModule && layoutMode === 'task-board' && activeProjectId && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-stone-50/50">
                <div className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur-sm px-6 py-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setLayoutMode('project-home')}
                      className="text-stone-500 hover:text-stone-700"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                      <h1 className="text-lg font-semibold text-stone-900">Tasks & Milestones</h1>
                      <p className="text-xs text-stone-500">{activeProject?.name || 'Project'}</p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 min-h-0 p-6">
                  <ProjectTaskBoardView
                    projectId={activeProjectId}
                    projectType={activeProject?.type}
                  />
                </div>
              </div>
            </Suspense>
          )}

          {/* ── Unified Workflow: CSR Authoring (ICH E3) ──────────────── */}
          {!embeddedModule && layoutMode === 'csr-workflow' && activeProjectId && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <CSRWorkflowView
                projectId={activeProjectId}
                projectName={activeProject?.name}
                onSectionClick={sectionCode => {
                  // Smart routing: if artifact exists for this section, go straight to editor
                  const moduleNum = sectionCode.charAt(0);
                  const match = projectArtifacts.find(
                    (a: any) =>
                      a.ctdSection === sectionCode ||
                      a.ctdSection === `csr-${sectionCode}` ||
                      a.ctdSection === `m${moduleNum}-${sectionCode}`
                  );
                  if (match) {
                    setOpenArtifactId(match.id);
                    setRiViewMode('editor');
                    setLayoutMode('regulatory-workspace');
                  } else {
                    // Create draft directly and open in editor
                    setPendingEditorContent({
                      title: sectionCode,
                      content: '',
                      ctdSection: sectionCode,
                    });
                    setRiViewMode('editor');
                    setLayoutMode('regulatory-workspace');
                  }
                }}
                onAIDraft={async (sectionCode, sectionTitle) => {
                  // Create a new draft and open in editor
                  setPendingEditorContent({
                    title: sectionTitle,
                    content: '',
                    ctdSection: sectionCode,
                  });
                  setRiViewMode('editor');
                  setLayoutMode('regulatory-workspace');
                }}
                onBack={() => setLayoutMode(activeProjectId ? 'project-home' : 'projects')}
              />
            </Suspense>
          )}

          {/* ── Unified Workflow: IND Checklist (21 CFR 312.23) ────────── */}
          {!embeddedModule && layoutMode === 'ind-checklist' && activeProjectId && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <INDChecklistView
                projectId={activeProjectId}
                projectName={activeProject?.name}
                onSectionClick={sectionCode => {
                  // Smart routing: if artifact exists for this section, go straight to editor
                  const moduleNum = sectionCode.charAt(0);
                  const match = projectArtifacts.find(
                    (a: any) =>
                      a.ctdSection === sectionCode ||
                      a.ctdSection === `csr-${sectionCode}` ||
                      a.ctdSection === `m${moduleNum}-${sectionCode}`
                  );
                  if (match) {
                    setOpenArtifactId(match.id);
                    setRiViewMode('editor');
                    setLayoutMode('regulatory-workspace');
                  } else {
                    // Create draft directly and open in editor
                    setPendingEditorContent({
                      title: sectionCode,
                      content: '',
                      ctdSection: sectionCode,
                    });
                    setRiViewMode('editor');
                    setLayoutMode('regulatory-workspace');
                  }
                }}
                onAIDraft={async (sectionCode, sectionTitle) => {
                  // Create a new draft and open in editor
                  setPendingEditorContent({
                    title: sectionTitle,
                    content: '',
                    ctdSection: sectionCode,
                  });
                  setRiViewMode('editor');
                  setLayoutMode('regulatory-workspace');
                }}
                onBack={() => setLayoutMode(activeProjectId ? 'project-home' : 'projects')}
              />
            </Suspense>
          )}

          {/* ── Unified Workflow: Template Library ──────────────────────── */}
          {!embeddedModule && (layoutMode === 'template-library' || layoutMode === 'templates') && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-stone-50/50">
                <div className="sticky top-0 z-10 border-b border-stone-200 bg-white/95 backdrop-blur-sm px-6 py-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setLayoutMode(activeProjectId ? 'project-home' : 'projects')}
                      className="text-stone-500 hover:text-stone-700"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div>
                      <h1 className="text-lg font-semibold text-stone-900">Template Library</h1>
                      <p className="text-xs text-stone-500">Regulatory document templates</p>
                    </div>
                  </div>
                </div>
                <TemplateLibraryView
                  onSelectTemplate={template => {
                    const sectionCode = template.ctdSection;
                    if (sectionCode) {
                      setActiveSectionCode(sectionCode);
                      const moduleNum = sectionCode.charAt(0);
                      const match = projectArtifacts.find(
                        (a: any) =>
                          a.ctdSection === sectionCode ||
                          a.ctdSection === `csr-${sectionCode}` ||
                          a.ctdSection === `m${moduleNum}-${sectionCode}`
                      );
                      if (match) {
                        setOpenArtifactId(match.id);
                      } else {
                        setPendingEditorContent({
                          title: template.name,
                          content: '',
                          ctdSection: sectionCode,
                        });
                      }
                    } else {
                      setPendingEditorContent({
                        title: template.name,
                        content: '',
                      });
                    }
                    setRiViewMode('editor');
                    setLayoutMode('regulatory-workspace');
                  }}
                  onClose={() => setLayoutMode(activeProjectId ? 'project-home' : 'projects')}
                />
              </div>
            </Suspense>
          )}

          {/* ── Unified Workflow: Section Workspace ──────────────────────── */}
          {!embeddedModule && layoutMode === 'section-workspace' && (
            <Suspense fallback={<ModuleLoadingFallback />}>
              <SectionWorkspace
                section={(() => {
                  // Resolve section metadata from real project artifacts + CTD hierarchy
                  const code = activeSectionCode || '2.5';

                  // Module name from the section code prefix
                  const moduleNum = code.charAt(0);
                  const MODULE_NAMES: Record<string, string> = {
                    '1': 'Module 1 — Administrative',
                    '2': 'Module 2 — CTD Summaries',
                    '3': 'Module 3 — Quality',
                    '4': 'Module 4 — Nonclinical',
                    '5': 'Module 5 — Clinical',
                  };

                  // Find matching artifact by CTD section
                  const matchingArtifact = projectArtifacts.find(
                    (a: any) =>
                      a.ctdSection === code ||
                      a.ctdSection === `csr-${code}` ||
                      a.ctdSection === `m${moduleNum}-${code}`
                  );

                  // Derive status from real artifact if found
                  let status:
                    | 'not-started'
                    | 'drafting'
                    | 'in-review'
                    | 'approved'
                    | 'blocked'
                    | 'locked' = 'not-started';
                  if (matchingArtifact) {
                    const s = matchingArtifact.status;
                    if (s === 'approved') status = 'approved';
                    else if (s === 'locked' || s === 'published') status = 'locked';
                    else if (s === 'review' || s === 'in_review') status = 'in-review';
                    else if (s === 'blocked') status = 'blocked';
                    else status = 'drafting';
                  }

                  // Title: prefer artifact title, fall back to section code
                  const title = matchingArtifact?.title || `Section ${code}`;

                  return {
                    code,
                    title,
                    status,
                    module: MODULE_NAMES[moduleNum] || 'Unknown Module',
                    version: matchingArtifact?.version,
                    lastEditedAt: matchingArtifact?.updatedAt,
                  };
                })()}
                projectName={activeProject?.name}
                projectId={activeProjectId}
                readiness={sectionReadiness}
                contradictions={sectionContradictions}
                onContextChange={handleAuthoringContextChange}
                onBack={() => setLayoutMode('dossier-map')}
                onOpenInEditor={(() => {
                  // If there's a matching artifact, provide a way to open it in the full editor
                  const code = activeSectionCode || '2.5';
                  const moduleNum = code.charAt(0);
                  const matchingArtifact = projectArtifacts.find(
                    (a: any) =>
                      a.ctdSection === code ||
                      a.ctdSection === `csr-${code}` ||
                      a.ctdSection === `m${moduleNum}-${code}`
                  );
                  if (matchingArtifact) {
                    return () => {
                      setOpenArtifactId(matchingArtifact.id);
                      setRiViewMode('editor');
                      setLayoutMode('regulatory-workspace');
                    };
                  }
                  return undefined;
                })()}
                onCreateDraft={
                  activeProjectId
                    ? () => {
                        const code = activeSectionCode || '2.5';
                        const moduleNum = code.charAt(0);
                        const MODULE_NAMES: Record<string, string> = {
                          '1': 'Administrative',
                          '2': 'CTD Summaries',
                          '3': 'Quality',
                          '4': 'Nonclinical',
                          '5': 'Clinical',
                        };
                        setPendingEditorContent({
                          title: `Section ${code} — ${MODULE_NAMES[moduleNum] || 'Document'}`,
                          content: '',
                          ctdSection: code,
                        });
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                      }
                    : undefined
                }
              />
            </Suspense>
          )}

          {/* ── Projects Index: AnA is the full-screen interface (ChatGPT/Claude style) ── */}
          {/* PlatformHome removed — AnA handles everything via chat */}

          {/* ── Project Workspace — Claude.ai-style project view ──────── */}
          {!embeddedModule && layoutMode === 'workspace' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* ── Project Header — Claude.ai style: breadcrumb + title + star ── */}
              {/* Claude.ai-style project header bar */}
              <ProjectHeaderBar
                projectName={activeProject?.name || 'Untitled Project'}
                submissionType={activeProject?.type || 'IND'}
                projectColor={activeProject?.color}
                productName={activeProject?.product}
                targetAgency={activeProject?.targetAgency}
                readinessScore={projectReadinessScore}
                onOpenConfig={() => setEditProjectOpen(true)}
                onSwitchProject={() => setProjectSwitcherOpen(true)}
              />

              {/* ── Workspace body: AnA chat + right panel ───────────── */}
              <div className="flex-1 flex min-h-0">
                {/* Center: AnA (the ONE chat — Claude.ai style) */}
                <AnaPersistentPanel
                  mode="full"
                  authoringContext={authoringContext}
                  navContext={activeNavId}
                  contextProfile={{
                    productType: activeProject?.type,
                    userRole: userRole,
                    screenName: 'regulatory-workspace',
                    activeProject: activeProject?.name,
                    projectId: activeProjectId,
                  }}
                  projectIntelligence={projectIntelligenceStats}
                  greeting={
                    platformGreeting?.text ||
                    `How can I help with ${activeProject?.name || 'your project'}?`
                  }
                  suggestedActions={workspaceSuggestedActions}
                  onActionRun={handleActionRun}
                  onNavigate={handleAnaPanelNavigate}
                  onDraftInsert={handleDraftInsert}
                  onNavigateToSection={handleNavigateToSection}
                  onOpenArtifact={handleOpenArtifact}
                  onRequestPromotion={handleRequestPromotion}
                  onRefreshIntelligence={authoringIntelligence.refetch}
                  initialMessage={
                    pendingDraftSection
                      ? `Draft CTD section ${pendingDraftSection.code}: ${pendingDraftSection.title}. Generate a compliant first draft following ICH M4 guidelines and 21 CFR 312.23(a) requirements.`
                      : null
                  }
                />

                {/* Right sidebar: Claude.ai-style project knowledge */}
                {/* Desktop: static panel */}
                <div className="w-72 xl:w-80 border-l border-stone-150 bg-white flex-shrink-0 hidden lg:flex">
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center py-12 w-full">
                        <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                      </div>
                    }
                  >
                    <ProjectKnowledgePanel projectId={activeProjectId ?? null} className="w-full" />
                  </Suspense>
                </div>
                {/* Mobile/Tablet: floating toggle + slide-over drawer */}
                {workspacePanelOpen && (
                  <>
                    <div
                      className="fixed inset-0 bg-black/30 z-40 lg:hidden"
                      onClick={() => setWorkspacePanelOpen(false)}
                    />
                    <div className="fixed right-0 top-0 bottom-0 w-80 bg-white border-l border-stone-200 shadow z-50 lg:hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
                        <span className="text-sm font-medium text-stone-700">Project Context</span>
                        <button
                          onClick={() => setWorkspacePanelOpen(false)}
                          className="p-1 hover:bg-stone-100 rounded"
                        >
                          <X className="w-4 h-4 text-stone-400" />
                        </button>
                      </div>
                      <Suspense
                        fallback={
                          <div className="flex items-center justify-center py-12 w-full">
                            <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                          </div>
                        }
                      >
                        <ProjectKnowledgePanel
                          projectId={activeProjectId ?? null}
                          className="w-full"
                        />
                      </Suspense>
                    </div>
                  </>
                )}
                {/* Mobile toggle button */}
                <button
                  onClick={() => setWorkspacePanelOpen(true)}
                  className="fixed right-4 bottom-4 z-30 lg:hidden w-10 h-10 bg-stone-900 text-white rounded-full shadow-sm flex items-center justify-center hover:bg-stone-800 transition-colors"
                  title="Project context"
                >
                  <FileText className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          {!embeddedModule && layoutMode === 'editor' && (
            <div className="flex-1 flex min-w-0 min-h-0" data-testid="workspace-editor">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center">
                      <LoadingState size="sm" message="" />
                    </div>
                  }
                >
                  <EditorPanel
                    projectId={activeProjectId}
                    submissionType={activeProject?.type}
                    initialContent={pendingEditorContent?.content}
                    initialTitle={pendingEditorContent?.title}
                    initialCtdSection={pendingEditorContent?.ctdSection}
                    onInitialContentConsumed={() => setPendingEditorContent(null)}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}
          {/* assistant/ctd mode → redirect to workspace (ONE chat via AnA) */}
          {!embeddedModule && (layoutMode === 'assistant' || layoutMode === 'ctd') && (
            <RedirectToWorkspace
              onRedirect={() =>
                setLayoutMode(activeProjectId ? 'regulatory-workspace' : 'projects')
              }
            />
          )}
        </div>

        {/* ── Project Cards Grid — Simplified entry ── */}
        {layoutMode === 'projects' &&
          !embeddedModule &&
          (() => {
            const sortedProjects = projects
              .filter(p => !p.archived)
              .sort((a, b) => {
                if (a.starred && !b.starred) return -1;
                if (!a.starred && b.starred) return 1;
                return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
              });
            const normalizedQuery = projectsSearchQuery.trim().toLowerCase();
            const filteredProjects = normalizedQuery
              ? sortedProjects.filter(project =>
                  [
                    project.name,
                    project.description,
                    project.sponsor,
                    project.product,
                    project.targetAgency,
                    project.region,
                    project.type,
                  ]
                    .filter(Boolean)
                    .some(value => String(value).toLowerCase().includes(normalizedQuery))
                )
              : sortedProjects;
            const continueProject = filteredProjects[0];
            const remainingProjects = filteredProjects.slice(1, 16);
            const recentThresholdMs = 14 * 24 * 60 * 60 * 1000;
            const SUBMISSION_BADGE_MINI: Record<
              string,
              { label: string; color: string; bg: string }
            > = {
              '510K': { label: '510(k)', color: 'text-stone-700', bg: 'bg-blue-50' },
              IND: { label: 'IND', color: 'text-purple-700', bg: 'bg-purple-50' },
              NDA: { label: 'NDA', color: 'text-green-700', bg: 'bg-green-50' },
              BLA: { label: 'BLA', color: 'text-orange-700', bg: 'bg-orange-50' },
              PMA: { label: 'PMA', color: 'text-red-700', bg: 'bg-red-50' },
              MAA: { label: 'MAA', color: 'text-pink-700', bg: 'bg-pink-50' },
              DE_NOVO: { label: 'De Novo', color: 'text-amber-700', bg: 'bg-amber-50' },
              EUA: { label: 'EUA', color: 'text-cyan-700', bg: 'bg-cyan-50' },
            };
            const fallbackBadge = { label: 'Project', color: 'text-stone-600', bg: 'bg-stone-50' };
            const isPinned = (project: (typeof filteredProjects)[number]) =>
              Boolean(project.starred || project.pinned);
            const updatedMs = (project: (typeof filteredProjects)[number]) => {
              const ms = new Date(project.lastUpdated).getTime();
              return Number.isFinite(ms) ? ms : 0;
            };
            const pinnedProjects = remainingProjects.filter(isPinned);
            const recentProjects = remainingProjects.filter(
              project => !isPinned(project) && Date.now() - updatedMs(project) <= recentThresholdMs
            );
            const generalProjects = remainingProjects.filter(
              project => !isPinned(project) && Date.now() - updatedMs(project) > recentThresholdMs
            );
            const relTime = (d: Date | string) => {
              const parsed = new Date(d);
              if (isNaN(parsed.getTime())) return 'Recently';
              const ms = Date.now() - parsed.getTime();
              if (ms < 0) return 'Just now';
              const min = Math.floor(ms / 60000);
              if (min < 1) return 'Just now';
              if (min < 60) return `${min}m ago`;
              const hr = Math.floor(min / 60);
              if (hr < 24) return `${hr}h ago`;
              const day = Math.floor(hr / 24);
              if (day < 30) return `${day}d ago`;
              try {
                return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              } catch {
                return 'Recently';
              }
            };
            const openProjectHome = (projectId: string) => {
              setActiveProjectId(projectId);
              setLayoutMode('project-home');
            };
            const renderProjectSection = (
              title: string,
              sectionProjects: typeof remainingProjects
            ) => {
              if (sectionProjects.length === 0) return null;
              return (
                <section className="mt-6 first:mt-0">
                  <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider mb-3">
                    {title}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {sectionProjects.map(project => {
                      const badge = SUBMISSION_BADGE_MINI[project.type] || fallbackBadge;
                      const metadata = [project.product, project.targetAgency, project.region]
                        .filter(Boolean)
                        .slice(0, 2)
                        .join(' · ');
                      return (
                        <Button
                          key={project.id}
                          type="button"
                          variant="ghost"
                          onClick={() => openProjectHome(project.id)}
                          className={cn(
                            'h-auto w-full group text-left rounded-xl border overflow-hidden transition-all duration-150 p-0',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40',
                            activeProjectId === project.id
                              ? 'border-stone-300 bg-stone-50/80 ring-1 ring-stone-200'
                              : 'border-stone-200 hover:border-stone-300 hover:shadow-sm bg-white'
                          )}
                        >
                          <div className="p-4 w-full">
                            <div className="flex items-center gap-2 mb-1">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: getProjectAccentColor(
                                    project.color,
                                    project.type
                                  ),
                                }}
                              />
                              <h3 className="text-[14px] font-semibold text-stone-900 truncate group-hover:text-stone-700">
                                {project.name}
                              </h3>
                              {project.starred && (
                                <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />
                              )}
                            </div>
                            {metadata && (
                              <p className="text-[11px] text-stone-500 truncate mb-1.5">{metadata}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-stone-400">
                              <span
                                className={cn(
                                  'font-medium px-1.5 py-0.5 rounded',
                                  badge.bg,
                                  badge.color
                                )}
                              >
                                {badge.label}
                              </span>
                              <span className="ml-auto tabular-nums">{relTime(project.lastUpdated)}</span>
                            </div>
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                </section>
              );
            };

            return (
              <div className="px-6 sm:px-8 pt-8 pb-4 max-w-3xl mx-auto w-full flex-shrink-0">
                {/* Header — quiet foyer */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
                  <h2 className="text-lg font-semibold text-stone-800">Projects</h2>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-72">
                      <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <Input
                        value={projectsSearchQuery}
                        onChange={e => setProjectsSearchQuery(e.target.value)}
                        placeholder="Search projects, product, agency..."
                        aria-label="Search projects"
                        className="h-8 pl-8 text-[12px] border-stone-200 bg-white"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setNewProjectOpen(true)}
                      className="h-8 px-3 text-[12px] text-stone-700 border-stone-200"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      New project
                    </Button>
                  </div>
                </div>

                {/* Continue recent work — hero card */}
                {continueProject && (
                  <section className="mb-8">
                    <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider mb-3">
                      Continue recent work
                    </p>
                    <button
                      onClick={() => {
                        openProjectHome(continueProject.id);
                      }}
                      className={cn(
                        'w-full text-left rounded-xl border border-stone-200 bg-white p-5',
                        'hover:border-stone-300 hover:shadow-sm transition-all duration-150 group',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40'
                      )}
                    >
                      <div className="flex items-start gap-4">
                        {/* Accent dot */}
                        <div
                          className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
                          style={{
                            backgroundColor: getProjectAccentColor(
                              continueProject.color,
                              continueProject.type
                            ),
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-[15px] font-semibold text-stone-900 truncate group-hover:text-stone-700">
                              {continueProject.name}
                            </h3>
                            {(() => {
                              const badge =
                                SUBMISSION_BADGE_MINI[continueProject.type] || fallbackBadge;
                              return (
                                <span
                                  className={cn(
                                    'text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0',
                                    badge.bg,
                                    badge.color
                                  )}
                                >
                                  {badge.label}
                                </span>
                              );
                            })()}
                            {continueProject.starred && (
                              <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />
                            )}
                          </div>
                          {continueProject.description && (
                            <p className="text-[13px] text-stone-500 line-clamp-1 mb-2 leading-relaxed">
                              {continueProject.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 text-[11px] text-stone-400">
                            <span>{relTime(continueProject.lastUpdated)}</span>
                            <span className="flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />
                              {continueProject.conversationCount}{' '}
                              {continueProject.conversationCount === 1 ? 'chat' : 'chats'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-stone-400 group-hover:text-stone-600 transition-colors flex-shrink-0 mt-1">
                          <span className="text-[13px] font-medium hidden sm:inline">Continue</span>
                          <ChevronLeft className="w-4 h-4 rotate-180" />
                        </div>
                      </div>
                    </button>
                  </section>
                )}

                {filteredProjects.length === 0 && (
                  <div className="rounded-xl border border-stone-200 bg-white p-6 text-center">
                    <p className="text-[14px] font-medium text-stone-800 mb-1">No matching projects</p>
                    <p className="text-[12px] text-stone-500 mb-4">
                      Try a different search term or create a new regulatory project.
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setNewProjectOpen(true)}>
                      <Plus className="w-3.5 h-3.5 mr-1.5" />
                      New project
                    </Button>
                  </div>
                )}

                {filteredProjects.length > 0 && (
                  <>
                    {renderProjectSection('Pinned', pinnedProjects)}
                    {renderProjectSection('Recent', recentProjects)}
                    {renderProjectSection(
                      pinnedProjects.length > 0 || recentProjects.length > 0
                        ? 'Project directory'
                        : 'All projects',
                      generalProjects
                    )}
                  </>
                )}
              </div>
            );
          })()}

        {/* ── Project Home: AnA chat + Knowledge sidebar (Claude.ai layout) ── */}
        {layoutMode === 'project-home' && (
          <div className="flex-1 flex min-h-0">
            {/* Center: AnA chat */}
            <AnaPersistentPanel
              mode="full"
              authoringContext={authoringContext}
              navContext="project-home"
              contextProfile={{
                productType: activeProject?.type,
                userRole: userRole,
                screenName: 'project-home',
                activeProject: activeProject?.name,
                projectId: activeProjectId,
                moduleContext,
                customInstructions,
              }}
              projectIntelligence={projectIntelligenceStats}
              greeting={
                activeProject
                  ? `Working on ${activeProject.name}. What would you like to do?`
                  : platformGreeting?.text
              }
              externalMessage={externalChatMessage}
              suggestedActions={workspaceSuggestedActions}
              onActionRun={handleActionRun}
              onNavigate={handleAnaPanelNavigate}
              onDraftInsert={handleDraftInsert}
              onNavigateToSection={handleNavigateToSection}
              onOpenArtifact={handleOpenArtifact}
              onRequestPromotion={handleRequestPromotion}
              onRefreshIntelligence={authoringIntelligence.refetch}
            />

            {/* Right sidebar: Project Knowledge (Claude.ai style — always visible) */}
            {!activeArtifactId && (
              <div className="w-72 xl:w-80 border-l border-stone-150 bg-white flex-shrink-0 hidden lg:flex">
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-12 w-full">
                      <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
                    </div>
                  }
                >
                  <ProjectKnowledgePanel projectId={activeProjectId ?? null} className="w-full" />
                </Suspense>
              </div>
            )}

            {/* Document Canvas: replaces knowledge panel when an artifact is active */}
            {activeArtifactId && (
              <div className="w-[45%] xl:w-[50%] flex-shrink-0 hidden lg:block">
                <ErrorBoundary>
                  <Suspense fallback={<ModuleLoadingFallback />}>
                    <DocumentCanvasPanel
                      artifactId={activeArtifactId}
                      projectId={activeProjectId}
                      onClose={() => setActiveArtifactId(undefined)}
                      onOpenFullEditor={id => {
                        setOpenArtifactId(id);
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                      }}
                      onSaveToVault={id => {
                        setActiveArtifactId(undefined);
                        setLayoutMode('vault');
                      }}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            )}
          </div>
        )}

        {/* AnA — THE single chat surface (ChatGPT/Claude style)
            projects/deep-research: full screen — AnA IS the interface
            workspace/regulatory-workspace: rendered inline above (mode="full")
            module pages (dossier, documents, etc.): compact input bar at bottom */}
        {layoutMode !== 'workspace' &&
          layoutMode !== 'regulatory-workspace' &&
          layoutMode !== 'project-home' && (
            <AnaPersistentPanel
              mode={
                layoutMode === 'projects' || layoutMode === 'deep-research' ? 'full' : 'compact'
              }
              defaultChatMode={layoutMode === 'deep-research' ? 'deep-research' : 'standard'}
              authoringContext={authoringContext}
              navContext={activeNavId}
              contextProfile={{
                productType: activeProject?.type,
                userRole: userRole,
                screenName: layoutMode,
                activeProject: activeProject?.name,
                projectId: activeProjectId,
                moduleContext,
                customInstructions,
              }}
              projectIntelligence={projectIntelligenceStats}
              greeting={
                layoutMode === 'deep-research'
                  ? "What would you like to research? I'll search across ClinicalTrials.gov, PubMed, FDA, EMA, and more."
                  : platformGreeting?.text
              }
              suggestedActions={layoutMode === 'projects' ? workspaceSuggestedActions : undefined}
              onActionRun={handleActionRun}
              onNavigate={handleAnaPanelNavigate}
              onDraftInsert={handleDraftInsert}
              onNavigateToSection={handleNavigateToSection}
              onOpenArtifact={handleOpenArtifact}
              onRequestPromotion={handleRequestPromotion}
              onRefreshIntelligence={authoringIntelligence.refetch}
            />
          )}
      </GlobalOperatingShell>

      {/* Global right-drawer Vault presence across the app shell */}
      {!embeddedModule && !activeToolPanel && (
        <button
          onClick={() => setActiveToolPanel('vault')}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 h-36 w-10 border border-stone-200 border-r-0 rounded-l-xl bg-white/95 hover:bg-stone-50 shadow-sm flex flex-col items-center justify-center gap-1"
          title="Open Vault drawer"
          aria-label="Open Vault drawer"
        >
          <FileText className="w-4 h-4 text-stone-600" />
          <span className="text-[10px] tracking-wide text-stone-600 [writing-mode:vertical-rl] rotate-180">
            Vault
          </span>
        </button>
      )}

      {!embeddedModule && activeToolPanel && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-96 lg:w-[620px] shadow-sm">
          <ToolPanelWrapper
            panel={activeToolPanel}
            onClose={() => {
              setActiveToolPanel(null);
              setToolPanelFullscreen(false);
            }}
            isFullscreen={toolPanelFullscreen}
            onToggleFullscreen={() => setToolPanelFullscreen(prev => !prev)}
          />
        </div>
      )}

      {/* [Phase A] Dr. Sage removed — AnA is the single guide identity */}

      {/* AnA — moved to inline bottom bar (see below) */}

      {/* Command palette */}
      <ZenCommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onAction={handleCommandAction}
      />

      {/* Settings — lazy loaded */}
      {settingsOpen && (
        <React.Suspense fallback={null}>
          <ZenSettings
            isOpen={settingsOpen}
            onClose={() => {
              setSettingsOpen(false);
              setSettingsSection(undefined);
            }}
            activeProjectId={activeProjectId}
            activeProjectName={activeProject?.name}
            initialSection={settingsSection as any}
          />
        </React.Suspense>
      )}

      {/* Project switcher - Connected to data layer */}
      <ProjectSwitcher
        isOpen={projectSwitcherOpen}
        onClose={() => setProjectSwitcherOpen(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={id => {
          setActiveProjectId(id);
          setProjectSwitcherOpen(false);
          setLayoutMode('project-home');
          navigate(`/concept2cure/project/${id}`);
          // Clear conversation when switching projects
          setActiveConversationId(undefined);
          setActiveThreadId(undefined);
        }}
        onCreateProject={() => {
          setProjectSwitcherOpen(false);
          setNewProjectOpen(true);
        }}
        onArchiveProject={handleArchiveProject}
        onDeleteProject={handleDeleteProject}
        onToggleStar={handleToggleProjectStar}
      />

      {/* New project modal */}
      <NewProjectModal
        isOpen={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreate={handleCreateProject}
      />

      {/* Project config flyout (replaces EditProjectModal) */}
      <ProjectConfigPanel
        isOpen={editProjectOpen}
        onClose={() => setEditProjectOpen(false)}
        project={
          activeProject
            ? {
                id: activeProject.id,
                name: activeProject.name,
                description: activeProject.description,
                submissionType: activeProject.type,
                sponsor: activeProject.sponsor,
                product: activeProject.product,
                region: activeProject.region,
                targetAgency: activeProject.targetAgency,
                targetSubmissionDate: activeProject.targetSubmissionDate,
                status: activeProject.status,
                customInstructions: customInstructions,
              }
            : null
        }
        onSave={handleEditProject}
      />

      {/* First-run onboarding experience */}
      {showFirstRun && (
        <Suspense fallback={null}>
          <FirstRunExperience
            userName={userName}
            existingProjects={projects}
            onComplete={(selectedRole, options) => {
              setShowFirstRun(false);
              try {
                localStorage.setItem('concept2cure_first_run_complete', 'true');
              } catch {}
              if (selectedRole) {
                try {
                  const profile = JSON.parse(
                    localStorage.getItem('concept2cure_user_profile') || '{}'
                  );
                  profile.role = selectedRole;
                  localStorage.setItem('concept2cure_user_profile', JSON.stringify(profile));
                  setUserProfile(profile);
                } catch {}
              }
              // Auto-select the project created during onboarding and navigate
              if (options?.projectId) {
                setActiveProjectId(options.projectId);
                const action = options.action || '';
                // 510(k) workspace has its own embedded route
                if (action === '510k-workspace') {
                  navigate(`/concept2cure/project/${options.projectId}/510k`);
                } else {
                  const actionToMode: Record<string, LayoutMode> = {
                    work: 'documents',
                    vault: 'vault',
                    apps: 'apps',
                  };
                  setLayoutMode(actionToMode[action] || 'project-home');
                }
              }
            }}
            onSkip={() => {
              setShowFirstRun(false);
              try {
                localStorage.setItem('concept2cure_first_run_complete', 'true');
              } catch {}
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default ZenApp;

const SIDEBAR_NAV_TO_LAYOUT: Record<string, LayoutMode> = {
  // Global destinations
  projects: 'projects',
  home: 'projects',
  apps: 'project-home',
  'project-home': 'project-home',
  overview: 'project-home',
  setup: 'setup',
  'artifacts-center': 'submission-workspace',
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
  templates: 'template-library',
  'template-library': 'template-library',
  tools: 'documents',
  dataroom: 'regulatory-workspace',
  upload: 'regulatory-workspace',
};

const PRIMARY_SIDEBAR_NAV_IDS = new Set([
  'projects',
  'home',
  'apps',
  'project-home',
  'overview',
  'setup',
  'artifacts-center',
  'work',
  'vault',
  'review-tab',
  'submit',
  'documents',
  'review',
  'reports',
  'submissions',
  'dossier',
  'publish',
  'verify',
  'haq',
  'submission-builder',
  'clinical-module5',
  'cmc',
  'ri-copilot',
  'task-board',
  'csr-workflow',
  'ind-checklist',
  'templates',
  'template-library',
]);
