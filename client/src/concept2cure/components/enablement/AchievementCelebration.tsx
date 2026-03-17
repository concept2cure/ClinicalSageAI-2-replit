import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AchievementToastProps {
  type: 'module' | 'certification' | 'milestone' | 'streak';
  title: string;
  description: string;
  progress?: { current: number; total: number };
  onDismiss: () => void;
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

// ─── Icons ──────────────────────────────────────────────────────────────────

const TOAST_ICONS: Record<AchievementToastProps['type'], string> = {
  module: '\u2713',
  certification: '\u2605',
  milestone: '\u2605',
  streak: '\u2713',
};

// ─── AchievementToast ───────────────────────────────────────────────────────

function AchievementToast({ type, title, description, progress, onDismiss }: AchievementToastProps) {
  const icon = TOAST_ICONS[type];

  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.15 }}
      className="w-72 bg-white border border-zinc-200 rounded-lg shadow-sm overflow-hidden"
    >
      <div className="p-3 flex gap-3">
        <span className="text-zinc-400 text-sm mt-0.5 flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-zinc-900">{title}</p>
            <button
              onClick={onDismiss}
              className="text-zinc-400 hover:text-zinc-600 transition-colors ml-2 flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
          {progress && (
            <p className="text-xs text-zinc-400 mt-1">
              {progress.current} of {progress.total}
            </p>
          )}
        </div>
      </div>
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

function AchievementProvider({ children }: AchievementManagerProps) {
  const [toasts, setToasts] = useState<ToastState[]>([]);
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

  // triggerMilestone just shows a toast instead of a full overlay
  const triggerMilestone = useCallback(
    (title: string, description: string, _badgeGradient: string, _icon: React.ReactNode) => {
      triggerAchievement('milestone', title, description);
    },
    [triggerAchievement]
  );

  // No-op: confetti is removed
  const triggerConfetti = useCallback(() => {}, []);

  return (
    <AchievementContext.Provider value={{ triggerAchievement, triggerMilestone, triggerConfetti }}>
      {children}

      {/* Toast stack (bottom-right) */}
      <div className="fixed bottom-6 right-6 z-[106] flex flex-col-reverse gap-2">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <AchievementToast key={toast.id} {...toast} />
          ))}
        </AnimatePresence>
      </div>
    </AchievementContext.Provider>
  );
}

// ─── Exports ────────────────────────────────────────────────────────────────

export {
  AchievementProvider,
  useAchievements,
  AchievementToast,
};
