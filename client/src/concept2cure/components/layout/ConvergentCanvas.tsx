/**
 * @fileoverview Convergent Canvas Layout - The Living System
 * @module concept2cure/components/layout/ConvergentCanvas
 * @version 1.0.0
 *
 * @description
 * THE VISION: "The Self-Driving Regulatory Platform"
 *
 * Current State (The Industry):
 * - Level 0 (Manual): Microsoft Word + Email (Most of the market)
 * - Level 1 (Digital): Veeva/Box. Cloud storage, but dumb.
 * - Level 2 (Assisted): Weave.bio. AI that helps you write.
 *
 * Future State (Concept2Cure):
 * - Level 3 (Autonomous): The platform doesn't just "help"; it ANTICIPATES.
 *   It doesn't wait for you to ask: "Check for recalls."
 *   It wakes you up saying: "While you slept, Competitor X issued a Class I recall.
 *   I have already drafted a Risk Assessment update for your 510(k). Click here to approve."
 *
 * THE "CANVAS" INTERFACE:
 * We are abandoning the concept of "Pages" (Dashboard vs. Editor).
 * We are moving to a LIVING CANVAS:
 * - The Context Ribbon anchors you
 * - The Cortex Sidecar guides you
 * - The Center Stage morphs instantly from "Data Grid" to "Document" to "Wargame Simulation"
 *
 * THE SHERPA TEAM:
 * - Lumen Cortex (The Expedition Leader)
 * - eCTD Co-Author (The Heavy Lifter)
 * - CMC Wizard (The Gear Master)
 * - CERV2 (The Pathfinder)
 * - The Vault (Base Camp)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Mountain,
  Menu,
  X,
  Search,
  Bell,
  User,
  Settings,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  FileText,
  Beaker,
  Shield,
  Database,
  Home,
  FolderOpen,
  Calendar,
  MessageSquare,
  PanelRight,
  PanelRightClose,
  Zap,
  Activity,
  AlertTriangle,
  Send,
  Plus,
} from 'lucide-react';

// Import Phase 52 Components
import { ContextRibbon, RiskLevel, ConnectionStatus, WorkspaceMode } from './ContextRibbon';
import { MorningBriefing, BriefingAlert, TodaysPriority } from '../dashboard/MorningBriefing';
import { CouncilThread, CouncilMessage, AgentRole } from '../chat/CouncilThread';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type WorkspaceView = 
  | 'dashboard'
  | 'coauthor'
  | 'cmc'
  | 'pathfinder'
  | 'vault'
  | 'calendar'
  | 'settings';

export interface ConvergentCanvasProps {
  // User & Project Context
  userName?: string;
  projectName?: string;
  projectStatus?: string;
  workspaceMode?: WorkspaceMode;
  
  // Ribbon Props
  deadline?: string;
  daysRemaining?: number;
  riskLevel?: RiskLevel;
  riskItems?: number;
  connection?: ConnectionStatus;
  activeUsers?: number;
  
  // Morning Briefing
  showBriefingOnLoad?: boolean;
  briefingAlerts?: BriefingAlert[];
  todaysPriorities?: TodaysPriority[];
  statsSnapshot?: {
    projectsActive: number;
    deadlinesThisWeek: number;
    pendingReviews: number;
    riskItems: number;
  };
  
  // Council Chat
  initialMessages?: CouncilMessage[];
  onSendMessage?: (message: string) => void;
  
  // Navigation
  initialView?: WorkspaceView;
  onViewChange?: (view: WorkspaceView) => void;
  
  // Children (the center stage content)
  children?: React.ReactNode;
  
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const NAV_ITEMS: Array<{
  id: WorkspaceView;
  label: string;
  icon: React.ReactNode;
  description: string;
  sherpaRole?: string;
}> = [
  { 
    id: 'dashboard', 
    label: 'Command Center', 
    icon: <Home className="w-5 h-5" />,
    description: 'Mission Control',
    sherpaRole: 'The Expedition Leader'
  },
  { 
    id: 'coauthor', 
    label: 'eCTD Co-Author', 
    icon: <FileText className="w-5 h-5" />,
    description: 'Document Authoring',
    sherpaRole: 'The Heavy Lifter'
  },
  { 
    id: 'cmc', 
    label: 'CMC Wizard', 
    icon: <Beaker className="w-5 h-5" />,
    description: 'Quality & Manufacturing',
    sherpaRole: 'The Gear Master'
  },
  { 
    id: 'pathfinder', 
    label: 'Regulatory Pathfinder', 
    icon: <Shield className="w-5 h-5" />,
    description: '510(k) / PMA / CER',
    sherpaRole: 'The Scout'
  },
  { 
    id: 'vault', 
    label: 'The Vault', 
    icon: <Database className="w-5 h-5" />,
    description: 'Document Repository',
    sherpaRole: 'Base Camp'
  },
  { 
    id: 'calendar', 
    label: 'Regulatory Calendar', 
    icon: <Calendar className="w-5 h-5" />,
    description: 'Deadlines & Milestones'
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SIDEBAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const Sidebar: React.FC<{
  currentView: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}> = ({ currentView, onViewChange, collapsed, onCollapsedChange }) => {
  return (
    <div className={cn(
      'flex flex-col bg-zinc-900 text-white transition-all duration-300',
      collapsed ? 'w-16' : 'w-64'
    )}>
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-800">
        {!collapsed && (
          <div className="flex items-center gap-3">
            <Mountain className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="font-semibold text-sm tracking-tight">CONCEPT2CURE</h1>
              <p className="text-xs text-zinc-400">Regulatory Sherpa</p>
            </div>
          </div>
        )}
        {collapsed && <Mountain className="w-8 h-8 text-blue-400 mx-auto" />}
        <button
          onClick={() => onCollapsedChange(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors duration-150"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <div className="space-y-1 px-2">
          {NAV_ITEMS.map(item => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left',
                  isActive 
                    ? 'bg-blue-600 text-white' 
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                )}
                title={collapsed ? item.label : undefined}
              >
                <div className={cn('flex-shrink-0', isActive && 'text-white')}>
                  {item.icon}
                </div>
                {!collapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.label}</p>
                    <p className="text-xs text-zinc-500 truncate">{item.description}</p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </nav>
      
      {/* User */}
      <div className="p-2 border-t border-zinc-800">
        <button className={cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors duration-150',
          collapsed && 'justify-center'
        )}>
          <Settings className="w-5 h-5" />
          {!collapsed && <span className="text-sm">Settings</span>}
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CORTEX SIDECAR (AI Chat)
// ═══════════════════════════════════════════════════════════════════════════════

