import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Props ──────────────────────────────────────────────────────────────────

interface FirstRunExperienceProps {
  onComplete: (selectedRole?: string) => void;
  onSkip: () => void;
  /** Pass existing projects so onboarding adapts for returning users */
  existingProjects?: Array<{ id: string; name: string; type?: string }>;
  userName?: string;
}

// ─── Types ──────────────────────────────────────────────────────────────────

type SubmissionType =
  | '510k'
  | 'IND'
  | 'NDA_BLA'
  | 'PMA'
  | 'DeNovo'
  | 'CER_MDR'
  | 'MAA'
  | 'CTA';

type AutomationLevel = 'supervised' | 'guided' | 'autonomous';

interface Agent {
  id: string;
  name: string;
  description: string;
  phase: 'Planning' | 'Drafting' | 'Review' | 'Assembly' | 'Validation';
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TOTAL_SCREENS = 7;

const ROLES = [
  { id: 'regulatory-writer', title: 'Regulatory Writer', description: 'Author eCTD-ready documents with AI co-writing' },
  { id: 'regulatory-strategist', title: 'Strategist', description: 'Plan submissions and navigate agency interactions' },
  { id: 'quality-cmc', title: 'Quality/CMC Specialist', description: 'Manage quality systems and CMC documentation' },
  { id: 'clinical-operations', title: 'Clinical Operations', description: 'Coordinate trials, sites, and study execution' },
  { id: 'executive-overview', title: 'Executive Overview', description: 'Portfolio dashboards and strategic insights' },
];

const SUBMISSION_OPTIONS: { id: SubmissionType; label: string; description: string }[] = [
  { id: '510k', label: '510(k)', description: 'Premarket notification for moderate-risk devices' },
  { id: 'IND', label: 'IND', description: 'Investigational New Drug application' },
  { id: 'NDA_BLA', label: 'NDA/BLA', description: 'New Drug or Biologics License Application' },
  { id: 'PMA', label: 'PMA', description: 'Premarket Approval for high-risk devices' },
  { id: 'DeNovo', label: 'De Novo', description: 'Novel low-to-moderate risk device classification' },
  { id: 'CER_MDR', label: 'CER/MDR', description: 'Clinical Evaluation Report under EU MDR' },
  { id: 'MAA', label: 'MAA', description: 'Marketing Authorization Application (EMA)' },
  { id: 'CTA', label: 'CTA', description: 'Clinical Trial Application' },
];

const ALL_AGENTS: Agent[] = [
  { id: 'predicate', name: 'Predicate Researcher', description: 'Identifies and analyzes predicate devices from FDA databases', phase: 'Planning' },
  { id: 'evidence', name: 'Evidence Agent', description: 'Gathers clinical evidence and literature references', phase: 'Planning' },
  { id: 'protocol', name: 'Protocol Analyzer', description: 'Reviews and validates clinical trial protocols', phase: 'Planning' },
  { id: 'researcher', name: 'Researcher', description: 'Performs literature searches and evidence synthesis', phase: 'Planning' },
  { id: 'drafter', name: 'Drafter', description: 'Generates regulatory document sections from structured data', phase: 'Drafting' },
  { id: 'statistician', name: 'Statistician', description: 'Validates statistical methods and analyzes clinical data', phase: 'Drafting' },
  { id: 'translator', name: 'Translator', description: 'Adapts documents for regional regulatory requirements', phase: 'Drafting' },
  { id: 'se_matrix', name: 'SE Matrix Reviewer', description: 'Evaluates substantial equivalence comparisons', phase: 'Review' },
  { id: 'qc_agent', name: 'QC Agent', description: 'Performs quality checks on document completeness and accuracy', phase: 'Review' },
  { id: 'reviewer', name: 'Reviewer', description: 'Simulates FDA-style review of the submission package', phase: 'Review' },
  { id: 'compliance', name: 'Compliance Agent', description: 'Checks regulatory compliance across all applicable guidelines', phase: 'Validation' },
  { id: 'compliance_eu', name: 'Compliance Agent (EU)', description: 'Validates compliance with EU MDR and MEDDEV guidance', phase: 'Validation' },
  { id: 'compiler', name: 'Compiler', description: 'Assembles final eCTD-compliant submission packages', phase: 'Assembly' },
];

const AGENT_MAP: Record<SubmissionType, string[]> = {
  '510k': ['predicate', 'evidence', 'drafter', 'se_matrix', 'compliance', 'compiler'],
  IND: ['protocol', 'drafter', 'statistician', 'qc_agent', 'compliance', 'compiler'],
  NDA_BLA: ALL_AGENTS.map((a) => a.id),
  PMA: ALL_AGENTS.map((a) => a.id),
  DeNovo: ['predicate', 'evidence', 'drafter', 'compliance', 'compiler'],
  CER_MDR: ['researcher', 'drafter', 'compliance_eu', 'translator'],
  MAA: ['researcher', 'drafter', 'statistician', 'compliance', 'compiler'],
  CTA: ['protocol', 'drafter', 'statistician', 'compliance', 'compiler'],
};

const AUTOMATION_LEVELS: { id: AutomationLevel; label: string; description: string }[] = [
  { id: 'supervised', label: 'Supervised', description: 'Agents suggest, you approve every step' },
  { id: 'guided', label: 'Guided', description: 'Agents handle routine tasks, pause for critical decisions' },
  { id: 'autonomous', label: 'Autonomous', description: 'Agents handle the full workflow end-to-end' },
];

const PHASE_ORDER = ['Planning', 'Drafting', 'Review', 'Assembly', 'Validation'] as const;

// ─── Animation ──────────────────────────────────────────────────────────────

const fadeUp = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};

