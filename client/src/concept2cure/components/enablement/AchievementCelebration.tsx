import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, CheckCircle2, Star, Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ConfettiEffectProps {
  trigger: boolean;
  onComplete?: () => void;
}

interface AchievementToastProps {
  type: 'module' | 'certification' | 'milestone' | 'streak';
  title: string;
  description: string;
  progress?: { current: number; total: number };
  onDismiss: () => void;
}

interface MilestoneOverlayProps {
  title: string;
  description: string;
  badgeGradient: string;
  icon: React.ReactNode;
  onContinue: () => void;
}

interface AchievementManagerProps {
  children: React.ReactNode;
}

interface AchievementContextValue {
  triggerAchievement: (
    type: AchievementToastProps['type'],
    title: string,
    description: string,
    progress?: { current: number; total: number }
  ) => void;
  triggerMilestone: (
    title: string,
    description: string,
    badgeGradient: string,
    icon: React.ReactNode
  ) => void;
  triggerConfetti: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  'bg-blue-500',
  'bg-violet-500',
  'bg-amber-400',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-blue-400',
  'bg-violet-400',
  'bg-amber-500',
  'bg-emerald-400',
  'bg-rose-400',
];

const TOAST_ICONS = {
  module: CheckCircle2,
  certification: Award,
  milestone: Star,
  streak: Trophy,
};

const TOAST_COLORS = {
  module: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  certification: { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  milestone: { border: 'border-violet-500/40', bg: 'bg-violet-500/10', text: 'text-violet-400' },
  streak: { border: 'border-blue-500/40', bg: 'bg-blue-500/10', text: 'text-blue-400' },
};

// ─── ConfettiEffect ─────────────────────────────────────────────────────────

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  width: number;
  height: number;
  isCircle: boolean;
}

function ConfettiEffect({ trigger, onComplete }: ConfettiEffectProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!trigger) return;

    const count = 60 + Math.floor(Math.random() * 20);
    const newParticles: Particle[] = Array.from({ length: count }, (_, i) => {
      const angle = (Math.random() * Math.PI * 2);
      const speed = 200 + Math.random() * 400;
      return {
        id: i,
        x: 0,
        y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 300,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 720,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        width: 4 + Math.random() * 6,
        height: 4 + Math.random() * 10,
        isCircle: Math.random() > 0.5,
      };
    });

    setParticles(newParticles);

    const timer = setTimeout(() => {
      setParticles([]);
      onComplete?.();
    }, 3000);

    return () => clearTimeout(timer);
  }, [trigger, onComplete]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[110] pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={`absolute ${p.color} ${p.isCircle ? 'rounded-full' : 'rounded-sm'}`}
          style={{
            width: p.width,
            height: p.isCircle ? p.width : p.height,
            left: '50%',
            top: '50%',
          }}
          initial={{
            x: 0,
            y: 0,
            rotate: p.rotation,
            opacity: 1,
          }}
          animate={{
            x: p.vx,
            y: p.vy + 600, // gravity pulls down
            rotate: p.rotation + p.rotationSpeed,
            opacity: [1, 1, 0],
          }}
          transition={{
            duration: 2.5,
            ease: [0.22, 0.61, 0.36, 1],
          }}
        />
      ))}
    </div>
  );
}

// ─── AchievementToast ───────────────────────────────────────────────────────

