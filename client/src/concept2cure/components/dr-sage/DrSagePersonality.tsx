import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Sparkles,
  ChevronRight,
  X,
  AlertCircle,
  Eye,
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DrSageGreetingProps {
  userProgress?: {
    modulesCompleted: number;
    totalModules: number;
    activePath?: string;
    streak?: number;
  };
  currentContext?: {
    screenName?: string;
    productType?: string;
    projectName?: string;
  };
  className?: string;
}

interface MessageBubbleProps {
  text: string;
  typing?: boolean;
  actions?: { label: string; onClick: () => void }[];
  className?: string;
}

interface DrSageStatusIndicatorProps {
  status: "watching" | "issue-detected" | "suggestion";
  message: string;
}

interface ContextualTipProps {
  tip: string;
  onDismiss: () => void;
  onExpand?: () => void;
  autoHide?: number; // ms, default 10000
}

interface QuickActionProps {
  actions: { label: string; icon: React.ReactNode; onClick: () => void }[];
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export const DR_SAGE_FUN_FACTS = [
  "Fun fact: The average 510(k) submission references 12 predicate devices. AnA 1.0 can analyze all of them in seconds.",
  "Did you know? Dr. Sage has helped users save an average of 3 hours per submission cycle.",
  "Tip: Try asking AnA 1.0 to compare your evidence coverage against recent FDA acceptances.",
  "Fun fact: Over 4,000 510(k) submissions are filed annually. Concept2Cure helps teams submit with confidence.",
  "Did you know? The average FDA review cycle is 90 days. Dr. Sage helps you prepare for every possible question.",
  "Tip: Use the traceability view to ensure every claim maps to supporting evidence before submission.",
  "Fun fact: CMC sections account for 30% of FDA deficiency letters. AnA 1.0 flags inconsistencies early.",
  "Tip: Dr. Sage can generate a pre-submission readiness report in under a minute.",
];

export const DR_SAGE_TIPS = [
  "Your Module 3 CMC section references a stability study that isn't linked. Want me to find it?",
  "I noticed your predicate comparison table is missing biocompatibility data. Shall I suggest sources?",
  "Your submission timeline shows a gap before the target date. I can help prioritize remaining tasks.",
  "Three team members have pending review tasks. Want me to send a summary nudge?",
  "The latest FDA guidance on AI/ML devices was updated last week. Your documentation may need a refresh.",
  "Your evidence binder has 94% coverage. Two claims still need supporting references.",
  "I detected a formatting inconsistency in Section 5.2. Want me to fix it automatically?",
  "Based on recent FDA feedback patterns, I'd recommend strengthening your clinical evaluation rationale.",
];

// ---------------------------------------------------------------------------
// Utility: getGreetingMessage
// ---------------------------------------------------------------------------

export function getGreetingMessage(
  userProgress?: DrSageGreetingProps["userProgress"],
  currentContext?: DrSageGreetingProps["currentContext"],
): { greeting: string; detail?: string; flair?: string } {
  const hour = new Date().getHours();

  // Time-based greeting
  let greeting: string;
  if (hour >= 5 && hour < 12) greeting = "Good morning!";
  else if (hour >= 12 && hour < 17) greeting = "Good afternoon!";
  else if (hour >= 17 && hour < 21) greeting = "Good evening!";
  else greeting = "Working late? I'm here to help.";

  // Progress-based detail
  let detail: string | undefined;
  if (userProgress) {
    const pct =
      userProgress.totalModules > 0
        ? Math.round(
            (userProgress.modulesCompleted / userProgress.totalModules) * 100,
          )
        : 0;

    if (userProgress.streak && userProgress.streak >= 3) {
      detail = `You're on a ${userProgress.streak}-day learning streak! Keep it going.`;
    } else if (userProgress.activePath && pct > 0) {
      detail = `Welcome back! You're ${pct}% through your ${userProgress.activePath} path.`;
    } else if (userProgress.modulesCompleted > 0) {
      detail = `Congrats on completing ${userProgress.modulesCompleted} module${userProgress.modulesCompleted > 1 ? "s" : ""} this week!`;
    }
  }

  // Context-based override
  if (currentContext?.productType) {
    const ctx = currentContext.productType.toLowerCase();
    if (ctx.includes("510(k)") || ctx.includes("510k")) {
      detail =
        "I see you're working on a 510(k) submission. Need help with predicate comparison?";
    } else if (ctx.includes("cmc") || currentContext.screenName?.toLowerCase().includes("cmc")) {
      detail =
        "Working in the CMC module? I can help with Module 3 mapping.";
    }
  }

  // Random flair
  const flair =
    DR_SAGE_FUN_FACTS[Math.floor(Math.random() * DR_SAGE_FUN_FACTS.length)];

  return { greeting, detail, flair };
}

// ---------------------------------------------------------------------------
// DrSageGreeting
// ---------------------------------------------------------------------------

export function DrSageGreeting({
  userProgress,
  currentContext,
  className,
}: DrSageGreetingProps) {
  const { greeting, detail, flair } = useMemo(
    () => getGreetingMessage(userProgress, currentContext),
    // Re-compute when props change but not on every render (flair stays stable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      userProgress?.modulesCompleted,
      userProgress?.streak,
      currentContext?.screenName,
      currentContext?.productType,
    ],
  );

