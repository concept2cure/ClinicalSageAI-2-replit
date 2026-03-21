import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Sparkles,
  ArrowRight,
  Send,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIAction } from "../../hooks/useAIAction";
import type { AIActionResponse } from "../../hooks/useAIAction";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DrSagePanelProps {
  isOpen: boolean;
  onToggle: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenEnablementCenter?: () => void;
  contextProfile?: {
    productType?: string;
    userRole?: string;
    screenName?: string;
    activeProject?: string;
  };
}

interface TabDef {
  id: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS: TabDef[] = [
  { id: "help", label: "Help" },
  { id: "guide", label: "Guide" },
  { id: "doit", label: "Walk-through" },
  { id: "ana", label: "Ask AnA" },
  { id: "fix", label: "Fix" },
];

const FADE_IN = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_HELP_CONTEXT = {
  screenName: "Regulatory Intelligence Workspace",
  whatIs:
    "This is your central command centre for Regulatory Intelligence. It brings together regulatory data, submission timelines, and compliance artefacts across your active project portfolio into a single, coherent view.",
  whenToUse:
    "Come here when you need to review the regulatory landscape for a product, check submission readiness, or confirm that your RI artefacts are complete and correctly linked.",
  keyInputs: [
    "Product dossier metadata",
    "Regulatory authority requirements",
    "Submission timeline configurations",
    "Linked clinical evidence packages",
  ],
  expectedOutputs: [
    "Regulatory readiness score",
    "Gap analysis report",
    "Submission checklist with status",
    "Authority-specific requirement mapping",
  ],
  commonMistakes: [
    "Submitting without verifying cross-reference linkages",
    "Skipping the gap analysis before final review",
    "Not updating authority-specific templates after regulation changes",
  ],
  anaHelps: [
    "Auto-detects missing evidence linkages",
    "Scores submission readiness with rationale",
    "Compares against historical precedent submissions",
    "Generates authority-specific compliance checklists",
  ],
};

const MOCK_GUIDE_ACTIONS = [
  {
    title: "Complete the gap analysis",
    why: "3 critical evidence gaps were detected in Module 2.5. Resolving them now prevents a Refuse-to-File.",
  },
  {
    title: "Validate cross-reference linkages",
    why: "14 references in the clinical overview are unlinked. AnA 1.0 can auto-resolve 11 of them.",
  },
  {
    title: "Review the submission timeline",
    why: "Your target filing date is 42 days away. Two milestones are at risk of slipping.",
  },
  {
    title: "Generate the compliance checklist",
    why: "Authority-specific requirements for EMA have been updated since your last review.",
  },
  {
    title: "Inspect provenance trail",
    why: "Audit readiness requires full traceability. 2 artefacts lack provenance metadata.",
  },
];

const MOCK_WALKTHROUGH_STEPS = [
  {
    title: "Open the gap analysis panel",
    instruction:
      'Navigate to the Evidence tab and click "Run Gap Analysis" to identify missing linkages.',
    status: "done" as const,
  },
  {
    title: "Review detected gaps",
    instruction:
      "Examine each flagged gap. AnA 1.0 has pre-classified them by severity.",
    status: "active" as const,
  },
  {
    title: "Resolve critical gaps first",
    instruction:
      'For each critical gap, click "Resolve" to open the evidence linker. AnA 1.0 will suggest matching documents.',
    status: "pending" as const,
  },
  {
    title: "Validate resolution",
    instruction:
      "After linking evidence, run the validation check to confirm all critical gaps are resolved.",
    status: "pending" as const,
  },
  {
    title: "Export gap analysis report",
    instruction:
      'Click "Export" to generate the PDF report for your regulatory team.',
    status: "pending" as const,
  },
];

const MOCK_ANA_PROMPTS = [
  "Review the evidence basis",
  "Identify likely gaps",
  "Summarize submission risks",
  "Compare precedent patterns",
  "Explain why this output was recommended",
];

const MOCK_ISSUES = [
  {
    severity: "critical",
    title: "Missing metadata on 3 artefacts",
    description:
      "Module 2.7 clinical summary, Module 3.2.S.4.1 specifications, and Module 5.3.5.1 clinical study report are missing required metadata fields.",
    resolved: false,
  },
  {
    severity: "major",
    title: "Broken cross-reference linkage",
    description:
      "Reference #47 in the clinical overview points to a deprecated document version. The current version exists but is unlinked.",
    resolved: false,
  },
  {
    severity: "major",
    title: "Invalid placement in eCTD structure",
    description:
      "Two non-clinical documents are placed in the clinical module folder. They need to be relocated to Module 4.",
    resolved: true,
  },
  {
    severity: "minor",
    title: "Incomplete workflow approval",
    description:
      "The QA sign-off step was skipped for the stability report. The document can proceed, but the audit trail is incomplete.",
    resolved: false,
  },
];

// ---------------------------------------------------------------------------
// Section divider helper
// ---------------------------------------------------------------------------

function Section({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-6 px-5 border-t border-zinc-100 first:border-t-0 first:pt-2">
      {label && (
        <p className="text-xs font-medium text-zinc-900 mb-3">{label}</p>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content components
// ---------------------------------------------------------------------------

function HelpContent() {
  const ctx = MOCK_HELP_CONTEXT;

  return (
    <div>
      <div className="py-6 px-5">
        <p className="text-xs uppercase tracking-wider text-zinc-400 mb-2">
          Current Screen
        </p>
        <h3 className="text-sm font-semibold text-zinc-900 mb-3">
          {ctx.screenName}
        </h3>
        <p className="text-sm text-zinc-600 leading-relaxed mb-4">
          {ctx.whatIs}
        </p>
        <p className="text-sm text-zinc-600 leading-relaxed">{ctx.whenToUse}</p>
      </div>

      <Section label="Key inputs">
        <ul className="space-y-1.5">
          {ctx.keyInputs.map((item) => (
            <li key={item} className="text-sm text-zinc-600">
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <Section label="Expected outputs">
        <ul className="space-y-1.5">
          {ctx.expectedOutputs.map((item) => (
            <li key={item} className="text-sm text-zinc-600">
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <Section label="Common mistakes to avoid">
        <ul className="space-y-1.5">
          {ctx.commonMistakes.map((item) => (
            <li key={item} className="text-sm text-zinc-600">
              {item}
            </li>
          ))}
        </ul>
      </Section>

      <Section label="Where AnA 1.0 helps">
        <ul className="space-y-1.5">
          {ctx.anaHelps.map((item) => (
            <li key={item} className="text-sm text-zinc-600">
              {item}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function GuideContent() {
  return (
    <div className="py-6 px-5 space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wider text-zinc-400 mb-1">
          Suggested next step
        </p>
        <p className="text-sm font-semibold text-zinc-900">
          {MOCK_GUIDE_ACTIONS[0].title}
        </p>
        <p className="text-sm text-zinc-600 leading-relaxed mt-1">
          {MOCK_GUIDE_ACTIONS[0].why}
        </p>
      </div>

      <div className="border-t border-zinc-100 pt-4 space-y-0">
        {MOCK_GUIDE_ACTIONS.map((action, idx) => (
          <button
            key={action.title}
            className={cn(
              "w-full flex items-start justify-between gap-3 py-3 text-left",
              idx < MOCK_GUIDE_ACTIONS.length - 1 && "border-b border-zinc-50"
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900">
                {action.title}
              </p>
              <p className="text-sm text-zinc-500 mt-0.5 leading-relaxed">
                {action.why}
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-300 shrink-0 mt-0.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

function DoItContent() {
  return (
    <div className="py-6 px-5 space-y-4">
      <div>
        <p className="text-sm text-zinc-600 leading-relaxed">
          Follow along at your own pace. I will walk you through each step in
          real time.
        </p>
        <button className="text-sm text-blue-600 hover:underline mt-2">
          Begin walk-through
        </button>
      </div>

      <div className="border-t border-zinc-100 pt-4 space-y-3">
        {MOCK_WALKTHROUGH_STEPS.map((step, idx) => {
          const isDone = step.status === "done";
          const isActive = step.status === "active";
          const isPending = step.status === "pending";

          return (
            <div key={step.title} className="flex items-start gap-3">
              <span
                className={cn(
                  "text-sm tabular-nums shrink-0 w-5 text-right",
                  isDone && "text-zinc-400",
                  isActive && "font-medium text-zinc-900",
                  isPending && "text-zinc-300"
                )}
              >
                {isDone ? (
                  <Check className="h-4 w-4 text-zinc-400 inline" />
                ) : (
                  `${idx + 1}.`
                )}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm",
                    isDone && "text-zinc-400 line-through",
                    isActive && "font-medium text-zinc-900",
                    isPending && "text-zinc-400"
                  )}
                >
                  {step.title}
                </p>
                {isActive && (
                  <p className="text-sm text-zinc-500 mt-1 leading-relaxed">
                    {step.instruction}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnaContent() {
  const [query, setQuery] = useState("");

  return (
    <div className="py-6 px-5 space-y-4">
      <p className="text-sm text-zinc-600 leading-relaxed">
        AnA 1.0 understands your regulatory context, evidence base, and
        submission history. Ask anything about your current workspace.
      </p>

      <div className="space-y-2">
        {MOCK_ANA_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            onClick={() => setQuery(prompt)}
            className="block text-sm text-blue-600 hover:underline"
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="border-t border-zinc-100 pt-4 space-y-3">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask AnA 1.0 anything..."
          className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-300 resize-none h-20"
        />
        <div className="flex items-center justify-between">
          <button className="flex items-center gap-1.5 text-sm font-medium text-zinc-900 hover:text-zinc-600">
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
          <button className="text-sm text-zinc-400 hover:text-zinc-600">
            Open full workspace
          </button>
        </div>
      </div>
    </div>
  );
}

function FixContent() {
  const { execute, isLoading } = useAIAction();
  const [fixingIndex, setFixingIndex] = useState<number | null>(null);
  const [fixResults, setFixResults] = useState<Record<number, AIActionResponse | null>>({});

  const handleFix = async (issue: typeof MOCK_ISSUES[0], idx: number) => {
    setFixingIndex(idx);
    try {
      // Route through unified AI action system — run validation + refinement
      const result = await execute({
        actionType: 'run_validation',
        targetType: 'artifact',
        targetId: null,
        projectId: 0, // Will be populated from context in Phase 2
        sourceSurface: 'contextual_rail',
        payload: {
          content: issue.description,
          documentType: 'regulatory_submission',
          issueTitle: issue.title,
          severity: issue.severity,
        },
      });
      setFixResults(prev => ({ ...prev, [idx]: result }));
    } catch {
      // Non-fatal — show error state
      setFixResults(prev => ({ ...prev, [idx]: null }));
    } finally {
      setFixingIndex(null);
    }
  };

  return (
    <div className="py-6 px-5 space-y-4">
      <p className="text-sm text-zinc-600 leading-relaxed">
        I found a few issues in your current workspace that are worth
        addressing.
      </p>

      <div className="space-y-0">
        {MOCK_ISSUES.map((issue, idx) => (
          <div
            key={issue.title}
            className={cn(
              "py-4",
              idx < MOCK_ISSUES.length - 1 && "border-b border-zinc-100"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p
                    className={cn(
                      "text-sm",
                      issue.resolved || fixResults[idx]?.success
                        ? "text-zinc-400"
                        : issue.severity === "critical"
                          ? "font-semibold text-zinc-900"
                          : "font-medium text-zinc-900"
                    )}
                  >
                    {issue.title}
                  </p>
                  {(issue.resolved || fixResults[idx]?.success) && (
                    <Check className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  )}
                </div>
                <p className="text-xs uppercase tracking-wider text-zinc-400 mb-1">
                  {issue.severity}
                </p>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  {issue.description}
                </p>
                {!issue.resolved && !fixResults[idx]?.success && (
                  <button
                    onClick={() => handleFix(issue, idx)}
                    disabled={isLoading}
                    className="text-sm text-blue-600 hover:underline mt-2 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {fixingIndex === idx ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      'Fix this'
                    )}
                  </button>
                )}
                {fixResults[idx] && !fixResults[idx]?.success && (
                  <p className="text-xs text-amber-600 mt-1">
                    Could not auto-fix — {fixResults[idx]?.errors?.[0]?.message || 'review manually'}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DrSageButton
// ---------------------------------------------------------------------------

export function DrSageButton({
  onClick,
  isOpen,
}: {
  onClick: () => void;
  isOpen: boolean;
}) {
  if (isOpen) return null;

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className="fixed right-6 bottom-6 z-50 flex items-center justify-center h-12 w-12 rounded-full bg-zinc-900 text-white hover:bg-zinc-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
    >
      <Sparkles className="h-5 w-5" />
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// DrSagePanel
// ---------------------------------------------------------------------------

export function DrSagePanel({
  isOpen,
  onToggle,
  activeTab,
  onTabChange,
  onOpenEnablementCenter,
}: DrSagePanelProps) {
  function renderTabContent() {
    switch (activeTab) {
      case "help":
        return <HelpContent />;
      case "guide":
        return <GuideContent />;
      case "doit":
        return <DoItContent />;
      case "ana":
        return <AnaContent />;
      case "fix":
        return <FixContent />;
      default:
        return <HelpContent />;
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onToggle}
            className="fixed inset-0 z-40 bg-black/5"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-[400px] flex flex-col bg-white shadow-sm border-l border-zinc-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
              <h2 className="text-sm font-semibold text-zinc-900">Dr. Sage</h2>
              <button
                onClick={onToggle}
                className="h-6 w-6 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tab navigation */}
            <div className="px-5 border-b border-zinc-100 shrink-0 overflow-x-auto">
              <div className="flex gap-4 min-w-max">
                {TABS.map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id)}
                      className={cn(
                        "relative py-3 text-sm whitespace-nowrap transition-colors",
                        active
                          ? "text-zinc-900"
                          : "text-zinc-400 hover:text-zinc-600"
                      )}
                    >
                      {tab.label}
                      {active && (
                        <motion.div
                          layoutId="dr-sage-tab-indicator"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900"
                          transition={{ duration: 0.15 }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                <motion.div key={activeTab} {...FADE_IN}>
                  {renderTabContent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// DrSageGlobalLayer — self-contained wrapper
// ---------------------------------------------------------------------------

function DrSageGlobalLayer({
  onOpenEnablementCenter,
  contextProfile,
}: {
  onOpenEnablementCenter?: () => void;
  contextProfile?: DrSagePanelProps["contextProfile"];
} = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("help");

  const toggle = () => setIsOpen((prev) => !prev);

  return (
    <>
      <DrSageButton onClick={toggle} isOpen={isOpen} />
      <DrSagePanel
        isOpen={isOpen}
        onToggle={toggle}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenEnablementCenter={onOpenEnablementCenter}
        contextProfile={contextProfile}
      />
    </>
  );
}

export default DrSageGlobalLayer;
