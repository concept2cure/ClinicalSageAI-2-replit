/**
 * @fileoverview Zen Sidebar — Human-first OS navigation
 * @module concept2cure/components/sidebar/ZenSidebar
 *
 * Global shell (6 items):
 *   New → Search → Projects → Apps → Artifacts → Setup
 *
 * Project shell (5 tabs, shown when project is active):
 *   Overview → Work → Vault → Review → Submit
 *
 * Below: Pinned + Recent project list with nested conversations.
 * Account/profile at bottom.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Plus,
  MessageSquare,
  Trash2,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  Search,
  Star,
  Beaker,
  Pill,
  Activity,
  Heart,
  Microscope,
  Sparkles,
  FileStack,
  Settings,
  LayoutDashboard,
  PenLine,
  Archive,
  ShieldCheck,
  Send,
} from 'lucide-react';
import logoSrc from '@/assets/concept2cure-logo.jpg';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  id: string;
  title: string;
  projectId: string;
  timestamp: Date;
  starred?: boolean;
  pinned?: boolean;
}

interface Project {
  id: string;
  name: string;
  type: string;
  color: string;
  description?: string;
  starred?: boolean;
  archived?: boolean;
  status?: string;
}

export interface ZenSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  conversations: Conversation[];
  projects: Project[];
  activeConversationId?: string;
  activeProjectId?: string;
  onSelectConversation: (id: string) => void;
  onSelectProject?: (id: string) => void;
  onNewChat: () => void;
  onOpenProjects: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  onDeleteConversation: (id: string) => void;
  onToggleStar: (id: string) => void;
  onTogglePin: (id: string) => void;
  onNavigate?: (id: string) => void;
  userName?: string;
  userEmail?: string;
  activeNavId?: string;
  industryMode?: string;
}

// ─── Submission type badge config ────────────────────────────────────────────

const SUBMISSION_BADGE: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  '510K': { label: '510(k)', icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
  IND: { label: 'IND', icon: Beaker, color: 'text-purple-600', bg: 'bg-purple-50' },
  NDA: { label: 'NDA', icon: Pill, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  BLA: { label: 'BLA', icon: Activity, color: 'text-violet-600', bg: 'bg-violet-50' },
  PMA: { label: 'PMA', icon: Heart, color: 'text-red-600', bg: 'bg-red-50' },
  MAA: { label: 'MAA', icon: Microscope, color: 'text-teal-600', bg: 'bg-teal-50' },
  DE_NOVO: { label: 'De Novo', icon: FileText, color: 'text-cyan-600', bg: 'bg-cyan-50' },
  EUA: { label: 'EUA', icon: Activity, color: 'text-orange-600', bg: 'bg-orange-50' },
  IVDR: { label: 'IVDR', icon: FileText, color: 'text-green-600', bg: 'bg-green-50' },
};

const FALLBACK_BADGE = { label: 'PRJ', icon: FolderOpen, color: 'text-zinc-500', bg: 'bg-zinc-100' };

// ─── Status dot colors ──────────────────────────────────────────────────────

function statusDotColor(status?: string): string {
  switch (status) {
    case 'active': return 'bg-emerald-400';
    case 'in_review': return 'bg-amber-400';
    case 'submitted': return 'bg-blue-400';
    case 'approved': return 'bg-emerald-500';
    case 'archived': return 'bg-zinc-300';
    case 'draft':
    default: return 'bg-zinc-300';
  }
}

// ─── Relative time ──────────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const now = Date.now();
  const ms = now - new Date(date).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Workspace group ──────────────────────────────────────────────────────────

const WorkspaceGroup: React.FC<{
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ label, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-1 px-3 py-1.5 text-[10px] font-semibold text-zinc-400 uppercase tracking-widest hover:text-zinc-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none rounded transition-colors"
      >
        <ChevronDown
          className={cn(
            'w-2.5 h-2.5 flex-shrink-0 transition-transform duration-150',
            !open && '-rotate-90'
          )}
        />
        <span>{label}</span>
      </button>
      {open && <div className="pb-2 space-y-0.5">{children}</div>}
    </div>
  );
};

// ─── Nav item with active/accent support ──────────────────────────────────────

const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  accentColor?: 'blue' | 'violet' | 'emerald';
  badge?: string;
  subtitle?: string;
  onClick: () => void;
}> = ({ icon, label, active, accentColor, badge, subtitle, onClick }) => {
  const accentMap = {
    blue: { bg: 'bg-blue-100', text: 'text-blue-600', iconColor: 'text-blue-500' },
    violet: { bg: 'bg-blue-100', text: 'text-blue-600', iconColor: 'text-blue-500' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', iconColor: 'text-emerald-500' },
  };
  const accent = accentColor && accentMap[accentColor];

  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'w-full flex items-center gap-2 mx-1 pl-5 pr-3 py-[5px] text-xs transition-all duration-150 rounded-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
        active
          ? accent
            ? `${accent.bg} ${accent.text} font-medium`
            : 'bg-zinc-200/80 text-zinc-900 font-medium'
          : accent
            ? cn(
                'text-zinc-600',
                accent.bg === 'bg-blue-100' && 'hover:bg-blue-100 hover:text-blue-600',
                accent.bg === 'bg-emerald-50' && 'hover:bg-emerald-50 hover:text-emerald-700'
              )
            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
      )}
    >
      <span
        className={cn(
          'flex-shrink-0',
          active ? (accent ? accent.iconColor : 'text-zinc-700') : 'text-zinc-400'
        )}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0 text-left">
        <span className="block truncate">{label}</span>
        {subtitle && (
          <span className="block text-[10px] text-zinc-400 truncate leading-tight">{subtitle}</span>
        )}
      </div>
      {badge && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium leading-none flex-shrink-0">
          {badge}
        </span>
      )}
    </button>
  );
};

// ─── Single conversation row ──────────────────────────────────────────────────

const ConvoRow: React.FC<{
  convo: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}> = ({ convo, isActive, onSelect, onDelete }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'group relative flex items-center gap-2 mx-1 px-2.5 py-1.5 rounded-lg cursor-pointer select-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
        isActive
          ? 'bg-zinc-200/80 text-zinc-900 font-medium'
          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
      )}
    >
      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-40" />
      <span className="flex-1 text-[13px] truncate leading-5">{convo.title || 'New conversation'}</span>
      <span className="text-[10px] text-zinc-400 flex-shrink-0 tabular-nums">
        {relativeTime(convo.timestamp)}
      </span>
      {hovered && (
        <button
          onClick={e => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete conversation: ${convo.title}`}
          className={cn(
            'flex-shrink-0 p-0.5 rounded text-zinc-400 hover:bg-zinc-200 hover:text-red-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-all',
            hovered ? 'opacity-100' : 'opacity-0 focus-visible:opacity-100'
          )}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};

// ─── Project row with submission type badge + expandable conversations ───────

const ProjectRow: React.FC<{
  project: Project;
  isActive: boolean;
  isExpanded: boolean;
  conversations: Conversation[];
  activeConversationId?: string;
  onSelect: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onNewChat: () => void;
}> = ({
  project,
  isActive,
  isExpanded,
  conversations,
  activeConversationId,
  onSelect,
  onSelectConversation,
  onDeleteConversation,
  onNewChat,
}) => {
  const badge = SUBMISSION_BADGE[project.type] ?? FALLBACK_BADGE;
  const [hovered, setHovered] = useState(false);

  return (
    <div className="mb-0.5">
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          'group relative flex items-center gap-2 mx-1 px-2.5 py-2 rounded-lg cursor-pointer select-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none',
          isActive
            ? 'bg-zinc-900 text-white'
            : 'text-zinc-700 hover:bg-zinc-100'
        )}
      >
        {/* Submission type badge pill */}
        <span
          className={cn(
            'inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide leading-none flex-shrink-0 min-w-[32px]',
            isActive ? 'bg-white/20 text-white' : `${badge.bg} ${badge.color}`
          )}
        >
          {badge.label}
        </span>

        {/* Project name */}
        <span className={cn('flex-1 text-[13px] font-medium truncate leading-5', isActive && 'text-white')}>
          {project.name}
        </span>

        {/* Status dot */}
        <span
          className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', statusDotColor(project.status))}
          title={project.status || 'draft'}
        />

        {/* Starred indicator */}
        {project.starred && (
          <Star className={cn('w-3 h-3 flex-shrink-0 fill-current', isActive ? 'text-amber-300' : 'text-amber-400')} />
        )}

        {/* Expand chevron */}
        <ChevronDown
          className={cn(
            'w-3 h-3 flex-shrink-0 transition-transform duration-150',
            isActive ? 'text-white/60' : 'text-zinc-400',
            !isExpanded && '-rotate-90'
          )}
        />
      </div>

      {/* Expanded: nested conversations */}
      {isExpanded && (
        <div className="ml-3 pl-3 border-l-2 border-zinc-200 mt-0.5 space-y-0.5 pb-1">
          {/* New conversation within project */}
          <button
            onClick={e => {
              e.stopPropagation();
              onNewChat();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          >
            <Plus className="w-3 h-3" />
            New chat
          </button>

          {conversations.length === 0 && (
            <p className="px-2.5 py-2 text-[11px] text-zinc-400">No conversations yet</p>
          )}

          {conversations.map(c => (
            <ConvoRow
              key={c.id}
              convo={c}
              isActive={c.id === activeConversationId}
              onSelect={() => onSelectConversation(c.id)}
              onDelete={() => onDeleteConversation(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Collapsed icon button ──────────────────────────────────────────────────

const IconBtn: React.FC<{
  label: string;
  active?: boolean;
  accentBg?: string;
  accentText?: string;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, active, accentBg = 'bg-blue-100', accentText = 'text-blue-500', onClick, children }) => (
  <button
    onClick={onClick}
    aria-label={label}
    className={cn(
      'w-9 h-9 rounded-xl flex items-center justify-center focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors',
      active ? `${accentBg} ${accentText}` : 'text-zinc-500 hover:bg-zinc-200'
    )}
  >
    {children}
  </button>
);

// ─── New dropdown (Create: Chat / Project / Artifact) ──────────────────────────

const NewDropdown: React.FC<{
  onNewChat: () => void;
  onNewProject: () => void;
  onNewArtifact: () => void;
}> = ({ onNewChat, onNewProject, onNewArtifact }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative mx-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 text-zinc-700 text-[13px] font-medium hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors"
      >
        <Plus className="w-4 h-4 flex-shrink-0" />
        New
        <ChevronDown className={cn('w-3 h-3 ml-auto text-zinc-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg z-50 py-1">
          <button
            onClick={() => { onNewChat(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
            New Chat
          </button>
          <button
            onClick={() => { onNewProject(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
            New Project
          </button>
          <button
            onClick={() => { onNewArtifact(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <FileStack className="w-3.5 h-3.5 text-zinc-400" />
            New Artifact
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Main sidebar ─────────────────────────────────────────────────────────────

export const ZenSidebar: React.FC<ZenSidebarProps> = ({
  isCollapsed,
  onToggleCollapse,
  conversations,
  projects,
  activeConversationId,
  activeProjectId,
  onSelectConversation,
  onSelectProject,
  onNewChat,
  onOpenProjects,
  onOpenSearch,
  onOpenSettings,
  onDeleteConversation,
  onNavigate,
  userName,
  userEmail,
  activeNavId,
}) => {
  const displayName = userName || 'My Account';
  const avatarInitial = displayName[0].toUpperCase();
  const [searchQuery, setSearchQuery] = useState('');

  // Derive active project object for project block
  const activeProject = useMemo(
    () => projects.find(p => p.id === activeProjectId),
    [projects, activeProjectId]
  );

  // Group conversations by project
  const conversationsByProject = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    const sorted = [...conversations].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    for (const c of sorted) {
      const pid = c.projectId || '__unscoped__';
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(c);
    }
    return map;
  }, [conversations]);

  const unscopedConversations = conversationsByProject.get('__unscoped__') || [];

  // Filter + sort projects
  const { pinnedProjects, recentProjects } = useMemo(() => {
    let filtered = projects.filter(p => !p.archived);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.type || '').toLowerCase().includes(q)
      );
    }

    const pinned = filtered.filter(p => p.starred);
    const recent = filtered.filter(p => !p.starred).sort((a, b) => {
      if (a.id === activeProjectId) return -1;
      if (b.id === activeProjectId) return 1;
      return a.name.localeCompare(b.name);
    });

    return { pinnedProjects: pinned, recentProjects: recent };
  }, [projects, activeProjectId, searchQuery]);

  // ── Collapsed icon-only strip ──────────────────────────────────────────────
  if (isCollapsed) {
    const activeBadge = activeProject ? (SUBMISSION_BADGE[activeProject.type] ?? FALLBACK_BADGE) : null;

    return (
      <aside
        className="flex flex-col h-full w-14 bg-zinc-50 border-r border-zinc-200 items-center py-3 gap-1 flex-shrink-0"
        role="navigation"
        aria-label="Main sidebar"
      >
        {/* Logo */}
        <div className="relative w-8 h-8 rounded-xl overflow-hidden shadow-sm flex-shrink-0 mb-1">
          <img src={logoSrc} alt="C2C" className="w-full h-full object-cover object-center" />
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, transparent 40%, var(--color-bg, #faf9f5) 100%)' }} />
        </div>

        {/* ── Global nav (6 items) ── */}
        <IconBtn label="New" onClick={onNewChat}>
          <Plus className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Search" active={activeNavId === 'search'} onClick={onOpenSearch}>
          <Search className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Projects" active={activeNavId === 'projects'} onClick={onOpenProjects}>
          <FolderOpen className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Apps" active={activeNavId === 'apps'} onClick={() => onNavigate?.('apps')}>
          <Sparkles className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Artifacts" active={activeNavId === 'artifacts-center'} onClick={() => onNavigate?.('artifacts-center')}>
          <FileStack className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Setup" active={activeNavId === 'setup'} onClick={onOpenSettings}>
          <Settings className="w-4 h-4" />
        </IconBtn>

        {/* ── Project tabs (only when project active) ── */}
        {activeProject && (
          <>
            <div className="w-8 border-t border-zinc-300 my-1" />
            {activeBadge && (
              <span className={cn('text-[8px] font-bold px-1 py-0.5 rounded', activeBadge.bg, activeBadge.color)}>
                {activeBadge.label}
              </span>
            )}
            <IconBtn label="Overview" active={activeNavId === 'overview'} onClick={() => onNavigate?.('overview')}>
              <LayoutDashboard className="w-4 h-4" />
            </IconBtn>
            <IconBtn label="Work" active={activeNavId === 'work'} onClick={() => onNavigate?.('work')}>
              <PenLine className="w-4 h-4" />
            </IconBtn>
            <IconBtn label="Vault" active={activeNavId === 'vault'} onClick={() => onNavigate?.('vault')}>
              <Archive className="w-4 h-4" />
            </IconBtn>
            <IconBtn label="Review" active={activeNavId === 'review'} accentBg="bg-emerald-50" accentText="text-emerald-600" onClick={() => onNavigate?.('review-tab')}>
              <ShieldCheck className="w-4 h-4" />
            </IconBtn>
            <IconBtn label="Submit" active={activeNavId === 'submit'} onClick={() => onNavigate?.('submit')}>
              <Send className="w-4 h-4" />
            </IconBtn>
          </>
        )}

        {/* Bottom: expand + account */}
        <div className="mt-auto flex flex-col items-center gap-1">
          <button
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            className="w-9 h-9 rounded-xl text-zinc-400 flex items-center justify-center hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center">
            <span className="text-[10px] font-bold text-blue-600 leading-none">{avatarInitial}</span>
          </div>
        </div>
      </aside>
    );
  }

  // ── Full expanded sidebar ──────────────────────────────────────────────────
  const activeBadge = activeProject ? (SUBMISSION_BADGE[activeProject.type] ?? FALLBACK_BADGE) : null;

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onToggleCollapse} />
      <aside
        className="flex flex-col h-full w-[260px] bg-zinc-50/80 border-r border-zinc-100 flex-shrink-0 fixed z-50 md:static md:z-auto"
        role="navigation"
        aria-label="Main sidebar"
      >
        {/* Brand header */}
        <div className="flex items-center justify-between px-3 h-11 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="relative w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
              <img src={logoSrc} alt="Concept2Cure" className="w-full h-full object-cover object-center" />
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle at center, transparent 40%, var(--color-bg, #faf9f5) 100%)' }} />
            </div>
            <span className="font-semibold text-zinc-800 text-[13px]">Concept2Cure</span>
          </div>
          <button
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* ── Global Navigation (6 items) ──────────────────────────────── */}
        <div className="px-1 pb-1 flex-shrink-0 space-y-0.5">
          {/* New — dropdown with 3 options */}
          <NewDropdown
            onNewChat={onNewChat}
            onNewProject={onOpenProjects}
            onNewArtifact={() => onNavigate?.('apps')}
          />

          <NavItem
            icon={<Search className="w-3.5 h-3.5" />}
            label="Search"
            active={activeNavId === 'search'}
            onClick={onOpenSearch}
          />
          <NavItem
            icon={<FolderOpen className="w-3.5 h-3.5" />}
            label="Projects"
            active={activeNavId === 'projects'}
            accentColor="blue"
            onClick={onOpenProjects}
          />
          <NavItem
            icon={<Sparkles className="w-3.5 h-3.5" />}
            label="Apps"
            active={activeNavId === 'apps'}
            accentColor="violet"
            onClick={() => onNavigate?.('apps')}
          />
          <NavItem
            icon={<FileStack className="w-3.5 h-3.5" />}
            label="Artifacts"
            active={activeNavId === 'artifacts-center'}
            onClick={() => onNavigate?.('artifacts-center')}
          />
          <NavItem
            icon={<Settings className="w-3.5 h-3.5" />}
            label="Setup"
            active={activeNavId === 'setup'}
            onClick={onOpenSettings}
          />
        </div>

        {/* ── Current Project Block (only when project active) ──────── */}
        {activeProject && (
          <>
            <div className="mx-2 border-t border-zinc-200 flex-shrink-0" />
            <div className="px-2 py-2 flex-shrink-0">
              {/* Project identity */}
              <div className="flex items-center gap-2 px-2 mb-1.5">
                {activeBadge && (
                  <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded leading-none', activeBadge.bg, activeBadge.color)}>
                    {activeBadge.label}
                  </span>
                )}
                <span className="text-[12px] font-semibold text-zinc-800 truncate flex-1">
                  {activeProject.name}
                </span>
              </div>

              {/* Project tabs */}
              <div className="space-y-0.5">
                <NavItem
                  icon={<LayoutDashboard className="w-3.5 h-3.5" />}
                  label="Overview"
                  active={activeNavId === 'overview'}
                  onClick={() => onNavigate?.('overview')}
                />
                <NavItem
                  icon={<PenLine className="w-3.5 h-3.5" />}
                  label="Work"
                  active={activeNavId === 'work'}
                  accentColor="blue"
                  onClick={() => onNavigate?.('work')}
                />
                <NavItem
                  icon={<Archive className="w-3.5 h-3.5" />}
                  label="Vault"
                  active={activeNavId === 'vault'}
                  onClick={() => onNavigate?.('vault')}
                />
                <NavItem
                  icon={<ShieldCheck className="w-3.5 h-3.5" />}
                  label="Review"
                  active={activeNavId === 'review'}
                  accentColor="emerald"
                  onClick={() => onNavigate?.('review-tab')}
                />
                <NavItem
                  icon={<Send className="w-3.5 h-3.5" />}
                  label="Submit"
                  active={activeNavId === 'submit'}
                  accentColor="blue"
                  onClick={() => onNavigate?.('submit')}
                />
              </div>
            </div>
          </>
        )}

        <div className="mx-2 border-t border-zinc-100 flex-shrink-0" />

        {/* ── Search ──────────────────────────────────────────────────── */}
        <div className="px-2 py-1.5 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-white text-zinc-700 placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-1 focus:ring-zinc-300 outline-none transition-all"
            />
          </div>
        </div>

        {/* ── Scrollable project list ──────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto min-h-0 zen-scroll py-1"
          style={{ scrollbarWidth: 'thin' }}
        >
          {/* Pinned projects */}
          {pinnedProjects.length > 0 && (
            <WorkspaceGroup label="Pinned" defaultOpen={true}>
              {pinnedProjects.map(project => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  isActive={project.id === activeProjectId}
                  isExpanded={project.id === activeProjectId}
                  conversations={conversationsByProject.get(project.id) || []}
                  activeConversationId={activeConversationId}
                  onSelect={() => onSelectProject?.(project.id)}
                  onSelectConversation={onSelectConversation}
                  onDeleteConversation={onDeleteConversation}
                  onNewChat={onNewChat}
                />
              ))}
            </WorkspaceGroup>
          )}

          {/* Recent projects */}
          <WorkspaceGroup label={pinnedProjects.length > 0 ? 'Recent' : 'Projects'} defaultOpen={true}>
            {recentProjects.length === 0 && pinnedProjects.length === 0 && (
              <div className="px-4 py-4 text-center">
                <FolderOpen className="w-6 h-6 text-zinc-300 mx-auto mb-1.5" />
                <p className="text-xs text-zinc-400 leading-relaxed">No projects yet</p>
                <button
                  onClick={onOpenProjects}
                  className="mt-2 text-xs text-blue-600 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                >
                  Create your first project
                </button>
              </div>
            )}

            {recentProjects.map(project => (
              <ProjectRow
                key={project.id}
                project={project}
                isActive={project.id === activeProjectId}
                isExpanded={project.id === activeProjectId}
                conversations={conversationsByProject.get(project.id) || []}
                activeConversationId={activeConversationId}
                onSelect={() => onSelectProject?.(project.id)}
                onSelectConversation={onSelectConversation}
                onDeleteConversation={onDeleteConversation}
                onNewChat={onNewChat}
              />
            ))}
          </WorkspaceGroup>

          {/* General conversations (no project) */}
          {unscopedConversations.length > 0 && (
            <>
              <div className="mx-2 my-1 border-t border-zinc-100" />
              <WorkspaceGroup label="General" defaultOpen={!activeProjectId}>
                {unscopedConversations.map(c => (
                  <ConvoRow
                    key={c.id}
                    convo={c}
                    isActive={c.id === activeConversationId}
                    onSelect={() => onSelectConversation(c.id)}
                    onDelete={() => onDeleteConversation(c.id)}
                  />
                ))}
              </WorkspaceGroup>
            </>
          )}
        </div>

        {/* User / account footer */}
        <div className="flex-shrink-0 border-t border-zinc-100 p-2">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 text-xs focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-blue-600 leading-none">
                {avatarInitial}
              </span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-medium text-zinc-700 truncate leading-tight">
                {displayName}
              </p>
              {userEmail && (
                <p className="text-[10px] text-zinc-400 truncate leading-tight">{userEmail}</p>
              )}
            </div>
          </button>
        </div>
      </aside>
    </>
  );
};

export default ZenSidebar;
