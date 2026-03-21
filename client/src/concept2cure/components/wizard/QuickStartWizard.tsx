/**
 * @fileoverview Quick Start Project Wizard
 * @module concept2cure/components/wizard/QuickStartWizard
 * @version 1.0.0
 *
 * @description
 * Guided project creation wizard for regulatory submissions.
 * Different wizards for different organizational contexts:
 * - Biotech: Product-centric (IND, NDA, BLA paths)
 * - Pharma: Portfolio-based (global program setup)
 * - CRO: Client/SOW-based (project + deliverables)
 *
 * Wizard handles:
 * - Submission type selection
 * - Regulatory region configuration
 * - Team assembly
 * - Timeline calculation
 * - Template selection
 * - Checklist generation
 *
 * @compliance
 * - FDA Guidance awareness for submission types
 * - ICH CTD structure auto-configuration
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Building2,
  Beaker,
  Users,
  Pill,
  Heart,
  Brain,
  Syringe,
  Shield,
  Info,
  Sparkles,
  Microscope,
  GraduationCap,
  PenTool,
  ClipboardCheck,
} from 'lucide-react';
import type { IndustryMode } from '../../types/workspace';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type SubmissionType = 
  | 'ind'       // Investigational New Drug
  | 'nda'       // New Drug Application
  | 'bla'       // Biologics License Application
  | 'anda'      // Abbreviated NDA (Generics)
  | '510k'      // Medical Device
  | 'pma'       // Pre-Market Approval
  | 'maa'       // Marketing Authorization Application (EU)
  | 'cta'       // Clinical Trial Application (EU)
  | 'j-nda'     // Japanese NDA
  | 'variation' // Post-approval changes
  | 'annual';   // Annual Report

export type RegulatoryRegion = 'us' | 'eu' | 'jp' | 'cn' | 'row' | 'global';

export type TherapeuticArea = 
  | 'oncology'
  | 'cardiovascular'
  | 'cns'
  | 'immunology'
  | 'infectious'
  | 'metabolic'
  | 'rare_disease'
  | 'dermatology'
  | 'ophthalmology'
  | 'respiratory'
  | 'other';

export interface WizardData {
  industryMode?: IndustryMode;
  submissionType?: SubmissionType;
  regions?: RegulatoryRegion[];
  therapeuticArea?: TherapeuticArea;
  productName?: string;
  projectName?: string;
  studyPhase?: string;
  targetDate?: string;
  teamMembers?: string[];
  clientName?: string;  // For CRO
  sowNumber?: string;   // For CRO
  modules?: string[];   // CTD modules needed
}

interface QuickStartWizardProps {
  onComplete: (data: WizardData) => void;
  onCancel: () => void;
  initialData?: Partial<WizardData>;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const SUBMISSION_CONFIG: Record<SubmissionType, {
  label: string;
  description: string;
  regions: RegulatoryRegion[];
  avgTimeline: string;
  modules: string[];
}> = {
  ind: {
    label: 'IND (Investigational New Drug)',
    description: 'First-in-human studies, clinical trial enablement',
    regions: ['us'],
    avgTimeline: '3-6 months',
    modules: ['1', '2.4', '2.5', '2.6', '2.7', '3', '4', '5'],
  },
  nda: {
    label: 'NDA (New Drug Application)',
    description: 'Marketing approval for new drug products',
    regions: ['us'],
    avgTimeline: '10-12 months review',
    modules: ['1', '2', '3', '4', '5'],
  },
  bla: {
    label: 'BLA (Biologics License Application)',
    description: 'Marketing approval for biological products',
    regions: ['us'],
    avgTimeline: '10-12 months review',
    modules: ['1', '2', '3', '4', '5'],
  },
  anda: {
    label: 'ANDA (Abbreviated NDA)',
    description: 'Generic drug applications',
    regions: ['us'],
    avgTimeline: '10-15 months',
    modules: ['1', '2', '3'],
  },
  '510k': {
    label: '510(k) Premarket Notification',
    description: 'Medical device clearance via substantial equivalence',
    regions: ['us'],
    avgTimeline: '3-6 months',
    modules: ['1'],
  },
  pma: {
    label: 'PMA (Premarket Approval)',
    description: 'Class III medical device approval',
    regions: ['us'],
    avgTimeline: '180 days review',
    modules: ['1'],
  },
  maa: {
    label: 'MAA (Marketing Authorization Application)',
    description: 'EU marketing authorization',
    regions: ['eu'],
    avgTimeline: '210 days review',
    modules: ['1', '2', '3', '4', '5'],
  },
  cta: {
    label: 'CTA (Clinical Trial Application)',
    description: 'EU clinical trial authorization',
    regions: ['eu'],
    avgTimeline: '60 days',
    modules: ['1', '2', '4', '5'],
  },
  'j-nda': {
    label: 'J-NDA (Japanese NDA)',
    description: 'Japanese marketing authorization',
    regions: ['jp'],
    avgTimeline: '12 months review',
    modules: ['1', '2', '3', '4', '5'],
  },
  variation: {
    label: 'Variation/Supplement',
    description: 'Post-approval changes and updates',
    regions: ['us', 'eu', 'jp', 'global'],
    avgTimeline: 'Varies',
    modules: ['1', '2'],
  },
  annual: {
    label: 'Annual Report',
    description: 'Periodic safety and manufacturing updates',
    regions: ['us'],
    avgTimeline: 'Annual',
    modules: ['1'],
  },
};

const THERAPEUTIC_AREAS: { value: TherapeuticArea; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'oncology', label: 'Oncology', icon: Shield },
  { value: 'cardiovascular', label: 'Cardiovascular', icon: Heart },
  { value: 'cns', label: 'CNS/Neurology', icon: Brain },
  { value: 'immunology', label: 'Immunology', icon: Shield },
  { value: 'infectious', label: 'Infectious Disease', icon: Syringe },
  { value: 'metabolic', label: 'Metabolic', icon: Beaker },
  { value: 'rare_disease', label: 'Rare Disease', icon: Sparkles },
  { value: 'other', label: 'Other', icon: Pill },
];

const REGION_CONFIG: Record<RegulatoryRegion, { label: string; flag: string }> = {
  us: { label: 'United States (FDA)', flag: '🇺🇸' },
  eu: { label: 'European Union (EMA)', flag: '🇪🇺' },
  jp: { label: 'Japan (PMDA)', flag: '🇯🇵' },
  cn: { label: 'China (NMPA)', flag: '🇨🇳' },
  row: { label: 'Rest of World', flag: '🌍' },
  global: { label: 'Global (Multiple)', flag: '🌐' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// STEP COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Step 1: Industry Mode
 */
