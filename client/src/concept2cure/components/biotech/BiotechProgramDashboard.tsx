/**
 * @fileoverview Biotech Program Dashboard
 * @module concept2cure/components/biotech/BiotechProgramDashboard
 * @version 1.0.0
 *
 * @description
 * Dashboard designed for how BIOTECH companies actually operate:
 * 
 * BIOTECH REALITY:
 * - Usually 1-3 lead assets, maybe a pipeline of early candidates
 * - Small teams (10-50 people total), everyone wears multiple hats
 * - Funding milestones drive everything (Series A → Series B → IPO)
 * - Heavy outsourcing to CROs, CMOs, consultants
 * - CEO/CSO need quick visibility into "where are we?"
 * - Racing against burn rate and runway
 *
 * KEY USE CASES:
 * 1. "Where is our lead asset in the regulatory pathway?"
 * 2. "When is our next FDA interaction?"
 * 3. "What's blocking our IND filing?"
 * 4. "Show me the critical path to Phase 1"
 * 5. "What are our outsourced vendors delivering this month?"
 *
 * This is NOT a generic project dashboard - it's optimized for
 * the biotech mindset: milestone-driven, lean, outsourced.
 */

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Beaker,
  Target,
  Calendar,
  Users,
  DollarSign,
  Clock,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Circle,
  ArrowRight,
  FileText,
  Building2,
  TrendingUp,
  Flag,
  Microscope,
  Pill,
  Syringe,
  FlaskConical,
  Milestone,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES - Reflecting Biotech Reality
// ═══════════════════════════════════════════════════════════════════════════════

export type DevelopmentStage = 
  | 'discovery'
  | 'lead_optimization'
  | 'preclinical'
  | 'ind_enabling'
  | 'pre_ind_meeting'
  | 'ind_prep'
  | 'ind_filed'
  | 'ind_active'
  | 'phase_1'
  | 'phase_1b'
  | 'phase_2'
  | 'phase_2b'
  | 'eop2_meeting'
  | 'phase_3'
  | 'pre_nda_meeting'
  | 'nda_prep'
  | 'nda_filed'
  | 'fda_review'
  | 'advisory_committee'
  | 'approved';

export interface FundingMilestone {
  id: string;
  name: string;
  type: 'scientific' | 'regulatory' | 'clinical' | 'commercial';
  targetDate: string;
  linkedFunding?: string;  // "Series B", "IPO", etc.
  status: 'upcoming' | 'on_track' | 'at_risk' | 'achieved';
  description: string;
}

export interface VendorDeliverable {
  id: string;
  vendorName: string;
  vendorType: 'cro' | 'cmo' | 'regulatory_consultant' | 'medical_writing' | 'bioanalytical' | 'cmc';
  deliverableName: string;
  dueDate: string;
  status: 'on_track' | 'delayed' | 'delivered' | 'at_risk';
  criticalPath: boolean;  // Is this on the critical path to next milestone?
  percentComplete?: number;
}

export interface FDAInteraction {
  id: string;
  type: 'pre_ind' | 'type_a' | 'type_b' | 'type_c' | 'eop2' | 'pre_nda' | 'advisory_committee' | 'inspection';
  scheduledDate?: string;
  requestedDate?: string;
  status: 'planning' | 'submitted' | 'scheduled' | 'completed';
  outcome?: 'favorable' | 'neutral' | 'unfavorable';
  keyQuestions?: string[];
  notes?: string;
}

export interface BiotechProgram {
  id: string;
  programName: string;       // "ABC-123 Program"
  therapeuticArea: string;
  indication: string;
  modality: 'small_molecule' | 'biologic' | 'gene_therapy' | 'cell_therapy' | 'antibody' | 'adc';
  
  // Development Status
  currentStage: DevelopmentStage;
  nextMilestone: FundingMilestone;
  
  // Regulatory
  indNumber?: string;
  ndaNumber?: string;
  fdaInteractions: FDAInteraction[];
  
  // Team & Vendors
  programLead: string;
  vendorDeliverables: VendorDeliverable[];
  
