import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  CheckCircle2,
  Clock,
  Sparkles,
  Brain,
  Bot,
  ChevronRight,
  X,
  HelpCircle,
  Trophy,
  Star,
  Zap,
  Target,
  Search,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MissionStep {
  title: string;
  instruction: string;
  tip?: string;
}

export interface MicroMission {
  id: string;
  title: string;
  description: string;
  difficulty: 'quick-win' | 'challenge' | 'deep-dive';
  aiMode: 'dr-sage' | 'ana' | 'both';
  estimatedSeconds: number;
  skills: string[];
  steps: MissionStep[];
  category: string;
}

export interface MissionCardProps {
  mission: MicroMission;
  completed?: boolean;
  completionTime?: number;
  onStart: () => void;
}

export interface MissionRunnerProps {
  mission: MicroMission;
  onComplete: (timeSeconds: number) => void;
  onCancel: () => void;
}

export interface MissionBrowserProps {
  onStartMission: (missionId: string) => void;
  completedMissions?: Record<string, number>;
  userRole?: string;
  className?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DIFFICULTY_CONFIG = {
  'quick-win': { label: 'Quick Win', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', gradient: 'from-emerald-500 to-emerald-600' },
  'challenge': { label: 'Challenge', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30', gradient: 'from-amber-500 to-orange-600' },
  'deep-dive': { label: 'Deep Dive', color: 'bg-violet-500/15 text-violet-400 border-violet-500/30', gradient: 'from-violet-500 to-purple-600' },
};

const AI_MODE_CONFIG = {
  'dr-sage': { label: 'Dr. Sage', icon: Brain, color: 'text-blue-400' },
  'ana': { label: 'AnA 1.0', icon: Sparkles, color: 'text-violet-400' },
  'both': { label: 'Dr. Sage + AnA 1.0', icon: Bot, color: 'text-indigo-400' },
};

// ─── Mission Data ─────────────────────────────────────────────────────────────

export const MICRO_MISSIONS: MicroMission[] = [
  {
    id: 'first-evidence-upload',
    title: 'Your First Evidence Upload',
    description: 'Upload a document to your project vault and tag it with the right metadata.',
    difficulty: 'quick-win',
    aiMode: 'dr-sage',
    estimatedSeconds: 60,
    skills: ['Document Management', 'Metadata Tagging'],
    category: 'Getting Started',
    steps: [
      { title: 'Open your project', instruction: 'Navigate to an active project from the sidebar. Click on the project name to enter the workspace.', tip: 'Dr. Sage will highlight your most recent project.' },
      { title: 'Navigate to evidence', instruction: 'Click on the "Evidence" tab in the project workspace to open the evidence repository.' },
      { title: 'Upload document', instruction: 'Click the "Upload" button and select a document from your computer. Drag and drop also works.', tip: 'Supported formats include PDF, DOCX, XLSX, and more.' },
      { title: 'Tag metadata', instruction: 'Fill in the metadata fields: document type, study phase, therapeutic area, and any relevant tags.' },
      { title: 'Verify upload', instruction: 'Confirm the document appears in your evidence list with the correct tags and a green checkmark.', tip: 'Dr. Sage will auto-suggest tags based on document content.' },
    ],
  },
  {
    id: 'ask-ana-question',
    title: 'Ask AnA 1.0 a Question',
    description: 'Use AnA 1.0 to query your regulatory intelligence and get instant answers.',
    difficulty: 'quick-win',
    aiMode: 'ana',
    estimatedSeconds: 60,
    skills: ['AI Interaction', 'Regulatory Intelligence'],
    category: 'Getting Started',
    steps: [
      { title: 'Open Ask AnA 1.0', instruction: 'Click the AnA 1.0 icon in the top navigation bar or press Cmd+K to open the command palette and type "Ask AnA".' },
      { title: 'Select a prompt', instruction: 'Choose one of the suggested prompts, such as "What are the key requirements for Module 2.5?" or type your own question.', tip: 'AnA 1.0 understands regulatory context, so be specific about your submission type.' },
      { title: 'Review the response', instruction: 'Read AnA 1.0\'s response. Notice the source citations and confidence indicators linked to each claim.' },
      { title: 'Take action', instruction: 'Click on a suggested action from the response, such as "View source document" or "Create task from finding".', tip: 'You can pin helpful responses to your project for future reference.' },
    ],
  },
  {
    id: 'run-gap-analysis',
    title: 'Run a Gap Analysis',
    description: 'Identify missing evidence and compliance gaps in your submission package.',
    difficulty: 'challenge',
    aiMode: 'ana',
    estimatedSeconds: 60,
    skills: ['Gap Analysis', 'Compliance', 'Remediation Planning'],
    category: 'Intelligence',
    steps: [
      { title: 'Select submission', instruction: 'From the project workspace, click on your target submission in the dossier navigator.' },
      { title: 'Launch gap analysis', instruction: 'Click "Run Gap Analysis" from the Actions menu. AnA 1.0 will scan all sections against regulatory requirements.', tip: 'The analysis considers your target authority (FDA, EMA, etc.) and submission type.' },
      { title: 'Review findings', instruction: 'Browse the gap report organized by severity: Critical (red), Major (amber), and Minor (yellow). Each gap includes a description and remediation suggestion.' },
      { title: 'Prioritize gaps', instruction: 'Use the priority matrix to rank gaps by impact and effort. Drag items to reorder based on your timeline.' },
      { title: 'Create remediation task', instruction: 'Select one or more gaps and click "Create Tasks" to generate trackable remediation work items with owners and deadlines.' },
    ],
  },
  {
    id: 'fix-metadata-issue',
    title: 'Fix a Metadata Issue',
    description: 'Let Dr. Sage detect and help you fix a document metadata problem.',
    difficulty: 'quick-win',
    aiMode: 'dr-sage',
    estimatedSeconds: 60,
    skills: ['Quality Assurance', 'Metadata Management'],
    category: 'Governance',
    steps: [
      { title: 'Dr. Sage detects issue', instruction: 'Notice the amber notification from Dr. Sage in the sidebar indicating a metadata inconsistency in one of your documents.' },
      { title: 'Review diagnosis', instruction: 'Click the notification to see Dr. Sage\'s diagnosis: which field is incorrect, what it should be, and why the current value is problematic.', tip: 'Dr. Sage cross-references metadata against your project settings and regulatory requirements.' },
      { title: 'Approve fix', instruction: 'Review the suggested correction and click "Apply Fix" to accept Dr. Sage\'s recommendation, or "Edit" to modify it.' },
      { title: 'Verify correction', instruction: 'Confirm the metadata field now shows the corrected value with a green validation indicator.' },
      { title: 'Check audit trail', instruction: 'Open the document\'s audit trail to verify the change was logged with the reason and Dr. Sage\'s involvement.' },
    ],
  },
  {
    id: 'generate-governed-artifact',
    title: 'Generate a Governed Artifact',
    description: 'Create an AI-drafted document section with full governance and provenance.',
    difficulty: 'challenge',
    aiMode: 'both',
    estimatedSeconds: 60,
    skills: ['AI Authoring', 'Governance', 'Document Assembly'],
    category: 'Authoring',
    steps: [
      { title: 'Select section', instruction: 'In the dossier navigator, click on an empty section slot (e.g., Module 2.7 Clinical Summary) to begin authoring.' },
      { title: 'Review template', instruction: 'The template engine loads the regulatory-compliant structure. Review the required subsections and formatting guidelines.' },
      { title: 'Customize with AnA 1.0', instruction: 'Click "Draft with AnA 1.0" to generate content. AnA 1.0 will pull from your evidence graph and regulatory precedents.', tip: 'You can select which source documents AnA 1.0 should prioritize.' },
      { title: 'Apply governance', instruction: 'Dr. Sage automatically attaches provenance metadata, source citations, and confidence scores to every generated claim.' },
      { title: 'Place in dossier', instruction: 'Click "Place in Dossier" to add the governed artifact to your submission structure. Verify the provenance chain is intact.' },
    ],
  },
  {
    id: 'compare-document-versions',
    title: 'Compare Document Versions',
    description: 'Use the visual diff tool to review changes between document versions.',
    difficulty: 'quick-win',
    aiMode: 'dr-sage',
    estimatedSeconds: 60,
    skills: ['Version Control', 'Document Review'],
    category: 'Authoring',
    steps: [
      { title: 'Select document', instruction: 'Navigate to any document in your project and click the version history icon (clock symbol) in the toolbar.' },
      { title: 'Open compare view', instruction: 'Select two versions to compare using the checkboxes, then click "Compare Selected" to open the side-by-side diff view.' },
      { title: 'Review changes', instruction: 'Additions are highlighted in green, deletions in red. Use the navigation arrows to jump between changes.', tip: 'Dr. Sage will summarize the key changes at the top of the diff view.' },
      { title: 'Accept or reject', instruction: 'For each change, click "Accept" or "Reject". You can also bulk-accept all changes from a specific author.' },
      { title: 'Update version', instruction: 'Click "Save as New Version" to create a new version with your accepted changes. Add a version note describing the review.' },
    ],
  },
  {
    id: 'prep-for-audit',
    title: 'Prep for Audit',
    description: 'Run a full audit readiness check and resolve any compliance issues.',
    difficulty: 'deep-dive',
    aiMode: 'both',
    estimatedSeconds: 60,
    skills: ['Audit Readiness', 'Compliance', 'Provenance', 'Attestation'],
    category: 'Governance',
    steps: [
      { title: 'Launch audit readiness', instruction: 'From Mission Control, click "Audit Readiness Assessment" to start a comprehensive scan of your project.' },
      { title: 'Review provenance', instruction: 'Check that every document in your dossier has a complete provenance chain from source to final version.', tip: 'Documents with broken provenance are flagged in red.' },
      { title: 'Fix broken trails', instruction: 'For any flagged items, click "Repair Trail" to let Dr. Sage suggest the missing links and verify the chain.' },
      { title: 'Attach attestations', instruction: 'For documents requiring sign-off, click "Request Attestation" and select the appropriate reviewers from your team.' },
      { title: 'Check readiness score', instruction: 'Review the overall readiness score. Green (90%+) means audit-ready. Address any remaining items to improve the score.', tip: 'AnA 1.0 benchmarks your readiness against similar successful submissions.' },
      { title: 'Export audit package', instruction: 'Click "Export Audit Package" to generate a comprehensive audit trail document including all provenance chains and attestations.' },
    ],
  },
  {
    id: 'build-submission-package',
    title: 'Build a Submission Package',
    description: 'Assemble a complete regulatory submission package with validation.',
    difficulty: 'deep-dive',
    aiMode: 'both',
    estimatedSeconds: 60,
    skills: ['Submission Assembly', 'eCTD Compliance', 'Quality Validation', 'Export'],
    category: 'Operations',
    steps: [
      { title: 'Select project', instruction: 'Open your project and navigate to the "Submission" tab. Select the target regulatory authority and submission type.' },
      { title: 'Review dossier structure', instruction: 'Verify all required modules and sections are populated. Empty sections appear as grey slots in the dossier tree.' },
      { title: 'Validate completeness', instruction: 'Click "Validate" to run AnA 1.0\'s completeness check. Review any warnings about missing or incomplete sections.', tip: 'AnA 1.0 checks against the specific regulatory requirements for your authority.' },
      { title: 'Run compliance check', instruction: 'Launch the automated compliance check. Dr. Sage validates formatting, metadata, cross-references, and regulatory alignment.' },
      { title: 'Generate export', instruction: 'Click "Generate Package" to create the final submission package in the required format (eCTD, NeeS, etc.).' },
      { title: 'Verify package integrity', instruction: 'Review the package validation report. Green checkmarks confirm each component passed. Download the final package.', tip: 'The package includes a manifest and integrity checksums for each file.' },
    ],
  },
];

// ─── Confetti Effect ──────────────────────────────────────────────────────────

function ConfettiEffect() {
  const particles = useMemo(() => {
    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#6366f1'];
    return Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.5,
      rotation: Math.random() * 360,
      size: Math.random() * 6 + 4,
    }));
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -20, x: `${p.x}%`, opacity: 1, rotate: 0 }}
          animate={{ y: '120%', opacity: 0, rotate: p.rotation + 720 }}
          transition={{ duration: 2 + Math.random(), delay: p.delay, ease: 'easeOut' }}
          className="absolute"
          style={{ left: `${p.x}%` }}
        >
          <div
            className="rounded-sm"
            style={{ width: p.size, height: p.size, backgroundColor: p.color }}
          />
        </motion.div>
      ))}
    </div>
  );
}

