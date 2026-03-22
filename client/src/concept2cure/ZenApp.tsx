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
import { useLocation, useRoute } from 'wouter';
import { cn } from '@/lib/utils';
import { ZenSidebar } from './components/sidebar/ZenSidebar';
import { ZenChat } from './components/chat/ZenChat';
import { ZenCommandPalette } from './components/command/ZenCommandPalette';
import { ZenSettings } from './components/settings/ZenSettings';
import {
  ProjectSwitcher,
  NewProjectModal,
  EditProjectModal,
} from './components/projects/ProjectSwitcher';
import { WorkflowTimeline } from './components/workflow';
import { ProjectFilesCompact } from './components/workspace/ProjectFilesCompact';
import { CustomInstructions } from './components/knowledge/CustomInstructions';
import { useProjectKnowledge } from './hooks/useProjectKnowledge';
import { useProjectTasks } from './hooks/useProjectTasks';
import { useProjects } from './hooks/useProjects';
import { useCortexThreads, useCortexHealth } from './hooks/useCortex';
import { usePlatformContext } from './hooks/useLicense';
import { useWorkspaceSummary } from './hooks/useWorkspaceSummary';
import { useProjectTasks } from './hooks/useProjectTasks';

import { WorkspaceReadinessStrip } from './components/workspace/WorkspaceReadinessStrip';
import { ProjectWorkspaceShell } from './components/workspace/ProjectWorkspaceShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { IndustryMode } from './types/workspace';
import ProductAuditQuestionnaire from '../components/ProductAuditQuestionnaire';
import { isFeatureEnabled } from '@/flags/featureFlags';

// Lazy-load CERV2Page for embedded module rendering inside the shell
const EmbeddedCERV2Page = lazy(() => import('@/pages/csr/CERV2Page'));
// Lazy-load PMA Workspace for embedded module rendering
const EmbeddedPMAWorkspace = lazy(() => import('./components/pma/PMAWorkspace'));
// DTC Landing Page (public, no auth)
const LandingPage = lazy(() => import('./pages/LandingPage'));
// Full Document Builder wizard (CSR + CTD across global agencies)
const FullDocumentBuilder = lazy(() => import('./components/builder/FullDocumentBuilder'));
import {
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
  Loader2,
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
} from 'lucide-react';

