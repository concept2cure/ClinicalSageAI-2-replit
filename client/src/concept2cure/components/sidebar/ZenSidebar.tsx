/**
 * @fileoverview Zen Sidebar — Human-first OS navigation
 * @module concept2cure/components/sidebar/ZenSidebar
 *
 * Zone A (Utility): New Chat → Search
 * Zone B (5 Destinations): Chats → Projects → Communication Center → Apps → Settings
 * Zone C (Context): Active project indicator, pinned/recent project list
 * Zone D (Footer): Account/profile
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Plus,
  MessageSquare,
  Trash2,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  PenLine,
  ShieldCheck,
  Search,
  Star,
  Archive,
  Beaker,
  Microscope,
  FlaskConical,
  Brain,
  FileCheck,
  FileStack,
  Upload,
  Shield,
  Pin,
  PinOff,
  Sparkles,
  Settings,
  Home,
  Wrench,
  Send,
  Activity,
  ListChecks,
  ClipboardCheck,
  BookOpen,
  Pill,
  Heart,
  MoreHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/design-system/patterns/EmptyState';
// Logo image removed — text mark only

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
  pinned?: boolean;
  archived?: boolean;
  status?: string;
}

/** Submission type → muted stone-palette dot color for sidebar */
const SIDEBAR_TYPE_COLORS: Record<string, string> = {
  '510K': '#78716c',    // stone-500
  IND: '#78716c',       // stone-500
  NDA: '#78716c',       // stone-500
  BLA: '#78716c',       // stone-500
  PMA: '#78716c',       // stone-500
  MAA: '#78716c',       // stone-500
  DE_NOVO: '#78716c',   // stone-500
  EUA: '#78716c',       // stone-500
  IVDR: '#78716c',      // stone-500
};

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
  onRenameConversation?: (id: string) => void;
  onMoveConversation?: (conversationId: string, targetProjectId: string) => void;
  onToggleStar: (id: string) => void;
  onTogglePin: (id: string) => void;
  onArchiveProject?: (id: string) => void;
  onDeleteProject?: (id: string) => void;
  onNavigate?: (id: string) => void;
  userName?: string;
  userEmail?: string;
  activeNavId?: string;
  industryMode?: string;
}

// ─── Submission type badge config ────────────────────────────────────────────

// Stone-palette badges — color reserved for semantic meaning, not categorization
const SUBMISSION_BADGE: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string }
> = {
  '510K': { label: '510(k)', icon: FileText, color: 'text-stone-600', bg: 'bg-stone-100' },
  IND: { label: 'IND', icon: Beaker, color: 'text-stone-600', bg: 'bg-stone-100' },
  NDA: { label: 'NDA', icon: Pill, color: 'text-stone-600', bg: 'bg-stone-100' },
  BLA: { label: 'BLA', icon: Activity, color: 'text-stone-600', bg: 'bg-stone-100' },
  PMA: { label: 'PMA', icon: Heart, color: 'text-stone-600', bg: 'bg-stone-100' },
  MAA: { label: 'MAA', icon: Microscope, color: 'text-stone-600', bg: 'bg-stone-100' },
  DE_NOVO: { label: 'De Novo', icon: FileText, color: 'text-stone-600', bg: 'bg-stone-100' },
  EUA: { label: 'EUA', icon: Activity, color: 'text-stone-600', bg: 'bg-stone-100' },
  IVDR: { label: 'IVDR', icon: FileText, color: 'text-stone-600', bg: 'bg-stone-100' },
};

const FALLBACK_BADGE = {
  label: 'PRJ',
  icon: FolderOpen,
  color: 'text-stone-500',
  bg: 'bg-stone-100',
};

// ─── Status dot colors ──────────────────────────────────────────────────────

