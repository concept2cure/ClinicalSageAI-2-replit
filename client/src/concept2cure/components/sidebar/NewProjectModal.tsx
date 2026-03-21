/**
 * Concept2Cure - New Project Modal
 *
 * Modal for creating new regulatory submission projects.
 * Following Claude.ai pattern: simple selection of project type.
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
}

const submissionTypes: SubmissionTypeOption[] = [
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
  {
    type: 'MAA',
    name: 'MAA',
    fullName: 'Marketing Authorization Application',
    description: 'European approval for medicinal products (EMA)',
    icon: Globe,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50 hover:bg-pink-100 border-pink-200',
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
  },
  {
    type: 'IVDR',
    name: 'EU IVDR',
    fullName: 'EU In Vitro Diagnostic Regulation',
    description:
      'EU IVDR 2017/746 — Classification, performance evaluation & technical documentation for IVDs',
    icon: Microscope,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after successful creation with the new project ID and type */
  onProjectCreated?: (projectId: string, submissionType: SubmissionType) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ open, onClose, onProjectCreated }) => {
  const { createProject } = useProject();

  const [step, setStep] = useState<'type' | 'details' | 'success'>('type');
  const [selectedType, setSelectedType] = useState<SubmissionType | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const selectedTypeOption = submissionTypes.find(t => t.type === selectedType);

  const handleTypeSelect = (type: SubmissionType) => {
    setSelectedType(type);
    setStep('details');
  };

  const [createdProject, setCreatedProject] = useState<{ id: string; type: SubmissionType } | null>(null);

  const handleCreate = async () => {
    if (!selectedType || !projectName.trim()) return;

    setIsCreating(true);
    try {
      const project = await createProject(projectName.trim(), selectedType, projectDescription.trim() || undefined);
      setCreatedProject({ id: project.id, type: selectedType });
      setStep('success' as any);
    } catch (error) {
      console.error('Failed to create project:', error);
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
    setCreatedProject(null);
    onClose();
  };

  const handleBack = () => {
    setStep('type');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : (
              <Sparkles className="h-5 w-5 text-blue-600" />
            )}
            {step === 'type' ? 'Create New Project' : step === 'success' ? 'Project Created' : 'Project Details'}
          </DialogTitle>
          <DialogDescription>
            {step === 'type'
              ? 'Select the type of regulatory submission for your project.'
              : step === 'success'
                ? "Here's how to get started."
                : `Setting up a new ${selectedTypeOption?.fullName} project.`}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Select Type */}
        {step === 'type' && (
          <div className="grid grid-cols-2 gap-3 py-4">
            {submissionTypes.map(option => {
              const Icon = option.icon;
              return (
                <button
                  key={option.type}
                  onClick={() => handleTypeSelect(option.type)}
                  className={cn(
                    'flex flex-col items-start p-4 rounded-lg border-2 transition-all text-left',
                    option.bgColor,
                    selectedType === option.type && 'ring-2 ring-offset-2 ring-blue-500'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={cn('h-5 w-5', option.color)} />
                    <span className="font-semibold text-zinc-900">{option.name}</span>
                  </div>
                  <span className="text-xs text-zinc-600 line-clamp-2">{option.description}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Step 2: Project Details */}
        {step === 'details' && selectedTypeOption && (
          <div className="space-y-4 py-4">
            {/* Selected type indicator */}
            <div
              className={cn('flex items-center gap-3 p-3 rounded-lg', selectedTypeOption.bgColor)}
            >
              <selectedTypeOption.icon className={cn('h-5 w-5', selectedTypeOption.color)} />
              <div>
                <div className="font-medium text-zinc-900">{selectedTypeOption.name}</div>
                <div className="text-xs text-zinc-600">{selectedTypeOption.fullName}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="ml-auto text-zinc-500 hover:text-zinc-700"
              >
                Change
              </Button>
            </div>

            {/* Project name */}
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name *</Label>
              <Input
                id="project-name"
                placeholder={`e.g., ${selectedTypeOption.type === '510K' ? 'Glucose Monitor XYZ' : 'Drug Candidate ABC'}`}
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Project description */}
            <div className="space-y-2">
              <Label htmlFor="project-description">Description (optional)</Label>
              <Textarea
                id="project-description"
                placeholder="Brief description of your submission project..."
                value={projectDescription}
                onChange={e => setProjectDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* What happens next */}
            <div className="bg-zinc-50 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-medium text-zinc-900 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                What happens next
              </h4>
              <ul className="text-xs text-zinc-600 space-y-1 ml-6">
                <li>• Your project workspace will be created</li>
                <li>• You can start chatting immediately</li>
                <li>• Upload documents to build project knowledge</li>
                <li>• RI will remember everything across conversations</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 3: Success — guide user to next action */}
        {step === 'success' && selectedTypeOption && (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-50 mb-3">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-900">
                {projectName} is ready
              </h3>
              <p className="text-sm text-zinc-500 mt-1">
                Your {selectedTypeOption.fullName} project has been created.
              </p>
            </div>

            <div className="bg-zinc-50 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold text-zinc-900">What to do first</h4>
              <div className="space-y-2">
                {[
                  { step: '1', label: 'Open your project workspace', desc: 'Click below to start working' },
                  { step: '2', label: 'Ask AnA to plan your submission', desc: 'Get a step-by-step roadmap' },
                  { step: '3', label: 'Upload reference documents', desc: 'Give AnA context about your product' },
                ].map(item => (
                  <div key={item.step} className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-200 text-zinc-700 text-xs font-semibold flex items-center justify-center">
                      {item.step}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-zinc-900">{item.label}</div>
                      <div className="text-xs text-zinc-500">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
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
              <Button onClick={handleCreate} disabled={!projectName.trim() || isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
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
