import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Pause,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Data models
// ---------------------------------------------------------------------------

type AgentStatus =
  | "idle"
  | "thinking"
  | "executing"
  | "waiting-human"
  | "complete"
  | "error";

type StepStatus = "pending" | "running" | "complete" | "blocked" | "skipped";

interface AgentNode {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  currentAction?: string;
}

interface WorkflowStep {
  id: string;
  agentId: string;
  agentName: string;
  action: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  duration?: string;
  result?: string;
  reasoning?: string;
  artifacts?: { name: string; type: string }[];
  needsHumanReview?: boolean;
  humanDecision?: "approved" | "rejected" | "revised";
}

interface WorkflowRun {
  id: string;
  title: string;
  submissionType: string;
  status: "running" | "paused" | "completed" | "failed";
  startedAt: string;
  progress: number;
  agents: AgentNode[];
  steps: WorkflowStep[];
  tokensUsed?: number;
  estimatedCompletion?: string;
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const DEMO_WORKFLOW: WorkflowRun = {
  id: "wf-510k-2026-0317",
  title: "510(k) Substantial Equivalence Package",
  submissionType: "510(k)",
  status: "running",
  startedAt: "2026-03-17T09:14:00Z",
  progress: 62,
  tokensUsed: 148320,
  estimatedCompletion: "~12 min remaining",
  agents: [
    {
      id: "coordinator",
      name: "Coordinator",
      role: "Orchestration",
      status: "idle",
    },
    {
      id: "researcher",
      name: "Researcher",
      role: "FDA database search",
      status: "idle",
    },
    {
      id: "evidence",
      name: "Evidence Agent",
      role: "Clinical mapping",
      status: "idle",
    },
    {
      id: "drafter",
      name: "Drafter",
      role: "Document generation",
      status: "idle",
    },
    {
      id: "qc",
      name: "QC Agent",
      role: "Statistical validation",
      status: "idle",
    },
    {
      id: "reviewer",
      name: "Reviewer",
      role: "Shadow FDA review",
      status: "waiting-human",
      currentAction: "Awaiting human decision on flagged deficiency",
    },
    {
      id: "compliance",
      name: "Compliance Agent",
      role: "Regulatory compliance",
      status: "idle",
    },
    {
      id: "compiler",
      name: "Compiler",
      role: "eCTD assembly",
      status: "idle",
    },
  ],
  steps: [
    {
      id: "step-1",
      agentId: "coordinator",
      agentName: "Coordinator",
      action: "Analyzing submission requirements for 510(k) device",
      status: "complete",
      startedAt: "2026-03-17T09:14:00Z",
      completedAt: "2026-03-17T09:14:04Z",
      duration: "3.8s",
      result:
        "Identified device class II, determined predicate search strategy, and mapped 7 required submission sections.",
      reasoning:
        "The device is a Class II cardiac monitoring accessory. Based on the product code DQA and 21 CFR 870.2710, I determined that a traditional 510(k) pathway is appropriate. The submission requires sections: cover letter, indications for use, device description, substantial equivalence comparison, performance data, labeling, and biocompatibility summary.",
    },
    {
      id: "step-2",
      agentId: "researcher",
      agentName: "Researcher",
      action: "Searching FDA database for predicate devices",
      status: "complete",
      startedAt: "2026-03-17T09:14:05Z",
      completedAt: "2026-03-17T09:14:18Z",
      duration: "12.6s",
      result:
        "Found 3 predicate devices: K213045 (CardioTrack Pro), K201187 (HeartSense Monitor), K194523 (PulseView 2.0). Recommended primary predicate: K213045.",
      reasoning:
        "I searched the FDA 510(k) database using product code DQA and regulation number 870.2710. I filtered for clearances from 2019-2025 with similar intended use. K213045 is the strongest predicate because it shares the same sensor technology, similar form factor, and identical clinical indication. The other two serve as secondary predicates for specific performance characteristics.",
      artifacts: [
        { name: "Predicate_Analysis_Report.pdf", type: "PDF" },
      ],
    },
    {
      id: "step-3",
      agentId: "evidence",
      agentName: "Evidence Agent",
      action: "Mapping clinical evidence to SE matrix categories",
      status: "complete",
      startedAt: "2026-03-17T09:14:19Z",
      completedAt: "2026-03-17T09:14:41Z",
      duration: "22.1s",
      result:
        "Mapped 12 evidence items across 6 SE matrix categories: intended use (2), technological characteristics (3), performance testing (4), biocompatibility (1), electrical safety (1), software validation (1).",
      reasoning:
        "I analyzed the available clinical and bench data against the SE comparison framework. Each evidence item was scored for relevance (high/medium/low) and completeness. Two gaps were identified in software validation — the algorithm comparison data is present but needs reformatting to match FDA expectations for algorithmic equivalence demonstrations.",
    },
    {
      id: "step-4",
      agentId: "drafter",
      agentName: "Drafter",
      action: "Generating substantial equivalence comparison",
      status: "complete",
      startedAt: "2026-03-17T09:14:42Z",
      completedAt: "2026-03-17T09:15:19Z",
      duration: "37.4s",
      result:
        "Generated SE comparison matrix with 18 comparison points across 6 categories. Document follows FDA guidance format with side-by-side predicate comparison.",
      reasoning:
        "I structured the SE matrix following the 2023 FDA guidance on formatting 510(k) submissions. Each row compares a specific characteristic between the subject device and primary predicate K213045. Where differences exist, I included justification text explaining why the difference does not raise new questions of safety or effectiveness. The technological characteristics section was the most complex, requiring detailed sensor specification comparisons.",
      artifacts: [
        { name: "SE_Matrix_Draft_v1.docx", type: "DOCX" },
        { name: "SE_Comparison_Table.xlsx", type: "XLSX" },
      ],
    },
    {
      id: "step-5",
      agentId: "qc",
      agentName: "QC Agent",
      action: "Validating statistical claims against source data",
      status: "complete",
      startedAt: "2026-03-17T09:15:20Z",
      completedAt: "2026-03-17T09:15:48Z",
      duration: "28.2s",
      result:
        "Validated 14 of 16 statistical claims. 2 claims flagged: (1) sensitivity figure on p.12 cites 97.2% but source data yields 96.8%; (2) confidence interval on p.15 is missing lower bound.",
      reasoning:
        "I cross-referenced every numerical claim in the SE matrix against the raw performance data files. The sensitivity discrepancy appears to stem from an outdated dataset version — the 97.2% figure matches v2 of the clinical data, but v3 (current) shows 96.8% after excluding protocol deviations. The missing confidence interval lower bound on p.15 is likely a formatting error in the table generation step.",
      artifacts: [
        { name: "QC_Validation_Report.pdf", type: "PDF" },
      ],
    },
    {
      id: "step-6",
      agentId: "reviewer",
      agentName: "Reviewer",
      action:
        "Shadow FDA review: checking for common deficiency patterns",
      status: "blocked",
      startedAt: "2026-03-17T09:15:49Z",
      duration: "running",
      result:
        "Identified 1 potential deficiency: the software algorithm comparison section lacks a detailed description of the change detection methodology, which reviewers in OHT4 have flagged in 3 of the last 5 similar submissions.",
      reasoning:
        "I ran the draft through our deficiency prediction model trained on 2,400 FDA AI/AL letters from 2020-2025 for product code DQA. The model flagged the algorithm description section with 78% confidence. Reviewing the specific text, the comparison states the algorithms are 'functionally equivalent' without providing the technical basis. OHT4 reviewers have consistently required step-by-step algorithmic comparison in recent clearances.",
      needsHumanReview: true,
    },
    {
      id: "step-7",
      agentId: "compliance",
      agentName: "Compliance Agent",
      action: "21 CFR Part 11 compliance check",
      status: "pending",
    },
    {
      id: "step-8",
      agentId: "compiler",
      agentName: "Compiler",
      action: "Assembling eCTD package",
      status: "pending",
    },
  ],
};

// ---------------------------------------------------------------------------
// Subtle enter animation preset
// ---------------------------------------------------------------------------

const fadeUp = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 4 },
  transition: { duration: 0.15 },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusLabel({ status }: { status: WorkflowRun["status"] }) {
  const labels: Record<WorkflowRun["status"], string> = {
    running: "Running",
    paused: "Paused at human review",
    completed: "Completed",
    failed: "Failed",
  };
  return (
    <span
      className={cn(
        "text-xs",
        status === "running" && "text-zinc-900",
        status === "paused" && "text-zinc-600",
        status === "completed" && "text-zinc-400",
        status === "failed" && "text-zinc-400"
      )}
    >
      {labels[status]}
    </span>
  );
}

