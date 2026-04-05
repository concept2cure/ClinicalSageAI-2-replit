/**
 * Concept2Cure — New Project Modal
 *
 * Enhanced project creation flow per .claude/skills/project-design.md §5.
 * Three steps: (1) Select submission type, (2) Project details with sponsor/agency/date/instructions,
 * (3) Success with guided next actions.
 */

import React, { useState } from 'react';
import { useProject } from '../../context/ProjectContext';
import type { SubmissionType } from '../../types';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  FileText,
  FlaskConical,
  Pill,
  Syringe,
  Globe,
  Shield,
  Sparkles,
  Loader2,
  CheckCircle2,
  Microscope,
  Map,
  Upload,
  BarChart2,
  Search,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// SUBMISSION TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

interface SubmissionTypeOption {
  type: SubmissionType;
  name: string;
  fullName: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  /** If true, shows "Early Access" badge — workflow exists but not fully production-hardened */
  earlyAccess?: boolean;
}

const submissionTypes: SubmissionTypeOption[] = [
  // ── Biotech / Pharma (first-class beta tracks) ──
  {
    type: 'IND',
    name: 'IND',
    fullName: 'Investigational New Drug',
    description: 'Permission to begin clinical trials for a new drug',
    icon: FlaskConical,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 hover:bg-purple-100 border-purple-200',
  },
  {
    type: 'NDA',
    name: 'NDA',
    fullName: 'New Drug Application',
    description: 'Full approval application for new pharmaceutical drugs',
    icon: Pill,
    color: 'text-green-600',
    bgColor: 'bg-green-50 hover:bg-green-100 border-green-200',
  },
  {
    type: 'BLA',
    name: 'BLA',
    fullName: 'Biologics License Application',
    description: 'Approval for biological products like vaccines and blood products',
    icon: Syringe,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
  },
  // ── Medical Device ──
  {
    type: '510K',
    name: '510(k)',
    fullName: 'Premarket Notification',
    description: 'Medical device clearance demonstrating substantial equivalence',
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
  },
  {
    type: 'MAA',
    name: 'MAA',
    fullName: 'Marketing Authorization Application',
    description: 'European approval for medicinal products (EMA)',
    icon: Globe,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50 hover:bg-pink-100 border-pink-200',
    earlyAccess: true,
  },
  {
    type: 'PMA',
    name: 'PMA',
    fullName: 'Premarket Approval',
    description: 'FDA approval for Class III high-risk medical devices',
    icon: Shield,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50 hover:bg-cyan-100 border-cyan-200',
  },
  {
    type: 'DE_NOVO',
    name: 'De Novo',
    fullName: 'De Novo Classification',
    description: 'Novel low-to-moderate risk devices without predicates',
    icon: Sparkles,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
  },
  {
    type: 'EUA',
    name: 'EUA',
    fullName: 'Emergency Use Authorization',
    description: 'Emergency authorization for unapproved medical products',
    icon: Shield,
    color: 'text-red-600',
    bgColor: 'bg-red-50 hover:bg-red-100 border-red-200',
    earlyAccess: true,
  },
  {
    type: 'IVDR',
    name: 'EU IVDR',
    fullName: 'EU In Vitro Diagnostic Regulation',
    description:
      'EU IVDR 2017/746 — Classification, performance evaluation & technical documentation for IVDs',
    icon: Microscope,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 hover:bg-blue-100 border-blue-200',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// TARGET AGENCIES
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_AGENCIES = [
  { value: 'FDA', label: 'FDA', flag: '🇺🇸' },
  { value: 'EMA', label: 'EMA', flag: '🇪🇺' },
  { value: 'PMDA', label: 'PMDA', flag: '🇯🇵' },
  { value: 'Health Canada', label: 'Health Canada', flag: '🇨🇦' },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUGGESTED ACTIONS (post-creation)
// ─────────────────────────────────────────────────────────────────────────────

const SUGGESTED_ACTIONS = [
  { label: 'Start Dossier Map', icon: Map, description: 'Map your CTD structure' },
  { label: 'Add Documents', icon: Upload, description: 'Upload reference docs' },
  { label: 'Run Readiness Check', icon: BarChart2, description: 'Assess submission readiness' },
  { label: 'Find Predicates', icon: Search, description: 'Search predicate devices' },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  onProjectCreated?: (projectId: string, submissionType: SubmissionType) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  open,
  onClose,
  onProjectCreated,
}) => {
  const { createProject } = useProject();

  const [step, setStep] = useState<'type' | 'details' | 'success'>('type');
  const [selectedType, setSelectedType] = useState<SubmissionType | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [targetAgency, setTargetAgency] = useState('FDA');
  const [targetDate, setTargetDate] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdProject, setCreatedProject] = useState<{
    id: string;
    type: SubmissionType;
  } | null>(null);

  const selectedTypeOption = submissionTypes.find((t) => t.type === selectedType);

  const handleTypeSelect = (type: SubmissionType) => {
    setSelectedType(type);
    setStep('details');
  };

  const handleCreate = async () => {
    if (!selectedType || !projectName.trim()) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      // Build description that includes sponsor/agency/instructions context
      const descParts: string[] = [];
      if (projectDescription.trim()) descParts.push(projectDescription.trim());
      if (sponsor.trim()) descParts.push(`Sponsor: ${sponsor.trim()}`);
      if (targetAgency) descParts.push(`Agency: ${targetAgency}`);
      if (targetDate) descParts.push(`Target: ${targetDate}`);
      if (customInstructions.trim()) descParts.push(`Instructions: ${customInstructions.trim()}`);

      const project = await createProject(
        projectName.trim(),
        selectedType,
        descParts.join(' · ') || undefined
      );
      setCreatedProject({ id: project.id, type: selectedType });
      setStep('success');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to create project. Please try again.';
      setCreateError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenProject = () => {
    if (createdProject) {
      onProjectCreated?.(createdProject.id, createdProject.type);
    }
    handleClose();
  };

  const handleClose = () => {
    setStep('type');
    setSelectedType(null);
    setProjectName('');
    setProjectDescription('');
    setSponsor('');
    setTargetAgency('FDA');
    setTargetDate('');
    setCustomInstructions('');
    setCreatedProject(null);
    setCreateError(null);
    onClose();
  };

  const handleBack = () => {
    setStep('type');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {step === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <Sparkles className="h-5 w-5 text-violet-600" />
            )}
            {step === 'type'
              ? 'New Project'
              : step === 'success'
                ? 'Project Created'
                : 'Project Details'}
          </DialogTitle>
          <DialogDescription>
            {step === 'type'
              ? 'Select the submission type for your regulatory project.'
              : step === 'success'
                ? 'Your project is ready. Here are some next steps.'
                : `Setting up a new ${selectedTypeOption?.fullName} project.`}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Select Type ── */}
        {step === 'type' && (
          <div className="grid grid-cols-2 gap-2.5 py-3">
            {submissionTypes.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.type}
                  onClick={() => handleTypeSelect(option.type)}
                  className={cn(
                    'flex flex-col items-start p-3.5 rounded-lg border transition-all text-left',
                    option.bgColor,
                    selectedType === option.type &&
                      'ring-2 ring-offset-1 ring-stone-900'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <Icon className={cn('h-4 w-4', option.color)} />
                    <span className="font-semibold text-sm text-stone-900">
                      {option.name}
                    </span>
                    {option.earlyAccess && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                        Early Access
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-stone-600 leading-relaxed line-clamp-2">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Step 2: Project Details (Enhanced per spec §5) ── */}
        {step === 'details' && selectedTypeOption && (
          <div className="space-y-4 py-3 max-h-[60vh] overflow-y-auto">
            {/* Selected type indicator */}
            <div
              className={cn(
                'flex items-center gap-3 p-2.5 rounded-lg border',
                selectedTypeOption.bgColor
              )}
            >
              <selectedTypeOption.icon
                className={cn('h-4 w-4', selectedTypeOption.color)}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-stone-900">
                  {selectedTypeOption.name}
                </div>
                <div className="text-[11px] text-stone-500">
                  {selectedTypeOption.fullName}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="text-xs text-stone-500 hover:text-stone-700 h-7"
              >
                Change
              </Button>
            </div>

            {/* Product / Device Name */}
            <div className="space-y-1.5">
              <Label htmlFor="project-name" className="text-[13px]">
                Product / Device Name *
              </Label>
              <Input
                id="project-name"
                placeholder={
                  selectedTypeOption.type === '510K'
                    ? 'e.g., Coronary Stent Model X'
                    : 'e.g., Drug Candidate ABC'
                }
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && projectName.trim() && !isCreating)
                    handleCreate();
                }}
                autoFocus
                className="h-9"
              />
            </div>

            {/* Sponsor / Organization */}
            <div className="space-y-1.5">
              <Label htmlFor="project-sponsor" className="text-[13px]">
                Sponsor / Organization
              </Label>
              <Input
                id="project-sponsor"
                placeholder="e.g., Acme Medical Devices, Inc."
                value={sponsor}
                onChange={(e) => setSponsor(e.target.value)}
                className="h-9"
              />
            </div>

            {/* Target Agency */}
            <div className="space-y-1.5">
              <Label className="text-[13px]">Target Agency</Label>
              <div className="flex gap-2">
                {TARGET_AGENCIES.map((agency) => (
                  <button
                    key={agency.value}
                    onClick={() => setTargetAgency(agency.value)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all',
                      targetAgency === agency.value
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:bg-stone-50'
                    )}
                  >
                    <span className="text-xs">{agency.flag}</span>
                    {agency.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Target Submission Date */}
            <div className="space-y-1.5">
              <Label htmlFor="target-date" className="text-[13px]">
                Target Submission Date
              </Label>
              <Input
                id="target-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="h-9"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="project-description" className="text-[13px]">
                Description (optional)
              </Label>
              <Input
                id="project-description"
                placeholder="Brief description of your submission project..."
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                className="h-9"
              />
            </div>

            {/* Custom Instructions */}
            <div className="space-y-1.5">
              <Label htmlFor="custom-instructions" className="text-[13px]">
                Custom Instructions (optional)
              </Label>
              <Textarea
                id="custom-instructions"
                placeholder={`Tell AnA what to remember about this ${selectedTypeOption.name} project...`}
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                rows={3}
                className="text-[13px] resize-y"
              />
              <p className="text-[11px] text-stone-400">
                These instructions are injected into every conversation in this
                project.
              </p>
            </div>
          </div>
        )}

        {/* ── Step 3: Success — guided next actions ── */}
        {step === 'success' && selectedTypeOption && (
          <div className="space-y-4 py-3">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 mb-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="text-base font-semibold text-stone-900">
                {projectName} is ready
              </h3>
              <p className="text-sm text-stone-500 mt-1">
                Your {selectedTypeOption.fullName} project has been created.
              </p>
            </div>

            {/* Suggested action chips per spec §5 */}
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTED_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={handleOpenProject}
                    className="flex items-center gap-2.5 p-3 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4 text-stone-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-stone-900">
                        {action.label}
                      </div>
                      <div className="text-[11px] text-stone-500">
                        {action.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'type' ? (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          ) : step === 'success' ? (
            <Button onClick={handleOpenProject} className="w-full">
              <Sparkles className="mr-2 h-4 w-4" />
              Open Project Workspace
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
              {createError && (
                <div
                  role="alert"
                  className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                >
                  {createError}
                </div>
              )}
              <Button
                onClick={handleCreate}
                disabled={!projectName.trim() || isCreating}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Create Project
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewProjectModal;
