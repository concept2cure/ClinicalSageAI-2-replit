import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SubmissionType =
  | "510k"
  | "IND"
  | "NDA_BLA"
  | "PMA"
  | "DeNovo"
  | "CER_MDR"
  | "MAA"
  | "CTA";

interface SubmissionOption {
  id: SubmissionType;
  label: string;
  description: string;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  phase: "Planning" | "Drafting" | "Review" | "Assembly" | "Validation";
}

type AutomationLevel = "supervised" | "guided" | "autonomous";

interface ReviewGate {
  id: string;
  label: string;
  explanation: string;
  defaultOn: boolean;
}

interface DemoStep {
  agent: string;
  action: string;
  result: string;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const SUBMISSION_OPTIONS: SubmissionOption[] = [
  { id: "510k", label: "510(k)", description: "Premarket notification for moderate-risk devices" },
  { id: "IND", label: "IND", description: "Investigational New Drug application" },
  { id: "NDA_BLA", label: "NDA/BLA", description: "New Drug or Biologics License Application" },
  { id: "PMA", label: "PMA", description: "Premarket Approval for high-risk devices" },
  { id: "DeNovo", label: "De Novo", description: "Novel low-to-moderate risk device classification" },
  { id: "CER_MDR", label: "CER/MDR", description: "Clinical Evaluation Report under EU MDR" },
  { id: "MAA", label: "MAA", description: "Marketing Authorization Application (EMA)" },
  { id: "CTA", label: "CTA", description: "Clinical Trial Application" },
];

const ALL_AGENTS: Agent[] = [
  { id: "predicate", name: "Predicate Researcher", description: "Identifies and analyzes predicate devices from FDA databases", phase: "Planning" },
  { id: "evidence", name: "Evidence Agent", description: "Gathers clinical evidence and literature references", phase: "Planning" },
  { id: "protocol", name: "Protocol Analyzer", description: "Reviews and validates clinical trial protocols", phase: "Planning" },
  { id: "researcher", name: "Researcher", description: "Performs literature searches and evidence synthesis", phase: "Planning" },
  { id: "drafter", name: "Drafter", description: "Generates regulatory document sections from structured data", phase: "Drafting" },
  { id: "statistician", name: "Statistician", description: "Validates statistical methods and analyzes clinical data", phase: "Drafting" },
  { id: "translator", name: "Translator", description: "Adapts documents for regional regulatory requirements", phase: "Drafting" },
  { id: "se_matrix", name: "SE Matrix Reviewer", description: "Evaluates substantial equivalence comparisons", phase: "Review" },
  { id: "qc_agent", name: "QC Agent", description: "Performs quality checks on document completeness and accuracy", phase: "Review" },
  { id: "reviewer", name: "Reviewer", description: "Simulates FDA-style review of the submission package", phase: "Review" },
  { id: "compliance", name: "Compliance Agent", description: "Checks regulatory compliance across all applicable guidelines", phase: "Validation" },
  { id: "compliance_eu", name: "Compliance Agent (EU)", description: "Validates compliance with EU MDR and MEDDEV guidance", phase: "Validation" },
  { id: "compiler", name: "Compiler", description: "Assembles final eCTD-compliant submission packages", phase: "Assembly" },
];

const AGENT_MAP: Record<SubmissionType, string[]> = {
  "510k": ["predicate", "evidence", "drafter", "se_matrix", "compliance", "compiler"],
  IND: ["protocol", "drafter", "statistician", "qc_agent", "compliance", "compiler"],
  NDA_BLA: ALL_AGENTS.map((a) => a.id),
  PMA: [...ALL_AGENTS.map((a) => a.id), "reviewer"],
  DeNovo: ["predicate", "evidence", "drafter", "compliance", "compiler"],
  CER_MDR: ["researcher", "drafter", "compliance_eu", "translator"],
  MAA: ["researcher", "drafter", "statistician", "compliance", "compiler"],
  CTA: ["protocol", "drafter", "statistician", "compliance", "compiler"],
};

const AUTOMATION_LEVELS: { id: AutomationLevel; label: string; description: string }[] = [
  {
    id: "supervised",
    label: "Supervised",
    description: "Agents suggest, you approve every step. Best for learning the system and maintaining full control over each decision.",
  },
  {
    id: "guided",
    label: "Guided",
    description: "Agents execute routine tasks automatically and pause for critical decisions. Recommended for most teams.",
  },
  {
    id: "autonomous",
    label: "Autonomous",
    description: "Agents handle the full workflow end-to-end. You review the final output. Best for experienced teams with established processes.",
  },
];

const REVIEW_GATES: ReviewGate[] = [
  { id: "before_doc", label: "Before any document is generated", explanation: "Ensures your team reviews the plan before drafting begins.", defaultOn: true },
  { id: "before_stats", label: "Before statistical claims are made", explanation: "Critical for data integrity — prevents unsupported claims.", defaultOn: true },
  { id: "before_compliance", label: "Before compliance assessment is finalized", explanation: "Lets you verify regulatory interpretations before they are locked.", defaultOn: true },
  { id: "before_ectd", label: "Before eCTD compilation starts", explanation: "Useful if your team needs to review structure before assembly.", defaultOn: false },
  { id: "before_submission", label: "Before submission package is assembled", explanation: "Final human checkpoint before the complete package is built.", defaultOn: true },
];

function getDemoSteps(type: SubmissionType): DemoStep[] {
  const demos: Record<string, DemoStep[]> = {
    "510k": [
      { agent: "Predicate Researcher", action: "Searching FDA 510(k) database", result: "Found 12 potential predicate devices. Top match: K213456 (93% similarity)." },
      { agent: "Evidence Agent", action: "Gathering clinical evidence", result: "Compiled 8 bench studies and 3 clinical references supporting equivalence." },
      { agent: "Drafter", action: "Generating SE summary", result: "Draft substantial equivalence summary created (4 pages, 6 comparison tables)." },
      { agent: "Compliance Agent", action: "Checking 21 CFR 807 requirements", result: "All required sections present. 1 minor formatting suggestion flagged." },
      { agent: "Compiler", action: "Assembling submission package", result: "510(k) package assembled with 14 documents in eCTD structure." },
    ],
    default: [
      { agent: "Researcher", action: "Analyzing regulatory requirements", result: "Identified 6 applicable guidance documents and 4 key requirements." },
      { agent: "Drafter", action: "Generating document sections", result: "Draft created with 8 sections across 12 pages." },
      { agent: "Statistician", action: "Validating data analysis", result: "Statistical methods confirmed. Power analysis meets threshold (0.85)." },
      { agent: "Compliance Agent", action: "Running compliance checks", result: "All regulatory checkpoints passed. 2 recommendations noted." },
      { agent: "Compiler", action: "Building submission package", result: "Submission package assembled with all required modules." },
    ],
  };
  return demos[type] ?? demos.default;
}

// ---------------------------------------------------------------------------
// Animation presets
// ---------------------------------------------------------------------------

const fade = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.15 },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "block h-1.5 w-1.5 rounded-full transition-colors duration-150",
            i < current ? "bg-stone-900" : i === current ? "bg-stone-500" : "bg-stone-200"
          )}
        />
      ))}
    </div>
  );
}

