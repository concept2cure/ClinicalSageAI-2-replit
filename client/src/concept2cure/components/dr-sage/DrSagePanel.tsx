import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  X,
  HelpCircle,
  Compass,
  Users,
  Wrench,
  BookOpen,
  Sparkles,
  ChevronRight,
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  ArrowRight,
  Send,
  ExternalLink,
  Eye,
  GitCompare,
  FileSearch,
  FolderInput,
  Zap,
  GraduationCap,
  Award,
  Library,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  icon: React.ElementType;
  color: string;
  activeClasses: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS: TabDef[] = [
  {
    id: "help",
    label: "Help",
    icon: HelpCircle,
    color: "blue",
    activeClasses: "bg-blue-100 text-blue-700 ring-blue-300",
  },
  {
    id: "guide",
    label: "Guide Me",
    icon: Compass,
    color: "green",
    activeClasses: "bg-green-100 text-green-700 ring-green-300",
  },
  {
    id: "doit",
    label: "Do It With Me",
    icon: Users,
    color: "purple",
    activeClasses: "bg-purple-100 text-purple-700 ring-purple-300",
  },
  {
    id: "ana",
    label: "Ask AnA 1.0",
    icon: Brain,
    color: "indigo",
    activeClasses: "bg-indigo-100 text-indigo-700 ring-indigo-400",
  },
  {
    id: "fix",
    label: "Fix This",
    icon: Wrench,
    color: "amber",
    activeClasses: "bg-amber-100 text-amber-700 ring-amber-300",
  },
  {
    id: "learn",
    label: "Learn",
    icon: BookOpen,
    color: "teal",
    activeClasses: "bg-teal-100 text-teal-700 ring-teal-300",
  },
  {
    id: "whatelse",
    label: "What Else?",
    icon: Sparkles,
    color: "rose",
    activeClasses: "bg-rose-100 text-rose-700 ring-rose-300",
  },
];

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_HELP_CONTEXT = {
  screenName: "Regulatory Intelligence Workspace",
  whatIs:
    "This screen is the central command centre for your Regulatory Intelligence (RI) workspace. It aggregates regulatory data, submission timelines, and compliance artefacts across your active project portfolio.",
  whenToUse:
    "Use this screen when you need to review the regulatory landscape for a product, inspect submission readiness, or validate that your RI artefacts are complete and correctly linked.",
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
    time: "~12 min",
    icon: AlertTriangle,
  },
  {
    title: "Validate cross-reference linkages",
    why: "14 references in the clinical overview are unlinked. AnA 1.0 can auto-resolve 11 of them.",
    time: "~5 min",
    icon: FileSearch,
  },
  {
    title: "Review the submission timeline",
    why: "Your target filing date is 42 days away. Two milestones are at risk of slipping.",
    time: "~8 min",
    icon: Clock,
  },
  {
    title: "Generate the compliance checklist",
    why: "Authority-specific requirements for EMA have been updated since your last review.",
    time: "~3 min",
    icon: CheckCircle2,
  },
  {
    title: "Inspect provenance trail",
    why: "Audit readiness requires full traceability. 2 artefacts lack provenance metadata.",
    time: "~6 min",
    icon: Eye,
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
      "Examine each flagged gap. AnA 1.0 has pre-classified them by severity (critical, major, minor).",
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
  { text: "Review the evidence basis", icon: FileSearch },
  { text: "Identify likely gaps", icon: AlertTriangle },
  { text: "Summarize submission risks", icon: AlertCircle },
  { text: "Compare precedent patterns", icon: GitCompare },
  { text: "Explain why this output was recommended", icon: Info },
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

const MOCK_DISCOVERY_CARDS = [
  {
    icon: Brain,
    title: "Generate deeper RI insight with AnA 1.0",
    description:
      "Ask AnA 1.0 to perform a comprehensive regulatory intelligence scan across your entire submission package.",
  },
  {
    icon: Eye,
    title: "Inspect provenance",
    description:
      "Trace the full lineage of any artefact from source data through every transformation to final output.",
  },
  {
    icon: FolderInput,
    title: "Place into dossier",
    description:
      "Directly place validated artefacts into the correct eCTD module with auto-classification.",
  },
  {
    icon: GitCompare,
    title: "Compare versions",
    description:
      "Side-by-side diff of any two document versions with AI-highlighted semantic changes.",
  },
  {
    icon: Zap,
    title: "Run automated QC checks",
    description:
      "Execute the full quality control suite against your submission package to catch issues before filing.",
  },
];

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function severityBadge(severity: string) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    major: "bg-amber-100 text-amber-700 border-amber-200",
    minor: "bg-blue-100 text-blue-700 border-blue-200",
  };
  return map[severity] ?? map.minor;
}

