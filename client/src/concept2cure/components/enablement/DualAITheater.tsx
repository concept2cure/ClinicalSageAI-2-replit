import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

const SPEED_MAP = { slow: 45, normal: 30, fast: 12 } as const;
const THINKING_DURATION = { slow: 2400, normal: 1600, fast: 800 } as const;
const INTER_MESSAGE_PAUSE = { slow: 1200, normal: 700, fast: 300 } as const;

const TYPE_LABELS: Record<TheaterMessage['type'], string> = {
  context: 'context',
  analysis: 'analysis',
  finding: 'finding',
  action: 'action',
  handoff: 'handoff',
  result: 'result',
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

/** Thinking state: cycling italic text with fade */
function ThinkingLine({ texts }: { texts: string[] }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (texts.length <= 1) return;
    const interval = setInterval(() => {
      setIdx((prev) => (prev + 1) % texts.length);
    }, 1400);
    return () => clearInterval(interval);
  }, [texts.length]);

  return (
    <div className="py-2 text-center">
      <AnimatePresence mode="wait">
        <motion.span
          key={idx}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="text-xs text-stone-400 italic"
        >
          {texts[idx]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

/** Single transcript message */
function TranscriptMessage({
  message,
  isActive,
  isCompleted,
  charDelay,
  onTypingDone,
  isLast,
}: {
  message: TheaterMessage;
  isActive: boolean;
  isCompleted: boolean;
  charDelay: number;
  onTypingDone: () => void;
  isLast: boolean;
}) {
  const { displayed, done } = useTypewriter(message.text, isActive, charDelay);
  const prevDone = useRef(false);

  useEffect(() => {
    if (done && !prevDone.current) {
      prevDone.current = true;
      onTypingDone();
    }
  }, [done, onTypingDone]);

  useEffect(() => {
    prevDone.current = false;
  }, [message.id]);

  const isSystem = message.actor === 'system';
  const isSage = message.actor === 'dr-sage';
  const isResult = message.type === 'result';
  const text = isCompleted ? message.text : displayed;

  // System messages render as centered italics
  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className={cn(
          'py-2 text-center',
          isResult && 'border-l-2 border-stone-900 pl-4 text-left',
        )}
      >
        <p className="text-xs text-stone-400 italic">{text}</p>
        {isActive && !done && (
          <motion.span
            className="inline-block text-stone-400"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            |
          </motion.span>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'py-4',
        !isLast && 'border-b border-stone-50',
        isResult && 'border-l-2 border-stone-900 pl-4',
      )}
    >
      {/* Header: actor name + type tag */}
      <div className="flex items-baseline justify-between mb-1.5">
        <span
          className={cn(
            'text-xs font-medium',
            isSage ? 'text-stone-900' : 'text-stone-600',
          )}
        >
          {isSage ? 'Dr. Sage' : 'AnA 1.0'}
        </span>
        <span className="text-xs text-stone-400">
          {TYPE_LABELS[message.type]}
        </span>
      </div>

      {/* Message body */}
      <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
        {text}
        {isActive && !done && (
          <motion.span
            className="inline-block text-stone-400 ml-px"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            |
          </motion.span>
        )}
      </p>
    </motion.div>
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
  const [messageIndex, setMessageIndex] = useState(-1);
  const [phase, setPhase] = useState<'idle' | 'thinking' | 'typing' | 'pause'>('idle');
  const [completedMessages, setCompletedMessages] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = scenario.messages;
  const charDelay = SPEED_MAP[currentSpeed];
  const thinkDuration = THINKING_DURATION[currentSpeed];
  const interPause = INTER_MESSAGE_PAUSE[currentSpeed];

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messageIndex, phase]);

  const advanceToMessage = useCallback(
    (idx: number) => {
      if (idx >= messages.length) {
        setPhase('idle');
        setFinished(true);
        onComplete?.();
        return;
      }

      const msg = messages[idx];
      setMessageIndex(idx);

      if (msg.thinkingTexts && msg.thinkingTexts.length > 0) {
        setPhase('thinking');
        timerRef.current = setTimeout(() => {
          setPhase('typing');
        }, thinkDuration);
      } else {
        setPhase('pause');
        timerRef.current = setTimeout(() => {
          setPhase('typing');
        }, msg.delay ?? 400);
      }
    },
    [messages, thinkDuration, onComplete],
  );

  const handleTypingDone = useCallback(() => {
    const msg = messages[messageIndex];
    if (!msg) return;

    setCompletedMessages((prev) => new Set(prev).add(msg.id));

    timerRef.current = setTimeout(() => {
      advanceToMessage(messageIndex + 1);
    }, interPause);
  }, [messageIndex, messages, interPause, advanceToMessage]);

  useEffect(() => {
    if (playing && messageIndex === -1 && !finished) {
      advanceToMessage(0);
    }
  }, [playing, messageIndex, finished, advanceToMessage]);

  useEffect(() => {
    if (!playing && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [playing]);

  const togglePlay = useCallback(() => {
    if (finished) return;
    if (!playing) {
      setPlaying(true);
      if (phase === 'pause' || phase === 'thinking') {
        const delay = phase === 'thinking' ? thinkDuration / 2 : 300;
        timerRef.current = setTimeout(() => setPhase('typing'), delay);
      }
    } else {
      setPlaying(false);
    }
  }, [playing, finished, phase, thinkDuration]);

  const replay = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessageIndex(-1);
    setPhase('idle');
    setCompletedMessages(new Set());
    setFinished(false);
    setPlaying(true);
  }, []);

  const cycleSpeed = useCallback(() => {
    setCurrentSpeed((prev) => {
      if (prev === 'slow') return 'normal';
      if (prev === 'normal') return 'fast';
      return 'slow';
    });
  }, []);

  const speedLabel = currentSpeed === 'slow' ? '0.5x' : currentSpeed === 'normal' ? '1x' : '2x';

  const visibleMessages = useMemo(
    () => (messageIndex >= 0 ? messages.slice(0, messageIndex + 1) : []),
    [messages, messageIndex],
  );

  const currentMsg = messageIndex >= 0 ? messages[messageIndex] : null;
  const progressPct = messages.length > 0 ? (completedMessages.size / messages.length) * 100 : 0;

  return (
    <div
      className={cn(
        'bg-white rounded-lg shadow-sm border border-stone-200 overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-stone-200">
        <h3 className="text-sm font-medium text-stone-900">{scenario.title}</h3>
        <p className="text-xs text-stone-400 mt-0.5">{scenario.description}</p>
      </div>

      {/* Transcript area */}
      <div
        ref={scrollRef}
        className="px-6 overflow-y-auto min-h-[280px] max-h-[480px]"
      >
        {/* Idle state */}
        <AnimatePresence>
          {messageIndex === -1 && !finished && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center py-16"
            >
              <p className="text-xs text-stone-400">
                {autoPlay ? 'Starting...' : 'Press play to begin'}
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
            const isLastVisible = i === visibleMessages.length - 1;

            return (
              <div key={msg.id}>
                {/* Thinking indicator */}
                <AnimatePresence>
                  {showThinking && <ThinkingLine texts={msg.thinkingTexts!} />}
                </AnimatePresence>

                {/* Message — show when typing or completed */}
                {(phase === 'typing' || isCompleted || !isCurrent) && (
                  <TranscriptMessage
                    message={msg}
                    isActive={isCurrent && phase === 'typing' && playing}
                    isCompleted={isCompleted}
                    charDelay={charDelay}
                    onTypingDone={handleTypingDone}
                    isLast={isLastVisible && !finished}
                  />
                )}
              </div>
            );
          })}
        </AnimatePresence>

        {/* Completion */}
        <AnimatePresence>
          {finished && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: 0.2 }}
              className="py-4 text-center"
            >
              <span className="text-xs text-stone-400 italic">
                Collaboration complete
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div className="mx-6 mt-2">
        <div className="h-px bg-stone-100 w-full relative">
          <motion.div
            className="absolute inset-y-0 left-0 bg-stone-900"
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3 text-xs">
          {finished ? (
            <button
              onClick={replay}
              className="text-stone-900 font-medium hover:text-blue-600 transition-colors duration-150"
            >
              Replay
            </button>
          ) : (
            <button
              onClick={togglePlay}
              className="text-stone-900 font-medium hover:text-blue-600 transition-colors duration-150"
            >
              {playing ? 'Pause' : 'Play'}
            </button>
          )}
          <span className="text-stone-200">·</span>
          <button
            onClick={cycleSpeed}
            className={cn(
              'transition-colors hover:text-blue-600',
              currentSpeed === 'normal' ? 'text-stone-900 font-medium' : 'text-stone-400',
            )}
          >
            {speedLabel}
          </button>
        </div>
        <span className="text-xs text-stone-400">
          {Math.max(0, messageIndex + 1)} of {messages.length}
        </span>
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