  // Timeline
  projectedNDAFiling?: string;
  projectedApproval?: string;
  
  // Financials (tied to milestones)
  fundingMilestones: FundingMilestone[];
}

interface BiotechProgramDashboardProps {
  programs: BiotechProgram[];
  companyRunway?: number;  // Months of runway remaining
  onProgramClick?: (program: BiotechProgram) => void;
  onMilestoneClick?: (milestone: FundingMilestone) => void;
  onVendorClick?: (deliverable: VendorDeliverable) => void;
  className?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const STAGE_CONFIG: Record<DevelopmentStage, {
  label: string;
  shortLabel: string;
  color: string;
  phase: 'preclinical' | 'clinical' | 'regulatory';
}> = {
  discovery: { label: 'Discovery', shortLabel: 'Disc', color: 'bg-stone-400', phase: 'preclinical' },
  lead_optimization: { label: 'Lead Optimization', shortLabel: 'Lead Opt', color: 'bg-stone-500', phase: 'preclinical' },
  preclinical: { label: 'Preclinical', shortLabel: 'Preclin', color: 'bg-purple-500', phase: 'preclinical' },
  ind_enabling: { label: 'IND-Enabling Studies', shortLabel: 'IND-En', color: 'bg-violet-500', phase: 'preclinical' },
  pre_ind_meeting: { label: 'Pre-IND Meeting', shortLabel: 'Pre-IND', color: 'bg-blue-400', phase: 'regulatory' },
  ind_prep: { label: 'IND Preparation', shortLabel: 'IND Prep', color: 'bg-blue-500', phase: 'regulatory' },
  ind_filed: { label: 'IND Filed', shortLabel: 'IND Filed', color: 'bg-blue-600', phase: 'regulatory' },
  ind_active: { label: 'IND Active', shortLabel: 'IND Active', color: 'bg-cyan-500', phase: 'clinical' },
  phase_1: { label: 'Phase 1', shortLabel: 'Ph1', color: 'bg-emerald-500', phase: 'clinical' },
  phase_1b: { label: 'Phase 1b', shortLabel: 'Ph1b', color: 'bg-emerald-600', phase: 'clinical' },
  phase_2: { label: 'Phase 2', shortLabel: 'Ph2', color: 'bg-amber-500', phase: 'clinical' },
  phase_2b: { label: 'Phase 2b', shortLabel: 'Ph2b', color: 'bg-amber-600', phase: 'clinical' },
  eop2_meeting: { label: 'EOP2 Meeting', shortLabel: 'EOP2', color: 'bg-orange-500', phase: 'regulatory' },
  phase_3: { label: 'Phase 3', shortLabel: 'Ph3', color: 'bg-red-500', phase: 'clinical' },
  pre_nda_meeting: { label: 'Pre-NDA Meeting', shortLabel: 'Pre-NDA', color: 'bg-pink-500', phase: 'regulatory' },
  nda_prep: { label: 'NDA Preparation', shortLabel: 'NDA Prep', color: 'bg-rose-500', phase: 'regulatory' },
  nda_filed: { label: 'NDA Filed', shortLabel: 'NDA Filed', color: 'bg-rose-600', phase: 'regulatory' },
  fda_review: { label: 'FDA Review', shortLabel: 'Review', color: 'bg-red-600', phase: 'regulatory' },
  advisory_committee: { label: 'Advisory Committee', shortLabel: 'AdCom', color: 'bg-red-700', phase: 'regulatory' },
  approved: { label: 'Approved', shortLabel: 'Approved', color: 'bg-green-600', phase: 'regulatory' },
};

const VENDOR_TYPE_CONFIG: Record<VendorDeliverable['vendorType'], {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  cro: { label: 'CRO', icon: Users },
  cmo: { label: 'CMO', icon: Building2 },
  regulatory_consultant: { label: 'Reg Consultant', icon: FileText },
  medical_writing: { label: 'Med Writing', icon: FileText },
  bioanalytical: { label: 'Bioanalytical', icon: Microscope },
  cmc: { label: 'CMC', icon: FlaskConical },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const getDaysUntil = (date: string): number => {
  return Math.ceil((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
};

const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

// ═══════════════════════════════════════════════════════════════════════════════
// DEVELOPMENT PIPELINE VISUALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

const DevelopmentPipeline: React.FC<{
  currentStage: DevelopmentStage;
  className?: string;
}> = ({ currentStage, className }) => {
  const stages: DevelopmentStage[] = [
    'preclinical', 'ind_enabling', 'ind_filed', 'phase_1', 'phase_2', 'phase_3', 'nda_filed', 'approved'
  ];
  
  const currentIndex = stages.findIndex(s => {
    // Map current stage to nearest pipeline stage
    const mapping: Partial<Record<DevelopmentStage, DevelopmentStage>> = {
      discovery: 'preclinical',
      lead_optimization: 'preclinical',
      pre_ind_meeting: 'ind_enabling',
      ind_prep: 'ind_enabling',
      ind_active: 'ind_filed',
      phase_1b: 'phase_1',
      phase_2b: 'phase_2',
      eop2_meeting: 'phase_2',
      pre_nda_meeting: 'phase_3',
      nda_prep: 'phase_3',
      fda_review: 'nda_filed',
      advisory_committee: 'nda_filed',
    };
    return s === currentStage || mapping[currentStage] === s;
  });
  
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {stages.map((stage, i) => {
        const config = STAGE_CONFIG[stage];
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        
        return (
          <React.Fragment key={stage}>
            <div className="flex flex-col items-center">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-150',
                isCompleted && 'bg-green-500 text-white',
                isCurrent && cn(config.color, 'text-white ring-4 ring-offset-2'),
                !isCompleted && !isCurrent && 'bg-stone-200 text-stone-400'
              )}>
                {isCompleted ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              <span className={cn(
                'text-xs mt-1 font-medium',
                isCurrent ? 'text-stone-900' : 'text-stone-500'
              )}>
                {config.shortLabel}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div className={cn(
                'flex-1 h-0.5 min-w-[20px]',
                isCompleted ? 'bg-green-500' : 'bg-stone-200'
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CRITICAL PATH VENDOR TRACKER
// ═══════════════════════════════════════════════════════════════════════════════

const CriticalPathTracker: React.FC<{
  deliverables: VendorDeliverable[];
  onVendorClick?: (deliverable: VendorDeliverable) => void;
}> = ({ deliverables, onVendorClick }) => {
  const criticalPath = deliverables.filter(d => d.criticalPath);
  const atRisk = criticalPath.filter(d => d.status === 'at_risk' || d.status === 'delayed');
  
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-stone-900">Critical Path Deliverables</h3>
        {atRisk.length > 0 && (
          <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-full">
            <AlertTriangle className="w-3 h-3" />
            {atRisk.length} at risk
          </span>
        )}
      </div>
      
      <div className="space-y-2">
        {criticalPath.slice(0, 5).map(d => {
          const vendorConfig = VENDOR_TYPE_CONFIG[d.vendorType];
          const VendorIcon = vendorConfig.icon;
          const daysUntil = getDaysUntil(d.dueDate);
          const isUrgent = daysUntil <= 14;
          
          return (
            <button
              key={d.id}
              onClick={() => onVendorClick?.(d)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left',
                d.status === 'at_risk' || d.status === 'delayed'
                  ? 'border-red-200 bg-red-50 hover:bg-red-100'
                  : 'border-stone-200 hover:bg-stone-50'
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center',
                d.status === 'delivered' ? 'bg-green-100' : 'bg-stone-100'
              )}>
                <VendorIcon className={cn(
                  'w-4 h-4',
                  d.status === 'delivered' ? 'text-green-600' : 'text-stone-500'
                )} />
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{d.deliverableName}</p>
                <p className="text-xs text-stone-500">{d.vendorName} • {vendorConfig.label}</p>
              </div>
              
              {d.percentComplete !== undefined && d.status !== 'delivered' && (
                <div className="w-16">
                  <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${d.percentComplete}%` }}
                    />
                  </div>
                  <p className="text-xs text-stone-500 text-center mt-0.5">{d.percentComplete}%</p>
                </div>
              )}
              
              <div className={cn(
                'text-xs font-medium',
                d.status === 'delivered' && 'text-green-600',
                d.status === 'at_risk' && 'text-red-600',
                d.status === 'delayed' && 'text-red-700',
                d.status === 'on_track' && isUrgent && 'text-amber-600',
                d.status === 'on_track' && !isUrgent && 'text-stone-600'
              )}>
                {d.status === 'delivered' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  daysUntil <= 0 ? 'Overdue' : `${daysUntil}d`
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// FDA INTERACTION TIMELINE
// ═══════════════════════════════════════════════════════════════════════════════

const FDAInteractionTimeline: React.FC<{
  interactions: FDAInteraction[];
}> = ({ interactions }) => {
  const upcoming = interactions.filter(i => i.status !== 'completed');
  const completed = interactions.filter(i => i.status === 'completed');
  
  const typeLabels: Record<FDAInteraction['type'], string> = {
    pre_ind: 'Pre-IND Meeting',
    type_a: 'Type A Meeting',
    type_b: 'Type B Meeting',
    type_c: 'Type C Meeting',
    eop2: 'End-of-Phase 2 Meeting',
    pre_nda: 'Pre-NDA Meeting',
    advisory_committee: 'Advisory Committee',
    inspection: 'FDA Inspection',
  };
  
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4">
      <h3 className="text-sm font-semibold text-stone-900 mb-4">FDA Interactions</h3>
      
      <div className="space-y-3">
        {upcoming.map(interaction => (
          <div
            key={interaction.id}
            className={cn(
              'p-3 rounded-lg border-l-4',
              interaction.status === 'scheduled' && 'border-l-blue-500 bg-blue-50',
              interaction.status === 'submitted' && 'border-l-amber-500 bg-amber-50',
              interaction.status === 'planning' && 'border-l-stone-400 bg-stone-50'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-900">{typeLabels[interaction.type]}</span>
              <span className={cn(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                interaction.status === 'scheduled' && 'bg-blue-100 text-blue-700',
                interaction.status === 'submitted' && 'bg-amber-100 text-amber-700',
                interaction.status === 'planning' && 'bg-stone-100 text-stone-600'
              )}>
                {interaction.status}
              </span>
            </div>
            {interaction.scheduledDate && (
              <p className="text-xs text-stone-600 mt-1">
                <Calendar className="w-3 h-3 inline mr-1" />
                {formatDate(interaction.scheduledDate)}
              </p>
            )}
          </div>
        ))}
        
        {completed.length > 0 && (
          <div className="pt-2 border-t border-stone-200">
            <p className="text-xs text-stone-500 mb-2">Completed ({completed.length})</p>
            {completed.slice(0, 2).map(interaction => (
              <div key={interaction.id} className="flex items-center gap-2 text-xs text-stone-500 py-1">
                <CheckCircle className="w-3 h-3 text-green-500" />
                <span>{typeLabels[interaction.type]}</span>
                {interaction.outcome && (
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-xs',
                    interaction.outcome === 'favorable' && 'bg-green-100 text-green-700',
                    interaction.outcome === 'neutral' && 'bg-stone-100 text-stone-600',
                    interaction.outcome === 'unfavorable' && 'bg-red-100 text-red-700'
                  )}>
                    {interaction.outcome}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// FUNDING MILESTONE TRACKER
// ═══════════════════════════════════════════════════════════════════════════════

const FundingMilestoneCard: React.FC<{
  milestone: FundingMilestone;
  onClick?: () => void;
}> = ({ milestone, onClick }) => {
  const daysUntil = getDaysUntil(milestone.targetDate);
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full p-4 rounded-xl border text-left transition-all duration-150',
        milestone.status === 'achieved' && 'border-green-300 bg-green-50',
        milestone.status === 'on_track' && 'border-blue-300 bg-blue-50',
        milestone.status === 'at_risk' && 'border-red-300 bg-red-50',
        milestone.status === 'upcoming' && 'border-stone-200 bg-white hover:border-blue-300'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Milestone className={cn(
            'w-5 h-5',
            milestone.status === 'achieved' && 'text-green-600',
            milestone.status === 'on_track' && 'text-blue-600',
            milestone.status === 'at_risk' && 'text-red-600',
            milestone.status === 'upcoming' && 'text-stone-400'
          )} />
          <span className={cn(
            'text-xs font-medium px-2 py-0.5 rounded-full',
            milestone.type === 'regulatory' && 'bg-blue-100 text-blue-700',
            milestone.type === 'clinical' && 'bg-emerald-100 text-emerald-700',
            milestone.type === 'scientific' && 'bg-purple-100 text-purple-700',
            milestone.type === 'commercial' && 'bg-amber-100 text-amber-700'
          )}>
            {milestone.type}
          </span>
        </div>
        {milestone.linkedFunding && (
          <span className="text-xs font-semibold text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">
            {milestone.linkedFunding}
          </span>
        )}
      </div>
      
      <h4 className="text-sm font-semibold text-stone-900 mb-1">{milestone.name}</h4>
      <p className="text-xs text-stone-500 mb-3">{milestone.description}</p>
      
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-600">
          <Calendar className="w-3 h-3 inline mr-1" />
          {formatDate(milestone.targetDate)}
        </span>
        {milestone.status !== 'achieved' && (
          <span className={cn(
            'text-xs font-medium',
            daysUntil <= 30 && milestone.status !== 'achieved' ? 'text-amber-600' : 'text-stone-500'
          )}>
            {daysUntil}d remaining
          </span>
        )}
        {milestone.status === 'achieved' && (
          <CheckCircle className="w-4 h-4 text-green-600" />
        )}
      </div>
    </button>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const BiotechProgramDashboard: React.FC<BiotechProgramDashboardProps> = ({
  programs,
  companyRunway,
  onProgramClick,
  onMilestoneClick,
  onVendorClick,
  className,
}) => {
  const [selectedProgram, setSelectedProgram] = useState<BiotechProgram | null>(
    programs.length > 0 ? programs[0] : null
  );
  
  // Calculate company-wide metrics
  const metrics = useMemo(() => {
    const allDeliverables = programs.flatMap(p => p.vendorDeliverables);
    const criticalAtRisk = allDeliverables.filter(d => d.criticalPath && (d.status === 'at_risk' || d.status === 'delayed'));
    const upcomingFDAMeetings = programs.flatMap(p => p.fdaInteractions).filter(i => i.status !== 'completed');
    
    return {
      criticalAtRisk: criticalAtRisk.length,
      upcomingFDAMeetings: upcomingFDAMeetings.length,
      activePrograms: programs.filter(p => STAGE_CONFIG[p.currentStage].phase !== 'preclinical').length,
    };
  }, [programs]);
  
  return (
    <div className={cn('flex flex-col h-full bg-stone-50', className)}>
      {/* Header with company runway */}
      <div className="flex-shrink-0 bg-white border-b border-stone-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Program Dashboard</h1>
            <p className="text-sm text-stone-500">Track your pipeline from discovery to approval</p>
          </div>
          
          {/* Key Metrics */}
          <div className="flex items-center gap-6">
            {companyRunway && (
              <div className={cn(
                'px-4 py-2 rounded-lg',
                companyRunway <= 12 ? 'bg-red-100' : companyRunway <= 18 ? 'bg-amber-100' : 'bg-green-100'
              )}>
                <p className="text-xs text-stone-600">Runway</p>
                <p className={cn(
                  'text-lg font-semibold',
                  companyRunway <= 12 ? 'text-red-700' : companyRunway <= 18 ? 'text-amber-700' : 'text-green-700'
                )}>
                  {companyRunway} months
                </p>
              </div>
            )}
            
            <div className="px-4 py-2 bg-stone-100 rounded-lg">
              <p className="text-xs text-stone-600">Active Programs</p>
              <p className="text-lg font-semibold text-stone-900">{metrics.activePrograms}</p>
            </div>
            
            {metrics.criticalAtRisk > 0 && (
              <div className="px-4 py-2 bg-red-100 rounded-lg">
                <p className="text-xs text-red-600">Critical Path Risk</p>
                <p className="text-lg font-semibold text-red-700">{metrics.criticalAtRisk}</p>
              </div>
            )}
            
            <div className="px-4 py-2 bg-blue-100 rounded-lg">
              <p className="text-xs text-blue-600">Upcoming FDA Meetings</p>
              <p className="text-lg font-semibold text-blue-700">{metrics.upcomingFDAMeetings}</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Program Selector (if multiple programs) */}
      {programs.length > 1 && (
        <div className="flex-shrink-0 bg-white border-b border-stone-200 px-4 py-2">
          <div className="flex gap-2">
            {programs.map(program => {
              const stageConfig = STAGE_CONFIG[program.currentStage];
              const isSelected = selectedProgram?.id === program.id;
              
              return (
                <button
                  key={program.id}
                  onClick={() => setSelectedProgram(program)}
                  className={cn(
                    'px-4 py-2 rounded-lg transition-colors duration-150',
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Pill className="w-4 h-4" />
                    <span className="text-sm font-medium">{program.programName}</span>
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded',
                      isSelected ? 'bg-blue-500 text-blue-100' : 'bg-stone-200 text-stone-600'
                    )}>
                      {stageConfig.shortLabel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Main Content */}
      {selectedProgram && (
        <div className="flex-1 p-6 overflow-auto">
          {/* Program Header */}
          <div className="bg-white rounded-xl border border-stone-200 p-6 mb-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-semibold text-stone-900 mb-1">{selectedProgram.programName}</h2>
                <p className="text-sm text-stone-500">
                  {selectedProgram.therapeuticArea} • {selectedProgram.indication} • {selectedProgram.modality.replace('_', ' ')}
                </p>
                {selectedProgram.indNumber && (
                  <p className="text-xs text-blue-600 mt-1">IND #{selectedProgram.indNumber}</p>
                )}
              </div>
              
              <div className="text-right">
                <p className="text-xs text-stone-500">Current Stage</p>
                <span className={cn(
                  'inline-block px-3 py-1 text-sm font-semibold text-white rounded-full',
                  STAGE_CONFIG[selectedProgram.currentStage].color
                )}>
                  {STAGE_CONFIG[selectedProgram.currentStage].label}
                </span>
              </div>
            </div>
            
            {/* Development Pipeline */}
            <DevelopmentPipeline currentStage={selectedProgram.currentStage} />
            
            {/* Projected Timeline */}
            {(selectedProgram.projectedNDAFiling || selectedProgram.projectedApproval) && (
              <div className="mt-6 pt-6 border-t border-stone-200 flex items-center gap-8">
                {selectedProgram.projectedNDAFiling && (
                  <div>
                    <p className="text-xs text-stone-500">Projected NDA Filing</p>
                    <p className="text-sm font-semibold text-stone-900">
                      {formatDate(selectedProgram.projectedNDAFiling)}
                    </p>
                  </div>
                )}
                {selectedProgram.projectedApproval && (
                  <div>
                    <p className="text-xs text-stone-500">Projected Approval</p>
                    <p className="text-sm font-semibold text-stone-900">
                      {formatDate(selectedProgram.projectedApproval)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Three Column Layout */}
          <div className="grid grid-cols-3 gap-6">
            {/* Column 1: Critical Path & Vendors */}
            <CriticalPathTracker
              deliverables={selectedProgram.vendorDeliverables}
              onVendorClick={onVendorClick}
            />
            
            {/* Column 2: FDA Interactions */}
            <FDAInteractionTimeline interactions={selectedProgram.fdaInteractions} />
            
            {/* Column 3: Funding Milestones */}
            <div className="bg-white rounded-xl border border-stone-200 p-4">
              <h3 className="text-sm font-semibold text-stone-900 mb-4">Key Milestones</h3>
              <div className="space-y-3">
                {selectedProgram.fundingMilestones.slice(0, 3).map(milestone => (
                  <FundingMilestoneCard
                    key={milestone.id}
                    milestone={milestone}
                    onClick={() => onMilestoneClick?.(milestone)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BiotechProgramDashboard;
