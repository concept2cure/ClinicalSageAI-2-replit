/**
 * @fileoverview Program Creation Wizard — Multi-step guided onboarding
 * @module concept2cure/pages/MissionControl/ProgramWizard
 * @version 1.0.0
 *
 * @description
 * Four-step wizard for creating regulatory programs (IND, NDA, 510(k), etc.)
 * within the Concept2Cure Mission Control platform.
 *
 * Steps:
 *  1. Program Basics — name, description, customer track, dev stage
 *  2. Regulatory Destination — destination type, authority, region, target date
 *  3. Team & Governance — lead, reviewers, approvers, compliance, scaffold toggle
 *  4. Review & Launch — summary, create program + destination + optional scaffold
 *
 * @compliance
 * - FDA 21 CFR Part 11: All program creation is audit-logged server-side
 */

import React, { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  ArrowRight,
  Beaker,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Cpu,
  FileText,
  FlaskConical,
  Layers,
  Pill,
  Rocket,
  Shield,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Target,
  TestTube,
  Users,
  X,
} from 'lucide-react';
import {
  useCreateProgram,
  useScaffoldProgram,
  useCreateDestination,
} from '../../hooks/useMissionControl';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ProgramWizardProps {
  onComplete: (programId: number) => void;
  onCancel: () => void;
}

type CustomerTrack = 'biotech' | 'pharma' | 'cro' | 'device';
type DevelopmentStage = 'discovery' | 'preclinical' | 'phase-1' | 'phase-2' | 'phase-3' | 'nda-bla' | 'post-market';
type DestinationType = 'IND' | 'NDA' | 'BLA' | '510K' | 'PMA' | 'De-Novo' | 'MAA' | 'CE-Mark';
type Authority = 'FDA' | 'EMA' | 'PMDA' | 'Health Canada' | 'TGA';
type Region = 'US' | 'EU' | 'Japan' | 'Canada' | 'Australia';
type ComplianceLevel = 'standard' | 'elevated' | 'cfr-part-11';

