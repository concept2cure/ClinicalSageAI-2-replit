/**
 * WorkspaceContextBars — Collapsible context bars (workflow, guided sequence,
 * work modes, context band, dossier modules, project nav) plus the IND workspace bar.
 * Extracted from ProjectWorkspaceShell to reduce shell line count.
 */
import React from 'react';
import { ChevronRight, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OPERATING_LAYERS, WORKBENCHES, PROJECT_NAV_ITEMS } from './workspaceShellConstants';
import type {
  WorkspaceMode,
  OperatingLayer,
  WorkspaceWorkbench,
  LeftRailMode,
  GuidedSequenceStage,
  Phase4Panel,
  ProjectNav,
} from './workspaceShellControllers';

// ── Types ────────────────────────────────────────────────────────────────────

interface GuidedStep {
  id: GuidedSequenceStage;
  label: string;
  hint: string;
}

interface NextRecommendedSection {
  code: string;
  title: string;
}

export interface WorkspaceContextBarsProps {
  // Visibility
  showContextBars: boolean;
  isINDWorkspace: boolean;

  // State values
  mode: WorkspaceMode;
  workflowStep: number;
  guidedSequence: GuidedStep[];
  currentGuidedStage: GuidedSequenceStage;
  guidedControlMode: 'ana' | 'client';
  activeLayer: OperatingLayer;
  activeWorkbench: WorkspaceWorkbench;
  activeArtifactTitle: string | undefined;
  reviewInFlight: number;
  projectNav: ProjectNav;
  selectedDocId: string | null;
  selectedCtdSection: string;

  // IND workspace
  readinessPercent: number;
  nextRecommendedSection: NextRecommendedSection | null;

  // Callbacks — guided sequence
  onGuidedStageAction: (stage: GuidedSequenceStage) => void;
  onGuidedContinue: () => void;
  onSetGuidedControlMode: (mode: 'ana' | 'client') => void;

  // Callbacks — layers / workbenches
  onLayerChange: (layer: OperatingLayer) => void;
  onWorkbenchChange: (workbench: WorkspaceWorkbench) => void;

  // Callbacks — context band actions
  onOpenReviews: () => void;
  onOpenReports: () => void;
  onOpenSubmissionBuilder: () => void;

  // Callbacks — project nav
  onNavItemClick: (id: ProjectNav) => void;

  // Governance-aware nav affordances for gated transitions
  navAffordances?: Record<string, { gateStatus: string; tooltip: string; disabled: boolean; badgeLabel?: string; badgeTone?: string }>;

