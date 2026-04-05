/**
 * Concept2Cure — Projects Sidebar
 *
 * Claude.ai-style sidebar with PINNED / RECENT / GENERAL grouping,
 * project → conversation hierarchy, status dots, and pin/unpin support.
 *
 * Mirrors the design spec in .claude/skills/project-design.md §2.
 */

import React, { useState, useMemo, useCallback, useDeferredValue } from 'react';
import { useProject } from '../../context/ProjectContext';
import type { Project, SubmissionType, Conversation } from '../../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Plus,
  MessageSquare,
  FileText,
  Settings,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  MoreHorizontal,
  Trash2,
  Archive,
  Edit2,
  Clock,
  Sparkles,
  Pin,
  PinOff,
  ChevronRight,
  ChevronDown,
  FolderOpen,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NewProjectModal } from './NewProjectModal';

// ─────────────────────────────────────────────────────────────────────────────
// SUBMISSION TYPE BADGES — color-coded per skill spec §3
// ─────────────────────────────────────────────────────────────────────────────

const submissionTypeConfig: Record<
  SubmissionType,
  { label: string; color: string; dotColor: string }
> = {
  '510K': {
    label: '510K',
    color: 'bg-stone-100 text-stone-700 border-stone-200',
    dotColor: 'bg-stone-500',
  },
  IND: {
    label: 'IND',
    color: 'bg-stone-100 text-stone-700 border-stone-200',
    dotColor: 'bg-stone-500',
  },
  NDA: {
    label: 'NDA',
    color: 'bg-stone-100 text-stone-700 border-stone-200',
    dotColor: 'bg-stone-500',
  },
  BLA: {
    label: 'BLA',
    color: 'bg-stone-100 text-stone-700 border-stone-200',
    dotColor: 'bg-stone-500',
  },
  MAA: {
    label: 'MAA',
    color: 'bg-stone-100 text-stone-700 border-stone-200',
    dotColor: 'bg-stone-500',
  },
  PMA: {
    label: 'PMA',
    color: 'bg-stone-100 text-stone-700 border-stone-200',
    dotColor: 'bg-stone-500',
  },
  DE_NOVO: {
    label: 'De Novo',
    color: 'bg-stone-100 text-stone-700 border-stone-200',
    dotColor: 'bg-stone-500',
  },
  EUA: {
    label: 'EUA',
    color: 'bg-stone-100 text-stone-700 border-stone-200',
    dotColor: 'bg-stone-500',
  },
  IVDR: {
    label: 'IVDR',
    color: 'bg-stone-100 text-stone-700 border-stone-200',
    dotColor: 'bg-stone-500',
  },
};

