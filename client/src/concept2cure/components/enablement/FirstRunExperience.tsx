import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Brain,
  ChevronRight,
  FileText,
  Target,
  Shield,
  Compass,
  BarChart3,
  FlaskConical,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Props ──────────────────────────────────────────────────────────────────

interface FirstRunExperienceProps {
  onComplete: (selectedRole?: string) => void;
  onSkip: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TOTAL_SCREENS = 5;
const AUTO_ADVANCE_MS = 4000;

const ROLES = [
  {
    id: 'regulatory-writer',
    title: 'Regulatory Writer',
    description: 'Author eCTD-ready documents with AI co-writing',
    icon: FileText,
  },
  {
    id: 'regulatory-strategist',
    title: 'Regulatory Strategist',
    description: 'Plan submissions and navigate agency interactions',
    icon: Target,
  },
  {
    id: 'quality-cmc',
    title: 'Quality/CMC Specialist',
    description: 'Manage quality systems and CMC documentation',
    icon: FlaskConical,
  },
  {
    id: 'clinical-operations',
    title: 'Clinical Operations',
    description: 'Coordinate trials, sites, and study execution',
    icon: Compass,
  },
  {
    id: 'executive-overview',
    title: 'Executive Overview',
    description: 'Portfolio dashboards and strategic insights',
    icon: BarChart3,
  },
];

// ─── Floating Particles ─────────────────────────────────────────────────────

function FloatingParticles() {
  const particles = useRef(
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 5,
      duration: Math.random() * 8 + 6,
    }))
  ).current;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-blue-400/20"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.2, 0.6, 0.2],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// ─── C2C Logo SVG ───────────────────────────────────────────────────────────

function AnimatedLogo() {
  return (
    <motion.svg
      viewBox="0 0 200 60"
      className="w-56 h-16 mx-auto"
      initial="hidden"
      animate="visible"
    >
      {/* C */}
      <motion.path
        d="M 20 10 Q 5 10 5 30 Q 5 50 20 50 L 30 50"
        fill="none"
        stroke="url(#logoGrad)"
        strokeWidth="4"
        strokeLinecap="round"
        variants={{
          hidden: { pathLength: 0, opacity: 0 },
          visible: { pathLength: 1, opacity: 1, transition: { duration: 0.8, delay: 0.2 } },
        }}
      />
      {/* 2 */}
      <motion.path
        d="M 50 15 Q 70 10 70 22 Q 70 34 50 40 L 72 40"
        fill="none"
        stroke="url(#logoGrad)"
        strokeWidth="4"
        strokeLinecap="round"
        variants={{
          hidden: { pathLength: 0, opacity: 0 },
          visible: { pathLength: 1, opacity: 1, transition: { duration: 0.8, delay: 0.5 } },
        }}
      />
      {/* C */}
      <motion.path
        d="M 105 10 Q 90 10 90 30 Q 90 50 105 50 L 115 50"
        fill="none"
        stroke="url(#logoGrad)"
        strokeWidth="4"
        strokeLinecap="round"
        variants={{
          hidden: { pathLength: 0, opacity: 0 },
          visible: { pathLength: 1, opacity: 1, transition: { duration: 0.8, delay: 0.8 } },
        }}
      />
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
    </motion.svg>
  );
}

// ─── Typing Text ────────────────────────────────────────────────────────────

function TypingText({ text, className }: { text: string; className?: string }) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 22);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <p className={className}>
      {displayed}
      <motion.span
        className="inline-block w-0.5 h-5 bg-current ml-0.5 align-middle"
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.6, repeat: Infinity }}
      />
    </p>
  );
}

// ─── Capability Pills ───────────────────────────────────────────────────────

