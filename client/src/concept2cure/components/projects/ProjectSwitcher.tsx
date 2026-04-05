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
import { motion, AnimatePresence } from 'framer-motion';
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
  Clock,
  Globe,
} from 'lucide-react';
import { RegulatoryApplicationPicker } from './RegulatoryApplicationPicker';
import { RegulatoryApplicationSummaryCard } from './RegulatoryApplicationSummaryCard';
import { BootstrapPreviewPanel } from './BootstrapPreviewPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  isLoading?: boolean;
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
    color: 'text-stone-700',
    bgColor: 'bg-stone-50',
  },
  IND: {
    label: 'IND',
    icon: Beaker,
    color: 'text-[#6B6962]',
    bgColor: 'bg-[#FBF0EB]',
  },
  NDA: {
    label: 'NDA',
    icon: Pill,
    color: 'text-stone-700',
    bgColor: 'bg-stone-100',
  },
  BLA: {
    label: 'BLA',
    icon: Activity,
    color: 'text-[#6B6962]',
    bgColor: 'bg-[#F5F4EF]',
  },
  PMA: {
    label: 'PMA',
    icon: Heart,
    color: 'text-stone-700',
    bgColor: 'bg-stone-100',
  },
  MAA: {
    label: 'MAA',
    icon: Microscope,
    color: 'text-[#6B6962]',
    bgColor: 'bg-[#F5F4EF]',
  },
  DE_NOVO: {
    label: 'De Novo',
    icon: FileText,
    color: 'text-[#6B6962]',
    bgColor: 'bg-[#FBF0EB]',
  },
  EUA: {
    label: 'EUA',
    icon: Activity,
    color: 'text-[#6B6962]',
    bgColor: 'bg-[#FBF0EB]',
  },
  clinical_trial: {
    label: 'Clinical Trial',
    icon: Activity,
    color: 'text-[#6B6962]',
    bgColor: 'bg-[#F5F4EF]',
  },
  regulatory_submission: {
    label: 'Regulatory',
    icon: FileText,
    color: 'text-stone-700',
    bgColor: 'bg-stone-50',
  },
  medical_device: {
    label: 'Medical Device',
    icon: Heart,
    color: 'text-[#6B6962]',
    bgColor: 'bg-[#F5F4EF]',
  },
  literature_review: {
    label: 'Literature Review',
    icon: Microscope,
    color: 'text-[#6B6962]',
    bgColor: 'bg-[#F5F4EF]',
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
    color: 'text-stone-600',
    bgColor: 'bg-stone-50',
  };
  const TypeIcon = typeConfig.icon;
  const projectSummary =
    project.description?.trim() || `${typeConfig.label} regulatory project`;

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
          ? 'border-stone-300 bg-stone-50/50 ring-2 ring-stone-300/30'
          : 'border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm'
      )}
      onClick={onSelect}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute -right-px -top-px">
          <div className="w-6 h-6 rounded-bl-xl rounded-tr-xl bg-stone-800 flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      )}

      {/* Star button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={e => {
          e.stopPropagation();
          onToggleStar();
        }}
        className={cn(
          'absolute top-3 left-3 h-6 w-6',
          project.starred
            ? 'text-stone-1000'
            : 'text-stone-400 opacity-0 group-hover:opacity-100 hover:text-stone-1000'
        )}
      >
        <Star className={cn('w-4 h-4', project.starred && 'fill-current')} />
      </Button>

      {/* Menu button */}
      <div className="absolute top-3 right-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={e => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="h-6 w-6 text-stone-400 opacity-0 group-hover:opacity-100 hover:text-stone-600"
        >
          <MoreHorizontal className="w-4 h-4" />
        </Button>

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
            <div className="absolute right-0 top-8 z-20 w-40 bg-white rounded-lg shadow-sm border border-stone-200 py-1 animate-in fade-in zoom-in-95 duration-100">
              <Button
                variant="ghost"
                onClick={e => {
                  e.stopPropagation();
                  onArchive();
                  setShowMenu(false);
                }}
                className="w-full flex items-center justify-start gap-2 px-3 py-2 h-auto text-sm text-stone-700 hover:bg-stone-50"
              >
                <Archive className="w-4 h-4" />
                Archive
              </Button>
              <Button
                variant="ghost"
                onClick={e => {
                  e.stopPropagation();
                  onDelete();
                  setShowMenu(false);
                }}
                className="w-full flex items-center justify-start gap-2 px-3 py-2 h-auto text-sm text-stone-700 hover:bg-stone-100"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
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
        <h3 className="text-base font-semibold text-stone-900 mb-1 line-clamp-1">{project.name}</h3>

        {/* Summary */}
        <p className="text-sm text-stone-500 mb-3 line-clamp-2">{projectSummary}</p>

        {/* Meta */}
        <div className="flex items-center text-xs text-stone-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {formatRelativeTime(project.lastUpdated)}
          </span>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// NEW PROJECT MODAL
