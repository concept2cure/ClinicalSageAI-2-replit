import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Constants ──────────────────────────────────────────────────────────────

const DIFFICULTY_LABELS: Record<MicroMission['difficulty'], string> = {
  'quick-win': 'Quick win',
  'challenge': 'Challenge',
  'deep-dive': 'Deep dive',
};

const AI_MODE_LABELS: Record<MicroMission['aiMode'], string> = {
  'dr-sage': 'Dr. Sage',
  'ana': 'AnA 1.0',
  'both': 'Dr. Sage + AnA 1.0',
};

const fade = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.15 } };

// ─── Mission Data ───────────────────────────────────────────────────────────

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

// ─── MissionCard ────────────────────────────────────────────────────────────

export function MissionCard({ mission, completed, completionTime, onStart }: MissionCardProps) {
  const aiLabel = AI_MODE_LABELS[mission.aiMode];
  const estimateLabel = `~${mission.estimatedSeconds} seconds`;

  return (
    <motion.div
      {...fade}
      className="bg-white rounded-lg border border-stone-200 p-5"
    >
      <h3 className="text-base font-semibold text-stone-900">{mission.title}</h3>
      <p className="text-sm text-stone-500 mt-1 leading-relaxed">{mission.description}</p>
      <p className="text-xs text-stone-400 mt-3">
        {estimateLabel} &middot; {aiLabel}
      </p>
      <p className="text-xs text-stone-400 mt-1">
        {mission.skills.join(', ')}
      </p>

      <div className="mt-4">
        {completed ? (
          <span className="text-sm text-stone-400">
            &#10003; Completed{completionTime !== undefined ? ` in ${completionTime}s` : ''}
          </span>
        ) : (
          <button
            onClick={onStart}
            className="text-sm text-blue-600 hover:underline"
          >
            Start &rarr;
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── MissionRunner ──────────────────────────────────────────────────────────

export function MissionRunner({ mission, onComplete, onCancel }: MissionRunnerProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showTip, setShowTip] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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
      if (timerRef.current) clearInterval(timerRef.current);
      setIsComplete(true);
    }
  }, [currentStep, mission.steps.length]);

  const handleFinish = useCallback(() => {
    onComplete(elapsed);
  }, [elapsed, onComplete]);

  const step = mission.steps[currentStep];

  return (
    <motion.div
      {...fade}
      className="bg-white border border-stone-200 rounded-lg overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-stone-900">{mission.title}</h3>
          <p className="text-xs text-stone-400 mt-0.5">
            Step {currentStep + 1} of {mission.steps.length}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-stone-400 font-mono">{formatTime(elapsed)}</span>
          <button
            onClick={onCancel}
            className="text-xs text-stone-400 hover:text-stone-600"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <AnimatePresence mode="wait">
          {!isComplete ? (
            <motion.div
              key={`step-${currentStep}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Step list */}
              <div className="space-y-1 mb-5">
                {mission.steps.map((s, idx) => (
                  <p
                    key={idx}
                    className={cn(
                      'text-sm',
                      idx < currentStep
                        ? 'text-stone-400'
                        : idx === currentStep
                        ? 'font-medium text-stone-900'
                        : 'text-stone-400'
                    )}
                  >
                    {idx + 1}. {s.title}
                  </p>
                ))}
              </div>

              {/* Current step instruction */}
              <p className="text-sm text-stone-600 leading-relaxed mb-4">
                {step.instruction}
              </p>

              {/* Tip */}
              <AnimatePresence>
                {showTip && step.tip && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="text-xs text-stone-400 italic mb-4 leading-relaxed"
                  >
                    Tip: {step.tip}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Actions */}
              <div className="flex items-center justify-between">
                {step.tip && !showTip ? (
                  <button
                    onClick={() => setShowTip(true)}
                    className="text-xs text-stone-400 hover:text-stone-600"
                  >
                    Need help?
                  </button>
                ) : (
                  <div />
                )}
                <button
                  onClick={handleCompleteStep}
                  className="text-sm text-stone-900 font-medium hover:underline"
                >
                  {currentStep < mission.steps.length - 1
                    ? 'Complete step \u2192'
                    : 'Finish mission \u2192'}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="text-center py-8"
            >
              <h3 className="text-base font-semibold text-stone-900 mb-1">Mission complete</h3>
              <p className="text-sm text-stone-500 mb-6">
                You finished {mission.title} in{' '}
                <span className="font-mono text-stone-700">{formatTime(elapsed)}</span>
              </p>
              <button
                onClick={handleFinish}
                className="text-sm text-blue-600 hover:underline"
              >
                Continue &rarr;
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── MissionBrowser ─────────────────────────────────────────────────────────

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
  const hasFilters = difficultyFilter || aiFilter;

  const clearFilters = useCallback(() => {
    setDifficultyFilter(null);
    setAiFilter(null);
  }, []);

  const FilterToggle = ({
    label,
    active,
    onClick,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className={cn(
        'text-xs px-2 py-1',
        active
          ? 'font-medium text-stone-900'
          : 'text-stone-400 hover:text-stone-600'
      )}
    >
      {label}
    </button>
  );

  const renderSection = (title: string, missions: MicroMission[]) => {
    if (missions.length === 0) return null;
    return (
      <section>
        <h3 className="text-sm font-medium text-stone-900 mb-3">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {missions.map((mission) => (
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
    );
  };

  return (
    <div className={cn('space-y-10', className)}>
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-stone-900">Micro-Missions</h2>
        <p className="text-sm text-stone-500 mt-1">
          60-second interactive challenges to master the platform
        </p>
        <p className="text-xs text-stone-400 mt-0.5">
          {completedCount} of {MICRO_MISSIONS.length} completed
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1">
        {(['quick-win', 'challenge', 'deep-dive'] as const).map((d) => (
          <FilterToggle
            key={d}
            label={DIFFICULTY_LABELS[d]}
            active={difficultyFilter === d}
            onClick={() => setDifficultyFilter(difficultyFilter === d ? null : d)}
          />
        ))}
        <span className="text-stone-200 mx-1">&middot;</span>
        {(['dr-sage', 'ana', 'both'] as const).map((a) => (
          <FilterToggle
            key={a}
            label={AI_MODE_LABELS[a]}
            active={aiFilter === a}
            onClick={() => setAiFilter(aiFilter === a ? null : a)}
          />
        ))}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-stone-400 hover:text-stone-600 ml-2"
          >
            Clear
          </button>
        )}
      </div>

      {/* Sections */}
      {!hasFilters && (
        <>
          {renderSection('Recommended', recommendedMissions)}
          {renderSection('Popular', popularMissions)}
          {renderSection('New', newMissions)}
        </>
      )}

      {/* Filtered view */}
      {hasFilters && (
        <section>
          <h3 className="text-sm font-medium text-stone-900 mb-3">
            {filteredMissions.length} mission{filteredMissions.length !== 1 ? 's' : ''} found
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              <p className="text-sm text-stone-500">No missions match your filters</p>
              <button
                onClick={clearFilters}
                className="text-xs text-blue-600 hover:underline mt-1"
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