interface WizardState {
  // Step 1
  name: string;
  description: string;
  customerTrack: CustomerTrack | null;
  developmentStage: DevelopmentStage | null;
  // Step 2
  destinationType: DestinationType | null;
  authority: Authority | null;
  region: Region | null;
  targetDate: string;
  // Step 3
  programLead: string;
  reviewers: string[];
  approvers: string[];
  complianceLevel: ComplianceLevel;
  autoScaffold: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const STEPS = [
  { number: 1, label: 'Program Basics' },
  { number: 2, label: 'Regulatory Destination' },
  { number: 3, label: 'Team & Governance' },
  { number: 4, label: 'Review & Launch' },
] as const;

const CUSTOMER_TRACKS: { value: CustomerTrack; label: string; icon: React.ElementType; desc: string }[] = [
  { value: 'biotech', label: 'Biotech', icon: FlaskConical, desc: 'Early-stage therapeutics & biologics' },
  { value: 'pharma', label: 'Pharma', icon: Pill, desc: 'Large-molecule & small-molecule drugs' },
  { value: 'cro', label: 'CRO', icon: Building2, desc: 'Contract research organization' },
  { value: 'device', label: 'Medical Device', icon: Cpu, desc: 'Class I/II/III medical devices' },
];

const DEV_STAGES: { value: DevelopmentStage; label: string }[] = [
  { value: 'discovery', label: 'Discovery' },
  { value: 'preclinical', label: 'Preclinical' },
  { value: 'phase-1', label: 'Phase 1' },
  { value: 'phase-2', label: 'Phase 2' },
  { value: 'phase-3', label: 'Phase 3' },
  { value: 'nda-bla', label: 'NDA / BLA' },
  { value: 'post-market', label: 'Post-Market' },
];

const DESTINATION_TYPES: { value: DestinationType; label: string; desc: string }[] = [
  { value: 'IND', label: 'IND', desc: 'Investigational New Drug' },
  { value: 'NDA', label: 'NDA', desc: 'New Drug Application' },
  { value: 'BLA', label: 'BLA', desc: 'Biologics License Application' },
  { value: '510K', label: '510(k)', desc: 'Premarket Notification' },
  { value: 'PMA', label: 'PMA', desc: 'Premarket Approval' },
  { value: 'De-Novo', label: 'De Novo', desc: 'De Novo Classification' },
  { value: 'MAA', label: 'MAA', desc: 'Marketing Auth. Application' },
  { value: 'CE-Mark', label: 'CE Mark', desc: 'European Conformity' },
];

const AUTHORITIES: { value: Authority; label: string; region: Region }[] = [
  { value: 'FDA', label: 'FDA (United States)', region: 'US' },
  { value: 'EMA', label: 'EMA (European Union)', region: 'EU' },
  { value: 'PMDA', label: 'PMDA (Japan)', region: 'Japan' },
  { value: 'Health Canada', label: 'Health Canada', region: 'Canada' },
  { value: 'TGA', label: 'TGA (Australia)', region: 'Australia' },
];

const COMPLIANCE_LEVELS: { value: ComplianceLevel; label: string; desc: string }[] = [
  { value: 'standard', label: 'Standard', desc: 'Basic audit trail and access control' },
  { value: 'elevated', label: 'Elevated', desc: 'Enhanced review workflows and e-signatures' },
  { value: 'cfr-part-11', label: '21 CFR Part 11', desc: 'Full electronic records compliance' },
];

const INITIAL_STATE: WizardState = {
  name: '',
  description: '',
  customerTrack: null,
  developmentStage: null,
  destinationType: null,
  authority: null,
  region: null,
  targetDate: '',
  programLead: '',
  reviewers: [],
  approvers: [],
  complianceLevel: 'standard',
  autoScaffold: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function parseTagInput(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatDestinationType(dt: DestinationType | null): string {
  if (!dt) return '—';
  const found = DESTINATION_TYPES.find((d) => d.value === dt);
  return found ? found.label : dt;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function StepIndicator({ currentStep, completedSteps }: { currentStep: number; completedSteps: Set<number> }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const isCompleted = completedSteps.has(step.number);
        const isCurrent = currentStep === step.number;
        return (
          <React.Fragment key={step.number}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300',
                  isCompleted && 'bg-emerald-500 text-white',
                  isCurrent && !isCompleted && 'bg-blue-600 text-white ring-4 ring-blue-600/20',
                  !isCurrent && !isCompleted && 'bg-zinc-100 text-zinc-400 border border-zinc-200',
                )}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : step.number}
              </div>
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  isCurrent ? 'text-blue-600' : isCompleted ? 'text-emerald-600' : 'text-zinc-400',
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  'w-16 h-0.5 mt-[-18px] mx-1 transition-colors duration-300',
                  completedSteps.has(step.number) ? 'bg-emerald-400' : 'bg-zinc-200',
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function TagList({ tags, onRemove }: { tags: string[]; onRemove: (idx: number) => void }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {tags.map((tag, idx) => (
        <span
          key={`${tag}-${idx}`}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100"
        >
          {tag}
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

function SummaryRow({ label, value, onClick }: { label: string; value: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      className={cn(
        'flex items-start justify-between py-2.5 px-3 rounded-lg',
        onClick && 'hover:bg-zinc-50 cursor-pointer group',
      )}
      onClick={onClick}
    >
      <span className="text-sm text-zinc-500 font-medium">{label}</span>
      <span className="text-sm text-zinc-900 font-medium text-right max-w-[60%]">
        {value || <span className="text-zinc-300">—</span>}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ProgramWizard({ onComplete, onCancel }: ProgramWizardProps) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [reviewersInput, setReviewersInput] = useState('');
  const [approversInput, setApproversInput] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchSuccess, setLaunchSuccess] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [createdProgramId, setCreatedProgramId] = useState<number | null>(null);

  const createProgram = useCreateProgram();
  const createDestination = useCreateDestination();
  const scaffoldProgram = useScaffoldProgram();

  // ── Derived ──────────────────────────────────────────────────────────────

  const completedSteps = useMemo(() => {
    const set = new Set<number>();
    if (state.name.trim()) set.add(1);
    if (state.destinationType) set.add(2);
    if (step > 3) set.add(3);
    return set;
  }, [state.name, state.destinationType, step]);

  const canProceed = useMemo(() => {
    switch (step) {
      case 1:
        return state.name.trim().length > 0;
      case 2:
        return state.destinationType !== null;
      case 3:
        return true;
      default:
        return false;
    }
  }, [step, state.name, state.destinationType]);

  // ── State updaters ───────────────────────────────────────────────────────

  const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setAuthority = useCallback((authority: Authority) => {
    const match = AUTHORITIES.find((a) => a.value === authority);
    setState((prev) => ({
      ...prev,
      authority,
      region: match?.region ?? prev.region,
    }));
  }, []);

  const addReviewers = useCallback(() => {
    const tags = parseTagInput(reviewersInput);
    if (tags.length > 0) {
      setState((prev) => ({ ...prev, reviewers: [...prev.reviewers, ...tags] }));
      setReviewersInput('');
    }
  }, [reviewersInput]);

  const addApprovers = useCallback(() => {
    const tags = parseTagInput(approversInput);
    if (tags.length > 0) {
      setState((prev) => ({ ...prev, approvers: [...prev.approvers, ...tags] }));
      setApproversInput('');
    }
  }, [approversInput]);

  const removeReviewer = useCallback((idx: number) => {
    setState((prev) => ({ ...prev, reviewers: prev.reviewers.filter((_, i) => i !== idx) }));
  }, []);

  const removeApprover = useCallback((idx: number) => {
    setState((prev) => ({ ...prev, approvers: prev.approvers.filter((_, i) => i !== idx) }));
  }, []);

  // ── Navigation ───────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (step < 4 && canProceed) setStep((s) => s + 1);
  }, [step, canProceed]);

  const goBack = useCallback(() => {
    if (step > 1) setStep((s) => s - 1);
  }, [step]);

  const goToStep = useCallback((target: number) => {
    if (target >= 1 && target <= 4) setStep(target);
  }, []);

  // ── Launch ───────────────────────────────────────────────────────────────

  const handleLaunch = useCallback(async () => {
    setIsLaunching(true);
    setLaunchError(null);

    try {
      // 1. Create the program
      const program = await createProgram.mutateAsync({
        name: state.name,
        description: state.description,
        customerTrack: state.customerTrack,
        developmentStage: state.developmentStage,
        programLead: state.programLead,
        reviewers: state.reviewers,
        approvers: state.approvers,
        complianceLevel: state.complianceLevel,
      });

      const programId = program.id;
      setCreatedProgramId(programId);

      // 2. Create the destination
      await createDestination.mutateAsync({
        programId,
        destinationType: state.destinationType,
        authority: state.authority,
        region: state.region,
        targetDate: state.targetDate || undefined,
      });

      // 3. Auto-scaffold if enabled
      if (state.autoScaffold && state.destinationType) {
        await scaffoldProgram.mutateAsync({
          programId,
          destinationType: state.destinationType,
          customerTrack: state.customerTrack ?? undefined,
        });
      }

      setLaunchSuccess(true);

      // Delay slightly so the user sees the success animation
      setTimeout(() => {
        onComplete(programId);
      }, 2500);
    } catch (err: any) {
      setLaunchError(err?.message || 'Failed to create program. Please try again.');
    } finally {
      setIsLaunching(false);
    }
  }, [state, createProgram, createDestination, scaffoldProgram, onComplete]);

  // ── Render Steps ─────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-6">
      {/* Program Name */}
      <div>
        <label className="block text-sm font-semibold text-zinc-700 mb-1.5">
          Program Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={state.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="e.g., ABC-101 IND Enabling Program"
          className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Description</label>
        <textarea
          value={state.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="Briefly describe the program objectives and scope..."
          rows={3}
          className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition resize-none"
        />
      </div>

      {/* Customer Track */}
      <div>
        <label className="block text-sm font-semibold text-zinc-700 mb-3">Customer Track</label>
        <div className="grid grid-cols-2 gap-3">
          {CUSTOMER_TRACKS.map((track) => {
            const Icon = track.icon;
            const selected = state.customerTrack === track.value;
            return (
              <button
                key={track.value}
                type="button"
                onClick={() => update('customerTrack', track.value)}
                className={cn(
                  'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all duration-200',
                  selected
                    ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50',
                )}
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                    selected ? 'bg-blue-500 text-white' : 'bg-zinc-100 text-zinc-500',
                  )}
                >
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className={cn('text-sm font-semibold', selected ? 'text-blue-700' : 'text-zinc-800')}>
                    {track.label}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">{track.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Development Stage */}
      <div>
        <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Development Stage</label>
        <div className="relative">
          <select
            value={state.developmentStage ?? ''}
            onChange={(e) => update('developmentStage', (e.target.value || null) as DevelopmentStage | null)}
            className="w-full appearance-none px-4 py-2.5 pr-10 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
          >
            <option value="">Select stage...</option>
            {DEV_STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Destination Type */}
      <div>
        <label className="block text-sm font-semibold text-zinc-700 mb-3">
          Destination Type <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-4 gap-2.5">
          {DESTINATION_TYPES.map((dt) => {
            const selected = state.destinationType === dt.value;
            return (
              <button
                key={dt.value}
                type="button"
                onClick={() => update('destinationType', dt.value)}
                className={cn(
                  'flex flex-col items-center gap-1 p-3.5 rounded-xl border-2 transition-all duration-200',
                  selected
                    ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50',
                )}
              >
                <Target
                  className={cn('w-5 h-5 mb-0.5', selected ? 'text-blue-600' : 'text-zinc-400')}
                />
                <span className={cn('text-sm font-bold', selected ? 'text-blue-700' : 'text-zinc-700')}>
                  {dt.label}
                </span>
                <span className="text-[11px] text-zinc-400 text-center leading-tight">{dt.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Target Authority */}
      <div>
        <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Target Authority</label>
        <div className="relative">
          <select
            value={state.authority ?? ''}
            onChange={(e) => setAuthority(e.target.value as Authority)}
            className="w-full appearance-none px-4 py-2.5 pr-10 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
          >
            <option value="">Select authority...</option>
            {AUTHORITIES.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
        </div>
      </div>

      {/* Region (auto-set) */}
      <div>
        <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Region</label>
        <div className="px-4 py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-600">
          {state.region ? (
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {state.region}
              <span className="text-zinc-400 text-xs">(auto-set from authority)</span>
            </span>
          ) : (
            <span className="text-zinc-400">Select an authority to auto-set region</span>
          )}
        </div>
      </div>

      {/* Target Submission Date */}
      <div>
        <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Target Submission Date</label>
        <div className="relative">
          <input
            type="date"
            value={state.targetDate}
            onChange={(e) => update('targetDate', e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
          />
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      {/* Program Lead */}
      <div>
        <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Program Lead</label>
        <div className="relative">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            value={state.programLead}
            onChange={(e) => update('programLead', e.target.value)}
            placeholder="e.g., Dr. Jane Smith"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
          />
        </div>
      </div>

      {/* Reviewers */}
      <div>
        <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Reviewers</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={reviewersInput}
            onChange={(e) => setReviewersInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addReviewers();
              }
            }}
            placeholder="Comma-separated names, press Enter to add"
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
          />
          <button
            type="button"
            onClick={addReviewers}
            className="px-4 py-2.5 rounded-xl bg-zinc-100 text-zinc-600 text-sm font-medium hover:bg-zinc-200 transition"
          >
            Add
          </button>
        </div>
        <TagList tags={state.reviewers} onRemove={removeReviewer} />
      </div>

      {/* Approvers */}
      <div>
        <label className="block text-sm font-semibold text-zinc-700 mb-1.5">Approvers</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={approversInput}
            onChange={(e) => setApproversInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addApprovers();
              }
            }}
            placeholder="Comma-separated names, press Enter to add"
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition"
          />
          <button
            type="button"
            onClick={addApprovers}
            className="px-4 py-2.5 rounded-xl bg-zinc-100 text-zinc-600 text-sm font-medium hover:bg-zinc-200 transition"
          >
            Add
          </button>
        </div>
        <TagList tags={state.approvers} onRemove={removeApprover} />
      </div>

      {/* Compliance Level */}
      <div>
        <label className="block text-sm font-semibold text-zinc-700 mb-3">Compliance Level</label>
        <div className="space-y-2.5">
          {COMPLIANCE_LEVELS.map((cl) => {
            const selected = state.complianceLevel === cl.value;
            return (
              <button
                key={cl.value}
                type="button"
                onClick={() => update('complianceLevel', cl.value)}
                className={cn(
                  'flex items-center gap-3 w-full p-3.5 rounded-xl border-2 text-left transition-all duration-200',
                  selected
                    ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                    : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50',
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0',
                    selected ? 'border-blue-500' : 'border-zinc-300',
                  )}
                >
                  {selected && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
                </div>
                <div>
                  <div className={cn('text-sm font-semibold', selected ? 'text-blue-700' : 'text-zinc-700')}>
                    {cl.label}
                  </div>
                  <div className="text-xs text-zinc-500">{cl.desc}</div>
                </div>
                {cl.value === 'cfr-part-11' && (
                  <ShieldCheck className={cn('w-4 h-4 ml-auto', selected ? 'text-blue-500' : 'text-zinc-300')} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Auto-Scaffold */}
      <div className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200 bg-zinc-50/50">
        <button
          type="button"
          onClick={() => update('autoScaffold', !state.autoScaffold)}
          className={cn(
            'w-10 h-6 rounded-full relative transition-colors duration-200 shrink-0',
            state.autoScaffold ? 'bg-blue-500' : 'bg-zinc-300',
          )}
        >
          <div
            className={cn(
              'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200',
              state.autoScaffold ? 'translate-x-[18px]' : 'translate-x-0.5',
            )}
          />
        </button>
        <div>
          <div className="text-sm font-semibold text-zinc-700">Auto-scaffold artifact tree</div>
          <div className="text-xs text-zinc-500">
            Generate standard artifact tree for{' '}
            <span className="font-medium text-zinc-700">
              {state.destinationType ? formatDestinationType(state.destinationType) : 'selected destination'}
            </span>
          </div>
        </div>
        <Layers className="w-5 h-5 text-zinc-400 ml-auto" />
      </div>
    </div>
  );

  const renderStep4 = () => {
    if (launchSuccess) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          {/* CSS-only confetti burst */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center justify-center">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 rounded-full animate-ping"
                  style={{
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'][i % 6],
                    transform: `rotate(${i * 30}deg) translateY(-40px)`,
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: '1.5s',
                  }}
                />
              ))}
            </div>
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center relative z-10">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-zinc-900 mb-2">Program Launched!</h3>
          <p className="text-sm text-zinc-500 max-w-xs">
            <span className="font-semibold text-zinc-700">{state.name}</span> has been created with a{' '}
            <span className="font-semibold text-zinc-700">{formatDestinationType(state.destinationType)}</span>{' '}
            regulatory destination.
          </p>
          {state.autoScaffold && (
            <p className="text-xs text-emerald-600 mt-3 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Artifact tree has been auto-generated
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="text-center mb-6">
          <h3 className="text-base font-bold text-zinc-800">Review your program configuration</h3>
          <p className="text-xs text-zinc-500 mt-1">Click any section to go back and edit</p>
        </div>

        {/* Step 1 Summary */}
        <div
          className="rounded-xl border border-zinc-200 bg-white overflow-hidden cursor-pointer hover:border-zinc-300 transition"
          onClick={() => goToStep(1)}
        >
          <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Program Basics</span>
          </div>
          <div className="px-1 py-1 divide-y divide-zinc-50">
            <SummaryRow label="Name" value={state.name} />
            <SummaryRow label="Description" value={state.description || <span className="text-zinc-300 italic">None</span>} />
            <SummaryRow
              label="Customer Track"
              value={CUSTOMER_TRACKS.find((t) => t.value === state.customerTrack)?.label}
            />
            <SummaryRow
              label="Dev Stage"
              value={DEV_STAGES.find((s) => s.value === state.developmentStage)?.label}
            />
          </div>
        </div>

        {/* Step 2 Summary */}
        <div
          className="rounded-xl border border-zinc-200 bg-white overflow-hidden cursor-pointer hover:border-zinc-300 transition"
          onClick={() => goToStep(2)}
        >
          <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Regulatory Destination</span>
          </div>
          <div className="px-1 py-1 divide-y divide-zinc-50">
            <SummaryRow label="Destination" value={formatDestinationType(state.destinationType)} />
            <SummaryRow label="Authority" value={state.authority} />
            <SummaryRow label="Region" value={state.region} />
            <SummaryRow label="Target Date" value={state.targetDate || <span className="text-zinc-300 italic">Not set</span>} />
          </div>
        </div>

        {/* Step 3 Summary */}
        <div
          className="rounded-xl border border-zinc-200 bg-white overflow-hidden cursor-pointer hover:border-zinc-300 transition"
          onClick={() => goToStep(3)}
        >
          <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-violet-500" />
            <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Team & Governance</span>
          </div>
          <div className="px-1 py-1 divide-y divide-zinc-50">
            <SummaryRow label="Program Lead" value={state.programLead || <span className="text-zinc-300 italic">Not assigned</span>} />
            <SummaryRow
              label="Reviewers"
              value={state.reviewers.length > 0 ? state.reviewers.join(', ') : <span className="text-zinc-300 italic">None</span>}
            />
            <SummaryRow
              label="Approvers"
              value={state.approvers.length > 0 ? state.approvers.join(', ') : <span className="text-zinc-300 italic">None</span>}
            />
            <SummaryRow
              label="Compliance"
              value={COMPLIANCE_LEVELS.find((c) => c.value === state.complianceLevel)?.label}
            />
            <SummaryRow
              label="Auto-Scaffold"
              value={
                state.autoScaffold ? (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Enabled
                  </span>
                ) : (
                  'Disabled'
                )
              }
            />
          </div>
        </div>

        {/* Error display */}
        {launchError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
            <X className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-red-700">Launch failed</div>
              <div className="text-xs text-red-600 mt-0.5">{launchError}</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Main Render ──────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Create Program</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Set up a new regulatory program with guided onboarding</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Step Indicator */}
      {!launchSuccess && <StepIndicator currentStep={step} completedSteps={completedSteps} />}

      {/* Step Content */}
      <div className="min-h-[400px]">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </div>

      {/* Footer Navigation */}
      {!launchSuccess && (
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-zinc-200">
          <button
            type="button"
            onClick={step === 1 ? onCancel : goBack}
            disabled={isLaunching}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canProceed}
              className={cn(
                'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition',
                canProceed
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                  : 'bg-zinc-100 text-zinc-400 cursor-not-allowed',
              )}
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLaunch}
              disabled={isLaunching}
              className={cn(
                'flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm',
                isLaunching
                  ? 'bg-emerald-400 text-white cursor-wait'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700',
              )}
            >
              {isLaunching ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Launching...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4" />
                  Launch Program
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
