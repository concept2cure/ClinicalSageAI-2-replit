import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Props ──────────────────────────────────────────────────────────────────

interface FirstRunExperienceProps {
  onComplete: (selectedRole?: string) => void;
  onSkip: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TOTAL_SCREENS = 5;
const AUTO_ADVANCE_MS = 6000;

const ROLES = [
  {
    id: 'regulatory-writer',
    title: 'Regulatory Writer',
    description: 'Author eCTD-ready documents with AI co-writing',
  },
  {
    id: 'regulatory-strategist',
    title: 'Regulatory Strategist',
    description: 'Plan submissions and navigate agency interactions',
  },
  {
    id: 'quality-cmc',
    title: 'Quality/CMC Specialist',
    description: 'Manage quality systems and CMC documentation',
  },
  {
    id: 'clinical-operations',
    title: 'Clinical Operations',
    description: 'Coordinate trials, sites, and study execution',
  },
  {
    id: 'executive-overview',
    title: 'Executive Overview',
    description: 'Portfolio dashboards and strategic insights',
  },
];

// ─── Fade transition ────────────────────────────────────────────────────────

const fadeUp = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.15 },
};

// ─── Screen Components ──────────────────────────────────────────────────────

function WelcomeScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <h1 className="text-2xl font-semibold text-zinc-900">
        Welcome to Concept2Cure
      </h1>
      <p className="text-base text-zinc-500 mt-3">
        One platform. Two intelligent systems.
      </p>
    </div>
  );
}

function DrSageScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <h2 className="text-xl font-semibold text-zinc-900">Meet Dr. Sage</h2>
      <p className="text-sm text-zinc-600 max-w-md leading-relaxed mt-4">
        Dr. Sage is your guide, trainer, and workflow operator. It helps you
        navigate the platform, learn best practices, and execute tasks with
        confidence — always aware of your context and ready to assist.
      </p>
      <div className="mt-6 max-w-md text-left space-y-2">
        <p className="text-sm text-zinc-600">Contextual help wherever you are</p>
        <p className="text-sm text-zinc-600">Guided workflows for complex tasks</p>
        <p className="text-sm text-zinc-600">Safe, auditable corrections and fixes</p>
      </div>
    </div>
  );
}

function AnAScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <h2 className="text-xl font-semibold text-zinc-900">Meet AnA 1.0</h2>
      <p className="text-sm text-zinc-600 max-w-md leading-relaxed mt-4">
        AnA 1.0 is your Regulatory Intelligence Copilot. It analyzes evidence,
        reasons through precedent, detects gaps in your submission, and powers
        the decisions that matter most.
      </p>
      <div className="mt-6 max-w-md text-left space-y-2">
        <p className="text-sm text-zinc-600">Evidence analysis and synthesis</p>
        <p className="text-sm text-zinc-600">Precedent intelligence across submissions</p>
        <p className="text-sm text-zinc-600">Real-time gap detection</p>
      </div>
    </div>
  );
}

function BetterTogetherScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <h2 className="text-xl font-semibold text-zinc-900 mb-8">Better together</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl w-full">
        <div className="text-left">
          <p className="text-sm text-zinc-600 leading-relaxed">
            Dr. Sage coordinates your workflow — guiding you through complex
            regulatory processes, catching issues before they become problems,
            and keeping your team aligned.
          </p>
        </div>
        <div className="text-left">
          <p className="text-sm text-zinc-600 leading-relaxed">
            AnA 1.0 powers your intelligence — analyzing evidence, surfacing
            precedent, and helping you produce faster, more defensible
            submissions with full traceability.
          </p>
        </div>
      </div>
    </div>
  );
}

function ChoosePathScreen({
  selectedRole,
  onSelect,
}: {
  selectedRole: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <h2 className="text-xl font-semibold text-zinc-900 mb-2">
        Choose your starting point
      </h2>
      <p className="text-sm text-zinc-500 mb-8">
        Select your primary role to personalize your experience
      </p>

      <div className="max-w-md w-full space-y-1">
        {ROLES.map((role) => {
          const selected = selectedRole === role.id;
          return (
            <button
              key={role.id}
              onClick={() => onSelect(role.id)}
              className={`
                w-full text-left px-4 py-3 rounded-lg transition-colors
                ${selected ? 'bg-zinc-50' : 'hover:bg-zinc-50'}
              `}
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

// ─── Progress Dots ──────────────────────────────────────────────────────────

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
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

// ─── Main Component ─────────────────────────────────────────────────────────

export default function FirstRunExperience({ onComplete, onSkip }: FirstRunExperienceProps) {
  const [screen, setScreen] = useState(0);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-advance (6 seconds each screen, except the last)
  useEffect(() => {
    if (screen >= TOTAL_SCREENS - 1) return;
    timerRef.current = setTimeout(() => setScreen((s) => s + 1), AUTO_ADVANCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [screen]);

  const goNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (screen < TOTAL_SCREENS - 1) setScreen((s) => s + 1);
  }, [screen]);

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
    <WelcomeScreen key="welcome" />,
    <DrSageScreen key="sage" />,
    <AnAScreen key="ana" />,
    <BetterTogetherScreen key="together" />,
    <ChoosePathScreen key="path" selectedRole={selectedRole} onSelect={setSelectedRole} />,
  ];

  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-white flex flex-col"
      {...fadeUp}
    >
      {/* Screen content */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            className="absolute inset-0"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {screens[screen]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between px-8 pb-8 pt-4">
        <ProgressDots current={screen} total={TOTAL_SCREENS} />

        <div className="flex items-center gap-6">
          {screen === TOTAL_SCREENS - 1 ? (
            <>
              <button
                onClick={handleSkip}
                className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleComplete}
                className="text-sm text-blue-600 font-medium hover:underline transition-colors"
              >
                Continue &rarr;
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSkip}
                className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={goNext}
                className="text-sm text-zinc-900 font-medium hover:underline transition-colors"
              >
                Continue &rarr;
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
