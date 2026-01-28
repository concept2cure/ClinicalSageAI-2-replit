/**
 * Concept2Cure - Projects Sidebar
 * 
 * Claude.ai-style sidebar with Projects list, conversations, and navigation.
 * This replaces the traditional module-based navigation.
 */

import React, { useState, useMemo } from 'react';
import { useProject } from '../../context/ProjectContext';
import type { Project, SubmissionType } from '../../types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Plus,
  MessageSquare,
  FileText,
  ChevronRight,
  ChevronDown,
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
  LayoutGrid,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NewProjectModal } from './NewProjectModal';
import { ArtifactsCatalog } from '../templates/ArtifactsCatalog';
import { ProjectKnowledge } from '../knowledge';

// ─────────────────────────────────────────────────────────────────────────────
// SUBMISSION TYPE BADGES
// ─────────────────────────────────────────────────────────────────────────────

const submissionTypeColors: Record<SubmissionType, string> = {
  '510K': 'bg-blue-100 text-blue-700 border-blue-200',
  'IND': 'bg-purple-100 text-purple-700 border-purple-200',
  'NDA': 'bg-green-100 text-green-700 border-green-200',
  'BLA': 'bg-orange-100 text-orange-700 border-orange-200',
  'MAA': 'bg-pink-100 text-pink-700 border-pink-200',
  'PMA': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'DE_NOVO': 'bg-amber-100 text-amber-700 border-amber-200',
  'EUA': 'bg-red-100 text-red-700 border-red-200',
};

const SubmissionBadge: React.FC<{ type: SubmissionType }> = ({ type }) => (
  <Badge
    variant="outline"
    className={cn('text-[10px] font-medium px-1.5 py-0', submissionTypeColors[type])}
  >
    {type.replace('_', ' ')}
  </Badge>
);

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT ITEM
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectItemProps {
  project: Project;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: () => void;
  onDelete: () => void;
  onArchive: () => void;
}