const IndustryStep: React.FC<{
  value?: IndustryMode;
  onChange: (value: IndustryMode) => void;
}> = ({ value, onChange }) => {
  const options: { value: IndustryMode; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
    {
      value: 'biotech',
      label: 'Biotech',
      description: 'Small/mid-size company with focused pipeline',
      icon: Beaker,
    },
    {
      value: 'pharma',
      label: 'Pharma',
      description: 'Large organization with portfolio management',
      icon: Building2,
    },
    {
      value: 'cro',
      label: 'CRO',
      description: 'Contract organization serving multiple clients',
      icon: Users,
    },
    {
      value: 'medtech',
      label: 'MedTech',
      description: 'Medical device development and submissions',
      icon: Microscope,
    },
    {
      value: 'academic',
      label: 'Academic',
      description: 'Academic research and investigator-initiated studies',
      icon: GraduationCap,
    },
    {
      value: 'regulatory',
      label: 'Regulatory',
      description: 'Regulatory affairs and submission oversight',
      icon: ClipboardCheck,
    },
    {
      value: 'medical_writing',
      label: 'Medical Writing',
      description: 'Document authoring, review cycles, and publishing',
      icon: PenTool,
    },
  ];
  
  return (
    <div>
      <h3 className="text-lg font-semibold text-zinc-900 mb-2">Which industry mode fits your team?</h3>
      <p className="text-sm text-zinc-500 mb-6">This helps us configure the right workflow for your needs.</p>
      
      <div className="grid grid-cols-3 gap-4">
        {options.map(option => {
          const Icon = option.icon;
          const isSelected = value === option.value;
          
          return (
            <button
              key={option.value}
              onClick={() => onChange(option.value)}
              className={cn(
                'p-6 rounded-xl border-2 text-left transition-all',
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-zinc-200 hover:border-blue-300'
              )}
            >
              <Icon className={cn(
                'w-8 h-8 mb-3',
                isSelected ? 'text-blue-600' : 'text-zinc-400'
              )} />
              <h4 className={cn(
                'font-semibold mb-1',
                isSelected ? 'text-blue-900' : 'text-zinc-900'
              )}>
                {option.label}
              </h4>
              <p className="text-sm text-zinc-500">{option.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Step 2: Submission Type
 */
const SubmissionTypeStep: React.FC<{
  value?: SubmissionType;
  onChange: (value: SubmissionType) => void;
  industryMode?: IndustryMode;
}> = ({ value, onChange, industryMode }) => {
  // Filter submissions based on org type
  const relevantSubmissions = Object.entries(SUBMISSION_CONFIG).filter(([key]) => {
    if (industryMode === 'biotech') {
      return ['ind', 'nda', 'bla', 'cta', 'maa'].includes(key);
    }
    return true;
  });
  
  return (
    <div>
      <h3 className="text-lg font-semibold text-zinc-900 mb-2">What type of submission?</h3>
      <p className="text-sm text-zinc-500 mb-6">Select the regulatory submission type you're preparing.</p>
      
      <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
        {relevantSubmissions.map(([key, config]) => {
          const isSelected = value === key;
          
          return (
            <button
              key={key}
              onClick={() => onChange(key as SubmissionType)}
              className={cn(
                'p-4 rounded-lg border-2 text-left transition-all',
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-zinc-200 hover:border-blue-300'
              )}
            >
              <div className="flex items-start justify-between">
                <h4 className={cn(
                  'font-medium text-sm',
                  isSelected ? 'text-blue-900' : 'text-zinc-900'
                )}>
                  {config.label}
                </h4>
                {isSelected && (
                  <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                )}
              </div>
              <p className="text-xs text-zinc-500 mt-1">{config.description}</p>
              <div className="flex items-center gap-2 mt-2">
                {config.regions.map(r => (
                  <span key={r} className="text-sm">{REGION_CONFIG[r].flag}</span>
                ))}
                <span className="text-xs text-zinc-400 ml-auto">{config.avgTimeline}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Step 3: Therapeutic Area & Product
 */
const ProductStep: React.FC<{
  therapeuticArea?: TherapeuticArea;
  productName?: string;
  projectName?: string;
  onTherapeuticChange: (value: TherapeuticArea) => void;
  onProductChange: (value: string) => void;
  onProjectChange: (value: string) => void;
}> = ({
  therapeuticArea,
  productName,
  projectName,
  onTherapeuticChange,
  onProductChange,
  onProjectChange,
}) => {
  return (
    <div>
      <h3 className="text-lg font-semibold text-zinc-900 mb-2">Product Information</h3>
      <p className="text-sm text-zinc-500 mb-6">Tell us about the product for this submission.</p>
      
      {/* Product Name */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-700 mb-2">
          Product Name
        </label>
        <input
          type="text"
          value={productName || ''}
          onChange={(e) => onProductChange(e.target.value)}
          placeholder="e.g., ABC-123, Investigational Drug X"
          className="w-full px-4 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
        />
      </div>
      
      {/* Project Name */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-700 mb-2">
          Project Name
        </label>
        <input
          type="text"
          value={projectName || ''}
          onChange={(e) => onProjectChange(e.target.value)}
          placeholder="e.g., ABC-123 IND Filing, Phase 2 Study"
          className="w-full px-4 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
        />
      </div>
      
      {/* Therapeutic Area */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-2">
          Therapeutic Area
        </label>
        <div className="grid grid-cols-4 gap-2">
          {THERAPEUTIC_AREAS.map(ta => {
            const Icon = ta.icon;
            const isSelected = therapeuticArea === ta.value;
            
            return (
              <button
                key={ta.value}
                onClick={() => onTherapeuticChange(ta.value)}
                className={cn(
                  'p-3 rounded-lg border text-center transition-all',
                  isSelected
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-zinc-200 hover:border-blue-300 text-zinc-600'
                )}
              >
                <Icon className={cn('w-5 h-5 mx-auto mb-1', isSelected ? 'text-blue-600' : 'text-zinc-400')} />
                <span className="text-xs font-medium">{ta.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * Step 4: Region & Timeline
 */
const TimelineStep: React.FC<{
  regions?: RegulatoryRegion[];
  targetDate?: string;
  submissionType?: SubmissionType;
  onRegionsChange: (regions: RegulatoryRegion[]) => void;
  onTargetDateChange: (date: string) => void;
}> = ({
  regions = [],
  targetDate,
  submissionType,
  onRegionsChange,
  onTargetDateChange,
}) => {
  const toggleRegion = (region: RegulatoryRegion) => {
    if (regions.includes(region)) {
      onRegionsChange(regions.filter(r => r !== region));
    } else {
      onRegionsChange([...regions, region]);
    }
  };
  
  const suggestedTimeline = submissionType 
    ? SUBMISSION_CONFIG[submissionType]?.avgTimeline 
    : null;
  
  return (
    <div>
      <h3 className="text-lg font-semibold text-zinc-900 mb-2">Regions & Timeline</h3>
      <p className="text-sm text-zinc-500 mb-6">Select target regions and your submission date.</p>
      
      {/* Regions */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-700 mb-2">
          Target Regions
        </label>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(REGION_CONFIG).map(([key, config]) => {
            const isSelected = regions.includes(key as RegulatoryRegion);
            
            return (
              <button
                key={key}
                onClick={() => toggleRegion(key as RegulatoryRegion)}
                className={cn(
                  'p-3 rounded-lg border text-left transition-all',
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-zinc-200 hover:border-blue-300'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{config.flag}</span>
                  <span className={cn(
                    'text-sm font-medium',
                    isSelected ? 'text-blue-700' : 'text-zinc-700'
                  )}>
                    {config.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Target Date */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-700 mb-2">
          Target Submission Date
        </label>
        <input
          type="date"
          value={targetDate || ''}
          onChange={(e) => onTargetDateChange(e.target.value)}
          className="w-full px-4 py-2 border border-zinc-200 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
        />
        {suggestedTimeline && (
          <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            Typical timeline: {suggestedTimeline}
          </p>
        )}
      </div>
    </div>
  );
};

/**
 * Step 5: Summary
 */
const SummaryStep: React.FC<{
  data: WizardData;
}> = ({ data }) => {
  const submissionConfig = data.submissionType ? SUBMISSION_CONFIG[data.submissionType] : null;
  
  return (
    <div>
      <h3 className="text-lg font-semibold text-zinc-900 mb-2">Review & Create</h3>
      <p className="text-sm text-zinc-500 mb-6">Review your project configuration before creating.</p>
      
      <div className="bg-zinc-50 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
          <span className="text-sm text-zinc-500">Project Name</span>
          <span className="text-sm font-semibold text-zinc-900">{data.projectName || '-'}</span>
        </div>
        
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
          <span className="text-sm text-zinc-500">Product</span>
          <span className="text-sm font-medium text-zinc-900">{data.productName || '-'}</span>
        </div>
        
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
          <span className="text-sm text-zinc-500">Submission Type</span>
          <span className="text-sm font-medium text-blue-600">{submissionConfig?.label || '-'}</span>
        </div>
        
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
          <span className="text-sm text-zinc-500">Regions</span>
          <div className="flex items-center gap-1">
            {data.regions?.map(r => (
              <span key={r} className="text-lg">{REGION_CONFIG[r].flag}</span>
            ))}
          </div>
        </div>
        
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
          <span className="text-sm text-zinc-500">Target Date</span>
          <span className="text-sm font-medium text-zinc-900">
            {data.targetDate ? new Date(data.targetDate).toLocaleDateString() : '-'}
          </span>
        </div>
        
        {submissionConfig && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">CTD Modules</span>
            <div className="flex items-center gap-1">
              {submissionConfig.modules.map(m => (
                <span key={m} className="px-2 py-0.5 text-xs font-medium bg-zinc-200 rounded">
                  M{m}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* What will be created */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg">
        <h4 className="text-sm font-semibold text-blue-800 mb-2">What will be created:</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Project workspace with eCTD structure</li>
          <li>• Document templates for selected modules</li>
          <li>• Timeline with milestones</li>
          <li>• Regulatory checklist</li>
        </ul>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN WIZARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const QuickStartWizard: React.FC<QuickStartWizardProps> = ({
  onComplete,
  onCancel,
  initialData = {},
  className,
}) => {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>(initialData);
  
  const totalSteps = 5;
  
  const updateData = useCallback((updates: Partial<WizardData>) => {
    setData(prev => ({ ...prev, ...updates }));
  }, []);
  
  const canProceed = useCallback(() => {
    switch (step) {
      case 1: return !!data.industryMode;
      case 2: return !!data.submissionType;
      case 3: return !!data.productName && !!data.projectName;
      case 4: return data.regions && data.regions.length > 0;
      case 5: return true;
      default: return false;
    }
  }, [step, data]);
  
  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      onComplete(data);
    }
  };
  
  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };
  
  return (
    <div className={cn('flex flex-col h-full bg-white', className)}>
      {/* Progress */}
      <div className="flex-shrink-0 px-8 pt-8">
        <div className="flex items-center gap-2 mb-6">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <React.Fragment key={i}>
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                i + 1 < step && 'bg-blue-600 text-white',
                i + 1 === step && 'bg-blue-600 text-white ring-4 ring-blue-200',
                i + 1 > step && 'bg-zinc-200 text-zinc-500'
              )}>
                {i + 1 < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < totalSteps - 1 && (
                <div className={cn(
                  'flex-1 h-0.5 transition-colors',
                  i + 1 < step ? 'bg-blue-600' : 'bg-zinc-200'
                )} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 px-8 overflow-y-auto">
        {step === 1 && (
          <IndustryStep
            value={data.industryMode}
            onChange={(v) => updateData({ industryMode: v })}
          />
        )}
        {step === 2 && (
          <SubmissionTypeStep
            value={data.submissionType}
            onChange={(v) => updateData({ submissionType: v })}
            industryMode={data.industryMode}
          />
        )}
        {step === 3 && (
          <ProductStep
            therapeuticArea={data.therapeuticArea}
            productName={data.productName}
            projectName={data.projectName}
            onTherapeuticChange={(v) => updateData({ therapeuticArea: v })}
            onProductChange={(v) => updateData({ productName: v })}
            onProjectChange={(v) => updateData({ projectName: v })}
          />
        )}
        {step === 4 && (
          <TimelineStep
            regions={data.regions}
            targetDate={data.targetDate}
            submissionType={data.submissionType}
            onRegionsChange={(v) => updateData({ regions: v })}
            onTargetDateChange={(v) => updateData({ targetDate: v })}
          />
        )}
        {step === 5 && (
          <SummaryStep data={data} />
        )}
      </div>
      
      {/* Footer */}
      <div className="flex-shrink-0 px-8 py-6 border-t border-zinc-200 flex items-center justify-between">
        <button
          onClick={step === 1 ? onCancel : handleBack}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors duration-150"
        >
          <ChevronLeft className="w-4 h-4" />
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        
        <button
          onClick={handleNext}
          disabled={!canProceed()}
          className={cn(
            'flex items-center gap-2 px-6 py-2 text-sm font-medium rounded-lg transition-colors',
            canProceed()
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
          )}
        >
          {step === totalSteps ? 'Create Project' : 'Continue'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default QuickStartWizard;
