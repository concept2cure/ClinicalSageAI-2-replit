/**
 * @fileoverview Industry-Aware Application Shell
 * @module concept2cure/IndustryAwareApp
 * @version 1.0.0
 *
 * @description
 * The main application shell that:
 * 1. Detects if user needs onboarding (first run)
 * 2. Loads appropriate industry dashboard based on config
 * 3. Provides role-specific workspace switching
 * 4. Handles session restoration
 *
 * This is inspired by Claude.ai's project paradigm but adapted
 * for how BIOTECH, PHARMA, CRO, and REGULATORY organizations
 * actually operate.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Building2,
  Pill,
  Flask,
  Briefcase,
  FileText,
  Calendar,
  Users,
  MessageSquare,
  Settings,
  ChevronDown,
  LayoutDashboard,
  Bell,
  Search,
  Menu,
  X,
  Sparkles,
  LogOut,
} from 'lucide-react';

// Import industry components
import { BiotechProgramDashboard } from './components/biotech/BiotechProgramDashboard';
import { PharmaPortfolioDashboard } from './components/pharma/PharmaPortfolioDashboard';
import { CROClientPortal } from './components/cro/CROClientPortal';
import { FDAMeetingWorkspace } from './components/regulatory/FDAMeetingWorkspace';
import { ClinicalDocAuthoringWorkspace } from './components/writing/ClinicalDocAuthoringWorkspace';
import { IndustryModeSelector, type UserConfiguration, type IndustryMode, type UserRole } from './components/onboarding/IndustryModeSelector';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type WorkspaceView = 
  | 'dashboard'        // Industry-specific main dashboard
  | 'fda_meetings'     // FDA Meeting Workspace
  | 'authoring'        // Clinical Document Authoring
  | 'calendar'         // Regulatory Calendar
  | 'settings';

interface AppState {
  config: UserConfiguration | null;
  currentView: WorkspaceView;
  sidebarCollapsed: boolean;
  notifications: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const INDUSTRY_CONFIG: Record<IndustryMode, {
  label: string;
  icon: React.ReactNode;
  color: string;
  dashboardTitle: string;
}> = {
  biotech: {
    label: 'Biotech',
    icon: <Flask className="w-5 h-5" />,
    color: 'text-green-600',
    dashboardTitle: 'Program Dashboard',
  },
  pharma: {
    label: 'Pharma',
    icon: <Pill className="w-5 h-5" />,
    color: 'text-blue-600',
    dashboardTitle: 'Portfolio Dashboard',
  },
  cro: {
    label: 'CRO',
    icon: <Briefcase className="w-5 h-5" />,
    color: 'text-violet-600',
    dashboardTitle: 'Client Portal',
  },
  medtech: {
    label: 'MedTech',
    icon: <Building2 className="w-5 h-5" />,
    color: 'text-cyan-600',
    dashboardTitle: 'Device Dashboard',
  },
  academic: {
    label: 'Academic',
    icon: <Building2 className="w-5 h-5" />,
    color: 'text-amber-600',
    dashboardTitle: 'Research Dashboard',
  },
};

const WORKSPACE_VIEWS: Array<{
  id: WorkspaceView;
  label: string;
  icon: React.ReactNode;
  roles: UserRole[]; // Which roles see this option
}> = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    roles: ['regulatory_affairs', 'medical_writer', 'clinical_ops', 'medical_affairs', 'quality_assurance', 'project_manager', 'executive', 'consultant'],
  },
  {
    id: 'fda_meetings',
    label: 'FDA Meetings',
    icon: <Calendar className="w-5 h-5" />,
    roles: ['regulatory_affairs', 'executive', 'project_manager'],
  },
  {
    id: 'authoring',
    label: 'Document Authoring',
    icon: <FileText className="w-5 h-5" />,
    roles: ['medical_writer', 'regulatory_affairs', 'medical_affairs', 'quality_assurance'],
  },
  {
    id: 'calendar',
    label: 'Regulatory Calendar',
    icon: <Calendar className="w-5 h-5" />,
    roles: ['regulatory_affairs', 'project_manager', 'executive'],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Settings className="w-5 h-5" />,
    roles: ['regulatory_affairs', 'medical_writer', 'clinical_ops', 'medical_affairs', 'quality_assurance', 'project_manager', 'executive', 'consultant'],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA (would come from API in real app)
// ═══════════════════════════════════════════════════════════════════════════════

// These would be populated from real API calls based on user's organization

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const Sidebar: React.FC<{
  config: UserConfiguration;
  currentView: WorkspaceView;
  collapsed: boolean;
  onViewChange: (view: WorkspaceView) => void;
  onToggleCollapse: () => void;
}> = ({ config, currentView, collapsed, onViewChange, onToggleCollapse }) => {
  const industryConfig = INDUSTRY_CONFIG[config.industryMode];
  
  // Filter views based on user's role
  const availableViews = WORKSPACE_VIEWS.filter(view => 
    view.roles.includes(config.primaryRole)
  );
  
  return (
    <div className={cn(
      'flex flex-col h-full bg-white border-r border-zinc-200 transition-all duration-300',
      collapsed ? 'w-16' : 'w-64'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-200">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className={cn('p-2 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600')}>
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-zinc-900">Concept2Cure</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg hover:bg-zinc-100 transition-colors"
        >
          {collapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
        </button>
      </div>
      
      {/* Industry Badge */}
      {!collapsed && (
        <div className="px-4 py-3">
          <div className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg',
            industryConfig.color === 'text-green-600' && 'bg-green-50',
            industryConfig.color === 'text-blue-600' && 'bg-blue-50',
            industryConfig.color === 'text-violet-600' && 'bg-violet-50',
            industryConfig.color === 'text-cyan-600' && 'bg-cyan-50',
            industryConfig.color === 'text-amber-600' && 'bg-amber-50'
          )}>
            <span className={industryConfig.color}>{industryConfig.icon}</span>
            <span className={cn('text-sm font-medium', industryConfig.color)}>
              {industryConfig.label}
            </span>
          </div>
        </div>
      )}
      
      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {availableViews.map(view => {
          const isActive = currentView === view.id;
          
          return (
            <button
              key={view.id}
              onClick={() => onViewChange(view.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-zinc-600 hover:bg-zinc-100'
              )}
              title={collapsed ? view.label : undefined}
            >
              {view.icon}
              {!collapsed && <span className="text-sm font-medium">{view.label}</span>}
            </button>
          );
        })}
      </nav>
      
      {/* AI Assistant */}
      {!collapsed && (
        <div className="p-4 border-t border-zinc-200">
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-violet-500 to-blue-500 text-white rounded-lg hover:opacity-90 transition-opacity">
            <MessageSquare className="w-5 h-5" />
            <span className="text-sm font-medium">Ask Concept2Cure AI</span>
          </button>
        </div>
      )}
      
      {/* User */}
      <div className="p-4 border-t border-zinc-200">
        {collapsed ? (
          <div className="w-10 h-10 mx-auto rounded-full bg-zinc-200 flex items-center justify-center">
            <span className="text-sm font-medium text-zinc-600">U</span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-zinc-200 flex items-center justify-center">
                <span className="text-sm font-medium text-zinc-600">U</span>
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-900">User Name</p>
                <p className="text-xs text-zinc-500 capitalize">{config.primaryRole.replace(/_/g, ' ')}</p>
              </div>
            </div>
            <button className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// HEADER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const Header: React.FC<{
  config: UserConfiguration;
  notifications: number;
}> = ({ config, notifications }) => {
  const industryConfig = INDUSTRY_CONFIG[config.industryMode];
  
  return (
    <header className="h-14 bg-white border-b border-zinc-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-zinc-900">
          {industryConfig.dashboardTitle}
        </h1>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search..."
            className="pl-9 pr-4 py-2 w-64 text-sm bg-zinc-100 border-none rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        {/* Notifications */}
        <button className="relative p-2 text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors">
          <Bell className="w-5 h-5" />
          {notifications > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full flex items-center justify-center">
              {notifications > 9 ? '9+' : notifications}
            </span>
          )}
        </button>
        
        {/* Help */}
        <button className="p-2 text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors">
          <MessageSquare className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APPLICATION COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const IndustryAwareApp: React.FC = () => {
  const [state, setState] = useState<AppState>({
    config: null,
    currentView: 'dashboard',
    sidebarCollapsed: false,
    notifications: 3,
  });
  
  // Load saved config from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('concept2cure_config');
    if (saved) {
      try {
        const config = JSON.parse(saved) as UserConfiguration;
        setState(prev => ({ ...prev, config }));
      } catch {
        // Invalid config, show onboarding
      }
    }
  }, []);
  
  const handleOnboardingComplete = (config: UserConfiguration) => {
    localStorage.setItem('concept2cure_config', JSON.stringify(config));
    setState(prev => ({ ...prev, config }));
  };
  
  const handleViewChange = (view: WorkspaceView) => {
    setState(prev => ({ ...prev, currentView: view }));
  };
  
  const handleToggleSidebar = () => {
    setState(prev => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }));
  };
  
  // Show onboarding if no config
  if (!state.config) {
    return <IndustryModeSelector onComplete={handleOnboardingComplete} />;
  }
  
  // Render industry-specific dashboard
  const renderDashboard = () => {
    switch (state.config?.industryMode) {
      case 'biotech':
        return (
          <BiotechProgramDashboard
            programs={[]}
            onProgramClick={() => {}}
          />
        );
      case 'pharma':
        return (
          <PharmaPortfolioDashboard
            portfolios={[]}
            onProductClick={() => {}}
          />
        );
      case 'cro':
        return (
          <CROClientPortal
            clients={[]}
            resources={[]}
            onClientClick={() => {}}
          />
        );
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-500">Dashboard not available</p>
          </div>
        );
    }
  };
  
  // Render current workspace view
  const renderWorkspace = () => {
    switch (state.currentView) {
      case 'dashboard':
        return renderDashboard();
      case 'fda_meetings':
        return (
          <FDAMeetingWorkspace
            meetings={[]}
            onMeetingSelect={() => {}}
          />
        );
      case 'authoring':
        return (
          <ClinicalDocAuthoringWorkspace
            documents={[]}
            onDocumentSelect={() => {}}
          />
        );
      case 'settings':
        return (
          <div className="flex items-center justify-center h-full bg-zinc-50">
            <div className="text-center">
              <Settings className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-500">Settings workspace</p>
            </div>
          </div>
        );
      default:
        return renderDashboard();
    }
  };
  
  return (
    <div className="flex h-screen bg-zinc-50">
      {/* Sidebar */}
      <Sidebar
        config={state.config}
        currentView={state.currentView}
        collapsed={state.sidebarCollapsed}
        onViewChange={handleViewChange}
        onToggleCollapse={handleToggleSidebar}
      />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          config={state.config}
          notifications={state.notifications}
        />
        
        {/* Workspace */}
        <main className="flex-1 overflow-auto">
          {renderWorkspace()}
        </main>
      </div>
    </div>
  );
};

export default IndustryAwareApp;