// ─── Progress Dots ──────────────────────────────────────────────────────────

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full transition-colors ${
            i === current ? 'bg-zinc-900' : 'bg-zinc-200'
          }`}
        />
      ))}
    </div>
  );
}

// ─── Screen 0: Welcome ──────────────────────────────────────────────────────

function WelcomeScreen({ userName, projectCount }: { userName?: string; projectCount?: number }) {
  const hasProjects = (projectCount ?? 0) > 0;
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <h1 className="text-3xl font-semibold text-zinc-900">
        {userName ? `Welcome back, ${userName}` : 'Welcome to Concept2Cure'}
      </h1>
      <p className="text-base text-zinc-500 mt-3">
        {hasProjects
          ? `You have ${projectCount} active project${projectCount !== 1 ? 's' : ''}. Let's set up your AI assistants to work even smarter.`
          : 'One platform. Two intelligent systems. Your entire regulatory workflow.'}
      </p>
    </div>
  );
}

// ─── Screen 1: Dr. Sage ─────────────────────────────────────────────────────

function DrSageScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6">
        <span className="text-2xl">&#x1F9D1;&#x200D;&#x2695;&#xFE0F;</span>
      </div>
      <h2 className="text-3xl font-semibold text-zinc-900">Meet Dr. Sage</h2>
      <p className="text-base text-zinc-500 max-w-md leading-relaxed mt-4">
        Your guide, trainer, and workflow operator. Dr. Sage helps you navigate the
        platform, learn best practices, and execute tasks with confidence.
      </p>
      <div className="mt-6 max-w-md text-left space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-emerald-500 mt-0.5">&#x2713;</span>
          <p className="text-sm text-zinc-600">Contextual help wherever you are — just look for the guide icon</p>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-emerald-500 mt-0.5">&#x2713;</span>
          <p className="text-sm text-zinc-600">Guided walkthroughs and platform training built right in</p>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-emerald-500 mt-0.5">&#x2713;</span>
          <p className="text-sm text-zinc-600">Safe, auditable corrections and compliance checks</p>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 2: AnA 1.0 ─────────────────────────────────────────────────────

function AnAScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-6">
        <span className="text-2xl">&#x2728;</span>
      </div>
      <h2 className="text-3xl font-semibold text-zinc-900">Meet AnA</h2>
      <p className="text-base text-zinc-500 max-w-md leading-relaxed mt-4">
        Your Regulatory Intelligence Copilot — always available at the bottom of every page.
        AnA is context-aware: it knows which workspace you're in and adapts its guidance.
      </p>
      <div className="mt-6 max-w-md text-left space-y-3">
        <div className="flex items-start gap-3">
          <span className="text-violet-500 mt-0.5">&#x2713;</span>
          <p className="text-sm text-zinc-600">Always visible at the bottom — type a question from any page</p>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-violet-500 mt-0.5">&#x2713;</span>
          <p className="text-sm text-zinc-600">Context-aware: knows your project, workspace, and submission type</p>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-violet-500 mt-0.5">&#x2713;</span>
          <p className="text-sm text-zinc-600">Evidence analysis, gap detection, and precedent intelligence</p>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 3: Choose Your Role ─────────────────────────────────────────────