function statusDotColor(status?: string): string {
  switch (status) {
    case 'active':
      return 'bg-stone-900';
    case 'in_review':
      return 'bg-stone-600';
    case 'submitted':
      return 'bg-stone-700';
    case 'approved':
      return 'bg-stone-900';
    case 'archived':
      return 'bg-stone-300';
    case 'draft':
    default:
      return 'bg-stone-400';
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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="h-auto w-full justify-start gap-1 px-3 py-1.5 text-[10px] font-semibold text-stone-400 uppercase tracking-widest hover:text-stone-500 rounded transition-colors"
      >
        <ChevronDown
          className={cn(
            'w-2.5 h-2.5 flex-shrink-0 transition-transform duration-150',
            !open && '-rotate-90'
          )}
        />
        <span>{label}</span>
      </Button>
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
}> = React.memo(
  ({ icon, label, active, accentColor, badge, subtitle, onClick }) => {
    const accentMap = {
      blue: { bg: 'bg-stone-100', text: 'text-stone-600', iconColor: 'text-stone-900' },
      violet: { bg: 'bg-stone-200', text: 'text-stone-600', iconColor: 'text-stone-900' },
      emerald: { bg: 'bg-stone-100', text: 'text-stone-800', iconColor: 'text-stone-900' },
    };
    const accent = accentColor && accentMap[accentColor];

    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'h-auto w-full justify-start gap-2 mx-1 pl-5 pr-3 py-[5px] text-xs transition-all duration-150 rounded-md',
          active
            ? accent
              ? `${accent.bg} ${accent.text} font-medium`
              : 'bg-stone-200/80 text-stone-900 font-medium'
            : accent
            ? cn(
                'text-stone-600',
                accent.bg === 'bg-stone-100' && 'hover:bg-stone-100 hover:text-stone-600',
                accent.bg === 'bg-stone-100' && 'hover:bg-stone-100 hover:text-stone-800'
              )
            : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
        )}
      >
        <span
          className={cn(
            'flex-shrink-0',
            active ? (accent ? accent.iconColor : 'text-stone-700') : 'text-stone-400'
          )}
        >
          {icon}
        </span>
        <div className="flex-1 min-w-0 text-left">
          <span className="block truncate">{label}</span>
          {subtitle && (
            <span className="block text-[10px] text-stone-400 truncate leading-tight">
              {subtitle}
            </span>
          )}
        </div>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-700 font-medium leading-none flex-shrink-0">
            {badge}
          </span>
        )}
      </Button>
    );
  },
  (prev, next) =>
    prev.label === next.label &&
    prev.active === next.active &&
    prev.accentColor === next.accentColor &&
    prev.badge === next.badge &&
    prev.subtitle === next.subtitle
);

// ─── Single conversation row ──────────────────────────────────────────────────

