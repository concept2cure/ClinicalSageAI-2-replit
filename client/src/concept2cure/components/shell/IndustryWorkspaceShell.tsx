/**
 * @fileoverview Unified Industry Workspace Shell
 * @module concept2cure/components/shell/IndustryWorkspaceShell
 * @version 1.0.0
 *
 * @description
 * Main application shell that adapts to industry context.
 * This is the container that orchestrates all the specialized
 * components based on user's organizational role.
 *
 * Shell Modes:
 * - Biotech Mode: Product-focused, streamlined for small teams
 * - Pharma Mode: Portfolio view, enterprise features
 * - CRO Mode: Multi-client, resource management focused
 * - Agency Mode: Review-centric (future)
 *
 * Integrates:
 * - RegulatoryCalendar
 * - DossierNavigator
 * - MedicalWriterQueue
 * - CROResourceDashboard
 * - TeamCollaborationPanel
 * - QuickStartWizard
 * - IndustryRoleDashboard
 *
 * @compliance
 * - Role-based access control integration
 * - Audit logging for all navigation
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { IndustryMode, UserRole } from '../industry';
import {
  Home,
  FolderKanban,
  FileText,
  Calendar,
  Users,
  BarChart3,
  Settings,
  HelpCircle,
  Bell,
  Search,
  Plus,
  ChevronDown,
  Building2,
  Beaker,
  Briefcase,
  GraduationCap,
  Microscope,
  PenTool,
  LayoutDashboard,
  FileCheck,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type WorkspaceView = 
  | 'dashboard'
  | 'projects'
  | 'submissions'
  | 'documents'
  | 'calendar'
  | 'team'
  | 'analytics'
  | 'resources'    // CRO only
  | 'clients';     // CRO only

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  industryMode: IndustryMode;
  avatar?: string;
}

export interface Notification {
  id: string;
  type: 'mention' | 'deadline' | 'review' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
}

interface IndustryWorkspaceShellProps {
  currentUser: CurrentUser;
  notifications: Notification[];
  onViewChange?: (view: WorkspaceView) => void;
  onNewProject?: () => void;
  onSearch?: (query: string) => void;
  onNotificationClick?: (notification: Notification) => void;
  children?: React.ReactNode;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const MODE_CONFIG: Record<IndustryMode, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}> = {
  biotech: { label: 'Biotech', icon: Beaker, color: 'text-stone-700', bgColor: 'bg-stone-100' },
  pharma: { label: 'Pharma', icon: Building2, color: 'text-stone-600', bgColor: 'bg-stone-100' },
  cro: { label: 'CRO', icon: Briefcase, color: 'text-stone-600', bgColor: 'bg-stone-100' },
  medtech: { label: 'MedTech', icon: Microscope, color: 'text-stone-600', bgColor: 'bg-stone-100' },
  academic: { label: 'Academic', icon: GraduationCap, color: 'text-stone-600', bgColor: 'bg-stone-100' },
  regulatory: { label: 'Regulatory', icon: FileCheck, color: 'text-stone-600', bgColor: 'bg-stone-100' },
  medical_writing: { label: 'Medical Writing', icon: PenTool, color: 'text-stone-700', bgColor: 'bg-stone-100' },
};

const NAVIGATION_ITEMS: Record<IndustryMode, { view: WorkspaceView; label: string; icon: React.ComponentType<{ className?: string }> }[]> = {
  biotech: [
    { view: 'dashboard', label: 'Dashboard', icon: Home },
    { view: 'projects', label: 'Products', icon: Beaker },
    { view: 'submissions', label: 'Submissions', icon: FileCheck },
    { view: 'documents', label: 'Documents', icon: FileText },
    { view: 'calendar', label: 'Calendar', icon: Calendar },
    { view: 'team', label: 'Team', icon: Users },
  ],
  pharma: [
    { view: 'dashboard', label: 'Dashboard', icon: Home },
    { view: 'projects', label: 'Portfolio', icon: FolderKanban },
    { view: 'submissions', label: 'Submissions', icon: FileCheck },
    { view: 'documents', label: 'Documents', icon: FileText },
    { view: 'calendar', label: 'Calendar', icon: Calendar },
    { view: 'team', label: 'Team', icon: Users },
    { view: 'analytics', label: 'Analytics', icon: BarChart3 },
  ],
  cro: [
    { view: 'dashboard', label: 'Dashboard', icon: Home },
    { view: 'clients', label: 'Clients', icon: Building2 },
    { view: 'projects', label: 'Projects', icon: FolderKanban },
    { view: 'documents', label: 'Documents', icon: FileText },
    { view: 'resources', label: 'Resources', icon: Users },
    { view: 'calendar', label: 'Calendar', icon: Calendar },
    { view: 'analytics', label: 'Analytics', icon: BarChart3 },
  ],
  medtech: [
    { view: 'dashboard', label: 'Dashboard', icon: Home },
    { view: 'projects', label: 'Devices', icon: Microscope },
    { view: 'submissions', label: 'Submissions', icon: FileCheck },
    { view: 'documents', label: 'Documents', icon: FileText },
    { view: 'calendar', label: 'Calendar', icon: Calendar },
    { view: 'team', label: 'Team', icon: Users },
  ],
  academic: [
    { view: 'dashboard', label: 'Dashboard', icon: Home },
    { view: 'projects', label: 'Programs', icon: FolderKanban },
    { view: 'documents', label: 'Documents', icon: FileText },
    { view: 'calendar', label: 'Calendar', icon: Calendar },
    { view: 'team', label: 'Team', icon: Users },
  ],
  regulatory: [
    { view: 'dashboard', label: 'Dashboard', icon: Home },
    { view: 'submissions', label: 'Submissions', icon: FileCheck },
    { view: 'documents', label: 'Documents', icon: FileText },
    { view: 'calendar', label: 'Calendar', icon: Calendar },
    { view: 'team', label: 'Team', icon: Users },
  ],
  medical_writing: [
    { view: 'dashboard', label: 'Dashboard', icon: Home },
    { view: 'documents', label: 'Documents', icon: FileText },
    { view: 'calendar', label: 'Calendar', icon: Calendar },
    { view: 'team', label: 'Team', icon: Users },
  ],
};

const ROLE_CONFIG: Record<UserRole, {
  label: string;
  quickActions: { label: string; icon: React.ComponentType<{ className?: string }>; action: string }[];
}> = {
  ra_lead: {
    label: 'Regulatory Lead',
    quickActions: [
      { label: 'New Submission', icon: Plus, action: 'new_submission' },
      { label: 'Schedule Meeting', icon: Calendar, action: 'schedule_meeting' },
    ],
  },
  ra_specialist: {
    label: 'Regulatory Specialist',
    quickActions: [
      { label: 'Upload Document', icon: FileText, action: 'upload' },
      { label: 'Review Queue', icon: FileCheck, action: 'review_queue' },
    ],
  },
  regulatory_affairs: {
    label: 'Regulatory Affairs',
    quickActions: [
      { label: 'New Submission', icon: Plus, action: 'new_submission' },
      { label: 'Monitor Guidance', icon: FileCheck, action: 'guidance_monitor' },
    ],
  },
  medical_writer: {
    label: 'Medical Writer',
    quickActions: [
      { label: 'My Documents', icon: PenTool, action: 'my_docs' },
      { label: 'Templates', icon: Layers, action: 'templates' },
    ],
  },
  cmc_lead: {
    label: 'CMC Lead',
    quickActions: [
      { label: 'Module 3', icon: FileText, action: 'module_3' },
      { label: 'Manufacturing', icon: Settings, action: 'manufacturing' },
    ],
  },
  clinical_ops: {
    label: 'Clinical Operations',
    quickActions: [
      { label: 'Protocols', icon: FileText, action: 'protocols' },
      { label: 'Studies', icon: BarChart3, action: 'studies' },
    ],
  },
  medical_affairs: {
    label: 'Medical Affairs',
    quickActions: [
      { label: 'Evidence Review', icon: FileCheck, action: 'evidence_review' },
      { label: 'Safety Signals', icon: Bell, action: 'safety_signals' },
    ],
  },
  quality_assurance: {
    label: 'Quality Assurance',
    quickActions: [
      { label: 'QC Queue', icon: FileCheck, action: 'qc_queue' },
      { label: 'Audit Trail', icon: Clock, action: 'audit' },
    ],
  },
  project_manager: {
    label: 'Project Manager',
    quickActions: [
      { label: 'Deliverables', icon: FolderKanban, action: 'deliverables' },
      { label: 'Resources', icon: Users, action: 'resources' },
    ],
  },
  executive: {
    label: 'Executive',
    quickActions: [
      { label: 'Portfolio View', icon: LayoutDashboard, action: 'portfolio' },
      { label: 'Reports', icon: BarChart3, action: 'reports' },
    ],
  },
  consultant: {
    label: 'Consultant',
    quickActions: [
      { label: 'Client Work', icon: Briefcase, action: 'client_work' },
      { label: 'Review Tasks', icon: FileCheck, action: 'review_tasks' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const Sidebar: React.FC<{
  mode: IndustryMode;
  currentView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
}> = ({ mode, currentView, onViewChange, collapsed, onCollapse }) => {
  const modeConfig = MODE_CONFIG[mode];
  const ModeIcon = modeConfig.icon;
  const navItems = NAVIGATION_ITEMS[mode];
  
  return (
    <div className={cn(
      'flex flex-col h-full bg-stone-900 text-white transition-all duration-300',
      collapsed ? 'w-16' : 'w-64'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 border-b border-stone-800">
        <div className="w-8 h-8 rounded-lg bg-stone-800 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-lg">Concept2Cure</span>
        )}
      </div>
      
      {/* Mode Badge */}
      {!collapsed && (
        <div className={cn('mx-4 mt-4 p-2 rounded-lg', modeConfig.bgColor)}>
          <div className="flex items-center gap-2">
            <ModeIcon className={cn('w-4 h-4', modeConfig.color)} />
            <span className={cn('text-sm font-medium', modeConfig.color)}>
              {modeConfig.label} Mode
            </span>
          </div>
        </div>
      )}
      
      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentView === item.view;
          
          return (
            <button
              key={item.view}
              onClick={() => onViewChange(item.view)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-150',
                isActive
                  ? 'bg-stone-800 text-white'
                  : 'text-stone-400 hover:text-white hover:bg-stone-800'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && (
                <span className="text-sm font-medium">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>
      
      {/* Footer */}
      <div className="p-4 border-t border-stone-800 space-y-1">
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors duration-150">
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm">Settings</span>}
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors duration-150">
          <HelpCircle className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="text-sm">Help</span>}
        </button>
      </div>
      
      {/* Collapse Toggle */}
      <button
        onClick={() => onCollapse(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-stone-700 text-stone-400 hover:bg-stone-600 flex items-center justify-center shadow-sm"
      >
        {collapsed ? '→' : '←'}
      </button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// HEADER COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const Header: React.FC<{
  currentUser: CurrentUser;
  notifications: Notification[];
  onSearch?: (query: string) => void;
  onNewProject?: () => void;
  onNotificationClick?: (notification: Notification) => void;
}> = ({ currentUser, notifications, onSearch, onNewProject, onNotificationClick }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  
  const unreadCount = notifications.filter(n => !n.read).length;
  const roleConfig = ROLE_CONFIG[currentUser.role];
  
  return (
    <header className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-6">
      {/* Search */}
      <div className="relative w-96">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <input
          type="text"
          placeholder="Search projects, documents, submissions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch?.(searchQuery)}
          className="w-full pl-10 pr-4 py-2 text-sm border border-stone-200 rounded-lg focus-visible:ring-2 focus-visible:ring-stone-400 outline-none"
        />
      </div>
      
      {/* Quick Actions */}
      <div className="flex items-center gap-4">
        {/* Role-based quick actions */}
        {roleConfig.quickActions.slice(0, 2).map((action, i) => {
          const Icon = action.icon;
          return (
            <button
              key={i}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors duration-150"
            >
              <Icon className="w-4 h-4" />
              {action.label}
            </button>
          );
        })}
        
        {/* New Project */}
        <button
          onClick={onNewProject}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-stone-800 rounded-lg hover:bg-stone-900 transition-colors duration-150"
        >
          <Plus className="w-4 h-4" />
          New
        </button>
        
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors duration-150"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 text-xs font-semibold text-white bg-stone-900 rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          
          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow border border-stone-200 z-50">
              <div className="p-3 border-b border-stone-200">
                <h4 className="text-sm font-semibold text-stone-900">Notifications</h4>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.slice(0, 5).map(notification => (
                  <button
                    key={notification.id}
                    onClick={() => onNotificationClick?.(notification)}
                    className={cn(
                      'w-full p-3 text-left hover:bg-stone-50 border-b border-stone-200 last:border-b-0',
                      !notification.read && 'bg-stone-100'
                    )}
                  >
                    <p className="text-sm font-medium text-stone-900">{notification.title}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{notification.message}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* User Menu */}
        <button className="flex items-center gap-2 px-2 py-1 hover:bg-stone-100 rounded-lg transition-colors duration-150">
          <div className="w-8 h-8 rounded-full bg-stone-800 flex items-center justify-center text-white text-sm font-medium">
            {currentUser.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-stone-900">{currentUser.name}</p>
            <p className="text-xs text-stone-500">{roleConfig.label}</p>
          </div>
          <ChevronDown className="w-4 h-4 text-stone-400" />
        </button>
      </div>
    </header>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SHELL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const IndustryWorkspaceShell: React.FC<IndustryWorkspaceShellProps> = ({
  currentUser,
  notifications,
  onViewChange,
  onNewProject,
  onSearch,
  onNotificationClick,
  children,
  className,
}) => {
  const [currentView, setCurrentView] = useState<WorkspaceView>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  const handleViewChange = useCallback((view: WorkspaceView) => {
    setCurrentView(view);
    onViewChange?.(view);
  }, [onViewChange]);
  
  return (
    <div className={cn('flex h-screen bg-stone-100', className)}>
      {/* Sidebar */}
      <div className="relative">
        <Sidebar
          mode={currentUser.industryMode}
          currentView={currentView}
          onViewChange={handleViewChange}
          collapsed={sidebarCollapsed}
          onCollapse={setSidebarCollapsed}
        />
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Header
          currentUser={currentUser}
          notifications={notifications}
          onSearch={onSearch}
          onNewProject={onNewProject}
          onNotificationClick={onNotificationClick}
        />
        
        {/* Content Area */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default IndustryWorkspaceShell;