function CapabilityPills({ items, color }: { items: string[]; color: string }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center mt-6">
      {items.map((item, i) => (
        <motion.span
          key={item}
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 1.5 + i * 0.3, type: 'spring', stiffness: 200 }}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border ${color}`}
        >
          {item}
        </motion.span>
      ))}
    </div>
  );
}

// ─── Screen Components ──────────────────────────────────────────────────────

function WelcomeScreen() {
  return (
    <div className="relative flex flex-col items-center justify-center h-full text-center px-8">
      <FloatingParticles />
      <AnimatedLogo />
      <motion.h1
        className="text-4xl md:text-5xl font-bold mt-8 bg-gradient-to-r from-blue-300 via-blue-100 to-violet-300 bg-clip-text text-transparent"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.8 }}
      >
        Welcome to Concept2Cure
      </motion.h1>
      <motion.p
        className="text-lg text-slate-400 mt-4 max-w-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8, duration: 0.8 }}
      >
        One platform. Two intelligent systems. Zero fragmentation.
      </motion.p>
    </div>
  );
}

function DrSageScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 bg-gradient-to-br from-blue-950/60 to-slate-950/80">
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-2xl shadow-blue-500/30"
      >
        <Bot className="w-12 h-12 text-white" />
      </motion.div>
      <motion.h2
        className="text-3xl font-bold mt-6 text-blue-100"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        Meet Dr. Sage
      </motion.h2>
      <div className="mt-4 max-w-lg">
        <TypingText
          text="I'm Dr. Sage — your guide, trainer, and workflow operator. I help you navigate, learn, and execute across the entire platform."
          className="text-slate-300 text-base leading-relaxed"
        />
      </div>
      <CapabilityPills
        items={['Contextual Help', 'Guided Workflows', 'Safe Fixes']}
        color="bg-blue-500/10 border-blue-500/30 text-blue-300"
      />
      {/* Floating button preview */}
      <motion.div
        className="absolute bottom-8 right-8"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 2, type: 'spring' }}
      >
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/40">
          <Bot className="w-6 h-6 text-white" />
        </div>
      </motion.div>
    </div>
  );
}

function AnAScreen() {
  return (
    <div className="relative flex flex-col items-center justify-center h-full text-center px-8 bg-gradient-to-br from-violet-950/60 to-slate-950/80 overflow-hidden">
      {/* Neural network pattern */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-px bg-gradient-to-b from-transparent via-violet-500/20 to-transparent"
            style={{
              left: `${15 + i * 10}%`,
              top: 0,
              height: '100%',
            }}
            animate={{ opacity: [0.1, 0.4, 0.1] }}
            transition={{ duration: 3, delay: i * 0.3, repeat: Infinity }}
          />
        ))}
      </div>
      <motion.div
        initial={{ scale: 0, rotate: 20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-24 h-24 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-2xl shadow-violet-500/30"
      >
        <Brain className="w-12 h-12 text-white" />
      </motion.div>
      <motion.h2
        className="text-3xl font-bold mt-6 text-violet-100"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        Meet AnA 1.0
      </motion.h2>
      <div className="mt-4 max-w-lg">
        <TypingText
          text="I'm AnA 1.0 — your Regulatory Intelligence Copilot. I analyze evidence, reason through precedent, detect gaps, and power your most important decisions."
          className="text-slate-300 text-base leading-relaxed"
        />
      </div>
      <CapabilityPills
        items={['Evidence Analysis', 'Precedent Intelligence', 'Gap Detection']}
        color="bg-violet-500/10 border-violet-500/30 text-violet-300"
      />
    </div>
  );
}

function BetterTogetherScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      {/* Avatars with connecting line */}
      <div className="flex items-center gap-8">
        <motion.div
          initial={{ x: -60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 120 }}
          className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg"
        >
          <Bot className="w-8 h-8 text-white" />
        </motion.div>

        {/* Glowing connection line */}
        <motion.div
          className="relative h-1 w-32 rounded-full overflow-hidden"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-violet-400 to-violet-500" />
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            animate={{ x: ['-100%', '100%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          />
        </motion.div>

        <motion.div
          initial={{ x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 120 }}
          className="w-16 h-16 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-lg"
        >
          <Brain className="w-8 h-8 text-white" />
        </motion.div>
      </div>

      <motion.p
        className="text-slate-300 mt-8 max-w-xl text-base leading-relaxed"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
      >
        Dr. Sage coordinates your workflow. AnA 1.0 powers your intelligence.
        Together, they help you produce better, faster, more defensible outcomes.
      </motion.p>

      {/* Before / After comparison */}
      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full">
        <motion.div
          className="p-4 rounded-xl border border-slate-700 bg-slate-900/50 text-left"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.2 }}
        >
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Before</p>
          <p className="text-sm text-slate-400 leading-relaxed">
            5 disconnected tools, manual cross-referencing, no traceability
          </p>
        </motion.div>

        <motion.div
          className="relative p-4 rounded-xl border border-blue-500/30 bg-blue-950/30 text-left overflow-hidden"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.4 }}
        >
          <motion.div
            className="absolute inset-0 bg-blue-500/5 rounded-xl"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2 relative">After</p>
          <p className="text-sm text-blue-200 leading-relaxed relative">
            One governed platform, AI-powered intelligence, full audit trail
          </p>
        </motion.div>
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
    <div className="flex flex-col items-center justify-center h-full px-6">
      <motion.h2
        className="text-3xl font-bold text-white mb-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        Choose Your Path
      </motion.h2>
      <motion.p
        className="text-slate-400 mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        Select your primary role to personalize your experience
      </motion.p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 max-w-4xl w-full">
        {ROLES.map((role, i) => {
          const Icon = role.icon;
          const selected = selectedRole === role.id;
          return (
            <motion.button
              key={role.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              onClick={() => onSelect(role.id)}
              className={`
                p-4 rounded-xl border text-left transition-all cursor-pointer
                ${
                  selected
                    ? 'border-blue-500 bg-blue-950/40 ring-2 ring-blue-500/50 shadow-lg shadow-blue-500/10'
                    : 'border-slate-700 bg-slate-900/50 hover:border-slate-600 hover:bg-slate-800/50'
                }
              `}
            >
              <Icon className={`w-6 h-6 mb-2 ${selected ? 'text-blue-400' : 'text-slate-500'}`} />
              <p className={`text-sm font-semibold ${selected ? 'text-blue-100' : 'text-slate-300'}`}>
                {role.title}
              </p>
              <p className="text-xs text-slate-500 mt-1 leading-snug">{role.description}</p>
            </motion.button>
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
        <motion.div
          key={i}
          className={`rounded-full transition-colors ${
            i === current ? 'bg-blue-400 w-6 h-2' : 'bg-slate-600 w-2 h-2'
          }`}
          layout
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

  // Auto-advance for screen 0 only
  useEffect(() => {
    if (screen === 0) {
      timerRef.current = setTimeout(() => setScreen(1), AUTO_ADVANCE_MS);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [screen]);

  const goNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (screen < TOTAL_SCREENS - 1) setScreen((s) => s + 1);
  }, [screen]);

  const goPrev = useCallback(() => {
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
      className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-950 via-slate-950 to-blue-950 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Skip button */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={handleSkip}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
        >
          Skip <X className="w-4 h-4" />
        </button>
      </div>

      {/* Screen content */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            className="absolute inset-0"
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          >
            {screens[screen]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between px-8 pb-8 pt-4">
        <ProgressDots current={screen} total={TOTAL_SCREENS} />

        <div className="flex items-center gap-3">
          {screen === TOTAL_SCREENS - 1 ? (
            <>
              <button
                onClick={handleSkip}
                className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                I'll choose later
              </button>
              <Button
                onClick={handleComplete}
                className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white px-6"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Begin My Journey
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              onClick={goNext}
              className="text-slate-300 hover:text-white hover:bg-slate-800"
            >
              Continue <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