const ConvoRow: React.FC<{
  convo: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename?: () => void;
  onMoveToProject?: (targetProjectId: string) => void;
  availableProjects?: Project[];
}> = ({ convo, isActive, onSelect, onDelete, onRename, onMoveToProject, availableProjects }) => {
  return (
    <div
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
        'group relative flex items-center gap-2 mx-1 px-2.5 py-1.5 rounded-lg cursor-pointer select-none transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none',
        isActive
          ? 'bg-stone-200/80 text-stone-900 font-medium'
          : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
      )}
    >
      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-40" />
      <span className="flex-1 text-[13px] truncate leading-5">
        {convo.title || 'New conversation'}
      </span>
      <span className="text-[10px] text-stone-400 flex-shrink-0 tabular-nums">
        {relativeTime(convo.timestamp)}
      </span>

      {/* Three-dot menu — visible on hover */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={e => e.stopPropagation()}
            aria-label={`Actions for conversation: ${convo.title}`}
            className="h-6 w-6 flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-stone-400 hover:text-stone-600 hover:bg-stone-200"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {onRename && (
            <DropdownMenuItem
              onClick={e => {
                e.stopPropagation();
                onRename();
              }}
            >
              <PenLine className="w-3.5 h-3.5 mr-2" />
              Rename
            </DropdownMenuItem>
          )}
          {onMoveToProject && availableProjects && availableProjects.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <FolderOpen className="w-3.5 h-3.5 mr-2" />
                Move to project
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {availableProjects.map(p => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={e => {
                      e.stopPropagation();
                      onMoveToProject(p.id);
                    }}
                  >
                    <span className="truncate">{p.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={e => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-stone-700 focus:text-stone-700"
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
  onToggleExpand: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation?: (id: string) => void;
  onMoveConversation?: (conversationId: string, targetProjectId: string) => void;
  allProjects?: Project[];
  onNewChat: () => void;
  onTogglePin?: (id: string) => void;
  onArchiveProject?: (id: string) => void;
  onDeleteProject?: (id: string) => void;
}> = ({
  project,
  isActive,
  isExpanded,
  conversations,
  activeConversationId,
  onSelect,
  onToggleExpand,
  onSelectConversation,
  onDeleteConversation,
  onRenameConversation,
  onMoveConversation,
  allProjects,
  onNewChat,
  onTogglePin,
  onArchiveProject,
  onDeleteProject,
}) => {
  const badge = SUBMISSION_BADGE[project.type] ?? FALLBACK_BADGE;
  const isPinned = project.starred || project.pinned;

  return (
    <div className="mb-0.5">
      <div
        className={cn(
          'group relative flex items-center gap-2 mx-1 px-2.5 py-2 rounded-lg cursor-pointer select-none transition-all duration-150',
          isActive ? 'bg-stone-200/80 text-stone-900' : 'text-stone-700 hover:bg-stone-100'
        )}
      >
        {/* Expand chevron — toggles expand independently */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={e => {
            e.stopPropagation();
            onToggleExpand();
          }}
          aria-label={isExpanded ? 'Collapse project' : 'Expand project'}
          className="h-5 w-5 flex-shrink-0 p-0.5 rounded hover:bg-stone-200/50 transition-colors"
        >
          <ChevronDown
            className={cn(
              'w-3 h-3 transition-transform duration-150',
              isActive ? 'text-stone-500' : 'text-stone-400',
              !isExpanded && '-rotate-90'
            )}
          />
        </Button>

        {/* Colored project dot (Claude.ai style) */}
        <span
          onClick={onSelect}
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            backgroundColor: project.color || SIDEBAR_TYPE_COLORS[project.type] || '#6366f1',
          }}
        />

        {/* Project name — clicking selects the project */}
        <span
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
            'flex-1 text-[13px] font-medium truncate leading-5 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none rounded',
            isActive ? 'text-stone-900' : 'text-stone-700'
          )}
        >
          {project.name}
        </span>

        {/* Conversation count badge (when not expanded) */}
        {!isExpanded && conversations.length > 0 && (
          <span className="text-[10px] text-stone-400 tabular-nums flex-shrink-0">
            {conversations.length}
          </span>
        )}

        {/* Starred indicator */}
        {isPinned && <Star className="w-3 h-3 flex-shrink-0 fill-current text-stone-400" />}

        {/* Three-dot menu — visible on hover */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={e => e.stopPropagation()}
              aria-label={`Actions for ${project.name}`}
              className={cn(
                'h-6 w-6 flex-shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity',
                isActive
                  ? 'text-stone-500 hover:text-stone-700 hover:bg-stone-300/50'
                  : 'text-stone-400 hover:text-stone-600 hover:bg-stone-200'
              )}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem
              onClick={e => {
                e.stopPropagation();
                onSelect();
                onNewChat();
              }}
            >
              <MessageSquare className="w-3.5 h-3.5 mr-2" />
              New conversation
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={e => {
                e.stopPropagation();
                onTogglePin?.(project.id);
              }}
            >
              {isPinned ? (
                <>
                  <PinOff className="w-3.5 h-3.5 mr-2" />
                  Unpin
                </>
              ) : (
                <>
                  <Pin className="w-3.5 h-3.5 mr-2" />
                  Pin
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={e => {
                e.stopPropagation();
                onArchiveProject?.(project.id);
              }}
            >
              <Archive className="w-3.5 h-3.5 mr-2" />
              Archive
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={e => {
                e.stopPropagation();
                onDeleteProject?.(project.id);
              }}
              className="text-stone-700 focus:text-stone-700"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Expanded: nested conversations */}
      {isExpanded && (
        <div className="ml-3 pl-3 border-l border-stone-200 mt-0.5 space-y-0.5 pb-1">
          {/* New conversation within project */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={e => {
              e.stopPropagation();
              onNewChat();
            }}
            className="h-auto w-full justify-start gap-2 px-2.5 py-1.5 text-xs text-stone-500 hover:text-stone-700 hover:bg-stone-50 rounded-md transition-colors"
          >
            <Plus className="w-3 h-3" />
            New chat
          </Button>

          {conversations.length === 0 && (
            <p className="px-2.5 py-2 text-[11px] text-stone-400">No conversations yet</p>
          )}

          {conversations.map(c => (
            <ConvoRow
              key={c.id}
              convo={c}
              isActive={c.id === activeConversationId}
              onSelect={() => onSelectConversation(c.id)}
              onDelete={() => onDeleteConversation(c.id)}
              onRename={onRenameConversation ? () => onRenameConversation(c.id) : undefined}
              onMoveToProject={
                onMoveConversation
                  ? (targetProjectId: string) => onMoveConversation(c.id, targetProjectId)
                  : undefined
              }
              availableProjects={allProjects?.filter(p => p.id !== project.id)}
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
}> = React.memo(
  ({
    label,
    active,
    accentBg = 'bg-stone-100',
    accentText = 'text-stone-900',
    onClick,
    children,
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'w-9 h-9 rounded-xl transition-colors',
        active ? `${accentBg} ${accentText}` : 'text-stone-500 hover:bg-stone-200'
      )}
    >
      {children}
    </Button>
  ),
  (prev, next) => prev.label === next.label && prev.active === next.active
);

// ─── New dropdown (Create: Chat / Project / Artifact) ──────────────────────────

const NewDropdown: React.FC<{
  onNewChat: () => void;
  onNewProject: () => void;
  onNewArtifact: () => void;
}> = ({ onNewChat, onNewProject, onNewArtifact }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div className="relative mx-1" ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="h-auto w-full justify-start gap-2 px-3 py-2 rounded-lg border-stone-200 text-stone-700 text-[13px] font-medium hover:bg-stone-100"
      >
        <Plus className="w-4 h-4 flex-shrink-0" />
        New
        <ChevronDown
          className={cn(
            'w-3 h-3 ml-auto text-stone-400 transition-transform',
            open && 'rotate-180'
          )}
        />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-sm z-50 py-1"
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            role="menuitem"
            onClick={() => {
              onNewChat();
              setOpen(false);
            }}
            className="h-auto w-full justify-start gap-2 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
          >
            <MessageSquare className="w-3.5 h-3.5 text-stone-400" />
            New Chat
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            role="menuitem"
            onClick={() => {
              onNewProject();
              setOpen(false);
            }}
            className="h-auto w-full justify-start gap-2 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
          >
            <FolderOpen className="w-3.5 h-3.5 text-stone-400" />
            New Project
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            role="menuitem"
            onClick={() => {
              onNewArtifact();
              setOpen(false);
            }}
            className="h-auto w-full justify-start gap-2 px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
          >
            <FileStack className="w-3.5 h-3.5 text-stone-400" />
            New Document
          </Button>
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
  onRenameConversation,
  onMoveConversation,
  onTogglePin,
  onArchiveProject,
  onDeleteProject,
  onNavigate,
  userName,
  userEmail,
  activeNavId,
}) => {
  const displayName = userName || 'My Account';
  const avatarInitial = displayName.length > 0 ? displayName[0].toUpperCase() : 'U';
  const [searchQuery, setSearchQuery] = useState('');

  // Independent expand/collapse state for project rows
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());

  const toggleProjectExpand = (projectId: string) => {
    setExpandedProjectIds(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  // Auto-expand active project
  useEffect(() => {
    if (activeProjectId) {
      setExpandedProjectIds(prev => {
        if (prev.has(activeProjectId)) return prev;
        const next = new Set(prev);
        next.add(activeProjectId);
        return next;
      });
    }
  }, [activeProjectId]);

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
      filtered = filtered.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.type || '').toLowerCase().includes(q)
      );
    }

    const pinned = filtered.filter(p => p.starred || p.pinned);
    const recent = filtered
      .filter(p => !p.starred && !p.pinned)
      .sort((a, b) => {
        if (a.id === activeProjectId) return -1;
        if (b.id === activeProjectId) return 1;
        return a.name.localeCompare(b.name);
      });

    return { pinnedProjects: pinned, recentProjects: recent };
  }, [projects, activeProjectId, searchQuery]);

  // ── Collapsed icon-only strip ──────────────────────────────────────────────
  // Stable navigation handlers — prevents new closure per render
  const nav = useMemo(() => {
    const h = (id: string) => () => onNavigate?.(id);
    return {
      projects: h('projects'),
      apps: h('apps'),
      setup: h('setup'),
      'communication-center': h('communication-center'),
      // Project-scoped (kept for internal use but not top-level nav)
      'project-home': h('project-home'),
      'submission-builder': h('submission-builder'),
      overview: h('overview'),
      'task-board': h('task-board'),
      tools: h('tools'),
      submit: h('submit'),
      documents: h('documents'),
      'ri-copilot': h('ri-copilot'),
      review: h('review'),
      vault: h('vault'),
    };
  }, [onNavigate]);

  if (isCollapsed) {
    const activeBadge = activeProject
      ? SUBMISSION_BADGE[activeProject.type] ?? FALLBACK_BADGE
      : null;

    return (
      <aside
        className="flex flex-col h-full w-14 bg-stone-50 border-r border-stone-200 items-center py-3 gap-1 flex-shrink-0 transition-[width] duration-200 ease-out"
        role="navigation"
        aria-label="Main sidebar"
      >
        {/* Brand mark */}
        <div className="w-8 h-8 rounded-xl bg-stone-800 flex items-center justify-center flex-shrink-0 mb-1">
          <span className="text-[10px] font-bold text-white">C2C</span>
        </div>

        {/* ── Zone A: Utility ── */}
        <IconBtn label="New Chat" onClick={onNewChat}>
          <Plus className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Search" active={activeNavId === 'search'} onClick={onOpenSearch}>
          <Search className="w-4 h-4" />
        </IconBtn>

        <div className="w-8 border-t border-stone-200 my-1" />

        {/* ── Zone B: 5 Primary Destinations ── */}
        <IconBtn label="Chats" active={activeNavId === 'projects' || activeNavId === 'ri-copilot'} onClick={onOpenProjects}>
          <MessageSquare className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Projects" active={activeNavId === 'project-home'} onClick={nav.projects}>
          <FolderOpen className="w-4 h-4" />
        </IconBtn>
        <IconBtn
          label="Communication Center"
          active={activeNavId === 'communication-center'}
          onClick={nav['communication-center']}
        >
          <Activity className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Apps" active={activeNavId === 'apps'} onClick={nav.apps}>
          <Sparkles className="w-4 h-4" />
        </IconBtn>
        <IconBtn label="Settings" active={activeNavId === 'setup'} onClick={nav.setup}>
          <Settings className="w-4 h-4" />
        </IconBtn>

        {/* Bottom: expand + account */}
        <div className="mt-auto flex flex-col items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            aria-label="Expand sidebar"
            className="w-9 h-9 rounded-xl text-stone-400 hover:bg-stone-200 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <div className="w-7 h-7 rounded-full bg-stone-200 flex items-center justify-center">
            <span className="text-[10px] font-bold text-stone-600 leading-none">
              {avatarInitial}
            </span>
          </div>
        </div>
      </aside>
    );
  }

  // ── Full expanded sidebar ──────────────────────────────────────────────────
  const activeBadge = activeProject ? SUBMISSION_BADGE[activeProject.type] ?? FALLBACK_BADGE : null;

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={onToggleCollapse} />
      <aside
        className="flex flex-col h-full w-[260px] bg-stone-50/80 border-r border-stone-100 flex-shrink-0 fixed z-50 md:static md:z-auto transition-[width] duration-200 ease-out"
        role="navigation"
        aria-label="Main sidebar"
      >
        {/* Brand header */}
        <div className="flex items-center justify-between px-3 h-11 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-stone-800 flex items-center justify-center flex-shrink-0">
              <span className="text-[9px] font-bold text-white">C2C</span>
            </div>
            <span className="font-semibold text-stone-800 text-[13px]">Concept2Cure</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            className="h-8 w-8 p-1.5 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>

        {/* ── Zone A: Utility Actions ──────────────────────────────── */}
        <div className="px-1 pb-1 flex-shrink-0 space-y-0.5">
          <NewDropdown
            onNewChat={onNewChat}
            onNewProject={onOpenProjects}
            onNewArtifact={() => onNavigate?.('artifacts-center')}
          />

          <NavItem
            icon={<Search className="w-3.5 h-3.5" />}
            label="Search"
            active={activeNavId === 'search'}
            onClick={onOpenSearch}
          />
        </div>

        <div className="mx-2 border-t border-stone-100 flex-shrink-0" />

        {/* ── Zone B: 5 Primary Destinations ──────────────────────── */}
        <div className="px-1 py-1 flex-shrink-0 space-y-0.5">
          <NavItem
            icon={<MessageSquare className="w-3.5 h-3.5" />}
            label="Chats"
            active={activeNavId === 'projects' || activeNavId === 'ri-copilot'}
            onClick={onOpenProjects}
          />
          <NavItem
            icon={<FolderOpen className="w-3.5 h-3.5" />}
            label="Projects"
            active={activeNavId === 'project-home'}
            onClick={nav.projects}
          />
          <NavItem
            icon={<Activity className="w-3.5 h-3.5" />}
            label="Communication Center"
            active={activeNavId === 'communication-center'}
            onClick={nav['communication-center']}
          />
          <NavItem
            icon={<Sparkles className="w-3.5 h-3.5" />}
            label="Apps"
            active={activeNavId === 'apps'}
            onClick={nav.apps}
          />
          <NavItem
            icon={<Settings className="w-3.5 h-3.5" />}
            label="Settings"
            active={activeNavId === 'setup'}
            onClick={nav.setup}
          />
        </div>

        {/* ── Active Project Context (only when project active) ──── */}
        {activeProject && (
          <>
            <div className="mx-2 border-t border-stone-100 flex-shrink-0" />
            <div className="px-2 py-2 flex-shrink-0">
              <div className="flex items-center gap-2 px-2 mb-0.5">
                {activeBadge && (
                  <span
                    className={cn(
                      'text-[9px] font-bold px-1.5 py-0.5 rounded leading-none',
                      activeBadge.bg,
                      activeBadge.color
                    )}
                  >
                    {activeBadge.label}
                  </span>
                )}
                <span className="text-[12px] font-semibold text-stone-800 truncate flex-1">
                  {activeProject.name}
                </span>
              </div>
            </div>
          </>
        )}

        <div className="mx-2 border-t border-stone-100 flex-shrink-0" />

        {/* ── Search ──────────────────────────────────────────────────── */}
        <div className="px-2 py-1.5 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <Input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              aria-label="Search projects"
              className="w-full pl-8 pr-3 py-1.5 text-xs"
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
                  isExpanded={expandedProjectIds.has(project.id)}
                  conversations={conversationsByProject.get(project.id) || []}
                  activeConversationId={activeConversationId}
                  onSelect={() => onSelectProject?.(project.id)}
                  onToggleExpand={() => toggleProjectExpand(project.id)}
                  onSelectConversation={onSelectConversation}
                  onDeleteConversation={onDeleteConversation}
                  onRenameConversation={onRenameConversation}
                  onMoveConversation={onMoveConversation}
                  allProjects={projects}
                  onNewChat={onNewChat}
                  onTogglePin={onTogglePin}
                  onArchiveProject={onArchiveProject}
                  onDeleteProject={onDeleteProject}
                />
              ))}
            </WorkspaceGroup>
          )}

          {/* Recent projects */}
          <WorkspaceGroup
            label={pinnedProjects.length > 0 ? 'Recent' : 'Projects'}
            defaultOpen={true}
          >
            {recentProjects.length === 0 && pinnedProjects.length === 0 && (
              <EmptyState
                icon={FolderOpen}
                title="No projects yet"
                description="Create your first project to start working with AnA on your submission."
                action={{
                  label: '+ Create your first project',
                  onClick: onOpenProjects,
                  icon: Plus,
                }}
                size="sm"
                variant="minimal"
                className="mx-2"
              />
            )}

            {recentProjects.map(project => (
              <ProjectRow
                key={project.id}
                project={project}
                isActive={project.id === activeProjectId}
                isExpanded={expandedProjectIds.has(project.id)}
                conversations={conversationsByProject.get(project.id) || []}
                activeConversationId={activeConversationId}
                onSelect={() => onSelectProject?.(project.id)}
                onToggleExpand={() => toggleProjectExpand(project.id)}
                onSelectConversation={onSelectConversation}
                onDeleteConversation={onDeleteConversation}
                onRenameConversation={onRenameConversation}
                onMoveConversation={onMoveConversation}
                allProjects={projects}
                onNewChat={onNewChat}
                onTogglePin={onTogglePin}
                onArchiveProject={onArchiveProject}
                onDeleteProject={onDeleteProject}
              />
            ))}
          </WorkspaceGroup>

          {/* General conversations (no project) */}
          {unscopedConversations.length > 0 && (
            <>
              <div className="mx-2 my-1 border-t border-stone-100" />
              <WorkspaceGroup label="General" defaultOpen={!activeProjectId}>
                {unscopedConversations.map(c => (
                  <ConvoRow
                    key={c.id}
                    convo={c}
                    isActive={c.id === activeConversationId}
                    onSelect={() => onSelectConversation(c.id)}
                    onDelete={() => onDeleteConversation(c.id)}
                    onRename={onRenameConversation ? () => onRenameConversation(c.id) : undefined}
                    onMoveToProject={
                      onMoveConversation
                        ? (targetProjectId: string) => onMoveConversation(c.id, targetProjectId)
                        : undefined
                    }
                    availableProjects={projects}
                  />
                ))}
              </WorkspaceGroup>
            </>
          )}

          {/* ── SUBMISSION WORKSPACE — secondary nav ────────────────── */}
          <div className="mx-2 my-1 border-t border-stone-100" />
          <WorkspaceGroup label="Workspace" defaultOpen={true}>
            <NavItem
              icon={<Wrench className="w-3.5 h-3.5" />}
              label="Tools"
              active={activeNavId === 'documents' || activeNavId === 'tools'}
              onClick={nav.documents}
            />
            <NavItem
              icon={<PenLine className="w-3.5 h-3.5" />}
              label="Editor"
              active={activeNavId === 'submission-builder'}
              onClick={nav['submission-builder']}
            />
            <NavItem
              icon={<Brain className="w-3.5 h-3.5" />}
              label="Intelligence"
              active={activeNavId === 'ri-copilot'}
              accentColor="blue"
              onClick={nav['ri-copilot']}
            />
            <NavItem
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
              label="Review & Verify"
              active={activeNavId === 'review' || activeNavId === 'verify'}
              accentColor="emerald"
              onClick={nav.review}
            />
            <NavItem
              icon={<Archive className="w-3.5 h-3.5" />}
              label="References"
              active={activeNavId === 'vault'}
              onClick={nav.vault}
            />
            <NavItem
              icon={<Send className="w-3.5 h-3.5" />}
              label="Submit & Export"
              active={activeNavId === 'submit'}
              accentColor="blue"
              onClick={nav.submit}
            />
          </WorkspaceGroup>
        </div>

        {/* User / account footer */}
        <div className="flex-shrink-0 border-t border-stone-100 p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
            className="h-auto w-full justify-start gap-2 px-2 py-1.5 rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 text-xs transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-stone-600 leading-none">
                {avatarInitial}
              </span>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-medium text-stone-700 truncate leading-tight">
                {displayName}
              </p>
              {userEmail && (
                <p className="text-[10px] text-stone-400 truncate leading-tight">{userEmail}</p>
              )}
            </div>
          </Button>
        </div>
      </aside>
    </>
  );
};

export default ZenSidebar;