  // Callbacks — IND workspace bar
  onOpenSectionTree: () => void;
  onStartNextWithRI: () => void;
  onHAQPath: () => void;
  onAssembleExport: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function WorkspaceContextBars(props: WorkspaceContextBarsProps) {
  const {
    showContextBars,
    isINDWorkspace,
    mode,
    workflowStep,
    guidedSequence,
    currentGuidedStage,
    guidedControlMode,
    activeLayer,
    activeWorkbench,
    activeArtifactTitle,
    reviewInFlight,
    projectNav,
    selectedCtdSection,
    readinessPercent,
    nextRecommendedSection,
    onGuidedStageAction,
    onGuidedContinue,
    onSetGuidedControlMode,
    onLayerChange,
    onWorkbenchChange,
    onOpenReviews,
    onOpenReports,
    onOpenSubmissionBuilder,
    onNavItemClick,
    navAffordances,
    onOpenSectionTree,
    onStartNextWithRI,
    onHAQPath,
    onAssembleExport,
  } = props;

  return (
    <>
      {/* ── Collapsible context bars ──── */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          showContextBars ? 'max-h-[320px]' : 'max-h-0'
        )}
        aria-hidden={!showContextBars}
      >
        {/* Workflow progress */}
        <div className="flex items-center gap-1.5 px-4 h-8 border-b border-stone-100 bg-stone-50/60 shrink-0 overflow-x-auto">
          <span className="text-[10px] uppercase tracking-wide text-stone-400 font-medium whitespace-nowrap">
            Workflow
          </span>
          {['Select section', 'Open document', 'Draft & review', 'Readiness', 'Package'].map(
            (step, idx) => (
              <React.Fragment key={step}>
                <span
                  className={cn(
                    'text-[11px] px-1.5 py-0.5 rounded-md border whitespace-nowrap',
                    idx + 1 <= workflowStep
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-stone-200 bg-white text-stone-500'
                  )}
                >
                  {idx + 1}. {step}
                </span>
                {idx < 4 && <ChevronRight className="w-3 h-3 text-stone-300 shrink-0" />}
              </React.Fragment>
            )
          )}
          <span className="ml-auto text-[11px] text-stone-500 whitespace-nowrap">
            {mode === 'edit'
              ? 'Focused edit mode'
              : mode === 'browse'
              ? 'Browse then open a document'
              : 'Start from project home'}
          </span>
        </div>

        {/* Guided sequence */}
        <div className="flex items-center gap-1.5 px-4 h-9 border-b border-stone-100 bg-stone-50/50 shrink-0 overflow-x-auto">
          <span className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold whitespace-nowrap">
            Guided sequence
          </span>
          {guidedSequence.map((step, idx) => {
            const currentIndex = guidedSequence.findIndex(s => s.id === currentGuidedStage);
            const isCurrent = step.id === currentGuidedStage;
            const isDone = idx < currentIndex;
            return (
              <React.Fragment key={step.id}>
                <button
                  onClick={() => onGuidedStageAction(step.id)}
                  className={cn(
                    'text-[11px] px-2 py-0.5 rounded-md border whitespace-nowrap transition-colors',
                    isCurrent
                      ? 'border-stone-300 bg-white text-stone-800 font-semibold'
                      : isDone
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                  )}
                  title={step.hint}
                >
                  {step.label}
                </button>
                {idx < guidedSequence.length - 1 && (
                  <ChevronRight className="w-3 h-3 text-stone-300 shrink-0" />
                )}
              </React.Fragment>
            );
          })}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] text-stone-500 uppercase tracking-wide">Control</span>
            <button
              onClick={() => onSetGuidedControlMode('ana')}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded border',
                guidedControlMode === 'ana'
                  ? 'border-violet-300 bg-violet-50 text-violet-700'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              )}
            >
              AnA-led
            </button>
            <button
              onClick={() => onSetGuidedControlMode('client')}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded border',
                guidedControlMode === 'client'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              )}
            >
              Client-led
            </button>
            <button
              onClick={onGuidedContinue}
              className="text-[11px] px-2 py-0.5 rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
            >
              Continue
            </button>
          </div>
        </div>

        {/* Work modes / workbench bar */}
        {!isINDWorkspace && (
          <div className="flex items-center gap-3 px-4 h-10 border-b border-stone-150 bg-stone-50/50 shrink-0 overflow-x-auto">
            <div className="text-[10px] font-medium tracking-wide text-stone-400 uppercase whitespace-nowrap">
              Mode
            </div>
            <div className="flex items-center gap-1.5">
              {OPERATING_LAYERS.map(layer => {
                const LayerIcon = layer.icon;
                const selected = activeLayer === layer.id;
                return (
                  <button
                    key={layer.id}
                    onClick={() => onLayerChange(layer.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                      selected
                        ? 'bg-stone-900 text-white'
                        : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                    )}
                    title={layer.description}
                  >
                    <LayerIcon className="w-3.5 h-3.5" />
                    {layer.label}
                  </button>
                );
              })}
            </div>
            <span className="text-stone-200">|</span>
            <div className="text-[10px] font-medium tracking-wide text-stone-400 uppercase whitespace-nowrap">
              Focus
            </div>
            <div className="flex items-center gap-1.5">
              {WORKBENCHES.map(workbench => {
                const WorkbenchIcon = workbench.icon;
                const selected = activeWorkbench === workbench.id;
                return (
                  <button
                    key={workbench.id}
                    onClick={() => onWorkbenchChange(workbench.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors',
                      selected
                        ? 'bg-stone-800 text-white'
                        : 'bg-white text-stone-600 border border-stone-200 hover:bg-blue-50'
                    )}
                    title={workbench.description}
                  >
                    <WorkbenchIcon className="w-3.5 h-3.5" />
                    {workbench.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Context band */}
        <div className="flex items-center gap-2 px-4 h-9 border-b border-stone-150 bg-white/95 shrink-0">
          <span className="text-[11px] text-stone-500 truncate max-w-[240px]">
            {activeArtifactTitle ? activeArtifactTitle.slice(0, 50) : 'No document selected'}
          </span>
          {reviewInFlight > 0 && (
            <>
              <span className="text-stone-200">·</span>
              <span className="text-[11px] text-amber-600">{reviewInFlight} in review</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={onOpenReviews}
              className="text-[11px] px-2 py-0.5 rounded border border-rose-200 text-rose-700 hover:bg-rose-50"
            >
              Reviews
            </button>
            <button
              onClick={onOpenReports}
              className="text-[11px] px-2 py-0.5 rounded border border-blue-200 text-stone-700 hover:bg-blue-50"
            >
              Reports
            </button>
            <button
              onClick={onOpenSubmissionBuilder}
              className="text-[11px] px-2 py-0.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              Submission Builder
            </button>
          </div>
        </div>

        {/* Dossier modules */}
        {!isINDWorkspace && (
          <div className="flex items-center gap-2 px-4 h-9 border-b border-zinc-200 bg-emerald-50/40 shrink-0 overflow-x-auto">
            <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wide whitespace-nowrap">
              Dossier modules
            </span>
            {[
              { module: 'Module 1', focus: 'Administrative / regional' },
              { module: 'Module 2', focus: 'Summaries & overviews' },
              { module: 'Module 3', focus: 'CMC' },
              { module: 'Module 5', focus: 'Clinical reports' },
            ].map(step => (
              <span
                key={step.module}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-[11px] text-emerald-800 whitespace-nowrap"
                title={step.focus}
              >
                <MapPin className="w-3 h-3 text-emerald-600" />
                <span className="font-medium">{step.module}</span>
                <span className="text-emerald-600">{step.focus}</span>
              </span>
            ))}
          </div>
        )}

        {/* Project nav items */}
        {!isINDWorkspace && (
          <div className="flex items-center gap-1 px-4 h-9 border-b border-zinc-200 bg-zinc-50/70 shrink-0 overflow-x-auto">
            {PROJECT_NAV_ITEMS.map(item => {
              const affordance = navAffordances?.[item.id];
              const isGated = affordance && affordance.gateStatus !== 'ungated';
              const badgeToneClass = affordance?.badgeTone === 'red' ? 'bg-red-100 text-red-700'
                : affordance?.badgeTone === 'amber' ? 'bg-amber-100 text-amber-700'
                : affordance?.badgeTone === 'green' ? 'bg-emerald-100 text-emerald-700'
                : '';

              return (
                <button
                  key={item.id}
                  onClick={() => onNavItemClick(item.id)}
                  title={affordance?.tooltip || undefined}
                  className={cn(
                    'px-2.5 py-1 text-xs rounded-md border whitespace-nowrap transition-colors flex items-center gap-1',
                    projectNav === item.id
                      ? 'bg-stone-900 text-white border-stone-900'
                      : affordance?.disabled
                        ? 'bg-stone-50 text-stone-400 border-stone-200 cursor-not-allowed'
                        : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                  )}
                  data-testid={`nav-item-${item.id}`}
                  data-gate-status={affordance?.gateStatus}
                >
                  {item.label}
                  {isGated && affordance?.badgeLabel && (
                    <span className={cn('text-[8px] px-1 py-0 rounded-full font-medium', badgeToneClass)}
                      data-testid={`nav-badge-${item.id}`}
                    >
                      {affordance.badgeLabel}
                    </span>
                  )}
                </button>
              );
            }
            ))}
          </div>
        )}
      </div>

      {/* IND workspace bar */}
      {isINDWorkspace && (
        <div className="border-b border-blue-200 bg-blue-50/50 px-4 py-2.5 shrink-0">
          <div className="flex items-center gap-2 text-xs text-blue-900">
            <span className="font-semibold">IND / eCTD Workspace</span>
            <span className="text-blue-300">•</span>
            <span>Readiness {readinessPercent}%</span>
            <span className="text-blue-300">•</span>
            <span>
              Next step:{' '}
              {nextRecommendedSection
                ? `${nextRecommendedSection.code} ${nextRecommendedSection.title}`
                : selectedCtdSection
                ? `Open ${selectedCtdSection}`
                : 'Select a section'}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={onOpenSectionTree}
                className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-blue-100"
              >
                Section tree
              </button>
              <button
                onClick={onStartNextWithRI}
                className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
              >
                Start next with RI
              </button>
              <button
                onClick={onHAQPath}
                className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-blue-100"
              >
                HAQ path
              </button>
              <button
                onClick={onAssembleExport}
                className="inline-flex items-center gap-1 rounded border border-blue-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-700 hover:bg-blue-100"
              >
                Assemble/export
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
