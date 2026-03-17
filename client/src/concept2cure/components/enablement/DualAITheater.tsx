import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import {
  Brain,
  Bot,
  Sparkles,
  ArrowRight,
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  Zap,
  CheckCircle2,
  AlertCircle,
  Eye,
  MessageSquare,
  Clock,
  FastForward,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TheaterMessage {
  id: string;
  actor: 'dr-sage' | 'ana' | 'system';
  type: 'context' | 'analysis' | 'finding' | 'action' | 'handoff' | 'result';
  text: string;
  thinkingTexts?: string[];
  delay?: number;
}

export interface TheaterScenario {
  title: string;
  description: string;
  messages: TheaterMessage[];
}

export interface DualAITheaterProps {
  scenario: TheaterScenario;
  autoPlay?: boolean;
  speed?: 'slow' | 'normal' | 'fast';
  onComplete?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPEED_MAP = { slow: 45, normal: 25, fast: 10 } as const;
const THINKING_DURATION = { slow: 2400, normal: 1600, fast: 800 } as const;
const THINKING_FLASH_INTERVAL = { slow: 900, normal: 600, fast: 350 } as const;
const INTER_MESSAGE_PAUSE = { slow: 1200, normal: 700, fast: 300 } as const;

const TYPE_CONFIG: Record<
  TheaterMessage['type'],
  { label: string; color: string; icon: React.ElementType }
> = {
  context: { label: 'Context', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: Eye },
  analysis: { label: 'Analysis', color: 'bg-violet-500/20 text-violet-300 border-violet-500/30', icon: Brain },
  finding: { label: 'Finding', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: AlertCircle },
  action: { label: 'Action', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: Zap },
  handoff: { label: 'Handoff', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', icon: ArrowRight },
  result: { label: 'Result', color: 'bg-yellow-500/20 text-yellow-200 border-yellow-500/30', icon: CheckCircle2 },
};

// ---------------------------------------------------------------------------
// useTypewriter hook
// ---------------------------------------------------------------------------

function useTypewriter(text: string, active: boolean, charDelay: number) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const rafRef = useRef<number | null>(null);
  const idxRef = useRef(0);
  const lastRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    idxRef.current = 0;
    lastRef.current = 0;
    setDisplayed('');
    setDone(false);

    const step = (ts: number) => {
      if (!lastRef.current) lastRef.current = ts;
      const elapsed = ts - lastRef.current;
      if (elapsed >= charDelay) {
        const chars = Math.min(Math.floor(elapsed / charDelay), text.length - idxRef.current);
        idxRef.current += chars;
        lastRef.current = ts;
        setDisplayed(text.slice(0, idxRef.current));
      }
      if (idxRef.current < text.length) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDone(true);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [text, active, charDelay]);

  return { displayed, done };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Breathing / pulse ring around avatar */
function PulseRing({ color, active }: { color: string; active: boolean }) {
  return (
    <motion.div
      className={cn(
        'absolute inset-0 rounded-full',
        color,
      )}
      animate={
        active
          ? { scale: [1, 1.18, 1], opacity: [0.5, 0.9, 0.5] }
          : { scale: [1, 1.06, 1], opacity: [0.25, 0.4, 0.25] }
      }
      transition={{
        duration: active ? 1.4 : 3,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}

/** Neural network dots for AnA thinking state */
function NeuralDots() {
  const dots = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        x: 18 + Math.cos((i / 12) * Math.PI * 2) * 14,
        y: 18 + Math.sin((i / 12) * Math.PI * 2) * 14,
      })),
    [],
  );
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 36 36">
      {dots.map((d, i) => (
        <motion.circle
          key={d.id}
          cx={d.x}
          cy={d.y}
          r={1}
          fill="rgb(167,139,250)"
          animate={{ opacity: [0.2, 1, 0.2], r: [0.6, 1.2, 0.6] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.1 }}
        />
      ))}
      {dots.map((d, i) => {
        const next = dots[(i + 1) % dots.length];
        return (
          <motion.line
            key={`l-${d.id}`}
            x1={d.x}
            y1={d.y}
            x2={next.x}
            y2={next.y}
            stroke="rgb(167,139,250)"
            strokeWidth={0.3}
            animate={{ opacity: [0.1, 0.5, 0.1] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12 }}
          />
        );
      })}
    </svg>
  );
}

/** Avatar column (left or right) */
function AvatarColumn({
  side,
  active,
  thinking,
  statusText,
}: {
  side: 'dr-sage' | 'ana';
  active: boolean;
  thinking: boolean;
  statusText: string;
}) {
  const isSage = side === 'dr-sage';
  const Icon = isSage ? Bot : Brain;
  const gradient = isSage
    ? 'from-blue-500 to-cyan-400'
    : 'from-violet-500 to-fuchsia-400';
  const ringColor = isSage ? 'ring-blue-400/60' : 'ring-violet-400/60';
  const pulseColor = isSage
    ? 'bg-gradient-to-br from-blue-500/30 to-cyan-400/30'
    : 'bg-gradient-to-br from-violet-500/30 to-fuchsia-400/30';

  return (
    <div className="flex flex-col items-center gap-3 min-w-[120px]">
      {/* Avatar */}
      <div className="relative w-20 h-20">
        <PulseRing color={pulseColor} active={active} />
        <motion.div
          className={cn(
            'relative z-10 w-20 h-20 rounded-full flex items-center justify-center',
            `bg-gradient-to-br ${gradient}`,
            active && `ring-2 ${ringColor} shadow-lg`,
            active && (isSage ? 'shadow-blue-500/40' : 'shadow-violet-500/40'),
          )}
          animate={active ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={{ duration: 1.6, repeat: active ? Infinity : 0, ease: 'easeInOut' }}
        >
          <Icon className="w-9 h-9 text-white" />
          {thinking && !isSage && <NeuralDots />}
        </motion.div>
        {/* Glow */}
        <AnimatePresence>
          {active && (
            <motion.div
              className={cn(
                'absolute inset-0 rounded-full blur-xl -z-10',
                isSage ? 'bg-blue-500/30' : 'bg-violet-500/30',
              )}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1.3 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.5 }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Name */}
      <span
        className={cn(
          'text-sm font-semibold tracking-wide',
          isSage ? 'text-blue-300' : 'text-violet-300',
        )}
      >
        {isSage ? 'Dr. Sage' : 'AnA 1.0'}
      </span>

      {/* Status */}
      <AnimatePresence mode="wait">
        {statusText && (
          <motion.span
            key={statusText}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-[11px] text-slate-400 text-center max-w-[130px] leading-tight h-8"
          >
            {statusText}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Connection line between avatars */
function ConnectionLine({ active, direction }: { active: boolean; direction: 'left' | 'right' | null }) {
  return (
    <div className="relative h-1 flex-1 mx-4 my-auto rounded-full bg-slate-800 overflow-hidden hidden md:block">
      <AnimatePresence>
        {active && (
          <motion.div
            className={cn(
              'absolute inset-y-0 w-full rounded-full',
              direction === 'left'
                ? 'bg-gradient-to-r from-violet-500 to-blue-500'
                : 'bg-gradient-to-r from-blue-500 to-violet-500',
            )}
            initial={{ scaleX: 0, originX: direction === 'right' ? 0 : 1 }}
            animate={{ scaleX: [0, 1, 0], originX: direction === 'right' ? 0 : 1 }}
            transition={{ duration: 1.2, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>
      {/* Particles */}
      <AnimatePresence>
        {active &&
          Array.from({ length: 4 }).map((_, i) => (
            <motion.div
              key={`p-${i}`}
              className={cn(
                'absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full',
                direction === 'right' ? 'bg-blue-400' : 'bg-violet-400',
              )}
              initial={{ left: direction === 'right' ? '0%' : '100%', opacity: 0 }}
              animate={{
                left: direction === 'right' ? '100%' : '0%',
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 0.9,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
      </AnimatePresence>
    </div>
  );
}

/** Thinking indicator with reasoning chain */
function ThinkingIndicator({
  texts,
  actor,
}: {
  texts: string[];
  actor: 'dr-sage' | 'ana';
}) {
  const [idx, setIdx] = useState(0);
  const isSage = actor === 'dr-sage';

  useEffect(() => {
    if (texts.length <= 1) return;
    const interval = setInterval(() => {
      setIdx((prev) => (prev + 1) % texts.length);
    }, 600);
    return () => clearInterval(interval);
  }, [texts.length]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        'flex items-center gap-2 px-4 py-2.5 rounded-xl border backdrop-blur-sm max-w-md',
        isSage
          ? 'bg-blue-950/40 border-blue-500/20'
          : 'bg-violet-950/40 border-violet-500/20',
        isSage ? 'self-start' : 'self-end',
      )}
    >
      {/* Bouncing dots */}
      <div className="flex gap-1 mr-2">
        {[0, 1, 2].map((d) => (
          <motion.span
            key={d}
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              isSage ? 'bg-blue-400' : 'bg-violet-400',
            )}
            animate={{ y: [0, -5, 0] }}
            transition={{
              duration: 0.6,
              repeat: Infinity,
              delay: d * 0.15,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
      {/* Flashing reasoning text */}
      <AnimatePresence mode="wait">
        <motion.span
          key={idx}
          initial={{ opacity: 0, filter: 'blur(4px)' }}
          animate={{ opacity: [0, 0.85, 0.85, 0], filter: ['blur(4px)', 'blur(0px)', 'blur(0px)', 'blur(4px)'] }}
          transition={{ duration: 1.6, times: [0, 0.15, 0.75, 1] }}
          className={cn(
            'text-xs italic',
            isSage ? 'text-blue-300/80' : 'text-violet-300/80',
          )}
        >
          {texts[idx]}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}

/** Single message bubble with typewriter effect */
function MessageBubble({
  message,
  isActive,
  isCompleted,
  charDelay,
  onTypingDone,
}: {
  message: TheaterMessage;
  isActive: boolean;
  isCompleted: boolean;
  charDelay: number;
  onTypingDone: () => void;
}) {
  const { displayed, done } = useTypewriter(
    message.text,
    isActive,
    charDelay,
  );
  const prevDone = useRef(false);

  useEffect(() => {
    if (done && !prevDone.current) {
      prevDone.current = true;
      onTypingDone();
    }
  }, [done, onTypingDone]);

  // Reset ref when message changes
  useEffect(() => {
    prevDone.current = false;
  }, [message.id]);

  const isSystem = message.actor === 'system';
  const isSage = message.actor === 'dr-sage';
  const isResult = message.type === 'result';
  const cfg = TYPE_CONFIG[message.type];
  const TypeIcon = cfg.icon;

  const text = isCompleted ? message.text : displayed;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: isSystem ? 0 : isSage ? -30 : 30, y: 12 }}
      animate={{
        opacity: isCompleted && !isActive ? 0.65 : 1,
        x: 0,
        y: 0,
        scale: isCompleted && !isActive ? 0.97 : 1,
      }}
      transition={{ type: 'spring', damping: 22, stiffness: 260 }}
      className={cn(
        'relative w-full max-w-lg px-4 py-3 rounded-2xl border',
        isSystem && 'mx-auto bg-slate-900/60 border-slate-700/50 max-w-sm text-center',
        isSage && !isSystem && 'self-start bg-blue-950/30 border-blue-500/20',
        !isSage && !isSystem && 'self-end bg-violet-950/30 border-violet-500/20',
        isResult && 'ring-1 ring-yellow-500/30 shadow-lg shadow-yellow-500/10',
      )}
    >
      {/* Result glow */}
      {isResult && (
        <motion.div
          className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-yellow-500/10 via-amber-400/15 to-yellow-500/10 -z-10 blur-sm"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {/* Header row */}
      <div className="flex items-center gap-2 mb-1.5">
        {!isSystem && (
          <span
            className={cn(
              'text-xs font-semibold',
              isSage ? 'text-blue-300' : 'text-violet-300',
            )}
          >
            {isSage ? 'Dr. Sage' : 'AnA 1.0'}
          </span>
        )}
        {isSystem && (
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> System
          </span>
        )}
        <Badge
          variant="outline"
          className={cn('text-[10px] px-1.5 py-0 h-4 border', cfg.color)}
        >
          <TypeIcon className="w-2.5 h-2.5 mr-0.5" />
          {cfg.label}
        </Badge>
        <span className="ml-auto text-[10px] text-slate-500 flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" />
          now
        </span>
      </div>

      {/* Body */}
      <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
        {text}
        {isActive && !done && (
          <motion.span
            className={cn(
              'inline-block w-[2px] h-4 ml-0.5 align-text-bottom rounded-full',
              isSage ? 'bg-blue-400' : isSystem ? 'bg-slate-400' : 'bg-violet-400',
            )}
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.7, repeat: Infinity }}
          />
        )}
      </p>
    </motion.div>
  );
}

/** Progress bar at the bottom */
function ProgressBar({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="relative w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 via-violet-500 to-fuchsia-500"
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
      {/* Step dots */}
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full border border-slate-700 transition-colors duration-300',
            i < current ? 'bg-violet-400 border-violet-400' : 'bg-slate-800',
          )}
          style={{ left: `${((i + 1) / total) * 100}%`, transform: 'translate(-50%, -50%)' }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DualAITheater({
  scenario,
  autoPlay = true,
  speed = 'normal',
  onComplete,
  className,
}: DualAITheaterProps) {
  const [playing, setPlaying] = useState(autoPlay);
  const [currentSpeed, setCurrentSpeed] = useState(speed);
  const [messageIndex, setMessageIndex] = useState(-1); // -1 = not started
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'typing' | 'pause'>('idle');
  const [completedMessages, setCompletedMessages] = useState<Set<string>>(new Set());
  const [activeActor, setActiveActor] = useState<'dr-sage' | 'ana' | 'system' | null>(null);
  const [connectionPulse, setConnectionPulse] = useState(false);
  const [connectionDir, setConnectionDir] = useState<'left' | 'right' | null>(null);
  const [finished, setFinished] = useState(false);
  const [sageStatus, setSageStatus] = useState('');
  const [anaStatus, setAnaStatus] = useState('');

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = scenario.messages;
  const charDelay = SPEED_MAP[currentSpeed];
  const thinkDuration = THINKING_DURATION[currentSpeed];
  const interPause = INTER_MESSAGE_PAUSE[currentSpeed];

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Auto-scroll timeline
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messageIndex, phase]);

  // Advance to next message
  const advanceToMessage = useCallback(
    (idx: number) => {
      if (idx >= messages.length) {
        setPhase('idle');
        setActiveActor(null);
        setFinished(true);
        setSageStatus('');
        setAnaStatus('');
        onComplete?.();
        return;
      }

      const msg = messages[idx];
      setMessageIndex(idx);
      setActiveActor(msg.actor);

      // Update status text
      if (msg.actor === 'dr-sage') {
        setSageStatus(
          msg.thinkingTexts?.length
            ? 'Analyzing context...'
            : 'Coordinating with AnA 1.0...',
        );
        setAnaStatus('Standby');
      } else if (msg.actor === 'ana') {
        setAnaStatus(
          msg.thinkingTexts?.length ? 'Processing evidence...' : 'Reasoning...',
        );
        setSageStatus('Listening...');
      } else {
        setSageStatus('');
        setAnaStatus('');
      }

      // Connection pulse when switching actors
      if (idx > 0 && messages[idx - 1].actor !== msg.actor && msg.actor !== 'system') {
        setConnectionPulse(true);
        setConnectionDir(msg.actor === 'dr-sage' ? 'left' : 'right');
        setTimeout(() => setConnectionPulse(false), 1300);
      }

      // Thinking phase?
      if (msg.thinkingTexts && msg.thinkingTexts.length > 0) {
        setPhase('thinking');
        timerRef.current = setTimeout(() => {
          setPhase('typing');
        }, thinkDuration);
      } else {
        // Small pre-delay
        setPhase('pause');
        timerRef.current = setTimeout(() => {
          setPhase('typing');
        }, msg.delay ?? 400);
      }
    },
    [messages, thinkDuration, onComplete],
  );

  // When typing finishes for current message
  const handleTypingDone = useCallback(() => {
    const msg = messages[messageIndex];
    if (!msg) return;

    setCompletedMessages((prev) => new Set(prev).add(msg.id));

    // Pause then advance
    timerRef.current = setTimeout(() => {
      advanceToMessage(messageIndex + 1);
    }, interPause);
  }, [messageIndex, messages, interPause, advanceToMessage]);

  // Start / resume playback
  useEffect(() => {
    if (playing && messageIndex === -1 && !finished) {
      advanceToMessage(0);
    }
  }, [playing, messageIndex, finished, advanceToMessage]);

  // Pause stops timers
  useEffect(() => {
    if (!playing && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [playing]);

  // Play/pause toggle
  const togglePlay = useCallback(() => {
    if (finished) return;
    if (!playing) {
      setPlaying(true);
      // If we were in a pause/thinking phase, re-kick
      if (phase === 'pause' || phase === 'thinking') {
        const delay = phase === 'thinking' ? thinkDuration / 2 : 300;
        timerRef.current = setTimeout(() => setPhase('typing'), delay);
      }
    } else {
      setPlaying(false);
    }
  }, [playing, finished, phase, thinkDuration]);

  // Replay
  const replay = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessageIndex(-1);
    setPhase('idle');
    setCompletedMessages(new Set());
    setActiveActor(null);
    setConnectionPulse(false);
    setFinished(false);
    setSageStatus('');
    setAnaStatus('');
    setPlaying(true);
    // Will trigger the useEffect above to start
  }, []);

  // Cycle speed
  const cycleSpeed = useCallback(() => {
    setCurrentSpeed((prev) => {
      if (prev === 'slow') return 'normal';
      if (prev === 'normal') return 'fast';
      return 'slow';
    });
  }, []);

  const speedLabel = currentSpeed === 'slow' ? '0.5x' : currentSpeed === 'normal' ? '1x' : '2x';

  // Visible messages: all up to and including current
  const visibleMessages = useMemo(
    () => (messageIndex >= 0 ? messages.slice(0, messageIndex + 1) : []),
    [messages, messageIndex],
  );

  const currentMsg = messageIndex >= 0 ? messages[messageIndex] : null;

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border border-slate-700/60 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 overflow-hidden shadow-2xl',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-800/80 bg-slate-900/50">
        <div className="flex items-center gap-2 text-slate-300">
          <MessageSquare className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold">{scenario.title}</span>
        </div>
        <span className="text-xs text-slate-500 ml-2 hidden sm:inline">{scenario.description}</span>
        <div className="ml-auto flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            {playing && !finished && (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </>
            )}
            {finished && <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />}
            {!playing && !finished && <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500" />}
          </span>
          <span className="text-[10px] text-slate-500 ml-1">
            {finished ? 'Complete' : playing ? 'Live' : 'Paused'}
          </span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-col md:flex-row items-stretch flex-1 min-h-0">
        {/* Left avatar */}
        <div className="flex items-start justify-center pt-6 pb-4 px-4 md:w-[170px] shrink-0">
          <AvatarColumn
            side="dr-sage"
            active={activeActor === 'dr-sage'}
            thinking={activeActor === 'dr-sage' && phase === 'thinking'}
            statusText={sageStatus}
          />
        </div>

        {/* Center timeline */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          {/* Connection line above timeline (desktop) */}
          <div className="hidden md:flex items-center px-2 h-8 -mt-1">
            <ConnectionLine active={connectionPulse} direction={connectionDir} />
          </div>

          {/* Scrollable messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 pb-3 space-y-3 min-h-[280px] max-h-[480px] scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
          >
            {/* Intro card */}
            <AnimatePresence>
              {messageIndex === -1 && !finished && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-full gap-3 py-12"
                >
                  <Sparkles className="w-8 h-8 text-violet-400/60" />
                  <p className="text-sm text-slate-500 text-center">
                    {autoPlay ? 'Starting collaboration...' : 'Press play to begin'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Messages */}
            <AnimatePresence>
              {visibleMessages.map((msg, i) => {
                const isCurrent = i === messageIndex;
                const isCompleted = completedMessages.has(msg.id);
                const showThinking =
                  isCurrent &&
                  phase === 'thinking' &&
                  msg.thinkingTexts &&
                  msg.thinkingTexts.length > 0;

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex flex-col gap-2',
                      msg.actor === 'system' && 'items-center',
                      msg.actor === 'dr-sage' && 'items-start',
                      msg.actor === 'ana' && 'items-end',
                    )}
                  >
                    {/* Thinking indicator */}
                    <AnimatePresence>
                      {showThinking && (
                        <ThinkingIndicator
                          texts={msg.thinkingTexts!}
                          actor={msg.actor as 'dr-sage' | 'ana'}
                        />
                      )}
                    </AnimatePresence>

                    {/* Message bubble — show only when typing or completed */}
                    {(phase === 'typing' || isCompleted || !isCurrent) && (
                      <MessageBubble
                        message={msg}
                        isActive={isCurrent && phase === 'typing' && playing}
                        isCompleted={isCompleted}
                        charDelay={charDelay}
                        onTypingDone={handleTypingDone}
                      />
                    )}
                  </div>
                );
              })}
            </AnimatePresence>

            {/* Completion card */}
            <AnimatePresence>
              {finished && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, type: 'spring' }}
                  className="flex items-center justify-center gap-2 py-4"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-emerald-300 font-medium">
                    Collaboration complete
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right avatar */}
        <div className="flex items-start justify-center pt-6 pb-4 px-4 md:w-[170px] shrink-0">
          <AvatarColumn
            side="ana"
            active={activeActor === 'ana'}
            thinking={activeActor === 'ana' && phase === 'thinking'}
            statusText={anaStatus}
          />
        </div>
      </div>

      {/* Control bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-800/80 bg-slate-900/50">
        {/* Play / Pause / Replay */}
        {finished ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={replay}
            className="h-8 px-3 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Replay
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={togglePlay}
            className="h-8 px-3 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
          >
            {playing ? (
              <>
                <Pause className="w-3.5 h-3.5 mr-1" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 mr-1" />
                Play
              </>
            )}
          </Button>
        )}

        {/* Speed */}
        <Button
          variant="ghost"
          size="sm"
          onClick={cycleSpeed}
          className="h-8 px-3 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
        >
          <FastForward className="w-3.5 h-3.5 mr-1" />
          {speedLabel}
        </Button>

        {/* Scenario title (mobile hidden) */}
        <span className="hidden sm:inline text-[11px] text-slate-500 ml-2 truncate">
          {scenario.title}
        </span>

        {/* Step counter */}
        <span className="ml-auto text-[11px] text-slate-500">
          {Math.max(0, messageIndex + 1)} / {messages.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-4 pb-3 -mt-1">
        <ProgressBar
          current={completedMessages.size}
          total={messages.length}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preset Scenarios
// ---------------------------------------------------------------------------

export const THEATER_SCENARIOS: Record<string, TheaterScenario> = {
  evidenceReview: {
    title: 'Evidence Review Collaboration',
    description: 'Dr. Sage and AnA 1.0 collaborate on a 510(k) evidence review',
    messages: [
      {
        id: 'er-1',
        actor: 'dr-sage',
        type: 'context',
        text: "I've identified the current project context \u2014 a 510(k) submission for a Class II cardiovascular monitoring device.",
        delay: 600,
      },
      {
        id: 'er-2',
        actor: 'ana',
        type: 'analysis',
        text: "I've analyzed 47 evidence documents. Three critical gaps detected: biocompatibility testing lacks ISO 10993-1 coverage, electromagnetic compatibility testing references outdated IEC 60601-1-2, and clinical performance data shows insufficient sample size for the primary endpoint.",
        thinkingTexts: [
          'Scanning evidence repository...',
          'Cross-referencing predicate device database...',
          'Evaluating substantial equivalence criteria...',
        ],
      },
      {
        id: 'er-3',
        actor: 'dr-sage',
        type: 'action',
        text: "Converting findings to actionable next steps. I've created three governed tasks in your workflow: (1) Commission updated biocomp testing, (2) Re-run EMC against current standard, (3) Expand clinical dataset with post-market data.",
      },
      {
        id: 'er-4',
        actor: 'ana',
        type: 'finding',
        text: "I've also flagged two precedent 510(k) clearances \u2014 K201234 and K195678 \u2014 where FDA accepted bridging studies for similar gaps. This could accelerate your remediation timeline.",
      },
      {
        id: 'er-5',
        actor: 'dr-sage',
        type: 'action',
        text: "Excellent precedent intelligence. I've attached those references to each task and updated the submission readiness score from 62% to projected 78% upon completion.",
      },
      {
        id: 'er-6',
        actor: 'system',
        type: 'result',
        text: 'Collaboration complete. 3 actions created, 2 precedent references attached, readiness projection updated.',
      },
    ],
  },

  complianceGap: {
    title: 'Compliance Gap Resolution',
    description: 'Identifying and resolving compliance gaps in an IND submission',
    messages: [
      {
        id: 'cg-1',
        actor: 'dr-sage',
        type: 'context',
        text: 'Starting compliance scan on the current IND submission package.',
        delay: 500,
      },
      {
        id: 'cg-2',
        actor: 'dr-sage',
        type: 'finding',
        text: 'Structure analysis complete. eCTD Module 2.5 Clinical Overview is present but Module 2.7 Clinical Summary is missing. Module 3.2.P.5.1 has an outdated specification.',
      },
      {
        id: 'cg-3',
        actor: 'ana',
        type: 'analysis',
        text: 'This is a critical gap. Module 2.7 is mandatory per ICH M4(E). I found 3 similar INDs that received Refuse to File letters for this exact omission. Additionally, the Module 3.2.P.5.1 specification version predates the December 2024 ICH Q2(R2) update.',
        thinkingTexts: [
          'Analyzing ICH M4 requirements...',
          'Checking FDA IND guidance...',
          'Comparing with recent successful submissions...',
        ],
      },
      {
        id: 'cg-4',
        actor: 'dr-sage',
        type: 'action',
        text: "I can generate a Module 2.7 Clinical Summary template pre-populated with data from your existing clinical documents. For Module 3.2.P.5.1, I'll flag the specific specification fields that need updating against Q2(R2).",
      },
      {
        id: 'cg-5',
        actor: 'ana',
        type: 'finding',
        text: 'I recommend prioritizing Module 2.7 \u2014 based on FDA review timelines, this could add 4-6 months delay if caught during filing review. The specification update is lower risk but should be completed before the 30-day safety review window.',
      },
      {
        id: 'cg-6',
        actor: 'dr-sage',
        type: 'action',
        text: "Actions created: (1) Generate M2.7 template \u2014 estimated 2 hours with AI assistance, (2) Update P.5.1 specifications \u2014 flagged 7 fields for manual review. Compliance score improved from 'At Risk' to 'Needs Attention'.",
      },
      {
        id: 'cg-7',
        actor: 'system',
        type: 'result',
        text: '2 critical gaps identified. 2 remediation workflows initiated. Estimated resolution: 3 business days.',
      },
    ],
  },

  auditPreparation: {
    title: 'Audit Preparation',
    description: 'Preparing a submission dossier for regulatory audit',
    messages: [
      {
        id: 'ap-1',
        actor: 'dr-sage',
        type: 'context',
        text: 'Initiating audit readiness assessment for your submission dossier.',
        delay: 500,
      },
      {
        id: 'ap-2',
        actor: 'dr-sage',
        type: 'context',
        text: "I've catalogued 156 documents across all eCTD modules. Running traceability and provenance checks now.",
      },
      {
        id: 'ap-3',
        actor: 'ana',
        type: 'analysis',
        text: 'Provenance analysis complete. 148 documents have full audit trails. 8 documents have gaps: 3 are missing version history, 2 have broken cross-references, and 3 lack author attestation metadata.',
        thinkingTexts: [
          'Verifying document lineage...',
          'Checking version consistency...',
          'Validating cross-references...',
        ],
      },
      {
        id: 'ap-4',
        actor: 'dr-sage',
        type: 'action',
        text: "I can fix 5 of these automatically \u2014 the version history gaps can be reconstructed from system logs, and the cross-references can be re-linked. The 3 missing attestations require manual author confirmation.",
      },
      {
        id: 'ap-5',
        actor: 'ana',
        type: 'finding',
        text: "I've also performed a mock reviewer analysis. Based on 200+ FDA reviewer comment patterns, the most likely audit questions will focus on your predicate comparison methodology and biocompatibility test report formatting. I've prepared response templates for both.",
      },
      {
        id: 'ap-6',
        actor: 'dr-sage',
        type: 'action',
        text: "Brilliant. Applying 5 automated fixes now. Routing 3 attestation requests to the respective authors. Attaching AnA 1.0's response templates to the audit preparation folder. Your audit readiness score is now 94%.",
      },
      {
        id: 'ap-7',
        actor: 'system',
        type: 'result',
        text: 'Audit prep complete. 5 auto-fixes applied, 3 manual tasks routed, 2 response templates prepared. Readiness: 94%.',
      },
    ],
  },
};

export default DualAITheater;