function AgentStatusText({ status }: { status: AgentStatus }) {
  const map: Record<AgentStatus, string> = {
    idle: "Idle",
    thinking: "Thinking...",
    executing: "Executing",
    "waiting-human": "Waiting for review",
    complete: "Complete",
    error: "Error",
  };
  return <span>{map[status]}</span>;
}

function StepStatusIndicator({ status }: { status: StepStatus }) {
  if (status === "complete") {
    return <Check className="h-3.5 w-3.5 text-zinc-400" />;
  }
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-900">
        <motion.span
          className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-900"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
        Running...
      </span>
    );
  }
  if (status === "blocked") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
        <Clock className="h-3 w-3" />
        Waiting for review
      </span>
    );
  }
  if (status === "skipped") {
    return <span className="text-xs text-zinc-300">Skipped</span>;
  }
  return <span className="text-xs text-zinc-300">Pending</span>;
}

// ---------------------------------------------------------------------------
// WorkflowHeader
// ---------------------------------------------------------------------------

function WorkflowHeader({
  run,
  onTogglePause,
}: {
  run: WorkflowRun;
  onTogglePause: () => void;
}) {
  const elapsed = useMemo(() => {
    const start = new Date(run.startedAt).getTime();
    const now = Date.now();
    const diffMs = now - start;
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    return `${mins}m ${secs}s elapsed`;
  }, [run.startedAt]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-sm font-medium text-zinc-900">
            Agent Workflow Monitor
          </h2>
          <p className="text-sm text-zinc-600">{run.title}</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">
              {run.submissionType}
            </span>
            <StatusLabel status={run.status} />
          </div>
        </div>
        <button
          onClick={onTogglePause}
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
        >
          {run.status === "paused" ? (
            <>
              <Play className="h-3 w-3" />
              Resume
            </>
          ) : (
            <>
              <Pause className="h-3 w-3" />
              Pause
            </>
          )}
        </button>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="h-1 w-full rounded-full bg-zinc-100">
          <motion.div
            className="h-1 rounded-full bg-zinc-900"
            initial={{ width: 0 }}
            animate={{ width: `${run.progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">{run.progress}%</span>
          <span className="text-xs text-zinc-400">{elapsed}</span>
          {run.estimatedCompletion && (
            <span className="text-xs text-zinc-400">
              {run.estimatedCompletion}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ActiveAgentsStrip
// ---------------------------------------------------------------------------

function ActiveAgentsStrip({ agents }: { agents: AgentNode[] }) {
  return (
    <div className="flex items-start gap-0 overflow-x-auto">
      {agents.map((agent, i) => {
        const isActive =
          agent.status === "thinking" ||
          agent.status === "executing" ||
          agent.status === "waiting-human";

        return (
          <div key={agent.id} className="flex items-start">
            {i > 0 && (
              <div className="mt-3 w-6 border-t border-zinc-200" />
            )}
            <div
              className={cn(
                "flex-shrink-0 px-3 py-2 text-center",
                isActive ? "text-zinc-900" : "text-zinc-400"
              )}
            >
              <p
                className={cn(
                  "text-xs",
                  isActive && "font-medium"
                )}
              >
                {agent.name}
              </p>
              <p className="text-xs text-zinc-400">{agent.role}</p>
              <p className="mt-0.5 text-xs">
                <AgentStatusText status={agent.status} />
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HITLReviewPanel
// ---------------------------------------------------------------------------

function HITLReviewPanel({
  step,
  onDecision,
}: {
  step: WorkflowStep;
  onDecision: (
    stepId: string,
    decision: "approved" | "rejected" | "revised"
  ) => void;
}) {
  if (step.humanDecision) {
    const labels: Record<string, string> = {
      approved: "Approved",
      rejected: "Rejected",
      revised: "Revision requested",
    };
    return (
      <motion.div {...fadeUp} className="mt-3 rounded-lg border border-zinc-200 p-4">
        <p className="text-xs text-zinc-400">
          Decision: {labels[step.humanDecision]}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      {...fadeUp}
      className="mt-3 rounded-lg border border-zinc-200 p-4 space-y-3"
    >
      <p className="text-xs font-medium text-zinc-900">
        Human review required
      </p>
      <p className="text-sm text-zinc-600">
        The agent has flagged a potential issue and is requesting your decision
        before proceeding.
      </p>
      {step.result && (
        <p className="text-sm text-zinc-600">{step.result}</p>
      )}
      <div className="flex items-center gap-4 pt-1">
        <button
          onClick={() => onDecision(step.id, "approved")}
          className="text-xs text-blue-600 hover:underline"
        >
          Approve
        </button>
        <button
          onClick={() => onDecision(step.id, "revised")}
          className="text-xs text-zinc-600 hover:underline"
        >
          Request revision
        </button>
        <button
          onClick={() => onDecision(step.id, "rejected")}
          className="text-xs text-zinc-400 hover:underline"
        >
          Reject
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// StepRow
// ---------------------------------------------------------------------------

function StepRow({
  step,
  index,
  onDecision,
}: {
  step: WorkflowStep;
  index: number;
  onDecision: (
    stepId: string,
    decision: "approved" | "rejected" | "revised"
  ) => void;
}) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [artifactsOpen, setArtifactsOpen] = useState(false);

  const isCurrent = step.status === "running" || step.status === "blocked";
  const isPending = step.status === "pending";
  const isComplete = step.status === "complete";

  return (
    <motion.div
      {...fadeUp}
      className={cn(
        "relative py-3 pl-4 pr-2",
        isCurrent && "border-l-2 border-zinc-900",
        !isCurrent && "border-l-2 border-transparent"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Step number */}
        <span
          className={cn(
            "mt-0.5 flex-shrink-0 text-xs tabular-nums",
            isPending ? "text-zinc-300" : "text-zinc-400"
          )}
        >
          {index + 1}
        </span>

        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm font-medium",
                isPending
                  ? "text-zinc-300"
                  : isComplete
                  ? "text-zinc-500"
                  : "text-zinc-900"
              )}
            >
              {step.agentName}
            </span>
            {step.duration && (
              <span className="text-xs text-zinc-400">
                {step.duration}
              </span>
            )}
          </div>

          <p
            className={cn(
              "text-sm",
              isPending
                ? "text-zinc-300"
                : isComplete
                ? "text-zinc-500"
                : "text-zinc-600"
            )}
          >
            {step.action}
          </p>

          {/* Status */}
          <div className="pt-0.5">
            <StepStatusIndicator status={step.status} />
          </div>

          {/* Result preview */}
          {step.result && !isPending && (
            <p className="line-clamp-2 text-sm text-zinc-600">
              {step.result}
            </p>
          )}

          {/* Expandable reasoning */}
          {step.reasoning && !isPending && (
            <div>
              <button
                onClick={() => setReasoningOpen(!reasoningOpen)}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                {reasoningOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                View reasoning
              </button>
              <AnimatePresence>
                {reasoningOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <p className="mt-1 text-xs italic text-zinc-500">
                      {step.reasoning}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Expandable artifacts */}
          {step.artifacts && step.artifacts.length > 0 && !isPending && (
            <div>
              <button
                onClick={() => setArtifactsOpen(!artifactsOpen)}
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                {artifactsOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Artifacts ({step.artifacts.length})
              </button>
              <AnimatePresence>
                {artifactsOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <ul className="mt-1 space-y-0.5">
                      {step.artifacts.map((a) => (
                        <li
                          key={a.name}
                          className="text-xs text-zinc-500"
                        >
                          {a.name}{" "}
                          <span className="text-zinc-400">
                            ({a.type})
                          </span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* HITL review panel */}
          {step.needsHumanReview && (
            <HITLReviewPanel step={step} onDecision={onDecision} />
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// SummaryFooter
// ---------------------------------------------------------------------------

function SummaryFooter({ run }: { run: WorkflowRun }) {
  const allArtifacts = useMemo(() => {
    return run.steps.flatMap((s) => s.artifacts ?? []);
  }, [run.steps]);

  const agentUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const step of run.steps) {
      counts[step.agentName] = (counts[step.agentName] ?? 0) + 1;
    }
    return Object.entries(counts);
  }, [run.steps]);

  const totalDuration = useMemo(() => {
    const start = new Date(run.startedAt).getTime();
    const lastCompleted = run.steps
      .filter((s) => s.completedAt)
      .map((s) => new Date(s.completedAt!).getTime())
      .sort((a, b) => b - a)[0];
    if (!lastCompleted) return null;
    const diffMs = lastCompleted - start;
    const mins = Math.floor(diffMs / 60000);
    const secs = Math.floor((diffMs % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }, [run.startedAt, run.steps]);

  if (run.status !== "completed") return null;

  return (
    <motion.div {...fadeUp} className="space-y-3 pt-4">
      <div className="flex items-center gap-2">
        <Check className="h-3.5 w-3.5 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-900">
          Workflow completed
        </span>
        {totalDuration && (
          <span className="text-xs text-zinc-400">
            in {totalDuration}
          </span>
        )}
      </div>

      {allArtifacts.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-zinc-400">Artifacts generated</p>
          <ul className="space-y-0.5">
            {allArtifacts.map((a) => (
              <li key={a.name} className="text-xs text-zinc-600">
                {a.name}{" "}
                <span className="text-zinc-400">({a.type})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs text-zinc-400">Agent utilization</p>
        <ul className="space-y-0.5">
          {agentUsage.map(([name, count]) => (
            <li key={name} className="text-xs text-zinc-600">
              {name}{" "}
              <span className="text-zinc-400">
                ({count} {count === 1 ? "step" : "steps"})
              </span>
            </li>
          ))}
        </ul>
      </div>

      {run.tokensUsed !== undefined && (
        <p className="text-xs text-zinc-400">
          {run.tokensUsed.toLocaleString()} tokens used
        </p>
      )}

      <button className="text-xs text-blue-600 hover:underline">
        View full audit trail
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// AgentWorkflowMonitor — main component
// ---------------------------------------------------------------------------

interface AgentWorkflowMonitorProps {
  workflowRun?: WorkflowRun;
}

export function AgentWorkflowMonitor({
  workflowRun,
}: AgentWorkflowMonitorProps) {
  const [run, setRun] = useState<WorkflowRun>(
    () => workflowRun ?? DEMO_WORKFLOW
  );

  const handleTogglePause = useCallback(() => {
    setRun((prev) => ({
      ...prev,
      status: prev.status === "paused" ? "running" : "paused",
    }));
  }, []);

  const handleDecision = useCallback(
    (stepId: string, decision: "approved" | "rejected" | "revised") => {
      setRun((prev) => {
        const updatedSteps = prev.steps.map((s) => {
          if (s.id === stepId) {
            return {
              ...s,
              humanDecision: decision,
              status: "complete" as StepStatus,
              completedAt: new Date().toISOString(),
            };
          }
          return s;
        });

        // Unblock the next pending step
        let unblocked = false;
        const finalSteps = updatedSteps.map((s) => {
          if (!unblocked && s.status === "pending") {
            unblocked = true;
            return { ...s, status: "running" as StepStatus, startedAt: new Date().toISOString() };
          }
          return s;
        });

        // Update agent statuses
        const decidedStep = finalSteps.find((s) => s.id === stepId);
        const nextRunning = finalSteps.find((s) => s.status === "running");
        const updatedAgents = prev.agents.map((a) => {
          if (decidedStep && a.id === decidedStep.agentId) {
            return { ...a, status: "idle" as AgentStatus };
          }
          if (nextRunning && a.id === nextRunning.agentId) {
            return {
              ...a,
              status: "executing" as AgentStatus,
              currentAction: nextRunning.action,
            };
          }
          return a;
        });

        const completedCount = finalSteps.filter(
          (s) => s.status === "complete" || s.status === "skipped"
        ).length;
        const progress = Math.round(
          (completedCount / finalSteps.length) * 100
        );

        return {
          ...prev,
          steps: finalSteps,
          agents: updatedAgents,
          progress,
          status:
            completedCount === finalSteps.length
              ? ("completed" as const)
              : prev.status === "paused"
              ? ("paused" as const)
              : ("running" as const),
        };
      });
    },
    []
  );

  return (
    <div className="w-full bg-white">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {/* 1. Workflow Header */}
        <WorkflowHeader run={run} onTogglePause={handleTogglePause} />

        {/* 2. Active Agents Strip */}
        <div className="border-y border-zinc-200 py-3">
          <ActiveAgentsStrip agents={run.agents} />
        </div>

        {/* 3. Step Timeline */}
        <div className="space-y-0 divide-y divide-zinc-50">
          {run.steps.map((step, i) => (
            <StepRow
              key={step.id}
              step={step}
              index={i}
              onDecision={handleDecision}
            />
          ))}
        </div>

        {/* 5. Summary Footer */}
        <SummaryFooter run={run} />
      </div>
    </div>
  );
}

export default AgentWorkflowMonitor;