// ---------------------------------------------------------------------------
// Tab content components
// ---------------------------------------------------------------------------

function HelpContent() {
  const ctx = MOCK_HELP_CONTEXT;
  const sections: { label: string; items?: string[]; text?: string }[] = [
    { label: "What is this screen?", text: ctx.whatIs },
    { label: "When to use it", text: ctx.whenToUse },
    { label: "Key inputs", items: ctx.keyInputs },
    { label: "Expected outputs", items: ctx.expectedOutputs },
    { label: "Common mistakes", items: ctx.commonMistakes },
    { label: "Where AnA 1.0 helps", items: ctx.anaHelps },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <HelpCircle className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-semibold text-zinc-800">
          {ctx.screenName}
        </span>
      </div>
      {sections.map((s) => (
        <Card
          key={s.label}
          className="border border-zinc-100 shadow-sm bg-white"
        >
          <CardHeader className="py-2.5 px-3.5">
            <CardTitle className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              {s.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3.5 pb-3 pt-0">
            {s.text && (
              <p className="text-sm text-zinc-700 leading-relaxed">{s.text}</p>
            )}
            {s.items && (
              <ul className="space-y-1.5">
                {s.items.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 text-sm text-zinc-700"
                  >
                    <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-blue-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function GuideContent() {
  return (
    <div className="space-y-3">
      {/* Next Best Action hero */}
      <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Compass className="h-4 w-4 text-green-600" />
            <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
              Next Best Action
            </span>
          </div>
          <p className="text-sm font-semibold text-zinc-800 mb-1">
            {MOCK_GUIDE_ACTIONS[0].title}
          </p>
          <p className="text-xs text-zinc-600 leading-relaxed">
            {MOCK_GUIDE_ACTIONS[0].why}
          </p>
        </CardContent>
      </Card>

      {/* Action list */}
      {MOCK_GUIDE_ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Card
            key={action.title}
            className="border border-zinc-100 shadow-sm hover:border-green-200 transition-colors bg-white"
          >
            <CardContent className="p-3.5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-green-100 p-2 shrink-0">
                  <Icon className="h-4 w-4 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-800">
                    {action.title}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    {action.why}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="flex items-center gap-1 text-xs text-zinc-400">
                      <Clock className="h-3 w-3" />
                      {action.time}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-green-700 hover:bg-green-50"
                    >
                      Start <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function DoItContent() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-purple-600" />
        <span className="text-sm font-semibold text-zinc-800">
          Let&apos;s do this together
        </span>
      </div>
      <p className="text-xs text-zinc-500 -mt-2">
        Dr. Sage will walk you through each step in real time. Follow along at
        your own pace.
      </p>

      {/* Steps */}
      <div className="space-y-2.5">
        {MOCK_WALKTHROUGH_STEPS.map((step, idx) => {
          const isActive = step.status === "active";
          const isDone = step.status === "done";
          return (
            <div
              key={step.title}
              className={cn(
                "rounded-lg border p-3 transition-all",
                isActive
                  ? "border-blue-400 bg-blue-50/60 shadow-sm"
                  : isDone
                    ? "border-green-200 bg-green-50/40"
                    : "border-zinc-100 bg-white"
              )}
            >
              <div className="flex items-start gap-3">
                {/* Number / check */}
                <div
                  className={cn(
                    "flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold shrink-0",
                    isDone
                      ? "bg-green-500 text-white"
                      : isActive
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-200 text-zinc-500"
                  )}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    idx + 1
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      isDone ? "text-green-700" : "text-zinc-800"
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    {step.instruction}
                  </p>
                  {isActive && (
                    <Badge
                      variant="secondary"
                      className="mt-1.5 bg-blue-100 text-blue-700 text-[10px]"
                    >
                      Current step
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">
        <Play className="h-4 w-4 mr-2" />
        Start Guided Walkthrough
      </Button>
    </div>
  );
}

function AnaContent() {
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-4 relative">
      {/* Animated gradient border wrapper */}
      <div className="absolute -inset-px rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500 opacity-20 blur-sm animate-pulse pointer-events-none" />

      {/* Premium header */}
      <div className="relative rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 p-2 shadow-md">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
              AnA 1.0 — RI Copilot
            </p>
            <p className="text-[10px] text-zinc-400">
              Your regulatory intelligence co-pilot
            </p>
          </div>
        </div>
        <p className="text-xs text-zinc-600 leading-relaxed">
          AnA 1.0 understands your regulatory context, evidence base, and
          submission history. Ask anything about your current workspace.
        </p>
      </div>

      {/* Suggested prompts */}
      <div>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
          What can AnA 1.0 help with here?
        </p>
        <div className="space-y-2">
          {MOCK_ANA_PROMPTS.map((prompt) => {
            const Icon = prompt.icon;
            return (
              <button
                key={prompt.text}
                onClick={() => setQuery(prompt.text)}
                className="w-full flex items-center gap-3 rounded-lg border border-zinc-100 bg-white p-3 text-left hover:border-indigo-200 hover:bg-indigo-50/50 transition-all group"
              >
                <Icon className="h-4 w-4 text-indigo-400 group-hover:text-indigo-600 shrink-0 transition-colors" />
                <span className="text-sm text-zinc-700 group-hover:text-indigo-700 transition-colors">
                  {prompt.text}
                </span>
                <ArrowRight className="h-3.5 w-3.5 ml-auto text-zinc-300 group-hover:text-indigo-400 transition-colors" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Input */}
      <div className="space-y-2">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask AnA 1.0 anything about this workspace..."
          className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 resize-none h-20"
        />
        <div className="flex items-center gap-2">
          <Button className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md">
            <Send className="h-4 w-4 mr-2" />
            Send to AnA 1.0
          </Button>
        </div>
        <button className="w-full flex items-center justify-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 transition-colors py-1.5">
          <ExternalLink className="h-3 w-3" />
          Open Full AnA 1.0 Workspace
        </button>
      </div>
    </div>
  );
}

function FixContent() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Wrench className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-semibold text-zinc-800">
          Operational Diagnosis
        </span>
      </div>
      <p className="text-xs text-zinc-500">
        Dr. Sage detected the following issues in your current workspace.
      </p>

      {MOCK_ISSUES.map((issue) => (
        <Card
          key={issue.title}
          className={cn(
            "border shadow-sm",
            issue.resolved
              ? "border-green-200 bg-green-50/40"
              : "border-zinc-100 bg-white"
          )}
        >
          <CardContent className="p-3.5">
            <div className="flex items-start gap-3">
              <div className="shrink-0 mt-0.5">
                {issue.resolved ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle
                    className={cn(
                      "h-4 w-4",
                      issue.severity === "critical"
                        ? "text-red-500"
                        : issue.severity === "major"
                          ? "text-amber-500"
                          : "text-blue-500"
                    )}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] capitalize",
                      severityBadge(issue.severity)
                    )}
                  >
                    {issue.severity}
                  </Badge>
                  {issue.resolved && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-green-100 text-green-700"
                    >
                      Resolved
                    </Badge>
                  )}
                </div>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    issue.resolved ? "text-green-700" : "text-zinc-800"
                  )}
                >
                  {issue.title}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                  {issue.description}
                </p>
                {!issue.resolved && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                  >
                    Fix Now
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LearnContent({
  onOpenEnablementCenter,
}: {
  onOpenEnablementCenter?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-teal-600" />
        <span className="text-sm font-semibold text-zinc-800">
          Continue Your Learning Journey
        </span>
      </div>

      {/* Progress */}
      <Card className="border border-teal-200 bg-gradient-to-br from-teal-50 to-cyan-50 shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-teal-700 mb-2">
            Regulatory Intelligence Fundamentals
          </p>
          <div className="w-full h-2 rounded-full bg-teal-200">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500"
              style={{ width: "62%" }}
            />
          </div>
          <p className="text-[10px] text-teal-600 mt-1">62% complete</p>
        </CardContent>
      </Card>

      {/* Next module */}
      <Card className="border border-zinc-100 shadow-sm bg-white">
        <CardContent className="p-3.5">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
            Next Recommended Module
          </p>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-teal-100 p-2 shrink-0">
              <GraduationCap className="h-4 w-4 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-800">
                Advanced Gap Analysis Techniques
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Learn how to leverage AnA 1.0 for automated gap detection and
                resolution workflows.
              </p>
              <Badge
                variant="secondary"
                className="mt-1.5 text-[10px] bg-teal-100 text-teal-700"
              >
                ~20 min
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          Quick Links
        </p>
        {[
          { icon: Compass, label: "Learning Paths" },
          { icon: Award, label: "Certifications" },
          { icon: Library, label: "All Modules" },
        ].map((link) => {
          const Icon = link.icon;
          return (
            <button
              key={link.label}
              className="w-full flex items-center gap-3 rounded-lg border border-zinc-100 bg-white p-2.5 text-left hover:border-teal-200 hover:bg-teal-50/50 transition-all"
            >
              <Icon className="h-4 w-4 text-teal-500" />
              <span className="text-sm text-zinc-700">{link.label}</span>
              <ChevronRight className="h-3.5 w-3.5 ml-auto text-zinc-300" />
            </button>
          );
        })}
      </div>

      <Button
        onClick={onOpenEnablementCenter}
        className="w-full bg-teal-600 hover:bg-teal-700 text-white"
      >
        <ExternalLink className="h-4 w-4 mr-2" />
        Open Enablement Center
      </Button>
    </div>
  );
}

function WhatElseContent() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-rose-500" />
        <span className="text-sm font-semibold text-zinc-800">
          Discover More
        </span>
      </div>
      <p className="text-xs text-zinc-500">
        Based on your current context, here are capabilities you might find
        useful.
      </p>

      <div className="space-y-2.5">
        {MOCK_DISCOVERY_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.title}
              className="border border-zinc-100 shadow-sm hover:border-rose-200 hover:shadow-md transition-all bg-white group cursor-pointer"
            >
              <CardContent className="p-3.5">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-rose-100 p-2 shrink-0 group-hover:bg-rose-200 transition-colors">
                    <Icon className="h-4 w-4 text-rose-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-800 group-hover:text-rose-700 transition-colors">
                      {card.title}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                      {card.description}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-rose-600 hover:bg-rose-50 mt-1.5 p-0"
                    >
                      Try This <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50/50 p-4 text-center">
        <p className="text-xs text-zinc-500 mb-2">
          This is just the beginning.
        </p>
        <Button
          variant="outline"
          className="border-rose-300 text-rose-700 hover:bg-rose-100"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Explore the Full Platform
        </Button>
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
  const [hovered, setHovered] = useState(false);

  return (
    <motion.button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg hover:shadow-xl transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
        isOpen ? "px-4 py-3" : "p-4"
      )}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      {/* Pulse ring when closed */}
      {!isOpen && (
        <span className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-600 to-violet-600 animate-ping opacity-20" />
      )}
      <Brain className="h-5 w-5 relative" />
      <AnimatePresence>
        {hovered && !isOpen && (
          <motion.span
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-sm font-medium whitespace-nowrap overflow-hidden"
          >
            Dr. Sage
          </motion.span>
        )}
      </AnimatePresence>
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
      case "learn":
        return (
          <LearnContent onOpenEnablementCenter={onOpenEnablementCenter} />
        );
      case "whatelse":
        return <WhatElseContent />;
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
            transition={{ duration: 0.2 }}
            onClick={onToggle}
            className="fixed inset-0 z-40 bg-black/10 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-[420px] flex flex-col bg-white/95 backdrop-blur-xl shadow-2xl border-l border-zinc-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 p-2 shadow-md">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600">
                    Dr. Sage
                  </h2>
                  <Badge
                    variant="secondary"
                    className="text-[9px] bg-zinc-100 text-zinc-500 px-1.5 py-0"
                  >
                    Powered by AnA 1.0
                  </Badge>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggle}
                className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-700"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Tab navigation */}
            <div className="px-4 py-3 border-b border-zinc-100 shrink-0 overflow-x-auto">
              <div className="flex gap-1.5 min-w-max">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap",
                        active
                          ? cn(tab.activeClasses, "ring-1")
                          : "text-zinc-500 hover:bg-zinc-100",
                        tab.id === "ana" &&
                          !active &&
                          "ring-1 ring-indigo-200 text-indigo-500 bg-indigo-50/50"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
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
