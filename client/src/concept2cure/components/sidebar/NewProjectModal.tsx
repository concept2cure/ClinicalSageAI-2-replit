/**
 * Concept2Cure — New Project Modal
 *
 * Three steps: (1) Select submission type, (2) Project details with biotech-specific
 * fields when relevant, (3) Success with submission-type-aware next actions.
 *
 * All interactive elements use governed primitives (Button, Input, Label, etc.).
 */

import React, { useState, useMemo } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Beaker,
  Activity,
  BookOpen,
  FileCheck,
  Package,
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
  category: 'biotech' | 'device' | 'international';
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
    category: 'biotech',
  },
  {
    type: 'NDA',
    name: 'NDA',
    fullName: 'New Drug Application',
    description: 'Full approval application for new pharmaceutical drugs',
    icon: Pill,
    color: 'text-green-600',
    bgColor: 'bg-green-50 hover:bg-green-100 border-green-200',
    category: 'biotech',
  },
  {
    type: 'BLA',
    name: 'BLA',
    fullName: 'Biologics License Application',
    description: 'Approval for biological products like vaccines and blood products',
    icon: Syringe,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 hover:bg-orange-100 border-orange-200',
    category: 'biotech',
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
    category: 'device',
  },
  {
    type: 'MAA',
    name: 'MAA',
    fullName: 'Marketing Authorization Application',
    description: 'European approval for medicinal products (EMA)',
    icon: Globe,
    color: 'text-pink-600',
    bgColor: 'bg-pink-50 hover:bg-pink-100 border-pink-200',
    category: 'international',
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
    category: 'device',
  },
  {
    type: 'DE_NOVO',
    name: 'De Novo',
    fullName: 'De Novo Classification',
    description: 'Novel low-to-moderate risk devices without predicates',
    icon: Sparkles,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 hover:bg-amber-100 border-amber-200',
    category: 'device',
  },
  {
    type: 'EUA',
    name: 'EUA',
    fullName: 'Emergency Use Authorization',
    description: 'Emergency authorization for unapproved medical products',
    icon: Shield,
    color: 'text-red-600',
    bgColor: 'bg-red-50 hover:bg-red-100 border-red-200',
    category: 'device',
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
    category: 'international',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// BIOTECH-SPECIFIC OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

const MOLECULE_TYPES = [
  { value: 'small_molecule', label: 'Small Molecule' },
  { value: 'monoclonal_antibody', label: 'Monoclonal Antibody' },
  { value: 'adc', label: 'Antibody-Drug Conjugate' },
  { value: 'bispecific', label: 'Bispecific Antibody' },
  { value: 'peptide', label: 'Peptide' },
  { value: 'oligonucleotide', label: 'Oligonucleotide (ASO/siRNA)' },
  { value: 'mrna', label: 'mRNA Therapeutic' },
  { value: 'gene_therapy', label: 'Gene Therapy' },
  { value: 'cell_therapy', label: 'Cell Therapy (CAR-T/TCR)' },
  { value: 'vaccine', label: 'Vaccine' },
  { value: 'biosimilar', label: 'Biosimilar' },
  { value: 'other', label: 'Other' },
];

const THERAPEUTIC_AREAS = [
  { value: 'oncology', label: 'Oncology' },
  { value: 'immunology', label: 'Immunology / Inflammation' },
  { value: 'neurology', label: 'Neurology / CNS' },
  { value: 'cardiovascular', label: 'Cardiovascular' },
  { value: 'metabolic', label: 'Metabolic / Endocrine' },
  { value: 'infectious', label: 'Infectious Disease' },
  { value: 'rare_disease', label: 'Rare / Orphan Disease' },
  { value: 'hematology', label: 'Hematology' },
  { value: 'gastro', label: 'Gastroenterology' },
  { value: 'respiratory', label: 'Respiratory' },
  { value: 'dermatology', label: 'Dermatology' },
  { value: 'ophthalmology', label: 'Ophthalmology' },
  { value: 'other', label: 'Other' },
];

const CLINICAL_PHASES = [
  { value: 'preclinical', label: 'Preclinical' },
  { value: 'phase1', label: 'Phase 1' },
  { value: 'phase1_2', label: 'Phase 1/2' },
  { value: 'phase2', label: 'Phase 2' },
  { value: 'phase2_3', label: 'Phase 2/3' },
  { value: 'phase3', label: 'Phase 3' },
  { value: 'phase3_complete', label: 'Phase 3 Complete' },
  { value: 'bla_filing', label: 'BLA/NDA Filing' },
];

const ROUTES_OF_ADMIN = [
  { value: 'oral', label: 'Oral' },
  { value: 'iv', label: 'Intravenous (IV)' },
  { value: 'sc', label: 'Subcutaneous (SC)' },
  { value: 'im', label: 'Intramuscular (IM)' },
  { value: 'topical', label: 'Topical' },
  { value: 'inhalation', label: 'Inhalation' },
  { value: 'intrathecal', label: 'Intrathecal' },
  { value: 'other', label: 'Other' },
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
// SUBMISSION-TYPE-AWARE SUGGESTED ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

const BIOTECH_ACTIONS = [
  { label: 'Map eCTD Structure', icon: Map, description: 'Set up your Module 1-5 structure' },
  { label: 'Upload Source Documents', icon: Upload, description: 'Import protocols, IB, CMC data' },
  { label: 'Run Gap Analysis', icon: BarChart2, description: 'Identify missing sections and data' },
  { label: 'Draft with AnA', icon: BookOpen, description: 'Start authoring with AI assistance' },
];

const DEVICE_ACTIONS = [
  { label: 'Start Dossier Map', icon: Map, description: 'Map your CTD structure' },
  { label: 'Add Documents', icon: Upload, description: 'Upload reference docs' },
  { label: 'Run Readiness Check', icon: BarChart2, description: 'Assess submission readiness' },
  { label: 'Find Predicates', icon: Search, description: 'Search predicate devices' },
];

function getActionsForType(type: SubmissionType) {
  const biotechTypes: SubmissionType[] = ['IND', 'NDA', 'BLA', 'MAA'];
  return biotechTypes.includes(type) ? BIOTECH_ACTIONS : DEVICE_ACTIONS;
}

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

  // Biotech-specific fields
  const [moleculeType, setMoleculeType] = useState('');
  const [therapeuticArea, setTherapeuticArea] = useState('');
  const [indication, setIndication] = useState('');
  const [clinicalPhase, setClinicalPhase] = useState('');
  const [routeOfAdmin, setRouteOfAdmin] = useState('');
  const [mechanism, setMechanism] = useState('');

  const selectedTypeOption = submissionTypes.find((t) => t.type === selectedType);
  const isBiotech = selectedTypeOption?.category === 'biotech' || selectedTypeOption?.category === 'international';

  const biotechTypes = useMemo(
    () => submissionTypes.filter(t => t.category === 'biotech'),
    [],
  );
  const deviceTypes = useMemo(
    () => submissionTypes.filter(t => t.category === 'device'),
    [],
  );
  const intlTypes = useMemo(
    () => submissionTypes.filter(t => t.category === 'international'),
    [],
  );

  const handleTypeSelect = (type: SubmissionType) => {
    setSelectedType(type);
    setStep('details');
  };

  const handleCreate = async () => {
    if (!selectedType || !projectName.trim()) return;

    setIsCreating(true);
    setCreateError(null);
    try {
      const descParts: string[] = [];
      if (projectDescription.trim()) descParts.push(projectDescription.trim());
      if (sponsor.trim()) descParts.push(`Sponsor: ${sponsor.trim()}`);
      if (targetAgency) descParts.push(`Agency: ${targetAgency}`);
      if (targetDate) descParts.push(`Target: ${targetDate}`);
      // Biotech-specific metadata
      if (moleculeType) descParts.push(`Molecule: ${MOLECULE_TYPES.find(m => m.value === moleculeType)?.label || moleculeType}`);
      if (therapeuticArea) descParts.push(`TA: ${THERAPEUTIC_AREAS.find(t => t.value === therapeuticArea)?.label || therapeuticArea}`);
      if (indication.trim()) descParts.push(`Indication: ${indication.trim()}`);
      if (clinicalPhase) descParts.push(`Phase: ${CLINICAL_PHASES.find(p => p.value === clinicalPhase)?.label || clinicalPhase}`);
      if (routeOfAdmin) descParts.push(`Route: ${ROUTES_OF_ADMIN.find(r => r.value === routeOfAdmin)?.label || routeOfAdmin}`);
      if (mechanism.trim()) descParts.push(`MoA: ${mechanism.trim()}`);
      if (customInstructions.trim()) descParts.push(`Instructions: ${customInstructions.trim()}`);

      const project = await createProject(
        projectName.trim(),
        selectedType,
        descParts.join(' · ') || undefined,
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
    setMoleculeType('');
    setTherapeuticArea('');
    setIndication('');
    setClinicalPhase('');
    setRouteOfAdmin('');
    setMechanism('');
    onClose();
  };

  const handleBack = () => {
    setStep('type');
  };

  // ── Type grid helper ──
  const TypeGrid: React.FC<{ types: SubmissionTypeOption[]; label: string }> = ({ types, label }) => (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-stone-400">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {types.map((option) => {
          const Icon = option.icon;
          return (
            <Button
              key={option.type}
              variant="outline"
              onClick={() => handleTypeSelect(option.type)}
              className={cn(
                'flex flex-col items-start h-auto p-3 rounded-lg border transition-all text-left gap-1',
                option.bgColor,
                selectedType === option.type && 'ring-2 ring-offset-1 ring-stone-900',
              )}
            >
              <div className="flex items-center gap-1.5 w-full">
                <Icon className={cn('h-3.5 w-3.5 shrink-0', option.color)} />
                <span className="font-semibold text-[13px] text-stone-900">{option.name}</span>
                {option.earlyAccess && (
                  <span className="text-[8px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 ml-auto">
                    Early
                  </span>
                )}
              </div>
              <span className="text-[10px] text-stone-500 leading-snug line-clamp-2">
                {option.description}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[640px]">
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
                : `New ${selectedTypeOption?.name} Project`}
          </DialogTitle>
          <DialogDescription>
            {step === 'type'
              ? 'Select the submission type for your regulatory project.'
              : step === 'success'
                ? 'Your project is ready. Here are some next steps.'
                : `Configure your ${selectedTypeOption?.fullName} project.`}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Select Type ── */}
        {step === 'type' && (
          <div className="space-y-4 py-3">
            <TypeGrid types={biotechTypes} label="Drug & Biologics" />
            <TypeGrid types={deviceTypes} label="Medical Devices" />
            {intlTypes.length > 0 && (
              <TypeGrid types={intlTypes} label="International" />
            )}
          </div>
        )}

        {/* ── Step 2: Project Details ── */}
        {step === 'details' && selectedTypeOption && (
          <div className="space-y-4 py-3 max-h-[60vh] overflow-y-auto">
            {/* Selected type indicator */}
            <div
              className={cn(
                'flex items-center gap-3 p-2.5 rounded-lg border',
                selectedTypeOption.bgColor,
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

            {/* Product / Drug Name */}
            <div className="space-y-1.5">
              <Label htmlFor="project-name" className="text-[13px]">
                {isBiotech ? 'Product / Drug Name' : 'Product / Device Name'} *
              </Label>
              <Input
                id="project-name"
                placeholder={
                  isBiotech
                    ? 'e.g., MRD-2847 (Drug Candidate)'
                    : 'e.g., Coronary Stent Model X'
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
                placeholder={isBiotech ? 'e.g., Meridian Therapeutics' : 'e.g., Acme Medical Devices, Inc.'}
                value={sponsor}
                onChange={(e) => setSponsor(e.target.value)}
                className="h-9"
              />
            </div>

            {/* ── Biotech-specific fields ── */}
            {isBiotech && (
              <>
                <div className="relative flex items-center py-0.5">
                  <div className="flex-1 border-t border-stone-100" />
                  <span className="mx-3 text-[10px] font-medium uppercase tracking-wider text-stone-300 select-none">
                    molecule & indication
                  </span>
                  <div className="flex-1 border-t border-stone-100" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Molecule Type</Label>
                    <Select value={moleculeType} onValueChange={setMoleculeType}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {MOLECULE_TYPES.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Therapeutic Area</Label>
                    <Select value={therapeuticArea} onValueChange={setTherapeuticArea}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {THERAPEUTIC_AREAS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="indication" className="text-[13px]">
                    Indication
                  </Label>
                  <Input
                    id="indication"
                    placeholder="e.g., Non-small cell lung cancer (NSCLC)"
                    value={indication}
                    onChange={(e) => setIndication(e.target.value)}
                    className="h-9"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Clinical Phase</Label>
                    <Select value={clinicalPhase} onValueChange={setClinicalPhase}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {CLINICAL_PHASES.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Route of Administration</Label>
                    <Select value={routeOfAdmin} onValueChange={setRouteOfAdmin}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ROUTES_OF_ADMIN.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="mechanism" className="text-[13px]">
                    Mechanism of Action
                  </Label>
                  <Input
                    id="mechanism"
                    placeholder="e.g., Selective CDK4/6 inhibitor with novel binding profile"
                    value={mechanism}
                    onChange={(e) => setMechanism(e.target.value)}
                    className="h-9"
                  />
                </div>
              </>
            )}

            {/* Target Agency */}
            <div className="relative flex items-center py-0.5">
              <div className="flex-1 border-t border-stone-100" />
              <span className="mx-3 text-[10px] font-medium uppercase tracking-wider text-stone-300 select-none">
                submission details
              </span>
              <div className="flex-1 border-t border-stone-100" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px]">Target Agency</Label>
              <div className="flex gap-2">
                {TARGET_AGENCIES.map((agency) => (
                  <Button
                    key={agency.value}
                    variant={targetAgency === agency.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTargetAgency(agency.value)}
                    className={cn(
                      'flex-1 gap-1.5 h-9',
                      targetAgency === agency.value
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-white text-stone-700 border-stone-200',
                    )}
                  >
                    <span className="text-xs">{agency.flag}</span>
                    {agency.label}
                  </Button>
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
                {isBiotech && indication && (
                  <span className="block text-[12px] text-stone-400 mt-0.5">
                    {indication}{therapeuticArea ? ` · ${THERAPEUTIC_AREAS.find(t => t.value === therapeuticArea)?.label}` : ''}
                  </span>
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {getActionsForType(selectedType!).map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.label}
                    variant="outline"
                    onClick={handleOpenProject}
                    className="flex items-center gap-2.5 h-auto p-3 rounded-lg border-stone-200 bg-white hover:bg-stone-50 text-left"
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
                  </Button>
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
                  'Create Project'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
