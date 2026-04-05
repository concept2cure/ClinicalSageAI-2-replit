/**
 * WorkflowEngine Component
 *
 * Dr. Sage <-> AnA 1.0 Workflow Engine
 *
 * Renders a visible, live agentic workflow when Dr. Sage performs
 * meaningful work. Shows step-by-step execution with clear actor
 * attribution (Dr. Sage vs AnA 1.0).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LIFECYCLE } from '../ui/enterprise';
import {
  Brain,
  Bot,
  Clock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Play,
  Pause,
  RotateCcw,
  Zap,
  ArrowRight,
  Shield,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'complete' | 'blocked' | 'action-needed';
  actor: 'dr-sage' | 'ana' | 'both';
  objectContext?: string;
  actionCta?: string;
  result?: string;
}

export interface WorkflowEngineProps {
  title: string;
  description?: string;
  steps: WorkflowStep[];
  isRunning: boolean;
  onStepAction?: (stepId: string) => void;
  onComplete?: () => void;
  className?: string;
}

export interface WorkflowDemoProps {
  scenarioId: string;
  scenario: {
    title: string;
    description: string;
    steps: WorkflowStep[];
    comparison: string;
  };
  autoPlay?: boolean;
  onComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  pending: {
    bg: LIFECYCLE.not_started.bg,
    border: LIFECYCLE.not_started.border,
    icon: Clock,
    iconColor: LIFECYCLE.not_started.text,
    label: 'Pending',
  },
  running: {
    bg: LIFECYCLE.in_review.bg,
    border: LIFECYCLE.in_review.border,
    icon: Loader2,
    iconColor: LIFECYCLE.in_review.text,
    label: 'Running',
  },
  complete: {
    bg: LIFECYCLE.approved.bg,
    border: LIFECYCLE.approved.border,
    icon: CheckCircle2,
    iconColor: LIFECYCLE.approved.text,
    label: 'Complete',
  },
  blocked: {
    bg: 'bg-stone-100',
    border: 'border-stone-400',
    icon: AlertCircle,
    iconColor: 'text-stone-900',
    label: 'Blocked',
  },
  'action-needed': {
    bg: LIFECYCLE.draft.bg,
    border: LIFECYCLE.draft.border,
    icon: AlertTriangle,
    iconColor: LIFECYCLE.draft.text,
    label: 'Action Needed',
  },
};

const ACTOR_CONFIG = {
  'dr-sage': {
    label: 'Dr. Sage',
    bg: 'bg-stone-100 text-stone-700',
    icons: [Bot],
  },
  ana: {
    label: 'AnA 1.0',
    bg: 'bg-stone-100 text-stone-700',
    icons: [Brain],
  },
  both: {
    label: 'Dr. Sage + AnA 1.0',
    bg: 'bg-stone-100 text-stone-700',
    icons: [Bot, Brain],
  },
} as const;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActorBadge({ actor }: { actor: WorkflowStep['actor'] }) {
  const config = ACTOR_CONFIG[actor];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.bg,
      )}
    >
      {config.icons.map((Icon, i) => (
        <Icon key={i} className="h-3 w-3" />
      ))}
      {config.label}
    </span>
  );
}

function StepCard({
  step,
  index,
  isLast,
  onAction,
}: {
  step: WorkflowStep;
  index: number;
  isLast: boolean;
  onAction?: (stepId: string) => void;
}) {
  const cfg = STATUS_CONFIG[step.status];
  const StatusIcon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35, ease: 'easeOut' }}
      className="relative flex gap-4"
    >
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <motion.div
          className={cn(
            'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2',
            cfg.border,
            cfg.bg,
          )}
          animate={
            step.status === 'running'
              ? { boxShadow: ['0 0 0 0 rgba(106,155,204,0.4)', '0 0 0 8px rgba(106,155,204,0)', '0 0 0 0 rgba(106,155,204,0.4)'] }
              : {}
          }
          transition={
            step.status === 'running'
              ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
              : {}
          }
        >
          <StatusIcon
            className={cn(
              'h-4 w-4',
              cfg.iconColor,
              step.status === 'running' && 'animate-spin',
            )}
          />
        </motion.div>
        {!isLast && (
          <div
            className={cn(
              'w-0.5 flex-1 min-h-[24px]',
              step.status === 'complete'
                ? 'bg-stone-300'
                : 'bg-border',
            )}
          />
        )}
      </div>

      {/* Card */}
      <motion.div
        className={cn(
          'mb-4 flex-1 rounded-lg border p-4 transition-colors duration-150',
          cfg.border,
          cfg.bg,
          step.status === 'running' && 'ring-2 ring-stone-400/30',
        )}
        layout
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-sm font-semibold leading-tight">
                {step.title}
              </span>
              <ActorBadge actor={step.actor} />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {step.description}
            </p>
          </div>
        </div>

        {step.objectContext && (
          <div className="mt-2">
            <Badge variant="outline" className="text-xs font-normal">
              {step.objectContext}
            </Badge>
          </div>
        )}

        <AnimatePresence>
          {step.status === 'complete' && step.result && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex items-start gap-2 rounded-md bg-stone-100/60 p-2.5 text-xs text-stone-800">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>{step.result}</span>
              </div>
            </motion.div>
          )}

          {step.status === 'action-needed' && step.actionCta && onAction && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-stone-400 text-stone-700 hover:bg-stone-100"
                  onClick={() => onAction(step.id)}
                >
                  <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
                  {step.actionCta}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// WorkflowEngine
// ---------------------------------------------------------------------------

export function WorkflowEngine({
  title,
  description,
  steps,
  isRunning,
  onStepAction,
  onComplete,
  className,
}: WorkflowEngineProps) {
  const completedCount = useMemo(
    () => steps.filter((s) => s.status === 'complete').length,
    [steps],
  );
  const allComplete = completedCount === steps.length && steps.length > 0;

  useEffect(() => {
    if (allComplete && onComplete) {
      onComplete();
    }
  }, [allComplete, onComplete]);

  const currentStepIndex = useMemo(() => {
    const idx = steps.findIndex(
      (s) => s.status === 'running' || s.status === 'action-needed',
    );
    return idx === -1 ? completedCount : idx;
  }, [steps, completedCount]);

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-100">
              <Zap className="h-4 w-4 text-stone-600" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge
              variant={allComplete ? 'default' : 'secondary'}
              className={cn(
                'text-xs',
                allComplete && 'bg-stone-900 hover:bg-stone-700',
                isRunning && !allComplete && 'bg-stone-600 hover:bg-stone-800 text-white',
              )}
            >
              {allComplete ? 'Complete' : isRunning ? 'Running' : 'Ready'}
            </Badge>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Step {Math.min(currentStepIndex + 1, steps.length)} of{' '}
              {steps.length}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <motion.div
            className={cn(
              'h-full rounded-full',
              allComplete
                ? 'bg-stone-900'
                : 'bg-stone-600',
            )}
            initial={{ width: 0 }}
            animate={{
              width: `${(completedCount / steps.length) * 100}%`,
            }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Step timeline */}
        <div className="mt-1">
          {steps.map((step, i) => (
            <StepCard
              key={step.id}
              step={step}
              index={i}
              isLast={i === steps.length - 1}
              onAction={onStepAction}
            />
          ))}
        </div>

        {/* Completion summary */}
        <AnimatePresence>
          {allComplete && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="mt-2 rounded-lg border border-stone-300 bg-stone-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 15,
                      delay: 0.4,
                    }}
                  >
                    <CheckCircle2 className="h-5 w-5 text-stone-900" />
                  </motion.div>
                  <span className="font-semibold text-sm text-stone-800">
                    Workflow Complete
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    What's next?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="text-xs h-7">
                      <ArrowRight className="mr-1 h-3 w-3" />
                      View full report
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7">
                      <Shield className="mr-1 h-3 w-3" />
                      Run compliance check
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7">
                      <Sparkles className="mr-1 h-3 w-3" />
                      Start deeper review
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// WorkflowDemo
// ---------------------------------------------------------------------------

export function WorkflowDemo({
  scenarioId,
  scenario,
  autoPlay = false,
  onComplete,
}: WorkflowDemoProps) {
  const [steps, setSteps] = useState<WorkflowStep[]>(
    () => scenario.steps.map((s) => ({ ...s, status: 'pending' as const })),
  );
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [whyExpanded, setWhyExpanded] = useState(false);

  // Reset when scenario changes
  useEffect(() => {
    setSteps(scenario.steps.map((s) => ({ ...s, status: 'pending' as const })));
    setIsPlaying(autoPlay);
    setWhyExpanded(false);
  }, [scenarioId, scenario, autoPlay]);

  // Auto-play logic
  useEffect(() => {
    if (!isPlaying) return;

    const pendingIdx = steps.findIndex((s) => s.status === 'pending');
    const runningIdx = steps.findIndex((s) => s.status === 'running');

    // If something is running, complete it after delay
    if (runningIdx !== -1) {
      const timer = setTimeout(() => {
        setSteps((prev) =>
          prev.map((s, i) =>
            i === runningIdx
              ? { ...s, status: 'complete' as const, result: `${s.title} completed successfully.` }
              : s,
          ),
        );
      }, 1500);
      return () => clearTimeout(timer);
    }

    // If nothing running and there are pending steps, start the next one
    if (pendingIdx !== -1) {
      const timer = setTimeout(() => {
        setSteps((prev) =>
          prev.map((s, i) =>
            i === pendingIdx ? { ...s, status: 'running' as const } : s,
          ),
        );
      }, 300);
      return () => clearTimeout(timer);
    }

    // All done
    const allComplete = steps.every((s) => s.status === 'complete');
    if (allComplete && steps.length > 0) {
      setIsPlaying(false);
      onComplete?.();
    }
  }, [steps, isPlaying, onComplete]);

  const handleReset = useCallback(() => {
    setSteps(scenario.steps.map((s) => ({ ...s, status: 'pending' as const })));
    setIsPlaying(false);
    setWhyExpanded(false);
  }, [scenario]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  const allComplete = steps.every((s) => s.status === 'complete') && steps.length > 0;
  const isRunning = steps.some((s) => s.status === 'running');

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={isPlaying ? 'secondary' : 'default'}
            onClick={handlePlayPause}
            disabled={allComplete}
          >
            {isPlaying ? (
              <>
                <Pause className="mr-1.5 h-3.5 w-3.5" />
                Pause
              </>
            ) : (
              <>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                {steps.some((s) => s.status !== 'pending') ? 'Resume' : 'Play'}
              </>
            )}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleReset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </div>

      {/* Engine */}
      <WorkflowEngine
        title={scenario.title}
        description={scenario.description}
        steps={steps}
        isRunning={isPlaying || isRunning}
      />

      {/* "Why this is better" expandable */}
      <motion.div
        initial={false}
        animate={{ opacity: allComplete ? 1 : 0.5 }}
        className="rounded-lg border bg-card p-4"
      >
        <button
          onClick={() => setWhyExpanded((e) => !e)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-stone-900" />
            Why this is better
          </span>
          {whyExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        <AnimatePresence>
          {whyExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {scenario.comparison}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo scenarios
// ---------------------------------------------------------------------------

export const DEMO_SCENARIOS: Record<
  string,
  {
    title: string;
    description: string;
    steps: WorkflowStep[];
    comparison: string;
  }
> = {
  'review-510k': {
    title: 'Review a 510(k) Submission',
    description:
      'Watch Dr. Sage and AnA 1.0 collaborate on a complete submission review',
    steps: [
      {
        id: '1',
        title: 'Identify project and workflow context',
        description:
          'Dr. Sage examines the active project, device classification, and current workflow state',
        status: 'pending',
        actor: 'dr-sage',
      },
      {
        id: '2',
        title: 'Inspect artifact and document state',
        description:
          'Dr. Sage reviews all documents, checking completeness and linkage integrity',
        status: 'pending',
        actor: 'dr-sage',
      },
      {
        id: '3',
        title: 'Evaluate evidence and support quality',
        description:
          'AnA 1.0 analyzes the evidence basis, testing reports, and literature support',
        status: 'pending',
        actor: 'ana',
      },
      {
        id: '4',
        title: 'Detect likely gaps and risks',
        description:
          'AnA 1.0 identifies missing elements, weak support areas, and potential deficiencies',
        status: 'pending',
        actor: 'ana',
      },
      {
        id: '5',
        title: 'Translate findings into workflow actions',
        description:
          'Both systems collaborate to convert intelligence into concrete next steps',
        status: 'pending',
        actor: 'both',
      },
      {
        id: '6',
        title: 'Recommend governed next steps',
        description:
          'Dr. Sage presents prioritized actions with governed artifact recommendations',
        status: 'pending',
        actor: 'dr-sage',
      },
      {
        id: '7',
        title: 'Offer safe fixes or deeper RI review',
        description:
          'Dr. Sage offers quick fixes while AnA 1.0 stands ready for deeper analysis',
        status: 'pending',
        actor: 'dr-sage',
      },
    ],
    comparison:
      'Instead of switching between email, precedent archives, shared folders, and separate drafting tools, this workflow keeps reasoning, guidance, and output inside one governed platform.',
  },
  'fix-compliance': {
    title: 'Fix Compliance Gaps',
    description:
      'Watch the dual-AI system identify and resolve compliance issues',
    steps: [
      {
        id: '1',
        title: 'Scan submission structure',
        description:
          'Dr. Sage reviews the eCTD structure and document inventory against requirements',
        status: 'pending',
        actor: 'dr-sage',
      },
      {
        id: '2',
        title: 'Cross-reference regulatory requirements',
        description:
          'AnA 1.0 checks each section against applicable guidance and precedent',
        status: 'pending',
        actor: 'ana',
      },
      {
        id: '3',
        title: 'Identify compliance gaps',
        description:
          'AnA 1.0 flags missing documents, incomplete sections, and format issues',
        status: 'pending',
        actor: 'ana',
      },
      {
        id: '4',
        title: 'Prioritize by severity',
        description:
          'Both systems rank gaps by regulatory risk and submission impact',
        status: 'pending',
        actor: 'both',
      },
      {
        id: '5',
        title: 'Generate fix recommendations',
        description:
          'Dr. Sage creates actionable remediation steps for each gap',
        status: 'pending',
        actor: 'dr-sage',
      },
      {
        id: '6',
        title: 'Apply safe automated fixes',
        description:
          'Dr. Sage applies metadata corrections, linkage repairs, and status updates',
        status: 'pending',
        actor: 'dr-sage',
      },
    ],
    comparison:
      'Most teams discover compliance gaps during reviewer feedback or agency deficiency letters. Here, Dr. Sage and AnA 1.0 proactively surface and fix issues before they become costly delays.',
  },
};