// Minimal loading fallback — no spinner, just a white screen to avoid flash
const ModuleLoadingFallback = () => (
  <div className="flex-1 flex items-center justify-center bg-white">
    <div className="w-6 h-6 rounded-full border-2 border-zinc-200 border-t-zinc-400 animate-spin" />
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
const ConvergentCanvas = lazy(() =>
  import('./components/canvas/ConvergentCanvas').then(m => ({ default: m.ConvergentCanvas }))
);

// Enablement Center — Dr. Sage + AnA 1.0 dual-AI enablement hub
const EnablementCenter = lazy(() => import('./components/enablement/EnablementCenter'));

// Dr. Sage Global Layer — persistent help/guide/copilot presence
import DrSageGlobalLayer from './components/dr-sage/DrSagePanel';

// AnA Persistent Panel — always-available AI conversation on every page
import AnaPersistentPanel from './components/chat/AnaPersistentPanel';

// First-run onboarding experience
const FirstRunExperience = lazy(() => import('./components/enablement/FirstRunExperience'));

// Snow Globe — Cross-platform prediction & intelligence
const SnowGlobeHome = lazy(() => import('./pages/SnowGlobe/SnowGlobeHome'));
const SnowGlobeChambers = lazy(() => import('./pages/SnowGlobe/SnowGlobeChambers'));

// About & Training Center (with Dr. Sage FDA Reviewer AI)
const AboutTrainingCenter = lazy(() =>
  import('./pages/AboutTrainingCenter').then(m => ({ default: m.AboutTrainingCenter }))
);

// Lazy load Phase 7 Mission Control components
const MissionControl = lazy(() =>
  import('./pages/MissionControl').then(m => ({ default: m.MissionControl }))
);
const RulesManager = lazy(() =>
  import('./pages/MissionControl/RulesManager').then(m => ({ default: m.RulesManager }))
);

// Lazy load IND Workspace (eCTD filing hub)
const INDWorkspace = lazy(() =>
  import('./pages/INDWorkspace').then(m => ({ default: m.INDWorkspace }))
);

// IND Workspace Right Rail (section-specific CTD context)
const INDRightRail = lazy(() =>
  import('./components/workspace/INDRightRail').then(m => ({ default: m.INDRightRail }))
);

// Lazy load Phase 15 Submission Operations Command Center
const SubmissionOpsCommandCenter = lazy(() =>
  import('./pages/SubmissionOpsCommandCenter').then(m => ({
    default: m.SubmissionOpsCommandCenter,
  }))
);

// ─── Regulatory module standalones ────────────────────────────────────────────
// Document Editor panel (bridge to UnifiedDocumentEditor + live APIs)
const EditorPanel = lazy(() =>
  import('./components/editor/EditorPanel').then(m => ({ default: m.default }))
);
// eCTD Co-Author (IND / NDA / BLA / 510k document authoring)
const ECTDCoAuthorStandalone = lazy(() =>
  import('./components/coauthor/eCTDCoAuthor').then(m => ({ default: m.ECTDCoAuthorStandalone }))
);

// RI Copilot Intelligence Home (evidence-first landing surface)
const RICopilotHome = lazy(() =>
  import('./components/intelligence/RICopilotHome').then(m => ({
    default: m.RICopilotHome,
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

// ─── Biotech module standalones (in-shell rendering) ─────────────────────────
// Canonical CMC: ComprehensiveCMCPlatformClean (25k LOC, 102 API endpoints)
// Replaces the thin CMCModule wrapper (735 LOC, 3 API calls) – regression fix
const CMCModuleStandalone = lazy(() => import('@/components/cmc/ComprehensiveCMCPlatformClean'));
const VaultPageStandalone = lazy(() =>
  import('@/pages/vault/VaultPage').then(m => ({ default: m.default }))
);
const StudyArchitectModuleStandalone = lazy(() =>
  import('@/components/studyArchitect/StudyArchitectModule').then(m => ({
    default: m.default,
  }))
);

const TemplateLibraryInline = lazy(() =>
  import('./components/templates/TemplateLibraryInline').then(m => ({
    default: m.TemplateLibraryInline,
  }))
);

const IntelligentReportGenerator = lazy(
  () => import('./components/reports/IntelligentReportGenerator')
);

const AnaDashboardPage = lazy(() =>
  import('./pages/AnaDashboard')
);

const SafetyNarrativePage = lazy(() =>
  import('./pages/SafetyNarrative')
);

const AnaPlatformControlPage = lazy(() =>
  import('./pages/AnaPlatformControl')
);

const ProjectKnowledgePanel = lazy(() =>
  import('./components/workspace/ProjectKnowledgePanel').then(m => ({
    default: m.ProjectKnowledgePanel,
  }))
);

// ─── New intent-organized workspace lazy loads ──────────────────────────────
const IntelligenceHub = lazy(() =>
  import('./pages/IntelligenceHub').then(m => ({ default: m.IntelligenceHub }))
);
const ReviewReadiness = lazy(() =>
  import('./pages/ReviewReadiness').then(m => ({ default: m.ReviewReadiness }))
);
const CommandCenterHub = lazy(() =>
  import('./pages/CommandCenterHub').then(m => ({ default: m.CommandCenterHub }))
);

const ClientIntelligencePage = lazy(() => import('./pages/ClientIntelligencePage'));

// Collaboration Hub — threaded collaboration workspace
const CollaborationHubPage = lazy(() =>
  import('./pages/MissionControl/CollaborationHub').then(m => ({ default: m.default }))
);

// User Inbox — personal command center with worklist, approvals, alerts
const UserInboxPage = lazy(() => import('./pages/UserInbox'));

// Client Branding — logo, letterhead, templates, brand settings
const ClientBrandingSettings = lazy(() => import('./components/settings/ClientBrandingSettings'));

// Biostatistics Platform — statistical analysis, power calculations, endpoints
const BiostatPlatformDashboard = lazy(
  () => import('@/components/biostat/BiostatPlatformDashboard')
);

// Training Center — client onboarding, courses, certifications
const TrainingManagementPage = lazy(
  () => import('@/portal-v2/components/admin/TrainingManagement')
);
const IntegrationsPage = lazy(() =>
  import('./pages/IntegrationsPage')
);

// Agent Hub and Review Pulse removed — shell-only modules not demo-ready

// Client Onboarding — setup wizard, configuration
const OnboardingWizardPage = lazy(
  () => import('@/portal-v2/components/onboarding/OnboardingWizard')
);

// Knowledge Base — account-level skills, .MD upload, materials ingestion
// Already imported: CustomInstructions from './components/knowledge/CustomInstructions'

// Project Knowledge — project-level context, uploads, sources
// Already lazy-loaded: ProjectKnowledgePanel

// Legal Center — IP, contracts, regulatory law
const LegalCenterPage = lazy(() =>
  import('./pages/LegalCenter').then(m => ({ default: m.default }))
);

// Platform Home — Claude.ai-style landing dashboard
const PlatformHome = lazy(() => import('./components/home/PlatformHome'));

// Artifacts Gallery — Claude.ai-style browsable artifact gallery
const ArtifactsGalleryPage = lazy(() => import('./pages/ArtifactsGallery'));

// Platform Admin — API keys, tenant management, billing, security (Regulatory Command Center)
const PlatformAdminPage = lazy(() => import('./components/control-plane/CommandCenter'));

// Biologics Dashboard — biologic/biosimilar pathway intelligence, comparability, expedited programs
const BiologicsDashboardPage = lazy(() => import('./components/biologics/BiologicsDashboard'));

// CTD Onboarding Wizard — client CTD ingestion pipeline (5-step wizard)
const CTDOnboardingWizardPage = lazy(() => import('./components/onboarding/CTDProjectWizard'));

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
  'doc-editor': EditorPanel,
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
  | null;

type LayoutMode =
  | 'projects'
  | 'workspace'
  | 'assistant'
  | 'sherpa'
  | 'editor'
  | 'analytics'
  | 'timeline'
  | 'audit'
  | 'ctd'
  | 'mission-control'
  | 'rules'
  | 'ind-workspace'
  | 'submission-workspace'
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
  | 'collaboration-hub'
  | 'program-wizard'
  | 'task-board'
  | 'team-workspace'
  | 'program-analytics'
  | 'medtech-dashboard'
  | 'ectd-coauthor'
  | 'cmc'
  | 'dossier'
  | 'precedent-intelligence'
  | 'regulatory-workspace'
  | 'document-vault'
  | 'clinical-trial'
  | 'snowglobe'
  | 'snowglobe-chambers'
  | 'enablement-center'
  // ── New intent-organized workspaces ──
  | 'author'
  | 'intelligence-hub'
  | 'review-readiness'
  | 'command-center'
  | 'client-intelligence'
  | 'templates'
  | 'biostatistics'
  | 'training-center'
  | 'client-onboarding'
  | 'knowledge-base'
  | 'project-knowledge'
  | 'legal-center'
  | 'artifacts'
  | 'platform-admin'
  | 'biologics-dashboard'
  | 'ctd-onboarding'
  | 'document-builder'
  | 'deep-research'
  | 'report-engine'
  | 'about-training'
  | 'user-inbox'
  | 'client-branding'
  | 'ana-dashboard'
  | 'safety-narrative'
  | 'ana-platform-control'
  | 'integrations';

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

const TOOL_PANELS: Record<
  Exclude<ToolPanel, null>,
  {
    title: string;
    icon: React.ComponentType<{ className?: string }>;
    component: string; // Component name to lazy load
  }
> = {
  ectd: { title: 'eCTD Navigator', icon: Folder, component: 'ECTDNavigator' },
  protocol: { title: 'Protocol Designer', icon: ClipboardList, component: 'StudyProtocolDesigner' },
  sop: { title: 'SOP Management', icon: BookOpen, component: 'SOPManagement' },
  capa: { title: 'CAPA Management', icon: AlertTriangle, component: 'CAPAManagement' },
  pms: { title: 'Post-Market Surveillance', icon: BarChart2, component: 'PostMarketSurveillance' },
  inspection: {
    title: 'Inspection Readiness',
    icon: CheckSquare,
    component: 'InspectionReadiness',
  },
  intelligence: {
    title: 'Regulatory Intelligence',
    icon: Globe,
    component: 'RegulatoryIntelligence',
  },
  vault: {
    title: 'Document Vault',
    icon: FileText,
    component: 'VaultBrowser',
  },
  'doc-editor': {
    title: 'Document Editor',
    icon: PenLine,
    component: 'EditorPanel',
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
        'flex flex-col h-full bg-white border-l border-zinc-200',
        isFullscreen ? 'w-full' : 'w-full sm:w-80 md:w-96 lg:w-[600px]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-zinc-100 bg-zinc-50/50">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-zinc-600" />
            <span className="font-medium text-zinc-900">{config.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleFullscreen}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50 transition-colors"
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
                <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
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
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-100 flex items-center justify-center">
                    <Icon className="w-8 h-8 text-zinc-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-zinc-900 mb-2">{config.title}</h3>
                  <p className="text-sm text-zinc-500 max-w-sm">{config.title} module loading...</p>
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

function AnalyticsDashboardInline({ projects, onBack }: { projects: any[]; onBack: () => void }) {
  const { data: summaryRaw } = useQuery({
    queryKey: ['/api/concept2cure/projects/all/artifacts-summary'],
  });
  const summary = (summaryRaw as any)?.data || { total: 0, draft: 0, review: 0, approved: 0 };

  const { data: auditRaw } = useQuery({
    queryKey: ['/api/concept2cure/audit-logs', { limit: 30 }],
    queryFn: () => fetch('/api/concept2cure/audit-logs?limit=30').then(r => r.json()),
  });
  const auditLogs = (auditRaw as any)?.data?.logs || [];

  const totalProjects = projects.length;
  const activeProjects = projects.filter((p: any) => p.status === 'active').length;
  const completedProjects = projects.filter((p: any) => p.status === 'completed').length;

  // Derive activity by day from audit logs
  const activityByDay = useMemo(() => {
    const days = new Map<string, number>();
    auditLogs.forEach((l: any) => {
      if (l.timestamp) {
        const day = new Date(l.timestamp).toLocaleDateString('en-US', { weekday: 'short' });
        days.set(day, (days.get(day) || 0) + 1);
      }
    });
    return Array.from(days.entries())
      .slice(0, 7)
      .map(([day, count]) => ({ day, count }));
  }, [auditLogs]);

  const metrics = [
    { label: 'Total Projects', value: totalProjects, color: 'text-zinc-900' },
    { label: 'Active', value: activeProjects, color: 'text-blue-600' },
    { label: 'Completed', value: completedProjects, color: 'text-emerald-600' },
    { label: 'Total Artifacts', value: summary.total, color: 'text-zinc-900' },
    { label: 'In Draft', value: summary.draft, color: 'text-amber-600' },
    { label: 'In Review', value: summary.review, color: 'text-blue-600' },
    { label: 'Approved', value: summary.approved, color: 'text-emerald-600' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">Portfolio Analytics</h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              Real-time metrics from your projects and artifacts
            </p>
          </div>
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-100 text-zinc-700 text-sm font-medium hover:bg-zinc-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {metrics.slice(0, 4).map(m => (
            <div key={m.label} className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
              <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                {m.label}
              </p>
              <p className={cn('text-2xl font-semibold mt-1', m.color)}>{m.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Artifact Status Breakdown */}
          <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100">
            <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-4">
              Artifact Pipeline
            </p>
            {summary.total === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">
                No artifacts yet. Create projects and generate documents to see pipeline analytics.
              </p>
            ) : (
              <div className="space-y-3">
                {[
                  {
                    label: 'Draft',
                    value: summary.draft,
                    pct: Math.round((summary.draft / Math.max(1, summary.total)) * 100),
                    color: 'bg-amber-500',
                  },
                  {
                    label: 'In Review',
                    value: summary.review,
                    pct: Math.round((summary.review / Math.max(1, summary.total)) * 100),
                    color: 'bg-blue-500',
                  },
                  {
                    label: 'Approved',
                    value: summary.approved,
                    pct: Math.round((summary.approved / Math.max(1, summary.total)) * 100),
                    color: 'bg-emerald-500',
                  },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-600">{item.label}</span>
                      <span className="text-xs font-medium text-zinc-900">
                        {item.value} ({item.pct}%)
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-200 rounded-full">
                      <div
                        className={cn('h-2 rounded-full transition-all', item.color)}
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Chart */}
          <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100">
            <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-4">
              Recent Activity
            </p>
            {activityByDay.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">No recent activity recorded.</p>
            ) : (
              <div className="flex items-end gap-2 h-32">
                {activityByDay.map(({ day, count }) => {
                  const maxCount = Math.max(...activityByDay.map(d => d.count), 1);
                  const height = Math.max(8, (count / maxCount) * 100);
                  return (
                    <div key={day} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-zinc-500">{count}</span>
                      <div
                        className="w-full bg-zinc-900 rounded-t"
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-[10px] text-zinc-400">{day}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Project List */}
        <div className="bg-zinc-50 rounded-xl p-5 border border-zinc-100">
          <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-4">
            Project Summary
          </p>
          {projects.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-6">
              No projects yet. Create your first project to see analytics.
            </p>
          ) : (
            <div className="space-y-2">
              {projects.map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-2 h-2 rounded-full',
                        p.status === 'active'
                          ? 'bg-emerald-500'
                          : p.status === 'completed'
                            ? 'bg-blue-500'
                            : 'bg-zinc-400'
                      )}
                    />
                    <span className="text-sm text-zinc-900">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-400">{p.submissionType || 'IND'}</span>
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full',
                        p.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : p.status === 'completed'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-zinc-100 text-zinc-600'
                      )}
                    >
                      {p.status || 'draft'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ZEN APP
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenApp: React.FC = () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // URL-DRIVEN PROJECT IDENTITY
  // ─────────────────────────────────────────────────────────────────────────────
  const [, navigate] = useLocation();
  const [, routeParams] = useRoute('/concept2cure/project/:projectId/:rest*');
  const [, routeParamsExact] = useRoute('/concept2cure/project/:projectId');
  const urlProjectId = routeParams?.projectId ?? routeParamsExact?.projectId ?? null;

  // ─────────────────────────────────────────────────────────────────────────────
  // EMBEDDED MODULE DETECTION
  // When EMBED_MODULES_IN_SHELL is enabled and URL has /project/:id/510k,
  // render CERV2Page inside the shell frame instead of as a standalone page.
  // ─────────────────────────────────────────────────────────────────────────────
  const urlModuleSegment = (routeParams as Record<string, string> | null)?.['rest*'] ?? null; // e.g. '510k', 'pma'
  const embedModulesEnabled = isFeatureEnabled('EMBED_MODULES_IN_SHELL');
  const embeddedModule =
    embedModulesEnabled && urlModuleSegment === '510k' ? '510k' :
    embedModulesEnabled && urlModuleSegment === 'pma' ? 'pma' : null;

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
      lastUpdated: p.updatedAt,
      conversationCount: p.conversations?.length ?? 0,
      starred: p.starred ?? false,
      archived: p.archived ?? false,
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
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
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
    urlProjectId ? 'regulatory-workspace' : 'projects'
  );

  // Guard: prevents URL-sync from reverting a navigation that's in-flight
  const navInProgressRef = useRef(false);

  // Account-level custom instructions for Knowledge Base
  const [customInstructions, setCustomInstructions] = useState('');

  // Right panel tab in workspace mode
  const [workspacePanelTab, setWorkspacePanelTab] = useState<'files' | 'outputs' | 'instructions'>(
    'files'
  );
  const [workspacePanelOpen, setWorkspacePanelOpen] = useState(true);

  const [moduleAssistantOpen, setModuleAssistantOpen] = useState(false);

  // Pending editor content — when a module wants to open the editor with pre-populated content
  const [pendingEditorContent, setPendingEditorContent] = useState<{
    title: string;
    content: string;
    ctdSection?: string;
  } | null>(null);

  // Direct artifact open — when a module has already saved an artifact and wants to open it
  const [openArtifactId, setOpenArtifactId] = useState<string | undefined>();

  // RI Copilot view: 'intelligence' = evidence-first home, 'editor' = document editing
  const [riViewMode, setRiViewMode] = useState<'intelligence' | 'editor'>(
    urlProjectId ? 'editor' : 'intelligence'
  );

  // Active selection — URL projectId takes precedence
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>(
    urlProjectId ?? projects[0]?.id
  );
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>();
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
  } = useProjectTasks(sherpaDetailProjectId || activeProjectId);

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

  // Workspace suggested actions — context-aware quick-start chips for AnA
  const workspaceSuggestedActions = useMemo(() => {
    const base = workspaceSummary?.nextActions ?? [];
    if (base.length > 0) return base.slice(0, 4);

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
    return (starters[t] ?? starters['IND']).slice(0, 4);
  }, [activeProject?.type, workspaceSummary?.nextActions]);

  // Pending draft request from IND Workspace → passed to AnA when switching to workspace mode
  const [pendingDraftSection, setPendingDraftSection] = useState<{
    code: string;
    title: string;
  } | null>(null);

  // Project-scoped artifacts for the Outputs tab (must come after activeProjectId is declared)
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
      return Array.isArray(data) ? data : (data?.data ?? data?.artifacts ?? []);
    },
    enabled: !!activeProjectId,
    staleTime: 30_000,
  });

  // Instructions + knowledge for Instructions tab (lifted so it doesn't remount per tab)
  const workspaceKnowledge = useProjectKnowledge(activeProjectId ?? null);

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
  useEffect(() => {
    if (!activeProjectId) {
      const summaryProject = workspaceSummary?.active?.projectId;
      if (summaryProject) {
        setActiveProjectId(summaryProject);
      } else if (projects.length > 0) {
        setActiveProjectId(projects[0].id);
      }
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
      const MODULE_ROUTES: Record<string, LayoutMode> = {
        'go-copilot': 'regulatory-workspace',
        'go-author': 'author',
        'go-collaboration': 'collaboration-hub',
        'go-inbox': 'user-inbox',
        'go-branding': 'client-branding',
        'go-snowglobe': 'snowglobe',
        'go-intelligence': 'intelligence-hub',
        'go-biostatistics': 'biostatistics',
        'go-review-readiness': 'review-readiness',
        'go-legal': 'legal-center',
        'go-client-intelligence': 'client-intelligence',
        'go-command-center': 'command-center',
        'go-knowledge-base': 'knowledge-base',
        'go-project-knowledge': 'project-knowledge',
        'go-academy': 'enablement-center',
        'go-training': 'training-center',
        'go-onboarding': 'client-onboarding',
        'go-home': 'projects',
        'go-report-engine': 'report-engine',
      };

      if (MODULE_ROUTES[actionId]) {
        setLayoutMode(MODULE_ROUTES[actionId]);
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
          archived: true,
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
        await updateProjectMutation({
          ...project,
          starred: !project.starred,
        });
      }
    },
    [rawProjects, updateProjectMutation]
  );

  const handleEditProject = useCallback(
    async (data: {
      name: string;
      description?: string;
      sponsor?: string;
      product?: string;
      region?: string;
    }) => {
      const project = rawProjects.find(p => p.id === activeProjectId);
      if (project) {
        try {
          await updateProjectMutation({
            ...project,
            name: data.name,
            description: data.description,
            sponsor: data.sponsor,
            product: data.product,
            region: data.region,
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
    const lastActivity =
      taskSummary.total > 0
        ? `${taskSummary.completed}/${taskSummary.total} tasks complete`
        : 'No tasks yet';
    return {
      deadlineDays,
      complianceScore,
      riskCount,
      lastActivity,
      auditStatus: 'Audit trail active',
    };
  }, [activeProject, taskSummary]);

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
    <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-100 bg-white flex-shrink-0">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        <span>{backLabel || 'Back'}</span>
      </button>
      <div className="w-px h-4 bg-zinc-200" />
      {icon && <span className="text-zinc-400">{icon}</span>}
      <span className="text-sm font-medium text-zinc-900">{title}</span>
      {subtitle && <span className="text-xs text-zinc-400 ml-1 hidden sm:inline">{subtitle}</span>}
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
          (
            {
              'regulatory-workspace': 'ai-copilot',
              workspace: 'ai-copilot',
              'ind-workspace': 'author',
              'ectd-coauthor': 'author',
              cmc: 'cmc',
              'clinical-trial': 'author',
              author: 'author',
              editor: 'author',
              templates: 'author',
              'intelligence-hub': 'intelligence-hub',
              'review-readiness': 'review-readiness',
              snowglobe: 'snowglobe',
              'snowglobe-chambers': 'snowglobe',
              'command-center': 'command-center',
              'mission-control': 'command-center',
              'submission-workspace': 'command-center',
              'document-vault': 'command-center',
              'enablement-center': 'enablement-center',
              'client-intelligence': 'client-intelligence',
              'collaboration-hub': 'collaboration-hub',
              'user-inbox': 'user-inbox',
              'client-branding': 'client-branding',
              biostatistics: 'biostatistics',
              'training-center': 'training-center',
              'client-onboarding': 'client-onboarding',
              'knowledge-base': 'knowledge-base',
              'project-knowledge': 'project-knowledge',
              'legal-center': 'legal-center',
              sherpa: 'ai-copilot',
              audit: 'review-readiness',
              timeline: 'command-center',
              analytics: 'command-center',
              artifacts: 'artifacts',
              'about-training': 'about-training',
            } as Record<string, string>
          )[layoutMode] ?? undefined
        }
        onSelectConversation={id => {
          setActiveConversationId(id);
          setActiveThreadId(id);
        }}
        onNewChat={handleNewChat}
        onOpenProjects={() => setProjectSwitcherOpen(true)}
        onOpenSearch={() => setCommandPaletteOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onDeleteConversation={handleDeleteConversation}
        onToggleStar={handleToggleConversationStar}
        onTogglePin={handleToggleConversationPin}
        industryMode={industryMode}
        onNavigate={id => {
          switch (id) {
            case 'home':
              setLayoutMode('projects');
              break;
            case 'projects':
              setLayoutMode('projects');
              break;
            case 'tools':
              setActiveToolPanel('intelligence');
              break;
            case 'agents':
              setLayoutMode('regulatory-workspace');
              break;
            case 'tasks':
              setLayoutMode('timeline');
              break;
            case 'templates':
              setActiveToolPanel('protocol');
              break;
            case 'analytics':
              setLayoutMode('analytics');
              break;
            // ── Product routes ──────────────────────────────────
            case 'ai-copilot':
              setRiViewMode('intelligence');
              setLayoutMode('regulatory-workspace');
              break;
            case '510k-workspace':
              if (embeddedModule !== null || !isFeatureEnabled('EMBED_MODULES_IN_SHELL')) {
                window.location.href = '/cerv2';
              } else if (activeProjectId) {
                navigate(`/concept2cure/project/${activeProjectId}/510k`);
              } else {
                // No project selected — go to projects list
                setLayoutMode('projects');
              }
              break;
            case 'pma-workspace':
              if (embeddedModule !== null || !isFeatureEnabled('EMBED_MODULES_IN_SHELL')) {
                setLayoutMode('projects');
              } else if (activeProjectId) {
                navigate(`/concept2cure/project/${activeProjectId}/pma`);
              } else {
                setLayoutMode('projects');
              }
              break;
            case 'cer-generator':
              window.location.href = '/cerv2?mode=cer';
              break;
            case 'document-vault':
              setLayoutMode('document-vault');
              break;
            case 'evidence-search':
              setCommandPaletteOpen(true);
              break;
            case 'ectd-coauthor':
              setLayoutMode('ectd-coauthor');
              break;
            case 'ind-workspace':
              setLayoutMode('ind-workspace');
              break;
            case 'cmc':
              setLayoutMode('cmc');
              break;
            case 'clinical-trial':
              setLayoutMode('clinical-trial');
              break;
            case 'regulatory-workspace':
              setLayoutMode('regulatory-workspace');
              break;
            case 'mission-control':
              setLayoutMode('mission-control');
              break;
            case 'snowglobe':
              setLayoutMode('snowglobe');
              break;
            case 'about-training':
              setLayoutMode('about-training');
              break;
            case 'submission-workspace':
              setLayoutMode('submission-workspace');
              break;
            case 'enablement-center':
              setLayoutMode('enablement-center');
              break;
            // ── New intent-organized workspaces ──
            case 'author':
              setLayoutMode('author');
              break;
            case 'intelligence-hub':
              setLayoutMode('intelligence-hub');
              break;
            case 'review-readiness':
              setLayoutMode('review-readiness');
              break;
            case 'command-center':
              setLayoutMode('command-center');
              break;
            case 'client-intelligence':
              setLayoutMode('client-intelligence');
              break;
            case 'collaboration-hub':
              setLayoutMode('collaboration-hub');
              break;
            case 'user-inbox':
              setLayoutMode('user-inbox');
              break;
            case 'client-branding':
              setLayoutMode('client-branding');
              break;
            case 'biostatistics':
              setLayoutMode('biostatistics');
              break;
            case 'training-center':
              setLayoutMode('training-center');
              break;
            case 'snowglobe':
              setLayoutMode('snowglobe');
              break;
            case 'client-onboarding':
              setLayoutMode('client-onboarding');
              break;
            case 'knowledge-base':
              setLayoutMode('knowledge-base');
              break;
            case 'project-knowledge':
              setLayoutMode('project-knowledge');
              break;
            case 'legal-center':
              setLayoutMode('legal-center');
              break;
            case 'artifacts':
              setLayoutMode('artifacts');
              break;
            case 'platform-admin':
              setLayoutMode('platform-admin');
              break;
            case 'biologics-dashboard':
              setLayoutMode('biologics-dashboard');
              break;
            case 'ctd-onboarding':
              setLayoutMode('ctd-onboarding');
              break;
            case 'deep-research':
              setLayoutMode('deep-research');
              break;
            case 'document-builder':
              setLayoutMode('document-builder');
              break;
            case 'report-engine':
              setLayoutMode('report-engine');
              break;
            case 'ana-dashboard':
              setLayoutMode('ana-dashboard');
              break;
            case 'safety-narrative':
              setLayoutMode('safety-narrative');
              break;
            case 'ana-platform-control':
              setLayoutMode('ana-platform-control');
            case 'integrations':
              setLayoutMode('integrations');
              break;
            default:
              break;
          }
        }}
        userName={userName}
        userEmail={userEmail}
      />

      {/* Main area — no top bar, exactly like Claude.ai */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
                  className="flex-shrink-0 w-10 flex flex-col items-center justify-center gap-1 bg-zinc-50 hover:bg-zinc-100 border-l border-zinc-200 transition-colors"
                  title="Open AI Assistant"
                  data-testid="module-assistant-toggle"
                >
                  <MessageSquare className="w-4 h-4 text-zinc-500" />
                  <span
                    className="text-[10px] text-zinc-400 writing-mode-vertical"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    Assistant
                  </span>
                </button>
              )}

              {/* Collapsible assistant drawer */}
              {moduleAssistantOpen && (
                <div
                  className="flex-shrink-0 w-[380px] flex flex-col border-l border-zinc-200 bg-white"
                  data-testid="module-assistant-panel"
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 bg-zinc-50">
                    <span className="text-sm font-medium text-zinc-700">AI Assistant</span>
                    <button
                      onClick={() => setModuleAssistantOpen(false)}
                      className="p-1 rounded hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600"
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
                      greeting="How can I help with your 510(k) submission?"
                      onNavigate={() => {}}
                      onNewProject={() => {}}
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
                  className="flex-shrink-0 w-10 flex flex-col items-center justify-center gap-1 bg-zinc-50 hover:bg-zinc-100 border-l border-zinc-200 transition-colors"
                  title="Open AI Assistant"
                >
                  <MessageSquare className="w-4 h-4 text-zinc-500" />
                  <span
                    className="text-[10px] text-zinc-400 writing-mode-vertical"
                    style={{ writingMode: 'vertical-rl' }}
                  >
                    Assistant
                  </span>
                </button>
              )}

              {moduleAssistantOpen && (
                <div
                  className="flex-shrink-0 w-[380px] flex flex-col border-l border-zinc-200 bg-white"
                >
                  <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 bg-zinc-50">
                    <span className="text-sm font-medium text-zinc-700">AI Assistant</span>
                    <button
                      onClick={() => setModuleAssistantOpen(false)}
                      className="p-1 rounded hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600"
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
                      greeting="How can I help with your PMA submission?"
                      onNavigate={() => {}}
                      onNewProject={() => {}}
                      onThreadChange={handleThreadChange}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Sherpa Mode - Convergent Canvas */}
          {!embeddedModule && layoutMode === 'sherpa' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-sherpa"
            >
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  <ConvergentCanvas
                    userId={activeProjectId || 'anonymous'}
                    userName={userName}
                    userRole={userRole}
                    industry={industryMode}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {!embeddedModule && layoutMode === 'analytics' && (
            <AnalyticsDashboardInline
              projects={projects || []}
              onBack={() => setLayoutMode('regulatory-workspace')}
            />
          )}

          {!embeddedModule && layoutMode === 'timeline' && (
            <div className="flex-1 p-8 bg-white overflow-y-auto">
              <div className="max-w-3xl mx-auto">
                <WorkflowTimeline
                  steps={timelineSteps}
                  currentStepId={(() => {
                    // Derive current step from project artifacts
                    const arts = projectArtifacts || [];
                    if (arts.length === 0) return 'step-upload';
                    const hasApproved = arts.some(
                      (a: any) => a.status === 'approved' || a.status === 'locked'
                    );
                    const hasReview = arts.some((a: any) => a.status === 'review');
                    if (hasApproved) return 'step-export';
                    if (hasReview) return 'step-review';
                    return 'step-authoring';
                  })()}
                  progressPercent={(() => {
                    const arts = projectArtifacts || [];
                    if (arts.length === 0) return 10;
                    const approved = arts.filter(
                      (a: any) => a.status === 'approved' || a.status === 'locked'
                    ).length;
                    return Math.min(
                      95,
                      Math.round((approved / Math.max(1, arts.length)) * 100) + 10
                    );
                  })()}
                  assetState={(() => {
                    const arts = projectArtifacts || [];
                    const hasApproved = arts.some(
                      (a: any) => a.status === 'approved' || a.status === 'locked'
                    );
                    const hasReview = arts.some((a: any) => a.status === 'review');
                    if (hasApproved) return 'APPROVED';
                    if (hasReview) return 'REVIEW';
                    return 'DRAFT';
                  })()}
                  workflowRunId={workflowRunId}
                  showPhases
                />
              </div>
            </div>
          )}

          {!embeddedModule && layoutMode === 'audit' && (
            <div className="flex-1 overflow-y-auto bg-zinc-50" data-testid="workspace-audit">
              <ProductAuditQuestionnaire />
            </div>
          )}

          {/* Phase 7: Mission Control Dashboard */}
          {!embeddedModule && layoutMode === 'mission-control' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-mission-control"
            >
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  <MissionControl />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* Snow Globe — Prediction & Intelligence Engine */}
          {!embeddedModule && layoutMode === 'snowglobe' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-snowglobe"
            >
              <Suspense fallback={<ModuleLoadingFallback />}>
                <SnowGlobeHome programId={activeProjectId ? Number(activeProjectId) : null} />
              </Suspense>
            </div>
          )}

          {/* Snow Globe — Chamber Detail View */}
          {!embeddedModule && layoutMode === 'snowglobe-chambers' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-snowglobe-chambers"
            >
              <Suspense fallback={<ModuleLoadingFallback />}>
                <SnowGlobeChambers programId={activeProjectId ? Number(activeProjectId) : null} />
              </Suspense>
            </div>
          )}

          {/* About & Training Center (Dr. Sage FDA Reviewer AI) */}
          {!embeddedModule && layoutMode === 'about-training' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-about-training"
            >
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center bg-white">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto" />
                  </div>
                }
              >
                <AboutTrainingCenter />
              </Suspense>
            </div>
          )}

          {/* ── IND Workspace (eCTD filing hub — dossier construction) ──────────── */}
          {!embeddedModule && layoutMode === 'ind-workspace' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-ind">
              <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('regulatory-workspace')}
                  className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Chat</span>
                </button>
                <div className="w-px h-4 bg-zinc-200" />
                <ShieldCheck className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-medium text-zinc-900">
                  {submissionWorkspaceLabel} — Dossier Construction
                </span>
                <span className="text-xs text-zinc-400 ml-1 hidden sm:inline">
                  CTD sections · Status tracking · eCTD compile
                </span>
              </div>
              {/* No-project guard */}
              {!activeProjectId ? (
                <div className="flex-1 flex items-center justify-center bg-zinc-50/50 p-8">
                  <div className="max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-50 flex items-center justify-center">
                      <ShieldCheck className="w-8 h-8 text-violet-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-zinc-900 mb-2">IND Workspace</h2>
                    <p className="text-sm text-zinc-500 mb-6">
                      Select a project to open its dossier and begin drafting CTD sections.
                    </p>
                    <button
                      onClick={() => setProjectSwitcherOpen(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors shadow-sm"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Select Project
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex min-h-0">
                  {/* Main area: IND section tree */}
                  <div className="flex-1 overflow-auto">
                    <ErrorBoundary>
                      <Suspense fallback={<ModuleLoadingFallback />}>
                        <INDWorkspace
                          projectId={activeProjectId}
                          projectName={activeProject?.name || 'Untitled Project'}
                          submissionType={activeProject?.type || 'IND'}
                          onOpenSection={sectionCode => {
                            const ctd = sectionCode.replace(/^m/, '');
                            setPendingEditorContent({
                              content: `<h1>${sectionCode.toUpperCase()} — Draft</h1><p>Section content for ${activeProject?.name || 'IND Application'}.</p>`,
                              title: `${sectionCode.toUpperCase()} — ${activeProject?.name || 'IND Application'}`,
                              ctdSection: ctd,
                            });
                            setRiViewMode('editor');
                            setLayoutMode('regulatory-workspace');
                          }}
                          onDraftWithAI={(sectionCode, sectionTitle) => {
                            const ctd = sectionCode.replace(/^m/, '');
                            setPendingEditorContent({
                              content: `<h1>${sectionTitle}</h1>\n<h2>Project: ${activeProject?.name || 'Untitled'} (${activeProject?.type || 'IND'})</h2>\n<p><strong>CTD Section:</strong> ${ctd}</p>\n<p><strong>Generated:</strong> ${new Date().toISOString().split('T')[0]}</p>\n<hr/>\n<h2>Section Content</h2>\n<p>[AI-assisted draft for ${sectionTitle}. This section should comply with ICH M4 guidelines and 21 CFR 312.23(a) requirements.]</p>`,
                              title: `${sectionTitle} — ${activeProject?.name || 'IND Application'}`,
                              ctdSection: ctd,
                            });
                            setRiViewMode('editor');
                            setLayoutMode('regulatory-workspace');
                          }}
                          onNavigateToCoAuthor={() => setLayoutMode('ectd-coauthor')}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                  {/* Right rail: Section context tabs */}
                  <INDRightRail
                    projectName={activeProject?.name}
                    submissionType={activeProject?.type}
                    indication={activeProject?.description}
                  />
                </div>
              )}
            </div>
          )}

          {/* Medical Device Dashboard — disabled (consolidated into RI Copilot workspace) */}

          {/* ── eCTD Co-Author (IND / NDA / BLA / 510k authoring) ─────────── */}
          {!embeddedModule && layoutMode === 'ectd-coauthor' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-ectd-coauthor">
              <WorkspaceHeader
                title="eCTD Co-Author"
                subtitle="IND · NDA · BLA · 510(k) · CTD section-by-section drafting"
                onBack={() => setLayoutMode('regulatory-workspace')}
              />
              {!activeProjectId ? (
                <div className="flex-1 flex items-center justify-center bg-zinc-50/50 p-8">
                  <div className="max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-50 flex items-center justify-center">
                      <FolderOpen className="w-8 h-8 text-blue-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-zinc-900 mb-2">eCTD Co-Author</h2>
                    <p className="text-sm text-zinc-500 mb-6">
                      Select a project to begin authoring CTD sections.
                    </p>
                    <button
                      onClick={() => setProjectSwitcherOpen(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Select Project
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  <ErrorBoundary>
                    <Suspense fallback={<ModuleLoadingFallback />}>
                      <ECTDCoAuthorStandalone
                        onOpenInEditor={section => {
                          console.log(
                            `[eCTD] Opening section ${section.number} "${section.title}" in Document Editor`
                          );
                          // Build populated content from the section
                          const sectionContent =
                            section.content && section.content.trim()
                              ? section.content
                              : `<h1>${section.number} ${section.title}</h1>
<p>This section covers the regulatory requirements for <strong>${section.title}</strong> as part of the CTD submission.</p>
<h2>Scope</h2>
<p>[Section content to be drafted. Use the RI Edit tools above to generate regulatory-compliant language.]</p>
<h2>References</h2>
<p>[Cross-references and source citations will be added here.]</p>`;
                          setPendingEditorContent({
                            title: `${section.number} ${section.title}`,
                            content: sectionContent,
                            ctdSection: section.number,
                          });
                          setRiViewMode('editor');
                          setLayoutMode('regulatory-workspace');
                        }}
                      />
                    </Suspense>
                  </ErrorBoundary>
                </div>
              )}
            </div>
          )}

          {/* ── CMC Platform (in-shell) ────────────────────────────────────── */}
          {!embeddedModule && layoutMode === 'cmc' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-cmc">
              <WorkspaceHeader
                title="CMC Platform"
                subtitle="Chemistry, Manufacturing & Controls · Drug Substance · Drug Product · Analytical Methods"
                onBack={() => setLayoutMode('regulatory-workspace')}
              />
              {!activeProjectId ? (
                <div className="flex-1 flex items-center justify-center bg-zinc-50/50 p-8">
                  <div className="max-w-md text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-teal-50 flex items-center justify-center">
                      <FolderOpen className="w-8 h-8 text-teal-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-zinc-900 mb-2">CMC Platform</h2>
                    <p className="text-sm text-zinc-500 mb-6">
                      Select a project to access Chemistry, Manufacturing & Controls modules.
                    </p>
                    <button
                      onClick={() => setProjectSwitcherOpen(true)}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors shadow-sm"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Select Project
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Module 3 traceability bar */}
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100 bg-zinc-50 flex-shrink-0">
                    <span className="text-xs font-medium text-zinc-600 mr-3">CTD Module 3 — Quality</span>
                    <button
                      onClick={() => {
                        setPendingEditorContent({
                          content: `<h1>Module 3.2.S — Drug Substance</h1>
<p>CTD Section 3.2.S for ${activeProject?.name || 'Drug Product'}.</p>
<h2>3.2.S.1 General Information</h2><p></p>
<h2>3.2.S.2 Manufacture</h2><p></p>
<h2>3.2.S.3 Characterisation</h2><p></p>
<h2>3.2.S.4 Control of Drug Substance</h2><p></p>
<h2>3.2.S.5 Reference Standards</h2><p></p>
<h2>3.2.S.6 Container Closure System</h2><p></p>
<h2>3.2.S.7 Stability</h2><p></p>`,
                          title: `Module 3.2.S — ${activeProject?.name || 'Drug Substance'}`,
                          ctdSection: '3.2.S',
                        });
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                      }}
                      className="text-xs px-3 py-1.5 rounded-md bg-white border border-zinc-200 text-zinc-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-colors font-medium shadow-sm"
                    >
                      Draft 3.2.S (Drug Substance)
                    </button>
                    <button
                      onClick={() => {
                        setPendingEditorContent({
                          content: `<h1>Module 3.2.P — Drug Product</h1>
<p>CTD Section 3.2.P for ${activeProject?.name || 'Drug Product'}.</p>
<h2>3.2.P.1 Description and Composition</h2><p></p>
<h2>3.2.P.2 Pharmaceutical Development</h2><p></p>
<h2>3.2.P.3 Manufacture</h2><p></p>
<h2>3.2.P.4 Control of Excipients</h2><p></p>
<h2>3.2.P.5 Control of Drug Product</h2><p></p>
<h2>3.2.P.6 Reference Standards</h2><p></p>
<h2>3.2.P.7 Container Closure System</h2><p></p>
<h2>3.2.P.8 Stability</h2><p></p>`,
                          title: `Module 3.2.P — ${activeProject?.name || 'Drug Product'}`,
                          ctdSection: '3.2.P',
                        });
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                      }}
                      className="text-xs px-3 py-1.5 rounded-md bg-white border border-zinc-200 text-zinc-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-colors font-medium shadow-sm"
                    >
                      Draft 3.2.P (Drug Product)
                    </button>
                    <button
                      onClick={() => {
                        setPendingEditorContent({
                          content: `<h1>Module 3.2.A — Appendices</h1>
<p>CTD Appendices for ${activeProject?.name || 'Drug Product'}.</p>
<h2>3.2.A.1 Facilities and Equipment</h2><p></p>
<h2>3.2.A.2 Adventitious Agents Safety Evaluation</h2><p></p>
<h2>3.2.A.3 Novel Excipients</h2><p></p>`,
                          title: `Module 3.2.A — ${activeProject?.name || 'Appendices'}`,
                          ctdSection: '3.2.A',
                        });
                        setRiViewMode('editor');
                        setLayoutMode('regulatory-workspace');
                      }}
                      className="text-xs px-3 py-1.5 rounded-md bg-white border border-zinc-200 text-zinc-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-colors font-medium shadow-sm"
                    >
                      Draft 3.2.A (Appendices)
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto">
                    <ErrorBoundary>
                      <Suspense fallback={<ModuleLoadingFallback />}>
                        <CMCModuleStandalone
                          onDocumentCreated={({ artifactId }: { artifactId: string }) => {
                            setOpenArtifactId(artifactId);
                            setRiViewMode('editor');
                            setLayoutMode('regulatory-workspace');
                          }}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Document Vault (in-shell) ──────────────────────────────────── */}
          {!embeddedModule && layoutMode === 'document-vault' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-document-vault">
              <WorkspaceHeader
                title="Document Vault"
                subtitle="Field-ready document control · Compliance · Audit trails"
                onBack={() => setLayoutMode('regulatory-workspace')}
              />
              <div className="flex-1 overflow-auto">
                <ErrorBoundary>
                  <Suspense fallback={<ModuleLoadingFallback />}>
                    <VaultPageStandalone />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          )}

          {/* ── Clinical Trial Hub (in-shell) ──────────────────────────────── */}
          {!embeddedModule && layoutMode === 'clinical-trial' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-clinical-trial">
              <WorkspaceHeader
                title="Clinical Trial Hub"
                subtitle="Study design · Protocol optimization · CSR intelligence · Trial management"
                onBack={() => setLayoutMode('regulatory-workspace')}
              />
              <div className="flex-1 overflow-auto">
                <ErrorBoundary>
                  <Suspense fallback={<ModuleLoadingFallback />}>
                    <StudyArchitectModuleStandalone />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          )}

          {/* ── Templates Library — browse and use regulatory templates ── */}
          {!embeddedModule && layoutMode === 'templates' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-templates">
              <WorkspaceHeader
                title="Template Library"
                subtitle="Browse, search, and use regulatory document templates for your submission type"
                onBack={() => setLayoutMode('author')}
              />
              <div className="flex-1 overflow-auto p-6">
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="flex-1 flex items-center justify-center bg-white h-full">
                        <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                      </div>
                    }
                  >
                    <TemplateLibraryInline
                      projectId={activeProjectId}
                      onUseTemplate={ctdSection => {
                        if (ctdSection) {
                          setPendingEditorContent({
                            content: `<h1>${ctdSection.toUpperCase()} — Draft</h1><p>Template content for ${activeProject?.name || 'Application'}.</p>`,
                            title: `${ctdSection.toUpperCase()} — ${activeProject?.name || 'Application'}`,
                            ctdSection: ctdSection.replace(/^m/, ''),
                          });
                        }
                        setLayoutMode('ectd-coauthor');
                      }}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          )}

          {/* Dossier Navigator — disabled (consolidated into IND Workspace) */}

          {/* ── Submission Operations Workspace (split-pane: list | inspector) ── */}
          {!embeddedModule && layoutMode === 'submission-workspace' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-submission-ops">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('regulatory-workspace')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Workspace</span>
                </button>
                <span className="text-zinc-200">·</span>
                <ShieldCheck className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-medium text-zinc-800">
                  {submissionWorkspaceLabel} — Submission Ops
                </span>
              </div>
              {!activeProjectId ? (
                <div className="flex-1 flex items-center justify-center bg-zinc-50/50 p-8">
                  <div className="max-w-md text-center">
                    <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-violet-400" />
                    <h2 className="text-lg font-semibold text-zinc-900 mb-2">
                      Submission Operations
                    </h2>
                    <p className="text-sm text-zinc-500 mb-4">
                      Select a project to view its submission readiness and blockers.
                    </p>
                    <button
                      onClick={() => setProjectSwitcherOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
                    >
                      Select Project
                    </button>
                  </div>
                </div>
              ) : (
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                      </div>
                    }
                  >
                    <SubmissionOpsCommandCenter
                      projectId={activeProjectId}
                      projectName={activeProject?.name}
                      onNavigateToArtifact={artifactId => {
                        setLayoutMode('regulatory-workspace');
                      }}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
            </div>
          )}

          {/* ── Enablement Center — Dr. Sage + AnA 1.0 dual-AI hub ── */}
          {!embeddedModule && layoutMode === 'enablement-center' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-enablement-center">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
                        <p className="text-sm text-zinc-500">Loading Enablement Center...</p>
                      </div>
                    </div>
                  }
                >
                  <EnablementCenter
                    onClose={() => setLayoutMode('regulatory-workspace')}
                    contextProfile={{
                      productType: activeProject?.type,
                      userRole: userRole,
                      clientType: industryMode,
                    }}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Author Workspace — unified submission authoring ── */}
          {!embeddedModule && layoutMode === 'author' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-author">
              {/* Author workspace routes to IND/eCTD/CMC/Clinical based on context */}
              <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Home</span>
                </button>
                <div className="w-px h-4 bg-zinc-200" />
                <PenLine className="w-4 h-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-900">Author</span>
                {activeProject && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium">
                    {activeProject.name}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <div className="flex items-center rounded-md border border-zinc-200 overflow-hidden">
                    {[
                      { key: 'ind-workspace', label: 'Dossier' },
                      { key: 'ectd-coauthor', label: 'Co-Author' },
                      { key: 'cmc', label: 'CMC' },
                      { key: 'clinical-trial', label: 'Clinical' },
                      { key: 'templates', label: 'Templates' },
                    ].map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setLayoutMode(tab.key as LayoutMode)}
                        className={cn(
                          'px-2.5 py-1 text-[11px] font-medium transition-colors',
                          layoutMode === tab.key
                            ? 'bg-zinc-100 text-zinc-900'
                            : 'text-zinc-500 hover:bg-zinc-50'
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Default: show IND workspace */}
              <div className="flex-1 flex min-h-0 overflow-auto">
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="flex-1 flex items-center justify-center bg-white">
                        <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                      </div>
                    }
                  >
                    <INDWorkspace
                      projectId={activeProjectId}
                      projectName={activeProject?.name || 'Untitled Project'}
                      submissionType={activeProject?.type || 'IND'}
                      onOpenSection={sectionCode => {
                        setPendingEditorContent({
                          content: `<h1>${sectionCode.toUpperCase()} — Draft</h1><p>Section content for ${activeProject?.name || 'Application'}.</p>`,
                          title: `${sectionCode.toUpperCase()} — ${activeProject?.name || 'Application'}`,
                          ctdSection: sectionCode.replace(/^m/, ''),
                        });
                        setLayoutMode('ectd-coauthor');
                      }}
                      onDraftWithAI={sectionCode => {
                        setLayoutMode('ectd-coauthor');
                      }}
                      onNavigateToCoAuthor={() => setLayoutMode('ectd-coauthor')}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          )}

          {/* ── Intelligence Hub — research, evidence, predictions ── */}
          {!embeddedModule && layoutMode === 'intelligence-hub' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-intelligence-hub">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                    </div>
                  }
                >
                  <IntelligenceHub onClose={() => setLayoutMode('projects')} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Review & Readiness — quality, compliance, stress-testing ── */}
          {!embeddedModule && layoutMode === 'review-readiness' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-review-readiness">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                    </div>
                  }
                >
                  <ReviewReadiness onClose={() => setLayoutMode('projects')} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Command Center — operations, submissions, governance ── */}
          {!embeddedModule && layoutMode === 'command-center' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-command-center">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                    </div>
                  }
                >
                  <CommandCenterHub onClose={() => setLayoutMode('projects')} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Platform Admin — API keys, users, billing, modules (Regulatory Command Center) ── */}
          {!embeddedModule && layoutMode === 'platform-admin' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-platform-admin">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                    </div>
                  }
                >
                  <PlatformAdminPage />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Biologics Dashboard — biologic/biosimilar pathway intelligence ── */}
          {!embeddedModule && layoutMode === 'biologics-dashboard' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-biologics">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                    </div>
                  }
                >
                  <BiologicsDashboardPage />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── CTD Onboarding — client CTD ingestion wizard ── */}
          {!embeddedModule && layoutMode === 'ctd-onboarding' && (
            <div className="flex-1 flex flex-col min-h-0 p-6" data-testid="workspace-ctd-onboarding">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                    </div>
                  }
                >
                  <CTDOnboardingWizardPage onComplete={() => setLayoutMode('projects')} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Client Intelligence — company persona, document ingestion, memory ── */}
          {!embeddedModule && layoutMode === 'client-intelligence' && (
            <div
              className="flex-1 flex flex-col min-h-0"
              data-testid="workspace-client-intelligence"
            >
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-300" />
                    </div>
                  }
                >
                  <ClientIntelligencePage />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Collaboration Hub — threaded collaboration, reviews, decisions ── */}
          {!embeddedModule && layoutMode === 'collaboration-hub' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-collaboration-hub">
              {/* Workspace header — breadcrumb pattern */}
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Home</span>
                </button>
                <span className="text-zinc-200">&middot;</span>
                <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-medium text-zinc-800">Collaboration</span>
                {activeProject && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium">
                    {activeProject.name}
                  </span>
                )}
              </div>
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  }
                >
                  <CollaborationHubPage
                    programId={activeProjectId ? Number(activeProjectId) : null}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── User Inbox — personal command center with worklist, approvals, alerts ── */}
          {!embeddedModule && layoutMode === 'user-inbox' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-user-inbox">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  }
                >
                  <UserInboxPage />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Client Branding — logo, letterhead, templates ── */}
          {!embeddedModule && layoutMode === 'client-branding' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto bg-[#FAFAF9]" data-testid="workspace-client-branding">
              <div className="p-6">
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                      </div>
                    }
                  >
                    <ClientBrandingSettings />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          )}

          {/* ── Biostatistics Platform — power, endpoints, design ── */}
          {!embeddedModule && layoutMode === 'biostatistics' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-biostatistics">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Home</span>
                </button>
                <span className="text-zinc-200">&middot;</span>
                <FlaskConical className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-medium text-zinc-800">Biostatistics</span>
                {activeProject && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium">
                    {activeProject.name}
                  </span>
                )}
              </div>
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  }
                >
                  <BiostatPlatformDashboard />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Training Center — onboarding, courses, guides ── */}
          {!embeddedModule && layoutMode === 'training-center' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-training-center">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Home</span>
                </button>
                <span className="text-zinc-200">&middot;</span>
                <BookOpen className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-medium text-zinc-800">Training Center</span>
              </div>
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  }
                >
                  <TrainingManagementPage />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* Enterprise Integrations — connectors & API management */}
          {!embeddedModule && layoutMode === 'integrations' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-integrations">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Home</span>
                </button>
                <span className="text-zinc-200">&middot;</span>
                <Link2 className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-medium text-zinc-800">Integrations</span>
              </div>
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  }
                >
                  <IntegrationsPage />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}


          {/* ── Client Onboarding — setup wizard, configuration ── */}
          {!embeddedModule && layoutMode === 'client-onboarding' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-client-onboarding">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Home</span>
                </button>
                <span className="text-zinc-200">&middot;</span>
                <Rocket className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-medium text-zinc-800">Client Onboarding</span>
              </div>
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  }
                >
                  <OnboardingWizardPage />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Knowledge Base — account-level skills, .MD upload, materials ── */}
          {!embeddedModule && layoutMode === 'knowledge-base' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-knowledge-base">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Home</span>
                </button>
                <span className="text-zinc-200">&middot;</span>
                <Upload className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-medium text-zinc-800">Knowledge Base</span>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-3xl mx-auto">
                  <div className="mb-6">
                    <h2 className="text-lg font-semibold text-zinc-900 mb-1">
                      Account Knowledge Base
                    </h2>
                    <p className="text-sm text-zinc-500 leading-relaxed">
                      Upload materials, skills files, and .MD documents for AnA to learn from. This
                      knowledge applies across all projects in your organization.
                    </p>
                  </div>
                  <CustomInstructions
                    value={customInstructions}
                    onChange={async val => {
                      setCustomInstructions(val);
                      try {
                        await fetch('/api/project-knowledge/instructions', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ instructions: val }),
                        });
                      } catch {
                        /* silently fail */
                      }
                    }}
                    projectType={activeProject?.type}
                    defaultOpen
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Project Knowledge — project-level context, uploads, sources ── */}
          {!embeddedModule && layoutMode === 'project-knowledge' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-project-knowledge">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Home</span>
                </button>
                <span className="text-zinc-200">&middot;</span>
                <FileStack className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-medium text-zinc-800">Project Knowledge</span>
                {activeProject && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium">
                    {activeProject.name}
                  </span>
                )}
              </div>
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center bg-white">
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                    </div>
                  }
                >
                  <ProjectKnowledgePanel projectId={activeProjectId || null} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Legal Center — IP, contracts, regulatory law ── */}
          {/* Artifacts Gallery — browsable outputs and templates */}
          {!embeddedModule && layoutMode === 'artifacts' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-artifacts">
              <Suspense fallback={<ModuleLoadingFallback />}>
                <ArtifactsGalleryPage />
              </Suspense>
            </div>
          )}

          {!embeddedModule && layoutMode === 'legal-center' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-legal-center">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Home</span>
                </button>
                <span className="text-zinc-200">&middot;</span>
                <Scale className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-medium text-zinc-800">Legal Center</span>
              </div>
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-300" />
                  </div>
                }
              >
                <LegalCenterPage onClose={() => setLayoutMode('projects')} />
              </Suspense>
            </div>
          )}

          {/* ── Document Builder — CSR + CTD wizard across global agencies ── */}
          {!embeddedModule && layoutMode === 'document-builder' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-document-builder">
              <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Home</span>
                </button>
                <span className="text-zinc-200">&middot;</span>
                <BookOpen className="w-3.5 h-3.5 text-violet-500" />
                <span className="text-xs font-medium text-zinc-800">Document Builder</span>
              </div>
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-300" />
                  </div>
                }
              >
                <FullDocumentBuilder />
              </Suspense>
            </div>
          )}

          {/* ── Intelligent Report Engine — immutable records, atom provenance, quasi-indemnification ── */}
          {!embeddedModule && layoutMode === 'report-engine' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-report-engine">
              <Suspense
                fallback={
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-zinc-300" />
                  </div>
                }
              >
                <IntelligentReportGenerator />
              </Suspense>
            </div>
          )}

          {/* ── Ana Dashboard — regulatory intelligence, gap analysis, change impact ── */}
          {!embeddedModule && layoutMode === 'ana-dashboard' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-ana-dashboard">
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>}>
                <AnaDashboardPage projectId={activeProjectId} />
              </Suspense>
            </div>
          )}

          {/* ── Safety Narrative — ICH E3 §12 compliant narrative generation ── */}
          {!embeddedModule && layoutMode === 'safety-narrative' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-safety-narrative">
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>}>
                <SafetyNarrativePage projectId={activeProjectId} />
              </Suspense>
            </div>
          )}

          {/* ── Ana Platform Control — agentic settings, modules, onboarding ── */}
          {!embeddedModule && layoutMode === 'ana-platform-control' && (
            <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-ana-platform-control">
              <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>}>
                <AnaPlatformControlPage />
              </Suspense>
            </div>
          )}

          {/* Precedent Intelligence — disabled (consolidated into Intelligence Hub) */}

          {/* Redirect deprecated routes to unified workspace */}
          {['workspace', 'medtech-dashboard', 'dossier', 'precedent-intelligence'].includes(
            layoutMode
          ) && <RedirectToWorkspace onRedirect={() => setLayoutMode('regulatory-workspace')} />}

          {/* ── Project Workspace (3-pane: tree | content | inspector) ───── */}
          {!embeddedModule &&
            layoutMode === 'regulatory-workspace' &&
            (riViewMode === 'intelligence' ? (
              <div className="flex-1 flex flex-col min-h-0" data-testid="workspace-ri-copilot">
                {/* Intelligence mode header */}
                <div className="flex items-center gap-2 px-3 h-9 border-b border-zinc-100 bg-white flex-shrink-0">
                  <button
                    onClick={() => setLayoutMode('projects')}
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Home</span>
                  </button>
                  <span className="text-zinc-200">·</span>
                  <Brain className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-zinc-800">RI Copilot</span>
                  {activeProject && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 font-medium">
                      {activeProject.name}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <div className="flex items-center rounded-md border border-zinc-200 overflow-hidden">
                      <button
                        data-testid="view-toggle-intelligence"
                        onClick={() => setRiViewMode('intelligence')}
                        className={cn(
                          'px-2 py-0.5 text-[11px] font-medium transition-colors',
                          'bg-blue-100 text-blue-700'
                        )}
                      >
                        Intelligence
                      </button>
                      <button
                        data-testid="view-toggle-editor"
                        onClick={() => setRiViewMode('editor')}
                        className="px-2 py-0.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-50 transition-colors"
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
                        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
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
              />
            ))}
          {/* Rules Engine Manager */}
          {!embeddedModule && layoutMode === 'rules' && (
            <div
              className="flex-1 flex flex-col min-h-0 overflow-y-auto"
              data-testid="workspace-rules"
            >
              <ErrorBoundary>
                <Suspense fallback={<ModuleLoadingFallback />}>
                  <RulesManager onBack={() => setLayoutMode('mission-control')} />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {/* ── Projects Index ─────────────────────────────────────────────── */}
          {!embeddedModule && layoutMode === 'projects' && (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-zinc-300" />
                </div>
              }
            >
              <PlatformHome
                userName={userName}
                projects={projects}
                onProjectClick={projectId => {
                  navInProgressRef.current = true;
                  setActiveProjectId(projectId);
                  setRiViewMode('editor');
                  setLayoutMode('regulatory-workspace');
                  navigate(`/concept2cure/project/${projectId}`);
                }}
                onNewProject={() => setNewProjectOpen(true)}
                onNavigate={mode => setLayoutMode(mode as LayoutMode)}
                workspaceSummary={workspaceSummary}
              />
            </Suspense>
          )}

          {/* ── Project Workspace — Claude.ai-style project view ──────── */}
          {!embeddedModule && layoutMode === 'workspace' && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* ── Project Header — Claude.ai style: breadcrumb + title + star ── */}
              <div className="flex-shrink-0 bg-white px-6 pt-6 pb-4">
                {/* Breadcrumb */}
                <button
                  onClick={() => setLayoutMode('projects')}
                  className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 transition-colors mb-3"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  All projects
                </button>

                {/* Project title + actions */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl font-semibold text-zinc-900 truncate">
                      {activeProject?.name || 'Untitled Project'}
                    </h1>
                    {activeProject?.description && (
                      <p className="text-sm text-zinc-500 mt-1 line-clamp-2">
                        {activeProject.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                    <button
                      onClick={() => setEditProjectOpen(true)}
                      title="Project settings"
                      className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
                    >
                      <PenLine className="w-4 h-4" />
                    </button>
                    <button
                      className="p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                      title="Star project"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
              {/* Removed old tab toggles — ProjectSidebar now handles Context/Instructions/Files */}

              {/* ── Workspace body: AnA chat + right panel ───────────── */}
              <div className="flex-1 flex min-h-0">
                {/* Center: AnA (the ONE chat — Claude.ai style) */}
                <AnaPersistentPanel
                  mode="full"
                  contextProfile={{
                    productType: activeProject?.type,
                    userRole: userRole,
                    screenName: 'regulatory-workspace',
                    activeProject: activeProject?.name,
                    projectId: activeProjectId,
                  }}
                  greeting={
                    platformGreeting?.text ||
                    `How can I help with ${activeProject?.name || 'your project'}?`
                  }
                  suggestedActions={workspaceSuggestedActions}
                  onActionRun={handleActionRun}
                  initialMessage={
                    pendingDraftSection
                      ? `Draft CTD section ${pendingDraftSection.code}: ${pendingDraftSection.title}. Generate a compliant first draft following ICH M4 guidelines and 21 CFR 312.23(a) requirements.`
                      : null
                  }
                />

                {/* Right sidebar: Claude.ai-style (Context, Instructions, Files) */}
                {/* Desktop: static panel */}
                <div className="w-72 xl:w-80 border-l border-zinc-100 bg-white flex-shrink-0 hidden lg:flex">
                  <ProjectSidebar
                    projectId={activeProjectId ?? null}
                    projectType={activeProject?.type}
                  />
                </div>
                {/* Mobile/Tablet: floating toggle + slide-over drawer */}
                {workspacePanelOpen && (
                  <>
                    <div
                      className="fixed inset-0 bg-black/30 z-40 lg:hidden"
                      onClick={() => setWorkspacePanelOpen(false)}
                    />
                    <div className="fixed right-0 top-0 bottom-0 w-80 bg-white border-l border-zinc-200 shadow-xl z-50 lg:hidden">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
                        <span className="text-sm font-medium text-zinc-700">Project Context</span>
                        <button
                          onClick={() => setWorkspacePanelOpen(false)}
                          className="p-1 hover:bg-zinc-100 rounded"
                        >
                          <X className="w-4 h-4 text-zinc-400" />
                        </button>
                      </div>
                      <ProjectSidebar
                        projectId={activeProjectId ?? null}
                        projectType={activeProject?.type}
                      />
                    </div>
                  </>
                )}
                {/* Mobile toggle button */}
                <button
                  onClick={() => setWorkspacePanelOpen(true)}
                  className="fixed right-4 bottom-4 z-30 lg:hidden w-10 h-10 bg-zinc-900 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-zinc-800 transition-colors"
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
                      <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
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

        {/* AnA — THE single chat surface
            workspace/regulatory-workspace: rendered inline above (mode="full")
            module pages: shown here as compact input bar at bottom
            projects/home: shown here as full chat (no module content above) */}
        {layoutMode !== 'workspace' && layoutMode !== 'regulatory-workspace' && (
          <AnaPersistentPanel
            mode={layoutMode === 'projects' || layoutMode === 'deep-research' ? 'full' : 'compact'}
            defaultChatMode={layoutMode === 'deep-research' ? 'deep-research' : 'standard'}
            contextProfile={{
              productType: activeProject?.type,
              userRole: userRole,
              screenName: layoutMode,
              activeProject: activeProject?.name,
              projectId: activeProjectId,
            }}
            greeting={
              layoutMode === 'deep-research'
                ? "What would you like to research? I'll search across ClinicalTrials.gov, PubMed, FDA, EMA, and more."
                : platformGreeting?.text
            }
            suggestedActions={layoutMode === 'projects' ? workspaceSuggestedActions : undefined}
            onActionRun={handleActionRun}
          />
        )}
      </div>

      {/* Dr. Sage — Persistent global help/guide/copilot layer */}
      <DrSageGlobalLayer
        onOpenEnablementCenter={() => setLayoutMode('enablement-center')}
        contextProfile={{
          productType: activeProject?.type,
          userRole: userRole,
          screenName: layoutMode,
          activeProject: activeProject?.name,
        }}
      />

      {/* AnA — moved to inline bottom bar (see below) */}

      {/* Command palette */}
      <ZenCommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onAction={handleCommandAction}
      />

      {/* Settings */}
      <ZenSettings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Project switcher - Connected to data layer */}
      <ProjectSwitcher
        isOpen={projectSwitcherOpen}
        onClose={() => setProjectSwitcherOpen(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={id => {
          setActiveProjectId(id);
          setProjectSwitcherOpen(false);
          setRiViewMode('editor');
          setLayoutMode('regulatory-workspace');
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

      {/* Edit project modal */}
      <EditProjectModal
        isOpen={editProjectOpen}
        onClose={() => setEditProjectOpen(false)}
        initialData={{
          name: activeProject?.name ?? '',
          description: activeProject?.description,
          sponsor: activeProject?.sponsor,
          product: activeProject?.product,
          region: activeProject?.region,
        }}
        onSave={handleEditProject}
      />

      {/* First-run onboarding experience */}
      {showFirstRun && (
        <Suspense fallback={null}>
          <FirstRunExperience
            userName={userName}
            existingProjects={projects}
            onComplete={selectedRole => {
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
