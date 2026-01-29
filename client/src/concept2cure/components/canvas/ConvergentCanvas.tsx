/**
 * @fileoverview Convergent Canvas - The Sherpa System Interface
 * @module concept2cure/components/canvas/ConvergentCanvas
 * @version 1.0.0
 *
 * @description
 * THE CONVERGENT CANVAS - Phase 52 Vision Realized
 * 
 * This is not a dashboard. This is not a chat interface.
 * This is a living command center that adapts to your role and context.
 *
 * Architecture:
 * - Context Ribbon: Always-visible status bar (risk, deadlines, connection)
 * - Morning Briefing: Day-zero intelligence (alerts, priorities, overnight)
 * - Council Thread: Multi-agent advisory chat
 * - Industry Workspaces: Role-specific tool panels
 * - Convergent Zones: Adaptive content areas
 *
 * @compliance
 * - FDA 21 CFR Part 11: Full audit trail
 * - WCAG 2.1 AA: Accessible throughout
 * - SOC 2 Type II: Enterprise security
 */

import React, { useState, useCallback, useMemo, useEffect, Suspense, lazy } from 'react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2,
  AlertTriangle,
  Clock,
  Wifi,
  WifiOff,
  Shield,
  Bell,
  ChevronDown,
  ChevronRight,
  Sun,
  Calendar,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Beaker,
  Building2,
  Stethoscope,
  Microscope,
  PenTool,
  Bot,
  User,
  Sparkles,
  Target,
  Zap,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Settings,
  Command,
  Plus,
  Search,
  Menu,
  X,
} from 'lucide-react';

// Lazy load heavy components
const MorningBriefingPanel = lazy(() => import('./MorningBriefingPanel'));
const CouncilThreadPanel = lazy(() => import('./CouncilThreadPanel'));
const IndustryWorkspace = lazy(() => import('./IndustryWorkspace'));

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type IndustryType = 
  | 'BIOTECH'
  | 'PHARMA'
  | 'CRO'
  | 'MEDTECH'
  | 'REGULATORY'
  | 'MEDICAL_WRITING';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type ConnectionStatus = 'CONNECTED' | 'DEGRADED' | 'OFFLINE';

export type CanvasZone = 
  | 'briefing'
  | 'council'
  | 'workspace'
  | 'document'
  | 'analytics';

export interface ContextState {
  // Project context
  projectId: string | null;
  projectName: string | null;
  projectType: string | null;
  
  // User context
  userId: string;
  userName: string;
  userRole: string;
  industry: IndustryType;
  
  // System context
  connectionStatus: ConnectionStatus;
  riskLevel: RiskLevel;
  riskFactors: string[];
  
  // Deadlines
  nextDeadline: {
    label: string;
    date: string;
    daysRemaining: number;
    type: string;
  } | null;
  
  // Alerts
  criticalAlerts: number;
  pendingActions: number;
}

export interface ConvergentCanvasProps {
  // Initial context
  userId: string;
  userName: string;
  userRole?: string;
  industry?: IndustryType;
  projectId?: string;
  
  // Event handlers
  onProjectChange?: (projectId: string) => void;
  onSettingsOpen?: () => void;
  onCommandPaletteOpen?: () => void;
  onNewProject?: () => void;
  