const SubmissionBadge: React.FC<{ type: SubmissionType; compact?: boolean }> = ({
  type,
  compact,
}) => {
  const cfg = submissionTypeConfig[type] ?? submissionTypeConfig['510K'];
  if (compact) {
    return (
      <span
        className={cn('inline-block w-2 h-2 rounded-full flex-shrink-0', cfg.dotColor)}
        title={cfg.label}
      />
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] font-semibold px-1.5 py-0 leading-4 flex-shrink-0', cfg.color)}
    >
      {cfg.label}
    </Badge>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STATUS DOT — active (green), in review (amber), submitted (blue), archived (gray)
// ─────────────────────────────────────────────────────────────────────────────

const statusDotColor: Record<string, string> = {
  active: 'bg-emerald-500',
  in_review: 'bg-amber-500',
  submitted: 'bg-stone-600',
  archived: 'bg-stone-400',
  draft: 'bg-stone-300',
  planning: 'bg-stone-300',
};

const StatusDot: React.FC<{ status?: string }> = ({ status }) => (
  <span
    className={cn(
      'inline-block w-1.5 h-1.5 rounded-full flex-shrink-0',
      statusDotColor[status || 'active'] ?? 'bg-emerald-500'
    )}
    title={status || 'active'}
  />
);

// ─────────────────────────────────────────────────────────────────────────────
// TIME FORMATTING
// ─────────────────────────────────────────────────────────────────────────────

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION ROW — nested under expanded project
// ─────────────────────────────────────────────────────────────────────────────

interface ConversationRowProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

const ConversationRow: React.FC<ConversationRowProps> = ({ conversation, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-md transition-colors text-[13px]',
      isActive
        ? 'bg-stone-100 text-stone-900 font-medium'
        : 'text-stone-500 hover:bg-stone-50 hover:text-stone-700'
    )}
  >
    <span
      className={cn(
        'w-1.5 h-1.5 rounded-full flex-shrink-0',
        isActive ? 'bg-stone-900' : 'bg-transparent'
      )}
    />
    <span className="truncate flex-1">{conversation.title || 'New conversation'}</span>
    <span className="text-[11px] text-stone-400 flex-shrink-0 tabular-nums">
      {formatRelativeTime(conversation.updatedAt)}
    </span>
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT ROW — with expand/collapse for conversation nesting
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectRowProps {
  project: Project;
  isActive: boolean;
  isExpanded: boolean;
  isCollapsed: boolean; // sidebar collapsed
  conversations: Conversation[];
  activeConversationId?: string | null;
  onSelect: () => void;
  onToggleExpand: () => void;
  onPin: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
}

const ProjectRow: React.FC<ProjectRowProps> = ({
  project,
  isActive,
  isExpanded,
  isCollapsed,
  conversations,
  activeConversationId,
  onSelect,
  onToggleExpand,
  onPin,
  onDelete,
  onArchive,
  onNewConversation,
  onSelectConversation,
}) => {
  const submissionType = project.submissionType || project.type || '510K';

  // Collapsed sidebar: icon only
  if (isCollapsed) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={onSelect}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-150',
                isActive
                  ? 'bg-stone-100 text-stone-900 ring-1 ring-stone-200'
                  : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900'
              )}
            >
              <SubmissionBadge type={submissionType} compact />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[220px]">
            <div className="space-y-1">
              <div className="font-medium text-sm">{project.name}</div>
              <div className="flex items-center gap-2 text-xs text-stone-500">
                <SubmissionBadge type={submissionType} />
                <StatusDot status={project.status} />
                <span>{project.conversationCount ?? conversations.length} chats</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Expanded sidebar: full row
  return (
    <div className={cn('group rounded-lg transition-all', isActive ? 'bg-stone-50' : '')}>
      {/* Project header row */}
      <div
        className={cn(
          'relative flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors',
          isActive
            ? 'border-l-2 border-stone-900 bg-stone-50'
            : 'border-l-2 border-transparent hover:bg-stone-50'
        )}
      >
        {/* Expand chevron */}
        <button
          onClick={e => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="p-0.5 rounded text-stone-400 hover:text-stone-600 flex-shrink-0"
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Submission badge */}
        <SubmissionBadge type={submissionType} />

        {/* Project name + metadata */}
        <button onClick={onSelect} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'text-[13px] truncate',
                isActive ? 'font-semibold text-stone-900' : 'font-medium text-stone-700'
              )}
            >
              {project.name}
            </span>
            <StatusDot status={project.status} />
          </div>
          {project.product && (
            <p className="text-[11px] text-stone-400 truncate mt-0.5">{project.product}</p>
          )}
        </button>

        {/* Three-dot menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0',
                'hover:bg-stone-200 text-stone-400 hover:text-stone-600'
              )}
              onClick={e => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={onNewConversation}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              New chat
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Edit2 className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPin}>
              {project.pinned ? (
                <>
                  <PinOff className="mr-2 h-3.5 w-3.5" />
                  Unpin
                </>
              ) : (
                <>
                  <Pin className="mr-2 h-3.5 w-3.5" />
                  Pin
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onArchive}>
              <Archive className="mr-2 h-3.5 w-3.5" />
              Archive
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Expanded: conversation list */}
      {isExpanded && (
        <div className="ml-5 pl-3 border-l border-stone-200 space-y-0.5 pb-2 pt-1">
          {/* New conversation link */}
          <button
            onClick={onNewConversation}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-[12px] text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
          >
            <Plus className="h-3 w-3" />
            New chat
          </button>

          {/* Conversation rows */}
          {conversations.length > 0 ? (
            conversations.map(convo => (
              <ConversationRow
                key={convo.id}
                conversation={convo}
                isActive={activeConversationId === convo.id}
                onClick={() => onSelectConversation(convo.id)}
              />
            ))
          ) : (
            <p className="px-2 py-2 text-[11px] text-stone-400">No conversations yet</p>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION HEADER — PINNED / RECENT / GENERAL
// ─────────────────────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ label: string; count?: number }> = ({ label, count }) => (
  <div className="flex items-center justify-between px-3 pt-4 pb-1.5">
    <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
      {label}
    </span>
    {count !== undefined && count > 0 && (
      <span className="text-[10px] text-stone-400 tabular-nums">{count}</span>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SIDEBAR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const ProjectsSidebar: React.FC = () => {
  const {
    state,
    activeProject,
    activeConversation,
    projectConversations,
    setActiveProject,
    setActiveConversation,
    createConversation,
    deleteProject,
    updateProject,
    toggleSidebar,
  } = useProject();

  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const isCollapsed = state.ui.sidebarCollapsed;

  // ── Grouping: PINNED / RECENT / GENERAL ──
  const { pinned, recent, general } = useMemo(() => {
    let projects = state.projects.filter(p => p.status !== 'archived');

    if (deferredSearchQuery) {
      const q = deferredSearchQuery.toLowerCase();
      projects = projects.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          (p.submissionType || p.type || '').toLowerCase().includes(q) ||
          p.product?.toLowerCase().includes(q)
      );
    }

    // Sort by last active descending
    projects.sort(
      (a, b) =>
        new Date(b.lastActiveAt || b.updatedAt).getTime() -
        new Date(a.lastActiveAt || a.updatedAt).getTime()
    );

    const pinnedProjects = projects.filter(p => p.pinned);
    const unpinnedProjects = projects.filter(p => !p.pinned);

    // Recent: activity in last 7 days (not pinned)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentProjects = unpinnedProjects.filter(
      p => new Date(p.lastActiveAt || p.updatedAt).getTime() > sevenDaysAgo
    );
    const olderProjects = unpinnedProjects.filter(
      p => new Date(p.lastActiveAt || p.updatedAt).getTime() <= sevenDaysAgo
    );

    return { pinned: pinnedProjects, recent: recentProjects, general: olderProjects };
  }, [state.projects, deferredSearchQuery]);

  // Get conversations for a specific project
  const getProjectConversations = useCallback(
    (projectId: string): Conversation[] => {
      if (activeProject?.id === projectId) return projectConversations;
      const proj = state.projects.find(p => p.id === projectId);
      return proj?.conversations ?? [];
    },
    [activeProject, projectConversations, state.projects]
  );

  // ── Handlers ──

  const handleProjectSelect = (projectId: string) => {
    setActiveProject(projectId);
    // Auto-expand on select
    setExpandedProjectIds(prev => new Set(prev).add(projectId));
  };

  const toggleExpand = (projectId: string) => {
    setExpandedProjectIds(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleNewConversation = async (projectId: string) => {
    setActiveProject(projectId);
    const convo = await createConversation(projectId);
    setActiveConversation(convo.id);
  };

  const handleDeleteProject = (projectId: string) => {
    if (confirm('Delete this project? This cannot be undone.')) {
      deleteProject(projectId);
    }
  };

  const handleArchiveProject = (projectId: string) => {
    updateProject(projectId, { status: 'archived' });
  };

  const handlePinProject = (project: Project) => {
    updateProject(project.id, { pinned: !project.pinned });
  };

  // ── Render helper for a group of projects ──
  const renderProjectList = (projects: Project[]) =>
    projects.map(project => (
      <ProjectRow
        key={project.id}
        project={project}
        isActive={activeProject?.id === project.id}
        isExpanded={expandedProjectIds.has(project.id) || activeProject?.id === project.id}
        isCollapsed={isCollapsed}
        conversations={getProjectConversations(project.id)}
        activeConversationId={activeConversation?.id}
        onSelect={() => handleProjectSelect(project.id)}
        onToggleExpand={() => toggleExpand(project.id)}
        onPin={() => handlePinProject(project)}
        onDelete={() => handleDeleteProject(project.id)}
        onArchive={() => handleArchiveProject(project.id)}
        onNewConversation={() => handleNewConversation(project.id)}
        onSelectConversation={id => setActiveConversation(id)}
      />
    ));

  const allProjects = [...pinned, ...recent, ...general];
  const hasAnyProjects = allProjects.length > 0;

  // ──────────────────────────────────────────────────────────────────────────
  // COLLAPSED SIDEBAR
  // ──────────────────────────────────────────────────────────────────────────

  if (isCollapsed) {
    return (
      <div className="flex h-full w-16 flex-col border-r border-stone-200/50 bg-stone-50/80 backdrop-blur-sm">
        {/* Toggle */}
        <div className="flex h-14 items-center justify-center border-b border-stone-200/50">
          <button
            onClick={() => toggleSidebar(false)}
            className="p-2 rounded-md text-stone-500 hover:bg-stone-200/50 hover:text-stone-700"
          >
            <PanelLeftOpen className="h-5 w-5" />
          </button>
        </div>

        {/* New Project */}
        <div className="p-2">
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowNewProjectModal(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-900 text-white hover:bg-stone-800 transition-colors"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">New Project</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Projects */}
        <ScrollArea className="flex-1 px-2">
          <div className="space-y-1.5 py-2">
            {allProjects.map(project => (
              <ProjectRow
                key={project.id}
                project={project}
                isActive={activeProject?.id === project.id}
                isExpanded={false}
                isCollapsed={true}
                conversations={[]}
                activeConversationId={null}
                onSelect={() => handleProjectSelect(project.id)}
                onToggleExpand={() => {}}
                onPin={() => handlePinProject(project)}
                onDelete={() => handleDeleteProject(project.id)}
                onArchive={() => handleArchiveProject(project.id)}
                onNewConversation={() => handleNewConversation(project.id)}
                onSelectConversation={() => {}}
              />
            ))}
          </div>
        </ScrollArea>

        {/* Settings */}
        <div className="border-t border-stone-200/50 p-2">
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button className="flex h-10 w-10 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-200/50 hover:text-stone-700">
                  <Settings className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <NewProjectModal
          open={showNewProjectModal}
          onClose={() => setShowNewProjectModal(false)}
          onProjectCreated={projectId => {
            setActiveProject(projectId);
            setShowNewProjectModal(false);
          }}
        />
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EXPANDED SIDEBAR
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full w-72 flex-col border-r border-stone-200/50 bg-stone-50/80 backdrop-blur-sm">
      {/* Header — brand + collapse */}
      <div className="flex h-14 items-center justify-between border-b border-stone-200/50 px-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-stone-700 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-semibold text-sm text-stone-900">ClinicalSage</span>
        </div>
        <button
          onClick={() => toggleSidebar(true)}
          className="p-1.5 rounded-md text-stone-400 hover:bg-stone-200/50 hover:text-stone-600"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* New Project + Search */}
      <div className="px-3 pt-3 space-y-2">
        <Button
          onClick={() => setShowNewProjectModal(true)}
          className="w-full justify-start gap-2 h-9 text-[13px]"
          variant="default"
        >
          <Plus className="h-4 w-4" />
          New Project
        </Button>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-[13px] bg-white border border-stone-200 rounded-md placeholder:text-stone-400 focus:ring-2 focus:ring-stone-900 focus:border-stone-900 outline-none transition-colors"
          />
        </div>
      </div>

      {/* Project List with grouping */}
      <ScrollArea className="flex-1 px-2 pt-1">
        {!hasAnyProjects ? (
          /* ── Empty state per spec §9 ── */
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mb-3">
              <FolderOpen className="w-5 h-5 text-stone-400" />
            </div>
            <p className="text-sm font-medium text-stone-700 mb-1">No projects yet</p>
            <p className="text-xs text-stone-500 leading-relaxed">
              Create your first regulatory project to unlock AnA's full intelligence, dossier
              mapping, and readiness scoring.
            </p>
            <Button
              onClick={() => setShowNewProjectModal(true)}
              className="mt-4 h-8 text-xs"
              variant="default"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create your first project
            </Button>
          </div>
        ) : (
          <div className="pb-4">
            {/* PINNED section */}
            {pinned.length > 0 && (
              <>
                <SectionHeader label="Pinned" count={pinned.length} />
                <div className="space-y-0.5 px-1">{renderProjectList(pinned)}</div>
              </>
            )}

            {/* RECENT section */}
            {recent.length > 0 && (
              <>
                <SectionHeader label="Recent" count={recent.length} />
                <div className="space-y-0.5 px-1">{renderProjectList(recent)}</div>
              </>
            )}

            {/* GENERAL (older) section */}
            {general.length > 0 && (
              <>
                <SectionHeader
                  label={pinned.length > 0 || recent.length > 0 ? 'General' : 'Projects'}
                  count={general.length}
                />
                <div className="space-y-0.5 px-1">{renderProjectList(general)}</div>
              </>
            )}

            {/* Search: no results */}
            {searchQuery && allProjects.length === 0 && (
              <div className="py-8 text-center text-sm text-stone-500">
                No projects matching "{searchQuery}"
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-stone-200/50 p-2">
        <button className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-stone-500 hover:bg-stone-100 hover:text-stone-700 transition-colors">
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>

      <NewProjectModal
        open={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        onProjectCreated={projectId => {
          setActiveProject(projectId);
          setExpandedProjectIds(prev => new Set(prev).add(projectId));
          setShowNewProjectModal(false);
        }}
      />
    </div>
  );
};

export default ProjectsSidebar;