// ═══════════════════════════════════════════════════════════════════════════════

/** Claude.ai-style project accent colors */
const PROJECT_COLORS = [
  '#6366f1', // indigo (default)
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#22c55e', // green
  '#f59e0b', // amber
  '#f97316', // orange
  '#ef4444', // red
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#64748b', // slate
];

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: {
    name: string;
    type: SubmissionType | string;
    description?: string;
    sponsor?: string;
    product?: string;
    region?: string;
    goal?: string;
    color?: string;
    registryId?: string;
    applicationFamily?: string;
    applicationType?: string;
    agency?: string;
    dossierStandard?: string;
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
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [useGlobalRegistry, setUseGlobalRegistry] = useState(false);
  const [registryEntry, setRegistryEntry] = useState<{
    id: string; region: string; country: string; agency: string;
    applicationFamily: string; applicationType: string; displayName: string;
    productClass: string[]; dossierStandard: string; stage: string;
    synonyms: string[]; active: boolean;
    requiredArtifacts: string[]; lifecycleActions: string[];
  } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      if (useGlobalRegistry && registryEntry) {
        onCreate({
          name: name.trim(),
          type: registryEntry.applicationType as SubmissionType,
          registryId: registryEntry.id,
          applicationFamily: registryEntry.applicationFamily,
          applicationType: registryEntry.applicationType,
          agency: registryEntry.agency,
          region: registryEntry.region,
          dossierStandard: registryEntry.dossierStandard,
          description: description.trim() || undefined,
          sponsor: sponsor.trim() || undefined,
          product: product.trim() || undefined,
          goal: goal.trim() || undefined,
          color,
        });
      } else {
        onCreate({
          name: name.trim(),
          type,
          description: description.trim() || undefined,
          sponsor: sponsor.trim() || undefined,
          product: product.trim() || undefined,
          region: region || undefined,
          goal: goal.trim() || undefined,
          color,
        });
      }
      setName('');
      setDescription('');
      setType('510K');
      setSponsor('');
      setProduct('');
      setRegion('FDA');
      setGoal('');
      setColor(PROJECT_COLORS[0]);
      setUseGlobalRegistry(false);
      setRegistryEntry(null);
      onClose();
    }
  };

  return (
    <AnimatePresence>
    {isOpen && (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        onKeyDown={e => {
          if (e.key === 'Escape') onClose();
        }}
        className="fixed top-[5%] left-1/2 -translate-x-1/2 w-full max-w-lg max-h-[90vh] bg-white rounded-xl shadow-sm z-50 flex flex-col"
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-stone-200">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <h2 id="new-project-title" className="text-lg font-semibold text-stone-900">
                New Project
              </h2>
            </div>
            <p className="text-sm text-stone-500 mt-1">Create a new regulatory submission project</p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
            {/* Project name */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Project Name</label>
              <Input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., CardioFlow Heart Monitor"
                className="w-full px-4 py-2.5 rounded-lg"
                autoFocus
              />
            </div>

            {/* Project color */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Color
              </label>
              <div className="flex items-center gap-1.5">
                {PROJECT_COLORS.map(c => (
                  <Button
                    key={c}
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setColor(c)}
                    aria-label={`Select color ${c}`}
                    aria-pressed={color === c}
                    className={cn(
                      'w-6 h-6 rounded-full p-0 flex items-center justify-center',
                      color === c
                        ? 'ring-2 ring-offset-2 ring-stone-400 scale-110'
                        : 'hover:scale-110 hover:ring-1 hover:ring-stone-300'
                    )}
                    style={{ backgroundColor: c }}
                  >
                    {color === c && (
                      <Check className="w-3 h-3 text-white drop-shadow-sm" />
                    )}
                  </Button>
                ))}
              </div>
            </div>

            {/* Submission type */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-stone-700">
                  Submission Type
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setUseGlobalRegistry(!useGlobalRegistry);
                    setRegistryEntry(null);
                  }}
                  className="h-auto px-1 py-0.5 text-[11px] text-stone-400 hover:text-stone-600"
                >
                  <Globe className="w-3 h-3" />
                  {useGlobalRegistry ? 'Use quick types' : 'Browse global registry'}
                </Button>
              </div>

              {useGlobalRegistry ? (
                <div className="space-y-2">
                  {registryEntry ? (
                    <RegulatoryApplicationSummaryCard
                      entry={{
                        ...registryEntry,
                        requiredArtifacts: registryEntry.requiredArtifacts ?? [],
                        lifecycleActions: registryEntry.lifecycleActions ?? [],
                      }}
                      expanded
                      onChangeSelection={() => setRegistryEntry(null)}
                    />
                  ) : (
                    <RegulatoryApplicationPicker
                      onSelect={(entry) => setRegistryEntry(entry as typeof registryEntry)}
                      selectedId={registryEntry?.id}
                      compact
                    />
                  )}
                  {registryEntry && (
                    <BootstrapPreviewPanel registryId={registryEntry.id} />
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(SUBMISSION_TYPES) as SubmissionType[]).map(submissionType => {
                    const config = SUBMISSION_TYPES[submissionType];
                    const Icon = config.icon;
                    const isSelected = type === submissionType;

                    return (
                      <Button
                        key={submissionType}
                        type="button"
                        variant="outline"
                        onClick={() => setType(submissionType)}
                        aria-pressed={isSelected}
                        className={cn(
                          'flex flex-col items-center gap-1 p-3 h-auto rounded-lg border-2',
                          isSelected
                            ? 'border-stone-800 bg-stone-50'
                            : 'border-stone-200 hover:border-stone-300'
                        )}
                      >
                        <Icon
                          className={cn('w-5 h-5', isSelected ? 'text-stone-800' : 'text-stone-400')}
                        />
                        <span
                          className={cn(
                            'text-xs font-medium',
                            isSelected ? 'text-stone-800' : 'text-stone-600'
                          )}
                        >
                          {config.label}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Description <span className="text-stone-400">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description of the project..."
                rows={2}
                className="w-full px-4 py-2.5 rounded-lg border border-stone-200 text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-300/30 outline-none transition-all resize-none"
              />
            </div>

            {/* Sponsor */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Sponsor / Client <span className="text-stone-400">(optional)</span>
              </label>
              <Input
                type="text"
                value={sponsor}
                onChange={e => setSponsor(e.target.value)}
                placeholder="e.g., Acme Biotech, Inc."
                className="w-full px-4 py-2.5 rounded-lg"
              />
            </div>

            {/* Product / Device / Molecule */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Product / Device / Molecule <span className="text-stone-400">(optional)</span>
              </label>
              <Input
                type="text"
                value={product}
                onChange={e => setProduct(e.target.value)}
                placeholder="e.g., CardioFlow HR-200, mRNA-7621"
                className="w-full px-4 py-2.5 rounded-lg"
              />
            </div>

            {/* Region / Agency — hidden when using global registry (picker handles it) */}
            {!useGlobalRegistry && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Region / Agency
              </label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger className="w-full h-10">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FDA">FDA (United States)</SelectItem>
                  <SelectItem value="EMA">EMA (European Union)</SelectItem>
                  <SelectItem value="MHRA">MHRA (United Kingdom)</SelectItem>
                  <SelectItem value="Health Canada">Health Canada</SelectItem>
                  <SelectItem value="TGA">TGA (Australia)</SelectItem>
                  <SelectItem value="PMDA">PMDA (Japan)</SelectItem>
                  <SelectItem value="ANVISA">ANVISA (Brazil)</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            )}

            {/* Goal / Instructions */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Goal & Instructions <span className="text-stone-400">(optional)</span>
              </label>
              <textarea
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder="What are you trying to achieve? Any specific requirements or context for the RI..."
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg border border-stone-200 text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-300/30 outline-none transition-all resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-stone-200 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || (useGlobalRegistry && !registryEntry)}
            >
              Create Project
            </Button>
          </div>
        </form>
      </motion.div>
    </>
    )}
    </AnimatePresence>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PROJECT SWITCHER
// ═══════════════════════════════════════════════════════════════════════════════

export const ProjectSwitcher: React.FC<ProjectSwitcherProps> = ({
  isOpen,
  onClose,
  projects,
  isLoading = false,
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

  return (
    <AnimatePresence>
    {isOpen && (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-switcher-title"
        onKeyDown={e => {
          if (e.key === 'Escape') onClose();
        }}
        className="fixed inset-4 sm:inset-auto sm:top-[6%] sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-[560px] bg-white rounded-2xl shadow-sm border border-stone-200/70 z-50 flex flex-col max-h-[80vh]"
      >
        {/* Header */}
        <div className="flex-shrink-0 px-4 py-3 border-b border-stone-200/80">
          <div className="flex items-center justify-between mb-2">
            <h2 id="project-switcher-title" className="text-sm font-semibold text-stone-900">
              Switch Project
            </h2>
            <Button
              size="sm"
              onClick={onCreateProject}
            >
              <Plus className="w-3 h-3" />
              New
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
            <Input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border-stone-200 focus-visible:ring-stone-300 focus-visible:border-stone-300"
              autoFocus
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-2">
            {(['all', 'starred', 'archived'] as const).map(tab => (
              <Button
                key={tab}
                variant={filter === tab ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setFilter(tab)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium capitalize',
                  filter === tab
                    ? 'bg-stone-900 text-white hover:bg-stone-800'
                    : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
                )}
                aria-pressed={filter === tab}
              >
                {tab}
              </Button>
            ))}
          </div>
        </div>

        {/* Content — card-based project browser (Claude-style) */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-4 space-y-2" aria-live="polite" aria-busy="true">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-20 rounded-xl border border-stone-200 bg-stone-50/70 animate-pulse"
                />
              ))}
              <p className="text-xs text-stone-500">Loading projects…</p>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-8 px-4">
              <FileText className="w-5 h-5 mx-auto mb-2 text-stone-400" />
              <p className="text-xs text-stone-500">
                {searchQuery ? 'No projects match your search' : 'No projects yet'}
              </p>
              {!searchQuery && (
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={onCreateProject}
                >
                  <Plus className="w-3 h-3" />
                  Create your first project
                </Button>
              )}
            </div>
          ) : (
            <div className="px-4 py-3 space-y-4">
              {/* Starred section */}
              {starredProjects.length > 0 && (
                <>
                  <div className="px-0 pt-0 pb-0.5">
                    <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                      Starred
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
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
                </>
              )}

              {/* Regular projects */}
              {regularProjects.length > 0 && (
                <>
                  {starredProjects.length > 0 && (
                    <div className="px-0 pt-1 pb-0.5">
                      <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                        All Projects
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2">
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
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </>
    )}
    </AnimatePresence>
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

  return (
    <AnimatePresence>
    {isOpen && (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-project-title"
        onKeyDown={e => {
          if (e.key === 'Escape') onClose();
        }}
        className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-xl shadow-sm z-50"
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-stone-200">
            <h2 id="edit-project-title" className="text-lg font-semibold text-stone-900">
              Edit Project
            </h2>
            <p className="text-sm text-stone-500 mt-1">Update project metadata</p>
          </div>

          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            {/* Project name */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Project Name</label>
              <Input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., CardioFlow Heart Monitor"
                className="w-full px-4 py-2.5 rounded-lg"
                autoFocus
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Description <span className="text-stone-400">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description of the project..."
                rows={2}
                className="w-full px-4 py-2.5 rounded-lg border border-stone-200 text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-300/30 outline-none transition-all resize-none"
              />
            </div>

            {/* Sponsor */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Sponsor / Client <span className="text-stone-400">(optional)</span>
              </label>
              <Input
                type="text"
                value={sponsor}
                onChange={e => setSponsor(e.target.value)}
                placeholder="e.g., Acme Biotech, Inc."
                className="w-full px-4 py-2.5 rounded-lg"
              />
            </div>

            {/* Product */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Product / Device / Molecule <span className="text-stone-400">(optional)</span>
              </label>
              <Input
                type="text"
                value={product}
                onChange={e => setProduct(e.target.value)}
                placeholder="e.g., CardioFlow™, Atorvastatin 20 mg"
                className="w-full px-4 py-2.5 rounded-lg"
              />
            </div>

            {/* Region */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                Region / Agency
              </label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger className="w-full h-10">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {['FDA', 'EMA', 'MHRA', 'TGA', 'Health Canada', 'PMDA', 'ANVISA', 'Other'].map(
                    r => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-stone-200 flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim()}
            >
              Save Changes
            </Button>
          </div>
        </form>
      </motion.div>
    </>
    )}
    </AnimatePresence>
  );
};

export default ProjectSwitcher;