function StepSubmissionType({
  selected,
  onSelect,
}: {
  selected: SubmissionType | null;
  onSelect: (t: SubmissionType) => void;
}) {
  const count = selected ? (AGENT_MAP[selected]?.length ?? 0) : 0;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {SUBMISSION_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className={cn(
              "w-full text-left px-3 py-2.5 rounded transition-colors duration-100",
              selected === opt.id
                ? "bg-stone-50 border-l-2 border-stone-900"
                : "border-l-2 border-transparent hover:bg-stone-50/60"
            )}
          >
            <span className="text-sm font-medium text-stone-900">{opt.label}</span>
            <p className="text-xs text-stone-500 mt-0.5">{opt.description}</p>
          </button>
        ))}
      </div>
      {selected && (
        <motion.p {...fade} className="text-xs text-stone-400">
          {count} agents available for this pathway
        </motion.p>
      )}
    </div>
  );
}

const PHASE_ORDER = ["Planning", "Drafting", "Review", "Assembly", "Validation"] as const;

function StepAgentTeam({
  submissionType,
  enabledAgents,
  onToggle,
}: {
  submissionType: SubmissionType;
  enabledAgents: Set<string>;
  onToggle: (id: string) => void;
}) {
  const relevantIds = AGENT_MAP[submissionType] ?? [];
  const relevant = ALL_AGENTS.filter((a) => relevantIds.includes(a.id));
  const grouped = PHASE_ORDER.map((phase) => ({
    phase,
    agents: relevant.filter((a) => a.phase === phase),
  })).filter((g) => g.agents.length > 0);

  return (
    <div className="space-y-5">
      {grouped.map((group) => (
        <div key={group.phase}>
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-2">
            {group.phase}
          </p>
          <div className="space-y-1">
            {group.agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => onToggle(agent.id)}
                className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-stone-50 transition-colors duration-100"
              >
                <div className="text-left">
                  <span className="text-sm text-stone-900">{agent.name}</span>
                  <p className="text-xs text-stone-500">{agent.description}</p>
                </div>
                <span
                  className={cn(
                    "flex-shrink-0 ml-3 h-4 w-7 rounded-full transition-colors duration-100 relative",
                    enabledAgents.has(agent.id) ? "bg-stone-900" : "bg-stone-200"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform duration-100",
                      enabledAgents.has(agent.id) ? "translate-x-3.5" : "translate-x-0.5"
                    )}
                  />
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StepAutomation({
  level,
  onSelect,
}: {
  level: AutomationLevel;
  onSelect: (l: AutomationLevel) => void;
}) {
  return (
    <div className="space-y-1">
      {AUTOMATION_LEVELS.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onSelect(opt.id)}
          className={cn(
            "w-full text-left px-3 py-3 rounded transition-colors duration-100",
            level === opt.id
              ? "bg-stone-50 border-l-2 border-stone-900"
              : "border-l-2 border-transparent hover:bg-stone-50/60"
          )}
        >
          <span className="text-sm font-medium text-stone-900">{opt.label}</span>
          {level === opt.id && opt.id === "guided" && (
            <span className="ml-2 text-xs text-stone-400">Recommended</span>
          )}
          <p className="text-xs text-stone-500 mt-0.5">{opt.description}</p>
        </button>
      ))}
    </div>
  );
}

function StepReviewGates({
  gates,
  onToggle,
}: {
  gates: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      {REVIEW_GATES.map((gate) => (
        <button
          key={gate.id}
          onClick={() => onToggle(gate.id)}
          className="w-full flex items-start gap-3 px-3 py-2.5 rounded hover:bg-stone-50 transition-colors duration-100 text-left"
        >
          <span
            className={cn(
              "mt-0.5 flex-shrink-0 h-4 w-4 rounded border transition-colors duration-100 flex items-center justify-center",
              gates[gate.id]
                ? "bg-stone-900 border-stone-900"
                : "bg-white border-stone-300"
            )}
          >
            {gates[gate.id] && <Check className="h-3 w-3 text-white" strokeWidth={2.5} />}
          </span>
          <div>
            <span className="text-sm text-stone-900">{gate.label}</span>
            <p className="text-xs text-stone-500 mt-0.5">{gate.explanation}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function StepDemo({ submissionType }: { submissionType: SubmissionType }) {
  const steps = getDemoSteps(submissionType);
  const [visibleCount, setVisibleCount] = useState(0);
  const [typingIndex, setTypingIndex] = useState(0);
  const [typedText, setTypedText] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setVisibleCount(0);
    setTypingIndex(0);
    setTypedText("");
  }, [submissionType]);

  useEffect(() => {
    if (visibleCount >= steps.length) return;
    const current = steps[visibleCount];
    const fullText = current.result;

    if (typingIndex < fullText.length) {
      intervalRef.current = setInterval(() => {
        setTypingIndex((prev) => {
          const next = prev + 1;
          if (next >= fullText.length) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setTimeout(() => {
              setTypedText("");
              setTypingIndex(0);
              setVisibleCount((c) => c + 1);
            }, 400);
          }
          return next;
        });
      }, 18);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [visibleCount, steps]);

  useEffect(() => {
    if (visibleCount < steps.length) {
      setTypedText(steps[visibleCount].result.slice(0, typingIndex));
    }
  }, [typingIndex, visibleCount, steps]);

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const isComplete = i < visibleCount;
        const isCurrent = i === visibleCount;

        if (!isComplete && !isCurrent) {
          return (
            <div key={i} className="px-3 py-2 rounded">
              <p className="text-xs text-stone-400">
                {step.agent} — {step.action}
              </p>
            </div>
          );
        }

        return (
          <motion.div
            key={i}
            {...fade}
            className={cn("px-3 py-2 rounded", isComplete ? "bg-stone-50" : "")}
          >
            <div className="flex items-center gap-2">
              {isComplete && <Check className="h-3 w-3 text-stone-400" />}
              <p className="text-xs font-medium text-stone-900">{step.agent}</p>
              <span className="text-xs text-stone-400">— {step.action}</span>
            </div>
            <p className="text-xs text-stone-600 mt-1">
              {isComplete ? step.result : typedText}
              {isCurrent && <span className="animate-pulse">|</span>}
            </p>
          </motion.div>
        );
      })}
      {visibleCount >= steps.length && (
        <motion.p {...fade} className="text-xs text-blue-600 mt-4">
          Demo complete. Continue to connect to your project.
        </motion.p>
      )}
    </div>
  );
}

function StepConnect({
  submissionType,
  automationLevel,
  enabledAgentCount,
  gateCount,
  activated,
  onActivate,
}: {
  submissionType: SubmissionType;
  automationLevel: AutomationLevel;
  enabledAgentCount: number;
  gateCount: number;
  activated: boolean;
  onActivate: () => void;
}) {
  const label = SUBMISSION_OPTIONS.find((o) => o.id === submissionType)?.label ?? submissionType;
  const levelLabel = AUTOMATION_LEVELS.find((l) => l.id === automationLevel)?.label ?? automationLevel;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center justify-between px-3 py-2 rounded bg-stone-50">
          <span className="text-xs text-stone-500">Project</span>
          <span className="text-xs text-stone-900">Select a project</span>
        </div>
      </div>

      <div className="space-y-1 px-3">
        <p className="text-xs text-stone-400">Configuration summary</p>
        <div className="flex justify-between text-xs py-1">
          <span className="text-stone-500">Submission type</span>
          <span className="text-stone-900">{label}</span>
        </div>
        <div className="flex justify-between text-xs py-1">
          <span className="text-stone-500">Active agents</span>
          <span className="text-stone-900">{enabledAgentCount}</span>
        </div>
        <div className="flex justify-between text-xs py-1">
          <span className="text-stone-500">Automation</span>
          <span className="text-stone-900">{levelLabel}</span>
        </div>
        <div className="flex justify-between text-xs py-1">
          <span className="text-stone-500">Review gates</span>
          <span className="text-stone-900">{gateCount} active</span>
        </div>
      </div>

      {!activated ? (
        <button
          onClick={onActivate}
          className="text-sm text-white bg-stone-900 rounded px-4 py-2 hover:bg-stone-800 transition-colors duration-100"
        >
          Activate AI Agents
        </button>
      ) : (
        <motion.div {...fade} className="flex items-center gap-2 px-3 py-2 rounded bg-stone-50">
          <Check className="h-3.5 w-3.5 text-stone-600" />
          <span className="text-sm text-stone-900">AI agents configured for your project</span>
        </motion.div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step titles
// ---------------------------------------------------------------------------

const STEP_TITLES = [
  "What are you working on?",
  "Your AI team",
  "Automation level",
  "Review gates",
  "See it in action",
  "Connect to your project",
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AgentSetupWizard({ onSkip, onComplete }: { onSkip?: () => void; onComplete?: () => void }) {
  const [step, setStep] = useState(0);
  const [submissionType, setSubmissionType] = useState<SubmissionType | null>(null);
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(new Set());
  const [automationLevel, setAutomationLevel] = useState<AutomationLevel>("guided");
  const [gates, setGates] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    REVIEW_GATES.forEach((g) => {
      init[g.id] = g.defaultOn;
    });
    return init;
  });
  const [activated, setActivated] = useState(false);

  const totalSteps = STEP_TITLES.length;

  const handleSubmissionSelect = useCallback(
    (type: SubmissionType) => {
      setSubmissionType(type);
      const ids = AGENT_MAP[type] ?? [];
      setEnabledAgents(new Set(ids));
    },
    []
  );

  const toggleAgent = useCallback((id: string) => {
    setEnabledAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleGate = useCallback((id: string) => {
    setGates((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const canContinue = (): boolean => {
    if (step === 0) return submissionType !== null;
    if (step === 1) return enabledAgents.size > 0;
    return true;
  };

  const handleContinue = () => {
    if (step < totalSteps - 1) setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const handleActivate = () => {
    setActivated(true);
    onComplete?.();
  };

  const activeGateCount = Object.values(gates).filter(Boolean).length;

  return (
    <div className="bg-white w-full max-w-lg mx-auto py-8 px-6">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs text-stone-400 mb-1">Step {step + 1} of {totalSteps}</p>
        <AnimatePresence mode="wait">
          <motion.h2
            key={step}
            {...fade}
            className="text-lg font-medium text-stone-900"
          >
            {STEP_TITLES[step]}
          </motion.h2>
        </AnimatePresence>
      </div>

      {/* Content */}
      <div className="min-h-[320px]">
        <AnimatePresence mode="wait">
          <motion.div key={step} {...fade}>
            {step === 0 && (
              <StepSubmissionType
                selected={submissionType}
                onSelect={handleSubmissionSelect}
              />
            )}
            {step === 1 && submissionType && (
              <StepAgentTeam
                submissionType={submissionType}
                enabledAgents={enabledAgents}
                onToggle={toggleAgent}
              />
            )}
            {step === 2 && (
              <StepAutomation level={automationLevel} onSelect={setAutomationLevel} />
            )}
            {step === 3 && (
              <StepReviewGates gates={gates} onToggle={toggleGate} />
            )}
            {step === 4 && submissionType && (
              <StepDemo submissionType={submissionType} />
            )}
            {step === 5 && submissionType && (
              <StepConnect
                submissionType={submissionType}
                automationLevel={automationLevel}
                enabledAgentCount={enabledAgents.size}
                gateCount={activeGateCount}
                activated={activated}
                onActivate={handleActivate}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <div>
          {step > 0 ? (
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 transition-colors duration-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
          ) : (
            <span />
          )}
        </div>

        <ProgressDots current={step} total={totalSteps} />

        <div>
          {step < totalSteps - 1 && (
            <button
              onClick={handleContinue}
              disabled={!canContinue()}
              className={cn(
                "flex items-center gap-1 text-sm transition-colors duration-100",
                canContinue()
                  ? "text-blue-600 hover:text-blue-700"
                  : "text-stone-400 cursor-not-allowed"
              )}
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Skip */}
      <div className="mt-4 text-center">
        <button
          onClick={onSkip}
          className="text-xs text-stone-400 hover:text-stone-500 transition-colors duration-100"
        >
          Skip setup
        </button>
      </div>
    </div>
  );
}

export default AgentSetupWizard;