// ─── MissionCard ──────────────────────────────────────────────────────────────

export function MissionCard({ mission, completed, completionTime, onStart }: MissionCardProps) {
  const diffConfig = DIFFICULTY_CONFIG[mission.difficulty];
  const aiConfig = AI_MODE_CONFIG[mission.aiMode];
  const AiIcon = aiConfig.icon;

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <Card className="relative overflow-hidden bg-slate-900/80 border-slate-700/50 hover:border-slate-600/80 transition-all group">
        {/* Gradient top border */}
        <div className={cn('absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r', diffConfig.gradient)} />

        <CardContent className="p-4">
          {/* Header row */}
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-200 leading-tight pr-2">
              {mission.title}
            </h3>
            {completed && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400 }}
              >
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 flex-shrink-0" />
              </motion.div>
            )}
          </div>

          {/* Description */}
          <p className="text-xs text-slate-400 leading-relaxed mb-3">{mission.description}</p>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <Badge variant="outline" className={cn('text-[10px] border', diffConfig.color)}>
              {diffConfig.label}
            </Badge>
            <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">
              <Clock className="w-2.5 h-2.5 mr-1" />
              ~60 seconds
            </Badge>
            <Badge variant="outline" className={cn('text-[10px] border-slate-600', aiConfig.color)}>
              <AiIcon className="w-2.5 h-2.5 mr-1" />
              {aiConfig.label}
            </Badge>
          </div>

          {/* Skills */}
          <div className="flex flex-wrap gap-1 mb-3">
            {mission.skills.map((skill) => (
              <span
                key={skill}
                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700/50"
              >
                {skill}
              </span>
            ))}
          </div>

          {/* CTA / Completion */}
          {completed ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium">Completed</span>
              </div>
              {completionTime !== undefined && (
                <span className="text-[10px] text-slate-500">
                  {completionTime}s
                </span>
              )}
            </div>
          ) : (
            <Button
              size="sm"
              className="w-full h-8 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-300 group-hover:bg-gradient-to-r group-hover:from-blue-600 group-hover:to-violet-600 group-hover:border-transparent group-hover:text-white transition-all"
              onClick={onStart}
            >
              <Play className="w-3 h-3 mr-1.5" />
              Start Mission
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── MissionRunner ────────────────────────────────────────────────────────────

export function MissionRunner({ mission, onComplete, onCancel }: MissionRunnerProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showTip, setShowTip] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Timer
  useEffect(() => {
    if (isComplete) return;
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isComplete]);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  const handleCompleteStep = useCallback(() => {
    if (currentStep < mission.steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
      setShowTip(false);
    } else {
      // Mission complete
      if (timerRef.current) clearInterval(timerRef.current);
      setIsComplete(true);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
  }, [currentStep, mission.steps.length]);

  const handleFinish = useCallback(() => {
    onComplete(elapsed);
  }, [elapsed, onComplete]);

  const progress = ((currentStep + (isComplete ? 1 : 0)) / mission.steps.length) * 100;
  const step = mission.steps[currentStep];
  const diffConfig = DIFFICULTY_CONFIG[mission.difficulty];
  const aiConfig = AI_MODE_CONFIG[mission.aiMode];

  return (
    <div className="relative">
      {showConfetti && <ConfettiEffect />}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-900 rounded-xl border border-slate-700/60 overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br', diffConfig.gradient)}>
              <Target className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">{mission.title}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className={cn('text-[9px] border', diffConfig.color)}>
                  {diffConfig.label}
                </Badge>
                <span className="text-[10px] text-slate-500">
                  Step {currentStep + 1} of {mission.steps.length}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700">
              <Clock className="w-3 h-3 text-slate-400" />
              <span className="text-xs font-mono text-slate-300">{formatTime(elapsed)}</span>
            </div>
            <button
              onClick={onCancel}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-800">
          <motion.div
            className={cn('h-full bg-gradient-to-r', diffConfig.gradient)}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 30 }}
          />
        </div>

        {/* Content */}
        <div className="p-5">
          <AnimatePresence mode="wait">
            {!isComplete ? (
              <motion.div
                key={`step-${currentStep}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                {/* Step indicators */}
                <div className="flex gap-1.5 mb-4">
                  {mission.steps.map((_, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'h-1.5 rounded-full flex-1 transition-colors',
                        idx < currentStep
                          ? 'bg-emerald-500'
                          : idx === currentStep
                          ? 'bg-blue-500'
                          : 'bg-slate-800'
                      )}
                    />
                  ))}
                </div>

                {/* Step content */}
                <div className="mb-4">
                  <h4 className="text-base font-semibold text-slate-200 mb-2">{step.title}</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">{step.instruction}</p>
                </div>

                {/* Simulated interaction area */}
                <div className="mb-4 p-4 rounded-lg bg-slate-800/50 border border-slate-700/50 border-dashed">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-xs text-slate-500">Simulated interaction area</span>
                  </div>
                  <div className="space-y-1.5">
                    {Array.from({ length: 3 }, (_, i) => (
                      <div
                        key={i}
                        className="h-2.5 rounded bg-slate-700/60"
                        style={{ width: `${60 + Math.random() * 35}%` }}
                      />
                    ))}
                  </div>
                </div>

                {/* Tip */}
                <AnimatePresence>
                  {showTip && step.tip && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-4 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20"
                    >
                      <div className="flex items-start gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-violet-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider">
                            Dr. Sage Tip
                          </span>
                          <p className="text-xs text-violet-300/80 mt-0.5">{step.tip}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  {step.tip && !showTip ? (
                    <button
                      onClick={() => setShowTip(true)}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-violet-400 transition-colors"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      Need help?
                    </button>
                  ) : (
                    <div />
                  )}
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 border-0"
                    onClick={handleCompleteStep}
                  >
                    {currentStep < mission.steps.length - 1 ? (
                      <>
                        Complete Step
                        <ChevronRight className="w-3 h-3 ml-1" />
                      </>
                    ) : (
                      <>
                        Finish Mission
                        <Trophy className="w-3 h-3 ml-1" />
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="text-center py-6"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.2 }}
                  className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mx-auto mb-4"
                >
                  <Trophy className="w-8 h-8 text-white" />
                </motion.div>
                <h3 className="text-lg font-bold text-slate-200 mb-1">Mission Complete!</h3>
                <p className="text-sm text-slate-400 mb-4">
                  You finished <span className="text-slate-200 font-medium">{mission.title}</span> in{' '}
                  <span className="text-emerald-400 font-mono font-medium">{formatTime(elapsed)}</span>
                </p>

                {/* Skills earned */}
                <div className="flex flex-wrap gap-1.5 justify-center mb-6">
                  {mission.skills.map((skill) => (
                    <motion.div
                      key={skill}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + Math.random() * 0.3 }}
                    >
                      <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                        <Star className="w-2.5 h-2.5 mr-1" />
                        {skill}
                      </Badge>
                    </motion.div>
                  ))}
                </div>

                <Button
                  size="sm"
                  className="h-9 text-xs bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 border-0"
                  onClick={handleFinish}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Continue
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

// ─── MissionBrowser ───────────────────────────────────────────────────────────

export function MissionBrowser({
  onStartMission,
  completedMissions = {},
  userRole,
  className,
}: MissionBrowserProps) {
  const [difficultyFilter, setDifficultyFilter] = useState<string | null>(null);
  const [aiFilter, setAiFilter] = useState<string | null>(null);

  const filteredMissions = useMemo(() => {
    return MICRO_MISSIONS.filter((m) => {
      if (difficultyFilter && m.difficulty !== difficultyFilter) return false;
      if (aiFilter && m.aiMode !== aiFilter) return false;
      return true;
    });
  }, [difficultyFilter, aiFilter]);

  const recommendedMissions = useMemo(() => {
    // Role-based recommendations
    const roleMap: Record<string, string[]> = {
      'regulatory-affairs': ['first-evidence-upload', 'run-gap-analysis', 'build-submission-package'],
      'medical-writer': ['ask-ana-question', 'generate-governed-artifact', 'compare-document-versions'],
      'quality': ['fix-metadata-issue', 'prep-for-audit', 'build-submission-package'],
    };
    const recommended = roleMap[userRole || ''] || ['first-evidence-upload', 'ask-ana-question', 'fix-metadata-issue'];
    return filteredMissions.filter((m) => recommended.includes(m.id) && !completedMissions[m.id]);
  }, [filteredMissions, completedMissions, userRole]);

  const popularMissions = useMemo(() => {
    const popular = ['ask-ana-question', 'run-gap-analysis', 'generate-governed-artifact', 'build-submission-package'];
    return filteredMissions.filter((m) => popular.includes(m.id));
  }, [filteredMissions]);

  const newMissions = useMemo(() => {
    const newer = ['prep-for-audit', 'compare-document-versions'];
    return filteredMissions.filter((m) => newer.includes(m.id));
  }, [filteredMissions]);

  const completedCount = Object.keys(completedMissions).length;

  const clearFilters = useCallback(() => {
    setDifficultyFilter(null);
    setAiFilter(null);
  }, []);

  const hasFilters = difficultyFilter || aiFilter;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            Micro-Missions
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            60-second interactive challenges to master the platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">
            {completedCount}/{MICRO_MISSIONS.length} completed
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-slate-500" />
        {/* Difficulty filters */}
        {(['quick-win', 'challenge', 'deep-dive'] as const).map((d) => {
          const config = DIFFICULTY_CONFIG[d];
          return (
            <button
              key={d}
              onClick={() => setDifficultyFilter(difficultyFilter === d ? null : d)}
              className={cn(
                'text-[10px] px-2 py-1 rounded-full border transition-all',
                difficultyFilter === d
                  ? config.color
                  : 'border-slate-700 text-slate-500 hover:text-slate-400 hover:border-slate-600'
              )}
            >
              {config.label}
            </button>
          );
        })}
        <div className="w-px h-4 bg-slate-700" />
        {/* AI mode filters */}
        {(['dr-sage', 'ana', 'both'] as const).map((a) => {
          const config = AI_MODE_CONFIG[a];
          return (
            <button
              key={a}
              onClick={() => setAiFilter(aiFilter === a ? null : a)}
              className={cn(
                'text-[10px] px-2 py-1 rounded-full border transition-all',
                aiFilter === a
                  ? 'border-indigo-500/40 text-indigo-400 bg-indigo-500/10'
                  : 'border-slate-700 text-slate-500 hover:text-slate-400 hover:border-slate-600'
              )}
            >
              {config.label}
            </button>
          );
        })}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-[10px] px-2 py-1 text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            Clear
          </button>
        )}
      </div>

      {/* Recommended for You */}
      {recommendedMissions.length > 0 && !hasFilters && (
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-amber-400" />
            Recommended for You
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recommendedMissions.map((mission) => (
              <MissionCard
                key={mission.id}
                mission={mission}
                completed={!!completedMissions[mission.id]}
                completionTime={completedMissions[mission.id]}
                onStart={() => onStartMission(mission.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Popular Missions */}
      {popularMissions.length > 0 && !hasFilters && (
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-rose-400" />
            Popular Missions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {popularMissions.map((mission) => (
              <MissionCard
                key={mission.id}
                mission={mission}
                completed={!!completedMissions[mission.id]}
                completionTime={completedMissions[mission.id]}
                onStart={() => onStartMission(mission.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* New Missions */}
      {newMissions.length > 0 && !hasFilters && (
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            New Missions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {newMissions.map((mission) => (
              <MissionCard
                key={mission.id}
                mission={mission}
                completed={!!completedMissions[mission.id]}
                completionTime={completedMissions[mission.id]}
                onStart={() => onStartMission(mission.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Filtered view (all missions) */}
      {hasFilters && (
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            {filteredMissions.length} mission{filteredMissions.length !== 1 ? 's' : ''} found
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredMissions.map((mission) => (
              <MissionCard
                key={mission.id}
                mission={mission}
                completed={!!completedMissions[mission.id]}
                completionTime={completedMissions[mission.id]}
                onStart={() => onStartMission(mission.id)}
              />
            ))}
          </div>
          {filteredMissions.length === 0 && (
            <div className="text-center py-12">
              <Search className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No missions match your filters</p>
              <button
                onClick={clearFilters}
                className="text-xs text-blue-400 hover:text-blue-300 mt-1 transition-colors"
              >
                Clear all filters
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default MissionBrowser;