const CortexSidecar: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: CouncilMessage[];
  onSendMessage?: (message: string) => void;
}> = ({ open, onOpenChange, messages, onSendMessage }) => {
  const [input, setInput] = useState('');
  
  const handleSend = () => {
    if (input.trim() && onSendMessage) {
      onSendMessage(input.trim());
      setInput('');
    }
  };
  
  if (!open) return null;
  
  return (
    <div className="w-96 flex flex-col bg-white border-l border-zinc-200 shadow-xl">
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-200 bg-zinc-900">
        <div className="flex items-center gap-2 text-white">
          <Sparkles className="w-5 h-5" />
          <span className="font-semibold">Cortex Companion</span>
        </div>
        <button
          onClick={() => onOpenChange(false)}
          className="p-1.5 rounded-lg hover:bg-white/20 text-white transition-colors duration-150"
        >
          <PanelRightClose className="w-5 h-5" />
        </button>
      </div>
      
      {/* Zero State / Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-blue-600 flex items-center justify-center">
              <Mountain className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">Your Sherpa is Ready</h3>
            <p className="text-sm text-zinc-500 mb-4">
              I'll help you draft documents, verify claims, navigate regulations, 
              and ensure you reach the summit safely.
            </p>
            <div className="text-xs text-zinc-400 italic">
              "Just as Sherpas make Everest attainable, I make regulatory success repeatable."
            </div>
            
            {/* Quick Actions */}
            <div className="mt-6 space-y-2">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Quick Start</p>
              <button className="w-full px-4 py-2 text-sm text-left bg-zinc-50 hover:bg-blue-50 rounded-lg border border-zinc-200 hover:border-blue-300 transition-colors duration-150">
                📝 Draft a Clinical Overview
              </button>
              <button className="w-full px-4 py-2 text-sm text-left bg-zinc-50 hover:bg-blue-50 rounded-lg border border-zinc-200 hover:border-blue-300 transition-colors duration-150">
                🔍 Find a predicate device
              </button>
              <button className="w-full px-4 py-2 text-sm text-left bg-zinc-50 hover:bg-blue-50 rounded-lg border border-zinc-200 hover:border-blue-300 transition-colors duration-150">
                ⚗️ Check CMC guardrails
              </button>
            </div>
          </div>
        ) : (
          <CouncilThread messages={messages} />
        )}
      </div>
      
      {/* Input */}
      <div className="p-3 border-t border-zinc-200 bg-zinc-50">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask your Sherpa..."
            className="flex-1 px-4 py-2 text-sm border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none focus:border-transparent"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={cn(
              'p-2 rounded-lg transition-colors duration-150',
              input.trim()
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-zinc-200 text-zinc-400'
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// HEADER
// ═══════════════════════════════════════════════════════════════════════════════

const Header: React.FC<{
  userName?: string;
  onCortexToggle: () => void;
  cortexOpen: boolean;
  notificationCount?: number;
}> = ({ userName, onCortexToggle, cortexOpen, notificationCount = 0 }) => (
  <div className="h-14 flex items-center justify-between px-6 bg-white border-b border-zinc-200">
    {/* Search */}
    <div className="flex items-center gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
        <input
          type="text"
          placeholder="Search documents, projects, guidance..."
          className="w-80 pl-10 pr-4 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none focus:border-transparent"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 bg-zinc-200 px-1.5 py-0.5 rounded">
          ⌘K
        </span>
      </div>
    </div>
    
    {/* Actions */}
    <div className="flex items-center gap-2">
      {/* Notifications */}
      <button className="relative p-2 rounded-lg hover:bg-zinc-100 text-zinc-600 transition-colors duration-150">
        <Bell className="w-5 h-5" />
        {notificationCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 text-xs font-semibold bg-red-500 text-white rounded-full flex items-center justify-center">
            {notificationCount}
          </span>
        )}
      </button>
      
      {/* Cortex Toggle */}
      <button
        onClick={onCortexToggle}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors duration-150',
          cortexOpen
            ? 'bg-blue-100 text-blue-700'
            : 'hover:bg-zinc-100 text-zinc-600'
        )}
      >
        <Sparkles className="w-5 h-5" />
        <span className="text-sm font-medium">Cortex</span>
      </button>
      
      {/* User */}
      <div className="ml-2 flex items-center gap-3 pl-4 border-l border-zinc-200">
        <div className="text-right">
          <p className="text-sm font-medium text-zinc-900">{userName || 'User'}</p>
          <p className="text-xs text-zinc-500">Regulatory Lead</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm">
          {(userName || 'U')[0].toUpperCase()}
        </div>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ConvergentCanvas: React.FC<ConvergentCanvasProps> = ({
  userName,
  projectName = 'Global Dashboard',
  projectStatus = 'Monitoring',
  workspaceMode = 'monitoring',
  deadline,
  daysRemaining,
  riskLevel = 'LOW',
  riskItems = 0,
  connection = 'LIVE',
  activeUsers = 0,
  showBriefingOnLoad = true,
  briefingAlerts = [],
  todaysPriorities = [],
  statsSnapshot,
  initialMessages = [],
  onSendMessage,
  initialView = 'dashboard',
  onViewChange,
  children,
  className,
}) => {
  const [currentView, setCurrentView] = useState<WorkspaceView>(initialView);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [cortexOpen, setCortexOpen] = useState(false);
  const [showBriefing, setShowBriefing] = useState(showBriefingOnLoad);
  const [messages, setMessages] = useState<CouncilMessage[]>(initialMessages);
  
  const handleViewChange = useCallback((view: WorkspaceView) => {
    setCurrentView(view);
    onViewChange?.(view);
  }, [onViewChange]);
  
  const handleSendMessage = useCallback((message: string) => {
    // Add user message
    const userMsg: CouncilMessage = {
      id: `user-${Date.now()}`,
      role: 'USER',
      content: message,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, userMsg]);
    
    // Callback
    onSendMessage?.(message);
    
    // Simulate AI response (in production, this would come from the API)
    setTimeout(() => {
      const aiMsg: CouncilMessage = {
        id: `ai-${Date.now()}`,
        role: 'SYNTHESIZER',
        content: 'I understand your request. Let me analyze the regulatory landscape and prepare a response for you...',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isThinking: true,
      };
      setMessages(prev => [...prev, aiMsg]);
    }, 500);
  }, [onSendMessage]);
  
  return (
    <div className={cn('flex h-screen w-screen bg-zinc-100 overflow-hidden', className)}>
      {/* Sidebar */}
      <Sidebar
        currentView={currentView}
        onViewChange={handleViewChange}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header
          userName={userName}
          onCortexToggle={() => setCortexOpen(!cortexOpen)}
          cortexOpen={cortexOpen}
          notificationCount={briefingAlerts.filter(a => a.priority === 'CRITICAL' || a.priority === 'HIGH').length}
        />
        
        {/* Context Ribbon */}
        <ContextRibbon
          project={projectName}
          status={projectStatus}
          workspaceMode={workspaceMode}
          deadline={deadline}
          daysRemaining={daysRemaining}
          riskLevel={riskLevel}
          riskItems={riskItems}
          connection={connection}
          activeUsers={activeUsers}
        />
        
        {/* Center Stage + Cortex Sidecar */}
        <div className="flex-1 flex overflow-hidden">
          {/* Center Stage */}
          <div className="flex-1 overflow-auto">
            {children}
          </div>
          
          {/* Cortex Sidecar */}
          <CortexSidecar
            open={cortexOpen}
            onOpenChange={setCortexOpen}
            messages={messages}
            onSendMessage={handleSendMessage}
          />
        </div>
      </div>
      
      {/* Morning Briefing Modal */}
      {showBriefing && (
        <MorningBriefing
          userName={userName}
          alerts={briefingAlerts}
          priorities={todaysPriorities}
          statsSnapshot={statsSnapshot}
          onClose={() => setShowBriefing(false)}
        />
      )}
    </div>
  );
};

export default ConvergentCanvas;
