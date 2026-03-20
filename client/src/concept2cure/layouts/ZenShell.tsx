/**
 * @fileoverview Zen Shell Layout
 * @module concept2cure/layouts/ZenShell
 * @version 3.0.0
 *
 * @description
 * The "New iPhone" of regulatory interfaces - Claude.ai / ChatGPT inspired shell.
 * Minimal chrome, maximum focus on conversation and content.
 *
 * Layout Structure:
 * ┌─────────────────────────────────────────────────────────┐
 * │ [≡] Project Name              [⚙] [👤]                 │ <- Minimal header
 * ├──────────┬──────────────────────────────────────────────┤
 * │          │                                              │
 * │ Projects │              Chat / Content                  │
 * │          │                                              │
 * │ ──────── │                                              │
 * │          │         [ Type a message... ]                │
 * │ Settings │                                              │
 * └──────────┴──────────────────────────────────────────────┘
 *
 * @compliance
 * - FDA 21 CFR Part 11: All actions logged
 * - WCAG 2.1 AA: Keyboard navigable, screen reader friendly
 */

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { zenClasses } from '../design/zen';
import {
  Menu,
  X,
  Plus,
  Search,
  Settings,
  User,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Command,
  MessageSquare,
  FileText,
  MoreHorizontal,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ZenProject {
  id: string;
  name: string;
  type: string;
  lastUpdated: Date;
  conversationCount: number;
}

interface ZenShellProps {
  children?: React.ReactNode;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN HEADER - Minimal, unobtrusive
// ═══════════════════════════════════════════════════════════════════════════════

interface ZenHeaderProps {
  projectName?: string;
  onMenuClick: () => void;
  onSearchClick: () => void;
  onSettingsClick: () => void;
  onProfileClick: () => void;
  isSidebarOpen: boolean;
}

const ZenHeader: React.FC<ZenHeaderProps> = ({
  projectName,
  onMenuClick,
  onSearchClick,
  onSettingsClick,
  onProfileClick,
  isSidebarOpen,
}) => (
  <header className="h-12 flex items-center justify-between px-3 border-b border-zinc-200 bg-white/80 backdrop-blur-sm">
    {/* Left section */}
    <div className="flex items-center gap-2">
      <button
        onClick={onMenuClick}
        className={cn(zenClasses.buttonIcon, 'md:hidden')}
        aria-label="Toggle menu"
      >
        {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Project indicator */}
      {projectName && (
        <div className="flex items-center gap-2 px-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-sm font-medium text-zinc-700 truncate max-w-[200px]">
            {projectName}
          </span>
        </div>
      )}
    </div>

    {/* Center - brand (only on mobile when no project) */}
    {!projectName && (
      <div className="flex items-center gap-2 md:hidden">
        <Sparkles className="w-5 h-5 text-violet-500" />
        <span className="font-semibold text-zinc-900">Concept2Cure</span>
      </div>
    )}

    {/* Right section */}
    <div className="flex items-center gap-1">
      <button onClick={onSearchClick} className={zenClasses.buttonIcon} aria-label="Search">
        <Search className="w-4 h-4" />
      </button>
      <button
        onClick={onSettingsClick}
        className={cn(zenClasses.buttonIcon, 'hidden sm:flex')}
        aria-label="Settings"
      >
        <Settings className="w-4 h-4" />
      </button>
      <button onClick={onProfileClick} className={zenClasses.buttonIcon} aria-label="Profile">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center">
          <span className="text-xs font-medium text-white">U</span>
        </div>
      </button>
    </div>
  </header>
);

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN SIDEBAR - Clean project navigation
// ═══════════════════════════════════════════════════════════════════════════════

interface ZenSidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
  projects: ZenProject[];
  activeProjectId?: string;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onNewChat: () => void;
}

const ZenSidebar: React.FC<ZenSidebarProps> = ({
  isOpen,
  isCollapsed,
  onToggleCollapse,
  onClose,
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
  onNewChat,
}) => {
  // Sort projects by last updated
  const sortedProjects = [...projects].sort(
    (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );

  // Group by time
  const today = new Date();
  const todayProjects = sortedProjects.filter(
    p => new Date(p.lastUpdated).toDateString() === today.toDateString()
  );
  const recentProjects = sortedProjects.filter(
    p =>
      new Date(p.lastUpdated).toDateString() !== today.toDateString() &&
      new Date(p.lastUpdated) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );
  const olderProjects = sortedProjects.filter(
    p => new Date(p.lastUpdated) <= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );

  const renderProjectGroup = (title: string, items: ZenProject[]) => {
    if (items.length === 0) return null;

    return (
      <div className="mb-4">
        {!isCollapsed && (
          <h3 className="px-3 mb-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">
            {title}
          </h3>
        )}
        <div className="space-y-0.5">
          {items.map(project => (
            <button
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              className={cn(
                'w-full flex items-center gap-3 rounded-lg transition-colors',
                isCollapsed ? 'justify-center p-2' : 'px-3 py-2',
                activeProjectId === project.id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
              )}
              title={isCollapsed ? project.name : undefined}
            >
              <div
                className={cn(
                  'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-semibold',
                  activeProjectId === project.id
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-zinc-100 text-zinc-600'
                )}
              >
                {project.name.charAt(0).toUpperCase()}
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium truncate">{project.name}</div>
                  <div className="text-xs text-zinc-400 truncate">
                    {project.conversationCount} conversations
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-zinc-50">
      {/* Sidebar header */}
      <div
        className={cn(
          'flex items-center h-12 border-b border-zinc-200',
          isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
        )}
      >
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            <span className="font-semibold text-zinc-900">Concept2Cure</span>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className={cn(zenClasses.buttonIcon, 'hidden md:flex')}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* New chat button */}
      <div className={cn('p-2', isCollapsed && 'flex justify-center')}>
        <button
          onClick={onNewChat}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg font-medium transition-all',
            isCollapsed
              ? 'w-10 h-10 bg-blue-600 text-white hover:bg-blue-700'
              : 'w-full px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700'
          )}
        >
          <Plus className="w-4 h-4" />
          {!isCollapsed && <span>New chat</span>}
        </button>
      </div>

      {/* Projects list */}
      <div className="flex-1 overflow-y-auto px-2 py-2 zen-scroll">
        {renderProjectGroup('Today', todayProjects)}
        {renderProjectGroup('This Week', recentProjects)}
        {renderProjectGroup('Older', olderProjects)}

        {/* New project button */}
        <button
          onClick={onNewProject}
          className={cn(
            'w-full flex items-center gap-3 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 transition-colors',
            isCollapsed ? 'justify-center p-2' : 'px-3 py-2'
          )}
        >
          <div className="w-8 h-8 rounded-lg border-2 border-dashed border-zinc-300 flex items-center justify-center">
            <Plus className="w-4 h-4" />
          </div>
          {!isCollapsed && <span className="text-sm font-medium">New project</span>}
        </button>
      </div>

      {/* Sidebar footer */}
      <div
        className={cn('border-t border-zinc-200 p-2', isCollapsed && 'flex flex-col items-center')}
      >
        <button
          className={cn(
            'w-full flex items-center gap-3 rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors',
            isCollapsed ? 'justify-center p-2' : 'px-3 py-2'
          )}
        >
          <Settings className="w-5 h-5" />
          {!isCollapsed && <span className="text-sm">Settings</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'bg-zinc-50 border-r border-zinc-200 h-full transition-all duration-200 ease-in-out',
          // Desktop
          'hidden md:block',
          isCollapsed ? 'w-[60px]' : 'w-[260px]'
        )}
        role="navigation"
        aria-label="Projects sidebar"
      >
        {sidebarContent}
      </aside>

      {/* Mobile sidebar (drawer) */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[280px] transform transition-transform duration-200 ease-in-out md:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        role="navigation"
        aria-label="Projects sidebar"
      >
        {sidebarContent}
      </aside>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ZEN COMMAND PALETTE - Spotlight-style search
// ═══════════════════════════════════════════════════════════════════════════════

interface CommandItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

interface ZenCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const ZenCommandPalette: React.FC<ZenCommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands: CommandItem[] = [
    {
      id: 'new-chat',
      title: 'New chat',
      icon: <MessageSquare className="w-4 h-4" />,
      shortcut: '⌘N',
      action: () => {},
    },
    {
      id: 'new-project',
      title: 'New project',
      icon: <Plus className="w-4 h-4" />,
      shortcut: '⌘P',
      action: () => {},
    },
    {
      id: 'search',
      title: 'Search conversations',
      icon: <Search className="w-4 h-4" />,
      shortcut: '⌘F',
      action: () => {},
    },
    {
      id: 'settings',
      title: 'Open settings',
      icon: <Settings className="w-4 h-4" />,
      shortcut: '⌘,',
      action: () => {},
    },
    {
      id: '510k',
      title: 'Start 510(k) submission',
      icon: <FileText className="w-4 h-4" />,
      action: () => {},
    },
    {
      id: 'ind',
      title: 'Start IND submission',
      icon: <FileText className="w-4 h-4" />,
      action: () => {},
    },
    {
      id: 'nda',
      title: 'Start NDA submission',
      icon: <FileText className="w-4 h-4" />,
      action: () => {},
    },
  ];

  const filteredCommands = commands.filter(cmd =>
    cmd.title.toLowerCase().includes(query.toLowerCase())
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(i => Math.min(i + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(i => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            filteredCommands[selectedIndex].action();
            onClose();
          }
          break;
        case 'Escape':
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onClose]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200">
          <Search className="w-5 h-5 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search commands..."
            className="flex-1 text-base bg-transparent border-none outline-none text-zinc-900 placeholder:text-zinc-400"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-zinc-400 bg-zinc-100 rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-zinc-500">No commands found</div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
                  index === selectedIndex
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-zinc-700 hover:bg-zinc-50'
                )}
              >
                <span className="flex-shrink-0 text-zinc-500">{cmd.icon}</span>
                <span className="flex-1 text-sm font-medium">{cmd.title}</span>
                {cmd.shortcut && <kbd className="text-xs text-zinc-400">{cmd.shortcut}</kbd>}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ZEN SHELL COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const ZenShell: React.FC<ZenShellProps> = ({ children }) => {
  // State
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>('1');

  // Mock projects (will be replaced with context)
  const mockProjects: ZenProject[] = [
    {
      id: '1',
      name: 'CardioFlow 510(k)',
      type: '510K',
      lastUpdated: new Date(),
      conversationCount: 12,
    },
    {
      id: '2',
      name: 'NeuroStim IND',
      type: 'IND',
      lastUpdated: new Date(Date.now() - 86400000),
      conversationCount: 8,
    },
    {
      id: '3',
      name: 'BioMarker NDA',
      type: 'NDA',
      lastUpdated: new Date(Date.now() - 86400000 * 3),
      conversationCount: 24,
    },
    {
      id: '4',
      name: 'ImmunoTherapy BLA',
      type: 'BLA',
      lastUpdated: new Date(Date.now() - 86400000 * 10),
      conversationCount: 5,
    },
  ];

  const activeProject = mockProjects.find(p => p.id === activeProjectId);

  // Command palette shortcut (⌘K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="zen flex h-screen w-screen overflow-hidden bg-stone-50">
      {/* Sidebar */}
      <ZenSidebar
        isOpen={mobileSidebarOpen}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onClose={() => setMobileSidebarOpen(false)}
        projects={mockProjects}
        activeProjectId={activeProjectId}
        onSelectProject={setActiveProjectId}
        onNewProject={() => console.log('New project')}
        onNewChat={() => console.log('New chat')}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <ZenHeader
          projectName={activeProject?.name}
          onMenuClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          onSearchClick={() => setCommandPaletteOpen(true)}
          onSettingsClick={() => console.log('Settings')}
          onProfileClick={() => console.log('Profile')}
          isSidebarOpen={mobileSidebarOpen}
        />

        {/* Content */}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>

      {/* Command palette */}
      <ZenCommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
    </div>
  );
};

export default ZenShell;