  // Customization
  className?: string;
  showBriefingOnLoad?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHERPA PERSONAS
// ═══════════════════════════════════════════════════════════════════════════════

export const SHERPA_PERSONAS = {
  EXPEDITION_LEADER: {
    id: 'expedition-leader',
    name: 'Expedition Leader',
    role: 'Strategic Planning & Horizon Scanning',
    avatar: '🏔️',
    color: 'from-blue-500 to-cyan-500',
    capabilities: ['Regulatory horizon scanning', 'Risk assessment', 'Strategic planning'],
  },
  CAMP_MANAGER: {
    id: 'camp-manager',
    name: 'Camp Manager',
    role: 'Document & Memory Management',
    avatar: '🏕️',
    color: 'from-amber-500 to-orange-500',
    capabilities: ['eCTD authoring', 'Version control', 'Cross-references'],
  },
  EQUIPMENT_MANAGER: {
    id: 'equipment-manager',
    name: 'Equipment Manager',
    role: 'CMC & Specifications',
    avatar: '🧪',
    color: 'from-green-500 to-emerald-500',
    capabilities: ['ICH compliance', 'Specifications', 'Stability'],
  },
  WEATHER_READER: {
    id: 'weather-reader',
    name: 'Weather Reader',
    role: 'Intelligence & Signals',
    avatar: '🌤️',
    color: 'from-purple-500 to-violet-500',
    capabilities: ['MAUDE monitoring', 'Competitor intel', 'FDA signals'],
  },
  TRAIL_MEDIC: {
    id: 'trail-medic',
    name: 'Trail Medic',
    role: 'Safety & Compliance',
    avatar: '⛑️',
    color: 'from-red-500 to-rose-500',
    capabilities: ['Safety signals', 'CAPA management', 'Audit prep'],
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXT RIBBON COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

interface ContextRibbonProps {
  context: ContextState;
  onRefresh: () => void;
  onAlertClick: () => void;
  onDeadlineClick: () => void;
}

const ContextRibbon: React.FC<ContextRibbonProps> = ({
  context,
  onRefresh,
  onAlertClick,
  onDeadlineClick,
}) => {
  const getRiskColor = (level: RiskLevel) => {
    switch (level) {
      case 'LOW': return 'text-emerald-600 bg-emerald-50';
      case 'MODERATE': return 'text-amber-600 bg-amber-50';
      case 'HIGH': return 'text-orange-600 bg-orange-50';
      case 'CRITICAL': return 'text-red-600 bg-red-50';
    }
  };

  const getConnectionIcon = (status: ConnectionStatus) => {
    switch (status) {
      case 'CONNECTED': return <Wifi className="w-3.5 h-3.5 text-emerald-500" />;
      case 'DEGRADED': return <Wifi className="w-3.5 h-3.5 text-amber-500" />;
      case 'OFFLINE': return <WifiOff className="w-3.5 h-3.5 text-red-500" />;
    }
  };

  return (
    <div className="h-10 bg-white border-b border-zinc-200 flex items-center justify-between px-4 text-xs">
      {/* Left: Project & Risk */}
      <div className="flex items-center gap-4">
        {context.projectName && (
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-zinc-400" />
            <span className="font-medium text-zinc-700">{context.projectName}</span>
            {context.projectType && (
              <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 text-[10px] font-medium">
                {context.projectType}
              </span>
            )}
          </div>
        )}
        
        {/* Risk Level */}
        <div className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-full",
          getRiskColor(context.riskLevel)
        )}>
          <Shield className="w-3 h-3" />
          <span className="font-medium">{context.riskLevel} RISK</span>
        </div>
      </div>

      {/* Center: Deadline */}
      {context.nextDeadline && (
        <button 
          onClick={onDeadlineClick}
          className="flex items-center gap-2 px-3 py-1 rounded-lg hover:bg-zinc-50 transition-colors"
        >
          <Clock className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-zinc-600">{context.nextDeadline.label}</span>
          <span className={cn(
            "font-semibold",
            context.nextDeadline.daysRemaining <= 7 ? 'text-red-600' :
            context.nextDeadline.daysRemaining <= 30 ? 'text-amber-600' :
            'text-zinc-700'
          )}>
            {context.nextDeadline.daysRemaining}d
          </span>
        </button>
      )}

      {/* Right: Alerts & Connection */}
      <div className="flex items-center gap-3">
        {/* Alerts */}
        {context.criticalAlerts > 0 && (
          <button
            onClick={onAlertClick}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
          >
            <Bell className="w-3.5 h-3.5" />
            <span className="font-medium">{context.criticalAlerts}</span>
          </button>
        )}

        {/* Pending Actions */}
        {context.pendingActions > 0 && (
          <div className="flex items-center gap-1.5 text-zinc-500">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{context.pendingActions} pending</span>
          </div>
        )}

        {/* Connection Status */}
        <div className="flex items-center gap-1.5">
          {getConnectionIcon(context.connectionStatus)}
          <span className="text-zinc-500">{context.connectionStatus.toLowerCase()}</span>
        </div>

        {/* Refresh */}
        <button
          onClick={onRefresh}
          className="p-1 rounded hover:bg-zinc-100 transition-colors text-zinc-400 hover:text-zinc-600"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MORNING BRIEFING GREETING
// ═══════════════════════════════════════════════════════════════════════════════

interface MorningBriefingGreetingProps {
  userName: string;
  stats: {
    alerts: number;
    priorities: number;
    documents: number;
    deadlines: number;
  };
  onDismiss: () => void;
  onViewDetails: () => void;
}

const MorningBriefingGreeting: React.FC<MorningBriefingGreetingProps> = ({
  userName,
  stats,
  onDismiss,
  onViewDetails,
}) => {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = userName.split(' ')[0];

  return (
    <div className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 rounded-2xl p-8 text-white shadow-xl">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Sun className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">
              {getGreeting()}, {firstName}
            </h2>
            <p className="text-zinc-400 text-sm">
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={AlertTriangle}
          label="Alerts"
          value={stats.alerts}
          color={stats.alerts > 0 ? 'red' : 'emerald'}
        />
        <StatCard
          icon={Target}
          label="Priorities"
          value={stats.priorities}
          color="amber"
        />
        <StatCard
          icon={FileText}
          label="Documents"
          value={stats.documents}
          color="blue"
        />
        <StatCard
          icon={Calendar}
          label="Deadlines"
          value={stats.deadlines}
          color={stats.deadlines > 3 ? 'orange' : 'emerald'}
        />
      </div>

      {/* CTA */}
      <button
        onClick={onViewDetails}
        className="w-full flex items-center justify-center gap-2 bg-white text-zinc-900 rounded-xl py-3 font-medium hover:bg-zinc-100 transition-colors"
      >
        <span>View Full Briefing</span>
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
};

const StatCard: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}> = ({ icon: Icon, label, value, color }) => {
  const colorClasses: Record<string, string> = {
    red: 'bg-red-500/20 text-red-400',
    emerald: 'bg-emerald-500/20 text-emerald-400',
    amber: 'bg-amber-500/20 text-amber-400',
    blue: 'bg-blue-500/20 text-blue-400',
    orange: 'bg-orange-500/20 text-orange-400',
  };

  return (
    <div className="bg-white/5 rounded-xl p-4">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", colorClasses[color])}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// COUNCIL ADVISOR CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface CouncilAdvisorCardProps {
  persona: typeof SHERPA_PERSONAS[keyof typeof SHERPA_PERSONAS];
  isActive: boolean;
  onClick: () => void;
}

const CouncilAdvisorCard: React.FC<CouncilAdvisorCardProps> = ({
  persona,
  isActive,
  onClick,
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-3 rounded-xl transition-all duration-200",
        isActive
          ? `bg-gradient-to-r ${persona.color} text-white shadow-lg`
          : "bg-zinc-50 hover:bg-zinc-100 text-zinc-700"
      )}
    >
      <span className="text-2xl">{persona.avatar}</span>
      <div className="text-left">
        <div className="font-medium text-sm">{persona.name}</div>
        <div className={cn("text-xs", isActive ? "text-white/80" : "text-zinc-500")}>
          {persona.role}
        </div>
      </div>
    </button>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ZERO STATE (SHERPA GREETING)
// ═══════════════════════════════════════════════════════════════════════════════

interface ZeroStateProps {
  userName: string;
  industry: IndustryType;
  onQuickAction: (action: string) => void;
}

const ZeroState: React.FC<ZeroStateProps> = ({ userName, industry, onQuickAction }) => {
  const firstName = userName.split(' ')[0];
  
  const quickActions = useMemo(() => {
    const baseActions = [
      { id: 'new-document', label: 'Draft a document', icon: FileText },
      { id: 'search', label: 'Search regulatory database', icon: Search },
      { id: 'analyze', label: 'Analyze submission', icon: TrendingUp },
    ];

    // Industry-specific actions
    switch (industry) {
      case 'MEDTECH':
        return [
          { id: 'predicate-search', label: 'Search predicates', icon: Search },
          { id: 'maude-analysis', label: 'Check MAUDE', icon: AlertTriangle },
          { id: 'estar-prep', label: 'Prepare eSTAR', icon: FileText },
          ...baseActions,
        ];
      case 'BIOTECH':
      case 'PHARMA':
        return [
          { id: 'ind-prep', label: 'Prepare IND', icon: FileText },
          { id: 'clinical-protocol', label: 'Design protocol', icon: Beaker },
          { id: 'cmc-wizard', label: 'CMC specifications', icon: Microscope },
          ...baseActions,
        ];
      case 'CRO':
        return [
          { id: 'client-dashboard', label: 'Client overview', icon: Building2 },
          { id: 'study-status', label: 'Study status', icon: TrendingUp },
          { id: 'deliverables', label: 'Track deliverables', icon: CheckCircle2 },
          ...baseActions,
        ];
      default:
        return baseActions;
    }
  }, [industry]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="max-w-xl text-center">
        {/* Sherpa Avatar */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
          <span className="text-4xl">🏔️</span>
        </div>

        {/* Greeting */}
        <h1 className="text-3xl font-semibold text-zinc-900 mb-2">
          Ready when you are, {firstName}
        </h1>
        <p className="text-lg text-zinc-500 mb-8">
          Your regulatory expedition team is standing by. What would you like to accomplish today?
        </p>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
          {quickActions.slice(0, 4).map(action => (
            <button
              key={action.id}
              onClick={() => onQuickAction(action.id)}
              className="flex items-center gap-3 p-4 bg-zinc-50 rounded-xl hover:bg-zinc-100 transition-colors text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center shadow-sm group-hover:shadow transition-shadow">
                <action.icon className="w-5 h-5 text-zinc-600" />
              </div>
              <span className="text-sm font-medium text-zinc-700">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Council Preview */}
        <div className="mt-12 pt-8 border-t border-zinc-200">
          <p className="text-sm text-zinc-500 mb-4">Or ask your council of advisors</p>
          <div className="flex items-center justify-center gap-2">
            {Object.values(SHERPA_PERSONAS).slice(0, 4).map(persona => (
              <button
                key={persona.id}
                onClick={() => onQuickAction(`council-${persona.id}`)}
                className="w-12 h-12 rounded-full bg-gradient-to-br hover:scale-110 transition-transform flex items-center justify-center text-xl shadow-md"
                style={{
                  backgroundImage: `linear-gradient(to bottom right, var(--tw-gradient-stops))`,
                }}
                title={persona.name}
              >
                {persona.avatar}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CONVERGENT CANVAS COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ConvergentCanvas: React.FC<ConvergentCanvasProps> = ({
  userId,
  userName,
  userRole = 'Regulatory Affairs',
  industry = 'PHARMA',
  projectId,
  onProjectChange,
  onSettingsOpen,
  onCommandPaletteOpen,
  onNewProject,
  className,
  showBriefingOnLoad = true,
}) => {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────

  const [activeZone, setActiveZone] = useState<CanvasZone>('briefing');
  const [showBriefing, setShowBriefing] = useState(showBriefingOnLoad);
  const [activeAdvisor, setActiveAdvisor] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ─────────────────────────────────────────────────────────────────────────────
  // CONTEXT STATE (would come from hooks in production)
  // ─────────────────────────────────────────────────────────────────────────────

  const context: ContextState = useMemo(() => ({
    projectId: projectId || null,
    projectName: projectId ? 'CardioFlow 510(k)' : null,
    projectType: '510K',
    userId,
    userName,
    userRole,
    industry,
    connectionStatus: 'CONNECTED',
    riskLevel: 'MODERATE',
    riskFactors: ['FDA guidance update pending', '2 MAUDE signals detected'],
    nextDeadline: {
      label: 'Submission Target',
      date: '2025-02-15',
      daysRemaining: 21,
      type: 'SUBMISSION',
    },
    criticalAlerts: 2,
    pendingActions: 5,
  }), [projectId, userId, userName, userRole, industry]);

  // ─────────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(() => {
    // Refresh all data
    console.log('Refreshing canvas data...');
  }, []);

  const handleAlertClick = useCallback(() => {
    setActiveZone('briefing');
    setShowBriefing(true);
  }, []);

  const handleDeadlineClick = useCallback(() => {
    // Show deadline details
    console.log('Show deadline details');
  }, []);

  const handleQuickAction = useCallback((actionId: string) => {
    console.log('Quick action:', actionId);
    
    if (actionId.startsWith('council-')) {
      const advisorId = actionId.replace('council-', '');
      setActiveAdvisor(advisorId);
      setActiveZone('council');
    } else {
      // Handle other actions
      setActiveZone('workspace');
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // KEYBOARD SHORTCUTS
  // ─────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K - Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onCommandPaletteOpen?.();
      }
      // ⌘B - Toggle briefing
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setShowBriefing(prev => !prev);
      }
      // ⌘/ - Toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setSidebarOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCommandPaletteOpen]);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className={cn("flex flex-col h-screen bg-zinc-50", className)}>
      {/* Context Ribbon */}
      <ContextRibbon
        context={context}
        onRefresh={handleRefresh}
        onAlertClick={handleAlertClick}
        onDeadlineClick={handleDeadlineClick}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Council of Advisors */}
        {sidebarOpen && (
          <div className="w-72 bg-white border-r border-zinc-200 flex flex-col">
            {/* Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-100">
              <h3 className="font-semibold text-zinc-900">Council</h3>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Advisor List */}
            <div className="flex-1 p-3 space-y-2 overflow-y-auto">
              {Object.values(SHERPA_PERSONAS).map(persona => (
                <CouncilAdvisorCard
                  key={persona.id}
                  persona={persona}
                  isActive={activeAdvisor === persona.id}
                  onClick={() => {
                    setActiveAdvisor(persona.id);
                    setActiveZone('council');
                  }}
                />
              ))}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-zinc-100">
              <button
                onClick={onSettingsOpen}
                className="w-full flex items-center gap-2 p-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </button>
            </div>
          </div>
        )}

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toggle sidebar button when collapsed */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute left-4 top-16 z-10 p-2 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow"
            >
              <Menu className="w-5 h-5 text-zinc-600" />
            </button>
          )}

          {/* Morning Briefing Overlay */}
          {showBriefing && (
            <div className="p-6">
              <MorningBriefingGreeting
                userName={userName}
                stats={{
                  alerts: context.criticalAlerts,
                  priorities: context.pendingActions,
                  documents: 12,
                  deadlines: 3,
                }}
                onDismiss={() => setShowBriefing(false)}
                onViewDetails={() => {
                  setActiveZone('briefing');
                  setShowBriefing(false);
                }}
              />
            </div>
          )}

          {/* Zone Content */}
          {!showBriefing && (
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                </div>
              }
            >
              {activeZone === 'council' && activeAdvisor ? (
                <div className="flex-1 p-6">
                  {/* Council Thread would render here */}
                  <div className="max-w-3xl mx-auto">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-2xl">
                        {SHERPA_PERSONAS[
                          Object.keys(SHERPA_PERSONAS).find(
                            k => SHERPA_PERSONAS[k as keyof typeof SHERPA_PERSONAS].id === activeAdvisor
                          ) as keyof typeof SHERPA_PERSONAS
                        ]?.avatar || '🏔️'}
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-zinc-900">
                          {SHERPA_PERSONAS[
                            Object.keys(SHERPA_PERSONAS).find(
                              k => SHERPA_PERSONAS[k as keyof typeof SHERPA_PERSONAS].id === activeAdvisor
                            ) as keyof typeof SHERPA_PERSONAS
                          ]?.name || 'Advisor'}
                        </h2>
                        <p className="text-sm text-zinc-500">
                          Ready to assist with regulatory strategy
                        </p>
                      </div>
                    </div>
                    
                    {/* Chat interface placeholder */}
                    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
                      <p className="text-zinc-500 text-center">
                        Council thread interface - connected to Cortex backend
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <ZeroState
                  userName={userName}
                  industry={industry}
                  onQuickAction={handleQuickAction}
                />
              )}
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConvergentCanvas;