function ChooseRoleScreen({
  selectedRole,
  onSelect,
}: {
  selectedRole: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <h2 className="text-3xl font-semibold text-zinc-900 mb-2">Choose your role</h2>
      <p className="text-base text-zinc-500 mb-8">
        Select your primary role to personalize your experience
      </p>
      <div className="max-w-md w-full space-y-1">
        {ROLES.map((role) => {
          const selected = selectedRole === role.id;
          return (
            <button
              key={role.id}
              onClick={() => onSelect(role.id)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                selected ? 'bg-zinc-50' : 'hover:bg-zinc-50'
              }`}
            >
              <p className={`text-sm font-medium ${selected ? 'text-zinc-900' : 'text-zinc-700'}`}>
                {role.title}
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">{role.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Screen 4: Select Submission Type ───────────────────────────────────────

function SubmissionTypeScreen({
  selected,
  onSelect,
}: {
  selected: SubmissionType | null;
  onSelect: (t: SubmissionType) => void;
}) {
  const count = selected ? (AGENT_MAP[selected]?.length ?? 0) : 0;

  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <h2 className="text-3xl font-semibold text-zinc-900 mb-2">What are you working on?</h2>
      <p className="text-base text-zinc-500 mb-8">Select your submission type</p>
      <div className="max-w-md w-full space-y-1">
        {SUBMISSION_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className={`w-full text-left px-4 py-2.5 rounded-lg transition-colors ${
              selected === opt.id
                ? 'bg-zinc-50 border-l-2 border-zinc-900'
                : 'border-l-2 border-transparent hover:bg-zinc-50'
            }`}
          >
            <span className="text-sm font-medium text-zinc-900">{opt.label}</span>
            <p className="text-xs text-zinc-500 mt-0.5">{opt.description}</p>
          </button>
        ))}
      </div>
      {selected && (
        <p className="text-xs text-zinc-400 mt-4">
          {count} agents available for this pathway
        </p>
      )}
    </div>
  );
}

// ─── Screen 5: Your AI Team + Automation Level ──────────────────────────────

function AgentTeamScreen({
  submissionType,
  enabledAgents,
  onToggleAgent,
  automationLevel,
  onSelectAutomation,
}: {
  submissionType: SubmissionType;
  enabledAgents: Set<string>;
  onToggleAgent: (id: string) => void;
  automationLevel: AutomationLevel;
  onSelectAutomation: (l: AutomationLevel) => void;
}) {
  const relevantIds = AGENT_MAP[submissionType] ?? [];
  const relevant = ALL_AGENTS.filter((a) => relevantIds.includes(a.id));
  const grouped = PHASE_ORDER.map((phase) => ({
    phase,
    agents: relevant.filter((a) => a.phase === phase),
  })).filter((g) => g.agents.length > 0);

  return (
    <div className="flex flex-col items-center h-full px-8 pt-12 overflow-y-auto">
      <h2 className="text-3xl font-semibold text-zinc-900 mb-2">Your AI team</h2>
      <p className="text-base text-zinc-500 mb-6">
        {enabledAgents.size} agents configured by phase
      </p>

      <div className="max-w-lg w-full space-y-5">
        {grouped.map((group) => (
          <div key={group.phase}>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
              {group.phase}
            </p>
            <div className="space-y-1">
              {group.agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => onToggleAgent(agent.id)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-zinc-50 transition-colors"
                >
                  <div className="text-left">
                    <span className="text-sm text-zinc-900">{agent.name}</span>
                    <p className="text-xs text-zinc-500">{agent.description}</p>
                  </div>
                  <span
                    className={`flex-shrink-0 ml-3 h-4 w-7 rounded-full transition-colors relative ${
                      enabledAgents.has(agent.id) ? 'bg-zinc-900' : 'bg-zinc-200'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                        enabledAgents.has(agent.id) ? 'translate-x-3.5' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="border-t border-zinc-100 pt-5">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
            Automation level
          </p>
          <div className="space-y-1">
            {AUTOMATION_LEVELS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => onSelectAutomation(opt.id)}
                className={`w-full text-left px-3 py-3 rounded transition-colors ${
                  automationLevel === opt.id
                    ? 'bg-zinc-50 border-l-2 border-zinc-900'
                    : 'border-l-2 border-transparent hover:bg-zinc-50'
                }`}
              >
                <span className="text-sm font-medium text-zinc-900">{opt.label}</span>
                {automationLevel === opt.id && opt.id === 'guided' && (
                  <span className="ml-2 text-xs text-zinc-400">Recommended</span>
                )}
                <p className="text-xs text-zinc-500 mt-0.5">{opt.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Screen 6: Ready to Go ──────────────────────────────────────────────────

function ReadyScreen({
  selectedRole,
  submissionType,
  enabledAgentCount,
  automationLevel,
  onLaunch,
}: {
  selectedRole: string | null;
  submissionType: SubmissionType | null;
  enabledAgentCount: number;
  automationLevel: AutomationLevel;
  onLaunch: () => void;
}) {
  const roleLabel = ROLES.find((r) => r.id === selectedRole)?.title ?? 'Not selected';
  const subLabel = SUBMISSION_OPTIONS.find((o) => o.id === submissionType)?.label ?? 'Not selected';
  const autoLabel = AUTOMATION_LEVELS.find((l) => l.id === automationLevel)?.label ?? automationLevel;

  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <h2 className="text-3xl font-semibold text-zinc-900 mb-2">Ready to go</h2>
      <p className="text-base text-zinc-500 mb-8">
        35 AI agents configured for your {subLabel} workflow.
      </p>

      <div className="max-w-sm w-full space-y-1 mb-8">
        <div className="flex justify-between px-3 py-2 text-sm">
          <span className="text-zinc-500">Role</span>
          <span className="text-zinc-900">{roleLabel}</span>
        </div>
        <div className="flex justify-between px-3 py-2 text-sm">
          <span className="text-zinc-500">Submission type</span>
          <span className="text-zinc-900">{subLabel}</span>
        </div>
        <div className="flex justify-between px-3 py-2 text-sm">
          <span className="text-zinc-500">Active agents</span>
          <span className="text-zinc-900">{enabledAgentCount}</span>
        </div>
        <div className="flex justify-between px-3 py-2 text-sm">
          <span className="text-zinc-500">Automation</span>
          <span className="text-zinc-900">{autoLabel}</span>
        </div>
      </div>

      <button
        onClick={onLaunch}
        className="text-sm font-medium text-blue-600 hover:underline transition-colors"
      >
        Launch Concept2Cure
      </button>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function FirstRunExperience({ onComplete, onSkip, existingProjects, userName }: FirstRunExperienceProps) {
  const [screen, setScreen] = useState(0);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [submissionType, setSubmissionType] = useState<SubmissionType | null>(null);
  const [enabledAgents, setEnabledAgents] = useState<Set<string>>(new Set());
  const [automationLevel, setAutomationLevel] = useState<AutomationLevel>('guided');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-advance for intro screens only (0-2)
  useEffect(() => {
    if (screen > 2) return;
    timerRef.current = setTimeout(() => setScreen((s) => s + 1), 6000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [screen]);

  const handleSubmissionSelect = useCallback((type: SubmissionType) => {
    setSubmissionType(type);
    setEnabledAgents(new Set(AGENT_MAP[type] ?? []));
  }, []);

  const toggleAgent = useCallback((id: string) => {
    setEnabledAgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const canContinue = useCallback((): boolean => {
    if (screen === 3) return selectedRole !== null;
    if (screen === 4) return submissionType !== null;
    if (screen === 5) return enabledAgents.size > 0;
    return true;
  }, [screen, selectedRole, submissionType, enabledAgents.size]);

  const goNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (screen < TOTAL_SCREENS - 1 && canContinue()) setScreen((s) => s + 1);
  }, [screen, canContinue]);

  const goPrev = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (screen > 0) setScreen((s) => s - 1);
  }, [screen]);

  const handleComplete = useCallback(() => {
    localStorage.setItem('concept2cure_first_run_complete', 'true');
    onComplete(selectedRole ?? undefined);
  }, [onComplete, selectedRole]);

  const handleSkip = useCallback(() => {
    localStorage.setItem('concept2cure_first_run_complete', 'true');
    onSkip();
  }, [onSkip]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') handleSkip();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, handleSkip]);

  const screens = [
    <WelcomeScreen key="welcome" userName={userName} projectCount={existingProjects?.length} />,
    <DrSageScreen key="sage" />,
    <AnAScreen key="ana" />,
    <ChooseRoleScreen key="role" selectedRole={selectedRole} onSelect={setSelectedRole} />,
    <SubmissionTypeScreen key="submission" selected={submissionType} onSelect={handleSubmissionSelect} />,
    submissionType ? (
      <AgentTeamScreen
        key="team"
        submissionType={submissionType}
        enabledAgents={enabledAgents}
        onToggleAgent={toggleAgent}
        automationLevel={automationLevel}
        onSelectAutomation={setAutomationLevel}
      />
    ) : null,
    <ReadyScreen
      key="ready"
      selectedRole={selectedRole}
      submissionType={submissionType}
      enabledAgentCount={enabledAgents.size}
      automationLevel={automationLevel}
      onLaunch={handleComplete}
    />,
  ];

  const isLastScreen = screen === TOTAL_SCREENS - 1;

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-white flex flex-col"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Screen content */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            className="absolute inset-0"
            {...fadeUp}
          >
            {screens[screen]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between px-8 pb-8 pt-4">
        <div className="flex items-center gap-4">
          {screen > 0 && (
            <button
              onClick={goPrev}
              className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              &larr; Back
            </button>
          )}
        </div>

        <ProgressDots current={screen} total={TOTAL_SCREENS} />

        <div className="flex items-center gap-6">
          <button
            onClick={handleSkip}
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            Skip
          </button>
          {!isLastScreen && (
            <button
              onClick={goNext}
              disabled={!canContinue()}
              className={`text-sm font-medium transition-colors ${
                canContinue()
                  ? 'text-zinc-900 hover:underline'
                  : 'text-zinc-300 cursor-not-allowed'
              }`}
            >
              Continue &rarr;
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