const ProjectItem: React.FC<ProjectItemProps> = ({
  project,
  isActive,
  isCollapsed,
  onClick,
  onDelete,
  onArchive,
}) => {
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(date).toLocaleDateString();
  };

  if (isCollapsed) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              onClick={onClick}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg transition-all',
                isActive
                  ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <span className="text-sm font-semibold">
                {project.name.charAt(0).toUpperCase()}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[200px]">
            <div className="space-y-1">
              <div className="font-medium">{project.name}</div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <SubmissionBadge type={project.type} />
                <span>·</span>
                <span>{project.conversationCount} chats</span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div
      className={cn(
        'group relative rounded-lg transition-all cursor-pointer',
        isActive
          ? 'bg-blue-50 ring-1 ring-blue-200'
          : 'hover:bg-gray-50'
      )}
    >
      <button
        onClick={onClick}
        className="w-full p-3 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'font-medium truncate',
                  isActive ? 'text-blue-900' : 'text-gray-900'
                )}
              >
                {project.name}
              </span>
              <SubmissionBadge type={project.type} />
            </div>
            {project.description && (
              <p className="mt-0.5 text-xs text-gray-500 truncate">
                {project.description}
              </p>
            )}
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {project.conversationCount}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {project.artifactCount}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(project.lastActiveAt)}
              </span>
            </div>
          </div>
        </div>
      </button>

      {/* Actions dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'absolute right-2 top-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity',
              'hover:bg-gray-200 text-gray-400 hover:text-gray-600'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem>
            <Edit2 className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onArchive}>
            <Archive className="mr-2 h-4 w-4" />
            Archive
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            className="text-red-600 focus:text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATION ITEM (within a project)
// ─────────────────────────────────────────────────────────────────────────────

interface ConversationItemProps {
  title: string;
  lastMessage?: string;
  updatedAt: Date;
  isActive: boolean;
  artifactCount: number;
  onClick: () => void;
}

const ConversationItem: React.FC<ConversationItemProps> = ({
  title,
  lastMessage,
  updatedAt,
  isActive,
  artifactCount,
  onClick,
}) => {
  const formatTime = (date: Date) => {
    const now = new Date();
    const d = new Date(date);
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full px-3 py-2 text-left rounded-md transition-colors',
        isActive
          ? 'bg-gray-100 text-gray-900'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            <span className="text-sm font-medium truncate">{title}</span>
          </div>
          {lastMessage && (
            <p className="mt-0.5 text-xs text-gray-400 truncate pl-5">
              {lastMessage}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] text-gray-400">{formatTime(updatedAt)}</span>
          {artifactCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
              <FileText className="h-2.5 w-2.5" />
              {artifactCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

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
  const [showArtifactsCatalog, setShowArtifactsCatalog] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const isCollapsed = state.ui.sidebarCollapsed;

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    let projects = state.projects.filter(p => p.status === 'active');
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      projects = projects.filter(
        p =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.type.toLowerCase().includes(query)
      );
    }

    return projects.sort(
      (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );
  }, [state.projects, searchQuery]);

  const handleProjectClick = (projectId: string) => {
    if (activeProject?.id === projectId) {
      // Toggle expansion
      setExpandedProjectId(expandedProjectId === projectId ? null : projectId);
    } else {
      setActiveProject(projectId);
      setExpandedProjectId(projectId);
    }
  };

  const handleNewConversation = async () => {
    if (activeProject) {
      const convo = await createConversation(activeProject.id);
      setActiveConversation(convo.id);
    }
  };

  const handleDeleteProject = (projectId: string) => {
    if (confirm('Are you sure you want to delete this project? This cannot be undone.')) {
      deleteProject(projectId);
    }
  };

  const handleArchiveProject = (projectId: string) => {
    updateProject(projectId, { status: 'archived' });
  };

  // Collapsed sidebar view
  if (isCollapsed) {
    return (
      <div className="flex h-full w-16 flex-col border-r border-gray-200 bg-white">
        {/* Logo / Toggle */}
        <div className="flex h-14 items-center justify-center border-b border-gray-200">
          <button
            onClick={() => toggleSidebar(false)}
            className="p-2 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700"
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
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">New Project</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Projects List */}
        <ScrollArea className="flex-1 px-2">
          <div className="space-y-2 py-2">
            {filteredProjects.map(project => (
              <ProjectItem
                key={project.id}
                project={project}
                isActive={activeProject?.id === project.id}
                isCollapsed={true}
                onClick={() => handleProjectClick(project.id)}
                onDelete={() => handleDeleteProject(project.id)}
                onArchive={() => handleArchiveProject(project.id)}
              />
            ))}
          </div>
        </ScrollArea>

        {/* Settings */}
        <div className="border-t border-gray-200 p-2">
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700">
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
        />
      </div>
    );
  }

  // Expanded sidebar view
  return (
    <div className="flex h-full w-72 flex-col border-r border-gray-200 bg-white">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          <span className="font-semibold text-gray-900">Concept2Cure</span>
        </div>
        <button
          onClick={() => toggleSidebar(true)}
          className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-md placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* New Project Button */}
      <div className="p-3">
        <Button
          onClick={() => setShowNewProjectModal(true)}
          className="w-full justify-start gap-2"
          variant="default"
        >
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Projects List */}
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-1 pb-4">
          {filteredProjects.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              {searchQuery ? (
                <p>No projects found</p>
              ) : (
                <div className="space-y-2">
                  <p>No projects yet</p>
                  <p className="text-xs">Create your first regulatory submission project</p>
                </div>
              )}
            </div>
          ) : (
            filteredProjects.map(project => (
              <div key={project.id}>
                <ProjectItem
                  project={project}
                  isActive={activeProject?.id === project.id}
                  isCollapsed={false}
                  onClick={() => handleProjectClick(project.id)}
                  onDelete={() => handleDeleteProject(project.id)}
                  onArchive={() => handleArchiveProject(project.id)}
                />

                {/* Expanded conversations list */}
                {activeProject?.id === project.id &&
                  expandedProjectId === project.id && (
                    <div className="mt-1 ml-2 pl-3 border-l-2 border-gray-100 space-y-0.5">
                      {/* Project Knowledge Panel - Claude.ai parity */}
                      <div className="py-2">
                        <ProjectKnowledge project={activeProject} />
                      </div>

                      {/* New conversation button */}
                      <button
                        onClick={handleNewConversation}
                        className="w-full px-3 py-1.5 text-left text-xs text-blue-600 hover:bg-blue-50 rounded-md flex items-center gap-2"
                      >
                        <Plus className="h-3 w-3" />
                        New conversation
                      </button>

                      {/* Conversations */}
                      {projectConversations.map(convo => (
                        <ConversationItem
                          key={convo.id}
                          title={convo.title}
                          lastMessage={convo.messages[convo.messages.length - 1]?.content}
                          updatedAt={convo.updatedAt}
                          isActive={activeConversation?.id === convo.id}
                          artifactCount={convo.artifacts.length}
                          onClick={() => setActiveConversation(convo.id)}
                        />
                      ))}
                    </div>
                  )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-gray-200 p-3 space-y-1">
        <button
          onClick={() => setShowArtifactsCatalog(true)}
          className="w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50 rounded-md flex items-center gap-2"
        >
          <LayoutGrid className="h-4 w-4" />
          Templates Catalog
        </button>
        <button className="w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-50 rounded-md flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>

      <NewProjectModal
        open={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
      />

      <ArtifactsCatalog
        open={showArtifactsCatalog}
        onClose={() => setShowArtifactsCatalog(false)}
      />
    </div>
  );
};

export default ProjectsSidebar;
