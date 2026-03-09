/**
 * @fileoverview Project Workspace Switcher
 * @module concept2cure/components/projects/ProjectSwitcher
 * @version 3.0.0
 *
 * @description
 * ChatGPT-style project/workspace selector with quick switching.
 * Elegant modal for creating and switching between regulatory projects.
 *
 * @compliance
 * - FDA 21 CFR Part 11: Project changes logged
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Plus,
  Search,
  FileText,
  Beaker,
  Pill,
  Activity,
  Heart,
  Microscope,
  MoreHorizontal,
  Check,
  Star,
  Archive,
  Trash2,
  ChevronRight,
  Clock,
  Users,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface Project {
  id: string;
  name: string;
  type: string;
  description?: string;
  starred?: boolean;
  archived?: boolean;
  lastUpdated: Date;
  conversationCount: number;
  teamMembers?: number;
}

type SubmissionType = '510K' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'MAA' | 'DE_NOVO' | 'EUA';

interface ProjectSwitcherProps {
  isOpen: boolean;
  onClose: () => void;
  projects: any[];
  activeProjectId?: string;
  onSelectProject: (id: string) => void;
  onCreateProject: () => void;
  onArchiveProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onToggleStar: (id: string) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMISSION TYPE CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

type SubmissionTypeKey = SubmissionType | string;

const SUBMISSION_TYPE_FALLBACK = {
  label: 'Project',
  icon: FileText,
  color: 'text-zinc-600',
  bgColor: 'bg-zinc-50',
};

const SUBMISSION_TYPES: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
  }
> = {
  '510K': {
    label: '510(k)',
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  IND: {
    label: 'IND',
    icon: Beaker,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  NDA: {
    label: 'NDA',
    icon: Pill,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  BLA: {
    label: 'BLA',
    icon: Activity,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  PMA: {
    label: 'PMA',
    icon: Heart,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  MAA: {
    label: 'MAA',
    icon: Microscope,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
  },
  DE_NOVO: {
    label: 'De Novo',
    icon: FileText,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  EUA: {
    label: 'EUA',
    icon: Activity,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
  },
  clinical_trial: {
    label: 'Clinical Trial',
    icon: Activity,
    color: 'text-teal-600',
    bgColor: 'bg-teal-50',
  },
  regulatory_submission: {
    label: 'Regulatory',
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  medical_device: {
    label: 'Medical Device',
    icon: Heart,
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
  },
  literature_review: {
    label: 'Literature Review',
    icon: Microscope,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface ProjectCardProps {
  project: Project;
  isActive: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isActive,
  onSelect,
  onToggleStar,
  onArchive,
  onDelete,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const typeConfig = SUBMISSION_TYPES[project.type] ?? {
    label: project.type || 'Project',
    icon: FileText,
    color: 'text-zinc-600',
    bgColor: 'bg-zinc-50',
  };
  const TypeIcon = typeConfig.icon;

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

  return (
    <div
      className={cn(
        'group relative p-4 rounded-xl border transition-all cursor-pointer',
        isActive
          ? 'border-blue-200 bg-blue-50/50 ring-2 ring-blue-500/20'
          : 'border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm'
      )}
      onClick={onSelect}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute -right-px -top-px">
          <div className="w-6 h-6 rounded-bl-xl rounded-tr-xl bg-blue-500 flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      )}

      {/* Star button */}
      <button
        onClick={e => {
          e.stopPropagation();
          onToggleStar();
        }}
        className={cn(
          'absolute top-3 left-3 p-1 rounded-md transition-all',
          project.starred
            ? 'text-amber-500'
            : 'text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-amber-500'
        )}
      >
        <Star className={cn('w-4 h-4', project.starred && 'fill-current')} />
      </button>

      {/* Menu button */}
      <div className="absolute top-3 right-3">
        <button
          onClick={e => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="p-1 rounded-md text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-zinc-600 hover:bg-zinc-100 transition-all"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {/* Dropdown menu */}
        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={e => {
                e.stopPropagation();
                setShowMenu(false);
              }}
            />
            <div className="absolute right-0 top-8 z-20 w-40 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={e => {
                  e.stopPropagation();
                  onArchive();
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                <Archive className="w-4 h-4" />
                Archive
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  onDelete();
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="pt-6">
        {/* Type badge */}
        <div
          className={cn(
            'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium mb-3',
            typeConfig.bgColor,
            typeConfig.color
          )}
        >
          <TypeIcon className="w-3.5 h-3.5" />
          {typeConfig.label}
        </div>

        {/* Name */}
        <h3 className="text-base font-semibold text-zinc-900 mb-1 line-clamp-1">{project.name}</h3>

        {/* Description */}
        {project.description && (
          <p className="text-sm text-zinc-500 mb-3 line-clamp-2">{project.description}</p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {formatRelativeTime(project.lastUpdated)}
          </span>
          {project.teamMembers && (
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {project.teamMembers}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// NEW PROJECT MODAL
// ═══════════════════════════════════════════════════════════════════════════════

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    name: string;
    type: SubmissionType;
    description?: string;
    sponsor?: string;
    product?: string;
    region?: string;
    goal?: string;
  }) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<SubmissionType>('510K');
  const [description, setDescription] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [product, setProduct] = useState('');
  const [region, setRegion] = useState('FDA');
  const [goal, setGoal] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate({
        name: name.trim(),
        type,
        description: description.trim() || undefined,
        sponsor: sponsor.trim() || undefined,
        product: product.trim() || undefined,
        region: region || undefined,
        goal: goal.trim() || undefined,
      });
      setName('');
      setDescription('');
      setType('510K');
      setSponsor('');
      setProduct('');
      setRegion('FDA');
      setGoal('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-2xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-100">
            <h2 className="text-lg font-semibold text-zinc-900">New Project</h2>
            <p className="text-sm text-zinc-500 mt-1">Create a new regulatory submission project</p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            {/* Project name */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Project Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., CardioFlow Heart Monitor"
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                autoFocus
              />
            </div>

            {/* Submission type */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Submission Type
              </label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(SUBMISSION_TYPES) as SubmissionType[]).map(submissionType => {
                  const config = SUBMISSION_TYPES[submissionType];
                  const Icon = config.icon;
                  const isSelected = type === submissionType;

                  return (
                    <button
                      key={submissionType}
                      type="button"
                      onClick={() => setType(submissionType)}
                      className={cn(
                        'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all',
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-zinc-200 hover:border-zinc-300'
                      )}
                    >
                      <Icon
                        className={cn('w-5 h-5', isSelected ? 'text-blue-600' : 'text-zinc-400')}
                      />
                      <span
                        className={cn(
                          'text-xs font-medium',
                          isSelected ? 'text-blue-600' : 'text-zinc-600'
                        )}
                      >
                        {config.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Description <span className="text-zinc-400">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description of the project..."
                rows={2}
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
              />
            </div>

            {/* Sponsor */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Sponsor / Client <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                value={sponsor}
                onChange={e => setSponsor(e.target.value)}
                placeholder="e.g., Acme Biotech, Inc."
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              />
            </div>

            {/* Product / Device / Molecule */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Product / Device / Molecule <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                value={product}
                onChange={e => setProduct(e.target.value)}
                placeholder="e.g., CardioFlow HR-200, mRNA-7621"
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              />
            </div>

            {/* Region / Agency */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Region / Agency
              </label>
              <select
                value={region}
                onChange={e => setRegion(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all bg-white"
              >
                <option value="FDA">FDA (United States)</option>
                <option value="EMA">EMA (European Union)</option>
                <option value="MHRA">MHRA (United Kingdom)</option>
                <option value="Health Canada">Health Canada</option>
                <option value="TGA">TGA (Australia)</option>
                <option value="PMDA">PMDA (Japan)</option>
                <option value="ANVISA">ANVISA (Brazil)</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Goal / Instructions */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Goal & Instructions <span className="text-zinc-400">(optional)</span>
              </label>
              <textarea
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder="What are you trying to achieve? Any specific requirements or context for the RI..."
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className={cn(
                'px-4 py-2 text-sm font-medium text-white rounded-lg transition-all',
                name.trim() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-zinc-300 cursor-not-allowed'
              )}
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PROJECT SWITCHER
// ═══════════════════════════════════════════════════════════════════════════════

export const ProjectSwitcher: React.FC<ProjectSwitcherProps> = ({
  isOpen,
  onClose,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onArchiveProject,
  onDeleteProject,
  onToggleStar,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'starred' | 'archived'>('all');

  // Filter projects
  const filteredProjects = projects.filter(project => {
    // Search filter
    if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    // Status filter
    if (filter === 'starred' && !project.starred) return false;
    if (filter === 'archived' && !project.archived) return false;
    if (filter === 'all' && project.archived) return false;

    return true;
  });

  // Group by starred
  const starredProjects = filteredProjects.filter(p => p.starred);
  const regularProjects = filteredProjects.filter(p => !p.starred);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-4 sm:inset-auto sm:top-[10%] sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-3xl bg-white rounded-2xl shadow-2xl z-50 flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900">Projects</h2>
            <button
              onClick={onCreateProject}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {(['all', 'starred', 'archived'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize',
                  filter === tab ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredProjects.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-zinc-100 flex items-center justify-center">
                <FileText className="w-6 h-6 text-zinc-400" />
              </div>
              <h3 className="text-base font-medium text-zinc-900 mb-1">No projects found</h3>
              <p className="text-sm text-zinc-500">
                {searchQuery
                  ? 'Try a different search term'
                  : 'Create your first project to get started'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Starred section */}
              {starredProjects.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                    Starred
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {starredProjects.map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        isActive={project.id === activeProjectId}
                        onSelect={() => {
                          onSelectProject(project.id);
                          onClose();
                        }}
                        onToggleStar={() => onToggleStar(project.id)}
                        onArchive={() => onArchiveProject(project.id)}
                        onDelete={() => onDeleteProject(project.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Regular projects */}
              {regularProjects.length > 0 && (
                <div>
                  {starredProjects.length > 0 && (
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                      All Projects
                    </h3>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {regularProjects.map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        isActive={project.id === activeProjectId}
                        onSelect={() => {
                          onSelectProject(project.id);
                          onClose();
                        }}
                        onToggleStar={() => onToggleStar(project.id)}
                        onArchive={() => onArchiveProject(project.id)}
                        onDelete={() => onDeleteProject(project.id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT PROJECT MODAL
// ═══════════════════════════════════════════════════════════════════════════════

interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: {
    name: string;
    description?: string;
    sponsor?: string;
    product?: string;
    region?: string;
  };
  onSave: (data: {
    name: string;
    description?: string;
    sponsor?: string;
    product?: string;
    region?: string;
  }) => void;
}

export const EditProjectModal: React.FC<EditProjectModalProps> = ({
  isOpen,
  onClose,
  initialData,
  onSave,
}) => {
  const [name, setName] = useState(initialData.name);
  const [description, setDescription] = useState(initialData.description ?? '');
  const [sponsor, setSponsor] = useState(initialData.sponsor ?? '');
  const [product, setProduct] = useState(initialData.product ?? '');
  const [region, setRegion] = useState(initialData.region ?? 'FDA');

  // Re-sync form when the modal opens with fresh data
  React.useEffect(() => {
    if (isOpen) {
      setName(initialData.name);
      setDescription(initialData.description ?? '');
      setSponsor(initialData.sponsor ?? '');
      setProduct(initialData.product ?? '');
      setRegion(initialData.region ?? 'FDA');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        sponsor: sponsor.trim() || undefined,
        product: product.trim() || undefined,
        region: region || undefined,
      });
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-2xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-100">
            <h2 className="text-lg font-semibold text-zinc-900">Edit Project</h2>
            <p className="text-sm text-zinc-500 mt-1">Update project metadata</p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            {/* Project name */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Project Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., CardioFlow Heart Monitor"
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                autoFocus
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Description <span className="text-zinc-400">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description of the project..."
                rows={2}
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
              />
            </div>

            {/* Sponsor */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Sponsor / Client <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                value={sponsor}
                onChange={e => setSponsor(e.target.value)}
                placeholder="e.g., Acme Biotech, Inc."
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              />
            </div>

            {/* Product */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Product / Device / Molecule <span className="text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                value={product}
                onChange={e => setProduct(e.target.value)}
                placeholder="e.g., CardioFlow™, Atorvastatin 20 mg"
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              />
            </div>

            {/* Region */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                Region / Agency
              </label>
              <select
                value={region}
                onChange={e => setRegion(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
              >
                {['FDA', 'EMA', 'MHRA', 'TGA', 'Health Canada', 'PMDA', 'ANVISA', 'Other'].map(
                  r => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </>
  );
};

export default ProjectSwitcher;