  return (
    <motion.div
      className={cn(
        "flex items-start gap-3 p-4 rounded-xl",
        "bg-gradient-to-br from-blue-50/80 to-violet-50/60 dark:from-blue-950/30 dark:to-violet-950/20",
        "border border-blue-100 dark:border-blue-900/40",
        className,
      )}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-md">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <motion.div
          className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-white dark:border-zinc-900"
          animate={{ scale: [1, 1.25, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          {greeting}
        </p>
        {detail && (
          <motion.p
            className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {detail}
          </motion.p>
        )}
        {flair && (
          <motion.p
            className="text-[11px] text-blue-500/80 dark:text-blue-400/70 leading-relaxed flex items-start gap-1.5 mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            {flair}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// MessageBubble
// ---------------------------------------------------------------------------

export function MessageBubble({
  text,
  typing = false,
  actions,
  className,
}: MessageBubbleProps) {
  const [displayText, setDisplayText] = useState(typing ? "" : text);
  const [isTyping, setIsTyping] = useState(typing);

  useEffect(() => {
    if (!typing) {
      setDisplayText(text);
      setIsTyping(false);
      return;
    }

    setDisplayText("");
    setIsTyping(true);
    let idx = 0;

    const interval = setInterval(() => {
      idx += 1;
      if (idx <= text.length) {
        setDisplayText(text.slice(0, idx));
      } else {
        setIsTyping(false);
        clearInterval(interval);
      }
    }, 22);

    return () => clearInterval(interval);
  }, [text, typing]);

  return (
    <motion.div
      className={cn("flex items-start gap-3", className)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 350, damping: 26 }}
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
        <Bot className="w-4 h-4 text-white" />
      </div>

      {/* Bubble */}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "rounded-2xl rounded-tl-md px-4 py-3",
            "bg-white dark:bg-zinc-900",
            "border-l-[3px] border-gradient-start",
            "border-l-blue-500",
            "shadow-sm",
          )}
        >
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {displayText}
            {isTyping && (
              <motion.span
                className="inline-block w-1.5 h-4 ml-0.5 bg-blue-500 rounded-full align-middle"
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
              />
            )}
          </p>
        </div>

        {/* Actions */}
        {actions && actions.length > 0 && !isTyping && (
          <motion.div
            className="flex flex-wrap gap-2 mt-2"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {actions.map((action, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="text-xs h-7 rounded-full border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// DrSageStatusIndicator
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  watching: {
    color: "bg-emerald-400",
    ringColor: "ring-emerald-400/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    icon: Eye,
  },
  "issue-detected": {
    color: "bg-amber-400",
    ringColor: "ring-amber-400/30",
    textColor: "text-amber-600 dark:text-amber-400",
    icon: AlertCircle,
  },
  suggestion: {
    color: "bg-blue-400",
    ringColor: "ring-blue-400/30",
    textColor: "text-blue-600 dark:text-blue-400",
    icon: Lightbulb,
  },
} as const;

export function DrSageStatusIndicator({
  status,
  message,
}: DrSageStatusIndicatorProps) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;

  return (
    <motion.div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-zinc-200 dark:border-zinc-800 shadow-sm"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      {/* Pulsing dot */}
      <span className="relative flex h-2.5 w-2.5">
        <motion.span
          className={cn(
            "absolute inset-0 rounded-full",
            cfg.color,
            "opacity-60",
          )}
          animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        />
        <span
          className={cn("relative inline-flex rounded-full h-2.5 w-2.5", cfg.color)}
        />
      </span>

      <Icon className={cn("w-3.5 h-3.5", cfg.textColor)} />
      <span className={cn("text-[11px] font-medium", cfg.textColor)}>
        {message}
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ContextualTip
// ---------------------------------------------------------------------------

export function ContextualTip({
  tip,
  onDismiss,
  onExpand,
  autoHide = 10000,
}: ContextualTipProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (autoHide <= 0) return;
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDismiss, 300); // allow exit animation
    }, autoHide);
    return () => clearTimeout(timer);
  }, [autoHide, onDismiss]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setTimeout(onDismiss, 300);
  }, [onDismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={cn(
            "max-w-xs rounded-xl p-4 shadow-lg border",
            "bg-blue-50/95 dark:bg-blue-950/90 backdrop-blur-md",
            "border-blue-200 dark:border-blue-800",
          )}
          initial={{ opacity: 0, x: 40, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                Dr. Sage suggests
              </span>
            </div>
            <button
              onClick={handleDismiss}
              className="p-0.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-blue-400" />
            </button>
          </div>

          {/* Tip text */}
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed mb-3">
            {tip}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              onClick={handleDismiss}
            >
              Got it
            </Button>
            {onExpand && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                onClick={onExpand}
              >
                Tell me more
                <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            )}
          </div>

          {/* Auto-hide progress bar */}
          {autoHide > 0 && (
            <motion.div
              className="absolute bottom-0 left-0 h-0.5 bg-blue-400/50 rounded-b-xl"
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: autoHide / 1000, ease: "linear" }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// QuickAction
// ---------------------------------------------------------------------------

export function QuickAction({ actions, visible }: QuickActionProps) {
  const [show, setShow] = useState(visible);

  useEffect(() => {
    setShow(visible);
    if (!visible) return;

    const timer = setTimeout(() => setShow(false), 15000);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="flex flex-col items-end gap-2"
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={{
            visible: { transition: { staggerChildren: 0.07 } },
            hidden: { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
          }}
        >
          {actions.map((action, i) => (
            <motion.button
              key={i}
              onClick={action.onClick}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full",
                "bg-white dark:bg-zinc-900",
                "border border-zinc-200 dark:border-zinc-700",
                "shadow-md hover:shadow-lg",
                "text-sm font-medium text-zinc-700 dark:text-zinc-300",
                "hover:border-blue-300 dark:hover:border-blue-700",
                "transition-all duration-200",
                "group",
              )}
              variants={{
                visible: { opacity: 1, y: 0, scale: 1 },
                hidden: { opacity: 0, y: 16, scale: 0.9 },
              }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <span className="text-blue-500 group-hover:text-violet-500 transition-colors">
                {action.icon}
              </span>
              {action.label}
              <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-blue-500 transition-colors group-hover:translate-x-0.5 transform duration-200" />
            </motion.button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default {
  DrSageGreeting,
  MessageBubble,
  DrSageStatusIndicator,
  ContextualTip,
  QuickAction,
  getGreetingMessage,
  DR_SAGE_TIPS,
  DR_SAGE_FUN_FACTS,
};