function AchievementToast({ type, title, description, progress, onDismiss }: AchievementToastProps) {
  const Icon = TOAST_ICONS[type];
  const colors = TOAST_COLORS[type];
  const [elapsed, setElapsed] = useState(0);
  const autoDismissMs = 5000;

  useEffect(() => {
    const start = Date.now();
    const frame = () => {
      const now = Date.now();
      const ms = now - start;
      setElapsed(ms);
      if (ms < autoDismissMs) requestAnimationFrame(frame);
      else onDismiss();
    };
    const raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [onDismiss]);

  const progressPct = Math.min((elapsed / autoDismissMs) * 100, 100);

  return (
    <motion.div
      initial={{ y: 80, opacity: 0, scale: 0.95 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 40, opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`
        relative w-80 rounded-xl border ${colors.border} bg-slate-900/95 backdrop-blur-lg
        shadow-2xl overflow-hidden
      `}
    >
      {/* Gradient border top accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-amber-500/60 via-amber-400/80 to-amber-500/60" />

      <div className="p-4 flex gap-3">
        {/* Icon with sparkle */}
        <div className={`relative flex-shrink-0 w-10 h-10 rounded-lg ${colors.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${colors.text}`} />
          <motion.div
            className="absolute -top-1 -right-1 w-3 h-3"
            animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
          </motion.div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">{title}</p>
            <button
              onClick={onDismiss}
              className="text-slate-500 hover:text-slate-300 transition-colors ml-2 flex-shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 leading-snug">{description}</p>
          {progress && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>{progress.current} of {progress.total} modules complete</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full"
                  initial={{ width: `${((progress.current - 1) / progress.total) * 100}%` }}
                  animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Auto-dismiss timer bar */}
      <div className="h-0.5 bg-slate-800">
        <div
          className="h-full bg-slate-600/50 transition-none"
          style={{ width: `${100 - progressPct}%` }}
        />
      </div>
    </motion.div>
  );
}

// ─── MilestoneOverlay ───────────────────────────────────────────────────────

function MilestoneOverlay({ title, description, badgeGradient, icon, onContinue }: MilestoneOverlayProps) {
  const [showConfetti, setShowConfetti] = useState(true);

  return (
    <motion.div
      className="fixed inset-0 z-[105] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onContinue} />

      {/* Confetti */}
      <ConfettiEffect trigger={showConfetti} onComplete={() => setShowConfetti(false)} />

      {/* Card */}
      <motion.div
        className="relative w-full max-w-md mx-4"
        initial={{ scale: 0.8, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        {/* Rotating conic gradient border */}
        <div className="absolute -inset-px rounded-2xl overflow-hidden">
          <motion.div
            className="w-[200%] h-[200%] absolute -left-1/2 -top-1/2"
            style={{
              background:
                'conic-gradient(from 0deg, #3b82f6, #8b5cf6, #f59e0b, #10b981, #f43f5e, #3b82f6)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          />
        </div>

        <div className="relative bg-slate-950 rounded-2xl p-8 text-center">
          {/* Badge */}
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.2 }}
            className={`
              w-20 h-20 mx-auto rounded-2xl flex items-center justify-center
              bg-gradient-to-br ${badgeGradient} shadow-2xl
            `}
          >
            {icon}
          </motion.div>

          <motion.h2
            className="text-2xl font-bold mt-6 bg-gradient-to-r from-amber-300 via-amber-200 to-amber-400 bg-clip-text text-transparent"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            {title}
          </motion.h2>

          <motion.p
            className="text-slate-400 mt-2 text-sm leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            {description}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="mt-6"
          >
            <Button
              onClick={onContinue}
              className="bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white px-8"
            >
              Continue
            </Button>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Achievement Context & Provider ─────────────────────────────────────────

const AchievementContext = createContext<AchievementContextValue | null>(null);

function useAchievements(): AchievementContextValue {
  const ctx = useContext(AchievementContext);
  if (!ctx) {
    throw new Error('useAchievements must be used within an AchievementProvider');
  }
  return ctx;
}

interface ToastState extends AchievementToastProps {
  id: number;
}

interface MilestoneState extends MilestoneOverlayProps {
  id: number;
}

function AchievementProvider({ children }: AchievementManagerProps) {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [milestone, setMilestone] = useState<MilestoneState | null>(null);
  const [confetti, setConfetti] = useState(false);
  const idRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const triggerAchievement = useCallback(
    (
      type: AchievementToastProps['type'],
      title: string,
      description: string,
      progress?: { current: number; total: number }
    ) => {
      const id = ++idRef.current;
      setToasts((prev) => [
        ...prev,
        {
          id,
          type,
          title,
          description,
          progress,
          onDismiss: () => dismissToast(id),
        },
      ]);
    },
    [dismissToast]
  );

  const triggerMilestone = useCallback(
    (title: string, description: string, badgeGradient: string, icon: React.ReactNode) => {
      const id = ++idRef.current;
      setMilestone({
        id,
        title,
        description,
        badgeGradient,
        icon,
        onContinue: () => setMilestone(null),
      });
    },
    []
  );

  const triggerConfetti = useCallback(() => {
    setConfetti(false);
    // Force re-trigger on next tick
    requestAnimationFrame(() => setConfetti(true));
  }, []);

  return (
    <AchievementContext.Provider value={{ triggerAchievement, triggerMilestone, triggerConfetti }}>
      {children}

      {/* Confetti layer */}
      <ConfettiEffect trigger={confetti} onComplete={() => setConfetti(false)} />

      {/* Toast stack (bottom-right) */}
      <div className="fixed bottom-6 right-6 z-[106] flex flex-col-reverse gap-3">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <AchievementToast key={toast.id} {...toast} />
          ))}
        </AnimatePresence>
      </div>

      {/* Milestone overlay */}
      <AnimatePresence>
        {milestone && <MilestoneOverlay key={milestone.id} {...milestone} />}
      </AnimatePresence>
    </AchievementContext.Provider>
  );
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  AchievementProvider,
  useAchievements,
  ConfettiEffect,
  AchievementToast,
  MilestoneOverlay,
};
