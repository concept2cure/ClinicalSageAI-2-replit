/**
 * PortalFrame - Main layout wrapper for the Client Portal
 * 
 * Provides the foundational structure with:
 * - TopBar for branding and global actions
 * - SidebarNav for navigation
 * - Main content area
 * - AI Assistant panel (collapsible)
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useLocation } from 'wouter';
import { TopBar } from './TopBar';
import { SidebarNav } from './SidebarNav';
import { cn } from '@/lib/utils';
import type { PortalExperience, PortalUser, NavItem } from '../types';

// =============================================================================
// TYPES
// =============================================================================

interface PortalFrameProps {
  children: React.ReactNode;
  experience: PortalExperience;
  user: PortalUser;
  onLogout?: () => void;
}

interface LayoutState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  aiPanelOpen: boolean;
  aiPanelWidth: number;
  mobileMenuOpen: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_SIDEBAR_WIDTH = 280;
const COLLAPSED_SIDEBAR_WIDTH = 64;
const DEFAULT_AI_PANEL_WIDTH = 380;
const MIN_AI_PANEL_WIDTH = 320;
const MAX_AI_PANEL_WIDTH = 500;

// =============================================================================
// CONTEXT
// =============================================================================

interface PortalLayoutContextValue {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  aiPanelOpen: boolean;
  toggleAiPanel: () => void;
  setAiPanelOpen: (open: boolean) => void;
}

export const PortalLayoutContext = React.createContext<PortalLayoutContextValue | null>(null);

export function usePortalLayout() {
  const context = React.useContext(PortalLayoutContext);
  if (!context) {
    throw new Error('usePortalLayout must be used within a PortalFrame');
  }
  return context;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function PortalFrame({
  children,
  experience,
  user,
  onLogout,
}: PortalFrameProps) {
  const [location] = useLocation();
  
  // Layout state
  const [layoutState, setLayoutState] = useState<LayoutState>({
    sidebarCollapsed: false,
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    aiPanelOpen: false,
    aiPanelWidth: DEFAULT_AI_PANEL_WIDTH,
    mobileMenuOpen: false,
  });
  
  // Sidebar toggle
  const toggleSidebar = useCallback(() => {
    setLayoutState(prev => ({
      ...prev,
      sidebarCollapsed: !prev.sidebarCollapsed,
      sidebarWidth: prev.sidebarCollapsed ? DEFAULT_SIDEBAR_WIDTH : COLLAPSED_SIDEBAR_WIDTH,
    }));
  }, []);
  
  // AI Panel controls
  const toggleAiPanel = useCallback(() => {
    setLayoutState(prev => ({
      ...prev,
      aiPanelOpen: !prev.aiPanelOpen,
    }));
  }, []);
  
  const setAiPanelOpen = useCallback((open: boolean) => {
    setLayoutState(prev => ({
      ...prev,
      aiPanelOpen: open,
    }));
  }, []);
  
  // Mobile menu toggle
  const toggleMobileMenu = useCallback(() => {
    setLayoutState(prev => ({
      ...prev,
      mobileMenuOpen: !prev.mobileMenuOpen,
    }));
  }, []);
  
  // Find current nav item for breadcrumb
  const currentNavItem = useMemo((): NavItem | undefined => {
    for (const section of experience.navigation) {
      const item = section.items.find(item => item.route === location);
      if (item) return item;
    }
    return undefined;
  }, [experience.navigation, location]);
  
  // Context value
  const contextValue = useMemo((): PortalLayoutContextValue => ({
    sidebarCollapsed: layoutState.sidebarCollapsed,
    toggleSidebar,
    aiPanelOpen: layoutState.aiPanelOpen,
    toggleAiPanel,
    setAiPanelOpen,
  }), [layoutState.sidebarCollapsed, layoutState.aiPanelOpen, toggleSidebar, toggleAiPanel, setAiPanelOpen]);
  
  return (
    <PortalLayoutContext.Provider value={contextValue}>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* Mobile menu overlay */}
        {layoutState.mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setLayoutState(prev => ({ ...prev, mobileMenuOpen: false }))}
          />
        )}
        
        {/* Sidebar */}
        <aside
          className={cn(
            'fixed lg:relative inset-y-0 left-0 z-50 flex flex-col bg-card border-r border-border',
            'transition-all duration-300 ease-in-out',
            layoutState.mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          )}
          style={{ width: layoutState.sidebarWidth }}
        >
          <SidebarNav
            navigation={experience.navigation}
            collapsed={layoutState.sidebarCollapsed}
            currentPath={location}
            theme={experience.theme}
            onToggle={toggleSidebar}
          />
        </aside>
        
        {/* Main content area */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Top bar */}
          <TopBar
            user={user}
            theme={experience.theme}
            currentPage={currentNavItem}
            onMenuToggle={toggleMobileMenu}
            onAiToggle={experience.features.aiAssistant ? toggleAiPanel : undefined}
            onLogout={onLogout}
            showAiButton={experience.features.aiAssistant}
          />
          
          {/* Main content with optional AI panel */}
          <div className="flex flex-1 overflow-hidden">
            {/* Primary content */}
            <main className="flex-1 overflow-auto p-6">
              <div className="max-w-7xl mx-auto">
                {children}
              </div>
            </main>
            
            {/* AI Assistant Panel */}
            {experience.features.aiAssistant && layoutState.aiPanelOpen && (
              <aside
                className={cn(
                  'hidden lg:flex flex-col border-l border-border bg-card',
                  'transition-all duration-300 ease-in-out',
                )}
                style={{ width: layoutState.aiPanelWidth }}
              >
                <AiAssistantPanel
                  onClose={() => setAiPanelOpen(false)}
                />
              </aside>
            )}
          </div>
        </div>
      </div>
    </PortalLayoutContext.Provider>
  );
}

// =============================================================================
// AI ASSISTANT PANEL (Placeholder)
// =============================================================================

interface AiAssistantPanelProps {
  onClose: () => void;
}

function AiAssistantPanel({ onClose }: AiAssistantPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-semibold text-primary">A</span>
          </div>
          <div>
            <h3 className="font-medium text-sm">AnA</h3>
            <p className="text-xs text-muted-foreground">RI Co-pilot</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-muted rounded-md transition-colors"
          aria-label="Close AI assistant"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      
      {/* Chat area */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col items-center justify-center h-full text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M15 13v2" />
              <path d="M9 13v2" />
            </svg>
          </div>
          <h4 className="font-medium mb-2">Ask AnA Anything</h4>
          <p className="text-sm text-muted-foreground max-w-[240px]">
            Get instant regulatory guidance, document analysis, and submission assistance.
          </p>
        </div>
      </div>
      
      {/* Input area */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Ask about regulations, submissions..."
            className="flex-1 px-3 py-2 text-sm bg-muted rounded-md border-0 focus:ring-2 focus:ring-primary/20 focus:outline-none"
          />
          <button
            className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            aria-label="Send message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Lumen may produce inaccurate information. Always verify regulatory guidance.
        </p>
      </div>
    </div>
  );
}

export default PortalFrame;
